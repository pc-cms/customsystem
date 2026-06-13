ALTER TABLE public.player_daily_avg_bets ADD COLUMN IF NOT EXISTS avg_bet_club NUMERIC;

CREATE OR REPLACE FUNCTION public.finalize_player_daily_avg_bets(p_casino_id uuid, p_business_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH avgs AS (
    SELECT
      player_id,
      AVG(value) FILTER (WHERE game_group = 'ar')    AS ar,
      AVG(value) FILTER (WHERE game_group = 'bj')    AS bj,
      AVG(value) FILTER (WHERE game_group = 'poker') AS poker,
      AVG(value) FILTER (WHERE game_group = 'club') AS club
    FROM public.player_daily_avg_bet_changes
    WHERE casino_id = p_casino_id
      AND business_date = p_business_date
    GROUP BY player_id
  )
  INSERT INTO public.player_daily_avg_bets
    (casino_id, player_id, business_date, avg_bet_ar, avg_bet_bj, avg_bet_poker, avg_bet_club)
  SELECT p_casino_id, player_id, p_business_date,
         ROUND(ar)::numeric, ROUND(bj)::numeric, ROUND(poker)::numeric, ROUND(club)::numeric
  FROM avgs
  ON CONFLICT (casino_id, player_id, business_date)
  DO UPDATE SET
    avg_bet_ar    = COALESCE(EXCLUDED.avg_bet_ar,    public.player_daily_avg_bets.avg_bet_ar),
    avg_bet_bj    = COALESCE(EXCLUDED.avg_bet_bj,    public.player_daily_avg_bets.avg_bet_bj),
    avg_bet_poker = COALESCE(EXCLUDED.avg_bet_poker, public.player_daily_avg_bets.avg_bet_poker),
    avg_bet_club  = COALESCE(EXCLUDED.avg_bet_club,  public.player_daily_avg_bets.avg_bet_club),
    updated_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;