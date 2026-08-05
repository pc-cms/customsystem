/**
 * Excel Import — upload the historical "JC Expenses report" Excel,
 * the edge function parses it and proposes a mapping against fin_categories.
 * FM/super_admin reviews → Apply writes fin_budget rows for selected year
 * (annual planned spread evenly across 12 months).
 */
import { invalidateFinance } from "@/lib/fin-invalidate";
import { useState, useMemo } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { YearSelect } from "@/components/ui/year-select";

import { supabase } from "@/integrations/supabase/client";
import { useFinExcelImports, useFinCategories } from "@/hooks/use-fin";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fmtDateTime } from "@/lib/format-date";
import { formatNumberSpaces } from "@/lib/currency";
import { toast } from "sonner";

type Row = {
  excel_name: string;
  plan_year_tzs: number;
  plan_year_usd: number;
  plan_month_tzs: number;
  plan_month_usd: number;
  actual_tzs: number;
  actual_usd: number;
  suggested_category_id: string | null;
  suggested_category_name: string | null;
  match_score: number;
  category_id?: string | null;
};

type Sheet = {
  sheet_name: string;
  detected_casino_code: "A" | "M" | "D" | "JC";
  incomes: { live_game: number; slots: number; other: number; total: number };
  sections: { group_label: string; rows: Row[] }[];
};

const CASINO_CODE_TO_NAME: Record<string, string> = { A: "Arusha", M: "Mwanza", D: "Dodoma" };

