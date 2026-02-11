#!/usr/bin/env bash
set -euo pipefail

VARIANT="${1:-hard_12t}"
TURNS="${2:-12}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

export SOPHIA_SUPABASE_URL="${SOPHIA_SUPABASE_URL:-https://iabxchanerdkczbxyjgg.supabase.co}"

if [ -z "${SOPHIA_SUPABASE_ANON_KEY:-}" ]; then
  echo "Missing SOPHIA_SUPABASE_ANON_KEY"
  exit 1
fi
if [ -z "${SOPHIA_SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Missing SOPHIA_SUPABASE_SERVICE_ROLE_KEY"
  exit 1
fi
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "Missing SUPABASE_ACCESS_TOKEN"
  exit 1
fi

echo "============================================================"
echo " tools_deactivate_action_staging - variant=$VARIANT turns=$TURNS"
echo "============================================================"

cd "$FRONTEND_DIR"

echo ""
echo "-- Step 1: reset dedicated user --"
node eval/scenarios/tools_deactivate_action_staging/commands/reset.mjs

echo ""
echo "-- Step 2: run eval (no bilan) --"
node scripts/run_eval_v2_real_staging_no_bilan.mjs \
  --scenario tools_deactivate_action_v2_ai_user \
  --variant "$VARIANT" \
  --turns "$TURNS" \
  --slot 6 \
  --model gemini-2.5-flash \
  --wait-for-free-slot-ms 120000 \
  --active-run-ttl-ms 900000 \
  --run-timeout-ms 900000 \
  --invoke-timeout-ms 180000

echo ""
echo "-- Step 3: post-run reset --"
node eval/scenarios/tools_deactivate_action_staging/commands/reset.mjs

echo ""
echo "DONE. Check bundle under tmp/bundles_v2/"

