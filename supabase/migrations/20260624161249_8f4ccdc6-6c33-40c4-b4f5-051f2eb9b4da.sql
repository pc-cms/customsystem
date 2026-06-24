
CREATE TABLE public.table_head_count (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.gaming_tables(id) ON DELETE CASCADE,
  date date NOT NULL,
  time_slot text NOT NULL,
  value smallint NOT NULL CHECK (value >= 0 AND value <= 99),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, table_id, date, time_slot)
);

CREATE INDEX idx_table_head_count_casino_date ON public.table_head_count(casino_id, date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_head_count TO authenticated;
GRANT ALL ON public.table_head_count TO service_role;

ALTER TABLE public.table_head_count ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Casino users see head count"
  ON public.table_head_count FOR SELECT TO authenticated
  USING (casino_id = public.get_user_casino_id(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Pit managers insert head count"
  ON public.table_head_count FOR INSERT TO authenticated
  WITH CHECK (casino_id = public.get_user_casino_id(auth.uid())
              AND (public.has_role(auth.uid(), 'pit') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'super_admin')));

CREATE POLICY "Pit managers update head count"
  ON public.table_head_count FOR UPDATE TO authenticated
  USING (casino_id = public.get_user_casino_id(auth.uid())
         AND (public.has_role(auth.uid(), 'pit') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'super_admin')));

CREATE POLICY "Pit managers delete head count"
  ON public.table_head_count FOR DELETE TO authenticated
  USING (casino_id = public.get_user_casino_id(auth.uid())
         AND (public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'super_admin')));

CREATE TRIGGER trg_table_head_count_updated_at
  BEFORE UPDATE ON public.table_head_count
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.table_head_count;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
