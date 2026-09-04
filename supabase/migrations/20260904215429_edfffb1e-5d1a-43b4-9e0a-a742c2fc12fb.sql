CREATE OR REPLACE FUNCTION public.tg_fin_closed_month_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; v_casino uuid; v_date date; v_year int; v_month int; v_cat uuid; v_collection boolean := false;
BEGIN
  -- Trusted finance RPCs perform their own role checks and may complete an
  -- audited reversal/delete even when the reporting month is closed.
  IF COALESCE(current_setting('cms.fin_rpc', true), '') = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  r := COALESCE(NEW, OLD);

  IF TG_TABLE_NAME IN ('fin_budget', 'boss_report_extras') THEN
    EXECUTE 'SELECT ($1).casino_id, ($1).year, ($1).month' INTO v_casino, v_year, v_month USING r;
  ELSE
    EXECUTE 'SELECT ($1).casino_id, ($1).business_date' INTO v_casino, v_date USING r;
    v_year := EXTRACT(YEAR FROM v_date)::int;
    v_month := EXTRACT(MONTH FROM v_date)::int;
  END IF;

  IF TG_TABLE_NAME = 'expenses' THEN
    EXECUTE 'SELECT ($1).fin_category_id' INTO v_cat USING r;
    SELECT EXISTS (
      SELECT 1
      FROM public.fin_categories c
      WHERE c.id = v_cat
        AND (COALESCE(c.group_code,'') ILIKE '%collection%'
             OR COALESCE(c.name,'') ILIKE '%collection%')
    ) INTO v_collection;
    IF v_collection THEN RETURN r; END IF;
  END IF;

  IF v_casino IS NOT NULL AND v_year IS NOT NULL
     AND public.fin_month_report_is_closed(v_casino, v_year, v_month) THEN
    RAISE EXCEPTION '% is locked: month %-% is closed (only Collections are allowed)',
      TG_TABLE_NAME, v_year, v_month;
  END IF;
  RETURN r;
END $function$;

CREATE OR REPLACE FUNCTION public.fin_unplanned_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.boss_report_extras%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may delete an extra expense';
  END IF;

  SELECT * INTO r FROM public.boss_report_extras WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Record not found'; END IF;

  PERFORM set_config('cms.fin_rpc','1',true);

  -- Give the cash back when the expense had already moved money.
  IF r.wallet_tx_id IS NOT NULL THEN
    PERFORM public.fin_post_wallet_cash(
      r.casino_id, r.wallet_id, r.amount, r.currency, r.fx_rate,
      COALESCE(r.paid_business_date, r.business_date, CURRENT_DATE), false,
      'boss_report_extras', r.id,
      concat('Delete refund: ', COALESCE(r.description, r.label)), r.wallet_tx_id);
  END IF;

  -- Remove any legacy storno pair together with the entry.
  UPDATE public.boss_report_extras SET reversed_by = NULL WHERE id = r.id;
  DELETE FROM public.boss_report_extras WHERE reversal_of = r.id;
  DELETE FROM public.boss_report_extras WHERE id = r.id;
END $function$;

REVOKE ALL ON FUNCTION public.fin_unplanned_delete(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_unplanned_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_unplanned_delete(uuid) TO service_role;