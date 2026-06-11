ALTER TABLE public.player_chip_adjustments DROP CONSTRAINT IF EXISTS pca_amounts_nonneg;
ALTER TABLE public.player_chip_adjustments DROP CONSTRAINT IF EXISTS pca_amounts_any;
ALTER TABLE public.player_chip_adjustments
  ADD CONSTRAINT pca_amounts_any CHECK (chip_in <> 0 OR chip_out <> 0);