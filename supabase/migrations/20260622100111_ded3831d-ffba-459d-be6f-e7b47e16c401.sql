
-- Phase 3C-3: Cost snapshots + COGS reporting

-- 1) Add snapshot columns (nullable, no historical backfill)
ALTER TABLE public.pos_inventory_movements
  ADD COLUMN IF NOT EXISTS unit_cost_tzs_snapshot numeric,
  ADD COLUMN IF NOT EXISTS cost_tzs_snapshot      numeric,
  ADD COLUMN IF NOT EXISTS cost_snapshot_missing  boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pos_inv_mov_cogs
  ON public.pos_inventory_movements (casino_id, business_date, reason);

-- 2) Updated lifecycle: write cost snapshots on consumption + reversal
CREATE OR REPLACE FUNCTION public.pos_orders_stock_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_oi              RECORD;
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
  v_unit_cost       numeric;
  v_cost_missing    boolean;
  v_uncosted_count  int := 0;
BEGIN
  v_user := COALESCE(auth.uid(), NEW.voided_by, NEW.waiter_user_id);

  IF NEW.status IN ('preparing','ready','served')
     AND OLD.status = 'pending'
     AND NEW.stock_deducted_at IS NULL THEN

    FOR v_oi IN
      SELECT oi.id AS order_item_id, oi.item_id, oi.qty, oi.item_name,
             mi.stock_qty AS sellable_stock,
             mi.avg_cost_tzs AS sellable_avg_cost
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

      v_base := '[]'::jsonb;
      v_mod_synth_audit := false;

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

      v_base := COALESCE(v_base, '[]'::jsonb);

      FOR v_mod IN
        SELECT m.id, m.modifier_id, m.recipe_effects_snapshot
          FROM public.pos_order_item_modifiers m
         WHERE m.order_item_id = v_oi.order_item_id
         ORDER BY m.created_at
      LOOP
        IF v_mod.recipe_effects_snapshot IS NULL
           OR jsonb_array_length(v_mod.recipe_effects_snapshot) = 0 THEN
          CONTINUE;
        END IF;

        SELECT COALESCE(jsonb_agg(line), '[]'::jsonb)
          INTO v_base
          FROM jsonb_array_elements(v_base) AS line
         WHERE NOT EXISTS (
           SELECT 1
             FROM jsonb_array_elements(v_mod.recipe_effects_snapshot) AS e
            WHERE e->>'effect_type' = 'remove_ingredient'
              AND (e->>'ingredient_item_id')::uuid = (line->>'ingredient_item_id')::uuid
         );

        FOR v_eff IN
          SELECT e
            FROM jsonb_array_elements(v_mod.recipe_effects_snapshot) AS e
           WHERE e->>'effect_type' IN ('override_quantity','multiply_quantity','add_quantity')
           ORDER BY CASE e->>'effect_type'
                      WHEN 'override_quantity' THEN 1
                      WHEN 'multiply_quantity' THEN 2
                      WHEN 'add_quantity'      THEN 3 END
        LOOP
          v_found := -1;
          FOR v_idx IN 0 .. (jsonb_array_length(v_base) - 1) LOOP
            v_line := v_base -> v_idx;
            IF (v_line->>'ingredient_item_id')::uuid
               = (v_eff->>'ingredient_item_id')::uuid THEN
              v_found := v_idx; EXIT;
            END IF;
          END LOOP;

          IF v_found >= 0 THEN
            v_line := v_base -> v_found;
            IF (v_eff->>'effect_type') = 'override_quantity' THEN
              v_line := jsonb_set(v_line, '{quantity}', to_jsonb((v_eff->>'quantity')::numeric));
            ELSIF (v_eff->>'effect_type') = 'multiply_quantity' THEN
              v_line := jsonb_set(v_line, '{quantity}',
                to_jsonb( ((v_line->>'quantity')::numeric) * ((v_eff->>'multiplier')::numeric) ));
            ELSIF (v_eff->>'effect_type') = 'add_quantity' THEN
              v_line := jsonb_set(v_line, '{quantity}',
                to_jsonb( ((v_line->>'quantity')::numeric) + ((v_eff->>'quantity')::numeric) ));
            END IF;
            v_line := jsonb_set(v_line, '{mod_effect_ids}',
              (v_line->'mod_effect_ids') || to_jsonb((v_eff->>'effect_id')::uuid));
            v_base := jsonb_set(v_base, ARRAY[v_found::text], v_line);
            v_modfx_lines := v_modfx_lines + 1;
          ELSE
            IF (v_eff->>'effect_type') IN ('add_quantity','override_quantity') THEN
              v_base := v_base || jsonb_build_array(jsonb_build_object(
                'ingredient_item_id', (v_eff->>'ingredient_item_id')::uuid,
                'quantity',           (v_eff->>'quantity')::numeric,
                'waste_percent',      COALESCE((v_eff->>'waste_percent')::numeric, 0),
                'unit',               v_eff->>'unit',
                'mod_effect_ids',     jsonb_build_array((v_eff->>'effect_id')::uuid)
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
          END IF;
        END LOOP;
      END LOOP;

      IF v_base IS NOT NULL AND jsonb_array_length(v_base) > 0 THEN
        FOR v_idx IN 0 .. (jsonb_array_length(v_base) - 1) LOOP
          v_line := v_base -> v_idx;
          v_qty := ((v_line->>'quantity')::numeric)
                 * (1 + COALESCE((v_line->>'waste_percent')::numeric,0)/100.0)
                 * v_oi.qty;
          SELECT COALESCE(stock_qty, 0), COALESCE(avg_cost_tzs, 0)
            INTO v_before, v_unit_cost
            FROM public.pos_menu_items
           WHERE id = (v_line->>'ingredient_item_id')::uuid;

          v_cost_missing := (v_unit_cost IS NULL OR v_unit_cost = 0);
          IF v_cost_missing THEN
            v_unit_cost := 0;
            v_uncosted_count := v_uncosted_count + 1;
            IF v_user IS NOT NULL THEN
              INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
              VALUES (NEW.casino_id, 'system', 'pos_cost_snapshot_missing',
                jsonb_build_object(
                  'order_id', NEW.id,
                  'order_item_id', v_oi.order_item_id,
                  'item_id', (v_line->>'ingredient_item_id')::uuid,
                  'source_item_id', v_oi.item_id,
                  'reason', 'pos_recipe_consumption'
                ),
                v_user);
            END IF;
          END IF;

          INSERT INTO public.pos_inventory_movements (
            item_id, delta, reason, user_id,
            casino_id, business_date, reference_type, reference_id,
            source_item_id, metadata,
            unit_cost_tzs_snapshot, cost_tzs_snapshot, cost_snapshot_missing
          ) VALUES (
            (v_line->>'ingredient_item_id')::uuid,
            -v_qty,
            'pos_recipe_consumption',
            v_user,
            NEW.casino_id, NEW.business_date, 'pos_order', NEW.id,
            v_oi.item_id,
            jsonb_build_object(
              'recipe_id',      v_recipe_id,
              'order_item_id',  v_oi.order_item_id,
              'unit',           v_line->>'unit',
              'waste_percent',  (v_line->>'waste_percent')::numeric,
              'parent_qty',     v_oi.qty,
              'recipe_qty',     (v_line->>'quantity')::numeric,
              'mod_effect_ids', COALESCE(v_line->'mod_effect_ids', '[]'::jsonb)
            ),
            v_unit_cost,
            v_qty * v_unit_cost,
            v_cost_missing
          );

          IF (v_before - v_qty) < 0 AND v_user IS NOT NULL THEN
            v_neg_count := v_neg_count + 1;
            INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
            VALUES (NEW.casino_id, 'system', 'pos_stock_negative',
              jsonb_build_object(
                'order_id',         NEW.id,
                'tab_id',           NEW.tab_id,
                'item_id',          (v_line->>'ingredient_item_id')::uuid,
                'qty',              v_qty,
                'before_qty',       v_before,
                'after_qty',        v_before - v_qty,
                'source_item_id',   v_oi.item_id,
                'source_item_name', v_oi.item_name,
                'recipe_id',        v_recipe_id
              ),
              v_user);
          END IF;
        END LOOP;
        v_mode_recipe := v_mode_recipe + 1;
      ELSE
        IF v_oi.sellable_stock IS NOT NULL THEN
          v_unit_cost := COALESCE(v_oi.sellable_avg_cost, 0);
          v_cost_missing := (v_unit_cost = 0);
          IF v_cost_missing THEN
            v_uncosted_count := v_uncosted_count + 1;
            IF v_user IS NOT NULL THEN
              INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
              VALUES (NEW.casino_id, 'system', 'pos_cost_snapshot_missing',
                jsonb_build_object(
                  'order_id', NEW.id,
                  'order_item_id', v_oi.order_item_id,
                  'item_id', v_oi.item_id,
                  'source_item_id', v_oi.item_id,
                  'reason', 'sale'
                ),
                v_user);
            END IF;
          END IF;

          INSERT INTO public.pos_inventory_movements (
            item_id, delta, reason, user_id,
            casino_id, business_date, reference_type, reference_id,
            source_item_id, metadata,
            unit_cost_tzs_snapshot, cost_tzs_snapshot, cost_snapshot_missing
          ) VALUES (
            v_oi.item_id, -v_oi.qty, 'sale', v_user,
            NEW.casino_id, NEW.business_date, 'pos_order', NEW.id,
            v_oi.item_id,
            jsonb_build_object('order_item_id', v_oi.order_item_id, 'parent_qty', v_oi.qty),
            v_unit_cost,
            v_oi.qty * v_unit_cost,
            v_cost_missing
          );
          v_mode_legacy := v_mode_legacy + 1;
          IF (v_oi.sellable_stock - v_oi.qty) < 0 AND v_user IS NOT NULL THEN
            v_neg_count := v_neg_count + 1;
            INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
            VALUES (NEW.casino_id, 'system', 'pos_stock_negative',
              jsonb_build_object(
                'order_id',         NEW.id,
                'tab_id',           NEW.tab_id,
                'item_id',          v_oi.item_id,
                'item_name',        v_oi.item_name,
                'qty',              v_oi.qty,
                'before_qty',       v_oi.sellable_stock,
                'after_qty',        v_oi.sellable_stock - v_oi.qty,
                'source_item_id',   v_oi.item_id,
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
          'order_id',              NEW.id,
          'tab_id',                NEW.tab_id,
          'stock_mode',            v_stock_mode,
          'recipe_items_count',    v_mode_recipe,
          'legacy_items_count',    v_mode_legacy,
          'modifier_effect_lines', v_modfx_lines,
          'negative_items',        v_neg_count,
          'uncosted_movements',    v_uncosted_count,
          'new_status',            NEW.status
        ),
        v_user);
    END IF;
  END IF;

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
          source_item_id, metadata,
          unit_cost_tzs_snapshot, cost_tzs_snapshot, cost_snapshot_missing
        ) VALUES (
          v_m.item_id, -v_m.delta, v_rev_reason, v_user,
          NEW.casino_id, NEW.business_date, 'pos_order', NEW.id,
          v_m.source_item_id,
          COALESCE(v_m.metadata, '{}'::jsonb) || jsonb_build_object('reverses', v_m.id),
          v_m.unit_cost_tzs_snapshot,
          CASE WHEN v_m.cost_tzs_snapshot IS NULL THEN NULL ELSE -v_m.cost_tzs_snapshot END,
          COALESCE(v_m.cost_snapshot_missing, false)
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

-- 3) COGS report RPC
CREATE OR REPLACE FUNCTION public.pos_cogs_report(
  _casino_id uuid,
  _from_date date,
  _to_date date,
  _pos_location_id uuid DEFAULT NULL,
  _group_by text DEFAULT 'sellable_item'
)
RETURNS TABLE (
  group_key text,
  group_label text,
  group_type text,
  units_consumed numeric,
  cogs_tzs numeric,
  gross_sales_tzs numeric,
  gross_margin_tzs numeric,
  gross_margin_pct numeric,
  uncosted_movement_count bigint,
  movement_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_gb text := lower(COALESCE(_group_by,'sellable_item'));
BEGIN
  IF v_gb NOT IN ('sellable_item','ingredient','location','day') THEN
    RAISE EXCEPTION 'invalid group_by: %', _group_by;
  END IF;

  RETURN QUERY
  WITH mov AS (
    SELECT m.*, o.pos_location_id AS order_location_id
      FROM public.pos_inventory_movements m
      LEFT JOIN public.pos_orders o
        ON o.id = m.reference_id AND m.reference_type = 'pos_order'
     WHERE m.casino_id = _casino_id
       AND m.business_date BETWEEN _from_date AND _to_date
       AND m.reason IN ('sale','pos_recipe_consumption','order_void_reversal','pos_recipe_reversal')
       AND (_pos_location_id IS NULL OR o.pos_location_id = _pos_location_id)
  ),
  mov_agg AS (
    SELECT
      CASE v_gb
        WHEN 'sellable_item' THEN COALESCE(m.source_item_id::text, m.item_id::text)
        WHEN 'ingredient'    THEN m.item_id::text
        WHEN 'location'      THEN COALESCE(m.order_location_id::text, '__none__')
        WHEN 'day'           THEN to_char(m.business_date, 'YYYY-MM-DD')
      END AS group_key,
      SUM(CASE WHEN m.reason IN ('sale','pos_recipe_consumption') THEN ABS(m.delta)
               WHEN m.reason IN ('order_void_reversal','pos_recipe_reversal') THEN -ABS(m.delta)
               ELSE 0 END) AS units_consumed,
      SUM(COALESCE(m.cost_tzs_snapshot, 0)) AS cogs_tzs,
      COUNT(*) FILTER (WHERE m.cost_snapshot_missing OR m.cost_tzs_snapshot IS NULL) AS uncosted_movement_count,
      COUNT(*) AS movement_count
    FROM mov m
    GROUP BY 1
  ),
  -- Sales aggregated independently to avoid ingredient-row multiplication
  orders_in_range AS (
    SELECT o.id, o.pos_location_id, o.business_date, o.status
      FROM public.pos_orders o
     WHERE o.casino_id = _casino_id
       AND o.business_date BETWEEN _from_date AND _to_date
       AND (_pos_location_id IS NULL OR o.pos_location_id = _pos_location_id)
       AND o.status <> 'void'
  ),
  sales_agg AS (
    SELECT
      CASE v_gb
        WHEN 'sellable_item' THEN oi.item_id::text
        WHEN 'ingredient'    THEN NULL
        WHEN 'location'      THEN COALESCE(o.pos_location_id::text, '__none__')
        WHEN 'day'           THEN to_char(o.business_date, 'YYYY-MM-DD')
      END AS group_key,
      SUM(COALESCE(oi.line_total_tzs, 0)) AS gross_sales_tzs
    FROM orders_in_range o
    JOIN public.pos_order_items oi ON oi.order_id = o.id
    GROUP BY 1
  ),
  joined AS (
    SELECT
      COALESCE(m.group_key, s.group_key) AS group_key,
      COALESCE(m.units_consumed, 0) AS units_consumed,
      COALESCE(m.cogs_tzs, 0) AS cogs_tzs,
      COALESCE(s.gross_sales_tzs, 0) AS gross_sales_tzs,
      COALESCE(m.uncosted_movement_count, 0) AS uncosted_movement_count,
      COALESCE(m.movement_count, 0) AS movement_count
    FROM mov_agg m
    FULL OUTER JOIN sales_agg s ON s.group_key = m.group_key
  )
  SELECT
    j.group_key,
    CASE v_gb
      WHEN 'sellable_item' THEN COALESCE(mi.name, '(unknown item)')
      WHEN 'ingredient'    THEN COALESCE(mi.name, '(unknown ingredient)')
      WHEN 'location'      THEN COALESCE(loc.name, CASE WHEN j.group_key = '__none__' THEN '(no location)' ELSE '(unknown)' END)
      WHEN 'day'           THEN j.group_key
    END AS group_label,
    v_gb AS group_type,
    j.units_consumed,
    j.cogs_tzs,
    j.gross_sales_tzs,
    (j.gross_sales_tzs - j.cogs_tzs) AS gross_margin_tzs,
    CASE WHEN j.gross_sales_tzs > 0
         THEN ROUND(((j.gross_sales_tzs - j.cogs_tzs) / j.gross_sales_tzs) * 100, 2)
         ELSE NULL END AS gross_margin_pct,
    j.uncosted_movement_count,
    j.movement_count
  FROM joined j
  LEFT JOIN public.pos_menu_items mi
    ON v_gb IN ('sellable_item','ingredient')
   AND mi.id::text = j.group_key
  LEFT JOIN public.pos_locations loc
    ON v_gb = 'location'
   AND loc.id::text = j.group_key
  ORDER BY j.cogs_tzs DESC NULLS LAST, j.gross_sales_tzs DESC NULLS LAST;
END $$;

GRANT EXECUTE ON FUNCTION public.pos_cogs_report(uuid, date, date, uuid, text) TO authenticated;
