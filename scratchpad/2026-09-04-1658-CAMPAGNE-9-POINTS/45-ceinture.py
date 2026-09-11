#!/usr/bin/env python3
"""
LA CEINTURE, REJOUÉE SUR LA SORTIE BRUTE DU MODÈLE — 2026-09-04.

⛔ POURQUOI LA SORTIE BRUTE ET PAS LA RÉPONSE. La ceinture RETIRE le nom de la
bouche avant que la réponse ne soit sérialisée: lue sur le plan rendu, une
bouche écartée n'apparaît sur aucune boîte, et « le modèle n'a rien composé pour
elle » est indiscernable de « le moteur le lui a retiré ». `llm_raw_response_events`
garde ce que le modèle a réellement écrit.

  python3 45-ceinture.py <brut.json> <roster.json> <Prénom>
"""
import json, sys, re

CARNE = re.compile(
    r"poulet|dinde|boeuf|bœuf|porc|jambon|lardon|poisson|saumon|thon|cabillaud|"
    r"crevette|oeuf|œuf|fromage|parmesan|feta|lait|beurre|cr[eè]me|yaourt|miel",
    re.I,
)

txt = open(sys.argv[1], encoding="utf-8").read()
i, j = txt.find("{"), txt.rfind("}")
d = json.loads(txt[i:j + 1])
roster = {r["member_id"]: r["first_name"] for r in json.load(open(sys.argv[2], encoding="utf-8"))}
who = sys.argv[3]
mid = next(k for k, v in roster.items() if v == who)
preps = {p["id"]: p for p in d.get("preparations", [])}

def prep_text(p):
    return str(p.get("title", "")) + " " + " ".join(
        str(g.get("term", "")) for g in p.get("ingredients", []))

seule = partagee = sale = propre_prep_carne = propre = 0
for x in d.get("dishes", []):
    for b in (x.get("boxes") or []):
        if mid not in (b.get("member_ids") or []):
            continue
        items = b.get("items") or []
        (seule := seule + 1) if len(b["member_ids"]) == 1 else (partagee := partagee + 1)
        if any(CARNE.search(str(it.get("term", ""))) for it in items):
            sale += 1
            continue
        cites = {it.get("preparation_id") for it in items if it.get("preparation_id")}
        if any(p in preps and CARNE.search(prep_text(preps[p])) for p in cites):
            propre_prep_carne += 1
        else:
            propre += 1

total = seule + partagee
print(f"{who}: {total} boîte(s) — seule {seule}, partagée {partagee}")
print(f"  ⛔ item carné dans SA boîte                 : {sale}")
print(f"  ⚠️ items propres, PRÉPARATION citée carnée  : {propre_prep_carne}")
print(f"  ✅ items propres, préparation propre         : {propre}")
