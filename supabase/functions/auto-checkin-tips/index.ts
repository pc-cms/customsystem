// Auto check-in TIPS players for Arusha casino.
// Runs daily at 13:00 EAT via pg_cron. Idempotent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ARUSHA_CASINO_ID = "48f4404f-7724-418c-8365-29af3998e113";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Today in Africa/Dar_es_Salaam (UTC+3, no DST)
    const now = new Date();
    const eat = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const today = eat.toISOString().slice(0, 10);

    const { data: players, error: pErr } = await admin
      .from("players")
      .select("id, first_name, last_name")
      .eq("casino_id", ARUSHA_CASINO_ID)
      .eq("status", "active")
      .or("first_name.ilike.%tips%,last_name.ilike.%tips%");
    if (pErr) throw pErr;

    let opened = 0, reopened = 0, skipped = 0;

    for (const p of players || []) {
      const { data: existing } = await admin
        .from("casino_visits")
        .select("id, checked_out_at")
        .eq("casino_id", ARUSHA_CASINO_ID)
        .eq("player_id", p.id)
        .eq("date", today)
        .maybeSingle();

      if (!existing) {
        const { error } = await admin.from("casino_visits").insert({
          casino_id: ARUSHA_CASINO_ID,
          player_id: p.id,
          position: "hall",
        });
        if (error) throw error;
        opened++;
      } else if (existing.checked_out_at) {
        const { error } = await admin
          .from("casino_visits")
          .update({ checked_out_at: null })
          .eq("id", existing.id);
        if (error) throw error;
        reopened++;
      } else {
        skipped++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        casino: "Arusha",
        date: today,
        processed: players?.length || 0,
        opened,
        reopened,
        skipped,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("auto-checkin-tips error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
