/**
 * /superadmin/license — active license viewer + upload flow.
 * super_admin only. Uploads license.dat → verify-license edge function →
 * DB upsert → banner and ModuleGates update within 60 s (query staleTime).
 */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { useLicense } from "@/hooks/use-license";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { KeyRound, Upload, Download, Shield, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format-date";

export default function SuperadminLicensePage() {
  const { roles } = useAuth();
  const { activeCasinoId, activeCasino } = useCasino();
  const license = useLicense();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const isSuper = roles.includes("super_admin");
  if (!isSuper) {
    return (
      <div className="text-center py-16">
        <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-lg font-semibold">Access Restricted</h2>
        <p className="text-sm text-muted-foreground mt-1">
          License management is restricted to super administrators.
        </p>
      </div>
    );
  }

  const onUpload = async (file: File) => {
    if (!activeCasinoId) {
      toast.error("No active casino selected");
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const licenseFile = JSON.parse(text);
      if (!licenseFile?.payload || !licenseFile?.signature) {
        throw new Error("Invalid license file format");
      }
      const { data, error } = await supabase.functions.invoke("verify-license", {
        body: { casino_id: activeCasinoId, license_file: licenseFile },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "verification_failed");

      toast.success("License activated");
      qc.invalidateQueries({ queryKey: ["casino-license"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`License upload failed: ${msg}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onDownloadCurrent = async () => {
    if (!activeCasinoId) return;
    const { data } = await supabase
      .from("casino_license")
      .select("payload, signature")
      .eq("casino_id", activeCasinoId)
      .maybeSingle();
    if (!data) {
      toast.error("No license to download");
      return;
    }
    const blob = new Blob([JSON.stringify({ payload: data.payload, signature: data.signature }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeCasino?.slug ?? "casino"}-license.dat`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusColor = license.isImplicit
    ? "text-muted-foreground"
    : !license.isValid
    ? "text-destructive"
    : license.daysLeft !== null && license.daysLeft <= 14
    ? "text-warning"
    : "cms-amount-positive";

  return (
    <div className="space-y-4">
      <PageHeader icon={KeyRound} title="License" subtitle="Signed license & feature package" />

      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">
              Active Package
            </div>
            <div className="text-2xl font-bold font-mono">{license.packageCode}</div>
            {license.isImplicit && (
              <div className="text-xs text-muted-foreground mt-1">
                Cloud / no signed license — all modules enabled (implicit enterprise).
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">Status</div>
            <div className={`text-lg font-semibold ${statusColor}`}>
              {license.isImplicit
                ? "Unlimited"
                : !license.isValid
                ? "Expired"
                : license.daysLeft !== null && license.daysLeft <= 14
                ? `Expires in ${license.daysLeft} d`
                : "Valid"}
            </div>
          </div>
        </div>

        {!license.isImplicit && license.expiresAt && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border">
            <Stat label="Activated" value={license.activatedAt ? fmtDate(license.activatedAt) : "—"} />
            <Stat label="Expires" value={fmtDate(license.expiresAt)} />
            <Stat label="Modules" value={String(license.modules.size)} />
            <Stat label="License ID" value={license.licenseId?.slice(0, 8) ?? "—"} mono />
          </div>
        )}

        {!license.isValid && !license.isImplicit && (
          <div className="flex items-center gap-2 p-3 rounded bg-destructive/10 border border-destructive/30 text-destructive text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            License expired. System is read-only until a new license is activated.
          </div>
        )}
        {license.isValid && !license.isImplicit && (
          <div className="flex items-center gap-2 p-3 rounded bg-success/10 border border-success/30 text-sm">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0 cms-amount-positive" />
            Signature verified. {license.modules.size} modules enabled.
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-1">Upload new license</h3>
          <p className="text-xs text-muted-foreground">
            Drop a signed <code className="font-mono">license.dat</code> issued by the release team.
            Signature is verified server-side before activation.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".dat,.json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
            }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="w-4 h-4 mr-2" />
            {busy ? "Verifying…" : "Upload license.dat"}
          </Button>
          {!license.isImplicit && (
            <Button variant="outline" onClick={onDownloadCurrent}>
              <Download className="w-4 h-4 mr-2" />
              Download current
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className={`text-sm font-semibold ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
