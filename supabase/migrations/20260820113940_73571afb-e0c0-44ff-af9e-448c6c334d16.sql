CREATE OR REPLACE FUNCTION public.ace_create_install_token(_casino_id uuid)
 RETURNS TABLE(token text, casino_id uuid, casino_slug text, casino_name text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_slug text;
  v_name text;
  v_token text;
  v_exp timestamptz;
BEGIN
  IF NOT public.ace_is_collector_admin() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT lower(coalesce(c.slug, c.code)), c.name
    INTO v_slug, v_name
    FROM public.casinos c
   WHERE c.id = _casino_id;

  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'casino_not_found';
  END IF;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_exp := now() + interval '30 minutes';

  INSERT INTO public.ace_collector_installs
    (token_sha256, casino_id, casino_slug, created_by, expires_at)
  VALUES
    (encode(extensions.digest(v_token, 'sha256'), 'hex'), _casino_id, v_slug, auth.uid(), v_exp);

  RETURN QUERY SELECT v_token, _casino_id, v_slug, v_name, v_exp;
END;
$function$;