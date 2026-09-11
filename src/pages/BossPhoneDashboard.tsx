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
import { getBusinessDate } from "@/lib/business-day";
import premierClubLogo from "/premier-club-logo.svg";
import { useBossCasinoDays } from "@/hooks/use-boss-dashboard";
import { useAceLiveSlotsResultMany } from "@/hooks/use-ace-finance";
import {
  deriveDisplayedToday,
  deriveDisplayedMonthly,
  sumDisplayedToday,
} from "@/lib/boss-display-metrics";
import { PREMIER, STAGE_BACKGROUND, tvAccentFor } from "@/components/boss/tv/tokens";
import { useEatClock } from "@/components/boss/tv/primitives";

type PeriodView = "today" | "monthly";

const LS_PERIOD = "boss-phone:period-view";
const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const money = (n: number) =>
  `${n < 0 ? "-" : ""}${Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;

function Metric({ label, drop, result, hold, muted }: {
  label: string;
  drop: number | null;
  result: number | null;
  hold: number | null;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(255,255,255,0.04)" }}>
      <div
        className="text-[10px] font-semibold uppercase tracking-wider mb-1"
        style={{ color: PREMIER.darkGold }}
      >
        {label}
      </div>
      <div className="grid grid-cols-3 gap-1 items-baseline">
        <div className="min-w-0">
          <div className="text-[9px] uppercase" style={{ color: "rgba(255,255,255,0.45)" }}>Drop</div>
          <div
            className="font-mono font-semibold tabular-nums text-[13px] leading-tight truncate"
            style={{ color: muted ? "rgba(255,255,255,0.35)" : PREMIER.champagne }}
          >
            {drop === null ? "—" : money(drop)}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[9px] uppercase" style={{ color: "rgba(255,255,255,0.45)" }}>Result</div>
          <div
            className="font-mono font-semibold tabular-nums text-[13px] leading-tight truncate"
            style={{
              color: result === null
                ? "rgba(255,255,255,0.35)"
                : result < 0 ? "#F08A8A" : PREMIER.softGold,
            }}
          >
            {result === null ? "—" : money(result)}
          </div>
        </div>
        <div className="min-w-0 text-right">
          <div className="text-[9px] uppercase" style={{ color: "rgba(255,255,255,0.45)" }}>Hold</div>
          <div
            className="font-mono font-semibold tabular-nums text-[13px] leading-tight"
            style={{ color: hold === null ? "rgba(255,255,255,0.35)" : PREMIER.lightBlue }}
          >
            {hold === null ? "—" : `${hold.toFixed(1)}%`}
          </div>
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

  const clock = useEatClock();
  const businessDate = getBusinessDate();
  const d = new Date(businessDate);
  const dateLabel = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const monthLabel = `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;

  return (
    <div
      className="dark min-h-[100dvh] w-full text-white"
      style={{ background: STAGE_BACKGROUND["black-gold"] }}
    >
      <div className="mx-auto w-full max-w-[560px] px-3 py-3 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <img src={premierClubLogo} alt="Premier Club" className="h-7 w-auto" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold leading-tight truncate">Dashboard Phone</div>
            <div className="text-[10px] leading-tight" style={{ color: "rgba(255,255,255,0.5)" }}>
              {periodView === "today" ? dateLabel : monthLabel} · {clock}
            </div>
          </div>
          <div className="inline-flex rounded-md border border-white/10 bg-black/40 p-0.5">
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
          className="rounded-xl border p-3"
          style={{ borderColor: "rgba(232,198,136,0.25)", background: "rgba(255,255,255,0.03)" }}
        >
          <div
            className="text-[10px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: PREMIER.softGold }}
          >
            Company Total
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="min-w-0">
              <div className="text-[9px] uppercase" style={{ color: "rgba(255,255,255,0.45)" }}>Drop</div>
              <div className="font-mono font-bold tabular-nums text-[16px] truncate" style={{ color: PREMIER.champagne }}>
                {money(company.drop)}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-[9px] uppercase" style={{ color: "rgba(255,255,255,0.45)" }}>Result</div>
              <div
                className="font-mono font-bold tabular-nums text-[16px] truncate"
                style={{ color: company.result < 0 ? "#F08A8A" : PREMIER.softGold }}
              >
                {money(company.result)}
              </div>
            </div>
            <div className="min-w-0 text-right">
              <div className="text-[9px] uppercase" style={{ color: "rgba(255,255,255,0.45)" }}>Hold</div>
              <div className="font-mono font-bold tabular-nums text-[16px]" style={{ color: PREMIER.lightBlue }}>
                {company.hold.toFixed(1)}%
              </div>
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
              className="rounded-xl border p-3 space-y-2"
              style={{ borderColor: `${accent}55`, background: "rgba(255,255,255,0.03)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-bold uppercase tracking-wide truncate" style={{ color: accent }}>
                  {c.name}
                </div>
                <div className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.5)" }}>
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
