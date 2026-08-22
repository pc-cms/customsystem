/**
 * CONTROL ROOM LAB — shell, navigation rail and shared period state.
 *
 * super_admin only, strictly read-only: no mutation controls are rendered
 * anywhere inside the lab.
 */
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import "./control-room.css";
import { MONTH_NAMES } from "./format";

/* ------------------------------------------------------------------ period */

type Period = { year: number; month: number };

type PeriodCtx = {
  period: Period;
  setPeriod: (p: Period) => void;
  /** First day of the month, ISO. */
  from: string;
  /** Last day of the month, ISO. */
  to: string;
  shift: (delta: number) => void;
  thisMonth: () => void;
};

const LabPeriodContext = createContext<PeriodCtx | null>(null);

const LS_PERIOD = "crl.period";
const pad = (n: number) => String(n).padStart(2, "0");

export const LabPeriodProvider = ({ children }: { children: ReactNode }) => {
  const [period, setPeriod] = useState<Period>(() => {
    try {
      const raw = localStorage.getItem(LS_PERIOD);
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.year && p?.month) return p as Period;
      }
    } catch {
      /* ignore */
    }
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });

  useEffect(() => {
    localStorage.setItem(LS_PERIOD, JSON.stringify(period));
  }, [period]);

  const value = useMemo<PeriodCtx>(() => {
    const { year, month } = period;
    const last = new Date(year, month, 0).getDate();
    return {
      period,
      setPeriod,
      from: `${year}-${pad(month)}-01`,
      to: `${year}-${pad(month)}-${pad(last)}`,
      shift: (delta: number) => {
        const d = new Date(year, month - 1 + delta, 1);
        setPeriod({ year: d.getFullYear(), month: d.getMonth() + 1 });
      },
      thisMonth: () => {
        const n = new Date();
        setPeriod({ year: n.getFullYear(), month: n.getMonth() + 1 });
      },
    };
  }, [period]);

  return <LabPeriodContext.Provider value={value}>{children}</LabPeriodContext.Provider>;
};

export const useLabPeriod = (): PeriodCtx => {
  const ctx = useContext(LabPeriodContext);
  if (!ctx) throw new Error("useLabPeriod must be used inside LabPeriodProvider");
  return ctx;
};

/** Month/year stepper — local UI state only. */
export const PeriodControl = () => {
  const { period, setPeriod, shift, thisMonth } = useLabPeriod();
  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => y - 3 + i);
  }, []);
  return (
    <div className="crl-toolbar-side">
      <div className="crl-seg">
        <button type="button" className="crl-btn" onClick={() => shift(-1)}>‹</button>
        <button type="button" className="crl-btn" onClick={() => shift(1)}>›</button>
      </div>
      <select
        className="crl-select"
        value={period.month}
        onChange={(e) => setPeriod({ ...period, month: Number(e.target.value) })}
      >
        {MONTH_NAMES.map((m, i) => (
          <option key={m} value={i + 1}>{m}</option>
        ))}
      </select>
      <select
        className="crl-select"
        value={period.year}
        onChange={(e) => setPeriod({ ...period, year: Number(e.target.value) })}
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <button type="button" className="crl-btn" onClick={thisMonth}>Current</button>
    </div>
  );
};

/** Compact month stepper (label + arrows) — local UI state only. */
export const MonthStepper = () => {
  const { period, shift, thisMonth } = useLabPeriod();
  return (
    <div className="crl-toolbar-side">
      <div className="crl-seg">
        <button type="button" className="crl-btn" onClick={() => shift(-1)}>‹</button>
        <button type="button" className="crl-btn is-active" style={{ minWidth: 132 }}>
          {MONTH_NAMES[period.month - 1]} {period.year}
        </button>
        <button type="button" className="crl-btn" onClick={() => shift(1)}>›</button>
      </div>
      <button type="button" className="crl-btn" onClick={thisMonth}>Current</button>
    </div>
  );
};

/* ------------------------------------------------------------------- shell */

