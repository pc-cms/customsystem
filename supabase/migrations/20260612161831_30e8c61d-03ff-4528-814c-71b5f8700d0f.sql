
-- Helper predicate: roles allowed to view photos network-wide
-- Reception / Floor Manager / Manager / Finance / Super / Surveillance / Account Manager

-- ─── player-photos ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Scoped select player photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users select player photos" ON storage.objects;

CREATE POLICY "Role-gated cross-casino select player photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'player-photos'
  AND (
       has_role(auth.uid(), 'reception'::app_role)
    OR has_role(auth.uid(), 'floor_manager'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'surveillance'::app_role)
    OR has_role(auth.uid(), 'account_manager'::app_role)
  )
);

-- ─── employee-photos ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view employee photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users select employee photos" ON storage.objects;
DROP POLICY IF EXISTS "Scoped select employee photos" ON storage.objects;

CREATE POLICY "Role-gated cross-casino select employee photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'employee-photos'
  AND (
       has_role(auth.uid(), 'reception'::app_role)
    OR has_role(auth.uid(), 'floor_manager'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'surveillance'::app_role)
    OR has_role(auth.uid(), 'hr'::app_role)
    OR has_role(auth.uid(), 'account_manager'::app_role)
  )
);

-- ─── incident-photos ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can view incident photos" ON storage.objects;
DROP POLICY IF EXISTS "Scoped select incident photos" ON storage.objects;

CREATE POLICY "Role-gated cross-casino select incident photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'incident-photos'
  AND (
       has_role(auth.uid(), 'reception'::app_role)
    OR has_role(auth.uid(), 'floor_manager'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'surveillance'::app_role)
    OR has_role(auth.uid(), 'account_manager'::app_role)
  )
);
