/**
 * cloud-parity-counts — returns row counts for a casino across a fixed
 * whitelist of tables. Used by `install.sh --verify-parity`.
 *
 * GET /cloud-parity-counts
 *   Headers:
 *     x-sync-secret + x-casino-id   OR   x-service-key: <service role>
 *
 * Response: { casino_id, counts: { <table>: <number | "ERR:..."> } }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-service-key, x-sync-secret, x-casino-id, authorization, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Tables scoped directly by casino_id
const CASINO_TABLES = [
  "players", "gaming_tables", "shifts", "fin_day_closing", "employees",
  "transactions", "expenses", "casino_visits", "client_sessions",
  "player_notes", "player_chip_adjustments",
  "chip_inventory", "chip_emissions", "cash_counts",
  "table_tracker", "table_daily_results", "business_day_closures",
  "player_position_history", "mirror_cutover_state", "node_modes",
];
// Scoped via players.casino_id (no direct casino_id column)
const PLAYER_JOIN_TABLES = ["player_cards", "player_tags"];
// Global tables (no casino_id)
const GLOBAL_TABLES = ["casinos", "user_roles", "user_casino_access", "sync_table_registry"];

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json(405, { error: "method not allowed" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const providedKey = req.headers.get("x-service-key") ?? "";
  const syncSecret  = req.headers.get("x-sync-secret") ?? "";
  const casinoId    = req.headers.get("x-casino-id") ?? "";

  let authed = providedKey && providedKey === SERVICE_KEY;
  if (!authed && syncSecret && casinoId) {
    const { data: pend } = await admin
      .from("pending_server_registrations")
      .select("approved_casino_id")
      .eq("approved_casino_id", casinoId)
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
      // Reject if peer is not bound to a casino OR header casino doesn't match.
      if (peer && peer.casino_id && peer.casino_id === casinoId) authed = true;
    }
  }
  if (!authed) return json(401, { error: "unauthorized" });
  if (!/^[0-9a-f-]{36}$/i.test(casinoId)) return json(400, { error: "x-casino-id required (uuid)" });

  const counts: Record<string, number | string> = {};

  const errLabel = (e: { code?: string; message: string }) =>
    `ERR:${e.code ?? e.message.slice(0, 40)}`;

  for (const t of CASINO_TABLES) {
    const { count, error } = await admin
      .from(t)
      .select("*", { count: "exact", head: true })
      .eq("casino_id", casinoId);
    counts[t] = error ? errLabel(error) : (count ?? 0);
  }
  for (const t of PLAYER_JOIN_TABLES) {
    const { count, error } = await admin
      .from(t)
      .select("id, players!inner(casino_id)", { count: "exact", head: true })
      .eq("players.casino_id", casinoId);
    counts[t] = error ? errLabel(error) : (count ?? 0);
  }
  for (const t of GLOBAL_TABLES) {
    const { count, error } = await admin
      .from(t)
      .select("*", { count: "exact", head: true });
    counts[t] = error ? errLabel(error) : (count ?? 0);
  }

  return json(200, { casino_id: casinoId, counts });
});
