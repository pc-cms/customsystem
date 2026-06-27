
-- 1) Tighten write policy for pit_book_entries
DROP POLICY IF EXISTS "pit_book write" ON public.pit_book_entries;
CREATE POLICY "pit_book write"
ON public.pit_book_entries
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    -- managers/cctv/super_admin/finance_manager: any channel
    (
      (has_role(auth.uid(), 'super_admin'::app_role)
       OR has_role(auth.uid(), 'manager'::app_role)
       OR has_role(auth.uid(), 'shift_manager'::app_role)
       OR has_role(auth.uid(), 'finance_manager'::app_role)
       OR has_role(auth.uid(), 'surveillance'::app_role))
    )
    OR
    -- pit role: only pit_bosses channel
    (has_role(auth.uid(), 'pit'::app_role) AND channel = 'pit_bosses')
  )
  AND (
    EXISTS (SELECT 1 FROM user_casino_access uca
            WHERE uca.user_id = auth.uid() AND uca.casino_id = pit_book_entries.casino_id)
    OR EXISTS (SELECT 1 FROM profiles pr
               WHERE pr.user_id = auth.uid() AND pr.casino_id = pit_book_entries.casino_id)
  )
);

-- 2) Per-user read markers
CREATE TABLE IF NOT EXISTS public.pit_book_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  casino_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('pit_bosses','managers')),
  last_read_entry_id uuid,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, casino_id, channel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pit_book_reads TO authenticated;
GRANT ALL ON public.pit_book_reads TO service_role;

ALTER TABLE public.pit_book_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pit_book_reads owner read"
ON public.pit_book_reads
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "pit_book_reads owner write"
ON public.pit_book_reads
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "pit_book_reads owner update"
ON public.pit_book_reads
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS pit_book_reads_user_casino_idx
  ON public.pit_book_reads (user_id, casino_id, channel);

CREATE INDEX IF NOT EXISTS pit_book_entries_casino_channel_created_idx
  ON public.pit_book_entries (casino_id, channel, created_at);
