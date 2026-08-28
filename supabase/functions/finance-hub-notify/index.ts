// Finance Hub near-realtime notifier (outbound wake-up signals only).
//
// Reads the coalesced `finance_hub_notify_outbox` queue and POSTs a tiny
// metadata-only body to the Finance Hub webhook. It NEVER sends financial
// values — Finance Hub still pulls authoritative data from the read-only
// `finance-hub-export` API.
//
// Auth (outbound): Authorization: Bearer <FINANCE_HUB_EXPORT_TOKEN>, the same
// shared finance-export token Finance Hub uses against our export API. The
// token is server-only (Supabase secret) and is never logged.
//
// Fail-open: this function is invoked out of band (cron / manual). Nothing here
// can roll back or block a casino financial operation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_URL = Deno.env.get("FINANCE_HUB_WEBHOOK_URL") ?? "";
const WEBHOOK_TOKEN = Deno.env.get("FINANCE_HUB_EXPORT_TOKEN") ?? "";

const TIMEOUT_MS = 3000;
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

async function deliver(row: OutboxRow): Promise<{ ok: boolean; error?: string }> {
  const body: Record<string, unknown> = { event: row.event, feed: row.feed };
  if (row.source_table) body.source_table = row.source_table;
  if (row.source_id) body.source_id = row.source_id;
  if (row.occurred_at) body.occurred_at = row.occurred_at;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WEBHOOK_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    return { ok: true };
  } catch (e) {
    // Never include headers or the token in the error text.
    return { ok: false, error: String((e as Error)?.name ?? "fetch_failed") };
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!WEBHOOK_URL || !WEBHOOK_TOKEN) {
    // Misconfiguration must stay silent for casino operations.
    console.warn("finance-hub-notify: webhook URL or token not configured — skipping");
    return json({ ok: true, skipped: "not_configured", sent: 0, failed: 0 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const { data, error } = await admin.rpc("finance_hub_notify_claim", { p_limit: BATCH });
  if (error) {
    console.warn("finance-hub-notify: claim failed", error.message);
    return json({ ok: false, error: "claim_failed" }, 500);
  }

  const rows = (data ?? []) as OutboxRow[];
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const res = await deliver(row);
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
