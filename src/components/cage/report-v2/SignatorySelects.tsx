/**
 * SignatorySelects — cashier (location scoped) + manager (full list) pickers
 * whose names are printed on the closing report signature lines.
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCashierOptions, useManagerOptions } from "./use-signatory-options";

const NONE = "__none__";

interface Props {
  casinoId?: string | null;
  cashier: string;
  manager: string;
  onCashierChange: (v: string) => void;
  onManagerChange: (v: string) => void;
  className?: string;
}

const SignatorySelects = ({
  casinoId, cashier, manager, onCashierChange, onManagerChange, className,
}: Props) => {
  const { data: cashiers = [] } = useCashierOptions(casinoId);
  const { data: managers = [] } = useManagerOptions();

  const pick = (list: string[], current: string) =>
    current && !list.includes(current) ? [current, ...list] : list;

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-2 print:hidden ${className || ""}`}>
      <div>
        <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Closing Cashier</p>
        <Select value={cashier || NONE} onValueChange={v => onCashierChange(v === NONE ? "" : v)}>
          <SelectTrigger className="h-8"><SelectValue placeholder="Select cashier" /></SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value={NONE}>— Not selected —</SelectItem>
            {pick(cashiers, cashier).map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Closing Manager</p>
        <Select value={manager || NONE} onValueChange={v => onManagerChange(v === NONE ? "" : v)}>
          <SelectTrigger className="h-8"><SelectValue placeholder="Select manager" /></SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value={NONE}>— Not selected —</SelectItem>
            {pick(managers, manager).map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default SignatorySelects;
