import type postgres from "postgres";

import { createSqlClient } from "./client.js";

type SqlClient = ReturnType<typeof createSqlClient>;
type TenantSql = SqlClient | postgres.TransactionSql<{}>;

type TenantConfigRecord = {
  id: string;
  slug: string;
  displayName: string;
  status: "draft" | "active" | "suspended" | "archived";
  deployMode: "shared_runtime" | "generated_app";
  locale: string;
  currencyCode: string;
  timezone: string;
  about: unknown;
  theme: {
    preset: string;
    tokens: unknown;
    logoUrl?: string | undefined;
  };
  domains: Array<{
    hostname: string;
    isPrimary: boolean;
  }>;
  commerce: {
    salesChannelId: string;
    regionId: string;
    publishableKeyRef: `secret:${string}`;
  };
  plugins: Array<{
    key: string;
    enabled: boolean;
    position: number;
    config: Record<string, unknown>;
  }>;
  flags: Record<string, unknown>;
  configVersion: number;
};

type TenantConfigRow = {
  tenant_config: TenantConfigRecord | null;
};

export type TenantRequestContext = {
  hostname: string;
  tenantId: string;
};

export type TenantConfigRequest = {
  context: TenantRequestContext;
  config: TenantConfigRecord;
};

type TenantResolutionRow = {
  tenant_id: string;
};

async function resolveActiveTenantByHostname(
  hostname: string,
  sql: TenantSql
): Promise<TenantRequestContext | null> {
  const rows = await sql<TenantResolutionRow[]>`
    select d.tenant_id
    from domain d
    join tenant t on t.id = d.tenant_id
    where d.hostname = ${hostname}
      and d.status = 'active'
      and t.status = 'active'
    limit 1
  `;
  const tenantId = rows[0]?.tenant_id;

  if (!tenantId) {
    return null;
  }

  return {
    hostname,
    tenantId
  };
}

async function queryTenantConfigByTenantId(
  tenantId: string,
  sql: TenantSql
): Promise<TenantConfigRecord | null> {
  const rows = await sql<TenantConfigRow[]>`
    select json_build_object(
      'id', t.id,
      'slug', t.slug,
      'displayName', t.display_name,
      'status', t.status,
      'deployMode', t.deploy_mode,
      'locale', t.locale,
      'currencyCode', t.currency_code,
      'timezone', t.timezone,
      'about', t.about,
      'theme', json_build_object(
        'preset', coalesce(th.preset, 'base'),
        'tokens', coalesce(th.tokens, '{}'::jsonb),
        'logoUrl', th.logo_url
      ),
      'domains', coalesce(domains.items, '[]'::json),
      'commerce', json_build_object(
        'salesChannelId', t.commerce_sales_channel_id,
        'regionId', t.commerce_region_id,
        'publishableKeyRef', ('secret:' || t.commerce_pub_key_ref)
      ),
      'plugins', coalesce(plugins.items, '[]'::json),
      'flags', coalesce(flags.items, '{}'::jsonb),
      'configVersion', t.config_version
    ) as tenant_config
    from tenant t
    left join lateral (
      select theme.preset, theme.tokens, theme.logo_url
      from theme
      where theme.tenant_id = t.id
        and theme.is_active = true
      order by theme.updated_at desc
      limit 1
    ) th on true
    left join lateral (
      select json_agg(
        json_build_object(
          'hostname', domain.hostname,
          'isPrimary', domain.is_primary
        )
        order by domain.is_primary desc, domain.hostname asc
      ) as items
      from domain
      where domain.tenant_id = t.id
        and domain.status = 'active'
    ) domains on true
    left join lateral (
      select json_agg(
        json_build_object(
          'key', plugin.key,
          'enabled', tenant_plugin.is_enabled,
          'position', tenant_plugin.position,
          'config', tenant_plugin.config
        )
        order by tenant_plugin.position asc, plugin.key asc
      ) as items
      from tenant_plugin
      join plugin on plugin.id = tenant_plugin.plugin_id
      where tenant_plugin.tenant_id = t.id
        and tenant_plugin.is_enabled = true
    ) plugins on true
    left join lateral (
      select jsonb_object_agg(feature_flag.key, feature_flag.value) as items
      from feature_flag
      where feature_flag.tenant_id = t.id
    ) flags on true
    where t.id = ${tenantId}
      and t.status = 'active'
  `;

  return rows[0]?.tenant_config ?? null;
}

export async function withTenantRequestContext<T>(
  context: TenantRequestContext,
  callback: (sql: postgres.TransactionSql<{}>) => Promise<T>,
  sql?: SqlClient
): Promise<T> {
  const client = sql ?? createSqlClient();

  try {
    const result = await client.begin(async (tx) => {
      await tx`select set_config('app.current_tenant', ${context.tenantId}, true)`;

      return callback(tx);
    });

    return result as T;
  } finally {
    if (!sql) {
      await client.end({ timeout: 1 });
    }
  }
}

export async function findActiveDomainByHostname(
  hostname: string,
  sql?: SqlClient
): Promise<boolean> {
  const client = sql ?? createSqlClient();

  try {
    const rows = await client<{ ok: number }[]>`
      select 1 as ok
      from domain
      where hostname = ${hostname}
        and status = 'active'
      limit 1
    `;

    return rows.length === 1;
  } finally {
    if (!sql) {
      await client.end({ timeout: 1 });
    }
  }
}

export async function loadTenantConfigByHostname(
  hostname: string,
  sql?: SqlClient
): Promise<TenantConfigRecord | null> {
  const client = sql ?? createSqlClient();

  try {
    const context = await resolveActiveTenantByHostname(hostname, client);

    if (!context) {
      return null;
    }

    return queryTenantConfigByTenantId(context.tenantId, client);
  } finally {
    if (!sql) {
      await client.end({ timeout: 1 });
    }
  }
}

export async function loadTenantConfigForRequest(
  hostname: string,
  sql?: SqlClient
): Promise<TenantConfigRequest | null> {
  const client = sql ?? createSqlClient();

  try {
    const context = await resolveActiveTenantByHostname(hostname, client);

    if (!context) {
      return null;
    }

    return withTenantRequestContext(
      context,
      async (tx) => {
        const config = await queryTenantConfigByTenantId(context.tenantId, tx);

        if (!config || config.id !== context.tenantId) {
          return null;
        }

        return {
          context,
          config
        };
      },
      client
    );
  } finally {
    if (!sql) {
      await client.end({ timeout: 1 });
    }
  }
}
