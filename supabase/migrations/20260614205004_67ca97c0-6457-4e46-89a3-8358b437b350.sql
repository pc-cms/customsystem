
-- Move Collections / CAPEX / Money Change / Transfer Out into dedicated 'collections' group
UPDATE public.fin_categories
SET group_code = 'collections',
    group_name = 'Collections & Owner Withdrawals'
WHERE name IN ('Collection (Owner Withdrawal)', 'CAPEX', 'Inter-Casino Transfer Out', 'Money Change')
  AND is_income = false;

-- Prevent deletion of categories that have any linked expenses / budgets / incomes
CREATE OR REPLACE FUNCTION public.fin_categories_prevent_delete_with_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_exp int;
  n_bud int;
  n_inc int;
BEGIN
  SELECT count(*) INTO n_exp FROM public.expenses WHERE fin_category_id = OLD.id;
  IF n_exp > 0 THEN
    RAISE EXCEPTION 'Cannot delete category "%": % linked expense(s). Soft-delete (deactivate) instead or move expenses first.', OLD.name, n_exp
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT count(*) INTO n_bud FROM public.fin_budget WHERE category_id = OLD.id;
  IF n_bud > 0 THEN
    RAISE EXCEPTION 'Cannot delete category "%": % linked budget row(s).', OLD.name, n_bud
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  SELECT count(*) INTO n_inc FROM public.fin_incomes WHERE fin_category_id = OLD.id;
  IF n_inc > 0 THEN
    RAISE EXCEPTION 'Cannot delete category "%": % linked income row(s).', OLD.name, n_inc
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_categories_prevent_delete ON public.fin_categories;
CREATE TRIGGER trg_fin_categories_prevent_delete
  BEFORE DELETE ON public.fin_categories
  FOR EACH ROW EXECUTE FUNCTION public.fin_categories_prevent_delete_with_data();
