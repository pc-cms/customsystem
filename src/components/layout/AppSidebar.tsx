import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Landmark, Table2, Receipt, BarChart3,
  ClipboardList, Sun, Moon, Shield, Gamepad2,
  UsersRound, LogOut, Settings, FileBarChart,
  ListChecks, Eye, Target,
  Building2, UserCheck, ClipboardPen, ShieldCheck, ShieldOff,
  Wallet, DoorOpen, ShieldAlert, Menu, Upload,
  ChevronsLeft, ChevronsRight, CreditCard, CalendarDays, ChevronDown, ChevronRight, Coins, Briefcase,
  RefreshCw, AlertTriangle, User as UserIcon, Rows3, Rows2, Gift, CheckCircle2, Coffee, Megaphone, TrendingUp, ArrowLeftRight, BookOpen,
} from "lucide-react";
import { UserProfileDialog } from "@/components/UserProfileDialog";
import { resetPWACache } from "@/lib/pwa-register";
import { useTheme } from "@/lib/theme";
import { useDensity } from "@/lib/density";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { useMyModulePermissions } from "@/hooks/use-module-permissions";
import { usePitBookUnread } from "@/hooks/use-pit-book-unread";
import { moduleKeyForRoute } from "@/lib/route-module-map";
import { prefetchRoute } from "@/lib/route-prefetch";
import { NetworkStatusIndicator } from "@/components/NetworkStatusIndicator";
import { VersionIndicator } from "@/components/VersionIndicator";
import { InstallPWAButton } from "@/components/InstallPWAButton";
import { LogoutButton } from "@/components/LogoutButton";
import ManagerOverrideDialog from "@/components/ManagerOverrideDialog";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import arushaLogo from "@/assets/arusha-logo.png";
import mwanzaLogo from "@/assets/mwanza-logo.png";

type AppRole = "cashier" | "cashier_slots" | "pit" | "manager" | "shift_manager" | "reception" | "finance_manager" | "surveillance" | "super_admin" | "hr" | "account_manager";

// Section labels for the hybrid grouping (roles + shared ANALYTICS)
type Section = "OVERVIEW" | "PIT" | "STAFF" | "CASHIER" | "RECEPTION" | "FINANCE" | "HR" | "ANALYTICS" | "CRM" | "MARKETING" | "BAR" | "PROMO" | "SYSTEM";

type NavItem = {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  roles: AppRole[];
  section: Section;
};

