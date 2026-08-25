CREATE OR REPLACE FUNCTION public.fin_jp_delete_entry(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.fin_other_incomes%ROWTYPE;
  v_original_id uuid;
BEGIN
  SELECT * INTO v_row
  FROM public.fin_other_incomes
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JP entry not found';
  END IF;

  IF v_row.source IS DISTINCT FROM 'jp' THEN
    RAISE EXCEPTION 'Only JP entries can be deleted here';
  END IF;

  v_original_id := COALESCE(v_row.reverses_id, v_row.id);

  DELETE FROM public.fin_other_incomes
  WHERE source = 'jp'
    AND reverses_id = v_original_id;

  DELETE FROM public.fin_other_incomes
  WHERE id = v_original_id
    AND source = 'jp';
END
$function$;

REVOKE ALL ON FUNCTION public.fin_jp_delete_entry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_jp_delete_entry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_jp_delete_entry(uuid) TO service_role;