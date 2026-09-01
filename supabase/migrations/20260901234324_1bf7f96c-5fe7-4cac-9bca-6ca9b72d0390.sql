CREATE OR REPLACE FUNCTION public.closing_inbox_skip(_inbox_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_inbox RECORD;
BEGIN
  SELECT * INTO v_inbox FROM closing_wallet_inbox WHERE id = _inbox_id FOR UPDATE;
  IF v_inbox.id IS NULL THEN
    RAISE EXCEPTION 'inbox not found';
  END IF;
  IF NOT (has_role(v_uid, 'super_admin'::app_role)
          OR ((can_manage(v_uid) OR can_finance(v_uid)) AND has_casino_scope(v_uid, v_inbox.casino_id))) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF v_inbox.status = 'posted' THEN
    RETURN jsonb_build_object('status', 'already_posted', 'inbox_id', _inbox_id);
  END IF;
  IF v_inbox.status = 'skipped' THEN
    RETURN jsonb_build_object('status', 'already_skipped', 'inbox_id', _inbox_id);
  END IF;

  UPDATE closing_wallet_inbox
     SET status = 'skipped'
   WHERE id = _inbox_id;

  RETURN jsonb_build_object('status', 'skipped', 'inbox_id', _inbox_id, 'reason', _reason);
END
$function$;

GRANT EXECUTE ON FUNCTION public.closing_inbox_skip(uuid, text) TO authenticated;

-- Audit: status changes (skip and post) land in fin_audit_log via the shared generic trigger.
CREATE TRIGGER tg_fin_audit
  AFTER UPDATE ON public.closing_wallet_inbox
  FOR EACH ROW EXECUTE FUNCTION public.tg_fin_audit();