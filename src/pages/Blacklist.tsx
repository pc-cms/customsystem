import { useState, useMemo, useEffect } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ManagerOverrideDialog from "@/components/ManagerOverrideDialog";
import BlacklistPlayerDialog from "@/components/player/BlacklistPlayerDialog";
import { Ban, ShieldAlert, UserCheck, Search, Plus } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Link } from "react-router-dom";
import { cacheBlacklist, getCachedBlacklist, getLocalPhotoUrl } from "@/lib/blacklist-cache";
import { PlayerPreviewHeader } from "@/components/player/PlayerPreviewHeader";
import { useSelectedPlayer } from "@/hooks/use-selected-player";

const BlacklistPhoto = ({ playerId, photoUrl }: { playerId: string; photoUrl: string | null }) => {
  const [src, setSrc] = useState<string | null>(photoUrl);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!photoUrl) {
      getLocalPhotoUrl(playerId).then(url => { if (url) setSrc(url); });
    }
  }, [playerId, photoUrl]);

  if (!src) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-destructive/10">
        <Ban className="w-12 h-12 text-destructive" />
      </div>
    );
  }

  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-destructive/10">
          <Ban className="w-12 h-12 text-destructive" />
        </div>
      )}
      <img
        src={src}
        className={`w-full h-full object-cover transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
        alt=""
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => {
          getLocalPhotoUrl(playerId).then(url => {
            if (url) setSrc(url);
            else setLoaded(true);
          });
        }}
      />
    </>
  );
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Dar_es_Salaam", day: "2-digit", month: "short", year: "numeric" });
};

const Blacklist = () => {
  const queryClient = useQueryClient();
  const { roles } = useAuth();
  const isSurveillance = roles.includes("surveillance");
  const canBlacklist = roles.some(r => ["pit", "manager", "surveillance", "super_admin"].includes(r));
  const [pendingAction, setPendingAction] = useState<{ player: any; action: "blacklist" | "reactivate" } | null>(null);
  const [search, setSearch] = useSessionState<string>("search", "");
  const [addTarget, setAddTarget] = useState<{ id: string; name: string } | null>(null);
  const { select: selectPlayer } = useSelectedPlayer();

  const { data: players = [] } = useQuery({
    queryKey: ["players"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Last visit per player (most recent casino_visits.checked_in_at)
  const { data: lastVisits = {} as Record<string, string> } = useQuery({
    queryKey: ["players-last-visit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("casino_visits")
        .select("player_id, checked_in_at")
        .order("checked_in_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((v: any) => {
        if (!map[v.player_id]) map[v.player_id] = v.checked_in_at;
      });
      return map;
    },
    staleTime: 1000 * 60 * 5,
  });

  const blacklisted = useMemo(
    () => players.filter(p => p.status === "blacklist"),
    [players]
  );

  const filteredBL = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return blacklisted;
    return blacklisted.filter(p =>
      `${p.first_name} ${p.last_name} ${p.nickname ?? ""} ${p.id_number ?? ""} ${p.phone ?? ""}`
        .toLowerCase().includes(q)
    );
  }, [blacklisted, search]);

  // Global search across ALL players for the search bar (above the banned grid)
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter(p => p.status !== "blacklist")
      .filter(p =>
        `${p.first_name} ${p.last_name} ${p.nickname ?? ""} ${p.id_number ?? ""} ${p.phone ?? ""}`
          .toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [players, search]);

  useEffect(() => {
    if (blacklisted.length > 0) {
      cacheBlacklist(
        blacklisted.map(p => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          nickname: p.nickname || "",
          photo_url: p.photo_url,
          hasLocalPhoto: false,
        }))
      );
    }
  }, [blacklisted]);

  const [cachedPlayers, setCachedPlayers] = useState<any[]>([]);
  useEffect(() => {
    if (!navigator.onLine || players.length === 0) {
      getCachedBlacklist().then(cached => {
        if (cached.length > 0 && blacklisted.length === 0) setCachedPlayers(cached);
      });
    }
  }, [blacklisted.length, players.length]);

  const displayList = filteredBL.length > 0 || search ? filteredBL : (blacklisted.length > 0 ? blacklisted : cachedPlayers);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "blacklist" }) => {
      const { error } = await supabase.from("players").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players"] });
      toast.success("Player status updated");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <PageShell>
      <PageHeader
        icon={ShieldAlert}
        title="Blacklist"
        subtitle={`${blacklisted.length} blacklisted${!navigator.onLine && cachedPlayers.length > 0 ? " · Offline cache" : ""}`}
        date
      >
        {canBlacklist && (
          <span className="text-[10px] text-muted-foreground">
            Search a player below, then click <Plus className="inline w-3 h-3" /> to blacklist
          </span>
        )}
      </PageHeader>

      <PlayerPreviewHeader />

      {/* Top global search bar */}
      <div className="cms-panel p-3 mb-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search players (name, nickname, ID, phone)…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {search && searchResults.length > 0 && (
          <div className="mt-2 border border-border rounded-md divide-y divide-border bg-card max-h-72 overflow-y-auto">
            {searchResults.map(p => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/40">
                <Link to={`/players/${p.id}`} className="flex-1">
                  <span className="font-medium">{p.first_name} {p.last_name}</span>
                  {p.nickname && <span className="text-muted-foreground text-xs ml-1.5">"{p.nickname}"</span>}
                  <span className="text-[10px] text-muted-foreground ml-2 font-mono">{p.id_number || ""}</span>
                </Link>
                <span className="text-[10px] text-muted-foreground mr-3">Last visit: {fmtDate(lastVisits[p.id])}</span>
                {canBlacklist && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setAddTarget({ id: p.id, name: `${p.first_name} ${p.last_name}` })}
                  >
                    <Ban className="w-3 h-3" /> Blacklist
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {displayList.length === 0 ? (
        <div className="cms-panel p-8 text-center text-muted-foreground">
          {search ? "No blacklisted players match your search" : "No blacklisted players"}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {displayList.map(p => (
            <div
              key={p.id}
              className="rounded-md border-2 border-destructive bg-destructive/5 dark:bg-destructive/10 overflow-hidden flex flex-col"
            >
              <button type="button" onClick={() => selectPlayer(p.id)} className="relative w-full aspect-square ring-2 ring-destructive ring-inset overflow-hidden bg-destructive/10 block text-left">
                <BlacklistPhoto playerId={p.id} photoUrl={p.photo_url} />
                <div className="absolute top-1 right-1 bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                  <Ban className="w-2.5 h-2.5" /> BL
                </div>
              </button>
              <div className="p-2 space-y-1.5">
                <div>
                  <p className="text-sm font-bold text-foreground leading-tight truncate">
                    {p.first_name} {p.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{p.nickname || "—"}</p>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[9px] font-mono text-muted-foreground">
                  <div>
                    <p className="uppercase tracking-wider opacity-70">Banned</p>
                    <p className="text-foreground">{fmtDate((p as any).updated_at)}</p>
                  </div>
                  <div>
                    <p className="uppercase tracking-wider opacity-70">Last visit</p>
                    <p className="text-foreground">{fmtDate(lastVisits[p.id])}</p>
                  </div>
                </div>
                {/* Reactivate is hidden for surveillance — they can ban but not unban. */}
                {!isSurveillance && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-7 text-xs gap-1"
                    onClick={() => setPendingAction({ player: p, action: "reactivate" })}
                    disabled={!navigator.onLine}
                  >
                    <UserCheck className="w-3 h-3" /> Reactivate
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ManagerOverrideDialog
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        onConfirm={() => {
          if (pendingAction) {
            updateStatus.mutate({
              id: pendingAction.player.id,
              status: pendingAction.action === "blacklist" ? "blacklist" : "active",
            });
          }
          setPendingAction(null);
        }}
        title={pendingAction?.action === "blacklist" ? "Blacklist Player" : "Reactivate Player"}
        description="Manager authentication required to change blacklist status."
        actionType="CHANGE_PLAYER_STATUS"
        actionDetails={{
          player_id: pendingAction?.player?.id,
          player_name: pendingAction ? `${pendingAction.player.first_name} ${pendingAction.player.last_name}` : "",
          new_status: pendingAction?.action === "blacklist" ? "blacklist" : "active",
        }}
      />

      {addTarget && (
        <BlacklistPlayerDialog
          open={!!addTarget}
          onClose={() => setAddTarget(null)}
          playerId={addTarget.id}
          playerName={addTarget.name}
        />
      )}
    </PageShell>
  );
};

export default Blacklist;
