// @ts-nocheck
/**
 * fleet-heartbeat — receives POSTs from each box's license-agent and upserts
 * a row in public.fleet_heartbeats. Auth: HMAC-SHA256 over raw body using the
 * box's peer_links.sync_secret (matched by header x-peer-node-id).
 *
 * Body: {
 *   hostname, cms_version, license_mode, license_expires_at, casino_id,
 *   public_ip, local_ip, tailscale_ip, uptime_seconds,
 *   cpu_load, disk_used_pct, ram_used_pct, notes
 * }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

async function hmac(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const nodeId = req.headers.get("x-peer-node-id") ?? "";
  const signature = req.headers.get("x-peer-signature") ?? "";
  const raw = await req.text();
  if (!nodeId) return json(400, { error: "missing_node_id" });

  const { data: peer } = await admin
    .from("peer_links")
    .select("sync_secret, casino_id")
    .eq("peer_node_id", nodeId)
    .maybeSingle();
  if (!peer?.sync_secret) return json(401, { error: "unknown_node" });

  const expected = await hmac(peer.sync_secret, raw);
  if (expected !== signature) return json(401, { error: "bad_signature" });

  let body: any = {};
  try { body = JSON.parse(raw || "{}"); } catch { return json(400, { error: "bad_json" }); }

  const row = {
    node_id: nodeId,
    casino_id: body.casino_id ?? peer.casino_id ?? null,
    hostname: body.hostname ?? null,
    cms_version: body.cms_version ?? null,
    license_mode: body.license_mode ?? null,
    license_expires_at: body.license_expires_at ?? null,
    public_ip: body.public_ip ?? null,
    local_ip: body.local_ip ?? null,
    tailscale_ip: body.tailscale_ip ?? null,
    uptime_seconds: body.uptime_seconds ?? null,
    cpu_load: body.cpu_load ?? null,
    disk_used_pct: body.disk_used_pct ?? null,
    ram_used_pct: body.ram_used_pct ?? null,
    notes: body.notes ?? {},
    last_seen_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("fleet_heartbeats")
    .upsert(row, { onConflict: "node_id" });
  if (error) return json(500, { error: error.message });

  // Return any pending commands so the agent can execute them
  const { data: cmds } = await admin
    .from("fleet_commands")
    .select("id, kind, payload, issued_at")
    .eq("node_id", nodeId)
    .eq("status", "pending")
    .order("issued_at", { ascending: true })
    .limit(10);

  return json(200, { ok: true, commands: cmds ?? [] });
});
