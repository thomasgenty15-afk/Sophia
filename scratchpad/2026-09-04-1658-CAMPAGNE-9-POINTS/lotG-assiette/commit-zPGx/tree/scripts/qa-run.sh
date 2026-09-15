#!/usr/bin/env bash
set -euo pipefail

PERSONA="${1:-}"
SCENARIO="${2:-}"
CONNECTION_NAME="${3:-}"
[ -n "$PERSONA" ] && [ -n "$SCENARIO" ] || {
  printf 'usage: scripts/qa-run.sh <persona> <scenario_id> [connection_name]\n' >&2
  exit 2
}

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SCENARIO_FILE="$ROOT/tests/real-personas/$PERSONA/scenarios/$SCENARIO.md"
PERSONA_FILE="$ROOT/tests/real-personas/$PERSONA/persona.md"
CONNECTION_FILE="$ROOT/tests/real-personas/$PERSONA/connection.json"
if [ -n "$CONNECTION_NAME" ]; then
  case "$CONNECTION_NAME" in
    *[!A-Za-z0-9_-]*)
      printf 'invalid connection_name: %s\n' "$CONNECTION_NAME" >&2
      exit 2
      ;;
  esac
  CONNECTION_FILE="$ROOT/tests/real-personas/$PERSONA/connections/$CONNECTION_NAME.json"
fi

[ -f "$SCENARIO_FILE" ] || {
  printf 'missing scenario: %s\n' "$SCENARIO_FILE" >&2
  exit 1
}
[ -f "$PERSONA_FILE" ] || {
  printf 'missing persona: %s\n' "$PERSONA_FILE" >&2
  exit 1
}

USER_ID=""
if [ -f "$CONNECTION_FILE" ]; then
  USER_ID="$(node -e 'const fs=require("fs"); const f=process.argv[1]; const j=JSON.parse(fs.readFileSync(f,"utf8")); process.stdout.write(String(j.user_id || ""));' "$CONNECTION_FILE")"
fi

printf '# QA bundle - %s %s\n\n' "$PERSONA" "$SCENARIO"
printf 'Generated: %s\n\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
printf '## Persona\n\n'
cat "$PERSONA_FILE"
printf '\n\n## Connection\n\n'
if [ -n "$CONNECTION_NAME" ]; then
  printf -- '- connection_name: %s\n' "$CONNECTION_NAME"
fi
printf -- '- user_id: %s\n' "${USER_ID:-missing connection.json}"
printf -- '- jwt_command: `bash scripts/get-jwt.sh %s%s`\n' "$PERSONA" "${CONNECTION_NAME:+ $CONNECTION_NAME}"
printf -- '- reset_command: `bash scripts/qa-reset-persona.sh %s%s`\n' "$PERSONA" "${CONNECTION_NAME:+ $CONNECTION_NAME}"
printf -- '- endpoint: `POST /functions/v1/test-send-message`\n\n'
printf '## Scenario\n\n'
cat "$SCENARIO_FILE"
