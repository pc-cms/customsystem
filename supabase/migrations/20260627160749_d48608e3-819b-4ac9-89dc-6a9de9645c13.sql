
-- 1) Role defaults for pit_book
INSERT INTO public.role_module_defaults (role, module_key, can_view, can_write, day_horizon) VALUES
  ('pit'::app_role,             'pit_book', true, true,  'all'),
  ('shift_manager'::app_role,   'pit_book', true, true,  'all'),
  ('manager'::app_role,         'pit_book', true, true,  'all'),
  ('surveillance'::app_role,    'pit_book', true, true,  'all'),
  ('finance_manager'::app_role, 'pit_book', true, false, 'all')
ON CONFLICT (role, module_key) DO UPDATE
  SET can_view   = EXCLUDED.can_view,
      can_write  = EXCLUDED.can_write,
      day_horizon = EXCLUDED.day_horizon;

-- 2) Extend RLS read policy to include finance_manager
DROP POLICY IF EXISTS "pit_book read" ON public.pit_book_entries;
CREATE POLICY "pit_book read" ON public.pit_book_entries
FOR SELECT
USING (
  (
    has_role(auth.uid(), 'pit'::app_role)
    OR has_role(auth.uid(), 'shift_manager'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'surveillance'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  )
  AND EXISTS (
    SELECT 1 FROM public.user_casino_access uca
    WHERE uca.user_id = auth.uid()
      AND uca.casino_id = pit_book_entries.casino_id
  )
);
