/**
 * Pit Book — shift handover log.
 *
 * Two channels (tabs): Pit Bosses and Managers.
 * Inline chat-like feed for the selected business date.
 * Entries are immutable; corrections = new entries.
 *
 * Roles:
 *   READ:  pit, shift_manager, manager, surveillance, super_admin
 *   WRITE: pit, shift_manager, manager, super_admin (surveillance read-only)
 */
import { useMemo, useRef, useState, useEffect } from "react";
import { PageShell, PageSection } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { DateNavigator } from "@/components/ui/date-navigator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Send, BookOpen, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { getBusinessDate } from "@/lib/business-day";
import { useEffectiveBusinessDate } from "@/hooks/use-business-day-closure";
import {
  usePitBookEntries,
  useCreatePitBookEntry,
  type PitBookChannel,
  type PitBookEntry,
} from "@/hooks/use-pit-book";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  shift_manager: "Shift Manager",
  pit: "Pit Boss",
  surveillance: "CCTV",
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  manager: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  shift_manager: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  pit: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  surveillance: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function EntryRow({ entry, isOwn }: { entry: PitBookEntry; isOwn: boolean }) {
  const roleLabel = ROLE_LABELS[entry.author_role] || entry.author_role;
  const roleColor =
    ROLE_COLORS[entry.author_role] || "bg-muted text-muted-foreground";
  return (
    <div
      className={`flex flex-col gap-1 rounded-md border p-3 ${
        isOwn ? "bg-primary/5 border-primary/30" : "bg-card border-border"
      }`}
    >
      <div className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold truncate">{entry.author_name}</span>
          <Badge variant="secondary" className={`text-[10px] ${roleColor}`}>
            {roleLabel}
          </Badge>
        </div>
        <span className="text-muted-foreground tabular-nums shrink-0">
          {formatTime(entry.created_at)}
        </span>
      </div>
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {entry.body}
      </div>
    </div>
  );
}

export default function PitBook() {
  const { data: serverBusinessDate } = useEffectiveBusinessDate();
  const businessToday = serverBusinessDate || getBusinessDate();
  const [date, setDate] = useState(businessToday);
  const [channel, setChannel] = useState<PitBookChannel>("pit_bosses");
  const [draft, setDraft] = useState("");
  const { user, roles } = useAuth();

  const canWrite = useMemo(
    () =>
      roles.some((r) =>
        ["super_admin", "manager", "shift_manager", "pit"].includes(r),
      ),
    [roles],
  );
  const isToday = date === businessToday;

  const { data: entries = [], isLoading } = usePitBookEntries(channel, date);
  const create = useCreatePitBookEntry();

  // Auto-scroll feed to bottom on entries change.
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries.length, channel, date]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body) return;
    try {
      await create.mutateAsync({ channel, business_date: date, body });
      setDraft("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to post entry");
    }
  };

  return (
    <PageShell>
      <PageHeader
        icon={BookOpen}
        title="Pit Book"
        subtitle="Shift handover log — append-only journal for pit bosses and managers."
      >
        <DateNavigator
          value={date}
          onChange={setDate}
          maxDate={new Date(businessToday)}
        />
      </PageHeader>

      <PageSection>
        <Tabs
          value={channel}
          onValueChange={(v) => setChannel(v as PitBookChannel)}
        >
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="pit_bosses">Pit Bosses</TabsTrigger>
            <TabsTrigger value="managers">Managers</TabsTrigger>
          </TabsList>
        </Tabs>

        <div
          ref={feedRef}
          className="mt-4 flex flex-col gap-2 overflow-y-auto rounded-md border border-border bg-background/40 p-3"
          style={{ maxHeight: "calc(100vh - 340px)", minHeight: 240 }}
        >
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-6">
              Loading…
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-6">
              No entries for this date yet.
            </div>
          ) : (
            entries.map((e) => (
              <EntryRow key={e.id} entry={e} isOwn={e.author_id === user?.id} />
            ))
          )}
        </div>

        {canWrite ? (
          isToday ? (
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
              Read-only — new entries can only be posted for the current
              business day ({businessToday}).
            </div>
          )
        ) : (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            <ShieldAlert className="h-4 w-4" />
            Read-only access.
          </div>
        )}
      </PageSection>
    </PageShell>
  );
}
