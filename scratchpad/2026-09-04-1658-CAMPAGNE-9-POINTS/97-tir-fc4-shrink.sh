#!/usr/bin/env bash
# APRÈS le rétrécissement symétrique : rejoue FC4 (quatre, exclusion de TABLE poulet + saumon + thon) avec le
# banc de 0f, puis lit pot_shrink / pot_growth / unmet dans l'archive. Un tirage : on lit des structures.
set -uo pipefail
J="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$J/../.." && pwd)"
B="$REPO/scratchpad/2026-09-06-1400-RETOURS-ET-CALORIES/banc-retours.sh"
OUT="$J/lotG-assiette/tir-fc4-shrink.txt"; : > "$OUT"
git -C "$REPO" log --oneline -1 >> "$OUT"
ITEMS='[{"at":"2026-09-06","item":"","kind":"food.exclude","text":"poulet","quote":null,"scope":"durable","value":null,"source":"written","subject":"household","confidence":null},{"at":"2026-09-06","item":"","kind":"food.exclude","text":"saumon","quote":null,"scope":"durable","value":null,"source":"written","subject":"household","confidence":null},{"at":"2026-09-06","item":"","kind":"food.exclude","text":"thon","quote":null,"scope":"durable","value":null,"source":"written","subject":"household","confidence":null}]'
bash "$B" FC4 "$ITEMS" 2>&1 | grep -v "^cp:" >> "$OUT"
P=$(ls -t "$J"/plan-FC4-*.json | head -1)
echo "══════ ARCHIVE $(basename "$P")" >> "$OUT"
python3 - "$P" >> "$OUT" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); bs=d["household"]["box_sizing"]
for k in ("pot_growth","pot_shrink","capped_by_pot","unmet","unmet_band","lost_by_line","anchor_cap"): print("  ",k+":", json.dumps(bs.get(k),ensure_ascii=False))
md=d["household"].get("meals_delivered",{}); print("   meals_delivered:", {k:md.get(k) for k in ("missing","retry_attempts","retry_merged_cells")})
print("   préparations:", [(p["id"], p.get("servings_made")) for p in d["preparations"]])
print("   sessions:", [(s.get("day"), len(s.get("preparation_ids") or [])) for s in d.get("cooking_sessions",[])])
print("   courses:", len(d.get("shopping_list",[])), "lignes ·", [l["term"] for l in d.get("shopping_list",[]) if any(t in (l["term"] or "").lower() for t in ("poulet","saumon","thon"))])
print("   issues casseroles:", [i for i in d.get("issues",[]) if i.startswith("preparations")][:4])
PY
echo "fini $(date +%H:%M:%S)" >> "$OUT"
