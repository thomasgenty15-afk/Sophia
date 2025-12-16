#!/usr/bin/env bash
set -euo pipefail

# Sync Vault.INTERNAL_FUNCTION_SECRET to the Edge Runtime SECRET_KEY (local Supabase CLI + Docker).
# This avoids 403 when DB triggers / cron jobs call protected Edge Functions.
#
# It does NOT print the secret.

DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E '^supabase_db_.*' | head -n 1 || true)"
EDGE_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E '^supabase_edge_runtime_.*' | head -n 1 || true)"

if [[ -z "${DB_CONTAINER}" || -z "${EDGE_CONTAINER}" ]]; then
  echo "ERROR: Could not find Supabase containers. Make sure 'supabase start' is running." >&2
  exit 1
fi

# Prefer Vault as source of truth (works regardless of what the edge container env exposes).
VAULT_SECRET="$(docker exec -i "${DB_CONTAINER}" psql -U postgres -d postgres -tA -c "select decrypted_secret from vault.decrypted_secrets where name='INTERNAL_FUNCTION_SECRET' limit 1;" | tr -d '\r' | tr -d '\n')"

SECRET_VAL="${VAULT_SECRET}"

# If Vault is empty (first run), fall back to edge env, then generate a random secret.
if [[ -z "${SECRET_VAL}" ]]; then
  EDGE_SECRET_KEY_VAL="$(docker exec -i "${EDGE_CONTAINER}" sh -lc 'printf %s "$SECRET_KEY"')"
  EDGE_INTERNAL_SECRET_VAL="$(docker exec -i "${EDGE_CONTAINER}" sh -lc 'printf %s "$INTERNAL_FUNCTION_SECRET"')"
  SECRET_VAL="${EDGE_INTERNAL_SECRET_VAL:-${EDGE_SECRET_KEY_VAL}}"
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

# Push to Edge secrets too (so Deno.env.get('INTERNAL_FUNCTION_SECRET') works in functions).
# This does not print the secret.
npx supabase secrets set "INTERNAL_FUNCTION_SECRET=${SECRET_VAL}" "SECRET_KEY=${SECRET_VAL}" >/dev/null

echo "OK: INTERNAL_FUNCTION_SECRET synced (Vault + Edge secrets)."


