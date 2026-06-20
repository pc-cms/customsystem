
-- Auto-populate amount_tzs on expenses so Monthly Report Actual aggregates correctly.
CREATE OR REPLACE FUNCTION public.expense_set_amount_tzs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate NUMERIC;
BEGIN
  IF NEW.amount_tzs IS NOT NULL AND NEW.amount_tzs > 0 THEN
    RETURN NEW;
  END IF;
  IF NEW.currency IS NULL OR NEW.currency = 'TZS' THEN
    NEW.amount_tzs := NEW.amount;
  ELSE
    SELECT rate_to_tzs INTO v_rate
    FROM public.fin_daily_rates
    WHERE casino_id = NEW.casino_id
      AND currency = NEW.currency
      AND business_date <= COALESCE(NEW.business_date, CURRENT_DATE)
    ORDER BY business_date DESC
    LIMIT 1;
    IF v_rate IS NULL THEN
      v_rate := CASE WHEN NEW.currency = 'USD' THEN 2500 ELSE 1 END;
    END IF;
    NEW.amount_tzs := ROUND(NEW.amount * v_rate);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_set_amount_tzs ON public.expenses;
CREATE TRIGGER trg_expense_set_amount_tzs
BEFORE INSERT OR UPDATE OF amount, currency, amount_tzs ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.expense_set_amount_tzs();

-- Backfill historical NULL rows.
UPDATE public.expenses
SET amount_tzs = CASE
  WHEN currency IS NULL OR currency = 'TZS' THEN amount
  ELSE amount * COALESCE(
    (SELECT rate_to_tzs FROM public.fin_daily_rates r
     WHERE r.casino_id = expenses.casino_id
       AND r.currency = expenses.currency
       AND r.business_date <= expenses.business_date
     ORDER BY r.business_date DESC LIMIT 1),
    2500
  )
END
WHERE amount_tzs IS NULL;
