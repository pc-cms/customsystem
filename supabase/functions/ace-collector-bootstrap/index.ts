/**
 * ace-collector-bootstrap
 * Public endpoint used ONCE by the ACE Collector installer.
 *
 * POST { token, hostname? }
 *  - validates a one-time install token (sha256 lookup, expiry, unused)
 *  - marks it used
 *  - rotates/creates the ace_ingest_keys row for the casino (location_code = slug)
 *  - returns the raw ingest key exactly once
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomKey(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token || token.length < 16 || token.length > 128 || !/^[a-f0-9]+$/i.test(token)) {
    return json({ ok: false, error: "invalid_token" }, 400);
  }
  const hostnameRaw = typeof body.hostname === "string" ? body.hostname.trim() : "";
  const hostname = hostnameRaw ? hostnameRaw.slice(0, 120) : null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const tokenHash = await sha256Hex(token);
  const { data: install, error: instErr } = await admin
    .from("ace_collector_installs")
    .select("id, casino_id, casino_slug, expires_at, used_at")
    .eq("token_sha256", tokenHash)
    .maybeSingle();

  if (instErr) {
    console.error("bootstrap: lookup failed", instErr.message);
    return json({ ok: false, error: "server_error" }, 500);
  }
  if (!install) return json({ ok: false, error: "invalid_token" }, 401);
  if (install.used_at) return json({ ok: false, error: "token_already_used" }, 409);
  if (new Date(install.expires_at).getTime() < Date.now()) {
    return json({ ok: false, error: "token_expired" }, 410);
  }

  // Atomically claim the token (guards against concurrent re-use).
  const { data: claimed, error: claimErr } = await admin
    .from("ace_collector_installs")
    .update({ used_at: new Date().toISOString(), used_hostname: hostname })
    .eq("id", install.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (claimErr) {
    console.error("bootstrap: claim failed", claimErr.message);
    return json({ ok: false, error: "server_error" }, 500);
  }
  if (!claimed) return json({ ok: false, error: "token_already_used" }, 409);

  const { data: casino, error: casErr } = await admin
    .from("casinos")
    .select("id, name, slug, code")
    .eq("id", install.casino_id)
    .maybeSingle();
  if (casErr || !casino) return json({ ok: false, error: "casino_not_found" }, 404);

  const location_code = String(casino.slug || casino.code || install.casino_slug).toLowerCase();
  const ingestKey = randomKey(24);
  const keyHash = await sha256Hex(ingestKey);

  const { error: upErr } = await admin
    .from("ace_ingest_keys")
    .upsert(
      {
        location_code,
        display_name: `${casino.name} ACE Collector`,
        casino_id: casino.id,
        key_sha256: keyHash,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "location_code" },
    );

  if (upErr) {
    console.error("bootstrap: key upsert failed", upErr.message);
    return json({ ok: false, error: "provisioning_failed" }, 500);
  }

  const ingest_url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ace-finance-ingest`;

  return json({
    ok: true,
    casino_id: casino.id,
    casino_slug: location_code,
    casino_name: casino.name,
    location_code,
    ingest_url,
    ingest_key: ingestKey,
  });
});
