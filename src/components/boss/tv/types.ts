import type { CompanyToday, DisplayedToday } from "@/lib/boss-display-metrics";

export interface TvTopPlayer {
  playerId: string;
  name: string;
  drop: number;
  casinoId: string;
}

export interface TvCasino {
  id: string;
  name: string;
  slug: string | null;
  accent: string;
  displayed: DisplayedToday | null;
  top: TvTopPlayer[];
}

export interface TvStageProps {
  casinos: TvCasino[];
  company: CompanyToday;
  newPlayersCount: number;
  period: "today" | "monthly";
  periodLabel: string;
}
