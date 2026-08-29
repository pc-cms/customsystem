-- 1. Event table
CREATE TABLE IF NOT EXISTS public.live_operation_start_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('start','correction')),
  effective_start_time text NOT NULL,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.live_operation_start_events TO authenticated;
GRANT ALL ON public.live_operation_start_events TO service_role;

ALTER TABLE public.live_operation_start_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Casino users see live start events"
  ON public.live_operation_start_events FOR SELECT TO authenticated
  USING (public.has_casino_scope(auth.uid(), casino_id) OR public.user_has_casino_access(auth.uid(), casino_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- only one START per casino/business day; corrections unlimited
CREATE UNIQUE INDEX IF NOT EXISTS live_start_one_start_per_day
  ON public.live_operation_start_events (casino_id, business_date)
  WHERE event_type = 'start';

CREATE INDEX IF NOT EXISTS live_start_lookup
  ON public.live_operation_start_events (casino_id, business_date, created_at DESC);

-- 2. Effective live start resolver
CREATE OR REPLACE FUNCTION public.get_effective_live_start(_casino_id uuid, _business_date date)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT e.effective_start_time
       FROM public.live_operation_start_events e
      WHERE e.casino_id = _casino_id
        AND e.business_date = _business_date
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT 1),
    (SELECT NULLIF(c.shift_start, '') FROM public.casinos c WHERE c.id = _casino_id),
    '18:00'
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_live_start(uuid, date) TO authenticated, service_role;

-- 3. Validation helper for allowed times (whole hours 12:00..20:00)
CREATE OR REPLACE FUNCTION public.live_start_time_valid(_t text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _t ~ '^(1[2-9]|20):00$';
$$;

GRANT EXECUTE ON FUNCTION public.live_start_time_valid(text) TO authenticated, service_role;

-- 4. Start RPC
CREATE OR REPLACE FUNCTION public.live_start_begin(_casino_id uuid, _business_date date, _time text)
RETURNS public.live_operation_start_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _row public.live_operation_start_events;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.is_manager_op(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized to start live operations';
  END IF;
  IF NOT (public.has_casino_scope(auth.uid(), _casino_id) OR public.user_has_casino_access(auth.uid(), _casino_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized for this casino';
  END IF;
  IF NOT public.live_start_time_valid(_time) THEN
    RAISE EXCEPTION 'Invalid opening time: %. Allowed 12:00..20:00 (whole hours)', _time;
  END IF;
  IF _business_date <> public.business_date_of(now()) THEN
    RAISE EXCEPTION 'Live start can only be set for the current business day';
  END IF;
  IF EXISTS (SELECT 1 FROM public.live_operation_start_events
              WHERE casino_id = _casino_id AND business_date = _business_date AND event_type = 'start') THEN
    RAISE EXCEPTION 'Live operations already started for this business day';
  END IF;

  INSERT INTO public.live_operation_start_events (casino_id, business_date, event_type, effective_start_time, created_by)
  VALUES (_casino_id, _business_date, 'start', _time, auth.uid())
  RETURNING * INTO _row;
  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_start_begin(uuid, date, text) TO authenticated, service_role;

-- 5. Correction RPC
CREATE OR REPLACE FUNCTION public.live_start_correct(_casino_id uuid, _business_date date, _time text, _reason text)
RETURNS public.live_operation_start_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _row public.live_operation_start_events;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.is_manager_op(auth.uid()) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized to correct live start';
  END IF;
  IF NOT (public.has_casino_scope(auth.uid(), _casino_id) OR public.user_has_casino_access(auth.uid(), _casino_id) OR public.has_role(auth.uid(), 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Not authorized for this casino';
  END IF;
  IF NOT public.live_start_time_valid(_time) THEN
    RAISE EXCEPTION 'Invalid opening time: %. Allowed 12:00..20:00 (whole hours)', _time;
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Reason is required for a live start correction';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.live_operation_start_events
                  WHERE casino_id = _casino_id AND business_date = _business_date AND event_type = 'start') THEN
    RAISE EXCEPTION 'No live start exists for this business day';
  END IF;

  INSERT INTO public.live_operation_start_events (casino_id, business_date, event_type, effective_start_time, reason, created_by)
  VALUES (_casino_id, _business_date, 'correction', _time, btrim(_reason), auth.uid())
  RETURNING * INTO _row;
  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_start_correct(uuid, date, text, text) TO authenticated, service_role;

-- 6. Shared guard: is live open right now for this casino?
CREATE OR REPLACE FUNCTION public.live_ops_allowed_now(_casino_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _bdate date := public.business_date_of(now());
  _start text := public.get_effective_live_start(_casino_id, public.business_date_of(now()));
  _now_eat timestamp := (now() AT TIME ZONE 'Africa/Dar_es_Salaam');
  _h int := extract(hour from (now() AT TIME ZONE 'Africa/Dar_es_Salaam'))::int;
  _mins int;
  _start_mins int;
BEGIN
  -- Past-midnight portion of the business day (before 07:00 rollover) is always inside the day.
  IF _h < 7 THEN RETURN true; END IF;
  _mins := _h * 60 + extract(minute from _now_eat)::int;
  _start_mins := split_part(_start, ':', 1)::int * 60 + COALESCE(NULLIF(split_part(_start, ':', 2), '')::int, 0);
  RETURN _mins >= _start_mins;
END;
$$;

GRANT EXECUTE ON FUNCTION public.live_ops_allowed_now(uuid) TO authenticated, service_role;

-- 7. Guard trigger: opening a gaming table before live start
CREATE OR REPLACE FUNCTION public.tg_block_table_open_before_live_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'open' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'open') THEN
    IF NOT public.live_ops_allowed_now(NEW.casino_id) THEN
      RAISE EXCEPTION 'Live operations available from %',
        public.get_effective_live_start(NEW.casino_id, public.business_date_of(now()));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_table_open_before_live_start ON public.gaming_tables;
CREATE TRIGGER block_table_open_before_live_start
BEFORE INSERT OR UPDATE OF status ON public.gaming_tables
FOR EACH ROW EXECUTE FUNCTION public.tg_block_table_open_before_live_start();

-- 8. Guard trigger: opening the LIVE cashdesk shift before live start
CREATE OR REPLACE FUNCTION public.tg_block_shift_open_before_live_start()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.live_ops_allowed_now(NEW.casino_id) THEN
    RAISE EXCEPTION 'Live operations available from %',
      public.get_effective_live_start(NEW.casino_id, public.business_date_of(now()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_shift_open_before_live_start ON public.shifts;
CREATE TRIGGER block_shift_open_before_live_start
BEFORE INSERT ON public.shifts
FOR EACH ROW EXECUTE FUNCTION public.tg_block_shift_open_before_live_start();

-- 9. record_table_drop_slot(): daytime slots from each casino's effective live start
CREATE OR REPLACE FUNCTION public.record_table_drop_slot()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ts_eat timestamp := (now() AT TIME ZONE 'Africa/Dar_es_Salaam');
  h int := extract(hour from ts_eat)::int;
  m int := extract(minute from ts_eat)::int;
  bdate date := public.business_date_of(now());
  target_h int;
  slot text;
  written int := 0;
BEGIN
  IF (h = 4 AND m >= 50) OR h IN (5, 6, 7) THEN
    target_h := 6;
  ELSIF m >= 50 THEN
    target_h := (h + 1) % 24;
  ELSE
    target_h := h;
  END IF;

  slot := lpad(target_h::text, 2, '0') || ':00';

  -- Per-table snapshot: written ONCE per slot, never overwritten afterwards.
  -- A casino participates when the slot hour is inside its own live window:
  --   night portion (<= 6) always, daytime only from its effective live start.
  INSERT INTO public.table_drop_tracker (casino_id, table_id, date, time_slot, amount)
  SELECT t.casino_id, t.table_id, bdate, slot, sum(t.amount)::numeric
    FROM public.transactions t
   WHERE t.business_date = bdate
     AND t.table_id IS NOT NULL
     AND t.type IN ('in', 'buy')
     AND t.cancelled_at IS NULL
     AND t.created_at <= now()
     AND (
       target_h <= 6
       OR target_h >= split_part(public.get_effective_live_start(t.casino_id, bdate), ':', 1)::int
     )
   GROUP BY t.casino_id, t.table_id
  ON CONFLICT (table_id, date, time_slot) DO NOTHING;

  -- Casino TOTAL snapshot (table_id IS NULL): also written once per slot.
  WITH ins AS (
    INSERT INTO public.table_drop_tracker (casino_id, table_id, date, time_slot, amount)
    SELECT c.casino_id, NULL, bdate, slot, c.amount
      FROM (
        SELECT p.casino_id, sum(p.peak)::numeric AS amount
          FROM public.player_day_drop_cache p
         WHERE p.business_date = bdate
         GROUP BY p.casino_id
      ) c
     WHERE target_h <= 6
        OR target_h >= split_part(public.get_effective_live_start(c.casino_id, bdate), ':', 1)::int
    ON CONFLICT (casino_id, date, time_slot) WHERE table_id IS NULL
    DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::int INTO written FROM ins;

  RETURN written;
END;
$function$;