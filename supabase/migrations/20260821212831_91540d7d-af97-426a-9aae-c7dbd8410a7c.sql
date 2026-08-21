-- Network-wide player base is intentional (players roam between branches, shared blacklist,
-- duplicate merging), but restrict reads to accounts that actually hold a staff role.
DROP POLICY IF EXISTS "Players globally visible to authenticated" ON public.players;
CREATE POLICY "Players readable by staff accounts"
ON public.players FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

DROP POLICY IF EXISTS "Player cards globally visible to authenticated" ON public.player_cards;
CREATE POLICY "Player cards readable by staff accounts"
ON public.player_cards FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));