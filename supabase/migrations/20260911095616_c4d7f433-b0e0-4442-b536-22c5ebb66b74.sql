GRANT UPDATE ON public.request_metrics TO authenticated;

CREATE POLICY "Users update own request metrics"
ON public.request_metrics
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());