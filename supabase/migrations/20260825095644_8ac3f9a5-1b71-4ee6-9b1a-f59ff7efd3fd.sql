DO $do$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE proname='fin_balance_snapshot'
    AND pronamespace='public'::regnamespace LIMIT 1;

  IF position('COALESCE(inc.live_game,0)+COALESCE(inc.slots,0)+COALESCE(inc.card_balance,0)+' in v_def) = 0 THEN
    RAISE EXCEPTION 'expected daily net expression not found';
  END IF;

  v_def := replace(v_def,
    'COALESCE(inc.live_game,0)+COALESCE(inc.slots,0)+COALESCE(inc.card_balance,0)+',
    'COALESCE(inc.live_game,0)+COALESCE(inc.slots,0)+');

  EXECUTE v_def;
END
$do$;