import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format-date";
import { usePlayerNotes, useCreatePlayerNote } from "@/hooks/use-player-profile";
import { useAuth } from "@/lib/auth-context";

const POSTER_ROLES = ["pit", "manager", "shift_manager", "surveillance", "super_admin", "reception"];

interface Props {
  playerId: string;
  /** Override the default poster-role gate */
  canPost?: boolean;
  /** When true, fetches notes itself. When false, expects notes prop. */
  selfFetch?: boolean;
  notes?: any[];
}

export const PlayerNotesPanel = ({ playerId, canPost, selfFetch = true, notes: notesProp }: Props) => {
  const { roles } = useAuth();
  const allowPost = canPost ?? roles.some((r) => POSTER_ROLES.includes(r));

  const fetched = usePlayerNotes(playerId, selfFetch);
  const notes = selfFetch ? (fetched.data ?? []) : (notesProp ?? []);

  const [text, setText] = useState("");
  const create = useCreatePlayerNote();
  const submit = async () => {
    if (!text.trim()) return;
    await create.mutateAsync({ player_id: playerId, content: text });
    setText("");
  };

  return (
    <div className="space-y-3">
      {allowPost && (
        <div className="flex items-start gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Write a note about this player… (⌘/Ctrl+Enter to post)"
            rows={2}
            className="text-sm resize-none bg-background flex-1"
          />
          <Button
            size="sm"
            onClick={submit}
            disabled={!text.trim() || create.isPending}
            className="shrink-0"
          >
            {create.isPending ? "Posting…" : "Post"}
          </Button>
        </div>
      )}
      {notes.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No notes yet.</div>
      ) : (
        <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
          {notes.map((n: any) => (
            <div
              key={n.id}
              className="text-sm px-2.5 py-1.5 rounded bg-muted/40 border border-border border-l-2 border-l-primary"
            >
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-muted-foreground mb-0.5">
                <span>{n.note_type || "info"}</span>
                <span className="opacity-60">·</span>
                <span>{fmtDateTime(n.created_at)}</span>
              </div>
              <div className="text-card-foreground whitespace-pre-wrap leading-snug">{n.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlayerNotesPanel;
