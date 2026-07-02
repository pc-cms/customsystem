import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, ShieldCheck, ShieldAlert, Ban, HardDrive } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface UploadRow {
  id: string;
  node_id: string;
  casino_id: string | null;
  uploaded_at: string;
  size_bytes: number;
  sha256: string;
  chunk_count: number;
  rows_by_table: Record<string, number>;
  status: string;
}
interface ReportRow {
  id: string;
  upload_id: string;
  node_id: string;
  ran_at: string;
  overall: string;
  regressions: number;
  checks: Array<{ name: string; ok: boolean; detail?: unknown }>;
}
interface Combined extends UploadRow {
  report?: ReportRow;
  hostname?: string | null;
}

const fmtSize = (b: number) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};

const overallBadge = (o?: string) => {
  if (o === "pass") return <Badge className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/30"><ShieldCheck className="h-3 w-3" />pass</Badge>;
  if (o === "regression") return <Badge variant="destructive" className="gap-1"><Ban className="h-3 w-3" />regression</Badge>;
  if (o === "warning") return <Badge className="gap-1 bg-amber-500/10 text-amber-600 border-amber-500/30"><ShieldAlert className="h-3 w-3" />warning</Badge>;
  return <Badge variant="secondary">pending</Badge>;
};

export default function CloneStatusPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();

  const { data: uploads } = useQuery({
    queryKey: ["clone-uploads"],
    queryFn: async (): Promise<UploadRow[]> => {
      const { data, error } = await supabase
        .from("cloud_clone_uploads")
        .select("*")
        .order("uploaded_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as UploadRow[];
    },
    refetchInterval: 60_000,
  });

  const { data: reports } = useQuery({
    queryKey: ["clone-reports"],
    queryFn: async (): Promise<ReportRow[]> => {
      const { data, error } = await supabase
        .from("cloud_clone_reports")
        .select("*")
        .order("ran_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ReportRow[];
    },
    refetchInterval: 60_000,
  });

  const { data: fleet } = useQuery({
    queryKey: ["clone-fleet-lookup"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fleet_heartbeats").select("node_id, hostname");
      return (data ?? []) as Array<{ node_id: string; hostname: string | null }>;
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("clone-uploads-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "cloud_clone_uploads" },
        () => qc.invalidateQueries({ queryKey: ["clone-uploads"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "cloud_clone_reports" },
        () => qc.invalidateQueries({ queryKey: ["clone-reports"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const rows: Combined[] = useMemo(() => {
    const reportByUpload = new Map((reports ?? []).map((r) => [r.upload_id, r]));
    const hostByNode = new Map((fleet ?? []).map((f) => [f.node_id, f.hostname]));
    // one row per node — latest upload
    const latestByNode = new Map<string, UploadRow>();
    for (const u of uploads ?? []) if (!latestByNode.has(u.node_id)) latestByNode.set(u.node_id, u);
    return Array.from(latestByNode.values()).map((u) => ({
      ...u, report: reportByUpload.get(u.id), hostname: hostByNode.get(u.node_id) ?? null,
    }));
  }, [uploads, reports, fleet]);

  const stats = useMemo(() => {
    const total = rows.length;
    const pass = rows.filter((r) => r.report?.overall === "pass").length;
    const reg = rows.filter((r) => r.report?.overall === "regression").length;
    const pending = rows.filter((r) => !r.report).length;
    return { total, pass, reg, pending };
  }, [rows]);

  if (!hasRole?.("super_admin")) return <Navigate to="/" replace />;

  const downloadDump = async (row: Combined) => {
    // list chunks then create signed URLs
    const { data, error } = await supabase.storage.from("cloud-clones")
      .list(`${row.node_id}/${row.id}`, { limit: 100 });
    if (error || !data?.length) { alert("No chunks in Storage"); return; }
    const paths = data.map((f) => `${row.node_id}/${row.id}/${f.name}`);
    const { data: signed } = await supabase.storage.from("cloud-clones")
      .createSignedUrls(paths, 3600);
    const urls = (signed ?? []).map((s) => s.signedUrl).filter(Boolean);
    if (!urls.length) { alert("Failed to sign URLs"); return; }
    for (const u of urls) window.open(u, "_blank");
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{stats.total}</div><div className="text-xs text-muted-foreground">Boxes reporting</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-emerald-500">{stats.pass}</div><div className="text-xs text-muted-foreground">Latest pass</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-destructive">{stats.reg}</div><div className="text-xs text-muted-foreground">Regression</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold text-amber-500">{stats.pending}</div><div className="text-xs text-muted-foreground">Awaiting smoke-test</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Cloud clones — latest per box</CardTitle>
          <Button size="sm" variant="ghost"
            onClick={() => { qc.invalidateQueries({ queryKey: ["clone-uploads"] }); qc.invalidateQueries({ queryKey: ["clone-reports"] }); }}>
            <RefreshCw className="h-4 w-4 mr-1" />Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Node</th>
                  <th className="text-left px-3 py-2">Uploaded</th>
                  <th className="text-left px-3 py-2">Size / chunks</th>
                  <th className="text-left px-3 py-2">SHA-256</th>
                  <th className="text-left px-3 py-2">Smoke-test</th>
                  <th className="text-right px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No clones uploaded yet.</td></tr>
                ) : rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/20 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.hostname ?? r.node_id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.node_id.slice(0, 12)}…</div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary">
                        {formatDistanceToNow(new Date(r.uploaded_at), { addSuffix: true })}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {fmtSize(r.size_bytes)} · {r.chunk_count}c
                    </td>
                    <td className="px-3 py-2 font-mono text-xs truncate max-w-[160px]" title={r.sha256}>
                      {r.sha256.slice(0, 12)}…
                    </td>
                    <td className="px-3 py-2 space-y-1">
                      {overallBadge(r.report?.overall)}
                      {r.report && r.report.regressions > 0 && (
                        <div className="text-xs text-destructive">{r.report.regressions} regression(s)</div>
                      )}
                      {r.report && (
                        <details className="text-xs text-muted-foreground">
                          <summary className="cursor-pointer">details</summary>
                          <ul className="pl-3 pt-1 space-y-0.5">
                            {r.report.checks.map((c) => (
                              <li key={c.name} className={c.ok ? "text-emerald-600" : "text-destructive"}>
                                {c.ok ? "✓" : "✗"} {c.name}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => downloadDump(r)} title="Download chunks">
                        <HardDrive className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
