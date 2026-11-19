CREATE TABLE public.table_game_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  legacy_games text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE UNIQUE INDEX table_game_types_code_uniq ON public.table_game_types (upper(btrim(code)));
CREATE UNIQUE INDEX table_game_types_label_uniq ON public.table_game_types (lower(btrim(label)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_game_types TO authenticated;
GRANT ALL ON public.table_game_types TO service_role;
ALTER TABLE public.table_game_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "game types readable by staff" ON public.table_game_types
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "game types managed by managers" ON public.table_game_types
  FOR INSERT TO authenticated WITH CHECK (
    public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'finance_manager') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "game types updated by managers" ON public.table_game_types
  FOR UPDATE TO authenticated USING (
    public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'finance_manager') OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "game types deleted when unused" ON public.table_game_types
  FOR DELETE TO authenticated USING (
    (public.has_role(auth.uid(),'manager') OR public.has_role(auth.uid(),'finance_manager') OR public.has_role(auth.uid(),'super_admin'))
    AND NOT EXISTS (SELECT 1 FROM public.gaming_tables g WHERE g.game = table_game_types.label OR g.game = ANY(table_game_types.legacy_games)));

INSERT INTO public.table_game_types (code, label, sort_order, legacy_games) VALUES
  ('AR','American Roulette',10,'{"European Roulette"}'),
  ('PK','Poker',20,'{"Texas Holdem","Omaha","PLO"}'),
  ('BJ','Blackjack',30,'{}'),
  ('NIU','Niu Niu',40,'{}'),
  ('BAC','Baccarat',50,'{}'),
  ('CLUB','Club Poker',60,'{}');