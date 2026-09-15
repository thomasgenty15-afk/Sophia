#!/usr/bin/env python3
"""E2 — foyer de quatre, PRÉSENCES DIFFÉRENTES. Réponse SYNTHÉTIQUE (chemin
technique), montée d'après ce que le prompt du § 2.2 réclame vraiment :
un plat à eux pour CHAQUE repas QU'ILS PRENNENT ICI, et rien ailleurs."""
import json, copy, sys

base = json.load(open("scratchpad/2026-09-14-MATRICE-REJOUEE/E2-amorce-reponse.json", encoding="utf-8"))
PORTEURS = {
    "99e98f63-6413-475f-8292-4d0a24f4353b": ("Nils", ["lunch", "dinner"]),
    "8f52211f-3575-4e55-8831-35906038bfdf": ("Iris", ["breakfast", "lunch", "dinner"]),
}
JOURS = ["mon", "tue"]
PROPRES = {
  "breakfast": ("Œufs brouillés, pain complet et épinards", [
      ("œufs", "whole_eggs", 180), ("pain complet", "wholemeal_bread", 60),
      ("épinards", "spinach", 80), ("huile d'olive", "olive_oil", 6)],
      "Brouiller les œufs à feu doux avec les épinards, servir avec le pain complet grillé.", 149),
  "lunch": ("Poulet rôti, couscous complet et courgette", [
      ("blanc de poulet", "chicken_breast", 250), ("couscous complet", "couscous_wholemeal", 90),
      ("courgette", "courgette", 150), ("huile d'olive", "olive_oil", 10)],
      "Rôtir le blanc de poulet, gonfler le couscous, faire sauter la courgette et dresser.", 140),
  "dinner": ("Poulet, lentilles et tomate", [
      ("blanc de poulet", "chicken_breast", 220), ("lentilles", "lentils_cooked", 200),
      ("tomate", "tomato", 80), ("graines de courge", "pumpkin_seeds", 20),
      ("huile d'olive", "olive_oil", 15)],
      "Saisir le poulet, ajouter les lentilles et la tomate, mijoter, parsemer de graines.", 133),
}
plats = copy.deepcopy(base["dishes"])
besoins = {}
for mid, (prenom, slots) in PORTEURS.items():
    for jour in JOURS:
        for slot in slots:
            titre, lignes, methode, dens = PROPRES[slot]
            plats.append({
                "name": f"{titre} de {prenom} {jour}", "title": titre, "slot": slot,
                "day": jour, "for_member_id": mid,
                "ingredients": [{"term": t, "quantity": f"{a} g de {t}", "amount": a,
                                 "unit": "g", "state": "raw", "ref": r} for (t, r, a) in lignes],
                "method": methode,
                "why": "Une assiette à part, montée dans la même session que celle de la table.",
                "density_check": dens, "uses": [],
                "same_day": {"kind": "cook_fresh", "minutes": 12},
            })
            for (t, r, a) in lignes:
                besoins[r] = besoins.get(r, 0) + a

AISLE = {"whole_eggs": "protein", "chicken_breast": "protein", "wholemeal_bread": "bakery",
         "spinach": "produce", "courgette": "produce", "couscous_wholemeal": "pantry",
         "lentils_cooked": "pantry", "tomato": "produce", "pumpkin_seeds": "pantry",
         "olive_oil": "pantry"}
LABEL = {"whole_eggs": "œufs", "chicken_breast": "blanc de poulet",
         "wholemeal_bread": "pain complet", "spinach": "épinards", "courgette": "courgette",
         "couscous_wholemeal": "couscous complet", "lentils_cooked": "lentilles",
         "tomato": "tomate", "pumpkin_seeds": "graines de courge", "olive_oil": "huile d'olive"}
courses = copy.deepcopy(base["shopping_list"])
index = {c.get("ref"): c for c in courses}
for ref, g in besoins.items():
    if ref in index:
        index[ref]["amount"] = index[ref].get("amount", 0) + g
        index[ref]["quantity"] = f"{index[ref]['amount']} g"
    else:
        courses.append({"term": LABEL[ref], "ref": ref, "quantity": f"{g} g",
                        "amount": g, "unit": "g", "aisle": AISLE[ref]})
out = dict(base); out["dishes"] = plats; out["shopping_list"] = courses
out["explanation"] = [
  "La casserole de la table suit la ligne végane : c'est la ligne de la bouche la plus stricte.",
  "Nils et Iris reçoivent un plat à eux à chacun des repas qu'ils prennent ici — Nils déjeune et dîne, Iris prend les trois.",
]
json.dump(out, open("scratchpad/2026-09-14-MATRICE-REJOUEE/E2-reponse-n4.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print(f"{len(plats)} plats ({len(plats)-len(base['dishes'])} dédiés) · {len(courses)} lignes de courses")
