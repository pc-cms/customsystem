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

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { user_id } = await req.json();
    if (!user_id) return json({ error: "Missing user_id" }, 400);
    if (user_id === caller.id) return json({ error: "You cannot delete your own account" }, 400);

    const [{ data: hasManager }, { data: hasSuperAdmin }] = await Promise.all([
      adminClient.rpc("has_role", { _user_id: caller.id, _role: "manager" }),
      adminClient.rpc("has_role", { _user_id: caller.id, _role: "super_admin" }),
    ]);
    if (!hasManager && !hasSuperAdmin) {
      return json({ error: "Manager or Super Admin role required" }, 403);
    }

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("casino_id, display_name")
      .eq("user_id", user_id)
      .maybeSingle();
    if (!targetProfile) return json({ error: "User profile not found" }, 404);

    const { data: targetIsSuper } = await adminClient.rpc("has_role", {
      _user_id: user_id,
      _role: "super_admin",
    });
    if (targetIsSuper && !hasSuperAdmin) {
      return json({ error: "Only Super Admin can delete a Super Admin account" }, 403);
    }

    if (!hasSuperAdmin) {
      const { data: callerProfile } = await adminClient
        .from("profiles")
        .select("casino_id")
        .eq("user_id", caller.id)
        .maybeSingle();
      if (!callerProfile || callerProfile.casino_id !== targetProfile.casino_id) {
        return json({ error: "You can only delete users from your own casino" }, 403);
      }
    }

    // Clean up dependent rows first (auth cascade is not available for these tables).
    const cleanup = await Promise.all([
      adminClient.from("user_roles").delete().eq("user_id", user_id),
      adminClient.from("user_module_permissions").delete().eq("user_id", user_id),
      adminClient.from("user_casino_access").delete().eq("user_id", user_id),
    ]);
    for (const { error } of cleanup) {
      if (error) throw error;
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .delete()
      .eq("user_id", user_id);
    if (profileError) throw profileError;

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user_id);
    if (deleteError) throw deleteError;

    return json({ ok: true, user_id, display_name: targetProfile.display_name });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[delete-user] failed:", message, err);
    return json({ error: message }, 400);
  }
});
