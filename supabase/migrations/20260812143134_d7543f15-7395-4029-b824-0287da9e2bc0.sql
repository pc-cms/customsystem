ALTER TABLE public.cash_count_snapshots ADD COLUMN IF NOT EXISTS business_date date;

-- Backfill using the same heuristic the report currently applies:
-- business day of created_at; if that day is not closed but the previous one is,
-- the count belongs to the previous (still-being-closed) day.
UPDATE public.cash_count_snapshots s
SET business_date = CASE
  WHEN EXISTS (
    SELECT 1 FROM public.business_day_closures c
    WHERE c.casino_id = s.casino_id
      AND c.business_date = public.business_date_of(s.created_at)
  ) THEN public.business_date_of(s.created_at)
  WHEN EXISTS (
    SELECT 1 FROM public.business_day_closures c
    WHERE c.casino_id = s.casino_id
      AND c.business_date = public.business_date_of(s.created_at) - 1
  ) THEN public.business_date_of(s.created_at) - 1
  ELSE public.business_date_of(s.created_at)
END
WHERE business_date IS NULL;

CREATE OR REPLACE FUNCTION public.tg_cash_count_business_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.business_date IS NULL THEN
    NEW.business_date := public.business_date_of(COALESCE(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cash_count_business_date ON public.cash_count_snapshots;
CREATE TRIGGER trg_cash_count_business_date
BEFORE INSERT OR UPDATE ON public.cash_count_snapshots
FOR EACH ROW EXECUTE FUNCTION public.tg_cash_count_business_date();

CREATE INDEX IF NOT EXISTS idx_cash_count_snapshots_casino_bdate
  ON public.cash_count_snapshots (casino_id, business_date);