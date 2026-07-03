/**
 * Users & Roles — user management, role defaults, cross-casino access.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, ShieldCheck, Globe } from "lucide-react";
import { UsersTab } from "@/components/admin/users/UsersTab";
import { RoleDefaultsEditor } from "@/components/admin/RoleDefaultsEditor";
import { CasinoAccessManagement } from "@/components/admin/CasinoAccessManagement";
import { useAuth } from "@/lib/auth-context";

export const UsersAndRolesPage = () => {
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");

  return (
    <Tabs defaultValue="users" className="space-y-4">
      <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
        <TabsTrigger value="users" className="gap-1.5"><Users className="w-3.5 h-3.5" /> Users</TabsTrigger>
        {isSuperAdmin && (
          <TabsTrigger value="role-defaults" className="gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Role Defaults
          </TabsTrigger>
        )}
        {isSuperAdmin && (
          <TabsTrigger value="casino-access" className="gap-1.5">
            <Globe className="w-3.5 h-3.5" /> Casino Access
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="users"><UsersTab /></TabsContent>
      {isSuperAdmin && <TabsContent value="role-defaults"><RoleDefaultsEditor /></TabsContent>}
      {isSuperAdmin && <TabsContent value="casino-access"><CasinoAccessManagement /></TabsContent>}
    </Tabs>
  );
};

export default UsersAndRolesPage;
