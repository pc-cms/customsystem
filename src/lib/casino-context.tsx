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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getCachedRuntimeConfig } from "@/lib/runtime-config";

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
  switchCasino: (casinoId: string | null) => void;
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
  if (rc?.casinoSlug) return resolveSlugAlias(rc.casinoSlug.toLowerCase());

  const hostname = window.location.hostname;

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
  // Surveillance has network-wide visibility (read-only via existing access controls).
  // Per-casino isolation is enforced by the subdomain → activeCasinoId resolver below.
  const hasGlobalAccess = isSuperOrFM || isSurveillance;
  const isSummaryMode = detectedSlug === "__premier__" && isSuperOrFM;

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

  const switchCasino = useCallback((casinoId: string | null) => {
    setActiveCasinoId(casinoId);
  }, []);

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
      {children}
    </CasinoContext.Provider>
  );
};
