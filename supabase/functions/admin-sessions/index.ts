/**
 * admin-sessions — list active auth sessions (who is logged in, since when,
 * from which device) and revoke them ("End session" forces re-login).
 *
 * POST body: { action: "list" } | { action: "revoke", user_id: string }
 *
 * Scoping:
 *   - super_admin: all casinos
 *   - manager / general_manager: only users of their own casino
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const [{ data: isManager }, { data: isGm }, { data: isSuper }] = await Promise.all([
      admin.rpc("has_role", { _user_id: caller.id, _role: "manager" }),
      admin.rpc("has_role", { _user_id: caller.id, _role: "general_manager" }),
      admin.rpc("has_role", { _user_id: caller.id, _role: "super_admin" }),
    ]);
    if (!isManager && !isGm && !isSuper) {
      return json({ error: "Manager or Super Admin role required" }, 403);
    }

    let scopeCasinoId: string | null = null;
    if (!isSuper && !isGm) {
      const { data: prof } = await admin
        .from("profiles")
        .select("casino_id")
        .eq("user_id", caller.id)
        .maybeSingle();
      scopeCasinoId = prof?.casino_id ?? null;
      if (!scopeCasinoId) return json({ rows: [] });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body?.action ?? "list";

    // Profiles in scope (used both to enrich and to authorize revoke).
    let pq = admin.from("profiles").select("user_id, display_name, casino_id, disabled_at");
    if (scopeCasinoId) pq = pq.eq("casino_id", scopeCasinoId);
    const { data: profiles, error: pErr } = await pq;
    if (pErr) throw pErr;
    const profileByUser = new Map((profiles || []).map((p) => [p.user_id, p]));

    if (action === "revoke") {
      const targetId: string = body?.user_id;
      if (!targetId) return json({ error: "user_id required" }, 400);
      if (!profileByUser.has(targetId)) return json({ error: "User out of scope" }, 403);

      const res = await fetch(`${supabaseUrl}/auth/v1/admin/users/${targetId}/sessions`, {
        method: "DELETE",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (!res.ok) {
        const text = await res.text();
        console.error("[admin-sessions] revoke failed", res.status, text);
        return json({ error: `Failed to end session (${res.status})` }, 400);
      }
      return json({ ok: true });
    }

    // action = list
    const { data: sessions, error: sErr } = await admin.rpc("admin_active_sessions");
    if (sErr) throw sErr;

    const userIds = Array.from(new Set((sessions || []).map((s: any) => s.user_id)));
    const emailById = new Map<string, string>();
    let page = 1;
    const wanted = new Set(userIds);
    while (wanted.size > 0 && page <= 20) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const users = data?.users ?? [];
      if (users.length === 0) break;
      for (const u of users) {
        if (wanted.has(u.id)) {
          emailById.set(u.id, u.email ?? "");
          wanted.delete(u.id);
        }
      }
      if (users.length < 1000) break;
      page += 1;
    }

    const { data: roleRows } = await admin
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const rolesByUser = new Map<string, string[]>();
    (roleRows || []).forEach((r: any) => {
      const arr = rolesByUser.get(r.user_id) || [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    });

    const { data: casinos } = await admin.from("casinos").select("id, name, code");
    const casinoById = new Map((casinos || []).map((c: any) => [c.id, c]));

    const rows = (sessions || [])
      .filter((s: any) => profileByUser.has(s.user_id))
      .map((s: any) => {
        const p = profileByUser.get(s.user_id)!;
        const email = emailById.get(s.user_id) ?? "";
        const at = email.indexOf("@");
        const casino = p.casino_id ? casinoById.get(p.casino_id) : null;
        return {
          session_id: s.session_id,
          user_id: s.user_id,
          login: at > 0 ? email.slice(0, at) : email,
          display_name: p.display_name,
          casino_id: p.casino_id,
          casino_name: casino?.name ?? null,
          casino_code: casino?.code ?? null,
          roles: rolesByUser.get(s.user_id) || [],
          disabled: !!p.disabled_at,
          created_at: s.created_at,
          last_seen_at: s.refreshed_at || s.updated_at || s.created_at,
          user_agent: s.user_agent,
          ip: s.ip,
        };
      });

    return json({ rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin-sessions] failed:", message);
    return json({ error: message }, 400);
  }
});
