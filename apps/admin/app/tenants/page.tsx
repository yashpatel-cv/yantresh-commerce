// ponytail: no DB reads; Phase 2 wires Drizzle queries here behind Payload collections.
import type { TenantConfig } from "@yantresh/config-schema";

// Typed stub — shape matches schema.sql tenant + theme + domain rows.
const STUB: Pick<TenantConfig, "slug" | "displayName" | "status" | "deployMode"> = {
  slug: "demo-store",
  displayName: "Yantresh Demo Store",
  status: "active",
  deployMode: "shared_runtime",
};

export default function TenantsPage() {
  return (
    <>
      <p className="eyebrow">Control plane → Tenants</p>
      <h1>Tenants</h1>
      <p>
        Each tenant maps to one row in the <code>tenant</code> table (see{" "}
        <code>docs/schema.sql</code>). Config is resolved at request time by the storefront
        middleware via <code>@yantresh/core</code>.
      </p>

      <div className="card">
        <h2>TenantConfig shape</h2>
        <p>The canonical type lives in <code>packages/config-schema/src/contracts.ts</code>.</p>
        <pre className="schema-block">{`interface TenantConfig {
  id:           UUID           // postgres uuid
  slug:         string         // e.g. "demo-store" — drives host routing
  displayName:  string
  status:       "draft" | "active" | "suspended" | "archived"
  deployMode:   "shared_runtime" | "generated_app"
  locale:       string         // BCP-47
  currencyCode: string         // ISO-4217
  about:        About          // jsonb
  theme: {
    preset:   string
    tokens:   ThemeTokens      // jsonb — see /theme
    logoUrl?: string
  }
  domains:  { hostname: string; isPrimary: boolean }[]
  commerce: {
    salesChannelId:    string
    regionId:          string
    publishableKeyRef: SecretRef   // "secret:<name>", never plaintext
  }
  plugins: { key: string; enabled: boolean; config: object }[]
  flags:   Record<string, unknown>
}`}</pre>
      </div>

      <div className="card">
        <h2>Demo tenant (seed record)</h2>
        <p>
          Created by <code>pnpm seed:demo</code>. Values below are read from{" "}
          <code>.env</code> at seed time.
        </p>
        <div className="env-strip">
          <span className="env-chip"><strong>slug</strong> {STUB.slug}</span>
          <span className="env-chip"><strong>name</strong> {STUB.displayName}</span>
          <span className="env-chip"><strong>status</strong> {STUB.status}</span>
          <span className="env-chip"><strong>mode</strong> {STUB.deployMode}</span>
        </div>
      </div>

      <div className="card">
        <h2>Deferred</h2>
        <ul>
          <li>
            <strong>CRUD UI</strong> — Phase 2 installs Payload CMS with the official
            multi-tenant plugin; it auto-generates forms over the config schema.
          </li>
          <li>
            <strong>Per-tenant isolation</strong> — Postgres RLS policies are in{" "}
            <code>docs/schema.sql</code>; enforcement is deferred until the first
            external tenant is onboarded.
          </li>
          <li>
            <strong>Generated-app deploy</strong> — <code>turbo gen</code> scaffold exists;
            wired to CI only when the first client opts into{" "}
            <code>deployMode: generated_app</code>.
          </li>
        </ul>
      </div>
    </>
  );
}
