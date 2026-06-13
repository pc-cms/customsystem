-- 1. Rename role floor_manager → shift_manager (in-place; OIDs stable, all policies/functions/user_roles auto-update)
ALTER TYPE public.app_role RENAME VALUE 'floor_manager' TO 'shift_manager';

-- 2. Revert players UPDATE policy to network-wide editing for staff roles.
--    Players are GLOBAL (cross-casino) per project rule. Home casino is informational only.
DROP POLICY IF EXISTS "Authorized roles update players" ON public.players;

CREATE POLICY "Authorized roles update players"
ON public.players
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'account_manager'::app_role)
  OR has_role(auth.uid(), 'reception'::app_role)
  OR has_role(auth.uid(), 'pit'::app_role)
  OR has_role(auth.uid(), 'shift_manager'::app_role)
  OR has_role(auth.uid(), 'cashier'::app_role)
  OR has_role(auth.uid(), 'cashier_slots'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'finance_manager'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'account_manager'::app_role)
  OR has_role(auth.uid(), 'reception'::app_role)
  OR has_role(auth.uid(), 'pit'::app_role)
  OR has_role(auth.uid(), 'shift_manager'::app_role)
  OR has_role(auth.uid(), 'cashier'::app_role)
  OR has_role(auth.uid(), 'cashier_slots'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR has_role(auth.uid(), 'finance_manager'::app_role)
);

-- 3. Audit cross-casino player edits into activity_logs.
CREATE OR REPLACE FUNCTION public.log_cross_casino_player_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_log_cross_casino_player_edit ON public.players;
CREATE TRIGGER trg_log_cross_casino_player_edit
AFTER UPDATE ON public.players
FOR EACH ROW
EXECUTE FUNCTION public.log_cross_casino_player_edit();