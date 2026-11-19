import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is a manager or super_admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) throw new Error("Not authenticated");

    const adminClient = createClient(supabaseUrl, serviceKey);
    
    // Check caller has manager or super_admin role
    const { data: hasManager } = await adminClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "manager",
    });
    const { data: hasSuperAdmin } = await adminClient.rpc("has_role", {
      _user_id: caller.id,
      _role: "super_admin",
    });
    if (!hasManager && !hasSuperAdmin) throw new Error("Manager or Super Admin role required");

    const { login, password, display_name, roles, casino_id } = await req.json();
    const cleanLogin = String(login || "").trim().toLowerCase();
    if (!cleanLogin || !password || !display_name) throw new Error("Missing fields");

    // Managers may grant only their own level or lower; top roles are Super Admin only.
    const SUPER_ONLY_ROLES = ["super_admin", "boss", "general_manager"];
    if (!hasSuperAdmin && Array.isArray(roles) && roles.some((r: unknown) => SUPER_ONLY_ROLES.includes(String(r)))) {
      return new Response(JSON.stringify({ error: "Only Super Admin can assign Super Admin, Boss or General Manager roles" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine target casino_id
    let targetCasinoId = casino_id;
    if (!targetCasinoId) {
      // Fall back to caller's casino
      const { data: callerProfile } = await adminClient
        .from("profiles")
        .select("casino_id")
        .eq("user_id", caller.id)
        .single();
      if (!callerProfile) throw new Error("Caller profile not found");
      targetCasinoId = callerProfile.casino_id;
    } else if (!hasSuperAdmin) {
      // Non-super_admin can only create users for their own casino
      const { data: callerProfile } = await adminClient
        .from("profiles")
        .select("casino_id")
        .eq("user_id", caller.id)
        .single();
      if (callerProfile?.casino_id !== targetCasinoId) {
        throw new Error("You can only create users for your own casino");
      }
    }

    const email = `${cleanLogin}@cms.local`;

    // Create user via admin API
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name },
    });
    if (createError) {
      const code = (createError as { code?: string }).code;
      if (code === "email_exists" || createError.message.toLowerCase().includes("already been registered")) {
        return new Response(JSON.stringify({
          error: `Login "${cleanLogin}" already exists. Choose another login or edit the existing user.`,
        }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw createError;
    }

    // Update profile with correct casino_id (trigger creates it with default casino)
    await adminClient
      .from("profiles")
      .update({ casino_id: targetCasinoId, display_name })
      .eq("user_id", newUser.user.id);

    // Clear default roles assigned by trigger, then assign requested ones
    await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", newUser.user.id);

    if (roles && Array.isArray(roles)) {
      for (const role of roles) {
        await adminClient.from("user_roles").insert({
          user_id: newUser.user.id,
          role,
        });
      }
    }

    return new Response(JSON.stringify({ id: newUser.user.id, login: cleanLogin }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[create-user] failed:", message, err);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
