import { DASH } from "./primitives";

export function DutyManagerLabel({ name, period }: { name: string | null; period: "today" | "monthly" }) {
  if (period !== "today") return null;
  return (
    <span
      title={name ?? undefined}
      className="block min-w-0 max-w-full truncate uppercase tracking-[0.12em] text-white/55"
      style={{ fontSize: "var(--tv-city-head, 13px)" }}
    >
      {name ?? DASH}
    </span>
  );
}