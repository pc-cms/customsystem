// Finance Hub read-only export boundary.
// Auth: Authorization: Bearer <token>; SHA-256 compared against an active row
// in finance_hub_api_clients. No browser auth, no writes to finance tables.
//
// CONTRACT (see docs/FINANCE-HUB-API.md — keep both in sync):
//   Every response carries { generated_at, mode }.
//   Paginated modes carry { limit, row_count, has_more, next_cursor }.
//   Page size is hard-capped at 1000 rows. Never truncate silently.
//   Cursors are opaque strings "<sort_key>|<uuid|casino_id>" and are
//   inclusive-exclusive: pass next_cursor back as `cursor` for the next page.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERSION = "1.1.0";
const MAX_PAGE = 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MODES = ["health", "snapshot", "transactions", "performance", "expenses", "closings"] as const;

const SCOPE_BY_MODE: Record<string, string> = {
  snapshot: "wallets:read",
  transactions: "transactions:read",
  performance: "performance:read",
  expenses: "expenses:read",
  closings: "closings:read",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { body = {}; }
  }
  const param = (k: string): string | null => {
    const v = body[k] ?? url.searchParams.get(k);
    return v === undefined || v === null || v === "" ? null : String(v);
  };
  const mode = (param("mode") ?? "health").toLowerCase();

  // Health never exposes data and never requires the token.
  if (mode === "health") {
    return json({
      ok: true, service: "finance-hub-export", version: VERSION,
      read_only: true, max_page: MAX_PAGE, modes: MODES, generated_at: new Date().toISOString(),
    });
  }

  if (!MODES.includes(mode as typeof MODES[number])) {
    return json({ error: "unknown_mode", modes: MODES }, 400);
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
  const need = SCOPE_BY_MODE[mode];
  if (!scopes.includes(need)) return json({ error: "forbidden", required_scope: need }, 403);

  // Shared pagination inputs.
  const rawLimit = Number(param("limit") ?? MAX_PAGE);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : MAX_PAGE, 1), MAX_PAGE);
  const cursor = param("cursor");
  const from = param("from");
  const to = param("to");
  const casinoId = param("casino_id");
  if (from && !isDate(from)) return json({ error: "invalid_from" }, 400);
  if (to && !isDate(to)) return json({ error: "invalid_to" }, 400);
  if (casinoId && !/^[0-9a-f-]{36}$/i.test(casinoId)) return json({ error: "invalid_casino_id" }, 400);
  const casinoIds = casinoId ? [casinoId] : null;

  let payload: Record<string, unknown> | null = null;
  let rows = 0;
  let since: string | null = null;

  const fail = (tag: string, msg: string) => json({ error: tag, detail: msg }, 500);

  if (mode === "snapshot") {
    const { data, error } = await admin.rpc("finance_hub_wallet_snapshot", {
      p_casino_ids: casinoIds,
    });
    if (error) return fail("snapshot_failed", error.message);
    const wallets = (data as any)?.wallets ?? [];
    rows = wallets.length;
    // Snapshot is intentionally unpaginated: active canonical wallets are a
    // small, bounded set (one page worth per network).
    payload = { ...(data as any), mode: "snapshot", row_count: rows, has_more: false, next_cursor: null };
  } else if (mode === "transactions") {
    since = param("since");
    if (since && Number.isNaN(Date.parse(since))) return json({ error: "invalid_since" }, 400);
    const { data, error } = await admin.rpc("finance_hub_transactions", {
      p_since: since || null, p_limit: limit, p_cursor: cursor || null,
    });
    if (error) return fail("transactions_failed", error.message);
    rows = (data as any)?.row_count ?? 0;
    payload = data as any;
  } else if (mode === "performance") {
    const { data, error } = await admin.rpc("finance_hub_performance", {
      p_from: from, p_to: to, p_casino_ids: casinoIds, p_limit: limit, p_cursor: cursor || null,
    });
    if (error) return fail("performance_failed", error.message);
    rows = (data as any)?.row_count ?? 0;
    payload = data as any;
  } else if (mode === "expenses") {
    const { data, error } = await admin.rpc("finance_hub_expenses", {
      p_from: from, p_to: to, p_casino_ids: casinoIds, p_limit: limit, p_cursor: cursor || null,
    });
    if (error) return fail("expenses_failed", error.message);
    rows = (data as any)?.row_count ?? 0;
    payload = data as any;
  } else if (mode === "closings") {
    const { data, error } = await admin.rpc("finance_hub_closings", {
      p_from: from, p_to: to, p_casino_ids: casinoIds, p_limit: limit, p_cursor: cursor || null,
    });
    if (error) return fail("closings_failed", error.message);
    rows = (data as any)?.row_count ?? 0;
    payload = data as any;
  }

  // Audit only — never touches financial records.
  await admin.from("finance_hub_api_clients").update({ last_used_at: new Date().toISOString() }).eq("id", client.id);
  await admin.from("finance_hub_api_audit").insert({
    client_id: client.id, mode, rows_returned: rows, since_cursor: cursor ?? since, ok: true,
  });

  return json({ ...payload, service_version: VERSION, source_generated_at: new Date().toISOString() });
});
