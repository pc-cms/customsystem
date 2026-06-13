
-- 1) compute_shift_table_results: source = gaming_tables.closing_result of all non-archived
--    tables for the casino (accurate for the currently OPEN shift; closed shifts keep their
--    stored shifts.tables_result snapshot taken at close time).
CREATE OR REPLACE FUNCTION public.compute_shift_table_results(p_shift_id uuid)
RETURNS TABLE(table_id uuid, result numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_casino_id uuid;
  v_business_date date;
BEGIN
  SELECT s.casino_id,
         (timezone('Africa/Dar_es_Salaam', s.opened_at)::date
          - CASE WHEN EXTRACT(HOUR FROM timezone('Africa/Dar_es_Salaam', s.opened_at)) < 5
                 THEN 1 ELSE 0 END)::date
  INTO v_casino_id, v_business_date
  FROM shifts s WHERE s.id = p_shift_id;

  IF v_casino_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH
  imported AS (
    SELECT tdr.table_id AS tid, tdr.result AS res
    FROM table_daily_results tdr
    WHERE tdr.casino_id = v_casino_id AND tdr.date = v_business_date
  ),
  closed_tables AS (
    SELECT gt.id AS tid, gt.closing_result::numeric AS res
    FROM gaming_tables gt
    WHERE gt.casino_id = v_casino_id
      AND gt.is_archived = false
      AND gt.closing_result IS NOT NULL
  ),
  fc AS (
    SELECT ct.table_id AS tid,
           COALESCE(SUM(CASE WHEN ct.transfer_type = 'fill'   THEN ct.amount ELSE 0 END), 0)::numeric AS fill,
           COALESCE(SUM(CASE WHEN ct.transfer_type = 'credit' THEN ct.amount ELSE 0 END), 0)::numeric AS credit
    FROM cage_transfers ct
    WHERE ct.shift_id = p_shift_id
      AND ct.table_id IS NOT NULL
      AND ct.transfer_type IN ('fill','credit')
    GROUP BY ct.table_id
  ),
  ids AS (
    SELECT tid FROM imported
    UNION SELECT tid FROM closed_tables
    UNION SELECT tid FROM fc
  )
  SELECT i.tid AS table_id,
         COALESCE(
           imp.res,
           COALESCE(ct.res, 0) - COALESCE(fc.fill, 0) + COALESCE(fc.credit, 0)
         )::numeric AS result
  FROM ids i
  LEFT JOIN imported      imp ON imp.tid = i.tid
  LEFT JOIN closed_tables ct  ON ct.tid  = i.tid
  LEFT JOIN fc                ON fc.tid  = i.tid;
END;
$function$;

-- 2) Drop snapshot→shift recompute trigger (snapshots no longer feed P&L)
DROP TRIGGER IF EXISTS recalc_shift_tables_on_snapshot ON public.chip_snapshots;

-- 3) Trigger on gaming_tables.closing_result: recompute active shift's tables_result
CREATE OR REPLACE FUNCTION public.trg_recalc_shift_tables_on_table_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_shift_id uuid;
  v_total numeric;
BEGIN
  SELECT s.id INTO v_shift_id
  FROM shifts s
  WHERE s.casino_id = NEW.casino_id
    AND s.status = 'open'
  ORDER BY s.opened_at DESC
  LIMIT 1;

  IF v_shift_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(result), 0) INTO v_total
  FROM public.compute_shift_table_results(v_shift_id);

  UPDATE shifts SET tables_result = v_total WHERE id = v_shift_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recalc_shift_tables_on_table_close ON public.gaming_tables;
CREATE TRIGGER recalc_shift_tables_on_table_close
AFTER UPDATE OF closing_result ON public.gaming_tables
FOR EACH ROW
WHEN (NEW.closing_result IS DISTINCT FROM OLD.closing_result)
EXECUTE FUNCTION public.trg_recalc_shift_tables_on_table_close();

-- 4) can_close_shift RPC: lists open tables blocking close
CREATE OR REPLACE FUNCTION public.can_close_shift(p_shift_id uuid)
RETURNS TABLE(ok boolean, open_tables jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_casino_id uuid;
  v_open jsonb;
BEGIN
  SELECT casino_id INTO v_casino_id FROM shifts WHERE id = p_shift_id;
  IF v_casino_id IS NULL THEN
    RETURN QUERY SELECT false, '[]'::jsonb;
    RETURN;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', gt.id, 'name', gt.name) ORDER BY gt.name), '[]'::jsonb)
  INTO v_open
  FROM gaming_tables gt
  WHERE gt.casino_id = v_casino_id
    AND gt.is_archived = false
    AND gt.closing_result IS NULL;

  RETURN QUERY SELECT (jsonb_array_length(v_open) = 0), v_open;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_close_shift(uuid) TO authenticated;

-- 5) BEFORE UPDATE on shifts: block open→closed when any table still open
CREATE OR REPLACE FUNCTION public.trg_block_shift_close_if_tables_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_open_count int;
  v_names text;
BEGIN
  IF OLD.status = 'open' AND NEW.status = 'closed' THEN
    SELECT count(*),
           string_agg(gt.name, ', ' ORDER BY gt.name)
    INTO v_open_count, v_names
    FROM gaming_tables gt
    WHERE gt.casino_id = NEW.casino_id
      AND gt.is_archived = false
      AND gt.closing_result IS NULL;

    IF v_open_count > 0 THEN
      RAISE EXCEPTION 'Cannot close shift: % table(s) still open: %', v_open_count, v_names
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_shift_close_if_tables_open ON public.shifts;
CREATE TRIGGER block_shift_close_if_tables_open
BEFORE UPDATE OF status ON public.shifts
FOR EACH ROW
EXECUTE FUNCTION public.trg_block_shift_close_if_tables_open();
