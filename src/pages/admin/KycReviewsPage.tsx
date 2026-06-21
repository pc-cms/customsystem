import { useState, useMemo } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { Link } from "react-router-dom";
import { ShieldCheck, Check, X, RotateCcw, ExternalLink, Gift, History } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { toast } from "sonner";
import { fmtDateTime, fmtDateOnly, fmtDate } from "@/lib/format-date";
import QuickGrantDialog from "@/components/admin/QuickGrantDialog";
import BulkGrantDialog, { type BulkGrantTarget } from "@/components/admin/BulkGrantDialog";
import PlayerGrantsHistoryDrawer from "@/components/admin/PlayerGrantsHistoryDrawer";

type GrantTarget = { id: string; full_name: string; casino_id: string | null; casino_name?: string | null };
const fmtAmt = (n: number) => (n ?? 0).toLocaleString("fr-FR").replace(/,/g, " ");

const formatLastActivity = (iso: string | null): { text: string; cls: string } => {
  if (!iso) return { text: "·", cls: "text-muted-foreground" };
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  let cls = "";
  if (days > 90) cls = "text-amber-500";
  else if (days > 30) cls = "text-muted-foreground";
  return { text: fmtDate(iso), cls };
};

const PlayerLink = ({ id, name }: { id: string; name: string }) => (
  <div className="flex items-center gap-1.5">
    <Link to={`/players/${id}`} className="font-medium hover:underline text-primary">
      {name}
    </Link>
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); window.open(`/players/${id}`, "_blank"); }}
      className="text-muted-foreground hover:text-foreground"
      title="Open in new tab"
    >
      <ExternalLink className="size-3" />
    </button>
  </div>
);


