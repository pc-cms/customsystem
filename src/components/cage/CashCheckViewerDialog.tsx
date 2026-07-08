/**
 * CashCheckViewerDialog — read-only snapshot of a single cash_counts row.
 * Renders chips + per-currency cash + banks + mobile exactly as captured.
 * Empty sections are collapsed (<details>) so the viewer can verify zeros.
 */
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import ChipToken from "@/components/ChipToken";
import { CURRENCIES, CASH_DENOMS, CHIP_DENOMS, formatCurrency, formatNumberSpaces, formatCashDenomLabel, CURRENCY_SYMBOLS } from "@/lib/currency";
import { useVisibleChipDenoms } from "@/hooks/use-chip-colors";
import { MOBILE_PROVIDERS } from "@/components/cage/CageHelpers";
import type { Tables } from "@/integrations/supabase/types";

type Denoms = {
  chips?: Record<number, number>;
  cash?: Record<string, Record<number, number>>;
  bank?: { tzs: number; usd: number };
  mobile?: Record<string, number>;
  cashless_in_providers?: Record<string, number>;
  cashless_out_providers?: Record<string, number>;
  totals?: Record<string, any>;
};

const SLOTS_PROVIDERS = ["MPESA", "TIGO", "HALOTEL", "AIRTEL"] as const;

const sumRecord = (r?: Record<string | number, number>) =>
  r ? Object.values(r).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
const sumValue = (r?: Record<number, number>) =>
  r ? Object.entries(r).reduce((s, [d, c]) => s + Number(d) * (Number(c) || 0), 0) : 0;

const Section = ({ title, isEmpty, children }: { title: string; isEmpty: boolean; children: React.ReactNode }) => {
  if (isEmpty) {
    return (
      <details className="rounded-xl border border-border bg-background/40">
        <summary className="cursor-pointer list-none px-4 py-2 flex items-center justify-between text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.22em]">
          <span>{title}</span>
          <span className="font-mono normal-case tracking-normal text-muted-foreground/70">· empty</span>
        </summary>
        <div className="px-4 pb-3 pt-1 opacity-60">{children}</div>
      </details>
    );
  }
  return (
    <section className="rounded-xl border border-border bg-background/40 p-4 space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.22em]">{title}</p>
      {children}
    </section>
  );
};

