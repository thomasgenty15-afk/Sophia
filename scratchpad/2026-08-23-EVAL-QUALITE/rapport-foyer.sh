#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00-env.sh"
C="$1"; DAYS="${2:-sun,mon,tue}"
F="$(ls "$EVAL_DIR"/plan-$C-*.json | tail -1)"
echo "══════════ $C · $(basename "$F") ══════════"
deno run --quiet --allow-read "$EVAL_DIR/analyse-foyer.ts" "$EVAL_DIR/ref" "$F" "$EVAL_DIR/roster-$C.json" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('① NUTRITION PAR BOUCHE')
for c in d['cibles']:
    e=c['envelope']
    print(f\"  cible {c['name']:6s} objectif={c['goal']} régime={c['diet']} mineur={c['minor']} → {e['energy'] if e else None} | plancher protéine {e.get('proteinFloorG') if e else None} g\")
for r in sorted(d['par_bouche'], key=lambda x:(x['name'],x['day'] or '')):
    print(f\"  servi {r['name']:6s} {r['day']}: {r['kcal']} kcal ({r['counted']}) {r['grams']} g · slots {r['slots']} · gaps {r['gaps']}\" + ('' if r['complete'] else '  ⚠️ INCOMPLET'))
"
python3 - "$F" "$EVAL_DIR/roster-$C.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); roster=json.load(open(sys.argv[2]))
nm={r['member_id']:r['first_name'] for r in roster}
h=d['household']
print('② FOYER')
print('  boîtes   :', json.dumps(h.get('boxes')))
print('  régime   :', json.dumps(h.get('regime_belt')))
print('  cuisine  :', json.dumps(h.get('kitchen')), '| dehors', json.dumps(h.get('eating_out')))
print('  parts    :', json.dumps(h.get('shares')), '| notes vagues', json.dumps(h.get('vague_portions')))
print('  contact croisé :', json.dumps(h.get('cross_contact_block')))
print('  deltas   :', json.dumps(d.get('member_deltas')))
print('  rationale:', d['rationale']['lines'])
print('  compte-rendu:', d['request_report']['lines'])
print('③ CONTENANTS PAR REPAS')
for x in d['dishes']:
    own = nm.get(x.get('member_id'), x.get('member_id'))
    print(f"  {x['day']}/{x['slot']} :: {x['name']} [pour {own}]")
    for b in x.get('boxes') or []:
        who=[nm.get(m,m) for m in (b.get('member_ids') or [])]
        tot=sum(i.get('grams') or 0 for i in (b.get('items') or []))
        print(f"      box {b.get('id')} → {who}  {tot} g  {[ (i.get('term'), i.get('grams')) for i in (b.get('items') or []) ]}")
print('④ ISSUES')
for i in d['issues']: print('  -', i)
PY
python3 "$EVAL_DIR/faisabilite.py" "$F" "$DAYS" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('⑤ FAISABILITÉ')
print('  courses:', d['shopping_lines'],'lignes · jour ?', d['shopping_has_day'], '| manquants:', d['courses_manquantes'] or 'aucun')
print('  conservation J+2:', d['conservation_violations'] or 'aucune')
print('  sessions:', d['sessions'])
print('  restes:', d['restes'] or 'aucun')
print('  sans quantité:', d['sans_quantite'] or 'aucune')
print('  suspectes:', d['quantites_suspectes'] or 'aucune')
print('  variété:', d['variete'])
print('  créneaux:', d['creneaux'])
"
