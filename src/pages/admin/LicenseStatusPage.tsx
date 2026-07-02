import { useBoxLicense } from "@/hooks/use-box-license";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Lock, Shield, ShieldCheck, ShieldAlert } from "lucide-react";
import { fmtDate } from "@/lib/format-date";

export default function LicenseStatusPage() {
  const { mode, license, daysUsed, daysUntilRestricted, daysUntilStop, isCloud } =
    useBoxLicense();
  const { hasRole } = useAuth();
  const isSuperAdmin = hasRole?.("super_admin");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  if (isCloud) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" /> Cloud instance
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This deployment runs on the Casino Cloud. License grace-period rules
            do not apply here — full functionality is always available.
          </CardContent>
        </Card>
      </div>
    );
  }

  const modeColor =
    mode === "full" ? "default" : mode === "restricted" ? "secondary" : "destructive";

  const modeIcon =
    mode === "full" ? ShieldCheck : mode === "restricted" ? ShieldAlert : Lock;
  const Icon = modeIcon;

  const applyCode = async () => {
    if (!code.trim() || !license) return;
    setSaving(true);
    // Simple activation: server-side validation lives in a future edge function.
    // For now, super_admin can enter a code that extends license_expires_at.
    // Codes format expected: BASE32 12 chars -> 365 day extension (placeholder).
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 365);
    const { error } = await supabase
      .from("box_licenses")
      .update({
        license_key: code.trim(),
        license_expires_at: newExpiry.toISOString(),
        notes: `Activated ${new Date().toISOString()}`,
      })
      .eq("id", license.id);
    setSaving(false);
    if (error) {
      toast.error(`Activation failed: ${error.message}`);
      return;
    }
    toast.success("License activated for 365 days.");
    setCode("");
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Icon className="h-5 w-5" /> Box License
            </CardTitle>
            <Badge variant={modeColor as never}>{mode.toUpperCase()}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="text-muted-foreground">Node</div>
            <div className="font-mono">{license?.node_id ?? "—"}</div>
            <div className="text-muted-foreground">Activated</div>
            <div>{license ? fmtDate(license.activated_at) : "—"}</div>
            <div className="text-muted-foreground">Days used</div>
            <div>{daysUsed}</div>
            <div className="text-muted-foreground">Days until restricted</div>
            <div>{daysUntilRestricted ?? "—"}</div>
            <div className="text-muted-foreground">Days until stop</div>
            <div>{daysUntilStop ?? "—"}</div>
            <div className="text-muted-foreground">Renewal expires</div>
            <div>
              {license?.license_expires_at
                ? fmtDate(license.license_expires_at)
                : "—"}
            </div>
          </div>

          <div className="rounded-md border border-border/60 p-3 text-xs bg-muted/30">
            <div className="font-medium mb-1">Grace-period policy</div>
            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
              <li>Days 0–{license?.full_days ?? 60}: full functionality</li>
              <li>
                Days {license?.full_days ?? 60}–
                {(license?.full_days ?? 60) + (license?.restricted_days ?? 30)}:
                cashier operations and pit table open/close only
              </li>
              <li>
                After day{" "}
                {(license?.full_days ?? 60) + (license?.restricted_days ?? 30)}:
                read-only until an activation code is entered
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" /> Enter activation code
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {license?.challenge_nonce && (
              <div className="rounded-md border border-border/60 p-3 text-xs">
                <div className="text-muted-foreground mb-1">Support challenge:</div>
                <div className="font-mono text-base">{license.challenge_nonce}</div>
                <div className="text-muted-foreground mt-1">
                  Share this with support; they will return an activation code.
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="code">Activation code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX"
                className="font-mono uppercase tracking-wider"
              />
            </div>
            {license?.notes && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <Textarea readOnly value={license.notes} className="text-xs" rows={2} />
              </div>
            )}
            <Button
              onClick={applyCode}
              disabled={saving || code.length < 6}
              className="w-full"
            >
              {saving ? "Applying…" : "Apply activation code"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
