CREATE OR REPLACE FUNCTION public.ace_consolidated_range_distinct(_from date, _to date, _casino_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  casino_id uuid,
  players integer,
  egms integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH guard AS (SELECT public.has_role(auth.uid(), 'super_admin'::app_role) AS ok),
  d AS (
    SELECT d.casino_id, d.identity_id
      FROM public.ace_player_daily d, guard
     WHERE guard.ok
       AND d.business_date BETWEEN _from AND _to
       AND (_casino_id IS NULL OR d.casino_id = _casino_id)
  ),
  e AS (
    SELECT e.casino_id, e.egm_code
      FROM public.ace_player_egm_daily e, guard
     WHERE guard.ok
       AND e.business_date BETWEEN _from AND _to
       AND (_casino_id IS NULL OR e.casino_id = _casino_id)
  ),
  per_casino AS (
    SELECT k.casino_id,
           (SELECT COUNT(DISTINCT d.identity_id) FROM d WHERE d.casino_id = k.casino_id)::int AS players,
           NULLIF((SELECT COUNT(DISTINCT e.egm_code) FROM e WHERE e.casino_id = k.casino_id), 0)::int AS egms
      FROM (SELECT casino_id FROM d UNION SELECT casino_id FROM e) k
     GROUP BY k.casino_id
  ),
  grand AS (
    SELECT NULL::uuid AS casino_id,
           (SELECT COUNT(DISTINCT identity_id) FROM d)::int AS players,
           NULLIF((SELECT COUNT(DISTINCT (casino_id, egm_code)) FROM e), 0)::int AS egms
  )
  SELECT * FROM per_casino
  UNION ALL
  SELECT * FROM grand;
$function$;

REVOKE ALL ON FUNCTION public.ace_consolidated_range_distinct(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ace_consolidated_range_distinct(date, date, uuid) TO authenticated, service_role;