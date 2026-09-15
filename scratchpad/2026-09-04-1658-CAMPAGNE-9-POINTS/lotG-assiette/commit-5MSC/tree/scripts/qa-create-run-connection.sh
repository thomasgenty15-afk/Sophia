#!/usr/bin/env bash
set -euo pipefail

PERSONA="${1:-}"
BASE_CONNECTION="${2:-}"
RUN_ID="${3:-}"
[ -n "$PERSONA" ] && [ -n "$BASE_CONNECTION" ] && [ -n "$RUN_ID" ] || {
  printf 'usage: scripts/qa-create-run-connection.sh <persona> <base_connection> <run_id>\n' >&2
  exit 2
}

case "$PERSONA" in
  qa-skill) ;;
  *)
    printf 'refusing temp connection: persona must be whitelisted, got %s\n' "$PERSONA" >&2
    exit 1
    ;;
esac

case "$BASE_CONNECTION" in
  *[!A-Za-z0-9_-]*)
    printf 'invalid base_connection: %s\n' "$BASE_CONNECTION" >&2
    exit 2
    ;;
esac

case "$RUN_ID" in
  *[!A-Za-z0-9_-]*)
    printf 'invalid run_id: %s\n' "$RUN_ID" >&2
    exit 2
    ;;
esac

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
CONNECTION_NAME="${BASE_CONNECTION}_${RUN_ID}"
CONNECTION_FILE="$ROOT/tests/real-personas/$PERSONA/connections/$CONNECTION_NAME.json"
mkdir -p "$(dirname "$CONNECTION_FILE")"

SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_KEY:-}}"
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  STATUS_JSON="$(supabase status --output json 2>/dev/null || true)"
  if [ -n "$STATUS_JSON" ]; then
    SUPABASE_URL="${SUPABASE_URL:-$(printf '%s' "$STATUS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).API_URL || ""))')}"
    SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$(printf '%s' "$STATUS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).ANON_KEY || ""))')}"
    SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$(printf '%s' "$STATUS_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>process.stdout.write(JSON.parse(s).SERVICE_ROLE_KEY || JSON.parse(s).SECRET_KEY || ""))')}"
  fi
fi

[ -n "$SUPABASE_URL" ] || {
  printf 'missing SUPABASE_URL and no local supabase status\n' >&2
  exit 1
}
[ -n "$SUPABASE_ANON_KEY" ] || {
  printf 'missing SUPABASE_ANON_KEY and no local supabase status\n' >&2
  exit 1
}
[ -n "$SUPABASE_SERVICE_ROLE_KEY" ] || {
  printf 'missing SUPABASE_SERVICE_ROLE_KEY and no local supabase status\n' >&2
  exit 1
}

case "$SUPABASE_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *)
    printf 'refusing temp connection outside local Supabase: %s\n' "$SUPABASE_URL" >&2
    exit 1
    ;;
esac

PERSONA="$PERSONA" \
BASE_CONNECTION="$BASE_CONNECTION" \
RUN_ID="$RUN_ID" \
CONNECTION_NAME="$CONNECTION_NAME" \
CONNECTION_FILE="$CONNECTION_FILE" \
SUPABASE_URL="$SUPABASE_URL" \
SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
node <<'NODE'
const fs = require("fs");
const crypto = require("crypto");

const persona = process.env.PERSONA;
const baseConnection = process.env.BASE_CONNECTION;
const runId = process.env.RUN_ID;
const connectionName = process.env.CONNECTION_NAME;
const connectionFile = process.env.CONNECTION_FILE;
const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function safeEmailPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function jsonFetch(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { response, body };
}

async function listUsers() {
  const { response, body } = await jsonFetch(
    `${supabaseUrl}/auth/v1/admin/users?per_page=1000`,
    {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`list users failed: ${JSON.stringify(body)}`);
  }
  return Array.isArray(body?.users) ? body.users : Array.isArray(body)
    ? body
    : [];
}

async function main() {
  const email =
    `qa-${safeEmailPart(persona)}-${safeEmailPart(baseConnection)}-${safeEmailPart(runId)}@example.com`;
  const password = `Qa1!${crypto.randomUUID()}`;
  const metadata = {
    is_test_persona: true,
    temporary_qa_connection: true,
    persona,
    base_connection: baseConnection,
    connection_name: connectionName,
    run_id: runId,
    created_by: "qa-create-run-connection",
  };

  const existing = (await listUsers()).find((user) =>
    String(user.email || "").toLowerCase() === email.toLowerCase()
  );
  const endpoint = existing?.id
    ? `${supabaseUrl}/auth/v1/admin/users/${existing.id}`
    : `${supabaseUrl}/auth/v1/admin/users`;
  const method = existing?.id ? "PUT" : "POST";
  const { response: userResponse, body: userBody } = await jsonFetch(endpoint, {
    method,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: metadata,
      user_metadata: metadata,
    }),
  });
  if (!userResponse.ok || !userBody?.id) {
    throw new Error(`auth user upsert failed: ${JSON.stringify(userBody)}`);
  }

  const { response: tokenResponse, body: tokenBody } = await jsonFetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
  );
  if (!tokenResponse.ok || !tokenBody?.refresh_token) {
    throw new Error(`token refresh setup failed: ${JSON.stringify(tokenBody)}`);
  }

  fs.writeFileSync(
    connectionFile,
    `${JSON.stringify({
      user_id: userBody.id,
      email,
      refresh_token: tokenBody.refresh_token,
      temporary: true,
      persona,
      base_connection: baseConnection,
      connection_name: connectionName,
      run_id: runId,
      created_at: new Date().toISOString(),
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
  fs.chmodSync(connectionFile, 0o600);

  console.log(`connection_name=${connectionName}`);
  console.log(`connection_file=${connectionFile}`);
  console.log(`user_id=${userBody.id}`);
  console.log(`email=${email}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
NODE
