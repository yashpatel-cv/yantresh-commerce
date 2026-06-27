#!/usr/bin/env bash
# Verify tenant resolution for the demo store.
# Run after: schema:apply, seed:demo, and storefront dev server is up.
set -euo pipefail

STOREFRONT_PORT="${STOREFRONT_PORT:-3000}"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${DEMO_STORE_ADDRESS:?DEMO_STORE_ADDRESS is required}"

echo "Verifying tenant resolution for host: $DEMO_STORE_ADDRESS"

BODY=$(curl -sf \
  -H "Host: $DEMO_STORE_ADDRESS" \
  "http://localhost:$STOREFRONT_PORT/" 2>&1) || {
  echo "ERROR: storefront not reachable on port $STOREFRONT_PORT" >&2
  echo "       Start it with: pnpm --filter @yantresh/storefront dev" >&2
  exit 1
}

if echo "$BODY" | grep -qi "Not provisioned\|control-plane lookup failed"; then
  echo "FAIL: tenant not resolved — check domain and tenant rows in the database" >&2
  exit 1
fi

if echo "$BODY" | grep -qi "Tenant resolution is live"; then
  echo "OK: tenant resolved successfully for $DEMO_STORE_ADDRESS"
  exit 0
fi

# Neither failure string nor success string found — print body for inspection
echo "WARN: response received but resolution state unclear; inspect manually:"
echo "$BODY" | head -20
