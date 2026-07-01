// Auto check-in Casino-tier (virtual) players for all casinos.
// Runs daily at 13:00 EAT via pg_cron. Idempotent.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_USER_ID = "bf328d89-bf0a-46ab-ae1e-9b4914cc9811";

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
      .select("id, first_name, last_name, casino_id")
      .eq("status", "active")
      .eq("category", "casino");
    if (pErr) throw pErr;

    const perCasino: Record<string, { opened: number; reopened: number; skipped: number }> = {};
    let opened = 0, reopened = 0, skipped = 0;

    for (const p of players || []) {
      const bucket = (perCasino[p.casino_id] ||= { opened: 0, reopened: 0, skipped: 0 });

      const { data: existing } = await admin
        .from("casino_visits")
        .select("id, checked_out_at")
        .eq("casino_id", p.casino_id)
        .eq("player_id", p.id)
        .eq("date", today)
        .maybeSingle();

      if (!existing) {
        const { error } = await admin.from("casino_visits").insert({
          casino_id: p.casino_id,
          player_id: p.id,
          position: "hall",
          checked_in_by: SYSTEM_USER_ID,
        });
        if (error) throw error;
        opened++; bucket.opened++;
      } else if (existing.checked_out_at) {
        const { error } = await admin
          .from("casino_visits")
          .update({ checked_out_at: null })
          .eq("id", existing.id);
        if (error) throw error;
        reopened++; bucket.reopened++;
      } else {
        skipped++; bucket.skipped++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        date: today,
        processed: players?.length || 0,
        opened,
        reopened,
        skipped,
        per_casino: perCasino,
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
