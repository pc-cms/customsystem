import { Outlet, NavLink, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { LogOut, Coffee, Monitor, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// POS access is limited to dedicated POS roles (waiter / bartender / bar
// manager) and super_admin. Casino-level manager / finance_manager /
// surveillance roles have NO access to POS surfaces.
const isPosRole = (roles: readonly string[]) =>
  roles.includes("pos_waiter") ||
  roles.includes("pos_bartender") ||
  roles.includes("pos_manager") ||
  roles.includes("super_admin");

export const PosLayout = () => {
  const { user, loading, roles: typedRoles } = useAuth();
  const roles = typedRoles as readonly string[];
  const navigate = useNavigate();

  if (loading) return null;
  if (!user) return <Navigate to="/pos/login" replace />;
  if (!isPosRole(roles)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold mb-2">POS access required</h1>
          <p className="text-muted-foreground mb-4">
            Your account does not have a POS role.
          </p>
          <Button onClick={() => navigate("/")}>Back to main app</Button>
        </div>
      </div>
    );
  }

  const canWaiter = roles.includes("pos_waiter") || roles.includes("pos_manager") || roles.includes("super_admin");
  const canBar = roles.includes("pos_bartender") || roles.includes("pos_manager") || roles.includes("super_admin");
  const canManage =
    roles.includes("pos_manager") ||
    roles.includes("super_admin");

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex-1 flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium ${
      isActive ? "text-primary border-t-2 border-primary" : "text-muted-foreground"
    }`;

  return (
    <div className="min-h-screen flex flex-col bg-background" data-density="touch">
      <header className="flex items-center justify-between px-4 h-12 border-b">
        <div className="font-semibold tracking-tight">POS</div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate("/pos/login");
          }}
        >
          <LogOut className="h-4 w-4 mr-1" /> Sign out
        </Button>
      </header>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
      <nav className="flex border-t bg-card">
        {canWaiter && (
          <NavLink to="/pos/waiter" className={linkCls}>
            <Coffee className="h-5 w-5" /> Waiter
          </NavLink>
        )}
        {canBar && (
          <NavLink to="/pos/bar" className={linkCls}>
            <Monitor className="h-5 w-5" /> Bar
          </NavLink>
        )}
        {canManage && (
          <NavLink to="/pos/manager" className={linkCls}>
            <Settings className="h-5 w-5" /> Manager
          </NavLink>
        )}
      </nav>
    </div>
  );
};

export default PosLayout;
