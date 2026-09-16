/**
 * Global ACE filter bar: branch + Live/Closed mode + date range presets.
 * Contextual searches (player, EGM, state…) live inside each tab.
 */
import { FilterBar } from "@/components/layout/FilterBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangePresets, type DatePreset } from "@/components/ui/date-range-presets";
import type { AceMode } from "./ace-shared";

interface Props {
  casinos: { id: string; name: string }[];
  casinoId: string;
  onCasino: (v: string) => void;
  mode: AceMode;
  onMode: (m: AceMode) => void;
  preset: DatePreset;
  from: string;
  to: string;
  onRange: (r: { preset: DatePreset; from: string; to: string }) => void;
  /** Hide the date range (EGM Live is always a current snapshot). */
  hideDates?: boolean;
}

export const AceFilterBar = ({
  casinos,
  casinoId,
  onCasino,
  mode,
  onMode,
  preset,
  from,
  to,
  onRange,
  hideDates,
}: Props) => (
  <FilterBar
    filters={
      <>
        <Select value={casinoId} onValueChange={onCasino}>
          <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All branches</SelectItem>
            {casinos.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-1">
          <Button
            size="sm"
            className="h-9"
            variant={mode === "live" ? "default" : "outline"}
            onClick={() => onMode("live")}
          >
            Live
          </Button>
          <Button
            size="sm"
            className="h-9"
            variant={mode === "closed" ? "default" : "outline"}
            onClick={() => onMode("closed")}
          >
            Closed
          </Button>
        </div>

        {!hideDates && (
          <DateRangePresets preset={preset} from={from} to={to} onChange={onRange} hideWeek />
        )}
      </>
    }
    right={
      <Badge variant="outline">
        {mode === "live" ? "Live · current business day" : "Closed · stored data"}
      </Badge>
    }
  />
);
