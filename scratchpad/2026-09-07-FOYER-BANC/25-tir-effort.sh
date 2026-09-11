#!/usr/bin/env bash
# ⛔ MONTE `PLAN_REASONING_EFFORT` À `high` POUR UNE SÉRIE, PUIS LE REDESCEND.
#
# ⚠️ LA CONSTANTE EST PARTAGÉE. Pendant la fenêtre, TOUTE génération de la pile
# locale part en `high`, y compris celles d'une autre session. La fenêtre est
# donc courte et la restauration vit dans un `trap` unique — deux `trap … EXIT`
# se remplacent, et le second gagnerait en silence (piège déjà refermé ici).
set -euo pipefail
CST="/Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/generation_model.ts"
CAS="${1:-H}"; FIXTURE="${2:-quatre}"; N="${3:-4}"
SAUVE="$(mktemp)"; cp "$CST" "$SAUVE"
restaurer() {
  cp "$SAUVE" "$CST"; rm -f "$SAUVE"
  echo "   ⤺ effort remis à medium ✓"
}
trap restaurer EXIT INT TERM
python3 - "$CST" <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
a='export const PLAN_REASONING_EFFORT = "medium" as const;'
b='export const PLAN_REASONING_EFFORT = "high" as const;'
assert a in s, "la constante n'est pas à medium — série refusée"
open(p,'w',encoding='utf-8').write(s.replace(a,b,1))
PY
echo "   ⇧ effort monté à high (restauré à la sortie)"
cd "/Users/ahmedamara/Dev/Sophia 2"
pkill -f "supabase functions serve" || true; sleep 3
nohup supabase functions serve --env-file supabase/.env > /tmp/serve-effort.log 2>&1 &
sleep 45
cd "/Users/ahmedamara/Dev/Sophia 2/scratchpad/2026-09-07-FOYER-BANC"
for i in $(seq 1 "$N"); do bash 20-tir-foyer.sh "${CAS}${i}" "$FIXTURE" >/dev/null 2>&1 || true; echo "   · ${CAS}${i} fait"; done
echo "SERIE EFFORT TERMINEE"
