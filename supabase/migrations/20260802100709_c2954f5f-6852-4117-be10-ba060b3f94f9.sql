-- 1. allow negative amounts (corrections)
ALTER TABLE public.fin_other_incomes DROP CONSTRAINT IF EXISTS fin_other_incomes_amount_check;
ALTER TABLE public.fin_other_incomes ADD CONSTRAINT fin_other_incomes_amount_check CHECK (amount <> 0);

-- 2. sync mirrored wallet tx on update
CREATE OR REPLACE FUNCTION public.tg_foi_sync_wallet_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_amount NUMERIC;
BEGIN
  IF NEW.wallet_tx_id IS NOT NULL THEN
    v_amount := CASE WHEN NEW.reverses_id IS NOT NULL THEN -NEW.amount ELSE NEW.amount END;
    UPDATE public.fin_wallet_tx
       SET wallet_id = NEW.wallet_id,
           category_id = NEW.fin_category_id,
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
END $$;

DROP TRIGGER IF EXISTS trg_foi_sync ON public.fin_other_incomes;
CREATE TRIGGER trg_foi_sync
AFTER UPDATE ON public.fin_other_incomes
FOR EACH ROW
WHEN (OLD.amount IS DISTINCT FROM NEW.amount
   OR OLD.wallet_id IS DISTINCT FROM NEW.wallet_id
   OR OLD.business_date IS DISTINCT FROM NEW.business_date
   OR OLD.note IS DISTINCT FROM NEW.note
   OR OLD.fin_category_id IS DISTINCT FROM NEW.fin_category_id
   OR OLD.currency IS DISTINCT FROM NEW.currency
   OR OLD.fx_rate IS DISTINCT FROM NEW.fx_rate)
EXECUTE FUNCTION public.tg_foi_sync_wallet_tx();

-- 3. delete support (cascade mirrored tx)
CREATE OR REPLACE FUNCTION public.tg_foi_delete_wallet_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.wallet_tx_id IS NOT NULL THEN
    DELETE FROM public.fin_wallet_tx WHERE id = OLD.wallet_tx_id;
  END IF;
  IF COALESCE(auth.uid(), OLD.created_by) IS NOT NULL THEN
    INSERT INTO public.activity_logs (casino_id, operator_id, category, action, details)
    VALUES (OLD.casino_id, COALESCE(auth.uid(), OLD.created_by), 'expense'::log_category, 'other_income.delete',
      jsonb_build_object('foi_id', OLD.id, 'amount', OLD.amount, 'note', OLD.note));
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_foi_delete ON public.fin_other_incomes;
CREATE TRIGGER trg_foi_delete
AFTER DELETE ON public.fin_other_incomes
FOR EACH ROW EXECUTE FUNCTION public.tg_foi_delete_wallet_tx();

DROP POLICY IF EXISTS foi_delete ON public.fin_other_incomes;
CREATE POLICY foi_delete ON public.fin_other_incomes
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR can_finance(auth.uid())
  OR (can_manage(auth.uid()) AND casino_id = get_user_casino_id(auth.uid()))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_other_incomes TO authenticated;
GRANT ALL ON public.fin_other_incomes TO service_role;

-- 4. remove wrong record (Arusha, 20 020 000 TZS, Tips from July 2026)
DELETE FROM public.fin_other_incomes WHERE id = 'f302f0c5-0d74-42a3-80d5-984041d8675e';
