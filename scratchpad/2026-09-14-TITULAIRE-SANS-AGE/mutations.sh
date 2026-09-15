#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# 2026-09-14 — LES DEUX MUTATIONS ADVERSARIALES, REJOUABLES
# ═══════════════════════════════════════════════════════════════════════════
#
#   ./mutations.sh A   |   ./mutations.sh B   |   ./mutations.sh restaurer
#
# ⛔ LA RESTAURATION SE FAIT PAR `cp`, JAMAIS PAR GIT : une autre session
# travaille sur le même dépôt et un `git checkout` emporterait son travail.
# La sauvegarde est `sauvegardes/portion_sizing.ts.ORIG`, sha256
# f69f532730e3df1170b61d5adbe88b58a06e0556cf24121724e117cafb741a07.
#
# ── CE QUE CHAQUE MUTATION PROUVE ─────────────────────────────────────────
#   A — `const share = row.recipeShare` devient `= null` : c'est le code
#       D'AVANT le correctif. Le titulaire sans date perd ses six assiettes.
#       Rouges attendus : 4 tests de `portion_sizing_test.ts`, et au banc
#       422 `cell_without_portion` × 6, `boxes_authored: 0`.
#   B — `row.recipeShare ?? "age_unknown"` : le refus d'une recette illisible
#       est désarmé. Rouges attendus : 2 tests. ⚠️ AU BANC LE PLAN RESTE
#       REFUSÉ — la seconde ceinture (`items.length === 0`) tient encore ;
#       seul le COMPTEUR ment (`recipe_shares: 6` au lieu de 5).
set -uo pipefail
cd "$(dirname "$0")/../.."
CIBLE=supabase/functions/_shared/keel/portion_sizing.ts
ORIG=scratchpad/2026-09-14-TITULAIRE-SANS-AGE/sauvegardes/portion_sizing.ts.ORIG
case "${1:?usage: mutations.sh A|B|restaurer}" in
  A) python3 - "$CIBLE" <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding="utf-8").read()
o="    if (!row.sized) {\n      const share = row.recipeShare;"
n="    if (!row.sized) {\n      const share: RecipeShareReason | null = null; // MUTATION A"
assert s.count(o)==1; open(p,"w",encoding="utf-8").write(s.replace(o,n)); print("mutation A posée")
PY
     ;;
  B) python3 - "$CIBLE" <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding="utf-8").read()
o="    if (!row.sized) {\n      const share = row.recipeShare;"
n="    if (!row.sized) {\n      const share = row.recipeShare ?? \"age_unknown\"; // MUTATION B"
assert s.count(o)==1; open(p,"w",encoding="utf-8").write(s.replace(o,n)); print("mutation B posée")
PY
     ;;
  restaurer) cp "$ORIG" "$CIBLE"; echo "restauré par cp" ;;
  *) echo "usage: mutations.sh A|B|restaurer"; exit 2 ;;
esac
shasum -a 256 "$CIBLE"
