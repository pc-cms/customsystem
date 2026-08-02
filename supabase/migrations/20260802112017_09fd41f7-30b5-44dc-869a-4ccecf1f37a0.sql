DROP POLICY IF EXISTS "box_config anon read setup flag" ON public.box_config;
DROP POLICY IF EXISTS "box_licenses anon read" ON public.box_licenses;
REVOKE SELECT ON public.box_config FROM anon;
REVOKE SELECT ON public.box_licenses FROM anon;
GRANT SELECT ON public.box_config TO authenticated;
GRANT SELECT ON public.box_licenses TO authenticated;
GRANT ALL ON public.box_config TO service_role;
GRANT ALL ON public.box_licenses TO service_role;