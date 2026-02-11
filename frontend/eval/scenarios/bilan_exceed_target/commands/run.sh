#!/usr/bin/env bash
# run.sh — Run the bilan_exceed_target test for a specific variant.
#
# Usage:
#   cd frontend
#   bash eval/scenarios/bilan_exceed_target/commands/run.sh [variant] [turns]
#
# Examples:
#   bash eval/scenarios/bilan_exceed_target/commands/run.sh no         # variant=no, 14 turns
#   bash eval/scenarios/bilan_exceed_target/commands/run.sh yes_no_days 12
#   bash eval/scenarios/bilan_exceed_target/commands/run.sh yes_with_days
#
# Prerequisites:
#   - Local Supabase running (supabase start)
#   - Slot 6 user provisioned (provision_eval_v2_users.mjs)

set -euo pipefail

VARIANT="${1:-no}"
TURNS="${2:-14}"

# Default local Supabase keys (override via env if needed)
export SOPHIA_SUPABASE_URL="${SOPHIA_SUPABASE_URL:-http://127.0.0.1:54321}"
export SOPHIA_SUPABASE_ANON_KEY="${SOPHIA_SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0}"
export SOPHIA_SUPABASE_SERVICE_ROLE_KEY="${SOPHIA_SUPABASE_SERVICE_ROLE_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU}"
export SOPHIA_MASTER_ADMIN_EMAIL="${SOPHIA_MASTER_ADMIN_EMAIL:-thomasgenty15@gmail.com}"
export SOPHIA_MASTER_ADMIN_PASSWORD="${SOPHIA_MASTER_ADMIN_PASSWORD:-123456}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

echo "═══════════════════════════════════════════════════════════"
echo "  bilan_exceed_target — variant=$VARIANT — turns=$TURNS"
echo "═══════════════════════════════════════════════════════════"

# Step 1: Reset + validate
echo ""
echo "── Step 1: Reset & Validate ──"
cd "$FRONTEND_DIR"
node eval/scenarios/bilan_exceed_target/commands/reset.mjs --variant "$VARIANT"

# Step 2: Run the test
echo ""
echo "── Step 2: Run eval ──"
node scripts/run_eval_v2_local.mjs \
  --scenario target-exceed-bilan-V4 \
  --variant "$VARIANT" \
  --turns "$TURNS" \
  --slot 6

# Step 3: Post-run reset + validate
echo ""
echo "── Step 3: Post-run Reset & Validate ──"
node eval/scenarios/bilan_exceed_target/commands/reset.mjs --variant "$VARIANT"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  DONE. Check bundles in tmp/bundles_v2/"
echo "═══════════════════════════════════════════════════════════"

