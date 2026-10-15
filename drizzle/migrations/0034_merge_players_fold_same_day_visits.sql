CREATE OR REPLACE FUNCTION public.merge_players(_survivor_id uuid, _loser_ids uuid[], _field_choices jsonb, _reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT to_jsonb(p) INTO _survivor_row FROM public.players p WHERE p.id = _survivor_id FOR UPDATE;
  IF _survivor_row IS NULL THEN
    RAISE EXCEPTION 'survivor_not_found';
  END IF;
  _survivor_casino := (_survivor_row ->> 'casino_id')::uuid;

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

  IF (SELECT count(*) FROM public.club_accounts ca WHERE ca.player_id = ANY(_loser_ids || _survivor_id)) > 1 THEN
    RAISE EXCEPTION 'club_account_conflict';
  END IF;

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

  PERFORM set_config('app.merge_in_progress', 'on', true);

  BEGIN
    EXECUTE format(
      'UPDATE public.player_cards SET player_id = %L WHERE player_id = ANY(%L) RETURNING id',
      _survivor_id, _loser_ids
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'player_cards_conflict';
  END;

  DELETE FROM public.player_tags pt
  WHERE pt.player_id = ANY(_loser_ids)
    AND EXISTS (
      SELECT 1 FROM public.player_tags s
      WHERE s.player_id = _survivor_id AND s.tag = pt.tag
    );
  UPDATE public.player_tags SET player_id = _survivor_id WHERE player_id = ANY(_loser_ids);

  -- Same-day visit conflicts: fold loser visit into survivor's visit for that day
  -- (earliest check-in, latest check-out); original loser visit rows are kept in player_merges.migrations.
  WITH conf AS (
    SELECT l.id AS loser_visit_id, s.id AS survivor_visit_id, to_jsonb(l) AS snap
      FROM public.casino_visits l
      JOIN public.casino_visits s
        ON s.player_id = _survivor_id AND s.casino_id = l.casino_id AND s.date = l.date
     WHERE l.player_id = ANY(_loser_ids)
  ), upd AS (
    UPDATE public.casino_visits s
       SET checked_in_at = LEAST(s.checked_in_at, l.checked_in_at),
           checked_out_at = CASE WHEN s.checked_out_at IS NULL OR l.checked_out_at IS NULL THEN NULL
                                 ELSE GREATEST(s.checked_out_at, l.checked_out_at) END
      FROM conf c JOIN public.casino_visits l ON l.id = c.loser_visit_id
     WHERE s.id = c.survivor_visit_id
    RETURNING 1
  ), del AS (
    DELETE FROM public.casino_visits v USING conf c WHERE v.id = c.loser_visit_id RETURNING c.snap
  )
  SELECT count(*), coalesce(jsonb_agg(snap), '[]'::jsonb) INTO _rows_moved, _snap FROM del;
  IF _rows_moved > 0 THEN
    _counts := _counts || jsonb_build_object('casino_visits_folded', _rows_moved);
    _migrations := _migrations || jsonb_build_array(jsonb_build_object('table','casino_visits','folded_same_day', _snap));
  END IF;

  FOREACH _t IN ARRAY _tables LOOP
    EXECUTE format(
      'WITH moved AS (UPDATE public.%I SET player_id = %L WHERE player_id = ANY(%L) RETURNING 1) SELECT count(*) FROM moved',
      _t, _survivor_id, _loser_ids
    ) INTO _rows_moved;

    IF _rows_moved > 0 THEN
      _counts := _counts || jsonb_build_object(_t, _rows_moved);
      _migrations := _migrations || jsonb_build_array(jsonb_build_object('table', _t, 'count', _rows_moved));
    END IF;
  END LOOP;

  SELECT count(*) INTO _rows_moved FROM public.player_cards WHERE player_id = _survivor_id;
  _counts := _counts || jsonb_build_object('player_cards_total', _rows_moved);

  UPDATE public.players
     SET status = 'merged',
         merged_into_id = _survivor_id,
         merged_at = now(),
         merged_by = auth.uid(),
         updated_at = now()
   WHERE id = ANY(_loser_ids);

  IF _blacklist_infects THEN
    UPDATE public.players SET status = 'blacklist', updated_at = now()
      WHERE id = _survivor_id AND status <> 'blacklist';
  END IF;

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
$function$;