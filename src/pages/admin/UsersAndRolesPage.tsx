/**
 * Users & Roles — user management, role defaults, role consistency.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, ShieldCheck, Scale, MonitorSmartphone } from "lucide-react";
import { UsersTab } from "@/components/admin/users/UsersTab";
import { ActiveSessionsTab } from "@/components/admin/users/ActiveSessionsTab";
import { RoleDefaultsEditor } from "@/components/admin/RoleDefaultsEditor";
import { ConsistencyTab } from "@/components/admin/users/ConsistencyTab";
import { useAuth } from "@/lib/auth-context";

export const UsersAndRolesPage = () => {
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");

  return (
    <Tabs defaultValue="users" className="space-y-4">
      <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
        <TabsTrigger value="users" className="gap-1.5"><Users className="w-3.5 h-3.5" /> Users</TabsTrigger>
        <TabsTrigger value="sessions" className="gap-1.5">
          <MonitorSmartphone className="w-3.5 h-3.5" /> Active Sessions
        </TabsTrigger>
        {isSuperAdmin && (
          <TabsTrigger value="role-defaults" className="gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Role Defaults
          </TabsTrigger>
        )}
        {isSuperAdmin && (
          <TabsTrigger value="consistency" className="gap-1.5">
            <Scale className="w-3.5 h-3.5" /> Consistency
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="users"><UsersTab /></TabsContent>
      <TabsContent value="sessions"><ActiveSessionsTab /></TabsContent>
      {isSuperAdmin && <TabsContent value="role-defaults"><RoleDefaultsEditor /></TabsContent>}
      {isSuperAdmin && <TabsContent value="consistency"><ConsistencyTab /></TabsContent>}
    </Tabs>
  );
};

export default UsersAndRolesPage;
