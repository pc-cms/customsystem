/**
 * FloorTipsTab — unified Day/Week/Month/Year/Custom picker.
 */
import { ReactNode, useMemo, useState } from "react";
import { UserCheck } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { useTipsByRange } from "@/hooks/use-tips";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { TipsLedgerTable } from "./TipsLedgerTable";
import { DateRangePresets, type DatePreset, presetRange } from "@/components/ui/date-range-presets";

export default function FloorTipsTab({ belowHeader }: { belowHeader?: ReactNode }) {
  const initial = presetRange("month");
  const [preset, setPreset] = useState<DatePreset>("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const { data: rows = [] } = useTipsByRange("tips_floor", from, to);

  const periodTotal = useMemo(() => rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0), [rows]);

  return (
    <PageShell>
      <PageHeader
        icon={UserCheck}
        title="Floor Tips"
        subtitle="Per-employee floor staff tips"
        centerSlot={<div className="text-center"><div className="text-[11px] uppercase text-muted-foreground">Period Total</div><div className="font-mono text-lg font-bold">{formatCurrency(periodTotal)}</div></div>}
        belowHeader={belowHeader}
      >
        <DateRangePresets
          preset={preset}
          from={from}
          to={to}
          onChange={(n) => { setPreset(n.preset); setFrom(n.from); setTo(n.to); }}
          className="print:hidden"
        />
      </PageHeader>
      <PageSection card={false}>
        <TipsLedgerTable rows={rows} emptyMessage="No Floor tips in this period" fallbackEmployee="Unknown" />
      </PageSection>
    </PageShell>
  );
}
