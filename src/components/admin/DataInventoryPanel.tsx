/**
 * DataInventoryPanel — per-table row counts + last change timestamp for the
 * current casino. Run on Cloud (premier or <city>.casinosystem.app) AND on
 * the local server (https://<city>.local/admin) — numbers should match
 * table-by-table after sync settles. Any row where Local ≠ Cloud indicates
 * data that hasn't replicated yet.
 *
 * No remote calls: each environment shows its OWN snapshot. Compare visually
 * between the two browser tabs.
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSection } from "@/components/layout/PageShell";
import { Loader2, Database, RefreshCw } from "lucide-react";
import { fmtDateTime } from "@/lib/format-date";

interface Row {
  table_name: string;
  row_count: number | null;
  max_updated_at: string | null;
}

export function DataInventoryPanel() {
  const { activeCasinoId, activeCasino } = useCasino();
  const activeCasinoName = activeCasino?.name ?? activeCasino?.slug ?? null;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [takenAt, setTakenAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const snapshot = async () => {
    if (!activeCasinoId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc("mirror_parity_snapshot", {
        p_casino_id: activeCasinoId,
      });
      if (error) throw error;
      setRows((data as Row[]) ?? []);
      setTakenAt(new Date().toISOString());
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  };

  const total = rows?.reduce((s, r) => s + (r.row_count ?? 0), 0) ?? 0;
  const emptyCount = rows?.filter((r) => (r.row_count ?? 0) === 0).length ?? 0;

  return (
    <PageSection
      title={
        <span className="flex items-center gap-2">
          <Database className="h-4 w-4" /> Data Inventory
        </span>
      }
      titleRight={
        <Button onClick={snapshot} disabled={loading || !activeCasinoId} size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Snapshot</span>
        </Button>
      }
    >
      <div className="text-xs text-muted-foreground mb-3">
        Per-table row counts for <b>{activeCasinoName ?? "current casino"}</b>.
        Run this on both <b>Cloud</b> and <b>Local</b> — the numbers should match
        table-by-table once sync has fully caught up. Mismatches reveal exactly
        which module hasn't replicated.
      </div>

      {error && (
        <div className="text-sm text-destructive p-3 rounded-md bg-destructive/10 mb-3">
          {error}
        </div>
      )}

      {!rows && !loading && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Click <b>Snapshot</b> to count rows in every operational table for this casino.
        </div>
      )}

      {rows && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-3 text-sm text-muted-foreground">
            <span>
              Snapshot at <b>{takenAt ? fmtDateTime(takenAt) : "—"}</b>
            </span>
            <Badge variant="outline">{rows.length} tables</Badge>
            <Badge variant="outline">{total.toLocaleString("fr-FR").replace(/\u202f/g, " ")} total rows</Badge>
            {emptyCount > 0 && <Badge variant="secondary">{emptyCount} empty</Badge>}
          </div>

          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Table</th>
                  <th className="text-right px-3 py-2 font-medium">Rows</th>
                  <th className="text-left px-3 py-2 font-medium">Last change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const empty = (r.row_count ?? 0) === 0;
                  const missing = r.row_count === null;
                  return (
                    <tr key={r.table_name} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-1.5 font-mono text-xs">{r.table_name}</td>
                      <td className={`px-3 py-1.5 text-right font-mono tabular-nums ${
                        missing ? "text-destructive" :
                        empty ? "text-muted-foreground" : "text-foreground"
                      }`}>
                        {missing ? "—" : (r.row_count ?? 0).toLocaleString("fr-FR").replace(/\u202f/g, " ")}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {r.max_updated_at ? fmtDateTime(r.max_updated_at) : "·"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-muted-foreground">
            Tip: open the same page on the other environment (Cloud vs Local) and
            compare row-by-row. If counts match and{" "}
            <span className="font-mono">Last change</span> aligns, the mirror is
            byte-for-byte in sync.
          </div>
        </>
      )}
    </PageSection>
  );
}
