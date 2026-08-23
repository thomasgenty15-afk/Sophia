#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
L'ESTIMATION DE PROTÉINE, PAR BOUCHE ET PAR REPAS — MON INSTRUMENT, PAS CELUI
DU PRODUIT.

⚠️ CE N'EST PAS UNE SORTIE DU PRODUIT ET ÇA NE DOIT JAMAIS Y ENTRER. Le plan
n'écrit aucun chiffre de nutriment, et c'est la règle. Ceci est le regard du
DIÉTÉTICIEN sur un plan déjà écrit : sans un ordre de grandeur, « la protéine
est-elle répartie ou concentrée ? » n'a pas de réponse vérifiable.

⚠️ TABLE OUVERTE, APPARIEMENT PAR TERME EXACT DÉCLARÉ. Aucun devinement : un
terme d'ingrédient qui n'est pas dans la table ci-dessous est IMPRIMÉ comme
non apparié et compte ZÉRO. Un total est donc toujours un PLANCHER, jamais un
verdict — et la liste des non-appariés est rendue à chaque exécution pour que
personne ne prenne un zéro pour une mesure.

  ./proteine.py plan-1 plan-2 ...
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from analyse import load, names, box_index, plates, away_map

# g de protéine pour 100 g de l'ingrédient TEL QU'ACHETÉ (état `raw` du plan).
# Sources: valeurs de table usuelles, arrondies. L'incertitude est de l'ordre
# de ±15 % et n'change aucune des conclusions de ce lot.
PROTEIN_PER_100G = {
    "red lentils": 24.0, "lentils": 24.0,
    "tinned chickpeas": 7.0, "chickpeas": 7.0,
    "boneless chicken thighs": 18.0, "chicken thighs": 18.0,
    "chicken thighs, boneless/skinless": 18.0,
    "tinned tuna in brine": 24.0,
    "basmati rice": 8.0, "brown rice": 8.0, "rice": 8.0,
    "quinoa": 14.0,
    "sweet potatoes": 1.6, "sweet potato": 1.6, "potatoes": 2.0,
    "coconut milk": 2.0,
    "green beans": 1.8, "red peppers": 1.0, "peppers": 1.0,
    "fresh spinach": 2.9, "fresh baby spinach": 2.9, "baby spinach": 2.9,
    "mixed salad leaves": 1.5, "avocados": 2.0, "avocado": 2.0,
    "cherry tomatoes": 0.9, "tomatoes": 0.9,
    "onions": 1.1, "garlic": 6.0, "lemon": 0.0, "lemon wedge": 0.0,
    "olive oil": 0.0, "vegetable oil": 0.0,
    "sunflower seeds": 21.0, "fresh coriander": 0.0, "fresh thyme": 0.0,
    "ground turmeric": 0.0, "ground cumin": 0.0, "black pepper": 0.0,
    "turmeric, cumin, and ginger": 0.0, "dried oregano": 0.0,
    "tofu": 12.0, "firm tofu": 14.0, "tempeh": 19.0,
    "butter beans": 7.0, "kidney beans": 8.0, "black beans": 8.0,
    "eggs": 12.0, "greek yogurt": 9.0, "natural yogurt": 5.0,
    "onion": 1.1, "bell peppers": 1.0, "bell pepper": 1.0,
    "garlic cloves": 6.0, "spinach": 2.9, "cumin": 0.0, "turmeric": 0.0,
    "courgette": 1.2, "courgettes": 1.2, "carrots": 0.8, "broccoli": 2.8,
    "kale": 3.3, "chickpea": 7.0, "butternut squash": 1.0,
    "tinned tomatoes": 1.3, "passata": 1.2, "vegetable stock": 0.0,
    "salt": 0.0, "black pepper": 0.0, "chilli flakes": 0.0, "ginger": 1.8,
    "peanut butter": 25.0, "cashews": 18.0, "walnuts": 15.0,
}

# ⚠️ UNE SEULE NORMALISATION, ET ELLE EST DÉCLARÉE : le modèle écrit
# « chicken thighs, sliced » là où il écrivait « chicken thighs ». On coupe à
# la PREMIÈRE VIRGULE et on réessaie — rien d'autre. Aucune racine, aucun
# pluriel deviné, aucun préfixe : « laitue » ne doit jamais devenir « lait ».
def lookup(term):
    if term in PROTEIN_PER_100G:
        return PROTEIN_PER_100G[term]
    head = term.split(",")[0].strip()
    if head != term and head in PROTEIN_PER_100G:
        return PROTEIN_PER_100G[head]
    return None

