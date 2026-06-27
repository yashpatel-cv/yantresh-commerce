# Control-Plane Run Sequence

Bootstrap order for a fresh environment. Each step is idempotent.

## Prerequisites

- PostgreSQL 16 reachable at `DATABASE_URL`
- `.env` populated from `.env.example`

## Steps

```sh
# 1. Apply control-plane DDL (creates all tables, enums, triggers, RLS)
pnpm --filter @yantresh/db schema:apply

# 2. Seed the demo tenant (upsert — safe to re-run)
DEMO_STORE_ADDRESS=demo-store.example.com \
  pnpm --filter @yantresh/db seed:demo
```

`schema:apply` reads `packages/db/sql/schema.sql` (a copy of `docs/schema.sql`) and
executes it via `sql.unsafe()`. It is idempotent for extension and trigger creation
but will error on duplicate enum values if run twice against a non-empty schema;
use a migration tool (drizzle-kit) for incremental changes in P1+.

## Non-goals for P0

- Drizzle-kit migration tracking
- Medusa DB bootstrap (handled by `medusa migrations run`)
- RLS enforcement tests (P6)
- Hub / Caddy wiring (separate `infra/` step)
