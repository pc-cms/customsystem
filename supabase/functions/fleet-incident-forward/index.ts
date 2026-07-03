/**
 * fleet-incident-forward — receives an incident from a box, authenticates via
 * HMAC-SHA256(peer_links.sync_secret, body) and stores it in
 * public.fleet_incident_forwards for the operator dashboard.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function hmac(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const nodeId = req.headers.get("x-peer-node-id");
    const sig = req.headers.get("x-peer-signature");
    if (!nodeId || !sig) return new Response("missing headers", { status: 400, headers: corsHeaders });

    const bodyText = await req.text();

    const { data: peer, error: peerErr } = await admin
      .from("peer_links")
      .select("sync_secret")
      .eq("peer_node_id", nodeId)
      .maybeSingle();
    if (peerErr) return new Response(`peer lookup failed: ${peerErr.message}`, { status: 500, headers: corsHeaders });
    if (!peer?.sync_secret) return new Response("unknown node", { status: 401, headers: corsHeaders });

    const expected = await hmac(peer.sync_secret, bodyText);
    if (expected !== sig) return new Response("bad signature", { status: 401, headers: corsHeaders });

    const payload = JSON.parse(bodyText || "{}");
    const rows = Array.isArray(payload.incidents) ? payload.incidents : [payload];

    const inserts = rows.map((r: any) => ({
      node_id: nodeId,
      local_incident_id: r.local_incident_id ?? null,
      severity: r.severity ?? "info",
      category: r.category ?? null,
      title: String(r.title ?? "(untitled)").slice(0, 500),
      body: r.body ?? null,
      occurred_at: r.occurred_at ?? new Date().toISOString(),
      metadata: r.metadata ?? {},
    }));

    const { error, data } = await admin
      .from("fleet_incident_forwards")
      .insert(inserts)
      .select("id");
    if (error) throw error;

    return new Response(JSON.stringify({ received: data?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
