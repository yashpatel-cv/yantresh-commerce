import { isPlatformHostname, parseTenantConfig, resolveRequestedHostname } from "@yantresh/core";
import { loadTenantConfigForRequest } from "@yantresh/db";
import { headers } from "next/headers";
import { cache, type CSSProperties } from "react";

export type StorefrontRequestState = {
  adminHost: string;
  demoStoreHost: string;
  isPlatform: boolean;
  platformHost: string;
  requestedHost: string;
  tenantId: string;
  tenantMessage: string;
  tenantName: string;
  tenantSlug: string;
  tenantStyle: CSSProperties | undefined;
  tenantTagline: string;
};

function readEnv(name: string): string {
  return process.env[name] ?? "unset";
}

function buildTenantStyle(tenant: ReturnType<typeof parseTenantConfig>): CSSProperties {
  const colors = tenant.theme.tokens.colors;

  return {
    "--bg": colors.bg,
    "--surface": `color-mix(in srgb, ${colors.bg} 86%, white)`,
    "--border": `color-mix(in srgb, ${colors.muted} 34%, transparent)`,
    "--text": colors.fg,
    "--muted": colors.muted,
    "--accent": colors.primary,
    "--accent-strong": colors.accent ?? colors.primary,
    "--accent-soft": `color-mix(in srgb, ${colors.primary} 16%, white)`
  } as CSSProperties;
}

export const readStorefrontRequestState = cache(async (): Promise<StorefrontRequestState> => {
  const platformHost = readEnv("COMMERCE_STOREFRONT_ADDRESS");
  const demoStoreHost = readEnv("DEMO_STORE_ADDRESS");
  const adminHost = readEnv("SHOP_ADMIN_ADDRESS");
  const requestHeaders = await headers();
  const requestedHost = resolveRequestedHostname(
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
    platformHost
  );
  const isPlatform = isPlatformHostname(requestedHost, platformHost);
  let tenantName = "Not provisioned";
  let tenantSlug = "pending";
  let tenantId = "unresolved";
  let tenantMessage =
    "This runtime shell is waiting for a valid active tenant record in the control-plane database.";
  let tenantTagline = "";
  let tenantStyle: CSSProperties | undefined;

  if (!isPlatform) {
    try {
      const tenantRequest = await loadTenantConfigForRequest(requestedHost);

      if (tenantRequest) {
        const tenant = parseTenantConfig(tenantRequest.config);
        tenantName = tenant.displayName;
        tenantSlug = tenant.slug;
        tenantId = tenantRequest.context.tenantId;
        tenantTagline = tenant.about.tagline ?? "";
        tenantStyle = buildTenantStyle(tenant);
        tenantMessage =
          "Tenant resolution is live through a request-scoped database session. Catalog, checkout, and plugin slots stay deferred until their phases.";
      }
    } catch {
      tenantMessage =
        "The hostname reached the storefront, but the control-plane lookup failed closed. Check domain, tenant, and theme rows.";
    }
  }

  return {
    adminHost,
    demoStoreHost,
    isPlatform,
    platformHost,
    requestedHost,
    tenantId,
    tenantMessage,
    tenantName,
    tenantSlug,
    tenantStyle,
    tenantTagline
  };
});
