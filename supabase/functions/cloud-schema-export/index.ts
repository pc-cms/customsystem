/**
 * cloud-schema-export — exports full public schema DDL (enums + tables) so
 * on-prem nodes can auto-create any missing tables/columns BEFORE the data
 * seed runs. Solves the "[seed] insert.fail X: relation does not exist"
 * problem for older local installs whose init scripts predate newer tables.
 *
 * GET /cloud-schema-export
 *   Headers (any of):
 *     x-service-key: <SUPABASE_SERVICE_ROLE_KEY>
 *     x-sync-secret: <peer secret> + x-casino-id: <uuid>
 *
 * Response: text/plain SQL — safe to pipe into `psql`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-service-key, x-sync-secret, x-casino-id, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  }

  const providedKey = req.headers.get("x-service-key") ?? "";
  const syncSecret = req.headers.get("x-sync-secret") ?? "";
  const syncCasino = req.headers.get("x-casino-id") ?? "";

  const admin = createClient(supabaseUrl, serviceRoleKey);

  let authed = false;
  if (providedKey && providedKey === serviceRoleKey) {
    authed = true;
  } else if (syncSecret && syncCasino) {
    const { data: pend } = await admin
      .from("pending_server_registrations")
      .select("approved_casino_id")
      .eq("approved_casino_id", syncCasino)
      .eq("sync_secret", syncSecret)
      .in("status", ["approved", "consumed"])
      .maybeSingle();
    if (pend) authed = true;
    if (!authed) {
      const { data: peer } = await admin
        .from("peer_links")
        .select("id, casino_id")
        .eq("sync_secret", syncSecret)
        .in("status", ["pending_outbound", "pending_inbound", "active", "paused"])
        .maybeSingle();
      if (peer && peer.casino_id && peer.casino_id === syncCasino) authed = true;
    }
  }

  if (!authed) {
    return new Response("unauthorized", { status: 401, headers: corsHeaders });
  }

  // Call PostgREST and stream the JSON-encoded scalar text response.
  // The default Accept is application/json, which returns the text result
  // as a single JSON string. We pipe the body through a TransformStream
  // that strips the wrapping quotes and unescapes JSON escapes on the
  // fly, so we never materialize the full DDL in memory.
  const rpcResp = await fetch(`${supabaseUrl}/rest/v1/rpc/export_full_schema_ddl`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: "{}",
  });

  if (!rpcResp.ok || !rpcResp.body) {
    const msg = rpcResp.body ? await rpcResp.text().catch(() => "") : "";
    return new Response(`-- export_full_schema_ddl failed (${rpcResp.status}): ${msg}`, {
      status: 500,
      headers: { ...corsHeaders, "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Streaming JSON-string unescaper. Input: `"...escaped DDL..."`.
  // Output: raw DDL text bytes.
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let started = false;     // saw opening quote
  let finished = false;    // saw closing quote
  let inEscape = false;    // last char was backslash
  let unicodeBuf = "";     // collecting \uXXXX

  const unescape = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const s = decoder.decode(chunk, { stream: true });
      let out = "";
      for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (finished) break;
        if (!started) {
          if (ch === '"') started = true;
          continue;
        }
        if (unicodeBuf.length > 0 && unicodeBuf.length < 5) {
          unicodeBuf += ch;
          if (unicodeBuf.length === 5) {
            out += String.fromCharCode(parseInt(unicodeBuf.slice(1), 16));
            unicodeBuf = "";
          }
          continue;
        }
        if (inEscape) {
          inEscape = false;
          switch (ch) {
            case "n": out += "\n"; break;
            case "t": out += "\t"; break;
            case "r": out += "\r"; break;
            case "b": out += "\b"; break;
            case "f": out += "\f"; break;
            case '"': out += '"'; break;
            case "\\": out += "\\"; break;
            case "/": out += "/"; break;
            case "u": unicodeBuf = "u"; break;
            default: out += ch;
          }
          continue;
        }
        if (ch === "\\") { inEscape = true; continue; }
        if (ch === '"') { finished = true; break; }
        out += ch;
      }
      if (out) controller.enqueue(encoder.encode(out));
    },
  });

  return new Response(rpcResp.body.pipeThrough(unescape), {
    status: 200,
    headers: { ...corsHeaders, "content-type": "text/plain; charset=utf-8" },
  });
});


