CREATE OR REPLACE FUNCTION public.report_snapshots_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'report_snapshots rows are immutable — create a new revision instead';
  END IF;

  -- Only the "superseded" marker may ever change; every figure stays frozen.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.casino_id IS DISTINCT FROM OLD.casino_id
     OR NEW.report_type IS DISTINCT FROM OLD.report_type
     OR NEW.source_key IS DISTINCT FROM OLD.source_key
     OR NEW.business_date IS DISTINCT FROM OLD.business_date
     OR NEW.revision IS DISTINCT FROM OLD.revision
     OR NEW.captured_at IS DISTINCT FROM OLD.captured_at
     OR NEW.as_of IS DISTINCT FROM OLD.as_of
     OR NEW.payload::text IS DISTINCT FROM OLD.payload::text
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'report_snapshots rows are immutable — create a new revision instead';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.report_snapshots_immutable() FROM public, anon, authenticated;