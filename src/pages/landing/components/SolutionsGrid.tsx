import { useLandingI18n } from "../i18n/LandingI18nProvider";
import { SectionLabel } from "./SectionLabel";
import { StaggerContainer, StaggerItem } from "@/lib/motion";

export function SolutionsGrid() {
  const { t } = useLandingI18n();
  return (
    <section id="solutions" className="l-section">
      <div className="l-container">
        <SectionLabel code="09" label={t.solutions.eyebrow} />
        <h2 className="l-section-title">{t.solutions.title}</h2>
        <p className="l-section-sub">{t.solutions.sub}</p>

        <StaggerContainer
          as="div"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 16,
          }}
        >
          {t.solutions.items.map((s, i) => (
            <StaggerItem key={s.title}>
              <div className="l-card" style={{ height: "100%" }}>
                <span
                  className="l-mono"
                  style={{
                    fontSize: 10,
                    color: "var(--l-teal)",
                    letterSpacing: "0.2em",
                  }}
                >
                  SOL-{String(i + 1).padStart(2, "0")}
                </span>
                <h3 style={{ marginTop: 12, marginBottom: 10 }}>{s.title}</h3>
                <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}
