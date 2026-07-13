import { useState } from "react";
import { useLandingI18n } from "../i18n/LandingI18nProvider";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, Send } from "lucide-react";
import { SectionLabel } from "./SectionLabel";

export function ContactForm() {
  const { t, lang } = useLandingI18n();
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", company: "", contact: "", message: "" });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const name = form.name.trim();
    const contact = form.contact.trim();
    const message = form.message.trim();
    if (!name || !contact || !message) {
      setError(t.contact.error);
      return;
    }

    setSubmitting(true);
    try {
      const { error: err } = await supabase.functions.invoke("send-consultation", {
        body: {
          name,
          company: form.company.trim(),
          contact,
          message,
          language: lang,
          source_url: typeof window !== "undefined" ? window.location.href : "",
        },
      });
      if (err) throw err;
      setDone(true);
    } catch {
      setError(t.contact.error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="contact" className="l-section">
      <div className="l-container">
        <SectionLabel code="11" label={t.contact.eyebrow} />
        <h2 className="l-section-title">{t.contact.title}</h2>
        <p className="l-section-sub" style={{ maxWidth: 680 }}>{t.contact.sub}</p>

        <div
          style={{
            maxWidth: 760,
            background:
              "linear-gradient(180deg, var(--l-surface) 0%, var(--l-bg-2) 100%)",
            border: "1px solid var(--l-border)",
            borderRadius: 14,
            padding: 36,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0, height: 1,
              background:
                "linear-gradient(90deg, transparent, var(--l-gold) 50%, transparent)",
            }}
          />
          {done ? (
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "8px 0" }}>
              <CheckCircle2 size={22} style={{ color: "var(--l-teal)", flexShrink: 0 }} />
              <p style={{ color: "var(--l-text)", fontSize: 15 }}>{t.contact.success}</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} style={{ display: "grid", gap: 18 }} noValidate>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="l-form-row">
                <div>
                  <label className="l-label" htmlFor="cf-name">{t.contact.name}</label>
                  <input id="cf-name" className="l-input" required maxLength={200} value={form.name} onChange={(e) => set("name", e.target.value)} />
                </div>
                <div>
                  <label className="l-label" htmlFor="cf-company">{t.contact.company}</label>
                  <input id="cf-company" className="l-input" maxLength={200} value={form.company} onChange={(e) => set("company", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="l-label" htmlFor="cf-contact">{t.contact.contact}</label>
                <input id="cf-contact" className="l-input" required maxLength={200} value={form.contact} onChange={(e) => set("contact", e.target.value)} />
              </div>
              <div>
                <label className="l-label" htmlFor="cf-message">{t.contact.message}</label>
                <textarea id="cf-message" className="l-textarea" required maxLength={4000} placeholder={t.contact.placeholder} value={form.message} onChange={(e) => set("message", e.target.value)} />
              </div>
              {error && (
                <div role="alert" style={{ color: "#f59e9e", fontSize: 13, background: "rgba(226,92,92,0.08)", border: "1px solid rgba(226,92,92,0.25)", padding: "10px 12px", borderRadius: 8 }}>
                  {error}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                <button type="submit" disabled={submitting} className="l-btn l-btn-primary" style={{ opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? t.contact.submitting : (<>{t.contact.submit} <Send size={15} /></>)}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      <style>{`@media (max-width: 640px) { .l-form-row { grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
