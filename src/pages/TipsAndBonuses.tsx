/**
 * TipsAndBonuses — single sidebar entry that hosts 4 tabs:
 *   Weekly Bonus · Monthly Tips · Tips (IN/OUT ledger) · Lottery
 *
 * Each tab keeps its own period navigator (week / 16→15 / month). Visible to
 * manager / shift_manager / surveillance / finance_manager / super_admin.
 * Cashier still records tips from the cage header — unchanged.
 *
 * Tab state lives in ?tab= so deep links and legacy redirects work.
 */
import { lazy, Suspense } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Coins, Gift, HandCoins, Ticket } from "lucide-react";
import { useSearchParams } from "react-router-dom";

const WeeklyBonus = lazy(() => import("@/pages/WeeklyBonus"));
const MonthlyTips = lazy(() => import("@/pages/MonthlyTips"));
const TipsLedgerTab = lazy(() => import("@/pages/office/TipsBonusTab"));
const LotteryTab = lazy(() => import("@/pages/tips/LotteryTab"));

const TAB_VALUES = ["weekly", "monthly", "tips", "lottery"] as const;
type TabValue = typeof TAB_VALUES[number];

const Loader = () => (
  <div className="flex items-center justify-center py-12">
    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

export default function TipsAndBonuses() {
  const [params, setParams] = useSearchParams();
  const raw = (params.get("tab") || "weekly") as TabValue;
  const tab = (TAB_VALUES as readonly string[]).includes(raw) ? raw : "weekly";

  const setTab = (v: string) => {
    const p = new URLSearchParams(params);
    p.set("tab", v);
    setParams(p, { replace: true });
  };

  const renderTabMenu = () => (
    <TabsList className="grid w-full grid-cols-2 gap-1 h-auto sm:grid-cols-4">
      <TabsTrigger value="weekly" className="gap-1.5"><Gift className="w-3.5 h-3.5" />Weekly Bonus</TabsTrigger>
      <TabsTrigger value="monthly" className="gap-1.5"><Coins className="w-3.5 h-3.5" />Monthly Tips</TabsTrigger>
      <TabsTrigger value="tips" className="gap-1.5"><HandCoins className="w-3.5 h-3.5" />Tips</TabsTrigger>
      <TabsTrigger value="lottery" className="gap-1.5"><Ticket className="w-3.5 h-3.5" />Lottery</TabsTrigger>
    </TabsList>
  );

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <Suspense fallback={<Loader />}>
        <TabsContent value="weekly" className="mt-0"><WeeklyBonus belowHeader={renderTabMenu()} /></TabsContent>
        <TabsContent value="monthly" className="mt-0"><MonthlyTips belowHeader={renderTabMenu()} /></TabsContent>
        <TabsContent value="tips" className="mt-0"><TipsLedgerTab belowHeader={renderTabMenu()} /></TabsContent>
        <TabsContent value="lottery" className="mt-0"><LotteryTab belowHeader={renderTabMenu()} /></TabsContent>
      </Suspense>
    </Tabs>
  );
}
