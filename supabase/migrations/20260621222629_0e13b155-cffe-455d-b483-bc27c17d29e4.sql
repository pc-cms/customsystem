-- Phase 3B: recipe-aware stock deduction
-- Additive columns (nullable, no backfill required)
ALTER TABLE public.pos_inventory_movements
  ADD COLUMN IF NOT EXISTS source_item_id uuid REFERENCES public.pos_menu_items(id),
  ADD COLUMN IF NOT EXISTS metadata jsonb;

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS stock_mode text;

-- Extend audit-skip list so recipe rows are not double-logged
CREATE OR REPLACE FUNCTION public.pos_inventory_audit_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_cas  uuid;
BEGIN
  IF NEW.reason IN ('sale','order_void_reversal','pos_recipe_consumption','pos_recipe_reversal') THEN
    RETURN NEW;
  END IF;

  v_user := COALESCE(auth.uid(), NEW.user_id);
  IF v_user IS NULL THEN RETURN NEW; END IF;

  v_cas := NEW.casino_id;
  IF v_cas IS NULL THEN
    SELECT casino_id INTO v_cas FROM public.pos_menu_items WHERE id = NEW.item_id;
  END IF;
  IF v_cas IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
  VALUES (v_cas, 'system', 'pos_inventory_adjustment',
    jsonb_build_object(
      'movement_id', NEW.id, 'item_id', NEW.item_id,
      'delta', NEW.delta, 'reason', NEW.reason,
      'reference_type', NEW.reference_type, 'reference_id', NEW.reference_id
    ),
    v_user);
  RETURN NEW;
END $function$;

-- Replacement lifecycle: recipe-aware deduct + idempotent mirror-reversal
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
  v_stock_mode      text;
  v_rev_reason      text;
  v_rev_count       int := 0;
  v_m               RECORD;
BEGIN
  v_user := COALESCE(auth.uid(), NEW.voided_by, NEW.waiter_user_id);

  -- ── DEDUCT once on first move out of pending ─────────────────────────
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
      -- Detect active recipe for this sellable item
      SELECT id INTO v_recipe_id
        FROM public.pos_recipes
       WHERE sellable_item_id = v_oi.item_id
         AND casino_id = NEW.casino_id
         AND is_active = true
       LIMIT 1;

      IF v_recipe_id IS NOT NULL THEN
        SELECT EXISTS(SELECT 1 FROM public.pos_recipe_items WHERE recipe_id = v_recipe_id)
          INTO v_recipe_has_rows;

        IF NOT v_recipe_has_rows THEN
          -- Empty recipe → warn, then fall through to legacy ONLY if trackable
          IF v_user IS NOT NULL THEN
            INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
            VALUES (NEW.casino_id, 'system', 'pos_recipe_empty',
              jsonb_build_object(
                'order_id',      NEW.id,
                'order_item_id', v_oi.order_item_id,
                'item_id',       v_oi.item_id,
                'item_name',     v_oi.item_name,
                'recipe_id',     v_recipe_id
              ),
              v_user);
          END IF;
          -- fall through below to legacy branch
        ELSE
          -- Recipe branch: consume each ingredient
          FOR v_ri IN
            SELECT ri.ingredient_item_id, ri.quantity, ri.unit,
                   COALESCE(ri.waste_percent, 0) AS waste_percent,
                   mi2.stock_qty AS before_qty, mi2.name AS ing_name
              FROM public.pos_recipe_items ri
              JOIN public.pos_menu_items  mi2 ON mi2.id = ri.ingredient_item_id
             WHERE ri.recipe_id = v_recipe_id
          LOOP
            v_qty := v_ri.quantity * (1 + v_ri.waste_percent / 100.0) * v_oi.qty;
            v_before := COALESCE(v_ri.before_qty, 0);

            INSERT INTO public.pos_inventory_movements (
              item_id, delta, reason, user_id,
              casino_id, business_date, reference_type, reference_id,
              source_item_id, metadata
            ) VALUES (
              v_ri.ingredient_item_id, -v_qty, 'pos_recipe_consumption', v_user,
              NEW.casino_id, NEW.business_date, 'pos_order', NEW.id,
              v_oi.item_id,
              jsonb_build_object(
                'recipe_id',     v_recipe_id,
                'order_item_id', v_oi.order_item_id,
                'unit',          v_ri.unit,
                'waste_percent', v_ri.waste_percent,
                'parent_qty',    v_oi.qty,
                'recipe_qty',    v_ri.quantity
              )
            );

            IF (v_before - v_qty) < 0 AND v_user IS NOT NULL THEN
              v_neg_count := v_neg_count + 1;
              INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
              VALUES (NEW.casino_id, 'system', 'pos_stock_negative',
                jsonb_build_object(
                  'order_id',       NEW.id,
                  'tab_id',         NEW.tab_id,
                  'item_id',        v_ri.ingredient_item_id,
                  'item_name',      v_ri.ing_name,
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
          CONTINUE;  -- skip legacy branch for this order item
        END IF;
      END IF;

      -- Legacy branch (no recipe, or recipe empty) — only if trackable
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
          'order_id',           NEW.id,
          'tab_id',             NEW.tab_id,
          'stock_mode',         v_stock_mode,
          'recipe_items_count', v_mode_recipe,
          'legacy_items_count', v_mode_legacy,
          'negative_items',     v_neg_count,
          'new_status',         NEW.status
        ),
        v_user);
    END IF;
  END IF;

  -- ── RESTORE on void — mirror per-row, idempotent ──────────────────────
  IF NEW.status = 'void' AND OLD.status <> 'void' THEN
    IF NEW.stock_deducted_at IS NOT NULL THEN
      FOR v_m IN
        SELECT m.*
          FROM public.pos_inventory_movements m
         WHERE m.reference_type = 'pos_order'
           AND m.reference_id   = NEW.id
           AND m.reason IN ('sale','pos_recipe_consumption')
           AND NOT EXISTS (
             SELECT 1
               FROM public.pos_inventory_movements r
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