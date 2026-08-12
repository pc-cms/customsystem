CREATE TABLE IF NOT EXISTS public.fin_main_categories (
  code text PRIMARY KEY,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fin_main_categories TO authenticated;
GRANT ALL ON public.fin_main_categories TO service_role;

ALTER TABLE public.fin_main_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "main_categories_read" ON public.fin_main_categories
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.fin_main_categories (code, label, sort_order) VALUES
  ('taxes','Taxes',10),
  ('rent','Rent',20),
  ('rent_equipment','Rent Equipment',30),
  ('service','Service',40),
  ('licences','Licences',50),
  ('visa_permits','Visa & Permits',60),
  ('transport','Transport',70),
  ('salary','Salary',80),
  ('utilities','Utilitys',90),
  ('bar','Bar',100),
  ('stationary','Stationary',110),
  ('capex','CAPEX',120),
  ('marketing','Marketing',130),
  ('repair','Repair',140),
  ('bonus','Bonus',150),
  ('corporate','Corporate',160),
  ('fees','Fees',170)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.fin_categories
  ADD COLUMN IF NOT EXISTS main_code text REFERENCES public.fin_main_categories(code);

UPDATE public.fin_categories SET main_code = CASE
  WHEN name ILIKE '%CAPEX%' THEN 'capex'
  WHEN name ILIKE '%EGT%' OR name ILIKE '%Novomatic%' OR name ILIKE '%Server rent%' OR name ILIKE '%machine rent%' THEN 'rent_equipment'
  WHEN name ILIKE '%Rent%' THEN 'rent'
  WHEN name ILIKE '%permit%' OR name ILIKE '%visa%' OR name ILIKE '%ticket%' THEN 'visa_permits'
  WHEN name ILIKE '%licence%' OR name ILIKE '%license%' OR name ILIKE '%COSOTA%' OR name ILIKE '%Fire%' THEN 'licences'
  WHEN name ILIKE '%tax%' OR name ILIKE '%VAT%' OR name ILIKE '%PAYE%' OR name ILIKE '%SDL%' OR name ILIKE '%NSSF%' OR name ILIKE '%WCF%' THEN 'taxes'
  WHEN name ILIKE '%petrol%' OR name ILIKE '%fuel%' OR name ILIKE '%taxi%' OR name ILIKE '%transport%' OR name ILIKE '%driver%' OR name ILIKE '%car%' OR name ILIKE '%flight%' THEN 'transport'
  WHEN name ILIKE '%salary%' OR name ILIKE '%wage%' OR name ILIKE '%payroll%' OR name ILIKE '%staff cost%' THEN 'salary'
  WHEN name ILIKE '%bonus%' THEN 'bonus'
  WHEN name ILIKE '%internet%' OR name ILIKE '%DSTV%' OR name ILIKE '%water%' OR name ILIKE '%electric%' OR name ILIKE '%luku%' OR name ILIKE '%utilit%' OR name ILIKE '%phone%' OR name ILIKE '%generator%' THEN 'utilities'
  WHEN name ILIKE '%bar%' OR name ILIKE '%food%' OR name ILIKE '%alcohol%' OR name ILIKE '%drink%' OR name ILIKE '%kitchen%' THEN 'bar'
  WHEN name ILIKE '%station%' OR name ILIKE '%office supp%' OR name ILIKE '%print%' OR name ILIKE '%paper%' THEN 'stationary'
  WHEN name ILIKE '%market%' OR name ILIKE '%advert%' OR name ILIKE '%promo%' OR name ILIKE '%lottery%' OR name ILIKE '%sponsor%' THEN 'marketing'
  WHEN name ILIKE '%repair%' OR name ILIKE '%maintenance%' OR name ILIKE '%spare%' OR name ILIKE '%part%' THEN 'repair'
  WHEN name ILIKE '%service%' OR name ILIKE '%security%' OR name ILIKE '%clean%' OR name ILIKE '%OSHA%' OR name ILIKE '%medical%' THEN 'service'
  WHEN name ILIKE '%audit%' OR name ILIKE '%lawyer%' OR name ILIKE '%fee%' OR name ILIKE '%levy%' OR name ILIKE '%bank charge%' THEN 'fees'
  WHEN name ILIKE '%corporate%' OR name ILIKE '%director%' OR name ILIKE '%head office%' THEN 'corporate'
  ELSE NULL
END
WHERE is_income = false;