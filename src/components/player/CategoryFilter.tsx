import { useState } from "react";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ALL_CATEGORIES, type PlayerCategory } from "./CategoryBadge";

const CATEGORY_CHIP: Record<PlayerCategory, string> = {
  casino: "bg-[hsl(var(--casino)/0.15)] text-[hsl(var(--casino))] border-[hsl(var(--casino)/0.5)] dark:bg-[hsl(var(--casino)/0.2)]",
  diamond: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/40",
  platinum: "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/40",
  gold: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/40",
  normal: "bg-muted text-muted-foreground border-border",
};

const CATEGORY_LABEL: Record<PlayerCategory, string> = {
  casino: "Casino",
  diamond: "Diamond",
  platinum: "Platinum",
  gold: "Gold",
  normal: "Normal",
};

const CATEGORY_LETTER: Record<PlayerCategory, string> = {
  casino: "C",
  diamond: "D",
  platinum: "P",
  gold: "G",
  normal: "N",
};

interface CategoryFilterProps {
  selected: Set<PlayerCategory>;
  onChange: (next: Set<PlayerCategory>) => void;
}

const CategoryFilter = ({ selected, onChange }: CategoryFilterProps) => {
  const [open, setOpen] = useState(false);
  const allSelected = selected.size === ALL_CATEGORIES.length;

  const toggle = (cat: PlayerCategory, checked: boolean) => {
    const next = new Set(selected);
    if (checked) {
      next.add(cat);
    } else {
      if (next.size > 1) next.delete(cat);
    }
    onChange(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-border text-[11px] font-mono font-black uppercase tracking-wide transition-colors",
            !allSelected ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/40"
          )}
        >
          <span>LEVEL</span>
          <Filter className="w-3 h-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-2">
        <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2 px-1">Filter levels</p>
        <div className="space-y-1">
          {ALL_CATEGORIES.map((cat) => (
            <label key={cat} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted/40 cursor-pointer text-xs">
              <Checkbox
                checked={selected.has(cat)}
                onCheckedChange={(v) => toggle(cat, !!v)}
              />
              <span className={cn(
                "inline-flex items-center justify-center min-w-[28px] h-5 px-1.5 rounded border text-[10px] font-mono font-black",
                CATEGORY_CHIP[cat]
              )}>
                {CATEGORY_LETTER[cat]}
              </span>
              <span className="text-card-foreground">{CATEGORY_LABEL[cat]}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default CategoryFilter;
