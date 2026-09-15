#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════
# LA CAMPAGNE DES 30 TIRS — six profils × cinq, séquentielle, avec ses ARRÊTS
# ══════════════════════════════════════════════════════════════════════════
#
# Décisions du propriétaire (2026-09-15) : enveloppe limitée à 30 tirs, bilan à
# la fin ; plus d'appel de réparation sur un écart compté (commit de politique).
#
# ⛔ ARRÊTS, lus dans l'artefact de chaque tir (bloc `etat_apres`) :
#   · HTTP 5xx, 546, 502, 599 (réseau)    → arrêt : c'est la pile, pas le plan
#   · HTTP 422 plan_not_deliverable       → ON CONTINUE : la garde a refusé un premier
#                                           jet incomplet ; c'est un RÉSULTAT, il reste
#                                           au dénominateur (passation § 3.3)
#   · autre 4xx                           → arrêt : le harnais a mal demandé
#   · un verrou laissé après le tir       → arrêt (la reprise ne doit rien laisser)
#   · durée > 380 000 ms                  → arrêt (échéance du contrat)
# Un plan « livrable avec écarts » N'ARRÊTE PAS : c'est un résultat, il se compte.
#
# Les deux premiers tirs (profils 8 et 9 : N=2 puis N=4) sont les pilotes : le
# script marque une pause de lecture après eux (fichier PAUSE) si demandé.
set -uo pipefail
cd "$(dirname "$0")/../.."
PROFILS="${PROFILS:-1 2 7 6 8 9}"     # perte · prise · maintien · duo+allergie · N2 végane · N4
ROUNDS="${ROUNDS:-5}"
SUFFIXE="${SUFFIXE:-c30}"
S="${SORTIE_LOGS:-/private/tmp/claude-502/campagne-30}"; mkdir -p "$S"
eval "$(supabase status -o env 2>/dev/null | sed 's/^/export /')"
export SUPABASE_URL="http://127.0.0.1:54321" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export KEEL_SERVE_LOG="${KEEL_SERVE_LOG:-/private/tmp/claude-502/functions-serve.log}"
TABLE="$S/campagne-30.tsv"
# ⟳ reprise : DEPUIS=<n> saute les tirs déjà faits (la table est conservée)
DEPUIS="${DEPUIS:-1}"
if [ "$DEPUIS" = 1 ] || [ ! -f "$TABLE" ]; then
  echo -e "n\tprofil\tcompte\thttp\tduree_ms\tappels\treparations\tverrou\tsortie" > "$TABLE"
fi
n=0; ordre=()
# l'ordre : les deux pilotes d'abord (8 puis 9), puis les six profils en tourniquet
ordre+=("8" "9")
for r in $(seq 1 $ROUNDS); do for p in $PROFILS; do
  if [ "$r" = 1 ] && { [ "$p" = 8 ] || [ "$p" = 9 ]; }; then continue; fi
  ordre+=("$p")
done; done
for p in "${ordre[@]}"; do
  n=$((n+1)); [ "$n" -gt 30 ] && break
  [ "$n" -lt "$DEPUIS" ] && continue
  compte="${SUFFIXE}$(printf '%02d' "$n")"
  echo "════ tir $n/30 · profil $p · compte $compte · $(date +%H:%M:%S) ════"
  deno run -A scratchpad/2026-09-11-FIABILITE-RECETTES/campagne-lot-F.ts "$p" --compte="$compte" > "$S/tir-$n-p$p.log" 2>&1
  sortie=$(grep -E "sortie écrite" "$S/tir-$n-p$p.log" | sed 's/.*sortie écrite : //')
  if [ -z "$sortie" ] || [ ! -f "$sortie" ]; then echo "⛔ aucun artefact écrit — arrêt"; tail -20 "$S/tir-$n-p$p.log"; break; fi
  lecture=$(python3 - "$sortie" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); ea=d.get("etat_apres") or {}; r=ea.get("appels_registre") or {}
succ=sum(v for k,v in r.items() if k.endswith(":success"))
print(f"{d.get('statut')}\t{d.get('duree_ms')}\t{succ}\t{len(((d.get('etapes') or {}).get('reparations') or []))}\t{'OUI' if ea.get('verrou_restant') else 'non'}")
PY
)
  IFS=$'\t' read -r http duree appels rep verrou <<< "$lecture"
  echo -e "$n\t$p\t$compte\t$http\t$duree\t$appels\t$rep\t$verrou\t$sortie" >> "$TABLE"
  echo "   HTTP $http · ${duree} ms · appels $appels · réparations $rep · verrou laissé $verrou"
  case "$http" in
    200) ;;
    422) echo "   ↳ refus de la garde (plan_not_deliverable) : compté, on continue" ;;
    *)   echo "⛔ ARRÊT : HTTP $http"; break ;;
  esac
  if [ "$verrou" = "OUI" ]; then echo "⛔ ARRÊT : un verrou est resté"; break; fi
  if [ "${duree:-0}" -gt 380000 ]; then echo "⛔ ARRÊT : ${duree} ms > 380 000"; break; fi
  if [ "$n" = 2 ] && [ -n "${PAUSE_APRES_PILOTES:-}" ]; then echo "⏸ pilotes faits — relire avant de continuer"; break; fi
done
echo; echo "── TABLE ──"; column -t -s $'\t' "$TABLE" | cut -c1-120
