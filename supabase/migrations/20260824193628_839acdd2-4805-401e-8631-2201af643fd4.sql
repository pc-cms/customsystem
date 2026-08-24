GRANT EXECUTE ON FUNCTION public.fin_month_finance(uuid, int, int) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.fin_liability_movement(uuid, date, date) TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.fin_liability_outstanding(uuid, date) TO supabase_read_only_user;