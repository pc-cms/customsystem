CREATE TABLE public.report_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('live_closing','slots_closing','chips_movement','total_closing')),
  source_key text NOT NULL,
  business_date date NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  captured_at timestamptz NOT NULL DEFAULT now(),
  as_of timestamptz,
  payload jsonb NOT NULL,
  superseded_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, report_type, source_key, revision)
);

CREATE INDEX idx_report_snapshots_lookup
  ON public.report_snapshots (casino_id, report_type, source_key, revision DESC);
CREATE INDEX idx_report_snapshots_date
  ON public.report_snapshots (casino_id, business_date);

GRANT SELECT, INSERT ON public.report_snapshots TO authenticated;
GRANT ALL ON public.report_snapshots TO service_role;

ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Casino users read own snapshots"
ON public.report_snapshots FOR SELECT TO authenticated
USING (
  casino_id = public.get_user_casino_id(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'boss')
  OR public.has_role(auth.uid(), 'general_manager')
);

CREATE POLICY "Casino users create snapshots"
ON public.report_snapshots FOR INSERT TO authenticated
WITH CHECK (
  casino_id = public.get_user_casino_id(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'boss')
  OR public.has_role(auth.uid(), 'general_manager')
);

CREATE OR REPLACE FUNCTION public.report_snapshots_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'report_snapshots rows are immutable — create a new revision instead';
END;
$$;

CREATE TRIGGER trg_report_snapshots_immutable
BEFORE UPDATE OR DELETE ON public.report_snapshots
FOR EACH ROW EXECUTE FUNCTION public.report_snapshots_immutable();

CREATE OR REPLACE FUNCTION public.report_snapshots_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
BEGIN
  SELECT COALESCE(MAX(revision), 0) INTO v_max
    FROM public.report_snapshots
   WHERE casino_id = NEW.casino_id
     AND report_type = NEW.report_type
     AND source_key = NEW.source_key;

  NEW.revision := v_max + 1;
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  IF v_max > 0 THEN
    UPDATE public.report_snapshots
       SET superseded_at = now()
     WHERE casino_id = NEW.casino_id
       AND report_type = NEW.report_type
       AND source_key = NEW.source_key
       AND superseded_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_report_snapshots_before_insert
BEFORE INSERT ON public.report_snapshots
FOR EACH ROW EXECUTE FUNCTION public.report_snapshots_before_insert();