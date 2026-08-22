/**
 * LAB SCREEN 6 — Office / Wallets.
 * Reuses `useFinBalanceSnapshot` (RPC `fin_balance_snapshot`) +
 * `computeBalanceTotals` + `useFinWallets` for the group mapping.
 * Terminology and formulas are unchanged: Expected / Actual / Variance,
 * Actual = last recorded physical wallet state only.
 */
import { useMemo, useState } from "react";
import { useFinBalanceSnapshot, computeBalanceTotals, type WalletBalanceRow } from "@/hooks/use-fin-balance";
import { useFinWallets } from "@/hooks/use-fin";
import { groupOfWallet, walletGroupLabel, WALLET_GROUP_ORDER } from "@/lib/wallet-groups";
import {
  ControlRoomShell,
  DensityToggle,
  KpiStrip,
  PeriodControl,
  Toolbar,
  useLabPeriod,
} from "../ControlRoomShell";
import ControlRoomTable, { type CrlColumn, type CrlDensity } from "../ControlRoomTable";
import { MONTH_NAMES, NO_DATA, amount, labDate, signed, tone } from "../format";

type Row = WalletBalanceRow & { group: string };

export default function WalletsLab() {
  const { period, from, to } = useLabPeriod();
  const [density, setDensity] = useState<CrlDensity>("compact");

  const { data: snapshot, isLoading } = useFinBalanceSnapshot(from, to);
  const { data: wallets = [] } = useFinWallets();

  const groupById = useMemo(() => {
    const m = new Map<string, string>();
    (wallets as any[]).forEach((w) => m.set(w.id, groupOfWallet(w)));
    return m;
  }, [wallets]);

  const rows: Row[] = useMemo(
    () =>
      (snapshot?.wallets || []).map((w) => ({
        ...w,
        group: groupById.get(w.wallet_id) || "other",
      })),
    [snapshot, groupById],
  );

  const grouped = useMemo(() => {
    const m = new Map<string, Row[]>();
    rows.forEach((r) => {
      const arr = m.get(r.group) || [];
      arr.push(r);
      m.set(r.group, arr);
    });
    return Array.from(m.entries()).sort(
      (a, b) => (WALLET_GROUP_ORDER[a[0]] ?? 99) - (WALLET_GROUP_ORDER[b[0]] ?? 99),
    );
  }, [rows]);

  const totals = useMemo(() => computeBalanceTotals(snapshot), [snapshot]);

  const columnsFor = (list: Row[]): CrlColumn<Row>[] => {
    const sum = list.reduce(
      (a, r) => ({
        ledger: a.ledger + Number(r.ledger_tzs || 0),
        actual: a.actual + Number(r.actual_tzs || 0),
      }),
      { ledger: 0, actual: 0 },
    );
    return [
      {
        key: "name",
        label: "Wallet",
        width: 240,
        sticky: true,
        sortable: true,
        sortValue: (r) => r.name,
        render: (r) => r.name,
        total: () => "GROUP TOTAL",
      },
      {
        key: "currency",
        label: "Curr",
        width: 70,
        align: "center",
        sortable: true,
        sortValue: (r) => r.currency,
        render: (r) => <span className="crl-num crl-faint">{r.currency}</span>,
      },
      {
        key: "ledger_native",
        label: "Ledger (native)",
        numeric: true,
        divider: true,
        sortable: true,
        sortValue: (r) => Number(r.ledger_native || 0),
        render: (r) => signed(Number(r.ledger_native || 0)),
      },
      {
        key: "actual_native",
        label: "Actual (native)",
        numeric: true,
        sortable: true,
        sortValue: (r) => (r.actual_native == null ? null : Number(r.actual_native)),
        render: (r) =>
          r.actual_native == null ? (
            <span className="crl-faint">{NO_DATA}</span>
          ) : (
            signed(Number(r.actual_native))
          ),
      },
      {
        key: "ledger_tzs",
        label: "Ledger TZS",
        numeric: true,
        divider: true,
        sortable: true,
        sortValue: (r) => Number(r.ledger_tzs || 0),
        render: (r) => signed(Number(r.ledger_tzs || 0)),
        total: () => signed(sum.ledger),
      },
      {
        key: "actual_tzs",
        label: "Actual TZS",
        numeric: true,
        sortable: true,
        sortValue: (r) => (r.actual_tzs == null ? null : Number(r.actual_tzs)),
        render: (r) => {
          if (r.actual_tzs == null) return <span className="crl-faint">{NO_DATA}</span>;
          const v = Number(r.actual_tzs);
          return <span className={v < 0 ? "crl-neg" : ""}>{signed(v)}</span>;
        },
        total: () => signed(sum.actual),
      },
      {
        key: "counted",
        label: "Counted",
        width: 130,
        date: true,
        align: "center",
        sortable: true,
        sortValue: (r) => r.physical_asof ?? null,
        render: (r) =>
          r.physical_asof ? (
            <span>
              {labDate(r.physical_asof.slice(0, 10))}
              {r.physical_source === "manual" ? "" : " ·auto"}
            </span>
          ) : (
            <span className="crl-faint">{NO_DATA}</span>
          ),
      },
    ];
  };

  return (
    <ControlRoomShell
      title="Office · Wallets"
      context={`Expected vs actual reconciliation · ${MONTH_NAMES[period.month - 1]} ${period.year}`}
      actions={<PeriodControl />}
    >
      <KpiStrip
        columns={4}
        items={[
          { label: "Expected", value: signed(totals.expected), hint: "Float + incomes − outflows" },
          { label: "Total Actual", value: signed(totals.actual), hint: "Physical counts only" },
          {
            label: "Variance",
            value: signed(totals.variance),
            tone: tone(totals.variance),
            hint: "Actual − Expected",
          },
          {
            label: "USD Rate",
            value: snapshot?.rates?.usd_tzs ? amount(snapshot.rates.usd_tzs) : NO_DATA,
            hint: "USD → TZS",
          },
        ]}
      />

      <Toolbar
        left={<span className="crl-badge">{rows.length} wallets</span>}
        right={<DensityToggle value={density} onChange={setDensity} />}
      />

      {grouped.length === 0 ? (
        <ControlRoomTable
          columns={columnsFor([])}
          rows={[]}
          rowKey={(r) => r.wallet_id}
          loading={isLoading}
          emptyTitle="No wallets"
          emptyHint="No wallet data for this casino and period."
        />
      ) : (
        grouped.map(([group, list]) => (
          <div key={group} style={{ marginBottom: 14 }}>
            <div className="crl-group-title">{walletGroupLabel(group)}</div>
            <ControlRoomTable
              columns={columnsFor(list)}
              rows={list}
              rowKey={(r) => r.wallet_id}
              density={density}
              showTotals
              maxHeight="none"
            />
          </div>
        ))
      )}
    </ControlRoomShell>
  );
}
