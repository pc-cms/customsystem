-- casino_visits: scope reads to casino access
DROP POLICY IF EXISTS "Casino visits globally visible to authenticated" ON public.casino_visits;
CREATE POLICY "Casino visits visible within casino scope"
ON public.casino_visits FOR SELECT TO authenticated
USING (public.has_casino_scope(auth.uid(), casino_id));

-- player_day_drop_cache
DROP POLICY IF EXISTS "Authenticated read drop cache" ON public.player_day_drop_cache;
CREATE POLICY "Read drop cache within casino scope"
ON public.player_day_drop_cache FOR SELECT TO authenticated
USING (public.has_casino_scope(auth.uid(), casino_id));

-- table_day_drop_cache
DROP POLICY IF EXISTS "Authenticated read table drop cache" ON public.table_day_drop_cache;
CREATE POLICY "Read table drop cache within casino scope"
ON public.table_day_drop_cache FOR SELECT TO authenticated
USING (public.has_casino_scope(auth.uid(), casino_id));

-- player_tags: no casino_id column; scope via the player's home casino
DROP POLICY IF EXISTS "Player tags globally visible to authenticated" ON public.player_tags;
CREATE POLICY "Player tags visible within casino scope"
ON public.player_tags FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.players pl
    WHERE pl.id = player_tags.player_id
      AND public.has_casino_scope(auth.uid(), pl.casino_id)
  )
);