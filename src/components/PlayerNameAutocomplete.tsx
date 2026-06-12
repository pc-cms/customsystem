import { useMemo, useRef, useState, useEffect, useLayoutEffect } from "react";
import { Input } from "@/components/ui/input";
import { usePlayers } from "@/hooks/use-players";
import { useVisitsToday } from "@/hooks/use-visits";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** When true, only players currently checked-in to THIS casino (today's
   *  open visits) are selectable. Used by Cashless IN/OUT entry. */
  inCasinoOnly?: boolean;
}

/**
 * STRICT autocomplete — only existing players from the GLOBAL base can be selected.
 * Free-text typing is allowed only as a search query; on blur the value is cleared
 * if it doesn't exactly match a player from the database.
 *
 * `inCasinoOnly` narrows the pool to players currently present in the active
 * casino (today's open visits — same source as the "In Casino" dashboard).
 */
export const PlayerNameAutocomplete = ({ value, onChange, placeholder, disabled, className, inCasinoOnly = false }: Props) => {
  const { data: allPlayers = [] } = usePlayers();
  const { data: visits = [] } = useVisitsToday("player_id, checked_out_at");
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropUp, setDropUp] = useState(false);

  const players = useMemo(() => {
    if (!inCasinoOnly) return allPlayers as any[];
    const presentIds = new Set(
      (visits as any[])
        .filter(v => !v.checked_out_at && v.player_id)
        .map(v => v.player_id),
    );
    return (allPlayers as any[]).filter(p => presentIds.has(p.id));
  }, [allPlayers, visits, inCasinoOnly]);

  // Build canonical labels for every player in the base
  const allLabels = useMemo(() => {
    const set = new Set<string>();
    for (const p of players as any[]) {
      const full = `${p.first_name || ""} ${p.last_name || ""}`.trim();
      const nick = p.nickname || "";
      const label = nick ? `${full} "${nick}"` : full;
      if (label) set.add(label);
    }
    return set;
  }, [players]);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    const out: { label: string; key: string }[] = [];
    for (const p of players as any[]) {
      const full = `${p.first_name || ""} ${p.last_name || ""}`.trim();
      const nick = p.nickname || "";
      const hay = `${full} ${nick}`.toLowerCase();
      if (!q || hay.includes(q)) {
        const label = nick ? `${full} "${nick}"` : full;
        if (label) out.push({ label, key: p.id });
        if (out.length >= 12) break;
      }
    }
    return out;
  }, [players, value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        // Strict validation on outside click
        if (value && !allLabels.has(value)) {
          onChange("");
          toast.error("Player not found in database");
        }
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [value, allLabels, onChange]);

  useLayoutEffect(() => {
    if (!open) { setDropUp(false); return; }
    const anchor = wrapRef.current;
    const pop = dropRef.current;
    if (!anchor || !pop) return;
    const r = anchor.getBoundingClientRect();
    const popH = pop.offsetHeight;
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    setDropUp(popH > spaceBelow && spaceAbove > spaceBelow);
  }, [open, suggestions.length]);

  const pick = (label: string) => {
    onChange(label);
    setOpen(false);
  };

  const isValid = !value || allLabels.has(value);

  return (
    <div ref={wrapRef} className="relative">
      <Input
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={e => { onChange(e.target.value); setOpen(true); setActiveIdx(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (!open || suggestions.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
          else if (e.key === "Enter" && suggestions[activeIdx]) { e.preventDefault(); pick(suggestions[activeIdx].label); }
          else if (e.key === "Escape") { setOpen(false); }
        }}
        className={cn(
          "h-8 text-xs",
          !isValid && "border-destructive focus-visible:ring-destructive",
          className,
        )}
      />
      {open && !disabled && (
        <div ref={dropRef} className={`absolute z-50 left-0 right-0 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto ${dropUp ? "bottom-full mb-1" : "mt-1"}`}>
          {suggestions.length === 0 ? (
            <div className="px-2.5 py-2 text-xs text-muted-foreground italic">No matching players in database</div>
          ) : suggestions.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onMouseDown={e => { e.preventDefault(); pick(s.label); }}
              onMouseEnter={() => setActiveIdx(i)}
              className={cn(
                "w-full text-left px-2.5 py-1.5 text-xs",
                i === activeIdx ? "bg-accent text-accent-foreground" : "text-popover-foreground hover:bg-accent/50",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
