import { useEffect, useState } from "react";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { getBusinessDate, nowEAT } from "@/lib/business-day";
import { useCanCloseBusinessDay } from "@/components/pit/CloseBusinessDayButton";

/**
 * Reminder: from 10:00 EAT onwards, managers must be told that YESTERDAY's
 * business day is still open.
 *
 * The day is considered unclosed when the currently OPEN business date
 * (business_day_closures-aware, via the RPC) is older than the business date
 * the clock says we should already be on.
 *
 * Snooze is deliberately short-lived (30 minutes, per tab) — the reminder must
 * come back until the day is actually closed.
 */
const REMIND_FROM_HOUR = 10;
const SNOOZE_MS = 30 * 60 * 1000;
const SNOOZE_KEY = "cms.unclosedDay.snoozeUntil";

function readSnooze(): number {
  try {
    return Number(sessionStorage.getItem(SNOOZE_KEY) || 0);
  } catch {
    return 0;
  }
}

export function useUnclosedDayReminder() {
  const canClose = useCanCloseBusinessDay();
  const { data: openBusinessDate } = useEffectiveBusinessDate();
  const [tick, setTick] = useState(0);
  const [snoozedUntil, setSnoozedUntil] = useState<number>(() => readSnooze());

  // Re-evaluate every minute so the banner appears exactly at 10:00 and
  // reappears when the snooze runs out — without a page reload.
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const snooze = () => {
    const until = Date.now() + SNOOZE_MS;
    try { sessionStorage.setItem(SNOOZE_KEY, String(until)); } catch { /* ignore */ }
    setSnoozedUntil(until);
  };

  const expectedDate = getBusinessDate();
  const isStale = !!openBusinessDate && openBusinessDate < expectedDate;
  const pastReminderHour = nowEAT().getHours() >= REMIND_FROM_HOUR;
  const snoozing = snoozedUntil > Date.now();

  void tick; // keeps the minute-timer meaningful for the memo-free computation

  return {
    show: canClose && isStale && pastReminderHour && !snoozing,
    businessDate: openBusinessDate ?? null,
    snooze,
  };
}
