#!/usr/bin/env bash
# Le double rapport d'un cas : nutrition (modules de production) + faisabilité.
set -euo pipefail
source "$(dirname "$0")/00-env.sh"
C="$1"; DAYS="${2:-sun,mon,tue}"
F="$(ls "$EVAL_DIR"/plan-$C-*.json | tail -1)"
echo "══════════ $C · $(basename "$F") ══════════"
deno run --quiet --allow-read "$EVAL_DIR/analyse.ts" "$EVAL_DIR/ref" "$F" "$EVAL_DIR/body-$C.json" \
 | python3 -c "
import json,sys
d=json.load(sys.stdin)
e=d['envelope']
print('① NUTRITION')
print('  cible du produit :', e.get('energy'), '| plancher protéine', e.get('proteinFloorG'),'g | plafond densité', e.get('densityCeiling'))
print('  maintenance nue  :', d['maintenance_range'])
v=d['verdict']
print('  VERDICT produit  : énergie', v['energy'],'| protéine', v['protein'],'| densité', v['density'])
print('  termes inconnus  :', d.get('unresolved_terms'))
print('  connus NON pesés :', d.get('unweighed_terms'))
print('  résolution       :', v['resolution']['resolved'],'/',v['resolution']['total'], '| sentinelles manquantes', v['sentinels']['missing'], '| incouvrables', v['sentinels']['uncoverable'])
for x in d['days']:
    print(f\"   {x['day']}: {x['kcal']} kcal ({x['counted']} plats comptés) · protéine {x['protein_g']} g\" + ('' if x['complete'] else '  ⚠️ INCOMPLET'))
"
python3 "$EVAL_DIR/faisabilite.py" "$F" "$DAYS" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('② FAISABILITÉ')
print('  liste de courses :', d['shopping_lines'],'lignes · porte un jour ?', d['shopping_has_day'])
print('  ingrédients absents des courses :', d['courses_manquantes'] or 'aucun')
print('  conservation J+2 :', d['conservation_violations'] or 'aucune violation')
print('  sessions         :', d['sessions'])
print('  restes non consommés :', d['restes'] or 'aucun')
print('  sans quantité    :', d['sans_quantite'] or 'aucune')
print('  quantités suspectes :', d['quantites_suspectes'] or 'aucune')
print('  variété          :', d['variete'])
print('  créneaux         :', d['creneaux'])
print('  fenêtre suggérée :', d['suggested_window'])
print('  rationale        :', d['rationale'])
print('  compte-rendu     :', d['request_report'])
print('  issues           :')
for i in d['issues']: print('    -', i)
"
