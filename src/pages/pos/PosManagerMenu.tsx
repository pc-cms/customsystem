import { useMemo, useState } from "react";
import { useSessionState } from "@/hooks/use-session-state";
import { Plus, Pencil, Archive, ArchiveRestore, History, Search, UtensilsCrossed } from "lucide-react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, DTBody, DTCell, DTHead, DTHeader, DTRow } from "@/components/ui/data-table";
import { useCasino } from "@/lib/casino-context";
import { useAuth } from "@/lib/auth-context";
import {
  usePosMenuCategories,
  usePosMenuItems,
  useUpsertPosMenuCategory,
  useUpsertPosMenuItem,
  type PosMenuCategory,
  type PosMenuItem,
} from "@/hooks/use-pos-menu";
import { formatNumberSpaces } from "@/lib/currency";
import { toast } from "@/hooks/use-toast";
import CategoryEditDialog from "@/components/pos/CategoryEditDialog";
import ItemEditDialog from "@/components/pos/ItemEditDialog";
import PriceHistoryDialog from "@/components/pos/PriceHistoryDialog";

export default function PosManagerMenu() {
  const { activeCasinoId, activeCasino } = useCasino();
  const { roles: typedRoles } = useAuth();
  const roles = typedRoles as readonly string[];
  const canEdit = roles.includes("pos_manager") || roles.includes("super_admin");

  const { data: categories = [], isLoading: catsLoading } = usePosMenuCategories(activeCasinoId);
  const { data: items = [], isLoading: itemsLoading } = usePosMenuItems(activeCasinoId);

  const [selectedCategoryId, setSelectedCategoryId] = useSessionState<string | "all">("category", "all");
  const [activeOnly, setActiveOnly] = useSessionState("activeOnly", true);
  const [search, setSearch] = useSessionState("search", "");

  const [catDialog, setCatDialog] = useState<{ open: boolean; category: PosMenuCategory | null }>({
    open: false,
    category: null,
  });
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item: PosMenuItem | null }>({
    open: false,
    item: null,
  });
  const [historyDialog, setHistoryDialog] = useState<{ open: boolean; item: PosMenuItem | null }>({
    open: false,
    item: null,
  });

  const upsertCat = useUpsertPosMenuCategory();
  const upsertItem = useUpsertPosMenuItem();

  const filteredItems = useMemo(() => {
    return items.filter((i) => {
      if (selectedCategoryId !== "all" && i.category_id !== selectedCategoryId) return false;
      if (activeOnly && !i.is_active) return false;
      if (search.trim() && !i.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [items, selectedCategoryId, activeOnly, search]);

  const catById = useMemo(() => {
    const m = new Map<string, PosMenuCategory>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const nextSortOrder = useMemo(() => {
    const max = categories.reduce((acc, c) => Math.max(acc, c.sort_order ?? 0), 0);
    return max + 10;
  }, [categories]);

  const toggleCategoryActive = async (cat: PosMenuCategory) => {
    if (!activeCasinoId) return;
    try {
      await upsertCat.mutateAsync({
        id: cat.id,
        casino_id: activeCasinoId,
        name: cat.name,
        sort_order: cat.sort_order,
        is_active: !cat.is_active,
      });
      toast({ title: cat.is_active ? "Category archived" : "Category restored" });
    } catch (e: any) {
      toast({ title: "Update failed", description: e?.message, variant: "destructive" });
    }
  };

  const toggleItemActive = async (it: PosMenuItem) => {
    if (!activeCasinoId) return;
    try {
      await upsertItem.mutateAsync({
        id: it.id,
        casino_id: activeCasinoId,
        category_id: it.category_id,
        name: it.name,
        price_tzs: it.price_tzs,
        stock_qty: it.stock_qty,
        low_threshold: it.low_threshold,
        is_active: !it.is_active,
      });
      toast({ title: it.is_active ? "Item archived" : "Item restored" });
    } catch (e: any) {
      toast({ title: "Update failed", description: e?.message, variant: "destructive" });
    }
  };

  if (!activeCasinoId) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Select a casino to manage POS menu.
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <PageShell>
        {/* Inline header (PosLayout already provides its own top bar). */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight truncate">POS Menu</h1>
              <p className="text-xs text-muted-foreground truncate">
                {activeCasino?.name ?? "—"}
                {!canEdit && <span className="ml-2"><Badge variant="outline">Read-only</Badge></span>}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Categories panel */}
          <PageSection
            className="lg:col-span-4"
            title="Categories"
            titleRight={
              canEdit ? (
                <Button
                  size="sm"
                  onClick={() => setCatDialog({ open: true, category: null })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              ) : null
            }
            bodyClassName="p-0"
          >
            <DataTable>
              <DTHead>
                <DTRow>
                  <DTHeader>Name</DTHeader>
                  <DTHeader align="right">Sort</DTHeader>
                  <DTHeader align="center">Active</DTHeader>
                  {canEdit && <DTHeader align="right">Actions</DTHeader>}
                </DTRow>
              </DTHead>
              <DTBody>
                {catsLoading ? (
                  <DTRow>
                    <DTCell colSpan={canEdit ? 4 : 3} className="text-center text-muted-foreground py-6">
                      Loading…
                    </DTCell>
                  </DTRow>
                ) : categories.length === 0 ? (
                  <DTRow>
                    <DTCell colSpan={canEdit ? 4 : 3} className="text-center text-muted-foreground py-6">
                      No categories yet.
                    </DTCell>
                  </DTRow>
                ) : (
                  categories.map((c) => (
                    <DTRow
                      key={c.id}
                      className={
                        selectedCategoryId === c.id ? "bg-accent/40" : ""
                      }
                    >
                      <DTCell>
                        <button
                          type="button"
                          onClick={() => setSelectedCategoryId(c.id)}
                          className="text-left hover:underline"
                        >
                          {c.name}
                          {!c.is_active && (
                            <span className="ml-2"><Badge variant="outline">Archived</Badge></span>
                          )}
                        </button>
                      </DTCell>
                      <DTCell numeric>{c.sort_order}</DTCell>
                      <DTCell align="center">
                        {c.is_active ? (
                          <span className="text-cms-amount-positive">●</span>
                        ) : (
                          <span className="text-muted-foreground">·</span>
                        )}
                      </DTCell>
                      {canEdit && (
                        <DTCell align="right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setCatDialog({ open: true, category: c })}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleCategoryActive(c)}
                              title={c.is_active ? "Archive" : "Restore"}
                            >
                              {c.is_active ? (
                                <Archive className="h-4 w-4" />
                              ) : (
                                <ArchiveRestore className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </DTCell>
                      )}
                    </DTRow>
                  ))
                )}
              </DTBody>
            </DataTable>
          </PageSection>

          {/* Items panel */}
          <PageSection
            className="lg:col-span-8"
            title="Items"
            titleRight={
              canEdit ? (
                <Button
                  size="sm"
                  onClick={() => setItemDialog({ open: true, item: null })}
                  disabled={categories.filter((c) => c.is_active).length === 0}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              ) : null
            }
            bodyClassName="p-0"
          >
            <div className="p-3 border-b border-border flex flex-wrap items-center gap-2">
              <Select
                value={selectedCategoryId}
                onValueChange={(v) => setSelectedCategoryId(v as string)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search items…"
                  className="pl-8 w-[220px]"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
                <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
                Active only
              </label>
            </div>
            <DataTable>
              <DTHead>
                <DTRow>
                  <DTHeader>Name</DTHeader>
                  <DTHeader>Category</DTHeader>
                  <DTHeader align="right">Price (TZS)</DTHeader>
                  <DTHeader align="right">Stock</DTHeader>
                  <DTHeader align="right">Low</DTHeader>
                  <DTHeader align="center">Active</DTHeader>
                  <DTHeader align="right">Actions</DTHeader>
                </DTRow>
              </DTHead>
              <DTBody>
                {itemsLoading ? (
                  <DTRow>
                    <DTCell colSpan={7} className="text-center text-muted-foreground py-6">
                      Loading…
                    </DTCell>
                  </DTRow>
                ) : filteredItems.length === 0 ? (
                  <DTRow>
                    <DTCell colSpan={7} className="text-center text-muted-foreground py-6">
                      No items match.
                    </DTCell>
                  </DTRow>
                ) : (
                  filteredItems.map((it) => {
                    const lowStock =
                      it.stock_qty != null &&
                      it.low_threshold != null &&
                      it.stock_qty <= it.low_threshold;
                    return (
                      <DTRow key={it.id}>
                        <DTCell>
                          {it.name}
                          {!it.is_active && (
                            <span className="ml-2"><Badge variant="outline">Archived</Badge></span>
                          )}
                        </DTCell>
                        <DTCell>{catById.get(it.category_id)?.name ?? "—"}</DTCell>
                        <DTCell numeric>{formatNumberSpaces(it.price_tzs)}</DTCell>
                        <DTCell
                          numeric
                          className={lowStock ? "text-cms-amount-negative" : ""}
                        >
                          {it.stock_qty == null ? "·" : formatNumberSpaces(it.stock_qty)}
                        </DTCell>
                        <DTCell numeric>
                          {it.low_threshold == null ? "·" : formatNumberSpaces(it.low_threshold)}
                        </DTCell>
                        <DTCell align="center">
                          {it.is_active ? (
                            <span className="text-cms-amount-positive">●</span>
                          ) : (
                            <span className="text-muted-foreground">·</span>
                          )}
                        </DTCell>
                        <DTCell align="right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setHistoryDialog({ open: true, item: it })}
                              title="Price history"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            {canEdit && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setItemDialog({ open: true, item: it })}
                                  title="Edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => toggleItemActive(it)}
                                  title={it.is_active ? "Archive" : "Restore"}
                                >
                                  {it.is_active ? (
                                    <Archive className="h-4 w-4" />
                                  ) : (
                                    <ArchiveRestore className="h-4 w-4" />
                                  )}
                                </Button>
                              </>
                            )}
                          </div>
                        </DTCell>
                      </DTRow>
                    );
                  })
                )}
              </DTBody>
            </DataTable>
          </PageSection>
        </div>
      </PageShell>

      {canEdit && (
        <>
          <CategoryEditDialog
            open={catDialog.open}
            onOpenChange={(o) => setCatDialog((s) => ({ ...s, open: o }))}
            casinoId={activeCasinoId}
            category={catDialog.category}
            defaultSortOrder={nextSortOrder}
          />
          <ItemEditDialog
            open={itemDialog.open}
            onOpenChange={(o) => setItemDialog((s) => ({ ...s, open: o }))}
            casinoId={activeCasinoId}
            item={itemDialog.item}
            categories={categories}
            defaultCategoryId={selectedCategoryId === "all" ? null : selectedCategoryId}
          />
        </>
      )}
      <PriceHistoryDialog
        open={historyDialog.open}
        onOpenChange={(o) => setHistoryDialog((s) => ({ ...s, open: o }))}
        item={historyDialog.item}
      />
    </div>
  );
}
