/**
 * Casino context — resolves current casino from subdomain or user profile.
 * 
 * Subdomain routing:
 *   arusha.casinosystem.app → slug = "arusha"
 *   dodoma.casinosystem.app → slug = "dodoma"
 *   localhost / IP → fallback to user's primary casino
 * 
 * For super_admin/finance_manager accessing summary.casinosystem.app → casinoId = null (all casinos)
 */

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getCachedRuntimeConfig } from "@/lib/runtime-config";
import { clearIDBPersistedQueryCache } from "@/lib/query-persister";
import { clearBlacklistCache } from "@/lib/blacklist-cache";

type CasinoInfo = {
  id: string;
  name: string;
  slug: string | null;
  code: string;
};

type CasinoContextState = {
  /** Current active casino (null = summary/all-casinos mode) */
  activeCasinoId: string | null;
  activeCasino: CasinoInfo | null;
  /** All casinos the user has access to */
  accessibleCasinos: CasinoInfo[];
  /** Whether the user is in summary mode (FM/super_admin viewing all) */
  isSummaryMode: boolean;
  /** Switch to a different casino */
  switchCasino: (casinoId: string | null) => void | Promise<void>;
  /** Detected slug from subdomain */
  detectedSlug: string | null;
  loading: boolean;
};

const CasinoContext = createContext<CasinoContextState | null>(null);

export const useCasino = () => {
  const ctx = useContext(CasinoContext);
  if (!ctx) throw new Error("useCasino must be within CasinoProvider");
  return ctx;
};

/** Get the base domain for constructing subdomain URLs */
export const getBaseDomain = (): string => {
  const hostname = window.location.hostname;
  // Match any subdomain or root of casinosystem.lovable.app / casinosystem.app / casinosystem.local
  const m = hostname.match(/(casinosystem\.lovable\.app|casinosystem\.app|casinosystem\.local)$/i);
  if (m) return m[1];
  return "casinosystem.app"; // fallback
};

/**
 * On-prem subdomain aliases.
 * The 3-letter codes (mwz/aru/dod/mbi) are the public DNS names of LOCAL servers
 * (e.g. mwz.casinosystem.app → physical box in Mwanza). They resolve to the same
 * canonical casino as the Cloud subdomains (mwanza/arusha/dodoma/mbeya), so all
 * existing data isolation, RLS and casino matching continue to work unchanged.
 */
export const ONPREM_SLUG_ALIASES: Record<string, string> = {
  mwz: "mwanza",
  aru: "arusha",
  dod: "dodoma",
  mbi: "mbeya",
};

const LOCAL_HOST_SLUG_ALIASES: Record<string, string> = {
  arusha: "arusha",
  arucms: "arusha",
  mwanza: "mwanza",
  mwzcms: "mwanza",
  dodoma: "dodoma",
  dodcms: "dodoma",
  mbeya: "mbeya",
  mbicms: "mbeya",
};

/** Normalize a raw slug through the on-prem alias table. */
export const resolveSlugAlias = (raw: string): string =>
  ONPREM_SLUG_ALIASES[raw] ?? raw;

/** Extract casino slug from current hostname */
export const getSlugFromHostname = (): string | null => {
  // On-prem local install: runtime-config.json pins this server to ONE casino
  // regardless of hostname. Works for IP / arucms.local / any custom name.
  // Cloud builds get a placeholder which cleanValue() turns into null, so this
  // branch is silently skipped in production.
  const rc = getCachedRuntimeConfig();
  const runtimeSlug = rc?.casinoSlug?.toLowerCase() ?? null;
  if (runtimeSlug && runtimeSlug !== "local") return resolveSlugAlias(runtimeSlug);

  const hostname = window.location.hostname;

  // On-prem fallback when runtime-config was left with the default slug `local`:
  // arusha.local / arucms.local should still resolve to the Arusha casino, not
  // query `casinos.slug = local` and leave the app on Loading CMS.
  const localMatch = hostname.match(/^([a-z0-9-]+)\.local$/i);
  if (localMatch) {
    const localSlug = LOCAL_HOST_SLUG_ALIASES[localMatch[1].toLowerCase()];
    if (localSlug) return localSlug;
  }

  // Production: arusha.casinosystem.app / mwz.casinosystem.app / etc.
  const match = hostname.match(/^([a-z0-9-]+)\.(casinosystem\.app|casinosystem\.lovable\.app|casinosystem\.local)$/i);
  if (match) {
    const slug = match[1].toLowerCase();
    // Exclude known non-casino subdomains
    if (["www", "api", "admin"].includes(slug)) return null;
    if (slug === "club") return "__club__";
    if (slug === "premier") return "__premier__";
    return resolveSlugAlias(slug);
  }

  // Root domain (no subdomain) → landing page
  if (/^(www\.)?casinosystem\.(app|lovable\.app|local)$/i.test(hostname)) {
    return "__landing__";
  }

  // Preview/dev: check query param ?casino=arusha as fallback
  const params = new URLSearchParams(window.location.search);
  const casinoParam = params.get("casino");
  if (casinoParam) return resolveSlugAlias(casinoParam.toLowerCase());

  // Localhost / IP — no subdomain, use user's primary casino
  return null;
};

