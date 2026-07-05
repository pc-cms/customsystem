
-- ============================================================
-- Player merge duplicates: schema + RPC + RLS
-- ============================================================

-- 1. Columns on players ----------------------------------------------
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.players(id),
  ADD COLUMN IF NOT EXISTS merged_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_by uuid;

CREATE INDEX IF NOT EXISTS players_merged_into_id_idx
  ON public.players(merged_into_id)
  WHERE merged_into_id IS NOT NULL;

-- 2. player_merges history table -------------------------------------
CREATE TABLE IF NOT EXISTS public.player_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survivor_id uuid NOT NULL REFERENCES public.players(id),
  loser_ids uuid[] NOT NULL,
  casino_id uuid,
  reason text NOT NULL,
  field_choices jsonb NOT NULL DEFAULT '{}'::jsonb,
  survivor_snapshot jsonb NOT NULL,
  loser_snapshots jsonb NOT NULL,
  migrations jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  undone_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.player_merges TO authenticated;
GRANT ALL ON public.player_merges TO service_role;

ALTER TABLE public.player_merges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merge_admins_can_read"
  ON public.player_merges FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'shift_manager')
  );

CREATE POLICY "merge_admins_can_write"
  ON public.player_merges FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'shift_manager')
  );

CREATE POLICY "merge_admins_can_update"
  ON public.player_merges FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'shift_manager')
  );

CREATE INDEX IF NOT EXISTS player_merges_survivor_idx ON public.player_merges(survivor_id);
CREATE INDEX IF NOT EXISTS player_merges_losers_idx ON public.player_merges USING gin(loser_ids);
CREATE INDEX IF NOT EXISTS player_merges_performed_at_idx ON public.player_merges(performed_at DESC);

CREATE TRIGGER trg_player_merges_updated_at
  BEFORE UPDATE ON public.player_merges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. merge_group_dismissed -------------------------------------------
CREATE TABLE IF NOT EXISTS public.merge_group_dismissed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_ids uuid[] NOT NULL,
  dismissed_by uuid,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

GRANT SELECT, INSERT, DELETE ON public.merge_group_dismissed TO authenticated;
GRANT ALL ON public.merge_group_dismissed TO service_role;

ALTER TABLE public.merge_group_dismissed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merge_dismiss_read"
  ON public.merge_group_dismissed FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'shift_manager')
  );

CREATE POLICY "merge_dismiss_write"
  ON public.merge_group_dismissed FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "merge_dismiss_delete"
  ON public.merge_group_dismissed FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS merge_group_dismissed_ids_idx ON public.merge_group_dismissed USING gin(player_ids);

-- 4. find_duplicate_groups -------------------------------------------
CREATE OR REPLACE FUNCTION public.find_duplicate_groups(
  _casino_id uuid DEFAULT NULL,
  _limit int DEFAULT 50
)
RETURNS TABLE (
  group_key text,
  match_reason text,
  players jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'shift_manager')
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.casino_id, p.first_name, p.last_name, p.nickname,
           p.phone, p.id_number, p.birth_date, p.photo_url, p.status,
           p.category, p.player_type, p.created_at,
           lower(regexp_replace(coalesce(p.phone,''), '\D', '', 'g')) AS phone_norm,
           lower(trim(coalesce(p.id_number,''))) AS id_norm,
           lower(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,''))) AS name_norm
    FROM public.players p
    WHERE p.status <> 'merged'
      AND (_casino_id IS NULL OR p.casino_id = _casino_id)
  ),
  by_id AS (
    SELECT 'id:' || id_norm AS gk, 'Same document (id_number)' AS reason, array_agg(id) AS ids
    FROM base WHERE id_norm <> '' GROUP BY id_norm HAVING count(*) > 1
  ),
  by_phone AS (
    SELECT 'ph:' || phone_norm AS gk, 'Same phone number' AS reason, array_agg(id) AS ids
    FROM base WHERE length(phone_norm) >= 7 GROUP BY phone_norm HAVING count(*) > 1
  ),
  by_name_dob AS (
    SELECT 'nd:' || name_norm || ':' || birth_date::text AS gk,
           'Same name + birth date' AS reason,
           array_agg(id) AS ids
    FROM base
    WHERE name_norm <> '' AND birth_date IS NOT NULL
    GROUP BY name_norm, birth_date
    HAVING count(*) > 1
  ),
  merged_groups AS (
    SELECT * FROM by_id
    UNION ALL SELECT * FROM by_phone
    UNION ALL SELECT * FROM by_name_dob
  ),
  filtered AS (
    SELECT mg.gk, mg.reason, mg.ids,
      (SELECT array_agg(pid ORDER BY pid) FROM unnest(mg.ids) pid) AS sorted_ids
    FROM merged_groups mg
    WHERE array_length(mg.ids, 1) BETWEEN 2 AND 8
  ),
  not_dismissed AS (
    SELECT f.* FROM filtered f
    WHERE NOT EXISTS (
      SELECT 1 FROM public.merge_group_dismissed d
      WHERE d.expires_at > now()
        AND d.player_ids = f.sorted_ids
    )
  )
  SELECT
    nd.gk,
    nd.reason,
    (
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at)
      FROM base b WHERE b.id = ANY(nd.ids)
    )
  FROM not_dismissed nd
  LIMIT _limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_groups(uuid, int) TO authenticated;

