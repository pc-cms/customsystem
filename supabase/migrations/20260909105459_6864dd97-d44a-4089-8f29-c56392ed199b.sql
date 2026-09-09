CREATE POLICY "Managers cancel current-day expenses"
ON public.expenses
FOR DELETE
TO authenticated
USING (
  has_casino_scope(auth.uid(), casino_id)
  AND is_manager_op(auth.uid())
  AND business_date = business_date_of(now())
);