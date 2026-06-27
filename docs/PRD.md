# Yantresh Commerce — PRD & Technical Architecture

**Status:** Draft v2 (ecosystem-aligned) · **Owner:** Patel · **Date:** 2026-06-27
**Repo:** `yantresh-commerce` · **Packages:** `@yantresh/*` · **Deploy plane:** existing `yantresh-hub`
**Target operator:** solo developer / small agency · **Cost target:** $0/mo recurring on existing Oracle ARM64 (Ampere A1) VPS + `yantresh.com`
**Companion artifacts:** [`schema.sql`](./schema.sql) (canonical control-plane DDL) · [`contracts.ts`](./contracts.ts) (config types + plugin SDK)

---

## Problem statement

One master codebase produces and operates many client convenience/ecommerce storefronts. Each client is described by a single configuration record (name, branding, about, domain, catalog source, payment/delivery options, enabled plugins). Adding a client must be a *config* operation by default, and a *code-generation* operation only when a client needs isolation or custom code. The system runs at near-zero recurring cost on the existing self-hosted infrastructure without compromising design quality, security, or the scaling path.

## Ecosystem fit (the Yantresh family)

This is a sibling to your existing repos, not a detour, and the design reuses what already runs on the VPS:

- **It productizes Project Synapse.** The SMB ops automation you run per-client (Stripe + supplier feeds + POS + LLM behind a JSON-Schema gate) becomes a repeatable, config-driven product instead of bespoke glue per client.
- **It deploys through `yantresh-hub`** exactly like `yantresh-os` and `patel-portfolio`: own repo → CI builds multi-arch images → GHCR → the hub pulls and fronts them with Caddy (TLS via `ACME_EMAIL`), with `.env` as the single source of domains/secrets/image refs and pull-based CD via systemd timer.
- **It shares `yantresh-os` doctrine:** Postgres RLS + `tenant_id` on every table from day one, AES-256-GCM secrets with a per-tenant KDF, untrusted-output fencing (your JSON-Schema gate is my `FencedResult` + `canonicalProductSchema`), and cost-as-a-first-class-signal.
- **It can call `yantresh-os` (optional upgrade).** The riskiest commerce ops — catalog import from messy Sheets/POS, inventory reconciliation, supplier-feed parsing — are exactly bounded-mission work. A `CatalogSourcePlugin.pull()` either parses in-process (MVP) or POSTs the raw source to the hub's `/v1/missions` seam (`X-API-Key`) with a definition-of-done = "return rows matching `canonicalProductSchema`." The Verification Gate then guarantees schema-valid output or a clean `escalated` state — never garbage into Medusa — reusing the Five-Bounds + `ledger.py` + daily-fuse cost defense so a runaway import can neither hang nor overspend.

House rules inherited from the other repos' `CLAUDE.md`: minimalism / zero bloat, no hardcoded secrets, atomic conventional commits (50–100 words), LF endings, premium non-AI design.

## 0. Decisions at a glance

