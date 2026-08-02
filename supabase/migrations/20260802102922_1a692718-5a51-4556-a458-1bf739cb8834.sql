ALTER TABLE public.fin_wallets DROP CONSTRAINT IF EXISTS fin_wallets_kind_check;
ALTER TABLE public.fin_wallets ADD CONSTRAINT fin_wallets_kind_check CHECK (kind IN ('cash','bank','mobile_money','safe','cage','external'));
UPDATE public.fin_wallets SET kind='mobile_money', updated_at=now() WHERE name IN ('AirTell','Tigo','Halo','M PESA','Mpesa','M-PESA');