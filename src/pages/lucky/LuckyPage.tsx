import { useEffect } from "react";
import { MapPin, Sparkles, Coins, HandCoins, ArrowRight } from "lucide-react";
import ClubBackdrop from "@/components/club/ClubBackdrop";
import ClubFooter from "@/components/club/ClubFooter";
import { LUCKY_LOCATIONS, mapsUrl } from "./casino-locations";

const GOLD = "#E8C688";
const GOLD_DEEP = "#A68E61";

const WHAT_ITEMS = [
  {
    icon: Coins,
    title: "A Real Chip",
    text: "You are holding a genuine Premier Casino Lucky Chip with game value.",
  },
  {
    icon: Sparkles,
    title: "Yours to Keep",
    text: "It's a gift — a small taste of the Premier experience, on us.",
  },
  {
    icon: HandCoins,
    title: "Redeem With Us",
    text: "Bring it to any Premier Casino. Play it, or use it as slots promo credits at the cage.",
  },
];

const STEPS = [
  { n: "01", t: "Visit Us", d: "Come to any Premier Casino in Tanzania." },
  { n: "02", t: "Present the Chip", d: "Show your Lucky Chip at the cage counter." },
  { n: "03", t: "Play or Use as Promo Credits", d: "Take it to the tables — or convert it into slots promo credits." },
];

