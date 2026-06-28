import { createSqlClient } from "./client.js";

type SqlClient = ReturnType<typeof createSqlClient>;

export type AdminTenantSummary = {
  id: string;
  slug: string;
  legalName: string | null;
  displayName: string;
  status: "draft" | "active" | "suspended" | "archived";
  deployMode: "shared_runtime" | "generated_app";
  locale: string;
  currencyCode: string;
  timezone: string;
  aboutTagline: string | null;
  aboutDescription: string | null;
  commerceSalesChannelId: string | null;
  commerceRegionId: string | null;
  commercePubKeyRef: string | null;
  primaryHostname: string | null;
  themePreset: string | null;
  pluginCount: number;
  flagCount: number;
  updatedAt: string;
};

export type AdminDomainSummary = {
  id: string;
  tenantId: string;
  tenantSlug: string;
  tenantDisplayName: string;
  hostname: string;
  status: "pending" | "verifying" | "active" | "error";
  isPrimary: boolean;
  isSubdomain: boolean;
  tlsMode: string;
  verifiedAt: string | null;
};

export type AdminThemeSummary = {
  id: string;
  tenantId: string;
  tenantSlug: string;
  tenantDisplayName: string;
  preset: string;
  tokens: unknown;
  isActive: boolean;
  updatedAt: string;
};

export type AdminFeatureFlagSummary = {
  id: string;
  tenantId: string | null;
  tenantSlug: string | null;
  key: string;
  valueType: "boolean" | "string" | "number" | "json" | "variant";
  value: unknown;
  rolloutPct: number;
  description: string | null;
};

type TenantSummaryRow = {
  id: string;
  slug: string;
  legal_name: string | null;
  display_name: string;
  status: AdminTenantSummary["status"];
  deploy_mode: AdminTenantSummary["deployMode"];
  locale: string;
  currency_code: string;
  timezone: string;
  about_tagline: string | null;
  about_description: string | null;
  commerce_sales_channel_id: string | null;
  commerce_region_id: string | null;
  commerce_pub_key_ref: string | null;
  primary_hostname: string | null;
  theme_preset: string | null;
  plugin_count: number;
  flag_count: number;
  updated_at: string;
};

type DomainSummaryRow = {
  id: string;
  tenant_id: string;
  tenant_slug: string;
  tenant_display_name: string;
  hostname: string;
  status: AdminDomainSummary["status"];
  is_primary: boolean;
  is_subdomain: boolean;
  tls_mode: string;
  verified_at: string | null;
};

type ThemeSummaryRow = {
  id: string;
  tenant_id: string;
  tenant_slug: string;
  tenant_display_name: string;
  preset: string;
  tokens: unknown;
  is_active: boolean;
  updated_at: string;
};

type FeatureFlagSummaryRow = {
  id: string;
  tenant_id: string | null;
  tenant_slug: string | null;
  key: string;
  value_type: AdminFeatureFlagSummary["valueType"];
  value: unknown;
  rollout_pct: number;
  description: string | null;
};

async function withAdminSql<T>(
  query: (sql: SqlClient) => Promise<T>,
  sql?: SqlClient
): Promise<T> {
  const client = sql ?? createSqlClient();

  try {
    return await query(client);
  } finally {
    if (!sql) {
      await client.end({ timeout: 1 });
    }
  }
}

