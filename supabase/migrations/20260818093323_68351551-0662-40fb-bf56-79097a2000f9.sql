CREATE TABLE public.ace_ingest_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_code TEXT NOT NULL UNIQUE,
  display_name TEXT,
  casino_id UUID REFERENCES public.casinos(id) ON DELETE SET NULL,
  key_sha256 TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.ace_ingest_keys TO service_role;
ALTER TABLE public.ace_ingest_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ace_ingest_keys service only" ON public.ace_ingest_keys FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.ace_finance_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_code TEXT NOT NULL,
  period_id INTEGER NOT NULL,
  period_label TEXT NOT NULL,
  total_drop NUMERIC NOT NULL,
  net_win NUMERIC NOT NULL,
  win_cashdesk NUMERIC NOT NULL,
  cashless_money_difference NUMERIC NOT NULL,
  jackpot_slip_out NUMERIC NOT NULL,
  source TEXT NOT NULL DEFAULT 'ACE',
  is_live BOOLEAN NOT NULL DEFAULT false,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ace_finance_snapshots_loc_period_key UNIQUE (location_code, period_id)
);
CREATE INDEX ace_finance_snapshots_loc_recv_idx ON public.ace_finance_snapshots (location_code, received_at DESC);

GRANT SELECT ON public.ace_finance_snapshots TO authenticated;
GRANT ALL ON public.ace_finance_snapshots TO service_role;
ALTER TABLE public.ace_finance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ace snapshots readable by authenticated" ON public.ace_finance_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "ace snapshots writable by service role" ON public.ace_finance_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_ace_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER ace_finance_snapshots_touch BEFORE UPDATE ON public.ace_finance_snapshots
FOR EACH ROW EXECUTE FUNCTION public.tg_ace_touch_updated_at();
CREATE TRIGGER ace_ingest_keys_touch BEFORE UPDATE ON public.ace_ingest_keys
FOR EACH ROW EXECUTE FUNCTION public.tg_ace_touch_updated_at();

CREATE VIEW public.ace_finance_latest
WITH (security_invoker = true) AS
SELECT DISTINCT ON (location_code) *
FROM public.ace_finance_snapshots
ORDER BY location_code, received_at DESC;

GRANT SELECT ON public.ace_finance_latest TO authenticated;
GRANT SELECT ON public.ace_finance_latest TO service_role;