import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatCardId } from "@/lib/card-number";
import { usePlayers, useVisitsToday } from "@/hooks/use-casino-data";
import { useLastVisitsByPlayers } from "@/hooks/use-last-visit";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useDuplicateCheck } from "@/hooks/use-duplicate-check";
import { logAction } from "@/lib/logging";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useSelectedPlayer } from "@/hooks/use-selected-player";
import { PlayerPreviewHeader } from "@/components/player/PlayerPreviewHeader";
import ManagerOverrideDialog from "@/components/ManagerOverrideDialog";
import { BlacklistPlayerDialog } from "@/components/player/BlacklistPlayerDialog";
import DuplicateCheckResult from "@/components/registration/DuplicateCheckResult";
import {
  Search, UserPlus, LogIn, LogOut, ShieldAlert, Camera, ShieldCheck,
  User, Ban, CheckCircle2, XCircle, CreditCard, AlertTriangle, Eye, ClipboardList,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import CategoryBadge, { type PlayerCategory } from "@/components/player/CategoryBadge";
import CasinoBadge from "@/components/player/CasinoBadge";
import FlagBadges from "@/components/player/FlagBadges";
import { useIsMobile } from "@/hooks/use-mobile";
import { getBusinessDate } from "@/lib/business-day";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { compressImage, thumbnailPath } from "@/lib/image-compress";
import PhotoCapture from "@/components/PhotoCapture";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useModuleAccess } from "@/hooks/use-module-permissions";



const isProfileIncomplete = (player: any): string[] => {
  const missing: string[] = [];
  if (!player.photo_url) missing.push("photo");
  if (!player.first_name || !player.last_name) missing.push("name");
  if (!player.id_number) missing.push("ID document");
  return missing;
};

const Reception = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();

  const canCheckin = useModuleAccess("reception_checkin");
  const canRegister = useModuleAccess("reception_register");
  const canUpdate = useModuleAccess("reception_update");

  const allowedTabs = useMemo(() => {
    const list: string[] = [];
    if (canCheckin) list.push("checkin");
    if (canRegister) list.push("register");
    if (canUpdate) list.push("update");
    return list;
  }, [canCheckin, canRegister, canUpdate]);

  const requestedTab = searchParams.get("tab");
  const hasEditParam = !!searchParams.get("edit");
  const tab = hasEditParam && canCheckin
    ? "checkin"
    : (requestedTab && allowedTabs.includes(requestedTab)
      ? requestedTab
      : (allowedTabs[0] ?? "register"));

  // Auto-correct URL if requested tab is not permitted
  useEffect(() => {
    if (allowedTabs.length > 0 && (!requestedTab || !allowedTabs.includes(requestedTab))) {
      setSearchParams({ tab }, { replace: true });
    }
  }, [allowedTabs, requestedTab, tab, setSearchParams]);

  const tabCount = allowedTabs.length;

  return (
    <PageShell>
      <PageHeader
        icon={ClipboardList}
        title="Reception"
        subtitle="Entry control · Player registration"
        date
      />

      <Tabs value={tab} onValueChange={v => setSearchParams({ tab: v })}>
        {tabCount > 1 && (
          <TabsList
            className={`mb-3 sm:mb-4 w-full sm:w-auto grid sm:inline-flex`}
            style={{ gridTemplateColumns: `repeat(${tabCount}, minmax(0, 1fr))` }}
          >
            {canCheckin && (
              <TabsTrigger value="checkin" className="gap-1 text-xs sm:text-sm">
                <LogIn className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Check-in</span>
                <span className="sm:hidden">In/Out</span>
              </TabsTrigger>
            )}
            {canRegister && (
              <TabsTrigger value="register" className="gap-1 text-xs sm:text-sm">
                <UserPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Register</span>
                <span className="sm:hidden">New</span>
              </TabsTrigger>
            )}
            {canUpdate && (
              <TabsTrigger value="update" className="gap-1 text-xs sm:text-sm">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Update Data</span>
                <span className="sm:hidden">Update</span>
              </TabsTrigger>
            )}
          </TabsList>
        )}

        {canCheckin && <TabsContent value="checkin"><CheckInTab /></TabsContent>}
        {canRegister && <TabsContent value="register"><RegisterTab /></TabsContent>}
        {canUpdate && <TabsContent value="update"><UpdateDataTab /></TabsContent>}
      </Tabs>
    </PageShell>
  );
};

