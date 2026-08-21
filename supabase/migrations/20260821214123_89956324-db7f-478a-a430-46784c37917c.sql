-- 1/2/3/7: restore network-wide read model (intentional single-network architecture)
DROP POLICY IF EXISTS "Casino visits visible within casino scope" ON public.casino_visits;
CREATE POLICY "Casino visits visible to staff" ON public.casino_visits FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Read drop cache within casino scope" ON public.player_day_drop_cache;
CREATE POLICY "Read player drop cache" ON public.player_day_drop_cache FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Read table drop cache within casino scope" ON public.table_day_drop_cache;
DROP POLICY IF EXISTS "Read drop cache within casino scope" ON public.table_day_drop_cache;
CREATE POLICY "Read table drop cache" ON public.table_day_drop_cache FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Player tags visible within casino scope" ON public.player_tags;
CREATE POLICY "Player tags visible to staff" ON public.player_tags FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "zones_select_casino_scope" ON public.player_daily_zones;
CREATE POLICY "zones_select_all" ON public.player_daily_zones FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "mgmt_rota_read" ON public.management_rota;
CREATE POLICY "mgmt_rota_read" ON public.management_rota FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "mgmt_slots_read" ON public.management_slots;
CREATE POLICY "mgmt_slots_read" ON public.management_slots FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "mgmt_att_read" ON public.management_attendance;
CREATE POLICY "mgmt_att_read" ON public.management_attendance FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Players readable within casino scope" ON public.players;
CREATE POLICY "Players readable by staff" ON public.players FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Player cards readable within casino scope" ON public.player_cards;
CREATE POLICY "Player cards readable by staff" ON public.player_cards FOR SELECT TO authenticated USING (true);

-- 5: manager and above see the whole network automatically (HR excluded)
CREATE OR REPLACE FUNCTION public.has_casino_scope(_uid uuid, _casino_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _casino_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _uid
        AND ur.role IN (
          'super_admin'::app_role, 'manager'::app_role, 'shift_manager'::app_role,
          'finance_manager'::app_role, 'general_manager'::app_role,
          'boss'::app_role, 'surveillance'::app_role
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = _uid AND p.casino_id = _casino_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_casino_access a
      WHERE a.user_id = _uid AND a.casino_id = _casino_id
    )
  );
$function$;

-- blacklist is global again via the players table itself
DROP FUNCTION IF EXISTS public.blacklist_network_players();