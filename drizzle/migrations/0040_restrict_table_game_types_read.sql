DROP POLICY IF EXISTS "game types readable by staff" ON public.table_game_types;
CREATE POLICY "game types readable by staff" ON public.table_game_types
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()));