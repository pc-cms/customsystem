
CREATE TABLE public.cloud_clone_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL,
  casino_id uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  chunk_count int NOT NULL,
  rows_by_table jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_path text,
  status text NOT NULL DEFAULT 'uploaded',
  notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cloud_clone_uploads_node_idx ON public.cloud_clone_uploads(node_id, uploaded_at DESC);
GRANT SELECT ON public.cloud_clone_uploads TO authenticated;
GRANT ALL ON public.cloud_clone_uploads TO service_role;
ALTER TABLE public.cloud_clone_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin reads clone uploads" ON public.cloud_clone_uploads
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "service_role manages clone uploads" ON public.cloud_clone_uploads
  FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.cloud_clone_uploads;

CREATE TABLE public.cloud_clone_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES public.cloud_clone_uploads(id) ON DELETE CASCADE,
  node_id uuid NOT NULL,
  ran_at timestamptz NOT NULL DEFAULT now(),
  overall text NOT NULL DEFAULT 'pending',
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  regressions int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cloud_clone_reports_node_idx ON public.cloud_clone_reports(node_id, ran_at DESC);
GRANT SELECT ON public.cloud_clone_reports TO authenticated;
GRANT ALL ON public.cloud_clone_reports TO service_role;
ALTER TABLE public.cloud_clone_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin reads clone reports" ON public.cloud_clone_reports
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "service_role manages clone reports" ON public.cloud_clone_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.cloud_clone_reports;
