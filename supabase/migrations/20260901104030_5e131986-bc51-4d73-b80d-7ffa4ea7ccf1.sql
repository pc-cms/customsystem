CREATE TABLE IF NOT EXISTS public.ace_history_backfill_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid REFERENCES public.casinos(id) ON DELETE CASCADE,
  location_code text NOT NULL,
  business_date date NOT NULL,
  period_id integer NOT NULL,
  period_label text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  fields_filled text[] NOT NULL DEFAULT '{}',
  row_created boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ace_history_backfill_log TO service_role;
GRANT SELECT ON public.ace_history_backfill_log TO authenticated;

ALTER TABLE public.ace_history_backfill_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ace backfill log readable by scoped management"
  ON public.ace_history_backfill_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (casino_id IS NOT NULL AND public.has_casino_scope(auth.uid(), casino_id))
  );

CREATE POLICY "ace backfill log writable by service role"
  ON public.ace_history_backfill_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS ace_history_backfill_log_casino_day_idx
  ON public.ace_history_backfill_log (casino_id, business_date DESC);

CREATE OR REPLACE FUNCTION public.ace_backfill_missing_only(
  _casino_id uuid,
  _business_date date,
  _drop_slots numeric,
  _net_win numeric,
  _cashdesk_win numeric,
  _client_balance numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.fin_day_closing%ROWTYPE;
  filled text[] := '{}';
  created boolean := false;
BEGIN
  IF _casino_id IS NULL OR _business_date IS NULL THEN
    RAISE EXCEPTION 'casino_id and business_date are required';
  END IF;

  SELECT * INTO r FROM public.fin_day_closing
   WHERE casino_id = _casino_id AND business_date = _business_date
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.fin_day_closing (
      casino_id, business_date, drop_slots, net_win, cashdesk_win,
      players_card_balance, slots_result
    ) VALUES (
      _casino_id, _business_date,
      COALESCE(_drop_slots, 0), COALESCE(_net_win, 0), COALESCE(_cashdesk_win, 0),
      COALESCE(_client_balance, 0), COALESCE(_net_win, 0)
    );
    created := true;
    IF COALESCE(_drop_slots, 0) <> 0 THEN filled := filled || 'drop_slots'; END IF;
    IF COALESCE(_net_win, 0) <> 0 THEN filled := filled || 'net_win' || 'slots_result'; END IF;
    IF COALESCE(_cashdesk_win, 0) <> 0 THEN filled := filled || 'cashdesk_win'; END IF;
    IF COALESCE(_client_balance, 0) <> 0 THEN filled := filled || 'players_card_balance'; END IF;
    RETURN jsonb_build_object('created', created, 'fields_filled', to_jsonb(filled));
  END IF;

  IF COALESCE(r.drop_slots, 0) = 0 AND COALESCE(_drop_slots, 0) <> 0 THEN
    UPDATE public.fin_day_closing SET drop_slots = _drop_slots WHERE id = r.id;
    filled := filled || 'drop_slots';
  END IF;

  IF COALESCE(r.net_win, 0) = 0 AND COALESCE(_net_win, 0) <> 0 THEN
    UPDATE public.fin_day_closing SET net_win = _net_win WHERE id = r.id;
    filled := filled || 'net_win';
  END IF;

  IF COALESCE(r.slots_result, 0) = 0 AND COALESCE(_net_win, 0) <> 0 THEN
    UPDATE public.fin_day_closing SET slots_result = _net_win WHERE id = r.id;
    filled := filled || 'slots_result';
  END IF;

  IF COALESCE(r.cashdesk_win, 0) = 0 AND COALESCE(_cashdesk_win, 0) <> 0 THEN
    UPDATE public.fin_day_closing SET cashdesk_win = _cashdesk_win WHERE id = r.id;
    filled := filled || 'cashdesk_win';
  END IF;

  IF COALESCE(r.players_card_balance, 0) = 0 AND COALESCE(_client_balance, 0) <> 0 THEN
    UPDATE public.fin_day_closing SET players_card_balance = _client_balance WHERE id = r.id;
    filled := filled || 'players_card_balance';
  END IF;

  RETURN jsonb_build_object('created', created, 'fields_filled', to_jsonb(filled));
END;
$$;

REVOKE ALL ON FUNCTION public.ace_backfill_missing_only(uuid, date, numeric, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ace_backfill_missing_only(uuid, date, numeric, numeric, numeric, numeric) TO service_role;