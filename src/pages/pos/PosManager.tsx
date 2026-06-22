import { Link } from "react-router-dom";
import { UtensilsCrossed, Receipt, Boxes, BarChart3, ReceiptText, ShoppingCart, Tag, ClipboardCheck, Users, ScaleIcon, AlertTriangle, MapPin, Sparkles, ChefHat, TrendingUp } from "lucide-react";

import CompBudgetCard from "@/components/pos/manager/CompBudgetCard";

const cards = [
  {
    to: "/pos/manager/menu",
    title: "Menu",
    desc: "Categories, items, prices & stock",
    icon: UtensilsCrossed,
    enabled: true,
  },
  {
    to: "/pos/manager/inventory",
    title: "Inventory",
    desc: "Stock levels & movements",
    icon: Boxes,
    enabled: true,
  },
  {
    to: "/pos/purchases",
    title: "Purchases",
    desc: "Record bar bulk / single-bottle purchases",
    icon: ShoppingCart,
    enabled: true,
  },
  {
    to: "/pos/manager/pricing",
    title: "Pricing review",
    desc: "Suggested prices from moving-average cost",
    icon: Tag,
    enabled: true,
  },
  {
    to: "/pos/manager/stock-counts",
    title: "Stock variance",
    desc: "Bartender shelf counts vs system stock",
    icon: ClipboardCheck,
    enabled: true,
  },
  {
    to: "/pos/manager/shift-reconciliation",
    title: "Shift reconciliation",
    desc: "Sales vs cash vs stock variance per shift",
    icon: ScaleIcon,
    enabled: true,
  },
  {
    to: "/pos/reports",
    title: "Reports",
    desc: "Sales by waiter, top items, payment mix",
    icon: BarChart3,
    enabled: true,
  },
  {
    to: "/pos/manager/cogs",
    title: "COGS report",
    desc: "Cost of goods sold from cost snapshots",
    icon: TrendingUp,
    enabled: true,
  },
  {
    to: "/pos/manager/player-analytics",
    title: "Player analytics",
    desc: "F&B consumption by player + drill-down",
    icon: Users,
    enabled: true,
  },
  {
    to: "/pos/manager/problem-orders",
    title: "Problem orders",
    desc: "Marked-as-problem and force-closed orders",
    icon: AlertTriangle,
    enabled: true,
  },
  {
    to: "/pos/manager/locations",
    title: "Locations",
    desc: "Main Bar, Coffee Counter, VIP service…",
    icon: MapPin,
    enabled: true,
  },
  {
    to: "/pos/manager/modifiers",
    title: "Modifiers",
    desc: "Extra Milk, No Ice, Double Shot — per-unit deltas",
    icon: Sparkles,
    enabled: true,
  },
  {
    to: "/pos/manager/recipes",
    title: "Recipes / BOM",
    desc: "Foundation tables (inert in Phase 3A)",
    icon: ChefHat,
    enabled: true,
  },
  {
    to: "/pos/charges",
    title: "Player charges",
    desc: "Outstanding postpaid F&B tabs",
    icon: ReceiptText,
    enabled: true,
  },

  {
    to: "/pos/manager",
    title: "Shifts & Z-reports",
    desc: "Per-waiter via shift close",
    icon: Receipt,
    enabled: false,
  },
];

export default function PosManager() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">POS Manager</h1>
        <p className="text-muted-foreground text-sm">
          Manage menu, shifts, inventory and reports.
        </p>
      </div>
      <CompBudgetCard />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const inner = (
            <div
              className={`flex items-start gap-3 rounded-md border border-border bg-card p-4 transition-colors ${
                c.enabled ? "hover:bg-accent/40 cursor-pointer" : "opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold">{c.title}</div>
                <div className="text-xs text-muted-foreground">{c.desc}</div>
              </div>
            </div>
          );
          return c.enabled ? (
            <Link key={c.title} to={c.to} className="block">{inner}</Link>
          ) : (
            <div key={c.title}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
