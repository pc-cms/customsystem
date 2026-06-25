-- Casino System — local compatibility repair
-- Idempotent patch for on-prem nodes that were installed before the
-- editable access matrix / disabled-user columns existed.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('cashier', 'pit', 'manager', 'reception');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'surveillance';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'floor_manager';

DO $$ BEGIN
  CREATE TYPE public.day_horizon AS ENUM ('today','7d','30d','all');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.casinos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Local Casino',
  code text NOT NULL DEFAULT 'LOCAL',
  timezone text NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.casinos
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS chip_conservation_mode text NOT NULL DEFAULT 'strict';

INSERT INTO public.casinos (id, name, code, slug, timezone)
VALUES ('00000000-0000-0000-0000-0000000000ca', 'Local Casino', 'LOCAL', 'local', 'Africa/Dar_es_Salaam')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  casino_id uuid,
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS casino_id uuid,
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by uuid;

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_disabled_at ON public.profiles(disabled_at);

CREATE TABLE IF NOT EXISTS public.player_position_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL,
  player_id uuid NOT NULL,
  visit_id uuid,
  table_id uuid,
  position text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer GENERATED ALWAYS AS (
    CASE WHEN ended_at IS NOT NULL
      THEN GREATEST(0, EXTRACT(EPOCH FROM (ended_at - started_at))::int)
      ELSE NULL
    END
  ) STORED,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_position_history_casino_started
  ON public.player_position_history(casino_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_position_history_player_started
  ON public.player_position_history(player_id, started_at DESC);

-- player_drop_split_lifetime: NEP split per player (Drop R = external new money,
-- Drop Recycled = chips returned by previous cashouts). Until full NEP RPC is
-- ported to on-prem, approximate: Drop R = total buy minus cashout, Drop Recycled
-- = min(buy, cashout). Keeps "Drop result" non-zero in Player Statistics.
DO $wrap$
BEGIN
  IF to_regclass('public.transactions') IS NULL THEN
    RAISE NOTICE 'Skipping player_drop_split_lifetime: public.transactions not present yet';
  ELSE
    EXECUTE $ddl$
      CREATE OR REPLACE FUNCTION public.player_drop_split_lifetime(_player_id uuid)
      RETURNS TABLE (drop_r bigint, drop_recycled bigint)
      LANGUAGE sql
      STABLE
      SECURITY INVOKER
      SET search_path = public
      AS $fn$
        WITH s AS (
          SELECT
            COALESCE(SUM(CASE WHEN type IN ('buy','in')      THEN amount END), 0)::bigint AS buy,
            COALESCE(SUM(CASE WHEN type IN ('cashout','out') THEN amount END), 0)::bigint AS cash
          FROM public.transactions
          WHERE player_id = _player_id
        )
        SELECT GREATEST(buy - cash, 0)::bigint AS drop_r,
               LEAST(buy, cash)::bigint        AS drop_recycled
        FROM s
      $fn$;
    $ddl$;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Skipped player_drop_split_lifetime: %', SQLERRM;
END
$wrap$;


DO $$
BEGIN
  BEGIN
    EXECUTE $ddl$
      CREATE OR REPLACE VIEW public.player_economy AS
      SELECT p.id AS player_id, p.casino_id, p.first_name, p.last_name, p.nickname, p.status,
             COALESCE(buy.total, 0) AS total_drop,
             COALESCE(cash.total, 0) AS total_cashout,
             COALESCE(exp.total, 0) AS total_expenses,
             COALESCE(split.drop_r, 0) AS total_drop_r,
             COALESCE(split.drop_recycled, 0) AS total_drop_recycled,
             COALESCE(cash.total, 0) - COALESCE(buy.total, 0) AS result,
             COALESCE(cash.total, 0) - COALESCE(buy.total, 0) - COALESCE(exp.total, 0) AS total,
             COALESCE(cash.total, 0) - COALESCE(buy.total, 0) - COALESCE(exp.total, 0) AS real_result
      FROM public.players p
      LEFT JOIN LATERAL (SELECT SUM(amount) AS total FROM public.transactions WHERE player_id = p.id AND type IN ('buy','in')) buy ON true
      LEFT JOIN LATERAL (SELECT SUM(amount) AS total FROM public.transactions WHERE player_id = p.id AND type IN ('cashout','out')) cash ON true
      LEFT JOIN LATERAL (SELECT SUM(amount) AS total FROM public.expenses WHERE player_id = p.id AND approved = true) exp ON true
      LEFT JOIN LATERAL (SELECT * FROM public.player_drop_split_lifetime(p.id)) split ON true
    $ddl$;
    EXECUTE 'ALTER VIEW public.player_economy SET (security_invoker = true)';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipped player_economy view repair: %', SQLERRM;
  END;

  BEGIN
    EXECUTE $ddl$
      CREATE OR REPLACE VIEW public.player_session_stats AS
      SELECT s.casino_id, s.player_id, s.table_id,
             COUNT(*) AS session_count,
             COALESCE(SUM(s.hands_played), 0) AS hands,
             COALESCE(SUM(s.duration_minutes), 0) AS minutes,
             COALESCE(SUM(s.total_bet), 0) AS total_bet_sum,
             COALESCE(SUM((s.avg_bet)::numeric * s.hands_played), 0) AS bet_sum_by_avg,
             MIN(s.started_at) AS first_session_at,
             MAX(COALESCE(s.stopped_at, s.started_at)) AS last_session_at
      FROM public.client_sessions s
      GROUP BY s.casino_id, s.player_id, s.table_id
    $ddl$;
    EXECUTE 'ALTER VIEW public.player_session_stats SET (security_invoker = true)';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipped player_session_stats view repair: %', SQLERRM;
  END;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_casino_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT casino_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.user_has_casino_access(_user_id uuid, _casino_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _user_id
       AND role IN ('super_admin'::public.app_role, 'finance_manager'::public.app_role)
    UNION ALL
    SELECT 1 FROM public.profiles
     WHERE user_id = _user_id AND casino_id = _casino_id
    UNION ALL
    SELECT 1 FROM public.user_casino_access
     WHERE user_id = _user_id AND casino_id = _casino_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_manager_op(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = _uid
       AND role IN ('manager'::public.app_role, 'floor_manager'::public.app_role, 'super_admin'::public.app_role)
  )
$$;

CREATE TABLE IF NOT EXISTS public.user_casino_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  casino_id uuid NOT NULL,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_casino_access
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS casino_id uuid,
  ADD COLUMN IF NOT EXISTS granted_by uuid,
  ADD COLUMN IF NOT EXISTS granted_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS user_casino_access_user_casino_key
  ON public.user_casino_access(user_id, casino_id);

CREATE TABLE IF NOT EXISTS public.user_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_key text NOT NULL,
  can_view boolean,
  can_write boolean,
  day_horizon public.day_horizon,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, module_key)
);

