
-- 1. Grant execute on has_role (correct signature)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon, service_role;

-- 2. Allow 'rollback' in fleet_commands.kind
ALTER TABLE public.fleet_commands DROP CONSTRAINT IF EXISTS fleet_commands_kind_check;
ALTER TABLE public.fleet_commands ADD CONSTRAINT fleet_commands_kind_check
  CHECK (kind IN ('reboot','update','license_refresh','custom','rollback'));

-- 3. First-run finish RPC: bootstraps super_admin + completes box_config
CREATE OR REPLACE FUNCTION public.finish_first_run(
  _node_id text,
  _email text,
  _password text,
  _config jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _already_done boolean;
  _new_user_id uuid;
  _existing_admin_count int;
BEGIN
  -- Refuse if setup already complete for this node
  SELECT COALESCE(is_setup_complete, false) INTO _already_done
  FROM public.box_config WHERE node_id = _node_id;
  IF _already_done THEN
    RAISE EXCEPTION 'setup already complete' USING ERRCODE = 'P0001';
  END IF;

  -- Refuse if any super_admin already exists
  SELECT count(*) INTO _existing_admin_count
  FROM public.user_roles WHERE role = 'super_admin';
  IF _existing_admin_count > 0 THEN
    RAISE EXCEPTION 'super_admin already exists on this box' USING ERRCODE = 'P0001';
  END IF;

  -- Create the auth user via auth.users insert (encrypted_password expected as bcrypt).
  -- We store a placeholder marker: the app must call supabase.auth.signUp separately
  -- and pass the returned user_id here. To keep this RPC standalone we accept an
  -- already-created user via _email match if present.
  SELECT id INTO _new_user_id FROM auth.users WHERE email = _email LIMIT 1;
  IF _new_user_id IS NULL THEN
    RAISE EXCEPTION 'auth user must be created first via signUp' USING ERRCODE = 'P0001';
  END IF;

  -- Grant super_admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_new_user_id, 'super_admin')
  ON CONFLICT DO NOTHING;

  -- Upsert box_config
  INSERT INTO public.box_config (node_id, is_setup_complete, casino_slug, casino_name, branding, network, tailscale, cloud_link)
  VALUES (
    _node_id,
    true,
    _config->>'casino_slug',
    _config->>'casino_name',
    COALESCE(_config->'branding', '{}'::jsonb),
    COALESCE(_config->'network', '{}'::jsonb),
    COALESCE(_config->'tailscale', '{}'::jsonb),
    COALESCE(_config->'cloud_link', '{}'::jsonb)
  )
  ON CONFLICT (node_id) DO UPDATE SET
    is_setup_complete = true,
    casino_slug = EXCLUDED.casino_slug,
    casino_name = EXCLUDED.casino_name,
    branding = EXCLUDED.branding,
    network = EXCLUDED.network,
    tailscale = EXCLUDED.tailscale,
    cloud_link = EXCLUDED.cloud_link;

  RETURN jsonb_build_object('ok', true, 'user_id', _new_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.finish_first_run(text, text, text, jsonb) TO anon, authenticated;