const NAV = [
  {
    group: "Statistics",
    items: [
      { to: "/ui-lab/statistics/live-game", label: "Live Game" },
      { to: "/ui-lab/statistics/total", label: "Total" },
      { to: "/ui-lab/statistics/miss-chips", label: "Miss Chips" },
    ],
  },
  {
    group: "Dashboard",
    items: [
      { to: "/ui-lab/dashboard/live", label: "Live Wallboard" },
      { to: "/ui-lab/dashboard/report", label: "Company Report" },
    ],
  },
  {
    group: "Office",
    items: [
      { to: "/ui-lab/office/wallets", label: "Wallets" },
      { to: "/ui-lab/office/day-closings", label: "Day Closings" },
      { to: "/ui-lab/office/monthly-report", label: "Monthly Report" },
    ],
  },
];

export const LAB_NAV = NAV;

type ShellProps = {
  title: string;
  context?: ReactNode;
  /** Read-only controls (period, density, casino selection…). */
  actions?: ReactNode;
  /** Hide the left rail (used by the TV wallboard). */
  bare?: boolean;
  children: ReactNode;
};

export const ControlRoomShell = ({ title, context, actions, bare = false, children }: ShellProps) => (
  <div className="crl-root">
    <div className="crl-shell">
      {!bare && (
        <nav className="crl-rail">
          <NavLink to="/ui-lab" className="crl-rail-link" style={{ padding: 0, borderLeft: "none" }}>
            <div className="crl-rail-brand">Control Room</div>
            <div className="crl-rail-sub">Lab · Read only</div>
          </NavLink>
          {NAV.map((g) => (
            <div key={g.group}>
              <div className="crl-rail-group">{g.group}</div>
              {g.items.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  className={({ isActive }) => `crl-rail-link${isActive ? " is-active" : ""}`}
                >
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="crl-rail-group">Exit</div>
          <a className="crl-rail-link" href="/">Back to CMS</a>
        </nav>
      )}

      <div className="crl-main">
        <header className="crl-topbar">
          <div style={{ minWidth: 0 }}>
            <div className="crl-title">{title}</div>
            {context && <div className="crl-context">{context}</div>}
          </div>
          <div className="crl-toolbar-side">
            {actions}
            <span className="crl-badge crl-badge-accent">Control Room Lab · Read only</span>
          </div>
        </header>
        <div className="crl-body">{children}</div>
      </div>
    </div>
  </div>
);

/* -------------------------------------------------------------- primitives */

export type Kpi = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: string;
};

export const KpiStrip = ({ items, columns }: { items: Kpi[]; columns?: number }) => (
  <div
    className="crl-kpis"
    style={{
      gridTemplateColumns: `repeat(${columns ?? Math.min(items.length, 6)}, minmax(0, 1fr))`,
    }}
  >
    {items.map((k) => (
      <div className="crl-kpi" key={k.label}>
        <div className="crl-kpi-label">{k.label}</div>
        <div className={`crl-kpi-value ${k.tone ?? ""}`}>{k.value}</div>
        {k.hint != null && <div className="crl-kpi-hint">{k.hint}</div>}
      </div>
    ))}
  </div>
);

export const DensityToggle = ({
  value,
  onChange,
}: {
  value: "compact" | "comfortable";
  onChange: (v: "compact" | "comfortable") => void;
}) => (
  <div className="crl-seg">
    <button
      type="button"
      className={`crl-btn${value === "compact" ? " is-active" : ""}`}
      onClick={() => onChange("compact")}
    >
      Compact
    </button>
    <button
      type="button"
      className={`crl-btn${value === "comfortable" ? " is-active" : ""}`}
      onClick={() => onChange("comfortable")}
    >
      Comfortable
    </button>
  </div>
);

export const Toolbar = ({ left, right }: { left?: ReactNode; right?: ReactNode }) => (
  <div className="crl-toolbar">
    <div className="crl-toolbar-side">{left}</div>
    <div className="crl-toolbar-side">{right}</div>
  </div>
);
