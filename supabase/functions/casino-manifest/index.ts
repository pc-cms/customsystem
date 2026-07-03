// Public PWA manifest generator per casino slug.
// GET /casino-manifest?slug=arusha  → application/manifest+json
// Falls back to a generic manifest when the slug is unknown so the browser
// never sees a 404 (which would strip installability).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/manifest+json; charset=utf-8",
  // 5 min edge cache — manifests rarely change and installers re-fetch cold.
  "Cache-Control": "public, max-age=300, s-maxage=300",
};

function fallback(slug: string) {
  return {
    name: "Casino System",
    short_name: slug || "Casino",
    description: "Casino Management System.",
    start_url: "/",
    id: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("slug") || "").trim().toLowerCase();
    const host = (url.searchParams.get("host") || "").trim().toLowerCase();
    let key = slug || (host ? host.split(".")[0] : "");
    if (!key || !/^[a-z0-9_-]{1,64}$/.test(key)) {
      return new Response(JSON.stringify(fallback("")), { headers: jsonHeaders });
    }

    const { data } = await admin
      .from("casinos")
      .select("slug,name,short_name,tagline,meta_description,theme_color,background_color,pwa_display,pwa_icon_192_url,pwa_icon_512_url")
      .eq("slug", key)
      .maybeSingle();

    if (!data) return new Response(JSON.stringify(fallback(key)), { headers: jsonHeaders });

    const icon192 = (data as any).pwa_icon_192_url || "/icon-192.png";
    const icon512 = (data as any).pwa_icon_512_url || "/icon-512.png";

    const manifest = {
      name: (data as any).name || "Casino System",
      short_name: (data as any).short_name || (data as any).name || "Casino",
      description: (data as any).meta_description || (data as any).tagline || "Casino Management System.",
      start_url: "/",
      id: "/",
      scope: "/",
      display: (data as any).pwa_display || "standalone",
      orientation: "any",
      background_color: (data as any).background_color || "#000000",
      theme_color: (data as any).theme_color || "#000000",
      icons: [
        { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: icon512, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: icon192, sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: icon512, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    };

    return new Response(JSON.stringify(manifest), { headers: jsonHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
