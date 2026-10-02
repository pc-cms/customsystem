CREATE OR REPLACE FUNCTION public.tg_shift_codes_extend_pit_enum()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.code !~ '^[A-Z0-9]{1,4}$' THEN
    RAISE EXCEPTION 'Code must be 1-4 letters or digits';
  END IF;
  IF NEW.department = 'pit' THEN
    EXECUTE format('ALTER TYPE public.shift_type ADD VALUE IF NOT EXISTS %L', NEW.code);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_codes_extend_pit_enum ON public.shift_codes;
CREATE TRIGGER trg_shift_codes_extend_pit_enum
BEFORE INSERT OR UPDATE OF code, department ON public.shift_codes
FOR EACH ROW EXECUTE FUNCTION public.tg_shift_codes_extend_pit_enum();