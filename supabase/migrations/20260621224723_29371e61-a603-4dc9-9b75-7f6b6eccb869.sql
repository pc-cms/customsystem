
-- Phase 3C-2: Bottleneck Ingredient Availability

-- Summary view: one row per active sellable menu item, with availability status.
-- security_invoker=true → underlying RLS on pos_menu_items / pos_recipes / pos_recipe_items applies.
CREATE OR REPLACE VIEW public.v_pos_item_availability
WITH (security_invoker = true) AS
WITH active_recipe AS (
  SELECT DISTINCT ON (r.sellable_item_id)
    r.id            AS recipe_id,
    r.sellable_item_id,
    r.casino_id
  FROM public.pos_recipes r
  WHERE r.is_active = true
  ORDER BY r.sellable_item_id, r.updated_at DESC, r.created_at DESC
),
ingr AS (
  SELECT
    ar.sellable_item_id,
    ar.recipe_id,
    ri.ingredient_item_id,
    ing.name        AS ingredient_name,
    ing.stock_qty   AS ingredient_stock,
    ri.quantity,
    COALESCE(ri.waste_percent, 0) AS waste_percent,
    (ri.quantity * (1 + COALESCE(ri.waste_percent, 0) / 100.0)) AS required_per_portion,
    CASE
      WHEN ing.stock_qty IS NULL THEN NULL
      WHEN (ri.quantity * (1 + COALESCE(ri.waste_percent, 0) / 100.0)) <= 0 THEN NULL
      ELSE floor(ing.stock_qty / (ri.quantity * (1 + COALESCE(ri.waste_percent, 0) / 100.0)))
    END AS portions_for_ingredient
  FROM active_recipe ar
  JOIN public.pos_recipe_items ri ON ri.recipe_id = ar.recipe_id
  LEFT JOIN public.pos_menu_items ing ON ing.id = ri.ingredient_item_id
),
agg AS (
  SELECT
    sellable_item_id,
    recipe_id,
    count(*)                                          AS ingredient_count,
    bool_or(ingredient_stock IS NULL)                 AS any_null,
    bool_or(ingredient_stock < 0)                     AS any_negative,
    bool_or(required_per_portion <= 0)                AS any_bad_qty,
    min(portions_for_ingredient)                      AS min_portions
  FROM ingr
  GROUP BY sellable_item_id, recipe_id
),
bn AS (
  SELECT DISTINCT ON (i.sellable_item_id)
    i.sellable_item_id,
    i.ingredient_item_id    AS bottleneck_ingredient_id,
    i.ingredient_name       AS bottleneck_ingredient_name,
    i.ingredient_stock      AS bottleneck_remaining,
    i.portions_for_ingredient AS bottleneck_portions
  FROM ingr i
  WHERE i.portions_for_ingredient IS NOT NULL
  ORDER BY i.sellable_item_id, i.portions_for_ingredient ASC, i.ingredient_name ASC
)
SELECT
  mi.id           AS sellable_item_id,
  mi.casino_id,
  mi.name         AS item_name,
  (ar.recipe_id IS NOT NULL) AS has_recipe,
  mi.stock_qty    AS sellable_stock_qty,
  COALESCE(mi.low_threshold, 0) AS low_threshold,
  CASE
    WHEN ar.recipe_id IS NULL THEN NULL
    WHEN COALESCE(a.ingredient_count, 0) = 0 THEN NULL
    WHEN a.any_null THEN NULL
    ELSE a.min_portions
  END AS portions_available,
  bn.bottleneck_ingredient_id,
  bn.bottleneck_ingredient_name,
  bn.bottleneck_remaining,
  (ar.recipe_id IS NOT NULL AND COALESCE(a.ingredient_count, 0) = 0) AS empty_recipe,
  CASE
    -- A. No active recipe → legacy direct
    WHEN ar.recipe_id IS NULL THEN
      CASE
        WHEN mi.stock_qty IS NULL                            THEN 'untracked'
        WHEN mi.stock_qty < 0                                THEN 'negative'
        WHEN mi.stock_qty = 0                                THEN 'out'
        WHEN mi.stock_qty <= COALESCE(mi.low_threshold, 0)   THEN 'low'
        ELSE 'ok'
      END
    -- C. Active recipe but zero ingredients
    WHEN COALESCE(a.ingredient_count, 0) = 0 THEN
      CASE
        WHEN mi.stock_qty IS NULL                            THEN 'config_error'
        WHEN mi.stock_qty < 0                                THEN 'negative'
        WHEN mi.stock_qty = 0                                THEN 'out'
        WHEN mi.stock_qty <= COALESCE(mi.low_threshold, 0)   THEN 'low'
        ELSE 'ok'
      END
    -- B. Active recipe with ingredients
    ELSE
      CASE
        WHEN a.any_bad_qty                                   THEN 'config_error'
        WHEN a.any_null                                      THEN 'untracked'
        WHEN a.any_negative                                  THEN 'negative'
        WHEN a.min_portions IS NULL                          THEN 'untracked'
        WHEN a.min_portions <= 0                             THEN 'out'
        WHEN a.min_portions <= COALESCE(mi.low_threshold, 0) THEN 'low'
        ELSE 'ok'
      END
  END AS status
