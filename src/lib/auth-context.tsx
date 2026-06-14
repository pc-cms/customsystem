import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { clearSessionState } from "@/hooks/use-session-state";

type AppRole = "cashier" | "cashier_slots" | "pit" | "manager" | "shift_manager" | "reception" | "finance_manager" | "surveillance" | "super_admin" | "hr" | "account_manager";

type ManagerOverride = {
  active: boolean;
  managerId: string | null;
  managerName: string | null;
};

type AuthState = {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  casinoId: string | null;
  displayName: string | null;
  loading: boolean;
  hasRole: (role: AppRole) => boolean;
  isManager: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  managerOverride: ManagerOverride;
  activateManagerOverride: (managerId: string, managerName: string) => void;
  deactivateManagerOverride: () => void;
  /** Override casinoId (used by CasinoProvider for subdomain routing) */
  overrideCasinoId: (id: string | null) => void;
  /** The profile's original casino_id (before any override) */
  primaryCasinoId: string | null;
};

const AuthContext = createContext<AuthState | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be within AuthProvider");
  return ctx;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [profileCasinoId, setProfileCasinoId] = useState<string | null>(null);
  const [casinoIdOverride, setCasinoIdOverride] = useState<string | null | undefined>(undefined);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [managerOverride, setManagerOverride] = useState<ManagerOverride>({
    active: false,
    managerId: null,
    managerName: null,
  });

  // Track current user id in a ref to avoid stale closures in onAuthStateChange
  const currentUserIdRef = useRef<string | null>(null);
  // Track profile fetch version to ignore stale results
  const profileVersionRef = useRef(0);

  const fetchProfile = useCallback(async (userId: string) => {
    const [{ data: profile, error: profileError }, { data: userRoles, error: rolesError }] = await Promise.all([
      supabase.from("profiles").select("casino_id, display_name, disabled_at").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    if ((profile as { disabled_at?: string | null } | null)?.disabled_at) {
      await supabase.auth.signOut();
      throw new Error("User account is disabled");
    }

    if (profileError) console.error("fetchProfile profile error", profileError);
    if (rolesError) console.error("fetchProfile roles error", rolesError);

    return {
      profileCasinoId: profile?.casino_id ?? null,
      displayName: profile?.display_name ?? null,
      roles: (userRoles ?? []).map(r => r.role as AppRole),
    };
  }, []);

  // Apply profile data to state
  const applyProfile = useCallback((profile: { profileCasinoId: string | null; displayName: string | null; roles: AppRole[] }) => {
    setProfileCasinoId(profile.profileCasinoId);
    setDisplayName(profile.displayName);
    setRoles(profile.roles);
  }, []);

  // Clear all user-specific state on sign-out
  const handleSignedOut = useCallback(() => {
    currentUserIdRef.current = null;
    profileVersionRef.current += 1;
    setUser(null);
    setSession(null);
    setRoles([]);
    setProfileCasinoId(null);
    setCasinoIdOverride(undefined);
    setDisplayName(null);
    setProfileLoading(false);
    setManagerOverride({ active: false, managerId: null, managerName: null });
  }, []);

  // Load profile for a given user, with version tracking to ignore stale results
  const loadProfileForUser = useCallback((userId: string) => {
    const version = ++profileVersionRef.current;
    setProfileLoading(true);

    void fetchProfile(userId)
      .then((profile) => {
        if (profileVersionRef.current !== version) return; // stale
        applyProfile(profile);
      })
      .catch((error) => {
        console.error("loadProfileForUser error", error);
        if (profileVersionRef.current !== version) return;
        // Don't clear roles on network error if we already have them (offline resilience)
      })
      .finally(() => {
        if (profileVersionRef.current === version) {
          setProfileLoading(false);
        }
      });
  }, [fetchProfile, applyProfile]);

  // Process a session update from getSession or onAuthStateChange
  const processSession = useCallback((nextSession: Session | null) => {
    const nextUserId = nextSession?.user?.id ?? null;
    const prevUserId = currentUserIdRef.current;

    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    if (!nextUserId) {
      // Signed out
      if (prevUserId) handleSignedOut();
      return;
    }

    if (nextUserId !== prevUserId) {
      // New user or first session restore — load profile
      currentUserIdRef.current = nextUserId;
      loadProfileForUser(nextUserId);
    }
    // Same user (TOKEN_REFRESHED, etc.) — do nothing, keep existing roles/profile
  }, [handleSignedOut, loadProfileForUser]);

  // Single initialization effect — NO dependency on user state
  useEffect(() => {
    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    // Safety timeout: if getSession hangs (known Supabase issue), force ready after 5s
    timeoutId = setTimeout(() => {
      if (mounted && !authReady) {
        console.warn("[Auth] getSession timed out after 5s, forcing ready state");
        setAuthReady(true);
      }
    }, 5000);

    // 1. Set up the listener FIRST (Supabase docs recommendation)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!mounted) return;
        processSession(nextSession);
        setAuthReady(true);
      }
    );

    // 2. Then restore session from storage
    void supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        processSession(session);
      })
      .catch((error) => {
        console.error("getSession error", error);
      })
      .finally(() => {
        if (mounted) {
          clearTimeout(timeoutId);
          setAuthReady(true);
        }
      });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty — runs once, uses refs for current state

  const loading = !authReady || (!!user && profileLoading);

  const hasRole = useCallback(
    (role: AppRole) => roles.includes(role) || (role === "manager" && managerOverride.active),
    [roles, managerOverride.active]
  );

  // Shift Manager has full operational manager parity (approve expenses, override,
  // close cage, reopen tables, edit past rota, blacklist, etc.) — but financial
  // surfaces remain role-gated separately via roles arrays in AppSidebar/RoleGuard.
  const isManager =
    roles.includes("manager") ||
    roles.includes("shift_manager") ||
    managerOverride.active;

  const activateManagerOverride = useCallback((managerId: string, managerName: string) => {
    setManagerOverride({ active: true, managerId, managerName });
  }, []);

  const deactivateManagerOverride = useCallback(() => {
    setManagerOverride({ active: false, managerId: null, managerName: null });
  }, []);

  const overrideCasinoId = useCallback((id: string | null) => {
    setCasinoIdOverride(id);
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    const userId = data.user?.id;
    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("disabled_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (profile?.disabled_at) {
        await supabase.auth.signOut();
        return { error: "User account is disabled" };
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    handleSignedOut();
    await supabase.auth.signOut();
  };

  // casinoId: use override if set, otherwise profile's casino
  const casinoId = casinoIdOverride !== undefined ? casinoIdOverride : profileCasinoId;

  return (
    <AuthContext.Provider value={{
      user, session, roles, casinoId, displayName, loading,
      hasRole, isManager, signIn, signOut,
      managerOverride, activateManagerOverride, deactivateManagerOverride,
      overrideCasinoId, primaryCasinoId: profileCasinoId,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
