-- Phase 3C-3 (revised): reframe COGS as Cost Control report.
-- Adds payment-method cost allocation (proportional to tab payment_split),
-- adds payment_method and shift group_by, and enforces manager-tier role check.

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
  gross_margin_tzs numeric,        -- kept for backward compat, de-emphasized in UI
  gross_margin_pct numeric,        -- kept for backward compat, de-emphasized in UI
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

  -- Role gate: manager-tier only. Cost data is sensitive even if not profit data.
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
      AND m.reason IN ('sale','pos_recipe_consumption','order_void_reversal','pos_recipe_reversal')
      AND (_pos_location_id IS NULL OR o.pos_location_id = _pos_location_id)
  ),
  mov_alloc AS (
    -- Per-movement cost allocation across payment buckets. Tab-level split
    -- is allocated proportionally; orders inside the same tab share the
    -- tab's payment-method mix.
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
        WHEN 'payment_method' THEN '__all__'  -- handled in branch below
      END AS group_key,
      SUM(CASE WHEN m.reason IN ('sale','pos_recipe_consumption') THEN ABS(m.delta)
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
  ORDER BY 5 DESC NULLS LAST;  -- order by cogs_tzs
END $$;

GRANT EXECUTE ON FUNCTION public.pos_cogs_report(uuid, date, date, uuid, text) TO authenticated;