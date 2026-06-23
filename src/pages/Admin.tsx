import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCasino, getBaseDomain } from "@/lib/casino-context";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Shield, Coins, Clock, Building2, Link2, Unlink, Globe, Palette, Settings, RefreshCw, LayoutGrid, ShieldCheck, Network, Receipt } from "lucide-react";
import { RoleDefaultsEditor } from "@/components/admin/RoleDefaultsEditor";
import { PeerLinksPanel } from "@/components/admin/PeerLinksPanel";
import { ServerIdentityPanel } from "@/components/admin/ServerIdentityPanel";
import { SyncMirrorPanel } from "@/components/admin/SyncMirrorPanel";
import { LocalUpdaterPanel } from "@/components/admin/LocalUpdaterPanel";
import { MirrorHealthPanel } from "@/components/admin/MirrorHealthPanel";
import { SyncStatusPanel } from "@/components/admin/SyncStatusPanel";
import { DataInventoryPanel } from "@/components/admin/DataInventoryPanel";
import { MirrorCutoverPanel } from "@/components/admin/MirrorCutoverPanel";
import { CutoverWizardPanel } from "@/components/admin/CutoverWizardPanel";
import { ApplyErrorsPanel } from "@/components/admin/ApplyErrorsPanel";
import { resetPWACache } from "@/lib/pwa-register";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";
// (logAction import removed — was only used by old in-page UsersAndRoles)
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import FloatManagement from "@/components/admin/FloatManagement";
import TableManagement from "@/components/admin/TableManagement";
import ChipColorSettings from "@/components/admin/ChipColorSettings";
import { BrandingSettings } from "@/components/admin/BrandingSettings";
import { ChipConservationModeCard } from "@/components/admin/ChipConservationModeCard";
import { ChipEmissionDialog } from "@/components/chips/ChipEmissionDialog";
import { useCasinoInfo, useUpdateCasinoSchedule, useCancelPendingSchedule } from "@/hooks/use-table-lifecycle";
import { UsersTab } from "@/components/admin/users/UsersTab";
import { FinCategoriesSettings } from "@/components/admin/FinCategoriesSettings";
import { ExpenseCategoriesSettings } from "@/components/admin/ExpenseCategoriesSettings";
import { ResyncDataCard } from "@/components/admin/ResyncDataCard";

// (ROLES / ALL_ROLES / ROLE_LABELS moved to src/components/admin/users/users-hooks.ts)

