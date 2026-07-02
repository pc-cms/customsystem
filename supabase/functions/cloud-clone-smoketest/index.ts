// @ts-nocheck
/**
 * cloud-clone-smoketest — invoked by cron at 04:00 EAT. For every
 * cloud_clone_uploads row that has no matching cloud_clone_reports
 * row yet, runs a suite of lightweight sanity checks against
 * *live* Cloud tables (parity with the manifest the box just uploaded).
 *
 * Note: full pg_restore of every clone into an isolated Cloud DB is
 * out of scope for a single edge invocation. Instead we compare the
 * uploaded rows_by_table manifest against Cloud counts for the same
 * casino_id — this catches replication drift within minutes.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Business-critical tables that must appear in every clone
const CRITICAL_TABLES = [
  "players", "transactions", "shifts", "table_daily_results",
  "chip_snapshots", "cage_transfers", "expenses", "employees",
];

// Tolerance: cloud can be ahead of the box by at most this fraction
const DRIFT_TOLERANCE = 0.20;

async function countRows(table: string, casinoId: string | null): Promise<number> {
  let q = admin.from(table).select("*", { count: "exact", head: true });
  if (casinoId) q = q.eq("casino_id", casinoId);
  const { count, error } = await q;
  if (error) return -1;
  return count ?? 0;
}

async function runChecksFor(upload: any) {
  const checks: any[] = [];
  const rows = upload.rows_by_table ?? {};
  const casinoId = upload.casino_id;

  // 1) manifest freshness
  const uploadedAt = new Date(upload.uploaded_at).getTime();
  const ageHours = (Date.now() - uploadedAt) / 3_600_000;
  checks.push({
    name: "manifest_freshness",
    ok: ageHours < 25,
    detail: { age_hours: Number(ageHours.toFixed(2)) },
  });

  // 2) critical tables present in dump
  const missing = CRITICAL_TABLES.filter((t) => !(t in rows));
  checks.push({
    name: "critical_tables_present",
    ok: missing.length === 0,
    detail: { missing },
  });

  // 3) row-count drift against Cloud
  const drift: Record<string, any> = {};
  let regressions = 0;
  for (const t of CRITICAL_TABLES) {
    if (!(t in rows)) continue;
    const cloud = await countRows(t, casinoId);
    if (cloud < 0) { drift[t] = { error: "cloud_query_failed" }; continue; }
    const box = Number(rows[t] ?? 0);
    const delta = cloud - box;
    const rel = box > 0 ? Math.abs(delta) / box : 0;
    const ok = rel <= DRIFT_TOLERANCE;
    if (!ok) regressions++;
    drift[t] = { box, cloud, delta, rel: Number(rel.toFixed(3)), ok };
  }
  checks.push({ name: "row_count_parity", ok: regressions === 0, detail: drift });

  // 4) chip conservation (sanity: sum should exist in dump)
  checks.push({
    name: "chip_snapshot_written",
    ok: (rows["chip_snapshots"] ?? 0) > 0,
    detail: { rows: rows["chip_snapshots"] ?? 0 },
  });

  // 5) upload size sanity (>256KB, <2GB)
  checks.push({
    name: "size_sanity",
    ok: upload.size_bytes > 256 * 1024 && upload.size_bytes < 2 * 1024 ** 3,
    detail: { size_bytes: upload.size_bytes },
  });

  const overall = checks.every((c) => c.ok) ? "pass" :
    checks.some((c) => !c.ok && c.name === "row_count_parity") ? "regression" : "warning";

  return { overall, checks, regressions };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Find uploads with no report yet (last 48h window)
  const since = new Date(Date.now() - 48 * 3600_000).toISOString();
  const { data: uploads, error } = await admin
    .from("cloud_clone_uploads")
    .select("id, node_id, casino_id, uploaded_at, size_bytes, rows_by_table")
    .gte("uploaded_at", since)
    .order("uploaded_at", { ascending: false })
    .limit(50);
  if (error) return json(500, { error: error.message });

  const results: any[] = [];
  for (const u of uploads ?? []) {
    const { data: existing } = await admin
      .from("cloud_clone_reports").select("id").eq("upload_id", u.id).maybeSingle();
    if (existing) continue;

    const r = await runChecksFor(u);
    const { error: insErr } = await admin.from("cloud_clone_reports").insert({
      upload_id: u.id, node_id: u.node_id,
      overall: r.overall, checks: r.checks, regressions: r.regressions,
    });
    if (insErr) { results.push({ upload: u.id, error: insErr.message }); continue; }

    // Queue a notify command on regression
    if (r.overall === "regression") {
      await admin.from("fleet_commands").insert({
        node_id: u.node_id, kind: "custom",
        payload: { alert: "clone_smoketest_regression", upload_id: u.id },
      });
    }
    results.push({ upload: u.id, overall: r.overall, regressions: r.regressions });
  }

  return json(200, { ok: true, processed: results.length, results });
});
