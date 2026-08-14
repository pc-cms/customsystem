/**
 * Casino selector — DISABLED globally (2026-08-14).
 *
 * Data is always scoped to the casino of the domain the app is opened on.
 * The `premier` (network) domain will get its own dedicated interface, so no
 * page renders a casino switcher any more. Kept as a no-op component so the
 * remaining imports stay valid.
 */
export default function FinanceCasinoSwitcher(_props: { allowNetwork?: boolean }) {
  return null;
}