// =================== HOOKS ===================
// Profiles for Admin sub-panels (network/server-push pickers).
// Per-domain rule: on a casino subdomain even super_admin sees only this
// casino's users; on premier we expose the whole network for cross-casino ops.
const useProfiles = () => {
  const { activeCasinoId, isSummaryMode } = useCasino();

  return useQuery({
    queryKey: ["all-profiles", isSummaryMode ? "summary" : activeCasinoId],
    queryFn: async () => {
      let query = supabase.from("profiles").select("*");
      if (!isSummaryMode && activeCasinoId) {
        query = query.eq("casino_id", activeCasinoId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: isSummaryMode || !!activeCasinoId,
  });
};

// (Old useAllRoles removed — UsersTab now uses a single batched query in users-hooks.ts)

const useAllCasinos = () => useQuery({
  queryKey: ["all-casinos"],
  queryFn: async () => {
    const { data, error } = await supabase.from("casinos").select("*").order("name");
    if (error) throw error;
    return data;
  },
});


// (useLocalServers removed — replaced by node_identity + peer_links in PeerLinksPanel)


const useCasinoAccess = () => useQuery({
  queryKey: ["casino-access"],
  queryFn: async () => {
    const { data, error } = await supabase.from("user_casino_access").select("*");
    if (error) throw error;
    return data;
  },
});

// =================== MAIN ===================
const Admin = () => {
  const { roles, user } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const isFinanceManager = roles.includes("finance_manager");

  if (!isSuperAdmin && !isFinanceManager) {
    return (
      <div className="text-center py-16">
        <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground">Access Restricted</h2>
        <p className="text-sm text-muted-foreground mt-1">Admin panel is restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        icon={Settings}
        title="Administration"
        subtitle={isSuperAdmin ? "System, Casino & User Management" : "User, Role & Float Management"}
        date
      />

      <Tabs defaultValue={isSuperAdmin ? "casinos" : "users"} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
          {isSuperAdmin && (
            <>
              <TabsTrigger value="casinos" className="gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> Casinos
              </TabsTrigger>
              <TabsTrigger value="access" className="gap-1.5">
                <Globe className="w-3.5 h-3.5" /> Casino Access
              </TabsTrigger>
              <TabsTrigger value="peers" className="gap-1.5">
                <Network className="w-3.5 h-3.5" /> Peers
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="users" className="gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Users & Roles
          </TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="role-defaults" className="gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Role Defaults
            </TabsTrigger>
          )}
          <TabsTrigger value="schedule" className="gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Working Hours
          </TabsTrigger>
          <TabsTrigger value="tables" className="gap-1.5">
            <LayoutGrid className="w-3.5 h-3.5" /> Tables
          </TabsTrigger>
          <TabsTrigger value="float" className="gap-1.5">
            <Coins className="w-3.5 h-3.5" /> Float Management
          </TabsTrigger>
          <TabsTrigger value="chip-colors" className="gap-1.5">
            <Palette className="w-3.5 h-3.5" /> Chip Colors
          </TabsTrigger>
          <TabsTrigger value="fin-categories" className="gap-1.5">
            <Receipt className="w-3.5 h-3.5" /> Finance Categories
          </TabsTrigger>
          <TabsTrigger value="expense-categories" className="gap-1.5">
            <Receipt className="w-3.5 h-3.5" /> Expense Categories
          </TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="branding" className="gap-1.5">
              <Palette className="w-3.5 h-3.5" /> Branding
            </TabsTrigger>
          )}
        </TabsList>

        {isSuperAdmin && (
          <>
            <TabsContent value="casinos"><CasinoManagement /></TabsContent>
            <TabsContent value="access"><CasinoAccessManagement /></TabsContent>
            <TabsContent value="peers">
              <div className="space-y-4">
                <ServerIdentityPanel />
                <SyncStatusPanel />
                <MirrorHealthPanel />
                <CutoverWizardPanel />
                <MirrorCutoverPanel />
                <DataInventoryPanel />
                <ApplyErrorsPanel />
                <LocalUpdaterPanel />
                <PeerLinksPanel />
                <SyncMirrorPanel />
                <AppCacheCard />
              </div>
            </TabsContent>
          </>
        )}

        <TabsContent value="users"><UsersTab /></TabsContent>
        {isSuperAdmin && <TabsContent value="role-defaults"><RoleDefaultsEditor /></TabsContent>}
        <TabsContent value="schedule">
          <div className="space-y-4">
            <ScheduleSettings />
            <div className="max-w-lg"><ResyncDataCard /></div>
          </div>
        </TabsContent>
        <TabsContent value="tables"><TableManagement /></TabsContent>
        <TabsContent value="float">
          <div className="space-y-4">
            <div className="flex justify-end">
              <ChipEmissionDialog />
            </div>
            <ChipConservationModeCard />
            <FloatManagement />
          </div>
        </TabsContent>
        <TabsContent value="chip-colors"><ChipColorSettings /></TabsContent>
        <TabsContent value="fin-categories"><FinCategoriesSettings /></TabsContent>
        <TabsContent value="expense-categories"><ExpenseCategoriesSettings /></TabsContent>
        {isSuperAdmin && <TabsContent value="branding"><BrandingSettings /></TabsContent>}
      </Tabs>
    </div>
  );
};

// =================== CASINO MANAGEMENT (Super Admin) ===================
const CasinoManagement = () => {
  const { data: casinos = [], isLoading } = useAllCasinos();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [slug, setSlug] = useState("");

  const createCasino = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("casinos").insert({
        name,
        code: code.toUpperCase(),
        slug: slug.toLowerCase(),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-casinos"] });
      toast.success(`Casino "${name}" created`);
      setShowCreate(false);
      setName("");
      setCode("");
      setSlug("");
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
            {casinos.map(c => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-sm font-medium text-card-foreground">{c.name}</td>
                <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{c.code}</td>
                <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                  {(c as any).slug ? `${(c as any).slug}.${getBaseDomain()}` : "—"}
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
              <p className="text-[10px] text-muted-foreground mt-1">Short code for internal use</p>
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

// =================== CASINO ACCESS MANAGEMENT ===================
const CasinoAccessManagement = () => {
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
        user_id: selectedUser,
        casino_id: selectedCasino,
        granted_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["casino-access"] });
      toast.success("Casino access granted");
      setSelectedUser("");
      setSelectedCasino("");
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

  const getProfileName = (userId: string) => profiles.find(p => p.user_id === userId)?.display_name ?? userId.slice(0, 8);
  const getCasinoName = (casinoId: string) => casinos.find(c => c.id === casinoId)?.name ?? casinoId.slice(0, 8);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-card-foreground">Manager Casino Access</h3>
      <p className="text-xs text-muted-foreground">Grant managers access to specific casinos (in addition to their primary casino).</p>

      <div className="cms-panel p-4 max-w-lg">
        <div className="flex gap-2">
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Select user" /></SelectTrigger>
            <SelectContent>
              {profiles.map(p => (
                <SelectItem key={p.user_id} value={p.user_id}>{p.display_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedCasino} onValueChange={setSelectedCasino}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Casino" /></SelectTrigger>
            <SelectContent>
              {casinos.map(c => (
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
            {access.map(a => (
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

// LocalServerManagement removed — replaced by PeerLinksPanel (peer mesh model).
// AppCacheCard is still rendered from PeerLinksPanel? — moved into the Peers tab below if needed.

// =================== USERS & ROLES ===================
// Moved to: src/components/admin/users/UsersTab.tsx
// (Old in-page UsersAndRoles component removed — its tiny modal and per-user
//  N×R rpc('has_role') loop were replaced by a proper table + dialog + batched
//  query. See plan in .lovable/plan.md.)

// =================== SCHEDULE SETTINGS ===================
const ScheduleSettings = () => {
  const { data: casino } = useCasinoInfo();
  const updateSchedule = useUpdateCasinoSchedule();
  const cancelPending = useCancelPendingSchedule();

  const [tablesOpen, setTablesOpen] = useState("");
  const [shiftStart, setShiftStart] = useState("");
  const [shiftEnd, setShiftEnd] = useState("");
  const [breaklistLock, setBreaklistLock] = useState("");
  const [cageFloat, setCageFloat] = useState("");
  const [loaded, setLoaded] = useState(false);

  if (casino && !loaded) {
    setTablesOpen(casino.tables_open || "17:30");
    setShiftStart(casino.shift_start || "18:00");
    setShiftEnd(casino.shift_end || "05:00");
    setBreaklistLock(casino.breaklist_lock || "05:30");
    setCageFloat(String(casino.cage_float || 0));
    setLoaded(true);
  }

  const handleSave = () => {
    updateSchedule.mutate({
      tables_open: tablesOpen,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      breaklist_lock: breaklistLock,
      cage_float: Number(cageFloat) || 0,
      current_shift_end: casino?.shift_end,
      current_breaklist_lock: casino?.breaklist_lock,
    });
  };

  const formatPendingDate = (d?: string | null) => {
    if (!d) return "";
    const [y, m, day] = d.split("-");
    return `${day}.${m}.${y}`;
  };

  type FieldDef = {
    label: string;
    value: string;
    set: (v: string) => void;
    hint: string;
    pending?: { value?: string | null; from?: string | null; field: "shift_end" | "breaklist_lock" };
  };

  const fields: FieldDef[] = [
    { label: "Tables Open (Cage/Pit)", value: tablesOpen, set: setTablesOpen, hint: "When cashiers/pit can open tables" },
    { label: "Shift Start (Dealers)", value: shiftStart, set: setShiftStart, hint: "When dealer breaklist starts" },
    {
      label: "Shift End",
      value: shiftEnd,
      set: setShiftEnd,
      hint: "Applied from next business day. Active value: " + (casino?.shift_end || "—"),
      pending: { value: casino?.shift_end_pending, from: casino?.shift_end_pending_from, field: "shift_end" },
    },
    {
      label: "Breaklist Lock",
      value: breaklistLock,
      set: setBreaklistLock,
      hint: "Applied from next business day. Active value: " + (casino?.breaklist_lock || "—"),
      pending: { value: casino?.breaklist_lock_pending, from: casino?.breaklist_lock_pending_from, field: "breaklist_lock" },
    },
  ];

  return (
    <div className="cms-panel p-6 max-w-lg">
      <h3 className="text-sm font-semibold text-card-foreground mb-4">Casino Settings</h3>
      <div className="space-y-4">
        <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-medium">Working Hours</p>
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-[11px] text-warning-foreground">
          Shift End and Breaklist Lock changes apply from the <strong>next business day</strong> at 18:00. The current shift continues with old values.
        </div>
        {fields.map(f => (
          <div key={f.label}>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">{f.label}</label>
            <Input type="time" value={f.value} onChange={e => f.set(e.target.value)} className="w-32 font-mono" />
            <p className="text-[10px] text-muted-foreground mt-0.5">{f.hint}</p>
            {f.pending?.value && (
              <div className="mt-1.5 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px]">
                <Clock className="w-3 h-3 text-primary" />
                <span className="font-mono">Pending: {f.pending.value}</span>
                <span className="text-muted-foreground">from {formatPendingDate(f.pending.from)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px] ml-auto"
                  onClick={() => cancelPending.mutate(f.pending!.field)}
                  disabled={cancelPending.isPending}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        ))}
        <div className="border-t border-border pt-4 mt-4">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider font-medium mb-3">Finance</p>
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Cage Float Target (TZS)</label>
            <Input type="number" value={cageFloat} onChange={e => setCageFloat(e.target.value)} className="w-48 font-mono" placeholder="e.g. 10000000" />
            <p className="text-[10px] text-muted-foreground mt-0.5">Target cash amount in cage at all times</p>
          </div>
        </div>
      </div>
      <Button onClick={handleSave} className="mt-5" disabled={updateSchedule.isPending}>
        {updateSchedule.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
};

// =================== APP CACHE ===================
const AppCacheCard = () => {
  const [busy, setBusy] = useState(false);
  const handleReset = async () => {
    if (!confirm("Force update and reload?\n\nThis clears local app caches and pulls a fresh version. Your session is kept.")) return;
    setBusy(true);
    try {
      await resetPWACache();
    } catch {
      setBusy(false);
    }
  };
  return (
    <div className="cms-panel p-4 flex items-center justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold text-card-foreground">App Cache</h3>
        <p className="text-xs text-muted-foreground">
          Clears the service worker and local caches, then reloads. Use this if
          the app appears stuck on an old version. Your login session is kept.
        </p>

      </div>
      <Button variant="outline" onClick={handleReset} disabled={busy} className="gap-2 shrink-0">
        <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Resetting…" : "Reset & Reload"}
      </Button>
    </div>
  );
};

export default Admin;

