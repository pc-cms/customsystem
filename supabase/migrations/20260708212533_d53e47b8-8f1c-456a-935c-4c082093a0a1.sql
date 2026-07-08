
DROP POLICY IF EXISTS "Casino users see chip inventory" ON public.chip_inventory;
CREATE POLICY "Casino users see chip inventory" ON public.chip_inventory
FOR SELECT USING (public.user_has_casino_access(auth.uid(), casino_id));

DROP POLICY IF EXISTS "Casino users see head count" ON public.table_head_count;
CREATE POLICY "Casino users see head count" ON public.table_head_count
FOR SELECT USING (public.user_has_casino_access(auth.uid(), casino_id));
