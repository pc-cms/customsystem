DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.ace_apply_closed_report'::regproc);
  IF position('IF _jp_in IS NOT NULL AND NOT v_manual AND NOT v_manual_jp THEN' in d) = 0 THEN
    RAISE EXCEPTION 'pattern not found';
  END IF;
  d := replace(d, 'IF _jp_in IS NOT NULL AND NOT v_manual AND NOT v_manual_jp THEN', 'IF _jp_in IS NOT NULL AND NOT v_manual_jp THEN');
  EXECUTE d;
END $$;