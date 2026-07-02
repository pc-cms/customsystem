/**
 * FleetActionsPage — Phase E: Fleet Actions v2
 * ---------------------------------------------
 * Super-admin console for:
 *  1. Runbooks (pre-approved SQL snippets)
 *  2. Bulk operations across many boxes (reboot / update / license_refresh / runbook)
 *  3. Forwarded incidents feed from all boxes
 */
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Plus, Play, Trash2, AlertTriangle, CheckCircle2, Bell } from "lucide-react";

interface Runbook {
  id: string; name: string; description: string | null; sql_text: string;
  is_destructive: boolean; requires_confirmation: boolean; created_at: string;
}
interface BulkOp {
  id: string; kind: string; runbook_id: string | null; status: string;
  total_count: number; done_count: number; error_count: number;
  target_node_ids: string[]; created_at: string; completed_at: string | null;
}
interface Incident {
  id: string; node_id: string; severity: string; category: string | null;
  title: string; body: string | null; occurred_at: string;
  acknowledged_at: string | null;
}
interface Box { node_id: string; hostname: string | null; last_seen_at: string; }

const sevColor = (s: string) => ({
  critical: "bg-destructive text-destructive-foreground",
  error: "bg-destructive/80 text-destructive-foreground",
  warn: "bg-amber-500 text-white",
  warning: "bg-amber-500 text-white",
  info: "bg-muted text-foreground",
}[s] ?? "bg-muted text-foreground");