const NAV_ITEMS: NavItem[] = [
  // OVERVIEW
  { to: "/", icon: LayoutDashboard, label: "Dashboard", roles: ["super_admin", "manager", "pit", "reception", "finance_manager", "surveillance", "account_manager" as AppRole], section: "OVERVIEW" },


  // PIT — alphabetical order (trackers + incidents).
  { to: "/breaklist", icon: ListChecks, label: "Break List", roles: ["super_admin", "manager", "shift_manager", "pit", "finance_manager", "surveillance"], section: "PIT" },
  { to: "/incidents", icon: AlertTriangle, label: "Incidents", roles: ["super_admin", "manager", "shift_manager", "finance_manager", "surveillance"], section: "PIT" },
  { to: "/pitbook", icon: BookOpen, label: "Pit Book", roles: ["super_admin", "manager", "shift_manager", "pit", "surveillance"], section: "PIT" },
  { to: "/player-statistics", icon: Users, label: "Player Tracking", roles: ["super_admin", "manager", "shift_manager", "pit", "finance_manager", "surveillance"], section: "PIT" },
  { to: "/table-tracker", icon: Target, label: "Table Check", roles: ["super_admin", "manager", "shift_manager", "pit", "finance_manager", "surveillance"], section: "PIT" },
  { to: "/tables", icon: Table2, label: "Tables Tracking", roles: ["super_admin", "manager", "shift_manager", "finance_manager", "surveillance"], section: "PIT" },

  // STAFF — Attendance + Rota (each expands to Live/Floor/Security/Office).
  { to: "__attendance__", icon: ClipboardPen, label: "Attendance", roles: ["super_admin", "manager", "shift_manager", "pit", "finance_manager", "surveillance"], section: "STAFF" },
  { to: "__rota__", icon: CalendarDays, label: "Rota", roles: ["super_admin", "manager", "shift_manager", "pit", "finance_manager", "surveillance"], section: "STAFF" },
  { to: "/staff/playlist", icon: UserCheck, label: "Employee List", roles: ["super_admin", "manager", "shift_manager", "surveillance"], section: "STAFF" },

  // CASHIER — transactional Cage operations.
  { to: "/cage/view", icon: Landmark, label: "Cage View", roles: ["super_admin", "manager", "shift_manager", "surveillance"], section: "CASHIER" },
  { to: "/cage", icon: Landmark, label: "Cage Live Game", roles: ["super_admin", "cashier"], section: "CASHIER" },
  // Cage Slots: cashier-only surface. Managers/Finance/Surveillance/Pit use Cage View (which shows slots checks too).
  { to: "/cage-slots", icon: Coins, label: "Cage Slots", roles: ["cashier_slots"], section: "CASHIER" },
  // Closings hub retired — merged into /reports (Total, Live Game, Slots, Expenses tabs).
  { to: "/bank-checks", icon: CreditCard, label: "Bank", roles: ["super_admin", "manager", "shift_manager", "finance_manager"], section: "CASHIER" },
  // Unified Cashless & Transfers — single page each; source filter (Live/Slots) for managers, locked to role for cashiers.
  { to: "/cashless", icon: CreditCard, label: "Cashless", roles: ["super_admin", "manager", "shift_manager", "cashier", "cashier_slots", "finance_manager"], section: "CASHIER" },
  { to: "/transfers", icon: ArrowLeftRight, label: "Transfers", roles: ["super_admin", "cashier_slots"], section: "CASHIER" },
  // Unified Expenses — single page; source filter (Live/Slots/Office) for managers, locked to role for cashiers.
  { to: "/expenses", icon: Receipt, label: "Expenses", roles: ["super_admin", "manager", "shift_manager", "finance_manager", "cashier", "cashier_slots"], section: "CASHIER" },
  { to: "/reports", icon: FileBarChart, label: "Reports", roles: ["super_admin", "manager", "shift_manager", "finance_manager"], section: "CASHIER" },
  { to: "/tips-and-bonuses", icon: Gift, label: "Tips & Bonuses", roles: ["super_admin", "manager", "shift_manager", "finance_manager", "surveillance"], section: "CASHIER" },

  // RECEPTION — alphabetical
  { to: "/blacklist", icon: ShieldAlert, label: "Blacklist", roles: ["super_admin", "manager", "shift_manager", "reception", "finance_manager", "surveillance", "account_manager" as AppRole], section: "RECEPTION" },
  { to: "/guests", icon: UserCheck, label: "Guests", roles: ["super_admin", "manager", "shift_manager", "reception", "finance_manager", "surveillance", "account_manager" as AppRole], section: "RECEPTION" },
  { to: "/reception", icon: DoorOpen, label: "Reception", roles: ["super_admin", "manager", "shift_manager", "reception", "finance_manager"], section: "RECEPTION" },

  // FINANCES — per-casino isolated module
  { to: "/finances/dashboard", icon: Wallet, label: "Dashboard", roles: ["super_admin", "manager", "finance_manager"], section: "FINANCE" },
  { to: "/office", icon: Briefcase, label: "Office", roles: ["super_admin", "manager", "finance_manager", "shift_manager"], section: "FINANCE" },
  { to: "/finances/expenses", icon: Receipt, label: "Monthly Expenses", roles: ["manager", "finance_manager"], section: "FINANCE" },
  { to: "/finances/budget", icon: Target, label: "Budget", roles: ["super_admin", "manager", "finance_manager"], section: "FINANCE" },
  { to: "/finances/monthly-report", icon: FileBarChart, label: "Monthly Report", roles: ["super_admin", "manager", "finance_manager"], section: "FINANCE" },
  { to: "/finances/excel-import", icon: Upload, label: "Excel Import", roles: ["super_admin", "finance_manager"], section: "SYSTEM" },
  { to: "/finances/aliases", icon: ClipboardList, label: "Excel Aliases", roles: ["super_admin", "finance_manager"], section: "SYSTEM" },
  { to: "/finances/audit-log", icon: ClipboardList, label: "Finance Audit Log", roles: ["super_admin", "finance_manager"], section: "SYSTEM" },

  // HR — Personnel admin (legacy /dealers and /staff/employees superseded by Staff Master)
  { to: "/hr/warnings", icon: AlertTriangle, label: "Warnings", roles: ["super_admin", "hr", "manager", "finance_manager"], section: "HR" },
  { to: "/staff/master", icon: UserCheck, label: "Staff Master", roles: ["super_admin", "hr", "finance_manager", "manager"], section: "HR" },
  { to: "/attendance/monthly", icon: CalendarDays, label: "Attendance (Month)", roles: ["super_admin", "hr", "manager", "finance_manager"], section: "HR" },
  { to: "/payroll", icon: Wallet, label: "Payroll", roles: ["super_admin", "hr", "finance_manager"], section: "HR" },
  { to: "/payroll/dashboard", icon: Wallet, label: "Payroll · Dashboard", roles: ["super_admin", "hr", "finance_manager"], section: "HR" },
  { to: "/payroll/bank-export", icon: Wallet, label: "Payroll · Bank Export", roles: ["super_admin", "finance_manager"], section: "HR" },
  { to: "/payroll/settings", icon: Wallet, label: "Payroll · Settings", roles: ["super_admin", "finance_manager"], section: "HR" },

  // ANALYTICS — shared
  { to: "/groups", icon: UsersRound, label: "Groups", roles: ["super_admin", "manager", "shift_manager", "finance_manager"], section: "ANALYTICS" },

  // CRM
  { to: "/crm/players", icon: UsersRound, label: "Player CRM", roles: ["super_admin", "manager", "shift_manager", "finance_manager", "hr", "account_manager" as AppRole], section: "CRM" },

  // MARKETING
  { to: "/marketing/campaigns", icon: Megaphone, label: "Promo Campaigns", roles: ["super_admin", "manager", "finance_manager", "account_manager" as AppRole], section: "MARKETING" },
  
  // BAR / POS — visible only to super_admin and dedicated POS roles.
  { to: "/pos/manager", icon: Coffee, label: "Bar Manager", roles: ["super_admin", "pos_manager" as AppRole, "pos_bartender" as AppRole, "pos_waiter" as AppRole], section: "BAR" },
  { to: "/pos/reports", icon: FileBarChart, label: "Bar Reports", roles: ["super_admin", "pos_manager" as AppRole, "pos_bartender" as AppRole, "pos_waiter" as AppRole], section: "BAR" },
  { to: "/pos/manager/player-analytics", icon: Users, label: "Bar · Player Analytics", roles: ["super_admin", "pos_manager" as AppRole, "pos_bartender" as AppRole, "pos_waiter" as AppRole], section: "BAR" },
  { to: "/pos/manager/stock-counts", icon: ClipboardList, label: "Bar · Stock Counts", roles: ["super_admin", "pos_manager" as AppRole, "pos_bartender" as AppRole, "pos_waiter" as AppRole], section: "BAR" },

  // PROMO — Premier Club promo campaigns, codes, wallet, lottery, shop
  { to: "/admin/promo-codes", icon: Gift, label: "Promo Codes", roles: ["super_admin", "manager", "finance_manager", "account_manager" as AppRole], section: "PROMO" },
  { to: "/admin/promo-grants", icon: Gift, label: "Promo Grants", roles: ["super_admin", "manager", "finance_manager", "account_manager" as AppRole], section: "PROMO" },
  { to: "/admin/lotteries", icon: Gift, label: "Lotteries", roles: ["super_admin", "manager", "finance_manager", "account_manager" as AppRole], section: "PROMO" },
  { to: "/admin/shop", icon: Gift, label: "Shop Catalog", roles: ["super_admin", "manager", "finance_manager", "account_manager" as AppRole], section: "PROMO" },
  { to: "/admin/shop/orders", icon: ClipboardList, label: "Shop Orders", roles: ["super_admin", "manager", "finance_manager", "account_manager" as AppRole], section: "PROMO" },
  { to: "/admin/kyc", icon: ShieldCheck, label: "KYC Reviews", roles: ["super_admin", "manager", "finance_manager", "account_manager" as AppRole], section: "PROMO" },
  { to: "/admin/am-budget", icon: Wallet, label: "My AM Budget", roles: ["super_admin", "manager", "finance_manager", "account_manager" as AppRole], section: "PROMO" },
  { to: "/admin/am-performance", icon: TrendingUp, label: "AM Performance", roles: ["super_admin", "manager", "finance_manager", "account_manager" as AppRole], section: "PROMO" },
  { to: "/admin/fm-topups", icon: Wallet, label: "FM Top-ups", roles: ["super_admin", "finance_manager"], section: "PROMO" },
  { to: "/reports/promo-issuance", icon: FileBarChart, label: "Report · Issuance", roles: ["super_admin", "manager", "finance_manager", "account_manager" as AppRole], section: "PROMO" },
  { to: "/reports/promo-redemptions", icon: FileBarChart, label: "Report · Redemptions", roles: ["super_admin", "manager", "finance_manager", "account_manager" as AppRole], section: "PROMO" },
  { to: "/reports/promo-expiry", icon: FileBarChart, label: "Report · Expiry", roles: ["super_admin", "manager", "finance_manager", "account_manager" as AppRole], section: "PROMO" },
  { to: "/reports/promo-codes", icon: FileBarChart, label: "Report · Codes", roles: ["super_admin", "manager", "finance_manager", "account_manager" as AppRole], section: "PROMO" },
  { to: "/reports/cashback", icon: FileBarChart, label: "Report · Cashback", roles: ["super_admin", "manager", "finance_manager", "account_manager" as AppRole], section: "PROMO" },
  { to: "/reports/lottery-sales", icon: FileBarChart, label: "Report · Lottery Sales", roles: ["super_admin", "manager", "finance_manager", "account_manager" as AppRole], section: "PROMO" },
  { to: "/reports/am-budget", icon: FileBarChart, label: "Report · AM Budget", roles: ["super_admin", "finance_manager"], section: "PROMO" },

  // SYSTEM — admin/system tools
  { to: "/import-reports", icon: Upload, label: "Import Reports", roles: ["super_admin", "manager"], section: "SYSTEM" },
  { to: "/logs", icon: ClipboardList, label: "Logs", roles: ["super_admin", "manager", "finance_manager"], section: "SYSTEM" },


];

