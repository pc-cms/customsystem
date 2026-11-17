-- 1) Lock down dynamic-SQL SECURITY DEFINER functions (server/service-role only)
REVOKE EXECUTE ON FUNCTION public.sync_apply_remote(uuid, int8, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rollback_policy_batch(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mirror_parity_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_mbeya_demo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mirror_full_parity_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_parity_snapshot(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mirror_full_parity_snapshot(uuid) TO service_role;

-- Super-admin-only wrappers for the admin panels (no dynamic SQL here)
CREATE OR REPLACE FUNCTION public.admin_mirror_parity_snapshot(p_casino_id uuid)
RETURNS TABLE(table_name text, row_count bigint, max_updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT * FROM public.mirror_parity_snapshot(p_casino_id);
END $$;

CREATE OR REPLACE FUNCTION public.admin_mirror_full_parity_snapshot(p_casino_id uuid)
RETURNS TABLE(table_name text, scope text, critical boolean, row_count bigint, ids_checksum text, rows_checksum text, max_change_ts timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT * FROM public.mirror_full_parity_snapshot(p_casino_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_mirror_parity_snapshot(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_mirror_full_parity_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mirror_parity_snapshot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mirror_full_parity_snapshot(uuid) TO authenticated;

-- 2) Replace USING (true) read policies with "user is CMS staff" (has any app role)
CREATE OR REPLACE FUNCTION public.is_cms_staff(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid)
$$;
REVOKE EXECUTE ON FUNCTION public.is_cms_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_cms_staff(uuid) TO authenticated;

ALTER POLICY "Read table drop cache" ON public.table_day_drop_cache USING (public.is_cms_staff(auth.uid()));
ALTER POLICY "mgmt_slots_read" ON public.management_slots USING (public.is_cms_staff(auth.uid()));
ALTER POLICY "mgmt_vac_read" ON public.management_vacations USING (public.is_cms_staff(auth.uid()));
ALTER POLICY "Player tags visible to staff" ON public.player_tags USING (public.is_cms_staff(auth.uid()));
ALTER POLICY "Casino visits visible to staff" ON public.casino_visits USING (public.is_cms_staff(auth.uid()));
ALTER POLICY "mgmt_att_read" ON public.management_attendance USING (public.is_cms_staff(auth.uid()));
ALTER POLICY "All authenticated read role defaults" ON public.role_module_defaults USING (public.is_cms_staff(auth.uid()));
ALTER POLICY "mgmt_people_read" ON public.management_people USING (public.is_cms_staff(auth.uid()));
ALTER POLICY "Players readable by staff" ON public.players USING (public.is_cms_staff(auth.uid()));
ALTER POLICY "zones_select_all" ON public.player_daily_zones USING (public.is_cms_staff(auth.uid()));
ALTER POLICY "mgmt_rota_read" ON public.management_rota USING (public.is_cms_staff(auth.uid()));
ALTER POLICY "Authenticated can read capabilities" ON public.role_capabilities USING (public.is_cms_staff(auth.uid()));
ALTER POLICY "Everyone sees tag conflicts" ON public.tag_conflicts USING (public.is_cms_staff(auth.uid()));
ALTER POLICY "Read player drop cache" ON public.player_day_drop_cache USING (public.is_cms_staff(auth.uid()));
ALTER POLICY "Player cards readable by staff" ON public.player_cards USING (public.is_cms_staff(auth.uid()));
