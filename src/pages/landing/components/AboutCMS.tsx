import { useLandingI18n } from "../i18n/LandingI18nProvider";
import { SectionLabel } from "./SectionLabel";
import { Check } from "lucide-react";

export function AboutCMS() {
  const { t } = useLandingI18n();
  return (
    <section id="about" className="l-section">
      <div className="l-container">
        <div
          className="l-about-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 56,
            alignItems: "start",
          }}
        >
          <div>
            <SectionLabel code="10" label={t.about.eyebrow} />
            <h2 className="l-section-title">{t.about.title}</h2>
          </div>
          <div>
            <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--l-text)", marginBottom: 28 }}>
              {t.about.body}
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
              {t.about.bullets.map((b) => (
                <li key={b} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 14.5, color: "var(--l-text-muted)" }}>
                  <Check size={15} color="var(--l-gold)" strokeWidth={2.2} style={{ marginTop: 4, flexShrink: 0 }} />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .l-about-grid { grid-template-columns: 1fr !important; gap: 28px !important; }
        }
      `}</style>
    </section>
  );
}
