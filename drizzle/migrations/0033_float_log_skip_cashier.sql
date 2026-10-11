CREATE OR REPLACE FUNCTION public.tg_log_chip_baseline_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NEW.location_type = 'cashier' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.expected_quantity IS NOT DISTINCT FROM OLD.expected_quantity THEN RETURN NEW; END IF;
  INSERT INTO activity_logs(casino_id, category, action, details, operator_id)
  VALUES (NEW.casino_id, 'system', 'FLOAT_BASELINE_CHANGED', jsonb_build_object(
    'location_type', NEW.location_type, 'location_id', NEW.location_id,
    'table_name', (SELECT name FROM gaming_tables WHERE id = NEW.location_id),
    'denomination', NEW.denomination,
    'old_quantity', CASE WHEN TG_OP='UPDATE' THEN OLD.expected_quantity END,
    'new_quantity', NEW.expected_quantity,
    'move_ref', current_setting('cms.move_ref', true)), auth.uid());
  RETURN NEW;
END $$;