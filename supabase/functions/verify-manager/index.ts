import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_ROLES = ["manager", "shift_manager", "super_admin", "finance_manager"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email: rawInput, password } = await req.json();
    const input = (rawInput ?? "").toString().trim();
    console.log("[verify-manager] request for:", input);

    if (!input || !password) {
      return new Response(JSON.stringify({ error: "Email and password required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Build list of candidate emails to try.
    //   1. Exact input (if it already looks like an email)
    //   2. `{login}@cms.local` template (legacy default for typed logins)
    //   3. Fallback: look up profiles by case-insensitive display_name match
    //      and resolve the real auth email. This rescues shift_managers whose
    //      login differs from their display name (e.g. "petro" vs "Peter").
    const candidates: string[] = [];
    if (input.includes("@")) {
      candidates.push(input.toLowerCase());
    } else {
      candidates.push(`${input.toLowerCase()}@cms.local`);
    }

    const tryAuth = async (email: string) => {
      const client = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      try { await client.auth.signOut(); } catch { /* noop */ }
      return { data, error };
    };

    let managerId: string | null = null;
    let usedEmail: string | null = null;
    let lastAuthErrorMsg = "Invalid credentials";

    for (const candidate of candidates) {
      const { data, error } = await tryAuth(candidate);
      if (!error && data?.user) {
        managerId = data.user.id;
        usedEmail = candidate;
        break;
      }
      lastAuthErrorMsg = error?.message || lastAuthErrorMsg;
      console.log("[verify-manager] candidate failed:", candidate, "err:", error?.message);
    }

    // Fallback: look up by display_name → fetch real auth email → retry.
    if (!managerId && !input.includes("@")) {
      const { data: matches } = await adminClient
        .from("profiles")
        .select("user_id, display_name")
        .ilike("display_name", input);

      const userIds: string[] = (matches ?? []).map((m: any) => m.user_id);
      for (const uid of userIds) {
        const { data: u, error: ue } = await adminClient.auth.admin.getUserById(uid);
        if (ue || !u?.user?.email) continue;
        const email = u.user.email;
        if (candidates.includes(email.toLowerCase())) continue; // already tried
        const { data, error } = await tryAuth(email);
        if (!error && data?.user) {
          managerId = data.user.id;
          usedEmail = email;
          break;
        }
        lastAuthErrorMsg = error?.message || lastAuthErrorMsg;
        console.log("[verify-manager] display_name fallback failed:", email, "err:", error?.message);
      }
    }

    if (!managerId) {
      console.log("[verify-manager] all candidates failed for:", input);
      return new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[verify-manager] auth ok, user_id:", managerId, "via:", usedEmail);

    const { data: roles, error: rolesError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", managerId);

    console.log("[verify-manager] roles:", JSON.stringify(roles), "err:", rolesError?.message);

    const isAllowed = roles?.some((r: any) => ALLOWED_ROLES.includes(r.role));

    if (!isAllowed) {
      console.log("[verify-manager] role rejected for", input, "roles:", roles);
      return new Response(
        JSON.stringify({ error: "Insufficient permissions" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: profile } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("user_id", managerId)
      .single();

    return new Response(
      JSON.stringify({
        manager_id: managerId,
        display_name: profile?.display_name || usedEmail || input,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[verify-manager] exception:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
