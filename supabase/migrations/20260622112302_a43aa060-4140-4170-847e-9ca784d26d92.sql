-- Phase 3D: Operational Control
-- 1. Fix pos_save_stock_count column-name mismatch
-- 2. Add pos_record_waste RPC (cost snapshots for waste/spoilage)
-- 3. Add pos_backfill_cost_snapshots RPC (manager-triggered historical backfill)
-- 4. Update pos_cogs_report to include waste reasons

-- ============================================================
-- 1) Fix pos_save_stock_count schema inconsistency
--    Old columns: qty_delta, ref_type, ref_id, performed_by
--    Actual columns: delta, reference_type, reference_id, user_id
--    Also adds business_date, source_item_id, metadata, cost snapshots.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pos_save_stock_count(
  _shift_id uuid,
  _count_type text,
  _items jsonb,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_casino uuid;
  v_count_id uuid;
  v_name text;
  rec jsonb;
  v_item_id uuid;
  v_counted numeric;
  v_expected numeric;
  v_unit_cost numeric;
  v_variance_qty numeric;
  v_variance_val numeric;
  v_total_var numeric := 0;
  v_items_n integer := 0;
  v_business_date date;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _count_type NOT IN ('open','handover','close','adhoc') THEN
    RAISE EXCEPTION 'Invalid count_type %', _count_type;
  END IF;

  IF _shift_id IS NOT NULL THEN
    SELECT casino_id INTO v_casino FROM pos_shifts WHERE id = _shift_id;
  END IF;
  IF v_casino IS NULL THEN
    RAISE EXCEPTION 'Casino context required (shift_id missing or invalid)';
  END IF;

  v_business_date := public.get_current_business_date();

  SELECT full_name INTO v_name FROM profiles WHERE user_id = v_user;

  INSERT INTO pos_stock_counts (casino_id, shift_id, count_type, counted_by, counted_by_name, notes)
  VALUES (v_casino, _shift_id, _count_type, v_user, v_name, _notes)
  RETURNING id INTO v_count_id;

  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(_items, '[]'::jsonb))
  LOOP
    v_item_id := (rec->>'item_id')::uuid;
    v_counted := COALESCE((rec->>'counted_qty')::numeric, 0);

    SELECT COALESCE(stock_qty, 0), COALESCE(avg_cost_tzs, 0)
    INTO v_expected, v_unit_cost
    FROM pos_menu_items
    WHERE id = v_item_id AND casino_id = v_casino;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_variance_qty := v_counted - v_expected;
    v_variance_val := ROUND(ABS(v_variance_qty) * v_unit_cost)::numeric;

    INSERT INTO pos_stock_count_items (count_id, item_id, expected_qty, counted_qty, unit_cost_tzs, variance_value_tzs)
    VALUES (v_count_id, v_item_id, v_expected, v_counted, v_unit_cost, v_variance_val);

    IF v_variance_qty <> 0 THEN
      INSERT INTO pos_inventory_movements (
        casino_id, item_id, delta, reason,
        reference_type, reference_id, user_id,
        business_date, source_item_id, metadata,
        unit_cost_tzs_snapshot, cost_tzs_snapshot, cost_snapshot_missing
      ) VALUES (
        v_casino, v_item_id, v_variance_qty, 'stock_count',
        'pos_stock_count', v_count_id, v_user,
        v_business_date, v_item_id,
        jsonb_build_object('count_type', _count_type, 'notes', _notes),
        v_unit_cost,
        ABS(v_variance_qty) * v_unit_cost,
        (v_unit_cost IS NULL OR v_unit_cost = 0)
      );
    END IF;

    v_total_var := v_total_var + v_variance_val;
    v_items_n := v_items_n + 1;
  END LOOP;

  PERFORM set_config('session_replication_role', 'replica', true);
  UPDATE pos_stock_counts SET total_variance_value_tzs = v_total_var, items_count = v_items_n WHERE id = v_count_id;
  PERFORM set_config('session_replication_role', 'origin', true);

  RETURN v_count_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_save_stock_count(uuid, text, jsonb, text) TO authenticated;

