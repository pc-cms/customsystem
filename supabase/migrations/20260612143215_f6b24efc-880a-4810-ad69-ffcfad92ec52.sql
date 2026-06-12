-- Explicitly block direct INSERTs on consultation_requests from anon/authenticated roles.
-- Writes must go through the 'send-consultation' edge function using the service role.
DROP POLICY IF EXISTS "Block direct inserts on consultation_requests" ON public.consultation_requests;
CREATE POLICY "Block direct inserts on consultation_requests"
  ON public.consultation_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);