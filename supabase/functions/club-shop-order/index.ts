// Premier Club: place a shop order (debits promo wallet via shop_orders trigger flow)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyClubToken, tokenFromRequest } from "../_shared/club-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = tokenFromRequest(req);
    if (!token) return new Response(JSON.stringify({ error: "no token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const session = await verifyClubToken(token);
    if (!session) return new Response(JSON.stringify({ error: "invalid token" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { item_id, qty = 1 } = await req.json();
    if (!item_id || qty <= 0) return new Response(JSON.stringify({ error: "item_id + qty required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    // casino_id derived server-side from player profile — never trust client value
    const { data: player } = await sb.from("players").select("id, casino_id, verification_status").eq("phone", session.phone).maybeSingle();
    if (!player) return new Response(JSON.stringify({ error: "player_not_found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (player.verification_status !== "verified") {
      return new Response(JSON.stringify({ error: "kyc_required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data, error } = await sb.rpc("club_place_shop_order", {
      p_player_id: player.id,
      p_item_id: item_id,
      p_qty: qty,
      p_casino_id: player.casino_id,
    });

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    return new Response(JSON.stringify({ ok: true, ...(data as any) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
