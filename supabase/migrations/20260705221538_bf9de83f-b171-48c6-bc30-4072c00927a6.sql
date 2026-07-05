
-- =====================================================
-- 1. fin_wallets — Starting Float поля
-- =====================================================
ALTER TABLE public.fin_wallets
  ADD COLUMN IF NOT EXISTS starting_float_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS starting_float_date DATE,
  ADD COLUMN IF NOT EXISTS starting_float_note TEXT;

-- Расширяем write-политику fin_wallets: manager тоже может редактировать (только своё казино)
DROP POLICY IF EXISTS "fw_write" ON public.fin_wallets;
CREATE POLICY "fw_write" ON public.fin_wallets
  TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'finance_manager'::app_role)
    OR (has_role(auth.uid(),'manager'::app_role) AND casino_id = get_user_casino_id(auth.uid()))
  )
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'finance_manager'::app_role)
    OR (has_role(auth.uid(),'manager'::app_role) AND casino_id = get_user_casino_id(auth.uid()))
  );

-- Триггер: пишем в activity_logs при изменении Starting Float
CREATE OR REPLACE FUNCTION public.tg_fin_wallets_float_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
       COALESCE(NEW.starting_float_amount,0) <> COALESCE(OLD.starting_float_amount,0)
    OR COALESCE(NEW.starting_float_date, DATE '1970-01-01') <> COALESCE(OLD.starting_float_date, DATE '1970-01-01')
    OR COALESCE(NEW.starting_float_note,'') <> COALESCE(OLD.starting_float_note,'')
  ) THEN
    INSERT INTO public.activity_logs (casino_id, user_id, action, target_type, target_id, metadata)
    VALUES (
      NEW.casino_id, auth.uid(), 'wallet.starting_float.update', 'fin_wallets', NEW.id,
      jsonb_build_object(
        'wallet_name', NEW.name,
        'currency', NEW.currency,
        'old_amount', OLD.starting_float_amount,
        'new_amount', NEW.starting_float_amount,
        'old_date', OLD.starting_float_date,
        'new_date', NEW.starting_float_date,
        'note', NEW.starting_float_note
      )
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fw_float_log ON public.fin_wallets;
CREATE TRIGGER trg_fw_float_log
  AFTER UPDATE ON public.fin_wallets
  FOR EACH ROW EXECUTE FUNCTION public.tg_fin_wallets_float_log();


-- =====================================================
-- 2. fin_other_incomes — иммутабельные транзакции прочих доходов
-- =====================================================
CREATE TABLE IF NOT EXISTS public.fin_other_incomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id UUID NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  wallet_id UUID NOT NULL REFERENCES public.fin_wallets(id) ON DELETE RESTRICT,
  fin_category_id UUID REFERENCES public.fin_categories(id) ON DELETE RESTRICT,
  source TEXT NOT NULL CHECK (source IN ('investment','inter_casino_transfer','owner_topup','refund','bonus','other')),
  currency TEXT NOT NULL CHECK (currency IN ('TZS','USD','EUR','GBP','KES')),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  fx_rate NUMERIC(18,6) NOT NULL DEFAULT 1,
  note TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reverses_id UUID REFERENCES public.fin_other_incomes(id),
  reversed_by_id UUID REFERENCES public.fin_other_incomes(id),
  wallet_tx_id UUID REFERENCES public.fin_wallet_tx(id)
);

CREATE INDEX IF NOT EXISTS foi_casino_bd ON public.fin_other_incomes(casino_id, business_date);
CREATE INDEX IF NOT EXISTS foi_wallet ON public.fin_other_incomes(wallet_id);

GRANT SELECT, INSERT, UPDATE ON public.fin_other_incomes TO authenticated;
GRANT ALL ON public.fin_other_incomes TO service_role;

ALTER TABLE public.fin_other_incomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "foi_read" ON public.fin_other_incomes FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'finance_manager'::app_role)
    OR casino_id = get_user_casino_id(auth.uid())
  );

CREATE POLICY "foi_insert" ON public.fin_other_incomes FOR INSERT TO authenticated
  WITH CHECK (
    (
      has_role(auth.uid(),'super_admin'::app_role)
      OR has_role(auth.uid(),'finance_manager'::app_role)
      OR (has_role(auth.uid(),'manager'::app_role) AND casino_id = get_user_casino_id(auth.uid()))
    )
    AND created_by = auth.uid()
  );

-- Update only для reversal-линка (reversed_by_id, wallet_tx_id)
CREATE POLICY "foi_update" ON public.fin_other_incomes FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'finance_manager'::app_role)
    OR (has_role(auth.uid(),'manager'::app_role) AND casino_id = get_user_casino_id(auth.uid()))
  );

