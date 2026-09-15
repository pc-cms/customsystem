/**
 * ace-player-ingest
 * Inbound API for the future ACE player / EGM / jackpot collector jobs.
 *
 * Auth is identical to `ace-finance-ingest`: POST JSON + header `x-ace-key`,
 * the raw key is never stored — its SHA-256 is compared against
 * public.ace_ingest_keys.key_sha256 for the given location_code, and the
 * casino is resolved from that row (clients can never pick a casino).
 *
 * Payload groups (one `kind` per request, all idempotent):
 *   heartbeat   — touches the ingest key's last_seen_at
 *   players     — ACE identities (+ cards) for known/auto-created players
 *   transactions— raw ACE player transactions (unique per casino+source_key)
 *   daily       — identity x EGM x business-day aggregates (+ rollup)
 *   egm_status  — current EGM state snapshot
 *   report      — raw EGM / Jackpot report capture
 *   jackpots    — jackpot wins
 *
 * Data rules: missing values stay NULL (never coerced to 0), Drop = IN,
 * Handle is only stored when ACE sends it, Slot Result is never stored
 * (it is derived as IN - OUT at read time).
 *
 * NOTE: the collector job that will call this endpoint is intentionally NOT
 * enabled yet — real ACE field names arrive with the Linux probe, so unknown
 * columns are preserved verbatim in the `raw_data` jsonb of every table.
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
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** null-preserving numeric parse — missing stays missing. */
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};
const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, 200) : null;
};
const day = (v: unknown): string | null => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

