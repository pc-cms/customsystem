UPDATE public.role_module_defaults SET can_view = false, can_write = false, updated_at = now() WHERE role = 'surveillance' AND module_key = 'pit_book';

DELETE FROM public.user_module_permissions WHERE module_key = 'pit_book' AND user_id IN (SELECT user_id FROM public.user_roles WHERE role = 'surveillance');

DROP POLICY IF EXISTS "pit_book read" ON public.pit_book_entries;
CREATE POLICY "pit_book read" ON public.pit_book_entries FOR SELECT TO authenticated
USING (
  (has_role(auth.uid(), 'pit'::app_role) OR has_role(auth.uid(), 'shift_manager'::app_role) OR can_manage(auth.uid()) OR can_finance(auth.uid()) OR has_role(auth.uid(), 'super_admin'::app_role))
  AND (
    EXISTS (SELECT 1 FROM public.user_casino_access uca WHERE uca.user_id = auth.uid() AND uca.casino_id = pit_book_entries.casino_id)
    OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.user_id = auth.uid() AND pr.casino_id = pit_book_entries.casino_id)
  )
);

DROP POLICY IF EXISTS "pit_book write" ON public.pit_book_entries;
CREATE POLICY "pit_book write" ON public.pit_book_entries FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    has_role(auth.uid(), 'super_admin'::app_role) OR can_manage(auth.uid()) OR has_role(auth.uid(), 'shift_manager'::app_role) OR can_finance(auth.uid())
    OR (has_role(auth.uid(), 'pit'::app_role) AND channel = 'pit_bosses'::text)
  )
  AND (
    EXISTS (SELECT 1 FROM public.user_casino_access uca WHERE uca.user_id = auth.uid() AND uca.casino_id = pit_book_entries.casino_id)
    OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.user_id = auth.uid() AND pr.casino_id = pit_book_entries.casino_id)
  )
);