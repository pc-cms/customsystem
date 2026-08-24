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
          "font-mono tabular-nums w-full text-right bg-transparent border-0 px-0 cursor-text",
          "hover:underline decoration-dotted decoration-muted-foreground/60 underline-offset-4",
          className,
        )}
      >
        {value ? formatNumberSpaces(value) : <span className="text-muted-foreground/50">{placeholder}</span>}
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
      allowNegative={allowNegative}
      value={raw === "" ? null : raw}
      onValueChange={(v) => setRaw(v == null ? "" : String(v))}

      onBlur={() => commit(Number(raw) || 0)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(Number(raw) || 0); }
        if (e.key === "Escape") { setEditing(false); setRaw(String(value || "")); }
      }}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "no-spin w-full h-6 bg-background border-b border-primary rounded-none px-0 py-0 font-mono text-[12px] tabular-nums text-right focus-visible:ring-0",
        className,
      )}
    />
  );
};