export default function FinancesExcelImportPage() {
  const qc = useQueryClient();
  const { data: imports = [] } = useFinExcelImports();
  const { data: cats = [] } = useFinCategories();
  const { data: casinos = [] } = useQuery({
    queryKey: ["casinos-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("casinos").select("id, name").order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  // sheet_name → casino_id
  const [casinoBySheet, setCasinoBySheet] = useState<Record<string, string>>({});
  // Diff preview: existing fin_budget rows keyed by `${casino}|${cat}|${ccy}`
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data, error } = await supabase.functions.invoke("fin-excel-import", { body: fd });
      if (error) throw error;
      const sh: Sheet[] = data.sheets || [];
      sh.forEach((s) => s.sections.forEach((sec) => sec.rows.forEach((r) => (r.category_id = r.suggested_category_id))));
      setSheets(sh);
      const m: Record<string, string> = {};
      sh.forEach((s) => {
        const name = CASINO_CODE_TO_NAME[s.detected_casino_code];
        const c = casinos.find((x: any) => x.name.toLowerCase().includes((name || "").toLowerCase()));
        if (c) m[s.sheet_name] = c.id;
      });
      setCasinoBySheet(m);
      // Fetch existing budget rows for diff
      const casinoIds = Array.from(new Set(Object.values(m))).filter(Boolean);
      if (casinoIds.length) {
        const { data: existing } = await supabase
          .from("fin_budget")
          .select("casino_id, category_id, currency")
          .eq("year", year)
          .in("casino_id", casinoIds);
        const keys = new Set<string>();
        (existing || []).forEach((r: any) => keys.add(`${r.casino_id}|${r.category_id}|${r.currency}`));
        setExistingKeys(keys);
      } else {
        setExistingKeys(new Set());
      }
      toast.success(`Parsed ${sh.length} sheet(s)`);
    } catch (e: any) {
      toast.error(e.message || "Parse failed");
    } finally {
      setParsing(false);
    }
  };

  // Diff stats per row
  const rowStatus = (sheetName: string, row: Row): "new" | "update" | "skip" => {
    if (!row.category_id) return "skip";
    const casinoId = casinoBySheet[sheetName];
    if (!casinoId) return "skip";
    const tzs = row.plan_year_tzs || row.plan_month_tzs * 12;
    const usd = row.plan_year_usd || row.plan_month_usd * 12;
    const hasTzs = tzs > 0 && existingKeys.has(`${casinoId}|${row.category_id}|TZS`);
    const hasUsd = usd > 0 && existingKeys.has(`${casinoId}|${row.category_id}|USD`);
    return (hasTzs || hasUsd) ? "update" : "new";
  };

  const apply = useMutation({
    mutationFn: async () => {
      let total = 0;
      // Collect aliases (excel_name → category_id) confirmed by user
      const aliasMap = new Map<string, { alias_original: string; category_id: string }>();
      for (const sheet of sheets) {
        const casinoId = casinoBySheet[sheet.sheet_name];
        const rowsToInsert: any[] = [];
        sheet.sections.forEach((sec) => {
          sec.rows.forEach((r) => {
            if (!r.category_id) return;
            const aliasNorm = r.excel_name.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
            if (aliasNorm) aliasMap.set(aliasNorm, { alias_original: r.excel_name, category_id: r.category_id });
            if (!casinoId) return; // skip JC / unmapped sheets for budget rows
            const annualTzs = r.plan_year_tzs || (r.plan_month_tzs * 12);
            const annualUsd = r.plan_year_usd || (r.plan_month_usd * 12);
            const monthlyTzs = annualTzs / 12;
            const monthlyUsd = annualUsd / 12;
            for (let m = 1; m <= 12; m++) {
              if (monthlyTzs > 0) rowsToInsert.push({
                casino_id: casinoId, year, month: m, category_id: r.category_id,
                currency: "TZS", planned_amount: Math.round(monthlyTzs * 100) / 100,
              });
              if (monthlyUsd > 0) rowsToInsert.push({
                casino_id: casinoId, year, month: m, category_id: r.category_id,
                currency: "USD", planned_amount: Math.round(monthlyUsd * 100) / 100,
              });
            }
          });
        });
        if (rowsToInsert.length) {
          const { error } = await supabase
            .from("fin_budget")
            .upsert(rowsToInsert, { onConflict: "casino_id,year,month,category_id,currency" });
          if (error) throw error;
          total += rowsToInsert.length;
        }
      }
      // Persist learned aliases
      if (aliasMap.size) {
        const aliasRows = Array.from(aliasMap.entries()).map(([alias_norm, v]) => ({
          alias_norm, alias_original: v.alias_original, category_id: v.category_id,
        }));
        await (supabase as any).from("fin_category_aliases").upsert(aliasRows, { onConflict: "alias_norm" });
      }
      return total;
    },
    onSuccess: (n) => {
      toast.success(`Wrote ${n} budget rows · aliases saved`);
      invalidateFinance(qc);
      setSheets([]);
      setFile(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const ready = sheets.length > 0 && Object.values(casinoBySheet).some(Boolean);

  return (
    <PageShell>
      <PageHeader icon={Upload} title="Excel Import" subtitle="Parse historical JC Expenses report → fin_budget">
        <YearSelect value={year} onChange={setYear} />
      </PageHeader>

      <PageSection title="1 · Upload Excel">
        <div className="flex items-center gap-3">
          <Input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} className="max-w-md" />
          <Button onClick={handleParse} disabled={!file || parsing}>
            {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Parse
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Format: 4 sheets (JC consolidated + A/M/D branches). Categories auto-mapped by name similarity.</p>
      </PageSection>

      {sheets.map((sheet) => (
        <PageSection
          key={sheet.sheet_name}
          title={sheet.sheet_name}
          titleRight={
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Detected: {sheet.detected_casino_code}</span>
              <Select
                value={casinoBySheet[sheet.sheet_name] || "skip"}
                onValueChange={(v) => setCasinoBySheet((m) => ({ ...m, [sheet.sheet_name]: v === "skip" ? "" : v }))}
              >
                <SelectTrigger className="w-48 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">— Skip (consolidated) —</SelectItem>
                  {casinos.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          }
        >
          <div className="text-xs text-muted-foreground mb-2">
            Incomes (Oct): Live <b>{formatNumberSpaces(sheet.incomes.live_game)}</b> · Slots <b>{formatNumberSpaces(sheet.incomes.slots)}</b> · Total <b>{formatNumberSpaces(sheet.incomes.total)}</b>
          </div>
          {(() => {
            const counts = { new: 0, update: 0, skip: 0 };
            sheet.sections.forEach((sec) => sec.rows.forEach((r) => counts[rowStatus(sheet.sheet_name, r)]++));
            return (
              <div className="text-xs mb-2 flex gap-3">
                <span className="text-green-600">+ {counts.new} new</span>
                <span className="text-amber-600">~ {counts.update} update</span>
                <span className="text-muted-foreground">∅ {counts.skip} skip</span>
              </div>
            );
          })()}
          {sheet.sections.map((sec) => (
            <div key={sec.group_label} className="mb-4">
              <div className="text-sm font-semibold mb-1">{sec.group_label}</div>
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-2 py-1 w-16">Status</th>
                    <th className="text-left px-2 py-1">Excel name</th>
                    <th className="text-left px-2 py-1">Mapped category</th>
                    <th className="text-right px-2 py-1">Plan/Year TZS</th>
                    <th className="text-right px-2 py-1">Plan/Year USD</th>
                    <th className="text-right px-2 py-1">Actual TZS</th>
                    <th className="text-right px-2 py-1">Actual USD</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.map((r, i) => {
                    const status = rowStatus(sheet.sheet_name, r);
                    return (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1">
                        {status === "new" && <span className="text-green-600 font-mono text-[10px] uppercase">+ new</span>}
                        {status === "update" && <span className="text-amber-600 font-mono text-[10px] uppercase">~ update</span>}
                        {status === "skip" && <span className="text-muted-foreground font-mono text-[10px] uppercase">∅ skip</span>}
                      </td>
                      <td className="px-2 py-1">{r.excel_name}</td>
                      <td className="px-2 py-1">
                        <Select
                          value={r.category_id || "none"}
                          onValueChange={(v) => {
                            r.category_id = v === "none" ? null : v;
                            setSheets((s) => [...s]);
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs">
                            <div className="flex items-center gap-1">
                              {r.category_id ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <AlertCircle className="w-3 h-3 text-amber-600" />}
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— Skip —</SelectItem>
                            {cats.map((c: any) => (
                              <SelectItem key={c.id} value={c.id}>{c.group_name} · {c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="text-right font-mono px-2 py-1">{formatNumberSpaces(r.plan_year_tzs)}</td>
                      <td className="text-right font-mono px-2 py-1">{formatNumberSpaces(r.plan_year_usd)}</td>
                      <td className="text-right font-mono px-2 py-1">{formatNumberSpaces(r.actual_tzs)}</td>
                      <td className="text-right font-mono px-2 py-1">{formatNumberSpaces(r.actual_usd)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </PageSection>
      ))}

      {sheets.length > 0 && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setSheets([]); setFile(null); }}>Cancel</Button>
          <Button onClick={() => apply.mutate()} disabled={!ready || apply.isPending}>
            {apply.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Apply → fin_budget ({year})
          </Button>
        </div>
      )}

      <PageSection title="Recent imports">
        {!imports.length && <div className="text-sm text-muted-foreground text-center py-4">No imports logged yet</div>}
        {imports.map((i: any) => (
          <div key={i.id} className="flex justify-between border-b border-border py-1.5 text-sm">
            <span>{i.filename}</span>
            <span className="text-xs text-muted-foreground">{i.target_kind} · {i.status} · {fmtDateTime(i.created_at)}</span>
          </div>
        ))}
      </PageSection>
    </PageShell>
  );
}
