
-- Allow floor_manager (and cashier_slots) to create player notes
DROP POLICY IF EXISTS "Authorized roles create player notes" ON public.player_notes;
CREATE POLICY "Authorized roles create player notes"
ON public.player_notes
FOR INSERT TO authenticated
WITH CHECK (
  (created_by = auth.uid()) AND (
    (
      (casino_id = get_user_casino_id(auth.uid())) AND (
        has_role(auth.uid(), 'reception'::app_role)
        OR has_role(auth.uid(), 'pit'::app_role)
        OR has_role(auth.uid(), 'floor_manager'::app_role)
        OR has_role(auth.uid(), 'cashier'::app_role)
        OR has_role(auth.uid(), 'cashier_slots'::app_role)
        OR has_role(auth.uid(), 'manager'::app_role)
        OR has_role(auth.uid(), 'finance_manager'::app_role)
      )
    )
    OR (has_role(auth.uid(), 'surveillance'::app_role) AND user_has_casino_access(auth.uid(), casino_id))
    OR has_role(auth.uid(), 'account_manager'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
);

-- Scope player UPDATE by casino for non-admin roles (fixes cross-casino write escalation).
-- super_admin and account_manager remain network-wide.
DROP POLICY IF EXISTS "Authorized roles update players" ON public.players;
CREATE POLICY "Authorized roles update players"
ON public.players
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'account_manager'::app_role)
  OR (
    casino_id = get_user_casino_id(auth.uid())
    AND (
      has_role(auth.uid(), 'reception'::app_role)
      OR has_role(auth.uid(), 'pit'::app_role)
      OR has_role(auth.uid(), 'floor_manager'::app_role)
      OR has_role(auth.uid(), 'cashier'::app_role)
      OR has_role(auth.uid(), 'cashier_slots'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'finance_manager'::app_role)
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'account_manager'::app_role)
  OR (
    casino_id = get_user_casino_id(auth.uid())
    AND (
      has_role(auth.uid(), 'reception'::app_role)
      OR has_role(auth.uid(), 'pit'::app_role)
      OR has_role(auth.uid(), 'floor_manager'::app_role)
      OR has_role(auth.uid(), 'cashier'::app_role)
      OR has_role(auth.uid(), 'cashier_slots'::app_role)
      OR has_role(auth.uid(), 'manager'::app_role)
      OR has_role(auth.uid(), 'finance_manager'::app_role)
    )
  )
);