const KycReviewsPage = () => {
  const qc = useQueryClient();
  const [decision, setDecision] = useState<{ id: string; approve: boolean } | null>(null);
  const [notes, setNotes] = useState("");
  const [revoke, setRevoke] = useState<{ player_id: string; name: string; source: "reception" | "am_trusted" } | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [trust, setTrust] = useState<{ player_id: string; name: string } | null>(null);
  const [trustReason, setTrustReason] = useState("");
  const [search, setSearch] = useSessionState("search", "");
  const [grantTarget, setGrantTarget] = useState<GrantTarget | null>(null);
  const [historyTarget, setHistoryTarget] = useState<{ id: string; full_name: string } | null>(null);
  const [selected, setSelected] = useState<Record<string, BulkGrantTarget>>({});
  const [bulkOpen, setBulkOpen] = useState(false);

  const toggleSelect = (p: BulkGrantTarget) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = p;
      return next;
    });
  const toggleSelectAll = (list: BulkGrantTarget[], checked: boolean) =>
    setSelected((s) => {
      const next = { ...s };
      if (checked) for (const p of list) next[p.id] = p;
      else for (const p of list) delete next[p.id];
      return next;
    });
  const clearSelection = () => setSelected({});
  const selectedCount = Object.keys(selected).length;
  // Tab 1: club app pending queue
  const { data: queue = [], isLoading: queueLoading } = useQuery({
    queryKey: ["kyc_reviews", "queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kyc_reviews")
        .select("id, player_id, casino_id, source, status, ai_result, created_at, players(full_name, phone)")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as any[];
    },
  });

  // Tab 2: verified by reception
  const { data: receptionVerified = [], isLoading: rvLoading } = useQuery({
    queryKey: ["players", "reception_verified"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, full_name, first_name, last_name, phone, id_number, casino_id, verified_at, verified_by, casinos(name)")
        .eq("verified_source", "reception")
        .eq("verification_status", "verified")
        .order("verified_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as any[];
    },
  });

  // Tab 2b: AM-trusted (verified bypass, no docs)
  const { data: trustedPlayers = [], isLoading: trustedLoading } = useQuery({
    queryKey: ["players", "am_trusted"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, full_name, first_name, last_name, phone, id_number, casino_id, verified_at, verified_by, casinos(name)")
        .eq("verified_source", "am_trusted")
        .eq("verification_status", "verified")
        .order("verified_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as any[];
    },
  });

  // Promo balance per player (sum of active grants' remaining) for Trusted + Reception tabs
  const balanceIds = useMemo(
    () => [...new Set([...receptionVerified, ...trustedPlayers].map((p: any) => p.id))],
    [receptionVerified, trustedPlayers]
  );
  const { data: balanceMap = {} } = useQuery({
    queryKey: ["player_promo_balance", balanceIds],
    enabled: balanceIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promo_grants")
        .select("player_id, remaining")
        .in("player_id", balanceIds)
        .eq("status", "active")
        .gt("remaining", 0);
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of (data as any[]) ?? []) {
        m[r.player_id] = (m[r.player_id] ?? 0) + Number(r.remaining ?? 0);
      }
      return m;
    },
  });

  // Tab 3: not verified (unverified + rejected) — priority: pending kyc first
  const { data: notVerified = [], isLoading: nvLoading } = useQuery({
    queryKey: ["players", "not_verified"],
    queryFn: async () => {
      const { data: players, error } = await supabase
        .from("players")
        .select("id, full_name, first_name, last_name, phone, birth_date, verification_status, created_at, casino_id, casinos(name)")
        .in("verification_status", ["unverified", "rejected"])
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const ids = (players ?? []).map((p) => p.id);
      let pendingMap = new Set<string>();
      if (ids.length) {
        const { data: revs } = await supabase
          .from("kyc_reviews")
          .select("player_id, source")
          .in("player_id", ids)
          .eq("status", "pending");
        pendingMap = new Set((revs ?? []).map((r: any) => r.player_id));
      }
      return (players ?? []).map((p) => ({ ...p, has_pending_kyc: pendingMap.has(p.id) }));
    },
  });

  // Last activity = max(last visit, last grant) per player
  const activityIds = useMemo(
    () => [...new Set([...receptionVerified, ...trustedPlayers, ...notVerified].map((p: any) => p.id))],
    [receptionVerified, trustedPlayers, notVerified]
  );
  const { data: lastActivityMap = {} } = useQuery({
    queryKey: ["player_last_activity", activityIds],
    enabled: activityIds.length > 0,
    queryFn: async () => {
      const m: Record<string, string> = {};
      const merge = (pid: string, ts: string | null) => {
        if (!ts) return;
        if (!m[pid] || new Date(ts) > new Date(m[pid])) m[pid] = ts;
      };
      const [{ data: visits }, { data: grants }] = await Promise.all([
        supabase
          .from("casino_visits")
          .select("player_id, checked_in_at, checked_out_at")
          .in("player_id", activityIds)
          .order("checked_in_at", { ascending: false })
          .limit(1000),
        supabase
          .from("promo_grants")
          .select("player_id, created_at")
          .in("player_id", activityIds)
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);
      for (const v of (visits as any[]) ?? []) merge(v.player_id, v.checked_out_at || v.checked_in_at);
      for (const g of (grants as any[]) ?? []) merge(g.player_id, g.created_at);
      return m;
    },
  });


  // ============= Mutations =============
  const decide = useMutation({
    mutationFn: async () => {
      if (!decision) return;
      const { error } = await supabase.rpc("kyc_decide", {
        p_review_id: decision.id,
        p_approve: decision.approve,
        p_notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(decision?.approve ? "Approved" : "Rejected — bonus reversed");
      setDecision(null);
      setNotes("");
      qc.invalidateQueries({ queryKey: ["kyc_reviews"] });
      qc.invalidateQueries({ queryKey: ["players"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const revokeMut = useMutation({
    mutationFn: async () => {
      if (!revoke) return;
      const rpcName = revoke.source === "am_trusted" ? "am_revoke_verification" : "kyc_revoke_reception";
      const { error } = await supabase.rpc(rpcName as any, {
        p_player_id: revoke.player_id,
        p_reason: revokeReason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Verification revoked");
      setRevoke(null);
      setRevokeReason("");
      qc.invalidateQueries({ queryKey: ["players"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const trustMut = useMutation({
    mutationFn: async () => {
      if (!trust) return;
      const { error } = await supabase.rpc("am_trust_player" as any, {
        p_player_id: trust.player_id,
        p_reason: trustReason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Player marked as Trusted");
      setTrust(null);
      setTrustReason("");
      qc.invalidateQueries({ queryKey: ["players"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  // ============= Filters =============
  const filterPlayers = (list: any[]) => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(
      (p) =>
        p.full_name?.toLowerCase().includes(q) ||
        p.phone?.toLowerCase().includes(q) ||
        p.id_number?.toLowerCase().includes(q)
    );
  };
  const rvFiltered = useMemo(() => filterPlayers(receptionVerified), [receptionVerified, search]);
  const trustedFiltered = useMemo(() => filterPlayers(trustedPlayers), [trustedPlayers, search]);

  const nvFiltered = useMemo(() => {
    let list = notVerified;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.full_name?.toLowerCase().includes(q) || p.phone?.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (a.has_pending_kyc !== b.has_pending_kyc) return a.has_pending_kyc ? -1 : 1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [notVerified, search]);

  return (
    <PageShell>
      <PageHeader
        icon={ShieldCheck}
        title="KYC Reviews"
        subtitle="Verify players, audit reception verifications, work the queue"
      />

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queue" className="gap-2">
            Queue
            {queue.length > 0 && <Badge variant="destructive" className="text-[10px] px-1.5">{queue.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="reception" className="gap-2">
            Verified by Reception
            {receptionVerified.length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5">{receptionVerified.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="trusted" className="gap-2">
            Trusted (AM)
            {trustedPlayers.length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5">{trustedPlayers.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="notverified" className="gap-2">
            Not Verified
            {notVerified.length > 0 && <Badge variant="outline" className="text-[10px] px-1.5">{notVerified.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        {selectedCount > 0 && (
          <div className="sticky top-2 z-10 flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 p-2 backdrop-blur">
            <span className="text-sm font-medium">{selectedCount} selected</span>
            <Button size="sm" onClick={() => setBulkOpen(true)}>
              <Gift className="size-3.5" /> Grant to selected
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>Clear</Button>
          </div>
        )}

        {/* ============ TAB 1: QUEUE ============ */}
        <TabsContent value="queue">
          <PageSection title={`Pending club submissions (${queue.length})`} bodyClassName="p-0">
            <DataTable>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-xs uppercase">
                    <th className="text-left p-2">Player</th>
                    <th className="text-left p-2">Phone</th>
                    <th className="text-left p-2">Source</th>
                    <th className="text-left p-2">AI</th>
                    <th className="text-left p-2">Submitted</th>
                    <th className="text-right p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queueLoading && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
                  {!queueLoading && queue.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No pending reviews</td></tr>}
                  {queue.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="p-2">
                        {r.players ? <PlayerLink id={r.player_id} name={r.players.full_name ?? "—"} /> : "—"}
                      </td>
                      <td className="p-2 text-xs">{r.players?.phone ?? "—"}</td>
                      <td className="p-2"><Badge variant="outline" className="text-xs">{r.source}</Badge></td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {r.ai_result?.confidence ? `${(r.ai_result.confidence * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</td>
                      <td className="p-2 text-right whitespace-nowrap">
                        <Button size="sm" variant="outline" className="mr-2" onClick={() => setDecision({ id: r.id, approve: true })}>
                          <Check className="size-3.5" /> Approve
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setDecision({ id: r.id, approve: false })}>
                          <X className="size-3.5" /> Reject
                        </Button>
                      </td>
                    </tr>
                  ))}

                </tbody>
              </table>
            </DataTable>
          </PageSection>
        </TabsContent>

        {/* ============ TAB 2: VERIFIED BY RECEPTION ============ */}
        <TabsContent value="reception">
          <PageSection
            title={`Verified by Reception (${rvFiltered.length})`}
            titleRight={
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name / phone / ID…"
                className="max-w-xs"
              />
            }
            bodyClassName="p-0"
          >
            <DataTable>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-xs uppercase">
                    <th className="w-8 p-2">
                      <Checkbox
                        checked={rvFiltered.length > 0 && rvFiltered.every((p: any) => selected[p.id])}
                        onCheckedChange={(c) => toggleSelectAll(
                          rvFiltered.map((p: any) => ({ id: p.id, full_name: p.full_name ?? `${p.first_name} ${p.last_name}`, casino_id: p.casino_id })),
                          !!c,
                        )}
                      />
                    </th>
                    <th className="text-left p-2">Player</th>
                    <th className="text-left p-2">Phone</th>
                    <th className="text-left p-2">ID Number</th>
                    <th className="text-left p-2">Casino</th>
                    <th className="text-right p-2">Balance</th>
                    <th className="text-left p-2">Last activity</th>
                    <th className="text-left p-2">Verified At</th>
                    <th className="text-right p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rvLoading && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
                  {!rvLoading && rvFiltered.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">No reception verifications</td></tr>}
                  {rvFiltered.map((p) => {
                    const fullName = p.full_name ?? `${p.first_name} ${p.last_name}`;
                    const bal = balanceMap[p.id] ?? 0;
                    const act = formatLastActivity(lastActivityMap[p.id] ?? null);
                    const target: BulkGrantTarget = { id: p.id, full_name: fullName, casino_id: p.casino_id };
                    return (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="p-2">
                          <Checkbox checked={!!selected[p.id]} onCheckedChange={() => toggleSelect(target)} />
                        </td>
                        <td className="p-2"><PlayerLink id={p.id} name={fullName} /></td>
                        <td className="p-2 text-xs">{p.phone ?? "—"}</td>
                        <td className="p-2 text-xs font-mono">{p.id_number ?? "—"}</td>
                        <td className="p-2 text-xs">{p.casinos?.name ?? "—"}</td>
                        <td className={`p-2 text-xs text-right font-mono ${bal > 0 ? "" : "text-muted-foreground"}`}>{bal > 0 ? fmtAmt(bal) : "·"}</td>
                        <td className={`p-2 text-xs ${act.cls}`}>{act.text}</td>
                        <td className="p-2 text-xs text-muted-foreground">{p.verified_at ? fmtDateTime(p.verified_at) : "—"}</td>
                        <td className="p-2 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mr-1"
                            title="Promo history"
                            onClick={() => setHistoryTarget({ id: p.id, full_name: fullName })}
                          >
                            <History className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mr-2"
                            onClick={() => setGrantTarget({ id: p.id, full_name: fullName, casino_id: p.casino_id, casino_name: p.casinos?.name })}
                          >
                            <Gift className="size-3.5" /> Grant
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setRevoke({ player_id: p.id, name: fullName, source: "reception" })}
                          >
                            <RotateCcw className="size-3.5" /> Revoke
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

            </DataTable>
          </PageSection>
        </TabsContent>

        {/* ============ TAB 2b: TRUSTED (AM bypass) ============ */}
        <TabsContent value="trusted">
          <PageSection
            title={`Trusted by AM (${trustedFiltered.length})`}
            titleRight={
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name / phone / ID…"
                className="max-w-xs"
              />
            }
            bodyClassName="p-0"
          >
            <DataTable>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-xs uppercase">
                    <th className="w-8 p-2">
                      <Checkbox
                        checked={trustedFiltered.length > 0 && trustedFiltered.every((p: any) => selected[p.id])}
                        onCheckedChange={(c) => toggleSelectAll(
                          trustedFiltered.map((p: any) => ({ id: p.id, full_name: p.full_name ?? `${p.first_name} ${p.last_name}`, casino_id: p.casino_id })),
                          !!c,
                        )}
                      />
                    </th>
                    <th className="text-left p-2">Player</th>
                    <th className="text-left p-2">Phone</th>
                    <th className="text-left p-2">Casino</th>
                    <th className="text-right p-2">Balance</th>
                    <th className="text-left p-2">Last activity</th>
                    <th className="text-left p-2">Trusted At</th>
                    <th className="text-right p-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trustedLoading && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
                  {!trustedLoading && trustedFiltered.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">No trusted players</td></tr>}
                  {trustedFiltered.map((p) => {
                    const fullName = p.full_name ?? `${p.first_name} ${p.last_name}`;
                    const bal = balanceMap[p.id] ?? 0;
                    const act = formatLastActivity(lastActivityMap[p.id] ?? null);
                    const target: BulkGrantTarget = { id: p.id, full_name: fullName, casino_id: p.casino_id };
                    return (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="p-2">
                          <Checkbox checked={!!selected[p.id]} onCheckedChange={() => toggleSelect(target)} />
                        </td>
                        <td className="p-2"><PlayerLink id={p.id} name={fullName} /></td>
                        <td className="p-2 text-xs">{p.phone ?? "—"}</td>
                        <td className="p-2 text-xs">{p.casinos?.name ?? "—"}</td>
                        <td className={`p-2 text-xs text-right font-mono ${bal > 0 ? "" : "text-muted-foreground"}`}>{bal > 0 ? fmtAmt(bal) : "·"}</td>
                        <td className={`p-2 text-xs ${act.cls}`}>{act.text}</td>
                        <td className="p-2 text-xs text-muted-foreground">{p.verified_at ? fmtDateTime(p.verified_at) : "—"}</td>
                        <td className="p-2 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mr-1"
                            title="Promo history"
                            onClick={() => setHistoryTarget({ id: p.id, full_name: fullName })}
                          >
                            <History className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mr-2"
                            onClick={() => setGrantTarget({ id: p.id, full_name: fullName, casino_id: p.casino_id, casino_name: p.casinos?.name })}
                          >
                            <Gift className="size-3.5" /> Grant
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setRevoke({ player_id: p.id, name: fullName, source: "am_trusted" })}
                          >
                            <RotateCcw className="size-3.5" /> Revoke
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

            </DataTable>
          </PageSection>
        </TabsContent>


        {/* ============ TAB 3: NOT VERIFIED ============ */}
        <TabsContent value="notverified">
          <PageSection
            title={`Not Verified (${nvFiltered.length})`}
            titleRight={
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name / phone…"
                className="max-w-xs"
              />
            }
            bodyClassName="p-0"
          >
            <DataTable>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-xs uppercase">
                    <th className="w-8 p-2">
                      <Checkbox
                        checked={nvFiltered.length > 0 && nvFiltered.every((p: any) => selected[p.id])}
                        onCheckedChange={(c) => toggleSelectAll(
                          nvFiltered.map((p: any) => ({ id: p.id, full_name: p.full_name ?? `${p.first_name} ${p.last_name}`, casino_id: p.casino_id })),
                          !!c,
                        )}
                      />
                    </th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Player</th>
                    <th className="text-left p-2">Phone</th>
                    <th className="text-left p-2">DOB</th>
                    <th className="text-left p-2">Casino</th>
                    <th className="text-left p-2">Last activity</th>
                    <th className="text-left p-2">Created</th>
                    <th className="text-right p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {nvLoading && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
                  {!nvLoading && nvFiltered.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">All players verified</td></tr>}
                  {nvFiltered.map((p) => {
                    const fullName = p.full_name ?? `${p.first_name} ${p.last_name}`;
                    const act = formatLastActivity(lastActivityMap[p.id] ?? null);
                    const target: BulkGrantTarget = { id: p.id, full_name: fullName, casino_id: p.casino_id };
                    return (
                      <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="p-2">
                          <Checkbox checked={!!selected[p.id]} onCheckedChange={() => toggleSelect(target)} />
                        </td>
                        <td className="p-2">
                          {p.has_pending_kyc ? (
                            <Badge variant="destructive" className="text-[10px]">Pending review</Badge>
                          ) : p.verification_status === "rejected" ? (
                            <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">Rejected</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Unverified</Badge>
                          )}
                        </td>
                        <td className="p-2"><PlayerLink id={p.id} name={fullName} /></td>
                        <td className="p-2 text-xs">{p.phone ?? "—"}</td>
                        <td className="p-2 text-xs">{p.birth_date ? fmtDateOnly(p.birth_date) : "—"}</td>
                        <td className="p-2 text-xs">{p.casinos?.name ?? "—"}</td>
                        <td className={`p-2 text-xs ${act.cls}`}>{act.text}</td>
                        <td className="p-2 text-xs text-muted-foreground">{fmtDateTime(p.created_at)}</td>
                        <td className="p-2 text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="mr-1"
                            title="Promo history"
                            onClick={() => setHistoryTarget({ id: p.id, full_name: fullName })}
                          >
                            <History className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mr-2"
                            onClick={() => setGrantTarget({ id: p.id, full_name: fullName, casino_id: p.casino_id, casino_name: p.casinos?.name })}
                          >
                            <Gift className="size-3.5" /> Grant
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setTrust({ player_id: p.id, name: fullName })}
                          >
                            <ShieldCheck className="size-3.5" /> Mark Trusted
                          </Button>
                        </td>
                      </tr>
                    );
                  })}

                </tbody>
              </table>
            </DataTable>
          </PageSection>
        </TabsContent>
      </Tabs>

      {/* ============ Approve / Reject dialog ============ */}
      <ResponsiveDialog
        open={!!decision}
        onOpenChange={(o) => !o && setDecision(null)}
        title={decision?.approve ? "Approve verification" : "Reject verification"}
        description={decision?.approve ? "Confirm approval." : "Rejecting will reverse any verification bonus already credited."}
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">Notes (optional)</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason / reference" />
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => setDecision(null)}>Cancel</Button>
          <Button
            variant={decision?.approve ? "default" : "destructive"}
            onClick={() => decide.mutate()}
            disabled={decide.isPending}
          >
            {decide.isPending ? "Saving…" : decision?.approve ? "Approve" : "Reject"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialog>

      {/* ============ Revoke dialog ============ */}
      <ResponsiveDialog
        open={!!revoke}
        onOpenChange={(o) => { if (!o) { setRevoke(null); setRevokeReason(""); } }}
        title="Revoke verification"
        description={revoke ? `${revoke.name} will be returned to Unverified. Reason is required and logged for audit.` : ""}
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">Reason <span className="text-destructive">*</span></label>
          <Textarea
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            placeholder="Why is this verification being revoked? (min 5 chars)"
            rows={3}
          />
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => { setRevoke(null); setRevokeReason(""); }}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => revokeMut.mutate()}
            disabled={revokeMut.isPending || revokeReason.trim().length < 5}
          >
            {revokeMut.isPending ? "Revoking…" : "Revoke verification"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialog>

      {/* ============ Mark Trusted dialog (AM bypass KYC) ============ */}
      <ResponsiveDialog
        open={!!trust}
        onOpenChange={(o) => { if (!o) { setTrust(null); setTrustReason(""); } }}
        title="Mark player as Trusted"
        description={trust ? `${trust.name} will be marked verified without documents. Affects Club App access only. Reason is mandatory and logged for audit.` : ""}
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">Reason <span className="text-destructive">*</span> <span className="text-xs text-muted-foreground">(min 10 chars)</span></label>
          <Textarea
            value={trustReason}
            onChange={(e) => setTrustReason(e.target.value)}
            placeholder="e.g. Known VIP player, vouched personally, etc."
            rows={3}
          />
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => { setTrust(null); setTrustReason(""); }}>Cancel</Button>
          <Button
            onClick={() => trustMut.mutate()}
            disabled={trustMut.isPending || trustReason.trim().length < 10}
          >
            {trustMut.isPending ? "Saving…" : "Mark as Trusted"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialog>
      <QuickGrantDialog
        open={!!grantTarget}
        onOpenChange={(o) => { if (!o) setGrantTarget(null); }}
        player={grantTarget}
      />
      <BulkGrantDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        players={Object.values(selected)}
        onDone={clearSelection}
      />
      <PlayerGrantsHistoryDrawer
        open={!!historyTarget}
        onOpenChange={(o) => { if (!o) setHistoryTarget(null); }}
        player={historyTarget}
      />
    </PageShell>
  );
};

export default KycReviewsPage;