unmatched = set()
fallback = set()


def prep_protein_ratio(prep):
    """g de protéine par g de nourriture PRÊTE, pour une préparation."""
    total_p = 0.0
    for ing in prep.get("ingredients") or []:
        term = str(ing.get("term") or "").strip().lower()
        # ⚠️ `grams_raw` EST NUL SUR DES LIGNES QUI PORTENT « 750 g ». Il n'est
        # rempli que si le TERME se résout dans le référentiel de composition
        # (`readStructuredQuantity`, meal_generation.ts:3352-3362) — « chicken
        # thighs, boneless/skinless » ne s'y résout pas, « boneless chicken
        # thighs » oui. On retombe donc sur `amount` quand l'unité est le
        # gramme, et on le DIT.
        g = ing.get("grams_raw")
        if not isinstance(g, (int, float)):
            if str(ing.get("unit") or "").lower() == "g" and isinstance(ing.get("amount"), (int, float)):
                g = ing["amount"]
                fallback.add(term)
            else:
                continue
        v = lookup(term)
        if v is None:
            unmatched.add(term)
            continue
        total_p += v * g / 100.0
    made = prep.get("servings_made")
    boxes = prep.get("boxes") or []
    if not boxes:
        return None
    # Le poids PRÊT total ≈ servings_made × la boîte MOYENNE. La première boîte
    # seule biaiserait la casserole quand les boîtes diffèrent d'un facteur 2.
    gs = [b.get("grams") for b in boxes if isinstance(b.get("grams"), (int, float))]
    if not gs or not isinstance(made, int) or made <= 0:
        return None
    ready_total = made * (sum(gs) / len(gs))
    if ready_total <= 0:
        return None
    return total_p / ready_total


for run in sys.argv[1:]:
    d = load(run)
    plan = d["plan"]
    if not plan or not plan.get("dishes"):
        print(f"### {run}: aucun plan")
        continue
    roster = names(d["inputs"])
    bidx = box_index(plan)
    away = away_map(d["inputs"])
    pl, slots = plates(plan, roster, away)
    ratios = {p.get("id"): prep_protein_ratio(p) for p in plan.get("preparations") or []}
    mine = {}
    for p in plan.get("preparations") or []:
        for b in p.get("boxes") or []:
            for m in b.get("member_ids") or []:
                mine.setdefault((m, p.get("id")), b.get("grams"))
    print(f"\n### {run} — protéine ESTIMÉE (plancher), par bouche et par repas")
    for mid, nm in roster.items():
        per_meal, tot = [], 0.0
        for (day, slot) in slots:
            ds = pl.get((mid, day, slot))
            if ds == "OUT":
                per_meal.append(f"{day}/{slot[:3]}=dehors")
                continue
            g = 0.0
            # ⚠️ LE PLAT CITE UNE SEULE BOÎTE PAR PRÉPARATION (souvent celle
            # d'une autre bouche). Ce qu'une bouche mange, c'est SA boîte de la
            # préparation que le plat utilise — c'est aussi ce que
            # `attachSizedQuantities` recolle dans la phrase.
            seen = set()
            for x in (ds or []):
                for u in x.get("uses") or []:
                    b = bidx.get(u.get("box_id"))
                    if not b or b[0] in seen:
                        continue
                    seen.add(b[0])
                    own = mine.get((mid, b[0]))
                    if own is None:
                        continue
                    r = ratios.get(b[0])
                    if r is None:
                        continue
                    g += r * own
            tot += g
            per_meal.append(f"{day}/{slot[:3]}={g:.0f}g")
        print(f"   {nm:7s} {' · '.join(per_meal)}   TOTAL fenêtre ≈ {tot:.0f} g")
    if fallback:
        print(f"   ⚠️ `grams_raw` NUL, replié sur `amount` en g: {sorted(fallback)}")
        fallback.clear()
    if unmatched:
        print(f"   ⚠️ termes NON APPARIÉS (comptés zéro): {sorted(unmatched)}")
        unmatched.clear()
