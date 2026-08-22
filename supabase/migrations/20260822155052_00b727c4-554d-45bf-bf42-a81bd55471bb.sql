DO $mig$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname='merge_players' AND pronamespace='public'::regnamespace;
  d := replace(d, 's.tag_id = pt.tag_id', 's.tag = pt.tag');
  EXECUTE d;
END
$mig$;