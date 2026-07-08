
CREATE TABLE public.casino_settings (
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (casino_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.casino_settings TO authenticated;
GRANT ALL ON public.casino_settings TO service_role;

ALTER TABLE public.casino_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read casino_settings"
  ON public.casino_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers can insert casino_settings"
  ON public.casino_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'finance_manager')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Managers can update casino_settings"
  ON public.casino_settings FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'finance_manager')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Super admin can delete casino_settings"
  ON public.casino_settings FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX idx_casino_settings_casino ON public.casino_settings(casino_id);

CREATE TRIGGER update_casino_settings_updated_at
  BEFORE UPDATE ON public.casino_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
