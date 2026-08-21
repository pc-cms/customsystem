CREATE OR REPLACE FUNCTION public.has_casino_scope(_uid uuid, _casino_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _casino_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _uid AND ur.role = 'super_admin'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = _uid AND p.casino_id = _casino_id
    )
    OR EXISTS (
      SELECT 1 FROM public.user_casino_access a
      WHERE a.user_id = _uid AND a.casino_id = _casino_id
    )
  );
$$;