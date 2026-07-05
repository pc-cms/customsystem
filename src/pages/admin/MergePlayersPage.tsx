import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Users } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DuplicateSuggestions } from "@/components/merge/DuplicateSuggestions";
import { ManualSearch } from "@/components/merge/ManualSearch";
import { MergeBasket } from "@/components/merge/MergeBasket";
import { MergeWizard } from "@/components/merge/MergeWizard";
import { useAuth } from "@/lib/auth-context";

const MergePlayersPage = () => {
  const { roles, loading } = useAuth();
  const navigate = useNavigate();
  const [wizardOpen, setWizardOpen] = useState(false);

  if (loading) return null;

  const allowed = roles.includes("super_admin") || roles.includes("manager") || roles.includes("shift_manager");
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <PageShell>
      <PageHeader
        icon={Users}
        title="Merge duplicate players"
        subtitle="Combine 2–5 duplicate profiles into a single surviving record. This action is permanent."
      />
      <PageSection>
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div>
            <Tabs defaultValue="suggested">
              <TabsList>
                <TabsTrigger value="suggested">Suggested duplicates</TabsTrigger>
                <TabsTrigger value="manual">Manual search</TabsTrigger>
              </TabsList>
              <TabsContent value="suggested" className="mt-4">
                <DuplicateSuggestions />
              </TabsContent>
              <TabsContent value="manual" className="mt-4">
                <ManualSearch />
              </TabsContent>
            </Tabs>
          </div>
          <div>
            <MergeBasket onMerge={() => setWizardOpen(true)} />
          </div>
        </div>
      </PageSection>

      <MergeWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onDone={(_id, survivorId) => navigate(`/players/${survivorId}`)}
      />
    </PageShell>
  );
};

export default MergePlayersPage;
