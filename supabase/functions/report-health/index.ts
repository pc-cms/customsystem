/**
 * report-health — receives lightweight health snapshot from cms-monitor on each
 * self-hosted server, AND returns any pending `update_commands` so the local
 * cms-updater can pick up new release targets pushed by Super Admin.
 *
 * Auth: x-sync-secret + x-casino-id (matched against legacy registrations or peer_links).
 *
 * Body:
 *   { metrics: {...},
 *     ack?: { command_id: uuid, status: 'acknowledged'|'applied'|'failed', message?: string } }
 *
 * Response:
 *   { ok: true,
 *     pending_command?: { id, target_version, auto_apply, issued_at } | null }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-sync-secret, x-casino-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secret = req.headers.get("x-sync-secret") ?? "";
  const casino = req.headers.get("x-casino-id") ?? "";
  if (!secret || !casino) return json({ error: "missing headers" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: reg } = await admin
    .from("pending_server_registrations")
    .select("id, approved_casino_id")
    .eq("approved_casino_id", casino)
    .eq("sync_secret", secret)
    .in("status", ["approved", "consumed"])
    .maybeSingle();
  let srv: any = reg ? { id: reg.id, casino_id: reg.approved_casino_id, source: "registration" } : null;
  if (!srv) {
    const { data: peer, error } = await admin
      .from("peer_links")
      .select("id, casino_id")
      .eq("sync_secret", secret)
      .in("status", ["pending_outbound", "pending_inbound", "active", "paused"])
      .maybeSingle();
    if (error || !peer) return json({ error: "invalid creds" }, 401);
    // Server-owned casino_id; reject if peer is not bound or header mismatches
    if (!peer.casino_id || peer.casino_id !== casino) {
      return json({ error: "peer not bound to this casino" }, 403);
    }
    srv = { id: peer.id, casino_id: peer.casino_id, source: "peer" };
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* tolerate empty/bad body */ }

  // 1) Save metrics + mark online
  if (srv.source === "peer") {
    await admin.from("peer_links").update({ last_seen_at: new Date().toISOString() }).eq("id", srv.id);
  }

  // 2) Process command ACK (if updater reports back)
  const ack = body?.ack;
  if (ack?.command_id && typeof ack.status === "string") {
    const allowed = new Set(["acknowledged", "applied", "failed"]);
    if (allowed.has(ack.status)) {
      const patch: Record<string, unknown> = {
        status: ack.status,
        status_message: typeof ack.message === "string" ? ack.message.slice(0, 500) : null,
      };
      if (ack.status === "acknowledged") patch.acknowledged_at = new Date().toISOString();
      if (ack.status === "applied" || ack.status === "failed") patch.applied_at = new Date().toISOString();

      await admin.from("update_commands")
        .update(patch)
        .eq("id", ack.command_id)
        .eq("casino_id", srv.casino_id);
    }
  }

  // 3) Return next pending command (oldest first)
  const { data: pending } = await admin
    .from("update_commands")
    .select("id, target_version, auto_apply, issued_at")
    .eq("casino_id", srv.casino_id)
    .eq("status", "pending")
    .order("issued_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return json({ ok: true, pending_command: pending ?? null });
});
