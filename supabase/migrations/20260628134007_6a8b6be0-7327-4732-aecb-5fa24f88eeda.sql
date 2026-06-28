WITH base AS (
  SELECT
    t.player_id,
    t.casino_id,
    (((t.created_at AT TIME ZONE 'Africa/Dar_es_Salaam') - interval '7 hour')::date) AS business_date,
    t.type,
    (t.amount)::numeric AS amount,
    t.created_at
  FROM public.transactions t
  WHERE t.cancelled_at IS NULL
    AND t.player_id IS NOT NULL
    AND t.type IN ('buy','in','cashout','out')
),
running AS (
  SELECT
    player_id, casino_id, business_date, created_at, type, amount,
    SUM(CASE WHEN type IN ('buy','in') THEN amount ELSE -amount END)
      OVER (PARTITION BY player_id, business_date
            ORDER BY created_at, type
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS nep
  FROM base
),
agg AS (
  SELECT
    player_id, business_date,
    (ARRAY_AGG(casino_id ORDER BY created_at DESC))[1] AS casino_id,
    SUM(CASE WHEN type IN ('buy','in') THEN amount ELSE 0 END)      AS total_in,
    SUM(CASE WHEN type IN ('cashout','out') THEN amount ELSE 0 END) AS total_out,
    GREATEST(COALESCE(MAX(nep), 0), 0)                              AS peak,
    COUNT(*)                                                        AS tx_count
  FROM running
  GROUP BY player_id, business_date
)
INSERT INTO public.player_day_drop_cache
  (player_id, business_date, casino_id, total_in, total_out, peak, recycled, tx_count, updated_at)
SELECT
  player_id, business_date, casino_id,
  total_in, total_out, peak,
  GREATEST(total_in - peak, 0) AS recycled,
  tx_count, now()
FROM agg
ON CONFLICT (player_id, business_date) DO UPDATE SET
  casino_id  = EXCLUDED.casino_id,
  total_in   = EXCLUDED.total_in,
  total_out  = EXCLUDED.total_out,
  peak       = EXCLUDED.peak,
  recycled   = EXCLUDED.recycled,
  tx_count   = EXCLUDED.tx_count,
  updated_at = now();
