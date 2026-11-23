ALTER TABLE public.management_rota DROP CONSTRAINT management_rota_shift_check;
ALTER TABLE public.management_rota ADD CONSTRAINT management_rota_shift_check CHECK (shift ~ '^[A-Z0-9]{1,4}$');