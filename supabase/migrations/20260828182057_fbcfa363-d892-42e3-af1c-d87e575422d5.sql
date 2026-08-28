-- Finance Hub near-realtime notification outbox.
-- Lightweight wake-up signals only: no financial values are ever enqueued.

CREATE TABLE IF NOT EXISTS public.finance_hub_notify_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  feed text NOT NULL,
  source_table text,
  source_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz
);

GRANT ALL ON public.finance_hub_notify_outbox TO service_role;

ALTER TABLE public.finance_hub_notify_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fh_notify_outbox_no_client_access" ON public.finance_hub_notify_outbox;
CREATE POLICY "fh_notify_outbox_no_client_access"
  ON public.finance_hub_notify_outbox FOR SELECT
  TO authenticated
  USING (false);

-- Coalescing: at most one pending row per (event, feed).
CREATE UNIQUE INDEX IF NOT EXISTS finance_hub_notify_outbox_pending_uk
  ON public.finance_hub_notify_outbox (event, feed)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS finance_hub_notify_outbox_status_idx
  ON public.finance_hub_notify_outbox (status, created_at);

-- Generic, fail-open notifier trigger. TG_ARGV[0] = event, TG_ARGV[1] = feed.
CREATE OR REPLACE FUNCTION public.tg_finance_hub_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event text := TG_ARGV[0];
  v_feed  text := TG_ARGV[1];
  v_json  jsonb;
  v_id    text;
BEGIN
  BEGIN
    -- Never notify about our own bookkeeping, and allow explicit suppression.
    IF TG_TABLE_NAME = 'finance_hub_notify_outbox' THEN
      RETURN NULL;
    END IF;
    IF COALESCE(current_setting('app.finance_hub_notify_off', true), '') = '1' THEN
      RETURN NULL;
    END IF;

    IF TG_OP = 'DELETE' THEN
      v_json := to_jsonb(OLD);
    ELSE
      v_json := to_jsonb(NEW);
    END IF;
    v_id := v_json->>'id';

    INSERT INTO public.finance_hub_notify_outbox (event, feed, source_table, source_id, occurred_at)
    VALUES (v_event, v_feed, TG_TABLE_NAME, v_id, now())
    ON CONFLICT (event, feed) WHERE status = 'pending'
    DO UPDATE SET
      source_table = EXCLUDED.source_table,
      source_id    = EXCLUDED.source_id,
      occurred_at  = EXCLUDED.occurred_at;
  EXCEPTION WHEN OTHERS THEN
    -- Fail-open: notification problems must never block casino operations.
    RAISE WARNING 'finance_hub_notify skipped for % (%): %', TG_TABLE_NAME, v_event, SQLERRM;
  END;

  RETURN NULL;
END;
$$;

-- Wallet snapshot relevant changes
DROP TRIGGER IF EXISTS tg_fh_notify_wallets ON public.fin_wallets;
CREATE TRIGGER tg_fh_notify_wallets
  AFTER INSERT OR UPDATE OR DELETE ON public.fin_wallets
  FOR EACH ROW EXECUTE FUNCTION public.tg_finance_hub_notify('wallet_changed', 'snapshot');

-- Wallet ledger transactions (Add money / Take money / transfers / adjustments)
DROP TRIGGER IF EXISTS tg_fh_notify_wallet_tx ON public.fin_wallet_tx;
CREATE TRIGGER tg_fh_notify_wallet_tx
  AFTER INSERT OR UPDATE OR DELETE ON public.fin_wallet_tx
  FOR EACH ROW EXECUTE FUNCTION public.tg_finance_hub_notify('wallet_transaction', 'transactions');

-- Operational expenses exported to Finance
DROP TRIGGER IF EXISTS tg_fh_notify_expenses ON public.expenses;
CREATE TRIGGER tg_fh_notify_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.tg_finance_hub_notify('expense_changed', 'expenses');

-- Day Closing
DROP TRIGGER IF EXISTS tg_fh_notify_day_closing ON public.fin_day_closing;
CREATE TRIGGER tg_fh_notify_day_closing
  AFTER INSERT OR UPDATE OR DELETE ON public.fin_day_closing
  FOR EACH ROW EXECUTE FUNCTION public.tg_finance_hub_notify('closing_changed', 'closings');

DROP TRIGGER IF EXISTS tg_fh_notify_day_closures ON public.business_day_closures;
CREATE TRIGGER tg_fh_notify_day_closures
  AFTER INSERT OR UPDATE OR DELETE ON public.business_day_closures
  FOR EACH ROW EXECUTE FUNCTION public.tg_finance_hub_notify('closing_changed', 'closings');

-- Daily performance / results
DROP TRIGGER IF EXISTS tg_fh_notify_cash_count_snapshots ON public.cash_count_snapshots;
CREATE TRIGGER tg_fh_notify_cash_count_snapshots
  AFTER INSERT OR UPDATE OR DELETE ON public.cash_count_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.tg_finance_hub_notify('performance_changed', 'performance');

-- Operational FX rates
DROP TRIGGER IF EXISTS tg_fh_notify_daily_rates ON public.fin_daily_rates;
CREATE TRIGGER tg_fh_notify_daily_rates
  AFTER INSERT OR UPDATE OR DELETE ON public.fin_daily_rates
  FOR EACH ROW EXECUTE FUNCTION public.tg_finance_hub_notify('fx_rate_changed', 'fx_rates');

DROP TRIGGER IF EXISTS tg_fh_notify_slots_rates ON public.cage_slots_exchange_rates;
CREATE TRIGGER tg_fh_notify_slots_rates
  AFTER INSERT OR UPDATE OR DELETE ON public.cage_slots_exchange_rates
  FOR EACH ROW EXECUTE FUNCTION public.tg_finance_hub_notify('fx_rate_changed', 'fx_rates');

-- Dispatcher helpers (service role only).
CREATE OR REPLACE FUNCTION public.finance_hub_notify_claim(p_limit integer DEFAULT 20)
RETURNS SETOF public.finance_hub_notify_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.finance_hub_notify_outbox o
     SET status = 'sending', attempts = o.attempts + 1
   WHERE o.id IN (
     SELECT i.id FROM public.finance_hub_notify_outbox i
      WHERE i.status = 'pending'
         OR (i.status = 'sending' AND i.created_at < now() - interval '5 minutes')
         OR (i.status = 'failed' AND i.attempts < 5 AND i.created_at > now() - interval '1 day')
      ORDER BY i.created_at
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_hub_notify_claim(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_hub_notify_claim(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.finance_hub_notify_mark(p_id uuid, p_ok boolean, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.finance_hub_notify_outbox
     SET status = CASE WHEN p_ok THEN 'sent' ELSE 'failed' END,
         dispatched_at = CASE WHEN p_ok THEN now() ELSE dispatched_at END,
         last_error = CASE WHEN p_ok THEN NULL ELSE left(COALESCE(p_error, 'unknown'), 500) END
   WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.finance_hub_notify_mark(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_hub_notify_mark(uuid, boolean, text) TO service_role;

CREATE OR REPLACE FUNCTION public.finance_hub_notify_gc()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.finance_hub_notify_outbox
   WHERE (status = 'sent' AND created_at < now() - interval '7 days')
      OR (status = 'failed' AND created_at < now() - interval '30 days');
$$;