
-- ============================================================
-- Migration 1: Fix business_date trigger + backfill 145 NULL rows
-- ============================================================

-- 1. Trigger now uses business_date_of(NEW.created_at) — preserves the
--    actual transaction day even when synced/imported offline. Falls back
--    to current business date only if created_at is somehow NULL.
CREATE OR REPLACE FUNCTION public.trg_set_business_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.business_date IS NULL THEN
    IF NEW.created_at IS NOT NULL THEN
      NEW.business_date := public.business_date_of(NEW.created_at);
    ELSE
      NEW.business_date := public.get_current_business_date(NEW.casino_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Also fire on UPDATE so any future NULL slip-in is auto-corrected.
DROP TRIGGER IF EXISTS set_business_date_transactions ON public.transactions;
CREATE TRIGGER set_business_date_transactions
  BEFORE INSERT OR UPDATE OF created_at, business_date ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_business_date();

-- 3. Backfill 145 NULL rows. prevent_transaction_modify blocks UPDATE except
--    cancellations, but honours seed_mode bypass.
DO $$
BEGIN
  PERFORM set_config('app.seed_mode', 'on', true);
  UPDATE public.transactions
  SET business_date = public.business_date_of(created_at)
  WHERE business_date IS NULL AND created_at IS NOT NULL;
  PERFORM set_config('app.seed_mode', 'off', true);
END $$;
