#!/usr/bin/env node
/**
 * pair-cli.js — direct-DB pairing CLI for cms-sync container.
 *
 * Bypasses HTTP auth (super_admin Bearer) by running INSIDE the cms-sync
 * container, talking to local Postgres + Cloud register-local-server endpoint
 * directly. Used by /pair.sh one-shot installer.
 *
 * Commands:
 *   start            register on Cloud, print pairing_code, store in cloud_connection
 *   poll             poll Cloud once → exits 0 (connected) | 2 (still pending) | 3 (rejected/expired)
 *   wait [seconds]   poll loop until connected or timeout (default 900s = 15min)
 *   sync             trigger initial-sync-trigger on Cloud (must be connected)
 *   status           print current cloud_connection row
 *
 * Env required (already set in cms-sync container):
 *   LOCAL_DB_URL, CLOUD_URL, CLOUD_ANON_KEY (optional, has fallback)
 */
import pg from "pg";
import os from "node:os";
import crypto from "node:crypto";

const { LOCAL_DB_URL, CLOUD_URL: ENV_CLOUD_URL } = process.env;
const CLOUD_ANON_KEY =
  process.env.CLOUD_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJwZWhuZ2p2d2NuaXB2a291bHV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTcwMjAsImV4cCI6MjA5MDI3MzAyMH0.KTJEJRCYpNjj51H28x3pYFLvfMz5qtRjxnUFw3Hnwr0";

