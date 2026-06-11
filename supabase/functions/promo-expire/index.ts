// Premier Club: daily cron — expire promo grants past their business-day expiry
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Cron-only: require service-role key
    const provided = req.headers.get("x-service-key") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    const okAuth =
      provided === SERVICE_KEY ||
      authHeader === `Bearer ${SERVICE_KEY}`;
    if (!okAuth) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: bizDate } = await sb.rpc("get_current_business_date");
    const today: string = bizDate ?? new Date().toISOString().slice(0, 10);

    const { data: expired, error } = await sb
      .from("promo_grants")
      .select("id, player_id, remaining, issued_business_date, expires_business_date")
      .eq("status", "active")
      .lt("expires_business_date", today)
      .not("expires_business_date", "is", null)
      .limit(5000);

    if (error) throw error;

    let processed = 0;
    for (const g of expired ?? []) {
      if (g.remaining > 0) {
        await sb.from("promo_wallet_ledger").insert({
          grant_id: g.id,
          player_id: g.player_id,
          delta: -g.remaining,
          reason: "expiry_writeoff",
          ref_type: "promo_grant",
          ref_id: g.id,
          business_date: today,
        });
      }
      await sb.from("promo_grants")
        .update({ status: "expired", remaining: 0, updated_at: new Date().toISOString() })
        .eq("id", g.id);
      processed++;
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
