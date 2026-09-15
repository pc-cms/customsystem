DROP POLICY IF EXISTS "ace identities readable" ON public.player_ace_identities;
DROP POLICY IF EXISTS "ace identity audit readable" ON public.player_ace_identity_audit;
DROP POLICY IF EXISTS "ace cards readable" ON public.player_ace_cards;
DROP POLICY IF EXISTS "ace tx readable" ON public.ace_player_transactions;
DROP POLICY IF EXISTS "ace egm daily readable" ON public.ace_player_egm_daily;
DROP POLICY IF EXISTS "ace player daily readable" ON public.ace_player_daily;
DROP POLICY IF EXISTS "ace egm current readable" ON public.ace_egm_current;
DROP POLICY IF EXISTS "ace jackpots readable" ON public.ace_jackpot_wins;
DROP POLICY IF EXISTS "ace egm reports readable" ON public.ace_egm_reports;
DROP POLICY IF EXISTS "ace jp reports readable" ON public.ace_jackpot_reports;

CREATE POLICY "ace identities readable" ON public.player_ace_identities FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "ace identity audit readable" ON public.player_ace_identity_audit FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "ace cards readable" ON public.player_ace_cards FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "ace tx readable" ON public.ace_player_transactions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "ace egm daily readable" ON public.ace_player_egm_daily FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "ace player daily readable" ON public.ace_player_daily FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "ace egm current readable" ON public.ace_egm_current FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "ace jackpots readable" ON public.ace_jackpot_wins FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "ace egm reports readable" ON public.ace_egm_reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "ace jp reports readable" ON public.ace_jackpot_reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

GRANT ALL ON public.player_ace_identities, public.player_ace_identity_audit, public.player_ace_cards,
             public.ace_player_transactions, public.ace_player_egm_daily, public.ace_player_daily,
             public.ace_egm_current, public.ace_jackpot_wins, public.ace_egm_reports, public.ace_jackpot_reports
          TO service_role;

CREATE OR REPLACE FUNCTION public.ace_player_stats(
  _from date,
  _to date,
  _casino_id uuid DEFAULT NULL
) RETURNS TABLE (
  player_id uuid,
  player_name text,
  is_ace_auto boolean,
  ace_ids text[],
  casino_ids uuid[],
  cards text[],
  egm_codes text[],
  in_amount numeric,
  out_amount numeric,
  drop_amount numeric,
  handle_amount numeric,
  slot_result numeric,
  games integer,
  jackpot_count integer,
  jackpot_amount numeric,
  last_activity timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ids AS (
    SELECT i.* FROM public.player_ace_identities i
    WHERE (_casino_id IS NULL OR i.casino_id = _casino_id)
      AND public.has_role(auth.uid(), 'super_admin')
  ),
  daily AS (
    SELECT d.identity_id,
           SUM(d.in_amount) AS in_amount,
           SUM(d.out_amount) AS out_amount,
           SUM(d.drop_amount) AS drop_amount,
           SUM(d.handle_amount) AS handle_amount,
           SUM(d.games)::int AS games,
           MAX(d.last_play_at) AS last_play_at
      FROM public.ace_player_daily d
     WHERE d.business_date BETWEEN _from AND _to
       AND (_casino_id IS NULL OR d.casino_id = _casino_id)
     GROUP BY d.identity_id
  ),
  jp AS (
    SELECT j.identity_id, COUNT(*)::int AS jp_count, SUM(j.amount) AS jp_amount
      FROM public.ace_jackpot_wins j
     WHERE j.business_date BETWEEN _from AND _to
       AND (_casino_id IS NULL OR j.casino_id = _casino_id)
     GROUP BY j.identity_id
  )
  SELECT
    p.id,
    btrim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')) AS player_name,
    p.is_ace_auto,
    array_agg(DISTINCT ids.ace_player_id) AS ace_ids,
    array_agg(DISTINCT ids.casino_id) AS casino_ids,
    (SELECT array_agg(DISTINCT c.card_number)
       FROM public.player_ace_cards c
       JOIN public.player_ace_identities i2 ON i2.id = c.identity_id
      WHERE i2.player_id = p.id) AS cards,
    (SELECT array_agg(DISTINCT e.egm_code)
       FROM public.ace_player_egm_daily e
       JOIN public.player_ace_identities i3 ON i3.id = e.identity_id
      WHERE i3.player_id = p.id
        AND e.business_date BETWEEN _from AND _to
        AND (_casino_id IS NULL OR e.casino_id = _casino_id)) AS egm_codes,
    SUM(daily.in_amount) AS in_amount,
    SUM(daily.out_amount) AS out_amount,
    SUM(daily.drop_amount) AS drop_amount,
    SUM(daily.handle_amount) AS handle_amount,
    SUM(daily.in_amount) - SUM(daily.out_amount) AS slot_result,
    SUM(daily.games)::int AS games,
    SUM(coalesce(jp.jp_count,0))::int AS jackpot_count,
    SUM(jp.jp_amount) AS jackpot_amount,
    MAX(daily.last_play_at) AS last_activity
  FROM ids
  JOIN public.players p ON p.id = ids.player_id
  LEFT JOIN daily ON daily.identity_id = ids.id
  LEFT JOIN jp ON jp.identity_id = ids.id
  GROUP BY p.id, p.first_name, p.last_name, p.is_ace_auto;
$$;

REVOKE EXECUTE ON FUNCTION public.ace_player_stats(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ace_player_stats(date, date, uuid) TO authenticated;