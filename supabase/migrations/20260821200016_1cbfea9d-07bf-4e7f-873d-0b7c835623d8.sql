-- 1. Schema: canonical wallet metadata
ALTER TABLE public.fin_wallets
  ADD COLUMN IF NOT EXISTS wallet_group text,
  ADD COLUMN IF NOT EXISTS canonical_code text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_account_ref text,
  ADD COLUMN IF NOT EXISTS is_legacy boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finance_hub_account_id uuid;

ALTER TABLE public.fin_wallets DROP CONSTRAINT IF EXISTS fin_wallets_kind_check;
ALTER TABLE public.fin_wallets ADD CONSTRAINT fin_wallets_kind_check
  CHECK (kind = ANY (ARRAY['cash','bank','mobile_money','safe','cage','external','digital_wallet','selcom']));

ALTER TABLE public.fin_wallets DROP CONSTRAINT IF EXISTS fin_wallets_group_check;
ALTER TABLE public.fin_wallets ADD CONSTRAINT fin_wallets_group_check
  CHECK (wallet_group IS NULL OR wallet_group = ANY (ARRAY['cash','banks','mobile_money','digital_wallets','selcom','operational_safes','legacy_other']));

CREATE INDEX IF NOT EXISTS idx_fin_wallets_group ON public.fin_wallets (casino_id, wallet_group);
CREATE INDEX IF NOT EXISTS idx_fin_wallets_canonical_code ON public.fin_wallets (canonical_code);
CREATE INDEX IF NOT EXISTS idx_fin_wallets_finance_hub ON public.fin_wallets (finance_hub_account_id);

-- 2. Normalize existing names in place (IDs preserved), only when the canonical
--    name is not already taken for that casino.
DO $$
DECLARE r record; pairs text[][] := ARRAY[
    ARRAY['Safe TZS','Cash TZS'], ARRAY['Safe USD','Cash USD'], ARRAY['Safe EUR','Cash EUR'],
    ARRAY['Safe GBP','Cash GBP'], ARRAY['Safe KES','Cash KES'],
    ARRAY['AirTell','Airtel Money'], ARRAY['M PESA','M-Pesa'],
    ARRAY['Tigo','Tigo Pesa'], ARRAY['Halo','HaloPesa']
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(pairs,1) LOOP
    UPDATE public.fin_wallets w
       SET name = pairs[i][2], updated_at = now()
     WHERE w.name = pairs[i][1]
       AND NOT EXISTS (SELECT 1 FROM public.fin_wallets x
                        WHERE x.casino_id = w.casino_id AND x.name = pairs[i][2]);
  END LOOP;

  -- CRDB (TZS) -> CRDB TZS
  UPDATE public.fin_wallets w
     SET name = 'CRDB TZS', updated_at = now()
   WHERE w.name = 'CRDB' AND w.currency = 'TZS'
     AND NOT EXISTS (SELECT 1 FROM public.fin_wallets x
                      WHERE x.casino_id = w.casino_id AND x.name = 'CRDB TZS');
END $$;

-- 3. Classification (group / canonical_code / provider / kind)
UPDATE public.fin_wallets SET
  wallet_group = 'cash', canonical_code = 'CASH_' || currency, kind = 'cash', is_legacy = false
WHERE name IN ('Cash TZS','Cash USD','Cash EUR','Cash GBP','Cash KES');

UPDATE public.fin_wallets SET wallet_group = 'banks', kind = 'bank', is_legacy = false,
  canonical_code = CASE name
    WHEN 'CRDB TZS' THEN 'BANK_CRDB_TZS' WHEN 'CRDB USD' THEN 'BANK_CRDB_USD'
    WHEN 'NBC TZS' THEN 'BANK_NBC_TZS' WHEN 'NBC USD' THEN 'BANK_NBC_USD' END
WHERE name IN ('CRDB TZS','CRDB USD','NBC TZS','NBC USD');

UPDATE public.fin_wallets SET wallet_group = 'mobile_money', kind = 'mobile_money', is_legacy = false,
  canonical_code = CASE name
    WHEN 'Airtel Money' THEN 'MM_AIRTEL_TZS' WHEN 'M-Pesa' THEN 'MM_MPESA_TZS'
    WHEN 'Tigo Pesa' THEN 'MM_TIGO_TZS' WHEN 'HaloPesa' THEN 'MM_HALO_TZS' END
WHERE name IN ('Airtel Money','M-Pesa','Tigo Pesa','HaloPesa');

UPDATE public.fin_wallets SET wallet_group = 'operational_safes', kind = 'safe', is_legacy = false,
  canonical_code = CASE name WHEN 'Safe Live' THEN 'SAFE_LIVE' ELSE 'SAFE_SLOTS' END
WHERE name IN ('Safe Live','Safe Slots');

-- everything else that is still unclassified -> legacy / other (kept active & untouched otherwise)
UPDATE public.fin_wallets SET wallet_group = 'legacy_other', is_legacy = true
WHERE wallet_group IS NULL;

-- 4. Insert missing canonical wallets per casino (idempotent)
INSERT INTO public.fin_wallets (casino_id, name, kind, currency, wallet_group, canonical_code, provider, sort_order, is_active)
SELECT c.id, v.name, v.kind, v.currency, v.grp, v.code, v.provider, v.so, true
FROM public.casinos c
CROSS JOIN (VALUES
  ('WeChat','digital_wallet','TZS','digital_wallets','WECHAT_TZS','wechat',400),
  ('Selcom TZS','selcom','TZS','selcom','SELCOM_TZS','selcom',500),
  ('Selcom USD','selcom','USD','selcom','SELCOM_USD','selcom',501),
  ('Selcom Float','selcom','TZS','selcom','SELCOM_FLOAT_TZS','selcom',502)
) AS v(name, kind, currency, grp, code, provider, so)
WHERE NOT EXISTS (
  SELECT 1 FROM public.fin_wallets w WHERE w.casino_id = c.id AND w.name = v.name
);

-- 5. Make sure provider is set on the canonical integrated wallets
UPDATE public.fin_wallets SET provider = 'selcom' WHERE wallet_group = 'selcom' AND provider IS DISTINCT FROM 'selcom';
UPDATE public.fin_wallets SET provider = 'wechat' WHERE canonical_code = 'WECHAT_TZS' AND provider IS DISTINCT FROM 'wechat';