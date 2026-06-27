/**
 * Pit Book unread tracker.
 *
 * Per-user, per-casino, per-channel "last_read_entry_id" marker.
 * Unread = entries newer than the marker AND not authored by the user.
 * Pit role only sees pit_bosses → unread for managers channel always 0 for them.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type PitBookChannel = "pit_bosses" | "managers";

export interface PitBookUnread {
  pit_bosses: number;
  managers: number;
  total: number;
}

const QK = (casinoId: string | null, userId: string | null) =>
  ["pit-book-unread", casinoId, userId] as const;

function channelsForRoles(roles: string[]): PitBookChannel[] {
  const out: PitBookChannel[] = [];
  if (roles.length === 0) return out;
  // pit_bosses: pit + managers + cctv + super_admin + finance_manager
  if (roles.some((r) =>
    ["pit", "manager", "shift_manager", "finance_manager", "surveillance", "super_admin"].includes(r)
  )) {
    out.push("pit_bosses");
  }
  // managers tab: NOT pit
  if (roles.some((r) =>
    ["manager", "shift_manager", "finance_manager", "surveillance", "super_admin"].includes(r)
  )) {
    out.push("managers");
  }
  return out;
}

export function visiblePitBookChannels(roles: string[]): PitBookChannel[] {
  return channelsForRoles(roles);
}

export function canWritePitBook(roles: string[], channel: PitBookChannel): boolean {
  if (channel === "pit_bosses") {
    return roles.some((r) =>
      ["pit", "manager", "shift_manager", "finance_manager", "surveillance", "super_admin"].includes(r)
    );
  }
  return roles.some((r) =>
    ["manager", "shift_manager", "finance_manager", "surveillance", "super_admin"].includes(r)
  );
}

export function usePitBookUnread() {
  const { casinoId, user, roles } = useAuth();
  const qc = useQueryClient();
  const channels = useMemo(() => channelsForRoles(roles), [roles]);

  // Realtime: invalidate unread on any new entry in this casino.
  useEffect(() => {
    if (!casinoId) return;
    const ch = supabase
      .channel(`pit_book_unread:${casinoId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pit_book_entries",
          filter: `casino_id=eq.${casinoId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: QK(casinoId, user?.id ?? null) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [casinoId, user?.id, qc]);

  return useQuery({
    queryKey: QK(casinoId, user?.id ?? null),
    enabled: !!casinoId && !!user && channels.length > 0,
    staleTime: 10_000,
    queryFn: async (): Promise<PitBookUnread> => {
      // Load read markers
      const { data: readsRaw } = await supabase
        .from("pit_book_reads" as any)
        .select("channel,last_read_at,last_read_entry_id")
        .eq("user_id", user!.id)
        .eq("casino_id", casinoId!);
      const reads = ((readsRaw ?? []) as unknown) as Array<{
        channel: PitBookChannel;
        last_read_at: string | null;
        last_read_entry_id: string | null;
      }>;
      const readMap = new Map<PitBookChannel, string | null>();
      reads.forEach((r) => readMap.set(r.channel, r.last_read_at));

      const result: PitBookUnread = { pit_bosses: 0, managers: 0, total: 0 };
      for (const ch of channels) {
        const since = readMap.get(ch);
        let q = supabase
          .from("pit_book_entries" as any)
          .select("id", { count: "exact", head: true })
          .eq("casino_id", casinoId!)
          .eq("channel", ch)
          .neq("author_id", user!.id);
        if (since) q = q.gt("created_at", since);
        const { count } = await q;
        result[ch] = count ?? 0;
      }
      result.total = result.pit_bosses + result.managers;
      return result;
    },
  });
}

export function useMarkPitBookRead() {
  const { casinoId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { channel: PitBookChannel; entryId: string; entryCreatedAt: string }) => {
      if (!casinoId || !user) return;
      // Upsert by (user_id, casino_id, channel). Only bump forward.
      const { data: existing } = await supabase
        .from("pit_book_reads" as any)
        .select("id,last_read_at")
        .eq("user_id", user.id)
        .eq("casino_id", casinoId)
        .eq("channel", input.channel)
        .maybeSingle();
      const exRow = existing as { id: string; last_read_at: string | null } | null;
      if (exRow && exRow.last_read_at && exRow.last_read_at >= input.entryCreatedAt) {
        return; // already ahead
      }
      const payload = {
        user_id: user.id,
        casino_id: casinoId,
        channel: input.channel,
        last_read_entry_id: input.entryId,
        last_read_at: input.entryCreatedAt,
        updated_at: new Date().toISOString(),
      };
      if (exRow) {
        await supabase.from("pit_book_reads" as any).update(payload).eq("id", exRow.id);
      } else {
        await supabase.from("pit_book_reads" as any).insert(payload);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pit-book-unread", casinoId, user?.id] });
    },
  });
}