-- ============================================================
-- 2) pos_record_waste — record waste/spoilage with cost snapshot
-- ============================================================

CREATE OR REPLACE FUNCTION public.pos_record_waste(
  _item_id uuid,
  _qty numeric,
  _reason text,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_casino uuid;
  v_unit_cost numeric;
  v_cost_missing boolean;
  v_business_date date;
  v_movement_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;
  IF _reason NOT IN ('waste','spoilage','staff_consumption','damage','tasting') THEN
    RAISE EXCEPTION 'Invalid waste reason: %', _reason;
  END IF;

  SELECT casino_id INTO v_casino FROM pos_menu_items WHERE id = _item_id;
  IF v_casino IS NULL THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  SELECT COALESCE(avg_cost_tzs, 0) INTO v_unit_cost
    FROM pos_menu_items WHERE id = _item_id;

  v_cost_missing := (v_unit_cost = 0);
  v_business_date := public.get_current_business_date();

  INSERT INTO pos_inventory_movements (
    casino_id, item_id, delta, reason, user_id,
    business_date, reference_type, reference_id, source_item_id, metadata,
    unit_cost_tzs_snapshot, cost_tzs_snapshot, cost_snapshot_missing
  ) VALUES (
    v_casino, _item_id, -_qty, _reason, v_user,
    v_business_date, 'pos_waste', NULL, _item_id,
    jsonb_build_object('notes', _notes),
    v_unit_cost,
    _qty * v_unit_cost,
    v_cost_missing
  )
  RETURNING id INTO v_movement_id;

  IF v_cost_missing THEN
    INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
    VALUES (v_casino, 'system', 'pos_cost_snapshot_missing',
      jsonb_build_object(
        'movement_id', v_movement_id,
        'item_id', _item_id,
        'reason', _reason,
        'notes', _notes
      ),
      v_user);
  END IF;

  RETURN v_movement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_record_waste(uuid, numeric, text, text) TO authenticated;

-- ============================================================
-- 3) pos_backfill_cost_snapshots — manager-triggered only
-- ============================================================

CREATE OR REPLACE FUNCTION public.pos_backfill_cost_snapshots(
  _casino_id uuid,
  _from_date date DEFAULT NULL,
  _to_date date DEFAULT NULL,
  _dry_run boolean DEFAULT true
)
RETURNS TABLE (
  movement_id uuid,
  item_id uuid,
  old_unit_cost numeric,
  new_unit_cost numeric,
  old_cost_tzs numeric,
  new_cost_tzs numeric,
  backfilled boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_rec RECORD;
  v_unit_cost numeric;
  v_cost_tzs numeric;
  v_cost_missing boolean;
  v_count integer := 0;
BEGIN
  -- Role gate: manager-tier only
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = v_user
       AND ur.role IN ('manager','finance_manager','super_admin','pos_manager')
  ) THEN
    RAISE EXCEPTION 'forbidden: pos_backfill_cost_snapshots requires manager-tier role';
  END IF;

  FOR v_rec IN
    SELECT m.id AS mov_id, m.item_id AS it_id, m.delta, m.cost_tzs_snapshot, m.unit_cost_tzs_snapshot, m.cost_snapshot_missing
      FROM public.pos_inventory_movements m
     WHERE m.casino_id = _casino_id
       AND (m.cost_tzs_snapshot IS NULL OR m.unit_cost_tzs_snapshot IS NULL)
       AND (_from_date IS NULL OR m.business_date >= _from_date)
       AND (_to_date IS NULL OR m.business_date <= _to_date)
     ORDER BY m.created_at
  LOOP
    SELECT COALESCE(avg_cost_tzs, 0) INTO v_unit_cost
      FROM public.pos_menu_items WHERE id = v_rec.it_id;

    v_cost_missing := (v_unit_cost = 0);
    v_cost_tzs := ABS(v_rec.delta) * v_unit_cost;

    movement_id := v_rec.mov_id;
    item_id := v_rec.it_id;
    old_unit_cost := v_rec.unit_cost_tzs_snapshot;
    new_unit_cost := v_unit_cost;
    old_cost_tzs := v_rec.cost_tzs_snapshot;
    new_cost_tzs := v_cost_tzs;
    backfilled := NOT _dry_run;

    IF NOT _dry_run THEN
      UPDATE public.pos_inventory_movements
         SET unit_cost_tzs_snapshot = v_unit_cost,
             cost_tzs_snapshot = v_cost_tzs,
             cost_snapshot_missing = v_cost_missing
       WHERE id = v_rec.mov_id;
    END IF;

    v_count := v_count + 1;
    RETURN NEXT;
  END LOOP;

  IF _dry_run THEN
    RAISE NOTICE 'pos_backfill_cost_snapshots dry-run: % rows would be updated', v_count;
  ELSE
    RAISE NOTICE 'pos_backfill_cost_snapshots applied: % rows updated', v_count;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_backfill_cost_snapshots(uuid, date, date, boolean) TO authenticated;

