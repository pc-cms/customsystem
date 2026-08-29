/**
 * peer-mesh — Cloud-side peer endpoints, making Cloud just another peer.
 *
 * Exposes the same surface as cms-sync's HTTP API:
 *   POST /peer-mesh/handshake
 *   POST /peer-mesh/push
 *   POST /peer-mesh/pull
 *   GET  /peer-mesh/health
 *
 * Peers authenticate via HMAC-SHA256 over the raw request body, using
 * sync_secret from public.peer_links matched by header `x-peer-node-id`.
 */
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolvePullLimit, capChangesByBytes } from "./pull-limits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-peer-node-id, x-peer-signature",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCHEMA_VERSION = Deno.env.get("SCHEMA_VERSION") ?? "0.0.0";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function hmac(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authPeer(req: Request, raw: string, isHandshake: boolean) {
  const sig = req.headers.get("x-peer-signature");
  const peerNodeId = req.headers.get("x-peer-node-id");
  if (!sig || !peerNodeId) return { error: "missing peer auth headers" };

  const q = admin.from("peer_links").select("*");
  const { data: peers, error } = isHandshake
    ? await q.in("status", ["pending_outbound","pending_inbound","active","paused"])
    : await q.eq("peer_node_id", peerNodeId).eq("status", "active");
  if (error) return { error: error.message };

  for (const p of peers ?? []) {
    const expected = await hmac(p.sync_secret, raw);
    if (sig.length === expected.length && sig === expected) return { peer: p };
  }
  return { error: "signature mismatch" };
}

async function getIdentity() {
  const { data } = await admin
    .from("node_identity").select("node_id, display_name, node_kind, schema_version").maybeSingle();
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  // Strip /peer-mesh prefix (function name path segment). Local cms-sync uses
  // /peer/* routes, so accept both /handshake and /peer/handshake variants.
  const sub = (url.pathname.replace(/^\/peer-mesh/, "") || "/").replace(/^\/peer(?=\/)/, "");

  try {
    if (sub === "/health" && req.method === "GET") {
      const id = await getIdentity();
      return json(200, { ok: true, ...(id ?? {}), schema_version: id?.schema_version ?? SCHEMA_VERSION });
    }

    if (req.method !== "POST") return json(405, { error: "method not allowed" });
    const raw = await req.text();
    const isHandshake = sub === "/handshake";
    const auth = await authPeer(req, raw, isHandshake);
    if (auth.error) return json(401, { error: auth.error });
    const peer = auth.peer!;
    const body = raw ? JSON.parse(raw) : {};

    if (sub === "/handshake") {
      const newStatus = peer.status === "pending_outbound" ? "active" : peer.status;
      await admin.from("peer_links").update({
        peer_node_id: body.my_node_id,
        schema_version: body.my_schema_version ?? null,
        last_seen_at: new Date().toISOString(),
        status: newStatus,
        display_name: body.my_display_name || peer.display_name,
      }).eq("id", peer.id);
      const id = await getIdentity();
      return json(200, { ok: true, ...(id ?? {}) });
    }

    if (sub === "/push") {
      const changes = Array.isArray(body.changes) ? body.changes : [];
      const accepted: number[] = [];
      const rejected: Array<{ outbox_id: number; error_code: string; error_text: string }> = [];
      for (const ch of changes) {
        // Casino rows are environment-owned on each node (Cloud names/slugs differ
        // from Local names/slugs). Updating them through row-sync can hit FK
        // constraints when an older local row payload conflicts with Cloud rows.
        // Treat as accepted so the cursor advances; casino metadata is managed by
        // installer/Admin flows, not by mirror data sync.
        if (ch.table === "casinos") {
          accepted.push(ch.id);
          continue;
        }
        // peer_apply_change now self-heals user-FK violations by NULLing the
        // offending column and retrying, so most rows succeed without this
        // pre-check. We still skip auth-tied rows when the user is clearly
        // unknown so we don't pollute audit logs with retried FK errors.
        const USER_FK_TABLES = new Set([
          "profiles",
          "user_casino_access",
          "user_module_permissions",
          "user_density_preferences",
        ]);
        if (USER_FK_TABLES.has(ch.table) && ch.op !== "delete") {
          const uid = ch.payload?.user_id ?? ch.pk?.user_id;
          if (uid) {
            const { data: u } = await admin.auth.admin.getUserById(uid);
            if (!u?.user) {
              accepted.push(ch.id);
              continue;
            }
          }
        }
        const { error } = await admin.rpc("peer_apply_change", {
          p_origin_node_id: ch.origin_node_id || peer.peer_node_id,
          p_table: ch.table,
          p_op: ch.op,
          p_pk: ch.pk ?? {},
          p_payload: ch.payload ?? {},
          p_changed_at: ch.changed_at ?? new Date().toISOString(),
        });
        if (!error) {
          accepted.push(ch.id);
        } else {
          const errText = String(error.message ?? error).slice(0, 480);
          const errCode = (error as any).code || "apply_failed";
          rejected.push({ outbox_id: ch.id, error_code: errCode, error_text: errText });
          console.warn("peer-mesh.push.apply.fail", peer.display_name, ch.table, errText);
          // Hash payload for audit dedup
          const payloadStr = JSON.stringify(ch.payload ?? {});
          const buf = new TextEncoder().encode(payloadStr);
          const hash = await crypto.subtle.digest("MD5" as any, buf).catch(() => null);
          const payloadHash = hash
            ? Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,"0")).join("")
            : String(payloadStr.length);
          try {
            await admin.rpc("sync_record_apply_error", {
              p_peer_link_id: peer.id,
              p_source_outbox_id: ch.id ?? null,
              p_table: ch.table ?? "unknown",
              p_op: ch.op ?? null,
              p_pk: ch.pk ?? {},
              p_payload_hash: payloadHash,
              p_error_code: errCode,
              p_error_text: errText,
            });
          } catch (_e) { /* swallow audit errors */ }
        }
      }
      await admin.from("peer_links").update({
        last_seen_at: new Date().toISOString(),
        last_push_error: rejected.length ? `${rejected.length} rejected` : null,
      }).eq("id", peer.id);
      return json(200, { accepted, rejected });
    }

    if (sub === "/log") {
      // Drop heartbeats — they live in sync_peer_health now, not the exchange log.
      const entries = Array.isArray(body.entries) ? body.entries : [];
      const meaningful = entries.filter((e: any) =>
        e && e.direction !== "heartbeat" &&
        !(e.status === "ok" && Number(e.row_count ?? 0) === 0 && e.direction !== "probe" && e.direction !== "handshake")
      );
      if (meaningful.length === 0) return json(200, { accepted: 0 });
      const rows = meaningful.slice(0, 500).map((e: any) => ({
        peer_link_id: peer.id,
        peer_node_id: peer.peer_node_id,
        peer_name:    peer.display_name,
        direction:    ["pull","push","clone","probe","handshake"].includes(e.direction) ? e.direction : "push",
        status:       ["ok","warn","error"].includes(e.status) ? e.status : "ok",
        table_name:   e.table_name ?? null,
        row_count:    Number.isFinite(Number(e.row_count)) ? Number(e.row_count) : 0,
        batch_id:     e.batch_id ? String(e.batch_id).slice(0, 64) : null,
        error_text:   e.error_text ? String(e.error_text).slice(0, 1000) : null,
        meta:         (e.meta && typeof e.meta === "object") ? e.meta : {},
      }));
      const { error } = await admin.from("sync_exchange_logs").insert(rows);
      if (error) return json(500, { error: error.message });
      await admin.from("peer_links").update({ last_seen_at: new Date().toISOString() }).eq("id", peer.id);
      return json(200, { accepted: rows.length });
    }

    if (sub === "/probe/start") {
      // Local node asks Cloud to ack a probe. Cloud immediately acks and also
      // records its own inbound probe for the reverse-direction visibility.
      const probeId = body.probe_id;
      if (!probeId) return json(400, { error: "probe_id required" });
      await admin.rpc("sync_record_probe_ack", { p_probe_id: probeId, p_status: "ok", p_error_text: null });
      return json(200, { ok: true, echoed_at: new Date().toISOString() });
    }

    if (sub === "/probe") {
      // Round-trip mirror verification. Local sends a probe row id; we stamp
      // echoed_at and emit a sync_outbox event so it routes back to origin.
      const probeId = body.probe_id;
      if (!probeId) return json(400, { error: "probe_id required" });
      const now = new Date().toISOString();
      const { error: updErr } = await admin
        .from("sync_probes")
        .update({ echoed_at: now, status: "echoed" })
        .eq("id", probeId);
      if (updErr) return json(500, { error: updErr.message });
      // The sync_outbox trigger on sync_probes will replicate the change back
      // to the origin local node via the normal pull path.
      return json(200, { ok: true, echoed_at: now });
    }

    if (sub === "/pull") {
      const sinceId = Number(body.since_id ?? 0) || 0;
      const limit = resolvePullLimit(body.limit);
      const { data: rows, error } = await admin
        .from("sync_outbox")
        .select("id, casino_id, table_name, op, pk, payload, changed_at, origin_node_id")
        .gt("id", sinceId)
        .or(`origin_node_id.is.null,origin_node_id.neq.${peer.peer_node_id}`)
        .order("id", { ascending: true })
        .limit(limit);
      if (error) return json(500, { error: error.message });
      const all = (rows ?? []).map((r) => ({ ...r, table: r.table_name }));
      // Byte guard: never serialize an oversized page (OOM/502 protection).
      const changes = capChangesByBytes(all);
      const next = changes.length ? changes[changes.length - 1].id : sinceId;
      await admin.from("peer_links").update({ last_seen_at: new Date().toISOString() }).eq("id", peer.id);
      return json(200, { changes, next_since_id: next });
    }

    if (sub === "/node/commands/pop") {
      // Local node polls Cloud for queued remote-control commands.
      const nodeId = body.node_id;
      if (!nodeId) return json(400, { error: "node_id required" });
      const { data: cmds } = await admin
        .from("node_commands")
        .select("id, action, issued_at")
        .eq("target_node_id", nodeId)
        .eq("status", "pending")
        .order("issued_at", { ascending: true })
        .limit(1);
      const cmd = cmds?.[0];
      if (!cmd) return json(200, { command: null });
      await admin.from("node_commands")
        .update({ status: "popped", popped_at: new Date().toISOString() })
        .eq("id", cmd.id);
      return json(200, { command: cmd });
    }

    if (sub === "/node/commands/ack") {
      const cmdId = body.command_id;
      const status = body.status === "done" ? "done" : "error";
      if (!cmdId) return json(400, { error: "command_id required" });
      await admin.from("node_commands")
        .update({
          status,
          completed_at: new Date().toISOString(),
          result_text: body.result_text ? String(body.result_text).slice(0, 1000) : null,
        })
        .eq("id", cmdId);
      return json(200, { ok: true });
    }

    return json(404, { error: "unknown peer route", path: sub });
  } catch (e) {
    return json(500, { error: String(e?.message ?? e) });
  }
});
