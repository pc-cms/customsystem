/**
 * Reports → Blanks.
 *
 * Downloadable EMPTY printable forms (PDF). No system data is embedded —
 * only headers and grids for manual completion.
 */
import { FileDown, Printer, Grid3x3, Coins, Table as TableIcon } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { useGamingTables } from "@/hooks/use-tables";
import { downloadShiftClosingBlank } from "@/lib/blanks/shift-closing-blank";
import { downloadCageSlotsBlank } from "@/lib/blanks/cage-slots-blank";
import { downloadDailyBalanceBlank } from "@/lib/blanks/daily-balance-blank";

export default function BlanksPage() {
  const { data: tables = [] } = useGamingTables();
  const tableNames = (tables as any[]).map((t) => t.name).filter(Boolean);

  const items = [
    {
      icon: TableIcon,
      title: "Shift Closing — Live Game",
      desc: "A4 landscape. Table grid: opening chips, fill, credit, drop, closing chips, result, signature.",
      note: tableNames.length ? `${tableNames.length} table names pre-printed` : "Empty numbered rows",
      onDownload: () => downloadShiftClosingBlank(tableNames),
    },
    {
      icon: Coins,
      title: "Cage Slots — Shift Closing",
      desc: "A4 portrait. Movements, denomination cash count (10k / 5k / 2k / 1k / coins), totals and signatures.",
      note: "Fully blank",
      onDownload: () => downloadCageSlotsBlank(),
    },
    {
      icon: Grid3x3,
      title: "Daily Balance Sheet",
      desc: "A4 landscape. Incomes / Expenses / Transfers / Money / Balances with 10 day columns and a total column.",
      note: "Fully blank",
      onDownload: () => downloadDailyBalanceBlank(10),
    },
  ];

  return (
    <PageShell>
      <PageHeader
        icon={Printer}
        title="Blank Forms"
        subtitle="Empty printable PDF templates for manual completion"
      />

      <PageSection card={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((it) => (
            <div
              key={it.title}
              className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-md bg-muted p-2">
                  <it.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold leading-tight">{it.title}</div>
                  <div className="text-xs text-muted-foreground mt-1">{it.desc}</div>
                </div>
              </div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{it.note}</div>
              <Button className="mt-auto w-full" onClick={it.onDownload}>
                <FileDown className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          ))}
        </div>
      </PageSection>
    </PageShell>
  );
}
