/**
 * FloatManagement — Manager UI for setting chip baseline (tables, cashier, safe).
 * Allows filling default float per location and locking the casino float.
 */
import { useState, useMemo, useCallback, type CSSProperties } from "react";
import { useGamingTables } from "@/hooks/use-casino-data";
import { useChipBaseline, useUpsertBaseline, useCasinoInfo, useLockFloat } from "@/hooks/use-table-lifecycle";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CHIP_DENOMS, formatChipLabel, formatCurrency } from "@/lib/currency";
import { useChipColors, resolveChipColor, useVisibleChipDenoms } from "@/hooks/use-chip-colors";
import { Lock, Save, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

type LocationDef = {
  key: string;
  label: string;
  type: string;
  id: string | null;
  denoms: readonly number[];
};

const FloatManagement = () => {
  const { data: tables = [] } = useGamingTables();
  const { data: baseline = [] } = useChipBaseline();
  const { data: casinoInfo } = useCasinoInfo();
  const { data: chipColorOverrides } = useChipColors();
  const upsertBaseline = useUpsertBaseline();
  const lockFloat = useLockFloat();
  const { casinoId } = useAuth();

  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, Record<number, number>>>({});
  const [hasChanges, setHasChanges] = useState(false);

  const isLocked = casinoInfo?.float_locked === true;

  // Build locations: tables + cashier + safe
  const locations: LocationDef[] = useMemo(() => {
    const locs: LocationDef[] = [];
    // Sort tables alphabetically
    const sorted = [...tables].sort((a, b) => a.name.localeCompare(b.name));
    sorted.forEach(t => {
      locs.push({
        key: `table-${t.id}`,
        label: t.name,
        type: "table",
        id: t.id,
        denoms: t.denominations || CHIP_DENOMS,
      });
    });
    locs.push({ key: "cashier", label: "Cashier", type: "cashier", id: null, denoms: CHIP_DENOMS });
    locs.push({ key: "safe", label: "Safe", type: "safe", id: null, denoms: CHIP_DENOMS });
    return locs;
  }, [tables]);

  // Current baseline as map: { locKey: { denom: qty } }
  const baselineMap = useMemo(() => {
    const map: Record<string, Record<number, number>> = {};
    baseline.forEach(b => {
      const key = b.location_id ? `table-${b.location_id}` : b.location_type;
      if (!map[key]) map[key] = {};
      map[key][b.denomination] = b.expected_quantity;
    });
    return map;
  }, [baseline]);

  // Get value for a cell: edited value > baseline > 0
  const getValue = useCallback((locKey: string, denom: number): number => {
    if (editValues[locKey]?.[denom] !== undefined) return editValues[locKey][denom];
    return baselineMap[locKey]?.[denom] ?? 0;
  }, [editValues, baselineMap]);

  const handleChange = useCallback((locKey: string, denom: number, raw: string) => {
    const val = raw === "" ? 0 : parseInt(raw, 10);
    if (isNaN(val) || val < 0) return;
    setEditValues(prev => ({
      ...prev,
      [locKey]: { ...(prev[locKey] || {}), [denom]: val },
    }));
    setHasChanges(true);
  }, []);

  // Calculate total per location
  const locationTotal = useCallback((locKey: string, denoms: readonly number[]): number => {
    return denoms.reduce((s, d) => s + getValue(locKey, d) * d, 0);
  }, [getValue]);

  // Grand total
  const grandTotal = useMemo(() => {
    return locations.reduce((s, loc) => s + locationTotal(loc.key, loc.denoms), 0);
  }, [locations, locationTotal]);

  // Save all values
  const handleSave = () => {
    const entries: Array<{
      location_type: string;
      location_id: string | null;
      denomination: number;
      expected_quantity: number;
    }> = [];

    locations.forEach(loc => {
      loc.denoms.forEach(d => {
        const val = getValue(loc.key, d);
        if (val > 0 || baselineMap[loc.key]?.[d]) {
          entries.push({
            location_type: loc.type,
            location_id: loc.id,
            denomination: d,
            expected_quantity: val,
          });
        }
      });
    });

    upsertBaseline.mutate(entries, {
      onSuccess: () => {
        setEditValues({});
        setHasChanges(false);
      },
    });
  };

  // Lock float
  const handleLock = () => {
    lockFloat.mutate(undefined, {
      onSuccess: () => setShowLockConfirm(false),
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Casino Float (Baseline)</h2>
          <p className="text-xs text-muted-foreground">
            Default chip quantities for each table, cashier and safe
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLocked ? (
            <Badge className="gap-1 bg-green-600/20 text-success border-success/30">
              <Lock className="w-3 h-3" /> Float Locked
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 border-orange-500/50 text-warning">
              <AlertTriangle className="w-3 h-3" /> Float Not Locked
            </Badge>
          )}
        </div>
      </div>

      {/* Grid table */}
      <div className="cms-panel overflow-x-auto">
        <div className="min-w-[800px]">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-muted-foreground font-medium sticky left-0 bg-card z-10 min-w-[70px]">
                  Denom
                </th>
                {locations.map(loc => (
                  <th key={loc.key} className="text-center py-2 px-2 text-muted-foreground font-medium min-w-[80px] whitespace-nowrap">
                    {loc.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CHIP_DENOMS.map(d => {
                const anyHas = locations.some(loc => loc.denoms.includes(d));
                if (!anyHas) return null;
                return (
                  <tr key={d} className="border-b border-border last:border-0">
                    <td className="py-1 px-3 sticky left-0 bg-card z-10">
                      {(() => { const c = resolveChipColor(d, chipColorOverrides); return (
                        <span className="cms-chip-token" style={{ "--chip-bg": c.bg, "--chip-edge": c.edge, "--chip-text": c.text } as CSSProperties}>
                          {formatChipLabel(d)}
                        </span>
                      ); })()}
                    </td>
                    {locations.map(loc => {
                      if (!loc.denoms.includes(d)) {
                        return <td key={loc.key} className="px-1 py-0.5 text-center text-muted-foreground/30">—</td>;
                      }
                      const val = getValue(loc.key, d);
                      return (
                        <td key={loc.key} className="px-1 py-0.5">
                          <input
                            type="number"
                            min="0"
                            value={val || ""}
                            onChange={e => handleChange(loc.key, d, e.target.value)}
                            disabled={isLocked}
                            className="w-16 h-7 rounded text-[11px] font-mono text-center border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-card-foreground mx-auto block disabled:opacity-50 disabled:cursor-not-allowed"
                            placeholder="0"
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/20">
                <td className="py-2 px-3 text-xs font-bold text-card-foreground sticky left-0 bg-muted/20 z-10">
                  Total
                </td>
                {locations.map(loc => {
                  const total = locationTotal(loc.key, loc.denoms);
                  return (
                    <td key={loc.key} className="py-2 px-2 text-center">
                      <span className="text-[10px] font-mono font-bold text-primary">
                        {total > 0 ? formatCurrency(total) : "—"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Grand total & actions */}
      <div className="flex items-center justify-between">
        <div className="cms-panel p-3 inline-flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground uppercase">Total Casino Float</span>
          <span className="font-mono text-lg font-bold text-primary">{formatCurrency(grandTotal)}</span>
        </div>

        <div className="flex items-center gap-2">
          {!isLocked && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || upsertBaseline.isPending}
                className="gap-1.5"
              >
                <Save className="w-4 h-4" />
                {upsertBaseline.isPending ? "Saving…" : "Save"}
              </Button>
              <Button
                size="sm"
                onClick={() => setShowLockConfirm(true)}
                disabled={grandTotal === 0}
                className="gap-1.5 bg-orange-600 hover:bg-orange-700"
              >
                <Lock className="w-4 h-4" /> Lock Casino Float
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Lock confirmation dialog */}
      <Dialog open={showLockConfirm} onOpenChange={setShowLockConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Lock Float?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Once locked, the total chip count in the system <strong className="text-card-foreground">can only decrease</strong> (loss, damage).
            </p>
            <p>Increasing chip quantities above the baseline will not be possible.</p>
            <div className="cms-panel p-3 text-center">
              <span className="text-xs text-muted-foreground">Total Float</span>
              <p className="font-mono text-lg font-bold text-primary">{formatCurrency(grandTotal)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLockConfirm(false)}>Cancel</Button>
            <Button
              onClick={handleLock}
              disabled={lockFloat.isPending}
              className="gap-1.5 bg-orange-600 hover:bg-orange-700"
            >
              <Lock className="w-4 h-4" />
              {lockFloat.isPending ? "Locking…" : "Lock Float"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FloatManagement;
