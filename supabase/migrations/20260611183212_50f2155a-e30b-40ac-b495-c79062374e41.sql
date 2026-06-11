DROP POLICY IF EXISTS "super_admin can manage club_account_secrets" ON public.club_account_secrets;

CREATE POLICY "super_admin can write club_account_secrets"
ON public.club_account_secrets
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "super_admin can update club_account_secrets"
ON public.club_account_secrets
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "super_admin can delete club_account_secrets"
ON public.club_account_secrets
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Users read own credentials" ON public.user_credentials;