
-- Live Game: drop tips from shift balance formula
CREATE OR REPLACE FUNCTION public.compute_shift_balance_from_row(s shifts)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_op_total     bigint := 0;
  v_op_chips     bigint := 0;
  v_cl_total     bigint := 0;
  v_cl_chips     bigint := 0;
  v_opening_cash bigint := 0;
  v_closing_cash bigint := 0;
  v_delta_cash   bigint := 0;
  v_expenses     bigint := 0;
  v_add_float    bigint := 0;
  v_collection   bigint := 0;
  v_slots_in     bigint := 0;
  v_slots_out    bigint := 0;
  v_miss         bigint := 0;
  v_tables       bigint := 0;
  v_tips         bigint := 0;
  v_cash_desk    bigint := 0;
  v_balance      bigint := 0;
  v_bday         date;
BEGIN
  v_op_total := COALESCE((s.opening_float->'totals'->>'total_tzs')::bigint, 0);
  v_op_chips := COALESCE((s.opening_float->'totals'->>'chips_tzs')::bigint, 0);
  v_opening_cash := GREATEST(v_op_total - v_op_chips, 0);

  v_cl_total := COALESCE((s.closing_count->'totals'->>'total_tzs')::bigint, 0);
  v_cl_chips := COALESCE((s.closing_count->'totals'->>'chips_tzs')::bigint, 0);
  v_closing_cash := GREATEST(v_cl_total - v_cl_chips, 0);

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

  -- Tips: log only, kept for display, NOT used in balance.
  SELECT COALESCE(SUM(amount), 0)::bigint INTO v_tips
    FROM public.transactions
   WHERE shift_id = s.id
     AND type IN ('tips_live','tips_poker','tips_floor')
     AND cancelled_at IS NULL;

  v_miss := COALESCE(s.miss_total, public.shift_miss_total_from_closing_count(s.closing_count), 0)::bigint;
  v_tables := COALESCE(s.tables_result, 0)::bigint;

  v_cash_desk := v_delta_cash + v_expenses + v_collection - v_add_float + v_slots_out - v_slots_in;
  -- Tips removed from balance: physically kept outside the drawer count.
  v_balance := v_cash_desk - v_tables - v_miss;

  RETURN jsonb_build_object(
    'opening_cash',     v_opening_cash,
    'closing_cash',     v_closing_cash,
    'delta_cash',       v_delta_cash,
    'expenses',         v_expenses,
    'collection',       v_collection,
    'add_float',        v_add_float,
    'slots_in',         v_slots_in,
    'slots_out',        v_slots_out,
    'miss',             v_miss,
    'tables_result',    v_tables,
    'tips',             v_tips,
    'cash_desk_result', v_cash_desk,
    'shift_balance',    v_balance
  );
END;
$function$;

-- Slots PC: drop tips IN/OUT from CDR formula
CREATE OR REPLACE FUNCTION public.compute_slots_shift_balance_from_row(s cage_slots_shifts)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_opening_cash_tzs bigint := 0;
  v_closing_cash_tzs bigint := 0;
  v_expenses         bigint := 0;
  v_add_float        bigint := 0;
  v_collection       bigint := 0;
  v_lg_in            bigint := 0;
  v_lg_out           bigint := 0;
  v_cashless_in      bigint := 0;
  v_cashless_out     bigint := 0;
  v_cashless_balance bigint := 0;
  v_cashless_final   bigint := 0;
  v_open_cards       int    := 0;
  v_close_cards      int    := 0;
  v_card_value       bigint := 0;
  v_cards_miss       bigint := 0;
  v_system_result    bigint := 0;
  v_ace_fills        bigint := 0;
  v_slots_result     bigint := 0;
  v_delta_cash       bigint := 0;
  v_cash_desk_result bigint := 0;
  v_expected         bigint := 0;
  v_balance          bigint := 0;
  v_tips_cd          bigint := 0;
  v_tips_cd_payout_day     bigint := 0;
  v_tips_cd_payout_evening bigint := 0;
  v_tips_cd_payout         bigint := 0;
  v_closing_seed     jsonb;
  v_usd_rate         numeric := 0;
