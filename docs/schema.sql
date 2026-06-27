-- =============================================================================
-- Yantresh Commerce — Control-Plane (Configuration) Schema
-- Canonical, ORM-agnostic PostgreSQL 16 DDL. Source of truth for tenant config.
--
-- This is the CONTROL PLANE only: tenant identity, branding, domains, plugin
-- selection, catalog sources, feature flags, secrets, RBAC, audit.
--
-- It is NOT the commerce data model. Carts, orders, products, inventory,
-- promotions and payments live in Medusa v2 (its own MikroORM schema), scoped
-- per tenant via a Medusa Sales Channel + publishable API key. The mapping is
-- held in tenant.commerce_sales_channel_id / tenant.commerce_pub_key_ref below.
--
-- Conventions:
--   * UUID v7-style PKs (gen_random_uuid() acceptable; v7 preferred for locality)
--   * created_at / updated_at on every table; updated_at maintained by trigger
--   * Every tenant-scoped row carries tenant_id and is protected by RLS
--   * Secrets are NEVER stored here in plaintext — only secret refs (see `secret`)
--   * JSONB columns are validated at the app boundary by Zod (see contracts.ts)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";   -- case-insensitive hostnames/emails

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
CREATE TYPE tenant_status AS ENUM ('draft', 'active', 'suspended', 'archived');
CREATE TYPE domain_status AS ENUM ('pending', 'verifying', 'active', 'error');
CREATE TYPE deploy_mode AS ENUM ('shared_runtime', 'generated_app'); -- §2 tenancy model
CREATE TYPE plugin_kind AS ENUM (
  'payment', 'delivery', 'pickup', 'loyalty', 'coupon',
  'catalog_source', 'inventory_sync', 'layout_module', 'analytics', 'notification'
);
CREATE TYPE catalog_source_kind AS ENUM ('google_sheet', 'csv', 'pos', 'http_api', 'medusa_native');
CREATE TYPE sync_status AS ENUM ('queued', 'running', 'success', 'partial', 'failed');
CREATE TYPE membership_role AS ENUM ('platform_owner', 'platform_staff', 'client_admin', 'client_staff', 'read_only');
CREATE TYPE flag_value_type AS ENUM ('boolean', 'string', 'number', 'json', 'variant');

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. TENANT — the "source/config record" that drives a client website
-- =============================================================================
CREATE TABLE tenant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug citext NOT NULL UNIQUE,            -- e.g. 'demo-client' -> demo-client.yantresh.com
  legal_name text,
  display_name text NOT NULL,             -- website name shown to shoppers
  status tenant_status NOT NULL DEFAULT 'draft',
  deploy_mode deploy_mode NOT NULL DEFAULT 'shared_runtime',

  -- About / storefront copy (structured, not marketing-managed here)
  about jsonb NOT NULL DEFAULT '{}'::jsonb, -- { tagline, description, hours, address, contact, socials }
  locale text NOT NULL DEFAULT 'en',
  currency_code char(3) NOT NULL DEFAULT 'USD',
  timezone text NOT NULL DEFAULT 'UTC',

  -- Commerce engine binding (Medusa v2). Soft-multitenant in MVP.
  commerce_sales_channel_id text,         -- Medusa sales_channel id
  commerce_region_id text,                -- Medusa region id
  commerce_pub_key_ref text,              -- secret key referencing `secret.key` for the publishable API key

  -- Config versioning — lets the generator pin/diff a frozen config
  config_version integer NOT NULL DEFAULT 1,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE TRIGGER trg_tenant_updated BEFORE UPDATE ON tenant
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE tenant IS 'One row per client. The complete config a storefront needs is reachable from this row.';

