/**
 * Pit Book — shift handover journal.
 *
 * Two channels: 'pit_bosses' and 'managers'. Entries are immutable
 * (append-only); corrections are added as new posts. All authorised roles
 * (pit, shift_manager, manager, surveillance, super_admin) can READ any
 * date; writers exclude surveillance.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { liveQueryOptions } from "@/lib/live-query-options";

export type PitBookChannel = "pit_bosses" | "managers";

export interface PitBookEntry {
  id: string;
  casino_id: string;
  business_date: string;
  channel: PitBookChannel;
  author_id: string;
  author_name: string;
  author_role: string;
  body: string;
  created_at: string;
}

const queryKey = (casinoId: string | null, channel: PitBookChannel) =>
  ["pit_book", casinoId, channel] as const;

const FEED_LIMIT = 500;

export function usePitBookEntries(channel: PitBookChannel) {
  const { casinoId } = useAuth();

  return useQuery({
    queryKey: queryKey(casinoId, channel),
    enabled: !!casinoId,
    queryFn: async (): Promise<PitBookEntry[]> => {
      const { data, error } = await supabase
        .from("pit_book_entries" as any)
        .select("*")
        .eq("casino_id", casinoId!)
        .eq("channel", channel)
        .order("created_at", { ascending: false })
        .limit(FEED_LIMIT);
      if (error) throw error;
      return ((data ?? []) as unknown as PitBookEntry[]).slice().reverse();
    },
    // Realtime: `pit_book_entries` subscribed via useModuleLiveSync (pit_book).
    ...liveQueryOptions(),
  });
}

export function useCreatePitBookEntry() {
  const { casinoId, user, displayName, roles } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      channel: PitBookChannel;
      business_date: string;
      body: string;
    }) => {
      if (!casinoId || !user) throw new Error("Not signed in");
      const body = input.body.trim();
      if (!body) throw new Error("Empty message");
      // Pick the most relevant role for display.
      const ROLE_PRIORITY = [
        "super_admin",
        "manager",
        "shift_manager",
        "finance_manager",
        "pit",
        "surveillance",
      ];
      const role =
        ROLE_PRIORITY.find((r) => roles.includes(r as any)) ?? roles[0] ?? "user";
      const { data, error } = await supabase
        .from("pit_book_entries" as any)
        .insert({
          casino_id: casinoId,
          business_date: input.business_date,
          channel: input.channel,
          author_id: user.id,
          author_name: (displayName && displayName.trim()) || "—",
          author_role: role,
          body,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as PitBookEntry;
    },
    onSuccess: (entry) => {
      qc.invalidateQueries({
        queryKey: queryKey(casinoId, entry.channel),
      });
    },
  });
}
