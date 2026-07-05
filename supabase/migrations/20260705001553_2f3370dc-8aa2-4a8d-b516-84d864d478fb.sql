
-- Extend player_status with 'merged'
ALTER TYPE public.player_status ADD VALUE IF NOT EXISTS 'merged';
