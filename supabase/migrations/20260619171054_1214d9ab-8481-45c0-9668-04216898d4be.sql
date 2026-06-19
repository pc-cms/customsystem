CREATE OR REPLACE FUNCTION public.get_monthly_attendance(p_casino_id UUID, p_month DATE)
RETURNS TABLE (
  employee_id UUID,
  full_name TEXT,
  department TEXT,
  job_position TEXT,
  is_pit_boss BOOLEAN,
  dealer_category TEXT,
  photo_url TEXT,
  d DATE,
  auto_hours NUMERIC,
  manual_hours NUMERIC,
  effective_hours NUMERIC,
  raw_value TEXT,
  is_holiday BOOLEAN,
  holiday_multiplier NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
    r.dt,
    CASE
      WHEN r.val ~ '^[0-9]+(\.[0-9]+)?$' THEN r.val::NUMERIC
      WHEN upper(btrim(r.val)) = 'M' THEN 11
      WHEN upper(btrim(r.val)) = 'N' THEN 8
      ELSE 0
    END,
    m.hours,
    COALESCE(
      m.hours,
      CASE
        WHEN r.val ~ '^[0-9]+(\.[0-9]+)?$' THEN r.val::NUMERIC
        WHEN upper(btrim(r.val)) = 'M' THEN 11
        WHEN upper(btrim(r.val)) = 'N' THEN 8
        ELSE 0
      END
    ),
    r.val,
    (h.dt IS NOT NULL),
    COALESCE(h.multiplier, 1.0)
  FROM emps em
  JOIN raw r ON r.emp_id = em.emp_id
  LEFT JOIN manual m ON m.employee_id = em.emp_id AND m.dt = r.dt
  LEFT JOIN hol h ON h.dt = r.dt
  ORDER BY em.department, em.full_name, r.dt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_attendance(UUID, DATE) TO authenticated;