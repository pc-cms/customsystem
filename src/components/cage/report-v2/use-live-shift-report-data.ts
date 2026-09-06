/**
 * Data loader for the V2 Live Game closing report.
 *
 * Deliberately standalone (a copy of the legacy ShiftClosingReport loader)
 * so switching layouts can never regress the legacy printout.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { buildLatestTableSnapshot } from "@/lib/table-live-result";
import { fetchTotalDrop } from "@/lib/drop-source";
import { normalizeProviderKey, normalizeProviderMap } from "./wallet-rows";

export type LiveTableRow = {
  id: string;
  name: string;
  op: number;
  fl: number;
  cr: number;
  cl: number;
  drop: number;
  res: number;
};

export const useLiveShiftReportData = (opts: {
  casinoId: string | null | undefined;
  shiftId: string | null | undefined;
  businessDate: string;
  tables: Array<{ id: string; name: string; is_archived?: boolean | null }>;
}) => {
  const { casinoId, shiftId, businessDate, tables } = opts;
  const [rows, setRows] = useState<LiveTableRow[]>([]);
  const [totalDrop, setTotalDrop] = useState(0);
  const [cashlessIO, setCashlessIO] = useState<{ inByProv: Record<string, number>; outByProv: Record<string, number> }>({ inByProv: {}, outByProv: {} });
  const [transfers, setTransfers] = useState({ addFloat: 0, slotsOut: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const total = await fetchTotalDrop({ casinoId: casinoId as any, fromDate: businessDate });
      if (!cancelled) setTotalDrop(total);
    })();
    return () => { cancelled = true; };
  }, [casinoId, businessDate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!casinoId || !shiftId) return;
      const [{ data: bl }, { data: tr }, { data: tx }, { data: snaps }] = await Promise.all([
        supabase.from("chip_baseline").select("location_id, denomination, expected_quantity")
          .eq("casino_id", casinoId).eq("location_type", "table"),
        supabase.from("cage_transfers").select("table_id, transfer_type, amount")
          .eq("shift_id", shiftId).in("transfer_type", ["fill", "credit", "add_float", "slots_out"]),
        supabase.from("transactions").select("table_id, type, amount, cancelled_at")
          .eq("shift_id", shiftId).is("cancelled_at", null),
        businessDate
          ? supabase.from("chip_snapshots")
              .select("location_type, location_id, denomination, expected_quantity, actual_quantity, created_at")
              .eq("casino_id", casinoId).eq("date", businessDate).eq("location_type", "table")
          : Promise.resolve({ data: [] as any[] } as any),
      ]);
      if (cancelled) return;

      const baseline: Record<string, number> = {};
      (bl || []).forEach((r: any) => {
        if (!r.location_id) return;
        baseline[r.location_id] = (baseline[r.location_id] || 0) + Number(r.denomination) * Number(r.expected_quantity);
      });

      const fc: Record<string, { fill: number; credit: number }> = {};
      let addFloat = 0, slotsOut = 0;
      (tr || []).forEach((r: any) => {
        if (r.transfer_type === "add_float") { addFloat += Number(r.amount); return; }
        if (r.transfer_type === "slots_out") { slotsOut += Number(r.amount); return; }
        if (!r.table_id) return;
        fc[r.table_id] = fc[r.table_id] || { fill: 0, credit: 0 };
        if (r.transfer_type === "fill") fc[r.table_id].fill += Number(r.amount);
        else fc[r.table_id].credit += Number(r.amount);
      });
      setTransfers({ addFloat, slotsOut });

      const inByTable: Record<string, number> = {};
      (tx || []).forEach((r: any) => {
        if (!r.table_id || (r.type !== "in" && r.type !== "buy")) return;
        inByTable[r.table_id] = (inByTable[r.table_id] || 0) + (Number(r.amount) || 0);
      });

      const snapIndex = buildLatestTableSnapshot((snaps || []) as any);

      const { data: srv } = await (supabase as any).rpc("compute_shift_table_results", { p_shift_id: shiftId });
      if (cancelled) return;
      const serverResults: Record<string, number> = {};
      (srv || []).forEach((r: any) => { if (r?.table_id) serverResults[r.table_id] = Number(r.result || 0); });

      const built = tables
        .filter(t => !t.is_archived)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(t => {
          const perDenom = snapIndex[t.id]?.perDenom;
          const cl = perDenom
            ? Object.entries(perDenom).reduce((s, [d, q]) => s + Number(d) * (Number(q) || 0), 0)
            : 0;
          return {
            id: t.id,
            name: t.name,
            op: baseline[t.id] || 0,
            fl: fc[t.id]?.fill || 0,
            cr: fc[t.id]?.credit || 0,
            cl,
            drop: inByTable[t.id] || 0,
            res: serverResults[t.id] ?? 0,
          };
        });
      setRows(built);

      const fromIso = null;
      void fromIso;
      const { data: shiftRow } = await supabase
        .from("shifts")
        .select("opened_at, closed_at, cashless_in_providers, cashless_out_providers")
        .eq("id", shiftId).maybeSingle();
      if (cancelled) return;
      // Base = what the cashier entered on the shift itself; the journal only
      // refines the In/Out split for providers it actually recorded.
      const baseIn = normalizeProviderMap((shiftRow as any)?.cashless_in_providers);
      const baseOut = normalizeProviderMap((shiftRow as any)?.cashless_out_providers);
      setCashlessIO({ inByProv: baseIn, outByProv: baseOut });
      if (shiftRow?.opened_at) {
        const { data: cl } = await (supabase as any)
          .from("cashless_transactions")
          .select("direction, provider, amount")
          .eq("casino_id", casinoId)
          .eq("cage_type", "live_game")
          .gte("created_at", shiftRow.opened_at)
          .lte("created_at", shiftRow.closed_at ?? new Date().toISOString());
        if (!cancelled) {
          const inP: Record<string, number> = {};
          const outP: Record<string, number> = {};
          (cl || []).forEach((r: any) => {
            const p = normalizeProviderKey(r.provider);
            if (!p) return;
            const a = Number(r.amount || 0);
            if (r.direction === "IN") inP[p] = (inP[p] || 0) + a;
            else if (r.direction === "OUT") outP[p] = (outP[p] || 0) + a;
          });
          const touched = new Set([...Object.keys(inP), ...Object.keys(outP)]);
          const mergedIn = { ...baseIn };
          const mergedOut = { ...baseOut };
          touched.forEach(k => {
            mergedIn[k] = inP[k] || 0;
            mergedOut[k] = outP[k] || 0;
          });
          setCashlessIO({ inByProv: mergedIn, outByProv: mergedOut });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [casinoId, shiftId, businessDate, tables]);

  return { rows, totalDrop, cashlessIO, transfers };
};
