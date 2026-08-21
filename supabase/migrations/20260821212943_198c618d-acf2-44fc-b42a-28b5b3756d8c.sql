DROP POLICY IF EXISTS "Players readable by staff accounts" ON public.players;
DROP POLICY IF EXISTS "Players readable within casino scope" ON public.players;
CREATE POLICY "Players readable within casino scope"
ON public.players FOR SELECT TO authenticated
USING (
  public.has_casino_scope(auth.uid(), casino_id)
  OR status = 'blacklist'::player_status
  OR EXISTS (
    SELECT 1 FROM public.casino_visits v
    WHERE v.player_id = players.id
      AND public.has_casino_scope(auth.uid(), v.casino_id)
  )
);

DROP POLICY IF EXISTS "Player cards readable by staff accounts" ON public.player_cards;
DROP POLICY IF EXISTS "Player cards readable within casino scope" ON public.player_cards;
CREATE POLICY "Player cards readable within casino scope"
ON public.player_cards FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.players pl
    WHERE pl.id = player_cards.player_id
      AND (
        public.has_casino_scope(auth.uid(), pl.casino_id)
        OR EXISTS (
          SELECT 1 FROM public.casino_visits v
          WHERE v.player_id = pl.id
            AND public.has_casino_scope(auth.uid(), v.casino_id)
        )
      )
  )
);