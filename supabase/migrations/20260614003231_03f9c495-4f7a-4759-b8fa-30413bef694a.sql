
CREATE TABLE public.player_daily_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  zone text NOT NULL CHECK (zone IN ('S','LG','CP')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, player_id, business_date)
);

CREATE INDEX player_daily_zones_casino_date_idx ON public.player_daily_zones (casino_id, business_date);
CREATE INDEX player_daily_zones_player_idx ON public.player_daily_zones (player_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_daily_zones TO authenticated;
GRANT ALL ON public.player_daily_zones TO service_role;

ALTER TABLE public.player_daily_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "zones_select_authenticated"
  ON public.player_daily_zones FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "zones_write_ops_roles"
  ON public.player_daily_zones FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'pit'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'shift_manager'::app_role)
    OR public.has_role(auth.uid(), 'reception'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "zones_update_ops_roles"
  ON public.player_daily_zones FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'pit'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'shift_manager'::app_role)
    OR public.has_role(auth.uid(), 'reception'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'pit'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'shift_manager'::app_role)
    OR public.has_role(auth.uid(), 'reception'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "zones_delete_ops_roles"
  ON public.player_daily_zones FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'pit'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'shift_manager'::app_role)
    OR public.has_role(auth.uid(), 'reception'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE TRIGGER update_player_daily_zones_updated_at
  BEFORE UPDATE ON public.player_daily_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
