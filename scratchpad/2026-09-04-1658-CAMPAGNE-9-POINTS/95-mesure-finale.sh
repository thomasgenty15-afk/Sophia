#!/usr/bin/env bash
# MESURE FINALE du 2026-09-06 : tous les lots du matin (092b2bba, a9de04dc, 3d00d6e2, fa224681, + e8709708 de 8a).
# Un tirage : quatre (C03), duo (D01), solo (C01), draft. Lecture : lecture-74.sh + compteurs.
set -uo pipefail
J="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$J/../.." && pwd)"; . "$J/00-env.sh"
OUT="$J/lotG-assiette/mesure-finale.txt"; : > "$OUT"
( cd "$REPO" && TIMEOUT_MS=900000 ./scripts/local_extend_kong_functions_timeout.sh >/dev/null 2>&1 && echo "kong 900 s" ) >> "$OUT"
git -C "$REPO" log --oneline -1 >> "$OUT"
for spec in "C03 quatre" "D01 duo" "C01 solo"; do
  set -- $spec
  echo "══════ $1 ($2, 7 j) · $(date +%H:%M:%S)" >> "$OUT"
  bash "$J/20-run.sh" "$1" "$2" 7 2>&1 | tail -4 >> "$OUT"
done
for spec in "C03 quatre" "D01 duo" "C01 solo"; do
  set -- $spec
  P=$(ls -t "$J"/plan-$1-*.json | head -1)
  echo "══════ LECTURE $2 $(basename "$P")" >> "$OUT"
  bash "$REPO/scratchpad/2026-09-05-2020-CAMPAGNE-MESURE/lecture-74.sh" "$P" "$2" 2>&1 | grep -v "^▸\|^=== LE MÊME\|^\s*$\|^  anchor:\|^── cibles\|entretien \|^jour \|^── livré\|^── compteurs" >> "$OUT"
  if [ "$2" != solo ]; then python3 - "$P" >> "$OUT" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); bs=d["household"]["box_sizing"]
print("  anchor:", json.dumps(bs.get("anchor")))
print("  anchor_cap:", json.dumps(bs.get("anchor_cap")), "· pot_attribution:", json.dumps(bs.get("pot_attribution")))
PY
  fi
done
echo "fini $(date +%H:%M:%S)" >> "$OUT"
