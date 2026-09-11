/**
 * BossPhoneDashboard — compact phone-first view of the Dashboard TV.
 *
 * Shows ONLY the Live block: per-casino Tables / Slots / Total figures for
 * Today or the current Month (MTD), plus the Company Total.
 * Metric sources are the shared `deriveDisplayedToday` / `deriveDisplayedMonthly`
 * helpers — no separate formulas here.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { useBossCasinoDays } from "@/hooks/use-boss-dashboard";
import { useAceLiveSlotsResultMany } from "@/hooks/use-ace-finance";
import {
  deriveDisplayedToday,
  deriveDisplayedMonthly,
  sumDisplayedToday,
} from "@/lib/boss-display-metrics";
import { PREMIER, STAGE_BACKGROUND, tvAccentFor } from "@/components/boss/tv/tokens";
import {
  Num,
  fmtMoney,
  fmtSigned,
  fmtPct,
  resultColor,
  resultGlow,
  IVORY,
  DASH,
} from "@/components/boss/tv/primitives";
import premierClubLogo from "/premier-club-logo.svg";

type PeriodView = "today" | "monthly";

const LS_PERIOD = "boss-phone:period-view";

const COLS = "minmax(0, 1.05fr) minmax(0, 1.35fr) minmax(0, 0.6fr)";

function Metric({ label, drop, result, hold, muted }: {
  label: string;
  drop: number | null;
  result: number | null;
  hold: number | null;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg px-2 py-1.5" style={{ background: "rgba(255,255,255,0.04)" }}>
      <div
        className="text-[10px] font-semibold uppercase tracking-wider mb-1"
        style={{ color: PREMIER.darkGold }}
      >
        {label}
      </div>
      <div className="grid items-end gap-x-1" style={{ gridTemplateColumns: COLS }}>
        <div className="min-w-0 overflow-hidden">
          <div className="text-[9px] uppercase mb-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>Drop</div>
          <Num
            text={drop == null || muted ? DASH : fmtMoney(drop)}
            color={muted ? "rgba(255,255,255,0.35)" : IVORY}
            size="sm"
            className="w-full"
          />
        </div>
        <div className="min-w-0 overflow-hidden">
          <div className="text-[9px] uppercase mb-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>Result</div>
          <Num
            text={result == null || muted ? DASH : fmtSigned(result)}
            color={muted ? "rgba(255,255,255,0.35)" : resultColor(result)}
            glow={muted ? undefined : resultGlow(result)}
            size="sm"
            className="w-full"
          />
        </div>
        <div className="min-w-0 overflow-hidden text-right">
          <div className="text-[9px] uppercase mb-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>Hold</div>
          <Num
            text={hold == null || muted ? DASH : fmtPct(hold)}
            color={muted ? "rgba(255,255,255,0.35)" : PREMIER.lightBlue}
            size="sm"
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}

export default function BossPhoneDashboard() {
  const { accessibleCasinos: ctxCasinos } = useCasino();

  const { data: allCasinos = [] } = useQuery({
    queryKey: ["boss-dashboard-casinos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("casinos")
        .select("id, name, slug, code")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; slug: string | null; code: string }[];
    },
    staleTime: 60_000,
  });

  const casinos = allCasinos.length > 0 ? allCasinos : ctxCasinos;

  const [periodView, setPeriodView] = useState<PeriodView>(
    () => (localStorage.getItem(LS_PERIOD) as PeriodView) || "today",
  );
  useEffect(() => { localStorage.setItem(LS_PERIOD, periodView); }, [periodView]);

  const activeIds = useMemo(() => casinos.map((c) => c.id), [casinos]);
  const { data: days } = useBossCasinoDays(activeIds);
  const dayMap = useMemo(() => Object.fromEntries((days ?? []).map((d) => [d.casinoId, d])), [days]);

  const aceMap = useAceLiveSlotsResultMany(casinos.map((c) => c.slug));

  const displayed = useMemo(() => {
    const m: Record<string, ReturnType<typeof deriveDisplayedToday>> = {};
    for (const c of casinos) {
      m[c.id] = periodView === "today"
        ? deriveDisplayedToday(dayMap[c.id], c.slug ? aceMap[c.slug] : null)
        : deriveDisplayedMonthly(dayMap[c.id]);
    }
    return m;
  }, [casinos, dayMap, aceMap, periodView]);

  const company = useMemo(
    () => sumDisplayedToday(casinos.map((c) => displayed[c.id])),
    [casinos, displayed],
  );

  return (
    <div
      className="dark min-h-[100dvh] w-full text-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      style={{ background: STAGE_BACKGROUND["black-gold"] }}
    >
      <div className="w-full px-3 py-2 space-y-2">
        {/* Single compact header */}
        <div className="flex items-center gap-2">
          <img src={premierClubLogo} alt="Premier Club" className="h-6 w-auto shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold leading-tight truncate">Dashboard Phone</div>
          </div>
          <div className="inline-flex rounded-md border border-white/10 bg-black/40 p-0.5 shrink-0">
            {(["today", "monthly"] as PeriodView[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodView(p)}
                className="px-2.5 py-1 text-[11px] rounded-sm font-semibold"
                style={
                  periodView === p
                    ? { background: "rgba(232,198,136,0.18)", color: PREMIER.softGold }
                    : { color: "rgba(255,255,255,0.55)" }
                }
              >
                {p === "today" ? "Today" : "Month"}
              </button>
            ))}
          </div>
        </div>

        {/* Company total */}
        <div
          className="rounded-xl border p-2.5"
          style={{ borderColor: "rgba(232,198,136,0.25)", background: "rgba(255,255,255,0.03)" }}
        >
          <div
            className="text-[10px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: PREMIER.softGold }}
          >
            Company Total
          </div>
          <div className="grid items-end gap-x-1" style={{ gridTemplateColumns: COLS }}>
            <div className="min-w-0 overflow-hidden">
              <div className="text-[9px] uppercase mb-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>Drop</div>
              <Num text={fmtMoney(company.drop)} color={IVORY} size="md" className="w-full" />
            </div>
            <div className="min-w-0 overflow-hidden">
              <div className="text-[9px] uppercase mb-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>Result</div>
              <Num
                text={fmtSigned(company.result)}
                color={resultColor(company.result)}
                glow={resultGlow(company.result)}
                size="md"
                className="w-full"
              />
            </div>
            <div className="min-w-0 overflow-hidden text-right">
              <div className="text-[9px] uppercase mb-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>Hold</div>
              <Num text={fmtPct(company.hold)} color={PREMIER.lightBlue} size="md" className="w-full" />
            </div>
          </div>
        </div>

        {/* Casino cards */}
        {casinos.map((c, i) => {
          const dm = displayed[c.id];
          const accent = tvAccentFor(c.slug, i);
          return (
            <div
              key={c.id}
              className="rounded-xl border p-2.5 space-y-1.5"
              style={{ borderColor: `${accent}55`, background: "rgba(255,255,255,0.03)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-bold uppercase tracking-wide truncate" style={{ color: accent }}>
                  {c.name}
                </div>
                <div className="text-[10px] font-mono shrink-0" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {dm ? `${dm.total.headCount} heads` : "—"}
                </div>
              </div>

              <Metric
                label="Tables"
                drop={dm ? dm.tables.drop : null}
                result={dm ? dm.tables.result : null}
                hold={dm && dm.tables.drop > 0 ? dm.tables.hold : null}
              />
              <Metric
                label="Slots"
                drop={dm && dm.slotsDropAvailable ? dm.slots.drop : null}
                result={dm && dm.slotsResultAvailable ? dm.slots.result : null}
                hold={dm && dm.slotsResultAvailable && dm.slots.drop > 0 ? dm.slots.hold : null}
                muted={!dm?.slotsAvailable}
              />
              <Metric
                label="Total"
                drop={dm ? dm.total.drop : null}
                result={dm ? dm.total.result : null}
                hold={dm && dm.total.drop > 0 ? dm.total.hold : null}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
