CREATE OR REPLACE FUNCTION public.prevent_transaction_modify()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.seed_mode', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF current_setting('app.hr_unlink_employee', true) = '1'
     AND TG_TABLE_NAME = 'breaklist_logs' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Transactions are immutable and cannot be modified or deleted';
  END IF;
  -- Player merge: allow ONLY reassigning player_id.
  IF TG_OP = 'UPDATE'
     AND current_setting('app.merge_in_progress', true) = 'on'
     AND (to_jsonb(NEW) - ARRAY['player_id']) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['player_id'])
  THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND current_setting('app.hr_unlink_employee', true) = '1'
     AND TG_TABLE_NAME = 'transactions'
     AND NEW.tips_recipient_employee_id IS NULL
     AND OLD.tips_recipient_employee_id IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['tips_recipient_employee_id']) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['tips_recipient_employee_id'])
  THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['cancelled_at','cancelled_by','cancel_reason']) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['cancelled_at','cancelled_by','cancel_reason'])
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Transactions are immutable and cannot be modified or deleted';
END;
$function$;