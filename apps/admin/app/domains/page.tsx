import { platformEnv } from "../lib/env";

// ponytail: domain provisioning is hub-side (Caddy on-demand TLS); this page is read-only.
// Phase 2: add a form that writes to the `tenant_domain` table and triggers a Caddy reload.
export default function DomainsPage() {
  const env = platformEnv();

  const platformDomains = [
    { hostname: env.shopAdmin, label: "shop-admin", note: "Admin shell (this app)" },
    { hostname: env.storefront, label: "storefront", note: "Shared multi-tenant storefront" },
    { hostname: env.shopApi, label: "shop-api", note: "Medusa API" },
    { hostname: env.demoStore, label: "demo-store", note: "Demo tenant BYO domain" },
  ];

  return (
    <>
      <p className="eyebrow">Control plane → Domains</p>
      <h1>Domains</h1>
      <p>
        Tenant hostnames are stored in the <code>tenant_domain</code> table and resolved by
        the storefront middleware at request time. TLS is handled by hub/Caddy via on-demand
        certificates — no action needed here per domain.
      </p>

      <div className="card">
        <h2>Platform service addresses</h2>
        <p>
          These are the fixed addresses for platform services, set in the deploy environment.
          Tenant BYO domains are in the DB, not in env.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.75rem", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "0.4rem 0.6rem 0.4rem 0" }}>Label</th>
              <th style={{ padding: "0.4rem 0.6rem" }}>Address</th>
              <th style={{ padding: "0.4rem 0 0.4rem 0.6rem" }}>Note</th>
            </tr>
          </thead>
          <tbody>
            {platformDomains.map(({ hostname, label, note }) => (
              <tr key={label} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.4rem 0.6rem 0.4rem 0", fontFamily: "ui-monospace, monospace" }}>{label}</td>
                <td style={{ padding: "0.4rem 0.6rem", fontFamily: "ui-monospace, monospace", color: "var(--ink-muted)" }}>
                  {hostname || "—"}
                </td>
                <td style={{ padding: "0.4rem 0 0.4rem 0.6rem", color: "var(--ink-muted)" }}>{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Tenant domain schema</h2>
        <pre className="schema-block">{`-- schema.sql: tenant_domain
CREATE TABLE tenant_domain (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenant(id),
  hostname    TEXT NOT NULL UNIQUE,  -- e.g. "shop.client.com"
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);`}</pre>
      </div>

      <div className="card">
        <h2>Deferred</h2>
        <ul>
          <li>
            <strong>Domain registration UI</strong> — Phase 2; operator enters a hostname,
            row is inserted in <code>tenant_domain</code>, Caddy reloads via the hub API.
          </li>
          <li>
            <strong>DNS verification</strong> — optional Phase 3; verify CNAME before
            allowing on-demand TLS to prevent domain squatting.
          </li>
          <li>
            <strong>Wildcard subdomains</strong> — already wired in hub/Caddy as{" "}
            <code>*.{env.domain || "DOMAIN"}</code>; no per-tenant action required for
            subdomain deployments.
          </li>
        </ul>
      </div>
    </>
  );
}
