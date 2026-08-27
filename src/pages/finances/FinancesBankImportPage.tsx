/**
 * Bank Statement Import & Review.
 *
 * Flow: pick BANK wallet → upload CSV/XLSX → staging batch (parsed rows) →
 * review (match / edit category / ignore) → Confirm.
 *
 * Accounting contract:
 *  • Confirm of an unmatched DEBIT creates a normal Office `expenses` record
 *    that is NOT approved and NOT posted to the wallet. It appears in the
 *    standard Expenses Approvals queue; only approval posts fin_wallet_tx.
 *  • Confirm of a MATCHED row only reconciles — no new expense, no new tx.
 *  • Incoming CREDITS are never auto-converted into expenses.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, Trash2, CheckCircle2, Link2, AlertTriangle, Ban } from "lucide-react";

import { PageShell, PageSection } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FinTable, FinTHead, FinTBody, FinTR, FinTH, FinTD, FinAmount, FinDate, FinTrunc, FinEmpty,
} from "@/components/finances/FinTable";

import { useCasino } from "@/lib/casino-context";
import { useFinWallets, useFinCategories } from "@/hooks/use-fin";
import {
  useBankBatches, useBankRows, useCreateBankBatch, useUpdateBankRow,
  useIgnoreBankRow, useConfirmBankRow, useConfirmBankBatch, useDeleteBankBatch,
  type BankRow,
} from "@/hooks/use-bank-import";
import { parseStatementFile, fileHash, UnsupportedStatementFile, type ParsedStatement } from "@/lib/bank-statement-parser";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateTime } from "@/lib/format-date";

const BANK_LIKE = new Set(["bank", "selcom", "mobile_money", "digital"]);

const STATUS_STYLE: Record<BankRow["status"], string> = {
  pending: "bg-muted text-muted-foreground",
  matched: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  duplicate: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  ignored: "bg-muted text-muted-foreground line-through",
  confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  error: "bg-destructive/15 text-destructive",
};

export default function FinancesBankImportPage() {
  const { activeCasinoId } = useCasino();
  const { data: wallets = [] } = useFinWallets();
  const { data: categories = [] } = useFinCategories();

  const [walletId, setWalletId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<ParsedStatement | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);

  const bankWallets = useMemo(
    () => (wallets as any[]).filter((w) => BANK_LIKE.has(w.kind) && w.is_active),
    [wallets],
  );
  const wallet = bankWallets.find((w) => w.id === walletId);
  const expenseCats = useMemo(
    () => (categories as any[]).filter((c) => !c.is_income && c.is_active),
    [categories],
  );

  const { data: batches = [] } = useBankBatches(activeCasinoId ?? undefined, walletId || undefined);
  const { data: rows = [] } = useBankRows(batchId);
  const batch = batches.find((b) => b.id === batchId) || null;

  const createBatch = useCreateBankBatch();
  const updateRow = useUpdateBankRow();
  const ignoreRow = useIgnoreBankRow();
  const confirmRow = useConfirmBankRow();
  const confirmBatch = useConfirmBankBatch();
  const deleteBatch = useDeleteBankBatch();

  const handleFile = async (f: File | null) => {
    setFile(f);
    setPreview(null);
    if (!f) return;
    setParsing(true);
    try {
      const parsed = await parseStatementFile(f);
      setPreview(parsed);
      toast.success(`Parsed ${parsed.rows.length} transaction(s)`);
      parsed.warnings.forEach((w) => toast.info(w));
    } catch (e: any) {
      if (e instanceof UnsupportedStatementFile) toast.error(e.message);
      else toast.error(e?.message || "Failed to parse file");
    } finally {
      setParsing(false);
    }
  };

  const handleUpload = async () => {
    if (!activeCasinoId || !walletId || !file || !preview) return;
    try {
      const hash = await fileHash(file);
      const id = await createBatch.mutateAsync({
        casinoId: activeCasinoId,
        walletId,
        filename: file.name,
        fileHash: hash,
        rows: preview.rows,
        opening: preview.opening,
        closing: preview.closing,
      });
      setBatchId(id);
      setFile(null);
      setPreview(null);
      toast.success("Statement staged for review");
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    }
  };

  const summary = useMemo(() => {
    const s = {
      debits: 0, credits: 0, matched: 0, unmatched: 0, ignored: 0,
      duplicates: 0, errors: 0, confirmed: 0, pending: 0,
    };
    rows.forEach((r) => {
      s.debits += Number(r.debit || 0);
      s.credits += Number(r.credit || 0);
      const amt = Math.abs(Number(r.signed_amount || 0));
      if (r.is_duplicate) s.duplicates++;
      if (r.status === "error") s.errors++;
      if (r.status === "ignored") { s.ignored += amt; return; }
      if (r.status === "confirmed") s.confirmed++;
      if (r.status === "pending") s.pending++;
      if (r.matched_expense_id || r.matched_wallet_tx_id) s.matched += amt;
      else s.unmatched += amt;
    });
    return s;
  }, [rows]);

  const ccy = batch?.currency || wallet?.currency || "TZS";
  const money = (n: number) => formatNumberSpaces(Math.round(Number(n || 0) * 100) / 100);

  const rowActionsDisabled = (r: BankRow) =>
    r.status === "confirmed" || r.status === "ignored" || confirmRow.isPending;

  return (
    <PageShell>
      {/* Step 1–2: wallet + file */}
      <PageSection>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Bank wallet</div>
            <Select value={walletId} onValueChange={(v) => { setWalletId(v); setBatchId(null); }}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select bank account" /></SelectTrigger>
              <SelectContent>
                {bankWallets.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name} · {w.currency}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[260px]">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Statement file (CSV / XLSX / XLS)</div>
            <Input
              type="file"
              accept=".csv,.txt,.xlsx,.xlsm,.xls"
              disabled={!walletId}
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              className="h-9"
            />
          </div>
          <Button onClick={handleUpload} disabled={!walletId || !preview || parsing || createBatch.isPending}>
            {parsing || createBatch.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Stage for review
          </Button>
          {preview && (
            <div className="text-xs text-muted-foreground">
              {preview.rows.length} rows
              {preview.opening != null && <> · opening {money(preview.opening)}</>}
              {preview.closing != null && <> · closing {money(preview.closing)}</>}
            </div>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          PDF statements are not supported — export CSV/XLSX from the bank. Nothing is posted at upload:
          rows are staged, and confirmed debits become <b>unapproved</b> Office expenses in the approval queue.
        </p>
      </PageSection>

      {/* Batch list */}
      <PageSection>
        <FinTable>
          <FinTHead>
            <tr>
              <FinTH className="w-[130px]">Uploaded</FinTH>
              <FinTH>File</FinTH>
              <FinTH className="w-[150px]">Period</FinTH>
              <FinTH className="w-[70px] text-right">Rows</FinTH>
              <FinTH className="w-[120px] text-right">Debits</FinTH>
              <FinTH className="w-[120px] text-right">Credits</FinTH>
              <FinTH className="w-[140px]">Status</FinTH>
              <FinTH className="w-[80px]" />
            </tr>
          </FinTHead>
          <FinTBody>
            {batches.length === 0 && <FinEmpty colSpan={8} msg="No imports yet" />}
            {batches.map((b) => (
              <FinTR
                key={b.id}
                className={b.id === batchId ? "bg-muted/40 cursor-pointer" : "cursor-pointer"}
                onClick={() => setBatchId(b.id)}
              >
                <FinTD className="whitespace-nowrap">{fmtDateTime(b.created_at)}</FinTD>
                <FinTD><FinTrunc>{b.filename}</FinTrunc></FinTD>
                <FinTD className="whitespace-nowrap">
                  {b.period_from ? <><FinDate value={b.period_from} /> – <FinDate value={b.period_to || b.period_from} /></> : "—"}
                </FinTD>
                <FinTD className="text-right font-mono tabular-nums">{b.row_count}</FinTD>
                <FinTD className="text-right font-mono tabular-nums">{money(b.total_debit)}</FinTD>
                <FinTD className="text-right font-mono tabular-nums">{money(b.total_credit)}</FinTD>
                <FinTD><Badge variant="outline" className="text-[10px]">{b.status.replace("_", " ")}</Badge></FinTD>
                <FinTD>
                  <Button
                    size="icon" variant="ghost" className="h-7 w-7"
                    title="Delete unconfirmed batch"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteBatch.mutate(b.id, {
                        onSuccess: () => { if (batchId === b.id) setBatchId(null); toast.success("Batch deleted"); },
                        onError: (err: any) => toast.error(err?.message || "Cannot delete"),
                      });
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </FinTD>
              </FinTR>
            ))}
          </FinTBody>
        </FinTable>
      </PageSection>

      {/* Review */}
      {batch && (
        <PageSection
          title={batch.filename}
          titleRight={
            <Button
              size="sm"
              disabled={confirmBatch.isPending}
              onClick={() =>
                confirmBatch.mutate(batch.id, {
                  onSuccess: (res) =>
                    toast.success(`Confirmed: ${res.created} new expense(s), ${res.reconciled} reconciled, ${res.skipped} skipped, ${res.errors} error(s)`),
                  onError: (e: any) => toast.error(e?.message || "Confirm failed"),
                })
              }
            >
              {confirmBatch.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Confirm all eligible
            </Button>
          }
        >
          {/* Reconciliation summary */}
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {[
              ["Opening", batch.opening_balance != null ? money(batch.opening_balance) : "—"],
              ["Closing", batch.closing_balance != null ? money(batch.closing_balance) : "—"],
              ["Debits", money(summary.debits)],
              ["Credits", money(summary.credits)],
              ["Matched", money(summary.matched)],
              ["Unmatched", money(summary.unmatched)],
              ["Ignored", money(summary.ignored)],
              ["Dups / errors", `${summary.duplicates} / ${summary.errors}`],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-md border border-border bg-card px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="font-mono text-[13px] tabular-nums">{value}</div>
              </div>
            ))}
          </div>

          <FinTable>
            <FinTHead>
              <tr>
                <FinTH className="w-[40px] text-right">#</FinTH>
                <FinTH className="w-[88px]">Date</FinTH>
                <FinTH>Description / reference</FinTH>
                <FinTH className="w-[110px] text-right">Debit</FinTH>
                <FinTH className="w-[110px] text-right">Credit</FinTH>
                <FinTH className="w-[44px]">Ccy</FinTH>
                <FinTH className="w-[80px]">Type</FinTH>
                <FinTH className="w-[190px]">Category</FinTH>
                <FinTH className="w-[90px]">Match</FinTH>
                <FinTH className="w-[110px]">Status</FinTH>
                <FinTH className="w-[92px]" />
              </tr>
            </FinTHead>
            <FinTBody>
              {rows.length === 0 && <FinEmpty colSpan={11} msg="No rows" />}
              {rows.map((r) => {
                const locked = r.status === "confirmed" || r.status === "ignored";
                return (
                  <FinTR key={r.id}>
                    <FinTD className="text-right font-mono tabular-nums text-muted-foreground">{r.row_index}</FinTD>
                    <FinTD><FinDate value={r.tx_date} /></FinTD>
                    <FinTD>
                      <Input
                        defaultValue={r.description}
                        disabled={locked}
                        className="h-7 border-transparent bg-transparent px-1 text-[12px] hover:border-input focus:border-input"
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== r.description) {
                            updateRow.mutate({ rowId: r.id, batchId: batch.id, description: v });
                          }
                        }}
                      />
                      {r.reference && <div className="px-1 text-[10px] text-muted-foreground">ref: {r.reference}</div>}
                      {r.error_text && <div className="px-1 text-[10px] text-destructive">{r.error_text}</div>}
                    </FinTD>
                    <FinTD className="text-right font-mono tabular-nums">{r.debit ? money(r.debit) : "·"}</FinTD>
                    <FinTD className="text-right font-mono tabular-nums">{r.credit ? money(r.credit) : "·"}</FinTD>
                    <FinTD className="text-muted-foreground">{r.currency}</FinTD>
                    <FinTD>
                      <Badge variant="outline" className="text-[10px]">{r.proposed_kind}</Badge>
                    </FinTD>
                    <FinTD>
                      <Select
                        value={r.fin_category_id ?? ""}
                        disabled={locked || r.signed_amount >= 0}
                        onValueChange={(v) => updateRow.mutate({ rowId: r.id, batchId: batch.id, finCategoryId: v })}
                      >
                        <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="— for review —" /></SelectTrigger>
                        <SelectContent>
                          {expenseCats.map((c) => (
                            <SelectItem key={c.id} value={c.id} className="text-[12px]">{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FinTD>
                    <FinTD>
                      {r.matched_expense_id || r.matched_wallet_tx_id ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
                          <Link2 className="h-3 w-3" />{r.matched_expense_id ? "expense" : "movement"}
                        </span>
                      ) : r.is_duplicate ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
                          <AlertTriangle className="h-3 w-3" />duplicate
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">·</span>
                      )}
                    </FinTD>
                    <FinTD>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                    </FinTD>
                    <FinTD>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7" title="Confirm row"
                          disabled={rowActionsDisabled(r) || r.is_duplicate}
                          onClick={() =>
                            confirmRow.mutate({ rowId: r.id, batchId: batch.id }, {
                              onSuccess: (res) =>
                                toast.success(res.result === "expense_created"
                                  ? "Unapproved expense created — pending approval"
                                  : "Row reconciled"),
                              onError: (e: any) => toast.error(e?.message || "Confirm failed"),
                            })
                          }
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7" title="Ignore / delete row"
                          disabled={locked}
                          onClick={() =>
                            ignoreRow.mutate({ rowId: r.id, batchId: batch.id }, {
                              onError: (e: any) => toast.error(e?.message || "Failed"),
                            })
                          }
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </FinTD>
                  </FinTR>
                );
              })}
            </FinTBody>
          </FinTable>
        </PageSection>
      )}
    </PageShell>
  );
}
