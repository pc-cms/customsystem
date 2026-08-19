CREATE TABLE public.boss_report_extras (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid not null references public.casinos(id) on delete cascade,
  year integer not null,
  month integer not null,
  label text not null,
  amount numeric(18,2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (casino_id, year, month, label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.boss_report_extras TO authenticated;
GRANT ALL ON public.boss_report_extras TO service_role;

ALTER TABLE public.boss_report_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "boss_extras_read"
  ON public.boss_report_extras FOR SELECT
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
    OR has_role(auth.uid(), 'boss'::app_role)
    OR has_role(auth.uid(), 'general_manager'::app_role)
    OR has_casino_scope(auth.uid(), casino_id)
  );

CREATE POLICY "boss_extras_write"
  ON public.boss_report_extras FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
  );

CREATE OR REPLACE FUNCTION public.trg_boss_report_extras_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_boss_report_extras_updated_at
  BEFORE UPDATE ON public.boss_report_extras
  FOR EACH ROW EXECUTE FUNCTION public.trg_boss_report_extras_touch_updated_at();