BEGIN
  SELECT COALESCE(rate_to_tzs, 0) INTO v_usd_rate
    FROM public.cage_slots_exchange_rates
   WHERE cage_slots_shift_id = s.id AND currency_code = 'USD' LIMIT 1;

  SELECT COALESCE(SUM(total_tzs), 0)::bigint INTO v_opening_cash_tzs
    FROM public.cage_slots_cash_inventory
   WHERE cage_slots_shift_id = s.id AND inventory_type = 'opening';

  SELECT COALESCE(SUM(total_tzs), 0)::bigint INTO v_closing_cash_tzs
    FROM public.cage_slots_cash_inventory
   WHERE cage_slots_shift_id = s.id AND inventory_type = 'closing';

  SELECT denominations INTO v_closing_seed
    FROM public.cage_slots_cash_counts
   WHERE cage_slots_shift_id = s.id
     AND COALESCE((denominations->>'is_opening')::boolean, false) IS FALSE
   ORDER BY COALESCE((denominations->>'is_closing')::boolean, false) DESC, created_at DESC
   LIMIT 1;

  IF v_closing_seed IS NOT NULL THEN
    v_closing_cash_tzs := v_closing_cash_tzs
      + COALESCE((v_closing_seed->'bank'->>'tzs')::bigint, 0)
      + COALESCE(((v_closing_seed->'bank'->>'usd')::numeric * v_usd_rate)::bigint, 0)
      + COALESCE((SELECT SUM((value)::bigint) FROM jsonb_each_text(COALESCE(v_closing_seed->'mobile', '{}'::jsonb))), 0);
  END IF;

  SELECT COALESCE(SUM(amount), 0)::bigint INTO v_expenses
    FROM public.expenses
   WHERE casino_id = s.casino_id AND business_date = s.business_date
     AND COALESCE(source, 'live_game') = 'slots' AND approved = true;

  SELECT
    COALESCE(SUM(CASE WHEN transfer_type = 'fill'       THEN amount END), 0)::bigint,
    COALESCE(SUM(CASE WHEN transfer_type = 'collection' THEN amount END), 0)::bigint,
    COALESCE(SUM(CASE WHEN transfer_type = 'lg_in'      THEN amount END), 0)::bigint,
    COALESCE(SUM(CASE WHEN transfer_type = 'lg_out'     THEN amount END), 0)::bigint
  INTO v_add_float, v_collection, v_lg_in, v_lg_out
  FROM public.cage_slots_transfers WHERE cage_slots_shift_id = s.id;

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'IN'  THEN amount END), 0)::bigint,
    COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount END), 0)::bigint
  INTO v_cashless_in, v_cashless_out
  FROM public.cashless_transactions WHERE cage_slots_shift_id = s.id;

  v_cashless_balance := v_cashless_in - v_cashless_out;
  v_cashless_final   := COALESCE(s.cashless_final, 0)::bigint;

  SELECT COALESCE(opening_card_count, 0), COALESCE(closing_card_count, 0), COALESCE(card_deposit_value_tzs, 0)
  INTO v_open_cards, v_close_cards, v_card_value
  FROM public.cage_slots_cards WHERE cage_slots_shift_id = s.id;

  -- Tips IN / OUT: log only, kept for display, NOT used in CDR or balance.
  SELECT COALESCE(SUM(amount), 0)::bigint INTO v_tips_cd
    FROM public.cage_slots_tips_cd WHERE cage_slots_shift_id = s.id;

  SELECT
    COALESCE(SUM(CASE WHEN bucket = 'day'     THEN amount END), 0)::bigint,
    COALESCE(SUM(CASE WHEN bucket = 'evening' THEN amount END), 0)::bigint
  INTO v_tips_cd_payout_day, v_tips_cd_payout_evening
  FROM public.cage_slots_tips_cd_payouts WHERE cage_slots_shift_id = s.id;

  v_tips_cd_payout := v_tips_cd_payout_day + v_tips_cd_payout_evening;

  v_cards_miss    := (v_open_cards - v_close_cards)::bigint * v_card_value;
  v_system_result := COALESCE(s.system_shift_result, 0)::bigint;
  v_ace_fills     := COALESCE(s.ace_fills, 0)::bigint;
  v_slots_result  := v_system_result - v_ace_fills;
  v_expected      := v_system_result;
  v_delta_cash    := v_closing_cash_tzs - v_opening_cash_tzs;

  -- Tips fully removed from CDR. Closing cash must NOT include tips physically.
  v_cash_desk_result := v_closing_cash_tzs + v_expenses - v_add_float + v_collection
                        + v_lg_out - v_lg_in;

  v_balance := v_cash_desk_result - v_system_result - v_cards_miss;

  RETURN jsonb_build_object(
    'opening_cash', v_opening_cash_tzs, 'closing_cash', v_closing_cash_tzs, 'delta_cash', v_delta_cash,
    'expenses', v_expenses, 'collection', v_collection, 'add_float', v_add_float,
    'lg_in', v_lg_in, 'lg_out', v_lg_out,
    'cashless_in', v_cashless_in, 'cashless_out', v_cashless_out,
    'cashless_balance', v_cashless_balance, 'cashless_final', v_cashless_final,
    'cards_miss', v_cards_miss,
    'system_result', v_system_result,
    'ace_fills', v_ace_fills,
    'slots_result', v_slots_result, 'slots_result_derived', v_slots_result,
    'expected', v_expected,
    'cash_desk_result', v_cash_desk_result,
    'tips_cd', v_tips_cd,
    'tips_cd_payout_day', v_tips_cd_payout_day,
    'tips_cd_payout_evening', v_tips_cd_payout_evening,
    'tips_cd_payout', v_tips_cd_payout,
    'shift_balance', v_balance,
    'balance', v_balance
  );
END;
$function$;
