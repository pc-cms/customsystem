// Public runtime branding resolver.
// GET /casino-branding?slug=arusha  → JSON with per-casino branding fields.
// Called by public/branding.js on cold page load to augment favicon / theme-color / title from DB.
// Falls back to 404 when the slug is unknown → loader keeps static defaults.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  // 5 min edge/CDN cache; branding rarely changes and the loader is resilient.
  "Cache-Control": "public, max-age=300, s-maxage=300",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("slug") || "").trim().toLowerCase();
    const host = (url.searchParams.get("host") || "").trim().toLowerCase();

    let key = slug;
    if (!key && host) key = host.split(".")[0];
    if (!key || !/^[a-z0-9_-]{1,64}$/.test(key)) {
      return new Response(JSON.stringify({ error: "invalid slug" }), { status: 400, headers: jsonHeaders });
    }

    const { data, error } = await admin
      .from("casinos")
      .select("slug,name,short_name,tagline,meta_title,meta_description,theme_color,background_color,pwa_display,favicon_url,apple_touch_icon_url,pwa_icon_192_url,pwa_icon_512_url,og_image_url,logo_url,brand_primary_hsl,brand_accent_hsl")
      .eq("slug", key)
      .maybeSingle();

    if (error) throw error;
    if (!data) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: jsonHeaders });

    return new Response(JSON.stringify(data), { headers: jsonHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: jsonHeaders });
  }
});
