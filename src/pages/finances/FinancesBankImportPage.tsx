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
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { TablePane, ErrorPane } from "@/components/finances/TablePane";

import { useCasino } from "@/lib/casino-context";
import { useFinWallets, useFinCategories } from "@/hooks/use-fin";
import {
  useBankBatches, useBankRows, useCreateBankBatch, useUpdateBankRow,
  useIgnoreBankRow, useConfirmBankRow, useConfirmBankBatch, useDeleteBankBatch,
  type BankRow,
} from "@/hooks/use-bank-import";
import { parseStatementFile, fileHash, UnsupportedStatementFile, type ParsedStatement } from "@/lib/bank-statement-parser";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDate, fmtDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const BANK_LIKE = new Set(["bank", "selcom", "mobile_money", "digital"]);

const STATUS_STYLE: Record<BankRow["status"], string> = {
  pending: "bg-muted text-muted-foreground",
  matched: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  duplicate: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  ignored: "bg-muted text-muted-foreground line-through",
  confirmed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  error: "bg-destructive/15 text-destructive",
};

type Batch = ReturnType<typeof useBankBatches> extends { data?: infer D }
  ? D extends (infer B)[] | undefined ? B : never
  : never;

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

  const {
    data: batches = [],
    isLoading: batchesLoading,
    isError: batchesError,
    refetch: refetchBatches,
  } = useBankBatches(activeCasinoId ?? undefined, walletId || undefined);
  const {
    data: rows = [],
    isLoading: rowsLoading,
    isError: rowsError,
    refetch: refetchRows,
  } = useBankRows(batchId);
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

  // ---------- Batches table ----------
  const batchColumns: ColumnDef<(typeof batches)[number]>[] = [
    {
      key: "uploaded",
      header: "Uploaded",
      type: "date",
      style: { width: 140 },
      headerClassName: "text-left",
      cellClassName: "text-left",
      sortValue: (b) => b.created_at,
      accessor: (b) => <span className="font-mono text-xs whitespace-nowrap">{fmtDateTime(b.created_at)}</span>,
    },
    {
      key: "file",
      header: "File",
      type: "text",
      sortValue: (b) => b.filename,
      accessor: (b) => (
        <span className="block max-w-[280px] truncate text-xs" title={b.filename}>
          {b.filename}
        </span>
      ),
    },
    {
      key: "period",
      header: "Period",
      type: "text",
      style: { width: 170 },
      accessor: (b) => (
        <span className="font-mono text-xs whitespace-nowrap">
          {b.period_from ? <>{fmtDate(b.period_from)} – {fmtDate(b.period_to || b.period_from)}</> : "—"}
        </span>
      ),
    },
    {
      key: "rows",
      header: "Rows",
      type: "int",
      style: { width: 70 },
      sortValue: (b) => b.row_count,
      accessor: (b) => <span className="font-mono tabular-nums">{b.row_count}</span>,
    },
    {
      key: "debits",
      header: "Debits",
      type: "money",
      style: { width: 120 },
      sortValue: (b) => Number(b.total_debit),
      accessor: (b) => <span className="font-mono tabular-nums">{money(b.total_debit)}</span>,
    },
    {
      key: "credits",
      header: "Credits",
      type: "money",
      style: { width: 120 },
      sortValue: (b) => Number(b.total_credit),
      accessor: (b) => <span className="font-mono tabular-nums">{money(b.total_credit)}</span>,
    },
    {
      key: "status",
      header: "Status",
      type: "status",
      style: { width: 130 },
      sortValue: (b) => b.status,
      accessor: (b) => (
        <Badge variant="outline" className="text-[10px]">{b.status.replace("_", " ")}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      type: "actions",
      style: { width: 60 },
      accessor: (b) => (
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
      ),
    },
  ];

  // ---------- Review rows table ----------
  const rowColumns: ColumnDef<BankRow>[] = [
    {
      key: "idx",
      header: "#",
      type: "int",
      style: { width: 44 },
      sortValue: (r) => r.row_index,
      accessor: (r) => <span className="font-mono tabular-nums text-muted-foreground">{r.row_index}</span>,
    },
    {
      key: "date",
      header: "Date",
      type: "date",
      style: { width: 96 },
      headerClassName: "text-left",
      cellClassName: "text-left",
      sortValue: (r) => r.tx_date,
      accessor: (r) => <span className="font-mono text-xs whitespace-nowrap">{fmtDate(r.tx_date)}</span>,
    },
    {
      key: "desc",
      header: "Description / reference",
      type: "text",
      accessor: (r) => {
        const locked = r.status === "confirmed" || r.status === "ignored";
        return (
          <div className="min-w-[220px]">
            <Input
              defaultValue={r.description}
              disabled={locked}
              className="h-7 border-transparent bg-transparent px-1 text-[12px] hover:border-input focus:border-input"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== r.description && batch) {
                  updateRow.mutate({ rowId: r.id, batchId: batch.id, description: v });
                }
              }}
            />
            {r.reference && <div className="px-1 text-[10px] text-muted-foreground">ref: {r.reference}</div>}
            {r.error_text && <div className="px-1 text-[10px] text-destructive">{r.error_text}</div>}
          </div>
        );
      },
    },
    {
      key: "debit",
      header: "Debit",
      type: "money",
      style: { width: 110 },
      sortValue: (r) => Number(r.debit || 0),
      accessor: (r) => <span className="font-mono tabular-nums">{r.debit ? money(r.debit) : "·"}</span>,
    },
    {
      key: "credit",
      header: "Credit",
      type: "money",
      style: { width: 110 },
      sortValue: (r) => Number(r.credit || 0),
      accessor: (r) => <span className="font-mono tabular-nums">{r.credit ? money(r.credit) : "·"}</span>,
    },
    {
      key: "ccy",
      header: "Ccy",
      type: "text",
      style: { width: 48 },
      accessor: (r) => <span className="text-muted-foreground">{r.currency}</span>,
    },
    {
      key: "kind",
      header: "Type",
      type: "status",
      style: { width: 84 },
      accessor: (r) => <Badge variant="outline" className="text-[10px]">{r.proposed_kind}</Badge>,
    },
    {
      key: "category",
      header: "Category",
      type: "text",
      style: { width: 190 },
      accessor: (r) => {
        const locked = r.status === "confirmed" || r.status === "ignored";
        return (
          <Select
            value={r.fin_category_id ?? ""}
            disabled={locked || r.signed_amount >= 0}
            onValueChange={(v) => batch && updateRow.mutate({ rowId: r.id, batchId: batch.id, finCategoryId: v })}
          >
            <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="— for review —" /></SelectTrigger>
            <SelectContent>
              {expenseCats.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-[12px]">{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      },
    },
    {
      key: "match",
      header: "Match",
      type: "text",
      style: { width: 96 },
      accessor: (r) =>
        r.matched_expense_id || r.matched_wallet_tx_id ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
            <Link2 className="h-3 w-3" />{r.matched_expense_id ? "expense" : "movement"}
          </span>
        ) : r.is_duplicate ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600">
            <AlertTriangle className="h-3 w-3" />duplicate
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">·</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      type: "status",
      style: { width: 104 },
      sortValue: (r) => r.status,
      accessor: (r) => (
        <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${STATUS_STYLE[r.status]}`}>{r.status}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      type: "actions",
      style: { width: 92 },
      accessor: (r) => {
        const locked = r.status === "confirmed" || r.status === "ignored";
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="icon" variant="ghost" className="h-7 w-7" title="Confirm row"
              disabled={rowActionsDisabled(r) || r.is_duplicate}
              onClick={() =>
                batch && confirmRow.mutate({ rowId: r.id, batchId: batch.id }, {
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
                batch && ignoreRow.mutate({ rowId: r.id, batchId: batch.id }, {
                  onError: (e: any) => toast.error(e?.message || "Failed"),
                })
              }
            >
              <Ban className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <PageShell>
      <PageHeader
        icon={Upload}
        title="Import Statement"
        subtitle="Bank statement upload & staged review · confirmed debits become unapproved expenses"
        date
      />

      {/* Step 1–2: wallet + file */}
      <PageSection title="Upload Statement">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[240px]">
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
          <div className="min-w-[280px] flex-1">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              Statement file (CSV / XLSX / XLS)
            </div>
            <label
              className={cn(
                "flex h-9 w-full cursor-pointer items-center gap-2 rounded-md border border-dashed border-input bg-background px-3 text-xs transition-colors hover:border-primary/50 hover:bg-muted/30",
                !walletId && "pointer-events-none opacity-50",
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!walletId) return;
                void handleFile(e.dataTransfer.files?.[0] ?? null);
              }}
            >
              <input
                type="file"
                className="sr-only"
                accept=".csv,.txt,.xlsx,.xlsm,.xls"
                disabled={!walletId}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.currentTarget.value = "";
                  void handleFile(f);
                }}
              />
              {parsing
                ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                : <Upload className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <span className={cn("truncate", file ? "text-foreground" : "text-muted-foreground")}>
                {file ? file.name : "Choose a file or drag & drop here"}
              </span>
            </label>
          </div>
          <Button
            className="h-9"
            onClick={handleUpload}
            disabled={!walletId || !preview || parsing || createBatch.isPending}
          >
            {parsing || createBatch.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Upload className="mr-2 h-4 w-4" />}
            Stage for review
          </Button>
        </div>
        {preview && (
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              ["Parsed rows", String(preview.rows.length)],
              ["Opening", preview.opening != null ? money(preview.opening) : "—"],
              ["Closing", preview.closing != null ? money(preview.closing) : "—"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-border bg-card px-2 py-1.5 min-w-[110px]">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                <div className="font-mono text-[13px] tabular-nums">{value}</div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          PDF statements are not supported — export CSV/XLSX from the bank. Nothing is posted at upload:
          rows are staged, and confirmed debits become <b>unapproved</b> Office expenses in the approval queue.
        </p>
      </PageSection>

      {/* Batch list */}
      <PageSection title="Statements">
        {batchesError && <ErrorPane className="mb-2" message="Failed to load statements" onRetry={() => refetchBatches()} />}
        <TablePane maxHeight="max-h-[40vh]">
          {/* Batch list is short — no virtualization. */}
          <SmartTable
            data={batches}
            columns={batchColumns}
            rowKey={(b) => b.id}
            bare
            scroll={false}
            stickyHeader
            virtualize={false}
            loading={batchesLoading}
            empty="No imports yet"
            onRowClick={(b) => setBatchId(b.id)}
            rowClassName={(b) => (b.id === batchId ? "bg-primary/10 cursor-pointer" : "cursor-pointer")}
          />
        </TablePane>
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

          {rowsError && <ErrorPane className="mb-2" message="Failed to load statement rows" onRetry={() => refetchRows()} />}
          <TablePane>
            {/*
             * Statements are typically a few hundred rows; inline editors
             * (Input / Select) keep uncommitted state per cell, so rows must
             * stay mounted — virtualization stays off deliberately.
             */}
            <SmartTable<BankRow>
              data={rows}
              columns={rowColumns}
              rowKey={(r) => r.id}
              bare
              scroll={false}
              stickyHeader
              virtualize={false}
              loading={rowsLoading}
              loadingRows={8}
              empty="No rows in this batch"
            />
          </TablePane>
        </PageSection>
      )}
    </PageShell>
  );
}
