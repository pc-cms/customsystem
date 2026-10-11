-- Finance Manager may add/update tables and table floats in own casino
CREATE POLICY "Finance managers insert tables" ON public.gaming_tables FOR INSERT TO authenticated
  WITH CHECK (has_casino_scope(auth.uid(), casino_id) AND has_role(auth.uid(),'finance_manager'));
CREATE POLICY "Finance managers update tables" ON public.gaming_tables FOR UPDATE TO authenticated
  USING (has_casino_scope(auth.uid(), casino_id) AND has_role(auth.uid(),'finance_manager'))
  WITH CHECK (has_casino_scope(auth.uid(), casino_id) AND has_role(auth.uid(),'finance_manager'));
CREATE POLICY "Finance managers insert chip baseline" ON public.chip_baseline FOR INSERT TO authenticated
  WITH CHECK (has_casino_scope(auth.uid(), casino_id) AND has_role(auth.uid(),'finance_manager'));
CREATE POLICY "Finance managers update chip baseline" ON public.chip_baseline FOR UPDATE TO authenticated
  USING (has_casino_scope(auth.uid(), casino_id) AND has_role(auth.uid(),'finance_manager'))
  WITH CHECK (has_casino_scope(auth.uid(), casino_id) AND has_role(auth.uid(),'finance_manager'));

-- Table float can change only while the table is closed (before Pit opens tables)
CREATE OR REPLACE FUNCTION public.tg_chip_baseline_table_closed_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.location_type = 'table' AND NEW.location_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM gaming_tables t WHERE t.id = NEW.location_id AND t.status = 'open')
     AND (TG_OP = 'INSERT' OR NEW.expected_quantity IS DISTINCT FROM OLD.expected_quantity) THEN
    RAISE EXCEPTION 'Table float can only be changed before tables are opened';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_chip_baseline_table_closed_guard BEFORE INSERT OR UPDATE ON public.chip_baseline
  FOR EACH ROW EXECUTE FUNCTION public.tg_chip_baseline_table_closed_guard();

-- Audit log for baseline changes and table add/activate/deactivate/rename
CREATE OR REPLACE FUNCTION public.tg_log_chip_baseline_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
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
CREATE TRIGGER trg_log_chip_baseline_change AFTER INSERT OR UPDATE ON public.chip_baseline
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_chip_baseline_change();

CREATE OR REPLACE FUNCTION public.tg_log_gaming_table_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO activity_logs(casino_id, category, action, details, operator_id)
    VALUES (NEW.casino_id, 'system', 'TABLE_ADDED', jsonb_build_object('table_id', NEW.id, 'name', NEW.name, 'game', NEW.game), auth.uid());
  ELSIF NEW.is_archived IS DISTINCT FROM OLD.is_archived THEN
    INSERT INTO activity_logs(casino_id, category, action, details, operator_id)
    VALUES (NEW.casino_id, 'system', CASE WHEN NEW.is_archived THEN 'TABLE_DEACTIVATED' ELSE 'TABLE_ACTIVATED' END,
      jsonb_build_object('table_id', NEW.id, 'name', NEW.name), auth.uid());
  ELSIF NEW.name IS DISTINCT FROM OLD.name THEN
    INSERT INTO activity_logs(casino_id, category, action, details, operator_id)
    VALUES (NEW.casino_id, 'system', 'TABLE_RENAMED', jsonb_build_object('table_id', NEW.id, 'old_name', OLD.name, 'new_name', NEW.name), auth.uid());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_log_gaming_table_admin AFTER INSERT OR UPDATE ON public.gaming_tables
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_gaming_table_admin();

-- Move chips between two closed tables, atomically
CREATE OR REPLACE FUNCTION public.move_table_chips(p_from uuid, p_to uuid, p_chips jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid(); v_casino uuid; v_to_casino uuid; v_from_status text; v_to_status text;
  k text; v_d bigint; v_q bigint; v_have bigint; v_total bigint := 0; v_ref text := gen_random_uuid()::text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_from = p_to THEN RAISE EXCEPTION 'Choose two different tables'; END IF;
  SELECT casino_id, status::text INTO v_casino, v_from_status FROM gaming_tables WHERE id = p_from AND NOT is_archived FOR UPDATE;
  SELECT casino_id, status::text INTO v_to_casino, v_to_status FROM gaming_tables WHERE id = p_to AND NOT is_archived FOR UPDATE;
  IF v_casino IS NULL OR v_to_casino IS NULL THEN RAISE EXCEPTION 'Table not found or inactive'; END IF;
  IF v_casino <> v_to_casino THEN RAISE EXCEPTION 'Tables must be in the same casino'; END IF;
  IF NOT has_casino_scope(v_uid, v_casino) OR NOT (
       has_role(v_uid,'super_admin') OR has_role(v_uid,'manager') OR has_role(v_uid,'finance_manager')) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF v_from_status = 'open' OR v_to_status = 'open' THEN
    RAISE EXCEPTION 'Chips can only be moved before tables are opened';
  END IF;
  PERFORM set_config('cms.move_ref', v_ref, true);
  FOR k IN SELECT jsonb_object_keys(p_chips) LOOP
    v_d := k::bigint; v_q := (p_chips->>k)::bigint;
    IF v_d <= 0 OR v_q < 0 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    CONTINUE WHEN v_q = 0;
    SELECT expected_quantity INTO v_have FROM chip_baseline
      WHERE casino_id=v_casino AND location_type='table' AND location_id=p_from AND denomination=v_d FOR UPDATE;
    IF COALESCE(v_have,0) < v_q THEN RAISE EXCEPTION 'Not enough % chips on source table', v_d; END IF;
    UPDATE chip_baseline SET expected_quantity = expected_quantity - v_q
      WHERE casino_id=v_casino AND location_type='table' AND location_id=p_from AND denomination=v_d;
    INSERT INTO chip_baseline(casino_id, location_type, location_id, denomination, expected_quantity)
      VALUES (v_casino,'table',p_to,v_d,v_q)
      ON CONFLICT (casino_id, location_type, location_id, denomination)
      DO UPDATE SET expected_quantity = chip_baseline.expected_quantity + EXCLUDED.expected_quantity;
    v_total := v_total + v_d*v_q;
  END LOOP;
  IF v_total = 0 THEN RAISE EXCEPTION 'Nothing to move'; END IF;
  INSERT INTO activity_logs(casino_id, category, action, details, operator_id)
  VALUES (v_casino,'system','FLOAT_CHIPS_MOVED', jsonb_build_object('from_table',p_from,'to_table',p_to,'chips',p_chips,'total_tzs',v_total,'move_ref',v_ref), v_uid);
  RETURN jsonb_build_object('total_tzs', v_total);
END $$;
REVOKE ALL ON FUNCTION public.move_table_chips(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_table_chips(uuid,uuid,jsonb) TO authenticated;