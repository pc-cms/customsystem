// supabase/functions/verify-license/index.ts
//
// Verifies an uploaded license.dat (signed by the offline Ed25519 private key),
// and if valid, upserts the row in public.casino_license for the target casino.
//
// Only super_admin can call this. Signature verification uses the public key
// baked into the DB via env var LICENSE_PUBLIC_KEY_B64 (raw 32-byte Ed25519
// public key, base64). The same key must be present in
// src/lib/license/public-key.ts.
//
// Request body:
//   { casino_id: uuid, license_file: { payload, signature } }
//
// Response: { ok, license } or { ok: false, error }.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import * as ed from "npm:@noble/ed25519@2.1.0";
import { sha512 } from "npm:@noble/hashes@1.4.0/sha512";

// @noble/ed25519 v2 requires a sync sha512 hook for browser/Deno.
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function canonical(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonical).join(",") + "]";
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonical((obj as Record<string, unknown>)[k]))
      .join(",") +
    "}"
  );
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.trim());
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const pubKeyB64 = Deno.env.get("LICENSE_PUBLIC_KEY_B64");

    if (!pubKeyB64 || pubKeyB64.startsWith("PLACEHOLDER")) {
      return json({ ok: false, error: "server_missing_public_key" }, 500);
    }

    // Identify caller + verify super_admin role.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const roles = (roleRows ?? []).map((r) => r.role);
    if (!roles.includes("super_admin")) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body?.casino_id || !body?.license_file?.payload || !body?.license_file?.signature) {
      return json({ ok: false, error: "bad_request" }, 400);
    }

    const { casino_id, license_file } = body;
    const { payload, signature } = license_file;

    // 1. Signature verification.
    const message = new TextEncoder().encode(canonical(payload));
    const sigBytes = b64ToBytes(signature);
    const pubBytes = b64ToBytes(pubKeyB64);

    let sigOk = false;
    try {
      sigOk = ed.verify(sigBytes, message, pubBytes);
    } catch (_e) {
      sigOk = false;
    }
    if (!sigOk) return json({ ok: false, error: "invalid_signature" }, 400);

    // 2. Payload sanity.
    if (payload.version !== 1) return json({ ok: false, error: "unsupported_version" }, 400);
    if (!payload.license_id || !payload.package_code || !payload.expires_at || !payload.issued_at) {
      return json({ ok: false, error: "malformed_payload" }, 400);
    }
    if (new Date(payload.expires_at).getTime() < Date.now()) {
      return json({ ok: false, error: "license_expired" }, 400);
    }

    // 3. Verify casino_slug matches the target casino.
    const { data: casinoRow, error: casinoErr } = await admin
      .from("casinos")
      .select("id, slug")
      .eq("id", casino_id)
      .maybeSingle();
    if (casinoErr || !casinoRow) return json({ ok: false, error: "casino_not_found" }, 404);
    if (casinoRow.slug !== payload.casino_slug) {
      return json({ ok: false, error: "license_slug_mismatch" }, 400);
    }

    // 4. Verify package exists.
    const { data: pkgRow } = await admin
      .from("casino_packages")
      .select("code, modules, is_active")
      .eq("code", payload.package_code)
      .maybeSingle();
    if (!pkgRow || !pkgRow.is_active) return json({ ok: false, error: "unknown_package" }, 400);

    // 5. Features: payload override wins, else package default.
    const features =
      Array.isArray(payload.features) && payload.features.length > 0
        ? payload.features
        : pkgRow.modules;

    // 6. Upsert.
    const { data: upserted, error: upErr } = await admin
      .from("casino_license")
      .upsert(
        {
          casino_id,
          license_id: payload.license_id,
          package_code: payload.package_code,
          features,
          payload,
          signature,
          issued_at: payload.issued_at,
          expires_at: payload.expires_at,
          activated_at: new Date().toISOString(),
          activated_by: userData.user.id,
        },
        { onConflict: "casino_id" },
      )
      .select()
      .single();

    if (upErr) return json({ ok: false, error: upErr.message }, 500);

    // 7. Audit log.
    await admin.from("activity_logs").insert({
      user_id: userData.user.id,
      casino_id,
      action: "license.activate",
      entity_type: "casino_license",
      entity_id: upserted.id,
      meta: {
        license_id: payload.license_id,
        package_code: payload.package_code,
        expires_at: payload.expires_at,
      },
    });

    return json({ ok: true, license: upserted });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message ?? "internal_error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
