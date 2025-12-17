#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/supabase_local.sh start
#   ./scripts/supabase_local.sh stop
#   ./scripts/supabase_local.sh restart
#
# Loads environment variables from `supabase/.env` (if present) and then runs the Supabase CLI.
# This avoids having to `export ...` manually before every `supabase start`.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE_PRIMARY="$ROOT_DIR/supabase/.env.local"
ENV_FILE_FALLBACK="$ROOT_DIR/supabase/.env"

load_env() {
  local env_file=""
  if [[ -f "$ENV_FILE_PRIMARY" ]]; then env_file="$ENV_FILE_PRIMARY"; fi
  if [[ -z "$env_file" && -f "$ENV_FILE_FALLBACK" ]]; then env_file="$ENV_FILE_FALLBACK"; fi
  if [[ -z "$env_file" ]]; then return 0; fi

  # Parse .env safely (supports comments, blanks, quoted values) and export variables.
  # We do NOT `source` the file directly because .env syntax isn't guaranteed to be valid shell.
  eval "$(
    ENV_FILE="$env_file" python3 - <<'PY'
import os, shlex, re
env_path = os.environ.get("ENV_FILE")
out = []
with open(env_path, "r", encoding="utf-8", errors="replace") as f:
    for raw in f:
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        # Allow `export KEY=VALUE` lines too
        if line.startswith("export "):
            line = line[len("export "):].lstrip()
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip()
        if not k or not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", k):
            continue
        # Strip surrounding quotes if present; keep inner content as-is.
        if (len(v) >= 2) and ((v[0] == v[-1]) and v[0] in ("'", '"')):
            v = v[1:-1]
        out.append(f"export {k}={shlex.quote(v)}")
print("\n".join(out))
PY
  )"
}

cmd="${1:-}"
if [[ -z "$cmd" ]]; then
  echo "Missing command. Usage: $0 {start|stop|restart}" >&2
  exit 2
fi

cd "$ROOT_DIR"

case "$cmd" in
  start)
    load_env || true
    supabase start
    ;;
  stop)
    supabase stop
    ;;
  restart)
    supabase stop
    load_env || true
    supabase start
    ;;
  *)
    echo "Unknown command: $cmd. Usage: $0 {start|stop|restart}" >&2
    exit 2
    ;;
esac


