/**
 * Office > Bank / Cashless — day x account grid.
 *
 * Rows are the days of the selected period; columns are wallets (account x
 * currency). A cell is the daily movement, entered inline. Manual entries post
 * straight into the wallet ledger, so Wallets balances stay in sync.
 */
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { InlineNumberCell } from "@/components/finances/InlineNumberCell";
import { useOfficePeriod } from "@/components/office/office-shell";
import { useFinDailyRates } from "@/hooks/use-fin-daily-rates";
import { useMonthClosures } from "@/hooks/use-fin-month-closures";
import { useAuth } from "@/lib/auth-context";
import { formatNumberSpaces } from "@/lib/currency";
import { fmtDateOnly } from "@/lib/format-date";
import { type WalletGroup } from "@/lib/wallet-groups";
import {
  cellKey,
  daysOfPeriod,
  useSetWalletDayAmount,
  useWalletDayGrid,
  type GridCell,
  type GridWallet,
} from "@/hooks/use-wallet-day-grid";

type Row = {
  key: string;
  date: string | null;
  kind: "start" | "day";
};

const EDIT_ROLES = ["super_admin", "manager", "finance_manager", "general_manager"];

export default function WalletDayGridTab({
  groups,
  title,
}: {
  groups: WalletGroup[];
  title: string;
}) {
  const { period } = useOfficePeriod();
  const { roles } = useAuth();
  const { wallets, cells, startBalances, isLoading } = useWalletDayGrid({
    from: period.from,
    to: period.to,
    groups,
  });
  const { data: rates } = useFinDailyRates(period.from, period.to);
  const { data: closures } = useMonthClosures();
  const setAmount = useSetWalletDayAmount();

  const monthClosed = !!(closures || []).find(
    (c) => c.year === period.year && c.month === period.month,
  );
  const canEdit = roles.some((r) => EDIT_ROLES.includes(r)) && !monthClosed && period.mode === "month";

  const days = useMemo(() => daysOfPeriod(period.from, period.to), [period.from, period.to]);

  /** FX rate of a currency on a given day (TZS = 1, falls back to latest known). */
  const rateOf = useMemo(() => {
    const byDate = new Map<string, number>();
    const latest = new Map<string, number>();
    (rates || []).forEach((r) => {
      byDate.set(`${r.currency}|${r.business_date}`, Number(r.rate_to_tzs) || 0);
      if (!latest.has(r.currency)) latest.set(r.currency, Number(r.rate_to_tzs) || 0);
    });
    return (currency: string, date: string) => {
      if (currency === "TZS") return 1;
      return byDate.get(`${currency}|${date}`) || latest.get(currency) || 0;
    };
  }, [rates]);

  const cellOf = (walletId: string, date: string): GridCell =>
    cells.get(cellKey(walletId, date)) || { total: 0, manual: 0, manualId: null };

  /** Movement sum of a wallet over the period. */
  const walletMonthMovement = (w: GridWallet) =>
    days.reduce((s, d) => s + cellOf(w.id, d).total, 0);

  const rows: Row[] = useMemo(
    () => [
      { key: "start", date: null, kind: "start" as const },
      ...days.map((d) => ({ key: d, date: d, kind: "day" as const })),
    ],
    [days],
  );

  const dayTotalTzs = (date: string) =>
    wallets.reduce((s, w) => s + cellOf(w.id, date).total * rateOf(w.currency, date), 0);

  const columns: ColumnDef<Row>[] = useMemo(() => {
    const dateCol: ColumnDef<Row> = {
      key: "date",
      header: "Date",
      accessor: (r) =>
        r.kind === "start" ? (
          <span className="font-semibold text-muted-foreground">Start of month</span>
        ) : (
          <span className="font-mono tabular-nums">{fmtDateOnly(r.date!)}</span>
        ),
      style: { width: 130, minWidth: 130 },
    };

    const walletCols: ColumnDef<Row>[] = wallets.map((w) => ({
      key: w.id,
      header: (
        <div className="text-right leading-tight">
          <div className="truncate">{w.name}</div>
          <div className="text-[10px] text-muted-foreground">{w.currency}</div>
        </div>
      ),
      headerClassName: "text-right",
      cellClassName: "text-right",
      style: { minWidth: 116 },
      accessor: (r) => {
        if (r.kind === "start") {
          const v = startBalances.get(w.id) || 0;
          return (
            <span className="font-mono tabular-nums font-semibold">
              {v ? formatNumberSpaces(v) : "·"}
            </span>
          );
        }
        const c = cellOf(w.id, r.date!);
        const auto = c.total - c.manual;
        return (
          <div className="flex flex-col items-end">
            <InlineNumberCell
              value={c.manual}
              allowNegative
              disabled={!canEdit}
              placeholder="·"
              className={c.manual < 0 ? "cms-amount-negative" : undefined}
              onCommit={(v) =>
                setAmount.mutate({
                  wallet: w,
                  date: r.date!,
                  amount: v,
                  existingId: c.manualId,
                  fxRate: rateOf(w.currency, r.date!) || 1,
                })
              }
            />
            {auto !== 0 && (
              <span
                className="text-[10px] text-muted-foreground font-mono tabular-nums"
                title="Posted by other modules (expenses, transfers, collections)"
              >
                {formatNumberSpaces(auto)}
              </span>
            )}
          </div>
        );
      },
    }));

    const totalCol: ColumnDef<Row> = {
      key: "__total",
      header: <div className="text-right">Total TZS</div>,
      headerClassName: "text-right",
      cellClassName: "text-right",
      style: { minWidth: 130 },
      accessor: (r) => {
        const v =
          r.kind === "start"
            ? wallets.reduce(
                (s, w) => s + (startBalances.get(w.id) || 0) * rateOf(w.currency, period.from),
                0,
              )
            : dayTotalTzs(r.date!);
        return (
          <span
            className={`font-mono tabular-nums font-semibold ${v < 0 ? "cms-amount-negative" : ""}`}
          >
            {v ? formatNumberSpaces(Math.round(v)) : "·"}
          </span>
        );
      },
    };

    return [dateCol, ...walletCols, totalCol];
  }, [wallets, cells, startBalances, canEdit, rateOf, period.from]);

  const footerRows = useMemo(
    () => [
      {
        key: "movement",
        className: "bg-muted/40",
        cell: (col: ColumnDef<Row>) => {
          if (col.key === "date") return <span className="font-semibold">Month movement</span>;
          if (col.key === "__total") {
            const v = days.reduce((s, d) => s + dayTotalTzs(d), 0);
            return (
              <span className="font-mono tabular-nums font-semibold">
                {v ? formatNumberSpaces(Math.round(v)) : "·"}
              </span>
            );
          }
          const w = wallets.find((x) => x.id === col.key);
          if (!w) return null;
          const v = walletMonthMovement(w);
          return (
            <span className="font-mono tabular-nums font-semibold">
              {v ? formatNumberSpaces(v) : "·"}
            </span>
          );
        },
      },
      {
        key: "end",
        className: "bg-primary/5",
        cell: (col: ColumnDef<Row>) => {
          if (col.key === "date") return <span className="font-semibold">End of month</span>;
          if (col.key === "__total") {
            const v = wallets.reduce(
              (s, w) =>
                s +
                ((startBalances.get(w.id) || 0) + walletMonthMovement(w)) *
                  rateOf(w.currency, period.to),
              0,
            );
            return (
              <span className="font-mono tabular-nums font-semibold">
                {v ? formatNumberSpaces(Math.round(v)) : "·"}
              </span>
            );
          }
          const w = wallets.find((x) => x.id === col.key);
          if (!w) return null;
          const v = (startBalances.get(w.id) || 0) + walletMonthMovement(w);
          return (
            <span className="font-mono tabular-nums font-semibold">
              {v ? formatNumberSpaces(v) : "·"}
            </span>
          );
        },
      },
    ],
    [wallets, cells, startBalances, days, rateOf, period.to],
  );

  if (!isLoading && wallets.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No {title.toLowerCase()} wallets configured for this casino.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="text-sm font-semibold">{title} · daily movements</div>
          {monthClosed && (
            <span className="text-xs text-muted-foreground">Month closed — read only</span>
          )}
        </div>
        <div className="overflow-auto max-h-[70vh]">
          <SmartTable
            data={rows}
            columns={columns}
            rowKey={(r) => r.key}
            loading={isLoading}
            stickyColumns={[0]}
            stickyHeader
            scroll={false}
            footerRows={footerRows}
            rowClassName={(r) => (r.kind === "start" ? "bg-muted/30" : undefined)}
            virtualize={false}
            bare
          />
        </div>
      </CardContent>
    </Card>
  );
}
