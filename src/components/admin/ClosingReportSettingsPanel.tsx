/**
 * ClosingReportSettingsPanel — per-casino printed closing report settings.
 *  - Report layout: legacy (current reports) or v2 (new 4-page closing pack).
 *  - Winnings tax rate used in the Closing Record block of the new layout.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer } from "lucide-react";

export const ClosingReportSettingsPanel = () => {
  const { activeCasinoId } = useCasino();
  const qc = useQueryClient();
  const [layout, setLayout] = useState<string>("legacy");
  const [taxRate, setTaxRate] = useState<string>("15");
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ["casino-report-settings", activeCasinoId],
    enabled: !!activeCasinoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("casinos")
        .select("id, report_layout, winnings_tax_rate")
        .eq("id", activeCasinoId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  useEffect(() => {
    if (!data) return;
    setLayout(data.report_layout || "legacy");
    setTaxRate(String(Math.round(Number(data.winnings_tax_rate ?? 0.15) * 10000) / 100));
  }, [data]);

  const save = async () => {
    if (!activeCasinoId) return;
    setSaving(true);
    const { error } = await supabase
      .from("casinos")
      .update({
        report_layout: layout,
        winnings_tax_rate: (Number(taxRate) || 0) / 100,
      } as any)
      .eq("id", activeCasinoId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Closing report settings saved");
    qc.invalidateQueries({ queryKey: ["casino-report-settings", activeCasinoId] });
    qc.invalidateQueries({ queryKey: ["report-layout"] });
  };

  return (
    <section className="rounded-md border border-border bg-card max-w-lg">
      <header className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Printer className="w-4 h-4 text-muted-foreground" />
        <p className="text-sm font-semibold">Closing Report</p>
      </header>
      <div className="p-4 space-y-3">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Printed layout</p>
          <Select value={layout} onValueChange={setLayout}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="legacy">Legacy (current reports)</SelectItem>
              <SelectItem value="v2">New closing pack (4 pages)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Winnings tax rate (%)</p>
          <Input
            inputMode="decimal"
            value={taxRate}
            onChange={(e) => setTaxRate(e.target.value.replace(/[^0-9.]/g, ""))}
            className="h-9 font-mono"
          />
        </div>
        <Button size="sm" onClick={save} disabled={saving || !activeCasinoId}>Save</Button>
      </div>
    </section>
  );
};

export default ClosingReportSettingsPanel;
