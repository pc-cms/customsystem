DROP POLICY IF EXISTS fb_write_module ON public.fin_budget;
CREATE POLICY fb_write_module ON public.fin_budget
  AS PERMISSIVE FOR ALL TO authenticated
  USING (
    public.user_has_casino_access(auth.uid(), casino_id)
    AND EXISTS (
      SELECT 1 FROM public.user_module_permissions p
      WHERE p.user_id = auth.uid()
        AND p.module_key = 'finance_budget'
        AND p.can_write
    )
  )
  WITH CHECK (
    public.user_has_casino_access(auth.uid(), casino_id)
    AND EXISTS (
      SELECT 1 FROM public.user_module_permissions p
      WHERE p.user_id = auth.uid()
        AND p.module_key = 'finance_budget'
        AND p.can_write
    )
  );

INSERT INTO public.user_casino_access (user_id, casino_id, granted_by)
SELECT '8054959d-bde7-4e4c-85cc-26409792a868'::uuid, c.id, 'bf328d89-bf0a-46ab-ae1e-9b4914cc9811'::uuid
FROM public.casinos c
WHERE c.name IN ('Mwanza Cloud','Mbeya Cloud')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_module_permissions (user_id, module_key, can_view, can_write, granted_by)
VALUES ('8054959d-bde7-4e4c-85cc-26409792a868'::uuid, 'finance_budget', true, true, 'bf328d89-bf0a-46ab-ae1e-9b4914cc9811'::uuid)
ON CONFLICT (user_id, module_key) DO UPDATE SET can_view = true, can_write = true, updated_at = now();