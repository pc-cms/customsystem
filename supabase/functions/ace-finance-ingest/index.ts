/**
 * ace-finance-ingest
 * Inbound API for the local ACE casino server collector.
 *
 * POST JSON + header `x-ace-key`. The raw key is never stored: we compare its
 * SHA-256 against public.ace_ingest_keys.key_sha256 for the given location.
 * Writes are service-role only (client browsers can read snapshots, not write).
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

/** Constant-time-ish comparison for equal-length hex digests. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const NUMERIC_FIELDS = [
  "total_drop",
  "net_win",
  "win_cashdesk",
  "cashless_money_difference",
  "jackpot_slip_out",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const key = req.headers.get("x-ace-key") ?? "";
  if (!key || key.length < 16) return json({ ok: false, error: "unauthorized" }, 401);

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json({ ok: false, error: "content_type_must_be_application_json" }, 400);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json({ ok: false, error: "invalid_payload" }, 400);
  }

  // --- strict validation -------------------------------------------------
  const errors: string[] = [];

  const rawLocation = body.location_code;
  const location_code =
    typeof rawLocation === "string" ? rawLocation.trim().toLowerCase() : "";
  if (!location_code || location_code.length > 64 || !/^[a-z0-9_-]+$/.test(location_code)) {
    errors.push("location_code");
  }

  const rawPeriod = body.period_id;
  const period_id = typeof rawPeriod === "number" ? rawPeriod : Number(rawPeriod);
  if (!Number.isInteger(period_id) || period_id < 0) errors.push("period_id");

  const period_label =
    typeof body.period_label === "string" ? body.period_label.trim() : "";
  if (!period_label || period_label.length > 200) errors.push("period_label");

  const numbers: Record<string, number> = {};
  for (const f of NUMERIC_FIELDS) {
    const v = body[f];
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (!Number.isFinite(n)) errors.push(f);
    else numbers[f] = n;
  }

  const isClosed = Number.isInteger(period_id) && period_id > 0;

  const rawBd = typeof body.business_date === "string" ? body.business_date.trim() : "";
  let business_date: string | null = null;
  if (rawBd) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawBd) || Number.isNaN(Date.parse(`${rawBd}T00:00:00Z`))) {
      errors.push("business_date");
    } else business_date = rawBd;
  } else if (isClosed) {
    errors.push("business_date");
  }

  const rawClosedAt =
    typeof body.closed_at_local === "string" ? body.closed_at_local.trim() : "";
  if (rawClosedAt && rawClosedAt.length > 64) errors.push("closed_at_local");
  const closed_at_local = rawClosedAt || null;

  if (errors.length) {
    return json({ ok: false, error: "validation_failed", fields: errors }, 400);
  }

  // --- auth against stored hash -----------------------------------------
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: cred, error: credErr } = await admin
    .from("ace_ingest_keys")
    .select("id, key_sha256, is_active, casino_id")
    .eq("location_code", location_code)
    .maybeSingle();

  if (credErr) {
    console.error("ace-finance-ingest: credential lookup failed", credErr.message);
    return json({ ok: false, error: "server_error" }, 500);
  }
  if (!cred || !cred.is_active) return json({ ok: false, error: "unauthorized" }, 401);

  const provided = await sha256Hex(key);
  if (!safeEqual(provided, String(cred.key_sha256).toLowerCase())) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const touchKey = () =>
    admin.from("ace_ingest_keys").update({ last_seen_at: new Date().toISOString() }).eq("id", cred.id);

  // --- immutability guard for closed reports -----------------------------
  if (isClosed) {
    const { data: existing } = await admin
      .from("ace_finance_snapshots")
      .select("id, business_date, apply_status, closing_applied_at")
      .eq("location_code", location_code)
      .eq("period_id", period_id)
      .maybeSingle();

    if (existing && existing.apply_status === "applied") {
      await touchKey();
      return json({
        ok: true,
        status: "already_recorded",
        id: existing.id,
        location_code,
        period_id,
        business_date: existing.business_date,
        closing_applied_at: existing.closing_applied_at,
      });
    }
  }

  // --- upsert -------------------------------------------------------------
  const row: Record<string, unknown> = {
    location_code,
    period_id,
    period_label,
    ...numbers,
    business_date,
    closed_at_local,
    casino_id: cred.casino_id ?? null,
    is_live: period_id === 0,
    source: "ACE",
    received_at: new Date().toISOString(),
  };
  if (isClosed) {
    row.apply_status = "pending";
    row.apply_error = null;
    row.closing_applied_at = null;
  }

  const { data, error } = await admin
    .from("ace_finance_snapshots")
    .upsert(row, { onConflict: "location_code,period_id" })
    .select("id, location_code, period_id, business_date, received_at")
    .single();

  if (error) {
    console.error("ace-finance-ingest: upsert failed", error.message);
    return json({ ok: false, error: "upsert_failed" }, 400);
  }

  await touchKey();

  if (!isClosed) {
    return json({
      ok: true,
      status: "live_updated",
      id: data.id,
      location_code: data.location_code,
      period_id: data.period_id,
      received_at: data.received_at,
    });
  }

  // --- apply closed report into Day Closing figures -----------------------
  if (!cred.casino_id) {
    await admin
      .from("ace_finance_snapshots")
      .update({ apply_status: "failed", apply_error: "location_not_linked_to_casino" })
      .eq("id", data.id);
    return json({ ok: false, status: "apply_failed", error: "location_not_linked_to_casino", retryable: true }, 400);
  }

  const { error: rpcErr } = await admin.rpc("ace_apply_closed_report", {
    _casino_id: cred.casino_id,
    _business_date: business_date,
    _drop_slots: numbers.total_drop,
    _net_win: numbers.net_win,
    _cashdesk_win: numbers.win_cashdesk,
    _client_balance: numbers.cashless_money_difference,
  });

  if (rpcErr) {
    console.error("ace-finance-ingest: apply failed", rpcErr.message);
    await admin
      .from("ace_finance_snapshots")
      .update({ apply_status: "failed", apply_error: rpcErr.message.slice(0, 500) })
      .eq("id", data.id);
    return json({ ok: false, status: "apply_failed", error: "apply_failed", retryable: true }, 500);
  }

  const appliedAt = new Date().toISOString();
  await admin
    .from("ace_finance_snapshots")
    .update({ apply_status: "applied", apply_error: null, closing_applied_at: appliedAt })
    .eq("id", data.id);

  return json({
    ok: true,
    status: "closing_recorded",
    id: data.id,
    location_code: data.location_code,
    period_id: data.period_id,
    business_date,
    closing_applied_at: appliedAt,
    jackpot_slip_out: numbers.jackpot_slip_out,
  });
});

