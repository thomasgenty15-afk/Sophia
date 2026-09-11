#!/usr/bin/env bash
# M13 — A4 : UNE SEULE SESSION POUR SEPT JOURS (cook_days = dimanche seul), duo, 1 course.
# Attendu : des boîtes marquées « congélateur » pour les jours hors de portée du frigo,
# dites dans la session, et une liste de courses cohérente. Fixture mutée puis restaurée.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; CAMP="$HERE/../2026-09-04-1658-CAMPAGNE-9-POINTS"
source "$CAMP/00-env.sh"
U="$(psqlq -c "select id from auth.users where email='$DUO_EMAIL'")"
PC0="$(psqlq -c "select practical_constraints::text from student_goals where user_id='$U'")"
restore() { psqlq -c "update student_goals set practical_constraints='$(printf '%s' "$PC0" | sed "s/'/''/g")'::jsonb where user_id='$U';" >/dev/null; echo "   ⤺ cook_days restauré"; }
trap restore EXIT INT TERM
psqlq -c "update student_goals set practical_constraints=practical_constraints||'{\"cook_days\":[\"sun\"]}'::jsonb where user_id='$U';" >/dev/null
echo "═══════ M13 (#1) — $(date +%H:%M:%S) — duo 7 balanced 1 · cook_days=[sun]"
cd "$CAMP" && before="$(ls -t plan-M13-*.json 2>/dev/null | head -1)"
bash 20-run.sh M13 duo 7 balanced 1 2>&1 | sed 's/^/   /' | tail -8
after="$(ls -t plan-M13-*.json 2>/dev/null | head -1)"
if [ -n "$after" ] && [ "$after" != "$before" ]; then
  cp "$after" "$HERE/plan-M13-1-$(basename "$after" | sed 's/^plan-[^-]*-//')"
  echo "   → lu:"; python3 "$HERE/lire.py" M13 "$after" | sed 's/^/   /'
  python3 - "$after" <<'PY'
import json, sys
p = json.load(open(sys.argv[1]))
print("   sessions:", [(s.get("day"), s.get("total_minutes"), len(s.get("preparation_ids") or [])) for s in p["cooking_sessions"]])
print("   uses kept:", sorted({u.get("kept") for d in p["dishes"] for u in d.get("uses") or []}))
print("   issues frigo/congel:", [i[:130] for i in p.get("issues", []) if "freez" in i or "fridge" in i or "keep" in i][:6])
print("   rationale:", [l[:110] for l in p["rationale"]["lines"] if "congé" in l or "frigo" in l or "session" in l][:4])
PY
else echo "   ⛔ aucun JSON produit"; fi
echo "FIN $(date +%H:%M:%S)"
