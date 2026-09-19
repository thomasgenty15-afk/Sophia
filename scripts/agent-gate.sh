#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/Codex.app/Contents/Resources:$PATH"

# ═══════════════════════════════════════════════════════════════════════════
# LE NODE DU GATE — ET POURQUOI IL NE DOIT PAS ÊTRE CELUI QUI TRAÎNE
# ═══════════════════════════════════════════════════════════════════════════
#
# ── LE DÉFAUT, MESURÉ LE 2026-09-01 ────────────────────────────────────────
# Un hook git part d'un PATH minimal (`/usr/gnu/bin:/usr/local/bin:/bin:/usr/bin`)
# — et la ligne ci-dessus y ajoute encore `/usr/local/bin` en TÊTE. Sur ce poste
# `/usr/local/bin/node` est en **v18.17.0**, un reliquat d'installation système,
# alors que le node du développeur vit sous nvm en **v22.20.0**. Ni `.nvmrc` ni
# `engines` ne disaient quoi que ce soit: le gate lançait donc TOUTE la suite
# vitest sur un runtime que personne n'utilise pour écrire le code.
#
# Ce que ça a produit, et c'est le pire mode d'échec possible:
#
#     agent-gate: fail: des fichiers de test front ne se CHARGENT pas
#         src/keel/lib/habitWriters.int.test.ts
#
# Le fichier passait en vert lancé à la main. La suite complète rendait 1 919
# tests à la main et **1 915** sous le gate — exactement les 4 du fichier. La
# vraie cause était `fs.globSync`, une API **Node 22+**, et rien dans le message
# ne pouvait y mener. Trois sessions ont cru à une course entre sessions
# parallèles avant que la commande de départage ne soit trouvée:
#
#     PATH="/opt/homebrew/bin:/usr/local/bin:$PATH" npx vitest run <le fichier>
#
# ⛔ ET LE COÛT NE S'ARRÊTE PAS AU FAUX ROUGE. Un fichier incompatible écrit par
# n'importe quelle session bloque les commits de TOUT LE MONDE — la suite vitest
# n'est pas filtrée sur les fichiers stagés. Symétriquement, et c'est plus grave:
# un gate qui teste sur une version que personne n'utilise rendra un jour un
# **VERT** que personne ne peut reproduire.
#
# ── LA RÈGLE, ET ELLE EST TENUE ICI PLUTÔT QUE DANS `package.json` ─────────
# `engines.node` serait la place standard, mais Vercel le LIT pour choisir le
# runtime de production: y écrire un minimum changerait un déploiement pour
# réparer un hook local. Le besoin est celui du GATE, il est déclaré dans le
# gate.
FRONT_TEST_MIN_NODE_MAJOR=22

# Le node le plus récent qu'on sache trouver, ou rien.
#
# ⚠️ ON NE DEVINE PAS, ON MESURE. On demande sa version à chaque candidat plutôt
# que de lire un nom de dossier: un lien symbolique `v22` qui pointe ailleurs
# rendrait un chemin plausible et un runtime faux.
resolve_front_node_dir() {
  local best_major=0 best_dir="" candidate major
  for candidate in \
    $(command -v node 2>/dev/null || true) \
    "$HOME"/.nvm/versions/node/*/bin/node \
    /opt/homebrew/bin/node \
    /usr/local/bin/node
  do
    [ -x "$candidate" ] || continue
    major="$("$candidate" --version 2>/dev/null | sed -n 's/^v\([0-9]*\).*/\1/p')"
    [ -n "$major" ] || continue
    if [ "$major" -gt "$best_major" ]; then
      best_major="$major"
      best_dir="$(dirname "$candidate")"
    fi
  done
  printf '%s %s' "$best_major" "$best_dir"
}

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

BASE_REF="${AGENT_GATE_BASE:-HEAD}"
BASELINE_FILE="scripts/.test-count-baseline"
FRONT_TEST_BASELINE="scripts/.vitest-red-baseline"
FRONT_TYPES_BASELINE="scripts/.tsc-test-red-baseline"
STAGED_ONLY="${AGENT_GATE_STAGED_ONLY:-0}"

