# Temporary DuckDNS Testing

Use DuckDNS only as a temporary public test host. The real product-facing target
remains `*.${DOMAIN}` behind `yantresh-hub`.

## Safe split on one VPS

- `pclaw.duckdns.org` -> OpenClaw
- `yecom.duckdns.org` -> Yantresh Commerce storefront

Both can share the same public `80/443` as long as Caddy is the edge and routes
by hostname.

## Hub wiring

1. Set `TEMP_STOREFRONT_ADDRESS=yecom.duckdns.org` in the hub `.env`.
2. Import [Caddyfile.duckdns.fragment](/home/node/.openclaw/workspace/yantresh-commerce/infra/hub/Caddyfile.duckdns.fragment) into the hub Caddy config.
3. Keep the regular [Caddyfile.fragment](/home/node/.openclaw/workspace/yantresh-commerce/infra/hub/Caddyfile.fragment) for the final `*.${DOMAIN}` path.
4. Leave OpenClaw on its own hostname and upstream.

## Important

- Do not reuse the same DuckDNS hostname for both OpenClaw and the storefront.
- Do not open extra ports; this setup is host-routed, not port-routed.
- Do not treat DuckDNS as the final product domain; it is only the temporary test lane.
