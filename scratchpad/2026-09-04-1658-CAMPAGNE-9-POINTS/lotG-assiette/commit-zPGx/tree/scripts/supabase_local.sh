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

sanitize_local_supabase_env() {
  # Prevent leaking remote/prod Supabase keys into the local Edge Runtime container.
  # This can happen when SUPABASE_* are already exported in the user's shell.
  #
  # Note: repo-root `.env` is allowed to exist for app secrets; we intentionally ignore
  # SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY from it (see below).
  # If those vars were already exported, they would otherwise persist and override local defaults.
  unset SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
}

load_env() {
  # Load a single env file (if it exists).
  _load_one() {
    local env_file="$1"
    [[ -f "$env_file" ]] || return 0
    # Root `.env` is convenient for app secrets, but it may also contain prod/remote SUPABASE_* keys.
    # Those MUST NOT leak into the local edge runtime container (it breaks GoTrue locally and causes ES256/HS256 mismatches).
    # We therefore ignore SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY ONLY when loading repo-root `.env`.
    local skip_supabase_keys="0"
    if [[ "$env_file" == "$ENV_FILE_ROOT" ]]; then
      skip_supabase_keys="1"
    fi
    # Parse .env safely (supports comments, blanks, quoted values) and export variables.
    # We do NOT `source` the file directly because .env syntax isn't guaranteed to be valid shell.
    eval "$(
      ENV_FILE="$env_file" SKIP_SUPABASE_KEYS="$skip_supabase_keys" python3 - <<'PY'
import os, shlex, re
env_path = os.environ.get("ENV_FILE")
skip_supabase = os.environ.get("SKIP_SUPABASE_KEYS") == "1"
blocked = {"SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"}
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
        if skip_supabase and k in blocked:
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
    sanitize_local_supabase_env || true
    load_env || true
    supabase start
    ;;
  stop)
    supabase stop
    ;;
  restart)
    supabase stop
    sanitize_local_supabase_env || true
    load_env || true
    supabase start
    ;;
  *)
    echo "Unknown command: $cmd. Usage: $0 {start|stop|restart}" >&2
    exit 2
    ;;
esac


