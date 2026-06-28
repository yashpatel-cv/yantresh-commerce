import type postgres from "postgres";

import { createSqlClient } from "./client.js";

type SqlClient = ReturnType<typeof createSqlClient>;
type TenantSql = SqlClient | postgres.TransactionSql<{}>;

type TenantStatus = "draft" | "active" | "suspended" | "archived";
type DomainStatus = "pending" | "verifying" | "active" | "error";
type TlsMode = "auto" | "manual";

const DEFAULT_THEME_TOKENS = {
  colors: {
    primary: "#2f5a50",
    bg: "#fffaf0",
    fg: "#1f1b16",
    accent: "#a66a2c",
    muted: "#7f6342"
  },
  fonts: {
    heading: "Iowan Old Style",
    body: "Iowan Old Style"
  },
  radius: 16,
  spacingScale: 1
} as const;

export type AdminDomainWriteInput = {
  tenantId: string;
  hostname: string;
  isPrimary: boolean;
  isSubdomain: boolean;
  status: DomainStatus;
  tlsMode: TlsMode;
};

export type AdminTenantWriteInput = {
  slug: string;
  legalName: string | null;
  displayName: string;
  status: TenantStatus;
  deployMode: "shared_runtime" | "generated_app";
  locale: string;
  currencyCode: string;
  timezone: string;
  aboutTagline: string | null;
  aboutDescription: string | null;
  commerceSalesChannelId: string | null;
  commerceRegionId: string | null;
  commercePubKeyRef: string | null;
};

type TenantStatusRow = {
  status: TenantStatus;
};

type DomainTenantRow = {
  tenant_id: string;
  tenant_status: TenantStatus;
};

type TenantAboutRow = {
  about: unknown;
};

type CountRow = {
  count: number;
};

type ThemeValidationRow = {
  ok: number;
};

function mapWriteError(error: unknown): never {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505" &&
    "constraint_name" in error &&
    typeof error.constraint_name === "string"
  ) {
    if (error.constraint_name === "tenant_slug_key") {
      throw new Error("Tenant slug already exists.");
    }

    if (error.constraint_name === "domain_hostname_key") {
      throw new Error("Hostname already exists.");
    }

    if (error.constraint_name === "one_primary_domain_per_tenant") {
      throw new Error("Tenant already has a primary domain.");
    }
  }

  if (error instanceof Error) {
    throw error;
  }

  throw new Error("Unknown admin write error.");
}

function readObjectRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

function buildAboutPayload(
  existingAbout: unknown,
  input: Pick<AdminTenantWriteInput, "aboutTagline" | "aboutDescription">
): Record<string, unknown> {
  const about = readObjectRecord(existingAbout);

  if (input.aboutTagline) {
    about.tagline = input.aboutTagline;
  } else {
    delete about.tagline;
  }

  if (input.aboutDescription) {
    about.description = input.aboutDescription;
  } else {
    delete about.description;
  }

  return about;
}

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

async function requireTenantStatus(tenantId: string, sql: TenantSql): Promise<TenantStatus> {
  const rows = await sql<TenantStatusRow[]>`
    select status
    from tenant
    where id = ${tenantId}
    limit 1
  `;
  const status = rows[0]?.status;

  if (!status) {
    throw new Error("Tenant not found.");
  }

  return status;
}

