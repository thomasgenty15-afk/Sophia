#!/usr/bin/env bash
# Construit le commit du lot 3 depuis HEAD + mes hunks seuls (cooking_plan*.ts portent un lot étranger non commité).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"; cd "$REPO"
J="scratchpad/2026-09-04-1658-CAMPAGNE-9-POINTS/lotG-assiette"; W="$J/commit-lot3"; rm -rf "$W"; mkdir -p "$W/head/supabase/functions/_shared/keel"
HEAD0=$(git rev-parse HEAD)
for f in cooking_plan.ts plan_rationale.ts cooking_plan_test.ts plan_rationale_test.ts; do
  git show "$HEAD0:supabase/functions/_shared/keel/$f" > "$W/head/supabase/functions/_shared/keel/$f"
done
wc -l "$W"/head/supabase/functions/_shared/keel/*.ts
( cd "$W/head" && python3 "$REPO/$J/apply-lot3.py" )
export GIT_INDEX_FILE="$W/index"; git read-tree "$HEAD0"
for f in cooking_plan.ts plan_rationale.ts cooking_plan_test.ts plan_rationale_test.ts; do
  B=$(git hash-object -w "$W/head/supabase/functions/_shared/keel/$f"); git update-index --cacheinfo "100644,$B,supabase/functions/_shared/keel/$f"
done
TREE=$(git write-tree); unset GIT_INDEX_FILE; echo "tree $TREE · $(git diff --stat "$HEAD0" "$TREE" | tail -1)"
M="$W/tree"; mkdir -p "$M"; git archive "$TREE" | tar -x -C "$M"; ln -s "$REPO/node_modules" "$M/node_modules"; [ -d "$REPO/frontend/node_modules" ] && ln -s "$REPO/frontend/node_modules" "$M/frontend/node_modules" || true
( cd "$M/supabase/functions" && deno check _shared/keel/cooking_plan.ts _shared/keel/plan_rationale.ts _shared/keel/cooking_plan_test.ts _shared/keel/plan_rationale_test.ts generate-household-meal-v1/index.ts generate-meal-v1/index.ts 2>&1 | grep -E "^error|TS[0-9]+" | head -3 || true; deno test --allow-all --no-check _shared/keel/ 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ok \||^FAILED|\.\.\. FAILED" | tail -4 ) | tee "$W/check.txt"
grep -q "^ok |" "$W/check.txt" || { echo "⛔ arbre rouge, pas de commit"; exit 1; }
C=$(git commit-tree "$TREE" -p "$HEAD0" -F "$W/../commit-lot3-MSG.txt"); git update-ref refs/heads/ff-001-quotidien-du-coach "$C" "$HEAD0"
echo "commit $(git rev-parse --short HEAD) · tree ok: $([ "$(git rev-parse HEAD^{tree})" = "$TREE" ] && echo oui)"