export async function listAdminTenants(sql?: SqlClient): Promise<AdminTenantSummary[]> {
  return withAdminSql(async (client) => {
    const rows = await client<TenantSummaryRow[]>`
      select
        t.id,
        t.slug::text as slug,
        t.legal_name,
        t.display_name,
        t.status,
        t.deploy_mode,
        t.locale,
        t.currency_code,
        t.timezone,
        t.about->>'tagline' as about_tagline,
        t.about->>'description' as about_description,
        t.commerce_sales_channel_id,
        t.commerce_region_id,
        t.commerce_pub_key_ref,
        primary_domain.hostname::text as primary_hostname,
        active_theme.preset as theme_preset,
        coalesce(plugin_counts.plugin_count, 0) as plugin_count,
        coalesce(flag_counts.flag_count, 0) as flag_count,
        t.updated_at::text as updated_at
      from tenant t
      left join lateral (
        select d.hostname
        from domain d
        where d.tenant_id = t.id
          and d.is_primary = true
        order by d.updated_at desc
        limit 1
      ) primary_domain on true
      left join lateral (
        select th.preset
        from theme th
        where th.tenant_id = t.id
          and th.is_active = true
        order by th.updated_at desc
        limit 1
      ) active_theme on true
      left join lateral (
        select count(*)::int as plugin_count
        from tenant_plugin tp
        where tp.tenant_id = t.id
          and tp.is_enabled = true
      ) plugin_counts on true
      left join lateral (
        select count(*)::int as flag_count
        from feature_flag ff
        where ff.tenant_id = t.id
      ) flag_counts on true
      order by t.created_at asc, t.slug asc
    `;

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      legalName: row.legal_name,
      displayName: row.display_name,
      status: row.status,
      deployMode: row.deploy_mode,
      locale: row.locale,
      currencyCode: row.currency_code,
      timezone: row.timezone,
      aboutTagline: row.about_tagline,
      aboutDescription: row.about_description,
      commerceSalesChannelId: row.commerce_sales_channel_id,
      commerceRegionId: row.commerce_region_id,
      commercePubKeyRef: row.commerce_pub_key_ref,
      primaryHostname: row.primary_hostname,
      themePreset: row.theme_preset,
      pluginCount: Number(row.plugin_count),
      flagCount: Number(row.flag_count),
      updatedAt: row.updated_at
    }));
  }, sql);
}

export async function listAdminDomains(sql?: SqlClient): Promise<AdminDomainSummary[]> {
  return withAdminSql(async (client) => {
    const rows = await client<DomainSummaryRow[]>`
      select
        d.id,
        d.tenant_id,
        t.slug::text as tenant_slug,
        t.display_name as tenant_display_name,
        d.hostname::text as hostname,
        d.status,
        d.is_primary,
        d.is_subdomain,
        d.tls_mode,
        d.verified_at::text as verified_at
      from domain d
      join tenant t on t.id = d.tenant_id
      order by d.is_primary desc, d.hostname asc
    `;

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      tenantSlug: row.tenant_slug,
      tenantDisplayName: row.tenant_display_name,
      hostname: row.hostname,
      status: row.status,
      isPrimary: row.is_primary,
      isSubdomain: row.is_subdomain,
      tlsMode: row.tls_mode,
      verifiedAt: row.verified_at
    }));
  }, sql);
}

export async function listAdminThemes(sql?: SqlClient): Promise<AdminThemeSummary[]> {
  return withAdminSql(async (client) => {
    const rows = await client<ThemeSummaryRow[]>`
      select
        th.id,
        th.tenant_id,
        t.slug::text as tenant_slug,
        t.display_name as tenant_display_name,
        th.preset,
        th.tokens,
        th.is_active,
        th.updated_at::text as updated_at
      from theme th
      join tenant t on t.id = th.tenant_id
      order by th.is_active desc, t.slug asc, th.updated_at desc
    `;

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      tenantSlug: row.tenant_slug,
      tenantDisplayName: row.tenant_display_name,
      preset: row.preset,
      tokens: row.tokens,
      isActive: row.is_active,
      updatedAt: row.updated_at
    }));
  }, sql);
}

export async function listAdminFeatureFlags(sql?: SqlClient): Promise<AdminFeatureFlagSummary[]> {
  return withAdminSql(async (client) => {
    const rows = await client<FeatureFlagSummaryRow[]>`
      select
        ff.id,
        ff.tenant_id,
        t.slug::text as tenant_slug,
        ff.key,
        ff.value_type,
        ff.value,
        ff.rollout_pct,
        ff.description
      from feature_flag ff
      left join tenant t on t.id = ff.tenant_id
      order by (ff.tenant_id is null) desc, t.slug asc nulls first, ff.key asc
    `;

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      tenantSlug: row.tenant_slug,
      key: row.key,
      valueType: row.value_type,
      value: row.value,
      rolloutPct: Number(row.rollout_pct),
      description: row.description
    }));
  }, sql);
}
