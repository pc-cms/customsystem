ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_amount_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_check CHECK (amount <> 0);

CREATE OR REPLACE FUNCTION public.validate_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.amount IS NULL OR NEW.amount = 0 THEN
    RAISE EXCEPTION 'Expense amount must not be zero';
  END IF;

  IF NEW.amount < 0 THEN
    IF COALESCE(NEW.source, 'live_game') <> 'office' THEN
      RAISE EXCEPTION 'Negative amounts are allowed for office expenses only';
    END IF;
    IF auth.uid() IS NOT NULL
       AND NOT (
         public.has_role(auth.uid(), 'finance_manager'::app_role)
         OR public.has_role(auth.uid(), 'super_admin'::app_role)
       ) THEN
      RAISE EXCEPTION 'Only finance manager can record negative expenses';
    END IF;
  END IF;

  IF NEW.category IS NULL THEN
    RAISE EXCEPTION 'Expense must have a category';
  END IF;
  IF NEW.created_by IS NULL THEN
    RAISE EXCEPTION 'Expense must have a creator';
  END IF;

  IF NEW.shift_id IS NULL
     AND COALESCE(NEW.source, 'live_game') = 'live_game'
     AND COALESCE(NEW.cage_type, 'live_game') = 'live_game' THEN
    SELECT id INTO NEW.shift_id
    FROM public.shifts
    WHERE casino_id = NEW.casino_id AND status = 'open'
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.expenses_office_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate numeric := COALESCE(NULLIF(NEW.exchange_rate, 0), 1);
  v_tzs  numeric := COALESCE(NEW.amount_tzs, NEW.amount * COALESCE(NULLIF(NEW.exchange_rate, 0), 1));
  v_bd   date := COALESCE(NEW.business_date, business_date_of(now()));
BEGIN
  IF NEW.source = 'office' AND NEW.amount <> 0 AND NEW.wallet_id IS NOT NULL
     AND NEW.approved IS TRUE AND NEW.voided_at IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.fin_wallet_tx
       WHERE ref_table = 'expenses' AND ref_id = NEW.id
    ) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.fin_wallet_tx (
      casino_id, wallet_id, kind, category_id,
      amount, currency, fx_rate, amount_tzs,
      ref_table, ref_id, business_date, note, created_by, denominations, posted_at
    ) VALUES (
      NEW.casino_id, NEW.wallet_id, 'expense', NEW.fin_category_id,
      NEW.amount, COALESCE(NEW.currency, 'TZS'), v_rate, v_tzs,
      'expenses', NEW.id, v_bd,
      'Office expense: ' || COALESCE(NULLIF(NEW.description, ''), '(no description)'),
      NEW.created_by, NEW.denominations, now()
    );
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.expenses_office_after_approve()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate numeric := COALESCE(NULLIF(NEW.exchange_rate, 0), 1);
  v_tzs  numeric := COALESCE(NEW.amount_tzs, NEW.amount * COALESCE(NULLIF(NEW.exchange_rate, 0), 1));
  v_bd   date := COALESCE(NEW.business_date, business_date_of(now()));
BEGIN
  IF COALESCE(NEW.source,'') <> 'office' OR NEW.wallet_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.approved IS NOT TRUE OR NEW.voided_at IS NOT NULL THEN
    DELETE FROM public.fin_wallet_tx WHERE ref_table = 'expenses' AND ref_id = NEW.id;
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fin_wallet_tx WHERE ref_table = 'expenses' AND ref_id = NEW.id
  ) AND NEW.amount <> 0 THEN
    INSERT INTO public.fin_wallet_tx (
      casino_id, wallet_id, kind, category_id,
      amount, currency, fx_rate, amount_tzs,
      ref_table, ref_id, business_date, note, created_by, denominations, posted_at
    ) VALUES (
      NEW.casino_id, NEW.wallet_id, 'expense', NEW.fin_category_id,
      NEW.amount, COALESCE(NEW.currency, 'TZS'), v_rate, v_tzs,
      'expenses', NEW.id, v_bd,
      'Office expense: ' || COALESCE(NULLIF(NEW.description, ''), '(no description)'),
      COALESCE(NEW.approved_by, NEW.created_by), NEW.denominations, now()
    );
  END IF;
  RETURN NEW;
END
$$;