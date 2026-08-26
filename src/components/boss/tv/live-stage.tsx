/**
 * LiveStage — the Dashboard TV Live presentation.
 * Picks one of the three Premier Casino visual styles; all of them consume the
 * SAME derived metrics (see `@/lib/boss-display-metrics`).
 */
import { BlackGoldStage } from "./black-gold";
import { RedGoldStage } from "./red-gold";
import { DarkGoldStage } from "./dark-gold";
import type { TvStyleId } from "./tokens";
import type { TvStageProps } from "./types";

export function LiveStage({ style, ...props }: TvStageProps & { style: TvStyleId }) {
  if (style === "red-gold") return <RedGoldStage {...props} />;
  if (style === "dark-gold") return <DarkGoldStage {...props} />;
  return <BlackGoldStage {...props} />;
}
