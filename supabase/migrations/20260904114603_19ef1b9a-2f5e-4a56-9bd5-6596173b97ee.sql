DO $mig$
DECLARE s text;
BEGIN
  SELECT prosrc INTO s FROM pg_proc WHERE proname = 'fin_balance_snapshot';

  IF position($a$  v_collections NUMERIC;$a$ in s) = 0 THEN RAISE EXCEPTION 'anchor 1 not found'; END IF;
  s := replace(s, $a$  v_collections NUMERIC;$a$, $b$  v_collections NUMERIC;
  v_capex NUMERIC;$b$);

  IF position($a$    SELECT COALESCE(e.amount_tzs, e.amount) AS amt,
           COALESCE(fc.group_code,'') AS gcode,
           COALESCE(fc.name,'') AS cname$a$ in s) = 0 THEN RAISE EXCEPTION 'anchor 2 not found'; END IF;
  s := replace(s, $a$    SELECT COALESCE(e.amount_tzs, e.amount) AS amt,
           COALESCE(fc.group_code,'') AS gcode,
           COALESCE(fc.name,'') AS cname$a$,
  $b$    SELECT COALESCE(e.amount_tzs, e.amount) AS amt,
           COALESCE(fc.bucket,'expense') AS bucket$b$);

  IF position($a$  SELECT
    COALESCE(SUM(amt) FILTER (WHERE NOT (gcode ILIKE '%collection%' OR cname ILIKE '%collection%')),0),
    COALESCE(SUM(amt) FILTER (WHERE (gcode ILIKE '%collection%' OR cname ILIKE '%collection%')
                                AND NOT (cname ILIKE '%transfer%' OR cname ILIKE '%money change%')),0),
    COALESCE(SUM(amt) FILTER (WHERE (gcode ILIKE '%collection%' OR cname ILIKE '%collection%')
                                AND (cname ILIKE '%transfer%' OR cname ILIKE '%money change%')),0)
  INTO v_expenses, v_collections, v_transfers_exp
  FROM e;$a$ in s) = 0 THEN RAISE EXCEPTION 'anchor 3 not found'; END IF;
  s := replace(s, $a$  SELECT
    COALESCE(SUM(amt) FILTER (WHERE NOT (gcode ILIKE '%collection%' OR cname ILIKE '%collection%')),0),
    COALESCE(SUM(amt) FILTER (WHERE (gcode ILIKE '%collection%' OR cname ILIKE '%collection%')
                                AND NOT (cname ILIKE '%transfer%' OR cname ILIKE '%money change%')),0),
    COALESCE(SUM(amt) FILTER (WHERE (gcode ILIKE '%collection%' OR cname ILIKE '%collection%')
                                AND (cname ILIKE '%transfer%' OR cname ILIKE '%money change%')),0)
  INTO v_expenses, v_collections, v_transfers_exp
  FROM e;$a$,
  $b$  SELECT
    COALESCE(SUM(amt) FILTER (WHERE bucket = 'expense'),0),
    COALESCE(SUM(amt) FILTER (WHERE bucket = 'collection'),0),
    COALESCE(SUM(amt) FILTER (WHERE bucket = 'capex'),0),
    COALESCE(SUM(amt) FILTER (WHERE bucket = 'transfer'),0)
  INTO v_expenses, v_collections, v_capex, v_transfers_exp
  FROM e;$b$);

  IF position($a$      SUM(COALESCE(e.amount_tzs,e.amount)) FILTER (WHERE NOT (COALESCE(fc.group_code,'') ILIKE '%collection%' OR COALESCE(fc.name,'') ILIKE '%collection%')) AS expenses,$a$ in s) = 0 THEN RAISE EXCEPTION 'anchor 4 not found'; END IF;
  s := replace(s, $a$      SUM(COALESCE(e.amount_tzs,e.amount)) FILTER (WHERE NOT (COALESCE(fc.group_code,'') ILIKE '%collection%' OR COALESCE(fc.name,'') ILIKE '%collection%')) AS expenses,
      SUM(COALESCE(e.amount_tzs,e.amount)) FILTER (WHERE (COALESCE(fc.group_code,'') ILIKE '%collection%' OR COALESCE(fc.name,'') ILIKE '%collection%')
                                AND NOT (COALESCE(fc.name,'') ILIKE '%transfer%' OR COALESCE(fc.name,'') ILIKE '%money change%')) AS collections$a$,
  $b$      SUM(COALESCE(e.amount_tzs,e.amount)) FILTER (WHERE COALESCE(fc.bucket,'expense') = 'expense') AS expenses,
      SUM(COALESCE(e.amount_tzs,e.amount)) FILTER (WHERE COALESCE(fc.bucket,'expense') = 'collection') AS collections,
      SUM(COALESCE(e.amount_tzs,e.amount)) FILTER (WHERE COALESCE(fc.bucket,'expense') = 'capex') AS capex$b$);

  IF position($a$    'collections', COALESCE(exp.collections,0) - COALESCE(colent.col_signed,0),$a$ in s) = 0 THEN RAISE EXCEPTION 'anchor 5 not found'; END IF;
  s := replace(s, $a$    'collections', COALESCE(exp.collections,0) - COALESCE(colent.col_signed,0),$a$,
  $b$    'collections', COALESCE(exp.collections,0) - COALESCE(colent.col_signed,0),
    'capex', COALESCE(exp.capex,0),$b$);

  IF position($a$-(COALESCE(exp.collections,0)-COALESCE(colent.col_signed,0))$a$ in s) = 0 THEN RAISE EXCEPTION 'anchor 6 not found'; END IF;
  s := replace(s, $a$-(COALESCE(exp.collections,0)-COALESCE(colent.col_signed,0))$a$,
  $b$-(COALESCE(exp.collections,0)-COALESCE(colent.col_signed,0))-COALESCE(exp.capex,0)$b$);

  IF position($a$    'collections_total', v_collections,$a$ in s) = 0 THEN RAISE EXCEPTION 'anchor 7 not found'; END IF;
  s := replace(s, $a$    'collections_total', v_collections,$a$,
  $b$    'collections_total', v_collections,
    'capex_total', COALESCE(v_capex,0),$b$);

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fin_balance_snapshot(p_casino_id uuid, p_period_start date, p_period_end date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$' || s || '$fn$';
END $mig$;
