import { useMemo, useState } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { UserCheck, Search, ArrowUp, ArrowDown, ArrowUpDown, LogOut, User, Pencil, LogIn } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { useVisitsToday } from "@/hooks/use-casino-data";
import { useTransactions } from "@/hooks/use-transactions";
import { getBusinessDate } from "@/lib/business-day";
import { logAction } from "@/lib/logging";
import { toast } from "sonner";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import CategoryBadge, { type PlayerCategory } from "@/components/player/CategoryBadge";
import CategoryFilter from "@/components/player/CategoryFilter";
import FlagBadges from "@/components/player/FlagBadges";
import { PlayerPreviewHeader } from "@/components/player/PlayerPreviewHeader";
import { useSelectedPlayer } from "@/hooks/use-selected-player";

type TabKey = "day" | "present" | "left";
type SortKey = "name" | "position" | "entry" | "exit";

const formatTime = (iso?: string | null) => {
  if (!iso) return "·";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};


const Guests = () => {
  const { casinoId, user, roles } = useAuth();
  const canCheckIn = roles.some(r => ["reception", "pit", "manager", "super_admin"].includes(r));
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tab, setTab] = useSessionState<TabKey>("tab", "day");
  const [search, setSearch] = useSessionState<string>("search", "");
  const [posFilter, setPosFilter] = useSessionState<"all" | "table" | "slots" | "hall">("posFilter", "all");

  const [categoryFilter, setCategoryFilter] = useState<Set<PlayerCategory>>(
    new Set(["diamond", "platinum", "gold", "normal"])
  );
  const [sortKey, setSortKey] = useSessionState<SortKey | null>("sortKey", null);
  const [sortDir, setSortDir] = useSessionState<"asc" | "desc">("sortDir", "desc");
  const { select: selectPlayer } = useSelectedPlayer();

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const { data: visits = [] } = useVisitsToday(
    "*, players(id, first_name, last_name, nickname, photo_url, status, player_type, phone, id_number, id_document_url, category)"
  ) as { data: any[] };

  const playerIds = useMemo(() => visits.map(v => v.player_id), [visits]);
  const { data: allTags = [] } = useQuery({
    queryKey: ["player_tags_guests", playerIds],
    queryFn: async () => {
      if (playerIds.length === 0) return [];
      const { data } = await supabase.from("player_tags").select("player_id, tag").in("player_id", playerIds);
      return data || [];
    },
    enabled: playerIds.length > 0,
  });

  const tagsByPlayer = useMemo(() => {
    const m = new Map<string, string[]>();
    allTags.forEach((t: any) => {
      const list = m.get(t.player_id) || [];
      list.push(t.tag);
      m.set(t.player_id, list);
    });
    return m;
  }, [allTags]);

  const rows = useMemo(() => {
    return visits.map((v: any) => {
      const p = v.players;
      if (!p) return null;
      return {
        id: v.id,
        playerId: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        nickname: p.nickname,
        photoUrl: p.photo_url,
        category: (p.category as PlayerCategory) || "normal",
        position: (v.position as string) || "hall",
        entryAt: v.checked_in_at as string,
        exitAt: v.checked_out_at as string | null,
        tags: tagsByPlayer.get(p.id) || [],
        rawPlayer: p,
        isInside: !v.checked_out_at,
      };
    }).filter(Boolean) as any[];
  }, [visits, tagsByPlayer]);

  const filtered = useMemo(() => {
    let list = rows;
    if (tab === "present") list = list.filter(r => r.isInside);
    if (tab === "left") list = list.filter(r => !r.isInside);
    if (posFilter !== "all") list = list.filter(r => r.position === posFilter);
    list = list.filter(r => categoryFilter.has(r.category));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        `${r.firstName} ${r.lastName} ${r.nickname ?? ""}`.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      if (sortKey) {
        const dir = sortDir === "asc" ? 1 : -1;
        const get = (r: any) => {
          switch (sortKey) {
            case "name": return `${r.firstName} ${r.lastName}`.toLowerCase();
            case "position": return r.position;
            case "entry": return new Date(r.entryAt).getTime();
            case "exit": return r.exitAt ? new Date(r.exitAt).getTime() : 0;
          }
        };
        const av = get(a), bv = get(b);
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      }
      // default: inside first, recent entry first
      if (a.isInside !== b.isInside) return a.isInside ? -1 : 1;
      return new Date(b.entryAt).getTime() - new Date(a.entryAt).getTime();
    });
  }, [rows, tab, posFilter, categoryFilter, search, sortKey, sortDir]);

  const { data: txToday = [] } = useTransactions(getBusinessDate());
  const activePlayerIds = useMemo(() => {
    const s = new Set<string>();
    (txToday as any[]).forEach(t => { if (t.player_id) s.add(t.player_id); });
    return s;
  }, [txToday]);

  const counts = useMemo(() => {
    const active = rows.filter(r => activePlayerIds.has(r.playerId));
    return {
      day: rows.length,
      present: rows.filter(r => r.isInside).length,
      left: rows.filter(r => !r.isInside).length,
      activeDay: active.length,
      activePresent: active.filter(r => r.isInside).length,
      activeLeft: active.filter(r => !r.isInside).length,
    };
  }, [rows, activePlayerIds]);


  const confirmExit = useMutation({
    mutationFn: async (visitId: string) => {
      if (!casinoId) throw new Error("No casino");
      const visit = visits.find(v => v.id === visitId);
      if (!visit) throw new Error("Visit not found");
      if (visit.checked_out_at) return;
      const { error } = await supabase
        .from("casino_visits")
        .update({ checked_out_at: new Date().toISOString() })
        .eq("id", visitId);
      if (error) throw error;
      await logAction(casinoId, "player", "PLAYER_EXIT_CONFIRMED", { visit_id: visitId, player_id: visit.player_id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["casino-visits-live"] });
      toast.success("Checked out");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Search all players (not just today's visitors) when user types.
  const debouncedSearch = useDebouncedValue(search, 250);
  const presentPlayerIds = useMemo(
    () => new Set(visits.filter((v: any) => !v.checked_out_at).map((v: any) => v.player_id)),
    [visits]
  );
  const visitedPlayerIds = useMemo(
    () => new Set(visits.map((v: any) => v.player_id)),
    [visits]
  );
  const { data: searchedPlayers = [] } = useQuery({
    queryKey: ["guests-player-search", casinoId, debouncedSearch],
    queryFn: async () => {
      if (!casinoId || debouncedSearch.trim().length < 2) return [];
      const q = debouncedSearch.trim().replace(/[%,]/g, " ");
      const { data } = await supabase
        .from("players")
        .select("id, first_name, last_name, nickname, photo_url, status, phone, id_number, id_document_url, category")
        .eq("casino_id", casinoId)
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,nickname.ilike.%${q}%`)
        .limit(50);
      return data || [];
    },
    enabled: !!casinoId && debouncedSearch.trim().length >= 2,
  });

  const checkIn = useMutation({
    mutationFn: async (playerId: string) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const today = new Date().toISOString().slice(0, 10);
      // Find ANY visit (open or closed) for this player today — unique constraint
      // prevents duplicate (casino_id, player_id, date) rows, so we must reopen
      // a closed visit rather than insert a new one.
      const { data: existing } = await supabase
        .from("casino_visits")
        .select("id, checked_out_at")
        .eq("casino_id", casinoId)
        .eq("player_id", playerId)
        .eq("date", today)
        .maybeSingle();
      if (existing && !existing.checked_out_at) return existing.id;
      if (existing && existing.checked_out_at) {
        const { error } = await supabase
          .from("casino_visits")
          .update({ checked_out_at: null, checked_in_by: user.id })
          .eq("id", existing.id);
        if (error) throw error;
        await logAction(casinoId, "player", "PLAYER_CHECKED_IN", { player_id: playerId, reopened: true });
        return existing.id;
      }
      const { error } = await supabase.from("casino_visits").insert({
        casino_id: casinoId,
        player_id: playerId,
        checked_in_by: user.id,
        position: "hall",
      });
      if (error) throw error;
      await logAction(casinoId, "player", "PLAYER_CHECKED_IN", { player_id: playerId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["casino-visits-live"] });
      toast.success("Checked in");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const PositionBadge = ({ pos }: { pos: string }) => {
    if (pos === "table") return <Badge variant="outline" className="text-[10px] gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />Table</Badge>;
    if (pos === "slots") return <Badge className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">Slots</Badge>;
    return <Badge variant="secondary" className="text-[10px]">Hall</Badge>;
  };

  const renderRow = (r: any, idx: number) => (
    <tr
      key={r.id}
      onClick={() => selectPlayer(r.playerId)}
      className={`border-b border-border hover:bg-muted/30 transition-colors cursor-pointer ${r.isCandidate ? "bg-primary/5" : !r.isInside ? "opacity-70" : ""}`}
    >
      <td className="px-2 py-1.5 w-[36px] text-center font-mono text-[10px] text-muted-foreground">{idx + 1}</td>
      <td className="px-2 py-1.5 w-[42px]">
        <div className="w-8 h-8 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0">
          {r.photoUrl ? <img src={r.photoUrl} alt="" className="w-full h-full object-cover" /> : <User className="w-4 h-4 text-muted-foreground" />}
        </div>
      </td>
      <td className="px-1 py-1.5 w-[44px]"><CategoryBadge category={r.category} /></td>
      <td className="px-2 py-1.5 max-w-[180px]">
        <p className="text-xs font-semibold text-card-foreground truncate">{r.firstName} {r.lastName}</p>
        {r.isCandidate && <p className="text-[9px] text-muted-foreground italic">Not checked in today</p>}
      </td>
      <td className="px-2 py-1.5 min-w-[280px]">
        <span className="text-muted-foreground text-[10px]">·</span>
      </td>
      <td className="px-1 py-1.5 w-[70px]">
        {r.isCandidate ? <span className="text-muted-foreground text-[10px]">·</span> : <PositionBadge pos={r.position} />}
      </td>
      <td className="px-1 py-1.5 font-mono text-xs w-[44px] text-center">{r.isCandidate ? "·" : formatTime(r.entryAt)}</td>
      <td className="px-1 py-1.5 font-mono text-xs w-[44px] text-center">{r.isCandidate ? "·" : formatTime(r.exitAt)}</td>
      <td className="px-1 py-1.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          title="Edit player in Reception"
          onClick={() => navigate(`/reception?edit=${r.playerId}`)}
        >
          <Pencil className="w-3 h-3" /> Edit
        </Button>
        {r.isCandidate && canCheckIn && (
          <Button variant="default" size="sm" className="h-7 ml-1 text-xs gap-1" onClick={() => checkIn.mutate(r.playerId)} disabled={checkIn.isPending}>
            <LogIn className="w-3 h-3" /> Check In
          </Button>
        )}
        {!r.isCandidate && r.isInside && (
          <Button variant="outline" size="sm" className="h-7 ml-1 text-xs gap-1" onClick={() => confirmExit.mutate(r.id)} disabled={confirmExit.isPending}>
            <LogOut className="w-3 h-3" /> Check Out
          </Button>
        )}
        {!r.isCandidate && !r.isInside && canCheckIn && !presentPlayerIds.has(r.playerId) && (
          <Button variant="default" size="sm" className="h-7 ml-1 text-xs gap-1" onClick={() => checkIn.mutate(r.playerId)} disabled={checkIn.isPending} title="Player returned — check in again">
            <LogIn className="w-3 h-3" /> Check In
          </Button>
        )}
      </td>
    </tr>
  );

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey !== k ? <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-40" />
      : sortDir === "asc" ? <ArrowUp className="w-3 h-3 inline ml-1" />
      : <ArrowDown className="w-3 h-3 inline ml-1" />;

  const H = ({ k, align = "left", children }: { k: SortKey; align?: "left" | "center" | "right"; children: any }) => (
    <th
      className={`px-2 py-2 cursor-pointer select-none hover:text-foreground ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      }`}
      onClick={() => toggleSort(k)}
    >
      {children}<SortIcon k={k} />
    </th>
  );

  return (
    <PageShell>
      <PageHeader
        icon={UserCheck}
        title="Guests"
        subtitle={`${counts.present} present · ${counts.left} left`}
        date
      />

      <PlayerPreviewHeader />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            <TabsTrigger
              value="day"
              className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary data-[state=active]:border-primary/40 border border-transparent"
            >
              Daily
              <Badge className="ml-1.5 text-[10px] bg-primary/20 text-primary border-primary/30 hover:bg-primary/20">{counts.day}</Badge>
            </TabsTrigger>
            <TabsTrigger
              value="present"
              className="data-[state=active]:bg-success/15 data-[state=active]:text-success data-[state=active]:border-success/40 border border-transparent"
            >
              Present
              <Badge className="ml-1.5 text-[10px] bg-success/20 text-success border-success/30 hover:bg-success/20">{counts.present}</Badge>
            </TabsTrigger>
            <TabsTrigger
              value="left"
              className="data-[state=active]:bg-muted data-[state=active]:text-muted-foreground data-[state=active]:border-border border border-transparent"
            >
              Left
              <Badge variant="secondary" className="ml-1.5 text-[10px]">{counts.left}</Badge>
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Position filter */}
            <div className="flex items-center rounded-md border border-border overflow-hidden h-8">
              {(["all", "table", "slots", "hall"] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPosFilter(p)}
                  className={`px-2.5 h-full text-[11px] uppercase tracking-wide transition-colors ${
                    posFilter === p ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {p === "all" ? "Pos" : p === "table" ? "Table" : p === "slots" ? "Slot" : "Hall"}
                </button>
              ))}
            </div>
            <CategoryFilter selected={categoryFilter} onChange={setCategoryFilter} />
            <div className="relative w-56">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search guests..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <TabsContent value={tab} className="mt-0">
          <div className="cms-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 border-b border-border">
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2 w-[36px] text-center">#</th>
                    <th className="px-2 py-2 w-[42px]"></th>
                    <th className="px-1 py-2 text-left w-[44px]">Lvl</th>
                    <H k="name">Player</H>
                    <th className="px-2 py-2 text-left min-w-[280px]">Tags</th>
                    <H k="position">Position</H>
                    <H k="entry" align="center">Entry</H>
                    <H k="exit" align="center">Exit</H>
                    <th className="px-2 py-2 text-right w-[150px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const candidateRows = (searchedPlayers as any[])
                      .filter(p => !visitedPlayerIds.has(p.id))
                      .map(p => ({
                        id: `candidate-${p.id}`,
                        playerId: p.id,
                        firstName: p.first_name,
                        lastName: p.last_name,
                        nickname: p.nickname,
                        photoUrl: p.photo_url,
                        category: (p.category as PlayerCategory) || "normal",
                        position: "hall",
                        entryAt: null,
                        exitAt: null,
                        tags: tagsByPlayer.get(p.id) || [],
                        rawPlayer: p,
                        isInside: false,
                        isCandidate: true,
                      }));
                    const combined = [...filtered, ...candidateRows];
                    if (combined.length === 0) {
                      return (
                        <tr><td colSpan={9} className="px-2 py-8 text-center text-muted-foreground text-xs">No guests to display</td></tr>
                      );
                    }
                    return combined.map((r, i) => renderRow(r, i));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

    </PageShell>
  );
};

export default Guests;
