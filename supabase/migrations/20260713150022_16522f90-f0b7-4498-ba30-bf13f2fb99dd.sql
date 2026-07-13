CREATE POLICY "Boss sees all shifts"
  ON public.shifts FOR SELECT
  USING (has_role(auth.uid(), 'boss'::app_role));

DROP POLICY IF EXISTS "fdc_read" ON public.fin_day_closing;
CREATE POLICY "fdc_read"
  ON public.fin_day_closing FOR SELECT
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
    OR has_role(auth.uid(), 'boss'::app_role)
    OR (casino_id = get_user_casino_id(auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.cs_can_view(_casino uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (_casino = public.get_user_casino_id(auth.uid()))
     AND (
       public.has_role(auth.uid(),'cashier_slots'::public.app_role)
       OR public.has_role(auth.uid(),'manager'::public.app_role)
       OR public.has_role(auth.uid(),'shift_manager'::public.app_role)
       OR public.has_role(auth.uid(),'finance_manager'::public.app_role)
       OR public.has_role(auth.uid(),'surveillance'::public.app_role)
       OR public.has_role(auth.uid(),'pit'::public.app_role)
     )
  OR public.has_role(auth.uid(),'super_admin'::public.app_role)
  OR public.has_role(auth.uid(),'boss'::public.app_role)
$function$;

CREATE POLICY "Boss sees all staff_rota"
  ON public.staff_rota FOR SELECT
  USING (has_role(auth.uid(), 'boss'::app_role));

CREATE POLICY "Boss sees all pit_rota"
  ON public.pit_rota FOR SELECT
  USING (has_role(auth.uid(), 'boss'::app_role));

CREATE POLICY "Boss sees all incidents"
  ON public.incidents FOR SELECT
  USING (has_role(auth.uid(), 'boss'::app_role));

CREATE POLICY "Boss sees all breaklist"
  ON public.breaklist FOR SELECT
  USING (has_role(auth.uid(), 'boss'::app_role));