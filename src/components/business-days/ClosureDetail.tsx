import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CashPanel, ExpensesPanel, CashlessPanel, TableCheckPanel,
  ChipCountPanel, BreaklistPanel, PlayerStatsPanel,
  BarShiftsPanel, BarStockCountsPanel,
} from "./ReportPanels";
import type { BusinessDayClosure, SnapshotSection } from "@/hooks/use-business-day-history";
import { formatNumberSpaces } from "@/lib/currency";

type TabDef = { key: string; label: string; render: (rows: any[], date: string, casinoId: string) => JSX.Element };

const TABS: TabDef[] = [
  { key: "cash_counts",      label: "Cash",        render: (rows, d, c) => <CashPanel        rows={rows} businessDate={d} casinoId={c} /> },
  { key: "expenses",         label: "Expenses",    render: (rows, d, c) => <ExpensesPanel    rows={rows} businessDate={d} casinoId={c} /> },
  { key: "cashless",         label: "Cashless",    render: (rows, d, c) => <CashlessPanel    rows={rows} businessDate={d} casinoId={c} /> },
  { key: "table_tracker",    label: "Table Check", render: (rows, d, c) => <TableCheckPanel  rows={rows} businessDate={d} casinoId={c} /> },
  { key: "chip_snapshots",   label: "Chips Count", render: (rows, d, c) => <ChipCountPanel   rows={rows} businessDate={d} casinoId={c} /> },
  { key: "breaklist",        label: "Breaklist",   render: (rows, d, c) => <BreaklistPanel   rows={rows} businessDate={d} casinoId={c} /> },
  { key: "player_stats",     label: "Player Stats",render: (rows, d, c) => <PlayerStatsPanel rows={rows} businessDate={d} casinoId={c} /> },
  { key: "pos_shifts",       label: "Bar · Shifts",render: (rows, d, c) => <BarShiftsPanel   rows={rows} businessDate={d} casinoId={c} /> },
  { key: "pos_stock_counts", label: "Bar · Stock", render: (rows, d, c) => <BarStockCountsPanel rows={rows} businessDate={d} casinoId={c} /> },
];

export const ClosureDetail = ({ closure }: { closure: BusinessDayClosure }) => {
  const snap = closure.snapshot || {};
  const daily = (snap as any).daily_result as {
    tables_total?: number;
    slots_total?: number;
    chip_miss_total?: number;
    cards_miss_total?: number;
    expenses_total?: number;
    bar_pl?: number;
    net_result?: number;
  } | undefined;
  const bar = (snap as any).bar_totals as {
    gross_tzs?: number;
    cash_tzs?: number;
    card_tzs?: number;
    comp_house_tzs?: number;
    comp_player_tzs?: number;
    player_charge_tzs?: number;
    cogs_tzs?: number;
    pl_tzs?: number;
    bills_count?: number;
  } | undefined;

  return (
    <div className="space-y-3">
      {daily && <DailyResultBlock daily={daily} />}
      {bar && <BarTotalsBlock bar={bar} />}
      <Tabs defaultValue="cash_counts" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          {TABS.map(t => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs">
              {t.label}
              <span className="ml-1.5 text-[10px] text-muted-foreground">
                {Array.isArray((snap as any)[t.key]) ? (snap as any)[t.key].length : 0}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(t => (
          <TabsContent key={t.key} value={t.key} className="mt-3">
            {t.render(Array.isArray((snap as any)[t.key]) ? (snap as any)[t.key] : [], closure.business_date, closure.casino_id)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

const fmt = (n: number) => {
  const v = Math.round(Number(n || 0));
  const sign = v < 0 ? "−" : v > 0 ? "+" : "";
  return `${sign}${formatNumberSpaces(Math.abs(v))}`;
};

const DailyResultBlock = ({ daily }: { daily: any }) => {
  const net = Number(daily.net_result || 0);
  const cls = net < 0 ? "cms-amount-negative" : net > 0 ? "cms-amount-positive" : "";
  return (
    <div className="rounded-md border-2 border-primary/40 bg-primary/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wider">Daily Result</h3>
        <span className={`font-mono text-2xl font-bold ${cls}`}>{fmt(net)}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
        <Cell label="Tables"       value={Number(daily.tables_total || 0)}      signed />
        <Cell label="+ Slots"      value={Number(daily.slots_total || 0)}       signed />
        <Cell label="− Chip Miss"  value={-Number(daily.chip_miss_total || 0)}  signed />
        <Cell label="− Cards Miss" value={-Number(daily.cards_miss_total || 0)} signed />
        <Cell label="− Expenses"   value={-Number(daily.expenses_total || 0)}   signed />
        <Cell label="+ Bar P&L"    value={Number(daily.bar_pl || 0)}            signed />
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Net = Tables + Slots − Chip Miss − Cards Miss − Expenses + Bar P&L. Internal transfers (Collections, Fills, Slots↔Live) are excluded.
      </p>
    </div>
  );
};

const BarTotalsBlock = ({ bar }: { bar: any }) => {
  const gross = Number(bar.gross_tzs || 0);
  const pl = Number(bar.pl_tzs || 0);
  const plCls = pl < 0 ? "cms-amount-negative" : pl > 0 ? "cms-amount-positive" : "";
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold uppercase tracking-wider">Bar · POS</h3>
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Gross</span>
          <span className="font-mono text-xl font-bold">{fmt(gross)}</span>
          <span className="text-[10px] uppercase text-muted-foreground tracking-wider ml-2">P&L</span>
          <span className={`font-mono text-2xl font-bold ${plCls}`}>{fmt(pl)}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 text-xs">
        <Cell label="Bills"          value={Number(bar.bills_count || 0)} />
        <Cell label="Cash"           value={Number(bar.cash_tzs || 0)} signed />
        <Cell label="Card"           value={Number(bar.card_tzs || 0)} signed />
        <Cell label="Player charge"  value={Number(bar.player_charge_tzs || 0)} signed />
        <Cell label="Comp · House"   value={Number(bar.comp_house_tzs || 0)} signed />
        <Cell label="Comp · Player"  value={Number(bar.comp_player_tzs || 0)} signed />
        <Cell label="− COGS"         value={-Number(bar.cogs_tzs || 0)} signed />
        <Cell label="= P&L"          value={pl} signed />
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        P&L = Gross − COGS (cost of goods sold at moving average cost). Comps reduce settled cash but stay in gross sales. Player charges accrue as separate expenses against the player.
      </p>
    </div>
  );
};

const Cell = ({ label, value, signed }: { label: string; value: number; signed?: boolean }) => {
  const cls = !signed ? "" : value < 0 ? "cms-amount-negative" : value > 0 ? "cms-amount-positive" : "";
  return (
    <div className="rounded border border-border bg-card px-2 py-1.5">
      <p className="text-[9px] uppercase text-muted-foreground tracking-wider">{label}</p>
      <p className={`font-mono font-bold text-sm ${cls}`}>{fmt(value)}</p>
    </div>
  );
};
