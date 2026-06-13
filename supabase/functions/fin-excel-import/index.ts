/**
 * fin-excel-import
 * Parses an uploaded Excel file (the JC Expenses report format) and proposes a
 * mapping against existing fin_categories. Returns parsed sections + auto-match
 * suggestions. The client confirms and applies via direct table writes.
 *
 * POST  multipart/form-data { file }
 *   → { sheets: [{ sheet_name, detected_casino_code, incomes, sections, totals }] }
 */
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const norm = (s: string) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (s: string) => new Set(norm(s).split(" ").filter(Boolean));

function jaccard(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

function bestMatch(name: string, cats: any[], aliases: Map<string, string>): { id: string; score: number; name: string; source: "alias" | "fuzzy" } | null {
  const aliasHit = aliases.get(norm(name));
  if (aliasHit) {
    const c = cats.find((x) => x.id === aliasHit);
    if (c) return { id: c.id, score: 1, name: c.name, source: "alias" };
  }
  let best = null as any;
  for (const c of cats) {
    const s = jaccard(name, c.name);
    if (!best || s > best.score) best = { id: c.id, score: s, name: c.name, source: "fuzzy" };
  }
  return best && best.score > 0.25 ? best : null;
}

function num(v: any): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function detectCasinoCode(sheetName: string): string {
  const s = sheetName.toLowerCase();
  if (s.includes(" a") || s.endsWith(" a") || /\ba\b/.test(s) || s.includes("arusha")) return "A";
  if (s.includes(" m") || /\bm\b/.test(s) || s.includes("mwanza")) return "M";
  if (s.includes(" d") || /\bd\b/.test(s) || s.includes("dodoma")) return "D";
  return "JC";
}

function parseSheet(ws: XLSX.WorkSheet, cats: any[], aliases: Map<string, string>) {
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: null });

  const incomes: Record<string, number> = { live_game: 0, slots: 0, other: 0, total: 0 };
  const sections: any[] = [];
  let currentSection: any = null;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    const label = String(r[6] || "").trim().toLowerCase();
    if (label === "live game") incomes.live_game = num(r[7]);
    else if (label === "slots") incomes.slots = num(r[7]);
    else if (label.startsWith("other income")) incomes.other = num(r[7]);
    else if (label.startsWith("total in tzs")) incomes.total = num(r[7]);

    const a = r[0] ? String(r[0]).trim() : "";
    const b = r[1] ? String(r[1]).trim() : "";

    if (a && b && /average.*year/i.test(b)) {
      currentSection = { group_label: a, rows: [] };
      sections.push(currentSection);
      continue;
    }
    if (!currentSection || !a) continue;
    if (a.toLowerCase() === "total") continue;
    if (a.toLowerCase().startsWith("total in")) continue;
    if (a.toLowerCase().startsWith("rate in casino")) continue;

    const planYearTzs = num(r[1]);
    const planYearUsd = num(r[2]);
    const planMonthTzs = num(r[3]);
    const planMonthUsd = num(r[4]);
    const actualTzs = num(r[6]);
    const actualUsd = num(r[7]);

    if (planYearTzs === 0 && planMonthTzs === 0 && actualTzs === 0 && actualUsd === 0 && planYearUsd === 0) continue;

    const match = bestMatch(a, cats, aliases);
    currentSection.rows.push({
      excel_name: a,
      plan_year_tzs: planYearTzs,
      plan_year_usd: planYearUsd,
      plan_month_tzs: planMonthTzs,
      plan_month_usd: planMonthUsd,
      actual_tzs: actualTzs,
      actual_usd: actualUsd,
      suggested_category_id: match?.id || null,
      suggested_category_name: match?.name || null,
      match_score: match?.score || 0,
      match_source: match?.source || null,
    });
  }

  return { incomes, sections };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth: require finance_manager / super_admin / manager
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(url, key);
    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", userData.user.id);
    const allowed = new Set(["finance_manager", "super_admin", "manager", "shift_manager"]);
    const ok = (roles ?? []).some((r: any) => allowed.has(r.role));
    if (!ok) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const { data: cats, error: catErr } = await admin
      .from("fin_categories")
      .select("id, group_code, group_name, name, is_income")
      .eq("is_active", true);
    if (catErr) throw catErr;

    const { data: aliasRows } = await admin
      .from("fin_category_aliases")
      .select("alias_norm, category_id");
    const aliases = new Map<string, string>();
    (aliasRows || []).forEach((r: any) => aliases.set(r.alias_norm, r.category_id));

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) throw new Error("missing file");

    const buf = new Uint8Array(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "array" });

    const sheets = wb.SheetNames.map((name) => {
      const parsed = parseSheet(wb.Sheets[name], cats || [], aliases);
      return {
        sheet_name: name,
        detected_casino_code: detectCasinoCode(name),
        ...parsed,
      };
    });

    return new Response(JSON.stringify({ sheets, categories: cats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
