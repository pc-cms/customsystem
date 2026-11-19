// Premier Club session token: HMAC-signed { phone, exp } using SUPABASE_JWT_SECRET.
// Stateless, no DB lookup needed to validate.

const SECRET = Deno.env.get("SUPABASE_JWT_SECRET") ?? "";
if (!SECRET) console.error("[club-token] SUPABASE_JWT_SECRET is not set; club tokens disabled");
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

async function hmac(payload: string): Promise<string> {
  if (!SECRET) throw new Error("Club token signing secret is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export async function issueClubToken(phone: string, ttlSeconds: number = TTL_SECONDS): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${phone}.${exp}`;
  const sig = await hmac(payload);
  return btoa(payload).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_") + "." + sig;
}

export async function verifyClubToken(token: string): Promise<{ phone: string } | null> {
  try {
    const [b64, sig] = token.split(".");
    if (!b64 || !sig) return null;
    const padded = b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = atob(padded);
    const [phone, expStr] = payload.split(".");
    const exp = Number(expStr);
    if (!phone || !exp || Date.now() / 1000 > exp) return null;
    const expected = await hmac(payload);
    if (expected !== sig) return null;
    return { phone };
  } catch {
    return null;
  }
}

export function tokenFromRequest(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return null;
}