// ============ CHECK-IN TAB ============
const CheckInTab = () => {
  const { casinoId, user, isManager } = useAuth();
  const { data: players = [] } = usePlayers();
  const { data: visits = [] } = useVisitsToday("*, players(first_name, last_name, nickname, photo_url, status, id_number, category, player_type)") as { data: any[] };
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);
  const [incompleteWarning, setIncompleteWarning] = useState<string[] | null>(null);
  const { select: selectPlayer } = useSelectedPlayer();
  const [blacklistTarget, setBlacklistTarget] = useState<any | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const today = serverBusinessDate || getBusinessDate();

  const activePlayers = useMemo(() => {
    return new Set(visits.filter(v => !v.checked_out_at).map(v => v.player_id));
  }, [visits]);

  const filtered = useMemo(() => {
    if (!debouncedQuery) return [];
    const q = debouncedQuery.toLowerCase();
    const qDigits = debouncedQuery.replace(/\D/g, "");
    return players.filter(p =>
      p.first_name.toLowerCase().includes(q) ||
      p.last_name.toLowerCase().includes(q) ||
      p.nickname?.toLowerCase().includes(q) ||
      p.player_cards?.some((c: any) => {
        const raw = (c.card_number || "").toLowerCase();
        if (raw.includes(q)) return true;
        const digits = raw.replace(/\D/g, "");
        return !!qDigits && digits.includes(qDigits);
      }) ||
      p.player_cards?.some((c: any) => c.rfid_uid?.includes(debouncedQuery))
    ).slice(0, 20);
  }, [debouncedQuery, players]);

  const filteredIds = useMemo(() => filtered.map(p => p.id), [filtered]);
  const { data: lastVisitMap } = useLastVisitsByPlayers(filteredIds);

  const handleSelectPlayer = (player: any) => {
    setSelectedPlayer(player);
    const missing = isProfileIncomplete(player);
    setIncompleteWarning(missing.length > 0 ? missing : null);
    const flags = player.player_tags?.map((t: any) => t.tag) || [];
    if (flags.length > 0 && player.status !== "blacklist") {
      toast.warning(`⚠️ Player flagged: ${flags.join(", ")}`, { duration: 5000 });
    }
  };

  // Auto-select player when arriving with ?edit=<playerId> (e.g. from Guests page)
  const editPlayerId = searchParams.get("edit");
  useEffect(() => {
    if (!editPlayerId || players.length === 0) return;
    const target = players.find((p: any) => p.id === editPlayerId);
    if (target) {
      handleSelectPlayer(target);
      const next = new URLSearchParams(searchParams);
      next.delete("edit");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPlayerId, players]);

  const checkIn = useMutation({
    mutationFn: async (playerId: string) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      if (activePlayers.has(playerId)) throw new Error("Player already checked in");
      const player = players.find(p => p.id === playerId);
      if (player?.status === "blacklist") throw new Error("BLACKLISTED — entry denied");

      // Cross-casino double check-in block
      const { data: activeElsewhere } = await supabase
        .rpc("player_active_visit_casino", { _player_id: playerId } as any);
      if (activeElsewhere && activeElsewhere.length > 0) {
        const loc = activeElsewhere[0];
        if (loc.casino_id !== casinoId) {
          throw new Error(`Player is currently active at ${loc.casino_name}`);
        }
      }

      // If player already has a visit today (e.g. checked out earlier and is
      // returning), REOPEN that same visit instead of creating a duplicate.
      // Drop/result then aggregate naturally over the whole business day.
      const { data: existing } = await supabase
        .from("casino_visits")
        .select("id, checked_out_at")
        .eq("casino_id", casinoId)
        .eq("player_id", playerId)
        .eq("date", today)
        .order("checked_in_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        if (!existing.checked_out_at) throw new Error("Player already checked in");
        const { error } = await supabase
          .from("casino_visits")
          .update({ checked_out_at: null, position: "hall", checked_in_by: user.id })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("casino_visits").insert({
          casino_id: casinoId,
          player_id: playerId,
          date: today,
          checked_in_by: user.id,
          position: "hall",
        });
        if (error) throw error;
      }
      await logAction(casinoId, "player", "PLAYER_CHECKED_IN", { player_id: playerId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["casino-visits-live"] });
      setSelectedPlayer(null);
      setIncompleteWarning(null);
      setQuery("");
      toast.success("Player checked in → In Hall");
    },
    onError: (e) => toast.error(e.message),
  });

  const checkOut = useMutation({
    mutationFn: async (playerId: string) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("casino_visits")
        .update({ checked_out_at: new Date().toISOString() })
        .eq("casino_id", casinoId)
        .eq("player_id", playerId)
        .eq("date", today)
        .is("checked_out_at", null);
      if (error) throw error;
      await logAction(casinoId, "player", "PLAYER_CHECKED_OUT", { player_id: playerId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["casino-visits-live"] });
      setSelectedPlayer(null);
      setIncompleteWarning(null);
      toast.success("Player checked out");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={searchRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setSelectedPlayer(null); setIncompleteWarning(null); }}
          placeholder="Search player or scan RFID..."
          className="pl-10 font-mono text-base sm:text-lg h-12"
          autoFocus
        />
      </div>

      {query && filtered.length > 0 && !selectedPlayer && (
        <div className="cms-panel divide-y divide-border max-h-[60vh] overflow-y-auto">
          {filtered.map(p => {
            const isIn = activePlayers.has(p.id);
            const isBlacklisted = p.status === "blacklist";
            const incomplete = isProfileIncomplete(p);
            return (
              <button
                key={p.id}
                onClick={() => handleSelectPlayer(p)}
                className="flex items-center gap-2 sm:gap-3 w-full px-3 sm:px-4 py-3 text-left hover:bg-muted/50 transition-colors active:bg-muted"
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {p.photo_url ? (
                    <img src={p.photo_url} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <User className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {p.first_name} {p.last_name}
                    {p.nickname && <span className="text-muted-foreground ml-1">({p.nickname})</span>}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono truncate">
                    {p.player_cards?.[0]?.card_number ? formatCardId(p.player_cards[0].card_number) : "No card"}
                    {(() => {
                      const lv = lastVisitMap?.get(p.id);
                      if (!lv) return null;
                      return (
                        <span className="ml-2 text-muted-foreground/80">
                          · last: {new Date(lv).toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      );
                    })()}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                  <CasinoBadge casinoId={p.casino_id} />
                  <CategoryBadge category={(p.category as PlayerCategory) || "normal"} />
                  {incomplete.length > 0 && <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />}
                  {isBlacklisted ? (
                    <Badge variant="destructive" className="text-[10px] shrink-0">BL</Badge>
                  ) : isIn ? (
                    <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] shrink-0">IN</Badge>
                  ) : null}
                  {isManager && !isBlacklisted && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setBlacklistTarget(p); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setBlacklistTarget(p); } }}
                      className="inline-flex items-center justify-center h-7 w-7 rounded-md text-destructive hover:bg-destructive/10 cursor-pointer"
                      title="Add to Blacklist"
                    >
                      <Ban className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {query && filtered.length === 0 && (
        <div className="cms-panel p-6 sm:p-8 text-center text-muted-foreground">
          <p>No players found</p>
          <p className="text-xs mt-1">Try a different search or register a new player</p>
        </div>
      )}

      {!query && !selectedPlayer && (() => {
        const leftToday = visits
          .filter((v: any) => v.checked_out_at && !visits.some((o: any) => o.player_id === v.player_id && !o.checked_out_at))
          .sort((a: any, b: any) => new Date(b.checked_out_at).getTime() - new Date(a.checked_out_at).getTime())
          .slice(0, 12);
        if (leftToday.length === 0) return null;
        return (
          <div className="cms-panel">
            <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
              Left today — tap to check in again
            </div>
            <div className="divide-y divide-border max-h-[50vh] overflow-y-auto">
              {leftToday.map((v: any) => {
                const p = v.players;
                if (!p) return null;
                return (
                  <div key={v.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="w-8 h-8 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0">
                      {p.photo_url ? <img src={p.photo_url} className="w-full h-full object-cover" alt="" /> : <User className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.first_name} {p.last_name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        Out {new Date(v.checked_out_at).toLocaleTimeString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={() => checkIn.mutate(p.id)}
                      disabled={checkIn.isPending || p.status === "blacklist"}
                    >
                      <LogIn className="w-3.5 h-3.5" /> Check In
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}


      {selectedPlayer && (
        <>
          {incompleteWarning && incompleteWarning.length > 0 && (
            <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-500">Update data required</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Missing: {incompleteWarning.join(", ")}
                </p>
              </div>
            </div>
          )}
          <PlayerConfirmCard
            player={selectedPlayer}
            isCheckedIn={activePlayers.has(selectedPlayer.id)}
            onCheckIn={() => checkIn.mutate(selectedPlayer.id)}
            onCheckOut={() => checkOut.mutate(selectedPlayer.id)}
            onCancel={() => { setSelectedPlayer(null); setIncompleteWarning(null); }}
            onViewProfile={() => selectPlayer(selectedPlayer.id)}
            isPending={checkIn.isPending || checkOut.isPending}
          />
        </>
      )}

      <PlayerPreviewHeader />

      {blacklistTarget && (
        <BlacklistPlayerDialog
          open={!!blacklistTarget}
          onClose={() => {
            setBlacklistTarget(null);
            queryClient.invalidateQueries({ queryKey: ["players"] });
          }}
          playerId={blacklistTarget.id}
          playerName={`${blacklistTarget.first_name} ${blacklistTarget.last_name}`}
        />
      )}
    </div>
  );
};

const PlayerConfirmCard = ({
  player, isCheckedIn, onCheckIn, onCheckOut, onCancel, onViewProfile, isPending,
}: {
  player: any;
  isCheckedIn: boolean;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onCancel: () => void;
  onViewProfile: () => void;
  isPending: boolean;
}) => {
  const isBlacklisted = player.status === "blacklist";

  return (
    <div className={`cms-panel p-4 ${isBlacklisted ? "border-destructive/50 bg-destructive/5" : ""}`}>
      {/* Top row: info left, big photo right */}
      <div className="flex gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryBadge category={(player.category as PlayerCategory) || "normal"} size="md" />
            <CasinoBadge casinoId={player.casino_id} />
            <h2 className="text-lg sm:text-xl font-bold text-foreground truncate">
              {player.first_name} {player.last_name}
            </h2>
            {player.nickname && (
              <span className="text-sm text-muted-foreground truncate">"{player.nickname}"</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isBlacklisted ? (
              <Badge variant="destructive" className="gap-1">
                <Ban className="w-3 h-3" /> BLACKLISTED
              </Badge>
            ) : isCheckedIn ? (
              <Badge className="bg-primary/15 text-primary border-primary/30 gap-1">
                <CheckCircle2 className="w-3 h-3" /> Currently IN
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <XCircle className="w-3 h-3" /> Not in casino
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{player.player_cards?.[0]?.card_number ? formatCardId(player.player_cards[0].card_number) : "ID: —"}</span>
            <span className="text-xs text-muted-foreground">Phone: {player.phone || "—"}</span>
          </div>

          {player.player_tags?.length > 0 && !isBlacklisted && (
            <div>
              <FlagBadges tags={player.player_tags.map((t: any) => t.tag)} compact />
            </div>
          )}

          {isBlacklisted && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-2">
              <p className="text-sm font-medium text-destructive flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" /> Entry DENIED — Blacklisted
              </p>
            </div>
          )}

          {/* Edit Profile — separate, right under data */}
          <div className="pt-1">
            <Button variant="outline" onClick={onViewProfile} className="h-9 gap-1.5" size="sm">
              <Eye className="w-4 h-4" /> Edit Profile
            </Button>
          </div>
        </div>

        {/* RIGHT: Big photo for identification */}
        <div className="shrink-0">
          <div className="w-40 h-40 sm:w-44 sm:h-44 rounded-xl bg-muted flex items-center justify-center overflow-hidden ring-1 ring-border">
            {player.photo_url ? (
              <img
                src={player.photo_url}
                alt={`${player.first_name} ${player.last_name}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-16 h-16 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* Bottom action bar: Cancel left, primary action right */}
      <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-border">
        <Button variant="outline" onClick={onCancel} className="h-11 px-6 min-w-[120px]">
          Cancel
        </Button>
        {isBlacklisted ? (
          <div className="text-sm font-medium text-destructive">Entry denied</div>
        ) : isCheckedIn ? (
          <Button onClick={onCheckOut} disabled={isPending} className="gap-1.5 h-11 px-6 min-w-[180px]" variant="secondary">
            <LogOut className="w-4 h-4" /> Check Out
          </Button>
        ) : (
          <Button onClick={onCheckIn} disabled={isPending} className="gap-1.5 h-11 px-6 min-w-[180px]">
            <LogIn className="w-4 h-4" /> Confirm Check-in
          </Button>
        )}
      </div>
    </div>
  );
};

// ============ REGISTER TAB ============
export const RegisterTab = ({ onRegistered }: { onRegistered?: () => void } = {}) => {
  const { casinoId, user } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [form, setForm] = useState({
    first_name: "", last_name: "", nickname: "", phone: "", id_number: "", birth_date: "",
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrDone, setOcrDone] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideGranted, setOverrideGranted] = useState(false);

  const { status: dupStatus, matches: dupMatches, checkDuplicates, reset: resetDuplicates } = useDuplicateCheck();

  const handlePhotoSelect = (file: File) => {
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  const handlePhotoClear = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]); // strip data:...;base64,
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleDocSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setDocFiles(files);
    setOcrDone(false);
    resetDuplicates();
    setOverrideGranted(false);

    if (files.length === 0) return;

    // Run OCR in background — don't block user from filling other fields
    const firstDoc = files[0];
    if (!firstDoc.type.startsWith("image/")) return;

    setOcrLoading(true);
    // Fire-and-forget: OCR runs while user continues typing
    (async () => {
      try {
        const base64 = await fileToBase64(firstDoc);
        const { data, error } = await supabase.functions.invoke("ocr-document", {
          body: { image_base64: base64 },
        });

        if (error) {
          console.error("OCR error:", error);
          toast("Could not read document — fill in manually", { icon: "📝" });
        } else if (data) {
          // Auto-fill only empty fields (don't overwrite what user already typed)
          setForm(f => {
            const updates = { ...f };
            if (data.document_number && !f.id_number) {
              updates.id_number = data.document_number;
            }
            if (data.full_name) {
              const parts = data.full_name.trim().split(/\s+/);
              if (parts.length >= 2) {
                const lastName = parts.pop()!;
                const firstName = parts.join(" ");
                if (!f.first_name) updates.first_name = firstName;
                if (!f.last_name) updates.last_name = lastName;
              }
            }
            return updates;
          });
          toast.success("Document data auto-filled ✓");
          setOcrDone(true);

          // Auto-run duplicate check with extracted data
          checkDuplicates({
            id_number: data.document_number || "",
            first_name: data.full_name?.split(/\s+/).slice(0, -1).join(" ") || "",
            last_name: data.full_name?.split(/\s+/).pop() || "",
            phone: "",
          });
        }
      } catch {
        toast("OCR failed — fill in manually", { icon: "📝" });
      } finally {
        setOcrLoading(false);
      }
    })();
  };

  const runManualDuplicateCheck = async () => {
    if (!form.first_name || !form.last_name) return;
    await checkDuplicates({
      id_number: form.id_number,
      first_name: form.first_name,
      last_name: form.last_name,
      phone: form.phone,
    });
  };

  const handleOverrideConfirm = (managerId: string) => {
    setOverrideGranted(true);
    setShowOverride(false);
    toast.success("Manager override granted");
  };

  // Age check: must be 18+
  const isAdult = (() => {
    if (!form.birth_date) return false;
    const dob = new Date(form.birth_date);
    if (isNaN(dob.getTime())) return false;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age >= 18;
  })();

  const canSubmit =
    !!form.first_name &&
    !!form.last_name &&
    !!form.phone &&
    !!form.birth_date &&
    isAdult &&
    !submitting &&
    !ocrLoading &&
    (dupStatus !== "blocked" || overrideGranted);

  const handleSubmit = async () => {
    if (!canSubmit || !casinoId || !user) return;

    // If no check was run yet, run one now
    if (dupStatus === "idle") {
      await runManualDuplicateCheck();
      return; // Let user see results first
    }

    setSubmitting(true);
    try {
      const { data: player, error } = await supabase
        .from("players")
        .insert({
          casino_id: casinoId,
          first_name: form.first_name,
          last_name: form.last_name,
          nickname: form.nickname,
          phone: form.phone,
          id_number: form.id_number as any,
          birth_date: form.birth_date || null,
        } as any)
        .select()
        .single();
      if (error) throw error;

      if (photoFile) {
        const compressed = await compressImage(photoFile);
        const thumbPath = `${casinoId}/${player.id}/photo_thumb.jpg`;
        await supabase.storage.from("player-photos").upload(thumbPath, compressed.thumbnail, { upsert: true, contentType: "image/jpeg" });
        const origExt = photoFile.name.split(".").pop() || "jpg";
        const origPath = `${casinoId}/${player.id}/photo_original.${origExt}`;
        await supabase.storage.from("player-photos").upload(origPath, compressed.original, { upsert: true });
        const { data: urlData } = supabase.storage.from("player-photos").getPublicUrl(thumbPath);
        await supabase.from("players").update({ photo_url: urlData.publicUrl }).eq("id", player.id);
      }

      for (const doc of docFiles) {
        const ext = doc.name.split(".").pop()?.toLowerCase();
        const isImage = doc.type.startsWith("image/");
        let uploadBlob: Blob = doc;
        if (isImage && doc.size > 500 * 1024) {
          const compressed = await compressImage(doc);
          uploadBlob = compressed.thumbnail;
        }
        const path = `${casinoId}/${player.id}/docs/${Date.now()}.${isImage ? "jpg" : ext}`;
        await supabase.storage.from("player-documents").upload(path, uploadBlob, {
          contentType: isImage ? "image/jpeg" : doc.type,
        });
        // Store the first document path as id_document_url
        if (doc === docFiles[0]) {
          await supabase.from("players").update({ id_document_url: path } as any).eq("id", player.id);
        }
      }

      const { data: cardNum } = await supabase.rpc("generate_card_number" as any);
      await supabase.from("player_cards").insert({
        player_id: player.id,
        card_number: cardNum || Date.now().toString().slice(-6),
        card_type: "manual",
        issued_by: user.id,
      });

      await logAction(casinoId, "player", "PLAYER_CREATED", {
        player_id: player.id,
        name: `${form.first_name} ${form.last_name}`,
        source: "reception",
        duplicate_override: overrideGranted,
        duplicate_status: dupStatus,
      });

      queryClient.invalidateQueries({ queryKey: ["players"] });
      setForm({ first_name: "", last_name: "", nickname: "", phone: "", id_number: "", birth_date: "" });
      setPhotoFile(null);
      setPhotoPreview(null);
      setDocFiles([]);
      setOcrDone(false);
      resetDuplicates();
      setOverrideGranted(false);
      toast.success("Player registered successfully");
      onRegistered?.();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <div className="cms-panel p-4 sm:p-6 space-y-4">
        <h3 className="text-base sm:text-lg font-semibold text-foreground">New Player Registration</h3>

        {/* Duplicate Check Result */}
        <DuplicateCheckResult
          status={dupStatus}
          matches={dupMatches}
          onOverride={() => setShowOverride(true)}
          overrideGranted={overrideGranted}
        />

        {/* Photo capture */}
        <PhotoCapture
          photoUrl={photoPreview}
          onPhotoSelect={handlePhotoSelect}
          onPhotoClear={handlePhotoClear}
          label={photoFile ? "Photo ✓" : "Player Photo"}
          size="md"
          captureId="register-photo"
        />

        {/* Name + contact + ID — unified 12-col grid */}
        <FormGrid>
          <FormField span={6} label="First Name *">
            <Input
              value={form.first_name}
              onChange={e => { setForm(f => ({ ...f, first_name: e.target.value })); if (dupStatus !== "idle") resetDuplicates(); setOverrideGranted(false); }}
              className={`h-10 ${ocrDone && form.first_name ? "border-primary/50" : ""}`}
            />
          </FormField>
          <FormField span={6} label="Last Name *">
            <Input
              value={form.last_name}
              onChange={e => { setForm(f => ({ ...f, last_name: e.target.value })); if (dupStatus !== "idle") resetDuplicates(); setOverrideGranted(false); }}
              className={`h-10 ${ocrDone && form.last_name ? "border-primary/50" : ""}`}
            />
          </FormField>

          <FormField span={12} label="Nickname">
            <Input value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} className="h-10" />
          </FormField>

          <FormField span={6} label="Phone *">
            <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="h-10" type="tel" />
          </FormField>
          <FormField span={6} label="ID / Passport #">
            <Input
              value={form.id_number}
              onChange={e => { setForm(f => ({ ...f, id_number: e.target.value })); if (dupStatus !== "idle") resetDuplicates(); setOverrideGranted(false); }}
              placeholder="Document number"
              className={`h-10 font-mono ${ocrDone && form.id_number ? "border-primary/50" : ""}`}
            />
          </FormField>
          <FormField span={12} label="Birth Date *">
            <Input
              value={form.birth_date}
              onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))}
              type="date"
              className="h-10"
            />
          </FormField>
        </FormGrid>

        {/* Manual duplicate check button if no OCR was done */}
        {dupStatus === "idle" && (form.first_name || form.id_number) && (
          <Button variant="outline" size="sm" onClick={runManualDuplicateCheck} className="gap-1 text-xs w-full">
            <Search className="w-3.5 h-3.5" /> Check for Duplicates
          </Button>
        )}

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full gap-1.5 h-12 text-base"
          title={canSubmit ? "" : "Requires first name, last name, phone, and date of birth (18+)"}
        >
          <UserPlus className="w-5 h-5" /> Save
        </Button>
        {!isAdult && form.birth_date && (
          <p className="text-xs text-destructive text-center -mt-2">Player must be at least 18 years old.</p>
        )}
        <p className="text-[10px] text-muted-foreground text-center -mt-1">
          Save creates an unverified player. Add photo + ID to use Verify &amp; Save below.
        </p>

        {/* Verify & Save — single-tap verified registration */}
        {(() => {
          const canVerify =
            !!form.first_name && !!form.last_name && !!form.birth_date && !!form.id_number &&
            !!photoFile && docFiles.length > 0 && !submitting && !ocrLoading &&
            (dupStatus !== "blocked" || overrideGranted);
          const verifyAndSave = async () => {
            if (!canVerify || !casinoId || !user) return;
            if (!confirm("Mark this player as VERIFIED?\n\nThe Account Manager will be notified for QA and may revoke if data is wrong.")) return;
            setSubmitting(true);
            try {
              // 1. Create base player row first (so we have an id for storage uploads)
              const { data: player, error } = await supabase
                .from("players")
                .insert({
                  casino_id: casinoId,
                  first_name: form.first_name,
                  last_name: form.last_name,
                  nickname: form.nickname,
                  phone: form.phone,
                  id_number: form.id_number as any,
                  birth_date: form.birth_date || null,
                } as any)
                .select()
                .single();
              if (error) throw error;

              // 2. Upload photo + first doc (re-using existing logic)
              let photoUrl: string | null = null;
              let docPath: string | null = null;
              if (photoFile) {
                const compressed = await compressImage(photoFile);
                const thumbPath = `${casinoId}/${player.id}/photo_thumb.jpg`;
                await supabase.storage.from("player-photos").upload(thumbPath, compressed.thumbnail, { upsert: true, contentType: "image/jpeg" });
                const origExt = photoFile.name.split(".").pop() || "jpg";
                const origPath = `${casinoId}/${player.id}/photo_original.${origExt}`;
                await supabase.storage.from("player-photos").upload(origPath, compressed.original, { upsert: true });
                photoUrl = supabase.storage.from("player-photos").getPublicUrl(thumbPath).data.publicUrl;
              }
              for (const doc of docFiles) {
                const ext = doc.name.split(".").pop()?.toLowerCase();
                const isImage = doc.type.startsWith("image/");
                let uploadBlob: Blob = doc;
                if (isImage && doc.size > 500 * 1024) {
                  uploadBlob = (await compressImage(doc)).thumbnail;
                }
                const path = `${casinoId}/${player.id}/docs/${Date.now()}.${isImage ? "jpg" : ext}`;
                await supabase.storage.from("player-documents").upload(path, uploadBlob, {
                  contentType: isImage ? "image/jpeg" : doc.type,
                });
                if (doc === docFiles[0]) docPath = path;
              }

              // 3. Call verify RPC (sets verified + writes audit row)
              const { error: rpcErr } = await supabase.rpc("reception_verify_player" as any, {
                p_player_id: player.id,
                p_first: form.first_name,
                p_last: form.last_name,
                p_dob: form.birth_date,
                p_id_number: form.id_number,
                p_photo_url: photoUrl,
                p_id_doc_url: docPath,
              });
              if (rpcErr) throw rpcErr;

              // 4. Issue club card
              const { data: cardNum } = await supabase.rpc("generate_card_number" as any);
              await supabase.from("player_cards").insert({
                player_id: player.id,
                card_number: cardNum || Date.now().toString().slice(-6),
                card_type: "manual",
                issued_by: user.id,
              });

              await logAction(casinoId, "player", "PLAYER_CREATED", {
                player_id: player.id,
                name: `${form.first_name} ${form.last_name}`,
                source: "reception_verified",
                verified: true,
              });

              queryClient.invalidateQueries({ queryKey: ["players"] });
              setForm({ first_name: "", last_name: "", nickname: "", phone: "", id_number: "", birth_date: "" });
              setPhotoFile(null); setPhotoPreview(null); setDocFiles([]);
              setOcrDone(false); resetDuplicates(); setOverrideGranted(false);
              toast.success("Player verified — they can log in via OTP");
              onRegistered?.();
            } catch (e: any) {
              toast.error(e.message ?? "Verify failed");
            } finally {
              setSubmitting(false);
            }
          };
          return (
            <Button
              onClick={verifyAndSave}
              disabled={!canVerify}
              variant="outline"
              className="w-full gap-1.5 h-11 border-primary/40 text-primary hover:bg-primary/10"
              title={canVerify ? "" : "Requires first, last, DOB, ID number, photo and document"}
            >
              <ShieldCheck className="w-4 h-4" /> Verify &amp; Save
            </Button>
          );
        })()}
      </div>

      <ManagerOverrideDialog
        open={showOverride}
        onClose={() => setShowOverride(false)}
        onConfirm={handleOverrideConfirm}
        title="Duplicate Override"
        description="A player with the same document number already exists. Manager approval is required to create a duplicate entry."
        actionType="DUPLICATE_OVERRIDE"
        actionDetails={{
          new_player_name: `${form.first_name} ${form.last_name}`,
          document_number: form.id_number,
          matched_players: dupMatches.map(m => m.id),
        }}
      />
    </div>
  );
};

// ============ UPDATE DATA TAB ============
const UpdateDataTab = () => {
  const { casinoId } = useAuth();
  const { data: players = [] } = usePlayers();
  const { data: visits = [] } = useVisitsToday();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "last_visit">("last_visit");
  const { select: selectPlayer } = useSelectedPlayer();
  const isMobile = useIsMobile();

  const visitMap = useMemo(() => {
    const map = new Map<string, string>();
    visits.forEach((v: any) => {
      const existing = map.get(v.player_id);
      if (!existing || v.checked_in_at > existing) map.set(v.player_id, v.checked_in_at);
    });
    return map;
  }, [visits]);

  const incomplete = useMemo(() => {
    let list = players
      .filter(p => isProfileIncomplete(p).length > 0)
      .map(p => ({
        ...p,
        missing: isProfileIncomplete(p),
        lastVisit: visitMap.get(p.id) || null,
      }));

    if (query) {
      const q = query.toLowerCase();
      const qDigits = query.replace(/\D/g, "");
      list = list.filter(p =>
        p.first_name?.toLowerCase().includes(q) ||
        p.last_name?.toLowerCase().includes(q) ||
        p.nickname?.toLowerCase().includes(q) ||
        p.player_cards?.some((c: any) => {
          const raw = (c.card_number || "").toLowerCase();
          if (raw.includes(q)) return true;
          const digits = raw.replace(/\D/g, "");
          return !!qDigits && digits.includes(qDigits);
        })
      );
    }

    if (sortBy === "last_visit") {
      list.sort((a, b) => {
        if (a.lastVisit && !b.lastVisit) return -1;
        if (!a.lastVisit && b.lastVisit) return 1;
        if (a.lastVisit && b.lastVisit) return b.lastVisit.localeCompare(a.lastVisit);
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return list;
  }, [players, query, sortBy, visitMap]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search player..."
            className="pl-10 h-11"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSortBy(s => s === "newest" ? "last_visit" : "newest")}
          className="text-xs shrink-0 h-11"
        >
          {sortBy === "last_visit" ? "Visit ↓" : "New ↓"}
        </Button>
      </div>

      <p className="text-xs sm:text-sm text-muted-foreground">
        {incomplete.length} incomplete profiles
      </p>

      {incomplete.length === 0 ? (
        <div className="cms-panel p-6 sm:p-8 text-center text-muted-foreground">
          {query ? "No matching players" : "All profiles complete"}
        </div>
      ) : (
        <div className="cms-panel divide-y divide-border max-h-[65vh] overflow-y-auto">
          {incomplete.map(p => (
            <button
              key={p.id}
              onClick={() => selectPlayer(p.id)}
              className="flex items-center gap-2 sm:gap-3 w-full px-3 sm:px-4 py-3 text-left hover:bg-muted/50 active:bg-muted transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                {p.photo_url ? (
                  <img src={p.photo_url} className="w-full h-full object-cover" alt="" />
                ) : (
                  <User className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {p.first_name} {p.last_name}
                  {p.nickname && <span className="text-muted-foreground ml-1">({p.nickname})</span>}
                </p>
                <div className="flex gap-1 mt-0.5 flex-wrap">
                  {p.missing.map((m: string) => (
                    <Badge key={m} variant="outline" className="text-[9px] border-yellow-500/30 text-yellow-500 gap-0.5">
                      <AlertTriangle className="w-2.5 h-2.5" /> {m}
                    </Badge>
                  ))}
                  {p.lastVisit && (
                    <span className="text-[10px] text-primary font-mono">IN today</span>
                  )}
                </div>
              </div>
              <Eye className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      <PlayerPreviewHeader />
    </div>
  );
};

export default Reception;
