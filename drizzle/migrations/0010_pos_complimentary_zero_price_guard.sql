CREATE OR REPLACE FUNCTION public.pos_order_items_comp_zero()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pos_orders WHERE id = NEW.order_id AND operation_mode = 'complimentary') THEN
    NEW.unit_price_tzs := 0; NEW.line_total_tzs := 0;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pos_order_items_comp_zero ON public.pos_order_items;
CREATE TRIGGER trg_pos_order_items_comp_zero BEFORE INSERT ON public.pos_order_items FOR EACH ROW EXECUTE FUNCTION public.pos_order_items_comp_zero();

CREATE OR REPLACE FUNCTION public.pos_oim_comp_zero()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pos_order_items oi JOIN public.pos_orders o ON o.id = oi.order_id
              WHERE oi.id = NEW.order_item_id AND o.operation_mode = 'complimentary') THEN
    NEW.price_tzs_delta_snapshot := 0;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pos_oim_comp_zero ON public.pos_order_item_modifiers;
CREATE TRIGGER trg_pos_oim_comp_zero BEFORE INSERT ON public.pos_order_item_modifiers FOR EACH ROW EXECUTE FUNCTION public.pos_oim_comp_zero();