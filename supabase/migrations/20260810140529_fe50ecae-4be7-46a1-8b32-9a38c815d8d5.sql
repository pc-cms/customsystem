CREATE TABLE IF NOT EXISTS public.table_drop_tracker (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL,
  table_id uuid NOT NULL,
  date date NOT NULL,
  time_slot text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_id, date, time_slot)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_drop_tracker TO authenticated;
GRANT ALL ON public.table_drop_tracker TO service_role;

ALTER TABLE public.table_drop_tracker ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tdt_select_scope" ON public.table_drop_tracker
  FOR SELECT TO authenticated USING (public.has_casino_scope(auth.uid(), casino_id));
CREATE POLICY "tdt_write_scope" ON public.table_drop_tracker
  FOR ALL TO authenticated USING (public.has_casino_scope(auth.uid(), casino_id)) WITH CHECK (public.has_casino_scope(auth.uid(), casino_id));

CREATE INDEX IF NOT EXISTS idx_tdt_casino_date ON public.table_drop_tracker (casino_id, date);

CREATE TRIGGER trg_tdt_updated_at BEFORE UPDATE ON public.table_drop_tracker
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.bridge_chip_snapshot_to_tracker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
BEGIN
  IF current_setting('cms.applying_sync', true) = 'true' THEN
    RETURN NULL;
  END IF;

  FOR r IN
    WITH new_table_rows AS (
      SELECT casino_id, location_id, date, recorded_by, created_at,
             denomination, actual_quantity, expected_quantity
        FROM new_rows
       WHERE location_type = 'table' AND location_id IS NOT NULL
    ),
    latest AS (
      SELECT casino_id, location_id, date, max(created_at) AS latest_ts
        FROM new_table_rows
       GROUP BY casino_id, location_id, date
    ),
    batch AS (
      SELECT n.casino_id, n.location_id, n.date, n.recorded_by, n.created_at,
             sum((n.actual_quantity - n.expected_quantity) * n.denomination)::numeric AS result
        FROM new_table_rows n
        JOIN latest l
          ON l.casino_id = n.casino_id
         AND l.location_id = n.location_id
         AND l.date = n.date
         AND l.latest_ts = n.created_at
       GROUP BY n.casino_id, n.location_id, n.date, n.recorded_by, n.created_at
    )
    SELECT * FROM batch
  LOOP
    DECLARE
      ts_eat   timestamp := (r.created_at AT TIME ZONE 'Africa/Dar_es_Salaam');
      h        int       := extract(hour   from ts_eat)::int;
      m        int       := extract(minute from ts_eat)::int;
      final_w  boolean   := (h = 4 AND m >= 50) OR h IN (5,6,7);
      target_h int;
      only_if_empty boolean;
      slot text;
      adj numeric := 0;
      drop_amt numeric := 0;
    BEGIN
      IF final_w THEN
        target_h := 6; only_if_empty := false;
      ELSIF m >= 50 THEN
        target_h := (h + 1) % 24; only_if_empty := false;
      ELSIF m <= 10 THEN
        target_h := h; only_if_empty := false;
      ELSE
        target_h := h; only_if_empty := true;
      END IF;

      IF NOT (target_h BETWEEN 19 AND 23 OR target_h BETWEEN 0 AND 4 OR final_w) THEN
        CONTINUE;
      END IF;

      slot := lpad(target_h::text, 2, '0') || ':00';

      -- Fill/Credit accumulated for this table up to the snapshot moment
      SELECT COALESCE(sum(CASE WHEN ct.transfer_type = 'credit' THEN ct.amount
                               WHEN ct.transfer_type = 'fill'   THEN -ct.amount
                               ELSE 0 END), 0)
        INTO adj
        FROM public.cage_transfers ct
       WHERE ct.casino_id = r.casino_id
         AND ct.table_id = r.location_id
         AND ct.transfer_type IN ('fill','credit')
         AND ct.created_at <= r.created_at
         AND public.business_date_of(ct.created_at) = r.date;

      -- Drop accumulated for this table up to the snapshot moment
      SELECT COALESCE(sum(t.amount), 0)
        INTO drop_amt
        FROM public.transactions t
       WHERE t.casino_id = r.casino_id
         AND t.table_id = r.location_id
         AND t.business_date = r.date
         AND t.type IN ('in','buy')
         AND t.cancelled_at IS NULL
         AND t.created_at <= r.created_at;

      INSERT INTO public.table_drop_tracker (casino_id, table_id, date, time_slot, amount)
      VALUES (r.casino_id, r.location_id, r.date, slot, drop_amt)
      ON CONFLICT (table_id, date, time_slot)
      DO UPDATE SET amount = EXCLUDED.amount, updated_at = now();

      IF only_if_empty THEN
        INSERT INTO public.table_tracker
          (casino_id, table_id, date, time_slot, value, recorded_by)
        VALUES
          (r.casino_id, r.location_id, r.date, slot, r.result + adj, r.recorded_by)
        ON CONFLICT (table_id, date, time_slot) DO NOTHING;
      ELSE
        INSERT INTO public.table_tracker
          (casino_id, table_id, date, time_slot, value, recorded_by)
        VALUES
          (r.casino_id, r.location_id, r.date, slot, r.result + adj, r.recorded_by)
        ON CONFLICT (table_id, date, time_slot)
        DO UPDATE SET value = EXCLUDED.value, recorded_by = EXCLUDED.recorded_by;
      END IF;
    END;
  END LOOP;

  RETURN NULL;
END;
$fn$;