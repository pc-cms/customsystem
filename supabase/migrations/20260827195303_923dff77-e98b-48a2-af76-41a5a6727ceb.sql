-- =========================================================
-- Closing Wallet Inbox
-- =========================================================
CREATE TABLE public.closing_wallet_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  status text NOT NULL DEFAULT 'ready',
  day_closure_id uuid,
  posted_at timestamptz,
  posted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT closing_wallet_inbox_status_chk CHECK (status IN ('ready','posted')),
  CONSTRAINT closing_wallet_inbox_uniq UNIQUE (casino_id, business_date)
);

GRANT SELECT ON public.closing_wallet_inbox TO authenticated;
GRANT ALL ON public.closing_wallet_inbox TO service_role;
ALTER TABLE public.closing_wallet_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance/manager can view closing inbox"
ON public.closing_wallet_inbox FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR ((public.can_manage(auth.uid()) OR public.can_finance(auth.uid()))
      AND public.has_casino_scope(auth.uid(), casino_id))
);

CREATE TABLE public.closing_wallet_inbox_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id uuid NOT NULL REFERENCES public.closing_wallet_inbox(id) ON DELETE CASCADE,
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  section text NOT NULL,                    -- 'live' | 'slots'
  source_kind text NOT NULL,                -- 'cash' | 'mobile' | 'bank'
  label text NOT NULL,                      -- provider / bank / cash label
  currency text NOT NULL DEFAULT 'TZS',
  denomination numeric,                     -- cash only
  orig_count integer,                       -- cash only, IMMUTABLE
  orig_amount numeric NOT NULL DEFAULT 0,   -- IMMUTABLE
  corr_delta_count integer NOT NULL DEFAULT 0,
  corr_delta_amount numeric NOT NULL DEFAULT 0,
  correction_reason text,
  corrected_by uuid,
  corrected_at timestamptz,
  final_amount numeric GENERATED ALWAYS AS (orig_amount + corr_delta_amount) STORED,
  wallet_id uuid REFERENCES public.fin_wallets(id) ON DELETE SET NULL,
  wallet_auto boolean NOT NULL DEFAULT true,
  source_ref_table text,
  source_ref_id uuid,
  posted_tx_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cwir_section_chk CHECK (section IN ('live','slots')),
  CONSTRAINT cwir_kind_chk CHECK (source_kind IN ('cash','mobile','bank'))
);

GRANT SELECT ON public.closing_wallet_inbox_rows TO authenticated;
GRANT ALL ON public.closing_wallet_inbox_rows TO service_role;
ALTER TABLE public.closing_wallet_inbox_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance/manager can view closing inbox rows"
ON public.closing_wallet_inbox_rows FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'super_admin'::app_role)
  OR ((public.can_manage(auth.uid()) OR public.can_finance(auth.uid()))
      AND public.has_casino_scope(auth.uid(), casino_id))
);

CREATE INDEX cwir_inbox_idx ON public.closing_wallet_inbox_rows(inbox_id);
CREATE INDEX cwir_casino_date_idx ON public.closing_wallet_inbox_rows(casino_id, business_date);

-- Double-post protection: one wallet tx per inbox row, ever.
CREATE UNIQUE INDEX fin_wallet_tx_closing_inbox_uniq
  ON public.fin_wallet_tx(ref_id)
  WHERE ref_table = 'closing_wallet_inbox_rows';

CREATE TRIGGER trg_cwi_updated_at BEFORE UPDATE ON public.closing_wallet_inbox
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_cwir_updated_at BEFORE UPDATE ON public.closing_wallet_inbox_rows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Deterministic wallet mapping against REAL fin_wallets
-- =========================================================
CREATE OR REPLACE FUNCTION public.closing_inbox_map_wallet(
  _casino_id uuid, _source_kind text, _currency text, _label text
) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_code text;
  v_id uuid;
  v_lbl text := lower(coalesce(_label,''));
