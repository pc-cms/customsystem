UPDATE public.pos_locations SET operation_mode = 'paid' WHERE operation_mode IS DISTINCT FROM 'paid';
ALTER TABLE public.pos_locations ALTER COLUMN operation_mode SET DEFAULT 'paid';
COMMENT ON COLUMN public.pos_locations.operation_mode IS 'DEPRECATED: FREE is a payment tender; not used in business logic.';
DROP TRIGGER IF EXISTS trg_pos_order_items_comp_zero ON public.pos_order_items;
DROP TRIGGER IF EXISTS trg_pos_oim_comp_zero ON public.pos_order_item_modifiers;
DROP TRIGGER IF EXISTS trg_pos_orders_zz_auto_close_on_ready ON public.pos_orders;
DROP TRIGGER IF EXISTS trg_pos_tabs_require_player ON public.pos_tabs;

ALTER TABLE public.pos_staff_access DROP CONSTRAINT IF EXISTS pos_staff_access_role_check;
ALTER TABLE public.pos_staff_access ADD CONSTRAINT pos_staff_access_role_check CHECK (role = ANY (ARRAY['waiter','bartender','manager']));
ALTER TABLE public.pos_menu_items ADD COLUMN IF NOT EXISTS stock_unit text NOT NULL DEFAULT 'pcs';
ALTER TABLE public.pos_menu_items DROP CONSTRAINT IF EXISTS pos_menu_items_stock_unit_chk;
ALTER TABLE public.pos_menu_items ADD CONSTRAINT pos_menu_items_stock_unit_chk CHECK (stock_unit IN ('pcs','ml'));

