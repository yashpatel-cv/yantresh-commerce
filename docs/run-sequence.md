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
