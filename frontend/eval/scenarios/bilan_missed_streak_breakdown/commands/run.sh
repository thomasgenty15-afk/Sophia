#!/usr/bin/env bash
# run.sh — Run the bilan_missed_streak_breakdown test for a specific variant.
#
# Usage:
#   cd frontend
#   bash eval/scenarios/bilan_missed_streak_breakdown/commands/run.sh [variant] [turns]
#
# Examples:
#   bash eval/scenarios/bilan_missed_streak_breakdown/commands/run.sh accept      # variant=accept, 20 turns
#   bash eval/scenarios/bilan_missed_streak_breakdown/commands/run.sh decline 14
#
# Prerequisites:
#   - Local Supabase running (supabase start)
#   - Slot 7 user provisioned (provision_eval_v2_users.mjs)

set -euo pipefail

VARIANT="${1:-accept}"

# Default turns per variant
if [ -z "${2:-}" ]; then
  case "$VARIANT" in
    accept)  TURNS=20 ;;
    accept_no_days) TURNS=22 ;;
    accept_with_days) TURNS=24 ;;
    decline) TURNS=14 ;;
    *)       TURNS=14 ;;
  esac
else
  TURNS="$2"
fi

# Default local Supabase keys (override via env if needed)
export SOPHIA_SUPABASE_URL="${SOPHIA_SUPABASE_URL:-http://127.0.0.1:54321}"
export SOPHIA_SUPABASE_ANON_KEY="${SOPHIA_SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0}"
export SOPHIA_SUPABASE_SERVICE_ROLE_KEY="${SOPHIA_SUPABASE_SERVICE_ROLE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU}"
export SOPHIA_MASTER_ADMIN_EMAIL="${SOPHIA_MASTER_ADMIN_EMAIL:-thomasgenty15@gmail.com}"
export SOPHIA_MASTER_ADMIN_PASSWORD="${SOPHIA_MASTER_ADMIN_PASSWORD:-123456}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

echo "═══════════════════════════════════════════════════════════════════"
echo "  bilan_missed_streak_breakdown — variant=$VARIANT — turns=$TURNS"
echo "═══════════════════════════════════════════════════════════════════"

# Step 1: Reset + validate
echo ""
echo "── Step 1: Reset & Validate ──"
cd "$FRONTEND_DIR"
node eval/scenarios/bilan_missed_streak_breakdown/commands/reset.mjs --variant "$VARIANT"

# Step 2: Run the test
echo ""
echo "── Step 2: Run eval ──"
node scripts/run_eval_v2_local.mjs \
  --scenario bilan-missed-streak-breakdown-V4 \
  --variant "$VARIANT" \
  --turns "$TURNS" \
  --slot 7 \
  --user-difficulty easy \
  --use-real-ai false

# Step 3: Post-run reset + validate
echo ""
echo "── Step 3: Post-run Reset & Validate ──"
node eval/scenarios/bilan_missed_streak_breakdown/commands/reset.mjs --variant "$VARIANT"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  DONE. Check bundles in tmp/bundles_v2/"
echo "═══════════════════════════════════════════════════════════════════"

