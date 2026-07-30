CREATE OR REPLACE FUNCTION public.get_monthly_attendance(p_casino_id uuid, p_month date)
 RETURNS TABLE(employee_id uuid, full_name text, department text, job_position text, is_pit_boss boolean, dealer_category text, photo_url text, d date, auto_hours numeric, manual_hours numeric, effective_hours numeric, raw_value text, is_holiday boolean, holiday_multiplier numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start DATE := date_trunc('month', p_month)::DATE;
  v_end   DATE := (date_trunc('month', p_month) + INTERVAL '1 month - 1 day')::DATE;
BEGIN
  RETURN QUERY
  WITH days AS (
    SELECT generate_series(v_start, v_end, INTERVAL '1 day')::DATE AS dt
  ),
  emps AS (
    SELECT e.id AS emp_id, e.full_name, e.department, e.position AS pos,
           e.is_pit_boss, e.dealer_category::text AS dcat, e.photo_url
    FROM public.employees e
    WHERE e.casino_id = p_casino_id
  ),
  raw AS (
    SELECT em.emp_id, dd.dt,
           COALESCE(sa.value, da.value) AS val
    FROM emps em
    CROSS JOIN days dd
    LEFT JOIN public.staff_attendance sa
      ON sa.employee_id = em.emp_id AND sa.date = dd.dt AND sa.casino_id = p_casino_id
    LEFT JOIN public.dealer_attendance da
      ON da.employee_id = em.emp_id AND da.date = dd.dt AND da.casino_id = p_casino_id
  ),
  parsed AS (
    SELECT r.emp_id, r.dt, r.val,
      CASE
        -- "<n>", "<n>S" (sick after n hours), "<n>L" (late, worked n hours)
        WHEN upper(btrim(coalesce(r.val,''))) ~ '^[0-9]+(\.[0-9]+)?(S|L)?$'
          THEN (regexp_replace(upper(btrim(r.val)), '(S|L)$', ''))::NUMERIC
        WHEN upper(btrim(coalesce(r.val,''))) IN ('M','EM') THEN 11
        WHEN upper(btrim(coalesce(r.val,''))) IN ('N','EN','ED','G') THEN 8
        ELSE 0
      END AS auto_h
    FROM raw r
  ),
  manual AS (
    SELECT ah.employee_id, ah.date AS dt, ah.hours
    FROM public.attendance_hours ah
    WHERE ah.casino_id = p_casino_id AND ah.date BETWEEN v_start AND v_end
  ),
  hol AS (
    SELECT h.date AS dt, h.multiplier
    FROM public.attendance_holidays h
    WHERE h.casino_id = p_casino_id AND h.date BETWEEN v_start AND v_end
  )
  SELECT
    em.emp_id, em.full_name, em.department, em.pos,
    em.is_pit_boss, em.dcat, em.photo_url,
    p.dt,
    p.auto_h,
    m.hours,
    COALESCE(m.hours, p.auto_h),
    p.val,
    (h.dt IS NOT NULL),
    COALESCE(h.multiplier, 1.0)
  FROM emps em
  JOIN parsed p ON p.emp_id = em.emp_id
  LEFT JOIN manual m ON m.employee_id = em.emp_id AND m.dt = p.dt
  LEFT JOIN hol h ON h.dt = p.dt
  ORDER BY em.department, em.full_name, p.dt;
END;
$function$;