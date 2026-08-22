import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { formatNumberSpaces } from "@/lib/currency";
import { NumberInput } from "@/components/ui/number-input";

/**
 * Click-to-edit numeric cell used in Monthly Report inline editor.
 * Displays formatted value; on click swaps to <input>, Enter/blur commits.
 */
export const InlineNumberCell = ({
  value,
  disabled,
  onCommit,
  className,
  placeholder = "—",
  allowNegative = false,
}: {
  value: number;
  disabled?: boolean;
  onCommit: (v: number) => void;
  className?: string;
  placeholder?: string;
  allowNegative?: boolean;
}) => {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(String(value || ""));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { setRaw(String(value || "")); }, [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);


  if (disabled) {
    return (
      <span className={cn("font-mono tabular-nums", className)}>
        {value ? formatNumberSpaces(value) : placeholder}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className={cn(
          "font-mono tabular-nums hover:bg-primary/10 rounded px-1 -mx-1 transition-colors w-full text-right",
          className,
        )}
      >
        {value ? formatNumberSpaces(value) : <span className="text-muted-foreground/60">{placeholder}</span>}
      </button>
    );
  }

  const commit = (n: number) => {
    setEditing(false);
    if (n !== value) onCommit(n);
  };

  return (
    <NumberInput
      ref={ref}
      decimals={0}
      value={raw === "" ? null : raw}
      onValueChange={(v) => setRaw(v == null ? "" : String(v))}
      onBlur={() => commit(Number(raw) || 0)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(Number(raw) || 0); }
        if (e.key === "Escape") { setEditing(false); setRaw(String(value || "")); }
      }}
      onClick={(e) => e.stopPropagation()}
      className={cn("no-spin w-full bg-background border border-primary rounded px-1 py-0 font-mono text-[11px] text-right", className)}
    />
  );
};
