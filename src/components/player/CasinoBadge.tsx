import { memo } from "react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CasinoBadgeProps {
  casinoId: string;
  className?: string;
}

/** Cache of all casino codes — shared across all badge instances */
const useCasinoCodes = () => {
  return useQuery({
    queryKey: ["casino-codes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("casinos")
        .select("id, code, name");
      return data ?? [];
    },
    staleTime: 1000 * 60 * 30, // 30 min cache
  });
};

/** Color theme per casino name (case-insensitive). */
const getCasinoColor = (name: string) => {
  const n = name.toLowerCase();
  if (n.includes("arusha"))
    return "bg-red-500/15 text-red-700 border-red-300 dark:bg-red-500/25 dark:text-red-300 dark:border-red-500/40";
  if (n.includes("mwanza"))
    return "bg-blue-500/15 text-blue-700 border-blue-300 dark:bg-blue-500/25 dark:text-blue-300 dark:border-blue-500/40";
  if (n.includes("dodoma"))
    return "bg-yellow-400/20 text-yellow-900 border-yellow-400 dark:bg-yellow-500/20 dark:text-yellow-300 dark:border-yellow-500/40";
  if (n.includes("mbeya"))
    return "bg-emerald-500/15 text-emerald-700 border-emerald-300 dark:bg-emerald-500/25 dark:text-emerald-300 dark:border-emerald-500/40";
  return "bg-accent/50 text-accent-foreground/70 border-border/50";
};

/** Strip "Cloud" suffix from display name. */
const cleanCasinoName = (name: string) =>
  name.replace(/\bcloud\b/gi, "").trim();

/**
 * Shows a small badge with the full casino name and a brand colour,
 * indicating where the player was registered.
 */
const CasinoBadge = ({ casinoId, className }: CasinoBadgeProps) => {
  const { data: casinos = [] } = useCasinoCodes();
  const casino = casinos.find(c => c.id === casinoId);

  if (!casino) return null;

  const displayName = cleanCasinoName(casino.name);

  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border",
        getCasinoColor(casino.name),
        className
      )}
      title={`Registered at ${casino.name}`}
    >
      {displayName}
    </span>
  );
};

export default memo(CasinoBadge);
