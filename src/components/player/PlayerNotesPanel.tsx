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
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a note about this player…"
            rows={2}
            className="text-sm resize-none"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={!text.trim() || create.isPending}>
              Post Note
            </Button>
          </div>
        </div>
      )}
      {notes.length === 0 ? (
        <div className="text-sm text-muted-foreground">No notes yet.</div>
      ) : (
        <div className="space-y-2 max-h-[320px] overflow-y-auto">
          {notes.map((n: any) => (
            <div
              key={n.id}
              className="text-xs p-2 rounded bg-muted/40 border border-border border-l-2 border-l-primary"
            >
              <div className="text-[9px] font-mono uppercase text-muted-foreground">{n.note_type || "info"}</div>
              <div className="text-card-foreground mt-0.5 whitespace-pre-wrap">{n.content}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{fmtDateTime(n.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PlayerNotesPanel;
