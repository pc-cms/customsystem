/**
 * Printable report layout switch.
 *
 * `casinos.report_layout` decides which printout the cash desks produce:
 *   · "legacy" — the historical forms (default)
 *   · "v2"     — Style A — Clear Cards
 *
 * The switch components below forward every prop, so call sites stay unchanged.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import ShiftClosingReport from "@/components/cage/ShiftClosingReport";
import ChipMovementReport from "@/components/cage/ChipMovementReport";
import LiveClosingReportV2 from "@/components/cage/LiveClosingReportV2";
import ChipsMovementReportV2 from "@/components/cage/ChipsMovementReportV2";

export type ReportLayout = "legacy" | "v2";

const useCasinoReportMeta = (casinoIdOverride?: string | null) => {
  const { casinoId } = useAuth();
  const id = casinoIdOverride ?? casinoId;
  const { data } = useQuery({
    queryKey: ["report-layout", id],
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("casinos").select("report_layout, name").eq("id", id as string).maybeSingle();
      return {
        layout: ((data as any)?.report_layout === "v2" ? "v2" : "legacy") as ReportLayout,
        name: ((data as any)?.name as string | null) || null,
      };
    },
  });
  return { layout: (data?.layout as ReportLayout) || "legacy", name: data?.name || null };
};

export const useReportLayout = (casinoIdOverride?: string | null): ReportLayout =>
  useCasinoReportMeta(casinoIdOverride).layout;

type LegacyLiveProps = React.ComponentProps<typeof ShiftClosingReport>;
type LegacyChipsProps = React.ComponentProps<typeof ChipMovementReport>;

export const LiveClosingReport = (props: LegacyLiveProps) => {
  const { layout, name } = useCasinoReportMeta();
  if (layout === "v2") return <LiveClosingReportV2 {...({ casinoName: name || undefined, ...(props as any) } as any)} />;
  return <ShiftClosingReport {...props} />;
};

export const ChipsMovementReport = (props: LegacyChipsProps) => {
  const { layout, name } = useCasinoReportMeta();
  if (layout === "v2") return <ChipsMovementReportV2 {...({ casinoName: name || undefined, ...(props as any) } as any)} />;
  return <ChipMovementReport {...props} />;
};
