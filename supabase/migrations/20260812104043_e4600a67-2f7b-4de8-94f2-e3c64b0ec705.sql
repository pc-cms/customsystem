-- 07:00:00 EAT belongs to the finished business day (rollover is exclusive at 07:00)
CREATE OR REPLACE FUNCTION public.business_date_of(_ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT (((_ts AT TIME ZONE 'Africa/Dar_es_Salaam') - interval '7 hours 1 second'))::date;
$$;

-- Auto-close forgotten days at 09:00 EAT instead of 11:00
CREATE OR REPLACE FUNCTION public.auto_close_forgotten_business_days()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _eat timestamp := (now() AT TIME ZONE 'Africa/Dar_es_Salaam');
  _eat_hour int := EXTRACT(HOUR FROM _eat)::int;
  _today date := _eat::date;
  _yesterday date := _today - 1;
  _r record;
  _closed int := 0;
  _failed int := 0;
  _err text;
BEGIN
  IF _eat_hour < 9 THEN
    RETURN;
  END IF;

  FOR _r IN
    SELECT c.id AS casino_id, c.name
    FROM public.casinos c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.business_day_closures b
      WHERE b.casino_id = c.id
        AND b.business_date = _yesterday
    )
  LOOP
    BEGIN
      PERFORM public.close_business_day(_r.casino_id, 'auto_09am'::text, false);
      _closed := _closed + 1;
    EXCEPTION WHEN OTHERS THEN
      _failed := _failed + 1;
      _err := SQLERRM;
      INSERT INTO public.cron_run_log(job_name, status, details)
      VALUES ('auto_close_forgotten_business_days', 'error',
              jsonb_build_object('casino_id', _r.casino_id,
                                 'casino', _r.name,
                                 'business_date', _yesterday,
                                 'error', _err));
    END;
  END LOOP;

  INSERT INTO public.cron_run_log(job_name, status, details)
  VALUES ('auto_close_forgotten_business_days',
          CASE WHEN _failed > 0 THEN 'warning' ELSE 'ok' END,
          jsonb_build_object('business_date', _yesterday,
                             'closed', _closed,
                             'failed', _failed));
END;
$$;