BEGIN
  IF _source_kind = 'cash' THEN
    v_code := 'CASH_' || upper(coalesce(_currency,'TZS'));
  ELSIF _source_kind = 'mobile' THEN
    v_code := CASE
      WHEN v_lbl LIKE '%airtel%' THEN 'MM_AIRTEL_TZS'
      WHEN v_lbl LIKE '%tigo%'   THEN 'MM_TIGO_TZS'
      WHEN v_lbl LIKE '%pesa%' AND v_lbl LIKE '%halo%' THEN 'MM_HALO_TZS'
      WHEN v_lbl LIKE '%halo%'   THEN 'MM_HALO_TZS'
      WHEN v_lbl LIKE '%mpesa%' OR v_lbl LIKE '%m-pesa%' THEN 'MM_MPESA_TZS'
      WHEN v_lbl LIKE '%main%'   THEN 'MM_MAIN_PHONE_TZS'
      WHEN v_lbl LIKE '%selcom%' THEN 'SELCOM_TZS'
      WHEN v_lbl LIKE '%wechat%' THEN 'WECHAT_TZS'
      ELSE NULL END;
  ELSE
    -- bank: only map when the label unambiguously names the bank
    v_code := CASE
      WHEN v_lbl LIKE '%crdb%' THEN 'BANK_CRDB_' || upper(coalesce(_currency,'TZS'))
      WHEN v_lbl LIKE '%nbc%'  THEN 'BANK_NBC_'  || upper(coalesce(_currency,'TZS'))
      WHEN v_lbl LIKE '%selcom%' THEN 'SELCOM_' || upper(coalesce(_currency,'TZS'))
      ELSE NULL END;
  END IF;

  IF v_code IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_id FROM fin_wallets
   WHERE casino_id = _casino_id AND is_active = TRUE
     AND canonical_code = v_code
   ORDER BY sort_order NULLS LAST, created_at LIMIT 1;

  RETURN v_id;
END;
$$;

-- =========================================================
-- Build inbox for a closed business date (idempotent)
-- =========================================================
CREATE OR REPLACE FUNCTION public.closing_inbox_build(_casino_id uuid, _business_date date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_inbox uuid;
  r RECORD;
  k text; c text; d text; q numeric; amt numeric;
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
  -- LIVE cashdesk (shifts.closing_count) — money only
  ---------------------------------------------------------
  FOR r IN
    SELECT s.id, s.closing_count
      FROM shifts s
     WHERE s.casino_id = _casino_id
       AND business_date_of(COALESCE(s.opened_at, s.closed_at)) = _business_date
       AND s.closing_count IS NOT NULL
  LOOP
    -- cash by currency / denomination
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

    -- mobile money providers
    FOR k IN SELECT jsonb_object_keys(COALESCE(r.closing_count->'mobile','{}'::jsonb)) LOOP
      amt := COALESCE(NULLIF(r.closing_count->'mobile'->>k,'')::numeric, 0);
      CONTINUE WHEN amt = 0;
      INSERT INTO closing_wallet_inbox_rows(
        inbox_id, casino_id, business_date, section, source_kind, label,
        currency, orig_amount, wallet_id, source_ref_table, source_ref_id)
      VALUES (v_inbox, _casino_id, _business_date, 'live', 'mobile', k, 'TZS', amt,
              closing_inbox_map_wallet(_casino_id,'mobile','TZS',k), 'shifts', r.id);
    END LOOP;

    -- bank amounts
    FOR k IN SELECT jsonb_object_keys(COALESCE(r.closing_count->'bank','{}'::jsonb)) LOOP
      amt := COALESCE(NULLIF(r.closing_count->'bank'->>k,'')::numeric, 0);
      CONTINUE WHEN amt = 0;
      INSERT INTO closing_wallet_inbox_rows(
        inbox_id, casino_id, business_date, section, source_kind, label,
        currency, orig_amount, wallet_id, source_ref_table, source_ref_id)
      VALUES (v_inbox, _casino_id, _business_date, 'live', 'bank',
              'Bank ' || upper(k), upper(k), amt,
              closing_inbox_map_wallet(_casino_id,'bank',upper(k),'Bank ' || upper(k)),
              'shifts', r.id);
    END LOOP;
  END LOOP;

  ---------------------------------------------------------
  -- SLOTS cashdesk (cage_slots_shifts) — money only
  ---------------------------------------------------------
  FOR r IN
    SELECT cs.id, cs.cashless_final_providers
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

    FOR k IN SELECT jsonb_object_keys(COALESCE(r.cashless_final_providers,'{}'::jsonb)) LOOP
      amt := COALESCE(NULLIF(r.cashless_final_providers->>k,'')::numeric, 0);
      CONTINUE WHEN amt = 0;
      INSERT INTO closing_wallet_inbox_rows(
        inbox_id, casino_id, business_date, section, source_kind, label,
        currency, orig_amount, wallet_id, source_ref_table, source_ref_id)
      VALUES (v_inbox, _casino_id, _business_date, 'slots', 'mobile', k, 'TZS', amt,
              closing_inbox_map_wallet(_casino_id,'mobile','TZS',k),
              'cage_slots_shifts', r.id);
    END LOOP;
  END LOOP;

  RETURN v_inbox;
END;
$$;

-- Automatic creation right AFTER the business day closure row appears.
CREATE OR REPLACE FUNCTION public.tg_closing_inbox_after_day_close()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  BEGIN
    PERFORM public.closing_inbox_build(NEW.casino_id, NEW.business_date);
  EXCEPTION WHEN OTHERS THEN
    -- never block the day closure because of the inbox
    RAISE WARNING 'closing_inbox_build failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_closing_inbox_after_day_close
AFTER INSERT ON public.business_day_closures
FOR EACH ROW EXECUTE FUNCTION public.tg_closing_inbox_after_day_close();

-- =========================================================
-- Read model
-- =========================================================
CREATE OR REPLACE FUNCTION public.closing_inbox_get(_casino_id uuid, _business_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.closing_inbox_pending(_casino_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'business_date',business_date)
           ORDER BY business_date), '[]'::jsonb)
  FROM closing_wallet_inbox
  WHERE casino_id = _casino_id AND status = 'ready'
    AND (has_role(auth.uid(),'super_admin'::app_role)
         OR ((can_manage(auth.uid()) OR can_finance(auth.uid()))
             AND has_casino_scope(auth.uid(), casino_id)));
