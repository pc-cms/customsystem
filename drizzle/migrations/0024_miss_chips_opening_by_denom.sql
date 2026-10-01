ALTER TABLE public.miss_chips_opening ADD COLUMN IF NOT EXISTS by_denom jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE OR REPLACE FUNCTION public.miss_chips_carry(p_casino_id uuid, p_month_start date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH s AS (
    SELECT s.closing_count cc FROM shifts s
    WHERE s.casino_id = p_casino_id AND s.status = 'closed' AND s.closing_count IS NOT NULL
      AND business_date_of(s.opened_at) >= DATE '2026-09-01'
      AND business_date_of(s.opened_at) < p_month_start
  ), e AS (
    SELECT x.key k, x.value::numeric v FROM s, jsonb_each_text(COALESCE(s.cc->'chip_miss_by_denom','{}'::jsonb)) x
    UNION ALL
    SELECT x.key, x.value::numeric FROM miss_chips_opening o, jsonb_each_text(o.by_denom) x
     WHERE o.casino_id = p_casino_id AND o.month_start <= p_month_start
  ), d AS (SELECT k, SUM(v) q FROM e GROUP BY k)
  SELECT jsonb_build_object(
    'total', COALESCE((SELECT SUM(COALESCE((cc->>'chip_miss_total')::numeric,0)) FROM s),0)
           + COALESCE((SELECT SUM(o.total_tzs) FROM miss_chips_opening o
                        WHERE o.casino_id = p_casino_id AND o.month_start <= p_month_start),0),
    'by_denom', COALESCE((SELECT jsonb_object_agg(k, q) FROM d WHERE q <> 0),'{}'::jsonb));
$function$;