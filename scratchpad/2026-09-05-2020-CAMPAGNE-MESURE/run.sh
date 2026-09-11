#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# CAMPAGNE DE MESURE — arbitrage 7 du 2026-09-05 (« mesurer avant de coder »)
# ══════════════════════════════════════════════════════════════════════════
#
#   bash run.sh passe1 [DEPUIS]   → les 12 cas de la première passe, un à un
#   bash run.sh rejeu C04 3       → trois rejeux d'un cas
#   bash run.sh un  C07           → un seul cas
#
# Chaque tir passe par 20-run.sh de la campagne 9 points (mêmes fixtures, mêmes
# portes que l'écran, fixture restaurée après). Une génération à la fois. Les
# JSON sont copiés ici (plan-<cas>-<n>-<stamp>.json) et lus par lire.py.
# Bash 3 (macOS): pas de tableau associatif, une fonction `args_of`.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CAMP="$HERE/../2026-09-04-1658-CAMPAGNE-9-POINTS"
cd "$CAMP" || exit 1

# cas → fixture · jours · style · courses · équipement · fuseau (« jour même »)
args_of() {
  case "$1" in
    M01) echo "solo 7 balanced 2";;
    M02) echo "solo 3 minimal 1";;
    M03) echo "duo 7 balanced 2";;
    M04) echo "duo 7 minimal 1";;
    M05) echo "quatre 7 balanced 2";;
    M06) echo "quatre 7 minimal 1";;
    M07) echo "cinq 7 keen 3";;
    M08) echo "cinq 7 minimal 2";;
    M09) echo "cinq 3 balanced 1";;
    M10) echo "quatre 7 keen 2";;
    M11) echo "duo 7 balanced 2 '' America/Mexico_City";;   # ≈ 12 h locales
    M12) echo "duo 7 balanced 2 '' Europe/Istanbul";;       # ≈ 21 h locales
    *) echo "";;
  esac
}
ORDER="M01 M02 M03 M04 M05 M06 M07 M08 M09 M10 M11 M12"

tir() {
  local cas="$1" n="$2"
  local args; args="$(args_of "$cas")"
  [ -z "$args" ] && { echo "⛔ cas inconnu $cas"; return; }
  echo; echo "═══════ $cas (#$n) — $(date +%H:%M:%S) — $args"
  local before; before="$(ls -t plan-${cas}-*.json 2>/dev/null | head -1)"
  eval bash 20-run.sh "$cas" $args 2>&1 | sed 's/^/   /' | tail -8
  local after; after="$(ls -t plan-${cas}-*.json 2>/dev/null | head -1)"
  if [ -n "$after" ] && [ "$after" != "$before" ]; then
    cp "$after" "$HERE/plan-${cas}-${n}-$(basename "$after" | sed 's/^plan-[^-]*-//')"
    echo "   → lu:"; python3 "$HERE/lire.py" "$cas" "$after" | sed 's/^/   /'
  else
    echo "   ⛔ aucun JSON produit"
  fi
}

case "${1:-passe1}" in
  passe1)
    START="${2:-M01}"; GO=0
    for c in $ORDER; do [ "$c" = "$START" ] && GO=1; [ "$GO" = 1 ] && tir "$c" 1; done;;
  rejeu)  for i in $(seq 1 "${3:-3}"); do tir "$2" "r$i"; done;;
  un)     tir "$2" "${3:-x}";;
  *) echo "usage: run.sh passe1 [DEPUIS] | rejeu CAS N | un CAS"; exit 2;;
esac
echo; echo "FIN $(date +%H:%M:%S)"
