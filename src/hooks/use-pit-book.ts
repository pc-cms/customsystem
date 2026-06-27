/**
 * Pit Book — shift handover journal.
 *
 * Two channels: 'pit_bosses' and 'managers'. Entries are immutable
 * (append-only); corrections are added as new posts. All authorised roles
 * (pit, shift_manager, manager, surveillance, super_admin) can READ any
 * date; writers exclude surveillance.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

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

const queryKey = (casinoId: string | null, channel: PitBookChannel, date: string) =>
  ["pit_book", casinoId, channel, date] as const;

export function usePitBookEntries(channel: PitBookChannel, businessDate: string) {
  const { casinoId } = useAuth();
  const qc = useQueryClient();

  // Realtime invalidation for this channel/date.
  useEffect(() => {
    if (!casinoId) return;
    const ch = supabase
      .channel(`pit_book:${casinoId}:${channel}:${businessDate}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pit_book_entries",
          filter: `casino_id=eq.${casinoId}`,
        },
        (payload: any) => {
          const row = payload?.new;
          if (!row) return;
          if (row.channel !== channel || row.business_date !== businessDate) return;
          qc.invalidateQueries({ queryKey: queryKey(casinoId, channel, businessDate) });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [casinoId, channel, businessDate, qc]);

  return useQuery({
    queryKey: queryKey(casinoId, channel, businessDate),
    enabled: !!casinoId,
    queryFn: async (): Promise<PitBookEntry[]> => {
      const { data, error } = await supabase
        .from("pit_book_entries" as any)
        .select("*")
        .eq("casino_id", casinoId!)
        .eq("channel", channel)
        .eq("business_date", businessDate)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PitBookEntry[];
    },
    staleTime: 15_000,
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
          author_name: displayName || user.email || "—",
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
        queryKey: queryKey(casinoId, entry.channel, entry.business_date),
      });
    },
  });
}
