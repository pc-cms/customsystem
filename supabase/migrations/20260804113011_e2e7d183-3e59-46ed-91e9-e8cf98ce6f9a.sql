ALTER TABLE public.fin_wallet_tx ALTER COLUMN posted_at SET DEFAULT now();
UPDATE public.fin_wallet_tx SET posted_at = COALESCE(posted_at, created_at, now()) WHERE posted_at IS NULL;