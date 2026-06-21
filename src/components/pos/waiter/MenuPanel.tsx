import { useMemo, useState } from "react";
import { formatNumberSpaces } from "@/lib/currency";
import { usePosMenuCategories, usePosMenuItems, type PosMenuItem } from "@/hooks/use-pos-menu";
import { useAddPosOrder } from "@/hooks/use-pos-orders";
import { usePosModifiers, type PosModifier } from "@/hooks/use-pos-modifiers";
import {
  usePosItemAvailability,
  statusLabel,
  statusBadgeClass,
  type PosItemAvailabilityRow,
  type PosItemAvailabilityStatus,
} from "@/hooks/use-pos-item-availability";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface Props {
  casinoId: string;
  shiftId: string;
  tabId: string | null;
  userId: string;
}

export const MenuPanel = ({ casinoId, shiftId, tabId, userId }: Props) => {
  const { data: categories = [] } = usePosMenuCategories(casinoId);
  const { data: items = [] } = usePosMenuItems(casinoId);
  const { data: modifiers = [] } = usePosModifiers(casinoId, true);
  const { data: availability = [] } = usePosItemAvailability(casinoId);
  const addOrder = useAddPosOrder();

  const activeCategories = useMemo(() => categories.filter((c) => c.is_active), [categories]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [modSheet, setModSheet] = useState<{ item: PosMenuItem; qty: number } | null>(null);

  const availByItem = useMemo(() => {
    const m = new Map<string, PosItemAvailabilityRow>();
    for (const a of availability) m.set(a.sellable_item_id, a);
    return m;
  }, [availability]);

  const effectiveCat = selectedCat ?? activeCategories[0]?.id ?? null;

  const filtered = useMemo(() => {
    return items.filter((i) => i.is_active && (!effectiveCat || i.category_id === effectiveCat));
  }, [items, effectiveCat]);

  const handleAdd = async (
    item: PosMenuItem,
    qty: number,
    opts?: { notes?: string | null; modifiers?: PosModifier[] },
  ) => {
    if (!tabId) {
      toast({ title: "Select or open a tab first", variant: "destructive" });
      return;
    }
    try {
      await addOrder.mutateAsync({
        casino_id: casinoId,
        shift_id: shiftId,
        tab_id: tabId,
        waiter_user_id: userId,
        item_id: item.id,
        item_name: item.name,
        unit_price_tzs: item.price_tzs,
        qty,
        notes: opts?.notes ?? null,
        modifiers: opts?.modifiers ?? [],
      });
    } catch (e: any) {
      toast({ title: "Failed", description: e?.message, variant: "destructive" });
    }
  };

  if (activeCategories.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        No active menu categories. Ask the POS manager to set up the menu.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 overflow-x-auto p-2 border-b border-border">
        {activeCategories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSelectedCat(c.id)}
            className={cn(
              "px-4 h-10 rounded-md whitespace-nowrap text-sm font-medium transition-colors",
              effectiveCat === c.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/70 text-foreground",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">No items in this category.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {filtered.map((it) => {
              const outOfStock = it.stock_qty != null && it.stock_qty <= 0;
              const isLow =
                !outOfStock &&
                it.stock_qty != null &&
                it.low_threshold != null &&
                it.stock_qty <= it.low_threshold;
              return (
                <ItemTile
                  key={it.id}
                  item={it}
                  outOfStock={outOfStock}
                  isLow={isLow}
                  disabled={!tabId || addOrder.isPending}
                  hasModifiers={modifiers.length > 0}
                  onAdd={(qty) => handleAdd(it, qty)}
                  onAddWithNote={(qty, note) => handleAdd(it, qty, { notes: note })}
                  onOpenMods={(qty) => setModSheet({ item: it, qty })}
                />
              );
            })}
          </div>
        )}
      </div>

      <ModifierSheet
        sheet={modSheet}
        modifiers={modifiers}
        onClose={() => setModSheet(null)}
        onConfirm={async (mods, note) => {
          if (!modSheet) return;
          await handleAdd(modSheet.item, modSheet.qty, { notes: note, modifiers: mods });
          setModSheet(null);
        }}
      />
    </div>
  );
};

const ItemTile = ({
  item, outOfStock, isLow, disabled, hasModifiers, onAdd, onAddWithNote, onOpenMods,
}: {
  item: PosMenuItem;
  outOfStock: boolean;
  isLow: boolean;
  disabled: boolean;
  hasModifiers: boolean;
  onAdd: (qty: number) => void;
  onAddWithNote: (qty: number, note: string | null) => void;
  onOpenMods: (qty: number) => void;
}) => {
  const askNote = (qty: number) => {
    if (disabled) return;
    // eslint-disable-next-line no-alert
    const note = window.prompt(`Note for ${item.name} (×${qty})?\nLeave blank to skip.`, "");
    onAddWithNote(qty, note && note.trim() ? note.trim() : null);
  };
  return (
    <div
      className={cn(
        "relative rounded-md border bg-card flex flex-col overflow-hidden",
        outOfStock ? "border-cms-amount-negative/60" : isLow ? "border-cms-amount-negative/40" : "border-border",
        disabled && "opacity-50",
      )}
    >
      {outOfStock && (
        <span className="absolute top-1 right-1 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-cms-amount-negative/20 text-cms-amount-negative">
          Out · allowed
        </span>
      )}
      {!outOfStock && isLow && (
        <span className="absolute top-1 right-1 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-cms-amount-negative/15 text-cms-amount-negative">
          Low
        </span>
      )}
      <button
        type="button"
        onClick={() => !disabled && onAdd(1)}
        disabled={disabled}
        className="flex-1 p-3 text-left hover:bg-accent/40 transition-colors min-h-[88px] flex flex-col justify-between"
      >
        <div className="font-medium text-sm leading-tight line-clamp-2">{item.name}</div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="font-mono tabular-nums font-semibold">
            {formatNumberSpaces(item.price_tzs)}
          </span>
          {item.stock_qty != null && (
            <span className={cn(
              "text-[10px]",
              outOfStock ? "text-cms-amount-negative font-semibold" : "text-muted-foreground",
            )}>×{item.stock_qty}</span>
          )}
        </div>
      </button>
      <div className="flex border-t border-border">
        {[2, 3, 5].map((q) => (
          <button
            key={q} type="button" disabled={disabled} onClick={() => onAdd(q)}
            className="flex-1 h-8 text-xs font-mono hover:bg-accent/40 border-l border-border first:border-l-0"
          >
            ×{q}
          </button>
        ))}
        {hasModifiers && (
          <button
            type="button" disabled={disabled} onClick={() => onOpenMods(1)}
            title="Add with modifiers"
            className="w-9 h-8 text-xs hover:bg-accent/40 border-l border-border flex items-center justify-center font-semibold"
          >
            +M
          </button>
        )}
        <button
          type="button" disabled={disabled} onClick={() => askNote(1)}
          title="Add with a note"
          className="w-9 h-8 text-xs hover:bg-accent/40 border-l border-border flex items-center justify-center"
        >
          📝
        </button>
      </div>
    </div>
  );
};

function ModifierSheet({
  sheet, modifiers, onClose, onConfirm,
}: {
  sheet: { item: PosMenuItem; qty: number } | null;
  modifiers: PosModifier[];
  onClose: () => void;
  onConfirm: (mods: PosModifier[], note: string | null) => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");

  // Reset on sheet change
  useMemo(() => {
    setSelected({});
    setNote("");
  }, [sheet?.item.id]);

  if (!sheet) return null;
  const chosen = modifiers.filter((m) => selected[m.id]);
  const deltaSum = chosen.reduce((s, m) => s + m.price_tzs_delta, 0);
  const lineTotal = (sheet.item.price_tzs + deltaSum) * sheet.qty;

  return (
    <ResponsiveDialog
      open={!!sheet}
      onOpenChange={(o) => !o && onClose()}
      title={`Modifiers · ${sheet.item.name} ×${sheet.qty}`}
      size="form"
    >
      <div className="space-y-3">
        <div className="space-y-1 max-h-[40vh] overflow-y-auto">
          {modifiers.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">No modifiers configured.</div>
          ) : modifiers.map((m) => (
            <label
              key={m.id}
              className="flex items-center justify-between gap-2 p-2 rounded hover:bg-accent/40 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={!!selected[m.id]}
                  onCheckedChange={(c) => setSelected({ ...selected, [m.id]: !!c })}
                />
                <span className="text-sm">{m.name}</span>
              </div>
              <span className={cn(
                "text-sm font-mono tabular-nums",
                m.price_tzs_delta > 0 ? "text-foreground" : m.price_tzs_delta < 0 ? "text-cms-amount-positive" : "text-muted-foreground",
              )}>
                {m.price_tzs_delta > 0 ? "+" : ""}{formatNumberSpaces(m.price_tzs_delta)}
              </span>
            </label>
          ))}
        </div>

        <div>
          <label className="text-xs uppercase text-muted-foreground">Note (optional)</label>
          <input
            className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. table 5, no straw"
          />
        </div>

        <div className="flex items-center justify-between text-sm border-t border-border pt-2">
          <span className="text-muted-foreground">
            ({formatNumberSpaces(sheet.item.price_tzs)} {deltaSum !== 0 && `${deltaSum > 0 ? "+" : ""}${formatNumberSpaces(deltaSum)}`}) × {sheet.qty}
          </span>
          <span className="font-mono font-semibold tabular-nums">{formatNumberSpaces(lineTotal)}</span>
        </div>

        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(chosen, note.trim() || null)}>Add</Button>
        </ResponsiveDialogFooter>
      </div>
    </ResponsiveDialog>
  );
}

export default MenuPanel;
