CREATE OR REPLACE FUNCTION public.force_close_business_day_0800()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eat timestamp := (now() AT TIME ZONE 'Africa/Dar_es_Salaam');
  v_hour int := EXTRACT(HOUR FROM v_eat)::int;
  v_yesterday date := v_eat::date - 1;
  v_c record;
  v_res jsonb := '[]'::jsonb;
  v_err text;
  v_expenses_posted int := 0;
  v_posted_for_casino int := 0;
BEGIN
  IF v_hour < 7 THEN
    RETURN jsonb_build_object('status','skipped','hour',v_hour);
  END IF;

  -- No ACE grace window: the business day closes at 07:00 EAT for every casino.
  -- Late ACE snapshots keep updating the already-closed day via their own trigger.
  FOR v_c IN
    SELECT c.id AS casino_id, c.name
    FROM public.casinos c
  LOOP
    BEGIN
      v_posted_for_casino := public.fin_post_cage_expenses_for_day(v_c.casino_id, v_yesterday);
      v_expenses_posted := v_expenses_posted + COALESCE(v_posted_for_casino, 0);
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      INSERT INTO public.cron_run_log(job_name, status, details)
      VALUES ('force_close_business_day_0800','error',
              jsonb_build_object('casino', v_c.name, 'business_date', v_yesterday,
                                 'stage', 'post_cage_expenses', 'error', v_err));
    END;

    IF EXISTS (
      SELECT 1 FROM public.business_day_closures b
      WHERE b.casino_id = v_c.casino_id AND b.business_date = v_yesterday
    ) THEN
      CONTINUE;
    END IF;

    BEGIN
      v_res := v_res || public.close_casino_business_day_auto(
        v_c.casino_id, v_yesterday, 'auto_11am'
      ) || jsonb_build_object('casino', v_c.name);
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_res := v_res || jsonb_build_object('casino', v_c.name, 'error', v_err);
      INSERT INTO public.cron_run_log(job_name, status, details)
      VALUES ('force_close_business_day_0800','error',
              jsonb_build_object('casino', v_c.name, 'business_date', v_yesterday,
                                 'stage', 'close_business_day', 'error', v_err));
    END;
  END LOOP;

  INSERT INTO public.cron_run_log(job_name, status, details)
  VALUES ('force_close_business_day_0800','ok',
          jsonb_build_object('business_date', v_yesterday,
                             'expenses_posted', v_expenses_posted,
                             'results', v_res));

  RETURN jsonb_build_object('status','ok','business_date',v_yesterday,
                            'expenses_posted',v_expenses_posted,'results',v_res);
END;
$function$;

-- One scheduled run at 07:00 EAT (04:00 UTC); drop the 07:05-07:30 duplicates.
SELECT cron.unschedule('force_close_business_day_1100');
SELECT cron.unschedule('force-close-business-day-grace');
SELECT cron.schedule('force-close-business-day-0700', '0 4 * * *', $$select public.force_close_business_day_0800();$$);

-- Close 16/09 for the casinos still open (Arusha, Mbeya).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.id FROM public.casinos c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.business_day_closures b
      WHERE b.casino_id = c.id AND b.business_date = DATE '2026-09-16'
    )
  LOOP
    PERFORM public.close_casino_business_day_auto(r.id, DATE '2026-09-16', 'auto_11am');
  END LOOP;
END $$;