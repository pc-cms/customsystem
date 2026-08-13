UPDATE public.gaming_tables
SET status = 'closed', closing_result = 0, closing_chips = '{}'::jsonb
WHERE casino_id = '7ab2eee1-5253-45db-a53b-4a25e72f747e'
  AND status = 'open';

UPDATE public.shifts
SET status = 'closed',
    closed_at = now(),
    closing_count = jsonb_build_object(
      'chips', '{}'::jsonb,
      'cash', '{}'::jsonb,
      'bank', '{}'::jsonb,
      'mobile', '{}'::jsonb,
      'totals', jsonb_build_object('total_tzs', 0, 'chips_tzs', 0),
      'chip_miss_total', 0,
      'voided_open', true
    ),
    closing_cash = jsonb_build_object(
      'actual', 0, 'expected', 0, 'difference', 0,
      'cash_delta', 0, 'cash_result', 0, 'cash_desk_result', 0,
      'cash_desk_balance', 0, 'result_table', 0, 'shift_result', 0
    ),
    cash_result = 0,
    shift_result = 0,
    miss_total = 0,
    balance = 0,
    notes = COALESCE(notes, '') || 'Shift was opened incorrectly (empty opening float, no transactions). Closed by admin so the cage can re-open the Live Game shift with the correct float.'
WHERE id = 'be5b1a0d-fee7-49fa-b331-eff4bf036978'
  AND status = 'open';