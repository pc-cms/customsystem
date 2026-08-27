CREATE OR REPLACE FUNCTION public.closing_inbox_build(_casino_id uuid, _business_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inbox uuid;
  r record;
  k text; c text; d text; q numeric; amt numeric;
  v_in numeric; v_out numeric; v_final numeric; v_open numeric;
  v_ch jsonb; v_open_ch jsonb; v_cur text; v_bank text; v_lbl text;
begin
  select id into v_inbox from closing_wallet_inbox
   where casino_id = _casino_id and business_date = _business_date;
  if v_inbox is not null then return v_inbox; end if;

  insert into closing_wallet_inbox (casino_id, business_date, day_closure_id)
  values (_casino_id, _business_date,
          (select id from business_day_closures where casino_id=_casino_id and business_date=_business_date limit 1))
  returning id into v_inbox;

  for r in
    select s.id, s.closing_count, s.opening_float,
           s.cashless_in_providers, s.cashless_out_providers
      from shifts s
     where s.casino_id = _casino_id
       and business_date_of(coalesce(s.opened_at, s.closed_at)) = _business_date
       and s.closing_count is not null
  loop
    for c in select jsonb_object_keys(coalesce(r.closing_count->'cash','{}'::jsonb)) loop
      for d in select jsonb_object_keys(coalesce(r.closing_count->'cash'->c,'{}'::jsonb)) loop
        q := coalesce(nullif(r.closing_count->'cash'->c->>d,'')::numeric, 0);
        continue when q = 0 or d !~ '^[0-9]+$';
        insert into closing_wallet_inbox_rows(
          inbox_id, casino_id, business_date, section, source_kind, label,
          currency, denomination, orig_count, orig_amount, wallet_id,
          source_ref_table, source_ref_id)
        values (v_inbox, _casino_id, _business_date, 'live', 'cash',
                'Cash ' || c, c, d::numeric, q::int, d::numeric * q,
                closing_inbox_map_wallet(_casino_id,'cash',c,'Cash ' || c),
                'shifts', r.id);
      end loop;
    end loop;

    for k in
      select distinct key from (
        select jsonb_object_keys(coalesce(r.cashless_in_providers,'{}'::jsonb)) as key
        union select jsonb_object_keys(coalesce(r.cashless_out_providers,'{}'::jsonb))
        union select jsonb_object_keys(coalesce(r.closing_count->'mobile','{}'::jsonb))
      ) t
    loop
      v_in    := coalesce(nullif(r.cashless_in_providers->>k,'')::numeric, 0);
      v_out   := coalesce(nullif(r.cashless_out_providers->>k,'')::numeric, 0);
      v_final := nullif(r.closing_count->'mobile'->>k,'')::numeric;
      v_open  := nullif(r.opening_float->'mobile'->>k,'')::numeric;
      amt := v_in - v_out;
      continue when amt = 0 and coalesce(v_final,0) = 0;
      insert into closing_wallet_inbox_rows(
        inbox_id, casino_id, business_date, section, source_kind, label,
        currency, orig_in, orig_out, orig_amount, final_balance, opening_balance,
        wallet_id, source_ref_table, source_ref_id)
      values (v_inbox, _casino_id, _business_date, 'live', 'mobile', k, 'TZS',
              v_in, v_out, amt, v_final, v_open,
              closing_inbox_map_wallet(_casino_id,'mobile','TZS',k), 'shifts', r.id);
    end loop;

    v_ch      := coalesce(r.closing_count->'bank'->'channels','{}'::jsonb);
    v_open_ch := coalesce(r.opening_float->'bank'->'channels','{}'::jsonb);
    if jsonb_typeof(v_ch) = 'object' and v_ch <> '{}'::jsonb then
      for k in select jsonb_object_keys(v_ch) loop
        v_in    := coalesce(nullif(v_ch->k->>'in','')::numeric, 0);
        v_out   := coalesce(nullif(v_ch->k->>'out','')::numeric, 0);
        v_final := nullif(v_ch->k->>'final','')::numeric;
        v_open  := nullif(v_open_ch->k->>'final','')::numeric;
        amt := v_in - v_out;
        continue when amt = 0 and coalesce(v_final,0) = 0;
        v_cur  := upper(split_part(k, '_', 2));
        if v_cur = '' then v_cur := 'TZS'; end if;
        v_bank := upper(split_part(k, '_', 1));
        v_lbl  := v_bank || ' ' || v_cur;
        insert into closing_wallet_inbox_rows(
          inbox_id, casino_id, business_date, section, source_kind, label,
          currency, orig_in, orig_out, orig_amount, final_balance, opening_balance,
          wallet_id, source_ref_table, source_ref_id)
        values (v_inbox, _casino_id, _business_date, 'live', 'bank', v_lbl, v_cur,
                v_in, v_out, amt, v_final, v_open,
                closing_inbox_map_wallet(_casino_id,'bank',v_cur,v_lbl), 'shifts', r.id);
      end loop;
    end if;

    -- Legacy generic bank balances have no daily IN/OUT. Keep them as CHECK ONLY.
    -- Never treat the closing balance itself as money to post.
    for k in select jsonb_object_keys(coalesce(r.closing_count->'bank','{}'::jsonb)) loop
      continue when k = 'channels';
      continue when jsonb_typeof(r.closing_count->'bank'->k) <> 'number';
      v_final := coalesce(nullif(r.closing_count->'bank'->>k,'')::numeric, 0);
      continue when v_final = 0;
      continue when jsonb_typeof(v_ch) = 'object' and v_ch <> '{}'::jsonb;
      insert into closing_wallet_inbox_rows(
        inbox_id, casino_id, business_date, section, source_kind, label,
        currency, orig_in, orig_out, orig_amount, final_balance, wallet_id,
        source_ref_table, source_ref_id)
      values (v_inbox, _casino_id, _business_date, 'live', 'bank',
              'Bank ' || upper(k), upper(k), 0, 0, 0, v_final, null,
              'shifts', r.id);
    end loop;
  end loop;

  for r in
    select cs.id, cs.cashless_final_providers,
           cs.cashless_in_providers, cs.cashless_out_providers
      from cage_slots_shifts cs
     where cs.casino_id = _casino_id
       and coalesce(cs.business_date, business_date_of(coalesce(cs.opened_at, cs.closed_at))) = _business_date
       and coalesce(cs.status::text,'') in ('closed','approved')
  loop
    insert into closing_wallet_inbox_rows(
      inbox_id, casino_id, business_date, section, source_kind, label,
      currency, denomination, orig_count, orig_amount, wallet_id,
      source_ref_table, source_ref_id)
    select v_inbox, _casino_id, _business_date, 'slots', 'cash',
           'Cash ' || i.currency_code, i.currency_code, i.denomination,
           sum(i.quantity)::int, i.denomination * sum(i.quantity),
           closing_inbox_map_wallet(_casino_id,'cash',i.currency_code,'Cash ' || i.currency_code),
           'cage_slots_shifts', r.id
      from cage_slots_cash_inventory i
     where i.cage_slots_shift_id = r.id
       and i.inventory_type = 'closing'
     group by i.currency_code, i.denomination
    having sum(i.quantity) > 0;

    for k in
      select distinct key from (
        select jsonb_object_keys(coalesce(r.cashless_in_providers,'{}'::jsonb)) as key
        union select jsonb_object_keys(coalesce(r.cashless_out_providers,'{}'::jsonb))
        union select jsonb_object_keys(coalesce(r.cashless_final_providers,'{}'::jsonb))
      ) t
    loop
      v_in    := coalesce(nullif(r.cashless_in_providers->>k,'')::numeric, 0);
      v_out   := coalesce(nullif(r.cashless_out_providers->>k,'')::numeric, 0);
      v_final := nullif(r.cashless_final_providers->>k,'')::numeric;
      amt := v_in - v_out;
      continue when amt = 0 and coalesce(v_final,0) = 0;
      insert into closing_wallet_inbox_rows(
        inbox_id, casino_id, business_date, section, source_kind, label,
        currency, orig_in, orig_out, orig_amount, final_balance,
        wallet_id, source_ref_table, source_ref_id)
      values (v_inbox, _casino_id, _business_date, 'slots', 'mobile', k, 'TZS',
              v_in, v_out, amt, v_final,
              closing_inbox_map_wallet(_casino_id,'mobile','TZS',k),
              'cage_slots_shifts', r.id);
    end loop;
  end loop;

  return v_inbox;
end;
$function$;