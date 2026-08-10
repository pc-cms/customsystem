ALTER TABLE public.fin_wallets ADD COLUMN IF NOT EXISTS is_office boolean NOT NULL DEFAULT false;

UPDATE public.fin_wallets SET is_office = true WHERE kind IN ('cash', 'mobile_money', 'office_safe');

CREATE TABLE public.fin_report_start (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope text NOT NULL DEFAULT 'company',
  cage_casino numeric NOT NULL DEFAULT 0,
  cage_office numeric NOT NULL DEFAULT 0,
  bank numeric NOT NULL DEFAULT 0,
  started_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_report_start_scope_unique UNIQUE (scope)
);

GRANT SELECT, INSERT, UPDATE ON public.fin_report_start TO authenticated;
GRANT ALL ON public.fin_report_start TO service_role;

ALTER TABLE public.fin_report_start ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance and leadership can view report start"
ON public.fin_report_start FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
  OR public.has_role(auth.uid(), 'general_manager')
  OR public.has_role(auth.uid(), 'boss')
  OR public.has_role(auth.uid(), 'manager')
);

CREATE POLICY "Finance can insert report start"
ON public.fin_report_start FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
);

CREATE POLICY "Finance can update report start"
ON public.fin_report_start FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
);

CREATE TRIGGER update_fin_report_start_updated_at
BEFORE UPDATE ON public.fin_report_start
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();