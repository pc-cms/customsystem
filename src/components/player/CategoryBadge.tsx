import { cn } from "@/lib/utils";

export type PlayerCategory = "casino" | "diamond" | "platinum" | "gold" | "normal";

const CATEGORY_CONFIG: Record<PlayerCategory, { letter: string; label: string; classes: string }> = {
  casino: { letter: "C", label: "Casino", classes: "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/20 dark:text-red-400 dark:border-red-500/40" },
  diamond: { letter: "D", label: "Diamond", classes: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/20 dark:text-blue-400 dark:border-blue-500/40" },
  platinum: { letter: "P", label: "Platinum", classes: "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/20 dark:text-purple-400 dark:border-purple-500/40" },
  gold: { letter: "G", label: "Gold", classes: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-500/20 dark:text-yellow-400 dark:border-yellow-500/40" },
  normal: { letter: "N", label: "Normal", classes: "bg-muted text-muted-foreground border-border" },
};

export const CATEGORY_PRIORITY: Record<PlayerCategory, number> = {
  casino: -1,
  diamond: 0,
  platinum: 1,
  gold: 2,
  normal: 3,
};

export const ALL_CATEGORIES: PlayerCategory[] = ["casino", "diamond", "platinum", "gold", "normal"];

interface CategoryBadgeProps {
  category: PlayerCategory;
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

const CategoryBadge = ({ category, size = "sm", showLabel = false, className }: CategoryBadgeProps) => {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.normal;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border font-bold shrink-0",
        size === "sm" ? "w-5 h-5 text-[9px]" : "w-6 h-6 text-[10px]",
        config.classes,
        className
      )}
      title={config.label}
    >
      {showLabel ? config.label : config.letter}
    </span>
  );
};

export default CategoryBadge;
