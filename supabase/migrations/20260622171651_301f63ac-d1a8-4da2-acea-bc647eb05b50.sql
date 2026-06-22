CREATE OR REPLACE FUNCTION public.compute_shift_balance_from_row(s shifts)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_op_total     bigint := 0;
  v_op_chips     bigint := 0;
  v_op_mobile    bigint := 0;
  v_cl_total     bigint := 0;
  v_cl_chips     bigint := 0;
  v_cl_mobile    bigint := 0;
  v_opening_cash bigint := 0;
  v_closing_cash bigint := 0;
  v_delta_cash   bigint := 0;
  v_expenses     bigint := 0;
  v_add_float    bigint := 0;
  v_collection   bigint := 0;
  v_slots_in     bigint := 0;
  v_slots_out    bigint := 0;
  v_cashless_in  bigint := 0;
  v_cashless_out bigint := 0;
  v_miss         bigint := 0;
  v_tables       bigint := 0;
  v_tips         bigint := 0;
  v_cash_desk    bigint := 0;
  v_balance      bigint := 0;
  v_bday         date;
BEGIN
  v_op_total  := COALESCE((s.opening_float->'totals'->>'total_tzs')::bigint, 0);
  v_op_chips  := COALESCE((s.opening_float->'totals'->>'chips_tzs')::bigint, 0);

  v_op_mobile := COALESCE(
    NULLIF((s.opening_float->'totals'->>'mobile_tzs'), '')::bigint,
    (SELECT COALESCE(SUM((value)::bigint), 0)::bigint
       FROM jsonb_each_text(COALESCE(s.opening_float->'totals'->'mobile', '{}'::jsonb))),
    (SELECT COALESCE(SUM((value)::bigint), 0)::bigint
       FROM jsonb_each_text(COALESCE(s.opening_float->'mobile', '{}'::jsonb))),
    0
  );
  v_opening_cash := GREATEST(v_op_total - v_op_chips - v_op_mobile, 0);

  v_cl_total  := COALESCE((s.closing_count->'totals'->>'total_tzs')::bigint, 0);
  v_cl_chips  := COALESCE((s.closing_count->'totals'->>'chips_tzs')::bigint, 0);
  v_cl_mobile := COALESCE(
    NULLIF((s.closing_count->'totals'->>'mobile_tzs'), '')::bigint,
    (SELECT COALESCE(SUM((value)::bigint), 0)::bigint
       FROM jsonb_each_text(COALESCE(s.closing_count->'totals'->'mobile', '{}'::jsonb))),
    (SELECT COALESCE(SUM((value)::bigint), 0)::bigint
       FROM jsonb_each_text(COALESCE(s.closing_count->'mobile', '{}'::jsonb))),
    0
  );
  v_closing_cash := GREATEST(v_cl_total - v_cl_chips - v_cl_mobile, 0);

  v_delta_cash := v_closing_cash - v_opening_cash;
  v_bday := public.business_date_of(s.opened_at);

  SELECT COALESCE(SUM(amount), 0)::bigint INTO v_expenses
    FROM public.expenses
   WHERE casino_id = s.casino_id AND business_date = v_bday
     AND COALESCE(source, 'live_game') = 'live_game' AND approved = true;

  SELECT
    COALESCE(SUM(CASE WHEN transfer_type = 'add_float'  THEN amount END), 0)::bigint,
    COALESCE(SUM(CASE WHEN transfer_type = 'collection' THEN amount END), 0)::bigint,
    COALESCE(SUM(CASE WHEN transfer_type = 'slots_in'   THEN amount END), 0)::bigint,
    COALESCE(SUM(CASE WHEN transfer_type = 'slots_out'  THEN amount END), 0)::bigint
  INTO v_add_float, v_collection, v_slots_in, v_slots_out
  FROM public.cage_transfers WHERE shift_id = s.id;

  -- Cashless IN/OUT: digital money received/paid via mobile providers (Halo, Mpesa, etc).
  -- INCLUDED in CDR because chips exchanged for cashless feed tables_result and the
  -- value really entered/left the casino (just not the physical drawer).
  SELECT COALESCE(SUM((value)::bigint), 0)::bigint INTO v_cashless_in
    FROM jsonb_each_text(COALESCE(s.cashless_in_providers, '{}'::jsonb));
  SELECT COALESCE(SUM((value)::bigint), 0)::bigint INTO v_cashless_out
    FROM jsonb_each_text(COALESCE(s.cashless_out_providers, '{}'::jsonb));

  SELECT COALESCE(SUM(amount), 0)::bigint INTO v_tips
    FROM public.transactions
   WHERE shift_id = s.id
     AND type IN ('tips_live','tips_poker','tips_floor')
     AND cancelled_at IS NULL;

  v_miss := COALESCE(s.miss_total, public.shift_miss_total_from_closing_count(s.closing_count), 0)::bigint;
  v_tables := COALESCE(s.tables_result, 0)::bigint;

  -- Canonical Live CDR (mirrors src/lib/cage-balance.ts):
  --   CDR = ΔCash + Expenses + Collection − AddFloat
  --       + SlotsOut − SlotsIn
  --       + CashlessIn − CashlessOut
  -- NO miss, NO tips, NO manual mobile balance.
  v_cash_desk := v_delta_cash + v_expenses + v_collection - v_add_float
                 + v_slots_out - v_slots_in
                 + v_cashless_in - v_cashless_out;

  v_balance := v_cash_desk - v_tables - v_miss;

  RETURN jsonb_build_object(
    'opening_cash', v_opening_cash, 'closing_cash', v_closing_cash, 'delta_cash', v_delta_cash,
    'expenses', v_expenses, 'collection', v_collection, 'add_float', v_add_float,
    'slots_in', v_slots_in, 'slots_out', v_slots_out,
    'cashless_in', v_cashless_in, 'cashless_out', v_cashless_out,
    'opening_mobile', v_op_mobile, 'closing_mobile', v_cl_mobile,
    'miss', v_miss, 'tables', v_tables, 'tips', v_tips,
    'cash_desk_result', v_cash_desk,
    'shift_balance', v_balance,
    'balance', v_balance
  );
END;
$function$;

-- Backfill cash_desk_result / balance for all closed shifts using the corrected formula.
UPDATE public.shifts s
SET cash_desk_result = (public.compute_shift_balance_from_row(s)->>'cash_desk_result')::bigint,
    balance          = (public.compute_shift_balance_from_row(s)->>'balance')::bigint
WHERE status = 'closed';