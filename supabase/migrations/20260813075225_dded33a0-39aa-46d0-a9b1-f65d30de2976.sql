ALTER TABLE public.business_day_closures DROP CONSTRAINT IF EXISTS business_day_closures_closed_method_check;
ALTER TABLE public.business_day_closures ADD CONSTRAINT business_day_closures_closed_method_check
  CHECK (closed_method = ANY (ARRAY['manual'::text, 'auto'::text, 'auto_11am'::text, 'auto_0800'::text, 'auto_09am'::text]));