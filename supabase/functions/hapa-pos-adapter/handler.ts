// Hapa POS adapter v1 — server-to-server handler.
// Auth: Bearer token (SHA-256 stored server-side) + X-Hapa-Installation header.
// All business logic lives in public.hapa_pos_adapter_v1 RPC (service_role only).

import { createClient } from 'npm:@supabase/supabase-js@2'

const ACTIONS = new Set(['players', 'eligibility', 'debit', 'status', 'reverse'])

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const installation = req.headers.get('X-Hapa-Installation') ?? ''
  if (!token || !installation) {
    return json({ error: 'forbidden' }, 403)
  }

  let body: { action?: unknown; payload?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }
  const action = typeof body?.action === 'string' ? body.action : ''
  if (!ACTIONS.has(action)) {
    return json({ error: 'unknown_action' }, 400)
  }
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {}

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const credentialHash = await sha256Hex(token)
  const { data, error } = await supabase.rpc('hapa_pos_adapter_v1', {
    p_installation: installation,
    p_credential_hash: credentialHash,
    p_action: action,
    p_payload: payload,
  })

  if (error) {
    const msg = error.message ?? ''
    if (msg.includes('hapa_forbidden') || msg.includes('installation')) {
      return json({ error: 'forbidden' }, 403)
    }
    if (msg.includes('hapa_conflict')) {
      return json({ error: 'conflict', detail: msg }, 409)
    }
    if (msg.includes('hapa_invalid')) {
      return json({ error: 'invalid_request', detail: msg }, 400)
    }
    return json({ error: 'adapter_error' }, 502)
  }

  const result = data as { status?: number; body?: unknown } | null
  if (result && typeof result === 'object' && 'status' in result) {
    return json(result.body ?? {}, result.status ?? 200)
  }
  return json(data ?? {}, 200)
}
