CREATE OR REPLACE FUNCTION public.tg_block_virtual_visit_checkout()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only direct API updates from the app (role anon/authenticated, not nested in
  -- another trigger) are blocked. SECURITY DEFINER system functions (day close,
  -- rollover crons) run as their owner and pass through.
  IF OLD.checked_out_at IS NULL
     AND NEW.checked_out_at IS NOT NULL
     AND current_user IN ('authenticated', 'anon')
     AND pg_trigger_depth() <= 1
     AND EXISTS (
       SELECT 1 FROM public.players p
       WHERE p.id = NEW.player_id AND p.category = 'casino'::player_category
     )
  THEN
    RAISE EXCEPTION 'Virtual account visits close automatically at the business-day rollover';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_virtual_visit_checkout ON public.casino_visits;
CREATE TRIGGER trg_block_virtual_visit_checkout
BEFORE UPDATE ON public.casino_visits
FOR EACH ROW EXECUTE FUNCTION public.tg_block_virtual_visit_checkout();