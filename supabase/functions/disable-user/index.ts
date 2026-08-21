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
    const { user_id, action } = await req.json();
    if (!user_id) return json({ error: "Missing user_id" }, 400);
    if (user_id === caller.id) return json({ error: "You cannot modify your own account" }, 400);

    const enableMode = action === "enable";
    const disableMode = action === "disable" || action === undefined || action === null;
    if (!enableMode && !disableMode) {
      return json({ error: "Invalid action. Use 'enable' or 'disable'" }, 400);
    }

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
      return json({ error: "Only Super Admin can modify a Super Admin account" }, 403);
    }

    if (!hasSuperAdmin) {
      const { data: callerProfile } = await adminClient
        .from("profiles")
        .select("casino_id")
        .eq("user_id", caller.id)
        .maybeSingle();
      if (!callerProfile || callerProfile.casino_id !== targetProfile.casino_id) {
        return json({ error: "You can only modify users from your own casino" }, 403);
      }
    }

    if (enableMode) {
      const { error: unbanError } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: "0h",
      });
      if (unbanError) throw unbanError;

      const { error: profileError } = await adminClient
        .from("profiles")
        .update({ disabled_at: null, disabled_by: null })
        .eq("user_id", user_id);
      if (profileError) throw profileError;

      return json({ ok: true, user_id, enabled: true, display_name: targetProfile.display_name });
    }

    const { error: banError } = await adminClient.auth.admin.updateUserById(user_id, {
      ban_duration: "876000h",
    });
    if (banError) throw banError;

    const { error: profileError } = await adminClient
      .from("profiles")
      .update({ disabled_at: new Date().toISOString(), disabled_by: caller.id })
      .eq("user_id", user_id);
    if (profileError) throw profileError;

    return json({ ok: true, user_id, disabled: true, display_name: targetProfile.display_name });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[disable-user] failed:", message, err);
    return json({ error: message }, 400);
  }
});
