DROP POLICY IF EXISTS "Authenticated users select player photos" ON storage.objects;

CREATE POLICY "Scoped select player photos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'player-photos'
  AND (
    (storage.foldername(name))[1] = (
      SELECT (profiles.casino_id)::text
      FROM profiles
      WHERE profiles.user_id = auth.uid()
      LIMIT 1
    )
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
    OR has_role(auth.uid(), 'account_manager'::app_role)
  )
);