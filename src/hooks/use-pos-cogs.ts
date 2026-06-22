import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CogsGroupBy = "sellable_item" | "ingredient" | "location" | "day";

export type CogsRow = {
  group_key: string;
  group_label: string;
  group_type: CogsGroupBy;
  units_consumed: number;
  cogs_tzs: number;
  gross_sales_tzs: number;
  gross_margin_tzs: number;
  gross_margin_pct: number | null;
  uncosted_movement_count: number;
  movement_count: number;
};

export function usePosCogsReport(params: {
  casinoId: string | null;
  from: string;
  to: string;
  locationId?: string | null;
  groupBy: CogsGroupBy;
}) {
  const { casinoId, from, to, locationId, groupBy } = params;
  return useQuery({
    queryKey: ["pos-cogs", casinoId, from, to, locationId ?? null, groupBy],
    enabled: !!casinoId && !!from && !!to,
    staleTime: 30_000,
    queryFn: async (): Promise<CogsRow[]> => {
      const { data, error } = await (supabase as any).rpc("pos_cogs_report", {
        _casino_id: casinoId,
        _from_date: from,
        _to_date: to,
        _pos_location_id: locationId || null,
        _group_by: groupBy,
      });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        group_key: r.group_key,
        group_label: r.group_label,
        group_type: r.group_type,
        units_consumed: Number(r.units_consumed) || 0,
        cogs_tzs: Number(r.cogs_tzs) || 0,
        gross_sales_tzs: Number(r.gross_sales_tzs) || 0,
        gross_margin_tzs: Number(r.gross_margin_tzs) || 0,
        gross_margin_pct: r.gross_margin_pct == null ? null : Number(r.gross_margin_pct),
        uncosted_movement_count: Number(r.uncosted_movement_count) || 0,
        movement_count: Number(r.movement_count) || 0,
      }));
    },
  });
}
