
CREATE OR REPLACE FUNCTION public.boss_fx_rate(_casino_id uuid, _currency text, _date date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT r.rate_to_tzs FROM public.fin_daily_rates r
      WHERE r.casino_id = _casino_id
        AND upper(r.currency) = upper(COALESCE(_currency,'TZS'))
        AND r.business_date <= _date
      ORDER BY r.business_date DESC LIMIT 1),
    (SELECT e.rate_to_tzs FROM public.cage_slots_exchange_rates e
      WHERE e.casino_id = _casino_id
        AND upper(e.currency_code) = upper(COALESCE(_currency,'TZS'))
      ORDER BY e.created_at DESC LIMIT 1),
    CASE upper(COALESCE(_currency,'TZS'))
      WHEN 'TZS' THEN 1 WHEN 'USD' THEN 2600 WHEN 'EUR' THEN 2800
      WHEN 'GBP' THEN 3000 WHEN 'KES' THEN 17 ELSE 1 END
  );
$$;

REVOKE EXECUTE ON FUNCTION public.boss_fx_rate(uuid, text, date) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.boss_monthly_report(uuid[], int, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.boss_fx_rate(uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.boss_monthly_report(uuid[], int, int) TO authenticated;
