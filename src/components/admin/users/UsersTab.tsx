/**
 * UsersTab — universal spreadsheet-style users table.
 *
 * Columns: Login (inline editable), Name (inline editable), Roles (popover
 * multi-select with chips), Password (set new + Apply per row), Casino
 * (super-admin / premier only), Status + Actions.
 *
 * Single batched call via `useAdminUsers` (admin-list-users edge function)
 * returns login, display_name, roles, casino_ids in one round-trip.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DataTable,
  DTHead,
  DTBody,
  DTRow,
  DTHeader,
  DTCell,
} from "@/components/ui/data-table";
import {
  Plus,
  Search,
  SlidersHorizontal,
  Shield,
  Trash2,
  KeyRound,
  Check,
  X,
} from "lucide-react";
import { UserPermissionsDialog } from "@/components/admin/UserPermissionsDialog";
import {
  ROLE_LABELS,
  ALL_ROLES,
  NON_SUPER_ROLES,
  useAdminUsers,
  useAllCasinos,
  useDisableUser,
  useResetPassword,
  useUpdateUserRoles,
  useUpdateUserProfile,
  type AdminUserRow,
} from "./users-hooks";
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
import { toast } from "sonner";

type SortKey = "login" | "name" | "roles" | "casino";

export const UsersTab = () => {
  const navigate = useNavigate();
  const { user, roles: callerRoles } = useAuth();
  const { isSummaryMode } = useCasino();
  const isSuperAdmin = callerRoles.includes("super_admin");
  const showCasinoColumn = isSummaryMode;

  const { data: rows = [], isLoading } = useAdminUsers();
  const { data: casinos = [] } = useAllCasinos();
  const disableUser = useDisableUser();
  const resetPassword = useResetPassword();
  const updateRoles = useUpdateUserRoles();
  const updateProfile = useUpdateUserProfile();

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("login");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [permsTarget, setPermsTarget] = useState<{ id: string; name: string } | null>(null);
  const [disableTarget, setDisableTarget] = useState<{ id: string; name: string } | null>(null);

  const availableRoles = isSuperAdmin
    ? (ALL_ROLES as readonly string[])
    : NON_SUPER_ROLES;

  const casinoName = (id: string | null) =>
    id ? casinos.find((c) => c.id === id)?.name ?? id.slice(0, 8) : "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = isSuperAdmin
      ? rows
      : rows.filter((r) => !r.roles.includes("super_admin"));
    const matched = !q
      ? visible
      : visible.filter((r) => {
          return (
            (r.login || "").toLowerCase().includes(q) ||
            (r.display_name || "").toLowerCase().includes(q) ||
            r.roles.join(" ").toLowerCase().includes(q)
          );
        });
    const sorted = [...matched].sort((a, b) => {
      let av = "";
      let bv = "";
      if (sortKey === "login") {
        av = a.login || "";
        bv = b.login || "";
      } else if (sortKey === "name") {
        av = a.display_name || "";
        bv = b.display_name || "";
      } else if (sortKey === "roles") {
        av = a.roles.slice().sort().join(",");
        bv = b.roles.slice().sort().join(",");
      } else {
        av = casinoName(a.casino_id);
        bv = casinoName(b.casino_id);
      }
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, search, isSuperAdmin, sortKey, sortDir, casinos]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const sortIndicator = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div className="space-y-4">
      {/* Header / actions */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-card-foreground">Users &amp; Roles</h3>
          <p className="text-xs text-muted-foreground">
            Click any cell to edit. Roles, login and name update instantly. Password is set per row via the Reset field.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search login, name, role…"
              className="pl-8 w-64"
            />
          </div>
          <Button onClick={() => navigate("/admin/users/new")} className="gap-1.5">
            <Plus className="w-4 h-4" /> New User
          </Button>
        </div>
      </div>

      <DataTable>
        <DTHead>
          <DTRow>
            <DTHeader
              className="cursor-pointer select-none w-[180px]"
              onClick={() => toggleSort("login")}
            >
              Login{sortIndicator("login")}
            </DTHeader>
            <DTHeader
              className="cursor-pointer select-none w-[220px]"
              onClick={() => toggleSort("name")}
            >
              Name{sortIndicator("name")}
            </DTHeader>
            <DTHeader
              className="cursor-pointer select-none"
              onClick={() => toggleSort("roles")}
            >
              Roles{sortIndicator("roles")}
            </DTHeader>
            <DTHeader className="w-[300px]">Password</DTHeader>
            {showCasinoColumn && (
              <DTHeader
                className="cursor-pointer select-none w-[160px]"
                onClick={() => toggleSort("casino")}
              >
                Casino{sortIndicator("casino")}
              </DTHeader>
            )}
            <DTHeader align="right" className="w-[110px]">
              Actions
            </DTHeader>
          </DTRow>
        </DTHead>
        <DTBody>
          {filtered.map((r) => {
            const isSelf = r.user_id === user?.id;
            const visibleRoles = isSuperAdmin ? r.roles : r.roles.filter((x) => x !== "super_admin");
            return (
              <DTRow key={r.user_id} className={r.disabled_at ? "opacity-50" : undefined}>
                <DTCell className="font-mono text-xs">
                  <InlineText
                    value={r.login}
                    placeholder="login"
                    onSave={(v) =>
                      updateProfile.mutateAsync({ userId: r.user_id, login: v }).catch(() => {})
                    }
                  />
                </DTCell>
                <DTCell>
                  <InlineText
                    value={r.display_name ?? ""}
                    placeholder="name"
                    onSave={(v) =>
                      updateProfile
                        .mutateAsync({ userId: r.user_id, display_name: v })
                        .catch(() => {})
                    }
                  />
                  {isSelf && (
                    <span className="text-[10px] text-muted-foreground ml-1">(you)</span>
                  )}
                  {r.disabled_at && (
                    <Badge variant="outline" className="ml-1.5 text-[10px]">
                      Disabled
                    </Badge>
                  )}
                </DTCell>
                <DTCell>
                  <RoleCell
                    roles={visibleRoles}
                    available={availableRoles}
                    onSave={(next) =>
                      updateRoles
                        .mutateAsync({ userId: r.user_id, roles: next })
                        .catch(() => {})
                    }
                  />
                </DTCell>
                <DTCell>
                  <PasswordCell
                    onApply={async (pwd) => {
                      await resetPassword
                        .mutateAsync({ userId: r.user_id, newPassword: pwd })
                        .catch(() => {});
                    }}
                  />
                </DTCell>
                {showCasinoColumn && (
                  <DTCell className="text-xs text-muted-foreground">
                    {casinoName(r.casino_id)}
                    {r.casino_ids.length > 1 && (
                      <span className="ml-1 text-muted-foreground/60">
                        +{r.casino_ids.length - 1}
                      </span>
                    )}
                  </DTCell>
                )}
                <DTCell align="right">
                  <div className="flex gap-0.5 justify-end">
                    {isSuperAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setPermsTarget({ id: r.user_id, name: r.display_name || "User" })
                        }
                        title="Module permissions"
                        className="h-8 w-8"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setDisableTarget({ id: r.user_id, name: r.display_name || "User" })
                      }
                      title="Disable user"
                      disabled={isSelf || !!r.disabled_at}
                      className="h-8 w-8 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </DTCell>
              </DTRow>
            );
          })}
          {!isLoading && filtered.length === 0 && (
            <DTRow>
              <DTCell
                colSpan={showCasinoColumn ? 6 : 5}
                className="text-center py-10"
              >
                <Shield className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  {search ? "No users match your search" : "No users yet — click “New User”."}
                </p>
              </DTCell>
            </DTRow>
          )}
          {isLoading && (
            <DTRow>
              <DTCell
                colSpan={showCasinoColumn ? 6 : 5}
                className="text-center py-10 text-sm text-muted-foreground"
              >
                Loading…
              </DTCell>
            </DTRow>
          )}
        </DTBody>
      </DataTable>

      <UserPermissionsDialog
        open={!!permsTarget}
        onOpenChange={(o) => !o && setPermsTarget(null)}
        userId={permsTarget?.id ?? null}
        userName={permsTarget?.name ?? ""}
        userRoles={permsTarget ? rows.find((r) => r.user_id === permsTarget.id)?.roles ?? [] : []}
      />

      <AlertDialog open={!!disableTarget} onOpenChange={(o) => !o && setDisableTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable user?</AlertDialogTitle>
            <AlertDialogDescription>
              {disableTarget?.name} will no longer be able to sign in. Historical logs and records
              stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!disableTarget) return;
                disableUser.mutate(
                  { userId: disableTarget.id },
                  { onSuccess: () => setDisableTarget(null) },
                );
              }}
            >
              Disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Inline cell editors
