import Link from "next/link";
import { platformEnv } from "./lib/env";

// ponytail: no real metrics here; wire Medusa /store/health + DB ping in Phase 2 status checks.
export default function Dashboard() {
  const env = platformEnv();

  const sections = [
    { href: "/tenants", label: "Tenants", desc: "Tenant metadata + activation-safe writes are now live" },
    { href: "/domains", label: "Domains", desc: "Hostname → tenant routing — manual write path is now live" },
    { href: "/theme", label: "Theme / Config", desc: "ThemeTokens + feature flags — visual editor deferred" },
    { href: "/status", label: "Status", desc: "Service addresses + health — health probes deferred" },
  ];

  return (
    <>
      <p className="eyebrow">Control plane</p>
      <h1>Yantresh Commerce Admin</h1>
      <p>
        This is the Phase 1 admin shell. It exposes the config-plane surface for the platform.
        Operators can now manage tenant metadata and domain routing rows directly from the admin
        shell while richer config editing stays deferred.
      </p>

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h2>Platform addresses</h2>
        <p>Values are read from the deployment environment (see <code>.env.example</code>).</p>
        <div className="env-strip">
          <span className="env-chip"><strong>DOMAIN</strong> {env.domain || "—"}</span>
          <span className="env-chip"><strong>shop-admin</strong> {env.shopAdmin || "—"}</span>
          <span className="env-chip"><strong>storefront</strong> {env.storefront || "—"}</span>
          <span className="env-chip"><strong>shop-api</strong> {env.shopApi || "—"}</span>
          <span className="env-chip"><strong>demo-store</strong> {env.demoStore || "—"}</span>
        </div>
      </div>

      <div className="nav-grid">
        {sections.map(({ href, label, desc }) => (
          <Link key={href} href={href} className="nav-card">
            <p className="nav-card-label">{label}</p>
            <p className="nav-card-desc">{desc}</p>
          </Link>
        ))}
      </div>

      <div className="card" style={{ marginTop: "1.25rem" }}>
        <h2>What is deferred</h2>
        <ul>
          <li>Auth / session — Phase 2 (Payload built-in auth or NextAuth)</li>
          <li>Full config CMS — Phase 2 (Payload collections over <code>schema.sql</code>)</li>
          <li>Domain provisioning automation — hub Caddy on-demand TLS (already wired)</li>
          <li>Catalog management — plugin-level concern, not control plane</li>
          <li>Payload CMS install — adds ~40 MB; deferred until config UI is needed</li>
        </ul>
      </div>
    </>
  );
}
