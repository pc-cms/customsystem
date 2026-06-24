-- Trigger: auto-set zone='LG' for a player on the transaction's business_date
-- whenever they make their first movement that day and no zone is set yet.
CREATE OR REPLACE FUNCTION public.tg_autoset_zone_lg_from_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only consider real movements
  IF NEW.type NOT IN ('buy','cashout','in','out') THEN
    RETURN NEW;
  END IF;
  IF NEW.player_id IS NULL OR NEW.business_date IS NULL OR NEW.casino_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.player_daily_zones (casino_id, player_id, business_date, zone, created_by, updated_by)
  VALUES (NEW.casino_id, NEW.player_id, NEW.business_date, 'LG', NEW.operator_id, NEW.operator_id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_autoset_zone_lg_from_tx ON public.transactions;
CREATE TRIGGER tg_autoset_zone_lg_from_tx
AFTER INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.tg_autoset_zone_lg_from_tx();