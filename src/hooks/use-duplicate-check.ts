import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { DuplicateStatus, DuplicateMatch } from "@/components/registration/DuplicateCheckResult";

/**
 * Computes a simple similarity score between two strings (0-1).
 * Uses Dice coefficient on bigrams for fuzzy matching.
 */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;

  const bigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };

  const b1 = bigrams(s1);
  const b2 = bigrams(s2);
  let intersection = 0;
  b1.forEach(bg => { if (b2.has(bg)) intersection++; });
  return (2 * intersection) / (b1.size + b2.size);
}

const NAME_SIMILARITY_THRESHOLD = 0.75;

export function useDuplicateCheck() {
  const [status, setStatus] = useState<DuplicateStatus>("idle");
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);

  const checkDuplicates = useCallback(
    async (fields: {
      id_number?: string;
      first_name: string;
      last_name: string;
      phone?: string;
    }) => {
      setStatus("checking");
      setMatches([]);

      try {
        const foundMatches: DuplicateMatch[] = [];

        // PRIMARY: exact document number match (CROSS-CASINO)
        if (fields.id_number?.trim()) {
          const { data: docMatches } = await supabase
            .from("players")
            .select("id, first_name, last_name, nickname, photo_url, id_number, casino_id")
            .eq("id_number", fields.id_number.trim())
            .eq("is_ace_auto", false);

          if (docMatches && docMatches.length > 0) {
            for (const p of docMatches) {
              foundMatches.push({
                id: p.id,
                first_name: p.first_name,
                last_name: p.last_name,
                nickname: p.nickname || undefined,
                photo_url: p.photo_url,
                match_type: "document",
              });
            }
            setMatches(foundMatches);
            setStatus("blocked");
            return;
          }
        }

        // SECONDARY: name similarity (CROSS-CASINO)
        const fullName = `${fields.first_name} ${fields.last_name}`.trim();
        if (fullName) {
          const { data: allPlayers } = await supabase
            .from("players")
            .select("id, first_name, last_name, nickname, photo_url, phone, casino_id")
            .eq("is_ace_auto", false)
            .limit(500);

          if (allPlayers) {
            for (const p of allPlayers) {
              const existingName = `${p.first_name} ${p.last_name}`;
              const nameSim = similarity(fullName, existingName);

              if (nameSim >= NAME_SIMILARITY_THRESHOLD) {
                foundMatches.push({
                  id: p.id,
                  first_name: p.first_name,
                  last_name: p.last_name,
                  nickname: p.nickname || undefined,
                  photo_url: p.photo_url,
                  match_type: "name",
                  similarity: nameSim,
                });
              }

              // Phone match
              if (
                fields.phone?.trim() &&
                p.phone?.trim() &&
                fields.phone.trim() === p.phone.trim()
              ) {
                const alreadyAdded = foundMatches.some(m => m.id === p.id);
                if (!alreadyAdded) {
                  foundMatches.push({
                    id: p.id,
                    first_name: p.first_name,
                    last_name: p.last_name,
                    nickname: p.nickname || undefined,
                    photo_url: p.photo_url,
                    match_type: "phone",
                  });
                }
              }
            }
          }
        }

        if (foundMatches.length > 0) {
          setMatches(foundMatches);
          setStatus("warning");
        } else {
          setMatches([]);
          setStatus("ok");
        }
      } catch (err) {
        console.error("Duplicate check error:", err);
        // Don't block registration on check failure
        setStatus("ok");
      }
    },
    []
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setMatches([]);
  }, []);

  return { status, matches, checkDuplicates, reset };
}
