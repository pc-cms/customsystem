import { Link } from "react-router-dom";
import { toast } from "sonner";
import { UtensilsCrossed, Receipt, Boxes, BarChart3, ReceiptText, ShoppingCart, Tag, ClipboardCheck, Users, ScaleIcon, AlertTriangle, MapPin, Sparkles, ChefHat, TrendingUp } from "lucide-react";

import CompBudgetCard from "@/components/pos/manager/CompBudgetCard";
import { Badge } from "@/components/ui/badge";

type CardStatus = "live" | "beta" | "soon";

type ManagerCard = {
  to: string;
  title: string;
  desc: string;
  icon: typeof UtensilsCrossed;
  status: CardStatus;
};

const cards: ManagerCard[] = [
  { to: "/pos/manager/menu", title: "Menu", desc: "Categories, items, prices, stock & availability", icon: UtensilsCrossed, status: "live" },
  { to: "/pos/manager/inventory", title: "Inventory", desc: "Stock levels, movements, recipe consumption & reversals", icon: Boxes, status: "live" },
  { to: "/pos/purchases", title: "Purchases", desc: "Purchase entry and receiving — planned future phase", icon: ShoppingCart, status: "soon" },
  { to: "/pos/manager/pricing", title: "Pricing review", desc: "Suggested prices from moving-average cost — future phase", icon: Tag, status: "soon" },
  { to: "/pos/manager/stock-counts", title: "Stock variance", desc: "Bartender shelf counts vs system stock", icon: ClipboardCheck, status: "beta" },
  { to: "/pos/manager/shift-reconciliation", title: "Shift reconciliation", desc: "Sales vs cash vs stock variance per shift", icon: ScaleIcon, status: "beta" },
  { to: "/pos/reports", title: "Reports", desc: "Sales by waiter, top items, payment mix", icon: BarChart3, status: "live" },
  { to: "/pos/manager/cogs", title: "Cost control", desc: "COGS and margin reporting — planned for Phase 3C-3", icon: TrendingUp, status: "soon" },
  { to: "/pos/manager/player-analytics", title: "Player analytics", desc: "F&B consumption by player + drill-down", icon: Users, status: "live" },
  { to: "/pos/manager/problem-orders", title: "Problem orders", desc: "Marked-as-problem and force-closed orders", icon: AlertTriangle, status: "live" },
  { to: "/pos/manager/locations", title: "Locations", desc: "Main Bar, Coffee Counter, VIP service…", icon: MapPin, status: "live" },
  { to: "/pos/manager/modifiers", title: "Modifiers", desc: "Price modifiers, allowed items & recipe effects", icon: Sparkles, status: "live" },
  { to: "/pos/manager/recipes", title: "Recipes / BOM", desc: "Recipe ingredients, BOM and stock deduction rules", icon: ChefHat, status: "live" },
  { to: "/pos/charges", title: "Player charges", desc: "Outstanding postpaid F&B tabs", icon: ReceiptText, status: "live" },
  { to: "/pos/manager", title: "Shifts & Z-reports", desc: "Per-waiter sales and shift close", icon: Receipt, status: "soon" },
];

const STATUS_LABEL: Record<CardStatus, string> = {
  live: "Live",
  beta: "Beta",
  soon: "Coming soon",
};

function StatusBadge({ status }: { status: CardStatus }) {
  if (status === "live") {
    return <Badge variant="secondary" className="shrink-0">{STATUS_LABEL[status]}</Badge>;
  }
  if (status === "beta") {
    return (
      <Badge variant="outline" className="shrink-0 border-amber-500/40 text-amber-600 dark:text-amber-400">
        {STATUS_LABEL[status]}
      </Badge>
    );
  }
  return <Badge variant="outline" className="shrink-0 text-muted-foreground">{STATUS_LABEL[status]}</Badge>;
}

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
          const isSoon = c.status === "soon";
          const inner = (
            <div
              className={`flex items-start gap-3 rounded-md border border-border bg-card p-4 transition-colors ${
                isSoon ? "opacity-60 cursor-not-allowed" : "hover:bg-accent/40 cursor-pointer"
              }`}
            >
              <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold truncate">{c.title}</div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="text-xs text-muted-foreground">{c.desc}</div>
              </div>
            </div>
          );
          if (isSoon) {
            return (
              <button
                key={c.title}
                type="button"
                className="block text-left w-full"
                onClick={() => toast("This module is planned for a future phase.")}
              >
                {inner}
              </button>
            );
          }
          return (
            <Link key={c.title} to={c.to} className="block">
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
