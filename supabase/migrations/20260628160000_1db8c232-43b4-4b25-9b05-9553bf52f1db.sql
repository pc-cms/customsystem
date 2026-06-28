
-- 1) New column
ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS cash_flow_delta numeric;

COMMENT ON COLUMN public.shifts.cash_flow_delta IS
  'TZS-equivalent (closing − opening) cash+mobile, computed from snapshots. NULL = no snapshots (legacy).';

-- 2) Helper: sum {denom: qty} JSON → number
CREATE OR REPLACE FUNCTION public._sum_denoms(p jsonb)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(SUM( (key)::numeric * COALESCE((value)::numeric, 0) ), 0)
  FROM jsonb_each_text(COALESCE(p, '{}'::jsonb))
$$;

-- 3) Helper: sum mobile {provider: amount} JSON → number
CREATE OR REPLACE FUNCTION public._sum_mobile(p jsonb)
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(SUM( COALESCE((value)::numeric, 0) ), 0)
  FROM jsonb_each_text(COALESCE(p, '{}'::jsonb))
$$;

-- 4) Convert {ccy: {denom: qty}} JSON to TZS-equivalent total, using rates
CREATE OR REPLACE FUNCTION public._cash_to_tzs(cash jsonb, rates jsonb)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  total numeric := 0;
  ccy text;
  sub jsonb;
  amt numeric;
  rate numeric;
  default_rates jsonb := '{"USD":2500,"EUR":2700,"GBP":3200,"KES":18}'::jsonb;
BEGIN
  IF cash IS NULL THEN RETURN 0; END IF;
  FOR ccy, sub IN SELECT key, value FROM jsonb_each(cash) LOOP
    amt := public._sum_denoms(sub);
    IF amt = 0 THEN CONTINUE; END IF;
    IF ccy = 'TZS' THEN
      total := total + amt;
    ELSE
      rate := COALESCE( NULLIF((rates->>ccy), '')::numeric,
                        NULLIF((default_rates->>ccy), '')::numeric,
                        0 );
      total := total + amt * rate;
    END IF;
  END LOOP;
  RETURN total;
END;
$$;

-- 5) Has any useful payload (cash or mobile)?
CREATE OR REPLACE FUNCTION public._has_payload(snap jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT (
    (snap ? 'cash'   AND jsonb_typeof(snap->'cash')   = 'object' AND (SELECT count(*) FROM jsonb_object_keys(snap->'cash'))   > 0)
    OR
    (snap ? 'mobile' AND jsonb_typeof(snap->'mobile') = 'object' AND (SELECT count(*) FROM jsonb_object_keys(snap->'mobile')) > 0)
  )
$$;

-- 6) Compute cash_flow_delta for a row (returns NULL when no snapshots)
CREATE OR REPLACE FUNCTION public.compute_shift_cash_flow_delta(
  opening_float jsonb,
  closing_count jsonb,
  exchange_rates jsonb
) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  op jsonb := COALESCE(opening_float, '{}'::jsonb);
  cl jsonb := COALESCE(closing_count, '{}'::jsonb);
  rates jsonb := COALESCE(exchange_rates, '{}'::jsonb);
  opener_tzs numeric;
  closer_tzs numeric;
BEGIN
  IF NOT public._has_payload(op) AND NOT public._has_payload(cl) THEN
    RETURN NULL;
  END IF;
  opener_tzs := public._cash_to_tzs(op->'cash', rates) + public._sum_mobile(op->'mobile');
  closer_tzs := public._cash_to_tzs(cl->'cash', rates) + public._sum_mobile(cl->'mobile');
  RETURN closer_tzs - opener_tzs;
END;
$$;

-- 7) Trigger function: recompute on INSERT / relevant UPDATE
CREATE OR REPLACE FUNCTION public.tg_shifts_recompute_cash_flow_delta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.cash_flow_delta := public.compute_shift_cash_flow_delta(
    NEW.opening_float, NEW.closing_count, NEW.exchange_rates
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_shifts_cash_flow_delta_ins ON public.shifts;
CREATE TRIGGER tg_shifts_cash_flow_delta_ins
  BEFORE INSERT ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.tg_shifts_recompute_cash_flow_delta();

DROP TRIGGER IF EXISTS tg_shifts_cash_flow_delta_upd ON public.shifts;
CREATE TRIGGER tg_shifts_cash_flow_delta_upd
  BEFORE UPDATE OF opening_float, closing_count, exchange_rates ON public.shifts
  FOR EACH ROW
  WHEN (
    NEW.opening_float  IS DISTINCT FROM OLD.opening_float  OR
    NEW.closing_count  IS DISTINCT FROM OLD.closing_count  OR
    NEW.exchange_rates IS DISTINCT FROM OLD.exchange_rates
  )
  EXECUTE FUNCTION public.tg_shifts_recompute_cash_flow_delta();

-- 8) Backfill
UPDATE public.shifts
SET cash_flow_delta = public.compute_shift_cash_flow_delta(opening_float, closing_count, exchange_rates)
WHERE cash_flow_delta IS NULL;