-- 5. merge_players ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_players(
  _survivor_id uuid,
  _loser_ids uuid[],
  _field_choices jsonb,
  _reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _merge_id uuid;
  _loser uuid;
  _tables text[] := ARRAY[
    'cashless_transactions','casino_visits','cctv_observations','chip_transfers',
    'client_sessions','expenses','group_members','kyc_reviews','lottery_tickets',
    'player_chip_adjustments','player_crm','player_daily_avg_bet_changes',
    'player_daily_avg_bets','player_daily_zones','player_day_drop_cache',
    'player_notes','player_position_history',
    'pos_player_charges','pos_tabs','promo_campaign_players','promo_code_redemptions',
    'promo_grants','promo_redemptions','promo_wallet_ledger','shop_orders',
    'table_day_drop_cache','transaction_cancellations','transactions'
  ];
  _t text;
  _sql text;
  _rows_moved int;
  _migrations jsonb := '[]'::jsonb;
  _counts jsonb := '{}'::jsonb;
  _survivor_row jsonb;
  _loser_snaps jsonb := '[]'::jsonb;
  _snap jsonb;
  _survivor_casino uuid;
  _blacklist_infects boolean := false;
  _tag_conflict int;
BEGIN
  -- Auth check
  IF NOT (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'shift_manager')
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  IF _survivor_id IS NULL OR _loser_ids IS NULL OR array_length(_loser_ids, 1) < 1 THEN
    RAISE EXCEPTION 'invalid_arguments';
  END IF;

  IF array_length(_loser_ids, 1) > 5 THEN
    RAISE EXCEPTION 'too_many_losers';
  END IF;

  IF _survivor_id = ANY(_loser_ids) THEN
    RAISE EXCEPTION 'survivor_in_losers';
  END IF;

  IF _reason IS NULL OR length(trim(_reason)) < 10 THEN
    RAISE EXCEPTION 'reason_required';
  END IF;

  -- Snapshot survivor
  SELECT to_jsonb(p) INTO _survivor_row FROM public.players p WHERE p.id = _survivor_id FOR UPDATE;
  IF _survivor_row IS NULL THEN
    RAISE EXCEPTION 'survivor_not_found';
  END IF;
  _survivor_casino := (_survivor_row ->> 'casino_id')::uuid;

  -- Snapshot losers + lock, check statuses
  FOREACH _loser IN ARRAY _loser_ids LOOP
    SELECT to_jsonb(p) INTO _snap FROM public.players p WHERE p.id = _loser FOR UPDATE;
    IF _snap IS NULL THEN
      RAISE EXCEPTION 'loser_not_found: %', _loser;
    END IF;
    IF (_snap ->> 'status') = 'merged' THEN
      RAISE EXCEPTION 'loser_already_merged: %', _loser;
    END IF;
    IF (_snap ->> 'status') = 'blacklist' THEN
      _blacklist_infects := true;
    END IF;
    _loser_snaps := _loser_snaps || jsonb_build_array(_snap);
  END LOOP;

  -- club_accounts conflict check: only one active club account allowed
  IF (SELECT count(*) FROM public.club_accounts ca WHERE ca.player_id = ANY(_loser_ids || _survivor_id)) > 1 THEN
    RAISE EXCEPTION 'club_account_conflict';
  END IF;

  -- Apply field_choices to survivor
  -- _field_choices: {"first_name": "<player_id>", ...}
  IF _field_choices IS NOT NULL AND jsonb_typeof(_field_choices) = 'object' THEN
    DECLARE
      _key text;
      _src_id uuid;
      _src jsonb;
      _val text;
    BEGIN
      FOR _key IN SELECT jsonb_object_keys(_field_choices) LOOP
        _src_id := (_field_choices ->> _key)::uuid;
        IF _src_id = _survivor_id THEN CONTINUE; END IF;
        SELECT to_jsonb(p) INTO _src FROM public.players p WHERE p.id = _src_id;
        IF _src IS NULL THEN CONTINUE; END IF;
        _val := _src ->> _key;
        IF _key = 'first_name'      THEN UPDATE public.players SET first_name = coalesce(_val, first_name) WHERE id = _survivor_id;
        ELSIF _key = 'last_name'    THEN UPDATE public.players SET last_name  = coalesce(_val, last_name)  WHERE id = _survivor_id;
        ELSIF _key = 'nickname'     THEN UPDATE public.players SET nickname   = coalesce(_val, nickname)   WHERE id = _survivor_id;
        ELSIF _key = 'phone'        THEN UPDATE public.players SET phone      = coalesce(_val, phone)      WHERE id = _survivor_id;
        ELSIF _key = 'id_number'    THEN UPDATE public.players SET id_number  = coalesce(_val, id_number)  WHERE id = _survivor_id;
        ELSIF _key = 'photo_url'    THEN UPDATE public.players SET photo_url  = _val WHERE id = _survivor_id;
        ELSIF _key = 'birth_date'   THEN UPDATE public.players SET birth_date = (_val)::date WHERE id = _survivor_id;
        ELSIF _key = 'category'     THEN UPDATE public.players SET category   = (_val)::player_category WHERE id = _survivor_id;
        ELSIF _key = 'player_type'  THEN UPDATE public.players SET player_type= (_val)::player_type WHERE id = _survivor_id;
        ELSIF _key = 'id_document_url' THEN UPDATE public.players SET id_document_url = _val WHERE id = _survivor_id;
        END IF;
      END LOOP;
    END;
  END IF;

  -- Reassign player_cards (unique on card_number per casino usually)
  BEGIN
    EXECUTE format(
      'UPDATE public.player_cards SET player_id = %L WHERE player_id = ANY(%L) RETURNING id',
      _survivor_id, _loser_ids
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'player_cards_conflict';
  END;

  -- Reassign player_tags with dedup
  DELETE FROM public.player_tags pt
  WHERE pt.player_id = ANY(_loser_ids)
    AND EXISTS (
      SELECT 1 FROM public.player_tags s
      WHERE s.player_id = _survivor_id AND s.tag_id = pt.tag_id
    );
  UPDATE public.player_tags SET player_id = _survivor_id WHERE player_id = ANY(_loser_ids);

  -- Generic reassign for other tables
  FOREACH _t IN ARRAY _tables LOOP
    _sql := format(
      'WITH moved AS (UPDATE public.%I SET player_id = %L WHERE player_id = ANY(%L) RETURNING id, %L::text AS src) SELECT count(*), jsonb_agg(jsonb_build_object(''table'', %L, ''id'', id)) FROM moved',
      _t, _survivor_id, _loser_ids, 'src', _t
    );
    -- simpler: just count and track table only
    EXECUTE format(
      'WITH moved AS (UPDATE public.%I SET player_id = %L WHERE player_id = ANY(%L) RETURNING 1) SELECT count(*) FROM moved',
      _t, _survivor_id, _loser_ids
    ) INTO _rows_moved;

    IF _rows_moved > 0 THEN
      _counts := _counts || jsonb_build_object(_t, _rows_moved);
      _migrations := _migrations || jsonb_build_array(jsonb_build_object('table', _t, 'count', _rows_moved));
    END IF;
  END LOOP;

  -- also count cards and tags
  SELECT count(*) INTO _rows_moved FROM public.player_cards WHERE player_id = _survivor_id;
  _counts := _counts || jsonb_build_object('player_cards_total', _rows_moved);

  -- Mark losers as merged
  UPDATE public.players
     SET status = 'merged',
         merged_into_id = _survivor_id,
         merged_at = now(),
         merged_by = auth.uid(),
         updated_at = now()
   WHERE id = ANY(_loser_ids);

  -- Blacklist inheritance
  IF _blacklist_infects THEN
    UPDATE public.players SET status = 'blacklist', updated_at = now()
      WHERE id = _survivor_id AND status <> 'blacklist';
  END IF;

  -- Save history
  INSERT INTO public.player_merges (
    survivor_id, loser_ids, casino_id, reason, field_choices,
    survivor_snapshot, loser_snapshots, migrations, affected_counts, performed_by
  )
  VALUES (
    _survivor_id, _loser_ids, _survivor_casino, trim(_reason), coalesce(_field_choices, '{}'::jsonb),
    _survivor_row, _loser_snaps, _migrations, _counts, auth.uid()
  )
  RETURNING id INTO _merge_id;

  RETURN _merge_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_players(uuid, uuid[], jsonb, text) TO authenticated;

-- 6. undo_player_merge -----------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_player_merge(_merge_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _rec public.player_merges%ROWTYPE;
  _snap jsonb;
  _loser_id uuid;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'shift_manager')
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;

  SELECT * INTO _rec FROM public.player_merges WHERE id = _merge_id FOR UPDATE;
  IF _rec.id IS NULL THEN RAISE EXCEPTION 'merge_not_found'; END IF;
  IF _rec.undone_at IS NOT NULL THEN RAISE EXCEPTION 'already_undone'; END IF;
  IF _rec.performed_at < now() - interval '30 days' THEN RAISE EXCEPTION 'undo_window_expired'; END IF;

  -- Restore each loser: unmerge + restore snapshot core fields (leave references where they are)
  -- IMPORTANT: because merge migrated child rows to survivor without tracking per-row origin,
  -- undo restores the loser row (status/id_number/etc.) but leaves child data on survivor.
  -- To fully reverse we require the caller to run undo BEFORE new activity is added.
  FOR _snap IN SELECT jsonb_array_elements(_rec.loser_snapshots) LOOP
    _loser_id := (_snap ->> 'id')::uuid;
    UPDATE public.players SET
      status = (_snap ->> 'status')::player_status,
      first_name = _snap ->> 'first_name',
      last_name = _snap ->> 'last_name',
      nickname = _snap ->> 'nickname',
      phone = _snap ->> 'phone',
      id_number = _snap ->> 'id_number',
      photo_url = _snap ->> 'photo_url',
      birth_date = NULLIF(_snap ->> 'birth_date','')::date,
      category = (_snap ->> 'category')::player_category,
      player_type = (_snap ->> 'player_type')::player_type,
      merged_into_id = NULL,
      merged_at = NULL,
      merged_by = NULL,
      updated_at = now()
    WHERE id = _loser_id;
  END LOOP;

  -- Restore survivor's core editable fields from snapshot
  UPDATE public.players SET
    first_name = _rec.survivor_snapshot ->> 'first_name',
    last_name  = _rec.survivor_snapshot ->> 'last_name',
    nickname   = _rec.survivor_snapshot ->> 'nickname',
    phone      = _rec.survivor_snapshot ->> 'phone',
    id_number  = _rec.survivor_snapshot ->> 'id_number',
    photo_url  = _rec.survivor_snapshot ->> 'photo_url',
    birth_date = NULLIF(_rec.survivor_snapshot ->> 'birth_date','')::date,
    category   = (_rec.survivor_snapshot ->> 'category')::player_category,
    player_type= (_rec.survivor_snapshot ->> 'player_type')::player_type,
    status     = (_rec.survivor_snapshot ->> 'status')::player_status,
    updated_at = now()
  WHERE id = _rec.survivor_id;

  UPDATE public.player_merges SET undone_at = now(), undone_by = auth.uid(), updated_at = now()
    WHERE id = _merge_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.undo_player_merge(uuid) TO authenticated;
