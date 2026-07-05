/**
 * Office → Other Incomes (transactions)
 * SmartTable список immutable-транзакций + диалог Add Income (manager+).
 * Reversal вместо редактирования.
 */
import { useMemo, useState } from "react";
import { Coins, Plus, Undo2 } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import FinanceCasinoSwitcher from "@/components/finances/FinanceCasinoSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { useSessionState } from "@/hooks/use-session-state";
import {
  DateRangePresets,
  type DatePreset,
  presetRange,
} from "@/components/ui/date-range-presets";
import { useFinWallets, useFinCategories } from "@/hooks/use-fin";
import {
  useOtherIncomes,
  useAddOtherIncome,
  useReverseOtherIncome,
  OTHER_INCOME_SOURCES,
  type OtherIncomeRow,
  type OtherIncomeSource,
} from "@/hooks/use-other-incomes";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateOnly } from "@/lib/format-date";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const SOURCE_LABEL: Record<OtherIncomeSource, string> = OTHER_INCOME_SOURCES.reduce(
  (acc, s) => {
    acc[s.value] = s.label;
    return acc;
  },
  {} as Record<OtherIncomeSource, string>,
);

export default function OtherIncomesTab() {
  const { roles } = useAuth();
  const canWrite =
    roles.includes("super_admin") ||
    roles.includes("finance_manager") ||
    roles.includes("manager");

  const [preset, setPreset] = useSessionState<DatePreset>("other-inc.preset", "month");
  const [range, setRange] = useSessionState<{ from: string; to: string }>(
    "other-inc.range",
    presetRange("month"),
  );

  const { data: incomes = [], isLoading } = useOtherIncomes(range.from, range.to);
  const { data: wallets = [] } = useFinWallets();
  const { data: categories = [] } = useFinCategories();
  const addIncome = useAddOtherIncome();
  const reverse = useReverseOtherIncome();

  const incomeCats = useMemo(
    () => (categories || []).filter((c: any) => c.is_income),
    [categories],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<{
    business_date: string;
    wallet_id: string;
    fin_category_id: string;
    source: OtherIncomeSource;
    currency: string;
    amount: string;
    note: string;
  }>({
    business_date: new Date().toISOString().slice(0, 10),
    wallet_id: "",
    fin_category_id: "",
    source: "investment",
    currency: "TZS",
    amount: "",
    note: "",
  });

  const activeWallet = wallets.find((w: any) => w.id === form.wallet_id);

  const openAdd = () => {
    setForm({
      business_date: new Date().toISOString().slice(0, 10),
      wallet_id: "",
      fin_category_id: "",
      source: "investment",
      currency: "TZS",
      amount: "",
      note: "",
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!form.wallet_id) return toast.error("Select wallet");
    const amt = Number(form.amount);
    if (!amt || amt <= 0) return toast.error("Amount must be > 0");
    await addIncome.mutateAsync({
      business_date: form.business_date,
      wallet_id: form.wallet_id,
      fin_category_id: form.fin_category_id || null,
      source: form.source,
      currency: activeWallet?.currency || form.currency,
      amount: amt,
      note: form.note,
    });
    setDialogOpen(false);
  };

  const columns: ColumnDef<OtherIncomeRow>[] = [
    {
      key: "date",
      header: "Date",
      type: "date",
      accessor: (r) => (
        <span className="font-mono text-xs">{fmtDateOnly(r.business_date)}</span>
      ),
      style: { width: 110 },
    },
    {
      key: "source",
      header: "Source",
      accessor: (r) => (
        <span className="text-xs uppercase tracking-wider">{SOURCE_LABEL[r.source] || r.source}</span>
      ),
      style: { width: 160 },
    },
    {
      key: "category",
      header: "Category",
      accessor: (r) => (
        <span className="text-xs">{r.fin_categories?.name || "—"}</span>
      ),
    },
    {
      key: "wallet",
      header: "Wallet",
      accessor: (r) => (
        <span>
          {r.fin_wallets?.name || "—"}{" "}
          <span className="text-[10px] text-muted-foreground">{r.currency}</span>
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      type: "money",
      accessor: (r) => {
        const isReversal = !!r.reverses_id;
        const isReversed = !!r.reversed_by_id;
        return (
          <span
            className={cn(
              "font-mono tabular-nums",
              isReversal || isReversed
                ? "line-through text-muted-foreground"
                : "cms-amount-positive",
            )}
          >
            {isReversal ? "−" : ""}
            {formatNumberSpaces(Number(r.amount))}
          </span>
        );
      },
      style: { width: 140 },
    },
    {
      key: "note",
      header: "Note",
      accessor: (r) => (
        <span className="text-xs text-muted-foreground truncate max-w-[300px] inline-block">
          {r.note || ""}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      type: "actions",
      accessor: (r) => {
        if (r.reverses_id || r.reversed_by_id) return null;
        if (!canWrite) return null;
        return (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              if (confirm("Create a reversal for this income?")) reverse.mutate(r);
            }}
            aria-label="Reverse"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </Button>
        );
      },
      style: { width: 60 },
    },
  ];

  return (
    <PageShell>
      <PageHeader
        icon={Coins}
        title="Other Incomes"
        subtitle="Immutable transactions · investments, transfers, refunds"
      >
        <FinanceCasinoSwitcher allowNetwork={false} />
        <DateRangePresets
          preset={preset}
          from={range.from}
          to={range.to}
          onChange={({ preset, from, to }) => {
            setPreset(preset);
            setRange({ from, to });
          }}
        />
        {canWrite && (
          <Button onClick={openAdd} size="sm">
            <Plus className="w-4 h-4" /> Add Income
          </Button>
        )}
      </PageHeader>

      <PageSection card={false}>
        <SmartTable
          data={incomes}
          columns={columns}
          rowKey={(r) => r.id}
          loading={isLoading}
          empty={
            <div className="text-sm text-muted-foreground text-center py-10">
              No other-income transactions in this period.
            </div>
          }
        />
      </PageSection>

      {/* ADD DIALOG */}
      <ResponsiveDialog open={dialogOpen} onOpenChange={setDialogOpen} title="Add Other Income">
        <FormGrid>
          <FormField span={6} label="Business Date">
            <Input
              type="date"
              value={form.business_date}
              onChange={(e) => setForm({ ...form, business_date: e.target.value })}
            />
          </FormField>
          <FormField span={6} label="Source">
            <Select
              value={form.source}
              onValueChange={(v) => setForm({ ...form, source: v as OtherIncomeSource })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OTHER_INCOME_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField span={6} label="Wallet">
            <Select
              value={form.wallet_id}
              onValueChange={(v) => {
                const w = wallets.find((x: any) => x.id === v);
                setForm({ ...form, wallet_id: v, currency: w?.currency || form.currency });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select wallet…" />
              </SelectTrigger>
              <SelectContent>
                {(wallets as any[]).map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} · {w.currency}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField span={6} label="Category (optional)">
            <Select
              value={form.fin_category_id || "__none__"}
              onValueChange={(v) =>
                setForm({ ...form, fin_category_id: v === "__none__" ? "" : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {incomeCats.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.group_name} · {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField span={6} label={`Amount (${activeWallet?.currency || form.currency})`}>
            <Input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0"
            />
          </FormField>
          <FormField span={6} label="Note (optional)">
            <Textarea
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              rows={2}
            />
          </FormField>
        </FormGrid>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={addIncome.isPending}>
            {addIncome.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </ResponsiveDialog>
    </PageShell>
  );
}
