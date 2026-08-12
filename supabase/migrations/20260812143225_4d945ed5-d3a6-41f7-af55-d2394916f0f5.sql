CREATE OR REPLACE FUNCTION public.fin_save_wallet_count(p_wallet_id uuid, p_counted numeric, p_denominations jsonb DEFAULT '{}'::jsonb, p_note text DEFAULT ''::text, p_business_date date DEFAULT NULL::date, p_fx_rate numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w RECORD;
  v_uid uuid := auth.uid();
  v_rate numeric;
  v_previous numeric;
  v_variance numeric;
  v_snap uuid;
  v_wallet_type wallet_type;
  v_bdate date;
BEGIN
  SELECT * INTO w FROM fin_wallets WHERE id = p_wallet_id;
  IF w.id IS NULL THEN RAISE EXCEPTION 'wallet not found'; END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_counted IS NULL OR p_counted < 0 THEN
    RAISE EXCEPTION 'physical count cannot be negative';
  END IF;
  IF NOT (
    has_role(v_uid,'super_admin'::app_role)
    OR ((can_manage(v_uid) OR can_finance(v_uid)) AND public.has_casino_scope(v_uid, w.casino_id))
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  v_rate := COALESCE(NULLIF(p_fx_rate,0), 1);
  v_bdate := COALESCE(p_business_date, public.business_date_of(now()));

  SELECT physical_total
    INTO v_previous
  FROM cash_count_snapshots
  WHERE wallet_id = p_wallet_id
  ORDER BY business_date DESC NULLS LAST, created_at DESC
  LIMIT 1;

  v_previous := COALESCE(v_previous, COALESCE(w.starting_float_amount, 0));
  v_variance := p_counted - v_previous;

  v_wallet_type := CASE w.kind
    WHEN 'cash' THEN 'main_cash'
    WHEN 'safe' THEN 'office_safe'
    WHEN 'bank' THEN 'bank_account'
    WHEN 'mobile_money' THEN 'mobile_money'
    WHEN 'cage' THEN 'cage_table'
    ELSE 'other_reserve' END::wallet_type;

  INSERT INTO cash_count_snapshots (
    casino_id, wallet_id, wallet_type, currency, denominations,
    physical_total, expected_balance, discrepancy, exchange_rate,
    physical_total_tzs, counted_by, note, source, business_date
  ) VALUES (
    w.casino_id, w.id, v_wallet_type, w.currency, COALESCE(p_denominations,'{}'::jsonb),
    p_counted, v_previous, v_variance, v_rate,
    p_counted * v_rate, v_uid, COALESCE(p_note,''), 'manual', v_bdate
  ) RETURNING id INTO v_snap;

  RETURN jsonb_build_object(
    'snapshot_id', v_snap,
    'tx_id', NULL,
    'expected', v_previous,
    'counted', p_counted,
    'variance', v_variance,
    'business_date', v_bdate
  );
END;
$function$;