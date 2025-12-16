#!/usr/bin/env bash
set -euo pipefail

# One-shot local reset that also re-syncs internal secret for protected Edge Functions.
#
# Usage:
#   ./scripts/local_reset.sh

cd "$(dirname "$0")/.."

supabase db reset
./scripts/local_sync_internal_secret.sh

echo "OK: local reset + internal secret sync completed."


