import { useLandingI18n } from "../i18n/LandingI18nProvider";
import { SectionLabel } from "./SectionLabel";
import { DarkPanel } from "./DarkPanel";
import { CommandPanel } from "./CommandPanel";
import { StaggerContainer, StaggerItem, SectionReveal } from "@/lib/motion";

/** Abstract dark module screen — no real screenshots. */
function ModuleScreen({ kind }: { kind: "cage" | "pit" | "finance" | "players" | "club" }) {
  const variants: Record<string, JSX.Element> = {
    cage: (
      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 10, height: "100%" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[["FLOAT","850 000"],["DROP","+182 540"],["MISS","−4 200"]].map(([l,v],i) => (
            <div key={l} style={{ border: "1px solid var(--l-border)", borderRadius: 6, padding: 8, background: "var(--l-bg-2)" }}>
              <div className="l-mono" style={{ fontSize: 8.5, color: "var(--l-text-dim)", letterSpacing: "0.18em" }}>{l}</div>
              <div className="l-mono l-tnum" style={{ fontSize: 13, color: i === 1 ? "var(--l-emerald)" : i === 2 ? "var(--l-red)" : "var(--l-gold)", marginTop: 2, fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ border: "1px solid var(--l-border)", borderRadius: 6, background: "var(--l-bg-2)", padding: 10 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--l-border)", fontSize: 11, color: "var(--l-text-muted)" }} className="l-mono l-tnum">
              <span>TX-{(2841 + i).toString()}</span>
              <span style={{ color: "var(--l-text-dim)" }}>21:0{i + 2}</span>
              <span style={{ textAlign: "right", color: i % 2 ? "var(--l-emerald)" : "var(--l-text)" }}>{i % 2 ? "+12 500" : "−8 200"}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    pit: (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 6 }}>
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} style={{ aspectRatio: "1.4", borderRadius: 4, border: "1px solid var(--l-border)", background: i % 7 === 0 ? "rgba(226,92,92,0.18)" : i % 3 === 0 ? "rgba(63,184,166,0.18)" : "rgba(201,162,76,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="l-mono" style={{ fontSize: 8.5, color: "var(--l-text-dim)" }}>T{(i + 1).toString().padStart(2, "0")}</span>
          </div>
        ))}
      </div>
    ),
    finance: (
      <div style={{ display: "grid", gap: 8 }}>
        {["MAIN CASH", "OFFICE SAFE", "CAGE FLOAT", "RESERVE", "BUDGET"].map((w, i) => (
          <div key={w} style={{ display: "grid", gridTemplateColumns: "1fr 100px 60px", gap: 10, alignItems: "center", padding: "8px 12px", border: "1px solid var(--l-border)", borderRadius: 6, background: "var(--l-bg-2)" }}>
            <span className="l-mono" style={{ fontSize: 11, color: "var(--l-text)", letterSpacing: "0.1em" }}>{w}</span>
            <span className="l-mono l-tnum" style={{ fontSize: 11, color: "var(--l-gold)", textAlign: "right" }}>
              {(450000 + i * 132000).toLocaleString().replace(/,/g, " ")}
            </span>
            <span style={{ height: 4, borderRadius: 2, background: "var(--l-border)", overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${40 + i * 12}%`, background: "var(--l-teal)" }} />
            </span>
          </div>
        ))}
      </div>
    ),
    players: (
      <div style={{ display: "grid", gap: 6 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "24px 1fr 60px 50px", gap: 10, alignItems: "center", padding: "6px 10px", border: "1px solid var(--l-border)", borderRadius: 6, background: "var(--l-bg-2)" }}>
            <span style={{ width: 18, height: 18, borderRadius: 4, background: `hsl(${30 + i * 40},35%,30%)` }} />
            <span className="l-mono" style={{ fontSize: 11, color: "var(--l-text)" }}>P-{1024 + i * 17}</span>
            <span className="l-mono" style={{ fontSize: 10, color: i === 2 ? "var(--l-gold)" : "var(--l-text-dim)", letterSpacing: "0.1em" }}>{i === 2 ? "VIP" : i % 3 === 0 ? "PROS" : "NORM"}</span>
            <span className="l-mono l-tnum" style={{ fontSize: 10, color: "var(--l-emerald)", textAlign: "right" }}>+{(1200 + i * 340)}</span>
          </div>
        ))}
      </div>
    ),
    club: (
      <div style={{ maxWidth: 200, margin: "0 auto", border: "1px solid var(--l-border-strong)", borderRadius: 18, padding: 16, background: "var(--l-bg-2)", display: "grid", gap: 10 }}>
        <div style={{ height: 4, width: 36, background: "var(--l-border-strong)", borderRadius: 2, margin: "0 auto 4px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="l-mono" style={{ fontSize: 9.5, color: "var(--l-text-dim)", letterSpacing: "0.16em" }}>CLUB · P-1024</span>
          <span className="l-live-dot" />
        </div>
        <div style={{ padding: "14px 12px", borderRadius: 8, background: "linear-gradient(135deg,#1a2030,#0d1626)", border: "1px solid var(--l-border-gold)" }}>
          <div className="l-mono" style={{ fontSize: 9, color: "var(--l-gold)", letterSpacing: "0.2em" }}>WALLET</div>
          <div className="l-mono l-tnum" style={{ fontSize: 19, color: "var(--l-gold-soft)", fontWeight: 600, marginTop: 4 }}>12 480</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {["SHOP","TICKETS","PROMOS","VERIFY"].map((b) => (
            <div key={b} style={{ padding: "8px 6px", textAlign: "center", border: "1px solid var(--l-border)", borderRadius: 6, fontSize: 9.5 }} className="l-mono">{b}</div>
          ))}
        </div>
      </div>
    ),
  };
  return variants[kind];
}

export function ProductScreens() {
  const { t } = useLandingI18n();
  const c = t.screens.captions;

  const smallScreens = [
    { kind: "cage" as const,    label: "MOD · CAGE",          caption: c.cage },
    { kind: "pit" as const,     label: "MOD · PIT & TABLES",  caption: c.pit },
    { kind: "finance" as const, label: "MOD · FINANCE",       caption: c.finance },
    { kind: "players" as const, label: "MOD · PLAYERS",       caption: c.players },
    { kind: "club" as const,    label: "APP · CLIENT CLUB",   caption: c.club },
  ];

  return (
    <section className="l-section" style={{ background: "rgba(10,13,18,0.5)" }}>
      <div className="l-container">
        <SectionLabel code="06" label={t.screens.eyebrow} />
        <h2 className="l-section-title">{t.screens.title}</h2>
        <p className="l-section-sub">{t.screens.sub}</p>

        <div style={{ display: "grid", gap: 22 }}>
          <SectionReveal y={28}>
            <figure style={{ margin: 0 }}>
              <CommandPanel />
              <figcaption style={{ marginTop: 14, fontSize: 13, color: "var(--l-text-muted)" }}>
                {c.dashboard}
              </figcaption>
            </figure>
          </SectionReveal>

          <StaggerContainer
            as="div"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 22,
            }}
          >
            {smallScreens.map((s) => (
              <StaggerItem key={s.label}>
                <figure style={{ margin: 0 }}>
                  <DarkPanel label={s.label} minHeight={260}>
                    <ModuleScreen kind={s.kind} />
                  </DarkPanel>
                  <figcaption style={{ marginTop: 12, fontSize: 12.5, color: "var(--l-text-muted)" }}>
                    {s.caption}
                  </figcaption>
                </figure>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </div>
    </section>
  );
}
