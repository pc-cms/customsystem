import { useEffect, useState } from "react";
import { ResponsiveDialog, ResponsiveDialogFooter } from "@/components/ui/responsive-dialog";
import { FormGrid, FormField } from "@/components/ui/form-grid";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  useUpsertPosMenuItem,
  type PosMenuCategory,
  type PosMenuItem,
} from "@/hooks/use-pos-menu";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  casinoId: string;
  item?: PosMenuItem | null;
  categories: PosMenuCategory[];
  defaultCategoryId?: string | null;
}

export const ItemEditDialog = ({
  open,
  onOpenChange,
  casinoId,
  item,
  categories,
  defaultCategoryId,
}: Props) => {
  const upsert = useUpsertPosMenuItem();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [stockQty, setStockQty] = useState<string>("");
  const [lowThreshold, setLowThreshold] = useState<string>("");
  const [isActive, setIsActive] = useState(true);
  const [bottleMl, setBottleMl] = useState<string>("");
  const [servingMl, setServingMl] = useState<string>("");
  const [roundStep, setRoundStep] = useState<string>("500");

  useEffect(() => {
    if (open) {
      setName(item?.name ?? "");
      setCategoryId(item?.category_id ?? defaultCategoryId ?? categories[0]?.id ?? "");
      setPrice(item ? String(item.price_tzs) : "");
      setStockQty(item?.stock_qty != null ? String(item.stock_qty) : "");
      setLowThreshold(item?.low_threshold != null ? String(item.low_threshold) : "");
      setIsActive(item?.is_active ?? true);
      setBottleMl(item?.bottle_size_ml != null ? String(item.bottle_size_ml) : "");
      setServingMl(item?.serving_size_ml != null ? String(item.serving_size_ml) : "");
      setRoundStep(item?.price_round_step_tzs != null ? String(item.price_round_step_tzs) : "500");
    }
  }, [open, item, categories, defaultCategoryId]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!categoryId) {
      toast({ title: "Category is required", variant: "destructive" });
      return;
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      toast({ title: "Price must be a non-negative number", variant: "destructive" });
      return;
    }
    const stockNum = stockQty.trim() === "" ? null : Number(stockQty);
    const lowNum = lowThreshold.trim() === "" ? null : Number(lowThreshold);
    if (stockNum != null && !Number.isFinite(stockNum)) {
      toast({ title: "Stock must be a number or empty", variant: "destructive" });
      return;
    }
    if (lowNum != null && !Number.isFinite(lowNum)) {
      toast({ title: "Low threshold must be a number or empty", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        id: item?.id,
        casino_id: casinoId,
        category_id: categoryId,
        name: name.trim(),
        price_tzs: Math.round(priceNum),
        stock_qty: stockNum,
        low_threshold: lowNum,
        is_active: isActive,
        bottle_size_ml: bottleMl.trim() === "" ? null : Number(bottleMl),
        serving_size_ml: servingMl.trim() === "" ? null : Number(servingMl),
        price_round_step_tzs: Math.max(1, Math.round(Number(roundStep) || 500)),
      });
      toast({ title: item ? "Item updated" : "Item created" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    }
  };

  const activeCategories = categories.filter((c) => c.is_active || c.id === item?.category_id);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={item ? "Edit item" : "New item"}
      size="lg"
    >
      <FormGrid>
        <FormField span={8} label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </FormField>
        <FormField span={4} label="Active">
          <div className="flex items-center h-10">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </FormField>
        <FormField span={6} label="Category" required>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {activeCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField span={6} label="Price (TZS)" required>
          <NumberInput
            decimals={2}
            value={price === "" ? "" : Number(price)}
            onValueChange={(v) => setPrice(v == null ? "" : String(v))}
          />
        </FormField>
        <FormField span={6} label="Stock qty" hint="Leave empty to disable tracking">
          <NumberInput
            decimals={0}
            value={stockQty === "" ? "" : Number(stockQty)}
            onValueChange={(v) => setStockQty(v == null ? "" : String(v))}
          />
        </FormField>
        <FormField span={6} label="Low threshold" hint="Alert when stock falls below">
          <NumberInput
            decimals={0}
            value={lowThreshold === "" ? "" : Number(lowThreshold)}
            onValueChange={(v) => setLowThreshold(v == null ? "" : String(v))}
          />
        </FormField>
        <FormField span={4} label="Bottle size (ml)" hint="For per-serving pricing">
          <NumberInput
            decimals={0}
            value={bottleMl === "" ? "" : Number(bottleMl)}
            onValueChange={(v) => setBottleMl(v == null ? "" : String(v))}
            placeholder="e.g. 750"
          />
        </FormField>
        <FormField span={4} label="Serving size (ml)" hint="Pour size">
          <NumberInput
            decimals={0}
            value={servingMl === "" ? "" : Number(servingMl)}
            onValueChange={(v) => setServingMl(v == null ? "" : String(v))}
            placeholder="e.g. 50"
          />
        </FormField>
        <FormField span={4} label="Round step (TZS)" hint="Suggested price rounds up to this">
          <NumberInput
            decimals={0}
            value={roundStep === "" ? "" : Number(roundStep)}
            onValueChange={(v) => setRoundStep(v == null ? "" : String(v))}
          />
        </FormField>
      </FormGrid>
      <ResponsiveDialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? "Saving…" : "Save"}
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
};

export default ItemEditDialog;
