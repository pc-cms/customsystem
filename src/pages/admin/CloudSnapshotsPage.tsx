import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface CasinoRow {
  id: string;
  name: string;
  slug: string | null;
  code: string;
}

interface SnapshotMeta {
  slug: string;
  latest_at: string | null;
  size_bytes: number | null;
  loading: boolean;
}

const fmtSize = (b: number | null) => {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
};

export default function CloudSnapshotsPage() {
  const { roles } = useAuth();
  const isSuper = roles.includes("super_admin");
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const { data: casinos = [], isLoading } = useQuery({
    queryKey: ["cloud-snapshots-casinos"],
    queryFn: async (): Promise<CasinoRow[]> => {
      const { data, error } = await supabase
        .from("casinos")
        .select("id,name,slug,code")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CasinoRow[];
    },
    enabled: isSuper,
  });

  const { data: metas = {}, refetch: refetchMetas } = useQuery({
    queryKey: ["cloud-snapshots-meta", casinos.map(c => c.slug).join(",")],
    enabled: isSuper && casinos.length > 0,
    queryFn: async (): Promise<Record<string, SnapshotMeta>> => {
      const out: Record<string, SnapshotMeta> = {};
      for (const c of casinos) {
        if (!c.slug) continue;
        const { data: files } = await supabase.storage
          .from("installer-snapshots")
          .list(c.slug, { limit: 100 });
        const latest = files?.find(f => f.name === "latest.ndjson.gz");
        out[c.slug] = {
          slug: c.slug,
          latest_at: latest?.updated_at ?? latest?.created_at ?? null,
          size_bytes: (latest?.metadata as any)?.size ?? null,
          loading: false,
        };
      }
      return out;
    },
  });

  if (!isSuper) return <Navigate to="/" replace />;

  const buildSnapshot = async (casino: CasinoRow) => {
    setBusy(casino.id);
    try {
      const { data, error } = await supabase.functions.invoke("cloud-snapshot-build", {
        body: { casino_id: casino.id, tag: "manual-ui" },
      });
      if (error) throw error;
      const size = data?.size_bytes ? fmtSize(data.size_bytes) : "?";
      toast.success(`Snapshot built for ${casino.name} (${size})`);
      await refetchMetas();
    } catch (e: any) {
      toast.error(`Build failed: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        icon={Package}
        title="Cloud Snapshots"
        subtitle="Baked NDJSON seeds used by deploy/install.sh for first-boot"
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Snapshots per casino</CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetchMetas()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                <th className="text-left px-4 py-2">Casino</th>
                <th className="text-left px-4 py-2">Slug</th>
                <th className="text-left px-4 py-2">Latest snapshot</th>
                <th className="text-left px-4 py-2">Size</th>
                <th className="text-right px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</td></tr>
              )}
              {!isLoading && casinos.map(c => {
                const meta = c.slug ? metas[c.slug] : undefined;
                const isBusy = busy === c.id;
                return (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {c.slug ?? <span className="italic">no slug</span>}
                    </td>
                    <td className="px-4 py-3">
                      {meta?.latest_at ? (
                        <span title={meta.latest_at}>
                          {formatDistanceToNow(new Date(meta.latest_at), { addSuffix: true })}
                        </span>
                      ) : (
                        <Badge variant="secondary">never built</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{fmtSize(meta?.size_bytes ?? null)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        disabled={!c.slug || isBusy}
                        onClick={() => buildSnapshot(c)}
                        className="gap-1.5"
                      >
                        {isBusy ? (
                          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Building…</>
                        ) : (
                          <><Package className="h-3.5 w-3.5" /> Build snapshot</>
                        )}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && casinos.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No casinos</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Snapshots are written to the private <code className="font-mono">installer-snapshots</code> bucket
        at <code className="font-mono">&lt;slug&gt;/latest.ndjson.gz</code>. The on-prem
        <code className="font-mono"> deploy/install.sh</code> downloads them via signed URL
        (<code className="font-mono">installer-snapshot-url</code>) on first boot.
      </p>
    </div>
  );
}
