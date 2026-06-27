
-- ============================================================
-- Migration 2: Materialized Drop cache (player×day, table×player×day)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.player_day_drop_cache (
  player_id     uuid NOT NULL,
  business_date date NOT NULL,
  casino_id     uuid NOT NULL,
  total_in      numeric NOT NULL DEFAULT 0,
  total_out     numeric NOT NULL DEFAULT 0,
  peak          numeric NOT NULL DEFAULT 0,
  recycled      numeric NOT NULL DEFAULT 0,
  tx_count      int     NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, business_date)
);
GRANT SELECT ON public.player_day_drop_cache TO authenticated;
GRANT ALL    ON public.player_day_drop_cache TO service_role;
ALTER TABLE public.player_day_drop_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read drop cache" ON public.player_day_drop_cache;
CREATE POLICY "Authenticated read drop cache"
  ON public.player_day_drop_cache FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_pddc_casino_date
  ON public.player_day_drop_cache (casino_id, business_date);
CREATE INDEX IF NOT EXISTS idx_pddc_player_date
  ON public.player_day_drop_cache (player_id, business_date);

CREATE TABLE IF NOT EXISTS public.table_day_drop_cache (
  table_id      uuid NOT NULL,
  player_id     uuid NOT NULL,
  business_date date NOT NULL,
  casino_id     uuid NOT NULL,
  in_at_table   numeric NOT NULL DEFAULT 0,
  drop_r_share  numeric NOT NULL DEFAULT 0,
  recycled_share numeric NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_id, player_id, business_date)
);
GRANT SELECT ON public.table_day_drop_cache TO authenticated;
GRANT ALL    ON public.table_day_drop_cache TO service_role;
ALTER TABLE public.table_day_drop_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read table drop cache" ON public.table_day_drop_cache;
CREATE POLICY "Authenticated read table drop cache"
  ON public.table_day_drop_cache FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_tddc_casino_date
  ON public.table_day_drop_cache (casino_id, business_date);
CREATE INDEX IF NOT EXISTS idx_tddc_table_date
  ON public.table_day_drop_cache (table_id, business_date);


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

  DELETE FROM public.table_day_drop_cache
   WHERE player_id = _player_id AND business_date = _business_date;

  IF v_total_in > 0 THEN
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
      (v_peak     * SUM(t.amount::numeric)) / v_total_in,
      (v_recycled * SUM(t.amount::numeric)) / v_total_in,
      now()
    FROM public.transactions t
    WHERE t.player_id = _player_id
      AND t.business_date = _business_date
      AND t.cancelled_at IS NULL
      AND t.type IN ('in','buy')
      AND t.table_id IS NOT NULL
    GROUP BY t.table_id;
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.tg_recompute_drop_cache()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_drop_cache_for_day(NEW.player_id, NEW.business_date);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.recompute_drop_cache_for_day(OLD.player_id, OLD.business_date);
    IF NEW.player_id IS DISTINCT FROM OLD.player_id
       OR NEW.business_date IS DISTINCT FROM OLD.business_date THEN
      PERFORM public.recompute_drop_cache_for_day(NEW.player_id, NEW.business_date);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_drop_cache_for_day(OLD.player_id, OLD.business_date);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_drop_cache ON public.transactions;
CREATE TRIGGER trg_recompute_drop_cache
  AFTER INSERT OR UPDATE OR DELETE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_drop_cache();


-- Initial backfill
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT player_id, business_date
    FROM public.transactions
    WHERE player_id IS NOT NULL
      AND business_date IS NOT NULL
      AND cancelled_at IS NULL
      AND type IN ('in','buy','out','cashout')
  LOOP
    PERFORM public.recompute_drop_cache_for_day(r.player_id, r.business_date);
  END LOOP;
END $$;


-- Rewrite RPCs to read from cache
CREATE OR REPLACE FUNCTION public.compute_player_drop_split(
  _player_id uuid,
  _from timestamptz DEFAULT '-infinity',
  _to   timestamptz DEFAULT 'infinity'
) RETURNS TABLE(drop_r bigint, drop_recycled bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(SUM(peak), 0)::bigint     AS drop_r,
    COALESCE(SUM(recycled), 0)::bigint AS drop_recycled
  FROM public.player_day_drop_cache
  WHERE player_id = _player_id
    AND business_date >= COALESCE(public.business_date_of(_from), '-infinity'::date)
    AND business_date <= COALESCE(public.business_date_of(_to),   'infinity'::date);
$$;

CREATE OR REPLACE FUNCTION public.compute_players_drop_split(
  _casino_id uuid,
  _from timestamptz DEFAULT '-infinity',
  _to   timestamptz DEFAULT 'infinity'
) RETURNS TABLE(player_id uuid, drop_r bigint, drop_recycled bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    player_id,
    COALESCE(SUM(peak), 0)::bigint     AS drop_r,
    COALESCE(SUM(recycled), 0)::bigint AS drop_recycled
  FROM public.player_day_drop_cache
  WHERE casino_id = _casino_id
    AND business_date >= COALESCE(public.business_date_of(_from), '-infinity'::date)
    AND business_date <= COALESCE(public.business_date_of(_to),   'infinity'::date)
  GROUP BY player_id;
$$;

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
    COALESCE(SUM(drop_r_share),  0)::bigint AS drop_r,
    COALESCE(SUM(recycled_share),0)::bigint AS drop_recycled
  FROM public.table_day_drop_cache
  WHERE casino_id = _casino_id
    AND business_date >= COALESCE(public.business_date_of(_from), '-infinity'::date)
    AND business_date <= COALESCE(public.business_date_of(_to),   'infinity'::date)
  GROUP BY table_id;
$$;
