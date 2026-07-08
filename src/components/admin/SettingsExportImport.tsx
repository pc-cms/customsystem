/**
 * Export/Import all casino settings as a single JSON file — useful for
 * tirage-ing an existing casino's configuration onto a new box.
 *
 * Missing keys in the imported file fall back to defaults. Unknown keys are
 * ignored. Import runs in a loop of individual upserts (RLS + audit per key).
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Upload } from "lucide-react";
import { useCasino } from "@/lib/casino-context";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useSettingsExport } from "@/hooks/use-casino-setting";
import { getSpec, SETTINGS } from "@/lib/casino-settings-spec";
import { toast } from "sonner";

export function SettingsExportImport() {
  const { activeCasinoId, activeCasino } = useCasino();
  const qc = useQueryClient();
  const exportMap = useSettingsExport();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const doExport = () => {
    const blob = new Blob([JSON.stringify(exportMap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeCasino?.slug ?? "casino"}-settings.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = async (file: File) => {
    if (!activeCasinoId) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid file");

      const { data: userRes } = await supabase.auth.getUser();
      const rows = Object.entries(parsed)
        .filter(([k]) => !!getSpec(k))
        .map(([key, value]) => ({
          casino_id: activeCasinoId,
          key,
          value: value as never,
          updated_by: userRes.user?.id ?? null,
        }));

      if (rows.length === 0) {
        toast.error("No recognized settings in file");
        return;
      }

      const { error } = await supabase
        .from("casino_settings")
        .upsert(rows, { onConflict: "casino_id,key" });
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["casino-settings", activeCasinoId] });
      toast.success(`Imported ${rows.length} settings (${SETTINGS.length - rows.length} left at default)`);
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card className="p-4 space-y-3 max-w-lg">
      <div>
        <h4 className="text-sm font-semibold">Backup & migrate</h4>
        <p className="text-xs text-muted-foreground">
          Export all settings as JSON, or import from another casino's file to clone its
          configuration here.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={doExport}>
          <Download className="w-4 h-4 mr-2" /> Export
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) doImport(f);
          }}
        />
        <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload className="w-4 h-4 mr-2" /> {busy ? "Importing…" : "Import"}
        </Button>
      </div>
    </Card>
  );
}
