/**
 * useModuleLiveSync — Фаза A "Realtime-first".
 *
 * После логина монтирует Postgres Changes каналы на все таблицы,
 * относящиеся к разрешённым пользователю модулям (см. MODULE_LIVE_SPEC).
 * Событие INSERT/UPDATE/DELETE → invalidateQueries по префиксам.
 *
 * Это заменяет "тройной F5" (refetchOnMount/Focus/Reconnect в хуках):
 * запросы, помеченные `liveQueryOptions()`, живут вечно в кэше и
 * обновляются только на реальное событие БД.
 *
 * Инвалидация дебаунсится по (table, prefix) — если приходит серия
 * событий (bulk update), сделаем один invalidate.
 */
import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMyModulePermissions } from "@/hooks/use-module-permissions";
import { MODULE_LIVE_SPEC, ALWAYS_LIVE, type LiveTableSpec } from "@/lib/module-live-spec";
import type { ModuleKey } from "@/lib/modules";

const INVALIDATE_DEBOUNCE_MS = 250;

const allSpecKeys = Object.keys(MODULE_LIVE_SPEC) as ModuleKey[];

export function useModuleLiveSync() {
  const qc = useQueryClient();
  const { user, casinoId, roles } = useAuth();
  const { data: allowedModules } = useMyModulePermissions();

  // Стабильная строка ключей, чтобы useMemo пересчитывался только при
  // реальном изменении набора разрешённых модулей.
  const moduleKey = useMemo(() => {
    if (allowedModules === undefined) return null;
    const isSuperAdmin = roles.includes("super_admin");
    const set = isSuperAdmin ? new Set<string>(allSpecKeys) : allowedModules;
    return Array.from(set).sort().join(",");
  }, [allowedModules, roles]);

  const pendingRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!user || !casinoId || moduleKey === null) return;

    // Собираем уникальный список таблиц и их префиксов.
    // Один канал per (table, casino) — несколько модулей могут делить таблицу.
    const tableSpecs = new Map<string, Set<string>>();

    const push = (spec: LiveTableSpec) => {
      const existing = tableSpecs.get(spec.table) ?? new Set<string>();
      spec.queryKeyPrefixes.forEach((p) => existing.add(p));
      tableSpecs.set(spec.table, existing);
    };

    ALWAYS_LIVE.forEach(push);

    const isSuperAdmin = roles.includes("super_admin");
    const modules = isSuperAdmin ? new Set<string>(allSpecKeys) : (allowedModules ?? new Set<string>());
    for (const m of modules) {
      const specs = MODULE_LIVE_SPEC[m as ModuleKey];
      if (specs) specs.forEach(push);
    }

    const invalidatePrefix = (prefix: string) => {
      const key = prefix;
      const existing = pendingRef.current.get(key);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        pendingRef.current.delete(key);
        qc.invalidateQueries({
          predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === prefix,
        });
      }, INVALIDATE_DEBOUNCE_MS);
      pendingRef.current.set(key, t);
    };

    const channels: ReturnType<typeof supabase.channel>[] = [];

    // Таблицы, у которых нет колонки casino_id — фильтр по ней невалиден и
    // блокирует все события. Их подписываем без фильтра.
    const TABLES_WITHOUT_CASINO_ID = new Set<string>([
      "player_tags",
      "player_cards",
      "group_members",
      "player_groups",
      "fin_categories",
      "rota_locks",
    ]);

    for (const [table, prefixes] of tableSpecs) {
      const channelName = `live:${table}:${casinoId}`;
      const useCasinoFilter = !TABLES_WITHOUT_CASINO_ID.has(table);
      // Реконсиляционный invalidate на КАЖДЫЙ переход в SUBSCRIBED кроме первого
      // (первичная подписка после mount не должна триггерить лавину refetch,
      //  но переподписка после разрыва — должна восстановить согласованность).
      let subscribedOnce = false;
      const ch = supabase
        .channel(channelName)
        .on(
          "postgres_changes" as any,
          {
            event: "*",
            schema: "public",
            table,
            ...(useCasinoFilter ? { filter: `casino_id=eq.${casinoId}` } : {}),
          },
          () => {
            prefixes.forEach(invalidatePrefix);
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (subscribedOnce) {
              // reconnect → dropped events may have occurred, reconcile.
              prefixes.forEach(invalidatePrefix);
            }
            subscribedOnce = true;
          }
        });
      channels.push(ch);
    }


    return () => {
      pendingRef.current.forEach((t) => clearTimeout(t));
      pendingRef.current.clear();
      channels.forEach((ch) => {
        try { supabase.removeChannel(ch); } catch { /* noop */ }
      });
    };
  }, [user, casinoId, moduleKey, allowedModules, roles, qc]);
}
