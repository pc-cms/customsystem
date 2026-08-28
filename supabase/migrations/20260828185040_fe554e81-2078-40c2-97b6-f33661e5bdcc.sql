-- Immediate (async) dispatch kick for the Finance Hub notifier, throttled.
CREATE TABLE IF NOT EXISTS public.finance_hub_notify_kick (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_kick_at timestamptz NOT NULL DEFAULT to_timestamp(0)
);
GRANT ALL ON public.finance_hub_notify_kick TO service_role;
ALTER TABLE public.finance_hub_notify_kick ENABLE ROW LEVEL SECURITY;
INSERT INTO public.finance_hub_notify_kick (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.finance_hub_notify_kick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_kicked boolean := false;
BEGIN
  -- Non-blocking: if another writer is already kicking, skip (cron is the net).
  IF NOT pg_try_advisory_xact_lock(hashtext('finance_hub_notify_kick')) THEN
    RETURN;
  END IF;

  UPDATE public.finance_hub_notify_kick
     SET last_kick_at = now()
   WHERE id AND last_kick_at < now() - interval '3 seconds'
  RETURNING true INTO v_kicked;

  IF COALESCE(v_kicked, false) THEN
    PERFORM net.http_post(
      url := 'https://rpehngjvwcnipvkouluu.supabase.co/functions/v1/finance-hub-notify',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"trigger":"pg_net"}'::jsonb,
      timeout_milliseconds := 8000
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'finance_hub_notify_kick skipped: %', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_finance_hub_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_event text := TG_ARGV[0];
  v_feed  text := TG_ARGV[1];
  v_json  jsonb;
  v_id    text;
BEGIN
  BEGIN
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

    -- Async, throttled wake-up of the dispatcher. pg_net only queues the call,
    -- so the casino transaction never waits on Finance Hub.
    PERFORM public.finance_hub_notify_kick();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'finance_hub_notify skipped for % (%): %', TG_TABLE_NAME, v_event, SQLERRM;
  END;

  RETURN NULL;
END;
$function$;