# ═══════════════════════════════════════════════════════════════════════════
# LE RÉSUMÉ QU'ON DONNE À L'AGENT — 2026-09-19
# ═══════════════════════════════════════════════════════════════════════════
#
# Un refus imprimait jusqu'ici SON MOTIF, et rien d'autre, quelque part au
# milieu de la sortie des outils. Or le geste qui suit un refus est toujours le
# même: recopier CE QUI A CASSÉ dans une session d'agent. Chaque contrôle dépose
# donc ses lignes ici, et `fail` les rend en bloc, en dernier, sous un en-tête
# rouge — la dernière chose à l'écran est celle qu'on va coller.
#
# ⛔ LA COULEUR EST CONDITIONNELLE, et ce n'est pas une coquetterie: ce bloc est
# fait pour être COLLÉ. Quand stderr n'est pas un terminal (hook redirigé dans
# un fichier, sortie lue par un agent), les `\033[...` partiraient dans le
# presse-papier au milieu du texte. Pas de terminal ⇒ pas de code de couleur.
GATE_DIGEST="$(mktemp -t agent-gate-digest)"
trap 'rm -f "$GATE_DIGEST"' EXIT

if [ -t 2 ]; then
  GATE_RED=$'\033[1;31m'
  GATE_OFF=$'\033[0m'
else
  GATE_RED=""
  GATE_OFF=""
fi

# ⚠️ ON ÉCRIT DANS UN FICHIER, PAS DANS UNE VARIABLE. La moitié des appels
# viennent d'un `while read` en bout de pipeline, donc d'un SOUS-SHELL: une
# variable y serait remplie puis perdue, et le résumé sortirait vide sans que
# rien ne le dise.
digest() {
  printf '%s\n' "$1" >>"$GATE_DIGEST"
}

