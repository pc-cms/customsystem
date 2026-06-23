/**
 * ChipToken — visual representation of a chip denomination.
 * Two-color poker chip: main body + 6 edge inserts + label color.
 * Reads per-casino overrides from chip_color_settings; falls back to defaults.
 */
import { memo, type CSSProperties } from "react";
import { useChipColors, resolveChipColor, type ChipColors } from "@/hooks/use-chip-colors";
import { formatChipLabel } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface ChipTokenProps {
  denom: number;
  /** Use larger size variant (44px). Default 36px. */
  size?: "sm" | "lg";
  /** Override label (defaults to formatChipLabel(denom)). */
  label?: string;
  /** Override colors directly (skips lookup — useful for previews). */
  colors?: ChipColors;
  className?: string;
}

const ChipToken = ({ denom, size = "sm", label, colors: colorOverride, className }: ChipTokenProps) => {
  const { data: overrides = {} } = useChipColors();
  const colors = colorOverride ?? resolveChipColor(denom, overrides);

  const style = {
    "--chip-bg": colors.bg,
    "--chip-edge": colors.edge,
    "--chip-text": colors.text,
  } as CSSProperties;

  return (
    <span
      className={cn("cms-chip-token", size === "lg" && "cms-chip-token-lg", className)}
      style={style}
    >
      <span>{label ?? formatChipLabel(denom)}</span>
    </span>
  );
};

export default memo(ChipToken);
