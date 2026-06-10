// Premier Club: login with phone + password. Returns club session token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { issueClubToken } from "../_shared/club-token.ts";
import { verifyPassword } from "../_shared/club-password.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function normalizePhone(raw: string): string {
  let p = raw.replace(/[^\d+]/g, "");
  if (p.startsWith("0")) p = "255" + p.slice(1);
  if (p.startsWith("+")) p = p.slice(1);
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { phone, password } = await req.json();
    if (!phone || !password || typeof password !== "string") {
      return new Response(JSON.stringify({ error: "phone and password required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const normalized = normalizePhone(String(phone));

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: account } = await sb
      .from("club_accounts")
      .select("id, player_id, phone")
      .eq("phone", normalized)
      .maybeSingle();

    if (!account) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_credentials" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: secret } = await sb
      .from("club_account_secrets")
      .select("password_hash")
      .eq("club_account_id", account.id)
      .maybeSingle();

    if (!secret?.password_hash) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_credentials" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ok = await verifyPassword(password, secret.password_hash);
    if (!ok) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_credentials" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await sb.from("club_accounts").update({ last_login_at: new Date().toISOString() }).eq("id", account.id);

    const { data: player } = await sb
      .from("players")
      .select("id, first_name, last_name, verification_status")
      .eq("id", account.player_id)
      .maybeSingle();

    const token = await issueClubToken(normalized);
    return new Response(
      JSON.stringify({ ok: true, player_exists: !!player, player, token, phone: normalized }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
