/**
 * CasinoIdentityPanel — edit short_name, tagline, meta title/description
 * for the active casino. Values are stored on the casinos row.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useCasinoInfo } from "@/hooks/use-table-lifecycle";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const CasinoIdentityPanel = () => {
  const { data: casino } = useCasinoInfo() as { data: any };
  const { activeCasinoId } = useCasino();
  const qc = useQueryClient();
  const [shortName, setShortName] = useState("");
  const [tagline, setTagline] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!casino || loaded) return;
    setShortName(casino.short_name || "");
    setTagline(casino.tagline || "");
    setMetaTitle(casino.meta_title || "");
    setMetaDescription(casino.meta_description || "");
    setLoaded(true);
  }, [casino, loaded]);

  const handleSave = async () => {
    if (!activeCasinoId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("casinos").update({
        short_name: shortName || null,
        tagline: tagline || null,
        meta_title: metaTitle || null,
        meta_description: metaDescription || null,
      } as any).eq("id", activeCasinoId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["casino-info"] });
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save Identity"}</Button>
    </div>
  );
};

export default CasinoIdentityPanel;
