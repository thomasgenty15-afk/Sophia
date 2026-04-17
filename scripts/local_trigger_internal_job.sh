#!/usr/bin/env bash
set -euo pipefail

# Trigger a protected internal Edge Function locally, using Vault.INTERNAL_FUNCTION_SECRET.
# Usage:
#   ./scripts/local_trigger_internal_job.sh detect-future-events
#   ./scripts/local_trigger_internal_job.sh process-checkins
#   ./scripts/local_trigger_internal_job.sh trigger-memory-echo
#   ./scripts/local_trigger_internal_job.sh trigger-memory-echo '{"email":"thomas@example.com","force":true}'

FN="${1:-}"
if [[ -z "${FN}" ]]; then
  echo "Usage: $0 <edge-function-name>" >&2
  exit 1
fi

PAYLOAD="${2:-{}}"

# Validate JSON payload early so we don't send malformed JSON to Edge Functions.
# This avoids confusing "Unexpected non-whitespace character..." errors.
if command -v python3 >/dev/null 2>&1; then
  # Use Python to validate AND (optionally) auto-sanitize common copy/paste issues.
  # stdout: sanitized payload (or empty on failure)
  SANITIZED_PAYLOAD="$(
    PAYLOAD="${PAYLOAD}" python3 - <<'PY'
import json, os, sys

raw = os.environ.get("PAYLOAD", "")
p = raw.strip()

def ok(x: str) -> bool:
  try:
    json.loads(x)
    return True
  except Exception:
    return False

if ok(p):
  print(p)
  raise SystemExit(0)

# Heuristic: some terminals / copy-pastes end up with an extra trailing "}".
# If removing ONE trailing "}" fixes JSON, accept it (warn on stderr).
if p.endswith("}") and ok(p[:-1].rstrip()):
  sys.stderr.write("WARN: Payload JSON had an extra trailing '}' — auto-corrected.\n")
  print(p[:-1].rstrip())
  raise SystemExit(0)

sys.stderr.write("ERROR: Invalid JSON payload passed to local_trigger_internal_job.sh\n")
sys.stderr.write("Payload:\n")
sys.stderr.write(raw + "\n")
sys.stderr.write("\nTip: wrap JSON in single quotes, example:\n")
sys.stderr.write("  ./scripts/local_trigger_internal_job.sh send-welcome-email '{\"id\":\"<uuid>\",\"full_name\":\"Jean\"}'\n")
raise SystemExit(2)
PY
  )"
  PAYLOAD="${SANITIZED_PAYLOAD}"
else
  # Best-effort sanity check: payload should start with { or [
  if [[ ! "${PAYLOAD}" =~ ^[[:space:]]*[{[] ]]; then
    echo "ERROR: Payload does not look like JSON. Payload: ${PAYLOAD}" >&2
    exit 2
  fi
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
  -d "${PAYLOAD}")"

echo "HTTP ${HTTP_CODE}"
cat /tmp/sophia_internal_job_out.json || true
echo


