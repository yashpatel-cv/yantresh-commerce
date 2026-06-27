import { platformEnv } from "../lib/env";

// ponytail: no live health probes; Phase 2 adds /api/health that pings Medusa + DB + Redis.
export default function StatusPage() {
  const env = platformEnv();

  const services = [
    { key: "shop-admin", addr: env.shopAdmin, note: "This app" },
    { key: "shop-api (Medusa)", addr: env.shopApi, note: "Commerce engine" },
    { key: "storefront", addr: env.storefront, note: "Shared Next.js storefront" },
    { key: "demo-store", addr: env.demoStore, note: "Demo tenant entry point" },
  ];

  const envChecks = [
    { key: "DOMAIN", val: env.domain },
    { key: "SHOP_ADMIN_ADDRESS", val: env.shopAdmin },
    { key: "SHOP_API_ADDRESS", val: env.shopApi },
    { key: "COMMERCE_STOREFRONT_ADDRESS", val: env.storefront },
    { key: "DEMO_STORE_ADDRESS", val: env.demoStore },
  ];

  return (
    <>
      <p className="eyebrow">Control plane → Status</p>
      <h1>Platform Status</h1>
      <p>
        Service addresses are read from the deployment environment. Health probes and uptime
        monitoring are deferred to Phase 2.
      </p>

      <div className="card">
        <h2>Services</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.75rem", fontSize: "0.8rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "0.4rem 0.6rem 0.4rem 0" }}>Service</th>
              <th style={{ padding: "0.4rem 0.6rem" }}>Address</th>
              <th style={{ padding: "0.4rem 0.6rem" }}>Note</th>
              <th style={{ padding: "0.4rem 0 0.4rem 0.6rem" }}>Health</th>
            </tr>
          </thead>
          <tbody>
            {services.map(({ key, addr, note }) => (
              <tr key={key} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "0.4rem 0.6rem 0.4rem 0", fontFamily: "ui-monospace, monospace" }}>{key}</td>
                <td style={{ padding: "0.4rem 0.6rem", fontFamily: "ui-monospace, monospace", color: "var(--ink-muted)" }}>
                  {addr || "—"}
                </td>
                <td style={{ padding: "0.4rem 0.6rem", color: "var(--ink-muted)" }}>{note}</td>
                <td style={{ padding: "0.4rem 0 0.4rem 0.6rem" }}>
                  <span className="badge badge-pending">probe deferred</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Env var check</h2>
        <p>All required platform addresses must be set. Missing values show as <code>—</code>.</p>
        <div className="env-strip" style={{ marginTop: "0.75rem" }}>
          {envChecks.map(({ key, val }) => (
            <span key={key} className="env-chip">
              <strong>{key}</strong>{" "}
              {val ? <span style={{ color: "var(--ink)" }}>{val}</span> : <span style={{ color: "#c0392b" }}>not set</span>}
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Deferred</h2>
        <ul>
          <li>
            <strong>Live health probes</strong> — Phase 2; add <code>/api/health</code> that
            pings Medusa <code>/store/health</code>, Postgres, and Redis, then surfaces badge
            colours here.
          </li>
          <li>
            <strong>Uptime / alerting</strong> — reuse yantresh-os mission ledger for cost
            and error budgets, or plug in UptimeRobot (no-cost tier).
          </li>
          <li>
            <strong>Deploy audit log</strong> — Phase 2; log image SHA + timestamp on each
            hub pull-CD cycle into the <code>audit_log</code> table.
          </li>
        </ul>
      </div>
    </>
  );
}
