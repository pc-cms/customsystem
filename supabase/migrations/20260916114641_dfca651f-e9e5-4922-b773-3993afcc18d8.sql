create or replace function public.payroll_rebuild_period(_period_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.payroll_periods%rowtype;
  v_deleted int;
  v_refresh json;
begin
  if not public.has_role(auth.uid(), 'super_admin') then
    raise exception 'Rebuild from scratch is restricted to super_admin';
  end if;

  select * into v_period from public.payroll_periods where id = _period_id;
  if v_period.id is null then
    raise exception 'Period not found';
  end if;
  if v_period.status <> 'draft' then
    raise exception 'Rebuild allowed only for draft periods (current: %)', v_period.status;
  end if;

  delete from public.payroll_entries where period_id = _period_id;
  get diagnostics v_deleted = row_count;

  select public.payroll_refresh_period(_period_id) into v_refresh;

  insert into public.payroll_audit_log (period_id, casino_id, action, actor_id, details)
  values (_period_id, v_period.casino_id, 'rebuilt', auth.uid(),
          jsonb_build_object('deleted', v_deleted, 'refresh', v_refresh));

  return jsonb_build_object('deleted', v_deleted, 'refresh', v_refresh);
end;
$$;

revoke execute on function public.payroll_rebuild_period(uuid) from public, anon;
grant execute on function public.payroll_rebuild_period(uuid) to authenticated;