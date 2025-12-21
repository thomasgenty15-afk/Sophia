#!/usr/bin/env bash
set -euo pipefail

# One-shot local reset.
#
# Usage:
#   ./scripts/local_reset.sh

cd "$(dirname "$0")/.."

supabase db reset

# Workaround: Supabase CLI may restart `supabase_storage_<project_id>` without restarting Kong.
# Kong can then keep a stale upstream IP for storage (Docker DNS / caching) and return 502 on
# `/storage/v1/*` until Kong is restarted.
#
# Symptom:
#   curl http://127.0.0.1:54321/storage/v1/bucket  -> 502 Bad Gateway
#
# Fix:
#   docker restart supabase_kong_<project_id>
PROJECT_ID="$(
  sed -nE 's/^project_id[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' supabase/config.toml | head -n 1
)"
if command -v docker >/dev/null 2>&1 && [ -n "${PROJECT_ID}" ]; then
  docker restart "supabase_kong_${PROJECT_ID}" >/dev/null 2>&1 || true
fi

echo "OK: local reset completed."
echo
echo "Note: internal secret sync is no longer automatic."
echo "If you need DB triggers/cron to call protected Edge Functions locally, run:"
echo "  ./scripts/local_sync_internal_secret.sh"


