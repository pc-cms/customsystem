-- Pit Book — shift handover log (two channels: pit_bosses, managers)
CREATE TABLE public.pit_book_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL REFERENCES public.casinos(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  channel text NOT NULL CHECK (channel IN ('pit_bosses','managers')),
  author_id uuid NOT NULL,
  author_name text NOT NULL,
  author_role text NOT NULL,
  body text NOT NULL CHECK (length(btrim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pit_book_entries_lookup_idx
  ON public.pit_book_entries (casino_id, channel, business_date, created_at);

GRANT SELECT, INSERT ON public.pit_book_entries TO authenticated;
GRANT ALL ON public.pit_book_entries TO service_role;

ALTER TABLE public.pit_book_entries ENABLE ROW LEVEL SECURITY;

-- READ: pit, shift_manager, manager, surveillance, super_admin within their casinos
CREATE POLICY "pit_book read"
  ON public.pit_book_entries FOR SELECT
  TO authenticated
  USING (
    (
      public.has_role(auth.uid(), 'pit'::app_role)
      OR public.has_role(auth.uid(), 'shift_manager'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'surveillance'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
    AND EXISTS (
      SELECT 1 FROM public.user_casino_access uca
      WHERE uca.user_id = auth.uid() AND uca.casino_id = pit_book_entries.casino_id
    )
  );

-- WRITE: pit, shift_manager, manager, super_admin within their casinos; must be own author_id
CREATE POLICY "pit_book write"
  ON public.pit_book_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      public.has_role(auth.uid(), 'pit'::app_role)
      OR public.has_role(auth.uid(), 'shift_manager'::app_role)
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    )
    AND EXISTS (
      SELECT 1 FROM public.user_casino_access uca
      WHERE uca.user_id = auth.uid() AND uca.casino_id = pit_book_entries.casino_id
    )
  );

-- Immutable: no UPDATE / DELETE policies. Corrections via new entries.

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.pit_book_entries;