-- Players are a global base shared across the network.
-- Old UPDATE policy required players.casino_id = caller's casino, which silently
-- blocked edits to players registered at another casino (RLS returns 0 rows,
-- no error). Allow authorized roles to update any player they have casino
-- access to via user_has_casino_access (same scope as the SELECT policy),
-- plus network-wide roles.

DROP POLICY IF EXISTS "Authorized roles update players" ON public.players;

CREATE POLICY "Authorized roles update players"
ON public.players
FOR UPDATE
USING (
  (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
    OR has_role(auth.uid(), 'account_manager'::app_role)
    OR user_has_casino_access(auth.uid(), casino_id)
  )
  AND (
    has_role(auth.uid(), 'reception'::app_role)
    OR has_role(auth.uid(), 'pit'::app_role)
    OR has_role(auth.uid(), 'cashier'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'account_manager'::app_role)
  )
)
WITH CHECK (
  (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
    OR has_role(auth.uid(), 'account_manager'::app_role)
    OR user_has_casino_access(auth.uid(), casino_id)
  )
  AND (
    has_role(auth.uid(), 'reception'::app_role)
    OR has_role(auth.uid(), 'pit'::app_role)
    OR has_role(auth.uid(), 'cashier'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'account_manager'::app_role)
  )
);