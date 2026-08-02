UPDATE public.fin_wallets SET kind = 'mobile_money' WHERE name ILIKE '%main phone%';

UPDATE public.fin_wallet_tx
SET business_date = (created_at AT TIME ZONE 'Africa/Dar_es_Salaam')::date
WHERE kind = 'adjustment'
  AND note LIKE 'Physical count%'
  AND business_date <> (created_at AT TIME ZONE 'Africa/Dar_es_Salaam')::date
  AND created_at >= now() - interval '2 days';