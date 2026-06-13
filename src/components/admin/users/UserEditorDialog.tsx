/**
 * UserEditorDialog — single dialog for both "Create" and "Edit" flows.
 *
 * Wide layout (size="2xl") via ResponsiveDialog so it auto-converts to a
 * bottom Drawer on mobile, per the design system rules.
 *
 * Roles are picked as multi-select checkboxes. A user can hold any number of
 * roles — has_role() in the DB is OR-based and all RLS policies already use it.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ROLE_LABELS,
  ALL_ROLES,
  NON_SUPER_ROLES,
  useAllCasinos,
  useCreateUser,
  useUpdateUserRoles,
  useResetPassword,
  useDisableUser,
} from "./users-hooks";
import { KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type UserEditorTarget =
  | { mode: "create" }
  | {
      mode: "edit";
      userId: string;
      displayName: string;
      casinoId: string | null;
      roles: string[];
    };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: UserEditorTarget | null;
}

export const UserEditorDialog = ({ open, onOpenChange, target }: Props) => {
  const { user: currentUser, roles: callerRoles } = useAuth();
  const isSuperAdmin = callerRoles.includes("super_admin");
  const availableRoles = isSuperAdmin ? (ALL_ROLES as readonly string[]) : NON_SUPER_ROLES;

  const { data: casinos = [] } = useAllCasinos();
  const createUser = useCreateUser();
  const updateRoles = useUpdateUserRoles();
  const resetPassword = useResetPassword();
  const disableUser = useDisableUser();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [casinoId, setCasinoId] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmDisable, setConfirmDisable] = useState(false);

  // Hydrate form when dialog opens
  useEffect(() => {
    if (!open || !target) return;
    setNewPassword("");
    setConfirmDisable(false);
    if (target.mode === "edit") {
      setLogin("");
      setPassword("");
      setDisplayName(target.displayName || "");
      setCasinoId(target.casinoId || "");
      setSelectedRoles(target.roles);
    } else {
      setLogin("");
      setPassword("");
      setDisplayName("");
      setCasinoId("");
      setSelectedRoles([]);
    }
  }, [open, target]);

  // Single-role model: selecting a role replaces any previously selected one.
  const setSingleRole = (r: string, checked: boolean) => {
    setSelectedRoles(checked ? [r] : []);
  };

  const isCreate = target?.mode === "create";

  const canSubmit = useMemo(() => {
    if (!target) return false;
    if (target.mode === "create") {
      if (!login.trim() || !displayName.trim()) return false;
      if (password.length < 6) return false;
      if (isSuperAdmin && !casinoId) return false;
      return true;
    }
    return displayName.trim().length > 0;
  }, [target, login, password, displayName, casinoId, isSuperAdmin]);

  const handleSubmit = async () => {
    if (!target) return;
    if (target.mode === "create") {
      try {
        const created = await createUser.mutateAsync({
          login: login.trim(),
          password,
          display_name: displayName.trim(),
          roles: selectedRoles,
          casino_id: casinoId || undefined,
        });
        // create-user already inserted the requested roles; nothing else to do.
        void created;
        onOpenChange(false);
      } catch {/* toast in hook */}
    } else {
      try {
        await updateRoles.mutateAsync({ userId: target.userId, roles: selectedRoles });
        // Note: editing display_name / password is a follow-up feature — not in current scope
        onOpenChange(false);
      } catch {/* toast in hook */}
    }
  };

  const busy = createUser.isPending || updateRoles.isPending;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isCreate ? "Create User" : `Edit roles — ${target?.mode === "edit" ? target.displayName : ""}`}
      description={
        isCreate
          ? "Login is the username the user types on the sign-in screen. A user can have multiple roles."
          : "Toggle roles. A user can hold several roles at once — access is granted by ANY matching role."
      }
      size="2xl"
    >
      <div className="space-y-5">
        {isCreate && isSuperAdmin && (
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
              Casino
            </label>
            <Select value={casinoId} onValueChange={setCasinoId}>
              <SelectTrigger>
                <SelectValue placeholder="Select casino" />
              </SelectTrigger>
              <SelectContent>
                {casinos.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {isCreate && (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                Login
              </label>
              <Input
                value={login}
                onChange={e => setLogin(e.target.value)}
                placeholder="e.g. cashier2"
                className="font-mono"
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground mt-1">User logs in with this name</p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="min 6 characters"
              />
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
            Display Name
          </label>
          <Input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="e.g. John Smith"
            disabled={!isCreate /* edit-mode rename is not in scope yet */}
          />
          {!isCreate && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Renaming users is not yet supported here — only roles are editable.
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
            Role {selectedRoles[0] ? `— ${ROLE_LABELS[selectedRoles[0]] || selectedRoles[0]}` : "(none)"}
          </label>
          <div className="grid sm:grid-cols-2 gap-2 rounded-md border border-border bg-muted/20 p-3">
            {availableRoles.map(role => {
              const checked = selectedRoles[0] === role;
              return (
                <label
                  key={role}
                  className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
                >
                  <input
                    type="radio"
                    name="user-role"
                    checked={checked}
                    onChange={e => setSingleRole(role, e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className={checked ? "font-medium text-foreground" : "text-card-foreground"}>
                    {ROLE_LABELS[role] || role}
                  </span>
                </label>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Each user holds exactly one role. Selecting a different role replaces the current one.
          </p>
        </div>

        {/* Danger zone — edit mode only */}
        {!isCreate && target?.mode === "edit" && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <Trash2 className="hidden" />
              <span className="text-xs font-semibold uppercase tracking-wider">Danger Zone</span>
            </div>

            {/* Reset password */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                Reset Password
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="text"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="New password (min 6 chars)"
                    className="pl-8 font-mono"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (target.mode !== "edit") return;
                    if (newPassword.length < 6) {
                      toast.error("Password must be at least 6 characters");
                      return;
                    }
                    try {
                      await resetPassword.mutateAsync({ userId: target.userId, newPassword });
                      setNewPassword("");
                    } catch {/* toast in hook */}
                  }}
                  disabled={resetPassword.isPending || newPassword.length < 6}
                >
                  {resetPassword.isPending ? "Resetting…" : "Reset"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                The user will need to use this password on next sign-in. Make sure to communicate it securely.
              </p>
            </div>

            {/* Disable user */}
            <div className="pt-3 border-t border-destructive/20">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                Disable User
              </label>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-muted-foreground">
                  Blocks sign-in but keeps all historical records and audit logs intact. Cannot be undone from this UI.
                </p>
                <Button
                  variant="destructive"
                  onClick={() => setConfirmDisable(true)}
                  disabled={target.userId === currentUser?.id || disableUser.isPending}
                  className="gap-1.5 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {disableUser.isPending ? "Disabling…" : "Disable"}
                </Button>
              </div>
              {target.userId === currentUser?.id && (
                <p className="text-[10px] text-destructive/80 mt-1">You cannot disable your own account.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={confirmDisable} onOpenChange={setConfirmDisable}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable user?</AlertDialogTitle>
            <AlertDialogDescription>
              {target?.mode === "edit" ? target.displayName : "This user"} will no longer be able to sign in.
              Historical logs and records remain intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (target?.mode !== "edit") return;
                try {
                  await disableUser.mutateAsync({ userId: target.userId });
                  setConfirmDisable(false);
                  onOpenChange(false);
                } catch {/* toast in hook */}
              }}
            >
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ResponsiveDialogFooter className="mt-6">
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit || busy}>
          {busy ? "Saving…" : isCreate ? "Create User" : "Save Roles"}
        </Button>
      </ResponsiveDialogFooter>

      {!canSubmit && isCreate && (
        <p className="hidden">{/* keeps tree stable */}</p>
      )}
      {/* Toasts: hooks already surface errors via sonner */}
      <span className="hidden">{toast.toString()}</span>
    </ResponsiveDialog>
  );
};
