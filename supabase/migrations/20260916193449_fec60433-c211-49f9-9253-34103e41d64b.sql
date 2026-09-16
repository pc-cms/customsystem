CREATE OR REPLACE FUNCTION public.ace_consolidated_stats(_from date, _to date, _casino_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  casino_id uuid,
  casino_name text,
  business_date date,
  drop_amount numeric,
  handle_amount numeric,
  in_amount numeric,
  out_amount numeric,
  slot_result numeric,
  games integer,
  avg_bet numeric,
  players integer,
  egms integer,
  jackpot_paid numeric,
  jackpot_count integer,
  final_rows integer,
  provisional_rows integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH guard AS (SELECT public.has_role(auth.uid(), 'super_admin'::app_role) AS ok),
  daily AS (
    SELECT d.casino_id, d.business_date,
           SUM(d.in_amount) AS in_amount,
           SUM(d.out_amount) AS out_amount,
           SUM(d.drop_amount) AS drop_amount,
           SUM(d.handle_amount) AS handle_amount,
           SUM(d.games)::int AS games,
           COUNT(DISTINCT d.identity_id)::int AS players,
           COUNT(*) FILTER (WHERE d.is_final)::int AS final_rows,
           COUNT(*) FILTER (WHERE NOT coalesce(d.is_final,false))::int AS provisional_rows
      FROM public.ace_player_daily d, guard
     WHERE guard.ok
       AND d.business_date BETWEEN _from AND _to
       AND (_casino_id IS NULL OR d.casino_id = _casino_id)
     GROUP BY d.casino_id, d.business_date
  ),
  egm AS (
    SELECT e.casino_id, e.business_date, COUNT(DISTINCT e.egm_code)::int AS egms
      FROM public.ace_player_egm_daily e, guard
     WHERE guard.ok
       AND e.business_date BETWEEN _from AND _to
       AND (_casino_id IS NULL OR e.casino_id = _casino_id)
     GROUP BY e.casino_id, e.business_date
  ),
  jp AS (
    SELECT j.casino_id, j.business_date,
           SUM(j.amount) AS jackpot_paid,
           COUNT(*)::int AS jackpot_count
      FROM public.ace_jackpot_wins j, guard
     WHERE guard.ok
       AND j.business_date BETWEEN _from AND _to
       AND (_casino_id IS NULL OR j.casino_id = _casino_id)
     GROUP BY j.casino_id, j.business_date
  ),
  keys AS (
    SELECT coalesce(d.casino_id, e.casino_id, j.casino_id) AS casino_id,
           coalesce(d.business_date, e.business_date, j.business_date) AS business_date
      FROM daily d
      FULL JOIN egm e ON e.casino_id = d.casino_id AND e.business_date = d.business_date
      FULL JOIN jp j ON j.casino_id = coalesce(d.casino_id, e.casino_id)
                    AND j.business_date = coalesce(d.business_date, e.business_date)
  )
  SELECT
    k.casino_id,
    c.name AS casino_name,
    k.business_date,
    d.drop_amount,
    d.handle_amount,
    d.in_amount,
    d.out_amount,
    CASE WHEN d.in_amount IS NULL AND d.out_amount IS NULL THEN NULL
         ELSE coalesce(d.in_amount,0) - coalesce(d.out_amount,0) END AS slot_result,
    d.games,
    CASE WHEN d.handle_amount IS NOT NULL AND coalesce(d.games,0) > 0
         THEN d.handle_amount / d.games END AS avg_bet,
    coalesce(d.players,0) AS players,
    coalesce(e.egms,0) AS egms,
    j.jackpot_paid,
    coalesce(j.jackpot_count,0) AS jackpot_count,
    coalesce(d.final_rows,0) AS final_rows,
    coalesce(d.provisional_rows,0) AS provisional_rows
  FROM keys k
  LEFT JOIN daily d ON d.casino_id = k.casino_id AND d.business_date = k.business_date
  LEFT JOIN egm e ON e.casino_id = k.casino_id AND e.business_date = k.business_date
  LEFT JOIN jp j ON j.casino_id = k.casino_id AND j.business_date = k.business_date
  LEFT JOIN public.casinos c ON c.id = k.casino_id
  ORDER BY k.business_date DESC, c.name;
$function$;

REVOKE ALL ON FUNCTION public.ace_consolidated_stats(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ace_consolidated_stats(date, date, uuid) TO authenticated, service_role;