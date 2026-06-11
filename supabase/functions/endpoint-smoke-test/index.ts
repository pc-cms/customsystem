// Endpoint smoke test — runs representative PostgREST queries (the same shape
// the frontend uses) and logs each result to endpoint_health_checks.
// Triggered hourly by pg_cron; can also be invoked manually.
//
// Tests focus on .select("*, players(...)") / gaming_tables(...) / casinos(...)
// embeds — these are the queries that break with HTTP 400 when an FK is missing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Check = { name: string; path: string; method?: "GET" | "POST"; body?: string };

// PostgREST smoke tests mirroring real frontend embeds.
const CHECKS: Check[] = [
  // ── Cage / transactions (the 02:19 crash surface) ─────────────────────
  { name: "cashless.embed.players",          path: "cashless_transactions?select=id,players(first_name,last_name)&limit=1" },
  { name: "transactions.embed.players",      path: "transactions?select=id,players(first_name,last_name,nickname),gaming_tables(name)&limit=1" },
  { name: "cancellations.embed.players",     path: "transaction_cancellations?select=id,players(first_name,last_name,nickname)&limit=1" },
  { name: "expenses.embed.players",          path: "expenses?select=id,players(first_name,last_name)&limit=1" },
  // ── Players / sessions / visits ───────────────────────────────────────
  { name: "players.embed.cards_tags",        path: "players?select=id,player_cards(*),player_tags(id,tag)&limit=1" },
  { name: "client_sessions.embed.tables",    path: "client_sessions?select=id,gaming_tables(name,game)&limit=1" },
  { name: "casino_visits.embed.casinos",     path: "casino_visits?select=id,casinos(name,code)&limit=1" },
  { name: "group_members.embed.groups",      path: "group_members?select=id,player_groups(name)&limit=1" },
  // ── Tables ────────────────────────────────────────────────────────────
  { name: "gaming_tables.list",              path: "gaming_tables?select=id,name,status&limit=1" },
  { name: "breaklist.embed.tables",          path: "breaklist?select=id,gaming_tables(name)&limit=1" },
  // ── Cage slots ────────────────────────────────────────────────────────
  { name: "cage_slots_shifts.list",          path: "cage_slots_shifts?select=id&limit=1" },
  { name: "cashless.embed.players.full",     path: "cashless_transactions?select=id,players(first_name,last_name,nickname)&limit=1" },
  // ── Tips / employees ──────────────────────────────────────────────────
  { name: "tips.embed.employees",            path: "transactions?select=id,gaming_tables(name),employees:tips_recipient_employee_id(full_name)&limit=1&type=eq.tips_live" },
  // ── Business day ──────────────────────────────────────────────────────
  { name: "business_day_closures.list",      path: "business_day_closures?select=id,business_date&limit=1" },
  // ── RPCs (the ones the UI calls constantly) ───────────────────────────
  { name: "rpc.get_current_business_date",   path: "rpc/get_current_business_date", method: "POST", body: '{"_casino_id":"00000000-0000-0000-0000-000000000000"}' },
  // ── Auth-side surfaces ────────────────────────────────────────────────
  { name: "profiles.list",                   path: "profiles?select=id,display_name&limit=1" },
  { name: "user_roles.list",                 path: "user_roles?select=id,role&limit=1" },
  { name: "user_casino_access.list",         path: "user_casino_access?select=user_id,casino_id&limit=1" },
  // ── Finance ───────────────────────────────────────────────────────────
  { name: "fin_day_closing.list",            path: "fin_day_closing?select=id,business_date,tables_result&limit=1" },
  { name: "shifts.list",                     path: "shifts?select=id,casino_id,opened_at&limit=1" },
];

async function runCheck(c: Check) {
  const t0 = performance.now();
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${c.path}`, {
      method: c.method ?? "GET",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        Accept: "application/json",
        ...(c.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(c.body ? { body: c.body } : {}),
    });
    const duration_ms = Math.round(performance.now() - t0);
    const ok = r.ok;
    let error: string | null = null;
    if (!ok) {
      const txt = await r.text();
      error = txt.slice(0, 300);
    } else {
      await r.text();
    }
    return {
      endpoint: c.name,
      status: ok ? "ok" : "fail",
      http_code: r.status,
      duration_ms,
      error,
    };
  } catch (e) {
    return {
      endpoint: c.name,
      status: "fail",
      http_code: null,
      duration_ms: Math.round(performance.now() - t0),
      error: String((e as Error)?.message ?? e).slice(0, 300),
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Cron-only: require service-role key
  const provided = req.headers.get("x-service-key") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (provided !== SERVICE_KEY && authHeader !== `Bearer ${SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);


  const results = await Promise.all(CHECKS.map(runCheck));

  // Bulk-insert all results
  const { error: insertErr } = await admin
    .from("endpoint_health_checks")
    .insert(results);

  // Opportunistic purge (cheap, idempotent)
  try { await admin.rpc("purge_endpoint_health_checks"); } catch { /* ignore */ }

  const failed = results.filter((r) => r.status === "fail");

  return new Response(
    JSON.stringify({
      ok: failed.length === 0,
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      failures: failed,
      insert_error: insertErr?.message ?? null,
    }, null, 2),
    {
      status: failed.length === 0 ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
