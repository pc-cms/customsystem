
CREATE OR REPLACE FUNCTION public.chip_snapshots_latest(_casino_id uuid, _date date)
RETURNS SETOF public.chip_snapshots
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (location_type, location_id, denomination) *
  FROM public.chip_snapshots
  WHERE casino_id = _casino_id
    AND date = _date
  ORDER BY location_type, location_id, denomination, created_at DESC, id DESC
$$;

GRANT EXECUTE ON FUNCTION public.chip_snapshots_latest(uuid, date) TO authenticated, service_role;
