/**
 * LAB SCREEN 4 — Dashboard TV / Live wallboard.
 * Reuses the production boss hooks unchanged: `useBossCasinoDays`
 * (compute_daily_diff + chip snapshots + fin_day_closing) — read-only.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBossCasinoDays, type CasinoDay } from "@/hooks/use-boss-dashboard";
import { ControlRoomShell } from "../ControlRoomShell";
import { NO_DATA, amount, holdOf, percent, signed, tone } from "../format";

type Casino = { id: string; name: string; slug: string | null };

const LS_SEL = "crl:dashboard:casinos";

const Metric = ({
  label,
  value,
  cls,
  big,
}: {
  label: string;
  value: string;
  cls?: string;
  big?: boolean;
}) => (
  <div>
    <div className="crl-kpi-label">{label}</div>
    <div className={`crl-num ${cls || ""}`} style={{ fontSize: big ? 30 : 20, fontWeight: 600, lineHeight: 1.2 }}>
      {value}
    </div>
  </div>
);

const Block = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="crl-tv-block">
    <div className="crl-tv-block-title">{title}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 14 }}>
      {children}
    </div>
  </div>
);

export default function DashboardLiveLab() {
  const { data: casinos = [] } = useQuery({
    queryKey: ["crl-casinos"],
    staleTime: 300_000,
    queryFn: async (): Promise<Casino[]> => {
      const { data, error } = await supabase.from("casinos").select("id, name, slug").order("name");
      if (error) throw error;
      return (data || []) as Casino[];
    },
  });

  const [selected, setSelected] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_SEL) || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!casinos.length) return;
    const valid = new Set(casinos.map((c) => c.id));
    const kept = selected.filter((id) => valid.has(id));
    if (kept.length === 0) setSelected(casinos.map((c) => c.id));
    else if (kept.length !== selected.length) setSelected(kept);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casinos]);

  useEffect(() => {
    localStorage.setItem(LS_SEL, JSON.stringify(selected));
  }, [selected]);

  const active = useMemo(() => casinos.filter((c) => selected.includes(c.id)), [casinos, selected]);
  const { data: days, isLoading } = useBossCasinoDays(active.map((c) => c.id));
  const byId = useMemo(
    () => Object.fromEntries(days.map((d) => [d.casinoId, d])) as Record<string, CasinoDay>,
    [days],
  );

  const company = useMemo(() => {
    const t = days.reduce(
      (a, d) => ({
        drop: a.drop + d.total.drop,
        result: a.result + d.total.result,
        head: a.head + d.total.headCount,
        mtdDrop: a.mtdDrop + d.mtd.drop,
        mtdResult: a.mtdResult + d.mtd.result,
      }),
      { drop: 0, result: 0, head: 0, mtdDrop: 0, mtdResult: 0 },
    );
    return { ...t, hold: holdOf(t.result, t.drop), mtdHold: holdOf(t.mtdResult, t.mtdDrop) };
  }, [days]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <ControlRoomShell
      title="Dashboard · Live"
      context="Multi-site wallboard · current business day and month to date"
      actions={
        <div className="crl-seg">
          {casinos.map((c) => (
            <button
              key={c.id}
              type="button"
              className={selected.includes(c.id) ? "is-active" : ""}
              onClick={() => toggle(c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      }
    >
      {isLoading && days.length === 0 ? (
        <div className="crl-empty">
          <div className="crl-empty-title">Loading live figures…</div>
        </div>
      ) : active.length === 0 ? (
        <div className="crl-empty">
          <div className="crl-empty-title">No casino selected</div>
          <div className="crl-empty-hint">Pick at least one site in the top control bar.</div>
        </div>
      ) : (
        <div className="crl-tv-grid">
          {active.map((c) => {
            const d = byId[c.id];
            const t = d?.total;
            const live = d?.live;
            const slots = d?.slots;
            const slotsOk = d?.slotsAvailable;
            return (
              <div key={c.id} className="crl-tv-card">
                <div className="crl-tv-head">
                  <div className="crl-tv-name">{c.name}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="crl-badge">HEAD {t ? t.headCount : 0}</span>
                    <span className={`crl-badge ${slotsOk ? "crl-badge-live" : ""}`}>
                      {slotsOk ? "SLOTS CLOSED" : "SLOTS PENDING"}
                    </span>
                  </div>
                </div>

                <Block title="Today · Tables">
                  <Metric label="Drop" value={amount(live?.drop ?? 0)} />
                  <Metric
                    label="Result"
                    value={signed(live?.result ?? 0)}
                    cls={tone(live?.result ?? 0)}
                  />
                  <Metric label="Hold" value={percent(live ? holdOf(live.result, live.drop) : null)} />
                </Block>

                <Block title="Today · Slots">
                  <Metric label="Drop" value={slotsOk ? amount(slots!.drop) : NO_DATA} />
                  <Metric
                    label="Result"
                    value={slotsOk ? signed(slots!.result) : NO_DATA}
                    cls={slotsOk ? tone(slots!.result) : "crl-faint"}
                  />
                  <Metric
                    label="Hold"
                    value={slotsOk ? percent(holdOf(slots!.result, slots!.drop)) : NO_DATA}
                  />
                </Block>

                <Block title="Today · Total">
                  <Metric label="Drop" value={amount(t?.drop ?? 0)} big />
                  <Metric label="Result" value={signed(t?.result ?? 0)} cls={tone(t?.result ?? 0)} big />
                  <Metric label="Hold" value={percent(t ? holdOf(t.result, t.drop) : null)} big />
                </Block>

                <Block title="Month To Date">
                  <Metric label="Drop" value={amount(d?.mtd.drop ?? 0)} />
                  <Metric
                    label="Result"
                    value={signed(d?.mtd.result ?? 0)}
                    cls={tone(d?.mtd.result ?? 0)}
                  />
                  <Metric label="Hold" value={percent(d ? holdOf(d.mtd.result, d.mtd.drop) : null)} />
                </Block>
              </div>
            );
          })}
        </div>
      )}

      <div className="crl-tv-footer">
        <div className="crl-tv-footer-title">Company Total</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 18 }}>
          <Metric label="Today Drop" value={amount(company.drop)} big />
          <Metric label="Today Result" value={signed(company.result)} cls={tone(company.result)} big />
          <Metric label="Today Hold" value={percent(company.hold)} big />
          <Metric label="MTD Drop" value={amount(company.mtdDrop)} big />
          <Metric label="MTD Result" value={signed(company.mtdResult)} cls={tone(company.mtdResult)} big />
          <Metric label="Head Count" value={String(company.head)} big />
        </div>
      </div>
    </ControlRoomShell>
  );
}
