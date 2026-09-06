CREATE OR REPLACE FUNCTION public.edit_expense_as_manager(
  p_expense_id uuid,
  p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  e public.expenses%ROWTYPE;
  v_today date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO e FROM public.expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  IF NOT public.has_casino_scope(v_uid, e.casino_id) THEN
    RAISE EXCEPTION 'No access to this casino';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'manager'::app_role)
    OR public.has_role(v_uid, 'shift_manager'::app_role)
    OR public.has_role(v_uid, 'general_manager'::app_role)
    OR public.has_role(v_uid, 'finance_manager'::app_role)
    OR public.has_role(v_uid, 'super_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'Manager role required';
  END IF;

  v_today := public.get_current_business_date(e.casino_id);

  IF e.business_date IS DISTINCT FROM v_today
     AND NOT (public.has_role(v_uid, 'finance_manager'::app_role) OR public.has_role(v_uid, 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'Only expenses of the current business day can be edited';
  END IF;

  UPDATE public.expenses SET
    fin_category_id = CASE WHEN p_patch ? 'fin_category_id'
      THEN NULLIF(p_patch->>'fin_category_id','')::uuid ELSE fin_category_id END,
    wallet_id = CASE WHEN p_patch ? 'wallet_id'
      THEN NULLIF(p_patch->>'wallet_id','')::uuid ELSE wallet_id END,
    amount = CASE WHEN p_patch ? 'amount'
      THEN (p_patch->>'amount')::numeric ELSE amount END,
    currency = CASE WHEN p_patch ? 'currency'
      THEN p_patch->>'currency' ELSE currency END,
    description = CASE WHEN p_patch ? 'description'
      THEN p_patch->>'description' ELSE description END,
    player_id = CASE WHEN p_patch ? 'player_id'
      THEN NULLIF(p_patch->>'player_id','')::uuid ELSE player_id END,
    player_name = CASE WHEN p_patch ? 'player_name'
      THEN p_patch->>'player_name' ELSE player_name END,
    approved = false,
    approved_by = NULL,
    approved_at = NULL
  WHERE id = p_expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_expense_as_manager(uuid, jsonb) TO authenticated;