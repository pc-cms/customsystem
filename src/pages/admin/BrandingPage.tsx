/**
 * Branding — per-casino identity, colors, and PWA metadata.
 * Phase 1: text/color fields stored on `casinos` row directly.
 * Phase 2 (deferred until workspace enables public buckets): logo/favicon uploads
 *         via `casino-branding` storage bucket + runtime loader in `public/branding.js`
 *         so favicon/manifest/apple-touch-icon change per subdomain dynamically.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Palette, Smartphone } from "lucide-react";
import { BrandingSettings } from "@/components/admin/BrandingSettings";
import { CasinoIdentityPanel } from "@/components/admin/branding/CasinoIdentityPanel";
import { CasinoColorsPanel } from "@/components/admin/branding/CasinoColorsPanel";
import { CasinoPWAPanel } from "@/components/admin/branding/CasinoPWAPanel";

export const BrandingPage = () => {
  return (
    <Tabs defaultValue="identity" className="space-y-4">
      <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
        <TabsTrigger value="identity" className="gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Identity</TabsTrigger>
        <TabsTrigger value="colors" className="gap-1.5"><Palette className="w-3.5 h-3.5" /> Colors & Chips</TabsTrigger>
        <TabsTrigger value="pwa" className="gap-1.5"><Smartphone className="w-3.5 h-3.5" /> PWA & Meta</TabsTrigger>
      </TabsList>

      <TabsContent value="identity">
        <div className="space-y-4">
          <CasinoIdentityPanel />
          <BrandingSettings />
        </div>
      </TabsContent>
      <TabsContent value="colors"><CasinoColorsPanel /></TabsContent>
      <TabsContent value="pwa"><CasinoPWAPanel /></TabsContent>
    </Tabs>
  );
};

export default BrandingPage;