fail() {
  printf 'agent-gate: fail: %s\n' "$1" >&2
  printf '\n%sÀ donner à l'"'"'agent :%s\n' "$GATE_RED" "$GATE_OFF" >&2
  if [ -s "$GATE_DIGEST" ]; then
    sed 's/^/  /' "$GATE_DIGEST" >&2
  else
    # Un contrôle qui n'a rien déposé: son motif vaut mieux qu'un bloc vide.
    printf '%s\n' "$1" | sed 's/^[[:space:]]*/  /' >&2
  fi
  printf '\n' >&2
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
      digest "L'alignement JWT local est rompu — GoTrue signerait en ES256 et"
      digest "TOUTE fonction en verify_jwt = true rendrait 401."
      digest "Lance ./scripts/check-local-jwt-alg.sh puis lis docs/keel/JWT-HS256.md."
      digest "⛔ NE PAS passer une fonction en verify_jwt = false, NE PAS remplir"
      digest "   supabase/signing_keys.local.json (il doit rester [])."
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
    digest "supabase/config.toml: ce commit ajoute un verify_jwt = false en"
    digest "invoquant l'algorithme JWT local. Retire-le."
    printf '%s\n' "$added" | rg -i 'verify_jwt|es256|hs256|invalid jwt' \
      | head -n 10 | while IFS= read -r l; do digest "  $l"; done || true
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
    digest "Le compte de tests a BAISSÉ: ${current} < ${baseline} (${BASELINE_FILE})."
    digest "Des tests ont été supprimés. Rends-les, ou dis lesquels et pourquoi."
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

  # ── 2026-09-19 — `--parallel`, ET LA SORTIE NE S'IMPRIME QU'EN CAS DE ROUGE ─
  #
  # MESURÉ SUR CE POSTE (8 cœurs), 7 409 tests, trois runs verts chacun:
  #     en série      57 s
  #     --parallel    31 / 33 / 33 s
  #
  # ⚠️ ET LE TEMPS N'ÉTAIT PAS LE PIRE. Le reporter imprime UNE LIGNE PAR TEST:
  # un `git commit` rendait 11 044 lignes, dont 7 412 venaient d'ici. Les huit
  # lignes `agent-gate:` qui disent CE QUI a échoué étaient noyées dedans, et le
  # motif du refus se lisait à l'écran pendant une demi-seconde. Un gate dont on
  # ne lit plus le verdict est un gate qu'on finit par contourner.
  #
  # ⛔ `--quiet` NE RÉPARE PAS ÇA, et c'est mesuré: 7 412 lignes avec, 7 412
  # sans. Il ne tait que les messages de téléchargement et de check, jamais le
  # reporter. La seule façon est de CAPTURER: vert ⇒ on n'imprime que le bilan;
  # rouge ⇒ on imprime TOUT, sur stderr, avant de refuser.
  local keel_out
  keel_out="$(mktemp -t agent-gate-deno)"

  # L'ENVIRONNEMENT EST PURGÉ. Une variable SUPABASE_* héritée du shell fait
  # basculer des dizaines de tests vers une vraie pile et rend 114 faux rouges —
  # après quoi on désarme le gate en croyant réparer un test.
  if (
    for v in $(env | grep -o '^SUPABASE_[A-Z_]*' || true); do unset "$v"; done
    deno test --parallel --allow-read --allow-env supabase/functions/_shared/keel/
  ) >"$keel_out" 2>&1; then
    # Le bilan, et rien d'autre: « ok | 7409 passed | 0 failed | 2 ignored ».
    info "keel: $(rg -N 'passed \|' "$keel_out" | tail -n 1 | sed $'s/\033\\[[0-9;]*m//g')"
    rm -f "$keel_out"
  else
    cat "$keel_out" >&2
    digest "SUITE DENO ROUGE — supabase/functions/_shared/keel/"
    # Le bloc `FAILURES` de deno nomme chaque test cassé ET son fichier. On le
    # blanchit de ses codes de couleur: ce résumé part dans un presse-papier.
    sed $'s/\033\\[[0-9;]*m//g' "$keel_out" \
      | awk '/^ *FAILURES *$/ {f=1; next} /^(FAILED|ok|error:)/ {f=0} f && NF {print}' \
      | head -n 25 | while IFS= read -r l; do digest "  $l"; done || true
    digest "Rejoue: deno test --parallel --allow-read --allow-env supabase/functions/_shared/keel/"
    rm -f "$keel_out"
    fail "des tests keel sont rouges. Le gate les LANCE depuis le 2026-08-12:
       les compter laissait passer un commit avec sept tests cassés."
  fi
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

  # ── LE RUNTIME, RÉSOLU ET NOMMÉ AVANT LE PREMIER TEST ────────────────────
  # Voir le bloc `FRONT_TEST_MIN_NODE_MAJOR` en tête de fichier: sans ça, la
  # suite tourne sur le node qui traîne dans le PATH d'un hook, et une API
  # récente se raconte comme « un fichier ne se charge pas ».
  local node_major node_dir resolved
  resolved="$(resolve_front_node_dir)"
  node_major="${resolved%% *}"
  node_dir="${resolved#* }"
  if [ "$node_major" -lt "$FRONT_TEST_MIN_NODE_MAJOR" ]; then
    fail "le gate allait lancer vitest sur node v${node_major}, et le dépôt
       demande au moins v${FRONT_TEST_MIN_NODE_MAJOR}. Ce n'est pas un détail
       de version: une API plus récente utilisée dans un test s'y raconte
       « des fichiers de test ne se CHARGENT pas », sans jamais nommer le
       runtime. Installe un node >= v${FRONT_TEST_MIN_NODE_MAJOR} (nvm), ou
       abaisse FRONT_TEST_MIN_NODE_MAJOR en connaissance de cause."
  fi
  info "frontend test runtime: node v${node_major} (${node_dir})"

  info "running frontend test suite (vitest)"
  local report
  report="$(mktemp -t agent-gate-vitest)"

  # L'ENVIRONNEMENT EST PURGÉ, pour la même raison que la suite Deno: une
  # variable SUPABASE_* héritée du shell bascule des dizaines de tests vers une
  # vraie pile et rend des dizaines de faux rouges.
  (
    cd frontend
    for v in $(env | grep -o '^SUPABASE_[A-Z_]*' || true); do unset "$v"; done
    # ⚠️ LE NODE RÉSOLU PASSE DEVANT, ET IL DOIT PASSER DEVANT `/usr/local/bin`
    # que la ligne de PATH en tête de fichier y a mis. C'est le seul geste qui
    # fait tourner la suite sur le runtime du développeur.
    PATH="$node_dir:$PATH" npm exec -- vitest --config vitest.config.ts run \
      --reporter=json --outputFile="$report" >/dev/null 2>&1
  ) || true

  if [ ! -s "$report" ]; then
    rm -f "$report"
    fail "vitest n'a produit AUCUN rapport. Ce n'est pas « pas de rouge »:
       c'est la suite qui n'a pas tourné. Relance à la main:
       (cd frontend && npm exec -- vitest --config vitest.config.ts run)"
  fi

  # La sortie du juge est CAPTURÉE plutôt que laissée filer: c'est elle qui
  # nomme un par un les rouges hors liste, et c'est exactement ce qu'il faut
  # recopier. On la réimprime telle quelle, puis on en tire le résumé.
  local verdict
  verdict="$(mktemp -t agent-gate-front-verdict)"
  if PATH="$node_dir:$PATH" node scripts/agent-gate-front-tests.mjs "$report" "$FRONT_TEST_BASELINE" >"$verdict" 2>&1; then
    cat "$verdict"
    rm -f "$report" "$verdict"
  else
    cat "$verdict" >&2
    digest "SUITE VITEST ROUGE — frontend/ (hors ${FRONT_TEST_BASELINE})"
    rg -N '^    \S' "$verdict" | head -n 20 \
      | while IFS= read -r l; do digest " $l"; done || true
    digest "Rejoue un fichier: (cd frontend && npm exec -- vitest --config vitest.config.ts run <chemin>)"
    rm -f "$report" "$verdict"
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
    digest "frontend/tsconfig.test.json ne typecheck AUCUN fichier de test:"
    digest "son \`include\` ne mord plus. La garde existe mais ne garde rien."
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
      digest "  $path — $current erreurs de type, ${FRONT_TYPES_BASELINE} en tolère $count"
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
    digest "  fichiers de test en erreur HORS ${FRONT_TYPES_BASELINE}:"
    printf '%s\n' "$unlisted" | head -n 15 \
      | while IFS= read -r l; do digest "    $l"; done || true
    verdict=1
  fi

  tolerated="$(awk '{s+=$2} END {print s+0}' "$expect")"
  current="$(awk '/error TS/ {n++} END {print n+0}' "$out")"
  info "test typecheck: ${checked} fichiers lus, ${current} erreurs (liste: ${tolerated})"
  rm -f "$out" "$expect"

  if [ "$verdict" -ne 0 ]; then
    # L'en-tête vient APRÈS les lignes de détail dans le code, mais il doit les
    # précéder à l'écran: on le pose en tête du fichier de résumé.
    { printf 'TYPECHECK DES TESTS FRONT EN RÉGRESSION\n'; cat "$GATE_DIGEST"; } \
      >"${GATE_DIGEST}.tmp"
    mv "${GATE_DIGEST}.tmp" "$GATE_DIGEST"
    digest "Rejoue: (cd frontend && npm exec -- tsc -p tsconfig.test.json --noEmit)"
    fail "le typecheck des tests front a régressé (voir ci-dessus)"
  fi
}

