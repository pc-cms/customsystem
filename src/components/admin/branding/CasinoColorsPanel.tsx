/**
 * CasinoThemePanel — theme & background color for PWA / OS chrome.
 * Chip colors moved back to Casino Settings (to avoid duplication).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useCasinoInfo } from "@/hooks/use-table-lifecycle";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const CasinoThemePanel = () => {
  const { data: casino } = useCasinoInfo() as { data: any };
  const { activeCasinoId } = useCasino();
  const qc = useQueryClient();
  const [themeColor, setThemeColor] = useState("#0f172a");
  const [backgroundColor, setBackgroundColor] = useState("#0f172a");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!casino || loaded) return;
    setThemeColor(casino.theme_color || "#0f172a");
    setBackgroundColor(casino.background_color || "#0f172a");
    setLoaded(true);
  }, [casino, loaded]);

  const handleSave = async () => {
    if (!activeCasinoId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("casinos").update({
        theme_color: themeColor,
        background_color: backgroundColor,
      } as any).eq("id", activeCasinoId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["casino-info"] });
      toast.success("Theme saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cms-panel p-6 max-w-2xl space-y-4">
      <h3 className="text-sm font-semibold text-card-foreground">Theme Colors</h3>
      <p className="text-xs text-muted-foreground">Used for PWA theme, address-bar tint, and splash screen. Chip colors live in Casino Settings → Chip Colors.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Theme Color</label>
          <div className="flex gap-2 items-center">
            <Input type="color" value={themeColor} onChange={e => setThemeColor(e.target.value)} className="w-14 h-10 p-1" />
            <Input value={themeColor} onChange={e => setThemeColor(e.target.value)} className="font-mono" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Background Color</label>
          <div className="flex gap-2 items-center">
            <Input type="color" value={backgroundColor} onChange={e => setBackgroundColor(e.target.value)} className="w-14 h-10 p-1" />
            <Input value={backgroundColor} onChange={e => setBackgroundColor(e.target.value)} className="font-mono" />
          </div>
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Theme"}</Button>
    </div>
  );
};

export default CasinoThemePanel;
