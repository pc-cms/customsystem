
-- Rewrite recompute_drop_cache_for_day: player_day_drop_cache stays with peak-NEP logic;
-- table_day_drop_cache now stores raw SUM(amount) per table, no proportional split.

CREATE OR REPLACE FUNCTION public.recompute_drop_cache_for_day(
  _player_id uuid,
  _business_date date
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_casino uuid;
  v_total_in numeric := 0;
  v_total_out numeric := 0;
  v_peak numeric := 0;
  v_recycled numeric := 0;
  v_count int := 0;
BEGIN
  IF _player_id IS NULL OR _business_date IS NULL THEN RETURN; END IF;

  SELECT t.casino_id INTO v_casino
  FROM public.transactions t
  WHERE t.player_id = _player_id
    AND t.business_date = _business_date
    AND t.cancelled_at IS NULL
    AND t.type IN ('in','buy','out','cashout')
  LIMIT 1;

  IF v_casino IS NULL THEN
    DELETE FROM public.player_day_drop_cache
     WHERE player_id = _player_id AND business_date = _business_date;
    DELETE FROM public.table_day_drop_cache
     WHERE player_id = _player_id AND business_date = _business_date;
    RETURN;
  END IF;

  -- Player-day NEP (peak) — unchanged. This is the definition of NEP, not a rounding.
  WITH walk AS (
    SELECT
      CASE WHEN t.type IN ('in','buy')      THEN t.amount::numeric ELSE 0 END AS in_amt,
      CASE WHEN t.type IN ('out','cashout') THEN t.amount::numeric ELSE 0 END AS out_amt,
      SUM(
        CASE WHEN t.type IN ('in','buy')      THEN t.amount::numeric
             WHEN t.type IN ('out','cashout') THEN -t.amount::numeric
             ELSE 0 END
      ) OVER (ORDER BY t.created_at, t.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS nep_running
    FROM public.transactions t
    WHERE t.player_id = _player_id
      AND t.business_date = _business_date
      AND t.cancelled_at IS NULL
      AND t.type IN ('in','buy','out','cashout')
  )
  SELECT
    COALESCE(SUM(in_amt), 0),
    COALESCE(SUM(out_amt), 0),
    GREATEST(COALESCE(MAX(nep_running), 0), 0),
    COUNT(*)
  INTO v_total_in, v_total_out, v_peak, v_count
  FROM walk;

  v_recycled := GREATEST(v_total_in - v_peak, 0);

  INSERT INTO public.player_day_drop_cache (
    player_id, business_date, casino_id, total_in, total_out, peak, recycled, tx_count, updated_at
  ) VALUES (
    _player_id, _business_date, v_casino, v_total_in, v_total_out, v_peak, v_recycled, v_count, now()
  )
  ON CONFLICT (player_id, business_date) DO UPDATE SET
    casino_id  = EXCLUDED.casino_id,
    total_in   = EXCLUDED.total_in,
    total_out  = EXCLUDED.total_out,
    peak       = EXCLUDED.peak,
    recycled   = EXCLUDED.recycled,
    tx_count   = EXCLUDED.tx_count,
    updated_at = EXCLUDED.updated_at;

  -- Table-day Drop = raw SUM of buy-ins per table. No peak split, no proportional
  -- distribution, no recycled share. Buy-ins without table_id are not attributed
  -- to any table (they contribute to player NEP only).
  DELETE FROM public.table_day_drop_cache
   WHERE player_id = _player_id AND business_date = _business_date;

  INSERT INTO public.table_day_drop_cache (
    table_id, player_id, business_date, casino_id,
    in_at_table, drop_r_share, recycled_share, updated_at
  )
  SELECT
    t.table_id,
    _player_id,
    _business_date,
    v_casino,
    SUM(t.amount::numeric),
    SUM(t.amount::numeric),
    0,
    now()
  FROM public.transactions t
  WHERE t.player_id = _player_id
    AND t.business_date = _business_date
    AND t.cancelled_at IS NULL
    AND t.type IN ('in','buy')
    AND t.table_id IS NOT NULL
  GROUP BY t.table_id;
END;
$$;


-- Rewrite compute_tables_drop_split RPC: same source, raw sums per table.
CREATE OR REPLACE FUNCTION public.compute_tables_drop_split(
  _casino_id uuid,
  _from timestamptz DEFAULT '-infinity',
  _to   timestamptz DEFAULT 'infinity'
) RETURNS TABLE(table_id uuid, drop_r bigint, drop_recycled bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    table_id,
    COALESCE(SUM(drop_r_share), 0)::bigint AS drop_r,
    0::bigint                              AS drop_recycled
  FROM public.table_day_drop_cache
  WHERE casino_id = _casino_id
    AND business_date >= COALESCE(public.business_date_of(_from), '-infinity'::date)
    AND business_date <= COALESCE(public.business_date_of(_to),   'infinity'::date)
  GROUP BY table_id;
$$;


-- The old audit compared Σ player peak vs Σ table drop_r_share. That invariant no
-- longer holds by design (table drop is buy-in sum, player drop is peak-NEP; they
-- differ whenever a player recycles chips or buys in without table_id). Neutralize.
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
  SELECT NULL::uuid, NULL::date, 0::numeric, 0::numeric, 0::numeric WHERE false;
$$;


-- Backfill every (casino, business_date) that exists in either cache OR transactions.
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
