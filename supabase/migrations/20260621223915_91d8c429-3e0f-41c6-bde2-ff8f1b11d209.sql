-- ============================================================
-- Phase 3C-1: recipe-affecting modifiers
-- ============================================================

-- A) pos_modifier_recipe_effects ------------------------------
CREATE TABLE public.pos_modifier_recipe_effects (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id          uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  modifier_id        uuid NOT NULL REFERENCES public.pos_modifiers(id) ON DELETE CASCADE,
  sellable_item_id   uuid     NULL REFERENCES public.pos_menu_items(id) ON DELETE CASCADE,
  ingredient_item_id uuid NOT NULL REFERENCES public.pos_menu_items(id) ON DELETE RESTRICT,
  effect_type        text NOT NULL CHECK (effect_type IN
                       ('add_quantity','multiply_quantity','override_quantity','remove_ingredient')),
  quantity           numeric,
  multiplier         numeric,
  unit               text,
  waste_percent      numeric NOT NULL DEFAULT 0,
  sort_order         int     NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (effect_type = 'multiply_quantity'  AND multiplier IS NOT NULL AND multiplier > 0)
 OR (effect_type IN ('add_quantity','override_quantity') AND quantity IS NOT NULL AND quantity >= 0)
 OR (effect_type = 'remove_ingredient')
  )
);

-- Unique scope per (modifier, sellable scope, ingredient, effect_type).
-- Use sentinel UUID instead of COALESCE-in-index (immutability rules).
CREATE UNIQUE INDEX pos_mre_unique_scope
  ON public.pos_modifier_recipe_effects (
    modifier_id,
    COALESCE(sellable_item_id, '00000000-0000-0000-0000-000000000000'::uuid),
    ingredient_item_id,
    effect_type
  );

CREATE INDEX pos_mre_modifier_idx ON public.pos_modifier_recipe_effects(modifier_id);
CREATE INDEX pos_mre_sellable_idx ON public.pos_modifier_recipe_effects(sellable_item_id)
  WHERE sellable_item_id IS NOT NULL;
CREATE INDEX pos_mre_casino_idx   ON public.pos_modifier_recipe_effects(casino_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_modifier_recipe_effects TO authenticated;
GRANT ALL ON public.pos_modifier_recipe_effects TO service_role;

ALTER TABLE public.pos_modifier_recipe_effects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_mre read all authenticated"
  ON public.pos_modifier_recipe_effects FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "pos_mre manager write"
  ON public.pos_modifier_recipe_effects FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin'::app_role)
 OR public.has_role(auth.uid(),'manager'::app_role)
 OR public.has_role(auth.uid(),'pos_manager'::app_role)
 OR public.has_role(auth.uid(),'surveillance'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'super_admin'::app_role)
 OR public.has_role(auth.uid(),'manager'::app_role)
 OR public.has_role(auth.uid(),'pos_manager'::app_role)
 OR public.has_role(auth.uid(),'surveillance'::app_role)
  );

CREATE TRIGGER trg_pos_mre_updated
  BEFORE UPDATE ON public.pos_modifier_recipe_effects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- B) pos_modifier_menu_items (allow-list) ---------------------
CREATE TABLE public.pos_modifier_menu_items (
  modifier_id  uuid NOT NULL REFERENCES public.pos_modifiers(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.pos_menu_items(id) ON DELETE CASCADE,
  casino_id    uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (modifier_id, menu_item_id)
);

CREATE INDEX pos_mmi_modifier_idx ON public.pos_modifier_menu_items(modifier_id);
CREATE INDEX pos_mmi_item_idx     ON public.pos_modifier_menu_items(menu_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_modifier_menu_items TO authenticated;
GRANT ALL ON public.pos_modifier_menu_items TO service_role;

ALTER TABLE public.pos_modifier_menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_mmi read all authenticated"
  ON public.pos_modifier_menu_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "pos_mmi manager write"
  ON public.pos_modifier_menu_items FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin'::app_role)
 OR public.has_role(auth.uid(),'manager'::app_role)
 OR public.has_role(auth.uid(),'pos_manager'::app_role)
 OR public.has_role(auth.uid(),'surveillance'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'super_admin'::app_role)
 OR public.has_role(auth.uid(),'manager'::app_role)
 OR public.has_role(auth.uid(),'pos_manager'::app_role)
 OR public.has_role(auth.uid(),'surveillance'::app_role)
  );


-- C) Snapshot column on order-item modifiers ------------------
ALTER TABLE public.pos_order_item_modifiers
  ADD COLUMN IF NOT EXISTS recipe_effects_snapshot jsonb;


