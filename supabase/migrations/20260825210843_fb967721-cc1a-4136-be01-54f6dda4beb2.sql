-- 1. Generic finance audit trigger ------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_fin_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_casino uuid;
BEGIN
  BEGIN
    v_casino := COALESCE((to_jsonb(NEW) ->> 'casino_id')::uuid, (to_jsonb(OLD) ->> 'casino_id')::uuid);
  EXCEPTION WHEN others THEN
    v_casino := NULL;
  END;

  INSERT INTO public.fin_audit_log (casino_id, actor, action, entity_table, entity_id, before, after)
  VALUES (
    v_casino,
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    COALESCE((to_jsonb(NEW) ->> 'id')::uuid, (to_jsonb(OLD) ->> 'id')::uuid),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_fin_audit_other_incomes ON public.fin_other_incomes;
CREATE TRIGGER trg_fin_audit_other_incomes
AFTER INSERT OR UPDATE OR DELETE ON public.fin_other_incomes
FOR EACH ROW EXECUTE FUNCTION public.tg_fin_audit();

DROP TRIGGER IF EXISTS trg_fin_audit_boss_extras ON public.boss_report_extras;
CREATE TRIGGER trg_fin_audit_boss_extras
AFTER INSERT OR UPDATE OR DELETE ON public.boss_report_extras
FOR EACH ROW EXECUTE FUNCTION public.tg_fin_audit();

-- 2. Direct delete of any fin_other_incomes row (finance only) ---------------
CREATE OR REPLACE FUNCTION public.fin_other_income_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o public.fin_other_incomes%ROWTYPE;
  v_uid uuid := auth.uid();
  v_original uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may delete a finance entry';
  END IF;

  SELECT * INTO o FROM public.fin_other_incomes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF NOT public.has_casino_scope(v_uid, o.casino_id) THEN RAISE EXCEPTION 'No access to this casino'; END IF;

  PERFORM public.fin_assert_month_open(
    o.casino_id,
    EXTRACT(YEAR FROM o.business_date)::int,
    EXTRACT(MONTH FROM o.business_date)::int
  );

  -- Deleting either side of a legacy storno pair removes the whole pair.
  v_original := COALESCE(o.reverses_id, o.id);

  UPDATE public.fin_other_incomes SET reversed_by_id = NULL WHERE id = v_original;
  DELETE FROM public.fin_other_incomes WHERE reverses_id = v_original;
  DELETE FROM public.fin_other_incomes WHERE id = v_original;
END $$;

GRANT EXECUTE ON FUNCTION public.fin_other_income_delete(uuid) TO authenticated;

-- 3. Direct update, no storno (finance only) ---------------------------------
CREATE OR REPLACE FUNCTION public.fin_other_income_update(
  p_id uuid,
  p_business_date date,
  p_wallet_id uuid,
  p_source text,
  p_amount numeric,
  p_fin_category_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o public.fin_other_incomes%ROWTYPE;
  w public.fin_wallets%ROWTYPE;
  v_uid uuid := auth.uid();
  v_rate numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'super_admin') OR public.can_finance(v_uid)) THEN
    RAISE EXCEPTION 'Only finance may edit a finance entry';
  END IF;
  IF p_source = 'refund' THEN RAISE EXCEPTION 'Refund is retired and cannot be used'; END IF;
  IF COALESCE(p_amount,0) = 0 THEN RAISE EXCEPTION 'Amount must not be 0'; END IF;

  SELECT * INTO o FROM public.fin_other_incomes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF NOT public.has_casino_scope(v_uid, o.casino_id) THEN RAISE EXCEPTION 'No access to this casino'; END IF;

  PERFORM public.fin_assert_month_open(
    o.casino_id,
    EXTRACT(YEAR FROM o.business_date)::int,
    EXTRACT(MONTH FROM o.business_date)::int
  );
  PERFORM public.fin_assert_month_open(
    o.casino_id,
    EXTRACT(YEAR FROM p_business_date)::int,
    EXTRACT(MONTH FROM p_business_date)::int
  );

  SELECT * INTO w FROM public.fin_wallets WHERE id = p_wallet_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF w.casino_id <> o.casino_id THEN RAISE EXCEPTION 'Wallet belongs to another casino'; END IF;

  v_rate := public.fin_rate_for(o.casino_id, w.currency, p_business_date);

  UPDATE public.fin_other_incomes
     SET business_date   = p_business_date,
         wallet_id       = w.id,
         fin_category_id = p_fin_category_id,
         source          = p_source,
         currency        = w.currency,
         amount          = p_amount,
         fx_rate         = COALESCE(NULLIF(v_rate,0), o.fx_rate, 1),
         note            = NULLIF(btrim(coalesce(p_note,'')),'')
   WHERE id = o.id;
END $$;

GRANT EXECUTE ON FUNCTION public.fin_other_income_update(uuid, date, uuid, text, numeric, uuid, text) TO authenticated;

-- 4. Extra Expenses: real delete instead of storno ---------------------------
CREATE OR REPLACE FUNCTION public.tg_unplanned_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(current_setting('cms.fin_rpc', true), '') = '1' THEN RETURN OLD; END IF;
  IF public.has_role(auth.uid(), 'super_admin') THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Extra expenses may only be deleted through the finance functions';
END $$;

CREATE OR REPLACE FUNCTION public.fin_unplanned_delete(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  PERFORM public.fin_assert_month_open(r.casino_id, r.year, r.month);

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
END $$;

GRANT EXECUTE ON FUNCTION public.fin_unplanned_delete(uuid) TO authenticated;