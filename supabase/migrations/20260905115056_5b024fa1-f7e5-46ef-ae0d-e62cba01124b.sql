DO $mig$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fin_balance_snapshot'
    AND pg_get_function_identity_arguments(p.oid) = 'p_casino_id uuid, p_period_start date, p_period_end date';

  v_old := E'      AND (t.business_date > b.count_date\n           OR (t.business_date = b.count_date AND t.created_at > b.created_at))';
  v_new := E'      AND t.created_at > b.created_at\n      AND t.business_date >= b.count_date';

  IF v_def IS NULL OR strpos(v_def, v_old) = 0 THEN
    RAISE EXCEPTION 'fin_balance_snapshot adjm block not found';
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
END
$mig$;