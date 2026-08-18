ALTER TABLE public.ace_finance_snapshots ADD COLUMN IF NOT EXISTS active_credits numeric;

DROP VIEW IF EXISTS public.ace_finance_latest;
CREATE VIEW public.ace_finance_latest
WITH (security_invoker = true) AS
SELECT DISTINCT ON (location_code) *
FROM public.ace_finance_snapshots
ORDER BY location_code, received_at DESC;

GRANT SELECT ON public.ace_finance_latest TO authenticated;
GRANT SELECT ON public.ace_finance_latest TO service_role;