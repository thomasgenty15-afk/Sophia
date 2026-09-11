#!/usr/bin/env bash
set -uo pipefail
J="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$J/../.." && pwd)"; . "$J/00-env.sh"
OUT="$J/lotG-assiette/tir-quatre-tub.txt"; : > "$OUT"
( cd "$REPO" && TIMEOUT_MS=900000 ./scripts/local_extend_kong_functions_timeout.sh >/dev/null 2>&1 && echo "kong 900 s" ) >> "$OUT"
git -C "$REPO" log --oneline -1 >> "$OUT"
bash "$J/20-run.sh" C03 quatre 7 2>&1 | tail -4 >> "$OUT"
P=$(ls -t "$J"/plan-C03-*.json | head -1)
bash "$REPO/scratchpad/2026-09-05-2020-CAMPAGNE-MESURE/lecture-74.sh" "$P" quatre 2>&1 | grep -v "^▸\|^=== LE MÊME\|^\s*$\|^── cibles\|entretien \|^jour \|^── livré\|^── compteurs" >> "$OUT"
python3 - "$P" >> "$OUT" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); bs=d["household"]["box_sizing"]
for k in ("anchor","anchor_cap","unmet","unmet_band","pot_attribution"): print(" ",k+":", json.dumps(bs.get(k)))
PY
deno run --allow-read --allow-env --allow-net "$J/42-bacs.ts" "$REPO/scratchpad/2026-08-23-EVAL-QUALITE/ref" "$P" 2>&1 | grep -A 40 "=== BACS COMMUNS" | head -24 >> "$OUT"
echo "fini $(date +%H:%M:%S)" >> "$OUT"
