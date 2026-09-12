DO $$
DECLARE
  v_shift uuid := '06e06229-50b2-4b82-90c8-234bfe760b8d';
  v_casino uuid := '7ab2eee1-5253-45db-a53b-4a25e72f747e';
  v_by uuid;
  v_at timestamptz := '2026-09-12 08:56:23.222327+00';
BEGIN
  SELECT opened_by INTO v_by FROM public.cage_slots_shifts WHERE id = v_shift;

  IF NOT EXISTS (SELECT 1 FROM public.cage_slots_cash_inventory WHERE cage_slots_shift_id = v_shift AND inventory_type = 'opening') THEN
    INSERT INTO public.cage_slots_cash_inventory
      (cage_slots_shift_id, casino_id, inventory_type, currency_code, denomination, quantity, rate_to_tzs, total_currency, total_tzs, created_by, created_at, updated_at)
    VALUES
      (v_shift, v_casino, 'opening', 'TZS', 10000, 100, 1, 1000000, 1000000, v_by, v_at, v_at);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cage_slots_cash_counts
    WHERE cage_slots_shift_id = v_shift AND (denominations->>'is_opening')::boolean IS TRUE
  ) THEN
    INSERT INTO public.cage_slots_cash_counts
      (cage_slots_shift_id, casino_id, count_type, denominations, total_tzs, counted_by, created_at)
    VALUES (
      v_shift, v_casino, 'check',
      jsonb_build_object(
        'bank', jsonb_build_object(
          'channels', jsonb_build_object(
            'CRDB_TZS', jsonb_build_object('in',0,'out',0),
            'CRDB_USD', jsonb_build_object('in',0,'out',0),
            'NBC_TZS', jsonb_build_object('in',0,'out',0),
            'NBC_USD', jsonb_build_object('in',0,'out',0),
            'SELCOM_TZS', jsonb_build_object('in',0,'out',0),
            'SELCOM_USD', jsonb_build_object('in',0,'out',0)
          ),
          'tzs', 0, 'usd', 0
        ),
        'cards', jsonb_build_object('count', 9, 'value_tzs', 5000),
        'cash', jsonb_build_array(jsonb_build_object('currency','TZS','denomination',10000,'quantity',100)),
        'is_opening', true,
        'mobile', '{}'::jsonb,
        'rateMap', jsonb_build_object('EUR',2800,'GBP',3000,'KES',17,'USD',2600),
        'totals', jsonb_build_object('is_opening', true, 'total_tzs', 1000000)
      ),
      1000000, v_by, v_at
    );
  END IF;

  UPDATE public.cage_slots_cards
     SET opening_card_count = 9, updated_at = now()
   WHERE cage_slots_shift_id = v_shift AND opening_card_count IS DISTINCT FROM 9;
END $$;