export default function FleetActionsPage() {
  const { hasRole } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("runbooks");
  const [rbDialog, setRbDialog] = useState(false);
  const [bulkDialog, setBulkDialog] = useState(false);

  const { data: runbooks } = useQuery({
    queryKey: ["fleet-runbooks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fleet_runbooks").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Runbook[];
    },
  });

  const { data: bulks } = useQuery({
    queryKey: ["fleet-bulk-ops"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fleet_bulk_operations").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as BulkOp[];
    },
    refetchInterval: 15_000,
  });

  const { data: incidents } = useQuery({
    queryKey: ["fleet-incidents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fleet_incident_forwards").select("*").order("occurred_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as Incident[];
    },
    refetchInterval: 30_000,
  });

  const { data: boxes } = useQuery({
    queryKey: ["fleet-boxes-brief"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fleet_heartbeats").select("node_id,hostname,last_seen_at");
      if (error) throw error;
      return (data ?? []) as Box[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("fleet-actions-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "fleet_bulk_operations" },
          () => qc.invalidateQueries({ queryKey: ["fleet-bulk-ops"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "fleet_incident_forwards" },
          () => qc.invalidateQueries({ queryKey: ["fleet-incidents"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const ackIncident = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fleet_incident_forwards")
        .update({ acknowledged_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["fleet-incidents"] }),
  });

  const openIncidents = useMemo(() => (incidents ?? []).filter(i => !i.acknowledged_at).length, [incidents]);

  if (!hasRole?.("super_admin")) return <Navigate to="/" replace />;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="runbooks">Runbooks</TabsTrigger>
          <TabsTrigger value="bulk">Bulk operations</TabsTrigger>
          <TabsTrigger value="incidents">
            Incidents {openIncidents > 0 && <Badge variant="destructive" className="ml-2">{openIncidents}</Badge>}
          </TabsTrigger>
        </TabsList>

        {/* ── Runbooks ─────────────────────────────────────── */}
        <TabsContent value="runbooks">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>SQL runbooks</CardTitle>
              <Button size="sm" onClick={() => setRbDialog(true)}><Plus className="w-4 h-4 mr-1" />New runbook</Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Description</th>
                    <th className="text-left px-3 py-2">Flags</th>
                    <th className="text-right px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(runbooks ?? []).length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">No runbooks yet.</td></tr>
                  ) : (runbooks ?? []).map(r => (
                    <tr key={r.id} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.description ?? "—"}</td>
                      <td className="px-3 py-2 space-x-1">
                        {r.is_destructive && <Badge variant="destructive">destructive</Badge>}
                        {r.requires_confirmation && <Badge variant="secondary">confirm</Badge>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => {
                          if (!confirm(`Delete runbook "${r.name}"?`)) return;
                          supabase.from("fleet_runbooks").delete().eq("id", r.id)
                            .then(() => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["fleet-runbooks"] }); });
                        }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Bulk ops ─────────────────────────────────────── */}
        <TabsContent value="bulk">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Bulk operations</CardTitle>
              <Button size="sm" onClick={() => setBulkDialog(true)}><Play className="w-4 h-4 mr-1" />New bulk run</Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Kind</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Progress</th>
                    <th className="text-left px-3 py-2">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {(bulks ?? []).length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">No bulk runs yet.</td></tr>
                  ) : (bulks ?? []).map(b => (
                    <tr key={b.id} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs">{b.kind}</td>
                      <td className="px-3 py-2">
                        <Badge variant={b.status === "completed" ? "secondary" : b.status === "running" ? "default" : "outline"}>
                          {b.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {b.done_count}/{b.total_count}
                        {b.error_count > 0 && <span className="text-destructive ml-1">({b.error_count} err)</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Incidents ────────────────────────────────────── */}
        <TabsContent value="incidents">
          <Card>
            <CardHeader><CardTitle>Forwarded incidents</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Severity</th>
                    <th className="text-left px-3 py-2">Node</th>
                    <th className="text-left px-3 py-2">Title</th>
                    <th className="text-left px-3 py-2">When</th>
                    <th className="text-right px-3 py-2">Ack</th>
                  </tr>
                </thead>
                <tbody>
                  {(incidents ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No incidents forwarded yet.</td></tr>
                  ) : (incidents ?? []).map(i => {
                    const box = (boxes ?? []).find(b => b.node_id === i.node_id);
                    return (
                      <tr key={i.id} className={`border-t ${i.acknowledged_at ? "opacity-60" : ""}`}>
                        <td className="px-3 py-2"><Badge className={sevColor(i.severity)}>{i.severity}</Badge></td>
                        <td className="px-3 py-2 text-xs">{box?.hostname ?? i.node_id.slice(0, 8)}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{i.title}</div>
                          {i.body && <div className="text-xs text-muted-foreground">{i.body}</div>}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(i.occurred_at), { addSuffix: true })}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {i.acknowledged_at
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                            : <Button size="sm" variant="ghost" onClick={() => ackIncident.mutate(i.id)}>
                                <Bell className="w-4 h-4" />
                              </Button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <RunbookDialog open={rbDialog} onOpenChange={setRbDialog}
        onSaved={() => qc.invalidateQueries({ queryKey: ["fleet-runbooks"] })} />
      <BulkOpDialog open={bulkDialog} onOpenChange={setBulkDialog}
        boxes={boxes ?? []} runbooks={runbooks ?? []}
        onDispatched={() => qc.invalidateQueries({ queryKey: ["fleet-bulk-ops"] })} />
    </div>
  );
}

/* ── Dialogs ───────────────────────────────────────────────── */

function RunbookDialog({ open, onOpenChange, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sql, setSql] = useState("");
  const [destructive, setDestructive] = useState(false);

  const save = async () => {
    if (!name.trim() || !sql.trim()) { toast.error("Name and SQL required"); return; }
    const { error } = await supabase.from("fleet_runbooks").insert({
      name: name.trim(), description: description.trim() || null, sql_text: sql,
      is_destructive: destructive, requires_confirmation: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Runbook saved");
    setName(""); setDescription(""); setSql(""); setDestructive(false);
    onSaved(); onOpenChange(false);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="New runbook"
      description="Pre-approved SQL snippet that boxes will execute on demand.">
      <div className="space-y-3">
        <Input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
        <Input placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} />
        <Textarea placeholder="SELECT ..." value={sql} onChange={e => setSql(e.target.value)} rows={8} className="font-mono text-xs" />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={destructive} onCheckedChange={c => setDestructive(!!c)} />
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Destructive (UPDATE / DELETE / DROP)
        </label>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function BulkOpDialog({ open, onOpenChange, boxes, runbooks, onDispatched }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  boxes: Box[]; runbooks: Runbook[]; onDispatched: () => void;
}) {
  const [kind, setKind] = useState<"reboot" | "update" | "license_refresh" | "runbook">("license_refresh");
  const [runbookId, setRunbookId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const dispatch = async () => {
    if (selected.size === 0) { toast.error("Select at least one box"); return; }
    if (kind === "runbook" && !runbookId) { toast.error("Select a runbook"); return; }

    let payload: any = {};
    if (kind === "runbook") {
      const rb = runbooks.find(r => r.id === runbookId);
      if (!rb) return;
      if (rb.is_destructive && !confirm(`Runbook "${rb.name}" is destructive. Continue on ${selected.size} node(s)?`)) return;
      payload = { sql_text: rb.sql_text };
    }

    const { data, error } = await supabase.from("fleet_bulk_operations").insert({
      kind, runbook_id: kind === "runbook" ? runbookId : null,
      payload, target_node_ids: Array.from(selected),
    }).select("id").single();
    if (error) { toast.error(error.message); return; }

    const { error: dispErr } = await supabase.rpc("fleet_dispatch_bulk", { _bulk_id: data.id });
    if (dispErr) { toast.error(dispErr.message); return; }

    toast.success(`Dispatched to ${selected.size} node(s)`);
    setSelected(new Set()); setRunbookId("");
    onDispatched(); onOpenChange(false);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Bulk operation"
      description="Queue a command across multiple boxes at once.">
      <div className="space-y-3">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Kind</label>
          <select value={kind} onChange={e => setKind(e.target.value as any)}
            className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="license_refresh">license_refresh</option>
            <option value="update">update</option>
            <option value="reboot">reboot</option>
            <option value="runbook">runbook</option>
          </select>
        </div>
        {kind === "runbook" && (
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Runbook</label>
            <select value={runbookId} onChange={e => setRunbookId(e.target.value)}
              className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">— select —</option>
              {runbooks.map(r => (
                <option key={r.id} value={r.id}>{r.name}{r.is_destructive ? " ⚠" : ""}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Target boxes ({selected.size}/{boxes.length})
            </label>
            <div className="space-x-1">
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(boxes.map(b => b.node_id)))}>All</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>None</Button>
            </div>
          </div>
          <div className="border rounded-md max-h-56 overflow-y-auto">
            {boxes.map(b => (
              <label key={b.node_id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 cursor-pointer text-sm">
                <Checkbox checked={selected.has(b.node_id)} onCheckedChange={() => toggle(b.node_id)} />
                <span className="flex-1">{b.hostname ?? b.node_id.slice(0, 12)}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(b.last_seen_at), { addSuffix: true })}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={dispatch}>Dispatch</Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
