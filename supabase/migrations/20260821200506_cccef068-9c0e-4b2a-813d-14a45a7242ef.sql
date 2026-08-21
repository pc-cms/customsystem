-- Correction: Main Phone is a permanent Mobile Money wallet; Safe Live / Safe Slots are permanent operational safes.

-- 1. Main Phone -> mobile money, TZS, not legacy
UPDATE public.fin_wallets
   SET wallet_group = 'mobile_money',
       kind = 'mobile_money',
       currency = 'TZS',
       canonical_code = 'MM_MAIN_PHONE_TZS',
       provider = NULL,
       is_legacy = false,
       is_active = true,
       updated_at = now()
 WHERE name = 'Main Phone';

-- 2. Safe Live / Safe Slots canonical codes + active
UPDATE public.fin_wallets
   SET wallet_group = 'operational_safes', kind = 'safe', currency = 'TZS', is_legacy = false, is_active = true,
       canonical_code = CASE name WHEN 'Safe Live' THEN 'SAFE_LIVE_TZS' ELSE 'SAFE_SLOTS_TZS' END,
       updated_at = now()
 WHERE name IN ('Safe Live','Safe Slots');

-- 3. Ensure all three exist on every casino (idempotent, no duplicates)
INSERT INTO public.fin_wallets (casino_id, name, kind, currency, wallet_group, canonical_code, provider, sort_order, is_active, is_legacy)
SELECT c.id, v.name, v.kind, 'TZS', v.grp, v.code, NULL, v.so, true, false
FROM public.casinos c
CROSS JOIN (VALUES
  ('Main Phone','mobile_money','mobile_money','MM_MAIN_PHONE_TZS',310),
  ('Safe Live','safe','operational_safes','SAFE_LIVE_TZS',600),
  ('Safe Slots','safe','operational_safes','SAFE_SLOTS_TZS',601)
) AS v(name, kind, grp, code, so)
WHERE NOT EXISTS (
  SELECT 1 FROM public.fin_wallets w WHERE w.casino_id = c.id AND w.name = v.name
);