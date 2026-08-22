#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/Codex.app/Contents/Resources:$PATH"

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

BASE_REF="${AGENT_GATE_BASE:-HEAD}"
BASELINE_FILE="scripts/.test-count-baseline"
FRONT_TEST_BASELINE="scripts/.vitest-red-baseline"
FRONT_TYPES_BASELINE="scripts/.tsc-test-red-baseline"
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

config_added_lines() {
  if [ "$STAGED_ONLY" = "1" ]; then
    git diff --cached --unified=0 -- supabase/config.toml | rg '^\+' || true
  else
    { git diff "$BASE_REF" --unified=0 -- supabase/config.toml || true
      git diff --cached --unified=0 -- supabase/config.toml || true; } | rg '^\+' || true
  fi
}

check_forbidden_patterns() {
  # ── 1. L'alignement JWT local ne se défait pas ──────────────────────────
  # Sans lui, GoTrue signe en ES256 et TOUTE fonction en verify_jwt = true rend
  # 401 pendant que PostgREST répond — on cherche alors un bug d'écran qui
  # n'existe pas. C'est arrivé plusieurs fois. docs/keel/JWT-HS256.md
  if [ -f scripts/check-local-jwt-alg.sh ]; then
    if ! bash scripts/check-local-jwt-alg.sh --static >/dev/null 2>&1; then
      bash scripts/check-local-jwt-alg.sh --static >&2 || true
      fail "alignement JWT local rompu — ce commit le propagerait (docs/keel/JWT-HS256.md)"
    fi
    info "alignement JWT local ok"
  fi

  # ── 2. On ne désarme pas le portail JWT au nom de l'algorithme local ────
  # Le geste interdit: rencontrer un 401, conclure « c'est l'ES256 en local »,
  # et passer une fonction en verify_jwt = false. Ça déplace un défaut de poste
  # de dev dans un fichier qui part en production.
  local added
  added="$(config_added_lines)"
  if printf '%s' "$added" | rg -qi 'verify_jwt[[:space:]]*=[[:space:]]*false' \
     && printf '%s' "$added" | rg -qi 'es256|hs256|invalid jwt'; then
    printf '%s\n' "$added" | rg -i 'verify_jwt|es256|hs256|invalid jwt' >&2 || true
    fail "ce commit ajoute un verify_jwt = false en invoquant l'algorithme JWT local.
       Ce n'est pas la réparation: lancez ./scripts/check-local-jwt-alg.sh et
       lisez docs/keel/JWT-HS256.md. Si le verify_jwt = false est légitime
       (webhook, appelant cron sans JWT), justifiez-le SANS citer ES256/HS256."
  fi
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

# ── LES TESTS SE LANCENT, ILS NE SE COMPTENT PAS ────────────────────────────
#
# ⚠️ MESURÉ LE 2026-08-12. `check_test_count` compare un NOMBRE à une référence:
# il voit disparaître des tests, jamais échouer. Un commit a donc passé ce gate
# en vert avec SEPT tests rouges — un décor qui n'écrivait pas `plan_kind`,
# devenu obligatoire pour le chargeur juste au-dessus. C'est très exactement la
# cicatrice du dépôt: une garde qui ne mord jamais ressemble trait pour trait à
# une garde qui marche.
#
# PORTÉE VOLONTAIREMENT ÉTROITE — `_shared/keel/`, et rien d'autre. Ce dépôt est
# travaillé par plusieurs sessions en parallèle: lancer TOUTE la suite ferait
# tomber le gate de tout le monde sur les rouges préexistants d'un voisin, et un
# gate qu'on contourne ne garde plus rien. Élargir quand le reste est vert.
#
# `AGENT_GATE_SKIP_TESTS=1` existe pour un cas et un seul: une machine sans deno.
# S'en servir pour passer outre un rouge, c'est se mentir.
check_tests() {
  if ! command -v deno >/dev/null 2>&1; then
    info "deno not found, skipping keel test run"
    return 0
  fi
  if [ "${AGENT_GATE_SKIP_TESTS:-0}" = "1" ]; then
    info "keel test run skipped (AGENT_GATE_SKIP_TESTS=1)"
    return 0
  fi
  [ -d supabase/functions/_shared/keel ] || return 0
  info "running keel test suite"
  # L'ENVIRONNEMENT EST PURGÉ. Une variable SUPABASE_* héritée du shell fait
  # basculer des dizaines de tests vers une vraie pile et rend 114 faux rouges —
  # après quoi on désarme le gate en croyant réparer un test.
  (
    for v in $(env | grep -o '^SUPABASE_[A-Z_]*' || true); do unset "$v"; done
    deno test --allow-read --allow-env supabase/functions/_shared/keel/
  ) || fail "des tests keel sont rouges. Le gate les LANCE depuis le 2026-08-12:
       les compter laissait passer un commit avec sept tests cassés."
}

# ── LE GATE VOIT ENFIN LE FRONT ─────────────────────────────────────────────
#
# ⚠️ MESURÉ LE 2026-08-22. `grep -c vitest scripts/agent-gate.sh` rendait **0**:
# les 112 fichiers / 1 788 tests front se lançaient à la main, jamais ici. Un
# rouge front passait donc le commit — la même cicatrice que les sept tests
# Deno cassés du 2026-08-12, une lane plus loin.
#
# ⛔ CE N'EST PAS UN « rc != 0 ⇒ échec ». Le jour de sa pose, la suite portait
# DÉJÀ 4 rouges (`coverage-guard.int.test.ts` ×2, `household.int.test.ts` ×2) et
# aucun n'appartenait à ce lot. La liste `scripts/.vitest-red-baseline` les
# nomme un par un, avec leur date et leur propriétaire; TOUT LE RESTE mord. Le
# détail du juge est dans `scripts/agent-gate-front-tests.mjs`.
check_front_tests() {
  if [ ! -d frontend/node_modules ]; then
    info "frontend/node_modules absent, skipping vitest run"
    return 0
  fi
  [ -f frontend/vitest.config.ts ] || return 0
  [ -f "$FRONT_TEST_BASELINE" ] || fail "missing $FRONT_TEST_BASELINE"

  info "running frontend test suite (vitest)"
  local report
  report="$(mktemp -t agent-gate-vitest)"

  # L'ENVIRONNEMENT EST PURGÉ, pour la même raison que la suite Deno: une
  # variable SUPABASE_* héritée du shell bascule des dizaines de tests vers une
  # vraie pile et rend des dizaines de faux rouges.
  (
    cd frontend
    for v in $(env | grep -o '^SUPABASE_[A-Z_]*' || true); do unset "$v"; done
    npm exec -- vitest --config vitest.config.ts run \
      --reporter=json --outputFile="$report" >/dev/null 2>&1
  ) || true

  if [ ! -s "$report" ]; then
    rm -f "$report"
    fail "vitest n'a produit AUCUN rapport. Ce n'est pas « pas de rouge »:
       c'est la suite qui n'a pas tourné. Relance à la main:
       (cd frontend && npm exec -- vitest --config vitest.config.ts run)"
  fi

  if node scripts/agent-gate-front-tests.mjs "$report" "$FRONT_TEST_BASELINE"; then
    rm -f "$report"
  else
    rm -f "$report"
    fail "des tests front sont rouges hors de la liste $FRONT_TEST_BASELINE"
  fi
}

# ── ET IL TYPECHECKE CE QU'IL LANCE ─────────────────────────────────────────
#
# ⚠️ MESURÉ LE 2026-08-22. `tsconfig.app.json` exclut les fichiers de test:
# **0 des 112** était dans son programme (449 fichiers, aucun test). Six clés
# d'objet dupliquées dormaient dans `setupMouthsStep.int.test.ts` sans que rien
# ne les voie.
#
# ⛔ `frontend/tsconfig.test.json` n'est VOLONTAIREMENT PAS référencé depuis
# `tsconfig.json`: `tsc -b` le construirait, et il portait **92 erreurs sur 25
# fichiers** le jour de sa pose — dont 13 fichiers PROPRES à HEAD, cassés par
# une source étrangère modifiée. Le brancher sur `tsc -b` aurait rendu le gate
# rouge pour tout le monde. Il est donc lancé à part, borné par
# `scripts/.tsc-test-red-baseline` (un fichier, un compte). Un fichier neuf en
# erreur, ou un compte qui MONTE, fait échouer.
check_front_test_typecheck() {
  [ -f frontend/tsconfig.test.json ] || return 0
  if [ ! -d frontend/node_modules ]; then
    info "frontend/node_modules absent, skipping test typecheck"
    return 0
  fi
  [ -f "$FRONT_TYPES_BASELINE" ] || fail "missing $FRONT_TYPES_BASELINE"

  info "running typecheck on frontend test files"
  local out expect
  out="$(mktemp -t agent-gate-tsc-test)"
  expect="$(mktemp -t agent-gate-tsc-list)"
  # `--listFiles` sort la liste des fichiers ET les erreurs sur le même flux:
  # une seule passe de tsc suffit pour les deux mesures.
  (cd frontend && npm exec -- tsc -p tsconfig.test.json --noEmit --listFiles) >"$out" 2>&1 || true

  # Un fichier de test doit être DANS le programme. S'il n'y en a aucun, la
  # garde ne garde rien et ressemble pourtant à une garde qui marche — c'est
  # exactement l'état d'AVANT ce lot, où tsc lisait 449 fichiers et zéro test.
  local checked
  checked="$(awk '/\.(int\.)?(test|spec)\.tsx?$/ {n++} END {print n+0}' "$out")"
  if [ "$checked" -lt 1 ]; then
    rm -f "$out" "$expect"
    fail "tsconfig.test.json ne typecheck AUCUN fichier de test — son \`include\` ne mord plus"
  fi

  awk '!/^[[:space:]]*(#|$)/ {print}' "$FRONT_TYPES_BASELINE" >"$expect"

  local current tolerated verdict
  verdict=0
  while read -r path count; do
    [ -n "$path" ] || continue
    # Comparaison de CHAÎNE, pas d'expression: un `.` de nom de fichier ne doit
    # pas devenir un joker qui tolère les erreurs d'un fichier voisin.
    current="$(awk -v p="${path}(" 'index($0, p) == 1 {n++} END {print n+0}' "$out")"
    if [ "$current" -gt "$count" ]; then
      printf 'agent-gate: %s — %s erreurs de type, la liste en tolère %s\n' \
        "$path" "$current" "$count" >&2
      verdict=1
    elif [ "$current" -lt "$count" ]; then
      info "⚠️ $path — ${current} erreurs (< ${count}) : ABAISSE sa ligne dans $FRONT_TYPES_BASELINE"
    fi
  done <"$expect"

  # Un fichier en erreur que la liste ne nomme PAS: c'est un rouge neuf.
  local unlisted
  unlisted="$(awk -F'(' '/error TS/ && /^[^ ]/ {print $1}' "$out" | sort -u \
    | grep -F -x -v -f <(awk '{print $1}' "$expect") || true)"
  if [ -n "$unlisted" ]; then
    printf 'agent-gate: des fichiers de test portent des erreurs de type HORS liste:\n' >&2
    printf '%s\n' "$unlisted" | sed 's/^/    /' >&2
    verdict=1
  fi

  tolerated="$(awk '{s+=$2} END {print s+0}' "$expect")"
  current="$(awk '/error TS/ {n++} END {print n+0}' "$out")"
  info "test typecheck: ${checked} fichiers lus, ${current} erreurs (liste: ${tolerated})"
  rm -f "$out" "$expect"

  [ "$verdict" -eq 0 ] || fail "le typecheck des tests front a régressé (voir ci-dessus)"
}

check_typecheck() {
  if [ -f frontend/tsconfig.json ]; then
    info "running frontend typecheck"
    (cd frontend && npm exec -- tsc -b --noEmit)
  fi

  if command -v deno >/dev/null 2>&1; then
    # ⚠️ MESURÉ LE 2026-08-22: cette liste ne portait que les TROIS entrées
    # `sophia-brain`. Les DEUX lanes de génération — le code le plus lourd du
    # produit, celui que `V0-B-bis` venait de corriger — n'étaient typecheckées
    # par PERSONNE: leur `deno check` vert était un geste manuel que rien ne
    # rejouait. Mesurées `rc=0` toutes les deux avant d'entrer ici; +3,7 s.
    info "running deno check on core entrypoints"
    deno check \
      supabase/functions/sophia-brain/index.ts \
      supabase/functions/sophia-brain/router/agent_exec.ts \
      supabase/functions/sophia-brain/agents/companion.ts \
      supabase/functions/generate-meal-v1/index.ts \
      supabase/functions/generate-household-meal-v1/index.ts
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
check_tests
check_front_tests
check_front_test_typecheck
check_typecheck
check_lint

info "pass"
