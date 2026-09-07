/**
 * Snapshot-first data access for the printable cash-desk reports.
 *
 * Rule: a closed period prints from a frozen payload. The first time a closed
 * report is opened the payload is computed once and stored immutably; every
 * later preview / print / reprint reads that same payload, so the screen and
 * the paper can never show different figures.
 */
import { useQuery } from "@tanstack/react-query";
import { getOrCreateSnapshot, type SnapshotType } from "@/lib/report-snapshots";

export type FrozenResult<T> = {
  payload: T | null;
  /** true = rendered from the immutable snapshot. */
  frozen: boolean;
  isLoading: boolean;
};

export const useReportSnapshot = <T>(args: {
  casinoId: string | null | undefined;
  reportType: SnapshotType;
  sourceKey: string | null | undefined;
  businessDate: string | null | undefined;
  asOf?: string | null;
  /** Freeze on first read (period is final). */
  freeze: boolean;
  enabled?: boolean;
  build: () => Promise<T>;
}): FrozenResult<T> => {
  const { casinoId, reportType, sourceKey, businessDate, asOf, freeze, build } = args;
  const enabled = (args.enabled ?? true) && !!casinoId && !!sourceKey && !!businessDate;

  const { data, isLoading } = useQuery({
    queryKey: ["report-snapshot", reportType, casinoId ?? null, sourceKey ?? null, businessDate ?? null, freeze],
    enabled,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      getOrCreateSnapshot<T>({
        casinoId: casinoId as string,
        reportType,
        sourceKey: sourceKey as string,
        businessDate: businessDate as string,
        asOf: asOf ?? null,
        freeze,
        build,
      }),
  });

  return {
    payload: (data?.payload as T) ?? null,
    frozen: !!data?.frozen,
    isLoading: enabled && isLoading,
  };
};
