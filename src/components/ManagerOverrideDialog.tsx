import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldAlert, Key, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { logAction } from "@/lib/logging";
import { cacheManagerCredentials, verifyOfflineManager } from "@/lib/offline-manager-auth";

interface ManagerOverrideDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (managerId: string) => void;
  title?: string;
  description?: string;
  actionType?: string;
  actionDetails?: Record<string, any>;
}

const ManagerOverrideDialog = ({
  open,
  onClose,
  onConfirm,
  title = "Manager Override Required",
  description = "This action requires manager authentication.",
  actionType = "MANAGER_OVERRIDE",
  actionDetails = {},
}: ManagerOverrideDialogProps) => {
  const { casinoId } = useAuth();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [rfid, setRfid] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [method, setMethod] = useState<"password" | "rfid">("password");
  const loginRef = useRef<HTMLInputElement>(null);
  const rfidRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setLogin("");
      setPassword("");
      setRfid("");
      setError("");
      setTimeout(() => {
        if (method === "password") loginRef.current?.focus();
        else rfidRef.current?.focus();
      }, 100);
    }
  }, [open, method]);

  const handlePasswordAuth = async () => {
    if (!login || !password) return;
    setLoading(true);
    setError("");

    const email = login.includes("@") ? login : `${login.toLowerCase().trim()}@cms.local`;

    // ── OFFLINE PATH ──────────────────────────────────────────────────────
    // If the browser is offline, skip the network round-trip entirely and
    // try the IndexedDB-cached PBKDF2 hash from a previous online verify
    // (12 h TTL). This is what keeps shift close / overrides working when
    // the line is down.
    if (!navigator.onLine) {
      const cached = await verifyOfflineManager(email, password);
      if (!cached) {
        setError("Offline — no cached credentials for this manager (verify online first within 12 h)");
        setLoading(false);
        return;
      }
      if (casinoId) {
        await logAction(casinoId, "system", actionType, {
          ...actionDetails,
          manager_id: cached.manager_id,
          manager_name: cached.display_name,
          auth_method: "password_offline",
          verified_offline: true,
        });
      }
      setLogin("");
      setPassword("");
      onConfirm(cached.manager_id);
      setLoading(false);
      return;
    }

    try {
      const { data, error: fnError } = await supabase.functions.invoke("verify-manager", {
        body: { email, password },
      });

      // supabase-js returns the response body in fnError.context for non-2xx,
      // so extract the real server-side error rather than masking it as "Invalid credentials".
      let serverError: string | null = null;
      if (fnError) {
        try {
          const ctx: any = (fnError as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            serverError = body?.error ?? null;
          }
        } catch { /* ignore */ }
      }

      if (fnError || !data?.manager_id) {
        // Network failure while marked online? Fall back to offline cache.
        const looksLikeNetwork = !!fnError && (
          fnError.message?.includes("Failed to fetch") ||
          fnError.message?.includes("NetworkError") ||
          fnError.message?.includes("network")
        );
        if (looksLikeNetwork) {
          const cached = await verifyOfflineManager(email, password);
          if (cached) {
            if (casinoId) {
              await logAction(casinoId, "system", actionType, {
                ...actionDetails,
                manager_id: cached.manager_id,
                manager_name: cached.display_name,
                auth_method: "password_offline_fallback",
                verified_offline: true,
              });
            }
            setLogin("");
            setPassword("");
            onConfirm(cached.manager_id);
            return;
          }
        }
        setError(serverError || data?.error || fnError?.message || "Invalid credentials");
        setLoading(false);
        return;
      }

      // Cache for offline use (best effort, never blocks the flow).
      void cacheManagerCredentials({
        login: email,
        password,
        manager_id: data.manager_id,
        display_name: data.display_name,
      });

      if (casinoId) {
        await logAction(casinoId, "system", actionType, {
          ...actionDetails,
          manager_id: data.manager_id,
          manager_name: data.display_name,
          auth_method: "password",
        });
      }

      setLogin("");
      setPassword("");
      onConfirm(data.manager_id);
    } catch {
      setError("Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleRfidAuth = async () => {
    if (!rfid.trim()) return;
    setLoading(true);
    setError("");

    try {
      const { data: lookupResult, error: lookupError } = await supabase
        .rpc("lookup_rfid_user", { rfid: rfid.trim() });

      const profile = Array.isArray(lookupResult) ? lookupResult[0] : lookupResult;

      if (lookupError || !profile) {
        setError("RFID tag not recognized");
        setLoading(false);
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", profile.user_id);

      const isManager = roles?.some(r => r.role === "manager" || r.role === "shift_manager");
      if (!isManager) {
        setError(`${profile.display_name} is not a manager or floor manager`);
        setLoading(false);
        return;
      }

      if (casinoId) {
        await logAction(casinoId, "system", actionType, {
          ...actionDetails,
          manager_id: profile.user_id,
          manager_name: profile.display_name,
          auth_method: "rfid",
        });
      }

      setRfid("");
      onConfirm(profile.user_id);
    } catch {
      setError("Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setLogin("");
    setPassword("");
    setRfid("");
    setError("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="w-5 h-5" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>

        <Tabs value={method} onValueChange={(v) => { setMethod(v as any); setError(""); }}>
          <TabsList className="w-full">
            <TabsTrigger value="password" className="flex-1 gap-1.5 text-xs">
              <Key className="w-3.5 h-3.5" /> Password
            </TabsTrigger>
            <TabsTrigger value="rfid" className="flex-1 gap-1.5 text-xs">
              <CreditCard className="w-3.5 h-3.5" /> RFID
            </TabsTrigger>
          </TabsList>

          <TabsContent value="password" className="space-y-2 mt-3">
            <Input
              ref={loginRef}
              type="text"
              placeholder="Login"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && document.getElementById("mgr-pwd")?.focus()}
              autoComplete="off"
              className="font-mono"
            />
            <Input
              id="mgr-pwd"
              type="password"
              placeholder="Manager password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePasswordAuth()}
              autoComplete="off"
            />
          </TabsContent>

          <TabsContent value="rfid" className="space-y-2 mt-3">
            <Input
              ref={rfidRef}
              type="text"
              placeholder="Scan RFID tag…"
              value={rfid}
              onChange={(e) => setRfid(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRfidAuth()}
              className="font-mono"
              autoComplete="off"
            />
            <p className="text-[10px] text-muted-foreground">Place manager RFID card on reader</p>
          </TabsContent>
        </Tabs>

        {error && <p className="text-xs text-destructive font-medium">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={method === "password" ? handlePasswordAuth : handleRfidAuth}
            disabled={loading || (method === "password" ? (!login || !password) : !rfid.trim())}
          >
            {loading ? "Verifying…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ManagerOverrideDialog;
