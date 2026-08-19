DO $$
DECLARE v_arusha uuid := '48f4404f-7724-418c-8365-29af3998e113';
        r record;
BEGIN
  SELECT drop_slots, net_win, cashdesk_win, players_card_balance
    INTO r
    FROM public.fin_day_closing
   WHERE casino_id = v_arusha AND business_date = DATE '2026-08-19';
  IF FOUND THEN
    INSERT INTO public.fin_day_closing (casino_id, business_date, drop_slots, net_win, cashdesk_win, players_card_balance, tables_result, slots_result)
    VALUES (v_arusha, DATE '2026-08-18', r.drop_slots, r.net_win, r.cashdesk_win, r.players_card_balance, 0, 0)
    ON CONFLICT (casino_id, business_date) DO UPDATE SET
      drop_slots = EXCLUDED.drop_slots,
      net_win = EXCLUDED.net_win,
      cashdesk_win = EXCLUDED.cashdesk_win,
      players_card_balance = EXCLUDED.players_card_balance,
      updated_at = now();

    DELETE FROM public.fin_day_closing
     WHERE casino_id = v_arusha AND business_date = DATE '2026-08-19'
       AND locked_at IS NULL
       AND COALESCE(tables_result,0) = 0 AND COALESCE(slots_result,0) = 0;
  END IF;
END $$;

UPDATE public.ace_finance_snapshots
   SET business_date = DATE '2026-08-18'
 WHERE location_code = 'arusha' AND period_id = 31411;