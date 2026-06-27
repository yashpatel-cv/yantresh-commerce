import { readStorefrontRequestState } from "./storefront-request";

const checkpoints = [
  "Root workspace, db bootstrap, and hub fragments are in place.",
  "Tenant host resolution now runs through a request-scoped control-plane database session.",
  "The platform host stays separate from real storefront tenants until commerce wiring lands."
];

export default async function Page() {
  const {
    adminHost,
    demoStoreHost,
    isPlatform,
    platformHost,
    requestedHost,
    tenantId,
    tenantMessage,
    tenantName,
    tenantSlug,
    tenantTagline
  } = await readStorefrontRequestState();

  return (
    <main className="shell">
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
