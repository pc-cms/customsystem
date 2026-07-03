/**
 * CasinoAccessManagement — cross-casino access grants for managers.
 * Extracted from src/pages/Admin.tsx.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link2, Unlink } from "lucide-react";
import { toast } from "sonner";

const useProfiles = () => {
  const { activeCasinoId, isSummaryMode } = useCasino();
  return useQuery({
    queryKey: ["all-profiles", isSummaryMode ? "summary" : activeCasinoId],
    queryFn: async () => {
      let query = supabase.from("profiles").select("*");
      if (!isSummaryMode && activeCasinoId) query = query.eq("casino_id", activeCasinoId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: isSummaryMode || !!activeCasinoId,
  });
};

const useAllCasinos = () => useQuery({
  queryKey: ["all-casinos"],
  queryFn: async () => {
    const { data, error } = await supabase.from("casinos").select("*").order("name");
    if (error) throw error;
    return data;
  },
});

const useCasinoAccess = () => useQuery({
  queryKey: ["casino-access"],
  queryFn: async () => {
    const { data, error } = await supabase.from("user_casino_access").select("*");
    if (error) throw error;
    return data;
  },
});

export const CasinoAccessManagement = () => {
  const { data: profiles = [] } = useProfiles();
  const { data: casinos = [] } = useAllCasinos();
  const { data: access = [] } = useCasinoAccess();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedCasino, setSelectedCasino] = useState("");

  const grantAccess = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("user_casino_access").insert({
        user_id: selectedUser, casino_id: selectedCasino, granted_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["casino-access"] });
      toast.success("Casino access granted");
      setSelectedUser(""); setSelectedCasino("");
    },
    onError: (e) => toast.error(e.message),
  });

  const revokeAccess = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_casino_access").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["casino-access"] });
      toast.success("Access revoked");
    },
  });

  const getProfileName = (userId: string) => profiles.find((p: any) => p.user_id === userId)?.display_name ?? userId.slice(0, 8);
  const getCasinoName = (casinoId: string) => casinos.find((c: any) => c.id === casinoId)?.name ?? casinoId.slice(0, 8);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-card-foreground">Manager Casino Access</h3>
        <p className="text-xs text-muted-foreground">Grant managers access to specific casinos (in addition to their primary casino).</p>
      </div>

      <div className="cms-panel p-4 max-w-lg">
        <div className="flex gap-2">
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Select user" /></SelectTrigger>
            <SelectContent>
              {profiles.map((p: any) => (
                <SelectItem key={p.user_id} value={p.user_id}>{p.display_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedCasino} onValueChange={setSelectedCasino}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Casino" /></SelectTrigger>
            <SelectContent>
              {casinos.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => grantAccess.mutate()} disabled={!selectedUser || !selectedCasino || grantAccess.isPending}>
            <Link2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="cms-panel overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3">User</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase px-4 py-3">Casino</th>
              <th className="w-[60px]"></th>
            </tr>
          </thead>
          <tbody>
            {(access as any[]).map(a => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-sm text-card-foreground">{getProfileName(a.user_id)}</td>
                <td className="px-4 py-3 text-sm text-card-foreground">{getCasinoName(a.casino_id)}</td>
                <td className="px-2 py-3">
                  <button onClick={() => revokeAccess.mutate(a.id)}
                    className="text-muted-foreground/40 hover:text-destructive transition-colors">
                    <Unlink className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {access.length === 0 && (
              <tr><td colSpan={3} className="text-center py-8 text-sm text-muted-foreground">No extra access granted</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CasinoAccessManagement;
