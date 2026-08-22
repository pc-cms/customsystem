CREATE OR REPLACE FUNCTION public.cashless_protect_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _merging boolean := coalesce(current_setting('app.merge_in_progress', true), '') = 'on';
BEGIN
  IF NEW.casino_id <> OLD.casino_id
     OR NEW.business_date <> OLD.business_date
     OR NEW.direction <> OLD.direction
     OR NEW.provider <> OLD.provider
     OR (NOT _merging AND COALESCE(NEW.player_id::text,'') <> COALESCE(OLD.player_id::text,''))
     OR NEW.amount <> OLD.amount
     OR NEW.currency <> OLD.currency
     OR NEW.operator_id <> OLD.operator_id
     OR NEW.created_at <> OLD.created_at
  THEN
    RAISE EXCEPTION 'Cashless transactions are immutable';
  END IF;

  IF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    RAISE EXCEPTION 'Approved cashless transactions cannot be reverted';
  END IF;

  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    NEW.approved_by := COALESCE(NEW.approved_by, auth.uid());
    NEW.approved_at := COALESCE(NEW.approved_at, now());
  END IF;

  RETURN NEW;
END;
$function$;

DO $mig$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname='merge_players' AND pronamespace='public'::regnamespace;
  d := replace(d, '  -- Reassign player_cards', '  PERFORM set_config(''app.merge_in_progress'', ''on'', true);

  -- Reassign player_cards');
  EXECUTE d;
END
$mig$;