import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, password } = await req.json();
    console.log("[verify-manager] request for:", email);

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const verifyClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: authData, error: authError } = await verifyClient.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      console.log("[verify-manager] auth failed:", authError?.message);
      return new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await verifyClient.auth.signOut();
    const managerId = authData.user.id;
    console.log("[verify-manager] auth ok, user_id:", managerId);

    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roles, error: rolesError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", managerId);

    console.log("[verify-manager] roles:", JSON.stringify(roles), "err:", rolesError?.message);

    const allowed = ["manager", "shift_manager", "super_admin", "finance_manager"];
    const isAllowed = roles?.some((r: any) => allowed.includes(r.role));

    if (!isAllowed) {
      console.log("[verify-manager] role rejected for", email, "roles:", roles);
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
        display_name: profile?.display_name || email,
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
