import { useLandingI18n } from "../i18n/LandingI18nProvider";
import { SectionLabel } from "./SectionLabel";
import { SectionReveal } from "@/lib/motion";
import { Check } from "lucide-react";

const LAYERS = [
  "Roles",
  "Departments",
  "Reports",
  "Workflows",
  "Approvals",
  "Local / Cloud deployment",
  "Support",
];

export function WhyCustom() {
  const { t } = useLandingI18n();
  return (
    <section className="l-section">
      <div className="l-container">
        <div
          className="l-why-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 1fr",
            gap: 64,
            alignItems: "center",
          }}
        >
          <div>
            <SectionLabel code="04" label={t.whyCustom.eyebrow} />
            <h2 className="l-section-title">{t.whyCustom.title}</h2>
            <p className="l-section-sub" style={{ marginBottom: 32 }}>
              {t.whyCustom.sub}
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
              {t.whyCustom.items.map((i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    fontSize: 14.5,
                    color: "var(--l-text)",
                  }}
                >
                  <Check size={15} color="var(--l-teal)" strokeWidth={2.2} />
                  {i}
                </li>
              ))}
            </ul>
          </div>

          <SectionReveal y={24}>
            <div
              style={{
                position: "relative",
                padding: 28,
                borderRadius: 14,
                background:
                  "linear-gradient(180deg, var(--l-surface) 0%, var(--l-bg-2) 100%)",
                border: "1px solid var(--l-border)",
                display: "grid",
                gap: 10,
              }}
            >
              <div
                className="l-mono"
                style={{
                  fontSize: 10,
                  color: "var(--l-text-dim)",
                  letterSpacing: "0.2em",
                  marginBottom: 4,
                }}
              >
                CONFIGURATION LAYERS
              </div>
              {LAYERS.map((layer, i) => (
                <div
                  key={layer}
                  style={{
                    border: "1px solid var(--l-border)",
                    background: "var(--l-bg-2)",
                    borderRadius: 8,
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    transform: `translateX(${i * 6}px)`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span
                      className="l-mono"
                      style={{
                        fontSize: 10,
                        color: "var(--l-gold)",
                        letterSpacing: "0.18em",
                      }}
                    >
                      L{String(i + 1).padStart(2, "0")}
                    </span>
                    <span style={{ fontSize: 14, color: "var(--l-text)" }}>{layer}</span>
                  </div>
                  <span className="l-live-dot" />
                </div>
              ))}
            </div>
          </SectionReveal>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .l-why-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .l-why-grid > div:last-child > div > div { transform: none !important; }
        }
      `}</style>
    </section>
  );
}
