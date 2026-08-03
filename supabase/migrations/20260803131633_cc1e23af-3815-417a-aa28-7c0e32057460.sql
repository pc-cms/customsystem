ALTER TABLE public.fin_wallet_tx ADD COLUMN IF NOT EXISTS denominations jsonb;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS denominations jsonb;

CREATE OR REPLACE FUNCTION public.expenses_office_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate numeric := COALESCE(NULLIF(NEW.exchange_rate, 0), 1);
  v_tzs  numeric := COALESCE(NEW.amount_tzs, NEW.amount * COALESCE(NULLIF(NEW.exchange_rate, 0), 1));
BEGIN
  IF NEW.source = 'office' AND NEW.amount > 0 AND NEW.wallet_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.fin_wallet_tx
       WHERE ref_table = 'expenses' AND ref_id = NEW.id
    ) THEN
      RETURN NEW;
    END IF;

    -- kind='expense' stores a POSITIVE amount; readers negate it.
    INSERT INTO public.fin_wallet_tx (
      casino_id, wallet_id, kind, category_id,
      amount, currency, fx_rate, amount_tzs,
      ref_table, ref_id, business_date, note, created_by, denominations
    ) VALUES (
      NEW.casino_id, NEW.wallet_id, 'expense', NEW.fin_category_id,
      NEW.amount, COALESCE(NEW.currency, 'TZS'), v_rate, v_tzs,
      'expenses', NEW.id,
      COALESCE(NEW.business_date, (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date),
      'Office expense: ' || COALESCE(NULLIF(NEW.description, ''), '(no description)'),
      NEW.created_by, NEW.denominations
    );
  END IF;
  RETURN NEW;
END
$$;