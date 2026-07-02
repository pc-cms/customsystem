import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { RefreshCw, Power, Download, ShieldCheck, ShieldAlert, Ban, HardDrive, Rocket } from "lucide-react";
import { useEffect } from "react";

interface FleetRow {
  node_id: string;
  casino_id: string | null;
  hostname: string | null;
  cms_version: string | null;
  license_mode: string | null;
  license_expires_at: string | null;
  local_ip: string | null;
  tailscale_ip: string | null;
  uptime_seconds: number | null;
  cpu_load: number | null;
  disk_used_pct: number | null;
  ram_used_pct: number | null;
  last_seen_at: string;
}

const modeIcon = (m: string | null) => {
  if (m === "full") return <ShieldCheck className="h-4 w-4 text-emerald-500" />;
  if (m === "restricted") return <ShieldAlert className="h-4 w-4 text-amber-500" />;
  if (m === "stopped") return <Ban className="h-4 w-4 text-destructive" />;
  return <ShieldAlert className="h-4 w-4 text-muted-foreground" />;
};

const fmtUptime = (s: number | null) => {
  if (!s) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600);
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
};

export default function FleetOverviewPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["fleet-heartbeats"],
    queryFn: async (): Promise<FleetRow[]> => {
      const { data, error } = await supabase
        .from("fleet_heartbeats")
        .select("*")
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FleetRow[];
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("fleet-heartbeats-live")
      .on("postgres_changes",
        { event: "*", schema: "public", table: "fleet_heartbeats" },
        () => qc.invalidateQueries({ queryKey: ["fleet-heartbeats"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const queueCmd = useMutation({
    mutationFn: async ({ nodeId, kind }: { nodeId: string; kind: "reboot" | "update" | "license_refresh" | "rollback" }) => {
      const { error } = await supabase.from("fleet_commands").insert({ node_id: nodeId, kind });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(`${v.kind} queued`); setBusyId(null); },
    onError: (e: Error) => { toast.error(e.message); setBusyId(null); },
  });

  const stats = useMemo(() => {
    const list = rows ?? [];
    const now = Date.now();
    const online = list.filter(r => now - new Date(r.last_seen_at).getTime() < 10 * 60_000).length;
    const restricted = list.filter(r => r.license_mode === "restricted").length;
    const stopped = list.filter(r => r.license_mode === "stopped").length;
    return { total: list.length, online, restricted, stopped };
  }, [rows]);

  if (!hasRole?.("super_admin")) return <Navigate to="/" replace />;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{stats.total}</div><div className="text-xs text-muted-foreground">Boxes total</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-emerald-500">{stats.online}</div><div className="text-xs text-muted-foreground">Online (10 min)</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-amber-500">{stats.restricted}</div><div className="text-xs text-muted-foreground">Restricted</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-destructive">{stats.stopped}</div><div className="text-xs text-muted-foreground">Stopped</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Fleet</CardTitle>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" asChild>
              <a href="/admin/fleet/actions"><Rocket className="h-4 w-4 mr-1" />Actions</a>
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href="/admin/fleet/clones"><HardDrive className="h-4 w-4 mr-1" />Clones</a>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["fleet-heartbeats"] })}>
              <RefreshCw className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Node</th>
                  <th className="text-left px-3 py-2">Version</th>
                  <th className="text-left px-3 py-2">License</th>
                  <th className="text-left px-3 py-2">Uptime</th>
                  <th className="text-left px-3 py-2">CPU / RAM / Disk</th>
                  <th className="text-left px-3 py-2">IP</th>
                  <th className="text-left px-3 py-2">Last seen</th>
                  <th className="text-right px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">Loading…</td></tr>
                ) : (rows ?? []).length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">No boxes have checked in yet.</td></tr>
                ) : (rows ?? []).map(r => {
                  const stale = Date.now() - new Date(r.last_seen_at).getTime() > 10 * 60_000;
                  return (
                    <tr key={r.node_id} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.hostname ?? r.node_id.slice(0, 8)}</div>
                        <div className="text-xs text-muted-foreground font-mono">{r.node_id.slice(0, 12)}…</div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{r.cms_version ?? "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {modeIcon(r.license_mode)}
                          <span className="capitalize">{r.license_mode ?? "unknown"}</span>
                        </div>
                        {r.license_expires_at && (
                          <div className="text-xs text-muted-foreground">exp {new Date(r.license_expires_at).toLocaleDateString()}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">{fmtUptime(r.uptime_seconds)}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.cpu_load?.toFixed(2) ?? "—"} / {r.ram_used_pct?.toFixed(0) ?? "—"}% / {r.disk_used_pct?.toFixed(0) ?? "—"}%
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        <div>{r.local_ip ?? "—"}</div>
                        {r.tailscale_ip && <div className="text-muted-foreground">TS {r.tailscale_ip}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={stale ? "destructive" : "secondary"}>
                          {formatDistanceToNow(new Date(r.last_seen_at), { addSuffix: true })}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right space-x-1">
                        <Button size="sm" variant="ghost" disabled={busyId === r.node_id}
                          onClick={() => { setBusyId(r.node_id); queueCmd.mutate({ nodeId: r.node_id, kind: "license_refresh" }); }}
                          title="Refresh license">
                          <ShieldCheck className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busyId === r.node_id}
                          onClick={() => { setBusyId(r.node_id); queueCmd.mutate({ nodeId: r.node_id, kind: "update" }); }}
                          title="Trigger update">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busyId === r.node_id}
                          onClick={() => { if (confirm(`Reboot ${r.hostname ?? r.node_id}?`)) { setBusyId(r.node_id); queueCmd.mutate({ nodeId: r.node_id, kind: "reboot" }); } }}
                          title="Reboot">
                          <Power className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
