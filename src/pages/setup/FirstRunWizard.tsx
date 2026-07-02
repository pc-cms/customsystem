import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Check, ChevronRight, Server, Palette, Network, Radio, Cloud, Sparkles } from "lucide-react";

type Step = "welcome" | "branding" | "network" | "tailscale" | "cloud" | "demo" | "done";
const ORDER: Step[] = ["welcome", "branding", "network", "tailscale", "cloud", "demo", "done"];

interface Draft {
  casino_name: string;
  casino_slug: string;
  primary_color: string;
  net_mode: "dhcp" | "static";
  net_ip: string;
  net_gateway: string;
  net_dns: string;
  tailscale_enabled: boolean;
  cloud_url: string;
  cloud_pairing_code: string;
  seed_demo: boolean;
}

const DEFAULT: Draft = {
  casino_name: "",
  casino_slug: "",
  primary_color: "#3B82F6",
  net_mode: "dhcp",
  net_ip: "",
  net_gateway: "",
  net_dns: "1.1.1.1",
  tailscale_enabled: true,
  cloud_url: "",
  cloud_pairing_code: "",
  seed_demo: true,
};

/**
 * First-Run Wizard for a boxed server. Runs when box_config.is_setup_complete = false.
 * Available anonymously (RLS grants anon read on box_config); the wizard bootstraps
 * a super_admin account on the final step which then owns all further changes.
 */
