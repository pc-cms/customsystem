-- ============ ACE player/slot analytics foundation (additive) ============

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS is_ace_auto boolean NOT NULL DEFAULT false;

-- ---------- identities ----------
CREATE TABLE public.player_ace_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  ace_player_id text NOT NULL,
  ace_name text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  is_auto_created boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, ace_player_id)
);
CREATE INDEX idx_pai_player ON public.player_ace_identities(player_id);
CREATE INDEX idx_pai_casino ON public.player_ace_identities(casino_id);
GRANT SELECT ON public.player_ace_identities TO authenticated;
GRANT ALL ON public.player_ace_identities TO service_role;
ALTER TABLE public.player_ace_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ace identities readable" ON public.player_ace_identities FOR SELECT TO authenticated USING (true);
CREATE POLICY "ace identities super admin write" ON public.player_ace_identities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.player_ace_identity_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid,
  casino_id uuid,
  ace_player_id text,
  action text NOT NULL,
  from_player_id uuid,
  to_player_id uuid,
  performed_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.player_ace_identity_audit TO authenticated;
GRANT ALL ON public.player_ace_identity_audit TO service_role;
ALTER TABLE public.player_ace_identity_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ace identity audit readable" ON public.player_ace_identity_audit FOR SELECT TO authenticated USING (true);
CREATE POLICY "ace identity audit super admin write" ON public.player_ace_identity_audit FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ---------- cards ----------
CREATE TABLE public.player_ace_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.player_ace_identities(id) ON DELETE CASCADE,
  player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  card_number text NOT NULL,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_id, card_number)
);
CREATE INDEX idx_pac_player ON public.player_ace_cards(player_id);
GRANT SELECT ON public.player_ace_cards TO authenticated;
GRANT ALL ON public.player_ace_cards TO service_role;
ALTER TABLE public.player_ace_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ace cards readable" ON public.player_ace_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "ace cards super admin write" ON public.player_ace_cards FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ---------- raw player transactions ----------
CREATE TABLE public.ace_player_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid REFERENCES public.player_ace_identities(id) ON DELETE SET NULL,
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  ace_player_id text,
  egm_code text,
  business_date date NOT NULL,
  source_key text NOT NULL,
  tx_type text NOT NULL,
  amount numeric,
  occurred_at timestamptz,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, source_key)
);
CREATE INDEX idx_apt_day ON public.ace_player_transactions(casino_id, business_date);
CREATE INDEX idx_apt_identity ON public.ace_player_transactions(identity_id, business_date);
GRANT SELECT ON public.ace_player_transactions TO authenticated;
GRANT ALL ON public.ace_player_transactions TO service_role;
ALTER TABLE public.ace_player_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ace tx readable" ON public.ace_player_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "ace tx super admin write" ON public.ace_player_transactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ---------- identity x EGM x business day ----------
CREATE TABLE public.ace_player_egm_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.player_ace_identities(id) ON DELETE CASCADE,
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  egm_code text NOT NULL,
  business_date date NOT NULL,
  in_amount numeric,
  out_amount numeric,
  drop_amount numeric,
  handle_amount numeric,
  games integer,
  first_play_at timestamptz,
  last_play_at timestamptz,
  is_final boolean NOT NULL DEFAULT false,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_id, egm_code, business_date)
);
CREATE INDEX idx_aped_day ON public.ace_player_egm_daily(casino_id, business_date);
GRANT SELECT ON public.ace_player_egm_daily TO authenticated;
GRANT ALL ON public.ace_player_egm_daily TO service_role;
ALTER TABLE public.ace_player_egm_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ace egm daily readable" ON public.ace_player_egm_daily FOR SELECT TO authenticated USING (true);
CREATE POLICY "ace egm daily super admin write" ON public.ace_player_egm_daily FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ---------- identity rollup per business day ----------
CREATE TABLE public.ace_player_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES public.player_ace_identities(id) ON DELETE CASCADE,
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  in_amount numeric,
  out_amount numeric,
  drop_amount numeric,
  handle_amount numeric,
  games integer,
  egm_count integer,
  first_play_at timestamptz,
  last_play_at timestamptz,
  is_final boolean NOT NULL DEFAULT false,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_id, business_date)
);
CREATE INDEX idx_apd_day ON public.ace_player_daily(casino_id, business_date);
GRANT SELECT ON public.ace_player_daily TO authenticated;
GRANT ALL ON public.ace_player_daily TO service_role;
ALTER TABLE public.ace_player_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ace player daily readable" ON public.ace_player_daily FOR SELECT TO authenticated USING (true);
CREATE POLICY "ace player daily super admin write" ON public.ace_player_daily FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ---------- current EGM status ----------
CREATE TABLE public.ace_egm_current (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  egm_code text NOT NULL,
  position text,
  state text,
  identity_id uuid REFERENCES public.player_ace_identities(id) ON DELETE SET NULL,
  ace_player_id text,
  active_credit numeric,
  raw_data jsonb,
  observed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, egm_code)
);
GRANT SELECT ON public.ace_egm_current TO authenticated;
GRANT ALL ON public.ace_egm_current TO service_role;
ALTER TABLE public.ace_egm_current ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ace egm current readable" ON public.ace_egm_current FOR SELECT TO authenticated USING (true);
CREATE POLICY "ace egm current super admin write" ON public.ace_egm_current FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ---------- jackpot wins ----------
CREATE TABLE public.ace_jackpot_wins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid REFERENCES public.player_ace_identities(id) ON DELETE SET NULL,
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  ace_player_id text,
  business_date date NOT NULL,
  occurred_at timestamptz,
  jackpot_name text,
  amount numeric,
  egm_code text,
  source_key text,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, source_key)
);
CREATE INDEX idx_ajw_day ON public.ace_jackpot_wins(casino_id, business_date);
CREATE INDEX idx_ajw_identity ON public.ace_jackpot_wins(identity_id);
GRANT SELECT ON public.ace_jackpot_wins TO authenticated;
GRANT ALL ON public.ace_jackpot_wins TO service_role;
ALTER TABLE public.ace_jackpot_wins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ace jackpots readable" ON public.ace_jackpot_wins FOR SELECT TO authenticated USING (true);
CREATE POLICY "ace jackpots super admin write" ON public.ace_jackpot_wins FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ---------- raw report capture ----------
CREATE TABLE public.ace_egm_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  business_date date,
  period_from date,
  period_to date,
  period_label text,
  source_key text NOT NULL,
  rows_data jsonb,
  raw_data jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, source_key)
);
GRANT SELECT ON public.ace_egm_reports TO authenticated;
GRANT ALL ON public.ace_egm_reports TO service_role;
ALTER TABLE public.ace_egm_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ace egm reports readable" ON public.ace_egm_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "ace egm reports super admin write" ON public.ace_egm_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.ace_jackpot_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  business_date date,
  period_from date,
  period_to date,
  period_label text,
  source_key text NOT NULL,
  rows_data jsonb,
  raw_data jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, source_key)
);
GRANT SELECT ON public.ace_jackpot_reports TO authenticated;
GRANT ALL ON public.ace_jackpot_reports TO service_role;
ALTER TABLE public.ace_jackpot_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ace jp reports readable" ON public.ace_jackpot_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "ace jp reports super admin write" ON public.ace_jackpot_reports FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ---------- updated_at triggers ----------
CREATE TRIGGER trg_pai_updated BEFORE UPDATE ON public.player_ace_identities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pac_updated BEFORE UPDATE ON public.player_ace_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_aped_updated BEFORE UPDATE ON public.ace_player_egm_daily
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_apd_updated BEFORE UPDATE ON public.ace_player_daily
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_aec_updated BEFORE UPDATE ON public.ace_egm_current
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- functions ----------
CREATE OR REPLACE FUNCTION public.ace_attach_identity(
  _player_id uuid,
  _casino_id uuid,
  _ace_player_id text,
  _force boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_existing public.player_ace_identities%ROWTYPE;
  v_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF _ace_player_id IS NULL OR btrim(_ace_player_id) = '' THEN
    RAISE EXCEPTION 'ace_player_id_required';
  END IF;

  SELECT * INTO v_existing FROM public.player_ace_identities
   WHERE casino_id = _casino_id AND ace_player_id = btrim(_ace_player_id);

  IF FOUND THEN
    IF v_existing.player_id = _player_id THEN
      UPDATE public.player_ace_identities SET is_active = true WHERE id = v_existing.id;
      RETURN jsonb_build_object('status', 'exists', 'identity_id', v_existing.id);
    END IF;
    IF NOT _force THEN
      RETURN jsonb_build_object(
        'status', 'conflict',
        'identity_id', v_existing.id,
        'current_player_id', v_existing.player_id
      );
    END IF;
    UPDATE public.player_ace_identities
       SET player_id = _player_id, is_active = true
     WHERE id = v_existing.id;
    UPDATE public.player_ace_cards SET player_id = _player_id WHERE identity_id = v_existing.id;
    INSERT INTO public.player_ace_identity_audit
      (identity_id, casino_id, ace_player_id, action, from_player_id, to_player_id, performed_by)
    VALUES (v_existing.id, _casino_id, btrim(_ace_player_id), 'reassign',
            v_existing.player_id, _player_id, auth.uid());
    RETURN jsonb_build_object('status', 'moved', 'identity_id', v_existing.id);
  END IF;

  INSERT INTO public.player_ace_identities (player_id, casino_id, ace_player_id, created_by)
  VALUES (_player_id, _casino_id, btrim(_ace_player_id), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.player_ace_identity_audit
    (identity_id, casino_id, ace_player_id, action, to_player_id, performed_by)
  VALUES (v_id, _casino_id, btrim(_ace_player_id), 'link', _player_id, auth.uid());

  RETURN jsonb_build_object('status', 'created', 'identity_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.ace_unlink_identity(_identity_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.player_ace_identities%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT * INTO r FROM public.player_ace_identities WHERE id = _identity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'identity_not_found'; END IF;

  UPDATE public.player_ace_identities SET is_active = false WHERE id = _identity_id;
  INSERT INTO public.player_ace_identity_audit
    (identity_id, casino_id, ace_player_id, action, from_player_id, performed_by, note)
  VALUES (_identity_id, r.casino_id, r.ace_player_id, 'unlink', r.player_id, auth.uid(), _note);
END;
$$;

CREATE OR REPLACE FUNCTION public.ace_merge_auto_player(_auto_player_id uuid, _survivor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_moved int; v_auto jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF _auto_player_id = _survivor_id THEN RAISE EXCEPTION 'same_player'; END IF;

  SELECT to_jsonb(p) INTO v_auto FROM public.players p WHERE id = _auto_player_id;
  IF v_auto IS NULL THEN RAISE EXCEPTION 'player_not_found'; END IF;

  UPDATE public.player_ace_identities SET player_id = _survivor_id WHERE player_id = _auto_player_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  UPDATE public.player_ace_cards SET player_id = _survivor_id WHERE player_id = _auto_player_id;

  INSERT INTO public.player_ace_identity_audit
    (action, from_player_id, to_player_id, performed_by, note)
  VALUES ('merge_auto_player', _auto_player_id, _survivor_id, auth.uid(), 'ACE auto player merged');

  INSERT INTO public.player_merges
    (survivor_id, loser_ids, reason, field_choices, survivor_snapshot, loser_snapshots,
     affected_counts, performed_by)
  VALUES (_survivor_id, ARRAY[_auto_player_id], 'ACE auto-created player merged',
          '{}'::jsonb,
          (SELECT to_jsonb(p) FROM public.players p WHERE id = _survivor_id),
          jsonb_build_array(v_auto),
          jsonb_build_object('player_ace_identities', v_moved),
          auth.uid());

  UPDATE public.players SET status = 'merged' WHERE id = _auto_player_id;

  RETURN jsonb_build_object('status', 'merged', 'identities_moved', v_moved);
END;
$$;

-- Aggregated Players tab: ONE row per CMS player for the period.
-- Slot Result = IN - OUT (casino perspective). Handle stays NULL when ACE
-- provided none (never derived from Drop).
CREATE OR REPLACE FUNCTION public.ace_player_stats(
  _from date,
  _to date,
  _casino_id uuid DEFAULT NULL
) RETURNS TABLE (
  player_id uuid,
  player_name text,
  is_ace_auto boolean,
  ace_ids text[],
  casino_ids uuid[],
  cards text[],
  egm_codes text[],
  in_amount numeric,
  out_amount numeric,
  drop_amount numeric,
  handle_amount numeric,
  slot_result numeric,
  games integer,
  jackpot_count integer,
  jackpot_amount numeric,
  last_activity timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ids AS (
    SELECT i.* FROM public.player_ace_identities i
    WHERE (_casino_id IS NULL OR i.casino_id = _casino_id)
  ),
  daily AS (
    SELECT d.identity_id,
           SUM(d.in_amount) AS in_amount,
           SUM(d.out_amount) AS out_amount,
           SUM(d.drop_amount) AS drop_amount,
           SUM(d.handle_amount) AS handle_amount,
           SUM(d.games)::int AS games,
           MAX(d.last_play_at) AS last_play_at
      FROM public.ace_player_daily d
     WHERE d.business_date BETWEEN _from AND _to
       AND (_casino_id IS NULL OR d.casino_id = _casino_id)
     GROUP BY d.identity_id
  ),
  jp AS (
    SELECT j.identity_id, COUNT(*)::int AS jp_count, SUM(j.amount) AS jp_amount
      FROM public.ace_jackpot_wins j
     WHERE j.business_date BETWEEN _from AND _to
       AND (_casino_id IS NULL OR j.casino_id = _casino_id)
     GROUP BY j.identity_id
  )
  SELECT
    p.id,
    btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) AS player_name,
    p.is_ace_auto,
    array_agg(DISTINCT ids.ace_player_id) AS ace_ids,
    array_agg(DISTINCT ids.casino_id) AS casino_ids,
    (SELECT array_agg(DISTINCT c.card_number)
       FROM public.player_ace_cards c
       JOIN public.player_ace_identities i2 ON i2.id = c.identity_id
      WHERE i2.player_id = p.id) AS cards,
    (SELECT array_agg(DISTINCT e.egm_code)
       FROM public.ace_player_egm_daily e
       JOIN public.player_ace_identities i3 ON i3.id = e.identity_id
      WHERE i3.player_id = p.id
        AND e.business_date BETWEEN _from AND _to
        AND (_casino_id IS NULL OR e.casino_id = _casino_id)) AS egm_codes,
    SUM(daily.in_amount) AS in_amount,
    SUM(daily.out_amount) AS out_amount,
    SUM(daily.drop_amount) AS drop_amount,
    SUM(daily.handle_amount) AS handle_amount,
    SUM(daily.in_amount) - SUM(daily.out_amount) AS slot_result,
    SUM(daily.games)::int AS games,
    SUM(coalesce(jp.jp_count,0))::int AS jackpot_count,
    SUM(jp.jp_amount) AS jackpot_amount,
    MAX(daily.last_play_at) AS last_activity
  FROM ids
  JOIN public.players p ON p.id = ids.player_id
  LEFT JOIN daily ON daily.identity_id = ids.id
  LEFT JOIN jp ON jp.identity_id = ids.id
  GROUP BY p.id, p.first_name, p.last_name, p.is_ace_auto;
$$;

GRANT EXECUTE ON FUNCTION public.ace_attach_identity(uuid, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ace_unlink_identity(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ace_merge_auto_player(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ace_player_stats(date, date, uuid) TO authenticated;