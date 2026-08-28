REVOKE ALL ON FUNCTION public.finance_hub_notify_gc() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_hub_notify_gc() TO service_role;
REVOKE ALL ON FUNCTION public.tg_finance_hub_notify() FROM PUBLIC, anon, authenticated;