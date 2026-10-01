CREATE TABLE public.miss_chips_opening (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  month_start date NOT NULL,
  total_tzs numeric NOT NULL DEFAULT 0,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, month_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.miss_chips_opening TO authenticated;
GRANT ALL ON public.miss_chips_opening TO service_role;
ALTER TABLE public.miss_chips_opening ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read miss chips opening" ON public.miss_chips_opening FOR SELECT TO authenticated
  USING (public.can_view_all_casinos(auth.uid()) OR public.user_has_casino_access(auth.uid(), casino_id));
CREATE POLICY "write miss chips opening" ON public.miss_chips_opening FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.can_finance(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role) OR public.can_finance(auth.uid()));

CREATE OR REPLACE FUNCTION public.miss_chips_carry(p_casino_id uuid, p_month_start date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH s AS (
    SELECT s.closing_count cc FROM shifts s
    WHERE s.casino_id = p_casino_id AND s.status = 'closed' AND s.closing_count IS NOT NULL
      AND business_date_of(s.opened_at) >= DATE '2026-09-01'
      AND business_date_of(s.opened_at) < p_month_start
  ), d AS (
    SELECT e.key k, SUM(e.value::numeric) q FROM s, jsonb_each_text(COALESCE(s.cc->'chip_miss_by_denom','{}'::jsonb)) e GROUP BY e.key
  )
  SELECT jsonb_build_object(
    'total', COALESCE((SELECT SUM(COALESCE((cc->>'chip_miss_total')::numeric,0)) FROM s),0)
           + COALESCE((SELECT SUM(o.total_tzs) FROM miss_chips_opening o
                        WHERE o.casino_id = p_casino_id AND o.month_start <= p_month_start),0),
    'by_denom', COALESCE((SELECT jsonb_object_agg(k, q) FROM d WHERE q <> 0),'{}'::jsonb));
$function$;