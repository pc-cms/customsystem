import { NumberInput } from "@/components/ui/number-input";
import { formatNumberSpaces, CASH_DENOMS } from "@/lib/currency";
import ChipDenomInput from "@/components/ChipDenomInput";
import CashDenomInput from "./CashDenomInput";
import { MOBILE_PROVIDERS, mobileTotal, type MobileProviders, type Banks } from "./CageHelpers";

/** Render one Cashless / Mobile Money provider block (IN, OUT, or Balance).
 *  Per-row gray placeholder = suggestion from /cashless transactions. */
const ProviderBlock = ({
  title, values, onChange, suggestion, hintLabel, sectionCls, titleCls,
}: {
  title: string;
  values: MobileProviders;
  onChange: (v: MobileProviders) => void;
  suggestion?: Partial<Record<string, number>>;
  hintLabel: string;
  sectionCls: string;
  titleCls: string;
}) => {
  const mdRow = "flex items-center gap-2";
  const mdChip = "cms-chip text-[10px] bg-muted text-foreground h-7 w-16 shrink-0 justify-center";
  const mdInput = "no-spin font-mono text-sm h-8 w-24 flex-1 min-w-0 rounded border border-border bg-background px-2 text-right text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

  const total = mobileTotal(values);
  const suggestionTotal = suggestion
    ? Object.values(suggestion).reduce((s, v) => s + (Number(v) || 0), 0)
    : 0;
  const hasSuggestions = !!suggestion && suggestionTotal !== 0;

  const applySuggestions = () => {
    if (!suggestion) return;
    const next: MobileProviders = { ...values };
    MOBILE_PROVIDERS.forEach(p => {
      if (!values[p]) {
        const s = Number(suggestion[p]) || 0;
        if (s) next[p] = s;
      }
    });
    onChange(next);
  };

  return (
    <section className={sectionCls}>
      <div className="flex items-center justify-between mb-2">
        <p className={titleCls + " mb-0"}>{title}</p>
        {hasSuggestions && (
          <button
            type="button"
            onClick={applySuggestions}
            className="text-[9px] uppercase tracking-wider text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            title="Fill empty rows from /cashless transactions"
          >
            Apply hint
          </button>
        )}
      </div>
      <div className="space-y-1">
        {MOBILE_PROVIDERS.map(provider => {
          const hint = Number(suggestion?.[provider]) || 0;
          const placeholder = hint ? formatNumberSpaces(hint) : "0";
          return (
            <div key={provider} className={mdRow}>
              <span className={mdChip}>{provider}</span>
              <NumberInput
                value={values[provider] || ""}
                onChange={v => onChange({ ...values, [provider]: Number(v) || 0 })}
                className={mdInput}
                placeholder={placeholder}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-border">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total</span>
        <span className="font-mono text-sm font-bold text-card-foreground whitespace-nowrap">TZS {formatNumberSpaces(total)}</span>
      </div>
      {hasSuggestions && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{hintLabel}</span>
          <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">TZS {formatNumberSpaces(suggestionTotal)}</span>
        </div>
      )}
    </section>
  );
};

const CashCountGrid = ({
  chips, onChipsChange,
  cash, onCashChange,
  banks, onBanksChange,
  mobile, onMobileChange,
  chipPlaceholder,
  mobileSuggestion,
  cashlessIn, onCashlessInChange, cashlessInSuggestion,
  cashlessOut, onCashlessOutChange, cashlessOutSuggestion,
  rates,
  hideChips = false,
  hideMobile = false,
}: {
  chips: Record<number, number>;
  onChipsChange: (v: Record<number, number>) => void;
  cash: Record<string, Record<number, number>>;
  onCashChange: (currency: string, v: Record<number, number>) => void;
  banks: Banks;
  onBanksChange: (v: Banks) => void;
  mobile: MobileProviders;
  onMobileChange: (v: MobileProviders) => void;
  chipPlaceholder?: Record<number, number>;
  /** Per-provider gray suggestion for the Mobile Money Balance block
   *  (net IN−OUT from /cashless). */
  mobileSuggestion?: Partial<Record<string, number>>;
  /** Optional Cashless IN block (per provider). When provided, renders
   *  above the Mobile Balance block. */
  cashlessIn?: MobileProviders;
  onCashlessInChange?: (v: MobileProviders) => void;
  cashlessInSuggestion?: Partial<Record<string, number>>;
  /** Optional Cashless OUT block (per provider). */
  cashlessOut?: MobileProviders;
  onCashlessOutChange?: (v: MobileProviders) => void;
  cashlessOutSuggestion?: Partial<Record<string, number>>;
  rates?: Record<string, number>;
  /** Hide the TZS Chips column when chips are entered elsewhere (e.g. Close Shift). */
  hideChips?: boolean;
  /** Hide the Mobile Money block (e.g. Cage Slots derives it from Cashless IN/OUT). */
  hideMobile?: boolean;
}) => {
  const banksTzsTotal = (banks.tzs || 0) + (banks.usd || 0) * (rates?.["USD"] || 0);

  const mdRow = "flex items-center gap-2";
  const mdChip = "cms-chip text-[10px] bg-muted text-foreground h-7 w-16 shrink-0 justify-center";
  const mdInput = "no-spin font-mono text-sm h-8 w-24 flex-1 min-w-0 rounded border border-border bg-background px-2 text-right text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

  const sectionCls = "rounded-xl border border-border bg-background/40 p-3 flex flex-col";
  const titleCls = "text-xs font-bold text-foreground uppercase tracking-[0.22em] mb-2";
  const stackCls = "flex flex-col gap-3";

  const showCashlessIn = !!onCashlessInChange && !!cashlessIn;
  const showCashlessOut = !!onCashlessOutChange && !!cashlessOut;

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 items-start ${hideChips ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}>
      {!hideChips && (
        /* Col 1 — TZS Chips, full height */
        <section className={sectionCls}>
          <p className={titleCls}>TZS Chips</p>
          <ChipDenomInput
            values={chips}
            onChange={onChipsChange}
            showValue={false}
            placeholder={chipPlaceholder}
            columns={1}
            size="lg"
          />
        </section>
      )}
      {/* Col 2 — TZS Cash + Cashless IN/OUT/Balance + Banks */}
      <div className={stackCls}>
        <section className={sectionCls}>
          <p className={titleCls}>TZS Cash</p>
          <CashDenomInput values={cash["TZS"] || {}} onChange={v => onCashChange("TZS", v)} denoms={CASH_DENOMS["TZS"] || []} currency="TZS" size="lg" />
        </section>

        {showCashlessIn && (
          <ProviderBlock
            title="Cashless IN"
            values={cashlessIn!}
            onChange={onCashlessInChange!}
            suggestion={cashlessInSuggestion}
            hintLabel="Hint · Cashless IN"
            sectionCls={sectionCls}
            titleCls={titleCls}
          />
        )}

        {showCashlessOut && (
          <ProviderBlock
            title="Cashless OUT"
            values={cashlessOut!}
            onChange={onCashlessOutChange!}
            suggestion={cashlessOutSuggestion}
            hintLabel="Hint · Cashless OUT"
            sectionCls={sectionCls}
            titleCls={titleCls}
          />
        )}

        {!hideMobile && (
          <ProviderBlock
            title={showCashlessIn || showCashlessOut ? "Mobile Balance" : "Mobile Money"}
            values={mobile}
            onChange={onMobileChange}
            suggestion={mobileSuggestion}
            hintLabel="Hint · Cashless net"
            sectionCls={sectionCls}
            titleCls={titleCls}
          />
        )}

        <section className={sectionCls}>
          <p className={titleCls}>Banks</p>
          <div className="space-y-1">
            <div className={mdRow}>
              <span className={mdChip}>TZS</span>
              <NumberInput value={banks.tzs || ""} onChange={v => onBanksChange({ ...banks, tzs: Number(v) || 0 })} className={mdInput} placeholder="0" />
            </div>
            <div className={mdRow}>
              <span className={mdChip}>USD</span>
              <NumberInput value={banks.usd || ""} onChange={v => onBanksChange({ ...banks, usd: Number(v) || 0 })} className={mdInput} placeholder="0" />
            </div>
          </div>
          <div className="pt-2 mt-2 border-t border-border space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">USD in TZS</span>
              <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">TZS {formatNumberSpaces((banks.usd || 0) * (rates?.["USD"] || 0))}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total</span>
              <span className="font-mono text-sm font-bold text-card-foreground whitespace-nowrap">TZS {formatNumberSpaces(banksTzsTotal)}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Col 3 — USD + KES */}
      <div className={stackCls}>
        <section className={sectionCls}>
          <p className={titleCls}>USD Cash</p>
          <CashDenomInput values={cash["USD"] || {}} onChange={v => onCashChange("USD", v)} denoms={CASH_DENOMS["USD"] || []} currency="USD" size="lg" />
        </section>
        <section className={sectionCls}>
          <p className={titleCls}>KES Cash</p>
          <CashDenomInput values={cash["KES"] || {}} onChange={v => onCashChange("KES", v)} denoms={CASH_DENOMS["KES"] || []} currency="KES" size="lg" />
        </section>
      </div>

      {/* Col 4 — EUR + GBP */}
      <div className={stackCls}>
        <section className={sectionCls}>
          <p className={titleCls}>EUR Cash</p>
          <CashDenomInput values={cash["EUR"] || {}} onChange={v => onCashChange("EUR", v)} denoms={CASH_DENOMS["EUR"] || []} currency="EUR" size="lg" />
        </section>
        <section className={sectionCls}>
          <p className={titleCls}>GBP Cash</p>
          <CashDenomInput values={cash["GBP"] || {}} onChange={v => onCashChange("GBP", v)} denoms={CASH_DENOMS["GBP"] || []} currency="GBP" size="lg" />
        </section>
      </div>
    </div>
  );
};

export default CashCountGrid;