if (!LOCAL_DB_URL) {
  console.error("FATAL: LOCAL_DB_URL not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: LOCAL_DB_URL });

const cloudHeaders = {
  "Content-Type": "application/json",
  apikey: CLOUD_ANON_KEY,
  Authorization: `Bearer ${CLOUD_ANON_KEY}`,
};

async function importAuthUser(client, u, counts) {
  await client.query(`
    INSERT INTO auth.users
      (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at, phone)
    VALUES
      ('00000000-0000-0000-0000-000000000000'::uuid, $1::uuid,
       COALESCE($2::text,'authenticated'), COALESCE($3::text,'authenticated'),
       $4::text, $5::text, COALESCE($6::timestamptz, now()),
       COALESCE($7::jsonb, '{"provider":"email","providers":["email"],"role":"authenticated"}'::jsonb),
       COALESCE($8::jsonb, '{}'::jsonb), COALESCE($9::timestamptz, now()), now(), $10::text)
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      encrypted_password = EXCLUDED.encrypted_password,
      email_confirmed_at = EXCLUDED.email_confirmed_at,
      raw_app_meta_data = EXCLUDED.raw_app_meta_data,
      raw_user_meta_data = EXCLUDED.raw_user_meta_data,
      phone = EXCLUDED.phone,
      aud = 'authenticated', role = 'authenticated', updated_at = now()
  `, [
    u.id, u.aud, u.role, u.email, u.encrypted_password, u.email_confirmed_at,
    u.raw_app_meta_data ? JSON.stringify(u.raw_app_meta_data) : null,
    u.raw_user_meta_data ? JSON.stringify(u.raw_user_meta_data) : null,
    u.created_at, u.phone,
  ]);
  await client.query(`
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), $1::uuid,
            jsonb_build_object('sub', $1::text, 'email', $2::text, 'email_verified', true),
            'email', $1::text, now(), now(), now())
    ON CONFLICT (provider, provider_id) DO NOTHING
  `, [u.id, u.email]);
  counts["auth.users"] = (counts["auth.users"] || 0) + 1;
}

const generatedColumnsCache = new Map();

async function getGeneratedColumns(client, tableName) {
  if (generatedColumnsCache.has(tableName)) return generatedColumnsCache.get(tableName);

  const { rows } = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND (is_generated <> 'NEVER' OR is_identity = 'YES')`,
    [tableName]
  );
  const cols = new Set(rows.map((r) => r.column_name));
  generatedColumnsCache.set(tableName, cols);
  return cols;
}

async function getRow() {
  const { rows } = await pool.query(`SELECT * FROM public.cloud_connection WHERE id = 1`);
  return rows[0] || null;
}

async function ensureRow() {
  await pool.query(`INSERT INTO public.cloud_connection (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
}

function cloudPeerUrl(cloudUrl) {
  return `${cloudUrl.replace(/\/$/, "")}/functions/v1/peer-mesh`;
}

async function ensureLocalCloudPeer(row) {
  if (!row?.cloud_url || !row?.sync_secret) return null;
  const peerUrl = cloudPeerUrl(row.cloud_url);
  try {
    const { rows } = await pool.query(
      `SELECT id FROM public.peer_links WHERE sync_secret = $1 OR peer_url = $2 LIMIT 1`,
      [row.sync_secret, peerUrl]
    );
    if (rows[0]) {
      await pool.query(
        `UPDATE public.peer_links
            SET peer_url = $1, display_name = 'Lovable Cloud', sync_secret = $2,
                status = CASE WHEN status = 'rejected' THEN 'pending_outbound' ELSE status END,
                last_push_error = NULL, last_pull_error = NULL
          WHERE id = $3`,
        [peerUrl, row.sync_secret, rows[0].id]
      );
      return rows[0].id;
    }
    const { rows: inserted } = await pool.query(
      `INSERT INTO public.peer_links (peer_url, display_name, sync_secret, status)
       VALUES ($1, 'Lovable Cloud', $2, 'pending_outbound')
       RETURNING id`,
      [peerUrl, row.sync_secret]
    );
    return inserted[0]?.id ?? null;
  } catch (e) {
    console.error(`[pair] peer_links setup skipped: ${String(e?.message || e).slice(0, 160)}`);
    return null;
  }
}

async function handshakeCloudPeer(row) {
  await ensureLocalCloudPeer(row);
  const { rows: identities } = await pool.query(
    `SELECT node_id, display_name, node_kind, schema_version FROM public.node_identity WHERE id = true`
  );
  const identity = identities[0];
  if (!identity?.node_id) return { ok: false, reason: "node_identity missing" };

  const { rows: peers } = await pool.query(
    `SELECT * FROM public.peer_links WHERE sync_secret = $1 ORDER BY created_at DESC LIMIT 1`,
    [row.sync_secret]
  );
  const peer = peers[0];
  if (!peer) return { ok: false, reason: "Cloud peer row missing" };

  const body = {
    my_node_id: identity.node_id,
    my_display_name: identity.display_name,
    my_node_kind: identity.node_kind,
    my_schema_version: identity.schema_version,
  };
  const raw = JSON.stringify(body);
  const signature = crypto.createHmac("sha256", peer.sync_secret).update(raw).digest("hex");
  const res = await fetch(`${peer.peer_url}/peer/handshake`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-peer-node-id": identity.node_id,
      "x-peer-signature": signature,
    },
    body: raw,
  });
  const text = await res.text().catch(() => "");
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch {}
  if (!res.ok) return { ok: false, http: res.status, body: text.slice(0, 300) };
  await pool.query(
    `UPDATE public.peer_links
        SET peer_node_id = $1, schema_version = $2, status = 'active',
            last_seen_at = now(), last_push_error = NULL, last_pull_error = NULL
      WHERE id = $3`,
    [json.node_id ?? null, json.schema_version ?? null, peer.id]
  );
  return { ok: true, http: res.status, peer_node_id: json.node_id ?? null };
}

async function start(cloudUrl) {
  await ensureRow();
  const payload = {
    server_name: process.env.CASINO_NAME || os.hostname(),
    server_slug: process.env.CASINO_SLUG || null,
    server_ip: process.env.LOCAL_IP || null,
    hostname: os.hostname(),
    system_info: {
      ram_gb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      platform: os.platform(),
      release: os.release(),
    },
  };
  const r = await fetch(`${cloudUrl}/functions/v1/register-local-server`, {
    method: "POST",
    headers: cloudHeaders,
    body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.pairing_code) {
    throw new Error(`Cloud register failed: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  }
  await pool.query(
    `UPDATE public.cloud_connection
       SET cloud_url = $1, status = 'pairing', pairing_id = $2, pairing_code = $3,
           pairing_expires_at = $4, casino_id = NULL, sync_secret = NULL,
           connected_at = NULL, last_polled_at = now(), last_error = NULL
     WHERE id = 1`,
    [cloudUrl, j.id, j.pairing_code, j.expires_at]
  );
  return { pairing_code: j.pairing_code, expires_at: j.expires_at };
}

async function pollOnce() {
  const row = await getRow();
  if (!row) return { status: "disconnected" };
  if (row.status === "connected") {
    return { status: "connected", casino_id: row.casino_id, sync_secret: row.sync_secret };
  }
  if (row.status !== "pairing" || !row.pairing_code) return { status: row.status };

  const r = await fetch(
    `${row.cloud_url}/functions/v1/register-local-server?code=${row.pairing_code}`,
    { headers: cloudHeaders }
  );
  const j = await r.json().catch(() => ({}));
  await pool.query(`UPDATE public.cloud_connection SET last_polled_at = now() WHERE id = 1`);

  if (j.status === "approved" && j.casino_id && j.sync_secret) {
    await pool.query(
      `UPDATE public.cloud_connection
         SET status = 'connected', casino_id = $1, sync_secret = $2,
             connected_at = now(), pairing_code = NULL, pairing_expires_at = NULL,
             last_error = NULL
       WHERE id = 1`,
      [j.casino_id, j.sync_secret]
    );
    // Tag this node as the owner of the paired casino so Full Mirror Sync
    // controls in Admin → Peers unlock (they require node_identity.owned_casino_ids).
    await pool.query(
      `UPDATE public.node_identity
          SET owned_casino_ids = ARRAY[$1::uuid]
        WHERE id = true`,
      [j.casino_id]
    ).catch((e) => console.warn(`[pair] could not tag owned_casino_ids: ${e?.message || e}`));
    await ensureLocalCloudPeer({ cloud_url: row.cloud_url, sync_secret: j.sync_secret });
    return { status: "connected", casino_id: j.casino_id, sync_secret: j.sync_secret };
  }
  if (j.status === "rejected" || j.status === "expired") {
    await pool.query(
      `UPDATE public.cloud_connection
         SET status = 'disconnected', pairing_code = NULL, pairing_expires_at = NULL,
             last_error = $1
       WHERE id = 1`,
      [j.status]
    );
    return { status: j.status };
  }
  return { status: j.status || "pairing" };
}

async function wait(seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    const r = await pollOnce();
    if (r.status === "connected") return r;
    if (r.status === "rejected" || r.status === "expired") return r;
    await new Promise((res) => setTimeout(res, 5000));
  }
  return { status: "timeout" };
}

async function ping() {
  const row = await getRow();
  if (!row || row.status !== "connected") {
    return { ok: false, reason: "not connected", status: row?.status || "none" };
  }
  const result = await handshakeCloudPeer(row);
  await pool.query(
    `UPDATE public.cloud_connection
        SET last_polled_at = now(),
            last_error = $1
      WHERE id = 1`,
    [result.ok ? null : `peer handshake failed: ${JSON.stringify(result).slice(0, 220)}`]
  );
  return result;
}

const SEED_TABLE_GROUPS = [
  {
    label: "core",
    auth: true,
    tables: [
      "casinos", "tax_brackets", "payroll_paye_brackets", "role_module_defaults",
      "gaming_tables", "chip_color_settings", "chip_initial_baseline", "chip_baseline", "chip_inventory",
      "fin_categories", "fin_wallets", "fin_budget", "payroll_settings", "attendance_holidays",
      "employees", "players", "player_cards", "player_groups",
      "group_members", "player_tags", "player_notes", "user_casino_access", "user_module_permissions",
      "profiles", "user_roles", "user_credentials",
    ],
  },
  ...[
    "shifts", "transactions", "casino_visits", "breaklist", "pit_rota", "staff_rota",
    "dealer_attendance", "staff_attendance", "attendance_hours", "cage_transfers", "expenses",
    "fin_wallet_tx", "fin_day_closing", "fin_money_change", "fin_audit_log", "chip_emissions",
    "table_tracker", "table_daily_results", "business_day_closures", "cash_counts",
    "cash_count_snapshots", "cashless_transactions", "bank_checks", "cctv_observations",
    "chip_transfers", "player_chip_adjustments", "player_position_history", "client_sessions",
    "staff_warnings", "transaction_cancellations", "player_daily_avg_bets",
    "player_daily_avg_bet_changes", "incidents", "payroll_periods", "payroll_entries",
    "monthly_tips_pools", "monthly_tips_entries", "weekly_bonus_pools", "weekly_bonus_entries",
    "chip_snapshots",
    "activity_logs", "activity_logs_archive", "breaklist_logs", "breaklist_logs_archive",
    "casino_visits_archive", "client_sessions_archive", "incidents_audit", "payroll_audit_log",
  ].map((table) => ({ label: table, tables: [table] })),
];

const SKIP_SEED_TABLES = new Set(["player_economy", "player_session_stats", "player_session_drops"]);

async function applySeedChunk(client, seedUrl, headers, counts, casinoId, label, resetOutbox) {
  const r = await fetch(seedUrl, { headers });
  if (!r.ok || !r.body) {
    throw new Error(`cloud-seed-export ${label} ${r.status}: ${(await r.text().catch(()=>""))?.slice(0,300)}`);
  }

  await client.query("BEGIN");
  try {
    await client.query(`SELECT set_config('sync.applying','on', true)`);
    await client.query(`SET LOCAL session_replication_role = replica`);
    if (resetOutbox) {
      try {
        await client.query("SAVEPOINT seed_reset");
        await client.query(`SELECT public.sync_reset_outbox($1::uuid, true)`, [casinoId]);
        await client.query("RELEASE SAVEPOINT seed_reset");
      } catch (e) {
        await client.query("ROLLBACK TO SAVEPOINT seed_reset").catch(() => {});
        await client.query("RELEASE SAVEPOINT seed_reset").catch(() => {});
        console.error(`[seed] sync_reset_outbox skipped: ${String(e?.message || e).slice(0, 160)}`);
      }
    }

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let sawDone = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }
        if (obj._meta) continue;
        if (obj._done) { sawDone = true; continue; }
        if (obj._fatal) throw new Error(`cloud-seed-export fatal in ${label}: ${String(obj._fatal).slice(0, 240)}`);
        if (obj._error) {
          console.error(`[seed] export.warn ${obj._error?.table || label}: ${String(obj._error?.msg || obj._error).slice(0, 160)}`);
          continue;
        }
        if (obj.auth_user) {
          try {
            await client.query("SAVEPOINT seed_auth_user");
            await importAuthUser(client, obj.auth_user, counts);
            await client.query("RELEASE SAVEPOINT seed_auth_user");
          } catch (e) {
            await client.query("ROLLBACK TO SAVEPOINT seed_auth_user").catch(() => {});
            await client.query("RELEASE SAVEPOINT seed_auth_user").catch(() => {});
            console.error(`[seed] auth_user.fail ${obj.auth_user?.email || obj.auth_user?.id}: ${String(e?.message || e).slice(0, 160)}`);
          }
          continue;
        }
        if (!obj.table || !obj.row || SKIP_SEED_TABLES.has(obj.table)) continue;
        const generatedColumns = await getGeneratedColumns(client, obj.table);
        for (const c of generatedColumns) delete obj.row[c];
        const cols = Object.keys(obj.row);
        if (cols.length === 0) continue;
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
        const setlist = cols.filter(c => c !== "id")
          .map(c => `"${c}" = EXCLUDED."${c}"`).join(",") || `"id" = EXCLUDED."id"`;
        const sql = `INSERT INTO public."${obj.table}" (${cols.map(c => `"${c}"`).join(",")})
                     VALUES (${placeholders})
                     ON CONFLICT (id) DO UPDATE SET ${setlist}`;
        const fallbackSql = `INSERT INTO public."${obj.table}" (${cols.map(c => `"${c}"`).join(",")})
                             VALUES (${placeholders})
                             ON CONFLICT DO NOTHING`;
        try {
          await client.query("SAVEPOINT seed_row");
          await client.query(sql, cols.map(c => obj.row[c]));
          await client.query("RELEASE SAVEPOINT seed_row");
          counts[obj.table] = (counts[obj.table] || 0) + 1;
        } catch (e) {
          await client.query("ROLLBACK TO SAVEPOINT seed_row").catch(() => {});
          await client.query("RELEASE SAVEPOINT seed_row").catch(() => {});
          if (obj.table === "player_cards" && obj.row.card_number) {
            try {
              await client.query("SAVEPOINT seed_row_card_number");
              const cardSetlist = cols.map(c => `"${c}" = EXCLUDED."${c}"`).join(",");
              const cardSql = `INSERT INTO public."${obj.table}" (${cols.map(c => `"${c}"`).join(",")})
                               VALUES (${placeholders})
                               ON CONFLICT ON CONSTRAINT player_cards_card_number_unique DO UPDATE SET ${cardSetlist}`;
              const rr = await client.query(cardSql, cols.map(c => obj.row[c]));
              await client.query("RELEASE SAVEPOINT seed_row_card_number");
              if (rr.rowCount > 0) counts[obj.table] = (counts[obj.table] || 0) + rr.rowCount;
              continue;
            } catch (eCard) {
              await client.query("ROLLBACK TO SAVEPOINT seed_row_card_number").catch(() => {});
              await client.query("RELEASE SAVEPOINT seed_row_card_number").catch(() => {});
            }
          }
          try {
            await client.query("SAVEPOINT seed_row_fallback");
            const rr = await client.query(fallbackSql, cols.map(c => obj.row[c]));
            await client.query("RELEASE SAVEPOINT seed_row_fallback");
            if (rr.rowCount > 0) counts[obj.table] = (counts[obj.table] || 0) + rr.rowCount;
          } catch (e2) {
            await client.query("ROLLBACK TO SAVEPOINT seed_row_fallback").catch(() => {});
            await client.query("RELEASE SAVEPOINT seed_row_fallback").catch(() => {});
            console.error(`[seed] insert.fail ${obj.table}: ${String(e2?.message || e2 || e).slice(0, 160)}`);
          }
        }
      }
    }
    if (buf.trim()) {
      try {
        const obj = JSON.parse(buf.trim());
        if (obj._done) sawDone = true;
        if (obj._fatal) throw new Error(`cloud-seed-export fatal in ${label}: ${String(obj._fatal).slice(0, 240)}`);
      } catch (e) {
        if (String(e?.message || e).includes("cloud-seed-export fatal")) throw e;
      }
    }
    if (!sawDone) throw new Error(`cloud-seed-export ${label} ended before _done marker`);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  }
}

async function triggerSync() {
  const row = await getRow();
  if (!row || row.status !== "connected") throw new Error("Not connected to Cloud");
  const casinoId = row.casino_id;

  const client = await pool.connect();
  const counts = {};
  try {
    const headers = { "x-sync-secret": row.sync_secret, "x-casino-id": casinoId };
    for (let i = 0; i < SEED_TABLE_GROUPS.length; i++) {
      const g = SEED_TABLE_GROUPS[i];
      const params = new URLSearchParams({ casino_id: casinoId, days: "all", tables: g.tables.join(",") });
      if (!g.auth) params.set("auth", "0");
      const seedUrl = `${row.cloud_url}/functions/v1/cloud-seed-export?${params.toString()}`;
      await applySeedChunk(client, seedUrl, headers, counts, casinoId, g.label, i === 0);
    }
  } finally {
    client.release();
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // Record snapshot import in sync_snapshot_state so MirrorHealthPanel /
  // cms-status can report the seeded baseline. Best-effort; failure is
  // logged but does not abort the import.
  try {
    const checksumSrc = Object.keys(counts).sort().map(t => `${t}:${counts[t]}`).join("|");
    const checksum = crypto.createHash("sha256").update(checksumSrc).digest("hex").slice(0, 32);
    const snapshotId = `seed-${Date.now()}`;
    await pool.query(
      `INSERT INTO public.sync_snapshot_state
         (casino_id, snapshot_id, imported_at, table_counts, checksum, source)
       VALUES ($1::uuid, $2::text, now(), $3::jsonb, $4::text, 'cloud-seed-export')
       ON CONFLICT (casino_id) DO UPDATE
         SET snapshot_id  = EXCLUDED.snapshot_id,
             imported_at  = EXCLUDED.imported_at,
             table_counts = EXCLUDED.table_counts,
             checksum     = EXCLUDED.checksum,
             source       = EXCLUDED.source`,
      [casinoId, snapshotId, JSON.stringify(counts), checksum]
    );
  } catch (e) {
    console.error(`[seed] snapshot_state record failed: ${String(e?.message || e).slice(0, 200)}`);
  }

  return { ok: true, total, by_table: counts };
}

const cmd = process.argv[2];
const arg = process.argv[3];

(async () => {
  try {
    if (cmd === "start") {
      const cloudUrl = (arg || ENV_CLOUD_URL || "").replace(/\/$/, "");
      if (!/^https?:\/\//.test(cloudUrl)) throw new Error("usage: start <cloud_url>");
      const r = await start(cloudUrl);
      console.log(JSON.stringify(r));
      process.exit(0);
    }
    if (cmd === "poll") {
      const r = await pollOnce();
      console.log(JSON.stringify(r));
      if (r.status === "connected") process.exit(0);
      if (r.status === "rejected" || r.status === "expired") process.exit(3);
      process.exit(2);
    }
    if (cmd === "wait") {
      const secs = parseInt(arg || "900", 10);
      const r = await wait(secs);
      console.log(JSON.stringify(r));
      process.exit(r.status === "connected" ? 0 : (r.status === "timeout" ? 4 : 3));
    }
    if (cmd === "ping") {
      const r = await ping();
      console.log(JSON.stringify(r));
      process.exit(r.ok ? 0 : 5);
    }
    if (cmd === "mesh") {
      const row = await getRow();
      if (!row || row.status !== "connected") throw new Error("Not connected to Cloud");
      const r = await handshakeCloudPeer(row);
      console.log(JSON.stringify(r));
      process.exit(r.ok ? 0 : 6);
    }
    if (cmd === "sync") {
      const r = await triggerSync();
      console.log(JSON.stringify(r));
      process.exit(0);
    }
    if (cmd === "seed-push") {
      const row = await getRow();
      const cid = process.env.CASINO_ID || row?.casino_id;
      if (!cid) throw new Error("CASINO_ID env var or paired connection required");
      const { rows } = await pool.query(
        `SELECT * FROM public.sync_seed_from_existing($1::uuid)`, [cid]
      );
      const total = rows.reduce((s, r) => s + Number(r.inserted_count || 0), 0);
      console.log(JSON.stringify({ ok: true, total_queued: total, by_table: rows }));
      process.exit(0);
    }
    if (cmd === "status") {
      const row = await getRow();
      console.log(JSON.stringify(row));
      process.exit(0);
    }
    console.error("usage: pair-cli.js {start <cloud_url>|poll|wait [seconds]|ping|mesh|sync|status}");
    process.exit(1);
  } catch (e) {
    console.error(`ERROR: ${e?.message || e}`);
    process.exit(1);
  } finally {
    await pool.end().catch(() => {});
  }
})();
