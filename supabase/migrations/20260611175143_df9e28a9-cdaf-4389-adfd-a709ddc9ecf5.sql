
-- Allow player_id NULL for tips transactions (tips_live/tips_poker/tips_floor are not tied to a specific player)
ALTER TABLE public.transactions ALTER COLUMN player_id DROP NOT NULL;

-- But require player_id for buy/cashout/in/out (player-bound transactions)
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_player_required_chk;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_player_required_chk
  CHECK (
    (type::text IN ('tips_live','tips_poker','tips_floor')) OR (player_id IS NOT NULL)
  );