-- =============================================================================
-- 2. DOMAIN — hostnames -> tenant resolution (subdomain or custom domain)
-- =============================================================================
CREATE TABLE domain (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  hostname citext NOT NULL UNIQUE,        -- 'demo-client.yantresh.com' or 'shop.acme.com'
  is_primary boolean NOT NULL DEFAULT false,
  is_subdomain boolean NOT NULL DEFAULT true, -- *.yantresh.com vs BYO domain
  status domain_status NOT NULL DEFAULT 'pending',
  tls_mode text NOT NULL DEFAULT 'auto',  -- caddy/traefik ACME
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_primary_domain_per_tenant
  ON domain(tenant_id) WHERE is_primary;
CREATE INDEX domain_tenant_idx ON domain(tenant_id);
CREATE TRIGGER trg_domain_updated BEFORE UPDATE ON domain
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 3. THEME — branding tokens (design-system-driven, not free CSS)
-- =============================================================================
CREATE TABLE theme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  preset text NOT NULL DEFAULT 'base',    -- named layout/skin preset in packages/ui
  tokens jsonb NOT NULL DEFAULT '{}'::jsonb, -- { colors{}, fonts{}, radius, spacingScale, ... } -> CSS vars
  logo_url text,
  favicon_url text,
  og_image_url text,
  custom_css text,                        -- escape hatch; sanitized + scoped, off by default
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX theme_tenant_idx ON theme(tenant_id);
CREATE TRIGGER trg_theme_updated BEFORE UPDATE ON theme
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 4. HOMEPAGE_BLOCK — configurable homepage / layout modules (ordered slots)
-- =============================================================================
CREATE TABLE homepage_block (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  page text NOT NULL DEFAULT 'home',      -- home | category | about | ...
  block_type text NOT NULL,               -- 'hero' | 'featured_grid' | 'promo_banner' | 'category_rail' | plugin-provided
  provided_by text,                       -- plugin key if this block comes from a layout_module plugin
  position integer NOT NULL DEFAULT 0,
  config jsonb NOT NULL DEFAULT '{}'::jsonb, -- block-specific props, validated by the block's Zod schema
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX homepage_block_tenant_page_idx ON homepage_block(tenant_id, page, position);
CREATE TRIGGER trg_homepage_block_updated BEFORE UPDATE ON homepage_block
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 5. PLUGIN — registry of plugins AVAILABLE on the platform (global catalog)
-- =============================================================================
CREATE TABLE plugin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,               -- 'payment-stripe', 'catalog-google-sheets'
  kind plugin_kind NOT NULL,
  display_name text NOT NULL,
  version text NOT NULL,                   -- semver of the installed plugin package
  config_schema jsonb NOT NULL DEFAULT '{}'::jsonb, -- JSON Schema mirror of the plugin's Zod config (for admin form gen)
  secret_keys text[] NOT NULL DEFAULT '{}', -- names of secrets this plugin requires (see `secret`)
  capabilities text[] NOT NULL DEFAULT '{}', -- e.g. {'payment.authorize','payment.capture'}
  requires text[] NOT NULL DEFAULT '{}',  -- capability/plugin dependencies, e.g. {'cart'}
  is_listed boolean NOT NULL DEFAULT true, -- available for selection in admin
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_plugin_updated BEFORE UPDATE ON plugin
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 6. TENANT_PLUGIN — which plugins are ENABLED per tenant, with config
-- (payment providers & delivery/pickup options are modeled here too)
-- =============================================================================
CREATE TABLE tenant_plugin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  plugin_id uuid NOT NULL REFERENCES plugin(id) ON DELETE RESTRICT,
  is_enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb, -- non-secret per-tenant config; Zod-validated against plugin schema
  position integer NOT NULL DEFAULT 0,    -- ordering for slot/list plugins (e.g. payment method order)
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, plugin_id)
);
CREATE INDEX tenant_plugin_tenant_idx ON tenant_plugin(tenant_id) WHERE is_enabled;
CREATE TRIGGER trg_tenant_plugin_updated BEFORE UPDATE ON tenant_plugin
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 7. FEATURE_FLAG — layered flags. tenant_id NULL = global default/override.
-- Resolution order (app side): plugin enabled? -> tenant flag -> global flag.
-- =============================================================================
CREATE TABLE feature_flag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenant(id) ON DELETE CASCADE, -- NULL => platform-global default
  key text NOT NULL,                      -- 'checkout.express', 'home.v2_layout'
  value_type flag_value_type NOT NULL DEFAULT 'boolean',
  value jsonb NOT NULL DEFAULT 'false'::jsonb,
  rollout_pct smallint NOT NULL DEFAULT 100 CHECK (rollout_pct BETWEEN 0 AND 100),
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One definition per (key, scope). COALESCE makes the global row unique too.
CREATE UNIQUE INDEX feature_flag_scope_key
  ON feature_flag (key, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX feature_flag_tenant_idx ON feature_flag(tenant_id);
CREATE TRIGGER trg_feature_flag_updated BEFORE UPDATE ON feature_flag
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 8. CATALOG_SOURCE — per-tenant product import sources
-- =============================================================================
CREATE TABLE catalog_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  kind catalog_source_kind NOT NULL,
  display_name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb, -- { sheetId, range, csvUrl, posBaseUrl, fieldMap{...} }
  secret_ref text,                        -- references `secret.key` for API tokens/keys
  schedule_cron text,                     -- e.g. '0 */6 * * *'; NULL = manual only
  is_enabled boolean NOT NULL DEFAULT true,
  last_run_id uuid,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_source_tenant_idx ON catalog_source(tenant_id);
CREATE TRIGGER trg_catalog_source_updated BEFORE UPDATE ON catalog_source
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 8b. CATALOG_SYNC_RUN — audit + observability for each import
CREATE TABLE catalog_sync_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  catalog_source_id uuid NOT NULL REFERENCES catalog_source(id) ON DELETE CASCADE,
  status sync_status NOT NULL DEFAULT 'queued',
  rows_total integer NOT NULL DEFAULT 0,
  rows_upserted integer NOT NULL DEFAULT 0,
  rows_rejected integer NOT NULL DEFAULT 0,
  error_report jsonb NOT NULL DEFAULT '[]'::jsonb, -- per-row validation failures (untrusted input rejected here)
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX catalog_sync_run_source_idx ON catalog_sync_run(catalog_source_id, started_at DESC);

-- 8c. CATALOG_PRODUCT — import landing/staging mirror (canonical, pre-Medusa)
-- Lets us diff/validate untrusted source data before reconciling into Medusa.
CREATE TABLE catalog_product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  source_id uuid REFERENCES catalog_source(id) ON DELETE SET NULL,
  external_id text,                       -- SKU/id from the source system
  medusa_product_id text,                 -- set after reconcile/push
  title text NOT NULL,
  description text,
  price_amount integer,                   -- minor units (cents)
  price_currency char(3),
  inventory_qty integer,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,             -- to skip unchanged rows on re-sync
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_id, external_id)
);
CREATE INDEX catalog_product_tenant_idx ON catalog_product(tenant_id);
CREATE TRIGGER trg_catalog_product_updated BEFORE UPDATE ON catalog_product
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 9. SECRET — per-tenant secrets, AES-256-GCM with a per-tenant KDF. NEVER plaintext.
-- DEK derived per tenant via HKDF from a master key held OUTSIDE the DB
-- (env / age / KMS); ciphertext = AES-256-GCM(value, DEK); wrapped_dek + nonce
-- stored per row; key_version supports rotation. (Matches yantresh-os token store.)
-- =============================================================================
CREATE TABLE secret (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenant(id) ON DELETE CASCADE, -- NULL => platform-level secret
  key text NOT NULL,                      -- logical name, e.g. 'stripe.secret_key'
  ciphertext bytea NOT NULL,
  nonce bytea NOT NULL,
  wrapped_dek bytea NOT NULL,
  key_version integer NOT NULL DEFAULT 1, -- supports rotation
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);
CREATE INDEX secret_tenant_idx ON secret(tenant_id);
CREATE TRIGGER trg_secret_updated BEFORE UPDATE ON secret
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- 10. RBAC — platform staff + client users, scoped membership
-- =============================================================================
CREATE TABLE platform_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  display_name text,
  password_hash text,                     -- argon2id; NULL if SSO-only
  is_active boolean NOT NULL DEFAULT true,
  mfa_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_platform_user_updated BEFORE UPDATE ON platform_user
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tenant_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenant(id) ON DELETE CASCADE, -- NULL => platform-wide role
  user_id uuid NOT NULL REFERENCES platform_user(id) ON DELETE CASCADE,
  role membership_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX tenant_membership_user_idx ON tenant_membership(user_id);