ALTER TABLE public.user_module_permissions
  ADD COLUMN IF NOT EXISTS can_write boolean,
  ADD COLUMN IF NOT EXISTS day_horizon public.day_horizon;
ALTER TABLE public.user_module_permissions ALTER COLUMN can_view DROP NOT NULL;
ALTER TABLE public.user_module_permissions ALTER COLUMN can_write DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.role_module_defaults (
  role public.app_role NOT NULL,
  module_key text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_write boolean NOT NULL DEFAULT false,
  day_horizon public.day_horizon NOT NULL DEFAULT 'today',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, module_key)
);

CREATE OR REPLACE FUNCTION public.effective_module_perms(p_user_id uuid)
RETURNS TABLE (module_key text, can_view boolean, can_write boolean, day_horizon public.day_horizon)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ur AS (
    SELECT role FROM public.user_roles WHERE user_id = p_user_id
  ),
  role_merge AS (
    SELECT
      d.module_key,
      bool_or(d.can_view)  AS can_view,
      bool_or(d.can_write) AS can_write,
      (ARRAY_AGG(d.day_horizon ORDER BY
        CASE d.day_horizon WHEN 'all' THEN 4 WHEN '30d' THEN 3 WHEN '7d' THEN 2 ELSE 1 END DESC))[1]
        AS day_horizon
    FROM public.role_module_defaults d
    JOIN ur ON ur.role = d.role
    GROUP BY d.module_key
  ),
  ovr AS (
    SELECT module_key, can_view, can_write, day_horizon
    FROM public.user_module_permissions
    WHERE user_id = p_user_id
  )
  SELECT
    COALESCE(o.module_key, r.module_key) AS module_key,
    COALESCE(o.can_view,  r.can_view,  false) AS can_view,
    COALESCE(o.can_write, r.can_write, false) AS can_write,
    COALESCE(o.day_horizon, r.day_horizon, 'today'::public.day_horizon) AS day_horizon
  FROM role_merge r
  FULL OUTER JOIN ovr o ON o.module_key = r.module_key;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_casino_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_module_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own profile" ON public.profiles;
