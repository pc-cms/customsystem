REVOKE ALL ON TABLE public.finance_hub_notify_outbox FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_hub_notify_kick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_hub_notify_kick() TO service_role;