/**
 * System — collector plumbing and CMS data coverage. Informational only:
 * nothing here calls the collector or ACE.
 */
import { PageSection } from "@/components/layout/PageShell";
import { SmartTable, type ColumnDef } from "@/components/ui/smart-table";
import { Badge } from "@/components/ui/badge";
import { fmtDateOnly, fmtDateTime } from "@/lib/format-date";
import { useAceOverview, useAceCoverage } from "@/hooks/use-ace-players";
import { AceEmpty, intOrNa } from "./ace-shared";

export default function AceSystemTab({
  from,
  to,
  casinoId,
  casinoName,
}: {
  from: string;
  to: string;
  casinoId: string | null;
  casinoName: Map<string, string>;
}) {
  const overview = useAceOverview(from, to, casinoId);
  const coverage = useAceCoverage();

  const keyCols: ColumnDef<any>[] = [
    { key: "loc", header: "Location", accessor: (r) => r.location_code, sortValue: (r) => r.location_code },
    { key: "branch", header: "Branch", accessor: (r) => (r.casino_id ? casinoName.get(r.casino_id) ?? "—" : "not linked") },
    {
      key: "active",
      header: "Key",
      accessor: (r) => <Badge variant="outline">{r.is_active ? "Active" : "Disabled"}</Badge>,
      sortValue: (r) => (r.is_active ? 1 : 0),
    },
    { key: "seen", header: "Last heartbeat", accessor: (r) => (r.last_seen_at ? fmtDateTime(r.last_seen_at) : "never"), sortValue: (r) => r.last_seen_at ?? "" },
  ];

  const covCols: ColumnDef<any>[] = [
    { key: "branch", header: "Branch", accessor: (r) => casinoName.get(r.casino_id) ?? r.casino_name ?? "—", sortValue: (r) => casinoName.get(r.casino_id) ?? "" },
    { key: "first", header: "Earliest day", accessor: (r) => (r.first_date ? fmtDateOnly(r.first_date) : "—"), sortValue: (r) => r.first_date ?? "" },
    { key: "last", header: "Latest day", accessor: (r) => (r.last_date ? fmtDateOnly(r.last_date) : "—"), sortValue: (r) => r.last_date ?? "" },
    { key: "days", header: "Days stored", type: "int", accessor: (r) => intOrNa(r.day_count), sortValue: (r) => r.day_count },
    { key: "egm", header: "Last EGM snapshot", accessor: (r) => (r.last_egm_observed ? fmtDateTime(r.last_egm_observed) : "—"), sortValue: (r) => r.last_egm_observed ?? "" },
    { key: "egmrep", header: "Last EGM report", accessor: (r) => (r.last_egm_report ? fmtDateOnly(r.last_egm_report) : "—"), sortValue: (r) => r.last_egm_report ?? "" },
    { key: "jprep", header: "Last JP report", accessor: (r) => (r.last_jp_report ? fmtDateOnly(r.last_jp_report) : "—"), sortValue: (r) => r.last_jp_report ?? "" },
  ];

  return (
    <div className="space-y-4">
      <PageSection title="Collector keys" card={false}>
        <SmartTable
          data={(overview.data?.keys ?? []) as any[]}
          columns={keyCols}
          rowKey={(r) => r.location_code}
          loading={overview.isLoading}
          stickyHeader
          empty={<AceEmpty what="collector keys" />}
        />
      </PageSection>

      <PageSection title="CMS data coverage" card={false}>
        <SmartTable
          data={coverage.data ?? []}
          columns={covCols}
          rowKey={(r) => r.casino_id}
          loading={coverage.isLoading}
          stickyHeader
          empty={<AceEmpty what="stored ACE history" />}
        />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Everything on this page is read from the CMS database. Historical backfill and
          re-import of a single day are run on the branch server; they are not available
          as actions here.
        </p>
      </PageSection>

      <div className="grid gap-3 md:grid-cols-2">
        <PageSection title="Latest EGM report">
          <div className="text-sm">
            {overview.data?.latestEgmReport
              ? `${overview.data.latestEgmReport.period_label ?? "—"} · ${fmtDateTime(overview.data.latestEgmReport.captured_at)}`
              : "Not received yet"}
          </div>
        </PageSection>
        <PageSection title="Latest Jackpot report">
          <div className="text-sm">
            {overview.data?.latestJackpotReport
              ? `${overview.data.latestJackpotReport.period_label ?? "—"} · ${fmtDateTime(overview.data.latestJackpotReport.captured_at)}`
              : "Not received yet"}
          </div>
        </PageSection>
      </div>
    </div>
  );
}
