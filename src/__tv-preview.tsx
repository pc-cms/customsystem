import { createRoot } from "react-dom/client";
import { useState } from "react";
import { LiveStage } from "@/components/boss/tv/live-stage";
import { tvDensityVars } from "@/components/boss/tv/density";
import { STAGE_BACKGROUND, tvAccentFor, type TvStyleId } from "@/components/boss/tv/tokens";
import "@/index.css";

const m = (d: number, r: number, h = 12) => ({ drop: d, result: r, hold: d ? (r / d) * 100 : 0, headCount: h });
const disp = (d: number, r: number, slots = true) => ({
  tables: m(d, r), slots: slots ? m(18_812_850, 5_682_910) : m(0, 0),
  total: m(d + (slots ? 18_812_850 : 0), r + (slots ? 5_682_910 : 0)),
  slotsDropAvailable: slots, slotsResultAvailable: slots,
});
const names = ["Arusha", "Dodoma", "Mbeya", "Mwanza"];
const casinos = names.map((n, i) => ({
  id: `c${i}`, name: n, slug: n.toLowerCase(), accent: tvAccentFor(n.toLowerCase(), i),
  displayed: disp([310_000, 300_000, 5_400_000, 460_000][i], [310_000, -160_000, 2_150_000, 235_000][i], i % 2 === 0) as never,
  top: [
    { playerId: `${i}a`, name: `HUANG CHEN ${n}`, drop: 5_200_000 - i * 300_000, casinoId: `c${i}` },
    { playerId: `${i}b`, name: `ZEFANI ${n}`, drop: 1_300_000 - i * 90_000, casinoId: `c${i}` },
  ],
}));
const company = { drop: 125_282_850, result: -8_217_910, hold: 32.5, headCount: 27 } as never;

function App() {
  const [style, setStyle] = useState<TvStyleId>(
    (new URLSearchParams(location.search).get("s") as TvStyleId) || "black-gold",
  );
  void setStyle;
  return (
    <div
      className="fixed inset-0 w-screen h-[100dvh] overflow-hidden text-white px-[clamp(12px,0.8vw,18px)] py-[clamp(10px,0.8vh,16px)]"
      style={{ ...tvDensityVars("xl"), background: STAGE_BACKGROUND[style], fontFamily: "'IBM Plex Sans',system-ui" }}
    >
      <LiveStage style={style} casinos={casinos} company={company} newPlayersCount={11} period="today" periodLabel="Aug 2026" />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
