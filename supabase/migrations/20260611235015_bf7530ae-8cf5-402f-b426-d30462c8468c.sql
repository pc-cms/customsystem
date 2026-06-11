DROP POLICY IF EXISTS "Anyone can submit a consultation request" ON public.consultation_requests;
REVOKE INSERT ON public.consultation_requests FROM anon, authenticated;