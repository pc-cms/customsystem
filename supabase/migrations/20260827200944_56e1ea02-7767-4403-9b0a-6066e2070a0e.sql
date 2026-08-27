ALTER TABLE public.closing_wallet_inbox_rows
  ADD COLUMN IF NOT EXISTS orig_in numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS orig_out numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_balance numeric,
  ADD COLUMN IF NOT EXISTS opening_balance numeric;

COMMENT ON COLUMN public.closing_wallet_inbox_rows.orig_amount IS
  'Amount to post. Cash: denomination x count. Bank/Mobile: daily NET = IN - OUT.';
COMMENT ON COLUMN public.closing_wallet_inbox_rows.final_balance IS
  'Closing/final balance from the cashdesk closing. Control/reference only, never posted.';

CREATE OR REPLACE FUNCTION public.closing_inbox_build(_casino_id uuid, _business_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inbox uuid;
  r RECORD;
  k text; c text; d text; q numeric; amt numeric;
  v_in numeric; v_out numeric; v_final numeric; v_open numeric;
  v_ch jsonb; v_open_ch jsonb; v_cur text; v_bank text; v_lbl text;
BEGIN
  SELECT id INTO v_inbox FROM closing_wallet_inbox
   WHERE casino_id = _casino_id AND business_date = _business_date;
  IF v_inbox IS NOT NULL THEN RETURN v_inbox; END IF;

  INSERT INTO closing_wallet_inbox (casino_id, business_date, day_closure_id)
  VALUES (_casino_id, _business_date,
          (SELECT id FROM business_day_closures
            WHERE casino_id=_casino_id AND business_date=_business_date LIMIT 1))
  RETURNING id INTO v_inbox;

  ---------------------------------------------------------
  -- LIVE cashdesk (shifts) — money only
  ---------------------------------------------------------
  FOR r IN
    SELECT s.id, s.closing_count, s.opening_float,
           s.cashless_in_providers, s.cashless_out_providers
      FROM shifts s
     WHERE s.casino_id = _casino_id
       AND business_date_of(COALESCE(s.opened_at, s.closed_at)) = _business_date
       AND s.closing_count IS NOT NULL
  LOOP
    -- cash by currency / denomination (physical handover, unchanged)
    FOR c IN SELECT jsonb_object_keys(COALESCE(r.closing_count->'cash','{}'::jsonb)) LOOP
      FOR d IN SELECT jsonb_object_keys(COALESCE(r.closing_count->'cash'->c,'{}'::jsonb)) LOOP
        q := COALESCE(NULLIF(r.closing_count->'cash'->c->>d,'')::numeric, 0);
        CONTINUE WHEN q = 0 OR d !~ '^[0-9]+$';
        INSERT INTO closing_wallet_inbox_rows(
          inbox_id, casino_id, business_date, section, source_kind, label,
          currency, denomination, orig_count, orig_amount, wallet_id,
          source_ref_table, source_ref_id)
        VALUES (v_inbox, _casino_id, _business_date, 'live', 'cash',
                'Cash ' || c, c, d::numeric, q::int, d::numeric * q,
                closing_inbox_map_wallet(_casino_id,'cash',c,'Cash ' || c),
                'shifts', r.id);
      END LOOP;
    END LOOP;

    -- mobile money: NET = IN - OUT is posted; closing balance is reference only
    FOR k IN
      SELECT DISTINCT key FROM (
        SELECT jsonb_object_keys(COALESCE(r.cashless_in_providers,'{}'::jsonb)) AS key
        UNION SELECT jsonb_object_keys(COALESCE(r.cashless_out_providers,'{}'::jsonb))
        UNION SELECT jsonb_object_keys(COALESCE(r.closing_count->'mobile','{}'::jsonb))
      ) t
    LOOP
      v_in    := COALESCE(NULLIF(r.cashless_in_providers->>k,'')::numeric, 0);
      v_out   := COALESCE(NULLIF(r.cashless_out_providers->>k,'')::numeric, 0);
      v_final := NULLIF(r.closing_count->'mobile'->>k,'')::numeric;
      v_open  := NULLIF(r.opening_float->'mobile'->>k,'')::numeric;
      amt := v_in - v_out;
      CONTINUE WHEN amt = 0 AND COALESCE(v_final,0) = 0;
      INSERT INTO closing_wallet_inbox_rows(
        inbox_id, casino_id, business_date, section, source_kind, label,
        currency, orig_in, orig_out, orig_amount, final_balance, opening_balance,
        wallet_id, source_ref_table, source_ref_id)
      VALUES (v_inbox, _casino_id, _business_date, 'live', 'mobile', k, 'TZS',
              v_in, v_out, amt, v_final, v_open,
              closing_inbox_map_wallet(_casino_id,'mobile','TZS',k), 'shifts', r.id);
    END LOOP;

    -- bank: explicit channels (CRDB/NBC x TZS/USD) when present
    v_ch      := COALESCE(r.closing_count->'bank'->'channels','{}'::jsonb);
    v_open_ch := COALESCE(r.opening_float->'bank'->'channels','{}'::jsonb);
    IF jsonb_typeof(v_ch) = 'object' AND v_ch <> '{}'::jsonb THEN
      FOR k IN SELECT jsonb_object_keys(v_ch) LOOP
        v_in    := COALESCE(NULLIF(v_ch->k->>'in','')::numeric, 0);
        v_out   := COALESCE(NULLIF(v_ch->k->>'out','')::numeric, 0);
        v_final := NULLIF(v_ch->k->>'final','')::numeric;
        v_open  := NULLIF(v_open_ch->k->>'final','')::numeric;
        amt := v_in - v_out;
        CONTINUE WHEN amt = 0 AND COALESCE(v_final,0) = 0;
        v_cur  := upper(split_part(k, '_', 2));
        IF v_cur = '' THEN v_cur := 'TZS'; END IF;
        v_bank := upper(split_part(k, '_', 1));
        v_lbl  := v_bank || ' ' || v_cur;
        INSERT INTO closing_wallet_inbox_rows(
          inbox_id, casino_id, business_date, section, source_kind, label,
          currency, orig_in, orig_out, orig_amount, final_balance, opening_balance,
          wallet_id, source_ref_table, source_ref_id)
        VALUES (v_inbox, _casino_id, _business_date, 'live', 'bank', v_lbl, v_cur,
                v_in, v_out, amt, v_final, v_open,
                closing_inbox_map_wallet(_casino_id,'bank',v_cur,v_lbl), 'shifts', r.id);
      END LOOP;
    END IF;

    -- legacy generic bank.tzs / bank.usd (no IN/OUT known): balance only,
    -- never auto-attributed to CRDB or NBC — requires manual wallet mapping.
    FOR k IN SELECT jsonb_object_keys(COALESCE(r.closing_count->'bank','{}'::jsonb)) LOOP
      CONTINUE WHEN k = 'channels';
      CONTINUE WHEN jsonb_typeof(r.closing_count->'bank'->k) <> 'number';
      amt := COALESCE(NULLIF(r.closing_count->'bank'->>k,'')::numeric, 0);
      CONTINUE WHEN amt = 0;
      CONTINUE WHEN jsonb_typeof(v_ch) = 'object' AND v_ch <> '{}'::jsonb;
      INSERT INTO closing_wallet_inbox_rows(
        inbox_id, casino_id, business_date, section, source_kind, label,
        currency, orig_amount, final_balance, wallet_id, source_ref_table, source_ref_id)
      VALUES (v_inbox, _casino_id, _business_date, 'live', 'bank',
              'Bank ' || upper(k), upper(k), amt, amt,
              closing_inbox_map_wallet(_casino_id,'bank',upper(k),'Bank ' || upper(k)),
              'shifts', r.id);
    END LOOP;
  END LOOP;

  ---------------------------------------------------------
  -- SLOTS cashdesk (cage_slots_shifts) — money only
  ---------------------------------------------------------
  FOR r IN
    SELECT cs.id, cs.cashless_final_providers,
           cs.cashless_in_providers, cs.cashless_out_providers
      FROM cage_slots_shifts cs
     WHERE cs.casino_id = _casino_id
       AND COALESCE(cs.business_date,
                    business_date_of(COALESCE(cs.opened_at, cs.closed_at))) = _business_date
       AND COALESCE(cs.status::text,'') IN ('closed','approved')
  LOOP
    INSERT INTO closing_wallet_inbox_rows(
      inbox_id, casino_id, business_date, section, source_kind, label,
      currency, denomination, orig_count, orig_amount, wallet_id,
      source_ref_table, source_ref_id)
    SELECT v_inbox, _casino_id, _business_date, 'slots', 'cash',
           'Cash ' || i.currency_code, i.currency_code, i.denomination,
           SUM(i.quantity)::int, i.denomination * SUM(i.quantity),
           closing_inbox_map_wallet(_casino_id,'cash',i.currency_code,'Cash ' || i.currency_code),
           'cage_slots_shifts', r.id
      FROM cage_slots_cash_inventory i
     WHERE i.cage_slots_shift_id = r.id
       AND i.inventory_type = 'closing'
     GROUP BY i.currency_code, i.denomination
    HAVING SUM(i.quantity) > 0;

    FOR k IN
      SELECT DISTINCT key FROM (
        SELECT jsonb_object_keys(COALESCE(r.cashless_in_providers,'{}'::jsonb)) AS key
        UNION SELECT jsonb_object_keys(COALESCE(r.cashless_out_providers,'{}'::jsonb))
        UNION SELECT jsonb_object_keys(COALESCE(r.cashless_final_providers,'{}'::jsonb))
      ) t
    LOOP
      v_in    := COALESCE(NULLIF(r.cashless_in_providers->>k,'')::numeric, 0);
      v_out   := COALESCE(NULLIF(r.cashless_out_providers->>k,'')::numeric, 0);
      v_final := NULLIF(r.cashless_final_providers->>k,'')::numeric;
      amt := v_in - v_out;
      CONTINUE WHEN amt = 0 AND COALESCE(v_final,0) = 0;
      INSERT INTO closing_wallet_inbox_rows(
        inbox_id, casino_id, business_date, section, source_kind, label,
        currency, orig_in, orig_out, orig_amount, final_balance,
        wallet_id, source_ref_table, source_ref_id)
      VALUES (v_inbox, _casino_id, _business_date, 'slots', 'mobile', k, 'TZS',
              v_in, v_out, amt, v_final,
              closing_inbox_map_wallet(_casino_id,'mobile','TZS',k),
              'cage_slots_shifts', r.id);
    END LOOP;
  END LOOP;

  RETURN v_inbox;
END;
$function$;

CREATE OR REPLACE FUNCTION public.closing_inbox_get(_casino_id uuid, _business_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_inbox RECORD;
  v_rows jsonb;
BEGIN
  IF NOT (has_role(v_uid,'super_admin'::app_role)
          OR ((can_manage(v_uid) OR can_finance(v_uid)) AND has_casino_scope(v_uid,_casino_id))) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF _business_date IS NULL THEN
    SELECT * INTO v_inbox FROM closing_wallet_inbox
     WHERE casino_id=_casino_id AND status='ready'
     ORDER BY business_date LIMIT 1;
  ELSE
    SELECT * INTO v_inbox FROM closing_wallet_inbox
     WHERE casino_id=_casino_id AND business_date=_business_date;
  END IF;

  IF v_inbox.id IS NULL THEN RETURN jsonb_build_object('inbox', NULL, 'rows','[]'::jsonb); END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'section', r.section, 'source_kind', r.source_kind, 'label', r.label,
    'currency', r.currency, 'denomination', r.denomination,
    'orig_count', r.orig_count, 'orig_amount', r.orig_amount,
    'orig_in', r.orig_in, 'orig_out', r.orig_out,
    'final_balance', r.final_balance, 'opening_balance', r.opening_balance,
    'corr_delta_count', r.corr_delta_count, 'corr_delta_amount', r.corr_delta_amount,
    'correction_reason', r.correction_reason, 'corrected_by', r.corrected_by,
    'corrected_at', r.corrected_at, 'final_amount', r.final_amount,
    'wallet_id', r.wallet_id, 'wallet_name', w.name, 'wallet_auto', r.wallet_auto,
    'source_ref_table', r.source_ref_table, 'source_ref_id', r.source_ref_id,
    'posted_tx_id', r.posted_tx_id
  ) ORDER BY r.section, r.source_kind, r.currency, r.denomination NULLS FIRST, r.label), '[]'::jsonb)
  INTO v_rows
  FROM closing_wallet_inbox_rows r
  LEFT JOIN fin_wallets w ON w.id = r.wallet_id
  WHERE r.inbox_id = v_inbox.id;

  RETURN jsonb_build_object(
    'inbox', jsonb_build_object(
      'id', v_inbox.id, 'casino_id', v_inbox.casino_id,
      'business_date', v_inbox.business_date, 'status', v_inbox.status,
      'day_closure_id', v_inbox.day_closure_id,
      'posted_at', v_inbox.posted_at, 'posted_by', v_inbox.posted_by),
    'rows', v_rows);
