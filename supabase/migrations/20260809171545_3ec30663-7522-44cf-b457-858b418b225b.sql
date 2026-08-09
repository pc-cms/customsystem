-- 1. People directory
CREATE TABLE public.management_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'manager' CHECK (kind IN ('manager','cctv')),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.management_people TO authenticated;
GRANT ALL ON public.management_people TO service_role;
ALTER TABLE public.management_people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mgmt_people_read" ON public.management_people FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgmt_people_write" ON public.management_people FOR ALL TO authenticated
  USING (public.is_manager_op(auth.uid()) OR public.has_role(auth.uid(),'general_manager') OR public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'hr'))
  WITH CHECK (public.is_manager_op(auth.uid()) OR public.has_role(auth.uid(),'general_manager') OR public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'hr'));

-- 2. Slots (per block / month)
CREATE TABLE public.management_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block text NOT NULL CHECK (block IN ('casino','office','cctv')),
  casino_id uuid REFERENCES public.casinos(id) ON DELETE CASCADE,
  month text NOT NULL,
  slot_index integer NOT NULL,
  person_id uuid REFERENCES public.management_people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX management_slots_unique ON public.management_slots
  (block, COALESCE(casino_id, '00000000-0000-0000-0000-000000000000'::uuid), month, slot_index);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.management_slots TO authenticated;
GRANT ALL ON public.management_slots TO service_role;
ALTER TABLE public.management_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mgmt_slots_read" ON public.management_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgmt_slots_write" ON public.management_slots FOR ALL TO authenticated
  USING (
    public.is_manager_op(auth.uid()) OR public.has_role(auth.uid(),'general_manager') OR public.is_super_admin(auth.uid())
    OR (block = 'cctv' AND public.has_role(auth.uid(),'surveillance'))
  )
  WITH CHECK (
    public.is_manager_op(auth.uid()) OR public.has_role(auth.uid(),'general_manager') OR public.is_super_admin(auth.uid())
    OR (block = 'cctv' AND public.has_role(auth.uid(),'surveillance'))
  );

-- 3. Rota
CREATE TABLE public.management_rota (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES public.management_slots(id) ON DELETE CASCADE,
  date date NOT NULL,
  shift text CHECK (shift IN ('D','M','N','L')),
  city_casino_id uuid REFERENCES public.casinos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.management_rota TO authenticated;
GRANT ALL ON public.management_rota TO service_role;
ALTER TABLE public.management_rota ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mgmt_rota_read" ON public.management_rota FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgmt_rota_write" ON public.management_rota FOR ALL TO authenticated
  USING (
    public.is_manager_op(auth.uid()) OR public.has_role(auth.uid(),'general_manager') OR public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(),'surveillance') AND EXISTS (SELECT 1 FROM public.management_slots s WHERE s.id = slot_id AND s.block = 'cctv'))
  )
  WITH CHECK (
    public.is_manager_op(auth.uid()) OR public.has_role(auth.uid(),'general_manager') OR public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(),'surveillance') AND EXISTS (SELECT 1 FROM public.management_slots s WHERE s.id = slot_id AND s.block = 'cctv'))
  );

-- 4. Attendance overrides
CREATE TABLE public.management_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES public.management_slots(id) ON DELETE CASCADE,
  date date NOT NULL,
  value text CHECK (value IN ('A','L','S')),
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.management_attendance TO authenticated;
GRANT ALL ON public.management_attendance TO service_role;
ALTER TABLE public.management_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mgmt_att_read" ON public.management_attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "mgmt_att_write" ON public.management_attendance FOR ALL TO authenticated
  USING (
    public.is_manager_op(auth.uid()) OR public.has_role(auth.uid(),'general_manager') OR public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(),'surveillance') AND EXISTS (SELECT 1 FROM public.management_slots s WHERE s.id = slot_id AND s.block = 'cctv'))
  )
  WITH CHECK (
    public.is_manager_op(auth.uid()) OR public.has_role(auth.uid(),'general_manager') OR public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(),'surveillance') AND EXISTS (SELECT 1 FROM public.management_slots s WHERE s.id = slot_id AND s.block = 'cctv'))
  );

-- updated_at triggers
CREATE TRIGGER trg_mgmt_people_upd BEFORE UPDATE ON public.management_people FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_mgmt_slots_upd BEFORE UPDATE ON public.management_slots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_mgmt_rota_upd BEFORE UPDATE ON public.management_rota FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_mgmt_att_upd BEFORE UPDATE ON public.management_attendance FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();