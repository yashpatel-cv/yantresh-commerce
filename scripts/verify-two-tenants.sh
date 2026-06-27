#!/usr/bin/env bash
# Verify two tenant hostnames resolve distinctly from one storefront runtime.
# Run after: schema:apply, seed:demo with both demo hosts, and storefront dev server is up.
set -euo pipefail

STOREFRONT_PORT="${STOREFRONT_PORT:-3000}"
DEMO_TENANT_NAME="${DEMO_TENANT_NAME:-Yantresh Demo Store}"
SECOND_DEMO_TENANT_NAME="${SECOND_DEMO_TENANT_NAME:-Yantresh Corner Market}"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${DEMO_STORE_ADDRESS:?DEMO_STORE_ADDRESS is required}"
: "${SECOND_DEMO_STORE_ADDRESS:?SECOND_DEMO_STORE_ADDRESS is required}"

fetch_host() {
  local host="$1"

  curl -sf \
    -H "Host: $host" \
    "http://localhost:$STOREFRONT_PORT/"
}

assert_contains() {
  local body="$1"
  local needle="$2"
  local label="$3"

  if ! grep -Fq "$needle" <<<"$body"; then
    echo "FAIL: $label did not render expected text: $needle" >&2
    exit 1
  fi
}

assert_not_contains() {
  local body="$1"
  local needle="$2"
  local label="$3"

  if grep -Fq "$needle" <<<"$body"; then
    echo "FAIL: $label rendered the other tenant text: $needle" >&2
    exit 1
  fi
}

echo "Verifying tenant A: $DEMO_STORE_ADDRESS"
BODY_A=$(fetch_host "$DEMO_STORE_ADDRESS") || {
  echo "ERROR: storefront not reachable on port $STOREFRONT_PORT" >&2
  echo "       Start it with: pnpm --filter @yantresh/storefront dev" >&2
  exit 1
}

echo "Verifying tenant B: $SECOND_DEMO_STORE_ADDRESS"
BODY_B=$(fetch_host "$SECOND_DEMO_STORE_ADDRESS") || {
  echo "ERROR: storefront not reachable on port $STOREFRONT_PORT" >&2
  echo "       Start it with: pnpm --filter @yantresh/storefront dev" >&2
  exit 1
}

assert_contains "$BODY_A" "$DEMO_TENANT_NAME" "$DEMO_STORE_ADDRESS"
assert_contains "$BODY_A" "$DEMO_STORE_ADDRESS" "$DEMO_STORE_ADDRESS"
assert_not_contains "$BODY_A" "$SECOND_DEMO_TENANT_NAME" "$DEMO_STORE_ADDRESS"

assert_contains "$BODY_B" "$SECOND_DEMO_TENANT_NAME" "$SECOND_DEMO_STORE_ADDRESS"
assert_contains "$BODY_B" "$SECOND_DEMO_STORE_ADDRESS" "$SECOND_DEMO_STORE_ADDRESS"
assert_not_contains "$BODY_B" "$DEMO_TENANT_NAME" "$SECOND_DEMO_STORE_ADDRESS"

echo "OK: $DEMO_STORE_ADDRESS and $SECOND_DEMO_STORE_ADDRESS rendered distinct tenant configs"
