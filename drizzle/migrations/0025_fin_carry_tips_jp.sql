CREATE OR REPLACE FUNCTION public.fin_carry(p_casino_id uuid, p_month_start date, p_source text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(o.amount * COALESCE(o.fx_rate,1)),0)
  FROM fin_other_incomes o
  WHERE o.casino_id = p_casino_id
    AND o.business_date < p_month_start
    AND o.reverses_id IS NULL AND o.reversed_by_id IS NULL
    AND (CASE WHEN p_source = 'tips' THEN o.source IN ('tips','tips_bonus') ELSE o.source = p_source END)
    AND (public.can_view_all_casinos(auth.uid()) OR public.user_has_casino_access(auth.uid(), p_casino_id));
$$;
GRANT EXECUTE ON FUNCTION public.fin_carry(uuid, date, text) TO authenticated;