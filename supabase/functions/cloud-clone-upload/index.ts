// @ts-nocheck
/**
 * cloud-clone-upload — receives encrypted dump chunks from a box's
 * cloud-clone.sh, assembles them in Storage and records metadata.
 *
 * Auth: HMAC-SHA256 over raw body using peer_links.sync_secret
 * matched by header x-peer-node-id.
 *
 * Multipart-style protocol (single-request-per-chunk to stay under
 * the 6 MB edge body cap):
 *
 *   Headers:
 *     x-peer-node-id     — node UUID
 *     x-peer-signature   — hex HMAC-SHA256 of raw body
 *     x-clone-upload-id  — UUID grouping chunks of one dump
 *     x-clone-chunk-idx  — 0-based chunk index
 *     x-clone-chunk-total— total chunk count
 *     x-clone-sha256     — sha256 of assembled ciphertext (repeat each chunk)
 *     x-clone-size       — total ciphertext size in bytes
 *     x-clone-rows       — base64 JSON: { table_name: count, ... } (last chunk)
 *
 *   Body: raw binary chunk (application/octet-stream), up to ~5 MB.
 *
 * On final chunk: writes cloud_clone_uploads row (status='uploaded').
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const BUCKET = "cloud-clones";

async function hmac(secret: string, raw: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, raw);
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function ensureBucket() {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) await admin.storage.createBucket(BUCKET, { public: false });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const h = req.headers;
  const nodeId = h.get("x-peer-node-id") ?? "";
  const signature = h.get("x-peer-signature") ?? "";
  const uploadId = h.get("x-clone-upload-id") ?? "";
  const idx = parseInt(h.get("x-clone-chunk-idx") ?? "-1", 10);
  const total = parseInt(h.get("x-clone-chunk-total") ?? "-1", 10);
  const sha256 = h.get("x-clone-sha256") ?? "";
  const sizeBytes = parseInt(h.get("x-clone-size") ?? "0", 10);
  const rowsB64 = h.get("x-clone-rows") ?? "";

  if (!nodeId || !uploadId || idx < 0 || total <= 0 || !sha256) {
    return json(400, { error: "missing_headers" });
  }

  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.byteLength === 0) return json(400, { error: "empty_chunk" });

  const { data: peer } = await admin
    .from("peer_links")
    .select("sync_secret, casino_id")
    .eq("peer_node_id", nodeId)
    .maybeSingle();
  if (!peer?.sync_secret) return json(401, { error: "unknown_node" });

  const expected = await hmac(peer.sync_secret, raw);
  if (expected !== signature) return json(401, { error: "bad_signature" });

  await ensureBucket();
  const chunkPath = `${nodeId}/${uploadId}/chunk-${String(idx).padStart(4, "0")}.enc`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(chunkPath, raw, {
    contentType: "application/octet-stream", upsert: true,
  });
  if (upErr) return json(500, { error: upErr.message });

  // Final chunk: record upload
  if (idx === total - 1) {
    let rows: Record<string, number> = {};
    if (rowsB64) {
      try { rows = JSON.parse(atob(rowsB64)); } catch { rows = {}; }
    }
    const storagePath = `${nodeId}/${uploadId}/`;
    const { error: insErr } = await admin.from("cloud_clone_uploads").insert({
      id: uploadId,
      node_id: nodeId,
      casino_id: peer.casino_id ?? null,
      size_bytes: sizeBytes,
      sha256,
      chunk_count: total,
      rows_by_table: rows,
      storage_path: storagePath,
      status: "uploaded",
    });
    if (insErr && !insErr.message.includes("duplicate key")) {
      return json(500, { error: insErr.message });
    }
    return json(200, { ok: true, upload_id: uploadId, final: true });
  }

  return json(200, { ok: true, chunk: idx });
});
