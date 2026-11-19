CREATE OR REPLACE FUNCTION public.activity_logs_purge(p_days integer DEFAULT 60)
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_deleted bigint;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Only Super Admin can purge activity logs' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.activity_logs WHERE created_at < now() - make_interval(days => p_days);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.activity_logs_purge(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activity_logs_purge(integer) TO authenticated, service_role;