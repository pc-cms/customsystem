/**
 * AceCollectorPanel — one-click ACE Collector installation for any casino.
 *
 * Choose casino → Copy command → run on the Ubuntu server.
 * The install command embeds a one-time token; no keys are ever shown.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Terminal, Copy, Check, Power } from "lucide-react";
import { toast } from "sonner";

const INSTALL_URL = "https://casinosystem.app/download/ace-collector-install.sh";

type Casino = { id: string; name: string; slug: string | null; code: string };

type Collector = {
  id: string;
  location_code: string;
  casino_name: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  last_live_at: string | null;
};

const ago = (iso: string | null) => {
  if (!iso) return "—";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const statusOf = (c: Collector) => {
  if (!c.last_seen_at) return { label: "Never", tone: "text-muted-foreground border-muted" };
  const age = Date.now() - new Date(c.last_seen_at).getTime();
  return age <= 15 * 60 * 1000
    ? { label: "Online", tone: "text-success border-success/40" }
    : { label: "Stale", tone: "text-warning border-warning/40" };
};

export const AceCollectorPanel = () => {
  const qc = useQueryClient();
  const [casinoId, setCasinoId] = useState<string>("");
  const [command, setCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: casinos = [] } = useQuery({
    queryKey: ["ace-collector-casinos"],
    queryFn: async (): Promise<Casino[]> => {
      const { data, error } = await supabase.from("casinos").select("id, name, slug, code").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Casino[];
    },
  });

  const { data: collectors = [] } = useQuery({
    queryKey: ["ace-collectors"],
    queryFn: async (): Promise<Collector[]> => {
      const { data, error } = await supabase.rpc("ace_admin_list_collectors" as any);
      if (error) throw error;
      return (data ?? []) as unknown as Collector[];
    },
    refetchInterval: 60_000,
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("ace_create_install_token" as any, { _casino_id: casinoId });
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as { token: string } | undefined;
      if (!row?.token) throw new Error("Could not generate install command");
      return `curl -fsSL ${INSTALL_URL} | sudo bash -s -- --token ${row.token}`;
    },
    onSuccess: (cmd) => { setCommand(cmd); setCopied(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.rpc("ace_admin_set_collector_active" as any, { _id: id, _active: active });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ace-collectors"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async () => {
    if (!command) return;
    await navigator.clipboard.writeText(command);
    setCopied(true);
    toast.success("Command copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="cms-panel p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Terminal className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-card-foreground">ACE Collector</h3>
      </div>
      <p className="text-xs text-muted-foreground">Choose casino → Copy command → run on Ubuntu server.</p>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={casinoId} onValueChange={(v) => { setCasinoId(v); setCommand(null); }}>
          <SelectTrigger className="w-56 h-9"><SelectValue placeholder="Choose casino" /></SelectTrigger>
          <SelectContent>
            {casinos.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} ({(c.slug || c.code).toLowerCase()})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!casinoId || generate.isPending} onClick={() => generate.mutate()}>
          {generate.isPending ? "Generating…" : "Generate Install Command"}
        </Button>
      </div>

      {command && (
        <div className="flex items-start gap-2">
          <code className="flex-1 min-w-0 text-[11px] font-mono bg-muted/50 border border-border rounded px-3 py-2 break-all">
            {command}
          </code>
          <Button size="sm" variant="outline" onClick={copy} className="gap-1.5 shrink-0">
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="py-1.5 pr-3 font-medium">Casino</th>
              <th className="py-1.5 pr-3 font-medium">Status</th>
              <th className="py-1.5 pr-3 font-medium">Last Seen</th>
              <th className="py-1.5 pr-3 font-medium">Last Live</th>
              <th className="py-1.5 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {collectors.length === 0 && (
              <tr><td colSpan={5} className="py-3 text-muted-foreground">No collectors installed yet.</td></tr>
            )}
            {collectors.map((c) => {
              const st = statusOf(c);
              return (
                <tr key={c.id} className="border-b border-border/50">
                  <td className="py-1.5 pr-3">{c.casino_name ?? c.location_code}</td>
                  <td className="py-1.5 pr-3">
                    <Badge variant="outline" className={`text-[10px] ${st.tone}`}>
                      {c.is_active ? st.label : "Disabled"}
                    </Badge>
                  </td>
                  <td className="py-1.5 pr-3 font-mono">{ago(c.last_seen_at)}</td>
                  <td className="py-1.5 pr-3 font-mono">{ago(c.last_live_at)}</td>
                  <td className="py-1.5 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1.5"
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ id: c.id, active: !c.is_active })}
                    >
                      <Power className="w-3.5 h-3.5" /> {c.is_active ? "Disable" : "Enable"}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AceCollectorPanel;