const TABLE_SUBITEMS = [
  { tab: "activeplayers", icon: Users, label: "Active Players" },
  { tab: "tracker", icon: Eye, label: "Player Tracker" },
  { tab: "tabletracker", icon: Target, label: "Table Check" },
];

// PIT-section variant (no Employee — Personnel admin lives in HR)
const PIT_SUBITEMS_OPS = [
  { tab: "attendance", icon: ClipboardPen, label: "Attendance" },
  { tab: "rota", icon: CalendarDays, label: "Rota" },
];
// HR-section variant (with Employee)
const PIT_SUBITEMS_HR = [
  { tab: "attendance", icon: ClipboardPen, label: "Attendance" },
  { tab: "employee", icon: UserCheck, label: "Employee" },
  { tab: "rota", icon: CalendarDays, label: "Rota" },
];

const STAFF_SUBITEMS_OPS = [
  { tab: "attendance", icon: ClipboardPen, label: "Attendance" },
  { tab: "rota_floor", icon: CalendarDays, label: "Floor Rota" },
];
const STAFF_SUBITEMS_HR = [
  { tab: "attendance", icon: ClipboardPen, label: "Attendance" },
  { tab: "employee", icon: UserCheck, label: "Employee" },
  { tab: "rota_floor", icon: CalendarDays, label: "Floor Rota" },
];

