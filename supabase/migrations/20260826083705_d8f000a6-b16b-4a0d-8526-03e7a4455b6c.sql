CREATE OR REPLACE FUNCTION public.fin_lock_day_closing(p_id uuid, p_variance_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v public.fin_day_closing;
  v_snap jsonb;
  v_actual_tables numeric;
  v_actual_slots  numeric;
  v_diff_tables   numeric;
  v_diff_slots    numeric;
  v_needs_note    boolean;
  line jsonb;
BEGIN
  SELECT * INTO v FROM public.fin_day_closing WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'closing not found'; END IF;
  IF v.locked_at IS NOT NULL THEN RAISE EXCEPTION 'already locked'; END IF;

  SELECT snapshot INTO v_snap
    FROM public.business_day_closures
   WHERE casino_id = v.casino_id AND business_date = v.business_date
   ORDER BY closed_at DESC
   LIMIT 1;

  IF v_snap IS NULL THEN
    RAISE EXCEPTION 'Cannot lock: Cage business-day closure for % does not exist yet', v.business_date;
  END IF;

  v_actual_tables := COALESCE((v_snap->'totals'->>'tables_result')::numeric, 0);
  v_actual_slots  := COALESCE((v_snap->'totals'->>'slots_result')::numeric, 0);

  v_diff_tables := COALESCE(v.tables_result, 0) - v_actual_tables;
  v_diff_slots  := COALESCE(v.slots_result, 0)  - v_actual_slots;

  -- Slots are NOT reconciled against cashier slot shifts: Day Closing Slots is the
  -- ACE / manual source of truth and is isolated from the cage shift cycle.
  -- Only a Tables variance requires a reconciliation comment.
  v_needs_note := (abs(v_diff_tables) > 1);

  IF v_needs_note AND (p_variance_note IS NULL OR length(btrim(p_variance_note)) < 3) THEN
    RAISE EXCEPTION 'Variance detected (tables Δ=%) — a reconciliation comment is required', v_diff_tables;
  END IF;

  FOR line IN SELECT * FROM jsonb_array_elements(COALESCE(v.income_lines, '[]'::jsonb))
  LOOP
    IF (line->>'wallet_id') IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.fin_wallet_tx(
      casino_id, wallet_id, kind, amount, currency, fx_rate, amount_tzs,
      ref_table, ref_id, business_date, created_by, note
    )
    VALUES (
      v.casino_id, (line->>'wallet_id')::uuid, 'income',
      (line->>'amount')::numeric, line->>'currency',
      COALESCE((line->>'fx_rate')::numeric, 1),
      (line->>'amount')::numeric * COALESCE((line->>'fx_rate')::numeric, 1),
      'fin_day_closing', v.id, v.business_date, auth.uid(), 'Day closing income'
    );
  END LOOP;

  UPDATE public.fin_day_closing
     SET locked_at    = now(),
         closed_by    = auth.uid(),
         variance_note = p_variance_note
   WHERE id = p_id;

  INSERT INTO public.fin_audit_log(casino_id, actor, action, entity_table, entity_id, after)
  VALUES (v.casino_id, auth.uid(), 'lock', 'fin_day_closing', v.id,
          jsonb_build_object(
            'business_date', v.business_date,
            'entered_tables', v.tables_result,
            'entered_slots',  v.slots_result,
            'actual_tables',  v_actual_tables,
            'actual_slots',   v_actual_slots,
            'diff_tables',    v_diff_tables,
            'diff_slots',     v_diff_slots,
            'variance_note',  p_variance_note
          ));
END;
$$;