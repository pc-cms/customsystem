import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
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
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const handleOpen = () => {
    if (disabled) return;
    setOpen(o => !o);
  };

  // Measure actual popup after render and position via fixed coords so it
  // escapes any `overflow:hidden` ancestor (panels, scrollable grids).
  useLayoutEffect(() => {
    if (!open) return;
    const btn = btnRef.current;
    const pop = popRef.current;
    if (!btn || !pop) return;
    const btnRect = btn.getBoundingClientRect();
    const popH = pop.offsetHeight;
    const popW = pop.offsetWidth;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Vertical: prefer below, flip above if not enough room
    let top = btnRect.bottom + 4;
    if (top + popH + margin > vh && btnRect.top - popH - 4 > margin) {
      top = btnRect.top - popH - 4;
    }
    // Clamp inside viewport
    top = Math.max(margin, Math.min(top, vh - popH - margin));

    // Horizontal: align to button's left, shift left if overflowing right edge
    let left = btnRect.left;
    if (left + popW + margin > vw) left = vw - popW - margin;
    left = Math.max(margin, left);

    setCoords({ top, left });
  }, [open]);

  // Reset coords when closing so next open re-measures cleanly
  useEffect(() => {
    if (!open) setCoords(null);
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
      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popRef}
          style={{
            position: "fixed",
            top: coords?.top ?? -9999,
            left: coords?.left ?? -9999,
            visibility: coords ? "visible" : "hidden",
          }}
          className="z-50 bg-popover border border-border rounded-md shadow-lg p-1 min-w-[140px]"
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
                    className={`inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded text-[10px] font-mono font-bold transition-colors hover:opacity-80 ${
                      opt.className || "bg-muted text-muted-foreground"
                    } ${value === opt.value ? "ring-1 ring-primary" : ""}`}
                  >
                    {opt.label}
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
        </div>,
        document.body
      )}
    </div>
  );
};
