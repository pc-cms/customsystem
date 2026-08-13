/**
 * ActiveSessionsTab — who is currently logged in (per casino / per user),
 * when the session started, last activity, device — plus "End session"
 * which revokes all refresh tokens so the user must log in again.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { LogOut, RefreshCw, MonitorSmartphone } from "lucide-react";
import { ROLE_LABELS } from "./users-hooks";

type SessionRow = {
  session_id: string;
  user_id: string;
  login: string;
  display_name: string | null;
  casino_id: string | null;
  casino_name: string | null;
  casino_code: string | null;
  roles: string[];
  disabled: boolean;
  created_at: string;
  last_seen_at: string;
  user_agent: string | null;
  ip: string | null;
};

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const ago = (iso: string | null) => {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const device = (ua: string | null) => {
  if (!ua) return "—";
  const os = /Windows/i.test(ua) ? "Windows"
    : /Android/i.test(ua) ? "Android"
    : /iPhone|iPad|iOS/i.test(ua) ? "iOS"
    : /Mac OS/i.test(ua) ? "macOS"
    : /Linux/i.test(ua) ? "Linux" : "Unknown";
  const br = /Edg\//i.test(ua) ? "Edge"
    : /Chrome\//i.test(ua) ? "Chrome"
    : /Firefox\//i.test(ua) ? "Firefox"
    : /Safari\//i.test(ua) ? "Safari" : "";
  return br ? `${os} · ${br}` : os;
};

export const ActiveSessionsTab = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<SessionRow | null>(null);

  const { data: rows = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-active-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-sessions", {
        body: { action: "list" },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return ((data as any)?.rows ?? []) as SessionRow[];
    },
    refetchInterval: 60000,
  });

  const revoke = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("admin-sessions", {
        body: { action: "revoke", user_id: userId },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
    },
    onSuccess: () => {
      toast.success("Session ended — user must sign in again");
      qc.invalidateQueries({ queryKey: ["admin-active-sessions"] });
    },
    onError: (e: any) => toast.error(e.message || "Failed to end session"),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.login, r.display_name, r.casino_name, r.casino_code, ...(r.roles || [])]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, search]);

  const byCasino = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => {
      const k = r.casino_name || "—";
      m.set(k, (m.get(k) || 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const columns: ColumnDef<SessionRow>[] = [
    {
      key: "user",
      header: "User",
      accessor: (r) => (
        <div className="min-w-0">
          <div className="font-medium truncate">{r.display_name || r.login}</div>
          <div className="text-[10px] text-muted-foreground font-mono truncate">{r.login}</div>
        </div>
      ),
      sortValue: (r) => (r.display_name || r.login || "").toLowerCase(),
    },
    {
      key: "casino",
      header: "Casino",
      accessor: (r) => r.casino_name || "—",
      sortValue: (r) => r.casino_name || "",
    },
    {
      key: "roles",
      header: "Roles",
      accessor: (r) => (
        <div className="flex flex-wrap gap-1">
          {(r.roles || []).map((role) => (
            <Badge key={role} variant="secondary" className="text-[10px]">
              {ROLE_LABELS[role] || role}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "created_at",
      header: "Signed in",
      accessor: (r) => <span className="font-mono text-xs">{fmt(r.created_at)}</span>,
      sortValue: (r) => r.created_at,
    },
    {
      key: "last_seen_at",
      header: "Last activity",
      accessor: (r) => (
        <span className="font-mono text-xs">
          {ago(r.last_seen_at)}
        </span>
      ),
      sortValue: (r) => r.last_seen_at,
    },
    {
      key: "device",
      header: "Device",
      accessor: (r) => (
        <span className="text-xs text-muted-foreground">
          {device(r.user_agent)}
          {r.ip ? ` · ${r.ip}` : ""}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      accessor: (r) => (
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5"
          onClick={() => setTarget(r)}
          disabled={revoke.isPending}
        >
          <LogOut className="w-3.5 h-3.5" /> End session
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search user, casino, role…"
          className="h-8 w-64"
        />
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => refetch()}>
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
        <div className="flex items-center gap-2 ml-auto text-xs text-muted-foreground">
          <MonitorSmartphone className="w-3.5 h-3.5" />
          {rows.length} active
          {byCasino.map(([name, n]) => (
            <Badge key={name} variant="outline" className="text-[10px]">
              {name}: {n}
            </Badge>
          ))}
        </div>
      </div>

      <SmartTable
        data={filtered}
        columns={columns}
        rowKey={(r) => r.session_id}
        loading={isLoading}
        defaultSort={{ key: "last_seen_at", dir: "desc" }}
        empty={<div className="p-6 text-center text-sm text-muted-foreground">No active sessions</div>}
      />

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End session?</AlertDialogTitle>
            <AlertDialogDescription>
              {target?.display_name || target?.login} will be signed out on all devices and must
              log in to the application again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (target) revoke.mutate(target.user_id);
                setTarget(null);
              }}
            >
              End session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ActiveSessionsTab;
