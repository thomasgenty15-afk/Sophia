#!/usr/bin/env bash
# bash commit-private.sh <msgfile> <fichier>... — commit par index privé (fichiers ENTIERS de l'arbre de travail :
# à n'utiliser que quand `git diff HEAD -- fichier` ne porte que mes hunks), contrôle deno sur l'arbre matérialisé COMPLET.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../../.." && pwd)"; cd "$REPO"
MSG="$1"; shift
W="$(mktemp -d "$REPO/scratchpad/2026-09-04-1658-CAMPAGNE-9-POINTS/lotG-assiette/commit-XXXX")"
HEAD0=$(git rev-parse HEAD)
export GIT_INDEX_FILE="$W/index"; git read-tree "$HEAD0"; for f in "$@"; do git update-index --add "$f"; done
TREE=$(git write-tree); unset GIT_INDEX_FILE; echo "tree $TREE · $(git diff --stat "$HEAD0" "$TREE" | tail -1)"
# ⛔ Un arbre identique à HEAD = rien à commiter (le premier essai a déjà atterri) : un second
# `commit-tree` ferait un commit VIDE (e9000a60, 2026-09-06). On s'arrête ici.
[ "$TREE" = "$(git rev-parse "$HEAD0^{tree}")" ] && { echo "arbre identique à HEAD : déjà commité, rien à faire"; exit 0; }
M="$W/tree"; mkdir -p "$M"; git archive "$TREE" | tar -x -C "$M"; ln -s "$REPO/node_modules" "$M/node_modules"; [ -d "$REPO/frontend/node_modules" ] && ln -s "$REPO/frontend/node_modules" "$M/frontend/node_modules" || true
( cd "$M/supabase/functions" && deno check generate-household-meal-v1/index.ts generate-meal-v1/index.ts meal-energy-v1/index.ts 2>&1 | grep -E "^error|TS[0-9]+" | head -3 || true; deno test --allow-all --no-check _shared/keel/ 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ok \||^FAILED|\.\.\. FAILED" | tail -4 ) | tee "$W/check.txt"
grep -q "^ok |" "$W/check.txt" || { echo "⛔ arbre rouge, pas de commit"; exit 1; }
C=$(git commit-tree "$TREE" -p "$HEAD0" -F "$MSG"); git update-ref refs/heads/ff-001-quotidien-du-coach "$C" "$HEAD0"
# L'index PARTAGÉ garde l'entrée d'avant : on la réaligne sur HEAD, en attendant qu'un verrou d'un pair lâche.
for i in 1 2 3 4 5 6; do if git reset -q -- "$@" 2>/dev/null; then break; fi; echo "index.lock tenu par un pair, nouvel essai dans 15 s ($i/6)"; sleep 15; done
echo "commit $(git rev-parse --short HEAD) · tree ok: $([ "$(git rev-parse HEAD^{tree})" = "$TREE" ] && echo oui)"; rm -rf "$M"
