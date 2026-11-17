/**
 * MirrorCutoverPanel — true 1:1 parity gate between this node and Cloud.
 *
 * Compares every parity-required table from `sync_table_registry`:
 *   row_count + ids_checksum + rows_checksum + max_change_ts.
 *
 * "Ready for Primary" only when every critical table matches 100%.
 * On a non-Cloud node we additionally call the `mirror-parity` edge function
 * on Cloud to fetch its snapshot for comparison.
 *
 * Works on Cloud too (just shows the local snapshot — useful as "what should
 * the mirror look like" reference).
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSection } from "@/components/layout/PageShell";
import { Loader2, ShieldCheck, RefreshCw, AlertTriangle, CheckCircle2, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { fmtDateTime } from "@/lib/format-date";
import { toast } from "sonner";
import { useReplicationMode } from "@/hooks/use-replication-mode";

interface ParityRow {
  table_name: string;
  scope: "casino" | "global" | "user_system";
  critical: boolean;
  row_count: number | null;
  ids_checksum: string | null;
  rows_checksum: string | null;
  max_change_ts: string | null;
}

interface ParityResponse {
  casino_id: string;
  captured_at: string;
  rows: ParityRow[];
}

type RowStatus = "match" | "rows_differ" | "ids_differ" | "count_differ" | "missing_remote" | "missing_local";

function classifyRow(local: ParityRow | undefined, remote: ParityRow | undefined): RowStatus {
  if (!local || local.row_count === null) return "missing_local";
  if (!remote || remote.row_count === null) return "missing_remote";
  if ((local.row_count ?? 0) !== (remote.row_count ?? 0)) return "count_differ";
  if (local.ids_checksum !== remote.ids_checksum) return "ids_differ";
  if (local.rows_checksum && remote.rows_checksum && local.rows_checksum !== remote.rows_checksum) {
    return "rows_differ";
  }
  return "match";
}

const STATUS_LABEL: Record<RowStatus, { label: string; tone: "ok" | "warn" | "err" }> = {
  match:           { label: "match",          tone: "ok"   },
  rows_differ:     { label: "row content",    tone: "err"  },
  ids_differ:      { label: "different ids",  tone: "err"  },
  count_differ:    { label: "count differs",  tone: "err"  },
  missing_remote:  { label: "missing remote", tone: "warn" },
  missing_local:   { label: "missing local",  tone: "err"  },
};

const CLOUD_HOSTS = new Set([
  "casinosystem.app",
  "www.casinosystem.app",
  "premier.casinosystem.app",
  "arusha.casinosystem.app",
  "mwanza.casinosystem.app",
  "dodoma.casinosystem.app",
  "mbeya.casinosystem.app",
  "casinosystem.lovable.app",
]);

function detectIsLocalNode(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  if (CLOUD_HOSTS.has(h)) return false;
  if (h.endsWith(".lovable.app") || h.endsWith(".lovable.dev")) return false;
  // Treat anything else (LAN IPs, *.local) as local node.
  return true;
}

export function MirrorCutoverPanel() {
  const { activeCasinoId, activeCasino } = useCasino();
  const activeName = activeCasino?.name ?? activeCasino?.slug ?? null;
  const isLocalNode = detectIsLocalNode();
  const { mode } = useReplicationMode();

  const [localSnap, setLocalSnap] = useState<ParityResponse | null>(null);
  const [cloudSnap, setCloudSnap] = useState<ParityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runCheck = async () => {
    if (!activeCasinoId) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Local snapshot (this node's database)
      const { data: localData, error: localErr } =
        await supabase.rpc("mirror_full_parity_snapshot", { p_casino_id: activeCasinoId });
      if (localErr) throw localErr;
      const localResp: ParityResponse = {
        casino_id: activeCasinoId,
        captured_at: new Date().toISOString(),
        rows: (localData as ParityRow[]) ?? [],
      };
      setLocalSnap(localResp);

      // 2. Cloud snapshot — only fetched from non-Cloud node
      if (isLocalNode) {
        const { data: cloudData, error: cloudErr } = await supabase.functions.invoke(
          `mirror-parity?casino_id=${activeCasinoId}`,
          { method: "GET" },
        );
        if (cloudErr) throw cloudErr;
        setCloudSnap(cloudData as ParityResponse);
      } else {
        setCloudSnap(null);
      }

      // 3. Record result in cutover state
      if (isLocalNode && localResp && cloudSnap !== undefined) {
        // computed after we have both, see below
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  // Compute comparison
  const comparison = (() => {
    if (!localSnap) return null;
    const localMap = new Map(localSnap.rows.map(r => [r.table_name, r]));
    const remoteMap = new Map((cloudSnap?.rows ?? []).map(r => [r.table_name, r]));
    const tables = Array.from(new Set([...localMap.keys(), ...remoteMap.keys()])).sort();
    const merged = tables.map(t => {
      const local = localMap.get(t);
      const remote = remoteMap.get(t);
      const status = isLocalNode
        ? classifyRow(local, remote)
        : (local && local.row_count !== null ? "match" : "missing_local") as RowStatus;
      return { table: t, local, remote, status, critical: (local ?? remote)?.critical ?? false };
    });
    const criticalRows = merged.filter(r => r.critical);
    const criticalMatch = criticalRows.filter(r => r.status === "match").length;
    const criticalTotal = criticalRows.length;
    const allMatch = isLocalNode && merged.every(r => r.status === "match");
    return { merged, criticalMatch, criticalTotal, allMatch };
  })();

  // Record parity result whenever we have both sides
  const recordParity = async () => {
    if (!activeCasinoId || !comparison || !isLocalNode) return;
    try {
      await supabase.rpc("mirror_record_parity", {
        p_casino_id: activeCasinoId,
        p_ok: comparison.allMatch,
        p_summary: {
          captured_at: new Date().toISOString(),
          critical_match: comparison.criticalMatch,
          critical_total: comparison.criticalTotal,
          mismatched_tables: comparison.merged
            .filter(r => r.status !== "match")
            .map(r => ({ table: r.table, status: r.status, local: r.local?.row_count ?? null, remote: r.remote?.row_count ?? null })),
        },
      });
    } catch {
      /* ignore — non-fatal */
    }
  };

  return (
    <PageSection
      title={
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Mirror Parity (Cutover Gate)
        </span>
      }
      titleRight={
        <Button onClick={runCheck} disabled={loading || !activeCasinoId} size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Run parity check</span>
        </Button>
      }
    >
      <div className="text-xs text-muted-foreground mb-3">
        Compares every business table for <b>{activeName ?? "current casino"}</b> between
        this node and Cloud (row count + id checksum + row checksum). Cloud Primary
        can only be safely replaced when every critical table shows <b>match</b>.
        {!isLocalNode && (
          <span className="block mt-1 italic">
            You are viewing this on Cloud — only the local snapshot is shown here.
            Run this same check on the on-prem server to see the comparison.
          </span>
        )}
      </div>

      {error && (
        <div className="text-sm text-destructive p-3 rounded-md bg-destructive/10 mb-3">
          {error}
        </div>
      )}

      {!comparison && !loading && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Click <b>Run parity check</b> to compute checksums for every table.
        </div>
      )}

      {comparison && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
            {isLocalNode ? (
              comparison.allMatch ? (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  100% match — ready for Primary
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  NOT ready — {comparison.criticalTotal - comparison.criticalMatch} critical mismatch(es)
                </Badge>
              )
            ) : (
              <Badge variant="outline">Local snapshot only (run on local node to compare)</Badge>
            )}
            <span className="text-muted-foreground">
              Critical: <b>{comparison.criticalMatch}</b> / <b>{comparison.criticalTotal}</b> matched
            </span>
            {localSnap && (
              <span className="text-muted-foreground">
                Local at <b>{fmtDateTime(localSnap.captured_at)}</b>
              </span>
            )}
            {cloudSnap && (
              <span className="text-muted-foreground">
                Cloud at <b>{fmtDateTime(cloudSnap.captured_at)}</b>
              </span>
            )}
            {isLocalNode && (
              <Button onClick={recordParity} variant="outline" size="sm">
                Record result
              </Button>
            )}
          </div>

          {/* ── Promote / Demote — Cutover controls ───────────────────── */}
          <div className="flex flex-wrap items-center gap-3 mb-3 p-3 rounded-md border bg-muted/20">
            <span className="text-sm">
              Current mode:{" "}
              <Badge variant={mode === "local_primary" ? "default" : "outline"}>
                {mode === "local_primary" ? "LOCAL PRIMARY" : mode === "cloud_primary" ? "CLOUD PRIMARY" : "unknown"}
              </Badge>
            </span>
            <div className="flex-1" />
            {mode !== "local_primary" && (
              <Button
                size="sm"
                disabled={!comparison.allMatch || promoting || !activeCasinoId}
                onClick={async () => {
                  if (!activeCasinoId) return;
                  if (!confirm(`Promote ${activeName} to LOCAL PRIMARY?\n\nCloud will stop accepting direct writes to operational tables for this casino.`)) return;
                  setPromoting(true);
                  try {
                    await recordParity();
                    const { data, error: e } = await supabase.rpc("promote_to_local_primary", { p_casino_id: activeCasinoId, p_force: false });
                    if (e) throw e;
                    const res = data as any;
                    if (!res?.ok) {
                      toast.error(`Promotion blocked: ${JSON.stringify(res?.check?.reasons ?? [])}`);
                    } else {
                      toast.success("Promoted to LOCAL PRIMARY");
                    }
                  } catch (e: any) {
                    toast.error(String(e?.message ?? e));
                  } finally {
                    setPromoting(false);
                  }
                }}
              >
                {promoting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />}
                <span className="ml-2">Promote to Local Primary</span>
              </Button>
            )}
            {mode === "local_primary" && (
              <Button
                size="sm"
                variant="outline"
                disabled={promoting || !activeCasinoId}
                onClick={async () => {
                  if (!activeCasinoId) return;
                  if (!confirm(`Demote ${activeName} back to CLOUD PRIMARY?\n\nLocal server will become read-only again.`)) return;
                  setPromoting(true);
                  try {
                    const { error: e } = await supabase.rpc("demote_to_cloud_primary", { p_casino_id: activeCasinoId });
                    if (e) throw e;
                    toast.success("Demoted to CLOUD PRIMARY");
                  } catch (e: any) {
                    toast.error(String(e?.message ?? e));
                  } finally {
                    setPromoting(false);
                  }
                }}
              >
                {promoting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownCircle className="h-4 w-4" />}
                <span className="ml-2">Demote to Cloud Primary</span>
              </Button>
            )}
          </div>

          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Table</th>
                  <th className="text-left px-3 py-2 font-medium">Scope</th>
                  <th className="text-right px-3 py-2 font-medium">Local</th>
                  <th className="text-right px-3 py-2 font-medium">Cloud</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {comparison.merged.map((r) => {
                  const info = STATUS_LABEL[r.status];
                  const toneClass = info.tone === "ok"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : info.tone === "warn"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-destructive";
                  return (
                    <tr key={r.table} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {r.table}
                        {r.critical && <span className="ml-1 text-[10px] text-muted-foreground">·crit</span>}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {(r.local ?? r.remote)?.scope ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-xs">
                        {r.local?.row_count ?? "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-xs">
                        {isLocalNode ? (r.remote?.row_count ?? "—") : "·"}
                      </td>
                      <td className={`px-3 py-1.5 text-xs ${toneClass}`}>
                        {info.label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            <b>match</b> = same row count + same id set + same row payloads.
            Differences in <b>count</b>/<b>ids</b>/<b>rows</b> mean the local
            mirror is not a true 1:1 copy yet. Run a full re-clone from Cloud
            before flipping Primary.
          </div>
        </>
      )}
    </PageSection>
  );
}
