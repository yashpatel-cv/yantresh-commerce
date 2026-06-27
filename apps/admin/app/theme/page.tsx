// ponytail: no visual editor; Phase 2 adds a Payload field with live preview.
import type { ThemeTokens } from "@yantresh/config-schema";

const BASE_PRESET: ThemeTokens = {
  colors: {
    primary: "#b38c54",
    onPrimary: "#ffffff",
    bg: "#f4efe3",
    fg: "#1f1b16",
    accent: "#7f6342",
    muted: "#c9bba8",
  },
  fonts: {
    heading: "Iowan Old Style, Palatino Linotype, serif",
    body: "Iowan Old Style, Palatino Linotype, serif",
  },
  radius: 12,
  spacingScale: 1,
};

export default function ThemePage() {
  return (
    <>
      <p className="eyebrow">Control plane → Theme / Config</p>
      <h1>Theme &amp; Config</h1>
      <p>
        Each tenant has a <code>theme</code> row (<code>theme_preset</code> table) holding a
        preset name and a <code>ThemeTokens</code> JSONB blob. The storefront reads this at
        request time and injects CSS custom properties. No CSS is hardcoded in theme files.
      </p>

      <div className="card">
        <h2>ThemeTokens shape</h2>
        <pre className="schema-block">{`interface ThemeTokens {
  colors: {
    primary:   string        // required — CSS color value
    onPrimary?: string
    bg?:        string
    fg?:        string
    accent?:    string
    muted?:     string
  }
  fonts?: {
    heading?: string         // CSS font-family stack
    body?:    string
  }
  radius?:       number      // px, 0–48
  spacingScale?: number      // multiplier, 0.5–2
}`}</pre>
      </div>

      <div className="card">
        <h2>Base preset values</h2>
        <p>
          Applied when a tenant has no custom theme or inherits <code>preset: "base"</code>.
        </p>
        <div className="env-strip" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          {Object.entries(BASE_PRESET.colors).map(([k, v]) => (
            <span key={k} className="env-chip" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  background: v,
                  border: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              />
              <strong>colors.{k}</strong> {v}
            </span>
          ))}
          <span className="env-chip"><strong>radius</strong> {BASE_PRESET.radius}px</span>
          <span className="env-chip"><strong>spacingScale</strong> {BASE_PRESET.spacingScale}</span>
        </div>
      </div>

      <div className="card">
        <h2>Feature flags</h2>
        <p>
          Flags are stored in the <code>flags</code> JSONB column on the <code>tenant</code>
          row (<code>Record{"<string, unknown>"}</code>). They are resolved at request time
          via the <code>FlagResolver</code> interface in{" "}
          <code>packages/config-schema</code>.
        </p>
        <pre className="schema-block">{`interface FlagResolver {
  isEnabled(key: string, fallback?: boolean): boolean
  value<T>(key: string, fallback: T): T
}

// Example tenant flags:
{
  "loyalty_enabled": true,
  "catalog_source":  "google_sheet",
  "checkout_v2":     false
}`}</pre>
      </div>

      <div className="card">
        <h2>Deferred</h2>
        <ul>
          <li>
            <strong>Visual theme editor</strong> — Phase 2; a color-picker + font selector
            in Payload that writes to <code>theme_preset.tokens</code> and triggers a
            storefront cache invalidation.
          </li>
          <li>
            <strong>Logo upload</strong> — Phase 2; Payload media field → object storage.
          </li>
          <li>
            <strong>Flag UI</strong> — Phase 2; JSON editor in Payload or Unleash OSS if
            flag volume grows.
          </li>
        </ul>
      </div>
    </>
  );
}
