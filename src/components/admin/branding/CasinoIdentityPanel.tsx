/**
 * CasinoIdentityPanel — short_name, tagline, meta title/description + logo
 * upload for the active casino. All values stored on the casinos row.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useCasinoInfo } from "@/hooks/use-table-lifecycle";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { toast } from "sonner";

export const CasinoIdentityPanel = () => {
  const { data: casino } = useCasinoInfo() as { data: any };
  const { activeCasinoId } = useCasino();
  const qc = useQueryClient();
  const [shortName, setShortName] = useState("");
  const [tagline, setTagline] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [ogImageUrl, setOgImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!casino || loaded) return;
    setShortName(casino.short_name || "");
    setTagline(casino.tagline || "");
    setMetaTitle(casino.meta_title || "");
    setMetaDescription(casino.meta_description || "");
    setLogoUrl(casino.logo_url || "");
    setOgImageUrl(casino.og_image_url || "");
    setLoaded(true);
  }, [casino, loaded]);

  const handleUpload = async (file: File) => {
    if (!activeCasinoId) return;
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${activeCasinoId}/logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("casino-branding").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("casino-branding").getPublicUrl(path);
      setLogoUrl(pub.publicUrl);
      toast.success("Logo uploaded — click Save to apply");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!activeCasinoId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("casinos").update({
        short_name: shortName || null,
        tagline: tagline || null,
        meta_title: metaTitle || null,
        meta_description: metaDescription || null,
        logo_url: logoUrl || null,
        og_image_url: ogImageUrl || null,
      } as any).eq("id", activeCasinoId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["casino-info"] });
      qc.invalidateQueries({ queryKey: ["all-casinos-branding"] });
      toast.success("Identity saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cms-panel p-6 max-w-2xl space-y-4">
      <h3 className="text-sm font-semibold text-card-foreground">Casino Identity</h3>

      {/* Logo */}
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Logo</label>
        <div className="flex items-start gap-3">
          {logoUrl && (
            <img src={logoUrl} alt="Logo preview" className="w-16 h-16 rounded border border-border object-contain bg-muted/30 shrink-0" />
          )}
          <div className="flex-1 space-y-1">
            <Input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." className="font-mono text-xs" />
            <p className="text-[10px] text-muted-foreground">Used in headers, splash screens, PDF reports</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
          />
          <Button
            variant="outline"
            size="sm"
            type="button"
            disabled={uploading || !activeCasinoId}
            onClick={() => fileRef.current?.click()}
            className="gap-1.5 shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border/60 pt-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Short Name</label>
          <Input value={shortName} onChange={e => setShortName(e.target.value)} placeholder="e.g. Arusha" maxLength={32} />
          <p className="text-[10px] text-muted-foreground mt-0.5">Displayed in menus and headers</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Tagline</label>
          <Input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="e.g. Premier Casino Group" maxLength={120} />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Meta Title</label>
        <Input value={metaTitle} onChange={e => setMetaTitle(e.target.value)} placeholder="Browser tab / share title" maxLength={60} />
        <p className="text-[10px] text-muted-foreground mt-0.5">{metaTitle.length}/60 chars</p>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Meta Description</label>
        <Textarea value={metaDescription} onChange={e => setMetaDescription(e.target.value)} rows={2} maxLength={160} />
        <p className="text-[10px] text-muted-foreground mt-0.5">{metaDescription.length}/160 chars</p>
      </div>
      <div className="border-t border-border/60 pt-4">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Social Preview Image (OG)</label>
        <div className="flex items-start gap-3">
          {ogImageUrl && (
            <img src={ogImageUrl} alt="OG preview" className="w-20 h-12 rounded border border-border object-cover bg-muted/30 shrink-0" />
          )}
          <div className="flex-1 space-y-1">
            <Input value={ogImageUrl} onChange={e => setOgImageUrl(e.target.value)} placeholder="https://... (1200×630 recommended)" className="font-mono text-xs" />
            <p className="text-[10px] text-muted-foreground">Shown when the URL is shared on social networks or messengers.</p>
          </div>
        </div>
      </div>
      <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Identity"}</Button>
    </div>
  );
};

export default CasinoIdentityPanel;
