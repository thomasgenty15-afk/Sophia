#!/usr/bin/env bash
set -euo pipefail

# Sync Vault.INTERNAL_FUNCTION_SECRET from the local Edge Runtime SECRET_KEY / INTERNAL_FUNCTION_SECRET.
# This avoids 403 when DB triggers / cron jobs call protected Edge Functions locally.
#
# It does NOT print the secret.
#
# By default, this script treats Vault as source of truth if it already exists.
# If you changed INTERNAL_FUNCTION_SECRET in your local env and want Vault to match it, run:
#   FORCE_FROM_ENV=1 ./scripts/local_sync_internal_secret.sh
#
# If you want to source the secret from a dotenv file (e.g. repo-root `.env`), run:
#   FORCE_FROM_ENV_FILE=1 ENV_FILE=.env ./scripts/local_sync_internal_secret.sh

DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E '^supabase_db_.*' | head -n 1 || true)"
EDGE_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E '^supabase_edge_runtime_.*' | head -n 1 || true)"

if [[ -z "${DB_CONTAINER}" || -z "${EDGE_CONTAINER}" ]]; then
  echo "ERROR: Could not find Supabase containers. Make sure 'supabase start' is running." >&2
  exit 1
fi

# Optional: read from dotenv file (repo root `.env` by default).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/.env}"

DOTENV_SECRET=""
if [[ -f "${ENV_FILE}" ]]; then
  # Parse INTERNAL_FUNCTION_SECRET=... and SECRET_KEY=... without executing the file.
  # Supports optional quotes; ignores comments.
  DOTENV_INTERNAL="$(
    (grep -E '^[[:space:]]*INTERNAL_FUNCTION_SECRET[[:space:]]*=' "${ENV_FILE}" || true) \
      | tail -n 1 \
      | sed -E 's/^[[:space:]]*INTERNAL_FUNCTION_SECRET[[:space:]]*=[[:space:]]*//; s/[[:space:]]*$//; s/^["'\'']?//; s/["'\'']?$//'
  )"
  DOTENV_SECRET_KEY="$(
    (grep -E '^[[:space:]]*SECRET_KEY[[:space:]]*=' "${ENV_FILE}" || true) \
      | tail -n 1 \
      | sed -E 's/^[[:space:]]*SECRET_KEY[[:space:]]*=[[:space:]]*//; s/[[:space:]]*$//; s/^["'\'']?//; s/["'\'']?$//'
  )"
  DOTENV_SECRET="${DOTENV_INTERNAL:-${DOTENV_SECRET_KEY}}"
fi

# Source selection:
# - Default: prefer Vault (stable), fallback to Edge env, fallback to generated random.
# - FORCE_FROM_ENV=1: prefer Edge env, then fallback to Vault, then random.
FORCE_FROM_ENV="${FORCE_FROM_ENV:-0}"
FORCE_FROM_ENV_FILE="${FORCE_FROM_ENV_FILE:-0}"

VAULT_SECRET="$(docker exec -i "${DB_CONTAINER}" psql -U postgres -d postgres -tA -c "select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1;" | tr -d '\r' | tr -d '\n')"
EDGE_SECRET_KEY_VAL="$(docker exec -i "${EDGE_CONTAINER}" sh -lc 'printf %s "$SECRET_KEY"')"
EDGE_INTERNAL_SECRET_VAL="$(docker exec -i "${EDGE_CONTAINER}" sh -lc 'printf %s "$INTERNAL_FUNCTION_SECRET"')"
EDGE_SECRET_VAL="${EDGE_INTERNAL_SECRET_VAL:-${EDGE_SECRET_KEY_VAL}}"

SECRET_VAL=""
if [[ "${FORCE_FROM_ENV_FILE}" == "1" ]]; then
  SECRET_VAL="${DOTENV_SECRET}"
  if [[ -z "${SECRET_VAL}" ]]; then
    # Fallback order: Vault -> Edge
    SECRET_VAL="${VAULT_SECRET}"
  fi
  if [[ -z "${SECRET_VAL}" ]]; then
    SECRET_VAL="${EDGE_SECRET_VAL}"
  fi
elif [[ "${FORCE_FROM_ENV}" == "1" ]]; then
  SECRET_VAL="${EDGE_SECRET_VAL}"
  if [[ -z "${SECRET_VAL}" ]]; then
    # If edge env is missing for some reason, fall back to Vault.
    SECRET_VAL="${VAULT_SECRET}"
  fi
else
  SECRET_VAL="${VAULT_SECRET}"
  if [[ -z "${SECRET_VAL}" ]]; then
    # Prefer dotenv if present, then edge env.
    SECRET_VAL="${DOTENV_SECRET}"
  fi
  if [[ -z "${SECRET_VAL}" ]]; then
    SECRET_VAL="${EDGE_SECRET_VAL}"
  fi
fi

if [[ -z "${SECRET_VAL}" ]]; then
  # Generate a stable-looking secret if absolutely nothing exists yet.
  if command -v openssl >/dev/null 2>&1; then
    SECRET_VAL="$(openssl rand -hex 32)"
  else
    SECRET_VAL="$(date +%s%N | shasum | awk '{print $1}')"
  fi
fi

# Escape single quotes for SQL literal.
SECRET_ESC="$(printf %s "${SECRET_VAL}" | sed "s/'/''/g")"

# Ensure Vault secret exists/updated (source of truth).
docker exec -i "${DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "do \$\$ declare sid uuid; begin
     select id into sid from vault.secrets where name='INTERNAL_FUNCTION_SECRET' limit 1;
     if sid is null then
       perform vault.create_secret('${SECRET_ESC}', 'INTERNAL_FUNCTION_SECRET');
     else
       perform vault.update_secret(sid, new_secret => '${SECRET_ESC}', new_name => 'INTERNAL_FUNCTION_SECRET');
     end if;
   end \$\$;"

echo "OK: INTERNAL_FUNCTION_SECRET synced to Vault (local)."
echo "Note: This script no longer pushes secrets via 'supabase secrets set' (to avoid accidental remote pollution)."