-- D) Allow-list enforcement trigger ---------------------------
CREATE OR REPLACE FUNCTION public.pos_oim_allowlist_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
  v_item  uuid;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.pos_modifier_menu_items
   WHERE modifier_id = NEW.modifier_id;

  IF v_count = 0 THEN
    RETURN NEW;  -- unrestricted modifier
  END IF;

  SELECT oi.item_id INTO v_item
    FROM public.pos_order_items oi WHERE oi.id = NEW.order_item_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.pos_modifier_menu_items a
     WHERE a.modifier_id = NEW.modifier_id
       AND a.menu_item_id = v_item
  ) THEN
    RAISE EXCEPTION 'MODIFIER_NOT_ALLOWED_FOR_ITEM'
      USING HINT = 'This modifier is restricted to a specific menu item set.';
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_pos_oim_allowlist ON public.pos_order_item_modifiers;
CREATE TRIGGER trg_pos_oim_allowlist
  BEFORE INSERT ON public.pos_order_item_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.pos_oim_allowlist_check();


-- E) Recompute: also write filtered/resolved snapshot ---------
CREATE OR REPLACE FUNCTION public.pos_order_item_modifiers_recompute()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_oi      uuid;
  v_unit    bigint;
  v_qty     numeric;
  v_sum     bigint;
  v_sellable uuid;
  v_snap    jsonb;
  v_target_id uuid;
  v_target_mid uuid;
  v_target_name text;
BEGIN
  v_oi := COALESCE(NEW.order_item_id, OLD.order_item_id);
  SELECT unit_price_tzs, qty, item_id
    INTO v_unit, v_qty, v_sellable
    FROM public.pos_order_items WHERE id = v_oi;
  IF v_unit IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Refresh recipe_effects_snapshot for the affected row (insert/update),
  -- or for any sibling rows that share the same order_item (cheap; small N).
  IF TG_OP IN ('INSERT','UPDATE') THEN
    v_target_id   := NEW.id;
    v_target_mid  := NEW.modifier_id;
    v_target_name := NEW.modifier_name_snapshot;

    IF v_target_mid IS NOT NULL THEN
      WITH candidates AS (
        SELECT e.*, (e.sellable_item_id IS NOT NULL) AS is_specific
          FROM public.pos_modifier_recipe_effects e
         WHERE e.modifier_id = v_target_mid
           AND (e.sellable_item_id IS NULL OR e.sellable_item_id = v_sellable)
      ),
      ranked AS (
        SELECT *,
               ROW_NUMBER() OVER (
                 PARTITION BY ingredient_item_id, effect_type
                 ORDER BY is_specific DESC, sort_order, created_at
               ) AS rn
          FROM candidates
      )
      SELECT jsonb_agg(jsonb_build_object(
               'effect_id',           id,
               'modifier_id',         v_target_mid,
               'modifier_name',       v_target_name,
               'sellable_item_scope', sellable_item_id,
               'ingredient_item_id',  ingredient_item_id,
               'effect_type',         effect_type,
               'quantity',            quantity,
               'multiplier',          multiplier,
               'waste_percent',       waste_percent,
               'unit',                unit
             ) ORDER BY sort_order, created_at)
        INTO v_snap
        FROM ranked WHERE rn = 1;

      PERFORM set_config('pos.system_recompute','on', true);
      UPDATE public.pos_order_item_modifiers
         SET recipe_effects_snapshot = v_snap
       WHERE id = v_target_id;
      PERFORM set_config('pos.system_recompute','', true);
    END IF;
  END IF;

  -- Recompute price total (unchanged behavior)
  SELECT COALESCE(SUM(price_tzs_delta_snapshot),0) INTO v_sum
    FROM public.pos_order_item_modifiers WHERE order_item_id = v_oi;

  PERFORM set_config('pos.system_recompute','on', true);
  UPDATE public.pos_order_items
     SET line_total_tzs = (v_unit + v_sum) * v_qty
   WHERE id = v_oi;
  PERFORM set_config('pos.system_recompute','', true);

  PERFORM set_config('pos.internal','on', true);
  UPDATE public.pos_orders
     SET total_tzs = COALESCE((SELECT SUM(line_total_tzs) FROM public.pos_order_items WHERE order_id = o.id), 0)
    FROM (SELECT order_id FROM public.pos_order_items WHERE id = v_oi) o
   WHERE pos_orders.id = o.order_id;
  PERFORM set_config('pos.internal','', true);

  RETURN COALESCE(NEW, OLD);
