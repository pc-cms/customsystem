
-- Multi-casino read access for tables used by the Table Check / Chip Check screens.
-- Existing per-casino policies are kept; these additive permissive policies
-- extend SELECT to every casino the user is a member of via user_casino_access.

CREATE POLICY "Multi-casino users see table tracker"
ON public.table_tracker FOR SELECT
USING (public.user_has_casino_access(auth.uid(), casino_id));

CREATE POLICY "Multi-casino users see table head count"
ON public.table_head_count FOR SELECT
USING (public.user_has_casino_access(auth.uid(), casino_id));

CREATE POLICY "Multi-casino users see chip snapshots"
ON public.chip_snapshots FOR SELECT
USING (public.user_has_casino_access(auth.uid(), casino_id));

CREATE POLICY "Multi-casino users see chip baseline"
ON public.chip_baseline FOR SELECT
USING (public.user_has_casino_access(auth.uid(), casino_id));

CREATE POLICY "Multi-casino users see chip color settings"
ON public.chip_color_settings FOR SELECT
USING (public.user_has_casino_access(auth.uid(), casino_id));

CREATE POLICY "Multi-casino users see gaming tables"
ON public.gaming_tables FOR SELECT
USING (public.user_has_casino_access(auth.uid(), casino_id));
