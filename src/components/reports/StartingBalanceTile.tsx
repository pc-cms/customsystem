/**
 * Starting Balance tile — the money carried over from the previous month.
 *
 * Manual entry, stored per month in localStorage, shared by the Casino and
 * Office monthly balance reports. It seeds the "Start" row so the first day of
 * the month can be reconciled like any other day.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatMoneyFull } from "@/lib/format-money";

interface Props {
  /** localStorage key — include the month so each month keeps its own value. */
  storageKey: string;
  hint?: string;
  /** Read-only display (demo mode). */
  readOnly?: boolean;
  value?: number;
  onChange?: (v: number) => void;
}

export const readStartingBalance = (storageKey: string): number => {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(storageKey);
  return raw ? Number(raw) || 0 : 0;
};

const StartingBalanceTile = ({ storageKey, hint, readOnly, value, onChange }: Props) => {
  const [local, setLocal] = useState<number>(() => readStartingBalance(storageKey));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const shown = readOnly ? value ?? 0 : local;

  useEffect(() => {
    setLocal(readStartingBalance(storageKey));
    setEditing(false);
  }, [storageKey]);

  const commit = () => {
    const next = Number(String(draft).replace(/[^\d.-]/g, "")) || 0;
    setLocal(next);
    window.localStorage.setItem(storageKey, String(next));
    setEditing(false);
    onChange?.(next);
  };

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Starting Balance</div>
      {editing && !readOnly ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-full bg-transparent font-mono text-xl font-bold tabular-nums outline-none"
        />
      ) : (
        <button
          type="button"
          disabled={readOnly}
          onClick={() => {
            if (readOnly) return;
            setDraft(shown ? String(shown) : "");
            setEditing(true);
          }}
          className={cn(
            "block w-full text-left font-mono text-xl font-bold tabular-nums",
            shown < 0 ? "cms-amount-negative" : "cms-amount-positive",
          )}
        >
          {formatMoneyFull(Math.round(shown))}
        </button>
      )}
      <div className="text-[10px] text-muted-foreground">
        {hint ?? (readOnly ? "Carried over from the previous month" : "Manual · click to edit")}
      </div>
    </div>
  );
};

export default StartingBalanceTile;
