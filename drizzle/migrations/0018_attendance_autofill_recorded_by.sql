CREATE OR REPLACE FUNCTION public.attendance_autofill_day(_casino_id uuid, _date date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n1 int := 0; n2 int := 0;
BEGIN
  WITH src AS (
    SELECT r.employee_id, coalesce(auth.uid(), r.created_by) AS who,
           trim(to_char(sc.hours, 'FM999990.##'), '.') AS v
    FROM pit_rota r
    JOIN employees e ON e.id = r.employee_id
    JOIN shift_codes sc ON sc.casino_id = r.casino_id AND sc.department = 'pit'
      AND upper(sc.code) = upper(r.shift::text) AND sc.is_working AND sc.hours > 0
    WHERE r.casino_id = _casino_id AND r.date = _date
  )
  INSERT INTO dealer_attendance (casino_id, employee_id, date, value, recorded_by)
  SELECT _casino_id, employee_id, _date, v, who FROM src WHERE who IS NOT NULL
  ON CONFLICT (casino_id, employee_id, date) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    WHERE coalesce(btrim(dealer_attendance.value), '') = '';
  GET DIAGNOSTICS n1 = ROW_COUNT;

  WITH src AS (
    SELECT r.employee_id, coalesce(auth.uid(), r.created_by) AS who,
           trim(to_char(sc.hours, 'FM999990.##'), '.') AS v
    FROM staff_rota r
    JOIN employees e ON e.id = r.employee_id
    JOIN shift_codes sc ON sc.casino_id = r.casino_id
      AND sc.department = CASE e.department WHEN 'Security' THEN 'security' WHEN 'Office' THEN 'office' ELSE 'floor' END
      AND upper(sc.code) = upper(r.shift::text) AND sc.is_working AND sc.hours > 0
    WHERE r.casino_id = _casino_id AND r.date = _date
  )
  INSERT INTO staff_attendance (casino_id, employee_id, date, value, recorded_by)
  SELECT _casino_id, employee_id, _date, v, who FROM src WHERE who IS NOT NULL
  ON CONFLICT (casino_id, employee_id, date) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    WHERE coalesce(btrim(staff_attendance.value), '') = '';
  GET DIAGNOSTICS n2 = ROW_COUNT;
  RETURN n1 + n2;
END $$;
REVOKE ALL ON FUNCTION public.attendance_autofill_day(uuid, date) FROM PUBLIC, anon, authenticated;