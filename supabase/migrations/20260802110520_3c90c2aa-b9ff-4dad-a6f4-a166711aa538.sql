-- 1. Office expense must carry a wallet, is auto-approved, never touches cage shifts
CREATE OR REPLACE FUNCTION public.expenses_office_before_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.source = 'office' THEN
    IF NEW.wallet_id IS NULL THEN
      RAISE EXCEPTION 'Office expense requires a wallet';
    END IF;
    NEW.approved    := true;
    NEW.approved_by := COALESCE(NEW.approved_by, NEW.created_by);
    NEW.approved_at := COALESCE(NEW.approved_at, now());
    NEW.shift_id            := NULL;
    NEW.cage_slots_shift_id := NULL;
    NEW.cage_type           := 'live_game'; -- legacy NOT NULL column
  END IF;
  RETURN NEW;
END $function$;

-- 2. Direct wallet debit into the modern ledger (fin_wallet_tx)
CREATE OR REPLACE FUNCTION public.expenses_office_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rate numeric := COALESCE(NULLIF(NEW.exchange_rate, 0), 1);
  v_tzs  numeric := COALESCE(NEW.amount_tzs, NEW.amount * COALESCE(NULLIF(NEW.exchange_rate, 0), 1));
BEGIN
  IF NEW.source = 'office' AND NEW.amount > 0 AND NEW.wallet_id IS NOT NULL THEN
    -- Skip if a ledger row was already written by the client (fin module)
    IF EXISTS (
      SELECT 1 FROM public.fin_wallet_tx
       WHERE ref_table = 'expenses' AND ref_id = NEW.id
    ) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.fin_wallet_tx (
      casino_id, wallet_id, kind, category_id,
      amount, currency, fx_rate, amount_tzs,
      ref_table, ref_id, business_date, note, created_by
    ) VALUES (
      NEW.casino_id, NEW.wallet_id, 'expense', NEW.fin_category_id,
      -NEW.amount, COALESCE(NEW.currency, 'TZS'), v_rate, -v_tzs,
      'expenses', NEW.id,
      COALESCE(NEW.business_date, (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date),
      'Office expense: ' || COALESCE(NULLIF(NEW.description, ''), '(no description)'),
      NEW.created_by
    );
  END IF;
  RETURN NEW;
END $function$;

-- 3. Removing an office expense removes its wallet movement
CREATE OR REPLACE FUNCTION public.expenses_office_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.fin_wallet_tx
   WHERE ref_table = 'expenses' AND ref_id = OLD.id;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS trg_expenses_office_after_delete ON public.expenses;
CREATE TRIGGER trg_expenses_office_after_delete
AFTER DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.expenses_office_after_delete();

-- 4. Office expense RPC: wallet, category, currency, rate, business date
DROP FUNCTION IF EXISTS public.create_office_expense(uuid, text, numeric, text);

CREATE OR REPLACE FUNCTION public.create_office_expense(
  p_casino_id uuid,
  p_category_code text,
  p_amount numeric,
  p_description text,
  p_wallet_id uuid DEFAULT NULL,
  p_fin_category_id uuid DEFAULT NULL,
  p_currency text DEFAULT 'TZS',
  p_exchange_rate numeric DEFAULT 1,
  p_business_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
  v_cat expense_category;
  v_rate numeric := COALESCE(NULLIF(p_exchange_rate, 0), 1);
  v_wallet public.fin_wallets%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT (
       public.has_role(v_uid,'manager'::app_role)
    OR public.has_role(v_uid,'finance_manager'::app_role)
    OR public.has_role(v_uid,'general_manager'::app_role)
    OR public.has_role(v_uid,'super_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'manager role required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF p_wallet_id IS NULL THEN
    RAISE EXCEPTION 'wallet is required for office expense';
  END IF;

  SELECT * INTO v_wallet FROM public.fin_wallets
   WHERE id = p_wallet_id AND casino_id = p_casino_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found for this casino';
  END IF;

  BEGIN
    v_cat := p_category_code::expense_category;
  EXCEPTION WHEN others THEN
    v_cat := 'other'::expense_category;
  END;

  INSERT INTO public.expenses (
    casino_id, category, category_code, fin_category_id, amount, description,
    player_name, created_by, cage_type, source,
    wallet_id, currency, exchange_rate, amount_tzs, business_date
  ) VALUES (
    p_casino_id, v_cat, p_category_code, p_fin_category_id, p_amount, COALESCE(p_description,''),
    '', v_uid, 'live_game', 'office',
    p_wallet_id, COALESCE(p_currency, v_wallet.currency, 'TZS'), v_rate, p_amount * v_rate,
    COALESCE(p_business_date, (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $function$;