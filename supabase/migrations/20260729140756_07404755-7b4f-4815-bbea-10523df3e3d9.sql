-- 1) Policy backup infrastructure
CREATE TABLE IF NOT EXISTS public._policy_backup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  schemaname text NOT NULL,
  tablename text NOT NULL,
  policyname text NOT NULL,
  cmd text,
  permissive text,
  roles text[],
  qual text,
  with_check text,
  restore_sql text NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_policy_backup_batch ON public._policy_backup(batch_id);

GRANT ALL ON public._policy_backup TO service_role;
ALTER TABLE public._policy_backup ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "super_admin reads policy backup" ON public._policy_backup;
CREATE POLICY "super_admin reads policy backup" ON public._policy_backup
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- 2) Snapshot helper: stores exact DROP+CREATE restore statements
CREATE OR REPLACE FUNCTION public.snapshot_policies(_batch_id uuid, _tables text[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n integer := 0;
BEGIN
  INSERT INTO public._policy_backup (batch_id, schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check, restore_sql)
  SELECT
    _batch_id, p.schemaname, p.tablename, p.policyname, p.cmd, p.permissive, p.roles, p.qual, p.with_check,
    format(
      'DROP POLICY IF EXISTS %I ON %I.%I; CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;',
      p.policyname, p.schemaname, p.tablename,
      p.policyname, p.schemaname, p.tablename,
      p.permissive, p.cmd,
      array_to_string(ARRAY(SELECT quote_ident(r) FROM unnest(p.roles) AS r), ', '),
      CASE WHEN p.qual IS NULL THEN '' ELSE ' USING (' || p.qual || ')' END,
      CASE WHEN p.with_check IS NULL THEN '' ELSE ' WITH CHECK (' || p.with_check || ')' END
    )
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND (_tables IS NULL OR p.tablename = ANY(_tables));
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

-- 3) One-command rollback
CREATE OR REPLACE FUNCTION public.rollback_policy_batch(_batch_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  n integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  FOR r IN SELECT restore_sql FROM public._policy_backup WHERE batch_id = _batch_id ORDER BY id LOOP
    EXECUTE r.restore_sql;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.snapshot_policies(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rollback_policy_batch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_policy_batch(uuid) TO authenticated;

-- 4) Capability registry
CREATE TABLE IF NOT EXISTS public.role_capabilities (
  role public.app_role NOT NULL,
  capability text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, capability)
);

GRANT SELECT ON public.role_capabilities TO authenticated;
GRANT ALL ON public.role_capabilities TO service_role;
ALTER TABLE public.role_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read capabilities" ON public.role_capabilities;
CREATE POLICY "Authenticated can read capabilities" ON public.role_capabilities
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Super admin manages capabilities" ON public.role_capabilities;
CREATE POLICY "Super admin manages capabilities" ON public.role_capabilities
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

INSERT INTO public.role_capabilities (role, capability) VALUES
  ('manager','manage.ops'),
  ('manager','manage.core'),
  ('general_manager','manage.ops'),
  ('general_manager','manage.core'),
  ('general_manager','manage.finance'),
  ('general_manager','view.all_casinos'),
  ('shift_manager','manage.ops'),
  ('finance_manager','manage.finance'),
  ('finance_manager','view.all_casinos'),
  ('super_admin','manage.ops'),
  ('super_admin','manage.core'),
  ('super_admin','manage.finance'),
  ('super_admin','view.all_casinos'),
  ('super_admin','manage.roles'),
  ('boss','view.all_casinos')
ON CONFLICT DO NOTHING;

-- 5) Capability check helpers
CREATE OR REPLACE FUNCTION public.has_cap(_uid uuid, _cap text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_capabilities rc ON rc.role = ur.role
    WHERE ur.user_id = _uid AND rc.capability = _cap
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_manage(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$ SELECT public.has_cap(_uid, 'manage.core'); $function$;

CREATE OR REPLACE FUNCTION public.can_finance(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$ SELECT public.has_cap(_uid, 'manage.finance'); $function$;

CREATE OR REPLACE FUNCTION public.can_view_all_casinos(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$ SELECT public.has_cap(_uid, 'view.all_casinos'); $function$;

GRANT EXECUTE ON FUNCTION public.has_cap(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_finance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_all_casinos(uuid) TO authenticated;