CREATE POLICY "Users see own profile" ON public.profiles
FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Super admins see all profiles" ON public.profiles;
CREATE POLICY "Super admins see all profiles" ON public.profiles
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Users see casino profiles" ON public.profiles;
CREATE POLICY "Users see casino profiles" ON public.profiles
FOR SELECT TO authenticated USING (casino_id = public.get_user_casino_id(auth.uid()));

DROP POLICY IF EXISTS "Users see own roles" ON public.user_roles;
CREATE POLICY "Users see own roles" ON public.user_roles
FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Super admins see all roles" ON public.user_roles;
CREATE POLICY "Super admins see all roles" ON public.user_roles
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Managers see roles for same casino" ON public.user_roles;
CREATE POLICY "Managers see roles for same casino" ON public.user_roles
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = user_roles.user_id AND p.casino_id = public.get_user_casino_id(auth.uid()))
);

DROP POLICY IF EXISTS "Users read own casino access" ON public.user_casino_access;
CREATE POLICY "Users read own casino access" ON public.user_casino_access
FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Global roles read casino access" ON public.user_casino_access;
CREATE POLICY "Global roles read casino access" ON public.user_casino_access
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'finance_manager'::public.app_role)
);

DROP POLICY IF EXISTS "Managers see own casino access" ON public.user_casino_access;
CREATE POLICY "Managers see own casino access" ON public.user_casino_access
FOR SELECT TO authenticated USING (casino_id = public.get_user_casino_id(auth.uid()));

DROP POLICY IF EXISTS "All authenticated read role defaults" ON public.role_module_defaults;
CREATE POLICY "All authenticated read role defaults" ON public.role_module_defaults
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users read own module permissions" ON public.user_module_permissions;
CREATE POLICY "Users read own module permissions" ON public.user_module_permissions
FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Super admins manage module permissions" ON public.user_module_permissions;
CREATE POLICY "Super admins manage module permissions" ON public.user_module_permissions
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DO $$
BEGIN
  IF to_regclass('public.table_daily_results') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Local users see daily results" ON public.table_daily_results';
    EXECUTE 'CREATE POLICY "Local users see daily results" ON public.table_daily_results FOR SELECT TO authenticated USING (public.user_has_casino_access(auth.uid(), casino_id))';
  END IF;
  IF to_regclass('public.business_day_closures') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Local users see business day closures" ON public.business_day_closures';
    EXECUTE 'CREATE POLICY "Local users see business day closures" ON public.business_day_closures FOR SELECT TO authenticated USING (public.user_has_casino_access(auth.uid(), casino_id))';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT ON public.casinos, public.profiles, public.user_roles, public.user_casino_access,
      public.role_module_defaults, public.user_module_permissions TO authenticated;
    GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.get_user_casino_id(uuid) TO authenticated;
    GRANT EXECUTE ON FUNCTION public.effective_module_perms(uuid) TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON public.casinos, public.profiles, public.user_roles, public.user_casino_access,
      public.role_module_defaults, public.user_module_permissions TO service_role;
  END IF;
END $$;

DO $$
DECLARE
  v_sa uuid;
  v_casino uuid;
BEGIN
  IF to_regclass('auth.users') IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_sa FROM auth.users WHERE email = 'superadmin@cms.local' LIMIT 1;
  SELECT COALESCE(
    (SELECT casino_id FROM public.profiles WHERE user_id = v_sa LIMIT 1),
    (SELECT id FROM public.casinos WHERE slug = 'local' LIMIT 1),
    (SELECT id FROM public.casinos ORDER BY created_at LIMIT 1),
    '00000000-0000-0000-0000-0000000000ca'::uuid
  ) INTO v_casino;

  IF v_sa IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_sa, 'super_admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.profiles (user_id, casino_id, display_name)
    VALUES (v_sa, v_casino, 'Super Admin')
    ON CONFLICT (user_id) DO UPDATE
      SET casino_id = COALESCE(public.profiles.casino_id, EXCLUDED.casino_id),
          display_name = COALESCE(NULLIF(public.profiles.display_name, ''), EXCLUDED.display_name);

    INSERT INTO public.user_casino_access (user_id, casino_id, granted_by)
    VALUES (v_sa, v_casino, v_sa)
    ON CONFLICT (user_id, casino_id) DO NOTHING;
  END IF;
END $$;

