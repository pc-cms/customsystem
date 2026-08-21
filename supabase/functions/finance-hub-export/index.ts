// Finance Hub read-only export boundary.
// Auth: Authorization: Bearer <token>; SHA-256 compared against an active row
// in finance_hub_api_clients. No browser auth, no writes to finance tables.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { body = {}; }
  }
  const mode = String(body.mode ?? url.searchParams.get("mode") ?? "health").toLowerCase();

  // Health never exposes data and never requires the token.
  if (mode === "health") {
    return json({ ok: true, service: "finance-hub-export", version: VERSION, read_only: true, modes: ["health", "snapshot", "transactions"] });
  }

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json({ error: "missing_token" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const hash = await sha256Hex(token);

  const { data: client, error: cErr } = await admin
    .from("finance_hub_api_clients")
    .select("id, name, active, scopes")
    .eq("token_sha256", hash)
    .eq("active", true)
    .maybeSingle();
  if (cErr) return json({ error: "auth_lookup_failed" }, 500);
  if (!client) return json({ error: "invalid_token" }, 401);

  const scopes: string[] = client.scopes ?? [];
  const need = mode === "transactions" ? "transactions:read" : "wallets:read";
  if (!scopes.includes(need)) return json({ error: "forbidden", required_scope: need }, 403);

  let payload: unknown;
  let rows = 0;
  let since: string | null = null;

  if (mode === "snapshot") {
    const { data, error } = await admin.rpc("finance_hub_wallet_snapshot", { p_casino_ids: null });
    if (error) return json({ error: "snapshot_failed", detail: error.message }, 500);
    rows = (data as any)?.wallets?.length ?? 0;
    payload = data;
  } else if (mode === "transactions") {
    since = (body.since as string) ?? url.searchParams.get("since");
    const rawLimit = Number(body.limit ?? url.searchParams.get("limit") ?? 1000);
    const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 1000, 1), 5000);
    if (since && Number.isNaN(Date.parse(since))) return json({ error: "invalid_since" }, 400);
    const { data, error } = await admin.rpc("finance_hub_transactions", {
      p_since: since || null,
      p_limit: limit,
    });
    if (error) return json({ error: "transactions_failed", detail: error.message }, 500);
    rows = (data as any)?.count ?? 0;
    payload = data;
  } else {
    return json({ error: "unknown_mode", modes: ["health", "snapshot", "transactions"] }, 400);
  }

  // Audit only — never touches financial records.
  await admin.from("finance_hub_api_clients").update({ last_used_at: new Date().toISOString() }).eq("id", client.id);
  await admin.from("finance_hub_api_audit").insert({
    client_id: client.id, mode, rows_returned: rows, since_cursor: since, ok: true,
  });

  return json(payload);
});
