/**
 * fin-balance-import
 * Parses the legacy monthly "БАЛАНС" sheet (.xls/.xlsx) and upserts one row per
 * business date into fin_legacy_balance.
 *
 * The sheet stores figures in USD with a daily rate column; everything is
 * converted to TZS on import (project rule: report in TZS).
 *
 * POST multipart/form-data { file, casino_id } → { saved, skipped, month }
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Column indexes of the legacy layout (0-based, as produced by sheet_to_json header:1). */
const COL = {
  date: 0,
  rate: 2,
  casino: 3,
  cashDesk: 4,
  tables: 5,
  slots: 6,
  stadt: 7,
  bar: 8,
  cageCash: 9,
  collection: 10,
  chipDiff: 11,
  cashResult: 12,
  tipsTables: 13,
  tipsSlots: 14,
  officeCash: 15,
  officeTransfer: 16,
  officeIn: 17,
  officeOut: 18,
  cage2: 19,
  terminal: 20,
  feePct: 21,
  bankAccount: 22,
  bankExpenses: 23,
  creditDeposit: 24,
  expenses: 25,
  chips: 26,
};

const toIsoDate = (v: unknown): string | null => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[0];
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(url, serviceKey);
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userData.user.id);
    const allowed = new Set(["finance_manager", "general_manager", "boss", "super_admin"]);
    if (!(roles ?? []).some((r: any) => allowed.has(r.role))) return json({ error: "forbidden" }, 403);

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const casinoId = String(form.get("casino_id") ?? "");
    if (!file) return json({ error: "missing file" }, 400);
    if (!/^[0-9a-f-]{36}$/i.test(casinoId)) return json({ error: "invalid casino_id" }, 400);

    const buf = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "array", cellDates: true });

    // The balance sheet is the one whose name starts with "Баланс"/"Balance";
    // fall back to the first sheet.
    const sheetName =
      wb.SheetNames.find((n) => /^\s*(баланс|balance)/i.test(n)) ?? wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheetName], {
      header: 1, blankrows: false, defval: null,
    });

    const records: any[] = [];
    let skipped = 0;
    for (const r of rows) {
      const date = toIsoDate(r?.[COL.date]);
      if (!date) { skipped++; continue; }
      const rate = num(r[COL.rate]) || 0;
      const k = (i: number) => num(r[i]) * (rate || 1); // USD → TZS

      records.push({
        casino_id: casinoId,
        business_date: date,
        rate_usd: rate,
        casino_result: k(COL.casino),
        cash_desk_result: k(COL.cashDesk) || k(COL.cashResult),
        tables_result: k(COL.tables),
        slots_result: k(COL.slots),
        stadt_result: k(COL.stadt),
        bar_result: k(COL.bar),
        cage_cash: k(COL.cageCash),
        collection_bank: k(COL.collection),
        chip_difference: k(COL.chipDiff),
        tips_tables: k(COL.tipsTables),
        tips_slots: k(COL.tipsSlots),
        office_cash: k(COL.officeCash),
        office_transfer: k(COL.officeTransfer),
        office_in: k(COL.officeIn),
        office_out: k(COL.officeOut),
        cage2_cash: k(COL.cage2),
        bank_terminal: k(COL.terminal),
        bank_fee_pct: num(r[COL.terminal]) > 0 ? (num(r[COL.feePct]) / num(r[COL.terminal])) * 100 : 0,
        bank_account: k(COL.bankAccount),
        bank_expenses: k(COL.bankExpenses),
        credit_deposit: k(COL.creditDeposit),
        // "Расходы" on the balance sheet is already a USD figure per day
        expenses: k(COL.expenses),
        chips_float: num(r[COL.chips]),
        source: "import",
        source_file: file.name,
        created_by: userData.user.id,
      });
    }

    if (records.length === 0) return json({ error: "no dated rows found in the balance sheet" }, 400);

    const { error } = await admin
      .from("fin_legacy_balance")
      .upsert(records, { onConflict: "casino_id,business_date" });
    if (error) {
      console.error("upsert failed", error);
      return json({ error: error.message }, 400);
    }

    return json({ saved: records.length, skipped, sheet: sheetName });
  } catch (e) {
    console.error("fin-balance-import failed", e);
    return json({ error: (e as Error).message }, 400);
  }
});
