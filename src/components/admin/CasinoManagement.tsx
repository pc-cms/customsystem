/**
 * CasinoManagement — CRUD list of casinos in the network (super_admin).
 * Extracted from src/pages/Admin.tsx as part of the admin restructure.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getBaseDomain } from "@/lib/casino-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const useAllCasinos = () => useQuery({
  queryKey: ["all-casinos"],
  queryFn: async () => {
    const { data, error } = await supabase.from("casinos").select("*").order("name");
    if (error) throw error;
    return data;
  },
});

export const CasinoManagement = () => {
  const { data: casinos = [], isLoading } = useAllCasinos();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [slug, setSlug] = useState("");

  const createCasino = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("casinos").insert({
        name, code: code.toUpperCase(), slug: slug.toLowerCase(),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-casinos"] });
      toast.success(`Casino "${name}" created`);
      setShowCreate(false); setName(""); setCode(""); setSlug("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-card-foreground">All Casinos</h3>
        <Button onClick={() => setShowCreate(true)} className="gap-1.5">
          <Plus className="w-4 h-4" /> Create Casino
        </Button>
      </div>

      <div className="cms-panel overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3">Name</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3">Code</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3">Subdomain</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3">ID</th>
            </tr>
          </thead>
          <tbody>
            {casinos.map((c: any) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-sm font-medium text-card-foreground">{c.name}</td>
                <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{c.code}</td>
                <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                  {c.slug ? `${c.slug}.${getBaseDomain()}` : "—"}
                </td>
                <td className="px-4 py-3 text-xs font-mono text-muted-foreground/60">{c.id.slice(0, 8)}</td>
              </tr>
            ))}
            {casinos.length === 0 && !isLoading && (
              <tr><td colSpan={4} className="text-center py-8 text-sm text-muted-foreground">No casinos yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Create Casino</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Arusha" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Code</label>
              <Input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. ARU" className="font-mono uppercase" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Subdomain slug</label>
              <Input value={slug} onChange={e => setSlug(e.target.value.replace(/[^a-z0-9-]/g, ""))} placeholder="e.g. arusha" className="font-mono" />
              <p className="text-[10px] text-muted-foreground mt-1">{slug ? `${slug}.${getBaseDomain()}` : "Will be used as subdomain"}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createCasino.mutate()} disabled={!name || !code || !slug || createCasino.isPending}>
              {createCasino.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CasinoManagement;
