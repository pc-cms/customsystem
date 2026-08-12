/**
 * CategoryCombobox — single unified picker over `fin_categories`.
 *
 * Categories ARE `fin_categories` — whatever is picked here lands directly in
 * `expenses.fin_category_id` and feeds Monthly Report automatically.
 *
 * - Search by name (substring, case-insensitive)
 * - Grouped by the fixed MAIN category (Taxes / Rent / Salary / …)
 * - "+ New subcategory" creates a subcategory inside the highlighted main group
 * - Income categories are excluded (those flow through fin_incomes)
 */
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFinCategories, useFinMainCategories, useCreateFinCategory } from "@/hooks/use-fin";
import { cn } from "@/lib/utils";

interface Props {
  value: string | null | undefined;
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Size hint: "sm" matches the 32px grid/table density. Default = form (40px). */
  size?: "sm" | "md";
}

const UNALLOCATED = "unallocated";

export const CategoryCombobox = ({
  value,
  onChange,
  placeholder = "Pick category…",
  className,
  disabled,
  size = "md",
}: Props) => {
  const { data: cats = [] } = useFinCategories();
  const { data: mains = [] } = useFinMainCategories();
  const create = useCreateFinCategory();
  const [open, setOpen] = useState(false);
  const [newFor, setNewFor] = useState<{ code: string; label: string } | null>(null);
  const [newName, setNewName] = useState("");

  const items = useMemo(
    () => (cats || []).filter((c: any) => c.is_active && !c.is_income),
    [cats],
  );

  const groups = useMemo(() => {
    const list = [
      ...mains.map((m) => ({ code: m.code, label: m.label })),
      { code: UNALLOCATED, label: "Unallocated" },
    ];
    return list
      .map((g) => ({ ...g, list: items.filter((c: any) => (c.main_code || UNALLOCATED) === g.code) }))
      .filter((g) => g.list.length || g.code !== UNALLOCATED);
  }, [mains, items]);

  const selected = items.find((c: any) => c.id === value);
  const h = size === "sm" ? "h-8 text-xs" : "h-10 text-sm";

  const submitNew = async () => {
    if (!newFor || !newName.trim()) return;
    await create.mutateAsync({
      group_code: "variable",
      group_name: "Variable",
      name: newName,
      main_code: newFor.code === UNALLOCATED ? null : newFor.code,
    });
    setNewName("");
    setNewFor(null);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn("justify-between font-normal w-full", h, className)}
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? selected.name : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[340px]" align="start">
          <Command>
            <CommandInput placeholder="Search category…" />
            <CommandList className="max-h-[380px]">
              <CommandEmpty>No category found</CommandEmpty>
              {groups.map((g) => (
                <CommandGroup key={g.code} heading={g.label}>
                  {g.list.map((c: any) => (
                    <CommandItem
                      key={c.id}
                      value={`${g.label} ${c.name}`}
                      onSelect={() => {
                        onChange(c.id);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn("mr-2 h-3.5 w-3.5", value === c.id ? "opacity-100" : "opacity-0")} />
                      {c.name}
                    </CommandItem>
                  ))}
                  <CommandItem
                    value={`${g.label} new subcategory`}
                    className="text-muted-foreground"
                    onSelect={() => {
                      setOpen(false);
                      setNewFor({ code: g.code, label: g.label });
                    }}
                  >
                    <Plus className="mr-2 h-3.5 w-3.5" />
                    New subcategory
                  </CommandItem>
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={!!newFor} onOpenChange={(o) => !o && setNewFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New subcategory · {newFor?.label}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Subcategory name"
            onKeyDown={(e) => { if (e.key === "Enter") submitNew(); }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFor(null)}>Cancel</Button>
            <Button onClick={submitNew} disabled={!newName.trim() || create.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CategoryCombobox;
