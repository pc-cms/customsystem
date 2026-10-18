/**
 * TableManagement — Manager UI to:
 *  - Create new gaming tables
 *  - Toggle Active/Inactive (archive/restore)
 *  - Rename inline
 *  - Set Display Order (drives sorting across Dashboard, Tables Tracking, Tracker, etc.)
 */
import { useState, useMemo } from "react";
import { useGamingTables, useArchiveTable, useRenameTable } from "@/hooks/use-tables";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { logAction } from "@/lib/logging";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Pencil, LayoutGrid, Plus } from "lucide-react";
import { toast } from "sonner";

const GAME_OPTIONS = [
  "American Roulette",
  "Blackjack",
  "Texas Holdem",
  "Poker",
  "Club Poker",
  "Omaha",
  "PLO",
  "Baccarat",
  "Niu Niu",
];

const TableManagement = () => {
  const { data: tables = [], isLoading } = useGamingTables(true); // include archived
  const archiveTable = useArchiveTable();
  const renameTable = useRenameTable();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeCasinoId: casinoId } = useCasino();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftOrderId, setDraftOrderId] = useState<string | null>(null);
  const [draftOrder, setDraftOrder] = useState("");

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGame, setNewGame] = useState<string>("American Roulette");
  const [newOrder, setNewOrder] = useState<string>("");

  const nextOrder = useMemo(() => {
    const max = tables.reduce((m, t: any) => Math.max(m, t.display_order ?? 0), 0);
    return max + 10;
  }, [tables]);

  const createTable = useMutation({
    mutationFn: async () => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const name = newName.trim();
      if (!name) throw new Error("Name is required");
      const order = newOrder.trim() === "" ? nextOrder : Number(newOrder);
      const { error } = await supabase.from("gaming_tables").insert({
        casino_id: casinoId,
        name,
        game: newGame,
        display_order: order,
        // New tables are created closed; opening is a Pit action guarded by Live Start.
        status: "closed",
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gaming-tables"] });
      toast.success("Table created");
      setNewName("");
      setNewOrder("");
      setShowCreate(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setOrder = useMutation({
    mutationFn: async ({ tableId, order }: { tableId: string; order: number }) => {
      if (!casinoId || !user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("gaming_tables")
        .update({ display_order: order } as any)
        .eq("id", tableId);
      if (error) throw error;
      await logAction(casinoId, "system", "TABLE_REORDERED", { table_id: tableId, display_order: order });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gaming-tables"] });
      setDraftOrderId(null);
      setDraftOrder("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEdit = (id: string, current: string) => { setEditingId(id); setDraftName(current); };
  const cancelEdit = () => { setEditingId(null); setDraftName(""); };
  const commitEdit = (id: string, original: string) => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === original) { cancelEdit(); return; }
    renameTable.mutate({ tableId: id, name: trimmed }, { onSuccess: () => cancelEdit() });
  };

  const commitOrder = (id: string) => {
    const n = Number(draftOrder);
    if (!Number.isFinite(n)) { setDraftOrderId(null); return; }
    setOrder.mutate({ tableId: id, order: n });
  };

  const sorted = [...tables].sort((a: any, b: any) => {
    if (a.is_archived !== b.is_archived) return a.is_archived ? 1 : -1;
    return ((a.display_order ?? 0) - (b.display_order ?? 0)) || a.name.localeCompare(b.name);
  });

  const activeCount = tables.filter(t => !t.is_archived).length;
  const inactiveCount = tables.length - activeCount;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <LayoutGrid className="w-5 h-5" /> Gaming Tables
          </h2>
          <p className="text-xs text-muted-foreground">
            Create, rename, set sort order, and toggle Active / Inactive. Display Order drives sorting across Dashboard, Tables Tracking, Tracker.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-success/30 text-success">{activeCount} Active</Badge>
          {inactiveCount > 0 && (
            <Badge variant="outline" className="border-muted text-muted-foreground">{inactiveCount} Inactive</Badge>
          )}
          <Button size="sm" onClick={() => setShowCreate(v => !v)} className="gap-1.5">
            <Plus className="w-4 h-4" /> {showCreate ? "Cancel" : "Add Table"}
          </Button>
        </div>
      </div>

      {showCreate && (
        <div className="cms-panel p-4 space-y-3 border-primary/30">
          <h3 className="text-sm font-semibold">New Table</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Short Name</label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. CP1" className="font-mono" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Game</label>
              <Select value={newGame} onValueChange={setNewGame}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GAME_OPTIONS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Display Order</label>
              <Input
                type="number"
                value={newOrder}
                onChange={e => setNewOrder(e.target.value)}
                placeholder={String(nextOrder)}
                className="font-mono"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={() => createTable.mutate()} disabled={createTable.isPending} className="w-full">
                Create
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Tip: lower Display Order = appears first. Leave blank to append. Use gaps of 10 so you can insert new tables between existing ones.
          </p>
        </div>
      )}

      <div className="cms-panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3 w-[100px]">Order</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3">Name</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3">Game</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3 w-[120px]">Status</th>
              <th className="text-center text-xs font-medium text-muted-foreground uppercase px-4 py-3 w-[120px]">Active</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t: any) => {
              const isEditing = editingId === t.id;
              const isInactive = t.is_archived;
              const isOrderEditing = draftOrderId === t.id;
              return (
                <tr key={t.id} className={`border-b border-border last:border-0 ${isInactive ? "opacity-60" : ""}`}>
                  <td className="px-4 py-2">
                    {isOrderEditing ? (
                      <div className="flex items-center gap-1">
                        <Input
                          autoFocus
                          type="number"
                          value={draftOrder}
                          onChange={e => setDraftOrder(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") commitOrder(t.id);
                            if (e.key === "Escape") { setDraftOrderId(null); setDraftOrder(""); }
                          }}
                          onBlur={() => commitOrder(t.id)}
                          className="h-8 w-20 text-sm font-mono"
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setDraftOrderId(t.id); setDraftOrder(String(t.display_order ?? 0)); }}
                        className="font-mono text-sm text-muted-foreground hover:text-primary"
                        title="Click to change display order"
                      >
                        {t.display_order ?? 0}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          autoFocus
                          value={draftName}
                          onChange={e => setDraftName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") commitEdit(t.id, t.name);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          className="h-8 text-sm font-mono max-w-[200px]"
                        />
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => commitEdit(t.id, t.name)} disabled={renameTable.isPending} aria-label="Save">
                          <Check className="w-4 h-4 text-success" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit} aria-label="Cancel">
                          <X className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(t.id, t.name)}
                        className="group flex items-center gap-2 text-left font-mono font-semibold text-card-foreground hover:text-primary transition-colors"
                        title="Click to rename"
                      >
                        <span>{t.name}</span>
                        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{t.game}</td>
                  <td className="px-4 py-2">
                    {isInactive ? (
                      <Badge variant="outline" className="text-[10px] border-muted text-muted-foreground">Inactive</Badge>
                    ) : t.status === "closed" ? (
                      <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">Closed (shift)</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] border-success/40 text-success">Open</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <Switch
                      checked={!isInactive}
                      disabled={archiveTable.isPending}
                      onCheckedChange={(checked) => archiveTable.mutate({ tableId: t.id, archive: !checked })}
                      aria-label={isInactive ? "Activate table" : "Deactivate table"}
                    />
                  </td>
                </tr>
              );
            })}
            {tables.length === 0 && !isLoading && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-sm text-muted-foreground">No tables configured</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground">
        💡 Inactive tables stay in the database (historical data preserved) but disappear from operational views.
      </p>
    </div>
  );
};

export default TableManagement;
