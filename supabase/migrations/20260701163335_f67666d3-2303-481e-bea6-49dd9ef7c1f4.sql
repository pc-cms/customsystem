
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'fin_day_closing','fin_wallets','fin_wallet_tx','fin_money_change','fin_incomes','fin_daily_rates','fin_budget','fin_categories',
    'cage_slots_cash_counts','cage_slots_cards','cage_slots_comments','cage_slots_tips_cd_payouts','cage_slots_cash_inventory','cage_slots_exchange_rates','cage_slots_settings',
    'chip_transfers','chip_emissions','chip_initial_baseline',
    'table_daily_results',
    'pit_book_reads',
    'weekly_bonus_pools','weekly_bonus_entries',
    'user_roles','user_module_permissions','user_casino_access',
    'payroll_entries','payroll_periods','payroll_settings',
    'employees','employee_bank_accounts','employee_playlist_notes','employee_role_history',
    'promo_grants','promo_redemptions','promo_codes','promo_wallet_ledger','promo_campaigns','promo_campaign_players','promo_campaign_expenses','promo_code_redemptions',
    'kyc_reviews','shop_orders','shop_items','shop_stock_movements','lottery_tickets','lotteries','house_promo_ledger','am_budgets','am_budget_ledger',
    'pos_shifts','pos_player_charges','pos_inventory_movements','pos_stock_counts','pos_stock_count_items','pos_purchases','pos_purchase_items','pos_menu_items','pos_menu_categories','pos_modifiers','pos_recipes','pos_recipe_items','pos_order_item_modifiers','pos_locations',
    'transaction_cancellations','attendance_hours','attendance_holidays'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=t AND c.relkind='r') THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;
