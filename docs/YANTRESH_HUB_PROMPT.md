Implement Yantresh Commerce deployment wiring in `yantresh-hub`.

The hub is on a different VPS. Do not rely on any local paths, local files, or
this machine's workspace. Everything needed is included below.

## Goal

Wire Yantresh Commerce into the existing hub as a production-grade managed app
using the hub's established pattern:

- GHCR images
- Docker Compose services
- Caddy as the only public edge
- host-based routing on standard `80/443`
- pull-based deploy flow

## Fixed hostnames

Use these exact public hostnames:

- `commerce.yantresh.com`
- `demo-store.yantresh.com`
- `shop-admin.yantresh.com`
- `shop-api.yantresh.com`

Do not use `api.yantresh.com`; that may collide with `yantresh-os`.

## Production-grade expectations

Keep the implementation organized and maintainable:

- Group all Yantresh Commerce env vars together in the hub `.env`
- Group all Yantresh Commerce services together in `docker-compose.yml`
- Group all Yantresh Commerce Caddy blocks together in the Caddyfile
- Use clear service names:
  - `yantresh-commerce-postgres`
  - `yantresh-commerce-redis`
  - `yantresh-commerce-storefront`
  - `yantresh-commerce-admin`
  - `yantresh-commerce-medusa`
  - `yantresh-commerce-worker`
- Do not publish extra public ports for these services
- Keep Caddy as the only public entrypoint
- Preserve existing services and routes
- Follow small atomic commits

## 1. Update the hub `.env`

Ensure these values exist, grouped together under a `# Yantresh Commerce`
section or equivalent:

```env
STORE_IMAGE_TAG=main
ADMIN_IMAGE_TAG=main
MEDUSA_IMAGE_TAG=main
WORKER_IMAGE_TAG=main

STOREFRONT_IMAGE=ghcr.io/${GHCR_OWNER}/yantresh-commerce-storefront:${STORE_IMAGE_TAG}
ADMIN_IMAGE=ghcr.io/${GHCR_OWNER}/yantresh-commerce-admin:${ADMIN_IMAGE_TAG}
MEDUSA_IMAGE=ghcr.io/${GHCR_OWNER}/yantresh-commerce-medusa:${MEDUSA_IMAGE_TAG}
WORKER_IMAGE=ghcr.io/${GHCR_OWNER}/yantresh-commerce-worker:${WORKER_IMAGE_TAG}

SHOP_API_ADDRESS=shop-api.${DOMAIN}
SHOP_ADMIN_ADDRESS=shop-admin.${DOMAIN}
COMMERCE_STOREFRONT_ADDRESS=commerce.${DOMAIN}
DEMO_STORE_ADDRESS=demo-store.${DOMAIN}
STOREFRONT_TLS_ASK_URL=http://yantresh-commerce-storefront:3000/api/tls/authorize
```

Also ensure the following runtime env vars are wired for the new services:

```env
POSTGRES_PASSWORD=
DATABASE_URL=
MEDUSA_DATABASE_URL=
REDIS_URL=
SECRET_MASTER_KEY=
```

If the hub already sets `DOMAIN=yantresh.com`, keep using that pattern.

## 2. Update `docker-compose.yml`

Add these services if not already present.

Use this exact structure as the baseline:

```yaml
services:
  yantresh-commerce-postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-yantresh_control}
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - yantresh-commerce-postgres:/var/lib/postgresql/data

  yantresh-commerce-redis:
    image: redis:7
    restart: unless-stopped
    volumes:
      - yantresh-commerce-redis:/data

  yantresh-commerce-storefront:
    image: ${STOREFRONT_IMAGE}
    restart: unless-stopped
    depends_on:
      - yantresh-commerce-postgres
      - yantresh-commerce-redis
    environment:
      DATABASE_URL: ${DATABASE_URL}
      MEDUSA_DATABASE_URL: ${MEDUSA_DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      SECRET_MASTER_KEY: ${SECRET_MASTER_KEY}

  yantresh-commerce-admin:
    image: ${ADMIN_IMAGE}
    restart: unless-stopped
    depends_on:
      - yantresh-commerce-postgres
      - yantresh-commerce-redis
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      SECRET_MASTER_KEY: ${SECRET_MASTER_KEY}

  yantresh-commerce-medusa:
    image: ${MEDUSA_IMAGE}
    restart: unless-stopped
    depends_on:
      - yantresh-commerce-postgres
      - yantresh-commerce-redis
    environment:
      DATABASE_URL: ${MEDUSA_DATABASE_URL}
      REDIS_URL: ${REDIS_URL}

  yantresh-commerce-worker:
    image: ${WORKER_IMAGE}
    restart: unless-stopped
    depends_on:
      - yantresh-commerce-postgres
      - yantresh-commerce-redis
    environment:
      DATABASE_URL: ${DATABASE_URL}
      MEDUSA_DATABASE_URL: ${MEDUSA_DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      SECRET_MASTER_KEY: ${SECRET_MASTER_KEY}

volumes:
  yantresh-commerce-postgres:
  yantresh-commerce-redis:
```

Requirements:

- no public `ports:` for these services unless the hub already has an internal-only pattern that requires them
- named volumes must persist Postgres and Redis data
- keep the services grouped together as one block

## 3. Update the hub Caddy config

Keep the Caddyfile env-driven. Do not hardcode the hostnames directly into the
site blocks if the hub already uses env placeholders. The correct implementation
path is:

- fixed production values live in `.env.example` and production `.env`
- the Caddyfile uses `{$...}` placeholders

Add or preserve these env-backed host blocks:

```caddyfile
{$SHOP_API_ADDRESS} {
  reverse_proxy yantresh-commerce-medusa:9000
}

{$SHOP_ADMIN_ADDRESS} {
  reverse_proxy yantresh-commerce-admin:3000
}

{$COMMERCE_STOREFRONT_ADDRESS}, {$DEMO_STORE_ADDRESS} {
  reverse_proxy yantresh-commerce-storefront:3000
}
```

Also ensure the global Caddy options include:

```caddyfile
{
  on_demand_tls {
    ask http://yantresh-commerce-storefront:3000/api/tls/authorize
  }
}
```

Requirements:

- do not remove or weaken existing explicit host blocks
- preserve the current portfolio and `yantresh-os` routes
- keep Yantresh Commerce blocks grouped together
- keep the hostnames source-of-truth in env, not duplicated across Caddy blocks

## 4. Update hub docs

Update the hub docs/setup notes so they clearly show:

- `commerce.yantresh.com` → main platform/storefront
- `demo-store.yantresh.com` → demo tenant/storefront
- `shop-admin.yantresh.com` → admin surface
- `shop-api.yantresh.com` → commerce API

Also note:

- Caddy is the only public entrypoint
- no extra public ports are opened for Yantresh Commerce

## 5. Validation

Before pushing:

- validate Compose syntax
- validate Caddy syntax
- confirm there is no hostname collision with existing services
- confirm no unintended public port exposure was added
- keep commits small and conventional

## Deliverable

Push the hub changes only after:

- `.env` is updated
- Compose is updated
- Caddy is updated
- docs are updated
- config validation passes
