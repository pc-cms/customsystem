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
      + COALESCE(((v_closing_seed->'bank'->>'usd')::numeric * v_usd_rate)::bigint, 0);
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

  SELECT COALESCE(SUM((value)::bigint), 0)::bigint INTO v_cashless_in
    FROM jsonb_each_text(COALESCE(s.cashless_in_providers, '{}'::jsonb));
  SELECT COALESCE(SUM((value)::bigint), 0)::bigint INTO v_cashless_out
    FROM jsonb_each_text(COALESCE(s.cashless_out_providers, '{}'::jsonb));

  v_cashless_balance := v_cashless_in - v_cashless_out;
  v_cashless_final   := COALESCE(s.cashless_final, 0)::bigint;
  v_closing_cash_tzs := v_closing_cash_tzs + v_cashless_balance;

  SELECT COALESCE(opening_card_count, 0), COALESCE(closing_card_count, 0), COALESCE(card_deposit_value_tzs, 0)
  INTO v_open_cards, v_close_cards, v_card_value
  FROM public.cage_slots_cards WHERE cage_slots_shift_id = s.id;

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