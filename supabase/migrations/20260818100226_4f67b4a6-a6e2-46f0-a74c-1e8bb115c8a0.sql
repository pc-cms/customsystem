ALTER TABLE public.ace_finance_snapshots
  ADD COLUMN IF NOT EXISTS business_date date,
  ADD COLUMN IF NOT EXISTS closed_at_local text,
  ADD COLUMN IF NOT EXISTS closing_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS apply_status text,
  ADD COLUMN IF NOT EXISTS apply_error text,
  ADD COLUMN IF NOT EXISTS casino_id uuid REFERENCES public.casinos(id);

CREATE OR REPLACE FUNCTION public.ace_apply_closed_report(
  _casino_id uuid,
  _business_date date,
  _drop_slots numeric,
  _net_win numeric,
  _cashdesk_win numeric,
  _client_balance numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tables_result numeric := 0;
BEGIN
  IF _casino_id IS NULL OR _business_date IS NULL THEN
    RAISE EXCEPTION 'casino_id and business_date are required';
  END IF;

  SELECT COALESCE(SUM(COALESCE(s.tables_result,0)),0)
    INTO v_tables_result
    FROM public.shifts s
   WHERE s.casino_id = _casino_id
     AND public.business_date_of(s.opened_at) = _business_date;

  INSERT INTO public.fin_day_closing AS d (
    casino_id, business_date, drop_slots, net_win, cashdesk_win,
    tables_result, players_card_balance
  ) VALUES (
    _casino_id, _business_date, _drop_slots, _net_win, _cashdesk_win,
    v_tables_result, _client_balance
  )
  ON CONFLICT (casino_id, business_date) DO UPDATE SET
    drop_slots = EXCLUDED.drop_slots,
    net_win = EXCLUDED.net_win,
    cashdesk_win = EXCLUDED.cashdesk_win,
    tables_result = EXCLUDED.tables_result,
    players_card_balance = EXCLUDED.players_card_balance,
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'business_date', _business_date, 'tables_result', v_tables_result);
END;
$function$;

REVOKE ALL ON FUNCTION public.ace_apply_closed_report(uuid,date,numeric,numeric,numeric,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ace_apply_closed_report(uuid,date,numeric,numeric,numeric,numeric) TO service_role;