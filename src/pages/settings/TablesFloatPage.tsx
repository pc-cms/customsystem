import { Settings } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import TableManagement from "@/components/admin/TableManagement";
import FloatManagement from "@/components/admin/FloatManagement";
import MoveTableChips from "@/components/admin/MoveTableChips";
import { ChipEmissionDialog } from "@/components/chips/ChipEmissionDialog";

const TablesFloatPage = () => (
  <PageShell>
    <PageHeader icon={Settings} title="Tables & Float" subtitle="Tables, table float and chip moves" />
    <Tabs defaultValue="tables" className="space-y-4">
      <TabsList>
        <TabsTrigger value="tables">Tables</TabsTrigger>
        <TabsTrigger value="float">Float</TabsTrigger>
        <TabsTrigger value="move">Move Chips</TabsTrigger>
      </TabsList>
      <TabsContent value="tables"><TableManagement /></TabsContent>
      <TabsContent value="float">
        <div className="space-y-4">
          <div className="flex justify-end"><ChipEmissionDialog /></div>
          <FloatManagement />
        </div>
      </TabsContent>
      <TabsContent value="move"><MoveTableChips /></TabsContent>
    </Tabs>
  </PageShell>
);

export default TablesFloatPage;
