
-- ============================================================================
-- POS Phase 1: Stock deduction timing, sale movements, void reversal,
-- player_charge validation, audit logging.
-- ============================================================================

-- 1. New tracking column for idempotent deduction
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS stock_deducted_at timestamptz;

COMMENT ON COLUMN public.pos_orders.stock_deducted_at IS
  'Set once when status first moves out of pending and stock is deducted. Idempotency guard.';

-- Mark legacy duplicate column as deprecated (code already uses voided_reason).
COMMENT ON COLUMN public.pos_orders.void_reason IS
  'DEPRECATED: use voided_reason. Kept for backward compatibility, not written by app code.';

-- 2. Enrich pos_inventory_movements with cross-references (nullable for back-compat)
ALTER TABLE public.pos_inventory_movements
  ADD COLUMN IF NOT EXISTS casino_id      uuid,
  ADD COLUMN IF NOT EXISTS business_date  date,
  ADD COLUMN IF NOT EXISTS reference_type text,
  ADD COLUMN IF NOT EXISTS reference_id   uuid;

CREATE INDEX IF NOT EXISTS pos_inv_mov_reference_idx
  ON public.pos_inventory_movements (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS pos_inv_mov_casino_created_idx
  ON public.pos_inventory_movements (casino_id, created_at DESC);

-- 3. Rewrite pos_order_items_after_insert: DROP stock deduction; only recompute order total.
CREATE OR REPLACE FUNCTION public.pos_order_items_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('pos.internal','on', true);
  UPDATE public.pos_orders
     SET total_tzs = COALESCE((
       SELECT SUM(line_total_tzs) FROM public.pos_order_items WHERE order_id = NEW.order_id
     ), 0)
   WHERE id = NEW.order_id;
  PERFORM set_config('pos.internal','', true);
  RETURN NEW;
END $function$;

-- 4. Stock lifecycle (deduct on bartender confirm, reverse on void) + audit
CREATE OR REPLACE FUNCTION public.pos_orders_stock_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item        RECORD;
  v_user        uuid;
  v_neg_count   int := 0;
  v_total_items int := 0;
BEGIN
  v_user := COALESCE(auth.uid(), NEW.voided_by, NEW.waiter_user_id);

  -- ── DEDUCT once on first move out of pending ─────────────────────────
  IF NEW.status IN ('preparing','ready','served')
     AND OLD.status = 'pending'
     AND NEW.stock_deducted_at IS NULL THEN

    FOR v_item IN
      SELECT oi.item_id, oi.qty, oi.item_name, mi.stock_qty AS before_qty
        FROM public.pos_order_items oi
        JOIN public.pos_menu_items  mi ON mi.id = oi.item_id
       WHERE oi.order_id = NEW.id
         AND mi.stock_qty IS NOT NULL
    LOOP
      INSERT INTO public.pos_inventory_movements (
        item_id, delta, reason, user_id,
        casino_id, business_date, reference_type, reference_id
      ) VALUES (
        v_item.item_id, -v_item.qty, 'sale', v_user,
        NEW.casino_id, NEW.business_date, 'pos_order', NEW.id
      );
      v_total_items := v_total_items + 1;

      IF (v_item.before_qty - v_item.qty) < 0 AND v_user IS NOT NULL THEN
        v_neg_count := v_neg_count + 1;
        INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
        VALUES (NEW.casino_id, 'system', 'pos_stock_negative',
          jsonb_build_object(
            'order_id',   NEW.id,
            'tab_id',     NEW.tab_id,
            'item_id',    v_item.item_id,
            'item_name',  v_item.item_name,
            'qty',        v_item.qty,
            'before_qty', v_item.before_qty,
            'after_qty',  v_item.before_qty - v_item.qty
          ),
          v_user);
      END IF;
    END LOOP;

    PERFORM set_config('pos.internal','on', true);
    UPDATE public.pos_orders SET stock_deducted_at = now() WHERE id = NEW.id;
    PERFORM set_config('pos.internal','', true);

    IF v_user IS NOT NULL THEN
      INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
      VALUES (NEW.casino_id, 'system', 'pos_order_confirmed',
        jsonb_build_object(
          'order_id',        NEW.id,
          'tab_id',          NEW.tab_id,
          'items_deducted',  v_total_items,
          'negative_items',  v_neg_count,
          'new_status',      NEW.status
        ),
        v_user);
    END IF;
  END IF;

  -- ── RESTORE on void if previously deducted ────────────────────────────
  IF NEW.status = 'void' AND OLD.status <> 'void' THEN
    IF NEW.stock_deducted_at IS NOT NULL THEN
      FOR v_item IN
        SELECT oi.item_id, oi.qty
          FROM public.pos_order_items oi
          JOIN public.pos_menu_items  mi ON mi.id = oi.item_id
         WHERE oi.order_id = NEW.id
           AND mi.stock_qty IS NOT NULL
      LOOP
        INSERT INTO public.pos_inventory_movements (
          item_id, delta, reason, user_id,
          casino_id, business_date, reference_type, reference_id
        ) VALUES (
          v_item.item_id, v_item.qty, 'order_void_reversal', v_user,
          NEW.casino_id, NEW.business_date, 'pos_order', NEW.id
        );
      END LOOP;
    END IF;

    IF v_user IS NOT NULL THEN
      INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
      VALUES (NEW.casino_id, 'system', 'pos_order_voided',
        jsonb_build_object(
          'order_id',       NEW.id,
          'tab_id',         NEW.tab_id,
          'reason',         COALESCE(NEW.voided_reason, NEW.void_reason),
          'stock_restored', NEW.stock_deducted_at IS NOT NULL,
          'prior_status',   OLD.status
        ),
        v_user);
    END IF;
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS pos_orders_stock_lifecycle ON public.pos_orders;
CREATE TRIGGER pos_orders_stock_lifecycle
  AFTER UPDATE OF status ON public.pos_orders
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.pos_orders_stock_lifecycle();

-- 5. player_charge requires player_id — BEFORE tab close
CREATE OR REPLACE FUNCTION public.pos_tabs_validate_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_charge bigint;
  v_comp_p bigint;
BEGIN
  IF NEW.status = 'closed' AND COALESCE(OLD.status,'') <> 'closed' THEN
    v_charge := COALESCE((NEW.payment_split->>'player_charge')::bigint, 0);
    v_comp_p := COALESCE((NEW.payment_split->>'comp_player')::bigint, 0);

    IF v_charge > 0 AND NEW.player_id IS NULL THEN
      RAISE EXCEPTION
        'PLAYER_CHARGE_REQUIRES_PLAYER: Player Charge can only be used for linked player tabs.';
    END IF;

    IF v_comp_p > 0 AND NEW.player_id IS NULL THEN
      RAISE EXCEPTION
        'COMP_PLAYER_REQUIRES_PLAYER: Comp · player can only be used for linked player tabs.';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS pos_tabs_validate_close ON public.pos_tabs;
CREATE TRIGGER pos_tabs_validate_close
  BEFORE UPDATE ON public.pos_tabs
  FOR EACH ROW
  EXECUTE FUNCTION public.pos_tabs_validate_close();

-- 6. Audit log for tab lifecycle
CREATE OR REPLACE FUNCTION public.pos_tabs_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_act  text;
  v_det  jsonb;
BEGIN
  v_user := COALESCE(auth.uid(), NEW.opened_by_user_id);

  IF TG_OP = 'INSERT' THEN
    v_act := 'pos_tab_opened';
    v_det := jsonb_build_object(
      'tab_id',       NEW.id,
      'shift_id',     NEW.shift_id,
      'player_id',    NEW.player_id,
      'player_name',  NEW.player_name,
      'walkin_label', NEW.walkin_label
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'closed' AND OLD.status <> 'closed' THEN
    v_act := 'pos_tab_closed';
    v_det := jsonb_build_object(
      'tab_id',        NEW.id,
      'total_tzs',     NEW.total_tzs,
      'payment_split', NEW.payment_split,
      'player_id',     NEW.player_id
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'voided' AND OLD.status <> 'voided' THEN
    v_act := 'pos_tab_voided';
    v_det := jsonb_build_object(
      'tab_id', NEW.id,
      'reason', NEW.void_reason
    );
  ELSE
    RETURN NEW;
  END IF;

  IF v_user IS NOT NULL THEN
    INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
    VALUES (NEW.casino_id, 'system', v_act, v_det, v_user);
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS pos_tabs_audit ON public.pos_tabs;
CREATE TRIGGER pos_tabs_audit
  AFTER INSERT OR UPDATE ON public.pos_tabs
  FOR EACH ROW
  EXECUTE FUNCTION public.pos_tabs_audit();

-- 7. Audit log for orders insert (waiter creates order)
CREATE OR REPLACE FUNCTION public.pos_orders_audit_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
BEGIN
  v_user := COALESCE(auth.uid(), NEW.waiter_user_id);
  IF v_user IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
  VALUES (NEW.casino_id, 'system', 'pos_order_created',
    jsonb_build_object('order_id', NEW.id, 'tab_id', NEW.tab_id),
    v_user);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS pos_orders_audit_insert ON public.pos_orders;
CREATE TRIGGER pos_orders_audit_insert
  AFTER INSERT ON public.pos_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.pos_orders_audit_insert();

-- 8. Audit log for player charges (create/settle/void)
CREATE OR REPLACE FUNCTION public.pos_player_charges_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_act  text;
  v_det  jsonb;
BEGIN
  v_user := COALESCE(auth.uid(), NEW.settled_by);

  IF TG_OP = 'INSERT' THEN
    v_act := 'pos_player_charge_created';
    v_det := jsonb_build_object(
      'charge_id', NEW.id, 'tab_id', NEW.tab_id,
      'player_id', NEW.player_id, 'amount_tzs', NEW.amount_tzs
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'settled' AND OLD.status <> 'settled' THEN
    v_act := 'pos_player_charge_settled';
    v_det := jsonb_build_object(
      'charge_id', NEW.id, 'amount_tzs', NEW.amount_tzs,
      'ref', NEW.settlement_ref
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'voided' AND OLD.status <> 'voided' THEN
    v_act := 'pos_player_charge_voided';
    v_det := jsonb_build_object(
      'charge_id', NEW.id, 'amount_tzs', NEW.amount_tzs,
      'reason', NEW.void_reason
    );
  ELSE
    RETURN NEW;
  END IF;

  IF v_user IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
  VALUES (NEW.casino_id, 'system', v_act, v_det, v_user);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS pos_player_charges_audit ON public.pos_player_charges;
CREATE TRIGGER pos_player_charges_audit
  AFTER INSERT OR UPDATE ON public.pos_player_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.pos_player_charges_audit();

-- 9. Audit log for manual inventory adjustments + comp budget overrides
CREATE OR REPLACE FUNCTION public.pos_inventory_audit_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_cas  uuid;
BEGIN
  -- Only audit MANUAL adjustments (sale + order_void_reversal already audited via pos_orders_stock_lifecycle).
  IF NEW.reason IN ('sale','order_void_reversal') THEN
    RETURN NEW;
  END IF;

  v_user := COALESCE(auth.uid(), NEW.user_id);
  IF v_user IS NULL THEN RETURN NEW; END IF;

  v_cas := NEW.casino_id;
  IF v_cas IS NULL THEN
    SELECT casino_id INTO v_cas FROM public.pos_menu_items WHERE id = NEW.item_id;
  END IF;
  IF v_cas IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
  VALUES (v_cas, 'system', 'pos_inventory_adjustment',
    jsonb_build_object(
      'movement_id', NEW.id, 'item_id', NEW.item_id,
      'delta', NEW.delta, 'reason', NEW.reason,
      'reference_type', NEW.reference_type, 'reference_id', NEW.reference_id
    ),
    v_user);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS pos_inventory_audit_insert ON public.pos_inventory_movements;
CREATE TRIGGER pos_inventory_audit_insert
  AFTER INSERT ON public.pos_inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.pos_inventory_audit_insert();

CREATE OR REPLACE FUNCTION public.pos_comp_override_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.manager_user_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.activity_logs (casino_id, category, action, details, operator_id)
  VALUES (NEW.casino_id, 'system', 'pos_comp_budget_override',
    jsonb_build_object(
      'override_id', NEW.id, 'tab_id', NEW.tab_id,
      'amount_tzs', NEW.amount_tzs, 'month_start', NEW.month_start,
      'reason', NEW.reason
    ),
    NEW.manager_user_id);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS pos_comp_override_audit ON public.pos_comp_budget_overrides;
CREATE TRIGGER pos_comp_override_audit
  AFTER INSERT ON public.pos_comp_budget_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.pos_comp_override_audit();

-- 10. RPC for waiter-facing player POS status (Allowed / Warning / Need Approval)
-- Returns a single text status without exposing numeric balances to non-managers.
CREATE OR REPLACE FUNCTION public.pos_player_status(_player_id uuid, _casino_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_open_count int;
  v_budget     record;
BEGIN
  IF _player_id IS NULL OR _casino_id IS NULL THEN
    RETURN 'allowed';
  END IF;

  SELECT COUNT(*) INTO v_open_count
    FROM public.pos_player_charges
   WHERE player_id = _player_id
     AND casino_id = _casino_id
     AND status = 'open';

  -- Budget snapshot for current month (NULL-safe; treats missing budget as 'allowed').
  SELECT * INTO v_budget FROM public.pos_comp_budget_status(_casino_id, NULL::date);

  IF v_budget.is_over IS TRUE THEN
    RETURN 'approval';
  END IF;

  IF v_open_count >= 3 THEN
    RETURN 'warning';
  END IF;

  IF v_budget.percent_used IS NOT NULL AND v_budget.percent_used >= 80 THEN
    RETURN 'warning';
  END IF;

  IF v_open_count > 0 THEN
    RETURN 'warning';
  END IF;

  RETURN 'allowed';
END $function$;

GRANT EXECUTE ON FUNCTION public.pos_player_status(uuid, uuid) TO authenticated;