-- =============================================================================
-- 11. AUDIT_LOG — every config mutation (multi-client safety + compliance)
-- =============================================================================
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenant(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES platform_user(id) ON DELETE SET NULL,
  action text NOT NULL,                   -- 'tenant_plugin.enable', 'theme.update', ...
  entity text NOT NULL,
  entity_id uuid,
  diff jsonb NOT NULL DEFAULT '{}'::jsonb, -- redacted before/after (secrets masked)
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_tenant_idx ON audit_log(tenant_id, created_at DESC);

-- =============================================================================
-- ROW-LEVEL SECURITY — defense-in-depth for shared-runtime multi-tenancy.
-- The app sets `SET app.current_tenant = '<uuid>'` per request (from host->tenant
-- resolution). A forgotten WHERE clause then cannot leak cross-tenant rows.
-- Platform/admin connections use a role that BYPASSES RLS.
-- =============================================================================
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme ENABLE ROW LEVEL SECURITY;
ALTER TABLE homepage_block ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_plugin ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flag ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_product ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret ENABLE ROW LEVEL SECURITY;

-- Example policy (repeat per table; feature_flag/secret also allow NULL = global)
CREATE POLICY tenant_isolation ON tenant
  USING (id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation ON tenant_plugin
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_or_global ON feature_flag
  USING (tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant', true)::uuid);

-- (Apply analogous policies to domain, theme, homepage_block, catalog_source,
-- catalog_product, secret. Secret policy must also gate writes to admin role.)

-- =============================================================================
-- Seed: register first-party plugins (illustrative)
-- =============================================================================
INSERT INTO plugin (key, kind, display_name, version, capabilities, requires) VALUES
  ('payment-stripe',        'payment',        'Stripe',              '1.0.0', '{payment.authorize,payment.capture,payment.refund}', '{cart}'),
  ('payment-razorpay',      'payment',        'Razorpay',            '1.0.0', '{payment.authorize,payment.capture}',                '{cart}'),
  ('delivery-local',        'delivery',       'Local Delivery',      '1.0.0', '{fulfillment.quote,fulfillment.create}',             '{cart}'),
  ('pickup-instore',        'pickup',         'In-store Pickup',     '1.0.0', '{fulfillment.create}',                               '{cart}'),
  ('coupons-core',          'coupon',         'Coupons & Promotions','1.0.0', '{promotion.apply}',                                  '{cart}'),
  ('loyalty-points',        'loyalty',        'Loyalty Points',      '1.0.0', '{loyalty.accrue,loyalty.redeem}',                    '{cart,order}'),
  ('catalog-google-sheets', 'catalog_source', 'Google Sheets Import','1.0.0', '{catalog.pull}',                                     '{}'),
  ('catalog-csv',           'catalog_source', 'CSV Import',          '1.0.0', '{catalog.pull}',                                     '{}'),
  ('catalog-pos',           'catalog_source', 'POS Import',          '1.0.0', '{catalog.pull,inventory.pull}',                      '{}'),
  ('inventory-sync',        'inventory_sync', 'Inventory Sync',      '1.0.0', '{inventory.push}',                                   '{}'),
  ('layout-hero-grid',      'layout_module',  'Hero + Featured Grid','1.0.0', '{layout.block}',                                     '{}')
ON CONFLICT (key) DO NOTHING;
