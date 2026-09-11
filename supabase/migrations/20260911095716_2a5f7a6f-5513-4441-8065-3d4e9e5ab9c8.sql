CREATE POLICY "Users view own request metrics"
ON public.request_metrics
FOR SELECT
TO authenticated
USING (user_id = auth.uid());