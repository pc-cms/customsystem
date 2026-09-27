import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { useCasino } from "@/lib/casino-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Row = {
  employee_id: string;
  full_name: string;
  position: string;
  department: string;
  access_active: boolean;
  pin_set: boolean;
  pin_set_at: string | null;
  role: string | null;
};

export default function PosManagerStaffAccess() {
  const { activeCasinoId } = useCasino();
  const qc = useQueryClient();
  const key = ["pos-staff-access", activeCasinoId];
  const { data = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!activeCasinoId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("pos_staff_access_list", { _casino_id: activeCasinoId! });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const setPin = useMutation({
    mutationFn: async (v: { employee_id: string; pin: string }) => {
      const { error } = await supabase.rpc("pos_staff_set_pin", {
        _casino_id: activeCasinoId!, _employee_id: v.employee_id, _pin: v.pin,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const disable = useMutation({
    mutationFn: async (employee_id: string) => {
      const { error } = await supabase.rpc("pos_staff_disable", { _casino_id: activeCasinoId!, _employee_id: employee_id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const [target, setTarget] = useState<Row | null>(null);
  const [pin, setPinValue] = useState("");

  const save = async () => {
    if (!target) return;
    if (!/^[0-9]{4,6}$/.test(pin)) {
      toast({ title: "PIN must be 4–6 digits", variant: "destructive" });
      return;
    }
    try {
      await setPin.mutateAsync({ employee_id: target.employee_id, pin });
      toast({ title: "PIN saved", description: `${target.full_name} can now unlock the POS terminal.` });
      setTarget(null);
      setPinValue("");
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  const columns: ColumnDef<Row>[] = [
    { key: "full_name", header: "Employee", sortValue: (r) => r.full_name, accessor: (r) => <span className="font-medium">{r.full_name}</span> },
    { key: "position", header: "Position", accessor: (r) => r.position || "·" },
    { key: "department", header: "Department", accessor: (r) => r.department || "·" },
    {
      key: "status", header: "Status",
      accessor: (r) => r.access_active && r.pin_set
        ? <Badge variant="secondary">Active · PIN set</Badge>
        : r.pin_set
          ? <Badge variant="outline">Disabled</Badge>
          : <span className="text-muted-foreground">·</span>,
    },
    {
      key: "actions", header: "", headerClassName: "text-right",
      accessor: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="outline" onClick={() => { setTarget(r); setPinValue(""); }}>
            {r.pin_set ? "Reset PIN" : "Enable · set PIN"}
          </Button>
          {r.access_active && (
            <Button
              size="sm" variant="ghost"
              onClick={() => disable.mutate(r.employee_id, {
                onSuccess: () => toast({ title: "Access disabled" }),
                onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
              })}
            >
              Disable
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageShell>
      <PageHeader title="POS Staff Access" subtitle="Waiter PINs for shared POS terminals" icon={KeyRound} />
      <PageSection bodyClassName="p-0">
        <SmartTable data={data} columns={columns} rowKey={(r) => r.employee_id} loading={isLoading} empty="No bar/waiter employees in this casino." />
      </PageSection>

      <ResponsiveDialog
        open={!!target}
        onOpenChange={(o) => { if (!o) { setTarget(null); setPinValue(""); } }}
        title={target ? `Set PIN · ${target.full_name}` : ""}
        size="form"
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs uppercase text-muted-foreground">New PIN (4–6 digits)</label>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={pin}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-1">The PIN is stored hashed and is never shown again.</p>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={save} disabled={setPin.isPending}>Save</Button>
          </ResponsiveDialogFooter>
        </div>
      </ResponsiveDialog>
    </PageShell>
  );
}
