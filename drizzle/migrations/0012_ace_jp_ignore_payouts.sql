DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.ace_apply_closed_report(uuid,date,numeric,numeric,numeric,numeric,numeric)'::regprocedure);
  d := replace(d,
    $a$AND oi.source='jp' AND COALESCE(oi.note,'') NOT LIKE 'JP · ACE%'$a$,
    $a$AND oi.source='jp' AND (COALESCE(oi.note,'') LIKE 'JP · Day Closings%' OR COALESCE(oi.note,'') LIKE 'JP · Close Day%')
      AND oi.reversed_by_id IS NULL AND oi.reverses_id IS NULL$a$);
  d := replace(d,
    $b$AND COALESCE(oi.currency,'TZS') = 'TZS'
       AND oi.reversed_by_id IS NULL AND oi.reverses_id IS NULL;$b$,
    $b$AND COALESCE(oi.currency,'TZS') = 'TZS'
       AND COALESCE(oi.note,'') LIKE 'JP · ACE%'
       AND oi.reversed_by_id IS NULL AND oi.reverses_id IS NULL;$b$);
  IF position('JP · Day Closings%' in d)=0 OR position($c$LIKE 'JP · ACE%'
       AND oi.reversed$c$ in d)=0 THEN
    RAISE EXCEPTION 'ace_apply_closed_report patch did not match';
  END IF;
  EXECUTE d;
END $mig$;