-- 1. Unified casino scope check -------------------------------------------
CREATE OR REPLACE FUNCTION public.has_casino_scope(_uid uuid, _casino_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _casino_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _uid
        AND ur.role IN ('super_admin','general_manager','finance_manager','boss','surveillance')
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
$function$;

CREATE OR REPLACE FUNCTION public.user_has_casino_access(_user_id uuid, _casino_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.has_casino_scope(_user_id, _casino_id);
$function$;

-- 2. Slots cage helpers ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.cs_can_view(_casino uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.has_casino_scope(auth.uid(), _casino)
     AND (
       public.has_role(auth.uid(),'cashier_slots'::public.app_role)
       OR public.has_role(auth.uid(),'manager'::public.app_role)
       OR public.has_role(auth.uid(),'shift_manager'::public.app_role)
       OR public.has_role(auth.uid(),'finance_manager'::public.app_role)
       OR public.has_role(auth.uid(),'surveillance'::public.app_role)
       OR public.has_role(auth.uid(),'pit'::public.app_role)
       OR public.has_role(auth.uid(),'general_manager'::public.app_role)
       OR public.has_role(auth.uid(),'super_admin'::public.app_role)
       OR public.has_role(auth.uid(),'boss'::public.app_role)
     );
$function$;

-- 3. Rewrite every policy that pins access to the profile's home casino ----
DO $do$
DECLARE
  r record;
  new_qual text;
  new_check text;
  roles_txt text;
  sql text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, permissive, roles,
           qual::text AS qual, with_check::text AS with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (coalesce(qual::text,'') || coalesce(with_check::text,'')) LIKE '%get_user_casino_id%'
  LOOP
    new_qual := r.qual;
    new_check := r.with_check;

    IF r.tablename = 'casinos' THEN
      new_qual := replace(new_qual, 'id = get_user_casino_id(auth.uid())',
                                    'has_casino_scope(auth.uid(), id)');
      new_check := replace(coalesce(new_check,''), 'id = get_user_casino_id(auth.uid())',
                                    'has_casino_scope(auth.uid(), id)');
      IF new_check = '' THEN new_check := NULL; END IF;
    ELSE
      new_qual := regexp_replace(new_qual,
        '([A-Za-z_0-9]+\.)?casino_id = get_user_casino_id\(auth\.uid\(\)\)',
        'has_casino_scope(auth.uid(), \1casino_id)', 'g');
      IF new_check IS NOT NULL THEN
        new_check := regexp_replace(new_check,
          '([A-Za-z_0-9]+\.)?casino_id = get_user_casino_id\(auth\.uid\(\)\)',
          'has_casino_scope(auth.uid(), \1casino_id)', 'g');
      END IF;
    END IF;

    IF (coalesce(new_qual,'') || coalesce(new_check,'')) LIKE '%get_user_casino_id%' THEN
      RAISE EXCEPTION 'Unhandled get_user_casino_id pattern on %.% policy %',
        r.tablename, r.policyname, r.policyname;
    END IF;

    SELECT string_agg(quote_ident(x), ', ') INTO roles_txt FROM unnest(r.roles) AS x;

    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);

    sql := format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s',
                  r.policyname, r.tablename,
                  CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
                  r.cmd, roles_txt);
    IF new_qual IS NOT NULL THEN
      sql := sql || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      sql := sql || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE sql;
  END LOOP;
END
$do$;