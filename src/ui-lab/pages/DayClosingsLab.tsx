/**
 * LAB SCREEN 7 — Office / Day Closings.
 * Reuses `useDayClosingList` (`fin_day_closing`) — read only, no upsert/lock.
 */
import { useMemo, useState } from "react";
import { useDayClosingList } from "@/hooks/use-fin";
import {
  ControlRoomShell,
  DensityToggle,
  KpiStrip,
  PeriodControl,
  Toolbar,
  useLabPeriod,
} from "../ControlRoomShell";
import ControlRoomTable, { type CrlColumn, type CrlDensity } from "../ControlRoomTable";
import { MONTH_NAMES, NO_DATA, holdOf, labDate, percent, signed, tone } from "../format";

type Row = {
  business_date: string;
  locked_at: string | null;
  tables_result: number;
  drop_slots: number;
  cashdesk_win: number;
  players_card_balance: number;
  net_win: number;
  slots_result: number;
};

export default function DayClosingsLab() {
  const { period, from, to } = useLabPeriod();
  const [density, setDensity] = useState<CrlDensity>("compact");
  const { data = [], isLoading } = useDayClosingList({ from, to });

  const rows: Row[] = useMemo(
    () =>
      (data as any[]).map((r) => ({
        business_date: r.business_date,
        locked_at: r.locked_at ?? null,
        tables_result: Number(r.tables_result || 0),
        drop_slots: Number(r.drop_slots || 0),
        cashdesk_win: Number(r.cashdesk_win || 0),
        players_card_balance: Number(r.players_card_balance || 0),
        net_win: Number(r.net_win || 0),
        // Slots Result = stored system result (Net Win). Card Balance stays separate.
        slots_result: Number(r.slots_result ?? r.net_win ?? 0),

      })),
    [data],
  );

  const totals = useMemo(() => {
    const t = rows.reduce(
      (a, r) => ({
        tables: a.tables + r.tables_result,
        dropSlots: a.dropSlots + r.drop_slots,
        cashdesk: a.cashdesk + r.cashdesk_win,
        cards: a.cards + r.players_card_balance,
        netWin: a.netWin + r.net_win,
        slots: a.slots + r.slots_result,
      }),
      { tables: 0, dropSlots: 0, cashdesk: 0, cards: 0, netWin: 0, slots: 0 },
    );
    return { ...t, overall: t.tables + t.slots };
  }, [rows]);

  const lockedCount = rows.filter((r) => r.locked_at).length;
  const latestClosed = useMemo(
    () =>
      rows
        .filter((r) => r.locked_at)
        .map((r) => r.business_date)
        .sort()
        .pop() || null,
    [rows],
  );

  const columns: CrlColumn<Row>[] = [
    {
      key: "date",
      label: "Business Day",
      group: "",
      width: 130,
      date: true,
      sticky: true,
      sortable: true,
      sortValue: (r) => r.business_date,
      render: (r) => labDate(r.business_date),
      total: () => "TOTAL",
    },
    {
      key: "status",
      label: "Status",
      group: "",
      width: 100,
      align: "center",
      sortable: true,
      sortValue: (r) => (r.locked_at ? 1 : 0),
      render: (r) =>
        r.locked_at ? (
          <span className="crl-badge crl-badge-ok">LOCKED</span>
        ) : (
          <span className="crl-badge">DRAFT</span>
        ),
    },
    {
      key: "tables_result",
      label: "Result",
      group: "Live",
      numeric: true,
      divider: true,
      sortable: true,
      sortValue: (r) => r.tables_result,
      render: (r) => <span className={tone(r.tables_result)}>{signed(r.tables_result)}</span>,
      total: () => <span className={tone(totals.tables)}>{signed(totals.tables)}</span>,
    },
    {
      key: "drop_slots",
      label: "Drop",
      group: "Slots",
      numeric: true,
      divider: true,
      sortable: true,
      sortValue: (r) => r.drop_slots,
      render: (r) => signed(r.drop_slots),
      total: () => signed(totals.dropSlots),
    },
    {
      key: "cashdesk_win",
      label: "Cashdesk Win",
      group: "Slots",
      numeric: true,
      sortable: true,
      sortValue: (r) => r.cashdesk_win,
      render: (r) => <span className={tone(r.cashdesk_win)}>{signed(r.cashdesk_win)}</span>,
      total: () => <span className={tone(totals.cashdesk)}>{signed(totals.cashdesk)}</span>,
    },
    {
      key: "players_card_balance",
      label: "Card Balance",
      group: "Slots",
      numeric: true,
      sortable: true,
      sortValue: (r) => r.players_card_balance,
      render: (r) => <span className={tone(r.players_card_balance)}>{signed(r.players_card_balance)}</span>,
      total: () => <span className={tone(totals.cards)}>{signed(totals.cards)}</span>,
    },
    {
      key: "net_win",
      label: "Net Win",
      group: "Slots",
      numeric: true,
      sortable: true,
      sortValue: (r) => r.net_win,
      render: (r) => <span className={tone(r.net_win)}>{signed(r.net_win)}</span>,
      total: () => <span className={tone(totals.netWin)}>{signed(totals.netWin)}</span>,
    },
    {
      key: "slots_result",
      label: "Result",
      group: "Slots",
      numeric: true,
      sortable: true,
      sortValue: (r) => r.slots_result,
      render: (r) => <span className={tone(r.slots_result)}>{signed(r.slots_result)}</span>,
      total: () => <span className={tone(totals.slots)}>{signed(totals.slots)}</span>,
    },
    {
      key: "hold_slots",
      label: "Hold",
      group: "Slots",
      numeric: true,
      width: 84,
      sortable: true,
      sortValue: (r) => holdOf(r.slots_result, r.drop_slots),
      render: (r) => percent(holdOf(r.slots_result, r.drop_slots)),
      total: () => percent(holdOf(totals.slots, totals.dropSlots)),
    },
    {
      key: "overall",
      label: "Day Result",
      group: "Overall",
      numeric: true,
      divider: true,
      sortable: true,
      sortValue: (r) => r.tables_result + r.slots_result,
      render: (r) => {
        const v = r.tables_result + r.slots_result;
        return <span className={tone(v)}>{signed(v)}</span>;
      },
      total: () => <span className={tone(totals.overall)}>{signed(totals.overall)}</span>,
    },
  ];

  return (
    <ControlRoomShell
      title="Office · Day Closings"
      context={`Daily closing register · ${MONTH_NAMES[period.month - 1]} ${period.year}`}
      actions={<PeriodControl />}
    >
      <KpiStrip
        columns={4}
        items={[
          {
            label: "Latest Locked Day",
            value: latestClosed ? labDate(latestClosed) : NO_DATA,
          },
          { label: "Locked", value: String(lockedCount), hint: `of ${rows.length} records` },
          { label: "Drafts", value: String(rows.length - lockedCount) },
          {
            label: "Period Result",
            value: signed(totals.overall),
            tone: tone(totals.overall),
            hint: "Live + Slots",
          },
        ]}
      />

      <Toolbar
        left={<span className="crl-badge">{rows.length} closing records</span>}
        right={<DensityToggle value={density} onChange={setDensity} />}
      />

      <ControlRoomTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.business_date}
        initialSort={{ key: "date", dir: "desc" }}
        density={density}
        showTotals
        loading={isLoading}
        emptyTitle="No day closings"
        emptyHint="No closing records exist for the selected period."
      />
    </ControlRoomShell>
  );
}
