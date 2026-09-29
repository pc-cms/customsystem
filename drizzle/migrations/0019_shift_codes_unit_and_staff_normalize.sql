ALTER TABLE public.shift_codes ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE public.shift_codes DROP CONSTRAINT IF EXISTS shift_codes_casino_id_department_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS shift_codes_casino_dept_unit_code_key
  ON public.shift_codes (casino_id, department, coalesce(unit, ''), code);

-- Unit key for an employee (matches frontend StaffDepartment / pit unit keys)
CREATE OR REPLACE FUNCTION public.employee_unit_key(_department text, _position text, _is_pit_boss boolean)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _department = 'Pit' THEN CASE WHEN coalesce(_is_pit_boss,false) OR _position IN ('Pit Boss','Trainer') THEN 'pit_bosses' ELSE 'dealers' END
    WHEN _department = 'Security' THEN 'security'
    WHEN _department = 'Office' THEN CASE WHEN _position = 'HR' THEN 'hr' ELSE 'it' END
    WHEN _department = 'Floor' THEN CASE _position
        WHEN 'Cashier' THEN 'cashier' WHEN 'Head Cashier' THEN 'cashier'
        WHEN 'Bartender' THEN 'bartender' WHEN 'Supervisor' THEN 'bartender'
        WHEN 'Housekeeper' THEN 'cleaner'
        WHEN 'Attendant' THEN 'hostess' WHEN 'Hostess' THEN 'hostess'
        WHEN 'Receptionist' THEN 'reception'
        ELSE 'cleaner' END
    ELSE NULL END
$$;

-- Seed per-unit codes from current department codes (same hours as today)
INSERT INTO public.shift_codes (casino_id, department, unit, code, start_time, end_time, hours, color, is_working, sort_order)
SELECT sc.casino_id, sc.department, u.unit, sc.code, sc.start_time, sc.end_time, sc.hours, sc.color, sc.is_working, sc.sort_order
FROM public.shift_codes sc
JOIN (VALUES ('pit','dealers'),('pit','pit_bosses'),
             ('floor','cashier'),('floor','bartender'),('floor','cleaner'),('floor','hostess'),('floor','reception'),
             ('security','security'),('office','hr'),('office','it')) AS u(dept, unit) ON u.dept = sc.department
WHERE sc.unit IS NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.attendance_autofill_day(_casino_id uuid, _date date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n1 int := 0; n2 int := 0;
BEGIN
  WITH src AS (
    SELECT r.employee_id, coalesce(auth.uid(), r.created_by) AS who,
           trim(to_char(sc.hours, 'FM999990.##'), '.') AS v
    FROM pit_rota r
    JOIN employees e ON e.id = r.employee_id
    JOIN LATERAL (
      SELECT s.* FROM shift_codes s
      WHERE s.casino_id = r.casino_id AND s.department = 'pit' AND upper(s.code) = upper(r.shift::text)
        AND (s.unit = employee_unit_key(e.department, e.position, e.is_pit_boss) OR s.unit IS NULL)
      ORDER BY (s.unit IS NULL) LIMIT 1) sc ON sc.is_working AND sc.hours > 0
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
    JOIN LATERAL (
      SELECT s.* FROM shift_codes s
      WHERE s.casino_id = r.casino_id
        AND s.department = CASE e.department WHEN 'Security' THEN 'security' WHEN 'Office' THEN 'office' ELSE 'floor' END
        AND upper(s.code) = upper(r.shift::text)
        AND (s.unit = employee_unit_key(e.department, e.position, e.is_pit_boss) OR s.unit IS NULL)
      ORDER BY (s.unit IS NULL) LIMIT 1) sc ON sc.is_working AND sc.hours > 0
    WHERE r.casino_id = _casino_id AND r.date = _date AND e.department <> 'Unassigned'
  )
  INSERT INTO staff_attendance (casino_id, employee_id, date, value, recorded_by)
  SELECT _casino_id, employee_id, _date, v, who FROM src WHERE who IS NOT NULL
  ON CONFLICT (casino_id, employee_id, date) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    WHERE coalesce(btrim(staff_attendance.value), '') = '';
  GET DIAGNOSTICS n2 = ROW_COUNT;
  RETURN n1 + n2;
END $$;
REVOKE ALL ON FUNCTION public.attendance_autofill_day(uuid, date) FROM PUBLIC, anon, authenticated;