END;
$function$;

CREATE OR REPLACE FUNCTION public.closing_inbox_set_correction(_row_id uuid, _delta_count integer, _delta_amount numeric, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  r RECORD;
  v_delta_amount numeric;
  v_delta_count integer := COALESCE(_delta_count,0);
BEGIN
  SELECT * INTO r FROM closing_wallet_inbox_rows WHERE id = _row_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'row not found'; END IF;
  IF NOT (has_role(v_uid,'super_admin'::app_role)
          OR ((can_manage(v_uid) OR can_finance(v_uid)) AND has_casino_scope(v_uid,r.casino_id))) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF EXISTS (SELECT 1 FROM closing_wallet_inbox WHERE id=r.inbox_id AND status='posted') THEN
    RAISE EXCEPTION 'inbox already posted';
  END IF;

  IF r.source_kind = 'cash' AND v_delta_count <> 0 THEN
    v_delta_amount := v_delta_count * COALESCE(r.denomination,0);
  ELSE
    v_delta_amount := COALESCE(_delta_amount,0);
    IF r.source_kind = 'cash' AND COALESCE(r.denomination,0) > 0 THEN
      v_delta_count := (v_delta_amount / r.denomination)::int;
    END IF;
  END IF;

  IF v_delta_amount <> 0 AND COALESCE(btrim(_reason),'') = '' THEN
    RAISE EXCEPTION 'correction reason is required';
  END IF;
  -- Cash can never go negative; bank/mobile corrections apply to the daily NET,
  -- which may legitimately be negative (more OUT than IN).
  IF r.source_kind = 'cash' AND r.orig_amount + v_delta_amount < 0 THEN
    RAISE EXCEPTION 'corrected amount cannot be negative';
  END IF;

  UPDATE closing_wallet_inbox_rows
     SET corr_delta_count = CASE WHEN source_kind='cash' THEN v_delta_count ELSE 0 END,
         corr_delta_amount = v_delta_amount,
         correction_reason = NULLIF(btrim(_reason),''),
         corrected_by = CASE WHEN v_delta_amount = 0 THEN NULL ELSE v_uid END,
         corrected_at = CASE WHEN v_delta_amount = 0 THEN NULL ELSE now() END
   WHERE id = _row_id;

  RETURN jsonb_build_object('status','ok','row_id',_row_id,
                            'final_amount', r.orig_amount + v_delta_amount);
END;
$function$;