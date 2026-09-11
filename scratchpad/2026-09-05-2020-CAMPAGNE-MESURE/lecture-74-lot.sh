#!/usr/bin/env bash
# bash lecture-74-lot.sh <sortie.txt> "M01 solo" "M05 quatre" ...
OUT="$1"; shift; : > "$OUT"
for spec in "$@"; do set -- $spec; P=$(ls plan-$1-*.json | tail -1); bash lecture-74.sh "$P" "$2" 2>&1 | grep -v "^▸\|^=== LE MÊME\|^\s*$\|^   .*g/bouche" >> "$OUT"; done
echo "fini: $(wc -l < "$OUT") lignes"
