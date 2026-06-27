# Yantresh Commerce

One master codebase that produces and operates many client storefronts. A new
client is a config row by default (`shared_runtime`), and a generated app only on
demand (`generated_app`).

Deploys through the existing `yantresh-hub` plane (Caddy + GHCR + pull-based CD).
Target cost: $0/mo recurring on the existing Oracle ARM64 VPS.

- Brief: [`PROJECT_BRIEF.md`](./PROJECT_BRIEF.md)
- Source of truth: [`docs/PRD.md`](./docs/PRD.md) · [`docs/schema.sql`](./docs/schema.sql) · [`docs/contracts.ts`](./docs/contracts.ts)
- House rules: [`CLAUDE.md`](./CLAUDE.md)
- Demo tenant bootstrap: `pnpm seed:demo`
