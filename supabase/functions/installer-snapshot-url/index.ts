// installer-snapshot-url
// Returns a short-lived signed URL for the baked snapshot of a casino
// (`installer-snapshots/<slug>/latest.ndjson.gz`). Called by deploy/install.sh
// so the private bucket does not need to be public.
//
// Public (verify_jwt=false) — the snapshot is not sensitive (it's the same
// data the box will sync anyway) and is scoped by slug.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let slug = url.searchParams.get("slug") ?? "";
    if (!slug && (req.method === "POST")) {
      try {
        const body = await req.json();
        slug = String(body?.slug ?? "");
      } catch { /* ignore */ }
    }
    slug = slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
      return new Response(JSON.stringify({ error: "invalid slug" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const objectPath = `${slug}/latest.ndjson.gz`;
    const { data, error } = await sb.storage
      .from("installer-snapshots")
      .createSignedUrl(objectPath, 600); // 10 min

    if (error || !data) {
      return new Response(
        JSON.stringify({ error: error?.message ?? "not_found", slug }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        },
      );
    }

    return new Response(
      JSON.stringify({
        slug,
        signed_url: data.signedUrl,
        expires_in: 600,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
