import { themeTokensSchema } from "@yantresh/config-schema";

import {
  formatJsonInline,
  formatTimestamp,
  loadFeatureFlagSummaries,
  loadThemeSummaries
} from "../lib/control-plane";

const colorKeys = ["primary", "onPrimary", "bg", "fg", "accent", "muted"] as const;

export const dynamic = "force-dynamic";

export default async function ThemePage() {
  const [{ error: themeError, rows: themes }, { error: flagError, rows: flags }] = await Promise.all([
    loadThemeSummaries(),
    loadFeatureFlagSummaries()
  ]);

  return (
    <>
      <p className="eyebrow">Control plane → Theme / Config</p>
      <h1>Theme &amp; Config</h1>
      <p>
        The admin shell now renders active theme rows and feature flags from Postgres so the
        shared storefront’s request-time config is visible without opening SQL directly.
      </p>

      {themeError ? (
        <div className="card">
          <h2>Theme snapshot unavailable</h2>
          <pre className="schema-block">{themeError}</pre>
        </div>
      ) : null}

      <div className="card">
        <h2>Active theme rows</h2>
        <p>{themes.length === 0 ? "No theme rows found yet." : `${themes.length} theme row(s) loaded from Postgres.`}</p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Tenant</th>
              <th>Preset</th>
              <th>Colors</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {themes.map((theme) => {
              const parsed = themeTokensSchema.safeParse(theme.tokens);
              const colors = parsed.success ? parsed.data.colors : null;

              return (
                <tr key={theme.id}>
                  <td>
                    <strong>{theme.tenantDisplayName}</strong>
                    <div className="table-subtle">
                      <code>{theme.tenantSlug}</code>
                    </div>
                  </td>
                  <td>
                    <code>{theme.preset}</code>
                  </td>
                  <td>
                    {colors ? (
                      <div className="swatch-row">
                        {colorKeys
                          .filter((key) => Boolean(colors[key]))
                          .map((key) => (
                            <span key={key} className="env-chip swatch-chip">
                              <span
                                className="swatch"
                                style={{ background: String(colors[key]) }}
                                aria-hidden="true"
                              />
                              <strong>{key}</strong> {String(colors[key])}
                            </span>
                          ))}
                      </div>
                    ) : (
                      <span className="badge badge-pending">invalid tokens</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${theme.isActive ? "badge-ok" : "badge-pending"}`}>
                      {theme.isActive ? "active" : "inactive"}
                    </span>
                  </td>
                  <td>{formatTimestamp(theme.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {flagError ? (
        <div className="card">
          <h2>Feature flag snapshot unavailable</h2>
          <pre className="schema-block">{flagError}</pre>
        </div>
      ) : null}

      <div className="card">
        <h2>Feature flags</h2>
        <p>{flags.length === 0 ? "No feature flags stored yet." : `${flags.length} feature flag row(s) loaded from Postgres.`}</p>
        <table className="data-table">
          <thead>
            <tr>
              <th>Scope</th>
              <th>Key</th>
              <th>Type</th>
              <th>Value</th>
              <th>Rollout</th>
            </tr>
          </thead>
          <tbody>
            {flags.map((flag) => (
              <tr key={flag.id}>
                <td>
                  <code>{flag.tenantSlug ?? "global"}</code>
                </td>
                <td>
                  <strong>{flag.key}</strong>
                  <div className="table-subtle">{flag.description ?? "No description"}</div>
                </td>
                <td>
                  <code>{flag.valueType}</code>
                </td>
                <td>
                  <code>{formatJsonInline(flag.value)}</code>
                </td>
                <td>{flag.rolloutPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Deferred</h2>
        <ul>
          <li>
            <strong>Visual editing</strong> — still deferred; this is read-only visibility,
            not a theme editor.
          </li>
          <li>
            <strong>Logo and media uploads</strong> — not wired until Payload/object storage
            integration lands.
          </li>
          <li>
            <strong>Cache invalidation</strong> — theme/flag changes are visible here
            immediately but storefront cache busting is still a later phase.
          </li>
        </ul>
      </div>
    </>
  );
}
