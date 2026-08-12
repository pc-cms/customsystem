import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { useLoginVersionCheck } from "@/lib/login-version-check";

export default function PosLogin() {
  useLoginVersionCheck();
  const { user, roles: typedRoles } = useAuth();
  const roles = typedRoles as readonly string[];
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) {
    const target = roles.includes("pos_bartender") && !roles.includes("pos_waiter")
      ? "/pos/bar"
      : roles.includes("pos_manager") && !roles.includes("pos_waiter")
        ? "/pos/manager"
        : "/pos/waiter";
    return <Navigate to={target} replace />;
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate("/pos/waiter", { replace: true });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">POS</h1>
          <p className="text-sm text-muted-foreground">Bar · Coffee · VIP service</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
      <p className="mt-8 text-[10px] font-sans text-primary text-center">
        ©2026 Amaell Group LLC. All rights reserved.
      </p>
    </div>
  );
}
