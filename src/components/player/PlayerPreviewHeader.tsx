import { useState, useEffect, useRef } from "react";
import PlayerPhotoLightbox from "@/components/player/PlayerPhotoLightbox";
import { useNavigate } from "react-router-dom";
import { X, ExternalLink, User, ArrowDownToLine, ArrowUpFromLine, Check, UtensilsCrossed, Megaphone, MessageSquare } from "lucide-react";
import { PlayerNotesPanel } from "@/components/player/PlayerNotesPanel";
import { PitQuickOrderDialog } from "@/components/pos/PitQuickOrderDialog";
import { usePlayerPromoCampaigns } from "@/hooks/use-promo-campaigns";
import { useQuery } from "@tanstack/react-query";
import { formatCardId } from "@/lib/card-number";
import { supabase } from "@/integrations/supabase/client";
import { usePlayer, usePlayerVisits, usePlayerNotes } from "@/hooks/use-player-profile";
import { useSelectedPlayer } from "@/hooks/use-selected-player";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { businessDayHourUTC } from "@/lib/business-day";
import CategoryBadge from "@/components/player/CategoryBadge";
import FlagBadges from "@/components/player/FlagBadges";
import { splitTagsBySource } from "@/lib/player-tags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { canSeePlayerFinancials } from "@/lib/role-access";
import { formatCurrency, formatNumberSpaces } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useCreatePlayerChipAdjustment } from "@/hooks/use-player-chip-adjustments";
import { usePlayerDropSplit, usePlayersDropCacheToday } from "@/hooks/use-drop-split";
import { usePosPlayerOutstanding } from "@/hooks/use-pos-player-outstanding";

interface Props {
  playerId?: string | null;
  onClose?: () => void;
  className?: string;
  /** Optional period (YYYY-MM-DD inclusive). Defaults to current business day. */
  range?: { from: string; to: string };
}

/** CASH IN / CASH OUT / CHIP IN / CHIP OUT for one player over a business-day range.
 *  Result is computed by the caller as (cashOut + chipOut) − (drop + chipIn),
 *  where `drop` is the authoritative peak-NEP Drop (matches the table rows and
 *  the Drop tile). Using raw cashIn here would contradict the Drop tile.
 */
const usePeriodPlayerStats = (
  playerId: string | undefined | null,
  fromDate: string | undefined,
  toDate: string | undefined,
) => {
  return useQuery({
    queryKey: ["player-period-stats", playerId, fromDate, toDate],
    queryFn: async () => {
      if (!playerId || !fromDate || !toDate) return { cashIn: 0, cashOut: 0, chipIn: 0, chipOut: 0 };
      const start = businessDayHourUTC(fromDate, 7);
      const end = businessDayHourUTC(toDate, 7 + 24);
      const [txRes, adjRes] = await Promise.all([
        supabase
          .from("transactions")
          .select("type, amount")
          .eq("player_id", playerId)
          .is("cancelled_at", null)
          .gte("created_at", start)
          .lt("created_at", end)
          .in("type", ["buy", "in", "cashout", "out"]),
        (supabase.from as any)("player_chip_adjustments")
          .select("chip_in, chip_out")
          .eq("player_id", playerId)
          .gte("created_at", start)
          .lt("created_at", end),
      ]);
      if (txRes.error) throw txRes.error;
      if (adjRes.error) throw adjRes.error;
      let cashIn = 0, cashOut = 0;
      for (const t of (txRes.data || []) as any[]) {
        const a = Number(t.amount) || 0;
        if (t.type === "buy" || t.type === "in") cashIn += a;
        else cashOut += a;
      }
      let chipIn = 0, chipOut = 0;
      for (const a of (adjRes.data || []) as any[]) {
        chipIn += Number(a.chip_in) || 0;
        chipOut += Number(a.chip_out) || 0;
      }
      return { cashIn, cashOut, chipIn, chipOut };
    },
    enabled: !!playerId && !!fromDate && !!toDate,
    staleTime: 30_000,
  });
};

