CREATE TABLE public.fin_day_balance_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, business_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_day_balance_snapshot TO authenticated;
GRANT ALL ON public.fin_day_balance_snapshot TO service_role;

ALTER TABLE public.fin_day_balance_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fin_day_balance_snapshot_select"
  ON public.fin_day_balance_snapshot FOR SELECT TO authenticated
  USING (public.user_has_casino_access(auth.uid(), casino_id));

CREATE POLICY "fin_day_balance_snapshot_write"
  ON public.fin_day_balance_snapshot FOR ALL TO authenticated
  USING (public.user_has_casino_access(auth.uid(), casino_id)
         AND (public.can_finance(auth.uid()) OR public.can_manage(auth.uid())))
  WITH CHECK (public.user_has_casino_access(auth.uid(), casino_id)
         AND (public.can_finance(auth.uid()) OR public.can_manage(auth.uid())));

CREATE TABLE public.fin_month_start (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  month date NOT NULL,
  cage_casino numeric NOT NULL DEFAULT 0,
  cage_manager numeric NOT NULL DEFAULT 0,
  bank_tzs numeric NOT NULL DEFAULT 0,
  bank_usd numeric NOT NULL DEFAULT 0,
  diff_total numeric NOT NULL DEFAULT 0,
  tips_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_month_start TO authenticated;
GRANT ALL ON public.fin_month_start TO service_role;

ALTER TABLE public.fin_month_start ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fin_month_start_select"
  ON public.fin_month_start FOR SELECT TO authenticated
  USING (public.user_has_casino_access(auth.uid(), casino_id));

CREATE POLICY "fin_month_start_write"
  ON public.fin_month_start FOR ALL TO authenticated
  USING (public.user_has_casino_access(auth.uid(), casino_id)
         AND (public.can_finance(auth.uid()) OR public.can_manage(auth.uid())))
  WITH CHECK (public.user_has_casino_access(auth.uid(), casino_id)
         AND (public.can_finance(auth.uid()) OR public.can_manage(auth.uid())));

CREATE TRIGGER trg_fin_day_balance_snapshot_updated
  BEFORE UPDATE ON public.fin_day_balance_snapshot
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_fin_month_start_updated
  BEFORE UPDATE ON public.fin_month_start
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();