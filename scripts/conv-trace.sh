#!/usr/bin/env bash
set -euo pipefail

USER_ID="${1:-}"
shift || true
SINCE=""
TURN_ID=""
SCOPE="web"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --since)
      SINCE="${2:-}"
      shift 2
      ;;
    --turn-id)
      TURN_ID="${2:-}"
      shift 2
      ;;
    --scope)
      SCOPE="${2:-web}"
      shift 2
      ;;
    *)
      printf 'unknown arg: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

[ -n "$USER_ID" ] || {
  printf 'usage: scripts/conv-trace.sh <user_id> [--turn-id X | --since DATE] [--scope web]\n' >&2
  exit 2
}

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
OUT="$ROOT/tmp/conversation_trace_${USER_ID}_${SCOPE}_$(date -u +%Y%m%dT%H%M%SZ).json"

ARGS=(--user-id "$USER_ID" --scope "$SCOPE" --out "$OUT")
[ -n "$SINCE" ] && ARGS+=(--since "$SINCE")

node "$ROOT/scripts/export_conversation_trace.mjs" "${ARGS[@]}" >/tmp/sophia_conv_trace_stdout.json

node -e '
const fs=require("fs");
const file=process.argv[1];
const turnId=process.argv[2];
const b=JSON.parse(fs.readFileSync(file,"utf8"));
const messages=Array.isArray(b.chat_messages)?b.chat_messages:[];
console.log(`# Conversation trace - ${b.user_id}`);
console.log("");
console.log(`- scope: ${b.scope}`);
console.log(`- bundle: ${file}`);
console.log(`- messages: ${messages.length}`);
console.log(`- request_ids: ${(b.request_ids||[]).length}`);
if (turnId) console.log(`- requested turn_id: ${turnId}`);
console.log("");
for (const m of messages.slice(-30)) {
  const text=String(m.content||"").replace(/\s+/g," ").slice(0,220);
  console.log(`- ${m.created_at} ${m.role}: ${text}`);
}
' "$OUT" "$TURN_ID"
