import { createTenantAction, updateTenantAction } from "./actions";
import { formatTimestamp, loadTenantSummaries } from "../lib/control-plane";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

type TenantsPageProps = {
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

export default async function TenantsPage({ searchParams }: TenantsPageProps) {
  const [{ error, rows }, params] = await Promise.all([
    loadTenantSummaries(),
    searchParams ?? Promise.resolve({} as SearchParams)
  ]);
  const errorMessage = readMessage(params.error);
  const successMessage = readMessage(params.success);

  return (
    <>
      <p className="eyebrow">Control plane → Tenants</p>
      <h1>Tenants</h1>
      <p>
        This page now creates and edits the core <code>tenant</code> row directly. Activation
        stays fail-closed: an <code>active</code> tenant still needs a primary active domain,
        complete commerce binding, and a valid active theme row before the write is accepted.
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
        <h2>Create tenant</h2>
        <p>
          New tenants start safely in <code>draft</code> by default. Creation also provisions a
          base active theme row so the storefront config can become activation-ready once domain
          and commerce bindings are filled in.
        </p>
        <form action={createTenantAction} className="stack-form">
          <div className="form-grid">
            <label className="field">
              <span>Display name</span>
              <input name="displayName" type="text" placeholder="Corner Market" required />
            </label>
            <label className="field">
              <span>Slug</span>
              <input name="slug" type="text" placeholder="corner-market" required />
            </label>
            <label className="field">
              <span>Legal name</span>
              <input name="legalName" type="text" placeholder="Corner Market Ltd." />
            </label>
            <label className="field">
              <span>Status</span>
              <select name="status" defaultValue="draft" required>
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="suspended">suspended</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label className="field">
              <span>Deploy mode</span>
              <select name="deployMode" defaultValue="shared_runtime" required>
                <option value="shared_runtime">shared_runtime</option>
                <option value="generated_app">generated_app</option>
              </select>
            </label>
            <label className="field">
              <span>Locale</span>
              <input name="locale" type="text" defaultValue="en" required />
            </label>
            <label className="field">
              <span>Currency</span>
              <input name="currencyCode" type="text" defaultValue="USD" required />
            </label>
            <label className="field">
              <span>Timezone</span>
              <input name="timezone" type="text" defaultValue="UTC" required />
            </label>
            <label className="field">
              <span>Sales channel id</span>
              <input name="commerceSalesChannelId" type="text" placeholder="demo-sales-channel" />
            </label>
            <label className="field">
              <span>Region id</span>
              <input name="commerceRegionId" type="text" placeholder="demo-region" />
            </label>
            <label className="field">
              <span>Publishable key ref</span>
              <input name="commercePubKeyRef" type="text" placeholder="demo-publishable-key" />
            </label>
          </div>
          <label className="field">
            <span>Tagline</span>
            <input name="aboutTagline" type="text" placeholder="Config-driven neighborhood commerce" />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              name="aboutDescription"
              rows={4}
              placeholder="Short operator-facing note or storefront description."
            />
          </label>
          <button type="submit">Create tenant</button>
        </form>
      </div>

      {error ? (
        <div className="card">
          <h2>Control-plane DB unavailable</h2>
          <p>
            The admin shell stayed read-only and failed closed while loading tenant summaries.
          </p>
          <pre className="schema-block">{error}</pre>
        </div>
      ) : null}

      <div className="card">
        <h2>Tenant records</h2>
        <p>{rows.length === 0 ? "No tenants found yet." : `${rows.length} tenant record(s) loaded from Postgres.`}</p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Status</th>
              <th>Mode</th>
              <th>Primary host</th>
              <th>Commerce</th>
              <th>Theme</th>
              <th>Flags</th>
              <th>Plugins</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((tenant) => (
              <tr key={tenant.id}>
                <td>
                  <strong>{tenant.displayName}</strong>
                  <div className="table-subtle">
                    {tenant.locale} · {tenant.currencyCode}
                  </div>
                </td>
                <td>
                  <code>{tenant.slug}</code>
                </td>
                <td>
                  <span className={`badge ${tenant.status === "active" ? "badge-ok" : "badge-pending"}`}>
                    {tenant.status}
                  </span>
                </td>
                <td>
                  <code>{tenant.deployMode}</code>
                </td>
                <td>
                  <code>{tenant.primaryHostname ?? "—"}</code>
                </td>
                <td>
                  <code>{tenant.commerceSalesChannelId ?? "—"}</code>
                  <div className="table-subtle">
                    {tenant.commerceRegionId && tenant.commercePubKeyRef
                      ? `${tenant.commerceRegionId} · secret:${tenant.commercePubKeyRef}`
                      : "binding incomplete"}
                  </div>
                </td>
                <td>
                  <code>{tenant.themePreset ?? "—"}</code>
                </td>
                <td>{tenant.flagCount}</td>
                <td>{tenant.pluginCount}</td>
                <td>{formatTimestamp(tenant.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Edit tenant rows</h2>
        <p>
          This write path stays intentionally boring: core metadata, status, and commerce
          bindings only. Domain ownership remains on the Domains page, and richer about/contact
          editing still belongs in a fuller config UI later.
        </p>
        <div className="edit-grid">
          {rows.map((tenant) => (
            <form key={tenant.id} action={updateTenantAction} className="card inset-card stack-form">
              <input name="tenantId" type="hidden" value={tenant.id} />
              <h3>{tenant.displayName}</h3>
              <p className="table-subtle">
                <code>{tenant.id}</code>
              </p>
              <div className="form-grid">
                <label className="field">
                  <span>Display name</span>
                  <input name="displayName" type="text" defaultValue={tenant.displayName} required />
                </label>
                <label className="field">
                  <span>Slug</span>
                  <input name="slug" type="text" defaultValue={tenant.slug} required />
                </label>
                <label className="field">
                  <span>Legal name</span>
                  <input name="legalName" type="text" defaultValue={tenant.legalName ?? ""} />
                </label>
                <label className="field">
                  <span>Status</span>
                  <select name="status" defaultValue={tenant.status} required>
                    <option value="draft">draft</option>
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                    <option value="archived">archived</option>
                  </select>
                </label>
                <label className="field">
                  <span>Deploy mode</span>
                  <select name="deployMode" defaultValue={tenant.deployMode} required>
                    <option value="shared_runtime">shared_runtime</option>
                    <option value="generated_app">generated_app</option>
                  </select>
                </label>
                <label className="field">
                  <span>Locale</span>
                  <input name="locale" type="text" defaultValue={tenant.locale} required />
                </label>
                <label className="field">
                  <span>Currency</span>
                  <input name="currencyCode" type="text" defaultValue={tenant.currencyCode} required />
                </label>
                <label className="field">
                  <span>Timezone</span>
                  <input name="timezone" type="text" defaultValue={tenant.timezone} required />
                </label>
                <label className="field">
                  <span>Sales channel id</span>
                  <input
                    name="commerceSalesChannelId"
                    type="text"
                    defaultValue={tenant.commerceSalesChannelId ?? ""}
                  />
                </label>
                <label className="field">
                  <span>Region id</span>
                  <input
                    name="commerceRegionId"
                    type="text"
                    defaultValue={tenant.commerceRegionId ?? ""}
                  />
                </label>
                <label className="field">
                  <span>Publishable key ref</span>
                  <input
                    name="commercePubKeyRef"
                    type="text"
                    defaultValue={tenant.commercePubKeyRef ?? ""}
                  />
                </label>
              </div>
              <label className="field">
                <span>Tagline</span>
                <input name="aboutTagline" type="text" defaultValue={tenant.aboutTagline ?? ""} />
              </label>
              <label className="field">
                <span>Description</span>
                <textarea name="aboutDescription" rows={4} defaultValue={tenant.aboutDescription ?? ""} />
              </label>
              <button type="submit">Save tenant</button>
            </form>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Still deferred</h2>
        <ul>
          <li>
            <strong>Memberships and audit</strong> — read views for <code>tenant_membership</code>
            and <code>audit_log</code> are still missing.
          </li>
          <li>
            <strong>Theme editing</strong> — tenant creation seeds a safe base theme, but visual
            customization is still read-only here.
          </li>
          <li>
            <strong>Structured about/contact fields</strong> — this page only edits tagline and
            description, not the full JSON contract.
          </li>
        </ul>
      </div>
    </>
  );
}