// ─────────────────────────────────────────────────────────────────────────────

const InlineText = ({
  value,
  placeholder,
  onSave,
}: {
  value: string;
  placeholder?: string;
  onSave: (v: string) => void | Promise<void>;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="w-full text-left px-1 -mx-1 py-0.5 rounded hover:bg-accent/40 truncate"
      >
        {value || <span className="text-muted-foreground italic">{placeholder ?? "—"}</span>}
      </button>
    );
  }

  const commit = async () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== value) await onSave(next);
  };

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          setEditing(false);
          setDraft(value);
        }
      }}
      className="w-full bg-background border border-primary/40 rounded px-1 py-0.5 text-xs"
    />
  );
};

const RoleCell = ({
  roles,
  available,
  onSave,
}: {
  roles: string[];
  available: readonly string[];
  onSave: (next: string[]) => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(roles);

  const toggle = (r: string, checked: boolean) =>
    setDraft((prev) => (checked ? [...prev, r] : prev.filter((x) => x !== r)));

  const apply = async () => {
    setOpen(false);
    const a = [...roles].sort().join(",");
    const b = [...draft].sort().join(",");
    if (a !== b) await onSave(draft);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o) setDraft(roles);
        setOpen(o);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full text-left flex flex-wrap gap-1 px-1 -mx-1 py-0.5 rounded hover:bg-accent/40 min-h-[24px]"
        >
          {roles.length === 0 ? (
            <span className="text-xs text-muted-foreground/60 italic">No roles</span>
          ) : (
            roles.map((r) => (
              <Badge key={r} variant="secondary" className="text-[10px] font-medium">
                {ROLE_LABELS[r] || r}
              </Badge>
            ))
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider px-1 mb-1">
          Roles ({draft.length})
        </div>
        <div className="space-y-0.5">
          {available.map((r) => {
            const checked = draft.includes(r);
            return (
              <label
                key={r}
                className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1 hover:bg-muted/40"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => toggle(r, c === true)}
                />
                <span>{ROLE_LABELS[r] || r}</span>
              </label>
            );
          })}
        </div>
        <div className="flex justify-end gap-1 pt-2 mt-1 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(roles);
              setOpen(false);
            }}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" onClick={apply}>
            <Check className="w-3.5 h-3.5 mr-1" /> Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const PasswordCell = ({ onApply }: { onApply: (pwd: string) => Promise<void> }) => {
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    if (pwd.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      await onApply(pwd);
      setPwd("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex gap-1.5 items-center">
      <div className="relative flex-1">
        <KeyRound className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder="New password…"
          className="pl-7 h-7 font-mono text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={apply}
        disabled={busy || pwd.length < 6}
        className="h-7 px-2"
      >
        {busy ? "…" : "Apply"}
      </Button>
    </div>
  );
};
