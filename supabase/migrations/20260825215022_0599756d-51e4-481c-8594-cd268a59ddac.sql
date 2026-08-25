CREATE OR REPLACE FUNCTION public.expense_set_amount_tzs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rate numeric;
BEGIN
  IF COALESCE(NEW.currency, 'TZS') = 'TZS' THEN
    NEW.amount_tzs := NEW.amount;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.business_date IS DISTINCT FROM OLD.business_date
     OR NEW.casino_id IS DISTINCT FROM OLD.casino_id
     OR NEW.amount_tzs IS NULL THEN
    SELECT rate_to_tzs
      INTO v_rate
      FROM public.fin_daily_rates
     WHERE casino_id = NEW.casino_id
       AND currency = NEW.currency
       AND business_date <= COALESCE(NEW.business_date, public.business_date_of(now()))
     ORDER BY business_date DESC
     LIMIT 1;

    IF v_rate IS NULL THEN
      v_rate := CASE WHEN NEW.currency = 'USD' THEN 2500 ELSE 1 END;
    END IF;
    NEW.amount_tzs := round(NEW.amount * v_rate);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_expense_set_amount_tzs ON public.expenses;
CREATE TRIGGER trg_expense_set_amount_tzs
BEFORE INSERT OR UPDATE OF amount, currency, amount_tzs, business_date, casino_id
ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.expense_set_amount_tzs();

DROP TRIGGER IF EXISTS tg_fin_audit ON public.expenses;
CREATE TRIGGER tg_fin_audit
AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.tg_fin_audit();

DROP POLICY IF EXISTS "Managers approve expenses" ON public.expenses;
CREATE POLICY "Finance roles update expenses"
ON public.expenses
FOR UPDATE
TO authenticated
USING (
  public.has_casino_scope(auth.uid(), casino_id)
  AND (
    public.has_role(auth.uid(), 'finance_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
)
WITH CHECK (
  public.has_casino_scope(auth.uid(), casino_id)
  AND (
    public.has_role(auth.uid(), 'finance_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Managers delete expenses" ON public.expenses;
CREATE POLICY "Finance roles delete expenses"
ON public.expenses
FOR DELETE
TO authenticated
USING (
  public.has_casino_scope(auth.uid(), casino_id)
  AND (
    public.has_role(auth.uid(), 'finance_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

ALTER TABLE public.expenses DISABLE TRIGGER tg_closed_month_guard;

UPDATE public.expenses
   SET amount_tzs = amount
 WHERE currency = 'TZS'
   AND amount IS DISTINCT FROM amount_tzs;

UPDATE public.fin_wallet_tx t
   SET amount = e.amount,
       currency = 'TZS',
       fx_rate = 1,
       amount_tzs = e.amount
  FROM public.expenses e
 WHERE t.ref_table = 'expenses'
   AND t.ref_id = e.id
   AND e.currency = 'TZS'
   AND (
     t.amount IS DISTINCT FROM e.amount
     OR t.currency IS DISTINCT FROM 'TZS'
     OR t.fx_rate IS DISTINCT FROM 1
     OR t.amount_tzs IS DISTINCT FROM e.amount
   );

ALTER TABLE public.expenses ENABLE TRIGGER tg_closed_month_guard;