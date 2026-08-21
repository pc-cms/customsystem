INSERT INTO public.fin_wallets (casino_id, name, kind, currency, sort_order, is_active)
VALUES
  ('48f4404f-7724-418c-8365-29af3998e113', 'CRDB USD',  'bank', 'USD', 20, true),
  ('48f4404f-7724-418c-8365-29af3998e113', 'Main Phone','mobile_money', 'TZS', 30, true) -- canonical MM_MAIN_PHONE_TZS, permanent (never legacy)
ON CONFLICT (casino_id, name) DO NOTHING;