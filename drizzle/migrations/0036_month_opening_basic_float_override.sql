ALTER TABLE public.fin_month_opening ADD COLUMN IF NOT EXISTS basic_float_override_tzs numeric;
COMMENT ON COLUMN public.fin_month_opening.basic_float_override_tzs IS 'Manual Opening Basic Float for the month; when set, replaces the wallet-sum starting float in fin_balance_snapshot for whole-month windows. Wallet balances are not changed.';

CREATE OR REPLACE FUNCTION public.fin_balance_snapshot(p_casino_id uuid, p_period_start date, p_period_end date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r jsonb := public.fin_balance_snapshot_base(p_casino_id, p_period_start, p_period_end);
  v_tips numeric := 0;
  v_jp numeric := 0;
  v_override numeric;
  v_delta numeric;
BEGIN
  IF r IS NOT NULL AND p_period_start = date_trunc('month', p_period_start)::date THEN
    SELECT COALESCE(SUM(amount*COALESCE(fx_rate,1)) FILTER (WHERE source IN ('tips','tips_bonus')),0),
           COALESCE(SUM(amount*COALESCE(fx_rate,1)) FILTER (WHERE source = 'jp'),0)
      INTO v_tips, v_jp
      FROM fin_other_incomes
     WHERE casino_id = p_casino_id AND business_date < p_period_start
       AND reverses_id IS NULL AND reversed_by_id IS NULL;
    r := jsonb_set(r, '{incomes,tips_bonus}', to_jsonb(COALESCE((r#>>'{incomes,tips_bonus}')::numeric,0) + v_tips));
    r := jsonb_set(r, '{incomes,jp}', to_jsonb(COALESCE((r#>>'{incomes,jp}')::numeric,0) + v_jp));

    SELECT basic_float_override_tzs INTO v_override FROM fin_month_opening
     WHERE casino_id = p_casino_id
       AND year = EXTRACT(YEAR FROM p_period_start)::int
       AND month = EXTRACT(MONTH FROM p_period_start)::int
     LIMIT 1;
    IF v_override IS NOT NULL THEN
      v_delta := v_override - COALESCE((r#>>'{starting_float,grand_tzs}')::numeric,0);
      r := jsonb_set(r, '{starting_float,grand_tzs}', to_jsonb(v_override));
      IF r ? 'basic_float' THEN
        r := jsonb_set(r, '{basic_float,opening_tzs}', to_jsonb(COALESCE((r#>>'{basic_float,opening_tzs}')::numeric,0) + v_delta));
        r := jsonb_set(r, '{basic_float,current_tzs}', to_jsonb(COALESCE((r#>>'{basic_float,current_tzs}')::numeric,0) + v_delta));
      END IF;
    END IF;
  END IF;
  RETURN r;
END;
$$;