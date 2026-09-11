CREATE TABLE public.request_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_at timestamptz NOT NULL,
  module text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  client_id uuid NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  timeout_count integer NOT NULL DEFAULT 0,
  total_duration_ms bigint NOT NULL DEFAULT 0,
  max_duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_metrics_nonnegative CHECK (
    request_count >= 0 AND error_count >= 0 AND timeout_count >= 0
    AND total_duration_ms >= 0 AND max_duration_ms >= 0
  ),
  CONSTRAINT request_metrics_counts_valid CHECK (
    error_count <= request_count AND timeout_count <= request_count
  ),
  CONSTRAINT request_metrics_module_valid CHECK (
    module IN ('Office', 'Finance', 'Cage Live', 'Cage Slots', 'Pit', 'Players', 'POS', 'Dashboard', 'Admin', 'Other')
  ),
  UNIQUE (bucket_at, module, user_id, client_id)
);

GRANT SELECT, INSERT ON public.request_metrics TO authenticated;
GRANT ALL ON public.request_metrics TO service_role;

ALTER TABLE public.request_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own request metrics"
ON public.request_metrics
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Managers view request metrics"
ON public.request_metrics
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'manager'::public.app_role)
  OR public.has_role(auth.uid(), 'finance_manager'::public.app_role)
);

CREATE INDEX request_metrics_bucket_module_idx
ON public.request_metrics (bucket_at DESC, module);

CREATE INDEX request_metrics_created_at_idx
ON public.request_metrics (created_at DESC);