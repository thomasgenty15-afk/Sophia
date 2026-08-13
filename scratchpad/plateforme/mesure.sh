#!/usr/bin/env bash
# Compte, pour les 49 fichiers de la surface rendue, ce que la refonte doit
# écraser: gris (toutes familles froides, TOUS les préfixes d'utilitaire),
# saturées hors Badge, rayons divergents, et reliquats du produit supprimé.
#
#   usage: bash scratchpad/plateforme/mesure.sh [ref]
#   sans ref  → l'état du disque (l'« après »)
#   avec ref  → l'état d'un commit (l'« avant »), ex: f31e5274
#
# ⚠️ Le motif de gris couvre `accent-*`, `caret-*`, `divide-*`, `placeholder-*`,
# `outline-*`, `shadow-*`, `decoration-*`, `ring-*`, `fill-*`, `stroke-*` et les
# cinq familles froides de Tailwind (gray, slate, zinc, neutral, stone). Un
# comptage qui ne regarde que `bg-gray-` et `text-gray-` rate ~10 % du total et
# déclare « zéro gris » sur un écran qui en porte encore.
set -uo pipefail
cd "$(dirname "$0")/../.."

REF="${1:-}"
P='src'

PREFIXE='(bg|text|border|ring|from|to|via|divide|placeholder|decoration|outline|shadow|accent|caret|fill|stroke)'
GRIS="(^|[^a-z-])(hover:|focus:|active:|disabled:|group-hover:|sm:|md:|lg:|xl:)*$PREFIXE-(gray|slate|zinc|neutral|stone)-[0-9]{2,3}"
SAT="(^|[^a-z-])(hover:|focus:|active:|disabled:|group-hover:|sm:|md:|lg:|xl:)*$PREFIXE-(emerald|green|red|rose|amber|yellow|orange|blue|sky|indigo|violet|purple|fuchsia|pink|teal|cyan|lime)-[0-9]{2,3}"
# ⚠️ NE COMPTE QUE LES RAYONS HORS CHARTE. `rounded-full`, `-card`, `-fiche` et
# `-part` sont le vocabulaire ARRÊTÉ: les compter faisait passer un fichier
# parfaitement conforme pour un fichier à 5 rayons, et le total « après » ne
# baissait jamais.
RAYON='rounded(-(none|sm|md|lg|xl|2xl|3xl))?([^a-z-]|$)'
MORT='(violet|indigo|purple|fuchsia)-[0-9]{2,3}|#7c3aed|Powered by IKIZEN|YinYang|apple-touch-icon'

FICHIERS=$(cat <<'EOF'
keel/pages/SetupPage.tsx
keel/components/LocaleSwitch.tsx
keel/pages/TodayPage.tsx
keel/pages/ChatPage.tsx
keel/components/DeviationDialog.tsx
keel/components/DishCard.tsx
keel/components/KitchenToday.tsx
keel/components/WeeklyCheckInDialog.tsx
keel/pages/StudentWeekPlanPage.tsx
keel/pages/StudentProgressPage.tsx
keel/pages/StudentHealthPage.tsx
keel/components/MealBuilder.tsx
keel/components/FoodPreferencesCard.tsx
keel/components/EatingRhythmCard.tsx
keel/components/CookingCapacityCard.tsx
keel/pages/HouseholdPage.tsx
keel/components/HouseholdMergeCard.tsx
keel/components/MealPickerGrid.tsx
keel/components/HouseholdPlanCard.tsx
keel/pages/CoachHomePage.tsx
keel/pages/CoachWeeklyPage.tsx
keel/pages/CoachStudentPage.tsx
keel/pages/CoachBillingPage.tsx
keel/components/WeekView.tsx
keel/components/CoachSeatCard.tsx
keel/components/CoachNoteCard.tsx
keel/components/StudentConstraintsCard.tsx
keel/components/CoachBroadcastCard.tsx
keel/components/InviteDialog.tsx
keel/pages/CoachDoctrinePage.tsx
keel/pages/CoachProtocolPage.tsx
keel/pages/CoachMealsPage.tsx
keel/pages/TemplatesPage.tsx
keel/pages/PlanImportPage.tsx
keel/components/DoctrineStartDialog.tsx
keel/components/CommitmentEditor.tsx
keel/components/CommitmentLine.tsx
pages/Account.tsx
pages/UpgradePlan.tsx
components/UserProfile.tsx
keel/components/KeelAppShell.tsx
keel/components/ui/Badge.tsx
keel/components/ui/Button.tsx
keel/components/ui/Card.tsx
keel/components/ui/Field.tsx
keel/components/ui/Marketing.tsx
keel/components/ui/Modal.tsx
keel/components/ui/Page.tsx
keel/components/ui/SetupSection.tsx
keel/components/plan/PlanGrid.tsx
keel/components/plan/PlanResult.tsx
keel/components/plan/EnergyReadout.tsx
keel/components/plan/KitchenBlock.tsx
components/account/DataPrivacySection.tsx
components/account/DeletionPendingScreen.tsx
keel/components/KeelBadges.tsx
keel/components/ShoppingListPanel.tsx
keel/components/CookingSessions.tsx
keel/components/TakeTheHandCard.tsx
EOF
)

# ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT DE COMPTER, ET C'EST INDISPENSABLE.
# Ce chantier EXIGE qu'on écrive pourquoi une classe est partie — donc les
# commentaires CITENT `text-gray-500`, `bg-violet-600`, « Powered by IKIZEN ».
# Un comptage naïf les additionne et déclare 8 gris sur un fichier qui en rend
# zéro: le fichier le mieux documenté paraît le plus sale. Mesuré: 6 « morts »
# et 8 « gris » fantômes sur le seul lot du compte.
lire() { # $1 = chemin relatif à src/
  local brut
  if [ -n "$REF" ]; then brut="$(git show "$REF:frontend/$P/$1" 2>/dev/null || true)"
  else brut="$(cat "frontend/$P/$1" 2>/dev/null || true)"; fi
  [ -z "$brut" ] && return 0
  # Retire /* … */ (multi-lignes), puis // … et {/* … */} en fin de ligne.
  printf '%s' "$brut" | perl -0777 -pe 's{/\*.*?\*/}{}gs' | perl -pe 's{//.*$}{}'
}

printf '%-46s %6s %6s %6s %6s\n' FICHIER gris satur rayons morts
printf '%s\n' "----------------------------------------------------------------------------"
TG=0; TS=0; TR=0; TM=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  c="$(lire "$f")"
  [ -z "$c" ] && { printf '%-46s %6s\n' "$f" "(absent)"; continue; }
  # Badge.tsx porte les 4 familles d'état: ce sont le vocabulaire, pas des fautes.
  if [ "$f" = "keel/components/ui/Badge.tsx" ]; then s=0
  else s=$(printf '%s' "$c" | grep -oE "$SAT" | wc -l | tr -d ' '); fi
  g=$(printf '%s' "$c" | grep -oE "$GRIS" | wc -l | tr -d ' ')
  r=$(printf '%s' "$c" | grep -oE "$RAYON" | wc -l | tr -d ' ')
  m=$(printf '%s' "$c" | grep -oEc "$MORT" | tr -d ' ')
  TG=$((TG+g)); TS=$((TS+s)); TR=$((TR+r)); TM=$((TM+m))
  printf '%-46s %6s %6s %6s %6s\n' "$f" "$g" "$s" "$r" "$m"
done <<< "$FICHIERS"
printf '%s\n' "----------------------------------------------------------------------------"
printf '%-46s %6s %6s %6s %6s\n' "TOTAL (${REF:-disque})" "$TG" "$TS" "$TR" "$TM"
