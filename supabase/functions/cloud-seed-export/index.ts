/**
 * cloud-seed-export — initial data seed для свежего локального сервера.
 * ─────────────────────────────────────────────────────────────────────
 * Используется install.sh при первой установке on-prem сервера, чтобы
 * перенести ВСЕ данные конкретного казино (config + последние 90 дней
 * операционных таблиц) из Cloud в пустую локальную БД.
 *
 * GET /cloud-seed-export?casino_id=<uuid>&days=90
 *   Headers:
 *     x-service-key: <service_role JWT>   ← обязательно (write-protected)
 *
 *   Response: NDJSON-stream (Content-Type: application/x-ndjson)
 *     {"_meta":{"casino_id":"...","exported_at":"...","tables":[...]}}
 *     {"table":"casinos","row":{...}}
 *     {"table":"currencies","row":{...}}
 *     ...
 *     {"_done":true,"counts":{"casinos":1,"players":1234,...}}
 *
 * Безопасность: явная сверка переданного x-service-key с
 *   SUPABASE_SERVICE_ROLE_KEY. Это НЕ публичный endpoint — он отдаёт
 *   полные данные казино, поэтому ключ обязателен.
 *
 * Идемпотентность не нужна (стрим только GET, импортёр сам делает
 *   ON CONFLICT DO NOTHING).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verify as verifyJwt } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "x-service-key, x-seed-token, x-sync-secret, x-casino-id, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET") ?? serviceRoleKey;

// Порядок ВАЖЕН — соблюдаем FK-зависимости при импорте.
// "scope":
//   full     → строки таблицы для этого casino_id
//   single   → одна строка из casinos
//   global   → вся таблица (справочники, общие для сети)
//   by_user  → строки, где user_id ∈ users-of-this-casino
//              (profiles/user_roles/user_credentials)
const TABLES: Array<{ name: string; scope: "single" | "full" | "global" | "by_user" | "by_player"; sinceDays?: number; userIdCol?: string }> = [
  // 1. Справочники (нужны раньше FK)
  { name: "casinos", scope: "single" },

  // 1b. Глобальные справочники (общие для всей сети)
  { name: "tax_brackets", scope: "global" },
  { name: "payroll_paye_brackets", scope: "global" },
  { name: "role_module_defaults", scope: "global" },

  // 2. Конфиг этого казино (полностью)
  { name: "gaming_tables", scope: "full" },
  { name: "chip_color_settings", scope: "full" },
  { name: "chip_initial_baseline", scope: "full" },
  { name: "chip_baseline", scope: "full" },
  { name: "chip_inventory", scope: "full" },
  { name: "fin_categories", scope: "global" },
  { name: "fin_wallets", scope: "full" },
  { name: "fin_budget", scope: "full" },
  { name: "payroll_settings", scope: "full" },
  { name: "attendance_holidays", scope: "full" },

  // 3. Сотрудники
  // 3b. Employees (HR master list; legacy dealers/staff_members tables are no longer seeded)
  { name: "employees", scope: "full" },

  // 4. Игроки и карты
  { name: "players", scope: "full" },
  // player_cards и player_tags не имеют casino_id — фильтруем через player_id ∈ players_of_casino
  { name: "player_cards", scope: "by_player" },
  { name: "player_groups", scope: "full" },
  { name: "group_members", scope: "by_player" },
  { name: "player_tags", scope: "by_player" },
  { name: "player_notes", scope: "full" },
  // player_economy / player_session_stats / player_session_drops are VIEWs — never seed

  // 5. Пользователи системы — auth.users шлются отдельным потоком (см. ниже)
  //    после обычных таблиц. Здесь — связанные с ними public-таблицы.
  { name: "user_casino_access", scope: "full" },
  { name: "user_module_permissions", scope: "by_user", userIdCol: "user_id" },
  { name: "profiles",         scope: "by_user", userIdCol: "user_id" },
  { name: "user_roles",       scope: "by_user", userIdCol: "user_id" },
  { name: "user_credentials", scope: "by_user", userIdCol: "user_id" },

  // 6. Операционные данные (последние N дней — задаётся ?days=N, default=90;
  //    Clone из Cloud вызывает days=all → берёт всё)
  { name: "shifts", scope: "full", sinceDays: 90 },
  { name: "transactions", scope: "full", sinceDays: 90 },
  { name: "casino_visits", scope: "full", sinceDays: 90 },
  { name: "breaklist", scope: "full", sinceDays: 90 },
  { name: "pit_rota", scope: "full", sinceDays: 90 },
  { name: "staff_rota", scope: "full", sinceDays: 90 },
  { name: "dealer_attendance", scope: "full", sinceDays: 90 },
  { name: "staff_attendance", scope: "full", sinceDays: 90 },
  { name: "attendance_hours", scope: "full", sinceDays: 90 },
  { name: "cage_transfers", scope: "full", sinceDays: 90 },
  { name: "expenses", scope: "full", sinceDays: 90 },
  { name: "fin_wallet_tx", scope: "full", sinceDays: 90 },
  { name: "fin_day_closing", scope: "full", sinceDays: 90 },
  { name: "fin_money_change", scope: "full", sinceDays: 90 },
  { name: "fin_audit_log", scope: "full", sinceDays: 365 },
  { name: "chip_emissions", scope: "full", sinceDays: 90 },
  { name: "chip_snapshots", scope: "full", sinceDays: 90 },
  { name: "table_tracker", scope: "full", sinceDays: 90 },
  { name: "table_daily_results", scope: "full", sinceDays: 90 },
  { name: "business_day_closures", scope: "full", sinceDays: 90 },
  { name: "cash_counts", scope: "full", sinceDays: 90 },
  { name: "cash_count_snapshots", scope: "full", sinceDays: 90 },
  { name: "cashless_transactions", scope: "full", sinceDays: 90 },
  { name: "bank_checks", scope: "full", sinceDays: 90 },
  { name: "cctv_observations", scope: "full", sinceDays: 90 },
  { name: "chip_transfers", scope: "full", sinceDays: 90 },
  { name: "player_chip_adjustments", scope: "full", sinceDays: 90 },
  { name: "player_position_history", scope: "full", sinceDays: 90 },
  { name: "client_sessions", scope: "full", sinceDays: 90 },
  { name: "staff_warnings", scope: "full", sinceDays: 365 },
  { name: "transaction_cancellations", scope: "full", sinceDays: 365 },
  { name: "player_daily_avg_bets", scope: "full", sinceDays: 365 },
  { name: "player_daily_avg_bet_changes", scope: "full", sinceDays: 365 },
  { name: "incidents", scope: "full", sinceDays: 90 },
  { name: "payroll_periods", scope: "full", sinceDays: 365 },
  { name: "payroll_entries", scope: "full", sinceDays: 365 },
  { name: "monthly_tips_pools", scope: "full", sinceDays: 365 },
  { name: "monthly_tips_entries", scope: "full", sinceDays: 365 },
  { name: "weekly_bonus_pools", scope: "full", sinceDays: 365 },
  { name: "weekly_bonus_entries", scope: "full", sinceDays: 365 },

  // 7. Audit & log tables (Clone берёт все строки в режиме days=all)
  { name: "activity_logs", scope: "full", sinceDays: 90 },
  { name: "activity_logs_archive", scope: "full", sinceDays: 365 },
  { name: "breaklist_logs", scope: "full", sinceDays: 90 },
  { name: "breaklist_logs_archive", scope: "full", sinceDays: 365 },
  
  { name: "casino_visits_archive", scope: "full", sinceDays: 365 },
  { name: "client_sessions_archive", scope: "full", sinceDays: 365 },
  { name: "incidents_audit", scope: "full", sinceDays: 365 },
  { name: "payroll_audit_log", scope: "full", sinceDays: 365 },
];

const PAGE_SIZE = 1000;

const tableNames = new Set(TABLES.map((t) => t.name));
const parseTableList = (value: string | null) =>
  new Set((value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean));

const ORDER_COLUMNS: Record<string, string> = {
  role_module_defaults: "module_key",
  fin_categories: "sort_order",
};

const orderColumnFor = (tableName: string) => ORDER_COLUMNS[tableName] ?? "id";

const needsUserIds = (tables: typeof TABLES) => tables.some((t) => t.scope === "by_user") || tables.length === 0;

// Поле даты, по которому фильтруем "последние N дней" для каждой таблицы.
const DATE_COLUMN: Record<string, string> = {
  shifts: "created_at",
  transactions: "created_at",
  casino_visits: "created_at",
  breaklist: "date",
  pit_rota: "date",
  staff_rota: "date",
  dealer_attendance: "date",
  staff_attendance: "date",
  cage_transfers: "created_at",
  expenses: "business_date",
  fin_wallet_tx: "created_at",
  fin_day_closing: "business_date",
  fin_money_change: "business_date",
  fin_audit_log: "created_at",
  chip_emissions: "created_at",
  chip_snapshots: "created_at",
  // miss_chips removed
  table_tracker: "business_date",
  table_daily_results: "business_date",
  business_day_closures: "business_date",
  cash_counts: "business_date",
  cash_count_snapshots: "created_at",
  cashless_transactions: "created_at",
  bank_checks: "created_at",
  cctv_observations: "created_at",
  chip_transfers: "created_at",
  player_chip_adjustments: "created_at",
  player_position_history: "created_at",
  client_sessions: "created_at",
  staff_warnings: "created_at",
  transaction_cancellations: "cancelled_at",
  player_daily_avg_bets: "business_date",
  player_daily_avg_bet_changes: "changed_at",
  incidents: "created_at",
  attendance_hours: "business_date",
  payroll_periods: "starts_on",
  payroll_entries: "created_at",
  monthly_tips_pools: "period_start",
  monthly_tips_entries: "created_at",
  weekly_bonus_pools: "period_start",
  weekly_bonus_entries: "created_at",
  
  activity_logs: "created_at",
  activity_logs_archive: "created_at",
  breaklist_logs: "created_at",
  breaklist_logs_archive: "created_at",
  
  casino_visits_archive: "created_at",
  client_sessions_archive: "created_at",
  incidents_audit: "created_at",
  payroll_audit_log: "created_at",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: corsHeaders });
  }

  // — auth: x-service-key OR x-seed-token (legacy) OR x-sync-secret + x-casino-id —
  const providedKey = req.headers.get("x-service-key") ?? "";
  const seedTokenHdr = req.headers.get("x-seed-token") ?? "";
  const syncSecret = req.headers.get("x-sync-secret") ?? "";
  const syncCasino = req.headers.get("x-casino-id") ?? "";
  let tokenCasinoId: string | null = null;

  const adminPre = createClient(supabaseUrl, serviceRoleKey);

  if (syncSecret && syncCasino) {
    const { data } = await adminPre
      .from("pending_server_registrations")
      .select("approved_casino_id")
      .eq("approved_casino_id", syncCasino)
      .eq("sync_secret", syncSecret)
      .in("status", ["approved", "consumed"])
      .maybeSingle();
    if (data) {
      tokenCasinoId = data.approved_casino_id as string;
      const { data: existingPeer } = await adminPre
        .from("peer_links")
        .select("id")
        .eq("sync_secret", syncSecret)
        .maybeSingle();
      if (!existingPeer) {
        await adminPre.from("peer_links").insert({
          peer_url: `pending://${syncCasino}`,
          display_name: "Local server",
          sync_secret: syncSecret,
          status: "pending_outbound",
        });
      }
    } else {
      const { data: peer } = await adminPre
        .from("peer_links")
        .select("id, casino_id")
        .eq("sync_secret", syncSecret)
        .in("status", ["pending_outbound", "pending_inbound", "active", "paused"])
        .maybeSingle();
      if (!peer) {
        return new Response(JSON.stringify({ error: "invalid sync credentials" }), { status: 401, headers: corsHeaders });
      }
      // Server-owned casino_id; reject if peer is not bound or header mismatches
      if (!peer.casino_id || peer.casino_id !== syncCasino) {
        return new Response(JSON.stringify({ error: "peer not bound to this casino" }), { status: 403, headers: corsHeaders });
      }
      tokenCasinoId = peer.casino_id;
    }
  } else if (seedTokenHdr) {
    try {
      const key = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(jwtSecret),
        { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
      );
      const payload = await verifyJwt(seedTokenHdr, key) as { kind?: string; casino_id?: string };
      if (payload.kind !== "seed" || !payload.casino_id) {
        return new Response(JSON.stringify({ error: "invalid seed token" }), { status: 401, headers: corsHeaders });
      }
      tokenCasinoId = payload.casino_id;
    } catch {
      return new Response(JSON.stringify({ error: "invalid seed token" }), { status: 401, headers: corsHeaders });
    }
  } else if (!providedKey || providedKey !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: "auth required (x-service-key, x-seed-token or x-sync-secret)" }), { status: 401, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const casinoId = tokenCasinoId ?? url.searchParams.get("casino_id") ?? "";
  const daysParam = url.searchParams.get("days") ?? "90";
  const includeAuth = url.searchParams.get("auth") !== "0";
  const onlyTables = parseTableList(url.searchParams.get("tables"));
  const excludedTables = parseTableList(url.searchParams.get("exclude"));
  const offsetParam = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const maxRowsParam = url.searchParams.get("max_rows");
  const maxRows = maxRowsParam ? Math.max(1, Math.min(10000, parseInt(maxRowsParam, 10) || PAGE_SIZE)) : null;
  const unknownTables = [...onlyTables, ...excludedTables].filter((name) => !tableNames.has(name));
  if (unknownTables.length > 0) {
    return new Response(JSON.stringify({ error: `unknown table(s): ${unknownTables.join(",")}` }), { status: 400, headers: corsHeaders });
  }
  const selectedTables = TABLES.filter((t) =>
    (onlyTables.size === 0 || onlyTables.has(t.name)) && !excludedTables.has(t.name)
  );
  const windowedSingleTable = selectedTables.length === 1 && maxRows !== null;
  if (selectedTables.length === 0) {
    return new Response(JSON.stringify({ error: "no tables selected" }), { status: 400, headers: corsHeaders });
  }
  const allHistory = daysParam === "all";
  const days = allHistory ? 0 : Math.max(1, Math.min(3650, parseInt(daysParam, 10)));
  if (!/^[0-9a-f-]{36}$/i.test(casinoId)) {
    return new Response(JSON.stringify({ error: "casino_id required (uuid)" }), { status: 400, headers: corsHeaders });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const sinceIso = allHistory ? null : new Date(Date.now() - days * 86400_000).toISOString();
  const counts: Record<string, number> = {};

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const writeLine = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));

      writeLine({
        _meta: {
          casino_id: casinoId,
          exported_at: new Date().toISOString(),
          since_days: allHistory ? "all" : days,
          tables: selectedTables.map((t) => t.name),
        },
      });

      try {
        // ── Step 1: список user_id, относящихся к этому казино ──
        //    (используется для scope: by_user — profiles / user_roles / user_credentials).
        let userIds: string[] = [];
        if (needsUserIds(selectedTables)) {
          const { data: uca } = await admin
            .from("user_casino_access")
            .select("user_id")
            .eq("casino_id", casinoId);
          const { data: prof } = await admin
            .from("profiles")
            .select("user_id")
            .eq("casino_id", casinoId);
          const { data: superRoles } = await admin
            .from("user_roles")
            .select("user_id")
            .eq("role", "super_admin");
          const set = new Set<string>();
          (uca ?? []).forEach((r: any) => r.user_id && set.add(r.user_id));
          (prof ?? []).forEach((r: any) => r.user_id && set.add(r.user_id));
          (superRoles ?? []).forEach((r: any) => r.user_id && set.add(r.user_id));
          userIds = Array.from(set);
        }

        // ── Step 2: auth.users — отдельным потоком, через SECURITY DEFINER RPC.
        //    Сначала чтобы FK profiles/user_roles/user_credentials → auth.users(id)
        //    выполнялись при импорте.
        if (includeAuth) try {
          const { data: authRows, error: authErr } = await admin.rpc(
            "seed_export_auth_users",
            { p_casino_id: casinoId },
          );
          if (authErr) {
            writeLine({ _error: { table: "auth.users", msg: authErr.message } });
          } else {
            counts["auth.users"] = 0;
            for (const r of (authRows as any[] ?? [])) {
              writeLine({ auth_user: r });
              counts["auth.users"]++;
            }
          }
        } catch (e) {
          writeLine({ _error: { table: "auth.users", msg: String((e as Error)?.message ?? e) } });
        }

        for (const t of selectedTables) {
          counts[t.name] = 0;
          let from = windowedSingleTable ? offsetParam : 0;
          const stopBefore = windowedSingleTable && maxRows !== null ? offsetParam + maxRows : Number.POSITIVE_INFINITY;

          // single — одна строка из casinos
          if (t.scope === "single") {
            const { data, error } = await admin.from(t.name).select("*").eq("id", casinoId).maybeSingle();
            if (error) { writeLine({ _error: { table: t.name, msg: error.message } }); continue; }
            if (data) { writeLine({ table: t.name, row: data }); counts[t.name] = 1; }
            continue;
          }

          // by_user — строки, где user_id ∈ userIds
          if (t.scope === "by_user") {
            if (userIds.length === 0) continue;
            const col = t.userIdCol ?? "user_id";
            // chunk запросов по 500 id, чтобы не упереться в лимит URL
            for (let i = 0; i < userIds.length; i += 500) {
              const slice = userIds.slice(i, i + 500);
              const { data, error } = await admin
                .from(t.name).select("*").in(col, slice).order(orderColumnFor(t.name), { ascending: true });
              if (error) {
                writeLine({ _error: { table: t.name, msg: error.message } });
                break;
              }
              for (const row of data ?? []) writeLine({ table: t.name, row });
              counts[t.name] += (data ?? []).length;
            }
            continue;
          }

          // by_player — строки, где player_id ∈ players_of_casino (для таблиц без casino_id)
          if (t.scope === "by_player") {
            // соберём список player ids этого казино один раз
            const playerIds: string[] = [];
            {
              let pf = 0;
              while (true) {
                const { data, error } = await admin
                  .from("players").select("id").eq("casino_id", casinoId)
                  .order("id", { ascending: true })
                  .range(pf, pf + PAGE_SIZE - 1);
                if (error) { writeLine({ _error: { table: t.name, msg: `players lookup: ${error.message}` } }); break; }
                if (!data || data.length === 0) break;
                for (const r of data) playerIds.push((r as any).id);
                if (data.length < PAGE_SIZE) break;
                pf += PAGE_SIZE;
              }
            }
            if (playerIds.length === 0) continue;
            for (let i = 0; i < playerIds.length; i += 100) {
              const slice = playerIds.slice(i, i + 100);
              const { data, error } = await admin
                .from(t.name).select("*").in("player_id", slice).order(orderColumnFor(t.name), { ascending: true });
              if (error) {
                writeLine({ _error: { table: t.name, msg: error.message } });
                break;
              }
              for (const row of data ?? []) writeLine({ table: t.name, row });
              counts[t.name] += (data ?? []).length;
            }
            continue;
          }

          while (true) {
            if (from >= stopBefore) break;
            const to = Math.min(from + PAGE_SIZE - 1, stopBefore - 1);
            let q = admin.from(t.name).select("*").order(orderColumnFor(t.name), { ascending: true }).range(from, to);
            if (t.scope === "full") q = q.eq("casino_id", casinoId);
            if (!allHistory && t.sinceDays && DATE_COLUMN[t.name] && sinceIso) {
              q = q.gte(DATE_COLUMN[t.name], sinceIso);
            }
            const { data, error } = await q;
            if (error) {
              writeLine({ _error: { table: t.name, msg: error.message } });
              break;
            }
            if (!data || data.length === 0) break;
            for (const row of data) writeLine({ table: t.name, row });
            counts[t.name] += data.length;
            if (data.length < PAGE_SIZE || from + data.length >= stopBefore) break;
            from += PAGE_SIZE;
          }
        }
        writeLine({ _done: true, counts });
        if (seedTokenHdr) {
          await admin.from("pending_server_registrations")
            .update({ status: "consumed", consumed_at: new Date().toISOString() })
            .eq("seed_token", seedTokenHdr);
        }
      } catch (e) {
        writeLine({ _fatal: String((e as Error)?.message ?? e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });
});
