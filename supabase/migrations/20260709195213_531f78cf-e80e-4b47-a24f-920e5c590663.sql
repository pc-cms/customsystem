CREATE OR REPLACE FUNCTION public.compute_daily_diff(_casino_id uuid, _from date, _to date)
RETURNS TABLE(business_date date, drop_r bigint, result bigint, player_result bigint, miss bigint, tips bigint, diff bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d date;
  v_cash_in bigint;
  v_cashout bigint;
  v_miss bigint;
  v_result bigint;
  v_player bigint;
  v_tips bigint;
  v_drop_r bigint;
BEGIN
  d := _from;
  WHILE d <= _to LOOP
    SELECT COALESCE(SUM(pd.peak), 0)::bigint
      INTO v_drop_r
      FROM public.player_day_drop_cache pd
     WHERE pd.casino_id = _casino_id
       AND pd.business_date = d;

    SELECT
      COALESCE(SUM(CASE WHEN t.type IN ('buy','in') THEN t.amount ELSE 0 END), 0)::bigint,
      COALESCE(SUM(CASE WHEN t.type IN ('cashout','out') THEN t.amount ELSE 0 END), 0)::bigint
      INTO v_cash_in, v_cashout
      FROM public.transactions t
     WHERE t.casino_id = _casino_id
       AND t.cancelled_at IS NULL
       AND t.type IN ('buy','in','cashout','out')
       AND t.business_date = d;

    SELECT
      COALESCE(SUM(NULLIF(sh.closing_count->>'chip_miss_total','')::bigint), 0)::bigint,
      COALESCE(SUM(sh.tables_result), 0)::bigint
      INTO v_miss, v_result
      FROM public.shifts sh
     WHERE sh.casino_id = _casino_id
       AND sh.status = 'closed'
       AND public.business_date_of(sh.opened_at) = d;

    SELECT COALESCE(SUM(t.amount), 0)::bigint
      INTO v_tips
      FROM public.transactions t
     WHERE t.casino_id = _casino_id
       AND t.cancelled_at IS NULL
       AND t.type IN ('tips_live','tips_poker','tips_floor')
       AND t.business_date = d;

    v_player := v_cashout - v_cash_in;

    business_date := d;
    drop_r := v_drop_r;
    result := v_result;
    player_result := v_player;
    miss := v_miss;
    tips := v_tips;
    diff := v_result + v_player - v_miss;
    RETURN NEXT;

    d := d + 1;
  END LOOP;
END;
$function$;