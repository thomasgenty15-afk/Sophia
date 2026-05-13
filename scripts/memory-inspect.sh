#!/usr/bin/env bash
set -euo pipefail

USER_ID="${1:-}"
shift || true
HOURS="24"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --hours)
      HOURS="${2:-24}"
      shift 2
      ;;
    *)
      printf 'unknown arg: %s\n' "$1" >&2
      exit 2
      ;;
  esac
done

[ -n "$USER_ID" ] || {
  printf 'usage: scripts/memory-inspect.sh <user_id> [--hours 24]\n' >&2
  exit 2
}

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
OUT="$ROOT/tmp/memory_inspect_${USER_ID}_${HOURS}h.json"

node "$ROOT/scripts/export_memory_v2_audit_bundle.mjs" \
  --user-id "$USER_ID" \
  --scope-all \
  --hours "$HOURS" \
  --out "$OUT" >/tmp/sophia_memory_inspect_stdout.json

node "$ROOT/scripts/render-memory-inspect.mjs" "$OUT"
