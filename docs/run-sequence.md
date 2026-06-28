# Control-Plane Run Sequence

Bootstrap order for a fresh environment.

## Prerequisites

- PostgreSQL 16 reachable at `DATABASE_URL`
- `.env` populated from `.env.example`
- `DEMO_STORE_ADDRESS` set (e.g. `demo-store.yantresh.com`)
- `SECOND_DEMO_STORE_ADDRESS` set for the two-tenant proof (e.g. `corner-market.yantresh.com`)

## Steps

```sh
# 1. Apply control-plane DDL (creates all tables, enums, triggers, RLS)
#    Run once against a fresh database. Not idempotent — re-running against
#    an existing schema will error on duplicate types and tables. Use a
#    migration tool (drizzle-kit) for incremental changes in P1+.
pnpm --filter @yantresh/db schema:apply

# 2. Seed the demo tenants (upsert — safe to re-run)
DEMO_STORE_ADDRESS=demo-store.yantresh.com \
SECOND_DEMO_STORE_ADDRESS=corner-market.yantresh.com \
  pnpm --filter @yantresh/db seed:demo

# 3. Start the storefront dev server
pnpm --filter @yantresh/storefront dev

# 4. Verify tenant resolution (in a separate terminal)
./scripts/verify-tenant.sh

# 5. Verify two hostnames render distinct tenant config from the same runtime
DEMO_STORE_ADDRESS=demo-store.yantresh.com \
SECOND_DEMO_STORE_ADDRESS=corner-market.yantresh.com \
  ./scripts/verify-two-tenants.sh
```

`schema:apply` reads `packages/db/sql/schema.sql` and executes it via
`sql.unsafe()`. It is safe to run once on a fresh database; subsequent runs
against a non-empty schema will fail on duplicate type names. Drop and
recreate the database to reset, or use drizzle-kit migrations for incremental
changes.

`seed:demo` uses upsert semantics — it is idempotent and safe to re-run at
any point to refresh the demo tenant record. When `SECOND_DEMO_STORE_ADDRESS`
is set, it also upserts an explicit second demo tenant with its own slug,
display name, commerce refs, domain, and theme tokens.
The optional `SECOND_DEMO_TENANT_LOCALE`, `SECOND_DEMO_TENANT_CURRENCY`, and
`SECOND_DEMO_TENANT_TIMEZONE` variables override that second tenant's regional
defaults.

## Verification

`scripts/verify-tenant.sh` validates required env vars, then sends a request
to the local storefront with `Host: $DEMO_STORE_ADDRESS`. A resolved tenant
name in the response body confirms the control-plane lookup is working.

`scripts/verify-two-tenants.sh` sends two requests to the same local storefront
process with different `Host` headers. It expects each response to include its
own tenant display name and host, and to exclude the other tenant's display
name.

## Non-goals for P0

- Drizzle-kit migration tracking
- Medusa DB bootstrap (handled by `medusa migrations run`)
- RLS enforcement tests (P6)
- Hub / Caddy wiring (separate `infra/` step)

---

## P1 — Control-plane write-path verification

After the schema is applied and the admin dev server is running (`pnpm --filter admin dev`), verify the tenant and domain write paths manually:

```sh
# Start the admin dev server
DATABASE_URL=postgres://... \
DOMAIN=yantresh.com \
SHOP_ADMIN_ADDRESS=shop-admin.yantresh.com \
COMMERCE_STOREFRONT_ADDRESS=stores.yantresh.com \
SHOP_API_ADDRESS=shop-api.yantresh.com \
  pnpm --filter admin dev
```

**Tenant write path:**
1. Open `http://localhost:3001/tenants`.
2. Fill the Create form with slug `test-co`, display name, locale `en`, currency `CAD`, timezone `America/Toronto`, status `draft`.
3. Submit → expect a "Saved." notice and a new row in the list.
4. Edit the row: change status to `active` without filling commerce binding → expect a rejected-write error ("Active tenants require a complete commerce binding.").
5. Fill in commerce binding (any non-empty values) + ensure a primary active domain and active theme exist, then re-submit as `active` → expect success.

**Domain write path:**
1. Open `http://localhost:3001/domains`.
2. Add a domain for the test tenant with hostname `test-co.yantresh.com`, `isPrimary` checked, status `active`.
3. Submit → expect success and new row.
4. Attempt to add `shop-admin.yantresh.com` → expect a rejected-write error ("Hostname is reserved for a platform service.").
5. Attempt to set status `active` on a domain owned by a `suspended` tenant → expect rejection ("Only active tenants can receive an active domain.").

**Fail-closed read path:**
With `DATABASE_URL` pointing to an unreachable host, load `/tenants` or `/domains`.
The page must render with an error banner and an empty table — never a crash or a 500.

### Non-goals for P1

- Drizzle-kit migrations (still schema:apply for now)
- Payload CMS integration (deferred until Medusa is wired in P3)
- Theme and feature-flag write paths (read-only in admin for now; write via seed or psql)