// Virtual parent groupings: Attendance / Rota each expand to Live + Floor + Security + Office.
// Phase 2: each sub-item is a flat URL so the access matrix gates by ModuleKey.
type VirtualSub = { to: string; icon: typeof ListChecks; label: string; matchPath: string; matchTab?: string; matchGroup?: string };
const ATTENDANCE_SUBITEMS: VirtualSub[] = [
  { to: "/attendance/live", icon: Gamepad2, label: "Live", matchPath: "/attendance/live" },
  { to: "/attendance/floor", icon: Building2, label: "Floor", matchPath: "/attendance/floor" },
  { to: "/attendance/security", icon: Shield, label: "Security", matchPath: "/attendance/security" },
  { to: "/attendance/office", icon: Briefcase, label: "Office", matchPath: "/attendance/office" },
];
const ROTA_SUBITEMS: VirtualSub[] = [
  { to: "/rota/live", icon: Gamepad2, label: "Live", matchPath: "/rota/live" },
  { to: "/rota/floor", icon: Building2, label: "Floor", matchPath: "/rota/floor" },
  { to: "/rota/security", icon: Shield, label: "Security", matchPath: "/rota/security" },
  { to: "/rota/office", icon: Briefcase, label: "Office", matchPath: "/rota/office" },
];

const BREAKLIST_PATH = "/breaklist";

// Helper: parse "/path?tab=foo" into { base, tab }
const parseItemTo = (to: string) => {
  const [base, q = ""] = to.split("?");
  const tab = new URLSearchParams(q).get("tab");
  return { base, tab };
};

const EXACT_NAV_PATHS = new Set(["/cage", "/cage/view", "/expenses", "/expenses/approvals"]);

const routeMatchesNavItem = (pathname: string, to: string) => {
  const { base, tab } = parseItemTo(to);
  if (tab !== null) return false;
  if (base === "/") return pathname === "/";
  return EXACT_NAV_PATHS.has(base) ? pathname === base : pathname.startsWith(base);
};

// ============ Collapsible sections (expanded sidebar) ============
const SECTIONS_STORAGE_KEY = "cms.sidebar.openSections";
const FLAT_SECTION: Section = "OVERVIEW";

type SectionsProps = {
  visibleItems: NavItem[];
  isManager: boolean;
  isPitActive: boolean;
  isStaffActive: boolean;
  isTablesActive: boolean;
  currentTab: string;
  currentGroup: string;
  roles: AppRole[];
  isSuper: boolean;
  allowedModules: Set<string> | undefined;
  onNavigate?: () => void;
  renderSubItems: (basePath: string, items: typeof TABLE_SUBITEMS) => JSX.Element;
};

