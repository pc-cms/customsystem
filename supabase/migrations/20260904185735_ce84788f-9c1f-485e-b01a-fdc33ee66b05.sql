CREATE OR REPLACE FUNCTION public.tg_unplanned_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(current_setting('cms.fin_rpc', true), '') = '1' THEN RETURN OLD; END IF;
  IF public.has_role(auth.uid(), 'super_admin') THEN RETURN OLD; END IF;
  IF public.can_finance(auth.uid()) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Extra expenses may only be deleted by finance or through the finance functions';
END $function$;