END $function$;


-- F) Allow the recompute UPDATE on recipe_effects_snapshot ----
-- pos_order_item_modifiers_guard prevents edits after pending; we need to
-- permit the controlled system_recompute UPDATE for snapshot writes.
CREATE OR REPLACE FUNCTION public.pos_order_item_modifiers_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text; v_tab_closed timestamptz; v_oi uuid;
BEGIN
  -- Allow controlled system writes (snapshot recompute) to pass through.
  IF TG_OP = 'UPDATE' AND current_setting('pos.system_recompute', true) = 'on'
     AND NEW.id              IS NOT DISTINCT FROM OLD.id
     AND NEW.order_item_id   IS NOT DISTINCT FROM OLD.order_item_id
     AND NEW.modifier_id     IS NOT DISTINCT FROM OLD.modifier_id
     AND NEW.modifier_name_snapshot IS NOT DISTINCT FROM OLD.modifier_name_snapshot
     AND NEW.price_tzs_delta_snapshot IS NOT DISTINCT FROM OLD.price_tzs_delta_snapshot THEN
    RETURN NEW;  -- only recipe_effects_snapshot may differ
  END IF;

  v_oi := COALESCE(NEW.order_item_id, OLD.order_item_id);
  SELECT o.status, t.closed_at INTO v_status, v_tab_closed
    FROM public.pos_order_items oi
    JOIN public.pos_orders o ON o.id = oi.order_id
    LEFT JOIN public.pos_tabs t ON t.id = o.tab_id
   WHERE oi.id = v_oi;
  IF v_status IS DISTINCT FROM 'pending' OR v_tab_closed IS NOT NULL THEN
    RAISE EXCEPTION 'MODIFIERS_LOCKED_AFTER_PENDING: modifiers can only be changed while the order is pending and the tab is open'
      USING HINT = 'Wait for the bartender to release the order back to pending, or attach modifiers before confirmation.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;


-- G) Lifecycle: apply modifier snapshots to recipe deduction --
-- Replace pos_orders_stock_lifecycle. Cost snapshots NOT populated yet
-- (Phase 3C-3 will add them); columns may or may not exist, so we
-- intentionally do not reference unit_cost_tzs_snapshot/cost_tzs_snapshot here.
CREATE OR REPLACE FUNCTION public.pos_orders_stock_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_oi              RECORD;
  v_ri              RECORD;
  v_recipe_id       uuid;
  v_recipe_has_rows boolean;
  v_user            uuid;
  v_qty             numeric;
  v_before          numeric;
  v_mode_recipe     int := 0;
  v_mode_legacy     int := 0;
  v_neg_count       int := 0;
  v_modfx_lines     int := 0;
  v_stock_mode      text;
  v_rev_reason      text;
  v_rev_count       int := 0;
  v_m               RECORD;
  v_base            jsonb;
  v_eff             jsonb;
  v_mod             RECORD;
  v_mod_synth_audit boolean := false;
  v_idx             int;
  v_line            jsonb;
  v_found           int;
  v_ing_meta        jsonb;
