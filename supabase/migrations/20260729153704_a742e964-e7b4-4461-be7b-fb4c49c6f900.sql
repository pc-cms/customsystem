CREATE TABLE public.fin_legacy_balance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  rate_usd numeric NOT NULL DEFAULT 0,
  casino_result numeric NOT NULL DEFAULT 0,
  cash_desk_result numeric NOT NULL DEFAULT 0,
  tables_result numeric NOT NULL DEFAULT 0,
  slots_result numeric NOT NULL DEFAULT 0,
  stadt_result numeric NOT NULL DEFAULT 0,
  bar_result numeric NOT NULL DEFAULT 0,
  cage_cash numeric NOT NULL DEFAULT 0,
  collection_bank numeric NOT NULL DEFAULT 0,
  chip_difference numeric NOT NULL DEFAULT 0,
  tips_tables numeric NOT NULL DEFAULT 0,
  tips_slots numeric NOT NULL DEFAULT 0,
  office_cash numeric NOT NULL DEFAULT 0,
  office_transfer numeric NOT NULL DEFAULT 0,
  office_in numeric NOT NULL DEFAULT 0,
  office_out numeric NOT NULL DEFAULT 0,
  cage2_cash numeric NOT NULL DEFAULT 0,
  bank_terminal numeric NOT NULL DEFAULT 0,
  bank_fee_pct numeric NOT NULL DEFAULT 0,
  bank_account numeric NOT NULL DEFAULT 0,
  bank_expenses numeric NOT NULL DEFAULT 0,
  credit_deposit numeric NOT NULL DEFAULT 0,
  expenses numeric NOT NULL DEFAULT 0,
  chips_float numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'import',
  source_file text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, business_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_legacy_balance TO authenticated;
GRANT ALL ON public.fin_legacy_balance TO service_role;

ALTER TABLE public.fin_legacy_balance ENABLE ROW LEVEL SECURITY;

CREATE POLICY flb_read ON public.fin_legacy_balance
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR can_finance(auth.uid())
  OR has_role(auth.uid(), 'boss'::app_role)
  OR (casino_id = get_user_casino_id(auth.uid()))
);

CREATE POLICY flb_write ON public.fin_legacy_balance
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (can_finance(auth.uid()) AND casino_id = get_user_casino_id(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (can_finance(auth.uid()) AND casino_id = get_user_casino_id(auth.uid()))
);

CREATE TRIGGER flb_updated_at BEFORE UPDATE ON public.fin_legacy_balance
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();