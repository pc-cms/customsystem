
-- Auto-carry FX rates from the most recent prior day when a date has no rate.
-- Called on cage/slots shift open and when the Office → Rates tab loads,
-- so today's row always shows a rate (auto-filled from previous day) that
-- managers can override before first transactions.

CREATE OR REPLACE FUNCTION public.ensure_fin_daily_rates(
  _casino_id uuid,
  _business_date date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur text;
  prev_rate numeric;
BEGIN
  IF _casino_id IS NULL OR _business_date IS NULL THEN
    RETURN;
  END IF;

  FOREACH cur IN ARRAY ARRAY['USD','EUR','GBP','KES'] LOOP
    -- Skip if already set for this date
    IF EXISTS (
      SELECT 1 FROM public.fin_daily_rates
      WHERE casino_id = _casino_id
        AND business_date = _business_date
        AND currency = cur
    ) THEN
      CONTINUE;
    END IF;

    -- Find most recent prior rate for this casino+currency
    SELECT rate_to_tzs INTO prev_rate
    FROM public.fin_daily_rates
    WHERE casino_id = _casino_id
      AND currency = cur
      AND business_date < _business_date
    ORDER BY business_date DESC
    LIMIT 1;

    IF prev_rate IS NOT NULL AND prev_rate > 0 THEN
      INSERT INTO public.fin_daily_rates
        (casino_id, business_date, currency, rate_to_tzs, set_by, set_at)
      VALUES
        (_casino_id, _business_date, cur, prev_rate, NULL, now())
      ON CONFLICT (casino_id, business_date, currency) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_fin_daily_rates(uuid, date) TO authenticated;
