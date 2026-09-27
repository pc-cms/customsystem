import { useEffect, useState } from "react";
import { usePosOperator, lockPosOperator } from "@/lib/pos-operator";
import PinUnlockOverlay from "@/components/pos/waiter/PinUnlockOverlay";
import { useAuth } from "@/lib/auth-context";
import { useCasino } from "@/lib/casino-context";
import { usePosCurrentShift, type PosZReport } from "@/hooks/use-pos-shift";
import { usePosOpenTabs } from "@/hooks/use-pos-tabs";
import { fmtDateTime } from "@/lib/format-date";
import { formatNumberSpaces } from "@/lib/currency";
import OpenShiftCard from "@/components/pos/waiter/OpenShiftCard";
import TabsPanel from "@/components/pos/waiter/TabsPanel";
import MenuPanel from "@/components/pos/waiter/MenuPanel";
import ActiveTabPanel from "@/components/pos/waiter/ActiveTabPanel";
import NewTabDialog from "@/components/pos/waiter/NewTabDialog";
import CloseShiftDialog from "@/components/pos/waiter/CloseShiftDialog";
import HandoverShiftDialog from "@/components/pos/waiter/HandoverShiftDialog";
import ZReportView from "@/components/pos/waiter/ZReportView";
import ClosedTabsDialog from "@/components/pos/waiter/ClosedTabsDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, ArrowLeftRight, Lock } from "lucide-react";

const IDLE_LOCK_MS = 180_000;
import { useIsMobile } from "@/hooks/use-mobile";


