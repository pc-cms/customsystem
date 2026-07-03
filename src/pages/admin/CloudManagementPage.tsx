/**
 * Cloud Management — super_admin only.
 * Casinos CRUD, Servers & Peers (with duplicate detection & cleanup),
 * Cloud Snapshots.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Network, Camera } from "lucide-react";
import { CasinoManagement } from "@/components/admin/CasinoManagement";
import { ServersAndPeersPanel } from "@/components/admin/ServersAndPeersPanel";
import CloudSnapshotsPage from "./CloudSnapshotsPage";

export const CloudManagementPage = () => {
  return (
    <Tabs defaultValue="casinos" className="space-y-4">
      <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
        <TabsTrigger value="casinos" className="gap-1.5"><Building2 className="w-3.5 h-3.5" /> Casinos</TabsTrigger>
        <TabsTrigger value="peers" className="gap-1.5"><Network className="w-3.5 h-3.5" /> Servers & Peers</TabsTrigger>
        <TabsTrigger value="snapshots" className="gap-1.5"><Camera className="w-3.5 h-3.5" /> Snapshots</TabsTrigger>
      </TabsList>

      <TabsContent value="casinos"><CasinoManagement /></TabsContent>
      <TabsContent value="peers"><ServersAndPeersPanel /></TabsContent>
      <TabsContent value="snapshots"><CloudSnapshotsPage /></TabsContent>
    </Tabs>
  );
};

export default CloudManagementPage;
