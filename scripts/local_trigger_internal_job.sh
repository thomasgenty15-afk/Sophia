#!/usr/bin/env bash
set -euo pipefail

# Trigger a protected internal Edge Function locally, using Vault.INTERNAL_FUNCTION_SECRET.
# Usage:
#   ./scripts/local_trigger_internal_job.sh detect-future-events
#   ./scripts/local_trigger_internal_job.sh process-checkins
#   ./scripts/local_trigger_internal_job.sh trigger-memory-echo

FN="${1:-}"
if [[ -z "${FN}" ]]; then
  echo "Usage: $0 <edge-function-name>" >&2
  exit 1
fi

DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E '^supabase_db_.*' | head -n 1 || true)"
if [[ -z "${DB_CONTAINER}" ]]; then
  echo "ERROR: Could not find Supabase DB container. Make sure 'supabase start' is running." >&2
  exit 1
fi

SECRET="$(docker exec -i "${DB_CONTAINER}" psql -U postgres -d postgres -tA -c \
  "select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1;")"

if [[ -z "${SECRET}" ]]; then
  echo "ERROR: Vault INTERNAL_FUNCTION_SECRET is missing. Run ./scripts/local_sync_internal_secret.sh first." >&2
  exit 1
fi

HTTP_CODE="$(curl -s -o /tmp/sophia_internal_job_out.json -w "%{http_code}" \
  -X POST "http://127.0.0.1:54321/functions/v1/${FN}" \
  -H "Content-Type: application/json" \
  -H "X-Internal-Secret: ${SECRET}" \
  -d '{}')"

echo "HTTP ${HTTP_CODE}"
cat /tmp/sophia_internal_job_out.json || true
echo


