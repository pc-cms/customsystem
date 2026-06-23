-- Allow Pit role to view, create and edit bank checks within their casino
-- (mirrors manager/finance_manager scope). Delete remains manager-only.

DROP POLICY IF EXISTS "Casino pit see bank checks" ON public.bank_checks;
CREATE POLICY "Casino pit see bank checks"
ON public.bank_checks FOR SELECT
TO authenticated
USING (
  casino_id = get_user_casino_id(auth.uid())
  AND has_role(auth.uid(), 'pit'::app_role)
);

DROP POLICY IF EXISTS "Casino pit insert bank checks" ON public.bank_checks;
CREATE POLICY "Casino pit insert bank checks"
ON public.bank_checks FOR INSERT
TO authenticated
WITH CHECK (
  casino_id = get_user_casino_id(auth.uid())
  AND created_by = auth.uid()
  AND has_role(auth.uid(), 'pit'::app_role)
);

DROP POLICY IF EXISTS "Casino pit update bank checks" ON public.bank_checks;
CREATE POLICY "Casino pit update bank checks"
ON public.bank_checks FOR UPDATE
TO authenticated
USING (
  casino_id = get_user_casino_id(auth.uid())
  AND has_role(auth.uid(), 'pit'::app_role)
);
