SELECT cron.unschedule('finance-hub-notify-dispatch') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'finance-hub-notify-dispatch');
SELECT cron.unschedule('finance-hub-notify-gc') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'finance-hub-notify-gc');

SELECT cron.schedule(
  'finance-hub-notify-dispatch',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rpehngjvwcnipvkouluu.supabase.co/functions/v1/finance-hub-notify',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"trigger":"cron"}'::jsonb,
    timeout_milliseconds := 8000
  );
  $$
);

SELECT cron.schedule(
  'finance-hub-notify-gc',
  '20 2 * * *',
  $$ SELECT public.finance_hub_notify_gc(); $$
);