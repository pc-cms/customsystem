
DROP POLICY IF EXISTS "pit_book read"  ON public.pit_book_entries;
DROP POLICY IF EXISTS "pit_book write" ON public.pit_book_entries;

CREATE POLICY "pit_book read"
  ON public.pit_book_entries
  FOR SELECT
  TO authenticated
  USING (
    (
      public.has_role(auth.uid(), 'pit'::app_role)
      OR public.has_role(auth.uid(), 'shift_manager'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'surveillance'::app_role)
      OR public.has_role(auth.uid(), 'finance_manager'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
    AND (
      EXISTS (SELECT 1 FROM public.user_casino_access uca
                WHERE uca.user_id = auth.uid() AND uca.casino_id = pit_book_entries.casino_id)
      OR EXISTS (SELECT 1 FROM public.profiles pr
                WHERE pr.user_id = auth.uid() AND pr.casino_id = pit_book_entries.casino_id)
    )
  );

CREATE POLICY "pit_book write"
  ON public.pit_book_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'shift_manager'::app_role)
      OR public.has_role(auth.uid(), 'pit'::app_role)
      OR public.has_role(auth.uid(), 'surveillance'::app_role)
      OR public.has_role(auth.uid(), 'finance_manager'::app_role)
    )
    AND (
      EXISTS (SELECT 1 FROM public.user_casino_access uca
                WHERE uca.user_id = auth.uid() AND uca.casino_id = pit_book_entries.casino_id)
      OR EXISTS (SELECT 1 FROM public.profiles pr
                WHERE pr.user_id = auth.uid() AND pr.casino_id = pit_book_entries.casino_id)
    )
  );
