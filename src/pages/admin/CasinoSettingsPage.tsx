/**
 * Casino Settings — operational settings for the active casino.
 *
 * Two kinds of tabs:
 *   - Hand-crafted panels: Time Settings, Tables, Float, Chip Colors, Chip Conservation.
 *     These have complex screen-specific UI and pre-date the generic settings store.
 *   - Auto-generated tabs: General, Currency, Cashless, Tips, Limits.
 *     Each renders every SettingSpec in that group as a <SettingCard>. Add a
 *     new spec entry → it appears here automatically.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, LayoutGrid, Coins, Palette, ShieldCheck, Settings2, Banknote, Wallet, HandCoins, Gauge } from "lucide-react";
import { TimeSettingsPanel } from "@/components/admin/TimeSettingsPanel";
import TableManagement from "@/components/admin/TableManagement";
import FloatManagement from "@/components/admin/FloatManagement";
import ChipColorSettings from "@/components/admin/ChipColorSettings";
import { ChipConservationModeCard } from "@/components/admin/ChipConservationModeCard";
import { ChipEmissionDialog } from "@/components/chips/ChipEmissionDialog";
import { ResyncDataCard } from "@/components/admin/ResyncDataCard";
import { SettingCard } from "@/components/admin/SettingCard";
import { SETTINGS, SETTING_GROUPS, type SettingGroup } from "@/lib/casino-settings-spec";
import { SettingsExportImport } from "@/components/admin/SettingsExportImport";

const GROUP_ICONS: Record<SettingGroup, React.ComponentType<{ className?: string }>> = {
  general: Settings2,
  currency: Banknote,
  cashless: Wallet,
  tips: HandCoins,
  limits: Gauge,
  time: Clock,
};

function AutoSettingsGroup({ group }: { group: SettingGroup }) {
  const specs = SETTINGS.filter((s) => s.group === group);
  if (specs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-6 border border-dashed rounded">
        No settings in this group yet.
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {specs.map((spec) => (
        <SettingCard key={spec.key} spec={spec} />
      ))}
    </div>
  );
}

export const CasinoSettingsPage = () => {
  const autoGroups = SETTING_GROUPS.filter((g) => g.key !== "time"); // Time has bespoke panel below

  return (
    <Tabs defaultValue="time" className="space-y-4">
      <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
        <TabsTrigger value="time" className="gap-1.5"><Clock className="w-3.5 h-3.5" /> Time Settings</TabsTrigger>
        <TabsTrigger value="tables" className="gap-1.5"><LayoutGrid className="w-3.5 h-3.5" /> Tables</TabsTrigger>
        <TabsTrigger value="float" className="gap-1.5"><Coins className="w-3.5 h-3.5" /> Float</TabsTrigger>
        <TabsTrigger value="chip-colors" className="gap-1.5"><Palette className="w-3.5 h-3.5" /> Chip Colors</TabsTrigger>
        <TabsTrigger value="chip-conservation" className="gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Chip Mode</TabsTrigger>
        {autoGroups.map((g) => {
          const Icon = GROUP_ICONS[g.key];
          return (
            <TabsTrigger key={g.key} value={g.key} className="gap-1.5">
              <Icon className="w-3.5 h-3.5" /> {g.label}
            </TabsTrigger>
          );
        })}
      </TabsList>

      <TabsContent value="time">
        <div className="space-y-4">
          <TimeSettingsPanel />
          <div className="max-w-lg"><ResyncDataCard /></div>
        </div>
      </TabsContent>
      <TabsContent value="tables"><TableManagement /></TabsContent>
      <TabsContent value="float">
        <div className="space-y-4">
          <div className="flex justify-end"><ChipEmissionDialog /></div>
          <FloatManagement />
        </div>
      </TabsContent>
      <TabsContent value="chip-colors"><ChipColorSettings /></TabsContent>
      <TabsContent value="chip-conservation"><ChipConservationModeCard /></TabsContent>

      {autoGroups.map((g) => (
        <TabsContent key={g.key} value={g.key}>
          <div className="space-y-4">
            <AutoSettingsGroup group={g.key} />
            {g.key === "general" && <SettingsExportImport />}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
};

export default CasinoSettingsPage;