-- Зеркалирование в fin_wallet_tx
CREATE OR REPLACE FUNCTION public.tg_foi_mirror_wallet_tx()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kind TEXT;
  v_amount NUMERIC;
  v_tx_id UUID;
BEGIN
  -- Если это reversal — создаём отрицательную запись
  IF NEW.reverses_id IS NOT NULL THEN
    v_kind := 'reversal';
    v_amount := -NEW.amount;
  ELSE
    v_kind := 'income';
    v_amount := NEW.amount;
  END IF;

  INSERT INTO public.fin_wallet_tx (
    casino_id, wallet_id, kind, category_id, amount, currency, fx_rate,
    amount_tzs, ref_table, ref_id, business_date, note, created_by
  ) VALUES (
    NEW.casino_id, NEW.wallet_id, v_kind, NEW.fin_category_id,
    v_amount, NEW.currency, NEW.fx_rate,
    v_amount * NEW.fx_rate,
    'fin_other_incomes', NEW.id, NEW.business_date, NEW.note, NEW.created_by
  ) RETURNING id INTO v_tx_id;

  NEW.wallet_tx_id := v_tx_id;

  -- Проставим reversed_by_id у оригинала
  IF NEW.reverses_id IS NOT NULL THEN
    UPDATE public.fin_other_incomes SET reversed_by_id = NEW.id WHERE id = NEW.reverses_id;
  END IF;

  -- activity_log
  INSERT INTO public.activity_logs (casino_id, user_id, action, target_type, target_id, metadata)
  VALUES (
    NEW.casino_id, NEW.created_by,
    CASE WHEN NEW.reverses_id IS NOT NULL THEN 'other_income.reverse' ELSE 'other_income.create' END,
    'fin_other_incomes', NEW.id,
    jsonb_build_object(
      'wallet_id', NEW.wallet_id, 'source', NEW.source,
      'currency', NEW.currency, 'amount', NEW.amount,
      'reverses_id', NEW.reverses_id
    )
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_foi_mirror ON public.fin_other_incomes;
CREATE TRIGGER trg_foi_mirror
  BEFORE INSERT ON public.fin_other_incomes
  FOR EACH ROW EXECUTE FUNCTION public.tg_foi_mirror_wallet_tx();


-- =====================================================
-- 3. fin_month_closures — ритуал Close Month
-- =====================================================
CREATE TABLE IF NOT EXISTS public.fin_month_closures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id UUID NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year >= 2020 AND year <= 2100),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by UUID NOT NULL REFERENCES auth.users(id),
  collection_total_tzs NUMERIC(18,2) NOT NULL DEFAULT 0,
  collection_total_usd NUMERIC(18,2) NOT NULL DEFAULT 0,
  collection_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  new_float_details JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (casino_id, year, month)
);

CREATE INDEX IF NOT EXISTS fmc_casino_ym ON public.fin_month_closures(casino_id, year, month);

GRANT SELECT, INSERT ON public.fin_month_closures TO authenticated;
GRANT ALL ON public.fin_month_closures TO service_role;

ALTER TABLE public.fin_month_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fmc_read" ON public.fin_month_closures FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role)
    OR has_role(auth.uid(),'finance_manager'::app_role)
    OR casino_id = get_user_casino_id(auth.uid())
  );

CREATE POLICY "fmc_insert" ON public.fin_month_closures FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role)
    AND closed_by = auth.uid()
  );


