import { Link } from "react-router-dom";
import { ControlRoomShell, LAB_NAV } from "../ControlRoomShell";

const DESCRIPTIONS: Record<string, string> = {
  "/ui-lab/statistics/live-game": "Closed business days · drop, table result, hold, gaming balance",
  "/ui-lab/statistics/total": "Tables and slots rollup per business day",
  "/ui-lab/statistics/miss-chips": "Cage chip count delta by denomination",
  "/ui-lab/dashboard/live": "Multi-site wallboard · today and month to date",
  "/ui-lab/dashboard/report": "Executive monthly report across casinos",
  "/ui-lab/office/wallets": "Expected vs actual reconciliation per wallet group",
  "/ui-lab/office/day-closings": "fin_day_closing register with live / slots split",
  "/ui-lab/office/monthly-report": "Plan vs actual finance grid",
};

export default function LabHome() {
  return (
    <ControlRoomShell
      title="Control Room Lab"
      context="Isolated design preview · live production data · no write operations"
    >
      {LAB_NAV.map((g) => (
        <div key={g.group} style={{ marginBottom: 22 }}>
          <div className="crl-panel-head" style={{ border: "none", padding: "0 0 10px" }}>
            {g.group}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 12,
            }}
          >
            {g.items.map((it) => (
              <Link key={it.to} to={it.to} className="crl-lab-tile">
                <div style={{ fontSize: 15, fontWeight: 600 }}>{it.label}</div>
                <div className="crl-kpi-hint" style={{ marginTop: 6 }}>
                  {DESCRIPTIONS[it.to]}
                </div>
                <div className="crl-faint crl-num" style={{ marginTop: 10, fontSize: 11 }}>
                  {it.to}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </ControlRoomShell>
  );
}