const scrollToLocations = () => {
  document.getElementById("locations")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

export default function LuckyPage() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "The Lucky One — Premier Casino";
    const setMeta = (attr: "name" | "property", key: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
      return el;
    };
    const desc = "You've received a Premier Lucky Chip. Redeem it at any Premier Casino in Arusha, Mwanza, Dodoma or Mbeya.";
    const created = [
      setMeta("name", "description", desc),
      setMeta("name", "robots", "noindex"),
      setMeta("property", "og:title", "The Lucky One — Premier Casino"),
      setMeta("property", "og:description", desc),
      setMeta("property", "og:type", "website"),
    ];
    return () => {
      document.title = prevTitle;
      // leave meta tags in place — cheaper than tracking created vs. pre-existing
      void created;
    };
  }, []);

  return (
    <div className="relative min-h-screen text-white" style={{ backgroundColor: "#A0000D" }}>


      <ClubBackdrop />

      <div className="relative max-w-xl mx-auto px-5 pb-24">
        {/* ============ HERO ============ */}
        <section className="min-h-[100svh] flex flex-col items-center justify-between py-10">
          <header className="w-full flex items-center justify-center">
            <span
              className="font-faberge text-sm sm:text-base tracking-[0.45em] uppercase text-center"
              style={{ color: GOLD }}
            >
              PREMIER · CASINO
            </span>
          </header>

          <div className="flex flex-col items-center text-center mt-6">
            <img
              src="/premier-club-logo.svg"
              alt="Premier Casino"
              className="h-24 w-24 mb-6 drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
            />

            {/* Chip visual — pure SVG, matches gold ring language */}
            <div className="relative mb-6">
              <svg
                width="140"
                height="140"
                viewBox="0 0 140 140"
                className="drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)] animate-[spin_18s_linear_infinite]"
              >
                <defs>
                  <radialGradient id="chipFace" cx="50%" cy="45%" r="55%">
                    <stop offset="0%" stopColor="#2a0004" />
                    <stop offset="100%" stopColor="#0a0002" />
                  </radialGradient>
                </defs>
                <circle cx="70" cy="70" r="66" fill="url(#chipFace)" stroke={GOLD} strokeWidth="1.5" />
                <circle cx="70" cy="70" r="52" fill="none" stroke={GOLD} strokeWidth="0.75" strokeDasharray="2 6" />
                <circle cx="70" cy="70" r="34" fill="none" stroke={GOLD} strokeWidth="0.5" />
                {Array.from({ length: 8 }).map((_, i) => {
                  const a = (i * Math.PI) / 4;
                  const x1 = 70 + Math.cos(a) * 58;
                  const y1 = 70 + Math.sin(a) * 58;
                  const x2 = 70 + Math.cos(a) * 66;
                  const y2 = 70 + Math.sin(a) * 66;
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={GOLD} strokeWidth="3" />;
                })}
              </svg>
              <div
                className="absolute inset-0 flex items-center justify-center font-faberge text-[10px] tracking-[0.35em]"
                style={{ color: GOLD }}
              >
                LUCKY
              </div>
            </div>

            <p
              className="font-faberge text-xs tracking-[0.5em] uppercase mb-3"
              style={{ color: GOLD_DEEP }}
            >
              Congratulations
            </p>
            <h1
              className="font-faberge text-5xl sm:text-6xl leading-none mb-4"
              style={{ color: GOLD }}
            >
              THE<br />LUCKY ONE
            </h1>
            <p
              className="font-faberge italic text-base max-w-xs"
              style={{ color: "rgba(255,255,255,0.85)" }}
            >
              You've received a Premier Lucky Chip.
            </p>
          </div>

          <div className="w-full space-y-3 mt-10">
            <button
              onClick={scrollToLocations}
              className="w-full flex items-center justify-center gap-2 h-14 rounded-md font-faberge text-sm tracking-[0.3em] uppercase transition-transform active:scale-[0.98]"
              style={{ backgroundColor: GOLD, color: "#0a0a0a" }}
            >
              Find Nearest Premier <ArrowRight className="w-4 h-4" />
            </button>
            <p
              className="text-center text-[10px] tracking-[0.3em] uppercase pt-2"
              style={{ color: GOLD_DEEP }}
            >
              18+ · Play responsibly
            </p>
          </div>
        </section>

        {/* ============ MANIFESTO ============ */}
        <section className="py-16 text-center">
          <div className="w-12 h-px mx-auto mb-6" style={{ backgroundColor: GOLD }} />
          <p
            className="font-faberge italic text-2xl sm:text-3xl leading-tight"
            style={{ color: GOLD }}
          >
            "Fortune found you.<br />Come collect it."
          </p>
          <div className="w-12 h-px mx-auto mt-6" style={{ backgroundColor: GOLD }} />
        </section>

        {/* ============ WHAT IS THIS ============ */}
        <section className="py-10">
          <h2
            className="font-faberge text-xs tracking-[0.4em] uppercase text-center mb-8"
            style={{ color: GOLD_DEEP }}
          >
            What Is This?
          </h2>
          <div className="space-y-3">
            {WHAT_ITEMS.map((b) => (
              <div
                key={b.title}
                className="rounded-xl p-4 backdrop-blur-sm border bg-black/40 flex gap-4 items-start"
                style={{ borderColor: `${GOLD}33` }}
              >
                <b.icon className="w-6 h-6 mt-1 shrink-0" style={{ color: GOLD }} />
                <div>
                  <h3
                    className="font-faberge text-sm tracking-[0.15em] uppercase mb-1"
                    style={{ color: GOLD }}
                  >
                    {b.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
                    {b.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ============ HOW TO REDEEM ============ */}
        <section className="py-10">
          <h2
            className="font-faberge text-xs tracking-[0.4em] uppercase text-center mb-8"
            style={{ color: GOLD_DEEP }}
          >
            How to Redeem
          </h2>
          <div className="space-y-5">
            {STEPS.map((s) => (
              <div key={s.n} className="flex gap-4 items-start">
                <div
                  className="font-faberge text-3xl leading-none shrink-0 w-12"
                  style={{ color: GOLD }}
                >
                  {s.n}
                </div>
                <div className="flex-1 pt-1">
                  <h3
                    className="font-faberge text-base tracking-[0.2em] uppercase mb-1"
                    style={{ color: GOLD }}
                  >
                    {s.t}
                  </h3>
                  <p className="text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
                    {s.d}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ============ LOCATIONS ============ */}
        <section id="locations" className="py-10 scroll-mt-6">
          <h2
            className="font-faberge text-xs tracking-[0.4em] uppercase text-center mb-2"
            style={{ color: GOLD_DEEP }}
          >
            Find Us
          </h2>
          <p
            className="text-center font-faberge text-xs tracking-[0.25em] uppercase mb-8"
            style={{ color: GOLD }}
          >
            Four Cities in Tanzania
          </p>
          <div className="space-y-3">
            {LUCKY_LOCATIONS.map((loc) => (
              <div
                key={loc.city}
                className="rounded-xl p-5 border bg-black/50 backdrop-blur-sm"
                style={{ borderColor: `${GOLD}44` }}
              >
                <div className="flex items-baseline justify-between mb-1">
                  <h3
                    className="font-faberge text-xl tracking-[0.2em] uppercase"
                    style={{ color: GOLD }}
                  >
                    {loc.city}
                  </h3>
                  {loc.comingSoon && (
                    <span
                      className="text-[10px] tracking-[0.25em] uppercase"
                      style={{ color: GOLD_DEEP }}
                    >
                      Coming Soon
                    </span>
                  )}
                </div>
                <p
                  className="text-sm mb-4"
                  style={{ color: "rgba(255,255,255,0.75)" }}
                >
                  {loc.venue}
                </p>
                <a
                  href={loc.mapsDirectUrl || mapsUrl(loc.mapsQuery)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-md font-faberge text-xs tracking-[0.3em] uppercase border transition-colors hover:bg-white/5 active:scale-[0.98]"
                  style={{ color: GOLD, borderColor: GOLD }}
                >
                  <MapPin className="w-4 h-4" /> Open in Maps
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* ============ TERMS ============ */}
        <section className="py-10">
          <h2
            className="font-faberge text-xs tracking-[0.4em] uppercase text-center mb-6"
            style={{ color: GOLD_DEEP }}
          >
            Terms
          </h2>
          <ul
            className="text-xs leading-relaxed space-y-2 max-w-md mx-auto"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            <li>· Chip must be presented physically at the cage.</li>
            <li>· Valid photo ID required (18+).</li>
            <li>· One chip per person per visit.</li>
            <li>· Non-transferable. No cash value — valid for play or slots promo credits only.</li>
            <li>· Subject to house rules and management discretion.</li>
          </ul>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="py-12">
          <div
            className="rounded-2xl p-8 text-center border bg-black/50"
            style={{ borderColor: `${GOLD}44` }}
          >
            <p
              className="font-faberge italic text-lg mb-5"
              style={{ color: GOLD }}
            >
              See you at the tables.
            </p>
            <button
              onClick={scrollToLocations}
              className="inline-flex items-center justify-center gap-2 h-12 px-8 rounded-md font-faberge text-sm tracking-[0.3em] uppercase"
              style={{ backgroundColor: GOLD, color: "#0a0a0a" }}
            >
              Find Nearest Premier
            </button>
          </div>
        </section>

        <ClubFooter minimal />
      </div>
    </div>
  );
}