BEGIN
  v_user := COALESCE(auth.uid(), NEW.voided_by, NEW.waiter_user_id);

  -- ── DEDUCT once ─────────────────────────────────────────────
  IF NEW.status IN ('preparing','ready','served')
     AND OLD.status = 'pending'
     AND NEW.stock_deducted_at IS NULL THEN

    FOR v_oi IN
      SELECT oi.id AS order_item_id, oi.item_id, oi.qty, oi.item_name,
             mi.stock_qty AS sellable_stock
        FROM public.pos_order_items oi
        JOIN public.pos_menu_items  mi ON mi.id = oi.item_id
       WHERE oi.order_id = NEW.id
    LOOP
      SELECT id INTO v_recipe_id
        FROM public.pos_recipes
       WHERE sellable_item_id = v_oi.item_id
         AND casino_id = NEW.casino_id
         AND is_active = true
       LIMIT 1;

      -- Build base recipe ingredient list as jsonb array
      v_base := '[]'::jsonb;
      IF v_recipe_id IS NOT NULL THEN
        SELECT EXISTS(SELECT 1 FROM public.pos_recipe_items WHERE recipe_id = v_recipe_id)
          INTO v_recipe_has_rows;
        IF v_recipe_has_rows THEN
          SELECT jsonb_agg(jsonb_build_object(
                   'ingredient_item_id', ri.ingredient_item_id,
                   'quantity',           ri.quantity,
                   'waste_percent',      COALESCE(ri.waste_percent,0),
                   'unit',               ri.unit,
                   'mod_effect_ids',     '[]'::jsonb
                 ))
            INTO v_base
            FROM public.pos_recipe_items ri WHERE ri.recipe_id = v_recipe_id;
        ELSE
          IF v_user IS NOT NULL THEN
            INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
            VALUES (NEW.casino_id, 'system', 'pos_recipe_empty',
              jsonb_build_object('order_id', NEW.id,
                                 'order_item_id', v_oi.order_item_id,
                                 'item_id', v_oi.item_id,
                                 'item_name', v_oi.item_name,
                                 'recipe_id', v_recipe_id),
              v_user);
          END IF;
        END IF;
      END IF;

      -- Apply modifier effects from snapshots (any order_item with at least one modifier)
      FOR v_mod IN
        SELECT m.id, m.modifier_id, m.recipe_effects_snapshot
          FROM public.pos_order_item_modifiers m
         WHERE m.order_item_id = v_oi.order_item_id
         ORDER BY m.created_at
      LOOP
        IF v_mod.recipe_effects_snapshot IS NULL THEN CONTINUE; END IF;

        -- Iterate effects in deterministic order: remove → override → multiply → add
        FOR v_eff IN
          SELECT e FROM jsonb_array_elements(v_mod.recipe_effects_snapshot) e
        LOOP
          -- nothing here yet; we process per effect_type below in passes
          NULL;
        END LOOP;

        -- Pass 1: remove_ingredient
        SELECT jsonb_agg(line)
          INTO v_base
          FROM jsonb_array_elements(v_base) line
         WHERE NOT EXISTS (
           SELECT 1
             FROM jsonb_array_elements(v_mod.recipe_effects_snapshot) e
            WHERE e->>'effect_type' = 'remove_ingredient'
              AND (e->>'ingredient_item_id')::uuid = (line->>'ingredient_item_id')::uuid
         );
        v_base := COALESCE(v_base, '[]'::jsonb);

        -- Passes 2/3/4: override, multiply, add
        FOR v_eff IN
          SELECT e
            FROM jsonb_array_elements(v_mod.recipe_effects_snapshot) e
           WHERE e->>'effect_type' IN ('override_quantity','multiply_quantity','add_quantity')
           ORDER BY CASE e->>'effect_type'
                      WHEN 'override_quantity' THEN 1
                      WHEN 'multiply_quantity' THEN 2
                      WHEN 'add_quantity'      THEN 3 END
        LOOP
          v_found := -1;
          FOR v_idx IN 0 .. (jsonb_array_length(v_base) - 1) LOOP
            v_line := v_base -> v_idx;
            IF (v_line->>'ingredient_item_id')::uuid = ((v_eff->'e')->>'ingredient_item_id')::uuid
            THEN v_found := v_idx; EXIT; END IF;
          END LOOP;

          IF v_found >= 0 THEN
            v_line := v_base -> v_found;
            IF (v_eff->'e'->>'effect_type') = 'override_quantity' THEN
              v_line := jsonb_set(v_line, '{quantity}', to_jsonb((v_eff->'e'->>'quantity')::numeric));
            ELSIF (v_eff->'e'->>'effect_type') = 'multiply_quantity' THEN
              v_line := jsonb_set(v_line, '{quantity}',
                to_jsonb( ((v_line->>'quantity')::numeric) * ((v_eff->'e'->>'multiplier')::numeric) ));
            ELSIF (v_eff->'e'->>'effect_type') = 'add_quantity' THEN
              v_line := jsonb_set(v_line, '{quantity}',
                to_jsonb( ((v_line->>'quantity')::numeric) + ((v_eff->'e'->>'quantity')::numeric) ));
            END IF;
            v_line := jsonb_set(v_line, '{mod_effect_ids}',
              (v_line->'mod_effect_ids') || to_jsonb((v_eff->'e'->>'effect_id')::uuid));
            v_base := jsonb_set(v_base, ARRAY[v_found::text], v_line);
            v_modfx_lines := v_modfx_lines + 1;
          ELSE
            -- Ingredient not in base
            IF (v_eff->'e'->>'effect_type') IN ('add_quantity','override_quantity') THEN
              v_base := v_base || jsonb_build_array(jsonb_build_object(
                'ingredient_item_id', (v_eff->'e'->>'ingredient_item_id')::uuid,
                'quantity',           (v_eff->'e'->>'quantity')::numeric,
                'waste_percent',      COALESCE((v_eff->'e'->>'waste_percent')::numeric, 0),
                'unit',               v_eff->'e'->>'unit',
                'mod_effect_ids',     jsonb_build_array((v_eff->'e'->>'effect_id')::uuid)
              ));
              v_modfx_lines := v_modfx_lines + 1;
              IF v_recipe_id IS NULL AND NOT v_mod_synth_audit THEN
                IF v_user IS NOT NULL THEN
                  INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
                  VALUES (NEW.casino_id, 'system', 'pos_modifier_no_base_recipe',
                    jsonb_build_object('order_id', NEW.id,
                                       'order_item_id', v_oi.order_item_id,
                                       'item_id', v_oi.item_id,
                                       'item_name', v_oi.item_name),
                    v_user);
                END IF;
                v_mod_synth_audit := true;
              END IF;
            END IF;
            -- multiply on absent base / remove on absent base → no-op
          END IF;
        END LOOP;
      END LOOP;

      -- Decide branch
      IF v_base IS NOT NULL AND jsonb_array_length(v_base) > 0 THEN
        -- Recipe (possibly augmented) consumption
        FOR v_idx IN 0 .. (jsonb_array_length(v_base) - 1) LOOP
          v_line := v_base -> v_idx;
          v_qty := ((v_line->>'quantity')::numeric)
                 * (1 + COALESCE((v_line->>'waste_percent')::numeric,0)/100.0)
                 * v_oi.qty;
          SELECT COALESCE(stock_qty, 0), name
            INTO v_before, v_ing_meta
            FROM public.pos_menu_items
           WHERE id = (v_line->>'ingredient_item_id')::uuid;

          INSERT INTO public.pos_inventory_movements (
            item_id, delta, reason, user_id,
            casino_id, business_date, reference_type, reference_id,
            source_item_id, metadata
          ) VALUES (
            (v_line->>'ingredient_item_id')::uuid,
            -v_qty,
            'pos_recipe_consumption',
            v_user,
            NEW.casino_id, NEW.business_date, 'pos_order', NEW.id,
            v_oi.item_id,
            jsonb_build_object(
              'recipe_id',     v_recipe_id,
              'order_item_id', v_oi.order_item_id,
              'unit',          v_line->>'unit',
              'waste_percent', (v_line->>'waste_percent')::numeric,
              'parent_qty',    v_oi.qty,
              'recipe_qty',    (v_line->>'quantity')::numeric,
              'mod_effect_ids', COALESCE(v_line->'mod_effect_ids', '[]'::jsonb)
            )
          );

          IF (v_before - v_qty) < 0 AND v_user IS NOT NULL THEN
            v_neg_count := v_neg_count + 1;
            INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
            VALUES (NEW.casino_id, 'system', 'pos_stock_negative',
              jsonb_build_object(
                'order_id',       NEW.id,
                'tab_id',         NEW.tab_id,
                'item_id',        (v_line->>'ingredient_item_id')::uuid,
                'qty',            v_qty,
                'before_qty',     v_before,
                'after_qty',      v_before - v_qty,
                'source_item_id', v_oi.item_id,
                'source_item_name', v_oi.item_name,
                'recipe_id',      v_recipe_id
              ),
              v_user);
          END IF;
        END LOOP;
        v_mode_recipe := v_mode_recipe + 1;
      ELSE
        -- Legacy branch — only if trackable
        IF v_oi.sellable_stock IS NOT NULL THEN
          INSERT INTO public.pos_inventory_movements (
            item_id, delta, reason, user_id,
            casino_id, business_date, reference_type, reference_id,
            source_item_id, metadata
          ) VALUES (
            v_oi.item_id, -v_oi.qty, 'sale', v_user,
            NEW.casino_id, NEW.business_date, 'pos_order', NEW.id,
            v_oi.item_id,
            jsonb_build_object('order_item_id', v_oi.order_item_id, 'parent_qty', v_oi.qty)
          );
          v_mode_legacy := v_mode_legacy + 1;
          IF (v_oi.sellable_stock - v_oi.qty) < 0 AND v_user IS NOT NULL THEN
            v_neg_count := v_neg_count + 1;
            INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
            VALUES (NEW.casino_id, 'system', 'pos_stock_negative',
              jsonb_build_object(
                'order_id',       NEW.id,
                'tab_id',         NEW.tab_id,
                'item_id',        v_oi.item_id,
                'item_name',      v_oi.item_name,
                'qty',            v_oi.qty,
                'before_qty',     v_oi.sellable_stock,
                'after_qty',      v_oi.sellable_stock - v_oi.qty,
                'source_item_id', v_oi.item_id,
                'source_item_name', v_oi.item_name
              ),
              v_user);
          END IF;
        END IF;
      END IF;
    END LOOP;

    v_stock_mode := CASE
      WHEN v_mode_recipe > 0 AND v_mode_legacy > 0 THEN 'mixed'
      WHEN v_mode_recipe > 0 THEN 'recipe'
      WHEN v_mode_legacy > 0 THEN 'legacy_direct'
      ELSE 'none'
    END;

    PERFORM set_config('pos.internal','on', true);
    UPDATE public.pos_orders
       SET stock_deducted_at = now(),
           stock_mode        = v_stock_mode
     WHERE id = NEW.id;
    PERFORM set_config('pos.internal','', true);

    IF v_user IS NOT NULL THEN
      INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
      VALUES (NEW.casino_id, 'system', 'pos_order_confirmed',
        jsonb_build_object(
          'order_id',             NEW.id,
          'tab_id',               NEW.tab_id,
          'stock_mode',           v_stock_mode,
          'recipe_items_count',   v_mode_recipe,
          'legacy_items_count',   v_mode_legacy,
          'modifier_effect_lines', v_modfx_lines,
          'negative_items',       v_neg_count,
          'new_status',           NEW.status
        ),
        v_user);
    END IF;
  END IF;

  -- ── RESTORE on void — mirror per-row, idempotent ─────────────
  IF NEW.status = 'void' AND OLD.status <> 'void' THEN
    IF NEW.stock_deducted_at IS NOT NULL THEN
      FOR v_m IN
        SELECT m.*
          FROM public.pos_inventory_movements m
         WHERE m.reference_type = 'pos_order'
           AND m.reference_id   = NEW.id
           AND m.reason IN ('sale','pos_recipe_consumption')
           AND NOT EXISTS (
             SELECT 1 FROM public.pos_inventory_movements r
              WHERE r.reference_type = 'pos_order'
                AND r.reference_id   = NEW.id
                AND r.reason IN ('order_void_reversal','pos_recipe_reversal')
                AND (r.metadata->>'reverses')::uuid = m.id
           )
      LOOP
        v_rev_reason := CASE v_m.reason
          WHEN 'sale' THEN 'order_void_reversal'
          WHEN 'pos_recipe_consumption' THEN 'pos_recipe_reversal'
        END;
        INSERT INTO public.pos_inventory_movements (
          item_id, delta, reason, user_id,
          casino_id, business_date, reference_type, reference_id,
          source_item_id, metadata
        ) VALUES (
          v_m.item_id, -v_m.delta, v_rev_reason, v_user,
          NEW.casino_id, NEW.business_date, 'pos_order', NEW.id,
          v_m.source_item_id,
          COALESCE(v_m.metadata, '{}'::jsonb) || jsonb_build_object('reverses', v_m.id)
        );
        v_rev_count := v_rev_count + 1;
      END LOOP;
    END IF;

    IF v_user IS NOT NULL THEN
      INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
      VALUES (NEW.casino_id, 'system', 'pos_order_voided',
        jsonb_build_object(
          'order_id',                  NEW.id,
          'tab_id',                    NEW.tab_id,
          'reason',                    COALESCE(NEW.voided_reason, NEW.void_reason),
          'stock_restored',            NEW.stock_deducted_at IS NOT NULL,
          'stock_mode',                NEW.stock_mode,
          'reversed_movements_count',  v_rev_count,
          'prior_status',              OLD.status
        ),
        v_user);
    END IF;
  END IF;

  RETURN NEW;
END $function$;