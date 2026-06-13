/**
 * Compact inline editor for player Level (category) and Tags.
 *
 * Permissions:
 *  - Level: super_admin / manager / shift_manager / finance_manager
 *  - Floor tags: same as Level
 *  - CCTV tags: surveillance only (super_admin can also write)
 *
 * Tags are split into two layers (`floor` and `cctv`). Max 5 per layer
 * (also enforced by DB trigger). Picker dropdown shows every available tag
 * with emoji + description, like the Breaklist cell picker.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ALL_CATEGORIES, type PlayerCategory } from "@/components/player/CategoryBadge";
import { PLAYER_TAGS, splitTagsBySource, getTagDef } from "@/lib/player-tags";
import {
  useUpdatePlayerCategory,
  useTogglePlayerTag,
} from "@/hooks/use-player-profile";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  playerId: string;
  /** Deprecated — Level is now edited next to the player name. Kept for backwards-compat callers. */
  category?: PlayerCategory;
  tagRows: Array<{ tag: string; source?: string | null }>;
}

const ROLE_FLOOR = ["super_admin", "manager", "shift_manager", "finance_manager"];
const ROLE_CCTV = ["super_admin", "surveillance"];
const MAX_TAGS_PER_SOURCE = 5;

export const useTagPermissions = () => {
  const { roles = [] } = useAuth();
  const canFloor = roles.some((r) => ROLE_FLOOR.includes(r));
  const canCctv = roles.some((r) => ROLE_CCTV.includes(r));
  return { canFloor, canCctv, canStatus: canFloor };
};

const LEVEL_LETTER: Record<PlayerCategory, string> = {
  diamond: "D", platinum: "P", gold: "G", normal: "N",
};
const LEVEL_TINT: Record<PlayerCategory, string> = {
  diamond: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/40",
  platinum: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/40",
  gold: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 border-yellow-500/40",
  normal: "bg-muted text-foreground border-border",
};

const Popover = ({ onClose, children, anchorRef }: {
  onClose: () => void;
  children: React.ReactNode;
  anchorRef: React.RefObject<HTMLElement>;
}) => {
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (popRef.current?.contains(e.target as Node)) return;
      if (anchorRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [onClose, anchorRef]);
  return (
    <div
      ref={popRef}
      className="absolute z-50 top-7 left-0 bg-popover border border-border rounded-md shadow-lg p-1.5 min-w-[200px]"
    >
      {children}
    </div>
  );
};

export const LevelPicker = ({ value, onPick, canEdit }: {
  value: PlayerCategory;
  onPick: (v: PlayerCategory) => void;
  canEdit: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        disabled={!canEdit}
        onClick={() => canEdit && setOpen(o => !o)}
        title={`Level: ${value}`}
        className={cn(
          "inline-flex items-center justify-center w-5 h-5 rounded-full border text-[10px] font-bold transition",
          LEVEL_TINT[value],
          canEdit && "hover:opacity-80 cursor-pointer",
        )}
      >
        {LEVEL_LETTER[value]}
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)} anchorRef={btnRef}>
          <p className="text-[8px] text-muted-foreground uppercase px-1 mb-1">Level</p>
          <div className="flex flex-col gap-0.5">
            {ALL_CATEGORIES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => { onPick(c); setOpen(false); }}
                className={cn(
                  "flex items-center gap-2 px-1.5 py-1 rounded text-[11px] hover:bg-muted text-left",
                  value === c && "bg-muted/60 ring-1 ring-primary",
                )}
              >
                <span className={cn(
                  "inline-flex items-center justify-center w-4 h-4 rounded-full border text-[9px] font-bold",
                  LEVEL_TINT[c],
                )}>{LEVEL_LETTER[c]}</span>
                <span className="capitalize">{c}</span>
              </button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
};

const TagsRow = ({ playerId, source, label, active, canEdit }: {
  playerId: string;
  source: "floor" | "cctv";
  label: string;
  active: Set<string>;
  canEdit: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const toggleTag = useTogglePlayerTag();

  const handleToggle = (tagKey: string) => {
    const isOn = active.has(tagKey);
    if (!isOn && active.size >= MAX_TAGS_PER_SOURCE) {
      toast.error(`Maximum ${MAX_TAGS_PER_SOURCE} tags`);
      return;
    }
    toggleTag.mutate({ player_id: playerId, tag: tagKey, source, enabled: !isOn });
  };

  const activeList = useMemo(
    () => PLAYER_TAGS.filter(t => active.has(t.key)),
    [active],
  );

  return (
    <div className="flex items-start gap-1.5 min-w-0">
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono w-9 shrink-0 pt-1.5">
        {label}
      </span>
      <TooltipProvider delayDuration={150}>
        <div className="flex-1 min-w-0 flex items-center gap-x-1.5 gap-y-1 flex-wrap">
          {activeList.map(t => (
            <Tooltip key={t.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={!canEdit || toggleTag.isPending}
                  onClick={() => canEdit && handleToggle(t.key)}
                  className={cn(
                    "text-[25px] leading-[1.15] inline-block",
                    canEdit && "hover:opacity-60 cursor-pointer",
                  )}
                  aria-label={t.hint}
                >
                  {t.emoji}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {canEdit ? `${t.hint} · click to remove` : t.hint}
              </TooltipContent>
            </Tooltip>
          ))}
          {activeList.length === 0 && !canEdit && (
            <span className="text-[11px] text-muted-foreground/60">—</span>
          )}
          {canEdit && (
            <div className="relative">
              <button
                ref={btnRef}
                type="button"
                onClick={() => setOpen(o => !o)}
                className="inline-flex items-center justify-center w-6 h-6 rounded border border-dashed border-border text-muted-foreground hover:bg-muted hover:text-foreground transition"
                title="Add tag"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              {open && (
                <Popover onClose={() => setOpen(false)} anchorRef={btnRef}>
                  <div className="flex items-center justify-between px-1 mb-1">
                    <p className="text-[8px] text-muted-foreground uppercase">{label} tags</p>
                    <span className="text-[8px] text-muted-foreground">
                      {active.size}/{MAX_TAGS_PER_SOURCE}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 max-h-[280px] overflow-y-auto">
                    {PLAYER_TAGS.map(t => {
                      const isOn = active.has(t.key);
                      const disabled = !isOn && active.size >= MAX_TAGS_PER_SOURCE;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          disabled={disabled || toggleTag.isPending}
                          onClick={() => handleToggle(t.key)}
                          className={cn(
                            "flex items-center gap-2 px-1.5 py-1 rounded text-[11px] text-left transition",
                            isOn ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted",
                            disabled && "opacity-40 cursor-not-allowed",
                          )}
                        >
                          <span className="text-base leading-none w-5 text-center">{t.emoji}</span>
                          <span className="flex-1">{t.hint}</span>
                          {isOn && <span className="text-[9px] text-primary">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </Popover>
              )}
            </div>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
};

const PlayerStatusTagsEditor = ({ playerId, tagRows }: Props) => {
  const { canFloor, canCctv } = useTagPermissions();

  const { floor, cctv } = useMemo(() => splitTagsBySource(tagRows), [tagRows]);
  const floorSet = useMemo(() => new Set(floor), [floor]);
  const cctvSet = useMemo(() => new Set(cctv), [cctv]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
      <TagsRow playerId={playerId} source="floor" label="Tags" active={floorSet} canEdit={canFloor} />
      <TagsRow playerId={playerId} source="cctv" label="CCTV" active={cctvSet} canEdit={canCctv} />
    </div>
  );
};

export default PlayerStatusTagsEditor;
