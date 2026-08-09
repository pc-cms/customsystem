CREATE OR REPLACE FUNCTION public.chip_float_daily(_casino_id uuid, _from date, _to date)
RETURNS TABLE(date date, denomination numeric, quantity numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT x.date, x.denomination, SUM(x.actual_quantity)::numeric AS quantity
  FROM (
    SELECT DISTINCT ON (cs.date, cs.location_id, cs.denomination)
      cs.date, cs.denomination, COALESCE(cs.actual_quantity, 0) AS actual_quantity
    FROM public.chip_snapshots cs
    WHERE cs.casino_id = _casino_id
      AND cs.date BETWEEN _from AND _to
      AND public.has_casino_scope(auth.uid(), cs.casino_id)
    ORDER BY cs.date, cs.location_id, cs.denomination, cs.created_at DESC, cs.id DESC
  ) x
  GROUP BY x.date, x.denomination
$$;

GRANT EXECUTE ON FUNCTION public.chip_float_daily(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chip_float_daily(uuid, date, date) TO service_role;