#!/usr/bin/env python3
# Branche perBox (APRÈS dimensionnement) → tubServed → unmetDemand dans l'index foyer.
import io
P = "supabase/functions/generate-household-meal-v1/index.ts"
s = io.open(P, encoding="utf-8").read()
old = "    const unmet = unmetDemand(mouthAnchors, dayEnergyRows, potShrink);"
assert s.count(old) == 1, s.count(old)
new = '''    // ⟳ 2026-09-06 — LA JOURNÉE « BAC COMMUN SEUL » ENTRE DANS LE COMPTEUR.
    // Mesuré sur le quatre (C03 02:10) : 14 journées-bouche sur 21 sortaient
    // `not_anchored` — trois personnes sur quatre mangeaient dans des bacs et
    // leur manque n'existait pour aucun compteur. Le servi est ESTIMÉ ici :
    // Σ kcal des bacs de la journée (relus APRÈS dimensionnement, sur les
    // grammes que le bac porte vraiment) / leurs mangeurs. Un bac illisible
    // rend `null`, jamais zéro. Jamais un chiffre au nom de quelqu'un sur un
    // couvercle (v4), jamais un facteur : `unmetDemand` ne s'en sert que pour
    // la cause `tub_estimate`, sur les journées `common_pot_day`.
    const tubServed = new Map<string, number | null>();
    if (composition) {
      const sizedBoxes = boxEnergies({
        index: composition,
        dishes: meal.dishes.map((dish) => ({
          day: dish.day,
          method: dish.method,
          slot: dish.slot,
          ingredients: dish.ingredients,
          uses: dish.uses,
          boxes: dish.boxes,
        })),
        preparations: meal.preparations.map((prep) => ({
          id: prep.id,
          servingsMade: prep.servingsMade,
          ingredients: prep.ingredients,
          method: prep.method,
        })),
      });
      for (const box of sizedBoxes) {
        if (box.memberIds.length < 2) continue;
        for (const memberId of box.memberIds) {
          const key = `${memberId} ${box.day ?? ""}`;
          const prev = tubServed.get(key);
          if (prev === null) continue;
          tubServed.set(
            key,
            box.kcal === null ? null : (prev ?? 0) + box.kcal / box.memberIds.length,
          );
        }
      }
    }
    const unmet = unmetDemand(mouthAnchors, dayEnergyRows, potShrink, tubServed);'''
s = s.replace(old, new)
io.open(P, "w", encoding="utf-8").write(s)
print("index: tubServed branché")