check_typecheck() {
  if [ -f frontend/tsconfig.json ]; then
    info "running frontend typecheck"
    local tscb_out
    tscb_out="$(mktemp -t agent-gate-tscb)"
    if ! (cd frontend && npm exec -- tsc -b --noEmit) >"$tscb_out" 2>&1; then
      cat "$tscb_out" >&2
      digest "TYPECHECK DE L'APPLICATION ROUGE (tsc -b)"
      rg -N 'error TS' "$tscb_out" | head -n 20 \
        | while IFS= read -r l; do digest "  $l"; done || true
      digest "Rejoue: (cd frontend && npm exec -- tsc -b --noEmit)"
      rm -f "$tscb_out"
      fail "le typecheck de l'application est rouge"
    fi
    rm -f "$tscb_out"
  fi

  if command -v deno >/dev/null 2>&1; then
    # ⚠️ MESURÉ LE 2026-08-22: cette liste ne portait que les TROIS entrées
    # `sophia-brain`. Les DEUX lanes de génération — le code le plus lourd du
    # produit, celui que `V0-B-bis` venait de corriger — n'étaient typecheckées
    # par PERSONNE: leur `deno check` vert était un geste manuel que rien ne
    # rejouait. Mesurées `rc=0` toutes les deux avant d'entrer ici; +3,7 s.
    info "running deno check on core entrypoints"
    local dc_out
    dc_out="$(mktemp -t agent-gate-denocheck)"
    if ! deno check \
      supabase/functions/sophia-brain/index.ts \
      supabase/functions/sophia-brain/router/agent_exec.ts \
      supabase/functions/sophia-brain/agents/companion.ts \
      supabase/functions/generate-household-meal-v1/index.ts >"$dc_out" 2>&1; then
      cat "$dc_out" >&2
      digest "DENO CHECK ROUGE sur un entrypoint"
      sed $'s/\033\\[[0-9;]*m//g' "$dc_out" | rg -N '^(error|TS[0-9]+|  )' \
        | head -n 20 | while IFS= read -r l; do digest "  $l"; done || true
      rm -f "$dc_out"
      fail "deno check est rouge sur un entrypoint"
    fi
    rm -f "$dc_out"
  else
    info "deno not found, skipping deno check"
  fi
}

check_lint() {
  local files
  files="$(frontend_changed_files)"
  if [ -n "$files" ]; then
    info "running eslint on modified frontend files"
    local lint_out
    lint_out="$(mktemp -t agent-gate-eslint)"
    if ! (cd frontend && npm exec -- eslint ${files//frontend\//}) >"$lint_out" 2>&1; then
      cat "$lint_out" >&2
      digest "ESLINT ROUGE sur les fichiers modifiés"
      rg -N '(error|warning)' "$lint_out" | head -n 20 \
        | while IFS= read -r l; do digest "  $l"; done || true
      rm -f "$lint_out"
      fail "eslint est rouge sur les fichiers modifiés"
    fi
    cat "$lint_out"
    rm -f "$lint_out"
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
