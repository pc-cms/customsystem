// Premier Club: minimal self-registration (phone + name + DOB + password).
// Players land as `unverified` and complete profile/KYC inside the PWA.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyClubToken, tokenFromRequest } from "../_shared/club-token.ts";
import { hashPassword, validatePasswordStrength } from "../_shared/club-password.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_SLUG = "arusha";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_phone: "Invalid phone number.",
  invalid_first_name: "First name is required.",
  invalid_last_name: "Last name is required.",
  invalid_dob: "Date of birth is required.",
  underage: "You must be at least 18 years old.",
  invalid_casino: "Default branch missing.",
  duplicate_phone: "A player with this phone number already exists. Please sign in.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = tokenFromRequest(req);
    if (!token) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const session = await verifyClubToken(token);
    if (!session) {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const first = String(body.first_name ?? "").trim();
    const last = String(body.last_name ?? "").trim();
    const dob = String(body.dob ?? "").trim(); // YYYY-MM-DD
    const password = String(body.password ?? "");

    const pwErr = validatePasswordStrength(password);
    if (pwErr) {
      return new Response(JSON.stringify({ error: pwErr }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Short-circuit: phone already attached to a player → return that player.
    const { data: existing } = await sb
      .from("club_accounts")
      .select("id, player_id, players:player_id (id, first_name, last_name, phone, verification_status, casino_id)")
      .eq("phone", session.phone)
      .maybeSingle();
    if (existing?.players) {
      // Make sure the password is set for this account so phone+password works.
      const pwHash = await hashPassword(password);
      await sb.from("club_account_secrets").upsert(
        { club_account_id: existing.id, password_hash: pwHash },
        { onConflict: "club_account_id" }
      );
      return new Response(JSON.stringify({ ok: true, player: existing.players, already_registered: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await sb.rpc("club_self_register_minimal", {
      _phone: session.phone,
      _first: first,
      _last: last,
      _dob: dob,
      _casino_slug: DEFAULT_SLUG,
    });
    if (error) {
      const code = (error.message || "").replace(/.*: /, "").trim();
      const msg = ERROR_MESSAGES[code] || "Registration failed. Please try again.";
      return new Response(JSON.stringify({ error: msg, code }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const playerId = (data as any)?.player_id;

    // Store password hash in the secrets table linked to the club_account created by the RPC.
    const pwHash = await hashPassword(password);
    const { data: acct } = await sb.from("club_accounts").select("id").eq("phone", session.phone).single();
    if (acct) {
      await sb.from("club_account_secrets").upsert(
        { club_account_id: acct.id, password_hash: pwHash },
        { onConflict: "club_account_id" }
      );
    }

    const { data: player } = await sb
      .from("players")
      .select("id, first_name, last_name, phone, verification_status, casino_id")
      .eq("id", playerId)
      .maybeSingle();

    return new Response(JSON.stringify({ ok: true, player }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