-- =====================================================
-- 4. RPC fin_balance_snapshot
-- =====================================================
CREATE OR REPLACE FUNCTION public.fin_balance_snapshot(
  p_casino_id UUID,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_usd_tzs NUMERIC;
  v_starting JSONB;
  v_incomes JSONB;
  v_expenses JSONB;
  v_collections JSONB;
  v_wallets JSONB;
  v_missed NUMERIC;
BEGIN
  -- курс USD→TZS (последний из fin_daily_rates либо 2500 по умолчанию)
  SELECT rate_usd_tzs INTO v_usd_tzs
  FROM fin_daily_rates
  WHERE casino_id = p_casino_id AND rate_date <= p_period_end
  ORDER BY rate_date DESC LIMIT 1;
  v_usd_tzs := COALESCE(v_usd_tzs, 2500);

  -- Starting Float: сумма по кошелькам, у которых starting_float_date <= p_period_start
  SELECT jsonb_build_object(
    'tzs', COALESCE(SUM(CASE WHEN currency='TZS' THEN starting_float_amount ELSE 0 END),0),
    'usd', COALESCE(SUM(CASE WHEN currency='USD' THEN starting_float_amount ELSE 0 END),0),
    'grand_tzs', COALESCE(SUM(
      CASE
        WHEN currency='TZS' THEN starting_float_amount
        WHEN currency='USD' THEN starting_float_amount * v_usd_tzs
        ELSE starting_float_amount
      END
    ),0),
    'per_wallet', COALESCE(jsonb_agg(jsonb_build_object(
      'wallet_id', id, 'name', name, 'currency', currency, 'amount', starting_float_amount
    )) FILTER (WHERE starting_float_amount > 0), '[]'::jsonb)
  ) INTO v_starting
  FROM fin_wallets
  WHERE casino_id = p_casino_id
    AND is_active = TRUE
    AND (starting_float_date IS NULL OR starting_float_date <= p_period_start);

  -- Live Game + Slots (из table_daily_results / shifts)
  -- Missed Chips из shifts.closing_count->>'chip_miss_total' (MISS=+, но в бизнес-смысле MISS уменьшает cash)
  -- Знак: MISS в shift означает физически меньше фишек чем ожидалось → относительно cash — плюс
  -- (кассир получил кэш, но фишки не выдал). Для нашей формулы: сохраняем как есть (± значение из shift)
  SELECT COALESCE(SUM( COALESCE((closing_count->>'chip_miss_total')::numeric, 0) ), 0)
    INTO v_missed
  FROM shifts
  WHERE casino_id = p_casino_id
    AND business_date BETWEEN p_period_start AND p_period_end
    AND closing_count IS NOT NULL;

  v_incomes := jsonb_build_object(
    'live_game', COALESCE((
      SELECT SUM(result_tzs) FROM table_daily_results
      WHERE casino_id = p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
    ),0),
    'slots', COALESCE((
      SELECT SUM(amount) FROM fin_incomes
      WHERE casino_id = p_casino_id
        AND make_date(year,month,1) BETWEEN date_trunc('month',p_period_start)::date AND p_period_end
    ),0),
    'other', COALESCE((
      SELECT SUM(amount * fx_rate) FROM fin_other_incomes
      WHERE casino_id = p_casino_id AND business_date BETWEEN p_period_start AND p_period_end
        AND reverses_id IS NULL AND reversed_by_id IS NULL
    ),0),
    'missed_chips', v_missed
  );

  -- Expenses (из fin_wallet_tx kind='expense')
  SELECT COALESCE(SUM(amount_tzs),0) INTO v_expenses FROM (
    SELECT amount_tzs FROM fin_wallet_tx
    WHERE casino_id = p_casino_id
      AND business_date BETWEEN p_period_start AND p_period_end
      AND kind = 'expense'
  ) x;

  -- Collections: expenses с категорией "Collection" (fallback: по имени категории)
  SELECT COALESCE(SUM(fwt.amount_tzs),0) INTO v_collections FROM fin_wallet_tx fwt
  LEFT JOIN fin_categories fc ON fc.id = fwt.category_id
  WHERE fwt.casino_id = p_casino_id
    AND fwt.business_date BETWEEN p_period_start AND p_period_end
    AND fwt.kind = 'expense'
    AND (fc.name ILIKE '%collection%' OR fc.group_code ILIKE '%collection%');

  -- Wallets: Physical (last cash_count) + Ledger (running balance по fin_wallet_tx)
  SELECT jsonb_agg(jsonb_build_object(
    'wallet_id', w.id, 'name', w.name, 'kind', w.kind, 'currency', w.currency,
    'ledger', COALESCE((
      SELECT SUM(amount) FROM fin_wallet_tx
      WHERE wallet_id = w.id AND business_date <= p_period_end
    ), 0) + COALESCE(w.starting_float_amount, 0),
    'physical', COALESCE((
      SELECT total_amount FROM cash_counts
      WHERE wallet_id = w.id ORDER BY created_at DESC LIMIT 1
    ), NULL)
  ) ORDER BY w.sort_order, w.name) INTO v_wallets
  FROM fin_wallets w
  WHERE w.casino_id = p_casino_id AND w.is_active = TRUE;

  v_result := jsonb_build_object(
    'period', jsonb_build_object('start', p_period_start, 'end', p_period_end),
    'rates', jsonb_build_object('usd_tzs', v_usd_tzs),
    'starting_float', v_starting,
    'incomes', v_incomes,
    'expenses_total', v_expenses,
    'collections_total', v_collections,
    'wallets', COALESCE(v_wallets, '[]'::jsonb)
  );

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.fin_balance_snapshot(UUID, DATE, DATE) TO authenticated;
