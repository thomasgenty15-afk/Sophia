#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# LOT 1 — UN CAS = UN COMPTE NEUF, UNE DEMANDE FIGÉE, UNE RÉFÉRENCE REBÂTIE
# ═══════════════════════════════════════════════════════════════════════════
#
#   ./tir.sh <suffixe> <nom-du-cas> [options du banc...]
#
# ⛔ LES TROIS PAS SONT OBLIGATOIRES ET DANS CET ORDRE (voir `preparer-ref4.sh`):
# un plat dédié porte `for_member_id`, donc l'identifiant d'une bouche de CE
# foyer. Servir la référence d'un autre compte fait jeter six plats.
#
# ⛔ AUCUNE ÉCRITURE DANS `references/` DU CHANTIER PRÉCÉDENT: la référence de
# ce lot vit dans SON dossier, horodatée par son suffixe de compte.
set -euo pipefail
cd "$(dirname "$0")/../.."
SUFFIXE="${1:?usage: tir.sh <suffixe> <nom> [options]}"
NOM="${2:?usage: tir.sh <suffixe> <nom> [options]}"
shift 2
HORLOGE="${HORLOGE:-2026-09-13T19:00:00+02:00}"
DOSSIER=scratchpad/2026-09-13-LOT1-NOURRIR-CHACUN
BANC=scratchpad/2026-09-11-FIABILITE-RECETTES/banc-lot-F.ts

echo "── ① provisionnement ($SUFFIXE, 422 attendu) ──"
deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
  "$BANC" perte --compte="$SUFFIXE" --horloge="$HORLOGE" "$@" \
  > "/tmp/l1-$SUFFIXE-prep.log" 2>&1 || true
grep -E "^   (statut|bouche)" "/tmp/l1-$SUFFIXE-prep.log" || true

SORTIE=$(ls -t scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/perte-"$SUFFIXE"-*.json | head -1)
echo "── ② gel de la demande ──"
deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
  scratchpad/2026-09-11-CLOTURE/figer-demande.ts "$SORTIE" --nom="l1-$NOM-contrats" | tail -2

echo "── ③ reconstruction de la référence ──"
deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
  scratchpad/2026-09-13-CIBLES-PAR-PERSONNE/batir-ref4.ts \
  --contrats="scratchpad/2026-09-11-CLOTURE/fixtures/l1-$NOM-contrats.json" \
  --sortie="$DOSSIER/ref-$NOM.json" | tail -2

echo "── ④ le tir ──"
deno run --allow-read --allow-env --allow-net --allow-write=scratchpad \
  "$BANC" perte --compte="$SUFFIXE" --horloge="$HORLOGE" \
  --reponse="$DOSSIER/ref-$NOM.json" "$@" \
  > "/tmp/l1-$SUFFIXE.log" 2>&1 || true
sed -n '/statut/,$p' "/tmp/l1-$SUFFIXE.log" | head -22
