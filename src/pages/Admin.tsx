/**
 * Admin — top-level shell with 4 tabs:
 *   Casino Settings · Branding · Users & Roles · Cloud Management
 *
 * Cloud Management is super_admin only. Manager sees the first three.
 * Previous per-tab panels are grouped into sub-tabs inside each page.
 * Finance / Expense Categories were removed from the UI (data untouched).
 */
import { useAuth } from "@/lib/auth-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Shield, Palette, Users, Network } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import CasinoSettingsPage from "@/pages/admin/CasinoSettingsPage";
import BrandingPage from "@/pages/admin/BrandingPage";
import UsersAndRolesPage from "@/pages/admin/UsersAndRolesPage";
import CloudManagementPage from "@/pages/admin/CloudManagementPage";

const Admin = () => {
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const isFinanceManager = roles.includes("finance_manager");

  if (!isSuperAdmin && !isFinanceManager) {
    return (
      <div className="text-center py-16">
        <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-foreground">Access Restricted</h2>
        <p className="text-sm text-muted-foreground mt-1">Admin panel is restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        icon={Settings}
        title="Administration"
        subtitle={isSuperAdmin ? "System, Casino & User Management" : "Casino & User Management"}
        date
      />

      <Tabs defaultValue="casino-settings" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 justify-start">
          <TabsTrigger value="casino-settings" className="gap-1.5">
            <Settings className="w-3.5 h-3.5" /> Casino Settings
          </TabsTrigger>
          <TabsTrigger value="branding" className="gap-1.5">
            <Palette className="w-3.5 h-3.5" /> Branding
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <Users className="w-3.5 h-3.5" /> Users & Roles
          </TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="cloud" className="gap-1.5">
              <Network className="w-3.5 h-3.5" /> Cloud Management
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="casino-settings"><CasinoSettingsPage /></TabsContent>
        <TabsContent value="branding"><BrandingPage /></TabsContent>
        <TabsContent value="users"><UsersAndRolesPage /></TabsContent>
        {isSuperAdmin && <TabsContent value="cloud"><CloudManagementPage /></TabsContent>}
      </Tabs>
    </div>
  );
};

export default Admin;
