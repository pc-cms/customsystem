
CREATE OR REPLACE FUNCTION public.tg_foi_mirror_wallet_tx()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kind TEXT;
  v_amount NUMERIC;
  v_tx_id UUID;
BEGIN
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
END $function$;
