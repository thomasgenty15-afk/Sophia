#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/Codex.app/Contents/Resources:$PATH"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

BASE_REF="${AGENT_GATE_BASE:-HEAD}"
BASELINE_FILE="scripts/.test-count-baseline"
STAGED_ONLY="${AGENT_GATE_STAGED_ONLY:-0}"

fail() {
  printf 'agent-gate: fail: %s\n' "$1" >&2
  exit 1
}

info() {
  printf 'agent-gate: %s\n' "$1"
}

command -v rg >/dev/null 2>&1 || fail "ripgrep (rg) not found in PATH"

changed_files() {
  if [ "$STAGED_ONLY" = "1" ]; then
    git diff --cached --name-only --diff-filter=ACMR
  else
    git diff --name-only "$BASE_REF" --diff-filter=ACMR
    git diff --cached --name-only --diff-filter=ACMR
  fi
}

source_changed_files() {
  changed_files | sort -u | rg '\.(ts|tsx|js|jsx|mjs|cjs)$' || true
}

frontend_changed_files() {
  source_changed_files | rg '^frontend/' || true
}

added_source_diff() {
  if [ "$STAGED_ONLY" = "1" ]; then
    git diff --cached --unified=0 -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs'
  else
    git diff "$BASE_REF" --unified=0 -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs'
    git diff --cached --unified=0 -- '*.ts' '*.tsx' '*.js' '*.jsx' '*.mjs' '*.cjs'
  fi
}

test_count() {
  rg -n '^(Deno\.test|[[:space:]]*(it|test)\()' supabase frontend \
    --glob '*test.ts' \
    --glob '*test.tsx' \
    --glob '*spec.ts' \
    --glob '*spec.tsx' \
    --glob '*test.js' \
    --glob '*spec.js' \
    --glob '*test.mjs' \
    --glob '*spec.mjs' \
    2>/dev/null | wc -l | tr -d ' '
}

check_forbidden_patterns() {
  info "forbidden pattern scan skipped"
}

check_test_count() {
  [ -f "$BASELINE_FILE" ] || fail "missing $BASELINE_FILE"
  local baseline current
  baseline="$(tr -d '[:space:]' < "$BASELINE_FILE")"
  current="$(test_count)"
  if [ "$current" -lt "$baseline" ]; then
    fail "test count decreased (${current} < ${baseline})"
  fi
  info "test count ok (${current} >= ${baseline})"
}

check_typecheck() {
  if [ -f frontend/tsconfig.json ]; then
    info "running frontend typecheck"
    (cd frontend && npm exec -- tsc -b --noEmit)
  fi

  if command -v deno >/dev/null 2>&1; then
    info "running deno check on core entrypoints"
    deno check \
      supabase/functions/sophia-brain/index.ts \
      supabase/functions/sophia-brain/router/agent_exec.ts \
      supabase/functions/sophia-brain/agents/companion.ts
  else
    info "deno not found, skipping deno check"
  fi
}

check_lint() {
  local files
  files="$(frontend_changed_files)"
  if [ -n "$files" ]; then
    info "running eslint on modified frontend files"
    (cd frontend && npm exec -- eslint ${files//frontend\//})
  else
    info "no modified frontend files for eslint"
  fi
}

check_forbidden_patterns
check_test_count
check_typecheck
check_lint

info "pass"
