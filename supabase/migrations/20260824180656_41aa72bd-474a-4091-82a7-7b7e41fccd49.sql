DO $do$
DECLARE
  s text;
  o text;
  n text;
BEGIN
  SELECT prosrc INTO s FROM pg_proc WHERE proname = 'fin_balance_snapshot' LIMIT 1;
  IF s IS NULL THEN RAISE EXCEPTION 'fin_balance_snapshot not found'; END IF;

  -- 1) incomes jsonb: split "other"
  o := '    ''other'', COALESCE((SELECT SUM(COALESCE(amount,0)*COALESCE(fx_rate,1)) FROM fin_other_incomes
      WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
        AND reverses_id IS NULL AND reversed_by_id IS NULL
        AND COALESCE(source,'''') NOT IN (''jp'',''inter_casino_transfer'')),0),';
  IF position(o in s) = 0 THEN RAISE EXCEPTION 'incomes other block not found'; END IF;
  n := '    ''other'', COALESCE((SELECT SUM(COALESCE(amount,0)*COALESCE(fx_rate,1)) FROM fin_other_incomes
      WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
        AND reverses_id IS NULL AND reversed_by_id IS NULL
        AND COALESCE(source,'''') IN (''other'',''refund'',''fee'')),0),
    ''tips_bonus'', COALESCE((SELECT SUM(COALESCE(amount,0)*COALESCE(fx_rate,1)) FROM fin_other_incomes
      WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
        AND reverses_id IS NULL AND reversed_by_id IS NULL
        AND COALESCE(source,'''') IN (''tips'',''bonus'',''tips_bonus'')),0),
    ''movements'', COALESCE((SELECT SUM(COALESCE(amount,0)*COALESCE(fx_rate,1)) FROM fin_other_incomes
      WHERE casino_id=p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
        AND reverses_id IS NULL AND reversed_by_id IS NULL
        AND COALESCE(source,'''') IN (''investment'',''owner_topup'')),0),';
  s := replace(s, o, n);

  -- 2) daily CTE oth: split aggregates
  o := '           SUM(COALESCE(amount,0)*COALESCE(fx_rate,1)) FILTER (WHERE COALESCE(source,'''') NOT IN (''jp'',''inter_casino_transfer'')) AS other,';
  IF position(o in s) = 0 THEN RAISE EXCEPTION 'daily oth block not found'; END IF;
  n := '           SUM(COALESCE(amount,0)*COALESCE(fx_rate,1)) FILTER (WHERE COALESCE(source,'''') IN (''other'',''refund'',''fee'')) AS other,
           SUM(COALESCE(amount,0)*COALESCE(fx_rate,1)) FILTER (WHERE COALESCE(source,'''') IN (''tips'',''bonus'',''tips_bonus'')) AS tips_bonus,
           SUM(COALESCE(amount,0)*COALESCE(fx_rate,1)) FILTER (WHERE COALESCE(source,'''') IN (''investment'',''owner_topup'')) AS movements,';
  s := replace(s, o, n);

  -- 3) daily rows: expose new keys and include them in net
  o := '    ''other'', COALESCE(oth.other,0),
    ''jp'', COALESCE(oth.jp,0),';
  IF position(o in s) = 0 THEN RAISE EXCEPTION 'daily row keys not found'; END IF;
  n := '    ''other'', COALESCE(oth.other,0),
    ''tips_bonus'', COALESCE(oth.tips_bonus,0),
    ''movements'', COALESCE(oth.movements,0),
    ''jp'', COALESCE(oth.jp,0),';
  s := replace(s, o, n);

  o := 'COALESCE(oth.other,0)+COALESCE(oth.jp,0)-COALESCE(exp.expenses,0)';
  IF position(o in s) = 0 THEN RAISE EXCEPTION 'daily net not found'; END IF;
  n := 'COALESCE(oth.other,0)+COALESCE(oth.tips_bonus,0)+COALESCE(oth.movements,0)+COALESCE(oth.jp,0)-COALESCE(exp.expenses,0)';
  s := replace(s, o, n);

  -- 4) daily filter: keep days that only have tips/bonus or movements
  o := 'OR COALESCE(oth.other,0)<>0 OR COALESCE(oth.jp,0)<>0';
  IF position(o in s) > 0 THEN
    s := replace(s, o, 'OR COALESCE(oth.other,0)<>0 OR COALESCE(oth.tips_bonus,0)<>0 OR COALESCE(oth.movements,0)<>0 OR COALESCE(oth.jp,0)<>0');
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fin_balance_snapshot(p_casino_id uuid, p_period_start date, p_period_end date)
    RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$' || s || '$fn$';
END
$do$;