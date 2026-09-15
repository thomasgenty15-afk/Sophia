#!/usr/bin/env python3
"""
LIGNE E — LA VARIANTE DE RÉGIME, MONTÉE POUR DE BON.

⛔ CE QUE CE SCRIPT N'EST PAS : un appel fournisseur. Il assemble une RÉPONSE
   SYNTHÉTIQUE, c'est-à-dire une preuve de CHEMIN TECHNIQUE. Il ne dit rien de
   ce qu'un nouveau prompt ferait produire au modèle.

⛔ POURQUOI IL FAUT L'ÉCRIRE. Toutes les réponses archivées de la matrice
   adressent leur plat dédié À LA VÉGANE (l'ancienne décision). Depuis le
   § 2.2 la végane PORTE la ligne : elle n'est plus porteuse de plat, donc
   `for_member_id` est refusé, le plat retombe sur la table et la case sert
   deux fois. Aucune réponse archivée ne peut donc MONTRER la ligne E.

   On écrit ici la réponse que le prompt du § 2.2 réclame : le plat de la
   table suit la ligne végane, et LA BOUCHE QUI DIVERGE reçoit un plat à elle
   à chacun de ses repas — un plat qui a le droit d'utiliser ce que la base
   commune laisse dehors (ici : œufs et volaille).
"""
import json, sys, copy

base = json.load(open(sys.argv[1], encoding="utf-8"))
porteur = sys.argv[2]          # member_id de la bouche qui reçoit un plat à elle
prenom = sys.argv[3]
sortie = sys.argv[4]

JOURS = ["mon", "tue"]

def ing(term, ref, amount, aisle=None):
    return {"term": term, "quantity": f"{amount} g de {term}", "amount": amount,
            "unit": "g", "state": "raw", "ref": ref}

# Les trois plats À LUI, un par moment. La protéine est ANIMALE : c'est très
# exactement ce que la base végane laisse dehors, et c'est la seule façon de
# voir si la ceinture de régime tient la ligne de l'autre bouche.
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
      "Saisir le poulet, ajouter les lentilles et la tomate, mijoter dix minutes, parsemer de graines.", 133),
}

plats = copy.deepcopy(base["dishes"])
for jour in JOURS:
    for slot, (titre, lignes, methode, dens) in PROPRES.items():
        plats.append({
            "name": f"{titre} de {prenom} {jour}",
            "title": titre,
            "slot": slot,
            "day": jour,
            "for_member_id": porteur,
            "ingredients": [ing(t, r, a) for (t, r, a) in lignes],
            "method": methode,
            "why": "Une assiette à part, montée dans la même session que celle de la table.",
            "density_check": dens,
            "uses": [],
            "same_day": {"kind": "cook_fresh", "minutes": 12},
        })

# ── LES COURSES : chaque ligne neuve est ACHETÉE, sinon `ingredient_not_bought`
AISLE = {"whole_eggs": "protein", "chicken_breast": "protein",
         "wholemeal_bread": "bakery", "spinach": "produce", "courgette": "produce",
         "couscous_wholemeal": "pantry", "lentils_cooked": "pantry",
         "tomato": "produce", "pumpkin_seeds": "pantry", "olive_oil": "pantry"}
LABEL = {"whole_eggs": "œufs", "chicken_breast": "blanc de poulet",
         "wholemeal_bread": "pain complet", "spinach": "épinards",
         "courgette": "courgette", "couscous_wholemeal": "couscous complet",
         "lentils_cooked": "lentilles", "tomato": "tomate",
         "pumpkin_seeds": "graines de courge", "olive_oil": "huile d'olive"}

besoins = {}
for p in plats:
    if p.get("for_member_id") != porteur:
        continue
    for g in p["ingredients"]:
        besoins[g["ref"]] = besoins.get(g["ref"], 0) + g["amount"]

courses = copy.deepcopy(base["shopping_list"])
index = {c.get("ref"): c for c in courses}
for ref, grammes in besoins.items():
    if ref in index:
        index[ref]["amount"] = index[ref].get("amount", 0) + grammes
        index[ref]["quantity"] = f"{index[ref]['amount']} g"
    else:
        courses.append({"term": LABEL[ref], "ref": ref, "quantity": f"{grammes} g",
                        "amount": grammes, "unit": "g", "aisle": AISLE[ref]})

out = dict(base)
out["dishes"] = plats
out["shopping_list"] = courses
out["explanation"] = [
    "La casserole de la table suit la ligne végane, celle de la bouche la plus stricte.",
    f"{prenom} reçoit un plat à lui à chaque repas : son contrat de service ne sort pas "
    "de cette casserole, et ce plat-là a le droit d'utiliser ce qu'elle laisse dehors.",
]
json.dump(out, open(sortie, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{sortie} · {len(plats)} plats ({len(plats)-len(base['dishes'])} dédiés à {prenom}) · "
      f"{len(courses)} lignes de courses")
