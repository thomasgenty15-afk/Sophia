#!/usr/bin/env zsh
set -euo pipefail

cd /Users/ahmedamara/Dev/Sophia\ 2

run_id="${1:?run id required}"
action="${2:?action required}"
turn="${3:-}"
content="${4:-}"

anon_key="$(/usr/local/bin/supabase status --output json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s.slice(s.indexOf("{"))); process.stdout.write(j.ANON_KEY)})')"
service_key="$(/usr/local/bin/supabase status --output json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s.slice(s.indexOf("{"))); process.stdout.write(j.SERVICE_ROLE_KEY)})')"

export QA_SUPABASE_API_URL=http://127.0.0.1:54321
export QA_SUPABASE_ANON_KEY="$anon_key"
export QA_SUPABASE_SERVICE_ROLE_KEY="$service_key"
export QA_DATE=2026-05-20
export QA_FAMILY=adjust-plan-whole-plan-vague-rerun
export QA_RUN_ID="$run_id"
export QA_ACTION="$action"

if [[ "$action" != "send" ]]; then
  node tmp/adjust_plan_whole_plan_qa.mjs
  exit $?
fi

export QA_TURN="$turn"
export QA_CONTENT="$content"
export QA_FUNCTION_API_URL=http://127.0.0.1:8000

started_server=0
server_pid=""
if ! lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  started_server=1
  SUPABASE_URL=http://127.0.0.1:54321 \
  SUPABASE_ANON_KEY="$anon_key" \
  SUPABASE_SERVICE_ROLE_KEY="$service_key" \
  OPENAI_API_KEY="$(awk -F= '/^OPENAI_API_KEY=/{print $2}' supabase/.env)" \
  GEMINI_API_KEY="$(awk -F= '/^GEMINI_API_KEY=/{print $2}' supabase/.env)" \
  GLOBAL_AI_MODEL="$(awk -F= '/^GLOBAL_AI_MODEL=/{print $2}' supabase/.env | xargs)" \
  GEMINI_FALLBACK_MODEL="$(awk -F= '/^GEMINI_FALLBACK_MODEL=/{print $2}' supabase/.env | xargs)" \
  /usr/local/bin/deno run --allow-env --allow-net --allow-read --allow-write --allow-run --allow-ffi supabase/functions/test-send-message/index.ts &
  server_pid="$!"
  sleep 2
fi

set +e
node tmp/adjust_plan_whole_plan_qa.mjs
rc="$?"
set -e

if [[ "$started_server" == "1" && -n "$server_pid" ]]; then
  kill "$server_pid" 2>/dev/null || true
  wait "$server_pid" 2>/dev/null || true
  listener_pid="$(lsof -nP -iTCP:8000 -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $2}')"
  if [[ -n "$listener_pid" ]]; then
    kill "$listener_pid" 2>/dev/null || true
  fi
fi

exit "$rc"
