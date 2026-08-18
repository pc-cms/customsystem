INSERT INTO public.fin_categories (group_code, group_name, name, sort_order, is_income, is_active)
VALUES ('additional', 'Additional Expenses', 'JP Payout', 900, false, true)
ON CONFLICT (group_code, name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tg_foi_mirror_wallet_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_kind TEXT;
  v_amount NUMERIC;
  v_tx_id UUID;
  v_cat UUID;
BEGIN
  v_cat := NEW.fin_category_id;

  IF NEW.reverses_id IS NOT NULL THEN
    v_kind := 'reversal';
    v_amount := -NEW.amount;
  ELSIF COALESCE(NEW.source,'') = 'jp' AND NEW.amount < 0 THEN
    -- JP payout: a real withdrawal from the wallet. Direction is carried by the
    -- kind, the amount stays positive (same rule as every other expense).
    v_kind := 'expense';
    v_amount := abs(NEW.amount);
    IF v_cat IS NULL THEN
      SELECT id INTO v_cat FROM public.fin_categories
      WHERE group_code = 'additional' AND name = 'JP Payout' LIMIT 1;
    END IF;
  ELSE
    v_kind := 'income';
    v_amount := NEW.amount;
  END IF;

  INSERT INTO public.fin_wallet_tx (
    casino_id, wallet_id, kind, category_id, amount, currency, fx_rate,
    amount_tzs, ref_table, ref_id, business_date, note, created_by
  ) VALUES (
    NEW.casino_id, NEW.wallet_id, v_kind, v_cat,
    v_amount, NEW.currency, NEW.fx_rate,
    v_amount * NEW.fx_rate,
    'fin_other_incomes', NEW.id, NEW.business_date, NEW.note, NEW.created_by
  ) RETURNING id INTO v_tx_id;

  NEW.wallet_tx_id := v_tx_id;

  IF NEW.reverses_id IS NOT NULL THEN
    UPDATE public.fin_other_incomes SET reversed_by_id = NEW.id WHERE id = NEW.reverses_id;
  END IF;

  INSERT INTO public.activity_logs (casino_id, operator_id, category, action, details)
  VALUES (
    NEW.casino_id, NEW.created_by, 'expense'::log_category,
    CASE WHEN NEW.reverses_id IS NOT NULL THEN 'other_income.reverse' ELSE 'other_income.create' END,
    jsonb_build_object(
      'wallet_id', NEW.wallet_id, 'source', NEW.source,
      'currency', NEW.currency, 'amount', NEW.amount,
      'reverses_id', NEW.reverses_id, 'foi_id', NEW.id
    )
  );

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.tg_foi_sync_wallet_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_amount NUMERIC;
  v_kind TEXT;
  v_cat UUID;
BEGIN
  IF NEW.wallet_tx_id IS NOT NULL THEN
    v_cat := NEW.fin_category_id;
    IF NEW.reverses_id IS NOT NULL THEN
      v_kind := 'reversal';
      v_amount := -NEW.amount;
    ELSIF COALESCE(NEW.source,'') = 'jp' AND NEW.amount < 0 THEN
      v_kind := 'expense';
      v_amount := abs(NEW.amount);
      IF v_cat IS NULL THEN
        SELECT id INTO v_cat FROM public.fin_categories
        WHERE group_code = 'additional' AND name = 'JP Payout' LIMIT 1;
      END IF;
    ELSE
      v_kind := 'income';
      v_amount := NEW.amount;
    END IF;

    UPDATE public.fin_wallet_tx
       SET wallet_id = NEW.wallet_id,
           kind = v_kind,
           category_id = v_cat,
           amount = v_amount,
           currency = NEW.currency,
           fx_rate = NEW.fx_rate,
           amount_tzs = v_amount * NEW.fx_rate,
           business_date = NEW.business_date,
           note = NEW.note
     WHERE id = NEW.wallet_tx_id;
  END IF;

  IF COALESCE(auth.uid(), NEW.created_by) IS NOT NULL THEN
    INSERT INTO public.activity_logs (casino_id, operator_id, category, action, details)
    VALUES (NEW.casino_id, COALESCE(auth.uid(), NEW.created_by), 'expense'::log_category, 'other_income.update',
      jsonb_build_object('foi_id', NEW.id, 'amount_old', OLD.amount, 'amount_new', NEW.amount));
  END IF;

  RETURN NEW;
END
$function$;