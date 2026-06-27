import postgres from "postgres";

import { readDatabaseUrl } from "./env.js";

type DemoSeedConfig = {
  commercePubKeyRef: string;
  currencyCode: string;
  displayName: string;
  host: string;
  locale: string;
  regionId: string;
  salesChannelId: string;
  slug: string;
  theme: {
    accent: string;
    bg: string;
    fg: string;
    muted: string;
    primary: string;
  };
  tagline: string;
  timezone: string;
};

function readEnv(name: string, fallback?: string): string {
  const value = process.env[name]?.trim();

  if (value) {
    return value;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Missing required environment variable: ${name}`);
}

function readDemoSeedConfig(): DemoSeedConfig {
  return {
    commercePubKeyRef: readEnv("DEMO_PUBLISHABLE_KEY_REF", "demo-publishable-key"),
    currencyCode: readEnv("DEMO_TENANT_CURRENCY", "USD"),
    displayName: readEnv("DEMO_TENANT_NAME", "Yantresh Demo Store"),
    host: readEnv("DEMO_STORE_ADDRESS"),
    locale: readEnv("DEMO_TENANT_LOCALE", "en"),
    regionId: readEnv("DEMO_REGION_ID", "demo-region"),
    salesChannelId: readEnv("DEMO_SALES_CHANNEL_ID", "demo-sales-channel"),
    slug: readEnv("DEMO_TENANT_SLUG", "demo-store"),
    tagline: "Config-driven multi-tenant commerce demo",
    theme: {
      primary: "#a66a2c",
      bg: "#f4f0e8",
      fg: "#1f1a14",
      accent: "#c78034",
      muted: "#6e6255"
    },
    timezone: readEnv("DEMO_TENANT_TIMEZONE", "UTC")
  };
}

function readSecondDemoSeedConfig(): DemoSeedConfig | null {
  const host = process.env.SECOND_DEMO_STORE_ADDRESS?.trim();

  if (!host) {
    return null;
  }

  return {
    commercePubKeyRef: readEnv("SECOND_DEMO_PUBLISHABLE_KEY_REF", "second-demo-publishable-key"),
    currencyCode: readEnv("SECOND_DEMO_TENANT_CURRENCY", "CAD"),
    displayName: readEnv("SECOND_DEMO_TENANT_NAME", "Yantresh Corner Market"),
    host,
    locale: readEnv("SECOND_DEMO_TENANT_LOCALE", "en-CA"),
    regionId: readEnv("SECOND_DEMO_REGION_ID", "second-demo-region"),
    salesChannelId: readEnv("SECOND_DEMO_SALES_CHANNEL_ID", "second-demo-sales-channel"),
    slug: readEnv("SECOND_DEMO_TENANT_SLUG", "corner-market"),
    tagline: "Second demo tenant resolved by hostname from the same storefront process",
    theme: {
      primary: "#245f73",
      bg: "#edf6f3",
      fg: "#13292f",
      accent: "#d85c3a",
      muted: "#53696d"
    },
    timezone: readEnv("SECOND_DEMO_TENANT_TIMEZONE", "America/Toronto")
  };
}

function readDemoSeedConfigs(): DemoSeedConfig[] {
  const configs = [readDemoSeedConfig()];
  const secondConfig = readSecondDemoSeedConfig();

  if (secondConfig) {
    configs.push(secondConfig);
  }

  return configs;
}

async function seedTenant(config: DemoSeedConfig, tx: postgres.TransactionSql<{}>) {
  const themeTokens = {
    colors: config.theme,
    fonts: {
      heading: "Georgia",
      body: "Georgia"
    },
    radius: 24,
    spacingScale: 1
  };

  const tenantRows = await tx<{ id: string }[]>`
    insert into tenant (
      slug,
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
      config_version
    )
    values (
      ${config.slug},
      ${config.displayName},
      'active',
      'shared_runtime',
      ${JSON.stringify({
        tagline: config.tagline,
        description: "Seeded control-plane record for storefront runtime validation."
      })}::jsonb,
      ${config.locale},
      ${config.currencyCode},
      ${config.timezone},
      ${config.salesChannelId},
      ${config.regionId},
      ${config.commercePubKeyRef},
      1
    )
    on conflict (slug) do update
    set display_name = excluded.display_name,
        status = excluded.status,
        deploy_mode = excluded.deploy_mode,
        about = excluded.about,
        locale = excluded.locale,
        currency_code = excluded.currency_code,
        timezone = excluded.timezone,
        commerce_sales_channel_id = excluded.commerce_sales_channel_id,
        commerce_region_id = excluded.commerce_region_id,
        commerce_pub_key_ref = excluded.commerce_pub_key_ref
    returning id
  `;

  const tenantId = tenantRows[0]?.id;

  if (!tenantId) {
    throw new Error(`Failed to create or update demo tenant: ${config.slug}`);
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
      ${tenantId},
      ${config.host},
      true,
      true,
      'active',
      'auto',
      now()
    )
    on conflict (hostname) do update
    set tenant_id = excluded.tenant_id,
        is_primary = excluded.is_primary,
        is_subdomain = excluded.is_subdomain,
        status = excluded.status,
        tls_mode = excluded.tls_mode,
        verified_at = excluded.verified_at
  `;

  const themeRows = await tx<{ id: string }[]>`
    update theme
    set preset = 'base',
        tokens = ${JSON.stringify(themeTokens)}::jsonb,
        logo_url = null,
        is_active = true
    where tenant_id = ${tenantId}
      and is_active = true
    returning id
  `;

  if (themeRows.length === 0) {
    await tx`
      insert into theme (
        tenant_id,
        preset,
        tokens,
        is_active
      )
      values (
        ${tenantId},
        'base',
        ${JSON.stringify(themeTokens)}::jsonb,
        true
      )
    `;
  }

  return {
    host: config.host,
    slug: config.slug,
    tenantId
  };
}

export async function seedDemoTenant() {
  const configs = readDemoSeedConfigs();
  const sql = postgres(readDatabaseUrl(), { max: 1 });

  try {
    const result = await sql.begin(async (tx) => {
      const tenants = [];

      for (const config of configs) {
        tenants.push(await seedTenant(config, tx));
      }

      return tenants;
    });

    process.stdout.write(`${JSON.stringify({ ok: true, tenants: result })}\n`);
  } finally {
    await sql.end({ timeout: 1 });
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  seedDemoTenant().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown seed failure";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
