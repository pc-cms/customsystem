
DROP FUNCTION IF EXISTS public.compute_player_drop_split(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.compute_players_drop_split(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.compute_tables_drop_split(uuid, timestamptz, timestamptz);

CREATE FUNCTION public.compute_player_drop_split(
  _player_id uuid,
  _from timestamptz DEFAULT '-infinity'::timestamptz,
  _to   timestamptz DEFAULT 'infinity'::timestamptz
)
RETURNS TABLE(drop_r bigint, drop_recycled bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH txs AS (
    SELECT
      t.id, t.business_date AS bd, t.created_at,
      CASE WHEN t.type IN ('in','buy')     THEN t.amount::numeric ELSE 0 END AS in_amt,
      CASE WHEN t.type IN ('out','cashout') THEN t.amount::numeric ELSE 0 END AS out_amt
    FROM public.transactions t
    WHERE t.player_id = _player_id
      AND t.cancelled_at IS NULL
      AND t.created_at >= _from
      AND t.created_at <= _to
      AND t.type IN ('in','buy','out','cashout')
  ),
  walk AS (
    SELECT bd, in_amt,
      SUM(in_amt - out_amt) OVER (
        PARTITION BY bd ORDER BY created_at, id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS nep_running
    FROM txs
  ),
  daily AS (
    SELECT bd,
      GREATEST(COALESCE(MAX(nep_running), 0), 0) AS peak,
      COALESCE(SUM(in_amt), 0) AS total_in
    FROM walk
    GROUP BY bd
  )
  SELECT
    COALESCE(SUM(peak), 0)::bigint            AS drop_r,
    COALESCE(SUM(total_in - peak), 0)::bigint AS drop_recycled
  FROM daily;
$$;

CREATE FUNCTION public.compute_players_drop_split(
  _casino_id uuid,
  _from timestamptz DEFAULT '-infinity'::timestamptz,
  _to   timestamptz DEFAULT 'infinity'::timestamptz
)
RETURNS TABLE(player_id uuid, drop_r bigint, drop_recycled bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH txs AS (
    SELECT
      t.id, t.player_id, t.business_date AS bd, t.created_at,
      CASE WHEN t.type IN ('in','buy')     THEN t.amount::numeric ELSE 0 END AS in_amt,
      CASE WHEN t.type IN ('out','cashout') THEN t.amount::numeric ELSE 0 END AS out_amt
    FROM public.transactions t
    WHERE t.casino_id = _casino_id
      AND t.player_id IS NOT NULL
      AND t.cancelled_at IS NULL
      AND t.created_at >= _from
      AND t.created_at <= _to
      AND t.type IN ('in','buy','out','cashout')
  ),
  walk AS (
    SELECT player_id, bd, in_amt,
      SUM(in_amt - out_amt) OVER (
        PARTITION BY player_id, bd ORDER BY created_at, id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS nep_running
    FROM txs
  ),
  daily AS (
    SELECT player_id, bd,
      GREATEST(COALESCE(MAX(nep_running), 0), 0) AS peak,
      COALESCE(SUM(in_amt), 0) AS total_in
    FROM walk
    GROUP BY player_id, bd
  )
  SELECT player_id,
    COALESCE(SUM(peak), 0)::bigint            AS drop_r,
    COALESCE(SUM(total_in - peak), 0)::bigint AS drop_recycled
  FROM daily
  GROUP BY player_id;
$$;

CREATE FUNCTION public.compute_tables_drop_split(
  _casino_id uuid,
  _from timestamptz DEFAULT '-infinity'::timestamptz,
  _to   timestamptz DEFAULT 'infinity'::timestamptz
)
RETURNS TABLE(table_id uuid, drop_r bigint, drop_recycled bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH txs AS (
    SELECT
      t.id, t.player_id, t.table_id, t.business_date AS bd, t.created_at,
      CASE WHEN t.type IN ('in','buy')     THEN t.amount::numeric ELSE 0 END AS in_amt,
      CASE WHEN t.type IN ('out','cashout') THEN t.amount::numeric ELSE 0 END AS out_amt
    FROM public.transactions t
    WHERE t.casino_id = _casino_id
      AND t.player_id IS NOT NULL
      AND t.cancelled_at IS NULL
      AND t.created_at >= _from
      AND t.created_at <= _to
      AND t.type IN ('in','buy','out','cashout')
  ),
  walk AS (
    SELECT player_id, bd, table_id, in_amt,
      SUM(in_amt - out_amt) OVER (
        PARTITION BY player_id, bd ORDER BY created_at, id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS nep_running
    FROM txs
  ),
  daily AS (
    SELECT player_id, bd,
      GREATEST(COALESCE(MAX(nep_running), 0), 0) AS peak,
      COALESCE(SUM(in_amt), 0) AS total_in
    FROM walk
    GROUP BY player_id, bd
  ),
  day_table_in AS (
    SELECT player_id, bd, table_id, SUM(in_amt) AS in_t
    FROM walk
    WHERE table_id IS NOT NULL AND in_amt > 0
    GROUP BY player_id, bd, table_id
  ),
  split AS (
    SELECT dt.table_id,
      CASE WHEN d.total_in > 0 THEN d.peak * dt.in_t / d.total_in ELSE 0 END                AS dr,
      CASE WHEN d.total_in > 0 THEN (d.total_in - d.peak) * dt.in_t / d.total_in ELSE 0 END AS dv
    FROM day_table_in dt
    JOIN daily d USING (player_id, bd)
  )
  SELECT table_id,
    ROUND(COALESCE(SUM(dr), 0))::bigint AS drop_r,
    ROUND(COALESCE(SUM(dv), 0))::bigint AS drop_recycled
  FROM split
  GROUP BY table_id;
$$;

GRANT EXECUTE ON FUNCTION public.compute_player_drop_split(uuid, timestamptz, timestamptz)  TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.compute_players_drop_split(uuid, timestamptz, timestamptz) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.compute_tables_drop_split(uuid, timestamptz, timestamptz)  TO authenticated, anon, service_role;
