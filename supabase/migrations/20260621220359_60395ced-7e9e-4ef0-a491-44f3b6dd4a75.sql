
-- ============================================================================
-- POS Phase 3A — Locations, Modifiers, Recipes (foundation)
-- Additive only. Phase 1 stock lifecycle and Phase 2 guards unchanged.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. pos_locations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id   uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  name        text NOT NULL,
  type        text NOT NULL DEFAULT 'bar' CHECK (type IN ('bar','coffee','vip_service','other')),
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_locations TO authenticated;
GRANT ALL ON public.pos_locations TO service_role;
ALTER TABLE public.pos_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY pos_locations_select ON public.pos_locations FOR SELECT TO authenticated
  USING (user_can_see_casino(auth.uid(), casino_id) AND (
    has_any_pos_role(auth.uid())
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'pit'::app_role)
  ));
CREATE POLICY pos_locations_write ON public.pos_locations FOR ALL TO authenticated
  USING (user_can_see_casino(auth.uid(), casino_id) AND (
    has_role(auth.uid(), 'pos_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)
  ))
  WITH CHECK (user_can_see_casino(auth.uid(), casino_id) AND (
    has_role(auth.uid(), 'pos_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)
  ));

-- ---------------------------------------------------------------------------
-- 2. pos_modifiers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_modifiers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id       uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  name            text NOT NULL,
  price_tzs_delta bigint NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_modifiers TO authenticated;
GRANT ALL ON public.pos_modifiers TO service_role;
ALTER TABLE public.pos_modifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY pos_modifiers_select ON public.pos_modifiers FOR SELECT TO authenticated
  USING (user_can_see_casino(auth.uid(), casino_id) AND (
    has_any_pos_role(auth.uid())
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  ));
CREATE POLICY pos_modifiers_write ON public.pos_modifiers FOR ALL TO authenticated
  USING (user_can_see_casino(auth.uid(), casino_id) AND (
    has_role(auth.uid(), 'pos_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)
  ))
  WITH CHECK (user_can_see_casino(auth.uid(), casino_id) AND (
    has_role(auth.uid(), 'pos_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)
  ));

-- ---------------------------------------------------------------------------
-- 3. pos_order_item_modifiers (snapshot-safe)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_order_item_modifiers (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id            uuid NOT NULL REFERENCES public.pos_order_items(id) ON DELETE CASCADE,
  modifier_id              uuid REFERENCES public.pos_modifiers(id) ON DELETE SET NULL,
  modifier_name_snapshot   text NOT NULL,
  price_tzs_delta_snapshot bigint NOT NULL DEFAULT 0,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_order_item_modifiers_oi_idx ON public.pos_order_item_modifiers(order_item_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_order_item_modifiers TO authenticated;
GRANT ALL ON public.pos_order_item_modifiers TO service_role;
ALTER TABLE public.pos_order_item_modifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY pos_oim_select ON public.pos_order_item_modifiers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pos_order_items oi
    JOIN public.pos_orders o ON o.id = oi.order_id
    WHERE oi.id = pos_order_item_modifiers.order_item_id
      AND user_can_see_casino(auth.uid(), o.casino_id)
  ));
CREATE POLICY pos_oim_write ON public.pos_order_item_modifiers FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pos_order_items oi
    JOIN public.pos_orders o ON o.id = oi.order_id
    WHERE oi.id = pos_order_item_modifiers.order_item_id
      AND user_can_see_casino(auth.uid(), o.casino_id)
      AND (has_any_pos_role(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pos_order_items oi
    JOIN public.pos_orders o ON o.id = oi.order_id
    WHERE oi.id = pos_order_item_modifiers.order_item_id
      AND user_can_see_casino(auth.uid(), o.casino_id)
      AND (has_any_pos_role(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))
  ));

-- ---------------------------------------------------------------------------
-- 4. pos_recipes + pos_recipe_items  (INERT in 3A — tables + UI only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pos_recipes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id        uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  sellable_item_id uuid NOT NULL REFERENCES public.pos_menu_items(id) ON DELETE CASCADE,
  name             text NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pos_recipes_active_unique
  ON public.pos_recipes(casino_id, sellable_item_id) WHERE is_active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_recipes TO authenticated;
GRANT ALL ON public.pos_recipes TO service_role;
ALTER TABLE public.pos_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY pos_recipes_select ON public.pos_recipes FOR SELECT TO authenticated
  USING (user_can_see_casino(auth.uid(), casino_id) AND (
    has_any_pos_role(auth.uid()) OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  ));
CREATE POLICY pos_recipes_write ON public.pos_recipes FOR ALL TO authenticated
  USING (user_can_see_casino(auth.uid(), casino_id) AND (
    has_role(auth.uid(), 'pos_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)
  ))
  WITH CHECK (user_can_see_casino(auth.uid(), casino_id) AND (
    has_role(auth.uid(), 'pos_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role)
  ));

CREATE TABLE IF NOT EXISTS public.pos_recipe_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id           uuid NOT NULL REFERENCES public.pos_recipes(id) ON DELETE CASCADE,
  ingredient_item_id  uuid NOT NULL REFERENCES public.pos_menu_items(id) ON DELETE RESTRICT,
  quantity            numeric NOT NULL CHECK (quantity > 0),
  unit                text,
  waste_percent       numeric NOT NULL DEFAULT 0 CHECK (waste_percent >= 0 AND waste_percent <= 100),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_recipe_items_recipe_idx ON public.pos_recipe_items(recipe_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_recipe_items TO authenticated;
GRANT ALL ON public.pos_recipe_items TO service_role;
ALTER TABLE public.pos_recipe_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY pos_recipe_items_select ON public.pos_recipe_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pos_recipes r
    WHERE r.id = pos_recipe_items.recipe_id
      AND user_can_see_casino(auth.uid(), r.casino_id)
  ));
CREATE POLICY pos_recipe_items_write ON public.pos_recipe_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.pos_recipes r
    WHERE r.id = pos_recipe_items.recipe_id
      AND user_can_see_casino(auth.uid(), r.casino_id)
      AND (has_role(auth.uid(), 'pos_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pos_recipes r
    WHERE r.id = pos_recipe_items.recipe_id
      AND user_can_see_casino(auth.uid(), r.casino_id)
      AND (has_role(auth.uid(), 'pos_manager'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  ));

-- ---------------------------------------------------------------------------
-- 5. Location columns on pos_tabs / pos_orders / pos_shifts (all nullable)
-- ---------------------------------------------------------------------------
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS pos_location_id uuid REFERENCES public.pos_locations(id);
ALTER TABLE public.pos_tabs   ADD COLUMN IF NOT EXISTS pos_location_id uuid REFERENCES public.pos_locations(id);
ALTER TABLE public.pos_shifts ADD COLUMN IF NOT EXISTS pos_location_id uuid REFERENCES public.pos_locations(id);

CREATE INDEX IF NOT EXISTS pos_orders_location_idx ON public.pos_orders(pos_location_id);
CREATE INDEX IF NOT EXISTS pos_tabs_location_idx   ON public.pos_tabs(pos_location_id);

-- ---------------------------------------------------------------------------
-- 6. Default "Main Bar" for every casino (Correction 5)
-- ---------------------------------------------------------------------------
INSERT INTO public.pos_locations (casino_id, name, type, sort_order)
SELECT c.id, 'Main Bar', 'bar', 0 FROM public.casinos c
ON CONFLICT (casino_id, name) DO NOTHING;

-- Helper RPC
CREATE OR REPLACE FUNCTION public.pos_get_or_create_default_location(_casino_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.pos_locations
   WHERE casino_id = _casino_id AND name = 'Main Bar' LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.pos_locations (casino_id, name, type, sort_order)
    VALUES (_casino_id, 'Main Bar', 'bar', 0)
    ON CONFLICT (casino_id, name) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.pos_get_or_create_default_location(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Location inheritance triggers (Correction 4)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pos_tabs_set_location()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pos_location_id IS NULL THEN
    NEW.pos_location_id := public.pos_get_or_create_default_location(NEW.casino_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pos_tabs_set_location ON public.pos_tabs;
CREATE TRIGGER trg_pos_tabs_set_location
  BEFORE INSERT ON public.pos_tabs
  FOR EACH ROW EXECUTE FUNCTION public.pos_tabs_set_location();

CREATE OR REPLACE FUNCTION public.pos_orders_set_location()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.pos_location_id IS NULL AND NEW.tab_id IS NOT NULL THEN
    SELECT pos_location_id INTO NEW.pos_location_id
      FROM public.pos_tabs WHERE id = NEW.tab_id;
  END IF;
  IF NEW.pos_location_id IS NULL THEN
    NEW.pos_location_id := public.pos_get_or_create_default_location(NEW.casino_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pos_orders_set_location ON public.pos_orders;
CREATE TRIGGER trg_pos_orders_set_location
  BEFORE INSERT ON public.pos_orders
  FOR EACH ROW EXECUTE FUNCTION public.pos_orders_set_location();

-- ---------------------------------------------------------------------------
-- 8. Immutability wrapper — allow trusted line_total recompute (Correction 3)
-- ---------------------------------------------------------------------------
-- Replace pos_order_items_immutable so it permits an UPDATE that:
--   (a) is fired with GUC pos.system_recompute='on' AND
--   (b) changes only line_total_tzs (every other column unchanged).
-- Normal users still see "pos_order_items is immutable". DELETE still blocked.
CREATE OR REPLACE FUNCTION public.pos_order_items_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'pos_order_items is immutable';
  END IF;
  -- UPDATE path
  IF current_setting('pos.system_recompute', true) = 'on'
     AND NEW.id            IS NOT DISTINCT FROM OLD.id
     AND NEW.order_id      IS NOT DISTINCT FROM OLD.order_id
     AND NEW.item_id       IS NOT DISTINCT FROM OLD.item_id
     AND NEW.item_name     IS NOT DISTINCT FROM OLD.item_name
     AND NEW.qty           IS NOT DISTINCT FROM OLD.qty
     AND NEW.unit_price_tzs IS NOT DISTINCT FROM OLD.unit_price_tzs THEN
    RETURN NEW;  -- only line_total_tzs may differ
  END IF;
  RAISE EXCEPTION 'pos_order_items is immutable';
END $$;

-- ---------------------------------------------------------------------------
-- 9. Modifier guard — pending-only edit window (Correction 2)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pos_order_item_modifiers_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text; v_tab_closed timestamptz; v_oi uuid;
BEGIN
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
END $$;

DROP TRIGGER IF EXISTS trg_pos_oim_guard ON public.pos_order_item_modifiers;
CREATE TRIGGER trg_pos_oim_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.pos_order_item_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.pos_order_item_modifiers_guard();

-- ---------------------------------------------------------------------------
-- 10. Recompute line_total when modifiers change (Correction 1, per-unit)
--     line_total = (unit_price + Σ delta) * qty
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pos_order_item_modifiers_recompute()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_oi uuid; v_unit bigint; v_qty numeric; v_sum bigint;
BEGIN
  v_oi := COALESCE(NEW.order_item_id, OLD.order_item_id);
  SELECT unit_price_tzs, qty INTO v_unit, v_qty
    FROM public.pos_order_items WHERE id = v_oi;
  IF v_unit IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE(SUM(price_tzs_delta_snapshot),0) INTO v_sum
    FROM public.pos_order_item_modifiers WHERE order_item_id = v_oi;

  PERFORM set_config('pos.system_recompute','on', true);
  UPDATE public.pos_order_items
     SET line_total_tzs = (v_unit + v_sum) * v_qty
   WHERE id = v_oi;
  PERFORM set_config('pos.system_recompute','', true);

  -- Cascade to order total via existing pattern
  PERFORM set_config('pos.internal','on', true);
  UPDATE public.pos_orders
     SET total_tzs = COALESCE((SELECT SUM(line_total_tzs) FROM public.pos_order_items WHERE order_id = o.id), 0)
    FROM (SELECT order_id FROM public.pos_order_items WHERE id = v_oi) o
   WHERE pos_orders.id = o.order_id;
  PERFORM set_config('pos.internal','', true);

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_pos_oim_recompute ON public.pos_order_item_modifiers;
CREATE TRIGGER trg_pos_oim_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.pos_order_item_modifiers
  FOR EACH ROW EXECUTE FUNCTION public.pos_order_item_modifiers_recompute();
