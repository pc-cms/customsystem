import { formatNumberSpaces } from "@/lib/currency";
import { cn } from "@/lib/utils";

/** SmartTable footer row showing a START / END carry balance in the amount column. */
export const carryFooterRow = (key: string, label: string, value: number) => ({
  key,
  className: "font-bold bg-muted/20 border-t border-border",
  cell: (col: { key: string }, index: number) => {
    if (index === 0) return label;
    if (col.key !== "amount") return null;
    const neg = value < 0;
    return (
      <span className={cn("font-mono tabular-nums", neg ? "cms-amount-negative" : value > 0 ? "cms-amount-positive" : "text-muted-foreground")}>
        {neg ? "−" : ""}
        {formatNumberSpaces(Math.abs(Math.round(value)))}{" "}
        <span className="text-[10px] text-muted-foreground">TZS</span>
      </span>
    );
  },
});
