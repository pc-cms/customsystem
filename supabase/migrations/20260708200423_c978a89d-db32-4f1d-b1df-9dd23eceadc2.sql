
CREATE TABLE public.casino_packages (
  code text PRIMARY KEY,
  name text NOT NULL,
  description text,
  modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_tables integer,
  max_users integer,
  price_usd numeric(10,2),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.casino_packages TO authenticated;
GRANT ALL ON public.casino_packages TO service_role;

ALTER TABLE public.casino_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read packages"
  ON public.casino_packages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Only super_admin can modify packages"
  ON public.casino_packages FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_casino_packages_updated_at
  BEFORE UPDATE ON public.casino_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed 9 packages. Module keys must match src/lib/modules.ts ModuleKey enum.
INSERT INTO public.casino_packages (code, name, description, modules, max_tables, max_users, price_usd, sort_order) VALUES
('demo', 'Demo', 'Read-only sandbox for evaluation. All modules visible, no financial writes.',
 '["dashboard","pit_rota","cage_view","tables","reports"]'::jsonb,
 2, 3, 0, 0),
('starter', 'Starter', 'Single cashier, minimal ops. Live game only.',
 '["dashboard","cage","cage_view","closings","pit_rota","pit_attendance","tables","table_tracker","players","reception","reception_checkin","reports"]'::jsonb,
 4, 8, 299, 10),
('live_basic', 'Live Basic', 'Full live game: pit, cage, tables, players, basic reports.',
 '["dashboard","pit_rota","pit_breaklist","pit_attendance","pit_active_players","pit_dealers","cage","cage_view","closings","cashless","tips_and_bonuses","tables","table_tracker","table_results","players","in_casino","blacklist","reception","reception_checkin","reception_register","reception_update","reports","miss_chips","cancelled_transactions","logs"]'::jsonb,
 10, 25, 799, 20),
('live_pro', 'Live Pro', 'Live Basic + finance, HR, incidents, CRM, marketing.',
 '["dashboard","pit_rota","pit_breaklist","pit_attendance","pit_active_players","pit_dealers","incidents","pit_book","cage","cage_view","closings","cashless","tips_and_bonuses","daily_expenses","tables","table_tracker","table_results","players","in_casino","blacklist","groups","reception","reception_checkin","reception_register","reception_update","crm_players","bank_checks","expenses","expenses_approvals","finance_dashboard","finance_wallets","finance_cash_count","finance_budget","finance_review","finance_summary","finance_payments","payroll","reports","miss_chips","cancelled_transactions","import_reports","staff_employees","employee_playlist","staff_rota","staff_attendance","staff_master","hr_warnings","cctv","cctv_dashboard","marketing_campaigns","logs","admin"]'::jsonb,
 25, 100, 1499, 30),
('slots_basic', 'Slots Basic', 'Slots cage only, no live game.',
 '["dashboard","cage_slots","cage_view","closings","cashless","players","reception","reception_checkin","reports","logs"]'::jsonb,
 NULL, 15, 599, 40),
('slots_pro', 'Slots Pro', 'Slots Basic + finance, tips, HR.',
 '["dashboard","cage_slots","cage_view","closings","cashless","tips_and_bonuses","players","in_casino","blacklist","reception","reception_checkin","reception_register","reception_update","bank_checks","expenses","finance_dashboard","finance_wallets","finance_cash_count","finance_summary","payroll","reports","staff_employees","staff_rota","staff_attendance","hr_warnings","cctv","logs","admin"]'::jsonb,
 NULL, 40, 1199, 50),
('combo_basic', 'Combo Basic', 'Live Basic + Slots Basic together.',
 '["dashboard","pit_rota","pit_breaklist","pit_attendance","pit_dealers","cage","cage_slots","cage_view","closings","cashless","tips_and_bonuses","tables","table_tracker","table_results","players","in_casino","blacklist","reception","reception_checkin","reception_register","reports","miss_chips","logs"]'::jsonb,
 12, 40, 1299, 60),
('combo_pro', 'Combo Pro', 'Live Pro + Slots Pro combined.',
 '["dashboard","pit_rota","pit_breaklist","pit_attendance","pit_active_players","pit_dealers","incidents","pit_book","cage","cage_slots","cage_view","closings","cashless","tips_and_bonuses","daily_expenses","tables","table_tracker","table_results","players","in_casino","blacklist","groups","reception","reception_checkin","reception_register","reception_update","crm_players","bank_checks","expenses","expenses_approvals","finance_dashboard","finance_wallets","finance_cash_count","finance_budget","finance_review","finance_summary","finance_payments","payroll","reports","miss_chips","cancelled_transactions","import_reports","staff_employees","employee_playlist","staff_rota","staff_attendance","staff_master","hr_warnings","cctv","cctv_dashboard","marketing_campaigns","logs","admin"]'::jsonb,
 30, 150, 2299, 70),
('enterprise', 'Enterprise', 'Everything: Combo Pro + Club (Premier Promo), KYC, POS, all reports.',
 '["dashboard","pit_rota","pit_breaklist","pit_attendance","pit_active_players","pit_dealers","incidents","pit_book","cage","cage_slots","cage_view","closings","cashless","tips_and_bonuses","daily_expenses","tables","table_tracker","table_results","players","in_casino","blacklist","groups","reception","reception_checkin","reception_register","reception_update","crm_players","kyc_reviews","bank_checks","expenses","expenses_approvals","finance_dashboard","finance_wallets","finance_cash_count","finance_budget","finance_review","finance_transfers","finance_summary","finance_payments","payroll","reports","miss_chips","cancelled_transactions","import_reports","staff_employees","employee_playlist","staff_rota","staff_attendance","staff_master","hr_warnings","cctv","cctv_dashboard","marketing_campaigns","promo_codes","promo_grants","lotteries","shop_catalog","shop_orders","am_budget","am_performance","fm_topups","report_promo_issuance","report_promo_redemptions","report_promo_expiry","report_promo_codes","report_cashback","report_lottery_sales","report_am_budget","logs","admin"]'::jsonb,
 NULL, NULL, 3999, 80);
