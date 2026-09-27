-- A. Location operating mode + snapshots
ALTER TABLE public.pos_locations ADD COLUMN IF NOT EXISTS operation_mode text NOT NULL DEFAULT 'complimentary';
DO $$ BEGIN
  ALTER TABLE public.pos_locations ADD CONSTRAINT pos_locations_operation_mode_chk CHECK (operation_mode IN ('complimentary','paid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.pos_tabs ADD COLUMN IF NOT EXISTS operation_mode text;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS operation_mode text;
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS ordered_by_employee_id uuid REFERENCES public.employees(id);
CREATE INDEX IF NOT EXISTS pos_orders_ordered_by_employee_idx ON public.pos_orders(ordered_by_employee_id);

-- Historical tabs/orders went through the paid bill flow: snapshot them as 'paid'.
UPDATE public.pos_tabs SET operation_mode = 'paid' WHERE operation_mode IS NULL;
UPDATE public.pos_orders SET operation_mode = 'paid' WHERE operation_mode IS NULL;

DO $$ BEGIN
  ALTER TABLE public.pos_tabs ADD CONSTRAINT pos_tabs_operation_mode_chk CHECK (operation_mode IS NULL OR operation_mode IN ('complimentary','paid'));
  ALTER TABLE public.pos_orders ADD CONSTRAINT pos_orders_operation_mode_chk CHECK (operation_mode IS NULL OR operation_mode IN ('complimentary','paid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.pos_tabs_set_mode()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  SELECT operation_mode INTO NEW.operation_mode FROM public.pos_locations WHERE id = NEW.pos_location_id;
  IF NEW.operation_mode IS NULL THEN NEW.operation_mode := 'complimentary'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pos_tabs_set_mode ON public.pos_tabs;
CREATE TRIGGER trg_pos_tabs_set_mode BEFORE INSERT ON public.pos_tabs FOR EACH ROW EXECUTE FUNCTION public.pos_tabs_set_mode();

CREATE OR REPLACE FUNCTION public.pos_orders_set_mode_and_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT operation_mode INTO NEW.operation_mode FROM public.pos_tabs WHERE id = NEW.tab_id;
    IF NEW.operation_mode IS NULL THEN NEW.operation_mode := 'paid'; END IF;
    IF NEW.ordered_by_employee_id IS NOT NULL
       AND COALESCE(current_setting('pos.operator_rpc', true),'') <> 'on' THEN
      RAISE EXCEPTION 'pos_orders: ordered_by_employee_id can only be set by the operator RPC.';
    END IF;
  ELSE
    IF NEW.ordered_by_employee_id IS DISTINCT FROM OLD.ordered_by_employee_id
       OR NEW.operation_mode IS DISTINCT FROM OLD.operation_mode THEN
      RAISE EXCEPTION 'pos_orders: operator attribution and mode are immutable.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pos_orders_set_mode ON public.pos_orders;
CREATE TRIGGER trg_pos_orders_set_mode BEFORE INSERT OR UPDATE ON public.pos_orders FOR EACH ROW EXECUTE FUNCTION public.pos_orders_set_mode_and_guard();

-- E. Payment validation fix (player_charge) + complimentary close
CREATE OR REPLACE FUNCTION public.pos_tabs_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_split jsonb;
  v_sum bigint;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.casino_id IS DISTINCT FROM OLD.casino_id
       OR NEW.shift_id IS DISTINCT FROM OLD.shift_id
       OR NEW.opened_by_user_id IS DISTINCT FROM OLD.opened_by_user_id
       OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
       OR NEW.player_id IS DISTINCT FROM OLD.player_id
       OR NEW.operation_mode IS DISTINCT FROM OLD.operation_mode
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'pos_tabs: identity fields are immutable.';
    END IF;

    IF OLD.status IN ('closed','voided') AND NEW.status = 'open' THEN
      RAISE EXCEPTION 'pos_tabs: cannot reopen a closed or voided tab.';
    END IF;

    IF OLD.status = 'open' AND NEW.status = 'closed' THEN
      v_split := NEW.payment_split;
      IF v_split IS NULL THEN
        IF NEW.operation_mode = 'complimentary' THEN
          v_split := '{}'::jsonb; NEW.payment_split := v_split;
        ELSE
          RAISE EXCEPTION 'pos_tabs: payment_split required on close.';
        END IF;
      END IF;
      v_sum := COALESCE((v_split->>'cash')::bigint,0)
             + COALESCE((v_split->>'card')::bigint,0)
             + COALESCE((v_split->>'comp_player')::bigint,0)
             + COALESCE((v_split->>'comp_house')::bigint,0)
             + COALESCE((v_split->>'player_charge')::bigint,0);
      IF NEW.operation_mode = 'complimentary' THEN
        IF v_sum <> 0 OR NEW.total_tzs <> 0 THEN
          RAISE EXCEPTION 'pos_tabs: complimentary tabs close with zero value and no payment.';
        END IF;
      ELSIF v_sum <> NEW.total_tzs THEN
        RAISE EXCEPTION 'pos_tabs: payment_split sum (%) must equal total_tzs (%).', v_sum, NEW.total_tzs;
      END IF;
      IF COALESCE((v_split->>'comp_player')::bigint,0) > 0 AND NEW.player_id IS NULL THEN
        RAISE EXCEPTION 'pos_tabs: comp_player requires a player on the tab.';
      END IF;
      IF NEW.closed_at IS NULL THEN NEW.closed_at := now(); END IF;
      IF NEW.closed_by_user_id IS NULL THEN NEW.closed_by_user_id := auth.uid(); END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- C. Staff access + operator sessions (no direct client access; RPC only)
CREATE TABLE IF NOT EXISTS public.pos_staff_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  role text NOT NULL DEFAULT 'waiter' CHECK (role IN ('waiter','bartender')),
  is_active boolean NOT NULL DEFAULT true,
  pin_hash text,
  pin_set_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, employee_id)
);
GRANT ALL ON public.pos_staff_access TO service_role;
ALTER TABLE public.pos_staff_access ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pos_operator_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  casino_id uuid NOT NULL REFERENCES public.casinos(id),
  terminal_user_id uuid NOT NULL,
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS pos_operator_sessions_emp_idx ON public.pos_operator_sessions(employee_id);
GRANT ALL ON public.pos_operator_sessions TO service_role;
ALTER TABLE public.pos_operator_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pos_pin_failures (
  id bigserial PRIMARY KEY,
  terminal_user_id uuid NOT NULL,
  casino_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pos_pin_failures_idx ON public.pos_pin_failures(terminal_user_id, at);
GRANT ALL ON public.pos_pin_failures TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.pos_pin_failures_id_seq TO service_role;
ALTER TABLE public.pos_pin_failures ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._pos_is_manager(_casino uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(),'super_admin'::app_role)
      OR (public.has_role(auth.uid(),'pos_manager'::app_role) AND public.user_can_see_casino(auth.uid(), _casino));
$$;

CREATE OR REPLACE FUNCTION public.pos_staff_access_list(_casino_id uuid)
RETURNS TABLE(employee_id uuid, full_name text, "position" text, department text,
              access_active boolean, pin_set boolean, pin_set_at timestamptz, role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public._pos_is_manager(_casino_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY
  SELECT e.id, e.full_name, e.position, e.department,
         COALESCE(a.is_active,false), (a.pin_hash IS NOT NULL), a.pin_set_at, a.role
    FROM public.employees e
    LEFT JOIN public.pos_staff_access a ON a.employee_id = e.id AND a.casino_id = _casino_id
   WHERE e.casino_id = _casino_id AND e.deleted_at IS NULL
     AND (a.id IS NOT NULL
          OR e.position ~* '(wait|bar|server|serv|pos)'
          OR e.department ~* '(bar|wait|restaurant|f ?& ?b|food|pos)')
   ORDER BY e.full_name;
END $$;

CREATE OR REPLACE FUNCTION public.pos_staff_set_pin(_casino_id uuid, _employee_id uuid, _pin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE r record;
BEGIN
  IF NOT public._pos_is_manager(_casino_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _pin IS NULL OR _pin !~ '^[0-9]{4,6}$' THEN RAISE EXCEPTION 'PIN must be 4–6 digits.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = _employee_id AND casino_id = _casino_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Employee not found in this casino.';
  END IF;
  FOR r IN SELECT pin_hash FROM public.pos_staff_access
            WHERE casino_id = _casino_id AND is_active AND pin_hash IS NOT NULL AND employee_id <> _employee_id LOOP
    IF extensions.crypt(_pin, r.pin_hash) = r.pin_hash THEN
      RAISE EXCEPTION 'This PIN is already in use in this casino. Choose another.';
    END IF;
  END LOOP;
  INSERT INTO public.pos_staff_access (casino_id, employee_id, is_active, pin_hash, pin_set_at, created_by, updated_by)
  VALUES (_casino_id, _employee_id, true, extensions.crypt(_pin, extensions.gen_salt('bf', 8)), now(), auth.uid(), auth.uid())
  ON CONFLICT (casino_id, employee_id) DO UPDATE
    SET is_active = true, pin_hash = EXCLUDED.pin_hash, pin_set_at = now(), updated_by = auth.uid(), updated_at = now();
  UPDATE public.pos_operator_sessions SET revoked_at = now()
   WHERE employee_id = _employee_id AND casino_id = _casino_id AND revoked_at IS NULL;
  INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
  VALUES (_casino_id, 'system', 'pos_staff_pin_set', jsonb_build_object('employee_id', _employee_id), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.pos_staff_disable(_casino_id uuid, _employee_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public._pos_is_manager(_casino_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE public.pos_staff_access SET is_active = false, updated_by = auth.uid(), updated_at = now()
   WHERE casino_id = _casino_id AND employee_id = _employee_id;
  UPDATE public.pos_operator_sessions SET revoked_at = now()
   WHERE employee_id = _employee_id AND casino_id = _casino_id AND revoked_at IS NULL;
  INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
  VALUES (_casino_id, 'system', 'pos_staff_disabled', jsonb_build_object('employee_id', _employee_id), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.pos_operator_unlock(_casino_id uuid, _pin text)
RETURNS TABLE(token text, employee_id uuid, full_name text, role text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE r record; v_token text; v_exp timestamptz; v_fail int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_can_see_casino(auth.uid(), _casino_id)
     OR NOT (public.has_any_pos_role(auth.uid()) OR public.has_role(auth.uid(),'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT count(*) INTO v_fail FROM public.pos_pin_failures
   WHERE terminal_user_id = auth.uid() AND at > now() - interval '5 minutes';
  IF v_fail >= 5 THEN RAISE EXCEPTION 'Too many attempts. Wait a few minutes and try again.'; END IF;

  IF _pin ~ '^[0-9]{4,6}$' THEN
    FOR r IN SELECT a.employee_id AS eid, a.role AS arole, a.pin_hash, e.full_name AS fname
               FROM public.pos_staff_access a JOIN public.employees e ON e.id = a.employee_id
              WHERE a.casino_id = _casino_id AND a.is_active AND a.pin_hash IS NOT NULL AND e.deleted_at IS NULL LOOP
      IF extensions.crypt(_pin, r.pin_hash) = r.pin_hash THEN
        v_token := encode(extensions.gen_random_bytes(32), 'hex');
        v_exp := now() + interval '12 hours';
        INSERT INTO public.pos_operator_sessions (token_hash, casino_id, terminal_user_id, employee_id, expires_at)
        VALUES (encode(extensions.digest(v_token, 'sha256'), 'hex'), _casino_id, auth.uid(), r.eid, v_exp);
        INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
        VALUES (_casino_id, 'system', 'pos_operator_unlock', jsonb_build_object('employee_id', r.eid), auth.uid());
        RETURN QUERY SELECT v_token, r.eid, r.fname, r.arole, v_exp;
        RETURN;
      END IF;
    END LOOP;
  END IF;
  INSERT INTO public.pos_pin_failures (terminal_user_id, casino_id) VALUES (auth.uid(), _casino_id);
  RAISE EXCEPTION 'Invalid PIN.';
END $$;

CREATE OR REPLACE FUNCTION public.pos_operator_lock(_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
BEGIN
  UPDATE public.pos_operator_sessions SET revoked_at = now()
   WHERE token_hash = encode(extensions.digest(_token, 'sha256'), 'hex')
     AND terminal_user_id = auth.uid() AND revoked_at IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public._pos_operator_employee(_token text, _casino_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE v uuid;
BEGIN
  SELECT s.employee_id INTO v FROM public.pos_operator_sessions s
    JOIN public.pos_staff_access a ON a.employee_id = s.employee_id AND a.casino_id = s.casino_id AND a.is_active
   WHERE s.token_hash = encode(extensions.digest(COALESCE(_token,''), 'sha256'), 'hex')
     AND s.casino_id = _casino_id AND s.terminal_user_id = auth.uid()
     AND s.revoked_at IS NULL AND s.expires_at > now();
  IF v IS NULL THEN RAISE EXCEPTION 'OPERATOR_LOCKED: unlock with your PIN.'; END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.pos_create_order(
  _token text, _tab_id uuid, _item_id uuid, _qty numeric,
  _notes text DEFAULT NULL, _modifier_ids uuid[] DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t record; it record; v_emp uuid; v_order uuid; v_oi uuid; v_price bigint; m record;
BEGIN
  SELECT * INTO t FROM public.pos_tabs WHERE id = _tab_id;
  IF t.id IS NULL OR t.status <> 'open' THEN RAISE EXCEPTION 'Tab is not open.'; END IF;
  IF NOT public.user_can_see_casino(auth.uid(), t.casino_id)
     OR NOT (public.has_any_pos_role(auth.uid()) OR public.has_role(auth.uid(),'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  v_emp := public._pos_operator_employee(_token, t.casino_id);
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Quantity must be positive.'; END IF;

  SELECT * INTO it FROM public.pos_menu_items WHERE id = _item_id AND casino_id = t.casino_id AND is_active;
  IF it.id IS NULL THEN RAISE EXCEPTION 'Menu item not available.'; END IF;
  IF t.operation_mode = 'complimentary' THEN
    v_price := 0;
  ELSE
    IF it.price_tzs IS NULL THEN RAISE EXCEPTION 'Item has no selling price for paid mode.'; END IF;
    v_price := it.price_tzs;
  END IF;

  PERFORM set_config('pos.operator_rpc','on', true);
  INSERT INTO public.pos_orders (casino_id, shift_id, tab_id, waiter_user_id, status, notes, ordered_by_employee_id, pos_location_id)
  VALUES (t.casino_id, t.shift_id, t.id, auth.uid(), 'pending', NULLIF(trim(_notes),''), v_emp, t.pos_location_id)
  RETURNING id INTO v_order;
  PERFORM set_config('pos.operator_rpc','', true);

  INSERT INTO public.pos_order_items (order_id, item_id, item_name, qty, unit_price_tzs, line_total_tzs)
  VALUES (v_order, it.id, it.name, _qty, v_price, round(v_price * _qty))
  RETURNING id INTO v_oi;

  FOR m IN SELECT id, name, price_tzs_delta FROM public.pos_modifiers
            WHERE casino_id = t.casino_id AND is_active AND id = ANY(COALESCE(_modifier_ids,'{}')) LOOP
    INSERT INTO public.pos_order_item_modifiers (order_item_id, modifier_id, modifier_name_snapshot, price_tzs_delta_snapshot)
    VALUES (v_oi, m.id, m.name, CASE WHEN t.operation_mode = 'complimentary' THEN 0 ELSE m.price_tzs_delta END);
  END LOOP;
  RETURN v_order;
END $$;

-- Employee names for POS displays (only employees with POS access in visible casinos)
CREATE OR REPLACE FUNCTION public.pos_employee_names(_ids uuid[])
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT e.id, e.full_name FROM public.employees e
   WHERE e.id = ANY(_ids)
     AND (public.has_any_pos_role(auth.uid()) OR public.has_role(auth.uid(),'super_admin'::app_role))
     AND public.user_can_see_casino(auth.uid(), e.casino_id)
     AND EXISTS (SELECT 1 FROM public.pos_staff_access a WHERE a.employee_id = e.id);
$$;

REVOKE ALL ON FUNCTION public._pos_operator_employee(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_staff_access_list(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pos_staff_set_pin(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pos_staff_disable(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pos_operator_unlock(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pos_operator_lock(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pos_create_order(text, uuid, uuid, numeric, text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pos_employee_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_staff_access_list(uuid), public.pos_staff_set_pin(uuid, uuid, text),
  public.pos_staff_disable(uuid, uuid), public.pos_operator_unlock(uuid, text), public.pos_operator_lock(text),
  public.pos_create_order(text, uuid, uuid, numeric, text, uuid[]), public.pos_employee_names(uuid[]) TO authenticated;