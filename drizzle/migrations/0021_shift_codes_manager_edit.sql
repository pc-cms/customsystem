CREATE OR REPLACE FUNCTION public.can_edit_shift_codes(_uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_uid,'super_admin') OR public.has_role(_uid,'finance_manager')
      OR public.has_role(_uid,'shift_manager') OR public.has_role(_uid,'boss')
      OR public.has_role(_uid,'general_manager') OR public.has_role(_uid,'manager')
$function$;