const SidebarSections = ({
  visibleItems, isManager, isPitActive, isStaffActive, isTablesActive,
  currentTab, currentGroup, roles, isSuper, allowedModules, onNavigate, renderSubItems,
}: SectionsProps) => {
  const location = useLocation();
  const { data: pitBookUnread } = usePitBookUnread();
  const pitBookUnreadCount = pitBookUnread?.total ?? 0;


  // Group items by section, preserving order
  const grouped = visibleItems.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.section] ||= []).push(item);
    return acc;
  }, {});
  const sectionOrder: Section[] = ["OVERVIEW", "PIT", "STAFF", "CASHIER", "RECEPTION", "FINANCE", "HR", "ANALYTICS", "CRM", "MARKETING", "BAR", "PROMO", "SYSTEM"];
  const sections = sectionOrder.filter(s => grouped[s]?.length || (s === "SYSTEM" && isManager));

  // Find which section contains the active route
  const activeSection: Section | null = (() => {
    for (const s of sections) {
      const items = s === "SYSTEM"
        ? [...(grouped[s] || []), ...(isManager ? [{ to: "/admin" } as NavItem] : [])]
        : grouped[s] || [];
      const hit = items.some(it => {
        const base = it.to.split("?")[0];
        if (base === "/") return location.pathname === "/";
        return EXACT_NAV_PATHS.has(base) ? location.pathname === base : location.pathname.startsWith(base);
      });
      if (hit) return s;
    }
    return null;
  })();

  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem(SECTIONS_STORAGE_KEY) : null;
      if (stored) Object.assign(initial, JSON.parse(stored));
    } catch { /* ignore */ }
    if (activeSection) initial[activeSection] = true;
    return initial;
  });

  // Auto-open the section that contains the active route
  if (activeSection && !open[activeSection]) {
    // schedule update to avoid setState-in-render
    setTimeout(() => setOpen(o => ({ ...o, [activeSection]: true })), 0);
  }

  const toggle = (s: string) => {
    setOpen(prev => {
      const next = { ...prev, [s]: !prev[s] };
      try { localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const renderVirtualGroup = (
    key: "attendance" | "rota",
    item: NavItem,
    sectionCtx: Section,
    allSubs: VirtualSub[],
  ) => {
    const groupKey = `__virtual:${key}`;
    // Filter sub-items by the access matrix so Floor/Security/Office only
    // appear when the user actually has access to the corresponding module
    // (staff_rota / staff_attendance). Live keeps showing whenever the parent
    // group is visible (it maps to pit_rota / pit_attendance which already
    // gates the parent). Super-admin sees everything.
    const subs = allSubs.filter(s => {
      if (isSuper) return true;
      if (allowedModules === undefined) return true; // avoid flicker while loading
      const mk = moduleKeyForRoute(s.to, s.label);
      if (!mk) return true;
      return allowedModules.has(mk);
    });
    if (subs.length === 0) return null;
    const matchSub = (s: VirtualSub) => {
      if (!s.matchTab) return location.pathname === s.matchPath;
      return location.pathname === s.matchPath && currentTab === s.matchTab && (!s.matchGroup || currentGroup === s.matchGroup);
    };
    const isGroupActive = subs.some(matchSub);
    const isOpen = open[groupKey] ?? isGroupActive;
    return (
      <div key={`${sectionCtx}:${item.to}`}>
        <button
          type="button"
          onClick={() => toggle(groupKey)}
          className={`w-full flex items-center gap-3 px-3 h-8 rounded-md text-sm transition-colors ${
            isGroupActive ? "bg-sidebar-accent text-sidebar-primary font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent"
          }`}
        >
          <item.icon className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">{item.label}</span>
          {isOpen ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        </button>
        {isOpen && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
            {subs.map(sub => {
              const active = matchSub(sub);
              return (
                <NavLink
                  key={sub.to}
                  to={sub.to}
                  end
                  onClick={onNavigate}
                  onMouseEnter={() => prefetchRoute(sub.to)}
                  onFocus={() => prefetchRoute(sub.to)}
                  onTouchStart={() => prefetchRoute(sub.to)}
                  className={`flex items-center gap-2 px-2 h-7 rounded-md text-xs transition-colors ${
                    active ? "bg-sidebar-accent text-sidebar-primary font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}
                >
                  <sub.icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{sub.label}</span>
                </NavLink>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderItem = (item: NavItem, sectionCtx: Section) => {
    if (item.to.startsWith("__divider__")) {
      return <div key={`${sectionCtx}:${item.to}`} className="my-1 border-t border-sidebar-border/60" />;
    }
    if (item.to === "__attendance__") return renderVirtualGroup("attendance", item, sectionCtx, ATTENDANCE_SUBITEMS);
    if (item.to === "__rota__") return renderVirtualGroup("rota", item, sectionCtx, ROTA_SUBITEMS);
    const { base: itemBase, tab: itemTab } = parseItemTo(item.to);
    const isTabAware = itemTab !== null;
    const isTabAwareActive =
      isTabAware && location.pathname === itemBase && currentTab === itemTab;
    return (
      <div key={`${sectionCtx}:${item.to}`}>
        <NavLink
          to={item.to}
          end={item.to === "/" || item.to === "/tables" || EXACT_NAV_PATHS.has(itemBase) || isTabAware}
          onClick={onNavigate}
          onMouseEnter={() => prefetchRoute(itemBase)}
          onFocus={() => prefetchRoute(itemBase)}
          onTouchStart={() => prefetchRoute(itemBase)}
          className={({ isActive }) => {
            const active = isTabAware ? isTabAwareActive : isActive;
            return `flex items-center gap-3 px-3 h-8 rounded-md text-sm transition-colors ${
              active ? "bg-sidebar-accent text-sidebar-primary font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent"
            }`;
          }}
        >
          <item.icon className={cn("w-4 h-4 shrink-0", item.to === "/pitbook" && pitBookUnreadCount > 0 && "fill-primary text-primary")} />
          <span className="flex-1">{item.label}</span>
          {item.to === "/pitbook" && pitBookUnreadCount > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {pitBookUnreadCount}
            </span>
          )}
        </NavLink>
      </div>
    );
  };

  return (
    <nav className="flex-1 py-2 px-2 overflow-y-auto">
      {sections.map((section, idx) => {
        const items: NavItem[] = section === "SYSTEM"
          ? [
              ...(grouped[section] || []),
              ...(isManager ? [{ to: "/admin", icon: Settings, label: "Admin", roles: ["manager"] as AppRole[], section: "SYSTEM" as Section }] : []),
            ]
          : grouped[section] || [];
        if (!items.length) return null;

        return (
          <div key={section} className={idx > 0 ? "mt-1 border-t border-sidebar-border pt-1 space-y-0.5" : "mb-1 space-y-0.5"}>
            {items.map(it => renderItem(it, section))}
          </div>
        );
      })}
    </nav>
  );
};

// ============ Shared sidebar inner ============
type InnerProps = {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
};

const SidebarInner = ({ onNavigate, collapsed = false, onToggle }: InnerProps) => {
  const { theme, toggle } = useTheme();
  const { effective: densityEffective, setMode: setDensityMode } = useDensity();
  const toggleDensity = () => setDensityMode(densityEffective === "compact" ? "comfort" : "compact");
  const { displayName, roles, signOut, isManager, managerOverride, activateManagerOverride, deactivateManagerOverride } = useAuth();
  const { activeCasino, isSummaryMode } = useCasino();
  // Brand by subdomain first (sync, available before activeCasino loads),
  // fall back to activeCasino.slug. Without this, Pit/Cashier accounts whose
  // profile hasn't finished loading get the generic "CMS / Casino Ops" header
  // instead of the Arusha brand.
  const subdomainLabel = typeof window !== "undefined"
    ? (window.location.hostname.split(".")[0] || "").toLowerCase()
    : "";
  const brandedSlugs = ["arusha", "mwanza", "dodoma", "mbeya", "premier"];
  const activeSlug = (activeCasino?.slug ?? "").toLowerCase();
  const brandedSlug = brandedSlugs.find(s => s === subdomainLabel || s === activeSlug) ?? null;
  const isBranded = brandedSlug !== null;
  const location = useLocation();
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const rawTab = new URLSearchParams(location.search).get("tab");
  const isPitActive = location.pathname === "/pit" && rawTab !== "breaklist";
  const isStaffActive = location.pathname === "/staff";
  const isTablesActive = location.pathname === "/tables";
  const currentTab = rawTab ||
    (location.pathname === "/pit" ? "employee" : isTablesActive ? "tables" : "employee");
  const currentGroup = new URLSearchParams(location.search).get("group") || "floor";

  const { data: allowedModules } = useMyModulePermissions();
  const { data: pitBookUnread } = usePitBookUnread();
  const pitBookUnreadCount = pitBookUnread?.total ?? 0;
  const isSuper = roles.includes("super_admin" as AppRole);
  // Admin panel: super_admin always; others only if explicitly granted the "admin" module.
  // Currently only super_admin has it by role default — finance_manager can be granted via the access matrix.
  const canSeeAdmin = isSuper || (allowedModules?.has("admin") ?? false);
  // Matrix is the single source of truth for sidebar visibility.
  // No hard-coded role whitelists — only super_admin bypass + the matrix.
  // Items without a module mapping (mk null) stay visible to everyone (they
  // are auxiliary entries that don't correspond to a gated module).
  const visibleItems = NAV_ITEMS.filter(item => {
    // Dividers always pass through; SidebarSections renders them as <hr>.
    if (item.to.startsWith("__divider__")) return true;
    // Cage and Cage View are separate top-level buttons, never parent/sub-items.
    if (item.to === "/cage" && !isSuper && !roles.includes("cashier" as AppRole)) return false;
    if (item.to === "/cage/view" && !isSuper && roles.includes("cashier" as AppRole)) return false;
    if (item.to === "/crm/players" && !item.roles.some(r => roles.includes(r))) return false;
    // (Unified /expenses is visible to all roles in its nav whitelist; gated via matrix module 'expenses'.)
    if (isSuper) return true;
    if (allowedModules === undefined) return false; // still loading → render nothing yet
    const mk = moduleKeyForRoute(item.to, item.label);
    if (!mk) {
      // Unmapped auxiliary entry (e.g. /pos/*) — gate by item.roles whitelist
      // so cashier/cashier_slots/pit don't accidentally see BAR/POS nav items.
      if (item.roles && item.roles.length > 0) {
        return item.roles.some(r => roles.includes(r));
      }
      return true;
    }
    return allowedModules.has(mk);
  });

  const nativeManager = roles.includes("manager" as AppRole);

  const handleManagerOverrideConfirm = (managerId: string) => {
    activateManagerOverride(managerId, "Manager");
    setShowOverrideDialog(false);
    toast.success("Manager Access activated");
  };

  const handleDeactivate = () => {
    deactivateManagerOverride();
    toast.info("Manager Access deactivated");
  };

  const renderSubItems = (basePath: string, items: typeof TABLE_SUBITEMS) => (
    <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
      {items.map(sub => (
        <NavLink
          key={sub.tab}
          to={`${basePath}?tab=${sub.tab}`}
          onClick={onNavigate}
          onMouseEnter={() => prefetchRoute(basePath)}
          onFocus={() => prefetchRoute(basePath)}
          onTouchStart={() => prefetchRoute(basePath)}
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
            currentTab === sub.tab
              ? "bg-sidebar-accent text-sidebar-primary font-medium"
              : "text-sidebar-foreground hover:bg-sidebar-accent"
          }`}
        >
          <sub.icon className="w-3.5 h-3.5 shrink-0" />
          <span>{sub.label}</span>
        </NavLink>
      ))}
    </div>
  );

  // ============ Collapsed (icon rail) — desktop only ============
  if (collapsed && !onNavigate) {
    return (
      <TooltipProvider delayDuration={150}>
        <div className="flex flex-col items-center py-3 gap-1 h-full">
          {/* Nav icons start directly at the top (expand button moved to bottom) */}

          {/* Nav icons (only top-level items, no sub-tabs) */}
          <nav className="flex-1 flex flex-col items-center gap-0.5 w-full px-2 overflow-hidden">
            {visibleItems.map((item) => {
              if (item.to.startsWith("__divider__")) {
                return <div key={item.to} className="w-8 my-1 border-t border-sidebar-border/60" />;
              }
              const isVirtual = item.to === "__attendance__" || item.to === "__rota__";
              const subs = item.to === "__attendance__" ? ATTENDANCE_SUBITEMS : item.to === "__rota__" ? ROTA_SUBITEMS : null;
              const targetTo = subs ? subs[0].to : item.to;
              const { base: itemBase, tab: itemTab } = parseItemTo(targetTo);
              const isTabAware = itemTab !== null;
              const isActive = subs
                ? subs.some(s => s.matchTab
                    ? (location.pathname === s.matchPath && currentTab === s.matchTab)
                    : location.pathname === s.matchPath)
                : isTabAware
                  ? location.pathname === itemBase && currentTab === itemTab
                  : item.to === "/"
                    ? location.pathname === "/"
                    : EXACT_NAV_PATHS.has(itemBase) ? location.pathname === itemBase : location.pathname.startsWith(itemBase);
              return (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>
                    <NavLink
                      to={targetTo}
                      end={targetTo === "/"}
                      onMouseEnter={() => prefetchRoute(itemBase)}
                      onFocus={() => prefetchRoute(itemBase)}
                      onTouchStart={() => prefetchRoute(itemBase)}
                      className={cn(
                        "relative w-10 h-10 flex items-center justify-center rounded-md transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-primary"
                          : "text-sidebar-foreground hover:bg-sidebar-accent"
                      )}
                    >
                      <item.icon className={cn("w-4 h-4", item.to === "/pitbook" && pitBookUnreadCount > 0 && "fill-primary text-primary")} />
                      {item.to === "/pitbook" && pitBookUnreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                          {pitBookUnreadCount}
                        </span>
                      )}
                    </NavLink>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            })}

            {canSeeAdmin && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <NavLink
                    to="/admin"
                    className={({ isActive }) =>
                      cn(
                        "w-10 h-10 flex items-center justify-center rounded-md transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-primary"
                          : "text-sidebar-foreground hover:bg-sidebar-accent"
                      )
                    }
                  >
                    <Settings className="w-4 h-4" />
                  </NavLink>
                </TooltipTrigger>
                <TooltipContent side="right">Admin</TooltipContent>
              </Tooltip>
            )}
          </nav>

          <div className="w-8 border-t border-sidebar-border my-1" />

          {/* Profile + theme + sign out */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setShowProfile(true)}
                className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-sidebar-accent transition-colors text-sidebar-foreground"
              >
                <UserIcon className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Profile</TooltipContent>
          </Tooltip>
          {!nativeManager && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => managerOverride.active ? handleDeactivate() : setShowOverrideDialog(true)}
                  className={cn(
                    "w-10 h-10 flex items-center justify-center rounded-md transition-colors",
                    managerOverride.active
                      ? "bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30"
                      : "hover:bg-sidebar-accent text-sidebar-foreground"
                  )}
                >
                  <ShieldCheck className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{managerOverride.active ? "Manager Active — click to deactivate" : "Manager Access"}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggle}
                className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-sidebar-accent transition-colors text-sidebar-foreground"
              >
                {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleDensity}
                className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-sidebar-accent transition-colors text-sidebar-foreground"
              >
                {densityEffective === "compact" ? <Rows3 className="w-4 h-4" /> : <Rows2 className="w-4 h-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{densityEffective === "compact" ? "Comfort density" : "Compact density"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { void resetPWACache(); }}
                className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-sidebar-accent transition-colors text-sidebar-foreground"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Force update</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-10 flex items-center justify-center">
                <InstallPWAButton iconOnly className="w-10 h-10" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">Install App</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <LogoutButton
                className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-sidebar-accent transition-colors text-sidebar-foreground"
              >
                <LogOut className="w-4 h-4" />
              </LogoutButton>
            </TooltipTrigger>
            <TooltipContent side="right">Sign out</TooltipContent>
          </Tooltip>

          <div className="w-8 border-t border-sidebar-border my-1" />

          {/* Expand sidebar — kept at the bottom in same position */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggle}
                className="w-10 h-10 flex items-center justify-center rounded-md hover:bg-sidebar-accent transition-colors text-sidebar-foreground"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Expand sidebar</TooltipContent>
          </Tooltip>

          <div className="w-10 mt-1">
            <VersionIndicator collapsed />
          </div>
        </div>
      </TooltipProvider>
    );
  }

  // ============ Expanded (full sidebar) ============
  return (
    <>
      <div
        className={cn("px-4 py-4 border-b", !isBranded && "border-sidebar-border")}
        style={isBranded ? { borderBottomColor: "#E8C688" } : undefined}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            {isBranded ? (
              <>
                <img
                  src={brandedSlug === "mwanza" ? mwanzaLogo : arushaLogo}
                  alt={brandedSlug ?? "Casino"}
                  className="w-7 h-7 shrink-0 object-contain"
                />
                <span className="font-faberge font-semibold text-sm uppercase tracking-wide" style={{ color: "#E8C688" }}>PREMIER</span>
              </>
            ) : (
              <>
                <Shield className="w-6 h-6 text-primary shrink-0" />
                <span className="font-bold text-lg tracking-tight text-sidebar-foreground">CMS</span>
              </>
            )}
          </div>
          {isBranded ? (
            <span
              className="font-faberge font-semibold text-sm uppercase tracking-wide truncate text-right"
              style={{ color: "#E8C688" }}
              title={isSummaryMode ? "All Casinos" : activeCasino?.name ?? (brandedSlug ? brandedSlug.charAt(0).toUpperCase() + brandedSlug.slice(1) : "Casino Ops")}
            >
              {isSummaryMode ? "All Casinos" : activeCasino?.name ?? (brandedSlug ? brandedSlug.charAt(0).toUpperCase() + brandedSlug.slice(1) : "Casino Ops")}
            </span>
          ) : (
            <span
              className="text-sm font-semibold text-sidebar-foreground/90 truncate text-right"
              title={isSummaryMode ? "All Casinos" : activeCasino?.name ?? "Casino Ops"}
            >
              {isSummaryMode ? "All Casinos" : activeCasino?.name ?? "Casino Ops"}
            </span>
          )}
        </div>

      </div>

      <SidebarSections
        visibleItems={visibleItems}
        isManager={canSeeAdmin}
        isPitActive={isPitActive}
        isStaffActive={isStaffActive}
        isTablesActive={isTablesActive}
        currentTab={currentTab}
        currentGroup={currentGroup}
        roles={roles as AppRole[]}
        isSuper={isSuper}
        allowedModules={allowedModules}
        onNavigate={onNavigate}
        renderSubItems={renderSubItems}
      />

      <div className="px-3 py-2 border-t border-sidebar-border space-y-2">
        <div className="flex items-center gap-2 px-1">
          <button
            onClick={() => setShowProfile(true)}
            className="text-xs font-medium text-sidebar-foreground truncate flex-1 text-left hover:text-sidebar-primary transition-colors"
            title="Open profile"
          >
            {displayName}
          </button>
          <NetworkStatusIndicator compact />
        </div>
        <div className="flex items-center justify-between gap-1 px-1">
          {!nativeManager && (
            <button
              onClick={() => managerOverride.active ? handleDeactivate() : setShowOverrideDialog(true)}
              title={managerOverride.active ? "Manager Active — click to deactivate" : "Manager Access"}
              className={cn(
                "h-7 flex-1 flex items-center justify-center rounded-md transition-colors",
                managerOverride.active
                  ? "bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30"
                  : "text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => { toggle(); onNavigate?.(); }}
            title={theme === "dark" ? "Light mode" : "Dark mode"}
            className="h-7 flex-1 flex items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={toggleDensity}
            title={densityEffective === "compact" ? "Comfort density" : "Compact density"}
            className="h-7 flex-1 flex items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            {densityEffective === "compact" ? <Rows3 className="w-3.5 h-3.5" /> : <Rows2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => { void resetPWACache(); }}
            title="Force update"
            className="h-7 flex-1 flex items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <InstallPWAButton iconOnly />
          <LogoutButton
            title="Sign out"
            className="h-7 flex-1 flex items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </LogoutButton>
          {onToggle && (
            <button
              onClick={onToggle}
              title="Collapse sidebar"
              className="h-7 flex-1 flex items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            >
              <ChevronsLeft className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="mt-1 pt-1 border-t border-sidebar-border/50">
          <VersionIndicator />
        </div>
      </div>

      <ManagerOverrideDialog
        open={showOverrideDialog}
        onClose={() => setShowOverrideDialog(false)}
        onConfirm={handleManagerOverrideConfirm}
        title="Manager Access"
        description="Authenticate as a manager to unlock elevated permissions."
        actionType="MANAGER_ACCESS_ACTIVATE"
        actionDetails={{ activated_by: displayName }}
      />
      <UserProfileDialog open={showProfile} onOpenChange={setShowProfile} />
    </>
  );
};

// ============ Desktop sidebar ============
export const AppSidebar = ({ collapsed = false, onToggle }: { collapsed?: boolean; onToggle?: () => void } = {}) => (
  <aside
    className={cn(
      "h-screen flex flex-col bg-sidebar border-r border-sidebar-border shrink-0 transition-[width] duration-150",
      collapsed ? "w-14" : "w-56"
    )}
  >
    <SidebarInner collapsed={collapsed} onToggle={onToggle} />
  </aside>
);

// ============ Mobile header + hamburger sheet ============
export const MobileHeader = () => {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const currentTab = new URLSearchParams(location.search).get("tab");
  const currentItem =
    NAV_ITEMS.find(item => {
      const { base, tab } = parseItemTo(item.to);
      if (tab === null) return false;
      return location.pathname === base && currentTab === tab;
    }) ||
    NAV_ITEMS.find(item => {
      const { base, tab } = parseItemTo(item.to);
      if (tab !== null) return false;
      return routeMatchesNavItem(location.pathname, item.to);
    });
  const pageTitle = currentItem?.label || "CMS";

  return (
    <>
      <header className="h-12 flex items-center gap-2 px-3 border-b border-border bg-sidebar shrink-0">
        <Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => setOpen(true)}>
          <Menu className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-bold text-foreground truncate">{pageTitle}</span>
        </div>
      </header>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col bg-sidebar">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarInner onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
};
