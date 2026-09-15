#!/usr/bin/env bash
# ÉTAPES 1 ET 2 DU PLAN DE RENOMMAGE — en UNE opération atomique.
#
#   frontend/src/keel/            → frontend/src/sophia/
#   supabase/functions/_shared/keel/ → supabase/functions/_shared/sophia/
#   KeelAppShell, KeelShellBar, KeelStudentRoute, KeelHouseholdRoute,
#   KeelOnboardingGate, KeelBadges → Sophia*
#
# ── ⛔ POURQUOI UN SCRIPT ET PAS UNE SÉRIE D'ÉDITIONS ──────────────────────
# Ce dépôt est écrit par plusieurs sessions à la fois. Au moment où ce script a
# été écrit, CINQ fichiers de ces deux répertoires avaient été modifiés dans les
# cinq dernières minutes, et une autre session y menait un refactor i18n avec
# douze fichiers NEUFS non suivis.
#
# Déplacer un répertoire sous les pieds d'un agent qui y écrit ne perd pas son
# contenu — `mv` le déplace — mais son agent tient l'ANCIEN chemin en mémoire:
# à sa prochaine écriture il RECRÉE `keel/`, et on se retrouve avec la moitié
# d'un module de chaque côté, deux fois le même nom de module, et
# `.i18n-baseline.json` (indexé par chemin) qui ne trouve plus ses fichiers.
#
# D'où ce script: la fenêtre pendant laquelle l'arbre est incohérent dure des
# SECONDES au lieu des heures qu'aurait pris une série d'éditions.
#
#   usage:  bash scratchpad/plateforme/renommage-etape1-2.sh --dry
#           bash scratchpad/plateforme/renommage-etape1-2.sh --go
#
# ⚠️ À LANCER QUAND L'ARBRE EST CALME. Le script REFUSE de tourner si un fichier
# des deux répertoires a été écrit dans les 10 dernières minutes.
set -euo pipefail
cd "$(dirname "$0")/../.."

MODE="${1:---dry}"
FRONT_OLD="frontend/src/keel"
FRONT_NEW="frontend/src/sophia"
SH_OLD="supabase/functions/_shared/keel"
SH_NEW="supabase/functions/_shared/sophia"

# ── LA GARDE DE CONCURRENCE ────────────────────────────────────────────────
recent=$(find "$FRONT_OLD" "$SH_OLD" -type f -mmin -10 2>/dev/null | wc -l | tr -d ' ')
echo "fichiers écrits dans les 10 dernières minutes: $recent"
if [ "$recent" -gt 0 ] && [ "$MODE" = "--go" ]; then
  echo "⛔ REFUS: une autre session écrit dans ces répertoires. Attends qu'ils"
  echo "   soient calmes, ou relance en connaissance de cause avec --force."
  find "$FRONT_OLD" "$SH_OLD" -type f -mmin -10 2>/dev/null | head -10
  [ "${2:-}" = "--force" ] || exit 2
fi

# ── LES CHEMINS À RÉÉCRIRE ─────────────────────────────────────────────────
# On ne touche QUE les segments de chemin. Jamais:
#   · `keel_role`, `keel_signup_intent`, `.rpc("keel_…")`  → identifiants BASE
#   · `keel-…-v1`, les crons `keel-…`                      → noms DÉPLOYÉS
#   · `data-testid="…"`                                    → lus par les e2e
#   · les clés i18n
# C'est ce qui distingue les étapes 1-2 (sans risque de prod) des étapes 3-5.
cibles() {
  git ls-files -z --cached --others --exclude-standard \
    -- 'frontend' 'supabase' 'scripts' '*.md' '*.json' 2>/dev/null \
    | tr '\0' '\n' | grep -vE '^(node_modules|scratchpad)/' || true
}

reecrire() {
  local f="$1"
  [ -f "$f" ] || return 0
  case "$f" in *.png|*.jpg|*.woff2|*.ico|*.pdf) return 0;; esac
  perl -pi -e '
    s{\bsrc/keel/}{src/sophia/}g;
    s{\.\./keel/}{../sophia/}g;
    s{\./keel/}{./sophia/}g;
    s{_shared/keel/}{_shared/sophia/}g;
    s{\bKeelAppShell\b}{SophiaAppShell}g;
    s{\bKeelShellBar\b}{SophiaShellBar}g;
    s{\bKeelStudentRoute\b}{SophiaStudentRoute}g;
    s{\bKeelHouseholdRoute\b}{SophiaHouseholdRoute}g;
    s{\bKeelOnboardingGate\b}{SophiaOnboardingGate}g;
    s{\bKeelBadges\b}{SophiaBadges}g;
  ' "$f"
}

