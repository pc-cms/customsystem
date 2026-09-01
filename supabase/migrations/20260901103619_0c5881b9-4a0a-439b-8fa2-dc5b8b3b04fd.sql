-- Guard: target accounting month must not be closed (opening is checked by
-- fin_assert_month_started where required; here we only block closed months so
-- backdated posting into open past months stays possible).
CREATE OR REPLACE FUNCTION public.fin_assert_month_not_closed(p_casino_id uuid, p_date date)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.fin_month_opening_status(
       p_casino_id,
       EXTRACT(YEAR FROM p_date)::int,
       EXTRACT(MONTH FROM p_date)::int) = 'closed' THEN
    RAISE EXCEPTION 'Month %-% is closed for this casino',
      EXTRACT(MONTH FROM p_date)::int, EXTRACT(YEAR FROM p_date)::int;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.fin_assert_month_not_closed(uuid, date) TO authenticated;

-- Other incomes / JP / Tips: block posting into a closed month.
CREATE OR REPLACE FUNCTION public.tg_fin_other_incomes_month_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.fin_assert_month_not_closed(NEW.casino_id, NEW.business_date);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS fin_other_incomes_month_guard ON public.fin_other_incomes;
CREATE TRIGGER fin_other_incomes_month_guard
BEFORE INSERT OR UPDATE OF business_date, casino_id ON public.fin_other_incomes
FOR EACH ROW EXECUTE FUNCTION public.tg_fin_other_incomes_month_guard();

-- Inter-casino transfers: both sides must be in a non-closed month.
CREATE OR REPLACE FUNCTION public.tg_fin_inter_casino_month_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.fin_assert_month_not_closed(NEW.from_casino_id, NEW.business_date);
  PERFORM public.fin_assert_month_not_closed(NEW.to_casino_id, NEW.business_date);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS fin_inter_casino_month_guard ON public.fin_inter_casino_transfers;
CREATE TRIGGER fin_inter_casino_month_guard
BEFORE INSERT OR UPDATE OF business_date ON public.fin_inter_casino_transfers
FOR EACH ROW EXECUTE FUNCTION public.tg_fin_inter_casino_month_guard();