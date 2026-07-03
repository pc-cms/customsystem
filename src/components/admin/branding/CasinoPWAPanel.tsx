/**
 * CasinoPWAPanel — PWA manifest display + icon URLs.
 * Phase 1: text-based URL fields (paste hosted image URL).
 * Phase 2: direct upload once public storage buckets are enabled at workspace level.
 * Runtime dynamic favicon/manifest loading is Phase 2 as well.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useCasinoInfo } from "@/hooks/use-table-lifecycle";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info } from "lucide-react";
import { toast } from "sonner";

export const CasinoPWAPanel = () => {
  const { data: casino } = useCasinoInfo() as { data: any };
  const { activeCasinoId } = useCasino();
  const qc = useQueryClient();
  const [pwaDisplay, setPwaDisplay] = useState("standalone");
  const [favicon, setFavicon] = useState("");
  const [appleTouch, setAppleTouch] = useState("");
  const [icon192, setIcon192] = useState("");
  const [icon512, setIcon512] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!casino || loaded) return;
    setPwaDisplay(casino.pwa_display || "standalone");
    setFavicon(casino.favicon_url || "");
    setAppleTouch(casino.apple_touch_icon_url || "");
    setIcon192(casino.pwa_icon_192_url || "");
    setIcon512(casino.pwa_icon_512_url || "");
    setOgImage(casino.og_image_url || "");
    setLoaded(true);
  }, [casino, loaded]);

  const handleSave = async () => {
    if (!activeCasinoId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("casinos").update({
        pwa_display: pwaDisplay,
        favicon_url: favicon || null,
        apple_touch_icon_url: appleTouch || null,
        pwa_icon_192_url: icon192 || null,
        pwa_icon_512_url: icon512 || null,
        og_image_url: ogImage || null,
      } as any).eq("id", activeCasinoId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["casino-info"] });
      toast.success("PWA settings saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="cms-panel border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-muted-foreground">
          <strong className="text-card-foreground">Phase 1:</strong> Paste absolute URLs to hosted icons. Uploads and dynamic runtime favicon injection per subdomain are planned for the next phase (requires enabling public storage buckets in workspace settings).
        </div>
      </div>

      <div className="cms-panel p-6 max-w-2xl space-y-4">
        <h3 className="text-sm font-semibold text-card-foreground">PWA & Meta</h3>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Display Mode</label>
          <Select value={pwaDisplay} onValueChange={setPwaDisplay}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="standalone">Standalone (app-like)</SelectItem>
              <SelectItem value="fullscreen">Fullscreen</SelectItem>
              <SelectItem value="minimal-ui">Minimal UI</SelectItem>
              <SelectItem value="browser">Browser</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {[
          { label: "Favicon URL", value: favicon, set: setFavicon, hint: "32×32 or 48×48 PNG/ICO" },
          { label: "Apple Touch Icon URL", value: appleTouch, set: setAppleTouch, hint: "180×180 PNG" },
          { label: "PWA Icon 192 URL", value: icon192, set: setIcon192, hint: "192×192 PNG" },
          { label: "PWA Icon 512 URL", value: icon512, set: setIcon512, hint: "512×512 PNG" },
          { label: "Open Graph Image URL", value: ogImage, set: setOgImage, hint: "1200×630 for social sharing" },
        ].map(f => (
          <div key={f.label}>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">{f.label}</label>
            <Input value={f.value} onChange={e => f.set(e.target.value)} placeholder="https://..." className="font-mono text-xs" />
            <p className="text-[10px] text-muted-foreground mt-0.5">{f.hint}</p>
          </div>
        ))}

        <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save PWA Settings"}</Button>
      </div>
    </div>
  );
};

export default CasinoPWAPanel;
