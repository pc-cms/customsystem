/**
 * Casino Settings — operational settings for the active casino.
 * Groups: Time Settings (working hours + shift N/D + cage deadlines),
 *         Tables, Float, Chip Colors, Chip Conservation.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, LayoutGrid, Coins, Palette, ShieldCheck } from "lucide-react";
import { TimeSettingsPanel } from "@/components/admin/TimeSettingsPanel";
import TableManagement from "@/components/admin/TableManagement";
import FloatManagement from "@/components/admin/FloatManagement";
import ChipColorSettings from "@/components/admin/ChipColorSettings";
import { ChipConservationModeCard } from "@/components/admin/ChipConservationModeCard";
import { ChipEmissionDialog } from "@/components/chips/ChipEmissionDialog";
import { ResyncDataCard } from "@/components/admin/ResyncDataCard";

export const CasinoSettingsPage = () => {
  return (
    <Tabs defaultValue="time" className="space-y-4">
      <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
        <TabsTrigger value="time" className="gap-1.5"><Clock className="w-3.5 h-3.5" /> Time Settings</TabsTrigger>
        <TabsTrigger value="tables" className="gap-1.5"><LayoutGrid className="w-3.5 h-3.5" /> Tables</TabsTrigger>
        <TabsTrigger value="float" className="gap-1.5"><Coins className="w-3.5 h-3.5" /> Float</TabsTrigger>
        <TabsTrigger value="chip-colors" className="gap-1.5"><Palette className="w-3.5 h-3.5" /> Chip Colors</TabsTrigger>
        <TabsTrigger value="chip-conservation" className="gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Chip Mode</TabsTrigger>
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
    </Tabs>
  );
};

export default CasinoSettingsPage;
