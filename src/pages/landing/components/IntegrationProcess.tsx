import { useLandingI18n } from "../i18n/LandingI18nProvider";
import { SectionLabel } from "./SectionLabel";
import { StaggerContainer, StaggerItem } from "@/lib/motion";

export function IntegrationProcess() {
  const { t } = useLandingI18n();
  return (
    <section id="partners" className="l-section">
      <div className="l-container">
        <SectionLabel code="05" label={t.integration.eyebrow} />
        <h2 className="l-section-title">{t.integration.title}</h2>
        <p className="l-section-sub">{t.integration.sub}</p>

        <div style={{ position: "relative" }}>
          {/* connecting line */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 28,
              top: 30,
              bottom: 30,
              width: 1,
              background:
                "linear-gradient(180deg, transparent, var(--l-gold-dim) 10%, var(--l-gold-dim) 90%, transparent)",
            }}
            className="l-integration-spine"
          />

          <StaggerContainer as="div" style={{ display: "grid", gap: 18 }}>
            {t.integration.steps.map((s, i) => (
              <StaggerItem key={s.title}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "56px 1fr",
                    gap: 24,
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 12,
                      background: "var(--l-bg-2)",
                      border: "1px solid var(--l-border-gold)",
                      color: "var(--l-gold)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 14,
                      fontWeight: 600,
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div
                    className="l-card"
                    style={{ padding: "22px 26px" }}
                  >
                    <h3 style={{ marginBottom: 8 }}>{s.title}</h3>
                    <p style={{ fontSize: 14, lineHeight: 1.6 }}>{s.desc}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </div>
    </section>
  );
}
