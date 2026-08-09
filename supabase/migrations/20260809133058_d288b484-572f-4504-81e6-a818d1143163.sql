-- 1. Slots write/approve by scope
CREATE OR REPLACE FUNCTION public.cs_can_write(_casino uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.has_casino_scope(auth.uid(), _casino)
     AND (
       public.has_role(auth.uid(),'cashier_slots'::public.app_role)
       OR public.has_role(auth.uid(),'manager'::public.app_role)
       OR public.has_role(auth.uid(),'shift_manager'::public.app_role)
       OR public.has_role(auth.uid(),'general_manager'::public.app_role)
       OR public.has_role(auth.uid(),'finance_manager'::public.app_role)
     )
  OR public.has_role(auth.uid(),'super_admin'::public.app_role)
$function$;

CREATE OR REPLACE FUNCTION public.cs_can_approve(_casino uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.has_casino_scope(auth.uid(), _casino)
     AND (
       public.has_role(auth.uid(),'manager'::public.app_role)
       OR public.has_role(auth.uid(),'shift_manager'::public.app_role)
       OR public.has_role(auth.uid(),'general_manager'::public.app_role)
       OR public.has_role(auth.uid(),'finance_manager'::public.app_role)
     )
  OR public.has_role(auth.uid(),'super_admin'::public.app_role)
$function$;

-- 2. Expense approval by scope
CREATE OR REPLACE FUNCTION public.approve_expense_as_manager(p_expense_id uuid, p_manager_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_expense_casino uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_manager_op(p_manager_id) THEN
    RAISE EXCEPTION 'Provided user is not a manager';
  END IF;
  SELECT casino_id INTO v_expense_casino FROM public.expenses WHERE id = p_expense_id;
  IF v_expense_casino IS NULL THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;
  IF NOT public.has_casino_scope(auth.uid(), v_expense_casino) THEN
    RAISE EXCEPTION 'Casino access denied';
  END IF;
  UPDATE public.expenses
    SET approved = true,
        approved_by = p_manager_id,
        approved_at = now()
    WHERE id = p_expense_id;
END;
$function$;

-- 3. Chip transfer pair: casino from table/player, validated by scope
CREATE OR REPLACE FUNCTION public.create_chip_transfer_pair(_from_player uuid, _to_player uuid, _amount bigint, _table_id uuid DEFAULT NULL::uuid, _chips jsonb DEFAULT NULL::jsonb, _note text DEFAULT ''::text, _casino_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_casino_id uuid;
  v_pair_id uuid := gen_random_uuid();
  v_op uuid := auth.uid();
  v_out_id uuid;
  v_in_id uuid;
BEGIN
  IF v_op IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT (
    public.has_role(v_op, 'pit'::app_role)
    OR public.has_role(v_op, 'manager'::app_role)
    OR public.has_role(v_op, 'shift_manager'::app_role)
    OR public.has_role(v_op, 'general_manager'::app_role)
    OR public.has_role(v_op, 'super_admin'::app_role)
    OR public.has_role(v_op, 'surveillance'::app_role)
  ) THEN
    RAISE EXCEPTION 'Pit, Manager or Surveillance role required';
  END IF;
  IF _from_player = _to_player THEN
    RAISE EXCEPTION 'From and To players must differ';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  v_casino_id := COALESCE(
    _casino_id,
    (SELECT casino_id FROM public.gaming_tables WHERE id = _table_id),
    (SELECT casino_id FROM public.players WHERE id = _from_player),
    public.get_user_casino_id(v_op)
  );
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'Operator has no casino assigned';
  END IF;
  IF NOT public.has_casino_scope(v_op, v_casino_id) THEN
    RAISE EXCEPTION 'Casino access denied';
  END IF;

  INSERT INTO public.chip_transfers
    (casino_id, table_id, pair_id, direction, player_id, counterparty_player_id, amount, chips, note, operator_id)
  VALUES
    (v_casino_id, _table_id, v_pair_id, 'out', _from_player, _to_player, _amount, _chips, _note, v_op)
  RETURNING id INTO v_out_id;

  INSERT INTO public.chip_transfers
    (casino_id, table_id, pair_id, direction, player_id, counterparty_player_id, amount, chips, note, operator_id)
  VALUES
    (v_casino_id, _table_id, v_pair_id, 'in', _to_player, _from_player, _amount, _chips, _note, v_op)
  RETURNING id INTO v_in_id;

  RETURN jsonb_build_object('pair_id', v_pair_id, 'out_id', v_out_id, 'in_id', v_in_id);
END;
$function$;

-- 4. Business-day snapshot edit by scope
CREATE OR REPLACE FUNCTION public.edit_business_day_snapshot(_closure_id uuid, _section text, _patches jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_closure business_day_closures%ROWTYPE;
  v_user uuid;
  v_is_manager boolean;
  v_is_finance boolean;
  v_is_super boolean;
  v_snapshot jsonb;
  v_section_data jsonb;
  v_patch jsonb;
  v_row_index int;
  v_field text;
  v_before jsonb;
  v_after jsonb;
  v_changes_count int := 0;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_is_manager := public.has_role(v_user, 'manager'::app_role) OR public.has_role(v_user, 'general_manager'::app_role);
  v_is_finance := public.has_role(v_user, 'finance_manager'::app_role);
  v_is_super   := public.has_role(v_user, 'super_admin'::app_role);

  IF NOT (v_is_manager OR v_is_finance OR v_is_super) THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  IF _section IN ('cash_counts', 'expenses', 'cashless') THEN
    IF NOT (v_is_finance OR v_is_super) THEN
      RAISE EXCEPTION 'Only Finance Manager or Super Admin can edit financial sections';
    END IF;
  ELSIF _section IN ('table_tracker', 'chip_snapshots', 'breaklist', 'player_stats') THEN
    IF NOT (v_is_manager OR v_is_super) THEN
      RAISE EXCEPTION 'Only Manager or Super Admin can edit Pit sections';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown section: %', _section;
  END IF;

  SELECT * INTO v_closure FROM business_day_closures WHERE id = _closure_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Closure not found';
  END IF;

  IF NOT public.has_casino_scope(v_user, v_closure.casino_id) THEN
    RAISE EXCEPTION 'Casino access denied';
  END IF;

  v_snapshot := COALESCE(v_closure.snapshot, '{}'::jsonb);
  v_section_data := COALESCE(v_snapshot -> _section, '[]'::jsonb);

  FOR v_patch IN SELECT * FROM jsonb_array_elements(_patches)
  LOOP
    v_row_index := (v_patch ->> 'row_index')::int;
    v_field := v_patch ->> 'field';
    v_before := v_patch -> 'before';
    v_after := v_patch -> 'after';

    v_section_data := jsonb_set(v_section_data, ARRAY[v_row_index::text, v_field], v_after, true);

    INSERT INTO activity_logs (casino_id, category, action, operator_id, details)
    VALUES (
      v_closure.casino_id,
      'edit'::log_category,
      'business_day_field_edit',
      v_user,
      jsonb_build_object(
        'closure_id', _closure_id,
        'business_date', v_closure.business_date,
        'section', _section,
        'row_index', v_row_index,
        'field', v_field,
        'before', v_before,
        'after', v_after
      )
    );

    v_changes_count := v_changes_count + 1;
  END LOOP;

  v_snapshot := jsonb_set(v_snapshot, ARRAY[_section], v_section_data, true);

  UPDATE business_day_closures SET snapshot = v_snapshot WHERE id = _closure_id;

  RETURN jsonb_build_object('status', 'ok', 'changes', v_changes_count);
END;
$function$;

-- 5. HR delete employee by scope
CREATE OR REPLACE FUNCTION public.hr_delete_employee(_employee_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _casino uuid;
BEGIN
  SELECT casino_id INTO _casino FROM public.employees WHERE id = _employee_id;
  IF _casino IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  IF NOT (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR ((has_role(auth.uid(), 'hr'::app_role) OR can_manage(auth.uid()))
        AND public.has_casino_scope(auth.uid(), _casino))
  ) THEN
    RAISE EXCEPTION 'Not allowed to delete this employee';
  END IF;

  PERFORM set_config('app.skip_rota_lock', '1', true);

  DELETE FROM public.staff_rota WHERE employee_id = _employee_id;
  DELETE FROM public.pit_rota WHERE employee_id = _employee_id;
  DELETE FROM public.breaklist WHERE employee_id = _employee_id;
  DELETE FROM public.staff_attendance WHERE employee_id = _employee_id;
  DELETE FROM public.dealer_attendance WHERE employee_id = _employee_id;
  DELETE FROM public.staff_warnings WHERE employee_id = _employee_id;
  DELETE FROM public.weekly_bonus_entries WHERE employee_id = _employee_id;
  DELETE FROM public.monthly_tips_entries WHERE employee_id = _employee_id;

  UPDATE public.transactions SET tips_recipient_employee_id = NULL
    WHERE tips_recipient_employee_id = _employee_id;
  UPDATE public.payroll_entries SET employee_id = NULL
    WHERE employee_id = _employee_id;

  DELETE FROM public.employees WHERE id = _employee_id;

  PERFORM set_config('app.skip_rota_lock', '0', true);
END;
$function$;

-- 6. Payroll period creation by scope
CREATE OR REPLACE FUNCTION public.payroll_create_period(_year integer, _month integer, _casino_id uuid DEFAULT NULL::uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_casino UUID; v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF NOT (public.has_role(auth.uid(),'hr'::app_role)
          OR public.has_role(auth.uid(),'finance_manager'::app_role)
          OR public.has_role(auth.uid(),'general_manager'::app_role)
          OR public.has_role(auth.uid(),'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'HR, Finance Manager or Super Admin role required';
  END IF;

  v_casino := COALESCE(_casino_id, public.get_user_casino_id(auth.uid()));
  IF v_casino IS NULL THEN RAISE EXCEPTION 'Casino not specified'; END IF;

  IF NOT public.has_casino_scope(auth.uid(), v_casino) THEN
    RAISE EXCEPTION 'Cannot create period for another casino';
  END IF;

  INSERT INTO public.payroll_periods (casino_id, year, month, created_by)
  VALUES (v_casino, _year, _month, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.payroll_entries (
    period_id, employee_id, casino_id,
    snapshot_full_name, snapshot_position, snapshot_basic_salary,
    snapshot_account_number, snapshot_bank_code, snapshot_branch_code
  )
  SELECT v_id, e.id, e.casino_id,
         e.full_name, e.position, e.basic_salary,
         COALESCE(b.account_number,''), COALESCE(b.bank_code,''), COALESCE(b.branch_code,'')
  FROM public.employees e
  LEFT JOIN public.employee_bank_accounts b ON b.employee_id = e.id AND b.is_primary
  WHERE e.casino_id = v_casino AND e.payroll_status = 'active';

  INSERT INTO public.payroll_audit_log(period_id, casino_id, action, actor_id, details)
  VALUES (v_id, v_casino, 'create_period', auth.uid(),
          jsonb_build_object('year',_year,'month',_month));

  RETURN v_id;
END;
$function$;

-- 7. POS purchase by scope
CREATE OR REPLACE FUNCTION public.pos_create_purchase(_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_casino_id UUID := (_payload->>'casino_id')::UUID;
  v_type TEXT := COALESCE(_payload->>'purchase_type', 'single');
  v_supplier TEXT := _payload->>'supplier';
  v_notes TEXT := COALESCE(_payload->>'notes', '');
  v_user UUID := auth.uid();
  v_bd DATE;
  v_purchase_id UUID;
  v_total BIGINT := 0;
  v_expense_id UUID;
  v_item JSONB;
  v_item_id UUID;
  v_qty NUMERIC;
  v_unit_cost NUMERIC(14,4);
  v_line BIGINT;
  v_cur_stock NUMERIC;
  v_cur_avg NUMERIC(14,4);
  v_prev_stock NUMERIC;
  v_new_avg NUMERIC(14,4);
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_casino_id IS NULL THEN RAISE EXCEPTION 'casino_id required'; END IF;
  IF NOT public.has_casino_scope(v_user, v_casino_id) THEN RAISE EXCEPTION 'Casino access denied'; END IF;
  IF v_type NOT IN ('bulk','single') THEN RAISE EXCEPTION 'Invalid purchase_type'; END IF;
  IF jsonb_array_length(COALESCE(_payload->'items','[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'At least one item is required';
  END IF;

  v_bd := get_current_business_date(v_casino_id);

  INSERT INTO public.pos_purchases(
    casino_id, purchase_type, bartender_user_id, supplier, notes, business_date
  ) VALUES (
    v_casino_id, v_type, v_user, NULLIF(v_supplier,''), v_notes, v_bd
  )
  RETURNING id INTO v_purchase_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_payload->'items')
  LOOP
    v_item_id := (v_item->>'item_id')::UUID;
    v_qty := (v_item->>'qty')::NUMERIC;
    v_unit_cost := (v_item->>'unit_cost_tzs')::NUMERIC;

    IF v_qty IS NULL OR v_qty <= 0 THEN RAISE EXCEPTION 'qty must be > 0 (item %)', v_item_id; END IF;
    IF v_unit_cost IS NULL OR v_unit_cost < 0 THEN RAISE EXCEPTION 'unit_cost_tzs must be >= 0 (item %)', v_item_id; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.pos_menu_items WHERE id = v_item_id AND casino_id = v_casino_id) THEN
      RAISE EXCEPTION 'Item % not in casino', v_item_id;
    END IF;

    v_line := FLOOR(v_qty * v_unit_cost)::BIGINT;
    v_total := v_total + v_line;

    INSERT INTO public.pos_purchase_items(purchase_id, item_id, qty, unit_cost_tzs, line_total_tzs)
    VALUES (v_purchase_id, v_item_id, v_qty, v_unit_cost, v_line);

    INSERT INTO public.pos_inventory_movements(item_id, delta, reason, user_id)
    VALUES (v_item_id, v_qty, 'purchase', v_user);

    SELECT COALESCE(stock_qty,0), COALESCE(avg_cost_tzs,0)
      INTO v_cur_stock, v_cur_avg
      FROM public.pos_menu_items WHERE id = v_item_id;

    v_prev_stock := GREATEST(v_cur_stock - v_qty, 0);
    IF (v_prev_stock + v_qty) > 0 THEN
      v_new_avg := ((v_prev_stock * v_cur_avg) + (v_qty * v_unit_cost)) / (v_prev_stock + v_qty);
    ELSE
      v_new_avg := v_unit_cost;
    END IF;

    UPDATE public.pos_menu_items
      SET avg_cost_tzs = v_new_avg,
          last_purchase_cost_tzs = v_unit_cost,
          last_purchase_at = now(),
          updated_at = now()
      WHERE id = v_item_id;
  END LOOP;

  INSERT INTO public.expenses(
    casino_id, category, amount, description,
    approved, created_by, cage_type, business_date
  ) VALUES (
    v_casino_id,
    'alcohol'::expense_category,
    v_total,
    'Bar purchase (' || v_type || ')'
      || CASE WHEN v_supplier IS NOT NULL AND v_supplier <> '' THEN ' — ' || v_supplier ELSE '' END
      || CASE WHEN v_notes <> '' THEN ' — ' || v_notes ELSE '' END,
    false,
    v_user,
    'slots',
    v_bd
  )
  RETURNING id INTO v_expense_id;

  PERFORM set_config('app.pos_purchase_internal', 'on', true);
  UPDATE public.pos_purchases SET total_tzs = v_total, expense_id = v_expense_id WHERE id = v_purchase_id;
  PERFORM set_config('app.pos_purchase_internal', 'off', true);

  RETURN v_purchase_id;
END;
$function$;

-- 8. Cross-casino audit noise: skip for network-scope users
CREATE OR REPLACE FUNCTION public.log_cross_casino_player_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_editor_casino uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  v_editor_casino := get_user_casino_id(auth.uid());
  IF v_editor_casino IS NOT NULL
     AND NEW.casino_id IS NOT NULL
     AND v_editor_casino <> NEW.casino_id
     AND NOT public.has_casino_scope(auth.uid(), NEW.casino_id)
     AND NOT has_role(auth.uid(), 'super_admin'::app_role)
     AND NOT has_role(auth.uid(), 'account_manager'::app_role)
  THEN
    INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
    VALUES (
      v_editor_casino,
      'player'::log_category,
      'cross_casino_player_edit',
      jsonb_build_object(
        'player_id', NEW.id,
        'player_home_casino_id', NEW.casino_id,
        'editor_casino_id', v_editor_casino,
        'changed_first_name', (OLD.first_name IS DISTINCT FROM NEW.first_name),
        'changed_last_name', (OLD.last_name IS DISTINCT FROM NEW.last_name),
        'changed_phone', (OLD.phone IS DISTINCT FROM NEW.phone),
        'changed_email', (OLD.email IS DISTINCT FROM NEW.email),
        'changed_id_number', (OLD.id_number IS DISTINCT FROM NEW.id_number)
      ),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- 9. fin_save_wallet_count: unified scope check
CREATE OR REPLACE FUNCTION public.fin_save_wallet_count(p_wallet_id uuid, p_counted numeric, p_denominations jsonb DEFAULT '{}'::jsonb, p_note text DEFAULT ''::text, p_business_date date DEFAULT NULL::date, p_fx_rate numeric DEFAULT NULL::numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  w RECORD;
  v_uid uuid := auth.uid();
  v_rate numeric;
  v_previous numeric;
  v_variance numeric;
  v_snap uuid;
  v_wallet_type wallet_type;
BEGIN
  SELECT * INTO w FROM fin_wallets WHERE id = p_wallet_id;
  IF w.id IS NULL THEN RAISE EXCEPTION 'wallet not found'; END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_counted IS NULL OR p_counted < 0 THEN
    RAISE EXCEPTION 'physical count cannot be negative';
  END IF;
  IF NOT (
    has_role(v_uid,'super_admin'::app_role)
    OR ((can_manage(v_uid) OR can_finance(v_uid)) AND public.has_casino_scope(v_uid, w.casino_id))
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  v_rate := COALESCE(NULLIF(p_fx_rate,0), 1);

  SELECT physical_total
    INTO v_previous
  FROM cash_count_snapshots
  WHERE wallet_id = p_wallet_id
  ORDER BY created_at DESC
  LIMIT 1;

  v_previous := COALESCE(v_previous, COALESCE(w.starting_float_amount, 0));
  v_variance := p_counted - v_previous;

  v_wallet_type := CASE w.kind
    WHEN 'cash' THEN 'main_cash'
    WHEN 'safe' THEN 'office_safe'
    WHEN 'bank' THEN 'bank_account'
    WHEN 'mobile_money' THEN 'mobile_money'
    WHEN 'cage' THEN 'cage_table'
    ELSE 'other_reserve' END::wallet_type;

  INSERT INTO cash_count_snapshots (
    casino_id, wallet_id, wallet_type, currency, denominations,
    physical_total, expected_balance, discrepancy, exchange_rate,
    physical_total_tzs, counted_by, note, source
  ) VALUES (
    w.casino_id, w.id, v_wallet_type, w.currency, COALESCE(p_denominations,'{}'::jsonb),
    p_counted, v_previous, v_variance, v_rate,
    p_counted * v_rate, v_uid, COALESCE(p_note,''), 'manual'
  ) RETURNING id INTO v_snap;

  RETURN jsonb_build_object(
    'snapshot_id', v_snap,
    'tx_id', NULL,
    'expected', v_previous,
    'counted', p_counted,
    'variance', v_variance
  );
END;
$function$;