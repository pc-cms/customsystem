-- Allow CCTV (surveillance) to write Pit Book entries
DROP POLICY IF EXISTS "pit_book write" ON public.pit_book_entries;
CREATE POLICY "pit_book write"
  ON public.pit_book_entries FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'shift_manager')
      OR public.has_role(auth.uid(), 'pit')
      OR public.has_role(auth.uid(), 'surveillance')
    )
    AND EXISTS (
      SELECT 1 FROM public.user_casino_access uca
      WHERE uca.user_id = auth.uid() AND uca.casino_id = pit_book_entries.casino_id
    )
  );