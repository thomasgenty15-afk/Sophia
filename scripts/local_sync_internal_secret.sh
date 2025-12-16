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

SECRET_KEY_VAL="$(docker exec -i "${EDGE_CONTAINER}" sh -lc 'printf %s "$SECRET_KEY"')"
if [[ -z "${SECRET_KEY_VAL}" ]]; then
  echo "ERROR: SECRET_KEY is empty in edge runtime container (${EDGE_CONTAINER})." >&2
  exit 1
fi

# Escape single quotes for SQL literal.
SECRET_KEY_ESC="$(printf %s "${SECRET_KEY_VAL}" | sed "s/'/''/g")"

docker exec -i "${DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "do \$\$ declare sid uuid; begin
     delete from vault.secrets where name='__INTERNAL_FUNCTION_SECRET__';
     select id into sid from vault.secrets where name='INTERNAL_FUNCTION_SECRET' limit 1;
     if sid is null then
       perform vault.create_secret('${SECRET_KEY_ESC}', 'INTERNAL_FUNCTION_SECRET');
     else
       perform vault.update_secret(sid, new_secret => '${SECRET_KEY_ESC}', new_name => 'INTERNAL_FUNCTION_SECRET');
     end if;
   end \$\$;"

echo "OK: Vault.INTERNAL_FUNCTION_SECRET synced to Edge Runtime SECRET_KEY."