FROM public.pos_menu_items mi
LEFT JOIN active_recipe ar ON ar.sellable_item_id = mi.id
LEFT JOIN agg a            ON a.sellable_item_id  = mi.id
LEFT JOIN bn               ON bn.sellable_item_id = mi.id
WHERE mi.is_active = true;

GRANT SELECT ON public.v_pos_item_availability TO authenticated;

-- Manager-only detailed RPC: ingredient breakdown for one sellable item.
CREATE OR REPLACE FUNCTION public.pos_item_availability_detail(item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_casino uuid;
  v_recipe_id uuid;
  v_allowed boolean;
  v_summary jsonb;
  v_ingredients jsonb;
  v_bottleneck_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT mi.casino_id INTO v_casino
  FROM public.pos_menu_items mi
  WHERE mi.id = item_id;

  IF v_casino IS NULL THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND';
  END IF;

  -- Authorization: pos_manager / super_admin / manager / floor_manager / surveillance with access to this casino
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.role IN ('pos_manager','super_admin','manager','floor_manager','surveillance','finance_manager')
  )
  AND (
    public.has_role(v_uid, 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.user_casino_access uca
      WHERE uca.user_id = v_uid AND uca.casino_id = v_casino
    )
  )
  INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- Pick latest active recipe
  SELECT r.id INTO v_recipe_id
  FROM public.pos_recipes r
  WHERE r.sellable_item_id = item_id AND r.is_active = true
  ORDER BY r.updated_at DESC, r.created_at DESC
  LIMIT 1;

  -- Summary row from view
  SELECT to_jsonb(v) INTO v_summary
  FROM public.v_pos_item_availability v
  WHERE v.sellable_item_id = item_id;

  v_bottleneck_id := (v_summary->>'bottleneck_ingredient_id')::uuid;

  IF v_recipe_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'ingredient_item_id', ri.ingredient_item_id,
      'ingredient_name',    ing.name,
      'quantity',           ri.quantity,
      'unit',               ri.unit,
      'waste_percent',      COALESCE(ri.waste_percent, 0),
      'required_per_portion', ri.quantity * (1 + COALESCE(ri.waste_percent, 0)/100.0),
      'ingredient_stock_qty', ing.stock_qty,
      'portions_for_ingredient',
        CASE
          WHEN ing.stock_qty IS NULL THEN NULL
          WHEN ri.quantity * (1 + COALESCE(ri.waste_percent,0)/100.0) <= 0 THEN NULL
          ELSE floor(ing.stock_qty / (ri.quantity * (1 + COALESCE(ri.waste_percent,0)/100.0)))
        END,
      'is_bottleneck',      (ri.ingredient_item_id = v_bottleneck_id)
    ) ORDER BY ing.name), '[]'::jsonb)
    INTO v_ingredients
    FROM public.pos_recipe_items ri
    LEFT JOIN public.pos_menu_items ing ON ing.id = ri.ingredient_item_id
    WHERE ri.recipe_id = v_recipe_id;
  ELSE
    v_ingredients := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'summary', COALESCE(v_summary, '{}'::jsonb),
    'recipe_id', v_recipe_id,
    'ingredients', v_ingredients
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_item_availability_detail(uuid) TO authenticated;
