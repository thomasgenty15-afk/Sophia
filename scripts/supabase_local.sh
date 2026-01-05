#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/supabase_local.sh start
#   ./scripts/supabase_local.sh stop
#   ./scripts/supabase_local.sh restart
#
# Loads environment variables for local Supabase and then runs the Supabase CLI.
# This avoids having to `export ...` manually before every `supabase start`.
#
# Load order (lowest priority -> highest priority):
# - repo-root `.env` (optional, convenient source of truth)
# - `supabase/.env.local`
# - `supabase/.env`

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE_ROOT="$ROOT_DIR/.env"
ENV_FILE_PRIMARY="$ROOT_DIR/supabase/.env.local"
ENV_FILE_FALLBACK="$ROOT_DIR/supabase/.env"

load_env() {
  # Load a single env file (if it exists).
  _load_one() {
    local env_file="$1"
    [[ -f "$env_file" ]] || return 0
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

  # Load in order so later files override earlier ones.
  _load_one "$ENV_FILE_ROOT" || true
  _load_one "$ENV_FILE_PRIMARY" || true
  _load_one "$ENV_FILE_FALLBACK" || true
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


