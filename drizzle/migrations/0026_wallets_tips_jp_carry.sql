ALTER FUNCTION public.fin_balance_snapshot(uuid, date, date) RENAME TO fin_balance_snapshot_base;

CREATE OR REPLACE FUNCTION public.fin_balance_snapshot(p_casino_id uuid, p_period_start date, p_period_end date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb := public.fin_balance_snapshot_base(p_casino_id, p_period_start, p_period_end);
  v_tips numeric := 0;
  v_jp numeric := 0;
BEGIN
  -- Start Month carry for Tips and JP, only for whole-month windows (same rule as Miss Chips)
  IF r IS NOT NULL AND p_period_start = date_trunc('month', p_period_start)::date THEN
    SELECT COALESCE(SUM(amount*COALESCE(fx_rate,1)) FILTER (WHERE source IN ('tips','tips_bonus')),0),
           COALESCE(SUM(amount*COALESCE(fx_rate,1)) FILTER (WHERE source = 'jp'),0)
      INTO v_tips, v_jp
      FROM fin_other_incomes
     WHERE casino_id = p_casino_id AND business_date < p_period_start
       AND reverses_id IS NULL AND reversed_by_id IS NULL;
    r := jsonb_set(r, '{incomes,tips_bonus}', to_jsonb(COALESCE((r#>>'{incomes,tips_bonus}')::numeric,0) + v_tips));
    r := jsonb_set(r, '{incomes,jp}', to_jsonb(COALESCE((r#>>'{incomes,jp}')::numeric,0) + v_jp));
  END IF;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.fin_balance_snapshot_base(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_balance_snapshot(uuid, date, date) TO authenticated;