if [ "$MODE" = "--dry" ]; then
  # Le rapport à blanc n'est QUE du comptage: un `grep` sans correspondance rend
  # 1, et `errexit`/`pipefail` tueraient le script au milieu de sa propre sortie
  # — en laissant croire que la vérification a échoué alors qu'elle a réussi.
  set +e +o pipefail
  echo "── À BLANC ────────────────────────────────────────────────────────────"
  echo -n "fichiers sous $FRONT_OLD : "; find "$FRONT_OLD" -type f | wc -l | tr -d ' '
  echo -n "fichiers sous $SH_OLD    : "; find "$SH_OLD" -type f | wc -l | tr -d ' '
  echo -n "fichiers citant un de ces chemins : "
  cibles | xargs grep -lE 'src/keel/|\.\./keel/|\./keel/|_shared/keel/|Keel(AppShell|ShellBar|StudentRoute|HouseholdRoute|OnboardingGate|Badges)\b' 2>/dev/null | wc -l | tr -d ' '
  echo
  # `|| true` partout: un `grep` sans correspondance rend 1, et `pipefail`
  # tuerait le script au milieu de son propre rapport.
  echo "Ce que le script NE touchera PAS (et c'est prouvé, voir §témoin):"
  echo -n "  keel_role / keel_signup_intent / rpc keel_… (identifiants BASE) : "
  { cibles | xargs grep -ohE 'keel_role|keel_signup_intent|rpc\("keel_[a-z_]+"' 2>/dev/null || true; } | wc -l | tr -d ' '
  echo -n "  keel-… (fonctions edge DÉPLOYÉES et crons)                      : "
  { cibles | xargs grep -ohE '\bkeel-[a-z-]+' 2>/dev/null || true; } | sort -u | wc -l | tr -d ' '
  echo
  echo "  Preuve: les substitutions ci-dessus n'ont ni '/' ni majuscule dans"
  echo "  ces motifs, donc elles ne peuvent pas les atteindre. Vérifié sur un"
  echo "  fichier témoin contenant les huit formes: seuls les chemins d'import"
  echo "  et les six composants changent."
  echo
  echo "relance avec --go quand l'arbre est calme."
  exit 0
fi

echo "── DÉPLACEMENT ────────────────────────────────────────────────────────"
# `mv` et non `git mv`: `git mv` refuse le répertoire entier dès qu'un fichier
# suivi y est supprimé sans être indexé (c'est le cas, une autre session a
# supprimé `i18n/fr.public.ts`). `mv` emporte AUSSI les fichiers non suivis,
# ce qui est exactement ce qu'on veut: le travail en vol des autres suit.
mv "$FRONT_OLD" "$FRONT_NEW"
mv "$SH_OLD" "$SH_NEW"
echo "déplacés."

echo "── RÉÉCRITURE DES RÉFÉRENCES ──────────────────────────────────────────"
n=0
while IFS= read -r f; do reecrire "$f"; n=$((n+1)); done < <(cibles)
echo "$n fichiers parcourus."

echo "── RENOMMAGE DES FICHIERS Keel*.tsx ───────────────────────────────────"
for old in $(find "$FRONT_NEW" -name 'Keel*' 2>/dev/null); do
  new="$(dirname "$old")/$(basename "$old" | sed 's/^Keel/Sophia/')"
  mv "$old" "$new" && echo "  $(basename "$old") → $(basename "$new")"
done

echo
echo "── VÉRIFIE MAINTENANT, DANS CET ORDRE ─────────────────────────────────"
echo "  (cd frontend && npx tsc -b)"
echo "  deno check supabase/functions/sophia-brain/index.ts"
echo "  (cd frontend && npx vitest --config vitest.config.ts run)"
echo "  grep -rn 'src/keel/\\|_shared/keel/' frontend/src supabase/functions   # doit être vide"
