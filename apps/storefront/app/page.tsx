import { isPlatformHostname, parseTenantConfig, resolveRequestedHostname } from "@yantresh/core";
import { loadTenantConfigForRequest } from "@yantresh/db";
import { headers } from "next/headers";
import type { CSSProperties } from "react";

const checkpoints = [
  "Root workspace, db bootstrap, and hub fragments are in place.",
  "Tenant host resolution now runs through a request-scoped control-plane database session.",
  "The platform host stays separate from real storefront tenants until commerce wiring lands."
];

function readEnv(name: string): string {
  return process.env[name] ?? "unset";
}

function buildTenantStyle(tenant: ReturnType<typeof parseTenantConfig>): CSSProperties {
  const colors = tenant.theme.tokens.colors;

  return {
    "--bg": colors.bg,
    "--text": colors.fg,
    "--muted": colors.muted,
    "--accent": colors.primary,
    "--accent-strong": colors.accent ?? colors.primary
  } as CSSProperties;
}

export default async function Page() {
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

  return (
    <main className="shell" style={tenantStyle}>
      <section className="hero">
        <p className="eyebrow">{isPlatform ? "Phase 0 placeholder" : tenantSlug}</p>
        <h1>{isPlatform ? "Shared storefront, one repo, zero fake plumbing." : tenantName}</h1>
        <p className="lede">
          {isPlatform
            ? "This app is the shared runtime shell for Yantresh Commerce. It now knows the difference between the platform host and tenant hosts before Medusa bindings and plugin slots land."
            : (tenantTagline || tenantMessage)}
        </p>
      </section>

      <section className="panel">
        <h2>{isPlatform ? "Hub addresses" : "Resolved tenant"}</h2>
        <dl className="grid">
          <div>
            <dt>Requested host</dt>
            <dd>{requestedHost}</dd>
          </div>
          <div>
            <dt>{isPlatform ? "Platform" : "Tenant slug"}</dt>
            <dd>{isPlatform ? platformHost : tenantSlug}</dd>
          </div>
          <div>
            <dt>{isPlatform ? "Demo store" : "Tenant ID"}</dt>
            <dd>{isPlatform ? demoStoreHost : tenantId}</dd>
          </div>
          <div>
            <dt>{isPlatform ? "Shop Admin" : "Admin host"}</dt>
            <dd>{isPlatform ? adminHost : adminHost}</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <h2>Current checkpoint</h2>
        <ul className="checklist">
          {checkpoints.map((checkpoint) => (
            <li key={checkpoint}>{checkpoint}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
