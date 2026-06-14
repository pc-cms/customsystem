/**
 * CategoryCombobox — single unified picker over `fin_categories`.
 *
 * Replaces the legacy per-scope `expense_categories` dropdown. Categories ARE
 * `fin_categories` — no linking, no mapping. Whatever is picked here lands
 * directly in `expenses.fin_category_id` and feeds Monthly Report automatically.
 *
 * - Search by name (substring, case-insensitive)
 * - Grouped by `group_name` (Fixed / Variable / Tax / Salary / Petrol / Additional)
 * - Income categories are excluded (those flow through fin_incomes)
 */
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useFinCategories } from "@/hooks/use-fin";
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

export const CategoryCombobox = ({
  value,
  onChange,
  placeholder = "Pick category…",
  className,
  disabled,
  size = "md",
}: Props) => {
  const { data: cats = [] } = useFinCategories();
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () => (cats || []).filter((c: any) => c.is_active && !c.is_income),
    [cats],
  );
  const grouped = useMemo(() => {
    const m: Record<string, any[]> = {};
    items.forEach((c: any) => {
      const g = c.group_name || c.group_code || "Other";
      (m[g] ||= []).push(c);
    });
    return m;
  }, [items]);

  const selected = items.find((c: any) => c.id === value);
  const h = size === "sm" ? "h-8 text-xs" : "h-10 text-sm";

  return (
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
      <PopoverContent className="p-0 w-[320px]" align="start">
        <Command>
          <CommandInput placeholder="Search category…" />
          <CommandList className="max-h-[360px]">
            <CommandEmpty>No category found</CommandEmpty>
            {Object.entries(grouped).map(([gname, list]) => (
              <CommandGroup key={gname} heading={gname}>
                {list.map((c: any) => (
                  <CommandItem
                    key={c.id}
                    value={`${gname} ${c.name}`}
                    onSelect={() => {
                      onChange(c.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-3.5 w-3.5", value === c.id ? "opacity-100" : "opacity-0")} />
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default CategoryCombobox;
