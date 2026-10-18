CREATE OR REPLACE FUNCTION public.tg_activity_log_float_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF OLD.float_locked IS DISTINCT FROM NEW.float_locked THEN
  INSERT INTO public.activity_logs(casino_id,category,action,operator_id,details)
  VALUES(NEW.id,'system'::public.log_category,CASE WHEN NEW.float_locked THEN 'FLOAT_LOCKED' ELSE 'FLOAT_UNLOCKED' END,auth.uid(),jsonb_build_object('old_locked',OLD.float_locked,'new_locked',NEW.float_locked));
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_activity_log_float_lock() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER tg_activity_log_float_lock AFTER UPDATE OF float_locked ON public.casinos FOR EACH ROW EXECUTE FUNCTION public.tg_activity_log_float_lock();