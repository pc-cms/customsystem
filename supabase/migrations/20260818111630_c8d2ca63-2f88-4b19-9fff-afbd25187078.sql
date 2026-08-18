CREATE TABLE IF NOT EXISTS public.ace_collector_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_sha256 text NOT NULL UNIQUE,
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  casino_slug text NOT NULL,
  created_by uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  used_at timestamptz,
  used_hostname text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ace_collector_installs TO service_role;
ALTER TABLE public.ace_collector_installs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ace_collector_installs service only"
  ON public.ace_collector_installs FOR ALL
  USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS ace_collector_installs_casino_idx ON public.ace_collector_installs(casino_id);

-- helper: admin gate
CREATE OR REPLACE FUNCTION public.ace_is_collector_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'super_admin'::app_role);
$$;

-- create one-time install token (returns RAW token once)
CREATE OR REPLACE FUNCTION public.ace_create_install_token(_casino_id uuid)
RETURNS TABLE (token text, casino_id uuid, casino_slug text, casino_name text, expires_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_slug text; v_name text; v_token text; v_exp timestamptz;
BEGIN
  IF NOT public.ace_is_collector_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT lower(coalesce(c.slug, c.code)), c.name INTO v_slug, v_name FROM public.casinos c WHERE c.id = _casino_id;
  IF v_slug IS NULL THEN RAISE EXCEPTION 'casino_not_found'; END IF;

  v_token := encode(gen_random_bytes(24), 'hex');
  v_exp := now() + interval '30 minutes';

  INSERT INTO public.ace_collector_installs (token_sha256, casino_id, casino_slug, created_by, expires_at)
  VALUES (encode(digest(v_token, 'sha256'), 'hex'), _casino_id, v_slug, auth.uid(), v_exp);

  RETURN QUERY SELECT v_token, _casino_id, v_slug, v_name, v_exp;
END;
$$;

REVOKE ALL ON FUNCTION public.ace_create_install_token(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ace_create_install_token(uuid) TO authenticated;

-- admin list of collectors (no key material exposed)
CREATE OR REPLACE FUNCTION public.ace_admin_list_collectors()
RETURNS TABLE (
  id uuid, location_code text, display_name text, casino_id uuid, casino_name text,
  is_active boolean, last_seen_at timestamptz, last_live_at timestamptz, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.ace_is_collector_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY
  SELECT k.id, k.location_code, k.display_name, k.casino_id, c.name,
         k.is_active, k.last_seen_at,
         (SELECT s.received_at FROM public.ace_finance_snapshots s
           WHERE s.location_code = k.location_code AND s.period_id = 0
           ORDER BY s.received_at DESC LIMIT 1),
         k.created_at
  FROM public.ace_ingest_keys k
  LEFT JOIN public.casinos c ON c.id = k.casino_id
  ORDER BY coalesce(c.name, k.location_code);
END;
$$;
REVOKE ALL ON FUNCTION public.ace_admin_list_collectors() FROM public;
GRANT EXECUTE ON FUNCTION public.ace_admin_list_collectors() TO authenticated;

CREATE OR REPLACE FUNCTION public.ace_admin_set_collector_active(_id uuid, _active boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.ace_is_collector_admin() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  UPDATE public.ace_ingest_keys SET is_active = _active, updated_at = now() WHERE id = _id;
END;
$$;
REVOKE ALL ON FUNCTION public.ace_admin_set_collector_active(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.ace_admin_set_collector_active(uuid, boolean) TO authenticated;