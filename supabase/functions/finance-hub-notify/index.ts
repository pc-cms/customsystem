// Finance Hub near-realtime notifier (outbound wake-up signals only).
//
// Reads the coalesced `finance_hub_notify_outbox` queue and POSTs a tiny
// metadata-only body to the Finance Hub webhook. It NEVER sends financial
// values — Finance Hub still pulls authoritative data from the read-only
// `finance-hub-export` API.
//
// Auth (outbound): HMAC-SHA256 over `${timestamp}.${raw_body}` using the
// stored lowercase hex SHA-256 of the shared export token (UTF-8 bytes) as the
// key. The hash lives in `finance_hub_api_clients.token_sha256` and is read
// server-side with the service role. No plaintext token, no bearer header, and
// the hash is never logged.
//
// Fail-open: this function is invoked out of band (cron / pg_net). Nothing here
// can roll back or block a casino financial operation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_WEBHOOK_URL = "https://amaell-finance-hub.lovable.app/api/public/cms/webhook";
const WEBHOOK_URL = Deno.env.get("FINANCE_HUB_WEBHOOK_URL") || DEFAULT_WEBHOOK_URL;

const TIMEOUT_MS = 8000;
const BATCH = 20;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

type OutboxRow = {
  id: string;
  event: string;
  feed: string;
  source_table: string | null;
  source_id: string | null;
  occurred_at: string;
};

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

async function signBody(key: CryptoKey, timestamp: string, raw: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${raw}`));
  return toHex(sig);
}

async function deliver(key: CryptoKey, row: OutboxRow): Promise<{ ok: boolean; error?: string }> {
  const body: Record<string, unknown> = { event: row.event, feed: row.feed };
  if (row.source_table) body.source_table = row.source_table;
  if (row.source_id) body.source_id = row.source_id;
  if (row.occurred_at) body.occurred_at = row.occurred_at;

  const raw = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = await signBody(key, timestamp, raw);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Finance-Timestamp": timestamp,
        "X-Finance-Signature": signature,
      },
      body: raw,
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    return { ok: true };
  } catch (e) {
    // Never include headers or key material in the error text.
    return { ok: false, error: String((e as Error)?.name ?? "fetch_failed") };
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Shared export token hash = HMAC key (UTF-8 bytes of the lowercase hex digest).
  const { data: client, error: clientErr } = await admin
    .from("finance_hub_api_clients")
    .select("id, token_sha256")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (clientErr || !client?.token_sha256) {
    console.warn("finance-hub-notify: no active Finance Hub API client — skipping");
    return json({ ok: true, skipped: "not_configured", sent: 0, failed: 0 });
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(client.token_sha256).trim().toLowerCase()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const { data, error } = await admin.rpc("finance_hub_notify_claim", { p_limit: BATCH });
  if (error) {
    console.warn("finance-hub-notify: claim failed", error.message);
    return json({ ok: false, error: "claim_failed" }, 500);
  }

  const rows = (data ?? []) as OutboxRow[];
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const res = await deliver(key, row);
    if (res.ok) sent++;
    else {
      failed++;
      console.warn(`finance-hub-notify: delivery failed event=${row.event} reason=${res.error}`);
    }
    await admin.rpc("finance_hub_notify_mark", {
      p_id: row.id,
      p_ok: res.ok,
      p_error: res.ok ? null : res.error ?? "unknown",
    });
  }

  return json({ ok: true, claimed: rows.length, sent, failed, generated_at: new Date().toISOString() });
});
