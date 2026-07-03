/**
 * Branding — per-casino identity, theme and PWA metadata.
 * Chip colors live in Casino Settings (not here) to avoid duplication.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Palette, Smartphone } from "lucide-react";
import { BrandingSettings } from "@/components/admin/BrandingSettings";
import { CasinoIdentityPanel } from "@/components/admin/branding/CasinoIdentityPanel";
import { CasinoThemePanel } from "@/components/admin/branding/CasinoColorsPanel";
import { CasinoPWAPanel } from "@/components/admin/branding/CasinoPWAPanel";

export const BrandingPage = () => {
  return (
    <Tabs defaultValue="identity" className="space-y-4">
      <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
        <TabsTrigger value="identity" className="gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Identity</TabsTrigger>
        <TabsTrigger value="theme" className="gap-1.5"><Palette className="w-3.5 h-3.5" /> Theme</TabsTrigger>
        <TabsTrigger value="pwa" className="gap-1.5"><Smartphone className="w-3.5 h-3.5" /> PWA & Icons</TabsTrigger>
      </TabsList>

      <TabsContent value="identity">
        <div className="space-y-4">
          <CasinoIdentityPanel />
          <BrandingSettings />
        </div>
      </TabsContent>
      <TabsContent value="theme"><CasinoThemePanel /></TabsContent>
      <TabsContent value="pwa"><CasinoPWAPanel /></TabsContent>
    </Tabs>
  );
};

export default BrandingPage;