export default function PosWaiter() {
  const { user } = useAuth();
  const { activeCasinoId, activeCasino } = useCasino();
  const isMobile = useIsMobile();

  const { data: shift, isLoading: shiftLoading } = usePosCurrentShift(activeCasinoId, user?.id ?? null);
  const { data: tabs = [], isLoading: tabsLoading } = usePosOpenTabs(activeCasinoId, shift?.id ?? null);

  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [newTabOpen, setNewTabOpen] = useState(false);
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lastZ, setLastZ] = useState<PosZReport | null>(null);
  const [mobileView, setMobileView] = useState<"tabs" | "menu" | "active">("tabs");
  const operator = usePosOperator(activeCasinoId);

  // Idle auto-lock: any touch/key resets the timer; not per item tap.
  useEffect(() => {
    if (!operator) return;
    let timer = window.setTimeout(() => void lockPosOperator(), IDLE_LOCK_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void lockPosOperator(), IDLE_LOCK_MS);
    };
    const evs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      evs.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [operator]);


  if (!activeCasinoId) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Select a casino to start.
      </div>
    );
  }
  if (!operator) {
    return <PinUnlockOverlay casinoId={activeCasinoId} />;
  }
  if (shiftLoading) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!shift) {
    return (
      <div className="p-4 space-y-4">
        {lastZ && (
          <div className="max-w-2xl mx-auto rounded-md border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Last shift · Z-report</h2>
              <Button variant="ghost" size="sm" onClick={() => setLastZ(null)}>Dismiss</Button>
            </div>
            <ZReportView z={lastZ} />
          </div>
        )}
        <OpenShiftCard casinoId={activeCasinoId} userId={user!.id} />
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const handleSelectTab = (id: string) => {
    setActiveTabId(id);
    if (isMobile) setMobileView("menu");
  };

  const handleNewCreated = (id: string) => {
    setActiveTabId(id);
    if (isMobile) setMobileView("menu");
  };

  const segLabel = shift.shift_type === "day" ? "Day" : "Night";

  const ShiftBar = (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border bg-card text-xs">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-semibold">{activeCasino?.name ?? ""}</span>
        <Badge variant="outline" className="font-medium">{segLabel} shift</Badge>
        {shift.handover_from_shift_id && (
          <Badge variant="secondary" className="font-medium">handover</Badge>
        )}
        <span className="text-muted-foreground truncate">
          Opened {fmtDateTime(shift.opened_at)}
        </span>
        <span className="rounded bg-primary/10 text-primary px-2 py-1 font-semibold whitespace-nowrap">
          Active waiter: {operator.full_name}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => void lockPosOperator()} className="gap-1">
          <Lock className="h-4 w-4" /> Switch waiter / Lock
        </Button>
        <span className="text-muted-foreground">
          Opening cash: <span className="font-mono tabular-nums">{formatNumberSpaces(shift.opening_cash)}</span>
        </span>
        <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)} className="gap-1">
          <History className="h-4 w-4" /> History
        </Button>
        <Button size="sm" variant="outline" onClick={() => setHandoverOpen(true)} className="gap-1">
          <ArrowLeftRight className="h-4 w-4" /> Handover
        </Button>
        <Button size="sm" variant="outline" onClick={() => setCloseShiftOpen(true)}>
          Close shift
        </Button>
      </div>
    </div>
  );

  const closeShiftDialog = (
    <CloseShiftDialog
      open={closeShiftOpen}
      onOpenChange={setCloseShiftOpen}
      shift={shift}
      openTabsCount={tabs.length}
      onClosed={(z) => {
        setLastZ(z);
        setActiveTabId(null);
      }}
    />
  );

  const handoverDialog = (
    <HandoverShiftDialog
      open={handoverOpen}
      onOpenChange={setHandoverOpen}
      shift={shift}
      openTabsCount={tabs.length}
      casinoId={activeCasinoId}
    />
  );


  const historyDialog = (
    <ClosedTabsDialog
      open={historyOpen}
      onOpenChange={setHistoryOpen}
      casinoId={activeCasinoId}
      shiftId={shift.id}
    />
  );

  if (isMobile) {
    return (
      <div className="h-full flex flex-col">
        {ShiftBar}
        <Tabs value={mobileView} onValueChange={(v) => setMobileView(v as any)} className="flex-1 flex flex-col">
          <TabsList className="grid grid-cols-3 w-full rounded-none">
            <TabsTrigger value="tabs">Tabs ({tabs.length})</TabsTrigger>
            <TabsTrigger value="menu" disabled={!activeTabId}>Menu</TabsTrigger>
            <TabsTrigger value="active" disabled={!activeTabId}>Active</TabsTrigger>
          </TabsList>
          <TabsContent value="tabs" className="flex-1 m-0">
            <TabsPanel
              tabs={tabs}
              activeTabId={activeTabId}
              onSelect={handleSelectTab}
              onNew={() => setNewTabOpen(true)}
              loading={tabsLoading}
            />
          </TabsContent>
          <TabsContent value="menu" className="flex-1 m-0">
            <MenuPanel casinoId={activeCasinoId} shiftId={shift.id} tabId={activeTabId} userId={user!.id} />
          </TabsContent>
          <TabsContent value="active" className="flex-1 m-0">
            <ActiveTabPanel tab={activeTab} casinoId={activeCasinoId} shiftId={shift.id} userId={user!.id} />
          </TabsContent>
        </Tabs>
        <NewTabDialog
          open={newTabOpen}
          onOpenChange={setNewTabOpen}
          casinoId={activeCasinoId}
          shiftId={shift.id}
          userId={user!.id}
          onCreated={handleNewCreated}
        />
        {closeShiftDialog}
        {handoverDialog}
        {historyDialog}

      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {ShiftBar}
      <div className="flex-1 grid grid-cols-12 min-h-0">
        <div className="col-span-3 border-r border-border min-h-0">
          <TabsPanel
            tabs={tabs}
            activeTabId={activeTabId}
            onSelect={handleSelectTab}
            onNew={() => setNewTabOpen(true)}
            loading={tabsLoading}
          />
        </div>
        <div className="col-span-5 border-r border-border min-h-0">
          <MenuPanel casinoId={activeCasinoId} shiftId={shift.id} tabId={activeTabId} userId={user!.id} />
        </div>
        <div className="col-span-4 min-h-0">
          <ActiveTabPanel tab={activeTab} casinoId={activeCasinoId} shiftId={shift.id} userId={user!.id} />
        </div>
      </div>
      <NewTabDialog
        open={newTabOpen}
        onOpenChange={setNewTabOpen}
        casinoId={activeCasinoId}
        shiftId={shift.id}
        userId={user!.id}
        onCreated={handleNewCreated}
      />
      {closeShiftDialog}
      {handoverDialog}
      {historyDialog}

    </div>
  );
}
