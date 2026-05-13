#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

BASE_REF="${AGENT_GATE_BASE:-HEAD}"
MAX_DIFF_LINES="${AGENT_GATE_MAX_DIFF_LINES:-800}"
BASELINE_FILE="scripts/.test-count-baseline"
STAGED_ONLY="${AGENT_GATE_STAGED_ONLY:-0}"

fail() {
  printf 'agent-gate: fail: %s\n' "$1" >&2
  exit 1
}

info() {
  printf 'agent-gate: %s\n' "$1"
}

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

diff_line_count() {
  local stat
  if [ "$STAGED_ONLY" = "1" ]; then
    stat="$(git diff --cached --shortstat)"
  else
    stat="$(git diff --shortstat "$BASE_REF"; git diff --cached --shortstat)"
  fi
  printf '%s\n' "$stat" | node -e '
let s = "";
process.stdin.on("data", d => s += d);
process.stdin.on("end", () => {
  let total = 0;
  for (const m of s.matchAll(/(\d+)\s+(insertion|deletion)s?/g)) total += Number(m[1]);
  process.stdout.write(String(total));
});
'
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

check_diff_size() {
  local lines
  lines="$(diff_line_count)"
  if [ "$lines" -gt "$MAX_DIFF_LINES" ]; then
    fail "diff has ${lines} changed lines, max is ${MAX_DIFF_LINES}"
  fi
  info "diff size ok (${lines}/${MAX_DIFF_LINES})"
}

check_forbidden_patterns() {
  local diff
  diff="$(added_source_diff | rg '^\+' || true)"
  [ -z "$diff" ] && {
    info "forbidden pattern scan ok"
    return 0
  }

  printf '%s\n' "$diff" | rg '^\+.*\b(it|describe)\.skip\s*\(' >/dev/null && fail "new skipped test detected"
  printf '%s\n' "$diff" | rg '^\+.*\bxit\s*\(' >/dev/null && fail "new xit detected"
  printf '%s\n' "$diff" | rg '^\+.*@ts-ignore' >/dev/null && fail "new @ts-ignore detected"
  printf '%s\n' "$diff" | rg '^\+.*@ts-expect-error' >/dev/null && fail "new @ts-expect-error detected"
  printf '%s\n' "$diff" | rg '^\+.*\bas any\b' >/dev/null && fail "new as any detected"
  printf '%s\n' "$diff" | rg '^\+.*console\.log\s*\(' >/dev/null && fail "new console.log detected"
  printf '%s\n' "$diff" | rg '^\+.*//[[:space:]]*TODO(?!\([A-Z]+-[0-9]+\)|:[[:space:]]*[A-Z]+-[0-9]+)' >/dev/null && fail "new TODO without ticket detected"

  local core_mock_diff
  if [ "$STAGED_ONLY" = "1" ]; then
    core_mock_diff="$(git diff --cached --unified=0 -- 'supabase/functions/sophia-brain/**' 'supabase/functions/_shared/memory/**')"
  else
    core_mock_diff="$(git diff "$BASE_REF" --unified=0 -- 'supabase/functions/sophia-brain/**' 'supabase/functions/_shared/memory/**'; git diff --cached --unified=0 -- 'supabase/functions/sophia-brain/**' 'supabase/functions/_shared/memory/**')"
  fi
  printf '%s\n' "$core_mock_diff" | rg '^\+.*\b(vi|jest)\.mock\s*\(' >/dev/null && fail "new core mock detected"

  info "forbidden pattern scan ok"
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

check_diff_size
check_forbidden_patterns
check_test_count
check_typecheck
check_lint

info "pass"
