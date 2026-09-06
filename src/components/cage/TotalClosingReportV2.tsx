/**
 * TotalClosingReportV2 — "Style A — Clear Cards" Total Closing Cash Desk
 * Report (page 4 of the new 4-page set).
 *
 * Self-contained: consolidates BOTH cash desks (Live Game + Slots) for one
 * business date of one casino.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCIES, CASH_DENOMS, formatNumberSpaces, allDenoms} from "@/lib/currency";
import { PRINT_REPORT_ACCENTS_CSS } from "@/lib/print-report-accents";
import { useReportWallets, withExtraKeys } from "./report-v2/wallet-rows";
import {
  A4_CLASS, A4_STYLE, Card, CardTable, PageFooter, ReportHeader, Signatures, buildReportId, num, signed,
} from "./report-v2/primitives";

export type TotalClosingReportV2Props = {
  casinoId: string;
  casinoName?: string;
  businessDate: string;
  managerName?: string;
  reportStatus?: string;
};

const chanValue = (e: any) => {
  if (!e) return 0;
  const moved = Number(e?.in || 0) !== 0 || Number(e?.out || 0) !== 0;
  return moved ? Number(e.in || 0) - Number(e.out || 0) : Number(e?.final || 0);
};

const sumCashMap = (cash: Record<string | number, number> | undefined) =>
  cash ? Object.entries(cash).reduce((s, [d, q]) => s + Number(d) * (Number(q) || 0), 0) : 0;

const TotalClosingReportV2 = ({
  casinoId, casinoName = "Casino", businessDate, managerName,
  reportStatus = "DRAFT — GBT APPROVAL PENDING",
}: TotalClosingReportV2Props) => {
  const { data } = useQuery({
    queryKey: ["total-closing-v2", casinoId, businessDate],
    enabled: !!casinoId && !!businessDate,
    queryFn: async () => {
      // Business day rollover is 07:00 EAT = 04:00 UTC.
      const fromUtc = `${businessDate}T04:00:00Z`;
      const nx = new Date(`${businessDate}T00:00:00Z`);
      nx.setUTCDate(nx.getUTCDate() + 1);
      const toUtc = `${nx.toISOString().slice(0, 10)}T04:00:00Z`;

      const [liveR, slotsR] = await Promise.all([
        supabase.from("shifts").select("*").eq("casino_id", casinoId)
          .gte("opened_at", fromUtc).lt("opened_at", toUtc).order("opened_at"),
        supabase.from("cage_slots_shifts").select("*").eq("casino_id", casinoId)
          .eq("business_date", businessDate).order("opened_at"),
      ]);
      const liveShifts = liveR.data || [];
      const slotsShifts = slotsR.data || [];

      const [liveExpR, slotsExpR, invR, ratesR, slotsCountsR, cashlessR] = await Promise.all([
        liveShifts.length
          ? supabase.from("expenses").select("amount, approved, shift_id").in("shift_id", liveShifts.map(s => s.id))
          : Promise.resolve({ data: [] as any[] } as any),
        slotsShifts.length
          ? supabase.from("expenses").select("amount, approved, cage_slots_shift_id").in("cage_slots_shift_id", slotsShifts.map(s => s.id))
          : Promise.resolve({ data: [] as any[] } as any),
        slotsShifts.length
          ? supabase.from("cage_slots_cash_inventory").select("*").in("cage_slots_shift_id", slotsShifts.map(s => s.id))
          : Promise.resolve({ data: [] as any[] } as any),
        slotsShifts.length
          ? supabase.from("cage_slots_exchange_rates").select("*").in("cage_slots_shift_id", slotsShifts.map(s => s.id))
          : Promise.resolve({ data: [] as any[] } as any),
        slotsShifts.length
          ? supabase.from("cage_slots_cash_counts").select("cage_slots_shift_id, denominations, created_at")
              .in("cage_slots_shift_id", slotsShifts.map(s => s.id)).order("created_at")
          : Promise.resolve({ data: [] as any[] } as any),
        supabase.from("cashless_transactions").select("direction, amount, cage_type, created_at")
          .eq("casino_id", casinoId).gte("created_at", fromUtc).lt("created_at", toUtc),
      ]);

      return {
        liveShifts,
        slotsShifts,
        liveExpenses: liveExpR.data || [],
        slotsExpenses: slotsExpR.data || [],
        inventory: invR.data || [],
        slotsRates: ratesR.data || [],
        slotsCounts: slotsCountsR.data || [],
        cashless: cashlessR.data || [],
      };
    },
  });

  const wallets = useReportWallets(casinoId);
  const liveShifts = (data?.liveShifts || []) as any[];
  const slotsShifts = (data?.slotsShifts || []) as any[];
  const rates: Record<string, number> = { TZS: 1 };
  (liveShifts[0]?.exchange_rates || {}) && Object.entries(liveShifts[0]?.exchange_rates || {}).forEach(([k, v]) => { rates[k] = Number(v || 0); });
  (data?.slotsRates || []).forEach((r: any) => { rates[r.currency_code] = Number(r.rate_to_tzs || rates[r.currency_code] || 0); });

  /* ---------- Live side ---------- */
  const liveCloser = liveShifts.length ? (liveShifts[liveShifts.length - 1].closing_count || {}) : {};
  const liveOpener = liveShifts.length ? (liveShifts[0].opening_float || {}) : {};
  const liveCashByCur: Record<string, number> = {};
  const liveOpenCashByCur: Record<string, number> = {};
  CURRENCIES.forEach(c => {
    liveCashByCur[c] = sumCashMap((liveCloser as any)?.cash?.[c]);
    liveOpenCashByCur[c] = sumCashMap((liveOpener as any)?.cash?.[c]);
  });
  const toTzs = (byCur: Record<string, number>) =>
    CURRENCIES.reduce((s, c) => s + byCur[c] * (c === "TZS" ? 1 : Number(rates[c] || 0)), 0);
  const liveClosingCash = toTzs(liveCashByCur);
  const liveOpeningCash = toTzs(liveOpenCashByCur);
  const liveBankChannels = (liveCloser as any)?.bank?.channels || {};
  // Slots cash desk records its own bank movements in the closing check.
  const slotsBankChannels: Record<string, any> = {};
  const slotsClosingChecks = new Map<string, any>();
  ((data?.slotsCounts || []) as any[]).forEach(r => {
    if (r?.denominations?.is_opening) return;
    slotsClosingChecks.set(r.cage_slots_shift_id, r);
  });
  slotsClosingChecks.forEach(r => {
    const ch = r?.denominations?.bank?.channels || {};
    Object.entries(ch).forEach(([k, v]: [string, any]) => {
      const acc = (slotsBankChannels[k] ||= { in: 0, out: 0, final: 0 });
      acc.in += Number(v?.in || 0);
      acc.out += Number(v?.out || 0);
      acc.final += Number(v?.final || 0);
    });
  });
  const bankChannels: Record<string, any> = {};
  [liveBankChannels, slotsBankChannels].forEach(src => {
    Object.entries(src || {}).forEach(([k, v]: [string, any]) => {
      const acc = (bankChannels[k] ||= { in: 0, out: 0, final: 0 });
      acc.in += Number(v?.in || 0);
      acc.out += Number(v?.out || 0);
      acc.final += Number(v?.final || 0);
    });
  });
  const liveClosingBank = Number((liveCloser as any)?.bank?.tzs || 0) + Number((liveCloser as any)?.bank?.usd || 0) * Number(rates.USD || 0);
  const liveResult = liveShifts.reduce((s, x) => s + Number(x.tables_result || 0), 0);
  const liveBalance = liveShifts.reduce((s, x) => s + Number(x.balance || 0), 0);
  const liveExpenses = (data?.liveExpenses || []).filter((e: any) => e.approved).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

  /* ---------- Slots side ---------- */
  const inv = (data?.inventory || []) as any[];
  const slotsCashByCur: Record<string, number> = {};
  const slotsOpenCashByCur: Record<string, number> = {};
  CURRENCIES.forEach(c => {
    slotsCashByCur[c] = inv.filter(r => r.inventory_type === "closing" && String(r.currency_code).toUpperCase() === c)
      .reduce((s, r) => s + Number(r.denomination || 0) * Number(r.quantity || 0), 0);
    slotsOpenCashByCur[c] = inv.filter(r => r.inventory_type === "opening" && String(r.currency_code).toUpperCase() === c)
      .reduce((s, r) => s + Number(r.denomination || 0) * Number(r.quantity || 0), 0);
  });
  const slotsClosingCash = toTzs(slotsCashByCur);
  const slotsClosingBank = Object.entries(slotsBankChannels).reduce((s2, [k, v]) => {
    const cur = k.endsWith("_USD") ? "USD" : k.endsWith("_EUR") ? "EUR" : "TZS";
    return s2 + chanValue(v) * (cur === "TZS" ? 1 : Number(rates[cur] || 0));
  }, 0);
  const slotsOpeningCash = toTzs(slotsOpenCashByCur);
  // Canon: slots result is slots_result (net win) — never system_shift_result.
  const slotsResult = slotsShifts.reduce((s, x) => s + Number(x.slots_result || 0), 0);
  const slotsBalance = slotsShifts.reduce((s, x) => s + Number(x.balance || 0), 0);
  const slotsExpenses = (data?.slotsExpenses || []).filter((e: any) => e.approved).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

  /* ---------- Cashless ---------- */
  // Source of truth = the shift's own provider maps (what the cashier closed
  // with). The cashless_transactions journal is only a fallback for desks that
  // record movements there instead.
  const cashless = (data?.cashless || []) as any[];
  const journalNetFor = (cage: string) =>
    cashless.filter(r => r.cage_type === cage)
      .reduce((s, r) => s + (r.direction === "IN" ? Number(r.amount || 0) : -Number(r.amount || 0)), 0);
  const sumProv = (m: any) => Object.values(m || {}).reduce((s: number, v: any) => s + Number(v || 0), 0);
  const shiftNet = (rows: any[]) =>
    rows.reduce((s, x) => s + sumProv(x.cashless_in_providers) - sumProv(x.cashless_out_providers), 0);
  const liveShiftNet = shiftNet(liveShifts);
  const slotsShiftNet = shiftNet(slotsShifts);
  const liveCashlessNet = liveShiftNet || journalNetFor("live_game");
  const slotsCashlessNet = slotsShiftNet || journalNetFor("slots");


  const liveTotalMoney = liveClosingCash + liveClosingBank + liveCashlessNet;
  const slotsTotalMoney = slotsClosingCash + slotsClosingBank + slotsCashlessNet;

  /* ---------- Denomination breakdown ---------- */
  const denomRows: Array<Record<string, React.ReactNode>> = [];
  CURRENCIES.forEach(c => {
    const denoms = allDenoms(c) as number[] | undefined;
    let curLiveTzs = 0, curSlotsTzs = 0;
    (denoms || []).forEach(d => {
      const liveQty = Number(((liveCloser as any)?.cash?.[c] || {})[d] || 0);
      const slotsQty = inv.filter(r => r.inventory_type === "closing"
        && String(r.currency_code).toUpperCase() === c
        && Number(r.denomination) === d)
        .reduce((s, r) => s + Number(r.quantity || 0), 0);
      if (!liveQty && !slotsQty) return;
      const rate = c === "TZS" ? 1 : Number(rates[c] || 0);
      const tzs = (liveQty + slotsQty) * d * rate;
      curLiveTzs += liveQty * d * rate;
      curSlotsTzs += slotsQty * d * rate;
      denomRows.push({
        cur: c, den: formatNumberSpaces(d),
        live: formatNumberSpaces(liveQty), slots: formatNumberSpaces(slotsQty),
        tzs: num(tzs),
      });
    });
    if (curLiveTzs || curSlotsTzs) {
      denomRows.push({
        cur: <span className="font-bold">{c} subtotal</span>, den: "", live: "", slots: "",
        tzs: <span className="font-bold">{num(curLiveTzs + curSlotsTzs)}</span>,
      });
    }
  });

  /* ---------- Bank accounts ---------- */
  const bankDefs = withExtraKeys(wallets.banks, bankChannels)
    .filter(b => chanValue(bankChannels[b.key]));
  const bankCurrencyOf = (key: string) => (key.endsWith("_USD") ? "USD" : key.endsWith("_EUR") ? "EUR" : "TZS");
  const bankRows = bankDefs.map(b => {
    const e = bankChannels[b.key];
    const cur = bankCurrencyOf(b.key);
    const rate = cur === "TZS" ? 1 : Number(rates[cur] || 0);
    const closing = chanValue(e);
    return {
      acc: b.label,
      cur,
      inn: num(Number(e?.in || 0)),
      out: num(Number(e?.out || 0)),
      close: num(closing),
      rate: rate ? num(rate) : "—",
      tzs: num(closing * rate),
    };
  });
  const bankTotalTzs = bankDefs.reduce((s, b) => {
    const cur = bankCurrencyOf(b.key);
    const rate = cur === "TZS" ? 1 : Number(rates[cur] || 0);
    return s + chanValue(bankChannels[b.key]) * rate;
  }, 0);

  const openLive = liveShifts.filter((x: any) => x.status !== "closed").length;
  const openSlots = slotsShifts.filter((x: any) => !["closed", "approved"].includes(String(x.status))).length;
  const openNote = openLive || openSlots
    ? `SHIFT OPEN — ${openLive ? "Live" : ""}${openLive && openSlots ? " + " : ""}${openSlots ? "Slots" : ""} not closed, figures are provisional`
    : "";

  const signManager = managerName
    || liveShifts.map((x: any) => x.manager_name).find(Boolean)
    || slotsShifts.map((x: any) => x.manager_name).find(Boolean)
    || undefined;
  const signCashiers = Array.from(new Set([
    ...slotsShifts.map((x: any) => x.cashier_name).filter(Boolean),
    ...liveShifts.map((x: any) => x.cashier_name).filter(Boolean),
  ])).join(" / ") || "—";

  const totalCash = liveClosingCash + slotsClosingCash;
  const totalMoney = totalCash + bankTotalTzs + liveCashlessNet + slotsCashlessNet;

  return (
    <div className={`${A4_CLASS} bg-white text-black p-2 flex flex-col`} style={A4_STYLE}>
      <style>{PRINT_REPORT_ACCENTS_CSS}</style>


      <ReportHeader
        title="Total Closing Cash Desk Report"
        reportId={buildReportId("TCD", businessDate, casinoId)}
        status={reportStatus}
        businessDate={businessDate}
        cashier={openNote ? `Both cash desks · ${openNote}` : "Both cash desks"}
        manager={signManager}
      />

      <Card title="Cash Desks Summary">
        <CardTable
          cols={[
            { key: "k", label: "Metric", width: "34%" },
            { key: "live", label: "Live Game", align: "right" },
            { key: "slots", label: "Slots", align: "right" },
            { key: "total", label: "Total", align: "right" },
          ]}
          rows={[
            { k: "Opening Cash", live: num(liveOpeningCash), slots: num(slotsOpeningCash), total: num(liveOpeningCash + slotsOpeningCash) },
            { k: "Closing Cash", live: num(liveClosingCash), slots: num(slotsClosingCash), total: num(totalCash) },
            { k: "Closing Bank", live: num(liveClosingBank), slots: num(slotsClosingBank), total: num(liveClosingBank + slotsClosingBank) },
            { k: "Cashless Net", live: signed(liveCashlessNet), slots: signed(slotsCashlessNet), total: signed(liveCashlessNet + slotsCashlessNet) },
            { k: "Tables / System Result", live: signed(liveResult), slots: signed(slotsResult), total: signed(liveResult + slotsResult) },
            { k: "Expenses", live: num(liveExpenses), slots: num(slotsExpenses), total: num(liveExpenses + slotsExpenses) },
            { k: "Total Money", live: num(liveTotalMoney), slots: num(slotsTotalMoney), total: num(liveTotalMoney + slotsTotalMoney) },
          ]}
          footer={{
            k: "Shift Balance",
            live: signed(liveBalance),
            slots: signed(slotsBalance),
            total: signed(liveBalance + slotsBalance),
          }}
        />
      </Card>

      <div className={`rv2-2col${denomRows.length + bankRows.length > 32 ? " rv2-dense" : ""}`}>
      <Card title="Closing Cash by Currency and Denomination">

        <CardTable
          cols={[
            { key: "cur", label: "Currency", width: "20%" },
            { key: "den", label: "Denomination", align: "right" },
            { key: "live", label: "Live Qty", align: "right" },
            { key: "slots", label: "Slots Qty", align: "right" },
            { key: "tzs", label: "Amount TZS", align: "right" },
          ]}
          rows={denomRows}
          footer={{ cur: "Total Cash", den: "", live: "", slots: "", tzs: num(totalCash) }}
        />
      </Card>

      <Card title="Bank Accounts">
        <CardTable
          cols={[
            { key: "acc", label: "Account", width: "24%" },
            { key: "cur", label: "Currency", width: "12%" },
            { key: "inn", label: "In", align: "right" },
            { key: "out", label: "Out", align: "right" },
            { key: "close", label: "Closing", align: "right" },
            { key: "rate", label: "Rate", align: "right" },
            { key: "tzs", label: "Closing TZS", align: "right" },
          ]}
          rows={bankRows}
          footer={{ acc: "Total", cur: "", inn: "", out: "", close: "", rate: "", tzs: num(bankTotalTzs) }}
        />
      </Card>
      </div>

      <Card title="Total Closing Control">

        <CardTable
          cols={[
            { key: "cash", label: "Closing Cash", align: "right" },
            { key: "bank", label: "Closing Bank", align: "right" },
            { key: "cl", label: "Cashless Net", align: "right" },
            { key: "tm", label: "Total Money", align: "right" },
            { key: "bal", label: "Closing Balance", align: "right" },
          ]}
          rows={[{
            cash: num(totalCash),
            bank: num(bankTotalTzs),
            cl: signed(liveCashlessNet + slotsCashlessNet),
            tm: num(totalMoney),
            bal: signed(liveBalance + slotsBalance),
          }]}
        />
      </Card>

      <Signatures left="Slots Cashier / Live Cashier" right="Closing Manager" leftName={signCashiers} rightName={signManager} />
      <PageFooter casinoName={casinoName} page={4} total={4} />
    </div>
  );

};

export default TotalClosingReportV2;
