
-- 1. Players: global SELECT for any authenticated user
DROP POLICY IF EXISTS "Players visible within casino access" ON public.players;
CREATE POLICY "Players globally visible to authenticated"
  ON public.players FOR SELECT
  TO authenticated
  USING (true);

-- 2. Player cards: global SELECT
DROP POLICY IF EXISTS "Player cards visible within casino access" ON public.player_cards;
CREATE POLICY "Player cards globally visible to authenticated"
  ON public.player_cards FOR SELECT
  TO authenticated
  USING (true);

-- 3. Player tags: global SELECT
DROP POLICY IF EXISTS "Player tags visible within casino access" ON public.player_tags;
DROP POLICY IF EXISTS "Super admins see all player tags" ON public.player_tags;
CREATE POLICY "Player tags globally visible to authenticated"
  ON public.player_tags FOR SELECT
  TO authenticated
  USING (true);

-- 4. Casino visits: global SELECT (Guests are global)
DROP POLICY IF EXISTS "Casino users see visits" ON public.casino_visits;
DROP POLICY IF EXISTS "Security sees assigned casino visits" ON public.casino_visits;
DROP POLICY IF EXISTS "Super admins see all visits" ON public.casino_visits;
CREATE POLICY "Casino visits globally visible to authenticated"
  ON public.casino_visits FOR SELECT
  TO authenticated
  USING (true);

-- 5. kyc_reviews: scope manager access to own casino
DROP POLICY IF EXISTS "AM and admin manage kyc" ON public.kyc_reviews;
CREATE POLICY "AM and super admin manage kyc"
  ON public.kyc_reviews FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'account_manager'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'account_manager'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Managers read kyc for own casino"
  ON public.kyc_reviews FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND casino_id = get_user_casino_id(auth.uid())
  );
