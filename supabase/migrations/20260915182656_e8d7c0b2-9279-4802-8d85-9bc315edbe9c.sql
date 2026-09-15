CREATE TABLE public.staff_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  advance_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date,
  amount bigint NOT NULL CHECK (amount > 0),
  note text,
  paid_out boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_advances TO authenticated;
GRANT ALL ON public.staff_advances TO service_role;

ALTER TABLE public.staff_advances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_advances_read" ON public.staff_advances
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.can_finance(auth.uid())
  OR ((public.has_role(auth.uid(),'hr'::app_role) OR public.can_manage(auth.uid()))
      AND public.has_casino_scope(auth.uid(), casino_id))
);

CREATE POLICY "staff_advances_write" ON public.staff_advances
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.can_finance(auth.uid())
  OR ((public.has_role(auth.uid(),'hr'::app_role) OR public.can_manage(auth.uid()))
      AND public.has_casino_scope(auth.uid(), casino_id))
)
WITH CHECK (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR public.can_finance(auth.uid())
  OR ((public.has_role(auth.uid(),'hr'::app_role) OR public.can_manage(auth.uid()))
      AND public.has_casino_scope(auth.uid(), casino_id))
);

CREATE INDEX idx_staff_advances_period ON public.staff_advances (casino_id, year, month);
CREATE INDEX idx_staff_advances_employee ON public.staff_advances (employee_id, year, month);

CREATE TRIGGER trg_staff_advances_updated_at
BEFORE UPDATE ON public.staff_advances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();