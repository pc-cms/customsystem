/**
 * CasinoPWAPanel — PWA manifest fields + icon URLs with direct upload
 * to the public `casino-branding` bucket.
 * Runtime injection per hostname happens via public/branding.js →
 * casino-branding edge function.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useCasinoInfo } from "@/hooks/use-table-lifecycle";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info, Upload } from "lucide-react";
import { toast } from "sonner";

type IconKey = "favicon" | "apple" | "i192" | "i512" | "og";

const FIELDS: { key: IconKey; label: string; hint: string; col: string; accept: string }[] = [
  { key: "favicon", label: "Favicon", hint: "32×32 or 48×48 PNG/ICO", col: "favicon_url", accept: "image/png,image/x-icon,image/svg+xml" },
  { key: "apple",   label: "Apple Touch Icon", hint: "180×180 PNG", col: "apple_touch_icon_url", accept: "image/png" },
  { key: "i192",    label: "PWA Icon 192", hint: "192×192 PNG", col: "pwa_icon_192_url", accept: "image/png" },
  { key: "i512",    label: "PWA Icon 512", hint: "512×512 PNG", col: "pwa_icon_512_url", accept: "image/png" },
  { key: "og",      label: "Open Graph Image", hint: "1200×630 for social sharing", col: "og_image_url", accept: "image/png,image/jpeg" },
];

export const CasinoPWAPanel = () => {
  const { data: casino } = useCasinoInfo() as { data: any };
  const { activeCasinoId } = useCasino();
  const qc = useQueryClient();
  const [pwaDisplay, setPwaDisplay] = useState("standalone");
  const [urls, setUrls] = useState<Record<IconKey, string>>({ favicon: "", apple: "", i192: "", i512: "", og: "" });
  const [uploading, setUploading] = useState<IconKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const inputs = useRef<Record<IconKey, HTMLInputElement | null>>({ favicon: null, apple: null, i192: null, i512: null, og: null });

  useEffect(() => {
    if (!casino || loaded) return;
    setPwaDisplay(casino.pwa_display || "standalone");
    setUrls({
      favicon: casino.favicon_url || "",
      apple:   casino.apple_touch_icon_url || "",
      i192:    casino.pwa_icon_192_url || "",
      i512:    casino.pwa_icon_512_url || "",
      og:      casino.og_image_url || "",
    });
    setLoaded(true);
  }, [casino, loaded]);

  const handleUpload = async (key: IconKey, file: File) => {
    if (!activeCasinoId) return;
    setUploading(key);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${activeCasinoId}/${key}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("casino-branding").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("casino-branding").getPublicUrl(path);
      setUrls(u => ({ ...u, [key]: pub.publicUrl }));
      toast.success(`${key} uploaded — click Save to apply`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    if (!activeCasinoId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("casinos").update({
        pwa_display: pwaDisplay,
        favicon_url: urls.favicon || null,
        apple_touch_icon_url: urls.apple || null,
        pwa_icon_192_url: urls.i192 || null,
        pwa_icon_512_url: urls.i512 || null,
        og_image_url: urls.og || null,
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
          <strong className="text-card-foreground">Runtime branding.</strong> Uploads go to the public <code>casino-branding</code> bucket. On next page load, <code>public/branding.js</code> calls the <code>casino-branding</code> edge function and applies these values dynamically per subdomain. Installed PWA icons and manifest are pinned at install time on iOS/Android — reinstall may be needed for those.
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

        {FIELDS.map(f => (
          <div key={f.key} className="border-t border-border/60 pt-3">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">{f.label}</label>
            <div className="flex gap-2 items-start">
              {urls[f.key] && (
                <img src={urls[f.key]} alt="" className="w-10 h-10 rounded border border-border object-contain bg-muted/30 shrink-0" />
              )}
              <div className="flex-1 space-y-1">
                <Input value={urls[f.key]} onChange={e => setUrls(u => ({ ...u, [f.key]: e.target.value }))} placeholder="https://..." className="font-mono text-xs" />
                <p className="text-[10px] text-muted-foreground">{f.hint}</p>
              </div>
              <input
                ref={el => { inputs.current[f.key] = el; }}
                type="file"
                accept={f.accept}
                className="hidden"
                onChange={e => { const file = e.target.files?.[0]; if (file) handleUpload(f.key, file); e.target.value = ""; }}
              />
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={uploading === f.key || !activeCasinoId}
                onClick={() => inputs.current[f.key]?.click()}
                className="gap-1.5 shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploading === f.key ? "Uploading…" : "Upload"}
              </Button>
            </div>
          </div>
        ))}

        <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save PWA Settings"}</Button>
      </div>
    </div>
  );
};

export default CasinoPWAPanel;