const ChipsView = ({ chips }: { chips: Record<number, number> }) => {
  const visibleDenoms = useVisibleChipDenoms();
  // Show visible denoms + any historical denom present in this snapshot (even if hidden now).
  const denoms = [...new Set([...visibleDenoms, ...Object.keys(chips).map(Number).filter(n => (chips[n] || 0) > 0)])]
    .sort((a, b) => b - a);
  return (
  <div className="space-y-1.5">
    {denoms.map(d => {
      const qty = chips[d] || 0;
      return (
        <div key={d} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 font-mono">
          <ChipToken denom={d} />
          <span className={`tabular-nums text-lg font-bold text-right whitespace-nowrap ${qty > 0 ? "text-card-foreground" : "text-muted-foreground/40"}`}>
            {qty || "·"}
          </span>
          <span className={`tabular-nums text-base whitespace-nowrap text-right min-w-[7rem] ${qty > 0 ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
            {qty > 0 ? formatNumberSpaces(qty * d) : "·"}
          </span>
        </div>
      );
    })}
    <div className="flex justify-between items-center pt-2 mt-1 border-t border-border">
      <span className="text-muted-foreground uppercase tracking-wider text-[10px]">Total</span>
      <span className="font-mono text-base font-bold text-card-foreground whitespace-nowrap">TZS {formatNumberSpaces(sumValue(chips))}</span>
    </div>
  </div>
  );
};

const CashView = ({ values, denoms, currency }: { values: Record<number, number>; denoms: number[]; currency: string }) => {
  const total = sumValue(values);
  return (
    <div className="space-y-1">
      {denoms.map(d => {
        const qty = values[d] || 0;
        return (
          <div key={d} className="grid grid-cols-[3.75rem_1fr_auto] items-center gap-3 font-mono">
            <span className="cms-chip text-[9px] bg-muted text-foreground h-6 w-15 shrink-0 justify-center">
              {formatCashDenomLabel(d, currency)}
            </span>
            <span className={`tabular-nums text-lg font-bold text-right whitespace-nowrap ${qty > 0 ? "text-card-foreground" : "text-muted-foreground/40"}`}>
              {qty || "·"}
            </span>
            <span className={`tabular-nums text-base whitespace-nowrap text-right min-w-[7rem] ${qty > 0 ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
              {qty > 0 ? formatNumberSpaces(qty * d) : "·"}
            </span>
          </div>
        );
      })}
      <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
        <span className="text-[10px] font-medium text-muted-foreground uppercase">Total</span>
        <span className="font-mono text-base font-bold text-card-foreground whitespace-nowrap">
          {currency === "TZS" ? `TZS ${formatNumberSpaces(total)}` : `${CURRENCY_SYMBOLS[currency] || currency}${formatNumberSpaces(total)}`}
        </span>
      </div>
    </div>
  );
};

const KeyValRow = ({ label, value, mono = true, muted = false }: { label: string; value: React.ReactNode; mono?: boolean; muted?: boolean }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="text-muted-foreground">{label}</span>
    <span className={`${mono ? "font-mono tabular-nums" : ""} ${muted ? "text-muted-foreground/50" : "text-card-foreground font-medium"}`}>{value}</span>
  </div>
);

const CashCheckViewerDialog = ({
  open,
  onOpenChange,
  check,
  cashierName,
  balanceMode = "default",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  check: Tables<"cash_counts"> | null;
  cashierName?: string;
  balanceMode?: "default" | "slots";
}) => {
  if (!check) return null;
  const d = (check.denominations || {}) as Denoms;
  const chips = d.chips || {};
  const cash = d.cash || {};
  const bank = d.bank || { tzs: 0, usd: 0 };
  const mobile = d.mobile || {};
  const t = d.totals || {};
  const expected = Number(t.expected ?? 0);
  const counted = Number(t.counted ?? Number(check.total));
  const diff = Number(t.difference ?? counted - expected);

  // Slots canonical fields
  const slotsSystem = Number(t.system_result ?? t.slots_result ?? 0);
  const slotsBalance = Number(t.shift_balance ?? t.balance ?? 0);
  const slotsCashCount = Number(t.total_tzs ?? counted);
  const slotsCashlessIn = Number(t.cashless_in ?? 0);
  const slotsCashlessOut = Number(t.cashless_out ?? 0);
  const slotsExpenses = Number(t.expenses ?? 0);
  const slotsTransferIn = Number(t.transfer_in ?? 0);
  const slotsTransferOut = Number(t.transfer_out ?? 0);

  const balanced = !!t.balanced || diff === 0;
  const isOpening = !!t.is_opening;
  const isClosing = !!t.is_closing;
  const kindTag = isOpening ? "Opening" : isClosing ? "Closing" : null;

  const stamp = new Date(check.created_at).toLocaleString("en-GB", {
    timeZone: "Africa/Dar_es_Salaam",
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });

  const SlotsStat = ({ label, value, signed, emphasize }: { label: string; value: number; signed?: boolean; emphasize?: boolean }) => {
    const cls = value < 0 ? "text-destructive" : value > 0 && signed ? "text-success" : "text-card-foreground";
    return (
      <div className="text-center">
        <p className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</p>
        <p className={`font-mono ${emphasize ? "text-2xl font-bold" : "text-base font-semibold"} ${cls} whitespace-nowrap`}>
          {signed && value > 0 ? "+" : ""}{formatCurrency(value)}
        </p>
      </div>
    );
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-3">
          <span>{`Cash Check · ${stamp}${kindTag ? ` · ${kindTag}` : ""}`}</span>
          {balanceMode === "slots" && (
            <span className={`font-mono text-xs tabular-nums ${slotsBalance === 0 ? "text-success" : slotsBalance < 0 ? "text-destructive" : "text-success"}`}>
              {slotsBalance === 0 ? "· Balanced" : `· ${slotsBalance > 0 ? "+" : ""}${formatCurrency(slotsBalance)}`}
            </span>
          )}
        </span>
      }
      description={cashierName}
      size="4xl"
    >
      <div className="space-y-4">
        {/* Totals strip */}
        {balanceMode === "slots" ? (
          <>
            <div className="cms-panel p-4 text-center rounded-md border-2 border-primary/40 bg-primary/5">
              <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Shift Balance</p>
              <p className={`font-mono text-3xl font-bold whitespace-nowrap ${slotsBalance < 0 ? "cms-amount-negative" : slotsBalance > 0 ? "cms-amount-positive" : "text-card-foreground"}`}>
                {slotsBalance > 0 ? "+" : ""}{formatCurrency(slotsBalance)}
              </p>
              <p className="text-[9px] text-muted-foreground mt-0.5">CDR − System Result − Cards Miss</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 cms-panel p-3">
              <SlotsStat label="System Result" value={slotsSystem} signed />
              <SlotsStat label="Cash Counted" value={slotsCashCount} />
              <SlotsStat label="Expenses" value={slotsExpenses} />
              <SlotsStat label="Cashless IN" value={slotsCashlessIn} />
              <SlotsStat label="Cashless OUT" value={slotsCashlessOut} />
              <SlotsStat label="Transfer IN" value={slotsTransferIn} />
              <SlotsStat label="Transfer OUT" value={slotsTransferOut} />
            </div>

            {/* Per-provider breakdown: shows EXACTLY which provider contributes how much
                to the mobile_total_tzs in the saved snapshot. */}
            {(() => {
              const inP = d.cashless_in_providers || {};
              const outP = d.cashless_out_providers || {};
              const mob = mobile || {};
              const anyData = SLOTS_PROVIDERS.some(p =>
                Number(inP[p] || 0) || Number(outP[p] || 0) || Number(mob[p] || 0)
              );
              if (!anyData) return null;
              const totalIn = SLOTS_PROVIDERS.reduce((s, p) => s + Number(inP[p] || 0), 0);
              const totalOut = SLOTS_PROVIDERS.reduce((s, p) => s + Number(outP[p] || 0), 0);
              const totalNet = totalIn - totalOut;
              const mobileTzs = Number(t.mobile_tzs ?? sumRecord(mob) ?? totalNet);
              return (
                <section className="rounded-xl border border-border bg-background/40 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.22em]">
                      Mobile Providers · IN − OUT = NET
                    </p>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      Σ NET → mobile_total_tzs
                    </span>
                  </div>
                  <table className="w-full text-xs font-mono">
                    <thead className="text-muted-foreground border-b border-border">
                      <tr>
                        <th className="text-left py-1">Provider</th>
                        <th className="text-right">IN</th>
                        <th className="text-right">OUT</th>
                        <th className="text-right">NET (IN−OUT)</th>
                        <th className="text-right">Snapshot mobile</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SLOTS_PROVIDERS.map(p => {
                        const i = Number(inP[p] || 0);
                        const o = Number(outP[p] || 0);
                        const n = i - o;
                        const snap = Number(mob[p] || 0);
                        if (!i && !o && !snap) return null;
                        return (
                          <tr key={p} className="border-b border-border/50">
                            <td className="py-1">{p}</td>
                            <td className={`text-right ${i ? "text-success" : "text-muted-foreground/40"}`}>
                              {i ? "+" + formatNumberSpaces(i) : "·"}
                            </td>
                            <td className={`text-right ${o ? "text-destructive" : "text-muted-foreground/40"}`}>
                              {o ? "−" + formatNumberSpaces(o) : "·"}
                            </td>
                            <td className={`text-right font-bold ${n < 0 ? "text-destructive" : n > 0 ? "text-success" : "text-muted-foreground/40"}`}>
                              {n !== 0 ? (n > 0 ? "+" : "") + formatNumberSpaces(n) : "·"}
                            </td>
                            <td className={`text-right ${snap ? "text-card-foreground" : "text-muted-foreground/40"}`}>
                              {snap ? formatNumberSpaces(snap) : "·"}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="font-bold border-t border-border">
                        <td className="py-1">TOTAL</td>
                        <td className="text-right text-success">+{formatNumberSpaces(totalIn)}</td>
                        <td className="text-right text-destructive">−{formatNumberSpaces(totalOut)}</td>
                        <td className={`text-right ${totalNet < 0 ? "text-destructive" : "text-success"}`}>
                          {totalNet > 0 ? "+" : ""}{formatNumberSpaces(totalNet)}
                        </td>
                        <td className="text-right">{formatNumberSpaces(mobileTzs)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-[10px] text-muted-foreground">
                    mobile_total_tzs в этом чеке = <span className="font-mono">{formatNumberSpaces(mobileTzs)}</span>,
                    Σ NET = <span className="font-mono">{(totalNet >= 0 ? "+" : "") + formatNumberSpaces(totalNet)}</span>
                    {Math.abs(mobileTzs - totalNet) > 0 && (
                      <span className="text-destructive ml-1">· расхождение {formatNumberSpaces(mobileTzs - totalNet)}</span>
                    )}
                  </p>
                </section>
              );
            })()}
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 cms-panel p-4">
              <div className="text-center">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Expected</p>
                <p className="font-mono text-2xl font-bold text-card-foreground whitespace-nowrap">{formatCurrency(expected)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Counted</p>
                <p className="font-mono text-2xl font-bold text-card-foreground whitespace-nowrap">{formatCurrency(counted)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Diff</p>
                <p className={`font-mono text-2xl font-bold whitespace-nowrap ${balanced ? "text-success" : "text-destructive"}`}>
                  {balanced ? "Balanced" : `${diff >= 0 ? "+" : ""}${formatCurrency(diff)}`}
                </p>
              </div>
            </div>

            {/* Cashless per-provider IN / OUT / NET — captured at Close Shift.
                Present here so managers can see how cashless contributes to
                Shift Balance (formula: CDR + CashlessIn − CashlessOut). */}
            {(() => {
              const inP = d.cashless_in_providers || {};
              const outP = d.cashless_out_providers || {};
              const anyData = SLOTS_PROVIDERS.some(p =>
                Number(inP[p] || 0) || Number(outP[p] || 0)
              ) || Number(t.cashless_in || 0) || Number(t.cashless_out || 0);
              if (!anyData) return null;
              const totalIn = SLOTS_PROVIDERS.reduce((s, p) => s + Number(inP[p] || 0), 0)
                || Number(t.cashless_in || 0);
              const totalOut = SLOTS_PROVIDERS.reduce((s, p) => s + Number(outP[p] || 0), 0)
                || Number(t.cashless_out || 0);
              const totalNet = totalIn - totalOut;
              return (
                <section className="rounded-xl border border-border bg-background/40 p-4 space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.22em]">
                    Cashless · IN − OUT = NET (manual @ close)
                  </p>
                  <table className="w-full text-xs font-mono">
                    <thead className="text-muted-foreground border-b border-border">
                      <tr>
                        <th className="text-left py-1">Provider</th>
                        <th className="text-right">IN</th>
                        <th className="text-right">OUT</th>
                        <th className="text-right">NET</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SLOTS_PROVIDERS.map(p => {
                        const i = Number(inP[p] || 0);
                        const o = Number(outP[p] || 0);
                        const n = i - o;
                        if (!i && !o) return null;
                        return (
                          <tr key={p} className="border-b border-border/50">
                            <td className="py-1">{p}</td>
                            <td className={`text-right ${i ? "text-success" : "text-muted-foreground/40"}`}>
                              {i ? "+" + formatNumberSpaces(i) : "·"}
                            </td>
                            <td className={`text-right ${o ? "text-destructive" : "text-muted-foreground/40"}`}>
                              {o ? "−" + formatNumberSpaces(o) : "·"}
                            </td>
                            <td className={`text-right font-bold ${n < 0 ? "text-destructive" : n > 0 ? "text-success" : "text-muted-foreground/40"}`}>
                              {n !== 0 ? (n > 0 ? "+" : "") + formatNumberSpaces(n) : "·"}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="font-bold border-t border-border">
                        <td className="py-1">TOTAL</td>
                        <td className="text-right text-success">+{formatNumberSpaces(totalIn)}</td>
                        <td className="text-right text-destructive">−{formatNumberSpaces(totalOut)}</td>
                        <td className={`text-right ${totalNet < 0 ? "text-destructive" : "text-success"}`}>
                          {totalNet > 0 ? "+" : ""}{formatNumberSpaces(totalNet)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="text-[10px] text-muted-foreground">
                    Влияет на Shift Balance через формулу CDR + CashlessIn − CashlessOut.
                  </p>
                </section>
              );
            })()}
          </>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Column 1: TZS Chips (Live Game only) + TZS Cash */}
          <div className="grid gap-4 content-start">
            {balanceMode !== "slots" && (
              <Section title="TZS Chips" isEmpty={sumValue(chips) === 0}>
                <ChipsView chips={chips} />
              </Section>
            )}
            <Section title="TZS Cash" isEmpty={sumValue(cash["TZS"] || {}) === 0}>
              <CashView values={cash["TZS"] || {}} denoms={CASH_DENOMS["TZS"] || []} currency="TZS" />
            </Section>
          </div>

          {/* Column 2: foreign currencies + mobile */}
          <div className="grid gap-4 content-start">
            {CURRENCIES.filter(c => c !== "TZS").map(cur => (
              <Section key={cur} title={`${cur} Cash`} isEmpty={sumValue(cash[cur] || {}) === 0}>
                <CashView values={cash[cur] || {}} denoms={CASH_DENOMS[cur] || []} currency={cur} />
              </Section>
            ))}
          </div>

          {/* Column 3: Banks + Mobile */}
          <div className="grid gap-4 content-start">
            <Section title="Bank Balances" isEmpty={(bank.tzs || 0) === 0 && (bank.usd || 0) === 0}>
              <div className="space-y-1">
                <KeyValRow label="TZS" value={formatNumberSpaces(bank.tzs || 0)} muted={!bank.tzs} />
                <KeyValRow label="USD" value={formatNumberSpaces(bank.usd || 0)} muted={!bank.usd} />
              </div>
            </Section>
            {balanceMode !== "slots" && (
              <Section title="Mobile Money" isEmpty={sumRecord(mobile) === 0}>
                <div className="space-y-1">
                  {MOBILE_PROVIDERS.map(p => (
                    <KeyValRow key={p} label={p} value={formatNumberSpaces(mobile[p] || 0)} muted={!mobile[p]} />
                  ))}
                  <div className="flex items-center justify-between pt-1 mt-1 border-t border-border">
                    <span className="text-[10px] uppercase text-muted-foreground">Total</span>
                    <span className="font-mono text-xs font-bold text-card-foreground">TZS {formatNumberSpaces(sumRecord(mobile))}</span>
                  </div>
                </div>
              </Section>
            )}
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
};

export default CashCheckViewerDialog;