/** Raw subdomain label (e.g. "mwz") before alias resolution — for UI badges only. */
export const getRawSubdomainLabel = (): string | null => {
  const rc = getCachedRuntimeConfig();
  if (rc?.casinoSlug) return rc.casinoSlug.toLowerCase();
  const hostname = window.location.hostname;
  const match = hostname.match(/^([a-z0-9-]+)\.(casinosystem\.app|casinosystem\.lovable\.app|casinosystem\.local)$/i);
  return match ? match[1].toLowerCase() : null;
};

export const CasinoProvider = ({ children }: { children: ReactNode }) => {
  const { user, roles, casinoId: authCasinoId, primaryCasinoId, overrideCasinoId } = useAuth();
  const [accessibleCasinos, setAccessibleCasinos] = useState<CasinoInfo[]>([]);
  const [activeCasinoId, setActiveCasinoId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detectedSlug] = useState<string | null>(() => getSlugFromHostname());
  const [subdomainCasino, setSubdomainCasino] = useState<CasinoInfo | null>(null);

  const isSuperOrFM = roles.includes("super_admin") || roles.includes("finance_manager");
  const isSurveillance = roles.includes("surveillance");
  const isBoss = roles.includes("boss");
  const isGM = roles.includes("general_manager");
  // Network accounts: work identically on EVERY subdomain. There is no "home casino"
  // notion for them — the subdomain dictates the active casino, RLS grants the data.
  const hasGlobalAccess = isSuperOrFM || isSurveillance || isBoss || isGM;
  const isSummaryMode = detectedSlug === "__premier__" && (isSuperOrFM || isBoss || isGM);


  // Resolve subdomain slug → casino regardless of user access list.
  // This guarantees that on `mwanza.casinosystem.app` the active casino is ALWAYS
  // Mwanza, never silently falling back to the user's primary casino on another site.
  // RLS will block users without proper access — but we never show cross-casino data.
  useEffect(() => {
    if (!detectedSlug || detectedSlug === "__premier__" || detectedSlug === "__landing__" || detectedSlug === "__club__") {
      setSubdomainCasino(null);
      return;
    }
    // Wait for the user session before hitting `casinos` (RLS-gated). Without
    // this guard, an incognito cold-start fires this query before the access
    // token is attached → RLS returns nothing → activeCasinoId stays null →
    // every per-casino hook returns empty for the rest of the session.
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("casinos")
        .select("id, name, slug, code")
        .eq("slug", detectedSlug)
        .maybeSingle();
      setSubdomainCasino((data as CasinoInfo) ?? null);
    })();
  }, [detectedSlug, user]);

  // Fetch accessible casinos
  useEffect(() => {
    if (!user) {
      setAccessibleCasinos([]);
      setActiveCasinoId(null);
      setLoading(false);
      return;
    }

    const fetchCasinos = async () => {
      setLoading(true);

      if (hasGlobalAccess) {
        // Super admin, FM and Surveillance see all casinos.
        // Subdomain dictates which one is active; data isolation stays per-casino.
        const { data } = await supabase
          .from("casinos")
          .select("id, name, slug, code")
          .order("name");
        setAccessibleCasinos((data as CasinoInfo[]) ?? []);
      } else {
        // Regular users: primary casino + granted access
        const { data: access } = await supabase
          .from("user_casino_access")
          .select("casino_id")
          .eq("user_id", user.id);

        const casinoIds = new Set<string>();
        if (primaryCasinoId) casinoIds.add(primaryCasinoId);
        access?.forEach(a => casinoIds.add(a.casino_id));

        if (casinoIds.size > 0) {
          const { data } = await supabase
            .from("casinos")
            .select("id, name, slug, code")
            .in("id", Array.from(casinoIds))
            .order("name");
          setAccessibleCasinos((data as CasinoInfo[]) ?? []);
        }
      }

      setLoading(false);
    };

    fetchCasinos();
  }, [user, primaryCasinoId, hasGlobalAccess]);

  // Resolve active casino from slug or primary
  useEffect(() => {
    if (loading) return;

    if (isSummaryMode) {
      setActiveCasinoId(null);
      return;
    }

    // Subdomain ALWAYS wins — never show data from a different casino than the
    // subdomain the user is on, even if they lack access (RLS will deny then).
    if (detectedSlug && detectedSlug !== "__premier__" && detectedSlug !== "__landing__" && detectedSlug !== "__club__") {
      if (subdomainCasino) {
        setActiveCasinoId(subdomainCasino.id);
        return;
      }
      // Subdomain detected but lookup pending — wait, don't fallback.
      return;
    }

    // No subdomain (localhost / IP): fallback to primary casino
    if (primaryCasinoId) {
      setActiveCasinoId(primaryCasinoId);
    } else if (accessibleCasinos.length > 0) {
      setActiveCasinoId(accessibleCasinos[0].id);
    }
  }, [loading, accessibleCasinos, detectedSlug, primaryCasinoId, isSummaryMode, subdomainCasino]);

  const queryClient = useQueryClient();

  const switchCasino = useCallback(async (casinoId: string | null) => {
    const prev = activeCasinoId;
    // Cross-casino cache poisoning fix: React Query + IndexedDB persist cache
    // both hold data keyed by (queryKey), not by casinoId. Switching to another
    // casino without a full reset caused stale Table Check / Chip Count etc.
    // from the previous casino to render (or block the new fetch entirely).
    try {
      await queryClient.cancelQueries();
      queryClient.clear();
      await clearIDBPersistedQueryCache();
      await clearBlacklistCache();
      console.info("[Cache] switched casino — cleared React Query + IndexedDB", { from: prev, to: casinoId });
    } catch (e) {
      console.warn("[Cache] switchCasino cache clear failed", e);
    }
    setActiveCasinoId(casinoId);
  }, [activeCasinoId, queryClient]);

  // Sync activeCasinoId back to auth context so all hooks use the right casino
  useEffect(() => {
    if (activeCasinoId) {
      overrideCasinoId(activeCasinoId);
    } else if (isSummaryMode) {
      // In summary mode, don't override — keep null for cross-casino queries
      overrideCasinoId(null);
    }
  }, [activeCasinoId, isSummaryMode, overrideCasinoId]);

  const activeCasino = accessibleCasinos.find(c => c.id === activeCasinoId) ?? null;

  // Local (non-network) account landing on a casino it has no access to:
  // show an explicit denial instead of a shell full of empty screens.
  const deniedCasino =
    user && !loading && !hasGlobalAccess && subdomainCasino &&
    accessibleCasinos.length > 0 &&
    !accessibleCasinos.some(c => c.id === subdomainCasino.id)
      ? subdomainCasino
      : null;

  return (
    <CasinoContext.Provider value={{
      activeCasinoId,
      activeCasino,
      accessibleCasinos,
      isSummaryMode,
      switchCasino,
      detectedSlug,
      loading,
    }}>
      {deniedCasino ? (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
          <div className="max-w-sm w-full text-center space-y-3 rounded-lg border border-border p-6">
            <h1 className="text-lg font-semibold text-foreground">No access to {deniedCasino.name}</h1>
            <p className="text-sm text-muted-foreground">
              This account is not authorised for this casino. Sign in with an account that has access.
            </p>
            <button
              className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium"
              onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}
            >
              Sign out
            </button>
          </div>
        </div>
      ) : children}
    </CasinoContext.Provider>
  );
};