-- ============================================================
-- 4) Update pos_cogs_report to include waste reasons
-- ============================================================

DROP FUNCTION IF EXISTS public.pos_cogs_report(uuid, date, date, uuid, text);

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
  movement_count bigint,
  cost_cash_tzs numeric,
  cost_card_tzs numeric,
  cost_comp_player_tzs numeric,
  cost_comp_house_tzs numeric,
  cost_player_charge_tzs numeric,
  cost_voided_tzs numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_gb text := lower(COALESCE(_group_by,'sellable_item'));
  v_uid uuid := auth.uid();
BEGIN
  IF v_gb NOT IN ('sellable_item','ingredient','location','day','payment_method','shift') THEN
    RAISE EXCEPTION 'invalid group_by: %', _group_by;
  END IF;

  -- Role gate
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = v_uid
       AND ur.role IN ('manager','finance_manager','super_admin','pos_manager')
  ) THEN
    RAISE EXCEPTION 'forbidden: pos_cogs_report requires manager-tier role';
  END IF;

  RETURN QUERY
  WITH mov AS (
    SELECT
      m.*,
      o.pos_location_id        AS order_location_id,
      o.shift_id               AS order_shift_id,
      o.tab_id                 AS order_tab_id,
      COALESCE(o.total_tzs, 0) AS order_total,
      t.total_tzs              AS tab_total,
      t.payment_split          AS tab_split
    FROM public.pos_inventory_movements m
    LEFT JOIN public.pos_orders o
      ON o.id = m.reference_id AND m.reference_type = 'pos_order'
    LEFT JOIN public.pos_tabs t
      ON t.id = o.tab_id
    WHERE m.casino_id = _casino_id
      AND m.business_date BETWEEN _from_date AND _to_date
      AND m.reason IN (
        'sale','pos_recipe_consumption',
        'order_void_reversal','pos_recipe_reversal',
        'waste','spoilage','staff_consumption','damage','tasting'
      )
      AND (_pos_location_id IS NULL OR o.pos_location_id = _pos_location_id)
  ),
  mov_alloc AS (
    SELECT
      m.*,
      CASE
        WHEN m.tab_total IS NULL OR m.tab_total = 0 THEN 0
        ELSE COALESCE((m.tab_split->>'cash')::numeric, 0) / m.tab_total
      END AS w_cash,
      CASE
        WHEN m.tab_total IS NULL OR m.tab_total = 0 THEN 0
        ELSE COALESCE((m.tab_split->>'card')::numeric, 0) / m.tab_total
      END AS w_card,
      CASE
        WHEN m.tab_total IS NULL OR m.tab_total = 0 THEN 0
        ELSE COALESCE((m.tab_split->>'comp_player')::numeric, 0) / m.tab_total
      END AS w_comp_player,
      CASE
        WHEN m.tab_total IS NULL OR m.tab_total = 0 THEN 0
        ELSE COALESCE((m.tab_split->>'comp_house')::numeric, 0) / m.tab_total
      END AS w_comp_house,
      CASE
        WHEN m.tab_total IS NULL OR m.tab_total = 0 THEN 0
        ELSE COALESCE((m.tab_split->>'player_charge')::numeric, 0) / m.tab_total
      END AS w_pc
    FROM mov m
  ),
  mov_agg AS (
    SELECT
      CASE v_gb
        WHEN 'sellable_item'  THEN COALESCE(m.source_item_id::text, m.item_id::text)
        WHEN 'ingredient'     THEN m.item_id::text
        WHEN 'location'       THEN COALESCE(m.order_location_id::text, '__none__')
        WHEN 'day'            THEN to_char(m.business_date, 'YYYY-MM-DD')
        WHEN 'shift'          THEN COALESCE(m.order_shift_id::text, '__none__')
        WHEN 'payment_method' THEN '__all__'
      END AS group_key,
      SUM(CASE WHEN m.reason IN ('sale','pos_recipe_consumption','waste','spoilage','staff_consumption','damage','tasting')
               THEN ABS(m.delta)
               WHEN m.reason IN ('order_void_reversal','pos_recipe_reversal') THEN -ABS(m.delta)
               ELSE 0 END) AS units_consumed,
      SUM(COALESCE(m.cost_tzs_snapshot, 0)) AS cogs_tzs,
      COUNT(*) FILTER (WHERE m.cost_snapshot_missing OR m.cost_tzs_snapshot IS NULL) AS uncosted_movement_count,
      COUNT(*) AS movement_count,
      SUM(COALESCE(m.cost_tzs_snapshot,0) * m.w_cash)        AS cost_cash_tzs,
      SUM(COALESCE(m.cost_tzs_snapshot,0) * m.w_card)        AS cost_card_tzs,
      SUM(COALESCE(m.cost_tzs_snapshot,0) * m.w_comp_player) AS cost_comp_player_tzs,
      SUM(COALESCE(m.cost_tzs_snapshot,0) * m.w_comp_house)  AS cost_comp_house_tzs,
      SUM(COALESCE(m.cost_tzs_snapshot,0) * m.w_pc)          AS cost_player_charge_tzs,
      SUM(CASE WHEN m.reason IN ('order_void_reversal','pos_recipe_reversal')
               THEN ABS(COALESCE(m.cost_tzs_snapshot,0)) ELSE 0 END) AS cost_voided_tzs
    FROM mov_alloc m
    GROUP BY 1
  ),
  orders_in_range AS (
    SELECT o.id, o.pos_location_id, o.business_date, o.status, o.shift_id, o.total_tzs
      FROM public.pos_orders o
     WHERE o.casino_id = _casino_id
       AND o.business_date BETWEEN _from_date AND _to_date
       AND (_pos_location_id IS NULL OR o.pos_location_id = _pos_location_id)
       AND o.status <> 'void'
  ),
  sales_agg AS (
    SELECT
      CASE v_gb
        WHEN 'sellable_item'  THEN oi.item_id::text
        WHEN 'ingredient'     THEN NULL
        WHEN 'location'       THEN COALESCE(o.pos_location_id::text, '__none__')
        WHEN 'day'            THEN to_char(o.business_date, 'YYYY-MM-DD')
        WHEN 'shift'          THEN COALESCE(o.shift_id::text, '__none__')
        WHEN 'payment_method' THEN '__all__'
      END AS group_key,
      SUM(COALESCE(oi.line_total_tzs, 0)) AS gross_sales_tzs
    FROM orders_in_range o
    JOIN public.pos_order_items oi ON oi.order_id = o.id
    GROUP BY 1
  ),
  joined AS (
    SELECT
      COALESCE(m.group_key, s.group_key) AS group_key,
      COALESCE(m.units_consumed, 0)            AS units_consumed,
      COALESCE(m.cogs_tzs, 0)                  AS cogs_tzs,
      COALESCE(s.gross_sales_tzs, 0)           AS gross_sales_tzs,
      COALESCE(m.uncosted_movement_count, 0)   AS uncosted_movement_count,
      COALESCE(m.movement_count, 0)            AS movement_count,
      COALESCE(m.cost_cash_tzs, 0)             AS cost_cash_tzs,
      COALESCE(m.cost_card_tzs, 0)             AS cost_card_tzs,
      COALESCE(m.cost_comp_player_tzs, 0)      AS cost_comp_player_tzs,
      COALESCE(m.cost_comp_house_tzs, 0)       AS cost_comp_house_tzs,
      COALESCE(m.cost_player_charge_tzs, 0)    AS cost_player_charge_tzs,
      COALESCE(m.cost_voided_tzs, 0)           AS cost_voided_tzs
    FROM mov_agg m
    FULL OUTER JOIN sales_agg s ON s.group_key = m.group_key
  )
  -- Branch: payment_method explodes the single aggregate into 5 buckets
  SELECT * FROM (
    SELECT
      pb.k AS group_key,
      pb.lbl AS group_label,
      'payment_method'::text AS group_type,
      0::numeric AS units_consumed,
      pb.amt AS cogs_tzs,
      0::numeric AS gross_sales_tzs,
      -pb.amt AS gross_margin_tzs,
      NULL::numeric AS gross_margin_pct,
      0::bigint AS uncosted_movement_count,
      0::bigint AS movement_count,
      CASE WHEN pb.k='cash' THEN pb.amt ELSE 0 END AS cost_cash_tzs,
      CASE WHEN pb.k='card' THEN pb.amt ELSE 0 END AS cost_card_tzs,
      CASE WHEN pb.k='comp_player' THEN pb.amt ELSE 0 END AS cost_comp_player_tzs,
      CASE WHEN pb.k='comp_house' THEN pb.amt ELSE 0 END AS cost_comp_house_tzs,
      CASE WHEN pb.k='player_charge' THEN pb.amt ELSE 0 END AS cost_player_charge_tzs,
      0::numeric AS cost_voided_tzs
    FROM joined j
    CROSS JOIN LATERAL (VALUES
      ('cash',          'Cash',                       j.cost_cash_tzs),
      ('card',          'Card',                       j.cost_card_tzs),
      ('comp_player',   'Comps (player wallet)',      j.cost_comp_player_tzs),
      ('comp_house',    'Complimentary (house)',      j.cost_comp_house_tzs),
      ('player_charge', 'Player charge',              j.cost_player_charge_tzs)
    ) AS pb(k,lbl,amt)
    WHERE v_gb = 'payment_method'
  ) pm
  UNION ALL
  SELECT
    j.group_key,
    CASE v_gb
      WHEN 'sellable_item' THEN COALESCE(mi.name, '(unknown item)')
      WHEN 'ingredient'    THEN COALESCE(mi.name, '(unknown ingredient)')
      WHEN 'location'      THEN COALESCE(loc.name, CASE WHEN j.group_key='__none__' THEN '(no location)' ELSE '(unknown)' END)
      WHEN 'day'           THEN j.group_key
      WHEN 'shift'         THEN CASE WHEN j.group_key='__none__' THEN '(no shift)' ELSE 'Shift ' || left(j.group_key, 8) END
      ELSE j.group_key
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
    j.movement_count,
    j.cost_cash_tzs,
    j.cost_card_tzs,
    j.cost_comp_player_tzs,
    j.cost_comp_house_tzs,
    j.cost_player_charge_tzs,
    j.cost_voided_tzs
  FROM joined j
  LEFT JOIN public.pos_menu_items mi
    ON v_gb IN ('sellable_item','ingredient')
   AND mi.id::text = j.group_key
  LEFT JOIN public.pos_locations loc
    ON v_gb = 'location'
   AND loc.id::text = j.group_key
  WHERE v_gb <> 'payment_method'
  ORDER BY 5 DESC NULLS LAST;
END $$;

GRANT EXECUTE ON FUNCTION public.pos_cogs_report(uuid, date, date, uuid, text) TO authenticated;
