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
  v_today date := (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date;
  v_date date;
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

  v_date := COALESCE(p_business_date, v_today);

  IF v_date > v_today THEN
    RAISE EXCEPTION 'posting date cannot be in the future';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.fin_month_closures c
     WHERE c.casino_id = p_casino_id
       AND c.year = EXTRACT(YEAR FROM v_date)::int
       AND c.month = EXTRACT(MONTH FROM v_date)::int
  ) THEN
    RAISE EXCEPTION 'month % / % is closed for this casino', EXTRACT(MONTH FROM v_date)::int, EXTRACT(YEAR FROM v_date)::int;
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
    v_date
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $function$;