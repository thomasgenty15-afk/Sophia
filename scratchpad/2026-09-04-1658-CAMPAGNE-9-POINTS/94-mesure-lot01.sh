#!/usr/bin/env bash
# APRÈS lots 0 + 1 (092b2bba, a9de04dc) : un tirage quatre (C03) + un tirage duo (D01), draft, puis lecture.
set -uo pipefail
J="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$J/../.." && pwd)"; . "$J/00-env.sh"
OUT="$J/lotG-assiette/apres-lot01.txt"; : > "$OUT"
( cd "$REPO" && TIMEOUT_MS=900000 ./scripts/local_extend_kong_functions_timeout.sh >/dev/null 2>&1 && echo "kong 900 s" ) >> "$OUT"
git -C "$REPO" log --oneline -1 >> "$OUT"
for spec in "C03 quatre" "D01 duo"; do
  set -- $spec
  echo "══════ $1 ($2, 7 j) · $(date +%H:%M:%S)" >> "$OUT"
  bash "$J/20-run.sh" "$1" "$2" 7 2>&1 | tail -4 >> "$OUT"
done
PQ=$(ls -t "$J"/plan-C03-*.json | head -1); PD=$(ls -t "$J"/plan-D01-*.json | head -1)
for spec in "$PQ quatre" "$PD duo"; do
  set -- $spec
  echo "══════ LECTURE $2 $(basename "$1")" >> "$OUT"
  bash "$REPO/scratchpad/2026-09-05-2020-CAMPAGNE-MESURE/lecture-74.sh" "$1" "$2" 2>&1 | grep -v "^▸\|^=== LE MÊME\|^\s*$\|^  anchor:\|^── cibles\|entretien " >> "$OUT"
  python3 - "$1" >> "$OUT" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); bs=d["household"]["box_sizing"]
print("  anchor:", json.dumps(bs.get("anchor")))
print("  anchor_cap:", json.dumps(bs.get("anchor_cap")), "· pot_attribution:", json.dumps(bs.get("pot_attribution")))
PY
done
echo "fini $(date +%H:%M:%S)" >> "$OUT"
