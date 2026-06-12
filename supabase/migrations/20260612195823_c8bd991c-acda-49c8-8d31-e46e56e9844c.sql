CREATE OR REPLACE FUNCTION public.trg_shifts_recompute_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v jsonb;
BEGIN
  IF NEW.status = 'closed' AND NEW.closing_count IS NOT NULL THEN
    NEW.miss_total := public.shift_miss_total_from_closing_count(NEW.closing_count);
  END IF;

  v := public.compute_shift_balance_from_row(NEW);
  NEW.cash_desk_result := COALESCE((v->>'cash_desk_result')::bigint, 0);
  NEW.balance := COALESCE((v->>'shift_balance')::bigint, 0);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS shifts_recompute_balance ON public.shifts;
CREATE TRIGGER shifts_recompute_balance
BEFORE INSERT OR UPDATE OF status, opening_float, closing_count, closing_cash, miss_total, tables_result, cashless_in_providers, cashless_out_providers
ON public.shifts
FOR EACH ROW
EXECUTE FUNCTION public.trg_shifts_recompute_balance();

CREATE OR REPLACE FUNCTION public.trg_persist_slots_shift_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  j jsonb;
BEGIN
  IF (TG_OP = 'INSERT')
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.system_shift_result IS DISTINCT FROM OLD.system_shift_result
     OR NEW.ace_fills IS DISTINCT FROM OLD.ace_fills
     OR NEW.cashless_in_providers IS DISTINCT FROM OLD.cashless_in_providers
     OR NEW.cashless_out_providers IS DISTINCT FROM OLD.cashless_out_providers
     OR NEW.cashless_final IS DISTINCT FROM OLD.cashless_final
     OR NEW.cashless_final_providers IS DISTINCT FROM OLD.cashless_final_providers THEN

    IF NEW.status IN ('ready_for_review', 'approved', 'closed') THEN
      j := public.compute_slots_shift_balance_from_row(NEW);
      NEW.cash_desk_result   := (j->>'cash_desk_result')::bigint;
      NEW.cards_miss         := (j->>'cards_miss')::bigint;
      NEW.slots_result       := (j->>'slots_result')::bigint;
      NEW.balance            := (j->>'shift_balance')::bigint;
      NEW.actual_cage_result := (j->>'cash_desk_result')::bigint;
      NEW.difference_amount  := (j->>'cash_desk_result')::bigint;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;