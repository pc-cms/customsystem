DO $$
DECLARE v_id uuid; v_casino uuid;
BEGIN
  SELECT id, casino_id INTO v_id, v_casino FROM public.fin_month_closures
  WHERE year=2026 AND month=8 ORDER BY closed_at DESC LIMIT 1;

  IF v_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.fin_month_closures WHERE casino_id=v_casino AND year=2026 AND month=7) THEN
      UPDATE public.fin_month_closures SET year=2026, month=7 WHERE id=v_id;
    END IF;
  END IF;

  UPDATE public.fin_wallet_tx
     SET business_date = DATE '2026-07-31'
   WHERE business_date = DATE '2026-08-31' AND note LIKE 'Collection%';

  UPDATE public.fin_wallet_tx
     SET business_date = DATE '2026-08-02'
   WHERE business_date = DATE '2026-08-31' AND note LIKE 'Physical count%';
END $$;