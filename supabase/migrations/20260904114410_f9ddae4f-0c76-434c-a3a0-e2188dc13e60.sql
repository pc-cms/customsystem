ALTER TABLE public.fin_categories
  ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'expense';

ALTER TABLE public.fin_categories
  DROP CONSTRAINT IF EXISTS fin_categories_bucket_check;

ALTER TABLE public.fin_categories
  ADD CONSTRAINT fin_categories_bucket_check
  CHECK (bucket IN ('expense','collection','capex','transfer'));

UPDATE public.fin_categories SET bucket = CASE
  WHEN name ILIKE '%capex%' THEN 'capex'
  WHEN name ILIKE '%transfer%' OR name ILIKE '%money change%' THEN 'transfer'
  WHEN COALESCE(group_code,'') ILIKE '%collection%' OR name ILIKE '%collection%' THEN 'collection'
  ELSE 'expense'
END;
