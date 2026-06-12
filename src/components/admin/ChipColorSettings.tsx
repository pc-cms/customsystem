/**
 * ChipColorSettings — admin UI for per-casino chip color configuration.
 * Three color pickers per denomination: Background, Edge (6 inserts), Text.
 * Plus a per-denom Visible toggle: hides chips that don't physically exist
 * in this casino from all operational surfaces (cage, float, reports).
 */
import { useEffect, useState } from "react";
import { CHIP_DENOMS } from "@/lib/currency";
import {
  useChipColors,
  useUpsertChipColor,
  useChipVisibility,
  useUpsertChipVisibility,
  resolveChipColor,
  DEFAULT_CHIP_HEX,
} from "@/hooks/use-chip-colors";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RotateCcw, Save } from "lucide-react";
import ChipToken from "@/components/ChipToken";

interface RowState {
  bg: string;
  edge: string;
  text: string;
  dirty: boolean;
}

const ChipColorSettings = () => {
  const { data: overrides = {} } = useChipColors();
  const { data: visibility = {} } = useChipVisibility();
  const upsert = useUpsertChipColor();
  const upsertVis = useUpsertChipVisibility();
  const [rows, setRows] = useState<Record<number, RowState>>({});

  useEffect(() => {
    const next: Record<number, RowState> = {};
    CHIP_DENOMS.forEach(d => {
      const c = resolveChipColor(d, overrides);
      next[d] = { bg: c.bg, edge: c.edge, text: c.text, dirty: false };
    });
    setRows(next);
  }, [overrides]);

  const updateRow = (denom: number, patch: Partial<Pick<RowState, "bg" | "edge" | "text">>) => {
    setRows(prev => ({ ...prev, [denom]: { ...prev[denom], ...patch, dirty: true } }));
  };

  const resetToDefault = (denom: number) => {
    const def = DEFAULT_CHIP_HEX[denom];
    setRows(prev => ({ ...prev, [denom]: { bg: def.bg, edge: def.edge, text: def.text, dirty: true } }));
  };

  const saveRow = (denom: number) => {
    const r = rows[denom];
    if (!r) return;
    upsert.mutate({ denomination: denom, bg_color: r.bg, edge_color: r.edge, text_color: r.text });
  };

  const toggleVisible = (denom: number, next: boolean) => {
    upsertVis.mutate({ denomination: denom, is_visible: next });
  };

  const ColorField = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-8 w-8 rounded border border-border cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="font-mono text-xs h-8 w-full min-w-0 rounded border border-border bg-background px-1.5"
        />
      </div>
    </label>
  );

  return (
    <div className="cms-panel p-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-card-foreground">Chip Colors</h2>
        <p className="text-xs text-muted-foreground">
          Customize each chip denomination for this casino: body / edge / text colors, plus a Visible switch.
          Hidden chips disappear from cage, float and reports — use it for denominations that don't physically exist here.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {CHIP_DENOMS.map(d => {
          const r = rows[d] || { bg: "#666", edge: "#FFF", text: "#FFF", dirty: false };
          const isVisible = visibility[d] !== false; // default true
          return (
            <div
              key={d}
              className={`border border-border rounded-md p-3 bg-background transition-opacity ${isVisible ? "" : "opacity-60"}`}
            >
              <div className="flex items-center gap-3">
                <ChipToken denom={d} size="lg" colors={{ bg: r.bg, edge: r.edge, text: r.text }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase text-muted-foreground tracking-wider">Denomination</p>
                  <p className="font-mono text-sm font-semibold text-card-foreground">{d.toLocaleString("en-US")}</p>
                </div>
                <label className="flex flex-col items-end gap-1">
                  <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Visible</span>
                  <Switch
                    checked={isVisible}
                    onCheckedChange={v => toggleVisible(d, v)}
                    disabled={upsertVis.isPending}
                  />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-3">
                <ColorField label="Body" value={r.bg} onChange={v => updateRow(d, { bg: v })} />
                <ColorField label="Edge" value={r.edge} onChange={v => updateRow(d, { edge: v })} />
                <ColorField label="Text" value={r.text} onChange={v => updateRow(d, { text: v })} />
              </div>

              <div className="flex items-center gap-1.5 mt-3">
                <Button
                  variant="outline" size="sm"
                  onClick={() => resetToDefault(d)}
                  className="gap-1 h-7 text-xs"
                >
                  <RotateCcw className="w-3 h-3" /> Default
                </Button>
                <Button
                  size="sm"
                  onClick={() => saveRow(d)}
                  disabled={!r.dirty || upsert.isPending}
                  className="gap-1 h-7 text-xs flex-1"
                >
                  <Save className="w-3 h-3" /> {r.dirty ? "Save" : "Saved"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChipColorSettings;
