/**
 * ServersAndPeersPanel — unified server & peer management for super_admin.
 * Groups the existing panels + adds explicit duplicate detection banner
 * with a Cleanup action for stale/duplicate peer_links entries.
 *
 * Duplicates are peers that share peer_url OR peer_node_id. We flag them
 * visually (banner + counts); actual per-row Delete/Pause is available in
 * PeerLinksPanel below via its existing controls.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ServerIdentityPanel } from "./ServerIdentityPanel";
import { SyncStatusPanel } from "./SyncStatusPanel";
import { MirrorHealthPanel } from "./MirrorHealthPanel";
import { PeerLinksPanel } from "./PeerLinksPanel";
import { ApplyErrorsPanel } from "./ApplyErrorsPanel";
import { LocalUpdaterPanel } from "./LocalUpdaterPanel";
import { DataInventoryPanel } from "./DataInventoryPanel";
import { CutoverWizardPanel } from "./CutoverWizardPanel";
import { MirrorCutoverPanel } from "./MirrorCutoverPanel";
import { SyncMirrorPanel } from "./SyncMirrorPanel";

type PeerRow = {
  id: string;
  peer_url: string;
  peer_node_id: string | null;
  display_name: string;
  status: string;
  last_seen_at: string | null;
};

const useDuplicatePeers = () => useQuery({
  queryKey: ["peer-links-dupes"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("peer_links" as any)
      .select("id, peer_url, peer_node_id, display_name, status, last_seen_at")
      .order("last_seen_at", { ascending: false, nullsFirst: false });
    if (error) throw error;
    const peers = (data ?? []) as unknown as PeerRow[];

    const byUrl = new Map<string, PeerRow[]>();
    const byNode = new Map<string, PeerRow[]>();
    for (const p of peers) {
      const urlKey = (p.peer_url || "").toLowerCase().trim();
      if (urlKey) {
        const arr = byUrl.get(urlKey) ?? [];
        arr.push(p);
        byUrl.set(urlKey, arr);
      }
      if (p.peer_node_id) {
        const arr = byNode.get(p.peer_node_id) ?? [];
        arr.push(p);
        byNode.set(p.peer_node_id, arr);
      }
    }
    const dupUrls = Array.from(byUrl.values()).filter(g => g.length > 1);
    const dupNodes = Array.from(byNode.values()).filter(g => g.length > 1);
    const dupIds = new Set<string>();
    for (const g of [...dupUrls, ...dupNodes]) for (const p of g) dupIds.add(p.id);
    return { total: peers.length, dupUrls, dupNodes, dupIds, peers };
  },
  refetchInterval: 15_000,
});

export const ServersAndPeersPanel = () => {
  const qc = useQueryClient();
  const { data } = useDuplicatePeers();

  const cleanup = useMutation({
    mutationFn: async () => {
      if (!data) return 0;
      // For each duplicate group (by URL then by node), keep the most recently
      // seen row and delete the older ones. `last_seen_at` may be null; those
      // sort last, so they get removed first if a live sibling exists.
      const toDelete = new Set<string>();
      const collect = (group: PeerRow[]) => {
        const sorted = [...group].sort((a, b) => {
          const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
          const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
          return tb - ta;
        });
        for (let i = 1; i < sorted.length; i++) toDelete.add(sorted[i].id);
      };
      data.dupUrls.forEach(collect);
      data.dupNodes.forEach(collect);
      if (toDelete.size === 0) return 0;
      const { error } = await supabase.from("peer_links" as any).delete().in("id", Array.from(toDelete));
      if (error) throw error;
      return toDelete.size;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["peer-links"] });
      qc.invalidateQueries({ queryKey: ["peer-links-dupes"] });
      toast.success(`Cleaned up ${n} duplicate peer${n === 1 ? "" : "s"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dupCount = data?.dupIds.size ?? 0;

  return (
    <div className="space-y-4">
      {dupCount > 0 && (
        <div className="cms-panel border-warning/40 bg-warning/5 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-card-foreground">Duplicate peers detected</h3>
              <Badge variant="outline" className="text-[10px]">{dupCount} rows in {(data?.dupUrls.length ?? 0) + (data?.dupNodes.length ?? 0)} group{((data?.dupUrls.length ?? 0) + (data?.dupNodes.length ?? 0)) === 1 ? "" : "s"}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Several peer records share the same URL or node fingerprint. Cleanup keeps the most recently active row in each group and removes the others.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!confirm(`Remove ${dupCount - (data?.dupUrls.length ?? 0) - (data?.dupNodes.length ?? 0)}+ duplicate peer rows?\n\nThe most recently seen row in each group is kept.`)) return;
              cleanup.mutate();
            }}
            disabled={cleanup.isPending}
            className="gap-1.5 shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" /> {cleanup.isPending ? "Cleaning…" : "Cleanup duplicates"}
          </Button>
        </div>
      )}

      {/* Core: this server + its peers */}
      <ServerIdentityPanel />
      <PeerLinksPanel />
      <SyncStatusPanel />
      <MirrorHealthPanel />

      {/* Advanced: rarely-used tools, collapsed by default */}
      <details className="cms-panel p-4 group">
        <summary className="cursor-pointer text-sm font-semibold text-card-foreground select-none flex items-center gap-2">
          <span className="i-lucide-chevron-right group-open:rotate-90 transition-transform">›</span>
          Advanced — cutover, inventory, updater
        </summary>
        <div className="mt-4 space-y-4">
          <ApplyErrorsPanel />
          <CutoverWizardPanel />
          <MirrorCutoverPanel />
          <DataInventoryPanel />
          <LocalUpdaterPanel />
          <SyncMirrorPanel />
        </div>
      </details>
    </div>
  );
};

export default ServersAndPeersPanel;
