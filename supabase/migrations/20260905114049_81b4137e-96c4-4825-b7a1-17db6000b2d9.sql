DO $mig$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'fin_balance_snapshot';

  v_old := $old$      AND t.created_at > b.created_at$old$;
  v_new := $new$      AND (t.business_date > b.count_date
           OR (t.business_date = b.count_date AND t.created_at > b.created_at))$new$;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'fin_balance_snapshot not found';
  END IF;

  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'fin_balance_snapshot adjustment ordering block not found';
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;