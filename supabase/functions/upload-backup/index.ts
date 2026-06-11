// Receives encrypted/compressed backup blobs from on-prem cms-backup containers
// and stores them in the private "backups" bucket.
//
// Auth: x-sync-secret matched against legacy registrations or peer_links.
// Headers: x-casino-slug, x-backup-tag (daily|monthly), x-file-name.
// Body: raw bytes (Content-Type: application/octet-stream).
//
// Path layout: backups/<casino_slug>/<tag>/<file-name>
// No retention here — clients manage their own retention windows.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-sync-secret, x-casino-slug, x-backup-tag, x-file-name, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: cors });

  const secret = req.headers.get("x-sync-secret");
  const slug = req.headers.get("x-casino-slug");
  const tag = (req.headers.get("x-backup-tag") || "daily").toLowerCase();
  const fileName = req.headers.get("x-file-name");

  if (!secret || !slug || !fileName) {
    return new Response(JSON.stringify({ error: "missing headers" }), { status: 400, headers: cors });
  }
  if (!/^(daily|monthly)$/.test(tag)) {
    return new Response(JSON.stringify({ error: "bad tag" }), { status: 400, headers: cors });
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(fileName) || !/^[a-z0-9-]+$/.test(slug)) {
    return new Response(JSON.stringify({ error: "bad name" }), { status: 400, headers: cors });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: casino, error: cErr } = await sb
    .from("casinos")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (cErr || !casino) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }

  const { data: reg } = await sb
    .from("pending_server_registrations")
    .select("id")
    .eq("approved_casino_id", (casino as any).id)
    .eq("sync_secret", secret)
    .in("status", ["approved", "consumed"])
    .maybeSingle();
  const { data: peer, error: pErr } = reg ? { data: null, error: null } : await sb
    .from("peer_links")
    .select("id, casino_id")
    .eq("sync_secret", secret)
    .in("status", ["pending_outbound", "pending_inbound", "active", "paused"])
    .maybeSingle();

  if (pErr || (!reg && !peer)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: cors });
  }
  // If authed via peer_links, the peer must be bound to THIS casino — prevents
  // a compromised node from overwriting another casino's backups.
  if (!reg && peer && peer.casino_id !== (casino as any).id) {
    return new Response(JSON.stringify({ error: "peer not bound to this casino" }), { status: 403, headers: cors });
  }

  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0) {
    return new Response(JSON.stringify({ error: "empty body" }), { status: 400, headers: cors });
  }
  if (bytes.byteLength > 5 * 1024 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: "file too large (>5 GiB)" }), { status: 413, headers: cors });
  }

  const path = `${slug}/${tag}/${fileName}`;
  const { error: upErr } = await sb.storage
    .from("backups")
    .upload(path, bytes, { upsert: true, contentType: "application/octet-stream" });

  if (upErr) {
    return new Response(JSON.stringify({ error: upErr.message }), { status: 500, headers: cors });
  }

  return new Response(
    JSON.stringify({ ok: true, path, size: bytes.byteLength }),
    { status: 200, headers: { ...cors, "content-type": "application/json" } },
  );
});
