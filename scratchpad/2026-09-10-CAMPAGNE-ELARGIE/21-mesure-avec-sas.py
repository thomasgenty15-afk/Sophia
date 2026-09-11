#!/usr/bin/env python3
"""
LA MÊME MESURE, SUR LE RÉFÉRENTIEL QUE LE RUNTIME A RÉELLEMENT EU SOUS LA MAIN.

⛔ POURQUOI CE SECOND PASSAGE EXISTE. `20-mesure.py` rejoue les plans sur la
table `food_composition_refs` SEULE. Or la lane, en vol, augmente son index avec
ce que le sas et l'appel de secours lui rendent (`repairPlanComposition` →
`withFilledRefs`). Mesurer sans cette augmentation déclare `unmeasurable` des
journées que le produit a parfaitement pesées — c'est un défaut du BANC, pas du
produit, et le premier passage l'a fait sur 32 jours-bouches sur 62.

Le référentiel augmenté est `ref-avec-sas/`: la table figée PLUS les lignes du
sas mises à la forme d'une fiche, champ pour champ comme `refFor` les construit.
"""
import importlib.util, json, pathlib

spec = importlib.util.spec_from_file_location("m", "20-mesure.py")
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
m.REF = pathlib.Path(__file__).parent / "ref-avec-sas"

runs = json.loads(pathlib.Path("runs.json").read_text())
res = []
for run in runs:
    x = m.mesure(run)
    res.append(x)
    print(f"{x['cas']}·{x['gen']}  http={x['http']}  {x.get('etat')}  "
          f"bornes={x.get('bornes_pct')}%  conformité={x.get('conformite_pct')}%  "
          f"classes={x.get('classement')}")
pathlib.Path("mesures-avec-sas.json").write_text(json.dumps(res, indent=1, default=str))
tot = {}
for x in res:
    for k, v in (x.get("classement") or {}).items():
        tot[k] = tot.get(k, 0) + v
dim = tot.get("conformant", 0) + tot.get("residual_gap", 0)
print(f"\nTOTAL {tot}  → conformité {round(100*tot.get('conformant',0)/dim,1) if dim else None} % sur {dim} jours-bouches")
