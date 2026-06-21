
-- 1. New columns on pos_orders
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS is_problem boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS problem_reason text,
  ADD COLUMN IF NOT EXISTS problem_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS problem_marked_by uuid,
  ADD COLUMN IF NOT EXISTS force_closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS force_closed_by uuid,
  ADD COLUMN IF NOT EXISTS force_close_reason text,
  ADD COLUMN IF NOT EXISTS closed_by_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_closed_at timestamptz;

-- 2. Strict player_id required on pos_tabs INSERT
CREATE OR REPLACE FUNCTION public.pos_tabs_require_player()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.player_id IS NULL THEN
    RAISE EXCEPTION 'PLAYER_REQUIRED_FOR_NEW_TAB: every new POS tab must be linked to a registered player.'
      USING HINT = 'Register the customer as a Player first, then open the tab. Walk-in tabs are no longer allowed.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_tabs_require_player ON public.pos_tabs;
CREATE TRIGGER trg_pos_tabs_require_player
  BEFORE INSERT ON public.pos_tabs
  FOR EACH ROW EXECUTE FUNCTION public.pos_tabs_require_player();

-- 3. Force-close guard: block on pending orders
CREATE OR REPLACE FUNCTION public.pos_orders_force_close_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.force_closed_at IS NULL AND NEW.force_closed_at IS NOT NULL THEN
    IF OLD.status = 'pending' THEN
      RAISE EXCEPTION 'FORCE_CLOSE_NOT_ALLOWED_FOR_PENDING: pending orders must be accepted by the bartender or voided/marked as problem — not force-closed.'
        USING HINT = 'Force-close is only permitted for orders that are already preparing, ready, or served.';
    END IF;
    -- Stamp closed_by_system explicitly false for manager-driven force close
    NEW.closed_by_system := false;
    -- Advance order to served so it disappears from active queues
    IF NEW.status IN ('pending','preparing','ready') THEN
      NEW.status := 'served';
      IF NEW.served_at IS NULL THEN
        NEW.served_at := now();
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_orders_force_close_guard ON public.pos_orders;
CREATE TRIGGER trg_pos_orders_force_close_guard
  BEFORE UPDATE ON public.pos_orders
  FOR EACH ROW EXECUTE FUNCTION public.pos_orders_force_close_guard();

-- 4. Auto-close after Ready
CREATE OR REPLACE FUNCTION public.pos_orders_auto_close_on_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'preparing' AND NEW.status = 'ready' THEN
    IF NEW.ready_at IS NULL THEN
      NEW.ready_at := now();
    END IF;
    NEW.status := 'served';
    NEW.served_at := COALESCE(NEW.served_at, now());
    NEW.closed_by_system := true;
    NEW.auto_closed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_orders_auto_close_on_ready ON public.pos_orders;
-- Name sorts AFTER force_close_guard so guard fires first
CREATE TRIGGER trg_pos_orders_zz_auto_close_on_ready
  BEFORE UPDATE OF status ON public.pos_orders
  FOR EACH ROW EXECUTE FUNCTION public.pos_orders_auto_close_on_ready();

-- 5. Manager-action audit
CREATE OR REPLACE FUNCTION public.pos_orders_audit_manager_actions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(OLD.is_problem,false) = false AND COALESCE(NEW.is_problem,false) = true THEN
    INSERT INTO public.activity_logs(actor_user_id, action, entity_type, entity_id, casino_id, metadata)
    VALUES (auth.uid(), 'pos_order_marked_problem', 'pos_order', NEW.id, NEW.casino_id,
      jsonb_build_object('reason', NEW.problem_reason));
  END IF;
  IF OLD.force_closed_at IS NULL AND NEW.force_closed_at IS NOT NULL THEN
    INSERT INTO public.activity_logs(actor_user_id, action, entity_type, entity_id, casino_id, metadata)
    VALUES (auth.uid(), 'pos_order_force_closed', 'pos_order', NEW.id, NEW.casino_id,
      jsonb_build_object('reason', NEW.force_close_reason, 'prev_status', OLD.status));
  END IF;
  IF OLD.auto_closed_at IS NULL AND NEW.auto_closed_at IS NOT NULL THEN
    INSERT INTO public.activity_logs(actor_user_id, action, entity_type, entity_id, casino_id, metadata)
    VALUES (auth.uid(), 'pos_order_auto_closed', 'pos_order', NEW.id, NEW.casino_id, '{}'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_orders_audit_manager_actions ON public.pos_orders;
CREATE TRIGGER trg_pos_orders_audit_manager_actions
  AFTER UPDATE ON public.pos_orders
  FOR EACH ROW EXECUTE FUNCTION public.pos_orders_audit_manager_actions();

-- 6. Player search RPC (no money fields)
CREATE OR REPLACE FUNCTION public.pos_player_search(_casino_id uuid, _q text)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  nickname text,
  category text,
  phone_masked text,
  home_casino_id uuid,
  matched_card boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_q text := trim(coalesce(_q,''));
  v_like text;
BEGIN
  IF v_q = '' OR length(v_q) < 2 THEN
    RETURN;
  END IF;
  v_like := '%' || v_q || '%';

  RETURN QUERY
  SELECT
    p.id,
    p.first_name,
    p.last_name,
    p.nickname,
    p.category::text,
    CASE
      WHEN p.phone IS NULL OR length(p.phone) < 4 THEN p.phone
      ELSE repeat('•', greatest(length(p.phone)-4,0)) || right(p.phone,4)
    END AS phone_masked,
    p.casino_id AS home_casino_id,
    EXISTS (
      SELECT 1 FROM public.player_cards pc
      WHERE pc.player_id = p.id
        AND (pc.card_number ILIKE v_like OR pc.rfid_uid ILIKE v_like)
    ) AS matched_card
  FROM public.players p
  WHERE
       p.first_name ILIKE v_like
    OR p.last_name  ILIKE v_like
    OR p.nickname   ILIKE v_like
    OR p.phone      ILIKE v_like
    OR p.id_number  ILIKE v_like
    OR EXISTS (
      SELECT 1 FROM public.player_cards pc
      WHERE pc.player_id = p.id
        AND (pc.card_number ILIKE v_like OR pc.rfid_uid ILIKE v_like)
    )
  ORDER BY
    (p.first_name ILIKE (v_q || '%')) DESC,
    (p.last_name  ILIKE (v_q || '%')) DESC,
    p.last_name NULLS LAST,
    p.first_name NULLS LAST
  LIMIT 30;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_player_search(uuid, text) TO authenticated;
