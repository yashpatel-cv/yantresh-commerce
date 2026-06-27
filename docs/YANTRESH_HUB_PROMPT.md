Implement Yantresh Commerce deployment wiring in `yantresh-hub`.

Constraints:
- Keep the existing hub style and pull-based deploy pattern.
- No DuckDNS/temp host wiring.
- Use these fixed hostnames:
  - `commerce.yantresh.com`
  - `demo-store.yantresh.com`
  - `shop-admin.yantresh.com`
  - `shop-api.yantresh.com`
- Do not use `api.yantresh.com`; that may collide with `yantresh-os`.
- Keep everything behind the existing Caddy edge on standard `80/443`.
- Preserve existing services and routes.

Make these changes:

1. Update the hub `.env`
- Ensure `DOMAIN=yantresh.com` if that is how the hub already models the base domain.
- Add image tags if missing:
  - `STORE_IMAGE_TAG=main`
  - `ADMIN_IMAGE_TAG=main`
  - `MEDUSA_IMAGE_TAG=main`
  - `WORKER_IMAGE_TAG=main`
- Add image refs:
  - `STOREFRONT_IMAGE=ghcr.io/${GHCR_OWNER}/yantresh-commerce-storefront:${STORE_IMAGE_TAG}`
  - `ADMIN_IMAGE=ghcr.io/${GHCR_OWNER}/yantresh-commerce-admin:${ADMIN_IMAGE_TAG}`
  - `MEDUSA_IMAGE=ghcr.io/${GHCR_OWNER}/yantresh-commerce-medusa:${MEDUSA_IMAGE_TAG}`
  - `WORKER_IMAGE=ghcr.io/${GHCR_OWNER}/yantresh-commerce-worker:${WORKER_IMAGE_TAG}`
- Add hostnames:
  - `COMMERCE_STOREFRONT_ADDRESS=commerce.${DOMAIN}`
  - `DEMO_STORE_ADDRESS=demo-store.${DOMAIN}`
  - `SHOP_ADMIN_ADDRESS=shop-admin.${DOMAIN}`
  - `SHOP_API_ADDRESS=shop-api.${DOMAIN}`
- Add:
  - `STOREFRONT_TLS_ASK_URL=http://yantresh-commerce-storefront:3000/api/tls/authorize`
- Add or wire required runtime env vars for the new services:
  - `DATABASE_URL`
  - `MEDUSA_DATABASE_URL`
  - `REDIS_URL`
  - `SECRET_MASTER_KEY`
  - `POSTGRES_PASSWORD`

2. Update hub `docker-compose.yml`
- Add these services if not already present:
  - `yantresh-commerce-postgres` using `postgres:16`
  - `yantresh-commerce-redis` using `redis:7`
  - `yantresh-commerce-storefront`
  - `yantresh-commerce-admin`
  - `yantresh-commerce-medusa`
  - `yantresh-commerce-worker`
- Use the same service definitions and env shape as:
  - `/home/node/.openclaw/workspace/yantresh-commerce/infra/hub/docker-compose.fragment.yaml`
- Keep named volumes for Postgres and Redis.
- Do not publish extra ports publicly; Caddy should stay the entrypoint.

3. Update the hub Caddy config
- Add exact host blocks:

```caddyfile
shop-api.yantresh.com {
  reverse_proxy yantresh-commerce-medusa:9000
}

shop-admin.yantresh.com {
  reverse_proxy yantresh-commerce-admin:3000
}

commerce.yantresh.com, demo-store.yantresh.com {
  reverse_proxy yantresh-commerce-storefront:3000
}
```

- Also add the on-demand TLS ask hook if the hub does not already have one:

```caddyfile
{
  on_demand_tls {
    ask http://yantresh-commerce-storefront:3000/api/tls/authorize
  }
}
```

- Preserve existing explicit routes; do not break current portfolio or `yantresh-os` host blocks.

4. Update hub docs/setup notes
- Add the four new Yantresh Commerce hostnames.
- Note that `commerce.yantresh.com` is the main platform URL and `demo-store.yantresh.com` is the demo tenant.

5. Validation
- Confirm the compose file is valid.
- Confirm Caddy config syntax is valid.
- Confirm there are no collisions with existing `api.` or other hostnames.
- Commit as small atomic commits only.

Reference files in the commerce repo:
- `/home/node/.openclaw/workspace/yantresh-commerce/infra/hub/docker-compose.fragment.yaml`
- `/home/node/.openclaw/workspace/yantresh-commerce/infra/hub/Caddyfile.fragment`
- `/home/node/.openclaw/workspace/yantresh-commerce/infra/hub/.env.example`