| Decision | Verdict | Rationale |
|---|---|---|
| Commerce engine | **Adopt Medusa v2** (self-hosted) | Its modules map 1:1 to the required features (cart, payment, fulfillment, inventory, promotion, sales-channel). Reimplementing checkout/payments is the biggest waste of time and security risk to avoid. |
| Multi-store mechanism | **Medusa Sales Channel + publishable API key per client** | Native, intended path for "many storefronts, one backend." Confirmed in current (2026) docs. |
| Storefront | **Next.js 16 (App Router), one shared multi-tenant app** | Host-based tenant resolution in middleware; one process serves all clients → $0 marginal cost per client. |
| Control plane / config admin | **Payload CMS v3 + official multi-tenant plugin** | Auto-generated admin over Postgres (Drizzle adapter); avoids building a config UI. Used as a replaceable *admin skin*, not the source of truth. |
| Source of truth for config | **`schema.sql` (Postgres) validated by Zod** | ORM/admin-agnostic, versioned, explicit. Mirrors the portfolio's "layout = pure function of validated `content.json`" doctrine. |
| Query layer | **Drizzle ORM** | Lean, SQL-first, no native query-engine binary → clean on ARM64; same engine Payload uses internally. |
| Tenancy model | **Hybrid** | Runtime multi-tenant by default; generated per-client app as an opt-in upgrade. (§2) |
| Monorepo tooling | **pnpm workspaces + Turborepo (`turbo gen`)** | Turborepo for task graph/caching; `turbo gen` (Plop) for the per-client generator. Nx is heavier than needed. |
| Feature flags | **DB-backed, layered resolution** (self-hosted) | No SaaS dependency. Unleash/Flagsmith OSS is the documented upgrade. |
| Plugin registry | **Yes — typed, in-repo** | Central to the product. Minimal (no marketplace) for MVP. |
| **Deploy plane** | **Reuse `yantresh-hub`** | Own repo → CI → GHCR → hub Caddy + pull-CD. No new infra pattern. (§8) |
| **Edge proxy / TLS** | **Caddy (the hub's existing edge)** | Already your edge. One additive change: a wildcard + on-demand-TLS block for tenant subdomains and BYO domains. |
| **Secrets** | **AES-256-GCM + per-tenant KDF** (`secret` table) | Matches the yantresh-os encrypted token store; master key lives outside the DB. |
| **Risky ops engine** | **In-process (MVP) → `yantresh-os` missions (upgrade)** | Bounded, cost-capped, verified imports/sync reusing the OS spine. |

**On the tools you asked me to evaluate:** Medusa.js — yes (core engine). Payload CMS — yes (admin/CMS, not source of truth). Nx vs Turborepo — Turborepo. Feature flags — yes, DB-backed. Plugin registry — yes, in-repo and typed.

---

## 1. Recommended architecture

Three planes, one VPS, one Postgres cluster, fronted by the hub's Caddy.

```
 *.yantresh.com (wildcard DNS -> VPS IP)
 │
 ┌────────────▼──────────────┐
 │ yantresh-hub : Caddy │ auto-HTTPS, host routing,
 │ (edge, GHCR pull, CD) │ on-demand TLS for BYO domains
 └─┬───────┬────────┬────────┬┘
 portfolio./os. │ shop- │ shop- │ stores./*.yantresh.com / <client>./ BYO
 (existing) │ admin. │ api. │
 ┌──────▼──┐ ┌───▼─────┐ ┌▼──────────────────────────┐
 CONTROL │ Payload │ │ Medusa │ │ Next.js Storefront │ RUNTIME
 PLANE │ admin │ │ v2 API │ │ (shared, multi-tenant) │
 │ config+ │ │ + Admin │ │ host -> tenant resolve │
 │ content │ │ │ │ -> config + plugins │
 └────┬────┘ └────┬────┘ └─────────────┬──────────────┘
 │ │ │
 │ ┌────▼─────┐ ┌────▼─────┐
 │ │ Worker │ │ packages │
 │ │ (BullMQ) │ │ /plugins │
 │ │ imports, │ └──────────┘
 │ │ inv sync │── optional ──▶ yantresh-os /v1/missions
 │ └────┬─────┘ (bounded, cost-capped)
 ┌────────▼───────────▼───────────────────┐
 │ PostgreSQL 16 │ Redis 7 │ COMMERCE + DATA
 │ control-plane │ event bus / queue / │ (hub services, named volumes)
 │ DB + Medusa DB │ cache / locks │
 └─────────────────────────────────────────┘
```

**Stack and cost:**

| Component | Choice | Role | $/mo |
|---|---|---|---|
| Edge proxy | Caddy (in `yantresh-hub`) | TLS, host→service routing, wildcard + on-demand certs | 0 |
| Storefront | Next.js 16 | Shared multi-tenant rendering (in-container nginx-unprivileged static server, house standard) | 0 |
| Commerce | Medusa v2 | Cart, checkout, orders, payments, fulfillment, inventory, promotions | 0 |
| Config admin / CMS | Payload v3 (+ multi-tenant plugin) | Tenant config, about/homepage content, media | 0 |
| Database | PostgreSQL 16 | Control-plane DB + Medusa DB (separate logical DBs) | 0 |
| Cache/queue | Redis 7 | Medusa event bus/workflow/cache + BullMQ jobs | 0 |
| Worker | Node (BullMQ) | Catalog import, inventory sync, scheduled jobs | 0 |
| Query layer | Drizzle ORM | Typed access to control-plane DB | 0 |
| Object storage | Local volume (→ R2/S3 later) | Media/logos | 0 |

**Why this shape.** The commerce primitives (cart→checkout→order→payment→fulfillment→inventory→promotions) are where most "build it yourself" ecommerce projects die. Medusa v2 ships all of them as composable modules, is MIT-licensed, pure Node/TypeScript (clean ARM64), and its **sales channel + publishable API key** design is the *intended* way to serve many storefronts from one backend. Payload gives a production admin for free. Next.js resolves the tenant from the request host, so a new client is a database row, not a deployment — and the whole thing rides your existing hub.

**Requested features → where they live:**

| Requested feature | Provided by | Notes |
|---|---|---|
| Checkout | Medusa Cart + Payment modules | Storefront drives Medusa Store API |
| Payment providers | Medusa Payment module + `payment-*` plugins | Stripe/Razorpay as provider plugins |
| Delivery / Pickup | Medusa Fulfillment module + `delivery-*`/`pickup-*` plugins | Shipping options per sales channel |
| Coupons | Medusa Promotion module + `coupons-core` plugin | Discounts/campaigns native |
| Inventory sync | Medusa Inventory module + `inventory-sync` plugin/worker | Push from source → Medusa; optionally a bounded OS mission |
| Catalog import (Sheets/CSV/POS/API) | `catalog_source` plugins + worker | Pull → canonical shape → upsert to Medusa; optionally a bounded OS mission |
| Loyalty | `loyalty-points` plugin | Event-driven (`order.placed`) |
| Homepage/layout modules | `layout_module` plugins + `homepage_block` table | Ordered, config-driven slots |

---

## 2. Tenancy model — runtime multi-tenant vs generated app vs hybrid

| Dimension | Runtime multi-tenant (shared app) | Generated per-client app | **Hybrid (recommended)** |
|---|---|---|---|
| New client cost | DB row | Build + deploy a container | Row by default; generate on demand |
| Isolation | Soft (logical, RLS) | Hard (own process/DB) | Soft default, hard when needed |
| Ops at 20 clients | 1 app to run | 20 apps to run | 1 app + a few generated ones |
| Custom code per client | Hard (everything shared) | Easy (own codebase) | Easy via generation |
| Blast radius of a bug | All clients | One client | Mostly all; VIPs isolated |
| Update propagation | Instant (one deploy) | Must regenerate/redeploy | Instant for shared; managed for generated |
| Best for | Many small/standard stores | Few high-value/custom stores | Reality: a mix |

**Recommendation: hybrid, defaulting to runtime multi-tenancy.** The shared Next.js storefront resolves the tenant from the incoming host and renders that tenant's catalog, theme, and enabled plugins. This is the $0-marginal-cost path and where most convenience-store clients live. The `tenant.deploy_mode` column flips a client to `generated_app` when they need isolation, a custom domain with its own SLA, or bespoke code — the generator (§5) then emits a standalone app deployed as its own hub service.

**Request lifecycle (runtime path):**

1. Request hits the hub's Caddy → routed by host to the storefront.
2. Storefront middleware reads `Host`, looks up `domain.hostname → tenant` (cached; Redis + in-memory LRU).
3. It sets the Postgres session var `app.current_tenant` (activates RLS) and loads the validated `TenantConfig` (`tenantConfigSchema`). **Fail-closed:** an invalid/never-validated config refuses to render rather than leaking a half-configured store (the portfolio's `content.json` discipline, applied at runtime).
4. The plugin registry returns only this tenant's enabled, dependency-satisfied plugins; their slots mount into the page.
5. Catalog/cart/checkout calls go to Medusa using the tenant's **publishable API key** (scoped to its sales channel), so Medusa returns only that client's products and prices.

**Commerce isolation.** In MVP, one Medusa instance serves all tenants; each tenant = one **sales channel** (+ region + stock location), and the storefront uses that channel's publishable key. This is soft isolation: cheap, native, correct for independent small clients, *provided* the server always scopes by tenant. Defense-in-depth: per-channel publishable keys, a server-side tenant guard, and Postgres **Row-Level Security** so a forgotten `WHERE` cannot leak across tenants. Hard isolation upgrade = a dedicated Medusa DB schema or instance (§8).

---

## 3. Database / config schema

Full DDL is in [`schema.sql`](./schema.sql) (PostgreSQL 16, ORM-agnostic, with RLS policies, triggers, and seed plugins). Summary:

| Table | Purpose | Tenant-scoped (RLS) |
|---|---|---|
| `tenant` | The client "source/config record": name, about, locale, currency, Medusa binding, `deploy_mode`, `config_version` | self |
| `domain` | Hostname → tenant (subdomain or BYO domain), TLS status, one primary per tenant | yes |
| `theme` | Branding tokens (colors/fonts/radius → CSS vars), logo, preset, sanitized custom CSS | yes |
| `homepage_block` | Ordered, config-driven homepage/layout modules (some provided by plugins) | yes |
| `plugin` | Global registry of *available* plugins: kind, version, config schema, capabilities, requires | no |
| `tenant_plugin` | *Enabled* plugins per tenant + non-secret config + ordering (payment/delivery modeled here) | yes |
| `feature_flag` | Layered flags; `tenant_id NULL` = global default; `rollout_pct` for gradual rollout | yes (+global) |
| `catalog_source` | Per-tenant import sources (Sheets/CSV/POS/API) + cron + secret ref | yes |
| `catalog_sync_run` | Per-import audit: counts, per-row rejections (untrusted input log) | yes |
| `catalog_product` | Import landing/staging mirror; diff via `content_hash` before reconciling into Medusa | yes |
| `secret` | Per-tenant secrets, **AES-256-GCM + per-tenant KDF** (ciphertext + nonce + wrapped DEK + version) | yes |
| `platform_user` / `tenant_membership` | RBAC: platform staff and client users with scoped roles | yes |
| `audit_log` | Every config mutation, with secrets masked in the diff | yes |

**Design rules baked in.** Every tenant-scoped row carries `tenant_id` and is protected by RLS keyed on `app.current_tenant` (the yantresh-os "RLS + tenant_id from day one" rule). Secrets are never stored in plaintext — only refs (`secret:<name>`), resolved server-side per tenant; the DEK is derived per tenant (HKDF) from a master key held outside the DB. JSONB columns are validated at the boundary by the Zod schemas in `contracts.ts`, so the DB stays flexible while the app stays type-safe. `tenant.config_version` lets the generator pin and diff a frozen config.

**Commerce data is not duplicated here.** Products, carts, orders, inventory, and promotions live in Medusa's own schema; the only link is `tenant.commerce_sales_channel_id` / `commerce_pub_key_ref`. `catalog_product` exists solely as a validation/diff staging area for untrusted imported data before it is pushed into Medusa.

---

## 4. Plugin system design & interface

Full types are in [`contracts.ts`](./contracts.ts). Four parts: **registry**, **contract**, **extension points**, **flags**.

**Contract.** Every plugin is a package under `packages/plugins/*` implementing `Plugin` (or a specialization: `PaymentPlugin`, `CatalogSourcePlugin`, `FulfillmentPlugin`). It declares `key`, `kind`, `version`, the `Capability[]` it `provides`, capabilities it `requires`, the `secretKeys` it needs, and one `configSchema` (Zod). That single schema drives the admin form, the JSONB validation, and the generator's typing.

**Extension points (`PluginHost`).** At boot the host calls `register(host)` and the plugin mounts into typed slots: `addSlot` (storefront UI blocks: `home.hero`, `checkout.payment`, …), `addRoute` (signed, tenant-scoped server routes under `/api/plugins/<key>/*`), `addJob` (cron/queue workers), `on` (domain events: `order.placed` → loyalty).

**Per-request context (`PluginContext`).** Least-privilege, tenant-scoped: validated `config`, a `secrets.get(ref)` that resolves only *this tenant's* secrets, a `commerce` client pinned to the tenant's sales channel, a namespaced `cache`, a `logger`. A plugin cannot reach another tenant's secrets, env, or data.

**Security — every plugin output is untrusted (house doctrine).** Outputs cross a fence: handlers return `FencedResult<T>`, the host validates `data` against the expected schema and discards the rest — the same trust boundary as Synapse's JSON-Schema gate. Catalog imports are the highest-risk input: each row must pass `canonicalProductSchema` or it is rejected into `catalog_sync_run.error_report`, never silently coerced. Webhooks are signature-verified; routes are HMAC/nonce-fenced; secrets are AES-256-GCM at rest and masked in audit diffs. Any plugin that calls an LLM carries OTel `cost_usd`/token traces and is subject to per-tenant spend caps (the `ledger.py` discipline).

**Feature-flag resolution** (precedence, highest first): (1) the gating plugin is enabled in `tenant_plugin`; (2) per-tenant `feature_flag` row (+ `rollout_pct`); (3) global `feature_flag` row; (4) code default. Resolved server-side, cached per tenant.

**Low-code contract (mirrors the yantresh-os `tools.py`/TOML ethos):**

| Want | Do | Code |
|---|---|---|
| New plugin | one package implementing `Plugin` (+ Zod `configSchema`) | the plugin only |
| Enable a feature for a client | toggle a `tenant_plugin` row in admin | 0 |
| New payment provider | one `PaymentPlugin` | ~1 file |
| New catalog source | one `CatalogSourcePlugin.pull()` | ~1 file |
| Rebrand a client | edit `theme.tokens` / `homepage_block` rows | 0 |
| New standard client | insert config rows + provision a sales channel | 0 |
| Spin a client to its own app | `yantresh gen <slug>` | 0 (generated) |

**Minimal example (shape):**

```ts
// packages/plugins/coupons-core/index.ts
import { Plugin } from "@yantresh/plugin-sdk";
import { z } from "zod";

const configSchema = z.object({ stackable: z.boolean().default(false) });

export const couponsCore: Plugin<z.infer<typeof configSchema>> = {
 key: "coupons-core",
 kind: "coupon",
 version: "1.0.0",
 provides: ["promotion.apply"],
 requires: ["cart"],
 secretKeys: [],
 configSchema,
 register(host) {
 host.addSlot("checkout.payment", CouponField);
 host.addRoute("POST", "/apply", applyCouponHandler); // /api/plugins/coupons-core/apply
 },
};
```

---

## 5. Code generation workflow

Two generation modes share one source of truth (the tenant config record).

**Mode A — soft generation (default, runtime).** No code emitted. The shared storefront reads `TenantConfig`, the registry filters to enabled plugins, slots mount conditionally. "Generating a client" = inserting/validating rows + provisioning a Medusa sales channel + publishable key. This is `deploy_mode = 'shared_runtime'`. Most clients never leave it.

**Mode B — hard generation (per-client app, upgrade).** For `deploy_mode = 'generated_app'`. `pnpm yantresh gen <slug>` produces a standalone, deployable app that registers as its own hub service:

1. **Resolve & freeze** — read config from Postgres, validate with `tenantConfigSchema`, write a pinned `client.config.json` (records `config_version`).
2. **Scaffold** — `turbo gen` (Plop templates in `packages/generators`) creates `apps/clients/<slug>/` from the storefront template.
3. **Wire plugins** — emit `plugins.generated.ts` importing *only* this client's enabled plugins (smaller bundle + attack surface).
4. **Inject env & theme** — `.env` with secret *placeholders* by ref (never plaintext; the values live in the hub `.env`), theme tokens as CSS vars, `next.config`, a multi-stage **ARM64 Dockerfile** (non-root, read-only FS — house hardening), a hub `docker-compose` service fragment, and a Caddy route for `<slug>.yantresh.com`.
5. **Emit repo conventions** — a `CLAUDE.md` mirroring the family rules and a `build-push.yml` mirroring `yantresh-os` (multi-arch → GHCR).
6. **Verify** — `typecheck` + `build`; fail closed on unmet plugin `requires`.
7. **Output** — a tagged GHCR image the hub pulls like any other project.

**Determinism.** Templates + frozen config → reproducible output; re-running with the same `config_version` yields the same code. **Anti-drift rule:** prefer Mode A. Hard generation is a deliberate escape hatch; keep templates thin and versioned, and regenerate (don't hand-edit) to update a generated client.

---

## 6. Monorepo folder structure

pnpm workspaces + Turborepo. `apps/*` are deployables (each → its own GHCR image), `packages/*` are shared libraries, `infra/*` is the hub-registration glue.

```
yantresh-commerce/
├─ CLAUDE.md # house rules (mirrors yantresh-os / patel-portfolio)
├─ apps/
│ ├─ storefront/ # shared multi-tenant Next.js 16 (default runtime)
│ ├─ admin/ # Payload v3: tenant config + about/homepage content + media
│ ├─ commerce/ # Medusa v2 server + admin (or run upstream image directly)
│ ├─ worker/ # BullMQ: catalog import, inventory sync, schedules (+ optional OS dispatch)
│ └─ clients/ # generated per-client apps (Mode B); git-ignored or separate repo
│ └─ <slug>/
├─ packages/
│ ├─ config-schema/ # Zod schemas + TS types for TenantConfig (mirrors schema.sql) -> contracts.ts
│ ├─ db/ # schema.sql + Drizzle schema + migrations + typed client
│ ├─ core/ # tenant resolver, config loader, RLS session, plugin host/registry
│ ├─ plugin-sdk/ # the Plugin contract, PluginHost, FencedResult, test kit -> contracts.ts
│ ├─ commerce-client/ # scoped Medusa client (sales-channel / publishable-key aware)
│ ├─ os-client/ # optional: typed client for yantresh-os /v1/missions
│ ├─ ui/ # themeable design system + slot components + layout modules
│ ├─ plugins/
│ │ ├─ payment-stripe/ payment-razorpay/
│ │ ├─ delivery-local/ pickup-instore/
│ │ ├─ coupons-core/ loyalty-points/
│ │ ├─ catalog-google-sheets/ catalog-csv/ catalog-pos/
│ │ ├─ inventory-sync/
│ │ └─ layout-hero-grid/ ...
│ └─ generators/ # turbo gen / Plop templates + the `yantresh gen` CLI
├─ infra/
│ ├─ docker/ # ARM64 Dockerfiles (non-root, read-only FS), .dockerignore
│ ├─ hub/ # compose + Caddyfile fragments to paste into yantresh-hub
│ └─ backup/ # pg_dump + rclone scripts
├─ .github/workflows/ # build-push.yml (matrix → one GHCR image per app, multi-arch)
├─ tooling/ # shared eslint/tsconfig/prettier
├─ turbo.json · pnpm-workspace.yaml · package.json
```

---

## 7. MVP scope vs advanced scope

| Area | MVP (ship first) | Advanced (later) |
|---|---|---|
| Tenancy | Shared runtime multi-tenant; soft isolation; RLS | Per-client generated apps; dedicated Medusa per VIP |
| Clients | 1 real + `demo-client.yantresh.com` | Self-serve client onboarding wizard |
| Admin | Payload config + content; Medusa admin for commerce | Unified single admin; client-facing dashboards |
| Catalog | Google Sheets + CSV import → Medusa; manual + scheduled | POS + generic HTTP API; bounded `yantresh-os` import missions; two-way inventory sync |
| Commerce | Cart, checkout, orders; one payment provider (Stripe **or** Razorpay) | Multi-provider, multi-currency, tax/zones |
| Fulfillment | Local delivery + in-store pickup | Carrier rates, delivery zones/slots, route batching |
| Promotions | Coupons (Medusa Promotion) | Loyalty points, referrals, campaigns |
| Storefront | Themed home (hero + grid), PDP, cart, checkout, about | Configurable block library, A/B via flags, i18n |
| Plugins | SDK + registry + ~4 plugins (1 payment, Sheets import, coupons, 1 layout) | Plugin "test connection", versioning, more providers |
| Generator | Soft-gen only | Hard-gen CLI + per-client GHCR image + hub route |
| Ops | Register in `yantresh-hub`; wildcard/on-demand TLS; nightly pg_dump→R2; Uptime Kuma | OTel cost traces + per-tenant spend caps; GlitchTip; Grafana; per-client infra |

**MVP definition of done:** add a client by config, point `<slug>.yantresh.com` at it via the hub, import their catalog from a Google Sheet, and take a real test-mode checkout — all on the existing VPS at $0.

---

## 8. Deployment strategy — plug into `yantresh-hub`

No parallel stack. This platform deploys like every other project in the family: its own repo, CI builds multi-arch images to GHCR, and `yantresh-hub` pulls + Caddy-routes them.

**Per-service images.** A matrix CI workflow (mirroring `yantresh-os/.github/workflows/build-push.yml`) emits one image per deployable:

| Service | Image | Internal port | Hub address (set in hub `.env`) |
|---|---|---|---|
| storefront | `ghcr.io/<owner>/yantresh-commerce-storefront` | 3000 | `stores.${DOMAIN}` + `*.${DOMAIN}` + BYO |
| admin (Payload) | `ghcr.io/<owner>/yantresh-commerce-admin` | 3000 | `shop-admin.${DOMAIN}` |
| commerce (Medusa) | `ghcr.io/<owner>/yantresh-commerce-medusa` | 9000 | `shop-api.${DOMAIN}` |
| worker | `ghcr.io/<owner>/yantresh-commerce-worker` | — | internal |

**Avoid the `api.` collision.** `yantresh-os` may already hold `api.yantresh.com`; use `shop-api.`/`commerce.` for Medusa and `shop-admin.` for Payload. Confirm against the hub's current `.env` before wiring DNS.

**Registering in the hub** (its documented "Adding a project" steps): add each `<svc>` to `docker-compose.yml` (`image: ghcr.io/${GHCR_OWNER}/<svc>:${<SVC>_IMAGE_TAG:-main}`), add `*_ADDRESS` + `*_IMAGE_TAG` to `.env`, add Caddyfile blocks, point DNS, update `docs/SETUP.md`. PostgreSQL 16 (two logical DBs) and Redis 7 are added as hub services with named volumes.

**Wildcard + multi-tenant TLS (the one additive change).** The storefront answers many hostnames. Add to the hub `Caddyfile`:

```caddyfile
# storefront — yantresh.com subdomains (explicit blocks like portfolio./shop-api.
# still win, since Caddy matches most-specific first)
stores.{$DOMAIN}, *.{$DOMAIN} {
 reverse_proxy yantresh-commerce-storefront:3000
}

# BYO client domains — issue certs on demand, gated by an ask endpoint that
# returns 200 only for hostnames present in the `domain` table (prevents abuse)
{
 on_demand_tls {
 ask http://yantresh-commerce-storefront:3000/api/tls/authorize
 }
}
```

For the `*.yantresh.com` subdomains you may alternatively use a DNS-01 wildcard cert if your DNS provider has a Caddy module; on-demand TLS covers both subdomains and BYO domains with no DNS plugin. New client subdomains then need **zero** proxy changes.

**Container hardening (house standard, from `patel-portfolio`).** Non-root UID, read-only root FS + tmpfs, `cap_drop: ALL`, `no-new-privileges`, per-service memory caps, CSP/security headers on the storefront, multi-arch (arm64/amd64), no x86-native deps.

**Resource budget.** Baseline ≈ 2.5–4 GB across all services → comfortable inside the free-tier floor (2 OCPU / 12 GB as of 2026-06-15; PAYG keeps 4/24 free).

**CD / backups / monitoring.** Reuse the hub's pull-based CD (systemd timer redeploys on new `:main` images). Nightly `pg_dump` (both logical DBs) → gzip → `rclone` to Cloudflare R2 / Backblaze B2 (10 GB free); test restores. Uptime Kuma + Dozzle now; GlitchTip (OSS, Sentry-compatible) and Grafana/Prometheus/cAdvisor when warranted.

**Upgrade path (introduce only when a paying client justifies it):**

| Concern | $0 now | Paid upgrade |
|---|---|---|
| Database | Self-hosted PG + nightly dumps | Neon/Supabase/RDS, PITR, read replica |
| Commerce isolation | Shared Medusa, channel per client | Dedicated Medusa DB schema/instance per VIP |
| Storefront scale | 1 process | Replicas behind Caddy; or per-client generated app |
| Media/CDN | Local volume | R2/S3 + Cloudflare CDN (free tier) |
| Secrets | AES-256-GCM + per-tenant KDF (master key in env/age) | Infisical (OSS) / Vault / cloud KMS |
| Flags | DB-backed | Unleash/Flagsmith (OSS → cloud) |
| Risky ops | In-process BullMQ | `yantresh-os` bounded missions; then dedicated worker host |
| Observability | Kuma/Dozzle/GlitchTip | Grafana Cloud / Sentry / BetterStack |
| Reliability | Single VPS | Second VPS + failover; managed LB |

---

## 9. Risks & tradeoffs

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **Oracle free-tier reclaim** — idle (<20% CPU p95 / 7 days) instances can be reclaimed; free A1 halved to 2 OCPU/12 GB on 2026-06-15 | High (loss of host) | Medium | Convert to **PAYG** (still $0 within Always-Free limits, keeps 4/24, less reclaim risk); keep baseline activity; keep restorable backups off-box. |
| **Subdomain collision with `yantresh-os`** on `api.` | Med (routing break) | Med | Namespace commerce as `shop-api.`/`shop-admin.`; verify the hub `.env`; explicit Caddy blocks beat the wildcard. |
| **On-demand-TLS abuse** — attacker points DNS at you to force cert issuance | Med | Med | `ask` endpoint authorizes only hostnames in the `domain` table; rate-limit issuance. |
| **Soft-tenancy data leak** — a query missing tenant scope | Critical | Low–Med | RLS on every tenant table; per-channel publishable keys; central tenant guard; cross-tenant isolation tests. |
| **Single-process blast radius** — one storefront serving all clients | High | Medium | Error boundaries; per-tenant config cache fail-open to last-good; health checks; move VIPs to generated apps. |
| **Catalog import poisoning** — untrusted Sheets/CSV/POS rows | Med | High | Strict `canonicalProductSchema` per row; reject to `error_report`; staging in `catalog_product`; sanitize; optionally a bounded OS mission with a verification gate. |
| **Secrets in shared DB** | Critical | Low | AES-256-GCM + per-tenant KDF; master key outside DB; masked in logs/audit; rotation via `key_version`. |
| **Codegen drift** — generated apps fall behind master | Med | Med | Prefer runtime mode; thin versioned templates; regenerate, don't hand-edit; pin `config_version`. |
| **Two admins** (Payload + Medusa) | Low | High | Accept for MVP (big time saving); unify later behind one shell. |
| **Plugin over-engineering** | Med | Med | Ship the minimal contract + ~4 plugins; no marketplace/dynamic loading until needed. |
| **Coupling to `yantresh-os`** | Low | Low | OS dispatch is optional and behind `os-client`; MVP imports run in-process; keep it a clean seam, not a hard dep (zero-bloat). |

**Core tradeoff:** soft multi-tenancy and a shared process buy $0 marginal cost and instant updates at the price of weaker isolation and a larger blast radius. The hybrid model pays that price only where it's cheap (standard small stores) and buys hard isolation exactly where revenue justifies it.

---

## 10. Implementation roadmap

Phased so each phase is shippable. Rough solo-dev effort in parentheses.

**Phase 0 — Foundation + hub wiring (1 wk).** `yantresh-commerce` repo with pnpm + Turborepo + `CLAUDE.md`; `build-push.yml` (multi-arch → GHCR); register a placeholder `storefront` service in `yantresh-hub` (compose + `.env` + Caddyfile wildcard block); add Postgres/Redis as hub services; `packages/db` with `schema.sql` + Drizzle + migrations. *Exit:* `demo-client.yantresh.com` serves a containerized placeholder over the hub's Caddy TLS.

**Phase 1 — Control plane (1 wk).** Payload v3 + multi-tenant plugin at `shop-admin.yantresh.com`; `packages/config-schema` (Zod from `contracts.ts`); seed `demo-client` with theme + about + domain. *Exit:* a tenant config record is editable and validates.

**Phase 2 — Multi-tenant storefront (1–2 wks).** `packages/core` tenant resolver (host→tenant, RLS session, config cache, fail-closed); themed storefront (hero + grid, PDP, about) from config + theme tokens. *Exit:* two tenants render distinctly from one process by hostname.

**Phase 3 — Commerce (1–2 wks).** Medusa v2 at `shop-api.yantresh.com`; sales channel + region + publishable key per tenant; `commerce-client`; cart + checkout + order with one payment provider in test mode. *Exit:* a real test checkout completes for the demo tenant.

**Phase 4 — Plugin system (1–2 wks).** `plugin-sdk` + registry + `PluginHost` slots; 4 plugins (payment, `catalog-google-sheets`, `coupons-core`, `layout-hero-grid`); DB-backed flags + resolver. *Exit:* enabling/disabling a plugin in admin changes the storefront with no redeploy.

**Phase 5 — Catalog & fulfillment (1–2 wks).** `worker` (BullMQ); Google Sheets + CSV import → validate → `catalog_product` → upsert to Medusa; scheduled syncs + `catalog_sync_run` reporting; delivery + pickup via Medusa fulfillment. *Exit:* a client's catalog imports from a Sheet on a schedule; delivery/pickup selectable at checkout.

**Phase 6 — Hardening & ops (1 wk).** AES-256-GCM + per-tenant-KDF secrets; RLS isolation tests; nightly backups→R2 + tested restore; Uptime Kuma + Dozzle + GlitchTip; audit log wired; container hardening pass. *Exit:* documented restore from backup; alerts on downtime/errors.

**Phase 7 — Generator / per-client apps (1–2 wks).** `yantresh gen <slug>`: freeze config → scaffold `apps/clients/<slug>` → `plugins.generated.ts` → ARM64 Dockerfile + `build-push.yml` + hub compose/Caddy fragments → typecheck/build. *Exit:* a `generated_app` client deploys as its own GHCR image + hub route.

**Phase 8 — Breadth, OS seam & polish (ongoing).** `os-client` + dispatch messy catalog/inventory/supplier-feed jobs as bounded `yantresh-os` missions; OTel cost traces + per-tenant spend caps; loyalty, more payment/catalog providers, POS import, two-way inventory sync, richer block library, onboarding wizard; the paid upgrades from §8 as clients require them.

---

## References (version-checked 2026-06-27)

- Medusa v2 — Publishable API Keys scoped to Sales Channels: https://docs.medusajs.com/resources/commerce-modules/sales-channel/publishable-api-keys
- Medusa 2.0 modules overview: https://www.rigbyjs.com/blog/medusa-modules
- Payload CMS multi-tenant plugin (v3.85.x) + Postgres/Drizzle adapter: https://payloadcms.com/docs/plugins/multi-tenant · https://payloadcms.com/docs/database/postgres
- Next.js current release (16.2.x, Node 20+, Turbopack default): https://nextjs.org/blog
- Oracle Cloud Always Free A1 limits/idle-reclaim (free tier reduced to 2 OCPU/12 GB on 2026-06-15): https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Existing infra conventions: `yantresh-hub` (Caddy + GHCR + pull-CD, `.env` single source), `yantresh-os` (`bounds.py`/`ledger.py`/`router.py`, `/v1/missions`), `patel-portfolio` (content.json single-source, container hardening).
