import { createDomainAction, updateDomainAction } from "./actions";
import {
  formatTimestamp,
  loadDomainSummaries,
  loadTenantSummaries
} from "../lib/control-plane";
import { platformEnv } from "../lib/env";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type DomainsPageProps = {
  searchParams?: Promise<SearchParams>;
};

function readMessage(
  value: string | string[] | undefined
): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export default async function DomainsPage({ searchParams }: DomainsPageProps) {
  const env = platformEnv();
  const [{ error, rows }, { error: tenantError, rows: tenants }, params] = await Promise.all([
    loadDomainSummaries(),
    loadTenantSummaries(),
    searchParams ?? Promise.resolve({} as SearchParams)
  ]);
  const errorMessage = readMessage(params.error);
  const successMessage = readMessage(params.success);

  const platformDomains = [
    { hostname: env.shopAdmin, label: "shop-admin", note: "Admin shell (this app)" },
    { hostname: env.storefront, label: "storefront", note: "Shared multi-tenant storefront" },
    { hostname: env.shopApi, label: "shop-api", note: "Medusa API" },
    { hostname: env.demoStore, label: "demo-store", note: "Demo tenant entry point" }
  ];

  return (
    <>
      <p className="eyebrow">Control plane → Domains</p>
      <h1>Domains</h1>
      <p>
        Platform service addresses still come from env, but tenant routing now reads the real{" "}
        <code>domain</code> table rather than a placeholder schema block. This page can now
        create and edit those rows directly with fail-closed validation.
      </p>

      {errorMessage ? (
        <div className="notice notice-error">
          <strong>Write rejected.</strong> {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="notice notice-success">
          <strong>Saved.</strong> {successMessage}
        </div>
      ) : null}

      <div className="card">
        <h2>Platform service addresses</h2>
        <p>
          These stay deploy-environment values. Tenant hostnames below are database-backed and
          resolved by the storefront request path.
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Address</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {platformDomains.map(({ hostname, label, note }) => (
              <tr key={label}>
                <td>
                  <code>{label}</code>
                </td>
                <td>
                  <code>{hostname || "—"}</code>
                </td>
                <td>{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Create domain</h2>
        <p>
          Manual operator path for hostname routing. Reserved platform addresses stay blocked and
          subdomains must sit under <code>DOMAIN</code> when it is configured.
        </p>
        {tenantError ? (
          <p>Tenant list unavailable: {tenantError}</p>
        ) : (
          <form action={createDomainAction} className="stack-form">
            <div className="form-grid">
              <label className="field">
                <span>Tenant</span>
                <select name="tenantId" defaultValue="" required>
                  <option value="" disabled>
                    Select tenant
                  </option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.displayName} ({tenant.slug})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Hostname</span>
                <input name="hostname" type="text" placeholder="shop.example.com" required />
              </label>
              <label className="field">
                <span>Status</span>
                <select name="status" defaultValue="pending" required>
                  <option value="pending">pending</option>
                  <option value="verifying">verifying</option>
                  <option value="active">active</option>
                  <option value="error">error</option>
                </select>
              </label>
              <label className="field">
                <span>TLS mode</span>
                <select name="tlsMode" defaultValue="auto" required>
                  <option value="auto">auto</option>
                  <option value="manual">manual</option>
                </select>
              </label>
            </div>
            <label className="field-checkbox">
              <input name="isPrimary" type="checkbox" defaultChecked />
              <span>Primary domain for this tenant</span>
            </label>
            <label className="field-checkbox">
              <input name="isSubdomain" type="checkbox" defaultChecked />
              <span>Platform subdomain under DOMAIN</span>
            </label>
            <button type="submit">Create domain</button>
          </form>
        )}
      </div>

      {error ? (
        <div className="card">
          <h2>Control-plane DB unavailable</h2>
          <p>The storefront route can still fail closed even if this snapshot cannot load.</p>
          <pre className="schema-block">{error}</pre>
        </div>
      ) : null}

      <div className="card">
        <h2>Tenant domain records</h2>
        <p>{rows.length === 0 ? "No domain rows found yet." : `${rows.length} domain record(s) loaded from Postgres.`}</p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Hostname</th>
              <th>Tenant</th>
              <th>Status</th>
              <th>TLS</th>
              <th>Primary</th>
              <th>Verified</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((domain) => (
              <tr key={domain.id}>
                <td>
                  <code>{domain.hostname}</code>
                  <div className="table-subtle">{domain.isSubdomain ? "platform subdomain" : "BYO domain"}</div>
                </td>
                <td>
                  <strong>{domain.tenantDisplayName}</strong>
                  <div className="table-subtle">
                    <code>{domain.tenantSlug}</code>
                  </div>
                </td>
                <td>
                  <span className={`badge ${domain.status === "active" ? "badge-ok" : "badge-pending"}`}>
                    {domain.status}
                  </span>
                </td>
                <td>
                  <code>{domain.tlsMode}</code>
                </td>
                <td>{domain.isPrimary ? "yes" : "no"}</td>
                <td>{formatTimestamp(domain.verifiedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Edit domain rows</h2>
        <p>
          The write path stays intentionally narrow: operators can correct routing metadata here,
          while DNS proof and hub orchestration remain outside the page.
        </p>
        <div className="edit-grid">
          {rows.map((domain) => (
            <form key={domain.id} action={updateDomainAction} className="card inset-card stack-form">
              <input name="domainId" type="hidden" value={domain.id} />
              <h3>{domain.tenantDisplayName}</h3>
              <p className="table-subtle">
                <code>{domain.tenantSlug}</code>
              </p>
              <div className="form-grid">
                <label className="field">
                  <span>Hostname</span>
                  <input name="hostname" type="text" defaultValue={domain.hostname} required />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select name="status" defaultValue={domain.status} required>
                    <option value="pending">pending</option>
                    <option value="verifying">verifying</option>
                    <option value="active">active</option>
                    <option value="error">error</option>
                  </select>
                </label>
                <label className="field">
                  <span>TLS mode</span>
                  <select name="tlsMode" defaultValue={domain.tlsMode} required>
                    <option value="auto">auto</option>
                    <option value="manual">manual</option>
                  </select>
                </label>
                <label className="field">
                  <span>Verified</span>
                  <input type="text" value={formatTimestamp(domain.verifiedAt)} readOnly />
                </label>
              </div>
              <label className="field-checkbox">
                <input name="isPrimary" type="checkbox" defaultChecked={domain.isPrimary} />
                <span>Primary domain</span>
              </label>
              <label className="field-checkbox">
                <input name="isSubdomain" type="checkbox" defaultChecked={domain.isSubdomain} />
                <span>Platform subdomain</span>
              </label>
              <button type="submit">Save domain</button>
            </form>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Still deferred</h2>
        <ul>
          <li>
            <strong>DNS proof / anti-squatting checks</strong> — not implemented yet for BYO
            domains.
          </li>
          <li>
            <strong>Caddy reload orchestration</strong> — remains a hub-side concern, not an
            admin-page action.
          </li>
          <li>
            <strong>Tenant CRUD</strong> — still deferred while the shell only exposes the
            narrow domain write path.
          </li>
        </ul>
      </div>
    </>
  );
}
