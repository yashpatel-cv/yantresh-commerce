# PROJECT_BRIEF — Yantresh Commerce

## What
Multi-tenant ecommerce platform: one master codebase → many client storefronts.
New client = config row by default (`deploy_mode = shared_runtime`); generated
standalone app on demand (`deploy_mode = generated_app`).

## Stack
- Commerce: Medusa v2 (sales channel + publishable key per tenant)
- Config admin: Payload v3 (+ multi-tenant plugin) — admin skin, not source of truth
- Storefront: Next.js 16, one shared multi-tenant app (host → tenant resolve)
- Data: PostgreSQL 16 (control-plane + Medusa DBs), Redis 7, Drizzle ORM
- Worker: BullMQ (catalog import, inventory sync)
- Monorepo: pnpm workspaces + Turborepo
- Packages: `@yantresh/*`

## Source of truth
- `docs/PRD.md` — full PRD & technical architecture (v2)
- `docs/schema.sql` — control-plane DDL (RLS + tenant_id, secrets, audit)
- `docs/contracts.ts` — Zod config schemas + Plugin SDK

## Ecosystem (reuse, do not rebuild) — owner: yashpatel-cv
- `yantresh-hub` — deploy plane: Caddy edge (TLS via `ACME_EMAIL`), one container
  per project from GHCR, pull-based CD via systemd timer, `.env` single source.
- `yantresh-os` — bounded mission spine, `/v1/missions` (`X-API-Key`). Optional
  upgrade lane for risky imports/reconciliation.
- `patel-portfolio` — hardened Astro static; config-as-source, fails closed.

## Deploy rules
- Register as hub services: `yantresh-commerce-{storefront,admin,medusa,worker}`.
- Hostnames: `shop-api.` (Medusa), `shop-admin.` (Payload). Avoid `api.` collision
  with `yantresh-os`. Verify hub `.env` before wiring DNS.
- One additive Caddy change: wildcard + on-demand-TLS for `*.yantresh.com` + BYO
  domains, `ask` endpoint gated on the `domain` table.

## Doctrine (every slice must pass)
RLS + `tenant_id` from day one · AES-256-GCM + per-tenant KDF secrets (never
plaintext/hardcoded) · untrusted-output fencing (`FencedResult` /
`canonicalProductSchema`) · cost-as-signal (OTel `cost_usd` + per-tenant spend
caps) · config-as-source fail-closed · container hardening · zero-bloat. See
`CLAUDE.md`.

## Roadmap (each phase shippable; exit test = acceptance check)
- P0 Foundation + hub wiring → `demo-client.yantresh.com` serves a placeholder over hub TLS
- P1 Control plane (Payload + config schema) → tenant config editable + validates
- P2 Multi-tenant storefront (resolver, RLS session, fail-closed) → 2 tenants render distinctly
- P3 Commerce (Medusa, channel/key per tenant) → real test checkout completes
- P4 Plugin system (SDK + registry + 4 plugins, DB flags) → toggle plugin, no redeploy
- P5 Catalog & fulfillment (worker, Sheets/CSV import, delivery/pickup) → scheduled import works
- P6 Hardening & ops (secrets crypto, RLS tests, backups, monitoring) → tested restore
- P7 Generator / per-client apps (`yantresh gen <slug>`) → generated_app deploys as own image
- P8 Breadth, OS seam & polish

## Status
- Repo bootstrapped (this commit). No code packages yet.
- Next milestone: P0 — root monorepo config (package.json, pnpm-workspace, turbo)
  + `packages/db` (Drizzle from `schema.sql`) + hub registration fragments.
