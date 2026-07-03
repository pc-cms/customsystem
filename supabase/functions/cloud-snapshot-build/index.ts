/**
 * cloud-snapshot-build — packages an NDJSON casino seed and uploads it
 * to private storage bucket `installer-snapshots`. Installers download
 * the latest object from here on first install (Variant B baked snapshot).
 *
 * POST /cloud-snapshot-build
 *   Body: { casino_id: uuid, days?: number, tag?: string }
 *   Auth: requires super_admin via standard preview session, OR x-service-key.
 *
 * Result object: installer-snapshots/<casino_slug>/<YYYYMMDD-HHMMSS>.ndjson.gz
 *                installer-snapshots/<casino_slug>/latest.ndjson.gz  (overwritten)
 *                installer-snapshots/<casino_slug>/latest.meta.json
 *
 * Reuses the same per-table extraction as cloud-seed-export so semantics stay
 * identical — but writes the stream to Storage instead of HTTP body.
 */
// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-service-key, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Same FK-safe order as cloud-seed-export
const TABLES: Array<{ name: string; scope: "single" | "full" | "global"; sinceDays?: number }> = [
  { name: "casinos", scope: "single" },
  { name: "gaming_tables", scope: "full" },
  { name: "chip_color_settings", scope: "full" },
  { name: "chip_initial_baseline", scope: "full" },
  { name: "chip_baseline", scope: "full" },
  { name: "chip_inventory", scope: "full" },
  { name: "fin_categories", scope: "full" },
  { name: "fin_wallets", scope: "full" },
  { name: "fin_budget", scope: "full" },
  { name: "employees", scope: "full" },
  { name: "players", scope: "full" },
  { name: "player_cards", scope: "full" },
  { name: "player_groups", scope: "full" },
  { name: "group_members", scope: "full" },
  { name: "player_tags", scope: "full" },
  { name: "player_notes", scope: "full" },
  { name: "user_casino_access", scope: "full" },
  { name: "user_module_permissions", scope: "full" },
  { name: "shifts", scope: "full", sinceDays: 90 },
  { name: "transactions", scope: "full", sinceDays: 90 },
  { name: "casino_visits", scope: "full", sinceDays: 90 },
  { name: "breaklist", scope: "full", sinceDays: 90 },
  { name: "pit_rota", scope: "full", sinceDays: 90 },
  { name: "staff_rota", scope: "full", sinceDays: 90 },
  { name: "fin_wallet_tx", scope: "full", sinceDays: 90 },
  { name: "fin_day_closing", scope: "full", sinceDays: 90 },
  { name: "fin_money_change", scope: "full", sinceDays: 90 },
];

async function authorize(req: Request): Promise<{ ok: boolean; reason?: string }> {
  const skey = req.headers.get("x-service-key");
  if (skey && skey === SERVICE_KEY) return { ok: true };

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return { ok: false, reason: "missing bearer" };
  const token = auth.slice(7);
  const { data: userRes, error } = await admin.auth.getUser(token);
  if (error || !userRes?.user) return { ok: false, reason: "invalid token" };
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userRes.user.id);
  const isSuper = (roles ?? []).some((r: any) => r.role === "super_admin");
  return isSuper ? { ok: true } : { ok: false, reason: "super_admin required" };
}

async function exportTable(t: typeof TABLES[number], casinoId: string): Promise<any[]> {
  let q: any = admin.from(t.name).select("*");
  if (t.scope === "single") q = q.eq("id", casinoId);
  else if (t.scope === "full") q = q.eq("casino_id", casinoId);
  if (t.sinceDays) {
    const since = new Date(Date.now() - t.sinceDays * 86400_000).toISOString();
    q = q.gte("created_at", since);
  }
  const { data, error } = await q.limit(50000);
  if (error) throw new Error(`${t.name}: ${error.message}`);
  return data ?? [];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  const authz = await authorize(req);
  if (!authz.ok) return json(401, { error: authz.reason });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const casinoId = body.casino_id;
  if (!casinoId) return json(400, { error: "casino_id required" });

  // Resolve slug for path
  const { data: casino } = await admin.from("casinos").select("slug,name").eq("id", casinoId).maybeSingle();
  if (!casino) return json(404, { error: "casino not found" });
  const slug = (casino as any).slug || casinoId;

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const counts: Record<string, number> = {};
  const lines: string[] = [];
  lines.push(JSON.stringify({ _meta: { casino_id: casinoId, slug, exported_at: new Date().toISOString(), tag: body.tag ?? "manual" } }));

  for (const t of TABLES) {
    try {
      const rows = await exportTable(t, casinoId);
      counts[t.name] = rows.length;
      for (const row of rows) lines.push(JSON.stringify({ table: t.name, row }));
    } catch (e) {
      counts[t.name] = -1;
      lines.push(JSON.stringify({ _error: { table: t.name, message: String(e?.message ?? e) } }));
    }
  }

  lines.push(JSON.stringify({ _done: true, counts }));
  const ndjson = lines.join("\n") + "\n";
  // gzip with CompressionStream
  const blob = new Blob([ndjson], { type: "application/x-ndjson" });
  const compressed = blob.stream().pipeThrough(new CompressionStream("gzip"));
  const buf = new Uint8Array(await new Response(compressed).arrayBuffer());

  const tsKey  = `${slug}/${ts}.ndjson.gz`;
  const latest = `${slug}/latest.ndjson.gz`;
  const meta   = `${slug}/latest.meta.json`;

  for (const key of [tsKey, latest]) {
    const { error } = await admin.storage.from("installer-snapshots")
      .upload(key, buf, { contentType: "application/gzip", upsert: true });
    if (error) return json(500, { error: `upload ${key}: ${error.message}` });
  }
  const metaJson = new TextEncoder().encode(JSON.stringify({
    casino_id: casinoId, slug, exported_at: new Date().toISOString(),
    object: tsKey, latest_object: latest, size_bytes: buf.byteLength,
    counts,
  }, null, 2));
  await admin.storage.from("installer-snapshots")
    .upload(meta, metaJson, { contentType: "application/json", upsert: true });

  return json(200, { ok: true, object: tsKey, latest, size_bytes: buf.byteLength, counts });
});
