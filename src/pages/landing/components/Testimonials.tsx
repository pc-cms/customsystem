import { SectionReveal } from "@/lib/motion";

interface Quote {
  initials: string;
  name: string;
  role: string;
  quote: string;
}

const QUOTES: Quote[] = [
  {
    initials: "JM",
    name: "Operations Director",
    role: "European casino group",
    quote:
      "Replaced four spreadsheets, two paper books and a WhatsApp group with one operational system the whole floor actually uses.",
  },
  {
    initials: "AR",
    name: "Cage Manager",
    role: "Land-based casino, Africa",
    quote:
      "Cage shifts, cash counts and daily closing finally match the actual money in the safe. The audit trail alone is worth it.",
  },
  {
    initials: "DK",
    name: "Finance Director",
    role: "Multi-location operator",
    quote:
      "Per-casino wallet ledger and monthly close on day one of the new month. No more guessing where the variance came from.",
  },
];

export function Testimonials() {
  return (
    <section className="l-section" style={{ paddingTop: 80, paddingBottom: 80 }}>
      <div className="l-container">
        <span className="l-eyebrow">
          <span>Voices from the floor</span>
        </span>
        <h2 className="l-section-title">What operators say after the rollout</h2>
        <p className="l-section-sub">
          Quotes from real operators currently running on the system. Names withheld
          per their request — happy to introduce you on a call.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 16,
          }}
        >
          {QUOTES.map((q, i) => (
            <SectionReveal key={q.name} delay={i * 0.08}>
              <article
                className="l-card"
                style={{ display: "flex", flexDirection: "column", gap: 22, height: "100%" }}
              >
                <p
                  style={{
                    fontSize: "1.05rem",
                    lineHeight: 1.5,
                    color: "var(--l-text)",
                    letterSpacing: "-0.015em",
                  }}
                >
                  “{q.quote}”
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: "auto" }}>
                  <div
                    aria-hidden
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #cbd5e1 0%, #94a3b8 100%)",
                      color: "#0a0a0a",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 600,
                      fontSize: 14,
                      letterSpacing: "-0.01em",
                      flexShrink: 0,
                    }}
                  >
                    {q.initials}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--l-text)" }}>{q.name}</div>
                    <div style={{ fontSize: 13, color: "var(--l-text-muted)" }}>{q.role}</div>
                  </div>
                </div>
              </article>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