async function requireTenantAbout(tenantId: string, sql: TenantSql): Promise<unknown> {
  const rows = await sql<TenantAboutRow[]>`
    select about
    from tenant
    where id = ${tenantId}
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Tenant not found.");
  }

  return row.about;
}

async function requireDomainTenant(
  domainId: string,
  sql: TenantSql
): Promise<{ tenantId: string; tenantStatus: TenantStatus }> {
  const rows = await sql<DomainTenantRow[]>`
    select
      d.tenant_id,
      t.status as tenant_status
    from domain d
    join tenant t on t.id = d.tenant_id
    where d.id = ${domainId}
    limit 1
  `;
  const row = rows[0];

  if (!row) {
    throw new Error("Domain not found.");
  }

  return {
    tenantId: row.tenant_id,
    tenantStatus: row.tenant_status
  };
}

function assertActiveTenantForActiveDomain(
  tenantStatus: TenantStatus,
  domainStatus: DomainStatus
): void {
  if (domainStatus === "active" && tenantStatus !== "active") {
    throw new Error("Only active tenants can receive an active domain.");
  }
}

function assertCompleteCommerceBinding(input: AdminTenantWriteInput): void {
  const values = [
    input.commerceSalesChannelId,
    input.commerceRegionId,
    input.commercePubKeyRef
  ];
  const providedCount = values.filter(Boolean).length;

  if (providedCount > 0 && providedCount < values.length) {
    throw new Error(
      "Commerce binding must include sales channel, region, and publishable key ref."
    );
  }
}

async function requirePrimaryActiveDomainCount(
  tenantId: string,
  sql: TenantSql
): Promise<number> {
  const rows = await sql<CountRow[]>`
    select count(*)::int as count
    from domain
    where tenant_id = ${tenantId}
      and is_primary = true
      and status = 'active'
  `;

  return Number(rows[0]?.count ?? 0);
}

async function hasValidActiveTheme(tenantId: string, sql: TenantSql): Promise<boolean> {
  const rows = await sql<ThemeValidationRow[]>`
    select 1 as ok
    from theme
    where tenant_id = ${tenantId}
      and is_active = true
      and jsonb_typeof(tokens) = 'object'
      and jsonb_typeof(tokens->'colors') = 'object'
      and length(trim(coalesce(tokens->'colors'->>'primary', ''))) > 0
    limit 1
  `;

  return rows.length === 1 && rows[0]?.ok === 1;
}

async function assertActivationSafe(
  tenantId: string,
  input: AdminTenantWriteInput,
  sql: TenantSql
): Promise<void> {
  assertCompleteCommerceBinding(input);

  if (input.status !== "active") {
    return;
  }

  if (
    !input.commerceSalesChannelId ||
    !input.commerceRegionId ||
    !input.commercePubKeyRef
  ) {
    throw new Error("Active tenants require a complete commerce binding.");
  }

  const primaryDomainCount = await requirePrimaryActiveDomainCount(tenantId, sql);

  if (primaryDomainCount === 0) {
    throw new Error("Active tenants require one primary active domain.");
  }

  if (!(await hasValidActiveTheme(tenantId, sql))) {
    throw new Error("Active tenants require an active theme row with colors.primary.");
  }
}

async function createDefaultTheme(tenantId: string, sql: TenantSql): Promise<void> {
  await sql`
    insert into theme (
      tenant_id,
      preset,
      tokens,
      is_active
    )
    values (
      ${tenantId},
      'base',
      ${JSON.stringify(DEFAULT_THEME_TOKENS)}::jsonb,
      true
    )
  `;
}

export async function createAdminTenant(
  input: AdminTenantWriteInput,
  sql?: SqlClient
): Promise<void> {
  return withAdminSql(async (client) => {
    try {
      await client.begin(async (tx) => {
        const tenantRows = await tx<{ id: string }[]>`
          insert into tenant (
            slug,
            legal_name,
            display_name,
            status,
            deploy_mode,
            about,
            locale,
            currency_code,
            timezone,
            commerce_sales_channel_id,
            commerce_region_id,
            commerce_pub_key_ref,
            archived_at
          )
          values (
            ${input.slug},
            ${input.legalName},
            ${input.displayName},
            ${input.status},
            ${input.deployMode},
            ${JSON.stringify(buildAboutPayload({}, input))}::jsonb,
            ${input.locale},
            ${input.currencyCode},
            ${input.timezone},
            ${input.commerceSalesChannelId},
            ${input.commerceRegionId},
            ${input.commercePubKeyRef},
            ${input.status === "archived" ? tx`now()` : null}
          )
          returning id
        `;
        const tenantId = tenantRows[0]?.id;

        if (!tenantId) {
          throw new Error("Failed to create tenant.");
        }

        await createDefaultTheme(tenantId, tx);
        await assertActivationSafe(tenantId, input, tx);
      });
    } catch (error) {
      mapWriteError(error);
    }
  }, sql);
}

export async function updateAdminTenant(
  tenantId: string,
  input: AdminTenantWriteInput,
  sql?: SqlClient
): Promise<void> {
  return withAdminSql(async (client) => {
    try {
      await client.begin(async (tx) => {
        const existingAbout = await requireTenantAbout(tenantId, tx);
        const result = await tx`
          update tenant
          set slug = ${input.slug},
              legal_name = ${input.legalName},
              display_name = ${input.displayName},
              status = ${input.status},
              deploy_mode = ${input.deployMode},
              about = ${JSON.stringify(buildAboutPayload(existingAbout, input))}::jsonb,
              locale = ${input.locale},
              currency_code = ${input.currencyCode},
              timezone = ${input.timezone},
              commerce_sales_channel_id = ${input.commerceSalesChannelId},
              commerce_region_id = ${input.commerceRegionId},
              commerce_pub_key_ref = ${input.commercePubKeyRef},
              archived_at = ${
                input.status === "archived" ? tx`coalesce(archived_at, now())` : null
              }
          where id = ${tenantId}
        `;

        if (result.count !== 1) {
          throw new Error("Tenant not found.");
        }

        await assertActivationSafe(tenantId, input, tx);
      });
    } catch (error) {
      mapWriteError(error);
    }
  }, sql);
}

export async function createAdminDomain(
  input: AdminDomainWriteInput,
  sql?: SqlClient
): Promise<void> {
  return withAdminSql(async (client) => {
    try {
      await client.begin(async (tx) => {
        const tenantStatus = await requireTenantStatus(input.tenantId, tx);
        assertActiveTenantForActiveDomain(tenantStatus, input.status);

        if (input.isPrimary) {
          await tx`
            update domain
            set is_primary = false
            where tenant_id = ${input.tenantId}
              and is_primary = true
          `;
        }

        await tx`
          insert into domain (
            tenant_id,
            hostname,
            is_primary,
            is_subdomain,
            status,
            tls_mode,
            verified_at
          )
          values (
            ${input.tenantId},
            ${input.hostname},
            ${input.isPrimary},
            ${input.isSubdomain},
            ${input.status},
            ${input.tlsMode},
            ${input.status === "active" ? tx`now()` : null}
          )
        `;
      });
    } catch (error) {
      mapWriteError(error);
    }
  }, sql);
}

export async function updateAdminDomain(
  domainId: string,
  input: Omit<AdminDomainWriteInput, "tenantId">,
  sql?: SqlClient
): Promise<void> {
  return withAdminSql(async (client) => {
    try {
      await client.begin(async (tx) => {
        const domain = await requireDomainTenant(domainId, tx);
        assertActiveTenantForActiveDomain(domain.tenantStatus, input.status);

        if (input.isPrimary) {
          await tx`
            update domain
            set is_primary = false
            where tenant_id = ${domain.tenantId}
              and id <> ${domainId}
              and is_primary = true
          `;
        }

        const result = await tx`
          update domain
          set hostname = ${input.hostname},
              is_primary = ${input.isPrimary},
              is_subdomain = ${input.isSubdomain},
              status = ${input.status},
              tls_mode = ${input.tlsMode},
              verified_at = ${input.status === "active" ? tx`now()` : null}
          where id = ${domainId}
        `;

        if (result.count !== 1) {
          throw new Error("Domain not found.");
        }
      });
    } catch (error) {
      mapWriteError(error);
    }
  }, sql);
}
