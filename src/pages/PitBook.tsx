/**
 * Pit Book — shift handover chat.
 *
 * Continuous feed (no date picker). Date separators are rendered inline
 * between messages whenever the business_date changes. Posts always go
 * to the current business day.
 *
 * Tabs visible per role:
 *   - pit: only "Pit Bosses"
 *   - manager / shift_manager / finance_manager / surveillance / super_admin: both
 */
import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, BookOpen, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { getBusinessDate } from "@/lib/business-day";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import { fmtDateOnly } from "@/lib/format-date";
import {
  usePitBookEntries,
  useCreatePitBookEntry,
  type PitBookChannel,
  type PitBookEntry,
} from "@/hooks/use-pit-book";
import {
  visiblePitBookChannels,
  canWritePitBook,
  usePitBookUnread,
  useMarkPitBookRead,
} from "@/hooks/use-pit-book-unread";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  shift_manager: "Shift Mgr",
  finance_manager: "Finance",
  pit: "Pit Boss",
  surveillance: "CCTV",
};

const ROLE_CHIP: Record<string, string> = {
  super_admin:     "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300 ring-1 ring-fuchsia-500/30",
  manager:         "bg-sky-500/15 text-sky-600 dark:text-sky-300 ring-1 ring-sky-500/30",
  shift_manager:   "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 ring-1 ring-cyan-500/30",
  finance_manager: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 ring-1 ring-emerald-500/30",
  pit:             "bg-amber-500/20 text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/40",
  surveillance:    "bg-violet-500/15 text-violet-600 dark:text-violet-300 ring-1 ring-violet-500/30",
};
const roleChip = (r: string) =>
  ROLE_CHIP[r] || "bg-muted text-muted-foreground ring-1 ring-border";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function EntryRow({
  entry,
  isOwn,
  observe,
}: {
  entry: PitBookEntry;
  isOwn: boolean;
  observe: (el: HTMLElement | null, entry: PitBookEntry) => void;
}) {
  const roleLabel = ROLE_LABELS[entry.author_role] || entry.author_role;
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    observe(ref.current, entry);
  }, [entry, observe]);

  return (
    <div className={`flex w-full ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        ref={ref}
        data-entry-id={entry.id}
        data-entry-created-at={entry.created_at}
        className="max-w-full text-sm leading-snug break-words text-foreground"
      >
        <span className="text-[11px] font-mono tabular-nums font-bold text-foreground mr-1.5">
          {formatTime(entry.created_at)}
        </span>
        <span
          className={`inline-flex items-center rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide mr-1.5 align-middle ${roleChip(entry.author_role)}`}
        >
          {roleLabel}
        </span>
        <span className="font-semibold mr-1.5">{entry.author_name}:</span>
        <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.body}</span>
      </div>
    </div>
  );
}

function DateDivider({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 my-1">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-2 py-0.5 rounded-full bg-muted/60">
        {fmtDateOnly(date)}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export default function PitBook() {
  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const businessToday = serverBusinessDate || getBusinessDate();
  const { user, roles } = useAuth();

  const visibleChannels = useMemo(() => visiblePitBookChannels(roles), [roles]);
  const [channel, setChannel] = useState<PitBookChannel>(
    visibleChannels[0] ?? "pit_bosses",
  );
  useEffect(() => {
    if (!visibleChannels.includes(channel) && visibleChannels[0]) {
      setChannel(visibleChannels[0]);
    }
  }, [visibleChannels, channel]);

  const [draft, setDraft] = useState("");
  const canWrite = canWritePitBook(roles, channel);

  const { data: entries = [], isLoading } = usePitBookEntries(channel);
  const create = useCreatePitBookEntry();
  const { data: unread } = usePitBookUnread();
  const markRead = useMarkPitBookRead();

  // Auto-scroll feed to bottom on entries change / tab switch.
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries.length, channel]);

  // Reliable read-receipt fallback.
  useEffect(() => {
    if (!user?.id) return;
    if ((unread?.[channel] ?? 0) === 0) return;
    const latest = [...entries]
      .reverse()
      .find((e) => e.author_id !== user.id);
    if (!latest) return;
    markRead.mutate({
      channel,
      entryId: latest.id,
      entryCreatedAt: latest.created_at,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, channel, unread?.[channel], user?.id]);

  // IntersectionObserver-driven read marker.
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pendingRef = useRef<{ id: string; at: string } | null>(null);
  const flushTimer = useRef<number | null>(null);

  const flush = useCallback(() => {
    const p = pendingRef.current;
    pendingRef.current = null;
    if (!p) return;
    markRead.mutate({ channel, entryId: p.id, entryCreatedAt: p.at });
  }, [channel, markRead]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const root = feedRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (records) => {
        for (const rec of records) {
          if (!rec.isIntersecting) continue;
          const el = rec.target as HTMLElement;
          const id = el.dataset.entryId;
          const at = el.dataset.entryCreatedAt;
          if (!id || !at) continue;
          const cur = pendingRef.current;
          if (!cur || at > cur.at) pendingRef.current = { id, at };
        }
        if (pendingRef.current) {
          if (flushTimer.current) window.clearTimeout(flushTimer.current);
          flushTimer.current = window.setTimeout(flush, 400);
        }
      },
      { root, threshold: 0.6 },
    );
    observerRef.current = obs;
    return () => {
      obs.disconnect();
      observerRef.current = null;
      if (flushTimer.current) window.clearTimeout(flushTimer.current);
    };
  }, [flush, channel]);

  const observe = useCallback(
    (el: HTMLElement | null, entry: PitBookEntry) => {
      if (!el) return;
      if (entry.author_id === user?.id) return;
      observerRef.current?.observe(el);
    },
    [user?.id],
  );

  const handleSend = async () => {
    const body = draft.trim();
    if (!body) return;
    try {
      await create.mutateAsync({ channel, business_date: businessToday, body });
      setDraft("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to post entry");
    }
  };

  // Build feed with date dividers.
  const feed = useMemo(() => {
    const out: Array<
      | { kind: "date"; date: string; key: string }
      | { kind: "entry"; entry: PitBookEntry }
    > = [];
    let lastDate: string | null = null;
    for (const e of entries) {
      if (e.business_date !== lastDate) {
        out.push({ kind: "date", date: e.business_date, key: `d-${e.business_date}-${e.id}` });
        lastDate = e.business_date;
      }
      out.push({ kind: "entry", entry: e });
    }
    return out;
  }, [entries]);

  return (
    <PageShell>
      <PageHeader
        icon={BookOpen}
        title="Pit Book"
        subtitle="Shift handover log — append-only journal."
      />

      <PageSection card={false}>
        <div className="rounded-md border border-border bg-card p-3">
        {visibleChannels.length > 1 && (
          <Tabs
            value={channel}
            onValueChange={(v) => setChannel(v as PitBookChannel)}
          >
            <TabsList className="grid w-full max-w-md grid-cols-2">
              {visibleChannels.map((c) => {
                const count = unread?.[c] ?? 0;
                return (
                  <TabsTrigger
                    key={c}
                    value={c}
                    className={count > 0 ? "relative data-[state=inactive]:bg-primary/20 data-[state=inactive]:text-foreground" : "relative"}
                  >
                    {c === "pit_bosses" ? "Pit Bosses" : "Managers"}
                    {count > 0 && (
                      <span className="ml-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                        {count}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        )}

        <div
          ref={feedRef}
          className="mt-3 flex flex-col gap-2 overflow-y-auto rounded-md bg-background/45 p-3"
          style={{ maxHeight: "calc(100vh - 290px)", minHeight: 260, WebkitOverflowScrolling: "touch" }}
        >
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-6">
              Loading…
            </div>
          ) : feed.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-6">
              No entries yet.
            </div>
          ) : (
            feed.map((item) =>
              item.kind === "date" ? (
                <DateDivider key={item.key} date={item.date} />
              ) : (
                <EntryRow
                  key={item.entry.id}
                  entry={item.entry}
                  isOwn={item.entry.author_id === user?.id}
                  observe={observe}
                />
              ),
            )
          )}
        </div>

        {canWrite ? (
          <div className="mt-3 flex flex-col gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (
                  (e.metaKey || e.ctrlKey) &&
                  e.key === "Enter" &&
                  !create.isPending
                ) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                channel === "pit_bosses"
                  ? "Note an event, table issue, hand-over for the next shift…"
                  : "Manager-level note, decision, escalation…"
              }
              rows={3}
              className="resize-none"
            />
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                ⌘/Ctrl + Enter to post · entries are permanent
              </div>
              <Button
                onClick={handleSend}
                disabled={!draft.trim() || create.isPending}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                Post
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            <ShieldAlert className="h-4 w-4" />
            Read-only access for this channel.
          </div>
        )}
        </div>
      </PageSection>
    </PageShell>
  );
}
