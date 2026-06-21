/**
 * SyncLogPage — dedicated full-screen view of every sync exchange.
 * Filters by peer, direction, status. Pagination. CSV export.
 * Routed at /admin/sync-log (super_admin / finance_manager).
 */
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/layout/PageHeader";
import { RefreshCw, Download, Activity, ArrowLeft, Shield } from "lucide-react";
import { fmtDateTime } from "@/lib/format-date";
import { Link } from "react-router-dom";

type Direction = "pull" | "push" | "clone" | "heartbeat" | "handshake";
type Status = "ok" | "warn" | "error";

interface LogRow {
  id: number;
  peer_link_id: string | null;
  peer_name: string | null;
  peer_node_id: string | null;
  direction: Direction;
  status: Status;
  table_name: string | null;
  row_count: number;
  batch_id: string | null;
  error_text: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

const PAGE_SIZE = 100;

const SyncLogPage = () => {
  const { roles } = useAuth();
  const allowed = roles.includes("super_admin") || roles.includes("finance_manager");

  const [direction, setDirection] = useSessionState<"all" | Direction>("direction", "all");
  const [status, setStatus] = useSessionState<"all" | Status>("status", "all");
  const [peer, setPeer] = useSessionState<string>("peer", "all");
  const [page, setPage] = useState(0);

  const { data: peerOptions = [] } = useQuery({
    enabled: allowed,
    queryKey: ["sync-log-peers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("peer_links" as any).select("id, display_name").order("display_name");
      return (data ?? []) as unknown as { id: string; display_name: string }[];
    },
  });

  const { data: rows = [], refetch, isFetching } = useQuery({
    enabled: allowed,
    queryKey: ["sync-log", direction, status, peer, page],
    queryFn: async (): Promise<LogRow[]> => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("sync_exchange_logs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to);
      if (direction !== "all") q = q.eq("direction", direction);
      if (status !== "all") q = q.eq("status", status);
      if (peer !== "all") q = q.eq("peer_link_id", peer);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as LogRow[];
    },
    refetchInterval: 15_000,
  });

  const csvHref = useMemo(() => {
    if (!rows.length) return "";
    const header = ["time", "peer", "direction", "status", "table", "rows", "batch", "cursor", "error"];
    const lines = rows.map(r => {
      const meta = (r.meta ?? {}) as Record<string, any>;
      const cursor = meta.cursor ?? meta.push_cursor ?? meta.pull_cursor ?? "";
      return [
        r.created_at, r.peer_name ?? "", r.direction, r.status,
        r.table_name ?? "", r.row_count, r.batch_id ?? "", cursor, (r.error_text ?? "").replace(/[\r\n]+/g, " "),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
    });
    const blob = new Blob([header.join(",") + "\n" + lines.join("\n")], { type: "text/csv" });
    return URL.createObjectURL(blob);
  }, [rows]);

  if (!allowed) {
    return (
      <div className="text-center py-16">
        <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground">Access Restricted</h2>
        <p className="text-sm text-muted-foreground mt-1">Sync Log is restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Activity}
        title="Sync Exchange Log"
        subtitle="Every exchange with paired backup nodes"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin" className="gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Admin
          </Link>
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Select value={peer} onValueChange={(v) => { setPeer(v); setPage(0); }}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All peers</SelectItem>
              {peerOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={direction} onValueChange={(v) => { setDirection(v as any); setPage(0); }}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All directions</SelectItem>
              <SelectItem value="pull">Pull</SelectItem>
              <SelectItem value="push">Push</SelectItem>
              <SelectItem value="heartbeat">Heartbeat</SelectItem>
              <SelectItem value="handshake">Handshake</SelectItem>
              <SelectItem value="clone">Clone</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(0); }}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="ok">OK</SelectItem>
              <SelectItem value="warn">Warn</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {csvHref && (
            <Button asChild variant="outline" size="sm">
              <a href={csvHref} download={`sync-log-${new Date().toISOString().slice(0,10)}.csv`} className="gap-1.5">
                <Download className="w-3.5 h-3.5" /> CSV
              </a>
            </Button>
          )}
        </div>
      </div>

      <div className="cms-panel overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-muted-foreground uppercase">
              <th className="text-left px-3 py-2 font-medium">Time</th>
              <th className="text-left px-3 py-2 font-medium">Peer</th>
              <th className="text-left px-3 py-2 font-medium">Direction</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Table</th>
              <th className="text-right px-3 py-2 font-medium">Rows</th>
              <th className="text-left px-3 py-2 font-medium">Cursor / Error</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.map(r => {
              const meta = (r.meta ?? {}) as Record<string, any>;
              const cursor = meta.cursor ?? meta.push_cursor ?? meta.pull_cursor ?? "";
              return (
                <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                  <td className="px-3 py-1.5">{r.peer_name ?? "—"}</td>
                  <td className="px-3 py-1.5 uppercase text-[10px] text-muted-foreground">{r.direction}</td>
                  <td className="px-3 py-1.5">
                    <Badge
                      variant={r.status === "ok" ? "secondary" : r.status === "warn" ? "outline" : "destructive"}
                      className="text-[10px] uppercase"
                    >{r.status}</Badge>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.table_name ?? ""}</td>
                  <td className="px-3 py-1.5 text-right">{r.row_count || ""}</td>
                  <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[420px]">
                    {r.error_text
                      ? <span className="text-destructive">{r.error_text}</span>
                      : (cursor !== "" ? `cur ${cursor}` : "")}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No events match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Page {page + 1} · {rows.length} rows</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
            Previous
          </Button>
          <Button variant="outline" size="sm" disabled={rows.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SyncLogPage;
