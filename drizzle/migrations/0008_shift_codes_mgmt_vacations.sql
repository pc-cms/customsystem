
CREATE TABLE public.shift_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  department text NOT NULL CHECK (department IN ('pit','floor','security','office','management')),
  code text NOT NULL,
  start_time time,
  end_time time,
  hours numeric NOT NULL DEFAULT 0,
  color text,
  is_working boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, department, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_codes TO authenticated;
GRANT ALL ON public.shift_codes TO service_role;
ALTER TABLE public.shift_codes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_edit_shift_codes(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'super_admin') OR public.has_role(_uid,'finance_manager')
      OR public.has_role(_uid,'shift_manager') OR public.has_role(_uid,'boss')
      OR public.has_role(_uid,'general_manager')
$$;

CREATE POLICY shift_codes_read ON public.shift_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY shift_codes_write ON public.shift_codes FOR ALL TO authenticated
  USING (public.can_edit_shift_codes(auth.uid())) WITH CHECK (public.can_edit_shift_codes(auth.uid()));

-- Recalc auto hours from 2026-09-01 on when a code's hours change.
CREATE OR REPLACE FUNCTION public.tg_shift_codes_recalc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old text := trim(trailing '.' from trim(trailing '0' from OLD.hours::text));
  v_new text := trim(trailing '.' from trim(trailing '0' from NEW.hours::text));
BEGIN
  NEW.updated_at := now();
  IF NEW.hours = OLD.hours AND NEW.code = OLD.code THEN RETURN NEW; END IF;
  IF NEW.hours = 0 THEN RETURN NEW; END IF;
  IF OLD.department = 'pit' THEN
    UPDATE public.dealer_attendance a SET value = v_new, updated_at = now()
      FROM public.pit_rota r
     WHERE r.employee_id = a.employee_id AND r.date = a.date AND r.casino_id = a.casino_id
       AND a.casino_id = OLD.casino_id AND a.date >= DATE '2026-09-01'
       AND r.shift::text = OLD.code AND a.value = v_old;
  ELSIF OLD.department IN ('floor','security','office') THEN
    UPDATE public.staff_attendance a SET value = v_new, updated_at = now()
      FROM public.staff_rota r, public.employees e
     WHERE r.employee_id = a.employee_id AND r.date = a.date AND r.casino_id = a.casino_id
       AND e.id = a.employee_id
       AND a.casino_id = OLD.casino_id AND a.date >= DATE '2026-09-01'
       AND r.shift = OLD.code AND a.value = v_old
       AND CASE OLD.department
             WHEN 'security' THEN e.department = 'Security'
             WHEN 'office' THEN e.department = 'Office'
             ELSE coalesce(e.department,'') NOT IN ('Security','Office','Pit') END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER shift_codes_recalc BEFORE UPDATE ON public.shift_codes
  FOR EACH ROW EXECUTE FUNCTION public.tg_shift_codes_recalc();

-- Management: network roles edit everything, managers only their casino block.
CREATE OR REPLACE FUNCTION public.is_mgmt_network_editor(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_uid) OR public.has_role(_uid,'finance_manager')
      OR public.has_role(_uid,'boss') OR public.has_role(_uid,'general_manager')
      OR public.has_role(_uid,'hr')
$$;

CREATE OR REPLACE FUNCTION public.can_edit_mgmt_slot(_uid uuid, _block text, _casino_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_mgmt_network_editor(_uid)
      OR (_block = 'casino' AND (public.is_manager_op(_uid) OR public.has_role(_uid,'shift_manager') OR public.has_role(_uid,'manager'))
          AND _casino_id = public.get_user_casino_id(_uid))
      OR (_block = 'cctv' AND public.has_role(_uid,'surveillance'))
$$;

CREATE OR REPLACE FUNCTION public.can_edit_mgmt_slot_id(_uid uuid, _slot_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT public.can_edit_mgmt_slot(_uid, s.block, s.casino_id) FROM public.management_slots s WHERE s.id = _slot_id), false)
$$;

DROP POLICY IF EXISTS mgmt_slots_write ON public.management_slots;
CREATE POLICY mgmt_slots_write ON public.management_slots FOR ALL TO authenticated
  USING (public.can_edit_mgmt_slot(auth.uid(), block, casino_id))
  WITH CHECK (public.can_edit_mgmt_slot(auth.uid(), block, casino_id));
DROP POLICY IF EXISTS mgmt_rota_write ON public.management_rota;
CREATE POLICY mgmt_rota_write ON public.management_rota FOR ALL TO authenticated
  USING (public.can_edit_mgmt_slot_id(auth.uid(), slot_id))
  WITH CHECK (public.can_edit_mgmt_slot_id(auth.uid(), slot_id));
DROP POLICY IF EXISTS mgmt_att_write ON public.management_attendance;
CREATE POLICY mgmt_att_write ON public.management_attendance FOR ALL TO authenticated
  USING (public.can_edit_mgmt_slot_id(auth.uid(), slot_id))
  WITH CHECK (public.can_edit_mgmt_slot_id(auth.uid(), slot_id));

ALTER TABLE public.management_rota ADD COLUMN source text NOT NULL DEFAULT 'manual';

-- Vacations
CREATE TABLE public.management_vacations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.management_people(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  color text NOT NULL DEFAULT 'emerald',
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.management_vacations TO authenticated;
GRANT ALL ON public.management_vacations TO service_role;
ALTER TABLE public.management_vacations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_edit_vacations(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_uid) OR public.has_role(_uid,'finance_manager')
      OR public.has_role(_uid,'boss') OR public.has_role(_uid,'general_manager')
$$;
CREATE POLICY mgmt_vac_read ON public.management_vacations FOR SELECT TO authenticated USING (true);
CREATE POLICY mgmt_vac_write ON public.management_vacations FOR ALL TO authenticated
  USING (public.can_edit_vacations(auth.uid())) WITH CHECK (public.can_edit_vacations(auth.uid()));

CREATE OR REPLACE FUNCTION public.mgmt_vacation_apply(_person uuid, _from date, _to date, _add boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _add THEN
    INSERT INTO public.management_rota (slot_id, date, shift, source)
    SELECT s.id, d::date, 'L', 'vacation'
      FROM generate_series(_from, _to, interval '1 day') d
      JOIN public.management_slots s ON s.person_id = _person AND s.block <> 'cctv'
       AND s.month = to_char(d, 'YYYY-MM')
    ON CONFLICT (slot_id, date) DO NOTHING;
  ELSE
    DELETE FROM public.management_rota r USING public.management_slots s
     WHERE r.slot_id = s.id AND s.person_id = _person AND r.source = 'vacation'
       AND r.date BETWEEN _from AND _to;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tg_mgmt_vacation_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    PERFORM public.mgmt_vacation_apply(OLD.person_id, OLD.start_date, OLD.end_date, false);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    NEW.updated_at := now();
    PERFORM public.mgmt_vacation_apply(NEW.person_id, NEW.start_date, NEW.end_date, true);
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER mgmt_vacation_sync_iu BEFORE INSERT OR UPDATE ON public.management_vacations
  FOR EACH ROW EXECUTE FUNCTION public.tg_mgmt_vacation_sync();
CREATE TRIGGER mgmt_vacation_sync_d AFTER DELETE ON public.management_vacations
  FOR EACH ROW EXECUTE FUNCTION public.tg_mgmt_vacation_sync();