/** Numeric input that displays "10 000" formatting and stores raw integer. */
const NumberInput = ({
  value, onChange, placeholder, ariaLabel, className,
}: { value: string; onChange: (v: string) => void; placeholder: string; ariaLabel: string; className?: string }) => {
  const display = value ? formatNumberSpaces(Number(value.replace(/\D/g, "")) || 0) : "";
  return (
    <Input
      inputMode="numeric"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={display}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, "");
        onChange(raw);
      }}
      className={cn("font-mono text-sm font-semibold tabular-nums text-right h-9", className)}
    />
  );
};

/** Compact stat tile used in the header — uniform across Drop / Cash In / Result. */
const StatTile = ({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) => (
  <div className="flex flex-col items-start justify-center min-w-[110px] px-3 py-1.5 rounded-md bg-background/40 border border-border/60">
    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono leading-none">
      {label}
    </span>
    <span
      className={cn(
        "font-mono font-bold tabular-nums text-lg leading-tight mt-1 whitespace-nowrap",
        tone === "positive" && "cms-amount-positive",
        tone === "negative" && "cms-amount-negative",
      )}
    >
      {value}
    </span>
  </div>
);

const LEVEL_TINT: Record<string, string> = {
  diamond: "bg-blue-100 dark:bg-[hsl(220_50%_18%)] border-blue-200 dark:border-blue-500/40",
  platinum: "bg-purple-100 dark:bg-[hsl(270_40%_18%)] border-purple-200 dark:border-purple-500/40",
  gold: "bg-yellow-100 dark:bg-[hsl(45_50%_18%)] border-yellow-200 dark:border-yellow-500/40",
  normal: "bg-card border-border",
};

/**
 * Inline chip adjustment: collapsed by default to two click-to-edit cells
 * (IN / OUT). Clicking a cell expands an input with the comment line and
 * a Save button. Enter commits, Esc cancels.
 */
const ChipAdjustInline = ({
  chipIn, chipOut, note, setChipIn, setChipOut, setNote, onSubmit, pending,
}: {
  chipIn: string;
  chipOut: string;
  note: string;
  setChipIn: (v: string) => void;
  setChipOut: (v: string) => void;
  setNote: (v: string) => void;
  onSubmit: () => void;
  pending: boolean;
}) => {
  const [active, setActive] = useState<null | "in" | "out">(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);

  const cancel = () => {
    setActive(null);
    setChipIn("");
    setChipOut("");
    setNote("");
  };

  const commit = () => {
    if (!chipIn && !chipOut) { setActive(null); return; }
    onSubmit();
    setActive(null);
  };

  const value = active === "in" ? chipIn : active === "out" ? chipOut : "";
  const setValue = active === "in" ? setChipIn : setChipOut;

  return (
    <div
      className="shrink-0 flex flex-col justify-center gap-2 w-[300px] border-l border-border pl-5 self-stretch"
      aria-label="Player chip adjustment"
    >
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono leading-none">
        Chip Adjustment
      </span>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => { if (active !== "in") { setChipOut(""); } setActive("in"); }}
          className={cn(
            "flex items-center gap-2 h-9 px-2.5 rounded-md border text-left transition-colors",
            active === "in"
              ? "border-success bg-success/5"
              : "border-border bg-background hover:bg-accent/40",
          )}
        >
          <ArrowDownToLine className="w-4 h-4 text-success shrink-0" />
          <span className={cn(
            "font-mono tabular-nums text-sm flex-1",
            !chipIn && "text-muted-foreground/60"
          )}>
            {chipIn ? formatNumberSpaces(Number(chipIn)) : "IN"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => { if (active !== "out") { setChipIn(""); } setActive("out"); }}
          className={cn(
            "flex items-center gap-2 h-9 px-2.5 rounded-md border text-left transition-colors",
            active === "out"
              ? "border-destructive bg-destructive/5"
              : "border-border bg-background hover:bg-accent/40",
          )}
        >
          <ArrowUpFromLine className="w-4 h-4 text-destructive shrink-0" />
          <span className={cn(
            "font-mono tabular-nums text-sm flex-1",
            !chipOut && "text-muted-foreground/60"
          )}>
            {chipOut ? formatNumberSpaces(Number(chipOut)) : "OUT"}
          </span>
        </button>
      </div>
      {active && (
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            placeholder={active === "in" ? "Amount IN" : "Amount OUT"}
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { e.preventDefault(); cancel(); }
            }}
            className="no-spin w-24 h-9 px-2 rounded-md border border-primary bg-background font-mono text-sm text-right"
          />
          <Input
            placeholder="Comment…"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
            className="flex-1 h-9 text-sm"
          />
          <Button
            type="button"
            onClick={commit}
            disabled={pending || (!chipIn && !chipOut)}
            className="h-9 px-2"
            size="sm"
            aria-label="Save adjustment"
          >
            <Check className="w-4 h-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={cancel}
            className="h-9 px-2"
            size="sm"
            aria-label="Cancel"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};




export const PlayerPreviewHeader = ({ playerId: playerIdProp, onClose, className, range }: Props) => {
  const ctx = useSelectedPlayer();
  const playerId = playerIdProp !== undefined ? playerIdProp : ctx.playerId;
  const { data: player, isLoading } = usePlayer(playerId || undefined);
  const { data: visits = [] } = usePlayerVisits(playerId || undefined);
  const { data: businessDate } = useEffectiveBusinessDate();
  const fromDate = range?.from || businessDate || undefined;
  const toDate = range?.to || businessDate || undefined;
  const isMultiDay = !!fromDate && !!toDate && fromDate !== toDate;
  const periodSuffix = isMultiDay ? "(p)" : "(d)";
  const { data: dayStats } = usePeriodPlayerStats(playerId, fromDate, toDate);
  // Single-day = read straight from `player_day_drop_cache` (realtime, same
  // source as Tables/Dashboard). Multi-day window keeps the RPC.
  const { data: dropCacheToday } = usePlayersDropCacheToday(!isMultiDay ? fromDate : null);
  const { data: dropSplitRpc } = usePlayerDropSplit(
    isMultiDay ? (playerId || undefined) : null,
    fromDate ? businessDayHourUTC(fromDate, 7) : undefined,
    toDate ? businessDayHourUTC(toDate, 7 + 24) : undefined,
  );
  const dropSplit = isMultiDay
    ? dropSplitRpc
    : (playerId ? dropCacheToday?.get(playerId) : undefined);

  const { data: barOwed = 0 } = usePosPlayerOutstanding(playerId);
  const nav = useNavigate();
  const { roles } = useAuth();
  const showFinancials = canSeePlayerFinancials(roles || []);
  const canAdjust = (roles || []).some((r) => r === "pit" || r === "manager" || r === "shift_manager");

  const [chipIn, setChipIn] = useState("");
  const [chipOut, setChipOut] = useState("");
  const [note, setNote] = useState("");
  const createAdj = useCreatePlayerChipAdjustment();
  const [photoOpen, setPhotoOpen] = useState(false);
  const [posOpen, setPosOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Preview card is no longer sticky, so downstream sticky table headers
  // don't need to offset for it. Keep the CSS var pinned at 0 in case any
  // legacy callers still read it.
  useEffect(() => {
    document.documentElement.style.setProperty("--ppheader-h", "0px");
    return () => {
      document.documentElement.style.setProperty("--ppheader-h", "0px");
    };
  }, [playerId]);

  const isBlacklisted = player?.status === "blacklist";
  const { data: notes = [] } = usePlayerNotes(playerId || undefined, !!playerId);
  const { data: promoTags = [] } = usePlayerPromoCampaigns(playerId || undefined);

  if (!playerId) return null;

  const handleClose = () => { onClose ? onClose() : ctx.clear(); };

  const blacklistReason = isBlacklisted
    ? (notes.find((n: any) => n.note_type === "blacklist")?.content || "").replace(/^Added to blacklist\.\s*Reason:\s*/i, "")
    : "";
  const tagRows = ((player as any)?.player_tags || []) as Array<{ tag: string; source?: string | null }>;
  const { floor: floorTags, cctv: cctvTags } = splitTagsBySource(tagRows);
  const cards = ((player as any)?.player_cards || []) as Array<{ card_number: string; is_active?: boolean }>;
  const activeCard = cards.find((c) => c.is_active)?.card_number || cards[0]?.card_number || "";
  const visitsCount = visits.length;
  const drop = dropSplit?.dropR ?? 0;
  const result = ((dayStats?.cashOut ?? 0) + (dayStats?.chipOut ?? 0)) - (drop + (dayStats?.chipIn ?? 0));
  const activePromo = promoTags.find((t) => t.status === "active") ?? promoTags[0];

  const submitAdj = () => {
    const inN = Number(chipIn) || 0;
    const outN = Number(chipOut) || 0;
    if (inN <= 0 && outN <= 0) return;
    createAdj.mutate(
      { player_id: playerId, chip_in: inN, chip_out: outN, note: note.trim() },
      { onSuccess: () => { setChipIn(""); setChipOut(""); setNote(""); } }
    );
  };

  const tint = LEVEL_TINT[(player?.category as string) || "normal"] ?? LEVEL_TINT.normal;

  return (
    <div
      ref={rootRef}
      className={cn(
        // Not sticky: the preview card scrolls away with the page so the
        // table's own sticky column header + TOTAL row pin cleanly at the
        // top of the viewport instead of floating in the middle below a
        // tall pinned preview.
        "relative z-30 -mx-4 mb-4 border-b border-border px-4 py-4 shadow-sm",
        tint,
        className
      )}
    >
      {isLoading || !player ? (
        <div className="flex items-center gap-4 h-32">
          <div className="h-32 w-32 rounded-2xl bg-muted animate-pulse" />
          <div className="flex-1 space-y-3">
            <div className="h-6 w-56 bg-muted rounded animate-pulse" />
            <div className="h-4 w-32 bg-muted rounded animate-pulse" />
          </div>
        </div>
      ) : (
        <div className="flex items-stretch gap-5">
          {/* Photo — click opens lightbox. Enlarged: fills the header vertically. */}
          <button
            type="button"
            onClick={() => setPhotoOpen(true)}
            aria-label="View photo"
            className="h-44 w-44 rounded-2xl overflow-hidden bg-muted border border-border shrink-0 flex items-center justify-center hover:ring-2 hover:ring-primary/40 transition"
          >
            {player.photo_url ? (
              <img
                src={player.photo_url}
                alt={`${player.first_name} ${player.last_name}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-20 w-20 text-muted-foreground" />
            )}
          </button>

          {/* Identity block: Name+Nick+Profile / Visits + Drop/CashIn/Result / Tags */}
          <div className="min-w-0 flex-1 flex flex-col justify-between gap-1.5 py-0.5">
            {/* Row 1 — Name + Nick + Category + Profile button */}
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <CategoryBadge category={(player.category as any) || "normal"} size="md" />
              <span className="text-2xl font-bold truncate">
                {player.first_name} {player.last_name}
              </span>
              {player.nickname && (
                <span className="text-xl text-muted-foreground font-normal truncate">"{player.nickname}"</span>
              )}
              {activeCard && (
                <span className="font-mono text-2xl font-bold text-foreground" title="Player card (registration ID)">
                  {formatCardId(activeCard)}
                </span>
              )}
              {isBlacklisted && (
                <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/30">
                  Blacklist
                </span>
              )}
              {isBlacklisted && blacklistReason && (
                <span className="text-xs text-destructive truncate max-w-[520px]" title={blacklistReason}>
                  — {blacklistReason}
                </span>
              )}
              {activePromo && (
                <button
                  type="button"
                  onClick={() => nav(`/marketing/campaigns/${activePromo.campaign_id}`)}
                  className="inline-flex items-center gap-1 text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
                  title={`Attributed to campaign · ${activePromo.campaign_name}`}
                >
                  <Megaphone className="h-3 w-3" />
                  Promo: {activePromo.campaign_name}
                  {promoTags.length > 1 && (
                    <span className="ml-0.5 font-mono opacity-70">+{promoTags.length - 1}</span>
                  )}
                </button>
              )}
              <Button
                size="sm"
                onClick={() => nav(`/players/${player.id}`)}
                className="gap-1 ml-1"
              >
                Profile <ExternalLink className="h-3.5 w-3.5" />
              </Button>
              {canAdjust && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPosOpen(true)}
                  className="gap-1"
                  title="Send F&B order to bar"
                >
                  <UtensilsCrossed className="h-3.5 w-3.5" /> F&B
                </Button>
              )}
              <Button
                size="sm"
                variant={notesOpen ? "default" : "outline"}
                onClick={() => setNotesOpen((v) => !v)}
                className="gap-1"
                aria-label="Toggle notes"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Notes
                {notes.length > 0 && (
                  <span className={cn(
                    "ml-0.5 px-1.5 rounded-full text-[10px] font-mono tabular-nums",
                    notesOpen ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/15 text-primary"
                  )}>
                    {notes.length}
                  </span>
                )}
              </Button>
            </div>

            {/* Row 2 — Visits + Drop / Cash In / Result for the active period */}
            <div className="flex items-stretch gap-2 flex-wrap">
              <StatTile label="Visits" value={String(visitsCount)} />
              {showFinancials && (
                <>
                  <StatTile
                    label={`Drop ${periodSuffix}`}
                    value={formatCurrency(dropSplit?.dropR ?? 0)}
                  />
                  <StatTile
                    label={`Cash In ${periodSuffix}`}
                    value={formatCurrency(dayStats?.cashIn ?? 0)}
                  />
                  <StatTile
                    label={`Result ${periodSuffix}`}
                    value={`${result > 0 ? "+" : ""}${formatCurrency(result)}`}
                    tone={result > 0 ? "positive" : result < 0 ? "negative" : "neutral"}
                  />
                  {barOwed > 0 && (
                    <StatTile
                      label="F&B Owed"
                      value={formatCurrency(barOwed)}
                      tone="negative"
                    />
                  )}
                </>
              )}
            </div>

            {/* Row 3 — Tags (floor + CCTV), wraps on narrow widths */}

            <div className="flex flex-col gap-1">
              <div className="flex items-start gap-2 min-w-0">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono w-12 shrink-0 pt-1">Tags</span>
                <div className="flex-1 min-w-0">
                  {floorTags.length > 0
                    ? <FlagBadges tags={floorTags} size="lg15" />
                    : <span className="text-xs text-muted-foreground/60">—</span>}
                </div>
              </div>
              {cctvTags.length > 0 && (
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono w-12 shrink-0 pt-1">CCTV</span>
                  <div className="flex-1 min-w-0">
                    <FlagBadges tags={cctvTags} size="lg15" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Chip Adjustment removed from the preview card — entered via the table row instead. */}



          {/* Right-side: Close button */}
          <div className="shrink-0 flex flex-col items-end justify-start py-0.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClose}
              aria-label="Close preview"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}
      {notesOpen && playerId && (
        <div className="mt-3 pt-3 border-t border-border">
          <PlayerNotesPanel playerId={playerId} selfFetch={false} notes={notes} />
        </div>
      )}
      <PlayerPhotoLightbox
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        src={player?.photo_url}
        alt={player ? `${player.first_name} ${player.last_name}` : undefined}
      />
      {player && (
        <PitQuickOrderDialog
          open={posOpen}
          onOpenChange={setPosOpen}
          playerId={player.id}
          playerName={`${player.first_name} ${player.last_name}`.trim()}
        />
      )}
    </div>
  );
};

