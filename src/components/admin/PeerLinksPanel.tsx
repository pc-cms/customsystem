/**
 * PeerLinksPanel — symmetric peer mesh manager.
 * Every node (local or Cloud) is identical. No primary/replica concept.
 * - Add Peer: outbound handshake request
 * - Approve/Reject inbound requests
 * - Pause/Resume sync
 * - Delete peer
 * - Clear Stale: removes stuck pending pairings older than 1 hour
 *
 * Network endpoints (POST /peer/handshake etc.) are implemented in cms-sync —
 * this panel only manages the peer_links table.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Pause, Play, CheckCircle2, XCircle, Sparkles, Server, Cloud } from "lucide-react";


type PeerStatus = "pending_outbound" | "pending_inbound" | "active" | "paused" | "rejected";

interface PeerLink {
  id: string;
  peer_url: string;
  peer_node_id: string | null;
  display_name: string;
  sync_secret: string;
  status: PeerStatus;
  schema_version: string | null;
  last_seen_at: string | null;
  last_push_cursor: number;
  last_pull_cursor: number;
  last_push_error: string | null;
  last_pull_error: string | null;
  created_at: string;
}

interface NodeIdentity {
  node_id: string;
  display_name: string;
  node_kind: "local" | "cloud";
  schema_version: string;
  owned_casino_ids: string[];
}

interface CasinoOption {
  id: string;
  name: string;
  slug: string | null;
}

const useNodeIdentity = () => useQuery({
  queryKey: ["node-identity"],
  queryFn: async (): Promise<NodeIdentity | null> => {
    const { data, error } = await supabase.from("node_identity" as any).select("*").maybeSingle();
    if (error) throw error;
    return (data ?? null) as unknown as NodeIdentity | null;
  },
});

const usePeerLinks = () => useQuery({
  queryKey: ["peer-links"],
  queryFn: async (): Promise<PeerLink[]> => {
    const { data, error } = await supabase
      .from("peer_links" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as PeerLink[];
  },
  refetchInterval: 10_000,
});

const useCasinos = () => useQuery({
  queryKey: ["peer-link-casinos"],
  queryFn: async (): Promise<CasinoOption[]> => {
    const { data, error } = await supabase.from("casinos").select("id, name, slug").order("name");
    if (error) throw error;
    return (data ?? []) as CasinoOption[];
  },
});

const generateSecret = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
};

const fmtTime = (ts: string | null) =>
  ts ? new Date(ts).toLocaleString("en-GB", { timeZone: "Africa/Dar_es_Salaam", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Never";

const StatusBadge = ({ s }: { s: PeerStatus }) => {
  const map: Record<PeerStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    active: { label: "Active", variant: "default" },
    pending_outbound: { label: "Awaiting peer", variant: "outline" },
    pending_inbound: { label: "Needs approval", variant: "outline" },
    paused: { label: "Paused", variant: "secondary" },
    rejected: { label: "Rejected", variant: "destructive" },
  };
  const { label, variant } = map[s];
  return <Badge variant={variant} className="text-[10px]">{label}</Badge>;
};

export const PeerLinksPanel = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: identity } = useNodeIdentity();
  const { data: peers = [] } = usePeerLinks();
  const { data: casinos = [] } = useCasinos();

  const [secretReveal, setSecretReveal] = useState<{ name: string; secret: string } | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingCasinoId, setPairingCasinoId] = useState("");

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PeerStatus }) => {
      const { error } = await supabase.from("peer_links" as any).update({ status } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["peer-links"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePeer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("peer_links" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["peer-links"] });
      toast.success("Peer removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearStale = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("clear_stale_peer_links" as any);
      if (error) throw error;
      return (data as unknown as number) ?? 0;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["peer-links"] });
      toast.success(`Removed ${n} stale peer${n === 1 ? "" : "s"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approvePairingCode = useMutation({
    mutationFn: async () => {
      const code = pairingCode.trim().toUpperCase();
      if (!code || !pairingCasinoId) throw new Error("Enter pairing code and casino");

      const { data: pending, error: lookupError } = await supabase
        .from("pending_server_registrations" as any)
        .select("id, status, expires_at, server_name, server_ip, server_slug")
        .eq("pairing_code", code)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (!pending) throw new Error("Pairing code not found");
      if ((pending as any).status !== "pending") throw new Error(`Pairing is ${(pending as any).status}`);
      if (new Date((pending as any).expires_at).getTime() < Date.now()) throw new Error("Pairing code expired");
      const finalSecret = generateSecret();
      const seedToken = generateSecret();

      const { error } = await supabase
        .from("pending_server_registrations" as any)
        .update({
          status: "approved",
          approved_casino_id: pairingCasinoId,
          approved_by: user?.id ?? null,
          approved_at: new Date().toISOString(),
          sync_secret: finalSecret,
          seed_token: seedToken,
          seed_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        } as any)
        .eq("id", (pending as any).id);
      if (error) throw error;

      const peerUrl = (pending as any).server_ip ? `https://${(pending as any).server_ip}` : `pending://${code.toLowerCase()}`;
      const displayName = (pending as any).server_name || (pending as any).server_slug || `Local server ${code}`;
      const { error: peerError } = await supabase.from("peer_links" as any).insert({
        peer_url: peerUrl,
        display_name: displayName,
        sync_secret: finalSecret,
        status: "active",
      } as any);
      if (peerError) throw peerError;

      // Register this local server as a replica in casino_servers so the
      // Cloud admin Servers (Primary/Replica) panel can show it and offer
      // Promote to Primary. Idempotent: only insert if no row exists yet
      // for the same casino + local_url pair.
      const { data: existingServer } = await supabase
        .from("casino_servers" as any)
        .select("id")
        .eq("casino_id", pairingCasinoId)
        .eq("local_url", peerUrl)
        .maybeSingle();
      if (!existingServer) {
        const { error: serverError } = await supabase.from("casino_servers" as any).insert({
          casino_id: pairingCasinoId,
          display_name: displayName,
          local_url: peerUrl,
          role: "replica",
        } as any);
        if (serverError) throw serverError;
      }
    },
    onSuccess: () => {
      setPairingCode("");
      toast.success("Pairing code approved");
      qc.invalidateQueries({ queryKey: ["peer-links"] });
      qc.invalidateQueries({ queryKey: ["casino-servers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });



  const NodeKindIcon = identity?.node_kind === "cloud" ? Cloud : Server;

  return (
    <div className="space-y-4">
      {/* This node identity */}
      <div className="cms-panel p-4 flex items-center gap-3">
        <NodeKindIcon className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-card-foreground">This node</h3>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{identity?.display_name ?? "—"}</span>
            <span className="mx-1.5">·</span>
            <span className="uppercase tracking-wider">{identity?.node_kind ?? "—"}</span>
            <span className="mx-1.5">·</span>
            <span>schema v{identity?.schema_version ?? "—"}</span>
            <span className="mx-1.5">·</span>
            <span className="font-mono text-[10px]">{identity?.node_id?.slice(0, 8) ?? "—"}</span>
          </p>
        </div>
      </div>

      <div className="cms-panel p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-card-foreground">Approve local server</h3>
            <p className="text-xs text-muted-foreground">Enter the code printed by pair.sh and assign it to a casino.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-2">
            <Input
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
              placeholder="PAIRING CODE"
              className="font-mono uppercase"
              maxLength={12}
            />
            <Select value={pairingCasinoId} onValueChange={setPairingCasinoId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick casino…" />
              </SelectTrigger>
              <SelectContent>
                {casinos.map((casino) => (
                  <SelectItem key={casino.id} value={casino.id}>{casino.name}{casino.slug ? ` (${casino.slug})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => approvePairingCode.mutate()}
              disabled={!pairingCode.trim() || !pairingCasinoId || approvePairingCode.isPending}
              className="gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" /> {approvePairingCode.isPending ? "Approving..." : "Approve"}
            </Button>
          </div>
      </div>

      {/* Peers list */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">Peers</h3>
          <p className="text-xs text-muted-foreground">
            Symmetric mesh — every paired node mirrors data both ways. No hub.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearStale.mutate()}
            disabled={clearStale.isPending}
            className="gap-1.5"
            title="Remove pending/rejected peers older than 1 hour"
          >
            <Sparkles className="w-3.5 h-3.5" /> Clear Stale
          </Button>
        </div>
      </div>

      <div className="cms-panel overflow-hidden">
        <div className="md:hidden divide-y divide-border">
          {peers.map((p) => (
            <div key={p.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-card-foreground break-words">{p.display_name}</p>
                  <p className="text-xs font-mono text-muted-foreground break-all mt-1">{p.peer_url}</p>
                </div>
                <StatusBadge s={p.status} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div>
                  <span className="block uppercase tracking-wider text-[10px]">Last seen</span>
                  <span>{fmtTime(p.last_seen_at)}</span>
                </div>
                <div>
                  <span className="block uppercase tracking-wider text-[10px]">Push / Pull</span>
                  <span className="font-mono">{p.last_push_cursor} / {p.last_pull_cursor}</span>
                </div>
              </div>
              {(p.last_push_error || p.last_pull_error) && (
                <p className="text-xs text-destructive break-words">{p.last_push_error || p.last_pull_error}</p>
              )}
              <div className="flex justify-end gap-2">
                {p.status === "pending_inbound" && (
                  <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: p.id, status: "active" })} className="gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </Button>
                )}
                {p.status === "active" && (
                  <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: p.id, status: "paused" })} className="gap-1.5">
                    <Pause className="w-3.5 h-3.5" /> Pause
                  </Button>
                )}
                {p.status === "paused" && (
                  <Button variant="outline" size="sm" onClick={() => updateStatus.mutate({ id: p.id, status: "active" })} className="gap-1.5">
                    <Play className="w-3.5 h-3.5" /> Resume
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!confirm(`Remove peer "${p.display_name}"? This stops sync immediately.`)) return;
                    deletePeer.mutate(p.id);
                  }}
                  className="gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </Button>
              </div>
            </div>
          ))}
          {peers.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">No peers paired</div>
          )}
        </div>
        <table className="hidden md:table w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3">Name</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3">URL</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3">Status</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3">Last Seen</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3">Push / Pull</th>
              <th className="text-right text-xs font-medium text-muted-foreground uppercase px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {peers.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-sm font-medium text-card-foreground">{p.display_name}</td>
                <td className="px-4 py-3 text-sm font-mono text-muted-foreground truncate max-w-[280px]">{p.peer_url}</td>
                <td className="px-4 py-3"><StatusBadge s={p.status} /></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{fmtTime(p.last_seen_at)}</td>
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                  {p.last_push_cursor} / {p.last_pull_cursor}
                </td>
                <td className="px-2 py-3">
                  <div className="flex gap-0.5 justify-end items-center">
                    {p.status === "pending_inbound" && (
                      <button
                        onClick={() => updateStatus.mutate({ id: p.id, status: "active" })}
                        className="text-muted-foreground/60 hover:text-success transition-colors p-1"
                        title="Approve"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {p.status === "pending_inbound" && (
                      <button
                        onClick={() => updateStatus.mutate({ id: p.id, status: "rejected" })}
                        className="text-muted-foreground/60 hover:text-destructive transition-colors p-1"
                        title="Reject"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {p.status === "active" && (
                      <button
                        onClick={() => updateStatus.mutate({ id: p.id, status: "paused" })}
                        className="text-muted-foreground/60 hover:text-warning transition-colors p-1"
                        title="Pause sync"
                      >
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {p.status === "paused" && (
                      <button
                        onClick={() => updateStatus.mutate({ id: p.id, status: "active" })}
                        className="text-muted-foreground/60 hover:text-success transition-colors p-1"
                        title="Resume sync"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (!confirm(`Remove peer "${p.display_name}"? This stops sync immediately.`)) return;
                        deletePeer.mutate(p.id);
                      }}
                      className="text-muted-foreground/40 hover:text-destructive transition-colors p-1"
                      title="Delete peer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {peers.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">No peers paired</td></tr>
            )}
          </tbody>
        </table>
      </div>



      {/* Reveal secret once */}
      <Dialog open={!!secretReveal} onOpenChange={(o) => !o && setSecretReveal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Shared secret — {secretReveal?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Copy this once and paste it on the peer side when they add this node. It will not be shown again.
            </p>
            <pre className="bg-muted p-3 rounded font-mono text-xs break-all whitespace-pre-wrap select-all">
              {secretReveal?.secret}
            </pre>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { if (secretReveal) { navigator.clipboard.writeText(secretReveal.secret); toast.success("Copied"); } }}
            >Copy</Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setSecretReveal(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      
    </div>
  );
};