$$;

-- =========================================================
-- Corrections / mapping
-- =========================================================
CREATE OR REPLACE FUNCTION public.closing_inbox_set_correction(
  _row_id uuid, _delta_count integer, _delta_amount numeric, _reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  IF r.orig_amount + v_delta_amount < 0 THEN
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
$$;

CREATE OR REPLACE FUNCTION public.closing_inbox_set_wallet(_row_id uuid, _wallet_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  r RECORD; w RECORD;
BEGIN
  SELECT * INTO r FROM closing_wallet_inbox_rows WHERE id=_row_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'row not found'; END IF;
  IF NOT (has_role(v_uid,'super_admin'::app_role)
          OR ((can_manage(v_uid) OR can_finance(v_uid)) AND has_casino_scope(v_uid,r.casino_id))) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  IF EXISTS (SELECT 1 FROM closing_wallet_inbox WHERE id=r.inbox_id AND status='posted') THEN
    RAISE EXCEPTION 'inbox already posted';
  END IF;

  SELECT * INTO w FROM fin_wallets WHERE id=_wallet_id;
  IF w.id IS NULL OR w.casino_id <> r.casino_id THEN RAISE EXCEPTION 'invalid wallet'; END IF;
  IF w.currency <> r.currency THEN RAISE EXCEPTION 'wallet currency mismatch'; END IF;

  UPDATE closing_wallet_inbox_rows
     SET wallet_id = _wallet_id, wallet_auto = false
   WHERE id = _row_id;
  RETURN jsonb_build_object('status','ok');
END;
$$;

-- =========================================================
-- Post All — atomic + idempotent
-- =========================================================
CREATE OR REPLACE FUNCTION public.closing_inbox_post_all(_inbox_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inbox RECORD;
  r RECORD;
  v_rate numeric;
  v_tx uuid;
  v_posted int := 0;
  v_prev numeric;
  v_wallet RECORD;
  v_sum numeric;
  v_type wallet_type;
BEGIN
  SELECT * INTO v_inbox FROM closing_wallet_inbox WHERE id=_inbox_id FOR UPDATE;
  IF v_inbox.id IS NULL THEN RAISE EXCEPTION 'inbox not found'; END IF;
  IF NOT (has_role(v_uid,'super_admin'::app_role)
          OR ((can_manage(v_uid) OR can_finance(v_uid)) AND has_casino_scope(v_uid,v_inbox.casino_id))) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  IF v_inbox.status = 'posted' THEN
    RETURN jsonb_build_object('status','already_posted','inbox_id',_inbox_id,
      'posted_at', v_inbox.posted_at,
      'rows', (SELECT count(*) FROM closing_wallet_inbox_rows
                WHERE inbox_id=_inbox_id AND posted_tx_id IS NOT NULL));
  END IF;

  IF EXISTS (SELECT 1 FROM closing_wallet_inbox_rows
              WHERE inbox_id=_inbox_id AND final_amount <> 0 AND wallet_id IS NULL) THEN
    RETURN jsonb_build_object('status','unmapped_rows');
  END IF;
  IF EXISTS (SELECT 1 FROM closing_wallet_inbox_rows
              WHERE inbox_id=_inbox_id AND corr_delta_amount <> 0
                AND COALESCE(btrim(correction_reason),'') = '') THEN
    RETURN jsonb_build_object('status','missing_reason');
  END IF;

  FOR r IN
    SELECT * FROM closing_wallet_inbox_rows
     WHERE inbox_id=_inbox_id AND final_amount <> 0
     ORDER BY section, source_kind, currency, denomination NULLS FIRST
  LOOP
    v_rate := CASE WHEN r.currency = 'TZS' THEN 1 ELSE
      COALESCE((SELECT rate_to_tzs FROM fin_daily_rates
                 WHERE casino_id=r.casino_id AND currency=r.currency
                   AND business_date <= r.business_date
                 ORDER BY business_date DESC LIMIT 1), 1) END;

    INSERT INTO fin_wallet_tx(
      casino_id, wallet_id, kind, amount, currency, fx_rate, amount_tzs,
      ref_table, ref_id, business_date, note, created_by, posted_at, denominations)
    VALUES (
      r.casino_id, r.wallet_id, 'adjustment', r.final_amount, r.currency, v_rate,
      r.final_amount * v_rate, 'closing_wallet_inbox_rows', r.id, r.business_date,
      'Closing Inbox · ' || upper(r.section) || ' · ' || r.label
        || CASE WHEN r.denomination IS NOT NULL
                THEN ' · ' || r.denomination::bigint || ' x ' || (COALESCE(r.orig_count,0)+r.corr_delta_count)
                ELSE '' END
        || CASE WHEN r.corr_delta_amount <> 0
                THEN ' · correction ' || r.corr_delta_amount::bigint || ' (' || COALESCE(r.correction_reason,'') || ')'
                ELSE '' END,
      v_uid, now(), CASE WHEN r.denomination IS NOT NULL
        THEN jsonb_build_object(r.denomination::bigint::text, COALESCE(r.orig_count,0)+r.corr_delta_count)
        ELSE NULL END)
    ON CONFLICT (ref_id) WHERE ref_table='closing_wallet_inbox_rows' DO NOTHING
    RETURNING id INTO v_tx;

    IF v_tx IS NOT NULL THEN
      UPDATE closing_wallet_inbox_rows SET posted_tx_id = v_tx WHERE id = r.id;
      v_posted := v_posted + 1;
    END IF;
  END LOOP;

  -- Physical (Actual) state per destination wallet: closing cash physically
  -- arrives in the wallet. Same primitive as fin_save_wallet_count.
  FOR v_wallet IN
    SELECT w.*, SUM(x.final_amount) AS add_amount
      FROM closing_wallet_inbox_rows x
      JOIN fin_wallets w ON w.id = x.wallet_id
     WHERE x.inbox_id = _inbox_id AND x.final_amount <> 0
     GROUP BY w.id
  LOOP
    SELECT physical_total INTO v_prev FROM cash_count_snapshots
     WHERE wallet_id = v_wallet.id
     ORDER BY business_date DESC NULLS LAST, created_at DESC LIMIT 1;
    v_prev := COALESCE(v_prev, COALESCE(v_wallet.starting_float_amount,0));
    v_sum := v_prev + v_wallet.add_amount;
    IF v_sum < 0 THEN v_sum := 0; END IF;

    v_type := CASE v_wallet.kind
      WHEN 'cash' THEN 'main_cash' WHEN 'safe' THEN 'office_safe'
      WHEN 'bank' THEN 'bank_account' WHEN 'mobile_money' THEN 'mobile_money'
      WHEN 'cage' THEN 'cage_table' ELSE 'other_reserve' END::wallet_type;

    v_rate := CASE WHEN v_wallet.currency='TZS' THEN 1 ELSE
      COALESCE((SELECT rate_to_tzs FROM fin_daily_rates
                 WHERE casino_id=v_wallet.casino_id AND currency=v_wallet.currency
                   AND business_date <= v_inbox.business_date
                 ORDER BY business_date DESC LIMIT 1), 1) END;

    INSERT INTO cash_count_snapshots(
      casino_id, wallet_id, wallet_type, currency, denominations,
      physical_total, expected_balance, discrepancy, exchange_rate,
      physical_total_tzs, counted_by, note, source, business_date)
    VALUES (
      v_wallet.casino_id, v_wallet.id, v_type, v_wallet.currency, '{}'::jsonb,
      v_sum, v_prev, v_sum - v_prev, v_rate, v_sum * v_rate, v_uid,
      'Closing Inbox ' || v_inbox.business_date::text, 'manual', v_inbox.business_date);
  END LOOP;

  UPDATE closing_wallet_inbox
     SET status='posted', posted_at=now(), posted_by=v_uid
   WHERE id=_inbox_id;

  RETURN jsonb_build_object('status','posted','inbox_id',_inbox_id,'rows',v_posted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.closing_inbox_get(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.closing_inbox_pending(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.closing_inbox_set_correction(uuid,integer,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.closing_inbox_set_wallet(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.closing_inbox_post_all(uuid) TO authenticated;