CREATE OR REPLACE FUNCTION public.force_close_business_day_0800()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eat timestamp := (now() AT TIME ZONE 'Africa/Dar_es_Salaam');
  v_hour int := EXTRACT(HOUR FROM v_eat)::int;
  v_min  int := EXTRACT(MINUTE FROM v_eat)::int;
  v_yesterday date := v_eat::date - 1;
  v_grace boolean;
  v_c record;
  v_res jsonb := '[]'::jsonb;
  v_err text;
  v_waiting int := 0;
  v_expenses_posted int := 0;
  v_posted_for_casino int := 0;
BEGIN
  IF v_hour < 7 THEN
    RETURN jsonb_build_object('status','skipped','hour',v_hour);
  END IF;
  -- Grace: wait for the ACE closed report only between 07:00 and 07:30 EAT.
  v_grace := (v_hour = 7 AND v_min < 30);

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

    IF v_grace
       AND EXISTS (SELECT 1 FROM public.ace_ingest_keys k
                    WHERE k.casino_id = v_c.casino_id AND k.is_active)
       AND NOT EXISTS (SELECT 1 FROM public.ace_finance_snapshots s
                        WHERE s.casino_id = v_c.casino_id
                          AND s.period_id <> 0
                          AND s.business_date = v_yesterday)
    THEN
      v_waiting := v_waiting + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_res := v_res || public.close_casino_business_day_auto(
        v_c.casino_id, v_yesterday, 'auto_11am'
      ) || jsonb_build_object('casino', v_c.name, 'grace', v_grace);
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_res := v_res || jsonb_build_object('casino', v_c.name, 'error', v_err);
      INSERT INTO public.cron_run_log(job_name, status, details)
      VALUES ('force_close_business_day_0800','error',
              jsonb_build_object('casino', v_c.name, 'business_date', v_yesterday,
                                 'stage', 'close_business_day', 'error', v_err));
    END;
  END LOOP;

  IF jsonb_array_length(v_res) > 0 OR NOT v_grace OR v_expenses_posted > 0 THEN
    INSERT INTO public.cron_run_log(job_name, status, details)
    VALUES ('force_close_business_day_0800','ok',
            jsonb_build_object('business_date', v_yesterday, 'grace', v_grace,
                               'waiting_for_ace', v_waiting,
                               'expenses_posted', v_expenses_posted,
                               'results', v_res));
  END IF;

  RETURN jsonb_build_object('status','ok','business_date',v_yesterday,
                            'grace',v_grace,'waiting_for_ace',v_waiting,
                            'expenses_posted',v_expenses_posted,'results',v_res);
END;
$function$;

-- Grace polling 07:00-07:25 EAT (04:00-04:25 UTC)
SELECT cron.schedule('force-close-business-day-grace', '0,5,10,15,20,25 4 * * *',
  $$select public.force_close_business_day_0800();$$);

-- Unconditional close at 07:30 EAT (04:30 UTC)
SELECT cron.schedule('force_close_business_day_1100', '30 4 * * *',
  $$select public.force_close_business_day_0800();$$);