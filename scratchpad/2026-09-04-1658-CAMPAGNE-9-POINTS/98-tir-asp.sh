#!/usr/bin/env bash
# Point 2 (asperges) sur quatre : exclude asperges@Claire + prefer asperges@Paul, un brouillon de 7 jours (banc de 0f), lecture de preference_split.
set -uo pipefail
J="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$J/../.." && pwd)"
B="$REPO/scratchpad/2026-09-06-1400-RETOURS-ET-CALORIES/banc-retours.sh"
OUT="$J/lotG-assiette/tir-asp.txt"; : > "$OUT"
git -C "$REPO" log --oneline -1 >> "$OUT"
ITEMS='[{"at":"2026-09-06","item":"","kind":"food.exclude","text":"les asperges","quote":null,"scope":"durable","value":null,"source":"written","subject":"member:620d929d-3c61-4af5-8575-150442486648","confidence":null},{"at":"2026-09-06","item":"","kind":"food.prefer","text":"les asperges","quote":null,"scope":"durable","value":null,"source":"written","subject":"member:b60378e6-1956-4dbd-b8dc-7480578a8282","confidence":null}]'
bash "$B" ASP4 "$ITEMS" 2>&1 | grep -v "^cp:" >> "$OUT"
P=$(ls -t "$J"/plan-ASP4-*.json | head -1); L=$(ls -t "$J"/log-ASP4-*.txt | head -1)
echo "══════ ARCHIVE $(basename "$P")" >> "$OUT"
python3 - "$P" >> "$OUT" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); h=d["household"]
print("   preference_split:", json.dumps(h.get("preference_split")))
print("   exclusion_belt:", json.dumps(h.get("exclusion_belt"))[:300])
asp=[(dsh["day"],dsh["slot"],[m[:8] for m in (b.get("member_ids") or [])],[i["term"] for i in b["items"] if "asperge" in (i.get("term") or "").lower()]) for dsh in d["dishes"] for b in (dsh.get("boxes") or []) if any("asperge" in (i.get("term") or "").lower() for i in b["items"])]
print("   boîtes citant une asperge (jour, moment, bouches, items):", asp[:8])
print("   casseroles:", [(p["id"], [i["term"] for i in p["ingredients"] if "asperge" in (i.get("term") or "").lower()]) for p in d["preparations"] if any("asperge" in (i.get("term") or "").lower() for i in p["ingredients"])])
print("   titres avec asperge:", [dsh["title"] for dsh in d["dishes"] if "asperge" in dsh["title"].lower()][:6])
PY
grep -a -o '"keel.household_meal.preference_split"[^}]*}' "$L" | tail -1 >> "$OUT"
echo "fini $(date +%H:%M:%S)" >> "$OUT"
