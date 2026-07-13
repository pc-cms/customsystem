/**
 * BossDashboard — million-dollar TV overview of multiple casinos.
 *
 * Two layouts: Rows (default, best for 75" TVs) and Columns.
 * Two resolution presets: FHD (1x) and 4K (2x) — scales via --tv-scale.
 * Auto-refreshes every 10s. Deep dark stage, glowing accents, huge numerals.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCasino } from "@/lib/casino-context";
import { formatMoneyFull } from "@/lib/format-money";
import { Check, Monitor, LayoutGrid, Rows3, Sparkles, Users, UserPlus, TrendingUp, Tv, Maximize2, Minimize2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useBossCasinoDays,
  useBossTopPlayers,
  useBossNewPlayers,
  type CasinoDay,
  type CasinoMetric,
} from "@/hooks/use-boss-dashboard";

type Layout = "rows" | "columns";
type Resolution = "fhd" | "uhd";
type FontPreset = "s" | "m" | "l" | "xl";

const LS_CASINOS = "boss-tv:casinos";
const LS_LAYOUT = "boss-tv:layout";
const LS_RES = "boss-tv:resolution";
const LS_TV = "boss-tv:tv-mode";
const LS_FONT = "boss-tv:font-preset";

// Font preset multipliers — applied on top of resolution scale.
// Tuned so "L" is comfortable on 75" @ FHD from 4–6m viewing distance.
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

const accentFor = (slug: string | null, idx: number) => {
  if (slug && CASINO_ACCENTS[slug]) return CASINO_ACCENTS[slug];
  const fallbacks = Object.values(CASINO_ACCENTS);
  return fallbacks[idx % fallbacks.length];
};

const formatSigned = (n: number) => {
  const s = formatMoneyFull(Math.abs(Math.round(n)));
  return (n < 0 ? "-" : n > 0 ? "+" : "") + s;
};

const holdColor = (n: number) => {
  if (n > 0) return "text-emerald-400";
  if (n < 0) return "text-rose-400";
  return "text-muted-foreground";
};

const MetricValue = ({
  value,
  kind = "plain",
  accent,
  size = "md",
}: {
  value: string;
  kind?: "plain" | "signed" | "hold";
  accent?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) => {
  const sizeCls = {
    sm: "text-[1.4em]",
    md: "text-[2em]",
    lg: "text-[2.8em]",
    xl: "text-[3.6em]",
  }[size];
  const color =
    kind === "signed"
      ? value.startsWith("-")
        ? "text-rose-400"
        : value.startsWith("+")
        ? "text-emerald-400"
        : "text-foreground"
      : kind === "hold"
      ? "text-foreground"
      : "text-foreground";
  return (
    <span
      className={`font-mono font-bold tabular-nums tracking-tight ${sizeCls} ${color}`}
      style={accent ? { textShadow: `0 0 24px ${accent}55` } : undefined}
    >
      {value}
    </span>
  );
};

const MetricCell = ({
  label,
  value,
  kind = "plain",
  accent,
}: { label: string; value: string; kind?: "plain" | "signed" | "hold"; accent?: string }) => (
  <div className="flex flex-col gap-1 min-w-0">
    <span className="text-[0.72em] uppercase tracking-[0.2em] text-muted-foreground/80 font-semibold">{label}</span>
    <MetricValue value={value} kind={kind} accent={accent} size="lg" />
  </div>
);

const SegmentRow = ({
  label,
  metric,
  accent,
}: { label: string; metric: CasinoMetric; accent: string }) => (
  <div className="grid grid-cols-[9em_1fr_1fr_1fr_1fr] gap-6 items-center py-4 px-6 border-t border-white/5">
    <div className="text-[1.1em] font-bold tracking-[0.16em] uppercase" style={{ color: accent }}>
      {label}
    </div>
    <MetricCell label="Drop" value={formatMoneyFull(metric.drop)} accent={accent} />
    <MetricCell label="Result" value={formatSigned(metric.result)} kind="signed" />
    <MetricCell label="Hold %" value={`${metric.hold.toFixed(1)}%`} kind="hold" />
    <MetricCell label="Head Count" value={String(metric.headCount)} />
  </div>
);

const CasinoRow = ({
  name,
  slug,
  accent,
  day,
}: { name: string; slug: string | null; accent: string; day: CasinoDay | undefined }) => {
  return (
    <section
      className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent overflow-hidden"
      style={{ boxShadow: `inset 0 1px 0 0 ${accent}22, 0 0 40px -20px ${accent}` }}
    >
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ background: `linear-gradient(90deg, ${accent}22 0%, transparent 60%)` }}
      >
        <div className="flex items-center gap-4">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: accent, boxShadow: `0 0 20px ${accent}` }}
          />
          <h2 className="text-[1.6em] font-extrabold tracking-[0.22em] uppercase" style={{ color: accent }}>
            {name}
          </h2>
          {slug && <span className="text-[0.7em] uppercase tracking-widest text-muted-foreground">{slug}</span>}
        </div>
        {day && (
          <div className="flex items-center gap-3 text-[0.75em] text-muted-foreground">
            <TrendingUp className="w-4 h-4" style={{ color: accent }} />
            <span>MTD Drop {formatMoneyFull(day.mtd.drop)}</span>
            <span className={holdColor(day.mtd.result)}>· Result {formatSigned(day.mtd.result)}</span>
            <span>· Hold {day.mtd.hold.toFixed(1)}%</span>
          </div>
        )}
      </header>
      {day ? (
        <>
          <SegmentRow label="Total" metric={day.total} accent={accent} />
          <SegmentRow label="Live" metric={day.live} accent={accent} />
          <SegmentRow label="Slots" metric={day.slots} accent={accent} />
        </>
      ) : (
        <div className="py-10 text-center text-muted-foreground">Loading…</div>
      )}
    </section>
  );
};

const CasinoColumn = ({
  name,
  slug,
  accent,
  day,
}: { name: string; slug: string | null; accent: string; day: CasinoDay | undefined }) => (
  <section
    className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent overflow-hidden"
    style={{ boxShadow: `inset 0 1px 0 0 ${accent}22, 0 0 40px -20px ${accent}` }}
  >
    <header
      className="flex flex-col gap-1 px-5 py-4"
      style={{ background: `linear-gradient(180deg, ${accent}22 0%, transparent 100%)` }}
    >
      <div className="flex items-center gap-3">
        <span className="inline-block w-3 h-3 rounded-full" style={{ background: accent, boxShadow: `0 0 20px ${accent}` }} />
        <h2 className="text-[1.4em] font-extrabold tracking-[0.2em] uppercase" style={{ color: accent }}>{name}</h2>
      </div>
      {slug && <span className="text-[0.65em] uppercase tracking-widest text-muted-foreground pl-6">{slug}</span>}
    </header>
    {day ? (
      <div className="flex flex-col divide-y divide-white/5">
        {(["total", "live", "slots"] as const).map((seg) => {
          const m = day[seg];
          return (
            <div key={seg} className="px-5 py-4">
              <div className="text-[0.85em] font-bold tracking-[0.18em] uppercase mb-3" style={{ color: accent }}>{seg}</div>
              <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                <MetricCell label="Drop" value={formatMoneyFull(m.drop)} accent={accent} />
                <MetricCell label="Result" value={formatSigned(m.result)} kind="signed" />
                <MetricCell label="Hold" value={`${m.hold.toFixed(1)}%`} />
                <MetricCell label="HC" value={String(m.headCount)} />
              </div>
            </div>
          );
        })}
        <div className="px-5 py-3 text-[0.72em] text-muted-foreground">
          MTD {formatMoneyFull(day.mtd.drop)} · {formatSigned(day.mtd.result)} · {day.mtd.hold.toFixed(1)}%
        </div>
      </div>
    ) : (
      <div className="py-10 text-center text-muted-foreground">Loading…</div>
    )}
  </section>
);

export default function BossDashboard() {
  const { accessibleCasinos } = useCasino();

  const [selectedIds, setSelectedIds] = useState<string[]>(() => readArray(LS_CASINOS) ?? []);
  const [layout, setLayout] = useState<Layout>(() => (localStorage.getItem(LS_LAYOUT) as Layout) || "rows");
  const [resolution, setResolution] = useState<Resolution>(() => (localStorage.getItem(LS_RES) as Resolution) || "fhd");

  // Default to all accessible casinos on first load.
  useEffect(() => {
    if (selectedIds.length === 0 && accessibleCasinos.length > 0) {
      setSelectedIds(accessibleCasinos.map((c) => c.id));
    }
  }, [accessibleCasinos, selectedIds.length]);

  useEffect(() => { localStorage.setItem(LS_CASINOS, JSON.stringify(selectedIds)); }, [selectedIds]);
  useEffect(() => { localStorage.setItem(LS_LAYOUT, layout); }, [layout]);
  useEffect(() => { localStorage.setItem(LS_RES, resolution); }, [resolution]);

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

  // Cross-casino MTD summary
  const mtdAll = useMemo(() => {
    const drop = days.reduce((s, d) => s + d.mtd.drop, 0);
    const result = days.reduce((s, d) => s + d.mtd.result, 0);
    return { drop, result, hold: drop > 0 ? (result / drop) * 100 : 0 };
  }, [days]);

  const tvScale = resolution === "uhd" ? 1.7 : 1;
  const baseFont = 16 * tvScale;

  return (
    <div
      className="min-h-screen w-full text-foreground"
      style={{
        fontSize: `${baseFont}px`,
        background:
          "radial-gradient(1200px 800px at 20% -10%, hsl(240 40% 12% / 0.9), transparent 60%), radial-gradient(1000px 600px at 90% 110%, hsl(280 40% 10% / 0.8), transparent 60%), hsl(240 20% 5%)",
      }}
    >
      {/* Header */}
      <header className="flex items-center justify-between gap-6 px-8 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-primary" />
          <h1 className="text-[1.4em] font-extrabold tracking-[0.28em] uppercase">Boss · Live Overview</h1>
          <span className="text-[0.72em] text-muted-foreground ml-4">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Casino picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 border-white/10 bg-white/5">
                <LayoutGrid className="w-4 h-4" /> {selectedIds.length}/{accessibleCasinos.length} casinos
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64">
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

          {/* Layout toggle */}
          <div className="inline-flex rounded-md border border-white/10 bg-white/5 p-0.5">
            <button
              className={`px-3 py-1 text-xs rounded-sm inline-flex items-center gap-1.5 ${layout === "rows" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
              onClick={() => setLayout("rows")}
            >
              <Rows3 className="w-3.5 h-3.5" /> Rows
            </button>
            <button
              className={`px-3 py-1 text-xs rounded-sm inline-flex items-center gap-1.5 ${layout === "columns" ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
              onClick={() => setLayout("columns")}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Columns
            </button>
          </div>

          {/* Resolution toggle */}
          <div className="inline-flex rounded-md border border-white/10 bg-white/5 p-0.5">
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
        </div>
      </header>

      {/* Casinos */}
      <main className="px-8 pb-8">
        {layout === "rows" ? (
          <div className="flex flex-col gap-4">
            {casinos.map((c, i) => (
              <CasinoRow key={c.id} name={c.name} slug={c.slug} accent={accentFor(c.slug, i)} day={dayMap[c.id]} />
            ))}
          </div>
        ) : (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, casinos.length)}, minmax(0, 1fr))` }}
          >
            {casinos.map((c, i) => (
              <CasinoColumn key={c.id} name={c.name} slug={c.slug} accent={accentFor(c.slug, i)} day={dayMap[c.id]} />
            ))}
          </div>
        )}

        {/* Top players per casino */}
        <section className="mt-8">
          <h3 className="text-[0.82em] uppercase tracking-[0.24em] font-bold text-muted-foreground mb-3 inline-flex items-center gap-2">
            <Users className="w-4 h-4" /> Top 5 by Drop · today
          </h3>
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${Math.max(1, casinos.length)}, minmax(0, 1fr))` }}
          >
            {casinos.map((c, i) => {
              const accent = accentFor(c.slug, i);
              const rows = topByCasino[c.id] || [];
              return (
                <div key={c.id} className="rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
                  <header className="px-5 py-3 border-b border-white/5" style={{ background: `linear-gradient(90deg, ${accent}18, transparent)` }}>
                    <span className="text-[0.85em] font-bold uppercase tracking-widest" style={{ color: accent }}>{c.name}</span>
                  </header>
                  {rows.length === 0 ? (
                    <div className="px-5 py-6 text-center text-muted-foreground text-sm">—</div>
                  ) : (
                    <ol className="divide-y divide-white/5">
                      {rows.map((r, ri) => (
                        <li key={r.playerId} className="flex items-center justify-between px-5 py-3">
                          <span className="inline-flex items-center gap-3 min-w-0">
                            <span className="w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold" style={{ background: `${accent}22`, color: accent }}>
                              {ri + 1}
                            </span>
                            <span className="truncate font-medium">{r.name}</span>
                          </span>
                          <span className="font-mono font-bold tabular-nums text-[1.2em]" style={{ textShadow: `0 0 18px ${accent}55` }}>
                            {formatMoneyFull(r.drop)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* New players — cross-casino */}
        <section className="mt-8">
          <h3 className="text-[0.82em] uppercase tracking-[0.24em] font-bold text-muted-foreground mb-3 inline-flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> New Players · today <span className="text-[0.8em] normal-case text-muted-foreground/70">(≤ 3 visits total)</span>
          </h3>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            {newPlayers.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-4">No new players yet</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {newPlayers.map((p, i) => {
                  const c = casinos.find((x) => x.id === p.casinoId);
                  const accent = accentFor(c?.slug ?? null, casinos.findIndex((x) => x.id === p.casinoId));
                  return (
                    <div
                      key={`${p.casinoId}:${p.playerId}`}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 pl-1 pr-3 py-1 text-sm"
                      style={{ background: `${accent}12` }}
                    >
                      <span className="inline-block w-2 h-2 rounded-full" style={{ background: accent }} />
                      <span className="font-medium">{p.name}</span>
                      <span className="text-[0.72em] text-muted-foreground uppercase tracking-wider">{c?.name}</span>
                      <span className="text-[0.72em] font-mono text-muted-foreground">v{p.visits}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* MTD combined */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-gradient-to-r from-primary/10 via-transparent to-primary/10 p-6">
          <div className="flex items-center gap-8 flex-wrap justify-between">
            <div>
              <div className="text-[0.72em] uppercase tracking-[0.24em] text-muted-foreground font-bold mb-1">Month-to-Date · All selected</div>
              <div className="text-[0.72em] text-muted-foreground">{casinos.length} casino{casinos.length === 1 ? "" : "s"}</div>
            </div>
            <MetricCell label="Total Drop" value={formatMoneyFull(mtdAll.drop)} />
            <MetricCell label="Total Result" value={formatSigned(mtdAll.result)} kind="signed" />
            <MetricCell label="Hold %" value={`${mtdAll.hold.toFixed(1)}%`} kind="hold" />
          </div>
        </section>
      </main>
    </div>
  );
}