-- ── cloud_connection: required by pair-cli.js ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.cloud_connection (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  cloud_url text,
  status text NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('disconnected','pairing','connected')),
  pairing_id uuid,
  pairing_code text,
  pairing_expires_at timestamptz,
  casino_id uuid,
  sync_secret text,
  connected_at timestamptz,
  last_polled_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.cloud_connection (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.cloud_connection_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cloud_connection_touch ON public.cloud_connection;
CREATE TRIGGER trg_cloud_connection_touch
  BEFORE UPDATE ON public.cloud_connection
  FOR EACH ROW EXECUTE FUNCTION public.cloud_connection_touch();

-- ── peer mesh core: required by cms-sync and pair-cli.js ───────────────────
CREATE TABLE IF NOT EXISTS public.node_identity (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  node_id uuid NOT NULL DEFAULT gen_random_uuid(),
  display_name text NOT NULL DEFAULT 'Local Server',
  node_kind text NOT NULL DEFAULT 'local' CHECK (node_kind IN ('local','cloud')),
  schema_version text NOT NULL DEFAULT '0.0.0',
  owned_casino_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.node_identity
  ADD COLUMN IF NOT EXISTS node_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT 'Local Server',
  ADD COLUMN IF NOT EXISTS node_kind text NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS schema_version text NOT NULL DEFAULT '0.0.0',
  ADD COLUMN IF NOT EXISTS owned_casino_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

INSERT INTO public.node_identity (id, display_name, node_kind)
VALUES (true, 'Local Server', 'local')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.peer_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peer_url text NOT NULL,
  peer_node_id uuid,
  display_name text NOT NULL DEFAULT 'Peer',
  sync_secret text NOT NULL,
  status text NOT NULL DEFAULT 'pending_outbound',
  schema_version text,
  last_seen_at timestamptz,
  last_push_cursor bigint NOT NULL DEFAULT 0,
  last_pull_cursor bigint NOT NULL DEFAULT 0,
  last_push_error text,
  last_pull_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.peer_links
  ADD COLUMN IF NOT EXISTS peer_url text,
  ADD COLUMN IF NOT EXISTS peer_node_id uuid,
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT 'Peer',
  ADD COLUMN IF NOT EXISTS sync_secret text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending_outbound',
  ADD COLUMN IF NOT EXISTS schema_version text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_push_cursor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_pull_cursor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_push_error text,
  ADD COLUMN IF NOT EXISTS last_pull_error text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS peer_links_status_idx ON public.peer_links(status);
CREATE INDEX IF NOT EXISTS peer_links_last_seen_idx ON public.peer_links(last_seen_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS peer_links_peer_node_id_key
  ON public.peer_links(peer_node_id) WHERE peer_node_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.touch_peer_links()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_peer_links_touch ON public.peer_links;
CREATE TRIGGER trg_peer_links_touch
  BEFORE UPDATE ON public.peer_links
  FOR EACH ROW EXECUTE FUNCTION public.touch_peer_links();

DROP TRIGGER IF EXISTS trg_node_identity_touch ON public.node_identity;
CREATE TRIGGER trg_node_identity_touch
  BEFORE UPDATE ON public.node_identity
  FOR EACH ROW EXECUTE FUNCTION public.touch_peer_links();

ALTER TABLE public.node_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "node_identity readable to authenticated" ON public.node_identity;
CREATE POLICY "node_identity readable to authenticated" ON public.node_identity
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "node_identity writable to super_admin" ON public.node_identity;
CREATE POLICY "node_identity writable to super_admin" ON public.node_identity
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "peer_links readable to authenticated" ON public.peer_links;
CREATE POLICY "peer_links readable to authenticated" ON public.peer_links
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "peer_links writable to super_admin" ON public.peer_links;
CREATE POLICY "peer_links writable to super_admin" ON public.peer_links
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- ── sync_outbox compatibility for peer mesh loop-prevention ────────────────
CREATE TABLE IF NOT EXISTS public.sync_outbox (
  id bigserial PRIMARY KEY,
  casino_id uuid,
  table_name text NOT NULL,
  op text NOT NULL CHECK (op IN ('INSERT','UPDATE','DELETE')),
  pk jsonb NOT NULL,
  payload jsonb,
  changed_at timestamptz NOT NULL DEFAULT now(),
  origin_node_id uuid
);

ALTER TABLE public.sync_outbox
  ADD COLUMN IF NOT EXISTS casino_id uuid,
  ADD COLUMN IF NOT EXISTS table_name text,
  ADD COLUMN IF NOT EXISTS op text,
  ADD COLUMN IF NOT EXISTS pk jsonb,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS origin_node_id uuid;

CREATE INDEX IF NOT EXISTS idx_sync_outbox_casino_changed ON public.sync_outbox(casino_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_changed ON public.sync_outbox(changed_at);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_origin ON public.sync_outbox(origin_node_id);

CREATE OR REPLACE FUNCTION public.sync_capture_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_casino_id uuid;
  v_row jsonb;
  v_payload jsonb;
  v_origin uuid;
  v_supplied text;
BEGIN
  IF current_setting('sync.applying', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_row := to_jsonb(OLD);
    v_payload := NULL;
  ELSE
    v_row := to_jsonb(NEW);
    v_payload := v_row;
  END IF;

  BEGIN
    v_casino_id := NULLIF(v_row->>'casino_id','')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_casino_id := NULL;
  END;

  v_supplied := current_setting('sync.origin_node_id', true);
  IF v_supplied IS NOT NULL AND v_supplied <> '' THEN
    BEGIN
      v_origin := v_supplied::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_origin := NULL;
    END;
  END IF;
  IF v_origin IS NULL THEN
    SELECT node_id INTO v_origin FROM public.node_identity WHERE id = true;
  END IF;

  INSERT INTO public.sync_outbox (casino_id, table_name, op, pk, payload, origin_node_id)
  VALUES (v_casino_id, TG_TABLE_NAME, TG_OP, jsonb_build_object('id', v_row->'id'), v_payload, v_origin);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_attach(p_table regclass)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS trg_sync_capture ON %s', p_table);
  EXECUTE format(
    'CREATE TRIGGER trg_sync_capture AFTER INSERT OR UPDATE OR DELETE ON %s
       FOR EACH ROW EXECUTE FUNCTION public.sync_capture_change()',
    p_table
  );
END;
$$;

-- ---------- player_daily_zones (Pit zone highlighting) ----------
CREATE TABLE IF NOT EXISTS public.player_daily_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id uuid NOT NULL,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  zone text NOT NULL CHECK (zone IN ('S','LG','CP')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casino_id, player_id, business_date)
);
CREATE INDEX IF NOT EXISTS player_daily_zones_casino_date_idx
  ON public.player_daily_zones (casino_id, business_date);
CREATE INDEX IF NOT EXISTS player_daily_zones_player_idx
  ON public.player_daily_zones (player_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_daily_zones TO authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON public.player_daily_zones TO service_role;
  END IF;
END $$;

ALTER TABLE public.player_daily_zones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zones_select_authenticated" ON public.player_daily_zones;
CREATE POLICY "zones_select_authenticated"
  ON public.player_daily_zones FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "zones_write_ops_roles" ON public.player_daily_zones;
CREATE POLICY "zones_write_ops_roles"
  ON public.player_daily_zones FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'pit'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'reception'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "zones_update_ops_roles" ON public.player_daily_zones;
CREATE POLICY "zones_update_ops_roles"
  ON public.player_daily_zones FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'pit'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'reception'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'pit'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'reception'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "zones_delete_ops_roles" ON public.player_daily_zones;
CREATE POLICY "zones_delete_ops_roles"
  ON public.player_daily_zones FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'pit'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'reception'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

DO $$ BEGIN
  CREATE TRIGGER update_player_daily_zones_updated_at
    BEFORE UPDATE ON public.player_daily_zones
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;



DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'casinos','gaming_tables','chip_color_settings',
    'chip_initial_baseline','chip_baseline','chip_inventory','chip_snapshots',
    'financial_wallets','budget_categories','budget_periods','budget_items',
    'dealers','staff_members','employees','employee_bank_accounts',
    'profiles','user_casino_access','user_module_permissions','player_daily_zones',
    'players','player_cards','player_groups','group_members','player_tags','player_notes',
    'transactions','shifts','cage_transfers','expenses','wallet_transactions',
    'chip_emissions','chip_transfers','casino_visits',
    'breaklist','breaklist_logs','pit_rota','staff_rota',
    'dealer_attendance','staff_attendance','attendance_hours','attendance_holidays',
    'table_tracker','table_daily_results',
    'business_day_closures','cash_counts','cash_count_snapshots','cashless_transactions',
    'bank_checks','cctv_observations','player_position_history','daily_summaries',
    'inter_casino_transfers','activity_logs','daily_review','blacklist',
    'client_sessions','incidents',
    'payroll_settings','payroll_periods','payroll_entries',
    'monthly_tips_pools','monthly_tips_entries',
    'weekly_bonus_pools','weekly_bonus_entries',
    'player_daily_zones'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      PERFORM public.sync_attach(format('public.%I', t)::regclass);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.sync_outbox_gc()
RETURNS void LANGUAGE sql SET search_path = public AS $$
  DELETE FROM public.sync_outbox WHERE changed_at < now() - INTERVAL '30 days';
$$;

CREATE TABLE IF NOT EXISTS public.sync_seed_marker (
  casino_id uuid NOT NULL,
  table_name text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (casino_id, table_name)
);

CREATE OR REPLACE FUNCTION public.sync_reset_outbox(p_casino_id uuid, p_advance_cursors boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint;
  v_max_id bigint;
BEGIN
  IF p_casino_id IS NULL THEN
    RAISE EXCEPTION 'casino_id required';
  END IF;

  DELETE FROM public.sync_outbox WHERE casino_id = p_casino_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  DELETE FROM public.sync_seed_marker WHERE casino_id = p_casino_id;

  IF p_advance_cursors THEN
    SELECT COALESCE(MAX(id), 0) INTO v_max_id FROM public.sync_outbox;
    UPDATE public.peer_links SET last_push_cursor = GREATEST(last_push_cursor, v_max_id);
  END IF;

  RETURN jsonb_build_object('deleted_outbox_rows', v_deleted, 'advanced_cursor_to', COALESCE(v_max_id, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.peer_apply_change(
  p_origin_node_id uuid,
  p_table text,
  p_op text,
  p_pk jsonb,
  p_payload jsonb,
  p_changed_at timestamptz
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text;
  v_sql text;
  v_cols text[];
  v_setlist text;
  v_existing_updated_at timestamptz;
  v_incoming_updated_at timestamptz;
  v_id_type text;
  v_payload jsonb := p_payload;
  v_fk_col text;
  v_retry boolean;
  v_attempt int := 0;
BEGIN
  IF p_table = 'casinos' THEN
    RETURN;
  END IF;

  IF p_table !~ '^[a-z_][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'invalid table name';
  END IF;

  IF to_regclass(format('public.%I', p_table)) IS NULL THEN
    RETURN;
  END IF;

  SELECT data_type INTO v_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = p_table
    AND column_name = 'id'
  LIMIT 1;

  IF v_id_type IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('sync.applying','on', true);
  PERFORM set_config('sync.origin_node_id', p_origin_node_id::text, true);

  v_id := p_pk->>'id';

  IF p_op = 'DELETE' THEN
    IF v_id_type = 'uuid' THEN
      EXECUTE format('DELETE FROM public.%I WHERE id = $1::uuid', p_table) USING v_id;
    ELSE
      EXECUTE format('DELETE FROM public.%I WHERE id = $1', p_table) USING v_id;
    END IF;
    RETURN;
  END IF;

  IF v_payload ? 'updated_at' THEN
    BEGIN
      v_incoming_updated_at := (v_payload->>'updated_at')::timestamptz;
      IF v_id_type = 'uuid' THEN
        EXECUTE format('SELECT updated_at FROM public.%I WHERE id = $1::uuid', p_table)
          INTO v_existing_updated_at USING v_id;
      ELSE
        EXECUTE format('SELECT updated_at FROM public.%I WHERE id = $1', p_table)
          INTO v_existing_updated_at USING v_id;
      END IF;
      IF v_existing_updated_at IS NOT NULL
         AND v_incoming_updated_at IS NOT NULL
         AND v_existing_updated_at > v_incoming_updated_at THEN
        RETURN;
      END IF;
    EXCEPTION WHEN undefined_column OR invalid_text_representation THEN
      NULL;
    END;
  END IF;

  <<retry_loop>>
  LOOP
    v_attempt := v_attempt + 1;
    EXIT WHEN v_attempt > 6;

    -- Build column list: only columns that exist AND are not GENERATED ALWAYS
    SELECT array_agg(k) INTO v_cols
    FROM jsonb_object_keys(v_payload) k
    WHERE EXISTS (
      SELECT 1
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = p_table
        AND c.column_name = k
        AND c.is_generated = 'NEVER'
    );

    IF v_cols IS NULL OR array_length(v_cols,1) = 0 THEN RETURN; END IF;

    SELECT string_agg(format('%I = EXCLUDED.%I', c, c), ', ')
      INTO v_setlist
      FROM unnest(v_cols) c
      WHERE c <> 'id';

    v_sql := format(
      'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) ON CONFLICT (id) DO UPDATE SET %s',
      p_table,
      (SELECT string_agg(format('%I', c), ',') FROM unnest(v_cols) c),
      (SELECT string_agg(format('%I', c), ',') FROM unnest(v_cols) c),
      p_table,
      COALESCE(v_setlist, format('%I = EXCLUDED.%I', v_cols[1], v_cols[1]))
    );

    v_retry := false;
    BEGIN
      EXECUTE v_sql USING v_payload;
      RETURN;
    EXCEPTION
      WHEN undefined_column OR datatype_mismatch OR invalid_text_representation THEN
        RETURN;
      WHEN foreign_key_violation THEN
        -- Try common user-FK columns in payload — if any is present and
        -- non-null, NULL it and retry. Lets cross-environment rows land even
        -- when the referenced auth.user / employee doesn't exist locally.
        FOREACH v_fk_col IN ARRAY ARRAY[
          'issued_by','operator_id','created_by','updated_by','locked_by',
          'recorded_by','approved_by','closed_by','requested_by','confirmed_by',
          'cancelled_by','received_by','sent_by','employee_id','dealer_id','staff_id'
        ] LOOP
          IF v_payload ? v_fk_col AND v_payload->>v_fk_col IS NOT NULL THEN
            v_payload := v_payload || jsonb_build_object(v_fk_col, NULL);
            v_retry := true;
            EXIT;
          END IF;
        END LOOP;
        IF NOT v_retry THEN RETURN; END IF;
        CONTINUE retry_loop;
    END;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.peer_apply_change(uuid,text,text,jsonb,jsonb,timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.peer_apply_change(uuid,text,text,jsonb,jsonb,timestamptz) TO service_role;

NOTIFY pgrst, 'reload schema';
-- ─────────────────────────────────────────────────────────────
-- v1.3.49+ Mirror Health & Diagnostics (idempotent backfill)
-- Local servers installed before these RPCs need them so cms-sync
-- can record push/pull/apply outcomes without erroring.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sync_peer_health (
  peer_link_id uuid PRIMARY KEY,
  peer_node_id uuid,
  peer_name text,
  state text NOT NULL DEFAULT 'pairing',
  last_heartbeat_at timestamptz,
  last_push_ok_at timestamptz,
  last_pull_ok_at timestamptz,
  last_apply_ok_at timestamptz,
  last_probe_latency_ms integer,
  last_probe_at timestamptz,
  pending_outbox_count integer NOT NULL DEFAULT 0,
  remote_lag_seconds integer,
  schema_version_local text,
  schema_version_remote text,
  apply_errors_count integer NOT NULL DEFAULT 0,
  last_error_code text,
  last_error_text text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sync_apply_errors (
  id bigserial PRIMARY KEY,
  peer_link_id uuid,
  peer_name text,
  source_outbox_id bigint,
  table_name text NOT NULL,
  op text,
  pk jsonb,
  payload_hash text,
  error_code text NOT NULL,
  error_text text,
  attempts integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  resolution    text
);
CREATE INDEX IF NOT EXISTS idx_apply_errors_unresolved
  ON public.sync_apply_errors (resolved_at NULLS FIRST, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.sync_probe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  peer_link_id uuid,
  direction text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  ack_at  timestamptz,
  status  text NOT NULL DEFAULT 'pending',
  latency_ms integer,
  error_text text
);

CREATE OR REPLACE FUNCTION public.sync_record_health(
  p_peer_link_id uuid,
  p_state text,
  p_heartbeat_at timestamptz DEFAULT now(),
  p_pending_outbox integer DEFAULT NULL,
  p_remote_lag_seconds integer DEFAULT NULL,
  p_schema_version_local text DEFAULT NULL,
  p_schema_version_remote text DEFAULT NULL,
  p_last_error_code text DEFAULT NULL,
  p_last_error_text text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text; v_node uuid;
BEGIN
  SELECT display_name, peer_node_id INTO v_name, v_node
    FROM public.peer_links WHERE id = p_peer_link_id;
  INSERT INTO public.sync_peer_health AS h
    (peer_link_id, peer_node_id, peer_name, state, last_heartbeat_at,
     pending_outbox_count, remote_lag_seconds,
     schema_version_local, schema_version_remote,
     last_error_code, last_error_text, updated_at)
  VALUES
    (p_peer_link_id, v_node, v_name, p_state, p_heartbeat_at,
     COALESCE(p_pending_outbox,0), p_remote_lag_seconds,
     p_schema_version_local, p_schema_version_remote,
     p_last_error_code, p_last_error_text, now())
  ON CONFLICT (peer_link_id) DO UPDATE SET
    peer_node_id = COALESCE(EXCLUDED.peer_node_id, h.peer_node_id),
    peer_name = COALESCE(EXCLUDED.peer_name, h.peer_name),
    state = EXCLUDED.state,
    last_heartbeat_at = EXCLUDED.last_heartbeat_at,
    pending_outbox_count = COALESCE(EXCLUDED.pending_outbox_count, h.pending_outbox_count),
    remote_lag_seconds = COALESCE(EXCLUDED.remote_lag_seconds, h.remote_lag_seconds),
    schema_version_local = COALESCE(EXCLUDED.schema_version_local, h.schema_version_local),
    schema_version_remote = COALESCE(EXCLUDED.schema_version_remote, h.schema_version_remote),
    last_error_code = EXCLUDED.last_error_code,
    last_error_text = EXCLUDED.last_error_text,
    updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.sync_record_apply_ok(p_peer_link_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.sync_peer_health SET last_apply_ok_at = now(), updated_at = now()
   WHERE peer_link_id = p_peer_link_id;
$$;

CREATE OR REPLACE FUNCTION public.sync_record_push_ok(p_peer_link_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.sync_peer_health SET last_push_ok_at = now(), updated_at = now()
   WHERE peer_link_id = p_peer_link_id;
$$;

CREATE OR REPLACE FUNCTION public.sync_record_pull_ok(p_peer_link_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.sync_peer_health SET last_pull_ok_at = now(), updated_at = now()
   WHERE peer_link_id = p_peer_link_id;
$$;

CREATE OR REPLACE FUNCTION public.sync_record_apply_error(
  p_peer_link_id uuid,
  p_source_outbox_id bigint,
  p_table text,
  p_op text,
  p_pk jsonb,
  p_payload_hash text,
  p_error_code text,
  p_error_text text
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint; v_name text;
BEGIN
  SELECT display_name INTO v_name FROM public.peer_links WHERE id = p_peer_link_id;
  INSERT INTO public.sync_apply_errors
    (peer_link_id, peer_name, source_outbox_id, table_name, op, pk, payload_hash, error_code, error_text)
  VALUES
    (p_peer_link_id, v_name, p_source_outbox_id, p_table, p_op, p_pk, p_payload_hash, p_error_code, p_error_text)
  RETURNING id INTO v_id;

  UPDATE public.sync_peer_health
     SET apply_errors_count = apply_errors_count + 1,
         last_error_code = p_error_code,
         last_error_text = p_error_text,
         updated_at = now()
   WHERE peer_link_id = p_peer_link_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.sync_record_probe_sent(
  p_peer_link_id uuid, p_direction text DEFAULT 'out'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.sync_probe_events (peer_link_id, direction)
  VALUES (p_peer_link_id, p_direction) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.sync_record_probe_ack(
  p_probe_id uuid, p_status text DEFAULT 'ok', p_error_text text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sent timestamptz; v_peer uuid; v_lat integer;
BEGIN
  SELECT sent_at, peer_link_id INTO v_sent, v_peer FROM public.sync_probe_events WHERE id = p_probe_id;
  IF v_sent IS NULL THEN RETURN; END IF;
  v_lat := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_sent)) * 1000)::int;
  UPDATE public.sync_probe_events
     SET ack_at = now(), status = p_status, latency_ms = v_lat, error_text = p_error_text
   WHERE id = p_probe_id;
  UPDATE public.sync_peer_health
     SET last_probe_at = now(), last_probe_latency_ms = v_lat, updated_at = now()
   WHERE peer_link_id = v_peer;
END $$;

CREATE OR REPLACE FUNCTION public.sync_diagnostics_gc()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.sync_apply_errors WHERE last_seen_at < now() - interval '90 days';
  DELETE FROM public.sync_probe_events  WHERE sent_at      < now() - interval '30 days';
$$;

GRANT EXECUTE ON FUNCTION public.sync_record_health(uuid,text,timestamptz,integer,integer,text,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_record_apply_error(uuid,bigint,text,text,jsonb,text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_record_apply_ok(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_record_push_ok(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_record_pull_ok(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_record_probe_sent(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_record_probe_ack(uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_diagnostics_gc() TO authenticated, service_role;
