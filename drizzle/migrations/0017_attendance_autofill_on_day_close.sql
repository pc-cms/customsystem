CREATE OR REPLACE FUNCTION public.attendance_autofill_day(_casino_id uuid, _date date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n1 int := 0; n2 int := 0;
BEGIN
  WITH src AS (
    SELECT r.employee_id, trim(to_char(sc.hours, 'FM999990.##'), '.') AS v
    FROM pit_rota r
    JOIN employees e ON e.id = r.employee_id
    JOIN shift_codes sc ON sc.casino_id = r.casino_id AND sc.department = 'pit'
      AND upper(sc.code) = upper(r.shift::text) AND sc.is_working AND sc.hours > 0
    WHERE r.casino_id = _casino_id AND r.date = _date
  )
  INSERT INTO dealer_attendance (casino_id, employee_id, date, value)
  SELECT _casino_id, employee_id, _date, v FROM src
  ON CONFLICT (casino_id, employee_id, date) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    WHERE coalesce(btrim(dealer_attendance.value), '') = '';
  GET DIAGNOSTICS n1 = ROW_COUNT;

  WITH src AS (
    SELECT r.employee_id, trim(to_char(sc.hours, 'FM999990.##'), '.') AS v
    FROM staff_rota r
    JOIN employees e ON e.id = r.employee_id
    JOIN shift_codes sc ON sc.casino_id = r.casino_id
      AND sc.department = CASE e.department WHEN 'Security' THEN 'security' WHEN 'Office' THEN 'office' ELSE 'floor' END
      AND upper(sc.code) = upper(r.shift::text) AND sc.is_working AND sc.hours > 0
    WHERE r.casino_id = _casino_id AND r.date = _date
  )
  INSERT INTO staff_attendance (casino_id, employee_id, date, value)
  SELECT _casino_id, employee_id, _date, v FROM src
  ON CONFLICT (casino_id, employee_id, date) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    WHERE coalesce(btrim(staff_attendance.value), '') = '';
  GET DIAGNOSTICS n2 = ROW_COUNT;
  RETURN n1 + n2;
END $$;
REVOKE ALL ON FUNCTION public.attendance_autofill_day(uuid, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_attendance_autofill_on_close()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.attendance_autofill_day(NEW.casino_id, NEW.business_date);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'attendance autofill failed: %', SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_attendance_autofill_on_close ON public.business_day_closures;
CREATE TRIGGER trg_attendance_autofill_on_close
AFTER INSERT OR UPDATE OF business_date, closed_at ON public.business_day_closures
FOR EACH ROW EXECUTE FUNCTION public.tg_attendance_autofill_on_close();