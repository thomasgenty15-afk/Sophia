#!/usr/bin/env bash
set -euo pipefail

# Extend local Supabase Kong timeout for /functions/v1/* so long eval runs can complete locally.
# This does NOT change any Edge Function logic; it only changes the gateway read_timeout.
#
# Why: local Kong ships with read_timeout: 150000ms to match hosted limits.
# For deep local debugging (15 turns, real AI), you may want a longer timeout.
#
# Usage:
#   ./scripts/local_extend_kong_functions_timeout.sh           # sets to 600000ms (10min)
#   TIMEOUT_MS=900000 ./scripts/local_extend_kong_functions_timeout.sh
#
# Notes:
# - The change is applied via `kong reload` (no container restart).
# - It may be reverted if you restart the Kong container / `supabase stop && supabase start`.

TIMEOUT_MS="${TIMEOUT_MS:-600000}"
KONG_CONTAINER="${KONG_CONTAINER:-supabase_kong_Sophia_2}"
KONG_YML="${KONG_YML:-/home/kong/kong.yml}"

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is required" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -q "^${KONG_CONTAINER}\$"; then
  echo "ERROR: Kong container not running: ${KONG_CONTAINER}" >&2
  echo "Tip: run 'supabase start' first." >&2
  exit 1
fi

echo "Patching ${KONG_CONTAINER}:${KONG_YML} -> functions-v1 read_timeout=${TIMEOUT_MS}ms"
# Supabase local defaults may vary by version (e.g. 120000, 150000). Replace any numeric value.
docker exec "${KONG_CONTAINER}" sh -lc "perl -pi -e 's/read_timeout:\\s*\\d+/read_timeout: ${TIMEOUT_MS}/g' \"${KONG_YML}\""

echo "Reloading kong..."
docker exec "${KONG_CONTAINER}" sh -lc "kong reload >/dev/null"

echo "OK. Current read_timeout line:"
docker exec "${KONG_CONTAINER}" sh -lc "grep -n 'read_timeout' \"${KONG_YML}\" | head -n 3"


