#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# BÊTA 3B — LA CAMPAGNE, 30 DEMANDES PRÉDÉFINIES
# ══════════════════════════════════════════════════════════════════════════
#
# ⛔ LA LISTE EST ÉCRITE AVANT LE PREMIER TIR, et elle ne bouge pas ensuite:
# « pas de sélection après résultat ». Six profils × cinq répétitions.
#
#   1 → N=1 perte, rythme courant
#   2 → N=1 prise, besoin élevé démontré faisable
#   7 → N=1 maintien, appétit petit et dîner léger
#   8 → N=2 VÉGANE + OMNIVORE, variante alimentaire nécessaire
#   6 → N=2 objectifs différents, préparation partagée, allergie réelle
#   9 → N=4 présences variables, recettes partagées et variantes
#
# ⛔ AUCUNE RELANCE. Un tir raté reste raté et sort dans le relevé: c'est ce
# que le plan exige, et c'est ce qui garde le dénominateur honnête.
#
# ⚠️ UN COMPTE NEUF PAR RÉPÉTITION (`--compte=sN`): `intent: prepare_next`
# chaîne la fenêtre après le dernier plan, donc deux tirs sur un même compte ne
# demanderaient pas les mêmes jours.
set -uo pipefail
cd "$(dirname "$0")/../../.."
D=scratchpad/2026-09-14-LOT3/campagne
REL="$D/releve.tsv"
printf 'profil\trep\tstatut\tduree_ms\tsous_150s\tetat\tbloquantes\tecarts\treparations\n' > "$REL"

for REP in 1 2 3 4 5; do
  for P in 1 2 7 8 6 9; do
    NOM="p${P}r${REP}"
    LOG="$D/$NOM.log"
    timeout 900 deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
      scratchpad/2026-09-11-FIABILITE-RECETTES/campagne-lot-F.ts "$P" --compte="s$REP" \
      > "$LOG" 2>&1
    ST=$(grep -oE 'statut +[0-9]+' "$LOG" | tail -1 | grep -oE '[0-9]+$')
    MS=$(grep -oE 'durée totale +[0-9]+ ms' "$LOG" | tail -1 | grep -oE '[0-9]+')
    SOUS=$(grep -q 'passerait en production' "$LOG" && echo oui || echo NON)
    ETAT=$(grep -oE '"state": ?"[a-z_]+"' "$LOG" | tail -1 | grep -oE '[a-z_]+"$' | tr -d '"')
    BLOQ=$(grep -oE '"blocking": ?[0-9]+' "$LOG" | tail -1 | grep -oE '[0-9]+$')
    ECA=$(grep -oE '"gaps": ?[0-9]+' "$LOG" | tail -1 | grep -oE '[0-9]+$')
    REP_N=$(grep -oE 'réparations archivées : [0-9]+' "$LOG" | tail -1 | grep -oE '[0-9]+$')
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$P" "$REP" "${ST:-?}" "${MS:-?}" "$SOUS" "${ETAT:-?}" "${BLOQ:-?}" "${ECA:-?}" "${REP_N:-?}" >> "$REL"
    printf '%-6s statut %-4s %8s ms  %-3s  %s\n' "$NOM" "${ST:-?}" "${MS:-?}" "$SOUS" "${ETAT:-?}"
  done
done
echo "── relevé : $REL"
