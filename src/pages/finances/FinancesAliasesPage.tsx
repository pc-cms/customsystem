import { useState, useMemo } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { Tag, Trash2, Search, Merge } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFinCategories } from "@/hooks/use-fin";
import { fmtDateTime } from "@/lib/format-date";

const useAliases = () =>
  useQuery({
    queryKey: ["fin-category-aliases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fin_category_aliases")
        .select("*, fin_categories(name, group_name)")
        .order("alias_norm");
      if (error) throw error;
      return data || [];
    },
  });

export default function FinancesAliasesPage() {
  const qc = useQueryClient();
  const { data: aliases = [] } = useAliases();
  const { data: cats = [] } = useFinCategories();
  const [search, setSearch] = useSessionState("search", "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState<string>("");

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return aliases;
    return aliases.filter((a: any) =>
      a.alias_original?.toLowerCase().includes(s) ||
      a.fin_categories?.name?.toLowerCase().includes(s)
    );
  }, [aliases, search]);

  const allChecked = filtered.length > 0 && filtered.every((a: any) => selected.has(a.id));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtered.map((a: any) => a.id)));
  };

  const update = useMutation({
    mutationFn: async ({ id, category_id }: { id: string; category_id: string }) => {
      const { error } = await supabase.from("fin_category_aliases").update({ category_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-category-aliases"] });
      toast.success("Mapping updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("fin_category_aliases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fin-category-aliases"] });
      toast.success("Alias removed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkReassign = useMutation({
    mutationFn: async () => {
      if (!bulkTarget || !selected.size) throw new Error("Select aliases and target category");
      const ids = Array.from(selected);
      const { error } = await supabase
        .from("fin_category_aliases")
        .update({ category_id: bulkTarget })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["fin-category-aliases"] });
      toast.success(`Reassigned ${n} alias${n === 1 ? "" : "es"}`);
      setSelected(new Set());
      setBulkTarget("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkDelete = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      const { error } = await supabase.from("fin_category_aliases").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["fin-category-aliases"] });
      toast.success(`Removed ${n} alias${n === 1 ? "" : "es"}`);
      setSelected(new Set());
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <PageShell>
      <PageHeader
        icon={Tag}
        title="Excel Aliases"
        subtitle={`${aliases.length} learned mappings · used by Excel Import for auto-matching`}
      />
      <PageSection card={false}>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search alias or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7"
            />
          </div>
          {selected.size > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              <Select value={bulkTarget} onValueChange={setBulkTarget}>
                <SelectTrigger className="h-8 text-xs w-[280px]">
                  <SelectValue placeholder="Reassign to category…" />
                </SelectTrigger>
                <SelectContent>
                  {cats.map((c: any) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.group_name} → {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => bulkReassign.mutate()}
                disabled={!bulkTarget || bulkReassign.isPending}
              >
                <Merge className="w-3.5 h-3.5 mr-1" />
                Merge
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (confirm(`Delete ${selected.size} alias${selected.size === 1 ? "" : "es"}?`)) bulkDelete.mutate();
                }}
                disabled={bulkDelete.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
        <div className="rounded-md border border-border overflow-auto max-h-[70vh]">
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="px-2 py-2 w-8"><Checkbox checked={allChecked} onCheckedChange={toggleAll} /></th>
                <th className="px-3 py-2 text-left">Excel label</th>
                <th className="px-3 py-2 text-left">Normalized</th>
                <th className="px-3 py-2 text-left">Mapped category</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a: any) => (
                <tr key={a.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-2 py-1.5">
                    <Checkbox
                      checked={selected.has(a.id)}
                      onCheckedChange={(c) => {
                        const next = new Set(selected);
                        if (c) next.add(a.id); else next.delete(a.id);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td className="px-3 py-1.5">{a.alias_original}</td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{a.alias_norm}</td>
                  <td className="px-3 py-1.5">
                    <Select
                      value={a.category_id}
                      onValueChange={(v) => update.mutate({ id: a.id, category_id: v })}
                    >
                      <SelectTrigger className="h-7 text-xs w-[280px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {cats.map((c: any) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs">
                            {c.group_name} → {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{fmtDateTime(a.created_at)}</td>
                  <td className="px-3 py-1.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => {
                        if (confirm(`Remove alias "${a.alias_original}"?`)) remove.mutate(a.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} className="text-center text-muted-foreground py-6">
                    {search ? "No matches" : "No aliases yet — confirm mappings during Excel Import"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageSection>
    </PageShell>
  );
}
