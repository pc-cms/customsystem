CREATE TABLE public.fin_month_opening (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id),
  year int NOT NULL,
  month int NOT NULL,
  opening_float_tzs numeric NOT NULL DEFAULT 0,
  wallet_balances jsonb NOT NULL DEFAULT '[]'::jsonb,
  opened_by uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, year, month)
);
GRANT SELECT ON public.fin_month_opening TO authenticated;
GRANT ALL ON public.fin_month_opening TO service_role;
ALTER TABLE public.fin_month_opening ENABLE ROW LEVEL SECURITY;
CREATE POLICY fmo_read ON public.fin_month_opening
  FOR SELECT TO authenticated
  USING (
    casino_id = get_user_casino_id(auth.uid())
    OR has_role(auth.uid(), 'finance_manager'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'general_manager'::app_role)
  );

-- Backfill: every past month that already holds financial data is
-- considered opened (it was worked in before the Open Month ritual
-- existed). The current calendar month is intentionally left unopened.
INSERT INTO public.fin_month_opening (
  casino_id, year, month, opening_float_tzs, wallet_balances, opened_by, note
)
SELECT m.casino_id, m.year, m.month, 0, '[]'::jsonb,
       '00000000-0000-0000-0000-000000000000'::uuid,
       'Backfill: month predates the Open Month workflow'
FROM (
  SELECT DISTINCT casino_id,
         EXTRACT(YEAR FROM business_date)::int AS year,
         EXTRACT(MONTH FROM business_date)::int AS month
  FROM public.cash_count_snapshots
  WHERE business_date IS NOT NULL
  UNION
  SELECT DISTINCT casino_id,
         EXTRACT(YEAR FROM business_date)::int,
         EXTRACT(MONTH FROM business_date)::int
  FROM public.expenses
  WHERE business_date IS NOT NULL
  UNION
  SELECT DISTINCT casino_id,
         EXTRACT(YEAR FROM business_date)::int,
         EXTRACT(MONTH FROM business_date)::int
  FROM public.fin_wallet_tx
  WHERE business_date IS NOT NULL
  UNION
  SELECT casino_id, year, month FROM public.fin_month_closures
) m
WHERE make_date(m.year, m.month, 1) < date_trunc('month', (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date)::date
ON CONFLICT (casino_id, year, month) DO NOTHING;

-- Status helper: 'closed' | 'open' | 'not_opened'
CREATE OR REPLACE FUNCTION public.fin_month_opening_status(p_casino_id uuid, p_year int, p_month int)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.fin_month_closures
                 WHERE casino_id = p_casino_id AND year = p_year AND month = p_month)
      THEN 'closed'
    WHEN EXISTS (SELECT 1 FROM public.fin_month_opening
                 WHERE casino_id = p_casino_id AND year = p_year AND month = p_month)
      THEN 'open'
    ELSE 'not_opened'
  END
$$;
GRANT EXECUTE ON FUNCTION public.fin_month_opening_status(uuid, int, int) TO authenticated;

-- Guard reused by posting RPCs.
CREATE OR REPLACE FUNCTION public.fin_assert_month_started(p_casino_id uuid, p_date date)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_status text;
BEGIN
  v_status := public.fin_month_opening_status(
    p_casino_id,
    EXTRACT(YEAR FROM p_date)::int,
    EXTRACT(MONTH FROM p_date)::int
  );
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'Month %-% is closed for this casino',
      EXTRACT(MONTH FROM p_date)::int, EXTRACT(YEAR FROM p_date)::int;
  ELSIF v_status = 'not_opened' THEN
    RAISE EXCEPTION 'Month %-% is not opened yet — open it via Open Month in Office first',
      EXTRACT(MONTH FROM p_date)::int, EXTRACT(YEAR FROM p_date)::int;
  END IF;
END $$;