export default function FirstRunWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");
  const [draft, setDraft] = useState<Draft>(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [nodeId, setNodeId] = useState<string>("");

  useEffect(() => {
    // Derive node_id from window; fallback to random for previews.
    const id =
      window.localStorage.getItem("box_node_id") ||
      `box-${crypto.randomUUID().slice(0, 8)}`;
    window.localStorage.setItem("box_node_id", id);
    setNodeId(id);
  }, []);

  const idx = ORDER.indexOf(step);
  const progress = Math.round((idx / (ORDER.length - 1)) * 100);
  const next = () => setStep(ORDER[Math.min(idx + 1, ORDER.length - 1)]);
  const back = () => setStep(ORDER[Math.max(idx - 1, 0)]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const finish = async () => {
    setSaving(true);
    const { error } = await supabase.from("box_config").upsert(
      {
        node_id: nodeId,
        is_setup_complete: true,
        casino_slug: draft.casino_slug || null,
        casino_name: draft.casino_name || null,
        branding: { primary_color: draft.primary_color },
        network: {
          mode: draft.net_mode,
          ip: draft.net_ip,
          gateway: draft.net_gateway,
          dns: draft.net_dns,
        },
        tailscale: { enabled: draft.tailscale_enabled },
        cloud_link: {
          url: draft.cloud_url,
          pairing_code: draft.cloud_pairing_code,
          paired_at: draft.cloud_url ? new Date().toISOString() : null,
        },
      },
      { onConflict: "node_id" }
    );
    setSaving(false);
    if (error) {
      toast.error(`Setup failed: ${error.message}`);
      return;
    }
    toast.success("Setup complete. Welcome!");
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-xl">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-2">
            <Server className="h-6 w-6 text-primary" />
            <CardTitle>Casino System — First-run setup</CardTitle>
          </div>
          <div className="space-y-1">
            <Progress value={progress} />
            <div className="text-xs text-muted-foreground">
              Step {idx + 1} of {ORDER.length}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === "welcome" && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-base font-medium">
                <Sparkles className="h-4 w-4" /> Welcome
              </div>
              <p className="text-muted-foreground">
                This wizard configures your Casino System server. It takes about 5
                minutes. You can change every setting later.
              </p>
              <div className="rounded-md bg-muted/40 p-3 text-xs">
                <div>Node ID: <span className="font-mono">{nodeId}</span></div>
              </div>
            </div>
          )}

          {step === "branding" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 font-medium">
                <Palette className="h-4 w-4" /> Casino & branding
              </div>
              <div className="space-y-2">
                <Label>Casino name</Label>
                <Input
                  value={draft.casino_name}
                  onChange={(e) => set("casino_name", e.target.value)}
                  placeholder="Arusha Casino"
                />
              </div>
              <div className="space-y-2">
                <Label>Short slug (used in URLs)</Label>
                <Input
                  value={draft.casino_slug}
                  onChange={(e) =>
                    set("casino_slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  placeholder="arusha"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Primary color</Label>
                <Input
                  type="color"
                  value={draft.primary_color}
                  onChange={(e) => set("primary_color", e.target.value)}
                  className="h-10 w-24 p-1"
                />
              </div>
            </div>
          )}

          {step === "network" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 font-medium">
                <Network className="h-4 w-4" /> LAN configuration
              </div>
              <div className="flex gap-2">
                <Button
                  variant={draft.net_mode === "dhcp" ? "default" : "outline"}
                  size="sm"
                  onClick={() => set("net_mode", "dhcp")}
                >
                  DHCP (auto)
                </Button>
                <Button
                  variant={draft.net_mode === "static" ? "default" : "outline"}
                  size="sm"
                  onClick={() => set("net_mode", "static")}
                >
                  Static IP
                </Button>
              </div>
              {draft.net_mode === "static" && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>IP address</Label>
                    <Input
                      value={draft.net_ip}
                      onChange={(e) => set("net_ip", e.target.value)}
                      placeholder="192.168.1.10"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Gateway</Label>
                    <Input
                      value={draft.net_gateway}
                      onChange={(e) => set("net_gateway", e.target.value)}
                      placeholder="192.168.1.1"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>DNS</Label>
                    <Input
                      value={draft.net_dns}
                      onChange={(e) => set("net_dns", e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "tailscale" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 font-medium">
                <Radio className="h-4 w-4" /> Remote support (Tailscale)
              </div>
              <p className="text-sm text-muted-foreground">
                Enable Tailscale for one-click remote support and secure OTA updates.
                You can disable it any time in Admin → Network.
              </p>
              <div className="flex gap-2">
                <Button
                  variant={draft.tailscale_enabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => set("tailscale_enabled", true)}
                >
                  <Check className="h-3 w-3 mr-1" /> Enable
                </Button>
                <Button
                  variant={!draft.tailscale_enabled ? "default" : "outline"}
                  size="sm"
                  onClick={() => set("tailscale_enabled", false)}
                >
                  Skip
                </Button>
              </div>
            </div>
          )}

          {step === "cloud" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 font-medium">
                <Cloud className="h-4 w-4" /> Cloud pairing (optional)
              </div>
              <p className="text-sm text-muted-foreground">
                Paste your Casino Cloud URL and pairing code to enable multi-site
                aggregation. Leave blank to run fully standalone.
              </p>
              <div className="space-y-1">
                <Label>Cloud URL</Label>
                <Input
                  value={draft.cloud_url}
                  onChange={(e) => set("cloud_url", e.target.value)}
                  placeholder="https://cloud.casinosystem.app"
                />
              </div>
              <div className="space-y-1">
                <Label>Pairing code</Label>
                <Input
                  value={draft.cloud_pairing_code}
                  onChange={(e) => set("cloud_pairing_code", e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX"
                  className="font-mono"
                />
              </div>
            </div>
          )}

          {step === "demo" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 font-medium">
                <Sparkles className="h-4 w-4" /> Demo data
              </div>
              <p className="text-sm text-muted-foreground">
                Load a small demo dataset (10 players, 4 tables, 5 staff, 3 days of
                transactions) so you can explore the system immediately. There is a
                one-click <b>Clear demo data</b> button in Admin.
              </p>
              <div className="flex gap-2">
                <Button
                  variant={draft.seed_demo ? "default" : "outline"}
                  size="sm"
                  onClick={() => set("seed_demo", true)}
                >
                  Load demo
                </Button>
                <Button
                  variant={!draft.seed_demo ? "default" : "outline"}
                  size="sm"
                  onClick={() => set("seed_demo", false)}
                >
                  Empty
                </Button>
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-base font-medium">
                <Check className="h-4 w-4 text-primary" /> Ready to finalize
              </div>
              <div className="rounded-md border border-border/60 p-3 space-y-1 text-xs">
                <div><b>Casino:</b> {draft.casino_name || "—"} ({draft.casino_slug || "—"})</div>
                <div><b>Network:</b> {draft.net_mode.toUpperCase()} {draft.net_ip ? `— ${draft.net_ip}` : ""}</div>
                <div><b>Tailscale:</b> {draft.tailscale_enabled ? "Enabled" : "Skipped"}</div>
                <div><b>Cloud:</b> {draft.cloud_url || "Standalone"}</div>
                <div><b>Demo data:</b> {draft.seed_demo ? "Yes" : "No"}</div>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4 border-t border-border/40">
            <Button variant="ghost" onClick={back} disabled={idx === 0}>
              Back
            </Button>
            {step === "done" ? (
              <Button onClick={finish} disabled={saving}>
                {saving ? "Applying…" : "Finish setup"}
              </Button>
            ) : (
              <Button
                onClick={next}
                disabled={step === "branding" && (!draft.casino_name || !draft.casino_slug)}
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
