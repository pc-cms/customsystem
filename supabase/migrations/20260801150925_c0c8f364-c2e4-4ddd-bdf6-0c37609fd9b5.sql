CREATE OR REPLACE FUNCTION public.tg_fin_month_closures_retry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.fin_month_closures
  SET closed_at = NEW.closed_at,
      closed_by = NEW.closed_by,
      collection_total_tzs = NEW.collection_total_tzs,
      collection_total_usd = NEW.collection_total_usd,
      collection_details = NEW.collection_details,
      new_float_details = NEW.new_float_details,
      note = NEW.note
  WHERE casino_id = NEW.casino_id
    AND year = NEW.year
    AND month = NEW.month;

  IF FOUND THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fin_month_closures_retry ON public.fin_month_closures;
CREATE TRIGGER fin_month_closures_retry
BEFORE INSERT ON public.fin_month_closures
FOR EACH ROW
EXECUTE FUNCTION public.tg_fin_month_closures_retry();