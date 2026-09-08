#!/usr/bin/env bash
# BANC DE PHRASES — 2026-09-08. Vingt choses qu'une personne pourrait écrire
# sur un brouillon, chacune lue par `keel-read-note-v1` (23-tir-read-note.sh:
# fixture restaurée après chaque tir). On regarde CE QUI A ÉTÉ FAIT et dit.
set -uo pipefail
cd "$(dirname "$0")"
FIX="${1:-quatre}"
OUT="banc-phrases-$(date +%Y%m%d-%H%M%S).md"
i=0
while IFS= read -r phrase; do
  [ -z "$phrase" ] && continue
  i=$((i+1))
  printf '\n### P%02d · « %s »\n\n```\n' "$i" "$phrase" >> "$OUT"
  bash 23-tir-read-note.sh "P$(printf %02d $i)" "$FIX" "$phrase" </dev/null 2>&1 | grep -v "^   → \|http=" >> "$OUT"
  printf '```\n' >> "$OUT"
  sleep 1
done <<'PHRASES'
Leo n'aime pas les brocolis
On mange trop de riz, un peu de variété s'il te plaît
Claire est végétarienne maintenant
Je n'ai pas le temps de cuisiner le soir en semaine
Plus de pâtes que ça, les enfants adorent
Nora a encore faim après le dîner
Trop de restes, on n'arrive jamais à tout finir
Mon fils ne mange pas autant
Les enfants mangent moins que ça
C'est trop compliqué, je veux des recettes plus simples
On part en week-end samedi, pas besoin de dîner ce jour-là
Je veux perdre du poids plus vite
Pas de porc à la maison
Ma femme est allergique aux noix
Merci, c'était très bien cette semaine
On mange dehors le vendredi soir
Il y a trop à manger pour tout le monde
Je mange moins le midi
Paul et Claire mangent moins que ça
Ma mère ne mange pas autant, et Leo veut plus de poulet
PHRASES
echo "→ $OUT"
