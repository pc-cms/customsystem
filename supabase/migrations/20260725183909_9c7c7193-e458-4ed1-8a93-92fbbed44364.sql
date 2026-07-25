-- Check out any currently open visits for CLUB POKER virtual players (all casinos).
UPDATE public.casino_visits v
SET checked_out_at = now()
FROM public.players p
WHERE v.player_id = p.id
  AND p.category = 'casino'
  AND p.last_name ILIKE '%CLUB POKER%'
  AND v.checked_out_at IS NULL;