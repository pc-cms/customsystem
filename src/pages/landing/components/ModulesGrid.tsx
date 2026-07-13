import {
  Vault, LayoutGrid, Wallet, Users, BadgeCheck, Wine, Smartphone, Boxes, Eye,
} from "lucide-react";
import { useLandingI18n } from "../i18n/LandingI18nProvider";
import { SectionLabel } from "./SectionLabel";
import { StaggerContainer, StaggerItem } from "@/lib/motion";

const META = [
  { Icon: Vault,       code: "CGE-01" },
  { Icon: LayoutGrid,  code: "PIT-02" },
  { Icon: Wallet,      code: "FIN-03" },
  { Icon: Users,       code: "PLR-04" },
  { Icon: BadgeCheck,  code: "STF-05" },
  { Icon: Wine,        code: "POS-06" },
  { Icon: Smartphone,  code: "CLB-07" },
  { Icon: Boxes,       code: "WHS-08" },
  { Icon: Eye,         code: "SUR-09" },
];

export function ModulesGrid() {
  const { t } = useLandingI18n();
  return (
    <section id="modules" className="l-section">
      <div className="l-container">
        <SectionLabel code="03" label={t.modules.eyebrow} />
        <h2 className="l-section-title">{t.modules.title}</h2>
        <p className="l-section-sub">{t.modules.sub}</p>

        <StaggerContainer
          as="div"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 16,
          }}
        >
          {t.modules.items.map((m, i) => {
            const meta = META[i] ?? META[0];
            const Icon = meta.Icon;
            return (
              <StaggerItem key={m.title}>
                <div className="l-card" style={{ height: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                    <div
                      style={{
                        display: "inline-flex",
                        padding: 11,
                        borderRadius: 8,
                        background: "rgba(201,162,76,0.08)",
                        border: "1px solid rgba(201,162,76,0.22)",
                        color: "var(--l-gold)",
                      }}
                    >
                      <Icon size={18} strokeWidth={1.5} />
                    </div>
                    <span
                      className="l-mono"
                      style={{
                        fontSize: 10,
                        color: "var(--l-text-dim)",
                        letterSpacing: "0.18em",
                      }}
                    >
                      {meta.code}
                    </span>
                  </div>
                  <h3 style={{ marginBottom: 10 }}>{m.title}</h3>
                  <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>{m.desc}</p>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </div>
    </section>
  );
}
