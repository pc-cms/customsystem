import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export type CellPickerOption = {
  value: string;
  label: string;
  className?: string;
  title?: string;
};

export type CellPickerRow = {
  label?: string;
  options: CellPickerOption[];
};

interface CellPickerProps {
  /** Current raw value (null/empty = no value) */
  value: string | null;
  /** Visible label inside the cell. Falls back to value or "·" */
  display?: string;
  /** Additional classes for the cell button */
  cellClassName?: string;
  /** Tooltip on the cell */
  title?: string;
  rows: CellPickerRow[];
  allowClear?: boolean;
  disabled?: boolean;
  onSelect: (value: string | null) => void;
  /** Optional keyboard handler that runs BEFORE the picker handles the key.
   *  If it calls preventDefault, the picker won't toggle on Space. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLButtonElement>) => void;
}

export const CellPicker: React.FC<CellPickerProps> = ({
  value,
  display,
  cellClassName = "",
  title,
  rows,
  allowClear = true,
  disabled = false,
  onSelect,
  onKeyDown,
  onPaste,
}) => {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [dropLeft, setDropLeft] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const handleOpen = () => {
    if (disabled) return;
    setDropUp(false);
    setDropLeft(false);
    setOpen(o => !o);
  };

  // Measure actual popup after render and flip if it overflows viewport bottom/right.
  useLayoutEffect(() => {
    if (!open) return;
    const btn = btnRef.current;
    const pop = popRef.current;
    if (!btn || !pop) return;
    const btnRect = btn.getBoundingClientRect();
    const popH = pop.offsetHeight;
    const popW = pop.offsetWidth;
    const spaceBelow = window.innerHeight - btnRect.bottom - 8;
    const spaceAbove = btnRect.top - 8;
    if (popH > spaceBelow && spaceAbove > spaceBelow) setDropUp(true);
    const spaceRight = window.innerWidth - btnRect.left - 8;
    if (popW > spaceRight) setDropLeft(true);
  }, [open]);

  const choose = (v: string | null) => {
    onSelect(v);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        onKeyDown={onKeyDown}
        onPaste={onPaste as any}
        title={title}
        className={cellClassName}
      >
        {display ?? value ?? "·"}
      </button>
      {open && (
        <div
          ref={popRef}
          className={`absolute z-50 ${dropUp ? "bottom-9" : "top-9"} left-0 bg-popover border border-border rounded-md shadow-lg p-1 min-w-[140px]`}
        >
          {rows.map((row, i) => (
            <div key={i} className={i > 0 ? "mt-1 pt-1 border-t border-border" : ""}>
              {row.label && (
                <p className="text-[8px] text-muted-foreground uppercase px-1 mb-0.5">{row.label}</p>
              )}
              <div className="flex flex-wrap gap-0.5">
                {row.options.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => choose(opt.value)}
                    title={opt.title}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors hover:opacity-80 ${
                      opt.className || "bg-muted text-muted-foreground"
                    } ${value === opt.value ? "ring-1 ring-primary" : ""}`}
                  >
                    <span>{opt.label}</span>
                    {opt.title && (
                      <span className="block text-[8px] font-normal opacity-80 leading-tight">
                        {opt.title}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {allowClear && (
            <div className="mt-1 pt-1 border-t border-border">
              <button
                type="button"
                onClick={() => choose(null)}
                className="w-full px-1.5 py-0.5 rounded text-[10px] font-mono text-muted-foreground hover:bg-muted/50"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
