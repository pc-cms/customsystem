-- 1) API clients for the external Finance Hub (server-only, hashed tokens)
CREATE TABLE IF NOT EXISTS public.finance_hub_api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  token_sha256 text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  scopes text[] NOT NULL DEFAULT ARRAY['wallets:read','transactions:read'],
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.finance_hub_api_clients FROM anon, authenticated;
GRANT ALL ON public.finance_hub_api_clients TO service_role;
ALTER TABLE public.finance_hub_api_clients ENABLE ROW LEVEL SECURITY;
-- no policies on purpose: only service_role (bypasses RLS) may touch this table

-- lightweight audit of pulls (no financial impact)
CREATE TABLE IF NOT EXISTS public.finance_hub_api_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.finance_hub_api_clients(id) ON DELETE SET NULL,
  mode text NOT NULL,
  rows_returned integer,
  since_cursor timestamptz,
  ok boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.finance_hub_api_audit FROM anon, authenticated;
GRANT ALL ON public.finance_hub_api_audit TO service_role;
ALTER TABLE public.finance_hub_api_audit ENABLE ROW LEVEL SECURITY;

-- 2) Network wallet snapshot — SAME balance rules as fin_balance_snapshot
CREATE OR REPLACE FUNCTION public.finance_hub_wallet_snapshot(p_casino_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_end date := (now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date;
  v_out jsonb;
BEGIN
  WITH cas AS (
    SELECT c.id, c.name FROM casinos c
    WHERE (p_casino_ids IS NULL OR c.id = ANY(p_casino_ids))
  ),
  rates AS (
    SELECT c.id AS casino_id,
           COALESCE(jsonb_object_agg(r.currency, r.rate_to_tzs) FILTER (WHERE r.currency IS NOT NULL), '{}'::jsonb) AS m
    FROM cas c
    LEFT JOIN LATERAL (
      SELECT DISTINCT ON (currency) currency, rate_to_tzs
      FROM fin_daily_rates d
      WHERE d.casino_id = c.id AND d.business_date <= v_end
      ORDER BY currency, business_date DESC
    ) r ON TRUE
    GROUP BY c.id
  ),
  usd AS (
    SELECT c.id AS casino_id,
      COALESCE(
        (SELECT NULLIF((s.exchange_rates->>'USD'),'')::numeric FROM shifts s
          WHERE s.casino_id = c.id AND s.exchange_rates ? 'USD'
            AND COALESCE(s.closed_at, s.opened_at)::date <= v_end
          ORDER BY COALESCE(s.closed_at, s.opened_at) DESC LIMIT 1),
        NULLIF((SELECT (m->>'USD') FROM rates WHERE rates.casino_id = c.id),'')::numeric,
        2600) AS usd_tzs
    FROM cas c
  ),
  tx AS (
    SELECT t.wallet_id,
      SUM(CASE WHEN t.kind IN ('expense','manual_expense','collection','change_out','transfer_out')
               THEN -abs(COALESCE(t.amount,0)) ELSE COALESCE(t.amount,0) END) AS delta_native,
      SUM(CASE WHEN t.kind IN ('expense','manual_expense','collection','change_out','transfer_out')
               THEN -abs(COALESCE(t.amount_tzs,0)) ELSE COALESCE(t.amount_tzs,0) END) AS delta_tzs
    FROM fin_wallet_tx t
    JOIN fin_wallets w2 ON w2.id = t.wallet_id
    JOIN cas c ON c.id = t.casino_id
    WHERE t.posted_at IS NOT NULL
      AND t.business_date <= v_end
      AND (w2.starting_float_date IS NULL OR t.business_date >= w2.starting_float_date)
      AND COALESCE(t.kind,'') <> 'adjustment'
      AND COALESCE(t.ref_table,'') <> 'cash_count'
    GROUP BY t.wallet_id
  ),
  phys AS (
    SELECT DISTINCT ON (s.wallet_id) s.wallet_id, s.physical_total, s.created_at, s.source
    FROM cash_count_snapshots s
    JOIN cas c ON c.id = s.casino_id
    WHERE s.wallet_id IS NOT NULL AND s.created_at::date <= v_end
    ORDER BY s.wallet_id, s.created_at DESC
  )
  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'casino_name', row->>'wallet_group', row->>'name'), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT jsonb_build_object(
      'casino_id', c.id,
      'casino_name', c.name,
      'wallet_id', w.id,
      'canonical_code', w.canonical_code,
      'name', w.name,
      'wallet_group', w.wallet_group,
      'kind', w.kind,
      'currency', w.currency,
      'provider', w.provider,
      'provider_account_ref', w.provider_account_ref,
      'finance_hub_account_id', w.finance_hub_account_id,
      'is_active', w.is_active,
      'is_legacy', COALESCE(w.is_legacy, false),
      'ledger_native', COALESCE(w.starting_float_amount,0) + COALESCE(tx.delta_native,0),
      'ledger_tzs', CASE
        WHEN w.currency='TZS' THEN COALESCE(w.starting_float_amount,0) + COALESCE(tx.delta_tzs,0)
        WHEN w.currency='USD' THEN (COALESCE(w.starting_float_amount,0) + COALESCE(tx.delta_native,0)) * u.usd_tzs
        ELSE COALESCE(w.starting_float_amount,0) * COALESCE(NULLIF((r.m->>w.currency),'')::numeric, 1) + COALESCE(tx.delta_tzs,0)
      END,
      'actual_native', ph.physical_total,
      'actual_tzs', CASE WHEN ph.physical_total IS NULL THEN NULL
        WHEN w.currency='TZS' THEN ph.physical_total
        WHEN w.currency='USD' THEN ph.physical_total * u.usd_tzs
        ELSE ph.physical_total * COALESCE(NULLIF((r.m->>w.currency),'')::numeric, 1) END,
      'physical_asof', ph.created_at,
      'physical_source', ph.source,
      'fx_usd_tzs', u.usd_tzs
    ) AS row
    FROM fin_wallets w
    JOIN cas c ON c.id = w.casino_id
    JOIN usd u ON u.casino_id = c.id
    JOIN rates r ON r.casino_id = c.id
    LEFT JOIN tx ON tx.wallet_id = w.id
    LEFT JOIN phys ph ON ph.wallet_id = w.id
    WHERE w.is_active = TRUE
  ) q;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'as_of_business_date', v_end,
    'wallets', v_out
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_hub_wallet_snapshot(uuid[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_hub_wallet_snapshot(uuid[]) TO service_role;

-- 3) Immutable wallet-ledger export with stable cursor
CREATE OR REPLACE FUNCTION public.finance_hub_transactions(
  p_since timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit,1000),1), 5000);
  v_rows jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'created_at')), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT jsonb_build_object(
      'source_tx_id', t.id,
      'wallet_id', t.wallet_id,
      'wallet_canonical_code', w.canonical_code,
      'casino_id', t.casino_id,
      'business_date', t.business_date,
      'created_at', t.created_at,
      'posted_at', t.posted_at,
      'kind', t.kind,
      'direction', CASE WHEN t.kind IN ('expense','manual_expense','collection','change_out','transfer_out') THEN 'out' ELSE 'in' END,
      'sign', CASE WHEN t.kind IN ('expense','manual_expense','collection','change_out','transfer_out') THEN -1 ELSE 1 END,
      'amount_native', COALESCE(t.amount,0),
      'signed_amount_native', CASE WHEN t.kind IN ('expense','manual_expense','collection','change_out','transfer_out')
                                   THEN -abs(COALESCE(t.amount,0)) ELSE COALESCE(t.amount,0) END,
      'currency', t.currency,
      'fx_rate', t.fx_rate,
      'amount_tzs', t.amount_tzs,
      'signed_amount_tzs', CASE WHEN t.kind IN ('expense','manual_expense','collection','change_out','transfer_out')
                                THEN -abs(COALESCE(t.amount_tzs,0)) ELSE COALESCE(t.amount_tzs,0) END,
      'note', t.note,
      'ref_table', t.ref_table,
      'ref_id', t.ref_id,
      'reversal_of', t.reversal_of
    ) AS x
    FROM fin_wallet_tx t
    LEFT JOIN fin_wallets w ON w.id = t.wallet_id
    WHERE (p_since IS NULL OR t.created_at > p_since)
    ORDER BY t.created_at ASC, t.id ASC
    LIMIT v_limit
  ) s;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'since', p_since,
    'limit', v_limit,
    'count', jsonb_array_length(v_rows),
    'next_cursor', COALESCE((v_rows->-1)->>'created_at', to_char(p_since AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.USOF')),
    'transactions', v_rows
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finance_hub_transactions(timestamptz, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_hub_transactions(timestamptz, integer) TO service_role;