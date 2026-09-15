#!/usr/bin/env python3
"""Relit les sorties de la campagne et rend le relevé que le plan demande.

⛔ ON RELIT LES FICHIERS DE SORTIE, PAS LE STDOUT. Le `grep` du lanceur rate les
champs JSON sans espace (`"state":"conforme"`), et un relevé bâti sur un grep
approximatif est exactement le genre de chiffre qu'on publie et qu'on regrette.
"""
import json, glob, os, statistics as st, sys

SUF = sys.argv[1] if len(sys.argv) > 1 else "s"

# ⛔ LE VOCABULAIRE EST CELUI QUE LE CHAMP REND, PAS CELUI DU TYPE. `DeliveryState`
# s'écrit `deliverable_with_gaps` en TypeScript; `planValidationRecord` le publie
# en FRANÇAIS (`livrable_avec_ecarts`). Le premier relevé de la campagne a filtré
# sur l'anglais: deux tirs livrables ont disparu du total (20 au lieu de 22),
# pendant que la table par profil, elle, lisait le bon mot. Un rapport ne doit
# pas porter deux nombres pour une même question.
LIVRABLES = ("conforme", "livrable_avec_ecarts")
NON_LIVRABLE = "non_livrable"
rows = []
for f in glob.glob("scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/campagne-tir*.json"):
    base = os.path.basename(f)
    # campagne-tir<P>-<suffixe>-<date>.json
    parts = base.replace("campagne-tir", "").split("-")
    prof = parts[0]
    suf = parts[1] if len(parts) > 2 else ""
    if not suf.startswith(SUF):
        continue
    d = json.load(open(f))
    r = d.get("reponse") or {}
    v = r.get("validation") or {}
    c = v.get("counts") or {}
    rep = v.get("repair") or {}
    rows.append({
        "profil": int(prof),
        "rep": suf,
        "statut": d.get("statut"),
        "ms": d.get("duree_ms"),
        "etat": v.get("state"),
        "bloq": c.get("blocking"),
        "ecarts": c.get("gaps"),
        "appels": rep.get("calls_made"),
    })
rows.sort(key=lambda x: (x["profil"], x["rep"]))
print(f"{'profil':>6} {'rep':>4} {'statut':>6} {'durée ms':>9} {'<150s':>6} {'état':>22} {'bloq':>5} {'écarts':>7} {'appels':>7}")
for x in rows:
    sous = "oui" if isinstance(x["ms"], int) and x["ms"] <= 150000 else "NON"
    print(f"{x['profil']:>6} {x['rep']:>4} {str(x['statut']):>6} {str(x['ms']):>9} {sous:>6} {str(x['etat']):>22} {str(x['bloq']):>5} {str(x['ecarts']):>7} {str(x['appels']):>7}")

ok = [x for x in rows if x["statut"] == 200]
ms = sorted(x["ms"] for x in ok if isinstance(x["ms"], int))
sans = [x for x in ok if x["appels"] == 0]
livrables = [x for x in ok if x["etat"] in LIVRABLES]
print()
print(f"tirs         : {len(rows)}   ·  200 : {len(ok)}")
if ms:
    p95 = ms[min(len(ms)-1, int(round(0.95*(len(ms)-1))))]
    print(f"durée        : min {ms[0]}  méd {int(st.median(ms))}  p95 {p95}  max {ms[-1]}")
    print(f"au-dessus de 150 000 ms : {sum(1 for m in ms if m>150000)} / {len(ms)}")
print(f"utilisables SANS réparation : {len(sans)} / {len(rows)}")
print(f"utilisables APRÈS le parcours : {len(livrables)} / {len(rows)}")
print(f"bloquantes non nulles : {sum(1 for x in ok if (x['bloq'] or 0) > 0)}")
