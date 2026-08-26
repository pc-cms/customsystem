/**
 * BossDashboard — Dashboard TV overview of multiple casinos.
 *
 * Two modes:
 *  - Live: one of three Premier style-driven layouts (Black Gold, Red Gold,
 *    Dark Gold) rendered by `LiveStage`. The chosen style persists in
 *    localStorage; all styles share the same metric sources
 *    (`deriveDisplayedToday` / `deriveDisplayedMonthly`) and Company Total is
 *    always the exact sum of the displayed casino cards.
 *  - Company Report: unchanged monthly report with its month picker.
 *
 * Two resolution presets: FHD (1x) and 4K (2x) — scales via base font size.
 * Auto-refreshes every 10s. Live is strictly the current business day.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCasino } from "@/lib/casino-context";
import { getBusinessDate } from "@/lib/business-day";
import { Monitor, LayoutGrid, Palette, Tv, Maximize2, Minimize2, Type, FileBarChart2, LayoutDashboard, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import premierClubLogo from "/premier-club-logo.svg";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-mono/700.css";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useBossCasinoDays,
  useBossTopPlayers,
  useBossNewPlayers,
} from "@/hooks/use-boss-dashboard";
import { LiveStage } from "@/components/boss/tv/live-stage";
import { useEatClock } from "@/components/boss/tv/primitives";
import {
  DEFAULT_TV_STYLE,
  STAGE_BACKGROUND,
  TV_STYLES,
  tvAccentFor,
  type TvStyleId,
} from "@/components/boss/tv/tokens";
import type { TvCasino } from "@/components/boss/tv/types";
import { MonthlyReportPanel } from "@/components/boss/monthly-report-panel";
import { useAceLiveSlotsResultMany } from "@/hooks/use-ace-finance";
import { deriveDisplayedToday, deriveDisplayedMonthly, sumDisplayedToday } from "@/lib/boss-display-metrics";


type Resolution = "fhd" | "uhd";
type FontPreset = "s" | "m" | "l" | "xl";
type BlockOrient = "auto" | "cols" | "rows" | "report";
type PeriodView = "today" | "monthly";

const LS_CASINOS = "boss-tv:casinos";
const LS_RES = "boss-tv:resolution";
const LS_TV = "boss-tv:tv-mode";
const LS_FONT = "boss-tv:font-preset";
const LS_ORIENT = "boss-tv:block-orient";
const LS_MONTH = "boss-tv:report-month";
const LS_PERIOD = "boss-tv:period-view";
const LS_STYLE = "boss-tv:style";


const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];


const FONT_PRESETS: Record<FontPreset, { mult: number; label: string }> = {
  s:  { mult: 0.85, label: "S" },
  m:  { mult: 1.0,  label: "M" },
  l:  { mult: 1.3,  label: "L" },
  xl: { mult: 1.65, label: "XL" },
};

const readArray = (key: string): string[] | null => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
};

// Casino accent colors — deep saturated for glow on black.
const CASINO_ACCENTS: Record<string, string> = {
  arusha: "hsl(24 95% 60%)",   // amber
  mwanza: "hsl(200 100% 60%)", // sky
  dodoma: "hsl(150 80% 55%)",  // emerald
  mbeya:  "hsl(280 90% 70%)",  // violet
};

const FALLBACK_ACCENTS = [
  "hsl(24 95% 60%)",
  "hsl(200 100% 60%)",
  "hsl(150 80% 55%)",
  "hsl(280 90% 70%)",
];

const accentFor = (slug: string | null, idx: number) => {
  if (slug && CASINO_ACCENTS[slug]) return CASINO_ACCENTS[slug];
  return FALLBACK_ACCENTS[idx % FALLBACK_ACCENTS.length];
};

export default function BossDashboard() {
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

  const accessibleCasinos = allCasinos.length > 0 ? allCasinos : ctxCasinos;

  const [selectedIds, setSelectedIds] = useState<string[]>(() => readArray(LS_CASINOS) ?? []);
  const [resolution, setResolution] = useState<Resolution>(() => (localStorage.getItem(LS_RES) as Resolution) || "fhd");
  const [tvMode, setTvMode] = useState<boolean>(() => localStorage.getItem(LS_TV) === "1");
  const [fontPreset, setFontPreset] = useState<FontPreset>(
    () => (localStorage.getItem(LS_FONT) as FontPreset) || "l",
  );
  const [blockOrient, setBlockOrient] = useState<BlockOrient>(
    () => (localStorage.getItem(LS_ORIENT) as BlockOrient) || "auto",
  );
  const [periodView, setPeriodView] = useState<PeriodView>(
    () => (localStorage.getItem(LS_PERIOD) as PeriodView) || "today",
  );
  const [tvStyle, setTvStyle] = useState<TvStyleId>(
    () => (localStorage.getItem(LS_STYLE) as TvStyleId) || DEFAULT_TV_STYLE,
  );
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => !!document.fullscreenElement);

  const [reportYM, setReportYM] = useState<{ y: number; m: number }>(() => {
    try {
      const raw = localStorage.getItem(LS_MONTH);
      if (raw) { const p = JSON.parse(raw); if (p?.y && p?.m) return p; }
    } catch { /* ignore */ }
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() + 1 };
  });
  const shiftMonth = (delta: number) => {
    const d = new Date(reportYM.y, reportYM.m - 1 + delta, 1);
    setReportYM({ y: d.getFullYear(), m: d.getMonth() + 1 });
  };
  const thisMonth = () => {
    const n = new Date();
    setReportYM({ y: n.getFullYear(), m: n.getMonth() + 1 });
  };


  useEffect(() => {
    if (accessibleCasinos.length === 0) return;
    const valid = new Set(accessibleCasinos.map((c) => c.id));
    const kept = selectedIds.filter((id) => valid.has(id));
    if (kept.length === 0) setSelectedIds(accessibleCasinos.map((c) => c.id));
    else if (kept.length !== selectedIds.length) setSelectedIds(kept);
  }, [accessibleCasinos, selectedIds]);

  useEffect(() => { localStorage.setItem(LS_CASINOS, JSON.stringify(selectedIds)); }, [selectedIds]);
  useEffect(() => { localStorage.setItem(LS_RES, resolution); }, [resolution]);
  useEffect(() => { localStorage.setItem(LS_TV, tvMode ? "1" : "0"); }, [tvMode]);
  useEffect(() => { localStorage.setItem(LS_FONT, fontPreset); }, [fontPreset]);
  useEffect(() => { localStorage.setItem(LS_ORIENT, blockOrient); }, [blockOrient]);
  useEffect(() => { localStorage.setItem(LS_MONTH, JSON.stringify(reportYM)); }, [reportYM]);
  useEffect(() => { localStorage.setItem(LS_PERIOD, periodView); }, [periodView]);
  useEffect(() => { localStorage.setItem(LS_STYLE, tvStyle); }, [tvStyle]);



  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch { /* user gesture / permissions */ }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "t" || e.key === "T") setTvMode((v) => !v);
      if (e.key === "f" || e.key === "F") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen]);

  const casinos = useMemo(
    () => accessibleCasinos.filter((c) => selectedIds.includes(c.id)),
    [accessibleCasinos, selectedIds],
  );
  const activeIds = casinos.map((c) => c.id);

  const { data: days } = useBossCasinoDays(activeIds);
  const dayMap = useMemo(() => Object.fromEntries(days.map((d) => [d.casinoId, d])), [days]);

  const { data: topPlayers = [] } = useBossTopPlayers(activeIds);
  const { data: newPlayers = [] } = useBossNewPlayers(activeIds);

  const topByCasino = useMemo(() => {
    const m: Record<string, typeof topPlayers> = {};
    for (const t of topPlayers) (m[t.casinoId] || (m[t.casinoId] = [])).push(t);
    return m;
  }, [topPlayers]);

  // Displayed Today metrics — single source of truth shared by the cards and
  // the Company Total panel (ACE live override applied exactly once).
  const aceMap = useAceLiveSlotsResultMany(casinos.map((c) => c.slug));
  const displayedMap = useMemo(() => {
    const m: Record<string, ReturnType<typeof deriveDisplayedToday>> = {};
    for (const c of casinos) {
      m[c.id] = deriveDisplayedToday(dayMap[c.id], c.slug ? aceMap[c.slug] : null);
    }
    return m;
  }, [casinos, dayMap, aceMap]);
  const companyToday = useMemo(
    () => sumDisplayedToday(casinos.map((c) => displayedMap[c.id])),
    [casinos, displayedMap],
  );

  // Monthly (MTD) metrics — sourced like Analytics → Statistics, no ACE override.
  const monthlyMap = useMemo(() => {
    const m: Record<string, ReturnType<typeof deriveDisplayedMonthly>> = {};
    for (const c of casinos) m[c.id] = deriveDisplayedMonthly(dayMap[c.id]);
    return m;
  }, [casinos, dayMap]);
  const companyMonthly = useMemo(
    () => sumDisplayedToday(casinos.map((c) => monthlyMap[c.id])),
    [casinos, monthlyMap],
  );


  // View model for the Live styles — one shared source of truth.
  const tvCasinos: TvCasino[] = useMemo(
    () =>
      casinos.map((c, i) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        accent: tvAccentFor(c.slug, i),
        displayed: (periodView === "today" ? displayedMap[c.id] : monthlyMap[c.id]) ?? null,
        top: (topByCasino[c.id] || []).map((t) => ({
          playerId: t.playerId,
          name: t.name,
          drop: t.drop,
          casinoId: t.casinoId,
        })),
      })),
    [casinos, displayedMap, monthlyMap, periodView, topByCasino],
  );

  const isReport = blockOrient === "report";
  const liveTv = tvMode && !isReport;

  // Typography: TV live view uses viewport-responsive sizing (clamp/vw) so 4K
  // scales naturally without multiplying the root font by a big factor.
  const densityMult = FONT_PRESETS[fontPreset].mult;
  const resNudge = resolution === "uhd" ? 1.06 : 1;
  const rootFontSize = liveTv
    ? `clamp(${(11 * densityMult * resNudge).toFixed(1)}px, ${(0.68 * densityMult * resNudge).toFixed(2)}vw, ${(30 * densityMult * resNudge).toFixed(0)}px)`
    : `${16 * (resolution === "uhd" ? 1.35 : 1) * densityMult}px`;

  // Safe padding only — no max-width containers, no 5vw side gutters.
  const sidePad = tvMode ? "px-[clamp(12px,0.9vw,32px)]" : "px-8";
  const outerPad = tvMode ? `${sidePad} pt-[clamp(6px,0.8vh,18px)]` : "px-8 pt-6 pb-4";
  const mainPad = tvMode ? `${sidePad} pb-[clamp(10px,1vh,28px)]` : "px-8 pb-8";

  // Measure the header + control bar so the casino grid can fill exactly the
  // remaining first-screen height (4 cards = strict 2×2, no cropping).
  const chromeRef = useRef<HTMLDivElement | null>(null);
  const [chromeH, setChromeH] = useState(0);
  useEffect(() => {
    const el = chromeRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setChromeH(el.offsetHeight));
    ro.observe(el);
    setChromeH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  const clock = useEatClock();
  const businessDate = getBusinessDate();
  const dateLabel = new Date(businessDate).toLocaleDateString("en-GB", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
  });
  const nowDate = new Date(businessDate);
  const liveMonthLabel = `${MONTH_LABELS[nowDate.getMonth()]} ${nowDate.getFullYear()}`;




  return (
    <div
      className="min-h-[100dvh] w-full text-foreground"
      style={{
        fontSize: rootFontSize,
        background: isReport
          ? "radial-gradient(1200px 800px at 20% -10%, hsl(240 40% 12% / 0.9), transparent 60%), radial-gradient(1000px 600px at 90% 110%, hsl(280 40% 10% / 0.8), transparent 60%), hsl(240 20% 5%)"
          : STAGE_BACKGROUND[tvStyle],
        fontFamily: isReport ? undefined : "'IBM Plex Sans', system-ui, sans-serif",
      }}
    >
     <div ref={chromeRef}>

      {/* Header — brand + title only (hidden in TV mode: each stage owns its own header) */}
      {!liveTv && (
      <header className={`flex items-center justify-between gap-6 ${outerPad} ${liveTv ? "pb-1" : "pb-2"}`}>

        <div className={`flex items-center min-w-0 ${liveTv ? "gap-3" : "gap-4"}`}>
          <div
            className={`relative flex items-center justify-center rounded-full border border-white/10 overflow-hidden bg-white/5 ${liveTv ? "w-9 h-9" : "w-14 h-14"}`}
            style={{ boxShadow: "0 0 30px hsl(var(--primary) / 0.35)" }}
          >
            <img src={premierClubLogo} alt="Premier Club" className={liveTv ? "w-7 h-7 object-contain" : "w-11 h-11 object-contain"} />
          </div>
          <div className={liveTv ? "flex items-baseline gap-4 min-w-0" : "flex flex-col min-w-0"}>
            <h1 className="text-[1.35em] font-extrabold tracking-[0.28em] uppercase leading-none truncate">
              Premier Casino
            </h1>
            <span className={`text-[0.7em] tracking-[0.3em] uppercase text-muted-foreground whitespace-nowrap ${liveTv ? "" : "mt-1"}`}>
              Dashboard TV · {blockOrient === "report"
                ? `Company Report · ${MONTH_LABELS[reportYM.m - 1]} ${reportYM.y}`
                : periodView === "today"
                ? `Live Overview · Today · ${dateLabel}`
                : `Live Overview · Monthly · ${liveMonthLabel}`}

            </span>
          </div>
        </div>
        {!isReport && (
          <div className="flex items-baseline gap-[clamp(8px,0.9vw,26px)] whitespace-nowrap">
            <span className="text-[clamp(11px,0.7vw,22px)] uppercase tracking-[0.22em] text-white/60 font-semibold">
              {clock.date}
            </span>
            <span className="font-mono tabular-nums font-bold text-[clamp(20px,1.6vw,50px)] leading-none text-[#F2E3C4]">
              {clock.time}
            </span>
            <span className="text-[clamp(9px,0.5vw,15px)] uppercase tracking-[0.28em] text-white/40">EAT</span>
          </div>
        )}
      </header>

      {/* Unified control bar — view, month, casinos, layout, size, TV, fullscreen */}
      <div className={`${sidePad} ${liveTv ? "pb-2" : "pb-4"}`}>
        <div className={`rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-sm flex items-center gap-2 ${liveTv ? "px-2 py-1 flex-nowrap overflow-x-auto" : "px-3 py-2 flex-wrap"}`}>

          {/* View switcher — Live vs Report */}
          <div className="inline-flex rounded-md border border-white/10 bg-black/30 p-0.5" title="Switch view">
            <button
              className={`px-3 py-1.5 text-xs rounded-sm inline-flex items-center gap-1.5 font-semibold ${blockOrient !== "report" ? "bg-primary/25 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setBlockOrient((prev) => (prev === "report" ? "auto" : prev))}
            >
              <LayoutDashboard className="w-3.5 h-3.5" /> Live
            </button>
            <button
              className={`px-3 py-1.5 text-xs rounded-sm inline-flex items-center gap-1.5 font-semibold ${blockOrient === "report" ? "bg-primary/25 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setBlockOrient("report" as BlockOrient)}
            >
              <FileBarChart2 className="w-3.5 h-3.5" /> Report
            </button>
          </div>

          {/* Period switcher — Live view only (Monthly = current month MTD) */}
          {blockOrient !== "report" && (
            <div className="inline-flex rounded-md border border-white/10 bg-black/30 p-0.5" title="Period">
              {(["today", "monthly"] as PeriodView[]).map((p) => (
                <button
                  key={p}
                  className={`px-3 py-1.5 text-xs rounded-sm font-semibold capitalize ${periodView === p ? "bg-primary/25 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setPeriodView(p)}
                >
                  {p === "today" ? "Today" : "Monthly"}
                </button>
              ))}
            </div>
          )}



          {/* Month picker (report only) */}
          {blockOrient === "report" && (
            <div className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/30 px-1 py-0.5">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => shiftMonth(-1)} aria-label="Previous month">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="px-2 py-0.5 font-semibold tabular-nums min-w-[110px] text-center text-xs">
                {MONTH_LABELS[reportYM.m - 1]} {reportYM.y}
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => shiftMonth(1)} aria-label="Next month">
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={thisMonth}>
                <Calendar className="w-3.5 h-3.5 mr-1" /> This month
              </Button>
            </div>
          )}

          {/* Visual style (Live only) */}
          {blockOrient !== "report" && (
            <div className="inline-flex rounded-md border border-white/10 bg-black/30 p-0.5" title="Visual style">
              <span className="px-2 py-1 text-muted-foreground inline-flex items-center">
                <Palette className="w-3.5 h-3.5" />
              </span>
              {TV_STYLES.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  aria-pressed={tvStyle === st.id}
                  className={`px-2.5 py-1 text-xs rounded-sm font-semibold whitespace-nowrap ${tvStyle === st.id ? "bg-primary/25 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setTvStyle(st.id)}
                >
                  {st.label}
                </button>
              ))}
            </div>
          )}

          {/* Casinos */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 border-white/10 bg-black/30 h-8">
                <LayoutGrid className="w-4 h-4" /> {selectedIds.length}/{accessibleCasinos.length} casinos
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64">
              <div className="flex flex-col gap-2">
                {accessibleCasinos.map((c) => {
                  const checked = selectedIds.includes(c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setSelectedIds((prev) =>
                            v ? [...prev, c.id] : prev.filter((x) => x !== c.id),
                          )
                        }
                      />
                      <span>{c.name}</span>
                    </label>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          {/* Layout split (Today | MTD) removed — one period per card now. */}


          {/* Font size */}
          <div className="inline-flex rounded-md border border-white/10 bg-black/30 p-0.5" title="Font size preset">
            <span className="px-2 py-1 text-muted-foreground inline-flex items-center"><Type className="w-3.5 h-3.5" /></span>
            {(Object.keys(FONT_PRESETS) as FontPreset[]).map((p) => (
              <button
                key={p}
                className={`px-2 py-1 text-xs rounded-sm font-bold ${fontPreset === p ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
                onClick={() => setFontPreset(p)}
              >
                {FONT_PRESETS[p].label}
              </button>
            ))}
          </div>

          {/* Resolution */}
          <div className="inline-flex rounded-md border border-white/10 bg-black/30 p-0.5">
            <button
              className={`px-3 py-1 text-xs rounded-sm inline-flex items-center gap-1.5 ${resolution === "fhd" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
              onClick={() => setResolution("fhd")}
            >
              <Monitor className="w-3.5 h-3.5" /> FHD
            </button>
            <button
              className={`px-3 py-1 text-xs rounded-sm inline-flex items-center gap-1.5 ${resolution === "uhd" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
              onClick={() => setResolution("uhd")}
            >
              <Monitor className="w-3.5 h-3.5" /> 4K
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant={tvMode ? "default" : "outline"}
              size="sm"
              className={`gap-2 h-8 ${tvMode ? "" : "border-white/10 bg-black/30"}`}
              onClick={() => setTvMode((v) => !v)}
              title="Toggle TV mode (T) — overscan-safe padding & big text"
            >
              <Tv className="w-4 h-4" /> TV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-white/10 bg-black/30 h-8"
              onClick={toggleFullscreen}
              title="Fullscreen (F)"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>
     </div>

      {/* Live stage (styled) or Company Report */}
      <main className={mainPad} style={isReport ? undefined : { height: `calc(100dvh - ${chromeH}px - 12px)` }}>
        {isReport ? (
          <MonthlyReportPanel casinos={casinos} accentFor={accentFor} year={reportYM.y} month={reportYM.m} />
        ) : (
          <LiveStage
            style={tvStyle}
            casinos={tvCasinos}
            company={periodView === "today" ? companyToday : companyMonthly}
            newPlayersCount={newPlayers.length}
            period={periodView}
            periodLabel={liveMonthLabel}
          />
        )}
      </main>
    </div>
  );
}
