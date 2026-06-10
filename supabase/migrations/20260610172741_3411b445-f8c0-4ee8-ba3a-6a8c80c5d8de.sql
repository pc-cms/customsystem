-- Create a dedicated secrets table for club account credentials
CREATE TABLE public.club_account_secrets (
  club_account_id UUID PRIMARY KEY REFERENCES public.club_accounts(id) ON DELETE CASCADE,
  password_hash TEXT,
  totp_secret_enc TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Migrate existing secrets from club_accounts
INSERT INTO public.club_account_secrets (club_account_id, password_hash, totp_secret_enc)
SELECT id, password_hash, totp_secret_enc FROM public.club_accounts
WHERE password_hash IS NOT NULL OR totp_secret_enc IS NOT NULL;

-- Enable RLS and lock down: only super_admin + service_role can touch secrets
ALTER TABLE public.club_account_secrets ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.club_account_secrets TO service_role;
GRANT SELECT ON public.club_account_secrets TO authenticated;

CREATE POLICY "super_admin can manage club_account_secrets"
ON public.club_account_secrets FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Drop sensitive columns from the main club_accounts table
ALTER TABLE public.club_accounts DROP COLUMN password_hash;
ALTER TABLE public.club_accounts DROP COLUMN totp_secret_enc;

-- Fix employees: finance_manager scoped to their assigned casino
DROP POLICY IF EXISTS employees_select_payroll_roles ON public.employees;
CREATE POLICY "employees_select_payroll_roles"
ON public.employees FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR (
    public.has_role(auth.uid(), 'finance_manager'::public.app_role)
    AND casino_id = public.get_user_casino_id(auth.uid())
  )
  OR (
    public.has_role(auth.uid(), 'hr'::public.app_role)
    AND casino_id = public.get_user_casino_id(auth.uid())
  )
);

-- Fix employee_bank_accounts: finance_manager scoped to their assigned casino
DROP POLICY IF EXISTS bank_accounts_select ON public.employee_bank_accounts;
CREATE POLICY "bank_accounts_select"
ON public.employee_bank_accounts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = employee_bank_accounts.employee_id
    AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR (
        public.has_role(auth.uid(), 'finance_manager'::public.app_role)
        AND e.casino_id = public.get_user_casino_id(auth.uid())
      )
      OR (
        public.has_role(auth.uid(), 'hr'::public.app_role)
        AND e.casino_id = public.get_user_casino_id(auth.uid())
      )
    )
  )
);