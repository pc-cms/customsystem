CREATE OR REPLACE FUNCTION public.tg_fin_wallets_float_log()
RETURNS trigger
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
    IF auth.uid() IS NOT NULL THEN
      INSERT INTO public.activity_logs (casino_id, operator_id, category, action, details)
      VALUES (
        NEW.casino_id,
        auth.uid(),
        'system'::log_category,
        'wallet.starting_float.update',
        jsonb_build_object(
          'wallet_id', NEW.id,
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
  END IF;
  RETURN NEW;
END
$$;