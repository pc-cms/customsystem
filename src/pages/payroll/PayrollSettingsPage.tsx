/**
 * Payroll Settings page — calculation rates and PAYE brackets.
 * Read-only display for everyone; HR, Finance Manager and super_admin can edit.
 */
import { Settings, Save, Plus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, DTHead, DTBody, DTRow, DTHeader, DTCell } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { useLatestPayrollSettings, useLatestPayeBrackets } from "@/hooks/use-payroll";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const NUM = (label: string, value: number, onChange: (n: number) => void, suffix?: string, disabled?: boolean) => (
  <div className="space-y-1">
    <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
    <div className="flex items-center gap-2">
      <Input type="number" step="0.01" value={value} disabled={disabled}
        onChange={e => onChange(Number(e.target.value) || 0)} className="font-mono" />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </div>
  </div>
);

export default function PayrollSettingsPage() {
  const { roles } = useAuth();
  const { activeCasinoId } = useCasino();
  // Mirrors DB policy payroll_settings_write_hr_finance / paye_brackets_write_hr_finance.
  const isSuper = roles.some(r => ["super_admin", "finance_manager", "hr"].includes(r));
  const qc = useQueryClient();

  const { data: settings } = useLatestPayrollSettings();
  const { data: brackets = [] } = useLatestPayeBrackets();

  const [s, setS] = useState<any>(null);
  const [bk, setBk] = useState<any[]>([]);
  useEffect(() => { if (settings) setS({ ...settings }); }, [settings]);
  useEffect(() => { setBk(brackets.map(b => ({ ...b }))); }, [brackets]);

  const saveSettings = async () => {
    if (!s || !activeCasinoId) return;
    const { error } = await supabase.from("payroll_settings").insert({
      casino_id: activeCasinoId,
      effective_from: new Date().toISOString().slice(0, 10),
      hours_per_month: s.hours_per_month,
      night_hours_per_day: s.night_hours_per_day,
      night_rate_pct: s.night_rate_pct,
      gepf_pct: s.gepf_pct,
      nssf_employee_pct: s.nssf_employee_pct,
      nssf_employer_pct: s.nssf_employer_pct,
      wcf_pct: s.wcf_pct,
      sdl_pct: s.sdl_pct,
      working_days: s.working_days,
      off_day_multiplier: s.off_day_multiplier,
      default_payment_description: s.default_payment_description ?? null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Settings saved (effective today)");
    qc.invalidateQueries({ queryKey: ["payroll_settings_latest"] });
  };

  const saveBrackets = async () => {
    if (!activeCasinoId || bk.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const rows = bk.map((b, i) => ({
      casino_id: activeCasinoId, effective_from: today, ord: i + 1,
      lower_bound: Number(b.lower_bound), upper_bound: b.upper_bound === "" || b.upper_bound == null ? null : Number(b.upper_bound),
      base_tax: Number(b.base_tax), rate_pct: Number(b.rate_pct),
    }));
    const { error } = await supabase.from("payroll_paye_brackets" as any).insert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success("PAYE brackets saved (effective today)");
    qc.invalidateQueries({ queryKey: ["paye_brackets_latest"] });
  };

  if (!s) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <PageShell>
      <PageHeader icon={Settings} title="Payroll Settings"
        subtitle={`Effective from ${settings?.effective_from ?? "—"}. New saves never alter past periods.`}>
        {isSuper && (
          <Button size="sm" onClick={saveSettings}><Save className="w-4 h-4 mr-1" /> Save Settings</Button>
        )}
      </PageHeader>

      <PageSection card title="Calculation Rates">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {NUM("Hours per Month",    s.hours_per_month,    v => setS({ ...s, hours_per_month: v }),    "h",  !isSuper)}
          {NUM("Night Hours / Day",  s.night_hours_per_day,v => setS({ ...s, night_hours_per_day: v }),"h",  !isSuper)}
          {NUM("Night Rate",         s.night_rate_pct,     v => setS({ ...s, night_rate_pct: v }),     "%",  !isSuper)}
          {NUM("Off-Day Multiplier", s.off_day_multiplier, v => setS({ ...s, off_day_multiplier: v }), "×",  !isSuper)}
          {NUM("Working Days",       s.working_days,       v => setS({ ...s, working_days: v }),       "d",  !isSuper)}
          {NUM("GEPF",               s.gepf_pct,           v => setS({ ...s, gepf_pct: v }),           "%",  !isSuper)}
          {NUM("NSSF Employee",      s.nssf_employee_pct,  v => setS({ ...s, nssf_employee_pct: v }),  "%",  !isSuper)}
          {NUM("NSSF Employer",      s.nssf_employer_pct,  v => setS({ ...s, nssf_employer_pct: v }),  "%",  !isSuper)}
          {NUM("SDL",                s.sdl_pct,            v => setS({ ...s, sdl_pct: v }),            "%",  !isSuper)}
          {NUM("WCF",                s.wcf_pct,            v => setS({ ...s, wcf_pct: v }),            "%",  !isSuper)}
          <div className="space-y-1 col-span-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Default Payment Description</Label>
            <Input value={s.default_payment_description ?? ""} disabled={!isSuper}
              onChange={e => setS({ ...s, default_payment_description: e.target.value })}
              placeholder="e.g. SALARY {MONTH} {YEAR}" />
          </div>
        </div>
      </PageSection>

      <PageSection card title="PAYE Tax Brackets">
        <div className="flex justify-end mb-2">
          {isSuper && <Button size="sm" onClick={saveBrackets}><Save className="w-4 h-4 mr-1" /> Save Brackets</Button>}
        </div>
        <DataTable>
          <DTHead>
            <DTRow>
              <DTHeader>#</DTHeader>
              <DTHeader align="right">Lower</DTHeader>
              <DTHeader align="right">Upper</DTHeader>
              <DTHeader align="right">Base Tax</DTHeader>
              <DTHeader align="right">Rate %</DTHeader>
              <DTHeader />
            </DTRow>
          </DTHead>
          <DTBody>
            {bk.map((b, i) => (
              <DTRow key={i}>
                <DTCell>{i + 1}</DTCell>
                <DTCell numeric><NumberInput value={b.lower_bound} disabled={!isSuper}
                  onValueChange={v => { const c = [...bk]; c[i] = { ...c[i], lower_bound: v ?? 0 }; setBk(c); }} className="font-mono text-right h-8" /></DTCell>
                <DTCell numeric><NumberInput value={b.upper_bound ?? ""} placeholder="∞" disabled={!isSuper}
                  onValueChange={v => { const c = [...bk]; c[i] = { ...c[i], upper_bound: v }; setBk(c); }} className="font-mono text-right h-8" /></DTCell>
                <DTCell numeric><NumberInput value={b.base_tax} disabled={!isSuper}
                  onValueChange={v => { const c = [...bk]; c[i] = { ...c[i], base_tax: v ?? 0 }; setBk(c); }} className="font-mono text-right h-8" /></DTCell>
                <DTCell numeric><Input type="number" step="0.01" value={b.rate_pct} disabled={!isSuper}
                  onChange={e => { const c = [...bk]; c[i] = { ...c[i], rate_pct: e.target.value }; setBk(c); }} className="font-mono text-right h-8" /></DTCell>
                <DTCell>
                  {isSuper && (
                    <Button size="icon" variant="ghost" onClick={() => setBk(bk.filter((_, j) => j !== i))}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </DTCell>
              </DTRow>
            ))}
          </DTBody>
        </DataTable>
        {isSuper && (
          <div className="mt-2">
            <Button size="sm" variant="outline" onClick={() => setBk([...bk, { lower_bound: 0, upper_bound: 0, base_tax: 0, rate_pct: 0 }])}>
              <Plus className="w-4 h-4 mr-1" /> Add bracket
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Brackets are versioned by <code>effective_from</code>. Changes apply only to periods created after the save date.
        </p>
      </PageSection>
    </PageShell>
  );
}