CREATE TABLE IF NOT EXISTS public.pos_casino_settings (
  casino_id uuid PRIMARY KEY REFERENCES public.casinos(id) ON DELETE CASCADE,
  bar_output_mode text NOT NULL DEFAULT 'screen' CHECK (bar_output_mode IN ('screen','printer','both')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.pos_casino_settings TO authenticated;
GRANT ALL ON public.pos_casino_settings TO service_role;
ALTER TABLE public.pos_casino_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pos settings read" ON public.pos_casino_settings FOR SELECT TO authenticated
  USING (public.user_can_see_casino(auth.uid(), casino_id));
CREATE POLICY "pos settings write" ON public.pos_casino_settings FOR ALL TO authenticated
  USING (public._pos_is_manager(casino_id)) WITH CHECK (public._pos_is_manager(casino_id));

CREATE SEQUENCE IF NOT EXISTS public.pos_guest_seq START 1001;
CREATE UNIQUE INDEX IF NOT EXISTS pos_tabs_one_open_per_player
  ON public.pos_tabs (casino_id, player_id) WHERE status = 'open' AND player_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public._pos_player_active(_casino_id uuid, _player_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.casino_visits WHERE casino_id = _casino_id AND player_id = _player_id AND checked_out_at IS NULL)
$$;

CREATE OR REPLACE FUNCTION public.pos_active_player_ids(_casino_id uuid)
RETURNS SETOF uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.user_can_see_casino(auth.uid(), _casino_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY SELECT DISTINCT player_id FROM public.casino_visits WHERE casino_id = _casino_id AND checked_out_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public._pos_verify_manager_pin(_casino_id uuid, _pin text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE r record; v_fail int;
BEGIN
  SELECT count(*) INTO v_fail FROM public.pos_pin_failures WHERE terminal_user_id = auth.uid() AND at > now() - interval '5 minutes';
  IF v_fail >= 5 THEN RAISE EXCEPTION 'Too many attempts. Wait a few minutes and try again.'; END IF;
  IF _pin ~ '^[0-9]{4,6}$' THEN
    FOR r IN SELECT a.employee_id, a.pin_hash FROM public.pos_staff_access a JOIN public.employees e ON e.id = a.employee_id
              WHERE a.casino_id = _casino_id AND a.is_active AND a.role = 'manager' AND a.pin_hash IS NOT NULL AND e.deleted_at IS NULL LOOP
      IF extensions.crypt(_pin, r.pin_hash) = r.pin_hash THEN RETURN r.employee_id; END IF;
    END LOOP;
  END IF;
  INSERT INTO public.pos_pin_failures (terminal_user_id, casino_id) VALUES (auth.uid(), _casino_id);
  RAISE EXCEPTION 'Invalid manager PIN.';
END $$;

CREATE OR REPLACE FUNCTION public.pos_staff_set_role(_casino_id uuid, _employee_id uuid, _role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._pos_is_manager(_casino_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _role NOT IN ('waiter','manager') THEN RAISE EXCEPTION 'Invalid role'; END IF;
  UPDATE public.pos_staff_access SET role = _role, updated_by = auth.uid(), updated_at = now()
   WHERE casino_id = _casino_id AND employee_id = _employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Set a PIN first.'; END IF;
  INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
  VALUES (_casino_id, 'system', 'pos_staff_role_set', jsonb_build_object('employee_id', _employee_id, 'role', _role), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.pos_tabs_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_split jsonb; v_sum bigint;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.casino_id IS DISTINCT FROM OLD.casino_id OR NEW.shift_id IS DISTINCT FROM OLD.shift_id
       OR NEW.opened_by_user_id IS DISTINCT FROM OLD.opened_by_user_id OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
       OR NEW.player_id IS DISTINCT FROM OLD.player_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'pos_tabs: identity fields are immutable.';
    END IF;
    IF OLD.status IN ('closed','voided') AND NEW.status = 'open' THEN
      RAISE EXCEPTION 'pos_tabs: cannot reopen a closed or voided tab.';
    END IF;
    IF OLD.status = 'open' AND NEW.status = 'closed' THEN
      v_split := COALESCE(NEW.payment_split, '{}'::jsonb);
      NEW.payment_split := v_split;
      v_sum := COALESCE((v_split->>'cash')::bigint,0) + COALESCE((v_split->>'card')::bigint,0)
             + COALESCE((v_split->>'comp_player')::bigint,0) + COALESCE((v_split->>'comp_house')::bigint,0)
             + COALESCE((v_split->>'player_charge')::bigint,0)
             + COALESCE((v_split->>'money')::bigint,0) + COALESCE((v_split->>'credits')::bigint,0)
             + COALESCE((v_split->>'free')::bigint,0);
      IF v_sum <> NEW.total_tzs THEN
        RAISE EXCEPTION 'pos_tabs: payment_split sum (%) must equal total_tzs (%).', v_sum, NEW.total_tzs;
      END IF;
      IF (COALESCE((v_split->>'money')::bigint,0) + COALESCE((v_split->>'credits')::bigint,0) + COALESCE((v_split->>'free')::bigint,0)) > 0
         AND COALESCE(current_setting('pos.checkout_rpc', true),'') <> 'on' THEN
        RAISE EXCEPTION 'pos_tabs: new tenders can only be settled through checkout.';
      END IF;
      IF NEW.closed_at IS NULL THEN NEW.closed_at := now(); END IF;
      IF NEW.closed_by_user_id IS NULL THEN NEW.closed_by_user_id := auth.uid(); END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.pos_orders_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rank_old int; v_rank_new int;
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(current_setting('pos.internal', true),'') <> 'on' THEN
    IF NEW.total_tzs IS DISTINCT FROM OLD.total_tzs OR NEW.tab_id IS DISTINCT FROM OLD.tab_id
       OR NEW.casino_id IS DISTINCT FROM OLD.casino_id OR NEW.shift_id IS DISTINCT FROM OLD.shift_id
       OR NEW.waiter_user_id IS DISTINCT FROM OLD.waiter_user_id OR NEW.business_date IS DISTINCT FROM OLD.business_date
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'pos_orders: financial/identity fields are immutable.';
    END IF;
    v_rank_old := CASE OLD.status WHEN 'pending' THEN 0 WHEN 'preparing' THEN 1 WHEN 'ready' THEN 2 WHEN 'served' THEN 3 WHEN 'void' THEN 9 END;
    v_rank_new := CASE NEW.status WHEN 'pending' THEN 0 WHEN 'preparing' THEN 1 WHEN 'ready' THEN 2 WHEN 'served' THEN 3 WHEN 'void' THEN 9 END;
    IF NEW.status = 'void' AND OLD.status <> 'void' THEN
      IF COALESCE(current_setting('pos.void_rpc', true),'') <> 'on' THEN
        RAISE EXCEPTION 'pos_orders: void requires bartender Unavailable or manager approval.';
      END IF;
    ELSIF v_rank_new < v_rank_old THEN
      RAISE EXCEPTION 'pos_orders: status can only move forward.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $do$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.pos_orders_stock_lifecycle'::regproc);
  v_def := replace(v_def,
    $a$IF NEW.status IN ('preparing','ready','served')
     AND OLD.status = 'pending'
     AND NEW.stock_deducted_at IS NULL THEN$a$,
    $b$IF ((NEW.status IN ('preparing','ready','served') AND OLD.status = 'pending')
       OR COALESCE(current_setting('pos.deduct_now', true),'') = 'on')
     AND NEW.stock_deducted_at IS NULL AND NEW.status <> 'void' THEN$b$);
  IF position('pos.deduct_now' in v_def) = 0 THEN RAISE EXCEPTION 'stock lifecycle patch failed'; END IF;
  EXECUTE v_def;
END $do$;

CREATE OR REPLACE FUNCTION public.pos_open_tab(_token text, _casino_id uuid, _shift_id uuid, _player_id uuid DEFAULT NULL, _guest_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_emp uuid; v_id uuid; v_name text; v_label text; v_loc uuid;
BEGIN
  v_emp := public._pos_operator_employee(_token, _casino_id);
  IF NOT EXISTS (SELECT 1 FROM public.pos_shifts WHERE id = _shift_id AND casino_id = _casino_id AND closed_at IS NULL) THEN
    RAISE EXCEPTION 'Shift is not open.';
  END IF;
  SELECT id INTO v_loc FROM public.pos_locations WHERE casino_id = _casino_id AND is_active ORDER BY (name = 'Main Bar') DESC, sort_order LIMIT 1;
  IF _player_id IS NOT NULL THEN
    IF NOT public._pos_player_active(_casino_id, _player_id) THEN
      RAISE EXCEPTION 'PLAYER_NOT_ACTIVE: player is not checked in to this casino.';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('pos_tab:' || _casino_id::text || ':' || _player_id::text));
    SELECT id INTO v_id FROM public.pos_tabs WHERE casino_id = _casino_id AND player_id = _player_id AND status = 'open' LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id', v_id, 'existing', true); END IF;
    SELECT trim(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) INTO v_name FROM public.players WHERE id = _player_id;
    INSERT INTO public.pos_tabs (casino_id, shift_id, opened_by_user_id, player_id, player_name, pos_location_id, operation_mode)
    VALUES (_casino_id, _shift_id, auth.uid(), _player_id, NULLIF(v_name,''), v_loc, 'paid') RETURNING id INTO v_id;
  ELSE
    v_label := 'Guest #' || nextval('public.pos_guest_seq')::text
            || CASE WHEN NULLIF(trim(COALESCE(_guest_note,'')),'') IS NOT NULL THEN ' · ' || left(trim(_guest_note), 40) ELSE '' END;
    INSERT INTO public.pos_tabs (casino_id, shift_id, opened_by_user_id, walkin_label, player_name, pos_location_id, operation_mode)
    VALUES (_casino_id, _shift_id, auth.uid(), v_label, v_label, v_loc, 'paid') RETURNING id INTO v_id;
  END IF;
  INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
  VALUES (_casino_id, 'system', 'pos_tab_opened', jsonb_build_object('tab_id', v_id, 'employee_id', v_emp, 'player_id', _player_id, 'guest', _player_id IS NULL), auth.uid());
  RETURN jsonb_build_object('id', v_id, 'existing', false);
END $$;

CREATE OR REPLACE FUNCTION public.pos_create_order(_token text, _tab_id uuid, _item_id uuid, _qty numeric, _notes text DEFAULT NULL::text, _modifier_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; it record; v_emp uuid; v_order uuid; v_oi uuid; m record; v_short text; v_out text;
BEGIN
  SELECT * INTO t FROM public.pos_tabs WHERE id = _tab_id FOR UPDATE;
  IF t.id IS NULL OR t.status <> 'open' THEN RAISE EXCEPTION 'Tab is not open.'; END IF;
  IF NOT public.user_can_see_casino(auth.uid(), t.casino_id)
     OR NOT (public.has_any_pos_role(auth.uid()) OR public.has_role(auth.uid(),'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  v_emp := public._pos_operator_employee(_token, t.casino_id);
  IF t.player_id IS NOT NULL AND NOT public._pos_player_active(t.casino_id, t.player_id) THEN
    RAISE EXCEPTION 'PLAYER_CHECKED_OUT: player has left the casino — no new orders on this tab.';
  END IF;
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Quantity must be positive.'; END IF;
  SELECT * INTO it FROM public.pos_menu_items WHERE id = _item_id AND casino_id = t.casino_id AND is_active;
  IF it.id IS NULL THEN RAISE EXCEPTION 'Menu item not available.'; END IF;
  IF it.price_tzs IS NULL THEN RAISE EXCEPTION 'Item has no selling price.'; END IF;

  PERFORM set_config('pos.operator_rpc','on', true);
  INSERT INTO public.pos_orders (casino_id, shift_id, tab_id, waiter_user_id, status, notes, ordered_by_employee_id, pos_location_id)
  VALUES (t.casino_id, t.shift_id, t.id, auth.uid(), 'pending', NULLIF(trim(_notes),''), v_emp, t.pos_location_id)
  RETURNING id INTO v_order;
  PERFORM set_config('pos.operator_rpc','', true);

  INSERT INTO public.pos_order_items (order_id, item_id, item_name, qty, unit_price_tzs, line_total_tzs)
  VALUES (v_order, it.id, it.name, _qty, it.price_tzs, round(it.price_tzs * _qty)) RETURNING id INTO v_oi;
  FOR m IN SELECT id, name, price_tzs_delta FROM public.pos_modifiers
            WHERE casino_id = t.casino_id AND is_active AND id = ANY(COALESCE(_modifier_ids,'{}')) LOOP
    INSERT INTO public.pos_order_item_modifiers (order_item_id, modifier_id, modifier_name_snapshot, price_tzs_delta_snapshot)
    VALUES (v_oi, m.id, m.name, m.price_tzs_delta);
  END LOOP;

  PERFORM set_config('pos.deduct_now','on', true);
  PERFORM set_config('pos.internal','on', true);
  UPDATE public.pos_orders SET stock_mode = stock_mode WHERE id = v_order;
  PERFORM set_config('pos.internal','', true);
  PERFORM set_config('pos.deduct_now','', true);

  SELECT string_agg(DISTINCT mi.name, ', ') INTO v_short
    FROM public.pos_inventory_movements mv JOIN public.pos_menu_items mi ON mi.id = mv.item_id
   WHERE mv.reference_type = 'pos_order' AND mv.reference_id = v_order AND COALESCE(mi.stock_qty,0) < 0;
  IF v_short IS NOT NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_short;
  END IF;

  SELECT bar_output_mode INTO v_out FROM public.pos_casino_settings WHERE casino_id = t.casino_id;
  IF COALESCE(v_out,'screen') = 'printer' THEN
    UPDATE public.pos_orders SET status = 'served', served_at = now() WHERE id = v_order;
  END IF;
  RETURN v_order;
END $$;

CREATE OR REPLACE FUNCTION public.pos_bar_unavailable(_order_id uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record;
BEGIN
  SELECT * INTO o FROM public.pos_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.user_can_see_casino(auth.uid(), o.casino_id)
     OR NOT (public.has_any_pos_role(auth.uid()) OR public.has_role(auth.uid(),'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF o.status NOT IN ('pending','preparing','ready') THEN RAISE EXCEPTION 'Order is no longer active.'; END IF;
  PERFORM set_config('pos.void_rpc','on', true);
  UPDATE public.pos_orders SET status = 'void', voided_at = now(), voided_by = auth.uid(),
         voided_reason = COALESCE(NULLIF(trim(_reason),''), 'Unavailable') WHERE id = _order_id;
  PERFORM set_config('pos.void_rpc','', true);
END $$;

CREATE OR REPLACE FUNCTION public.pos_void_order_mgr(_order_id uuid, _reason text, _manager_pin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; v_mgr uuid; v_tab text;
BEGIN
  SELECT * INTO o FROM public.pos_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NULLIF(trim(COALESCE(_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'Reason required.'; END IF;
  SELECT status INTO v_tab FROM public.pos_tabs WHERE id = o.tab_id;
  IF v_tab <> 'open' THEN RAISE EXCEPTION 'Tab is closed.'; END IF;
  IF o.status = 'void' THEN RETURN; END IF;
  v_mgr := public._pos_verify_manager_pin(o.casino_id, _manager_pin);
  PERFORM set_config('pos.void_rpc','on', true);
  UPDATE public.pos_orders SET status = 'void', voided_at = now(), voided_by = auth.uid(), voided_reason = trim(_reason) WHERE id = _order_id;
  PERFORM set_config('pos.void_rpc','', true);
  INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
  VALUES (o.casino_id, 'system', 'pos_order_void_manager', jsonb_build_object('order_id', o.id, 'manager_employee_id', v_mgr, 'reason', _reason), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.pos_close_tab_v2(_token text, _tab_id uuid, _money bigint, _credits bigint, _free bigint, _idem text, _manager_pin text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; v_emp uuid; v_mgr uuid; v_red jsonb; v_total bigint; v_split jsonb;
BEGIN
  SELECT * INTO t FROM public.pos_tabs WHERE id = _tab_id FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Tab not found'; END IF;
  v_emp := public._pos_operator_employee(_token, t.casino_id);
  IF t.status = 'closed' AND t.payment_split->>'idem' = _idem THEN
    RETURN jsonb_build_object('tab_id', t.id, 'total', t.total_tzs, 'split', t.payment_split, 'replay', true);
  END IF;
  IF t.status <> 'open' THEN RAISE EXCEPTION 'Tab is not open.'; END IF;
  _money := COALESCE(_money,0); _credits := COALESCE(_credits,0); _free := COALESCE(_free,0);
  IF _money < 0 OR _credits < 0 OR _free < 0 THEN RAISE EXCEPTION 'Amounts must be >= 0.'; END IF;
  PERFORM public.pos_tabs_recompute_total(t.id);
  SELECT total_tzs INTO v_total FROM public.pos_tabs WHERE id = t.id;
  IF _money + _credits + _free <> v_total THEN
    RAISE EXCEPTION 'Payment (%) must equal tab total (%).', _money + _credits + _free, v_total;
  END IF;
  IF _credits > 0 THEN
    IF t.player_id IS NULL THEN RAISE EXCEPTION 'Guests cannot pay with credits.'; END IF;
    IF NOT public._pos_player_active(t.casino_id, t.player_id) THEN RAISE EXCEPTION 'PLAYER_CHECKED_OUT: credits need an active player.'; END IF;
  END IF;
  IF v_total > 0 AND _free = v_total THEN
    IF _manager_pin IS NULL THEN RAISE EXCEPTION 'FREE_NEEDS_MANAGER: fully FREE tabs are closed by a manager at end of shift.'; END IF;
    v_mgr := public._pos_verify_manager_pin(t.casino_id, _manager_pin);
  END IF;
  IF _credits > 0 THEN
    v_red := public.redeem_promo_fifo(t.player_id, t.casino_id, _credits, NULL, auth.uid(), NULL, 'bar');
  END IF;
  v_split := jsonb_build_object('money', _money, 'credits', _credits, 'free', _free, 'idem', _idem, 'closed_by_employee_id', v_emp)
          || CASE WHEN v_red IS NOT NULL THEN jsonb_build_object('redemption_id', v_red->>'redemption_id') ELSE '{}'::jsonb END
          || CASE WHEN v_mgr IS NOT NULL THEN jsonb_build_object('manager_employee_id', v_mgr) ELSE '{}'::jsonb END;
  PERFORM set_config('pos.checkout_rpc','on', true);
  UPDATE public.pos_tabs SET status = 'closed', payment_split = v_split WHERE id = t.id;
  PERFORM set_config('pos.checkout_rpc','', true);
  RETURN jsonb_build_object('tab_id', t.id, 'total', v_total, 'split', v_split, 'replay', false);
END $$;

CREATE OR REPLACE FUNCTION public.pos_close_free_tabs(_shift_id uuid, _manager_pin text, _tab_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; v_mgr uuid; t record; v_n int := 0; v_sum bigint := 0; v_tot bigint; v_skipped jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO s FROM public.pos_shifts WHERE id = _shift_id;
  IF s.id IS NULL OR s.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Shift is not open.'; END IF;
  IF NOT public.user_can_see_casino(auth.uid(), s.casino_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  v_mgr := public._pos_verify_manager_pin(s.casino_id, _manager_pin);
  PERFORM set_config('pos.checkout_rpc','on', true);
  FOR t IN SELECT * FROM public.pos_tabs WHERE shift_id = _shift_id AND status = 'open'
             AND (_tab_ids IS NULL OR id = ANY(_tab_ids)) FOR UPDATE LOOP
    IF EXISTS (SELECT 1 FROM public.pos_orders WHERE tab_id = t.id AND status IN ('pending','preparing')) THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('tab_id', t.id, 'label', COALESCE(t.player_name, t.walkin_label), 'reason', 'active bar orders'));
      CONTINUE;
    END IF;
    PERFORM public.pos_tabs_recompute_total(t.id);
    SELECT total_tzs INTO v_tot FROM public.pos_tabs WHERE id = t.id;
    UPDATE public.pos_tabs
       SET status = 'closed',
           payment_split = jsonb_build_object('money',0,'credits',0,'free', v_tot, 'manager_employee_id', v_mgr, 'batch_free', true)
     WHERE id = t.id;
    v_n := v_n + 1; v_sum := v_sum + v_tot;
  END LOOP;
  PERFORM set_config('pos.checkout_rpc','', true);
  INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
  VALUES (s.casino_id, 'system', 'pos_free_batch_close', jsonb_build_object('shift_id', _shift_id, 'manager_employee_id', v_mgr, 'tabs', v_n, 'retail_total', v_sum, 'skipped', v_skipped), auth.uid());
  RETURN jsonb_build_object('closed', v_n, 'retail_total', v_sum, 'skipped', v_skipped);
END $$;

CREATE OR REPLACE FUNCTION public.pos_compute_z_report(_shift_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_shift public.pos_shifts%ROWTYPE; v_totals jsonb; v_by_category jsonb; v_by_item jsonb; v_by_waiter jsonb; v_counts jsonb;
  v_money bigint := 0; v_expected bigint := 0; v_cogs numeric := 0; v_name text;
BEGIN
  SELECT * INTO v_shift FROM public.pos_shifts WHERE id = _shift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'pos_compute_z_report: shift not found'; END IF;
  WITH closed_tabs AS (
    SELECT total_tzs, COALESCE(payment_split, '{}'::jsonb) AS ps FROM public.pos_tabs WHERE shift_id = _shift_id AND status = 'closed')
  SELECT jsonb_build_object(
    'gross_tzs',  COALESCE(SUM(total_tzs), 0),
    'retail_tzs', COALESCE(SUM(total_tzs), 0),
    'money',      COALESCE(SUM(COALESCE((ps->>'money')::bigint,0) + COALESCE((ps->>'cash')::bigint,0)), 0),
    'credits',    COALESCE(SUM(COALESCE((ps->>'credits')::bigint, 0)), 0),
    'free',       COALESCE(SUM(COALESCE((ps->>'free')::bigint, 0)), 0),
    'cash',       COALESCE(SUM(COALESCE((ps->>'cash')::bigint, 0)), 0),
    'card',       COALESCE(SUM(COALESCE((ps->>'card')::bigint, 0)), 0),
    'comp_player',COALESCE(SUM(COALESCE((ps->>'comp_player')::bigint, 0)), 0),
    'comp_house', COALESCE(SUM(COALESCE((ps->>'comp_house')::bigint, 0)), 0))
  INTO v_totals FROM closed_tabs;
  v_money := COALESCE((v_totals->>'money')::bigint, 0);
  v_expected := COALESCE(v_shift.opening_cash, 0) + v_money;

  SELECT COALESCE(SUM(mv.cost_tzs_snapshot * sign(-mv.delta)),0) INTO v_cogs
    FROM public.pos_inventory_movements mv JOIN public.pos_orders po ON po.id = mv.reference_id
   WHERE mv.reference_type = 'pos_order' AND po.shift_id = _shift_id
     AND mv.reason IN ('sale','pos_recipe_consumption','order_void_reversal','pos_recipe_reversal');

  WITH lines AS (
    SELECT poi.item_id, poi.item_name, poi.qty, poi.line_total_tzs, pc.name AS category_name
      FROM public.pos_order_items poi
      JOIN public.pos_orders po ON po.id = poi.order_id
      JOIN public.pos_tabs pt ON pt.id = po.tab_id
      LEFT JOIN public.pos_menu_items pi ON pi.id = poi.item_id
      LEFT JOIN public.pos_menu_categories pc ON pc.id = pi.category_id
     WHERE pt.shift_id = _shift_id AND pt.status = 'closed' AND po.status <> 'void')
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object('category_name', COALESCE(category_name,'—'), 'qty', qty, 'total_tzs', line_total_tzs) ORDER BY line_total_tzs DESC)
      FROM (SELECT category_name, SUM(qty) AS qty, SUM(line_total_tzs) AS line_total_tzs FROM lines GROUP BY category_name) c), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('item_id', item_id, 'item_name', item_name, 'qty', qty, 'total_tzs', total_tzs) ORDER BY total_tzs DESC)
      FROM (SELECT item_id, item_name, SUM(qty) AS qty, SUM(line_total_tzs) AS total_tzs FROM lines GROUP BY item_id, item_name) i), '[]'::jsonb)
  INTO v_by_category, v_by_item;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('employee_id', w.eid, 'name', COALESCE(e.full_name,'—'), 'orders', w.n, 'retail_tzs', w.total) ORDER BY w.total DESC), '[]'::jsonb)
    INTO v_by_waiter
    FROM (SELECT ordered_by_employee_id AS eid, COUNT(*) AS n, SUM(total_tzs) AS total FROM public.pos_orders
           WHERE shift_id = _shift_id AND status <> 'void' GROUP BY 1) w
    LEFT JOIN public.employees e ON e.id = w.eid;

  SELECT jsonb_build_object(
    'tabs_closed',  (SELECT COUNT(*) FROM public.pos_tabs WHERE shift_id = _shift_id AND status = 'closed'),
    'tabs_voided',  (SELECT COUNT(*) FROM public.pos_tabs WHERE shift_id = _shift_id AND status = 'voided'),
    'orders_total', (SELECT COUNT(*) FROM public.pos_orders WHERE shift_id = _shift_id),
    'orders_void',  (SELECT COUNT(*) FROM public.pos_orders WHERE shift_id = _shift_id AND status = 'void')) INTO v_counts;
  SELECT name INTO v_name FROM public.casinos WHERE id = v_shift.casino_id;

  RETURN jsonb_build_object(
    'shift_id', v_shift.id, 'casino_id', v_shift.casino_id, 'casino_name', v_name,
    'business_date', v_shift.business_date, 'shift_type', v_shift.shift_type,
    'waiter_user_id', v_shift.waiter_user_id, 'opened_at', v_shift.opened_at, 'closed_at', v_shift.closed_at,
    'opening_cash', COALESCE(v_shift.opening_cash, 0), 'closing_cash', v_shift.closing_cash,
    'totals', v_totals, 'expected_cash', v_expected,
    'cash_delta', COALESCE(v_shift.closing_cash, 0) - v_expected,
    'cogs_tzs', round(v_cogs), 'vat_rate', 18,
    'counts', v_counts, 'by_category', v_by_category, 'by_item', v_by_item, 'by_waiter', v_by_waiter,
    'computed_at', now());
END $$;

DO $do$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.pos_save_stock_count'::regproc);
  v_def := replace(v_def, $a$  v_business_date := public.get_current_business_date();$a$,
$b$  v_business_date := public.get_current_business_date();

  IF _count_type IN ('open','close') AND EXISTS (
    SELECT 1 FROM pos_menu_items mi WHERE mi.casino_id = v_casino AND mi.is_active AND mi.stock_qty IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(_items,'[]'::jsonb)) e
                        WHERE (e->>'item_id')::uuid = mi.id AND e->>'counted_qty' IS NOT NULL)) THEN
    RAISE EXCEPTION 'INCOMPLETE_COUNT: every tracked stock item must be counted.';
  END IF;$b$);
  IF position('INCOMPLETE_COUNT' in v_def) = 0 THEN RAISE EXCEPTION 'stock count patch failed'; END IF;
  EXECUTE v_def;
END $do$;

GRANT EXECUTE ON FUNCTION public.pos_open_tab(text,uuid,uuid,uuid,text), public.pos_close_tab_v2(text,uuid,bigint,bigint,bigint,text,text),
  public.pos_close_free_tabs(uuid,text,uuid[]), public.pos_bar_unavailable(uuid,text), public.pos_void_order_mgr(uuid,text,text),
  public.pos_staff_set_role(uuid,uuid,text), public.pos_active_player_ids(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public._pos_verify_manager_pin(uuid,text) FROM PUBLIC, anon, authenticated;