const KINDS = ["heartbeat", "players", "transactions", "daily", "egm_status", "report", "jackpots"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const key = req.headers.get("x-ace-key") ?? "";
  if (!key || key.length < 16) return json({ ok: false, error: "unauthorized" }, 401);
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
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

  const location_code = String(body.location_code ?? "").trim().toLowerCase();
  if (!location_code || !/^[a-z0-9_-]{1,64}$/.test(location_code)) {
    return json({ ok: false, error: "validation_failed", fields: ["location_code"] }, 400);
  }
  const kind = String(body.kind ?? "").trim();
  if (!KINDS.includes(kind)) {
    return json({ ok: false, error: "validation_failed", fields: ["kind"] }, 400);
  }
  const items = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
  if (items.length > 5000) return json({ ok: false, error: "too_many_items" }, 400);

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
    console.error("ace-player-ingest: credential lookup failed", credErr.message);
    return json({ ok: false, error: "server_error" }, 500);
  }
  if (!cred || !cred.is_active) return json({ ok: false, error: "unauthorized" }, 401);
  const provided = await sha256Hex(key);
  if (!safeEqual(provided, String(cred.key_sha256).toLowerCase())) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  await admin.from("ace_ingest_keys").update({ last_seen_at: new Date().toISOString() }).eq("id", cred.id);

  if (kind === "heartbeat") return json({ ok: true, kind, location_code });

  const casino_id = cred.casino_id as string | null;
  if (!casino_id) {
    return json({ ok: false, error: "location_not_linked_to_casino" }, 400);
  }

  /** Resolve (casino, ace_player_id) -> identity id. Never auto-creates players. */
  const identityCache = new Map<string, string | null>();
  async function identityFor(acePlayerId: string | null): Promise<string | null> {
    if (!acePlayerId) return null;
    if (identityCache.has(acePlayerId)) return identityCache.get(acePlayerId)!;
    const { data } = await admin
      .from("player_ace_identities")
      .select("id")
      .eq("casino_id", casino_id)
      .eq("ace_player_id", acePlayerId)
      .maybeSingle();
    const id = data?.id ?? null;
    identityCache.set(acePlayerId, id);
    return id;
  }

  try {
    if (kind === "players") {
      // Known identity -> update ACE-owned metadata + cards only (CMS player
      // fields are never touched, even after a merge/reassignment).
      // Unknown (casino_id, ace_player_id) -> auto-create an admin-only CMS
      // player named "<ace name> (ACE)" and link a new auto-created identity.
      let updated = 0;
      let created = 0;
      for (const it of items) {
        const ace_player_id = str(it.ace_player_id);
        if (!ace_player_id) continue;
        const nowIso = new Date().toISOString();
        const ace_name = str(it.ace_name);
        let identity_id = await identityFor(ace_player_id);
        let identity_player_id: string | null = null;

        if (!identity_id) {
          // Auto-create the CMS player, then the identity. Idempotency is
          // guaranteed by UNIQUE(casino_id, ace_player_id): on a duplicate
          // (retry/race) we drop the extra player and reuse the winner.
          const { data: newPlayer, error: pErr } = await admin
            .from("players")
            .insert({
              casino_id,
              first_name: ace_name ?? `ACE ${ace_player_id}`,
              last_name: "(ACE)",
              player_type: "slots",
              is_ace_auto: true,
            })
            .select("id")
            .single();
          if (pErr) throw pErr;

          const { data: newIdent, error: iErr } = await admin
            .from("player_ace_identities")
            .insert({
              player_id: newPlayer.id,
              casino_id,
              ace_player_id,
              ace_name,
              is_auto_created: true,
              first_seen_at: str(it.first_seen_at) ?? nowIso,
              last_seen_at: str(it.last_seen_at) ?? nowIso,
            })
            .select("id, player_id")
            .maybeSingle();

          if (iErr) {
            // Duplicate identity created concurrently — roll the orphan back.
            await admin.from("players").delete().eq("id", newPlayer.id);
            const { data: existing } = await admin
              .from("player_ace_identities")
              .select("id, player_id")
              .eq("casino_id", casino_id)
              .eq("ace_player_id", ace_player_id)
              .maybeSingle();
            if (!existing) throw iErr;
            identity_id = existing.id;
            identity_player_id = existing.player_id;
          } else {
            identity_id = newIdent!.id;
            identity_player_id = newIdent!.player_id;
            created++;
          }
          identityCache.set(ace_player_id, identity_id);
        }

        if (!identity_id) continue;

        if (identity_player_id === null) {
          const { data: row } = await admin
            .from("player_ace_identities")
            .select("player_id")
            .eq("id", identity_id)
            .maybeSingle();
          identity_player_id = row?.player_id ?? null;
          await admin
            .from("player_ace_identities")
            .update({
              ace_name: ace_name ?? undefined,
              first_seen_at: str(it.first_seen_at) ?? undefined,
              last_seen_at: str(it.last_seen_at) ?? nowIso,
            })
            .eq("id", identity_id);
          updated++;
        }

        const cards = Array.isArray(it.cards) ? (it.cards as unknown[]) : [];
        for (const c of cards) {
          const card_number = typeof c === "string" ? str(c) : str((c as Record<string, unknown>)?.card_number);
          if (!card_number) continue;
          // insert-once (keeps the original first_seen_at on retries),
          // then refresh the ACE-owned last_seen_at.
          await admin.from("player_ace_cards").upsert(
            {
              identity_id,
              player_id: identity_player_id,
              casino_id,
              card_number,
              first_seen_at: nowIso,
              last_seen_at: nowIso,
            },
            { onConflict: "identity_id,card_number", ignoreDuplicates: true },
          );
          await admin
            .from("player_ace_cards")
            .update({ last_seen_at: nowIso, player_id: identity_player_id })
            .eq("identity_id", identity_id)
            .eq("card_number", card_number);
        }
      }
      return json({ ok: true, kind, updated, created });
    }


    if (kind === "transactions") {
      const rows = [];
      for (const it of items) {
        const source_key = str(it.source_key);
        const business_date = day(it.business_date);
        const tx_type = str(it.tx_type);
        if (!source_key || !business_date || !tx_type) continue;
        const ace_player_id = str(it.ace_player_id);
        rows.push({
          casino_id,
          source_key,
          business_date,
          tx_type,
          ace_player_id,
          identity_id: await identityFor(ace_player_id),
          egm_code: str(it.egm_code),
          amount: num(it.amount),
          occurred_at: str(it.occurred_at),
          raw_data: (it.raw_data ?? it) as unknown,
        });
      }
      if (rows.length) {
        const { error } = await admin
          .from("ace_player_transactions")
          .upsert(rows, { onConflict: "casino_id,source_key", ignoreDuplicates: true });
        if (error) throw error;
      }
      return json({ ok: true, kind, received: rows.length });
    }

    if (kind === "daily") {
      let egm = 0;
      let roll = 0;
      for (const it of items) {
        const business_date = day(it.business_date);
        const identity_id = await identityFor(str(it.ace_player_id));
        if (!business_date || !identity_id) continue;
        const base = {
          identity_id,
          casino_id,
          business_date,
          in_amount: num(it.in_amount),
          out_amount: num(it.out_amount),
          // Canonical rule: Slot Drop = IN, always. Any source-provided
          // drop field stays untouched in raw_data for diagnostics only.
          drop_amount: num(it.in_amount),
          handle_amount: num(it.handle_amount), // never derived from drop
          games: int(it.games),
          first_play_at: str(it.first_play_at),
          last_play_at: str(it.last_play_at),
          is_final: it.is_final === true,
          raw_data: (it.raw_data ?? it) as unknown,
        };
        const egm_code = str(it.egm_code);
        if (egm_code) {
          const { error } = await admin
            .from("ace_player_egm_daily")
            .upsert({ ...base, egm_code }, { onConflict: "identity_id,egm_code,business_date" });
          if (error) throw error;
          egm++;
        } else {
          const { error } = await admin
            .from("ace_player_daily")
            .upsert({ ...base, egm_count: int(it.egm_count) }, { onConflict: "identity_id,business_date" });
          if (error) throw error;
          roll++;
        }
      }
      return json({ ok: true, kind, egm_rows: egm, daily_rows: roll });
    }

    if (kind === "egm_status") {
      const rows = [];
      for (const it of items) {
        const egm_code = str(it.egm_code);
        if (!egm_code) continue;
        const ace_player_id = str(it.ace_player_id);
        rows.push({
          casino_id,
          egm_code,
          position: str(it.position),
          state: str(it.state),
          ace_player_id,
          identity_id: await identityFor(ace_player_id),
          active_credit: num(it.active_credit),
          observed_at: str(it.observed_at) ?? new Date().toISOString(),
          raw_data: (it.raw_data ?? it) as unknown,
        });
      }
      if (rows.length) {
        const { error } = await admin
          .from("ace_egm_current")
          .upsert(rows, { onConflict: "casino_id,egm_code" });
        if (error) throw error;
      }
      return json({ ok: true, kind, received: rows.length });
    }

    if (kind === "jackpots") {
      const rows = [];
      for (const it of items) {
        const business_date = day(it.business_date);
        if (!business_date) continue;
        const ace_player_id = str(it.ace_player_id);
        rows.push({
          casino_id,
          business_date,
          ace_player_id,
          identity_id: await identityFor(ace_player_id),
          occurred_at: str(it.occurred_at),
          jackpot_name: str(it.jackpot_name),
          amount: num(it.amount),
          egm_code: str(it.egm_code),
          source_key: str(it.source_key) ?? `${business_date}|${str(it.egm_code) ?? ""}|${str(it.occurred_at) ?? ""}`,
          raw_data: (it.raw_data ?? it) as unknown,
        });
      }
      if (rows.length) {
        const { error } = await admin
          .from("ace_jackpot_wins")
          .upsert(rows, { onConflict: "casino_id,source_key", ignoreDuplicates: true });
        if (error) throw error;
      }
      return json({ ok: true, kind, received: rows.length });
    }

    // kind === "report"
    const reportType = String(body.report_type ?? "").trim();
    if (reportType !== "egm" && reportType !== "jackpot") {
      return json({ ok: false, error: "validation_failed", fields: ["report_type"] }, 400);
    }
    const source_key = str(body.source_key);
    if (!source_key) return json({ ok: false, error: "validation_failed", fields: ["source_key"] }, 400);
    const table = reportType === "egm" ? "ace_egm_reports" : "ace_jackpot_reports";
    const { error } = await admin.from(table).upsert(
      {
        casino_id,
        source_key,
        business_date: day(body.business_date),
        period_from: day(body.period_from),
        period_to: day(body.period_to),
        period_label: str(body.period_label),
        rows_data: items.length ? items : null,
        raw_data: (body.raw_data ?? null) as unknown,
        captured_at: new Date().toISOString(),
      },
      { onConflict: "casino_id,source_key" },
    );
    if (error) throw error;
    return json({ ok: true, kind, report_type: reportType, rows: items.length });
  } catch (e) {
    console.error("ace-player-ingest: write failed", (e as Error).message);
    return json({ ok: false, error: "write_failed", retryable: true }, 500);
  }
});
