-- ============================================================
-- Drop cache: rebuild-by-day + audit helpers
-- Lets us repair `player_day_drop_cache` / `table_day_drop_cache`
-- for any business day and detect drift between the two caches.
-- ============================================================

-- Rebuild ALL players for a single (casino, business_date) by reusing the
-- existing per-player `recompute_drop_cache_for_day`. Idempotent.
CREATE OR REPLACE FUNCTION public.rebuild_drop_caches_for_day(
  _casino_id uuid,
  _business_date date
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid;
  v_count int := 0;
BEGIN
  IF _casino_id IS NULL OR _business_date IS NULL THEN RETURN 0; END IF;

  -- Wipe stale rows for the day first so deleted/cancelled tx don't linger.
  DELETE FROM public.player_day_drop_cache
   WHERE casino_id = _casino_id AND business_date = _business_date;
  DELETE FROM public.table_day_drop_cache
   WHERE casino_id = _casino_id AND business_date = _business_date;

  FOR v_pid IN
    SELECT DISTINCT player_id
    FROM public.transactions
    WHERE casino_id = _casino_id
      AND business_date = _business_date
      AND player_id IS NOT NULL
      AND cancelled_at IS NULL
      AND type IN ('in','buy','out','cashout')
  LOOP
    PERFORM public.recompute_drop_cache_for_day(v_pid, _business_date);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rebuild_drop_caches_for_day(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_drop_caches_for_day(uuid, date) TO service_role;


-- Audit: for each (casino, business_date) compare
--   Σ player_day_drop_cache.peak  vs  Σ table_day_drop_cache.drop_r_share
-- Drift indicates a bug or unsynced delete. Returns only drifting rows.
CREATE OR REPLACE FUNCTION public.audit_drop_caches(
  _from date DEFAULT '2020-01-01',
  _to   date DEFAULT current_date
) RETURNS TABLE(
  casino_id uuid,
  business_date date,
  players_peak numeric,
  tables_share numeric,
  diff numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH p AS (
    SELECT casino_id, business_date, COALESCE(SUM(peak), 0) AS players_peak
    FROM public.player_day_drop_cache
    WHERE business_date BETWEEN _from AND _to
    GROUP BY casino_id, business_date
  ),
  t AS (
    SELECT casino_id, business_date, COALESCE(SUM(drop_r_share), 0) AS tables_share
    FROM public.table_day_drop_cache
    WHERE business_date BETWEEN _from AND _to
    GROUP BY casino_id, business_date
  )
  SELECT
    COALESCE(p.casino_id, t.casino_id)         AS casino_id,
    COALESCE(p.business_date, t.business_date) AS business_date,
    COALESCE(p.players_peak, 0)                AS players_peak,
    COALESCE(t.tables_share, 0)                AS tables_share,
    COALESCE(p.players_peak, 0) - COALESCE(t.tables_share, 0) AS diff
  FROM p
  FULL OUTER JOIN t USING (casino_id, business_date)
  WHERE ABS(COALESCE(p.players_peak, 0) - COALESCE(t.tables_share, 0)) > 1;
$$;
GRANT EXECUTE ON FUNCTION public.audit_drop_caches(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_drop_caches(date, date) TO service_role;


-- One-time backfill: walk every (casino, business_date) that exists in either
-- cache OR in transactions. Note: rows with `total_in = 0` (player who only
-- cashed out) won't be on the table-side cache, which is expected and does
-- NOT count as drift (the audit's >1 unit tolerance handles rounding).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT casino_id, business_date FROM public.player_day_drop_cache
    UNION
    SELECT DISTINCT casino_id, business_date FROM public.table_day_drop_cache
    UNION
    SELECT DISTINCT casino_id, business_date
    FROM public.transactions
    WHERE casino_id IS NOT NULL
      AND business_date IS NOT NULL
      AND cancelled_at IS NULL
      AND type IN ('in','buy','out','cashout')
  LOOP
    PERFORM public.rebuild_drop_caches_for_day(r.casino_id, r.business_date);
  END LOOP;
END $$;