-- fin_open_month: atomic opening record + per-wallet starting float +
-- opening physical count dated the first day of the month.
CREATE OR REPLACE FUNCTION public.fin_open_month(
  p_casino_id uuid,
  p_year int,
  p_month int,
  p_float_details jsonb DEFAULT '[]'::jsonb,
  p_wallet_balances jsonb DEFAULT '[]'::jsonb,
  p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_first date := make_date(p_year, p_month, 1);
  v_id uuid;
  r jsonb;
  v_wallet public.fin_wallets%ROWTYPE;
  v_fx numeric;
  v_counted numeric;
  v_previous numeric;
  v_float_tzs numeric := 0;
  v_wallet_type wallet_type;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (
    has_role(v_uid,'super_admin'::app_role)
    OR can_finance(v_uid)
    OR (can_manage(v_uid) AND public.has_casino_scope(v_uid, p_casino_id))
  ) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  PERFORM public.fin_assert_month_started(p_casino_id, v_first);

  INSERT INTO public.fin_month_opening (
    casino_id, year, month, opening_float_tzs, wallet_balances, opened_by, note
  ) VALUES (
    p_casino_id, p_year, p_month, 0, COALESCE(p_wallet_balances,'[]'::jsonb), v_uid, p_note
  ) RETURNING id INTO v_id;

  -- Starting float per wallet (same primitive as Close Month's new float).
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_float_details,'[]'::jsonb)) LOOP
    UPDATE public.fin_wallets SET
      starting_float_amount = COALESCE((r->>'amount')::numeric, 0),
      starting_float_date = v_first,
      starting_float_note = format('Open Month %s-%s', p_year, lpad(p_month::text, 2, '0'))
    WHERE id = (r->>'wallet_id')::uuid AND casino_id = p_casino_id;
  END LOOP;

  -- Opening physical count per wallet, dated the first day of the month.
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_wallet_balances,'[]'::jsonb)) LOOP
    SELECT * INTO v_wallet FROM public.fin_wallets
     WHERE id = (r->>'wallet_id')::uuid AND casino_id = p_casino_id AND is_active = true;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_counted := COALESCE((r->>'amount')::numeric, 0);
    v_fx := CASE WHEN COALESCE(v_wallet.currency,'TZS') = 'TZS' THEN 1
                 ELSE COALESCE(NULLIF(public.fin_rate_for(p_casino_id, v_wallet.currency, v_first), 0), 1) END;

    SELECT physical_total INTO v_previous
      FROM public.cash_count_snapshots
     WHERE wallet_id = v_wallet.id
     ORDER BY business_date DESC NULLS LAST, created_at DESC
     LIMIT 1;
    v_previous := COALESCE(v_previous, v_counted);

    IF COALESCE(v_wallet.currency,'TZS') = 'TZS' THEN
      v_float_tzs := v_float_tzs + COALESCE(v_wallet.starting_float_amount, 0);
    ELSE
      v_float_tzs := v_float_tzs + COALESCE(v_wallet.starting_float_amount, 0) * v_fx;
    END IF;

    v_wallet_type := CASE v_wallet.kind
      WHEN 'cash' THEN 'main_cash'
      WHEN 'safe' THEN 'office_safe'
      WHEN 'bank' THEN 'bank_account'
      WHEN 'mobile_money' THEN 'mobile_money'
      WHEN 'cage' THEN 'cage_table'
      ELSE 'other_reserve' END::wallet_type;

    INSERT INTO public.cash_count_snapshots (
      casino_id, wallet_id, wallet_type, currency, denominations,
      physical_total, expected_balance, discrepancy, exchange_rate,
      physical_total_tzs, counted_by, note, source, business_date
    ) VALUES (
      p_casino_id, v_wallet.id, v_wallet_type, v_wallet.currency, '{}'::jsonb,
      v_counted, v_previous, v_counted - v_previous, v_fx,
      v_counted * v_fx, v_uid, COALESCE(p_note, ''), 'month_open', v_first
    );
  END LOOP;

  UPDATE public.fin_month_opening SET opening_float_tzs = v_float_tzs WHERE id = v_id;

  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.fin_open_month(uuid, int, int, jsonb, jsonb, text) TO authenticated;

-- Guard: wallet counts only into opened, not-yet-closed months.
CREATE OR REPLACE FUNCTION public.fin_save_wallet_count(p_wallet_id uuid, p_counted numeric, p_denominations jsonb DEFAULT '{}'::jsonb, p_note text DEFAULT ''::text, p_business_date date DEFAULT NULL::date, p_fx_rate numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w RECORD;
  v_uid uuid := auth.uid();
  v_rate numeric;
  v_previous numeric;
  v_variance numeric;
  v_snap uuid;
  v_wallet_type wallet_type;
  v_bdate date;
BEGIN
  SELECT * INTO w FROM fin_wallets WHERE id = p_wallet_id;
  IF w.id IS NULL THEN RAISE EXCEPTION 'wallet not found'; END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_counted IS NULL OR p_counted < 0 THEN
    RAISE EXCEPTION 'physical count cannot be negative';
  END IF;
  IF NOT (
    has_role(v_uid,'super_admin'::app_role)
    OR ((can_manage(v_uid) OR can_finance(v_uid)) AND public.has_casino_scope(v_uid, w.casino_id))
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  v_rate := COALESCE(NULLIF(p_fx_rate,0), 1);
  v_bdate := COALESCE(p_business_date, public.business_date_of(now()));

  PERFORM public.fin_assert_month_started(w.casino_id, v_bdate);

  SELECT physical_total
    INTO v_previous
  FROM cash_count_snapshots
  WHERE wallet_id = p_wallet_id
  ORDER BY business_date DESC NULLS LAST, created_at DESC
  LIMIT 1;

  v_previous := COALESCE(v_previous, COALESCE(w.starting_float_amount, 0));
  v_variance := p_counted - v_previous;

  v_wallet_type := CASE w.kind
    WHEN 'cash' THEN 'main_cash'
    WHEN 'safe' THEN 'office_safe'
    WHEN 'bank' THEN 'bank_account'
    WHEN 'mobile_money' THEN 'mobile_money'
    WHEN 'cage' THEN 'cage_table'
    ELSE 'other_reserve' END::wallet_type;

  INSERT INTO cash_count_snapshots (
    casino_id, wallet_id, wallet_type, currency, denominations,
    physical_total, expected_balance, discrepancy, exchange_rate,
    physical_total_tzs, counted_by, note, source, business_date
  ) VALUES (
    w.casino_id, w.id, v_wallet_type, w.currency, COALESCE(p_denominations,'{}'::jsonb),
    p_counted, v_previous, v_variance, v_rate,
    p_counted * v_rate, v_uid, COALESCE(p_note,''), 'manual', v_bdate
  ) RETURNING id INTO v_snap;

  RETURN jsonb_build_object(
    'snapshot_id', v_snap,
    'tx_id', NULL,
    'expected', v_previous,
    'counted', p_counted,
    'variance', v_variance,
    'business_date', v_bdate
  );
END;
$function$;

-- Guard: office expenses only into opened, not-yet-closed months.
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

  PERFORM public.fin_assert_month_started(p_casino_id, v_date);

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
END;
$function$;