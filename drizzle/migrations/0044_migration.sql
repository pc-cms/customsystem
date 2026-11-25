create or replace function public.admin_set_user_primary_casino(_user_id uuid, _casino_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare _old uuid; _me uuid := auth.uid();
begin
  if _me is null then raise exception 'Not authenticated'; end if;
  select casino_id into _old from profiles where user_id=_user_id;
  if not (has_role(_me,'super_admin') or has_role(_me,'general_manager') or has_role(_me,'boss')
     or (has_role(_me,'manager') and has_casino_scope(_me,_casino_id) and (_old is null or has_casino_scope(_me,_old)))) then
    raise exception 'Not allowed to change primary casino';
  end if;
  update profiles set casino_id=_casino_id where user_id=_user_id;
  if not found then raise exception 'Profile not found'; end if;
  delete from user_casino_access where user_id=_user_id and casino_id=_casino_id;
end $$;
revoke all on function public.admin_set_user_primary_casino(uuid,uuid) from public, anon;
grant execute on function public.admin_set_user_primary_casino(uuid,uuid) to authenticated;
update profiles set casino_id='220e9dde-093c-4381-a63e-5bfcb9289bd8' where user_id='28f894bb-bbf1-42b4-8c96-b2fe6b000e68';
delete from user_casino_access where user_id='28f894bb-bbf1-42b4-8c96-b2fe6b000e68';