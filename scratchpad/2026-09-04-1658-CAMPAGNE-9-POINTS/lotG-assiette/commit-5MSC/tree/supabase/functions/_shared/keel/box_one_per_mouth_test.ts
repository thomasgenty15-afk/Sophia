// ⟳ LOT `L26-0` — UNE BOUCHE NE REÇOIT QU'UN CONTENANT PAR REPAS.
//
// ══════════════════════════════════════════════════════════════════════════
// ⛔ CE QUE CES ÉPREUVES PROTÈGENT, ET POURQUOI UN SEUL SEUIL NE SUFFIT PAS
// ══════════════════════════════════════════════════════════════════════════
// La fiche du lot portait un seuil à UN nombre — « `mouths_double` = 0 ». Il
// est FAUX tout seul, et dangereusement: retirer la bouche des DEUX couvercles
// rend `mouths_double = 0` en laissant une adolescente sans rien à table. Les
// deux compteurs se lisent ENSEMBLE, donc les deux s'éprouvent ensemble:
//
//     `double` tombe à 0    ET    `unboxed` NE MONTE PAS.
//
// `mouthCensus()` ci-dessous recompte les deux exactement comme la boucle de
// `meal_generation.ts` (case = `jour/moment`, un nom compté une fois par
// couvercle), et CHAQUE épreuve les lit AVANT et APRÈS dans la même passe.
//
// ⛔ LES DEUX MUTATIONS QUE CES ÉPREUVES DOIVENT FAIRE ROUGIR, ET ELLES ONT ÉTÉ
// EXÉCUTÉES (`/private/tmp/.../L26-0-mut/`, copie hors dépôt, non mutée vérifiée
// verte d'abord):
//
//   M1 — l'arête désarmée (`keepOneBoxPerMouth` rend l'entrée telle quelle).
//        La bouche reste servie deux fois. ROUGE attendu.
//   M2 — l'arête qui DÉSHABILLE (elle retire le nom de TOUS les couvercles au
//        lieu d'en garder un). `double` tombe bien à 0 — et `unboxed` monte.
//        ROUGE attendu, et c'est la mutation la plus importante du lot: c'est
//        elle qui distingue une correction d'une régression déguisée en
//        succès.
//
// ══════════════════════════════════════════════════════════════════════════
// LA FORME ÉPROUVÉE EST CELLE QUI A ÉTÉ MESURÉE, PAS UNE FORME INVENTÉE
// ══════════════════════════════════════════════════════════════════════════
// `3eae73ac` / `sun/lunch`, 2026-08-22, à l'identifiant près: un plat commun
// qui porte le bac de la table ET un bac nominatif pour Anouk, plus le plat qui
// lui est dédié et qui porte le sien. Quatorze doublons sur les dix plans neufs
// ont TOUS cette forme.

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  boxCellKey,
  keepOneBoxPerMouth,
  type OneBoxDish,
  type OneBoxLid,
} from "./box_one_per_mouth.ts";

const CAMILLE = "f906405b-8346-49a3-9dd8-ea924e43a166";
const MALO = "cfc3b288-371f-4c42-b6db-592eefddfa14";
const YANIS = "97318cc9-e973-4750-bc7e-a6da801c2ca9";
/** ⚠️ La MINEURE (née 2011) — c'est elle qui est servie deux fois, 14/14. */
const ANOUK = "fa68cbac-6874-4b65-8fe7-5f4b2e0a24c7";
const ROSTER = [CAMILLE, MALO, YANIS, ANOUK];

type Dish = OneBoxDish<OneBoxLid>;

const lid = (id: string, memberIds: string[]): OneBoxLid => ({ id, memberIds });

/**
 * LES DEUX COMPTEURS, RECOMPTÉS COMME LE PARSEUR LES COMPTE.
 *
 * ⚠️ Recopie délibérée de la boucle de `meal_generation.ts`: la case est
 * `jour/moment`, le dénominateur est le roster, et un nom vaut UNE fois par
 * couvercle. Un helper qui compterait autrement rendrait ces épreuves vertes
 * sur une propriété que le produit ne tient pas.
 */
function mouthCensus(
  dishes: readonly { day: string | null; slot: string | null; boxes: OneBoxLid[] }[],
  roster: readonly string[],
): { slots: number; unboxed: number; double: number } {
  const cells = new Map<string, Map<string, number>>();
  for (const dish of dishes) {
    if (dish.boxes.length === 0) continue;
    const key = boxCellKey(dish.day, dish.slot);
    const byMouth = cells.get(key) ?? new Map<string, number>();
    for (const box of dish.boxes) {
      const seen = new Set<string>();
      for (const memberId of box.memberIds) {
        if (seen.has(memberId)) continue;
        seen.add(memberId);
        byMouth.set(memberId, (byMouth.get(memberId) ?? 0) + 1);
      }
    }
    cells.set(key, byMouth);
  }
  let slots = 0;
  let unboxed = 0;
  let double = 0;
  for (const byMouth of cells.values()) {
    slots += roster.length;
    for (const memberId of roster) {
      const inBoxes = byMouth.get(memberId) ?? 0;
      if (inBoxes === 1) continue;
      if (inBoxes === 0) unboxed++;
      else double++;
    }
  }
  return { slots, unboxed, double };
}

/** La case mesurée, telle quelle. */
function measuredCell(day: string): Dish[] {
  return [
    {
      day,
      slot: "lunch",
      memberId: null,
      boxes: [
        lid(`box_${day}_lunch_shared`, [CAMILLE, MALO, YANIS]),
        lid(`box_${day}_lunch_anouk`, [ANOUK]),
      ],
    },
    {
      day,
      slot: "lunch",
      memberId: ANOUK,
      boxes: [lid(`box_${day}_lunch_anouk_own`, [ANOUK])],
    },
  ];
}

/** Les couvercles APRÈS, remis sur les plats — ce que fait l'appelant. */
function applied(dishes: readonly Dish[]): Dish[] {
  const outcome = keepOneBoxPerMouth(dishes);
  return dishes.map((dish, d) => ({ ...dish, boxes: outcome.boxesByDish[d] }));
}

// ══════════════════════════════════════════════════════════════════════════
// ① LE CAS QUI MORD — la forme mesurée, et les DEUX compteurs
// ══════════════════════════════════════════════════════════════════════════
Deno.test("L26-0 ① la bouche servie deux fois n'a plus qu'un contenant -- et elle en a un", () => {
  const before = measuredCell("sun");
  const censusBefore = mouthCensus(before, ROSTER);
  // La prémisse de l'épreuve: sans elle, ce test passerait sur un cas sain et
  // ressemblerait à une garde qui marche.
  assertEquals(censusBefore.double, 1, "prémisse: la bouche EST servie deux fois");
  assertEquals(censusBefore.unboxed, 0, "prémisse: personne n'est oublié avant");

  const after = applied(before);
  const censusAfter = mouthCensus(after, ROSTER);

  // ⛔ LES DEUX ENSEMBLE. Le premier seul est satisfait par « on retire tout ».
  assertEquals(censusAfter.double, 0, "plus aucune bouche sur deux couvercles");
  assertEquals(
    censusAfter.unboxed,
    censusBefore.unboxed,
    "⛔ personne n'a été déshabillé en retirant le doublon",
  );
  assertEquals(censusAfter.slots, censusBefore.slots, "le dénominateur ne bouge pas");
});

Deno.test("L26-0 ① le contenant gardé est celui du plat DÉDIÉ, pas celui du pot commun", () => {
  const outcome = keepOneBoxPerMouth(measuredCell("sun"));
  assertEquals(outcome.removals.length, 1);
  const [removal] = outcome.removals;
  assertEquals(removal.cell, "sun/lunch");
  assertEquals(removal.memberId, ANOUK);
  assertEquals(removal.boxId, "box_sun_lunch_anouk", "le bac posé sur le plat COMMUN tombe");
  assertEquals(removal.keptBoxId, "box_sun_lunch_anouk_own", "celui du plat dédié reste");
  assertEquals(removal.reason, "dedicated_dish");
  assertEquals(removal.namedOn, 2);
  assertEquals(outcome.mouthsFixed, 1);
});

Deno.test("L26-0 ① le couvercle vidé de son dernier nom tombe, et lui seul", () => {
  const outcome = keepOneBoxPerMouth(measuredCell("sun"));
  assertEquals(outcome.dropped, [{ cell: "sun/lunch", boxId: "box_sun_lunch_anouk" }]);
  // Le bac de la table garde ses trois noms, intacts et dans l'ordre.
  assertEquals(outcome.boxesByDish[0].length, 1);
  assertEquals(outcome.boxesByDish[0][0].memberIds, [CAMILLE, MALO, YANIS]);
  assertEquals(outcome.boxesByDish[1][0].memberIds, [ANOUK]);
});

// ══════════════════════════════════════════════════════════════════════════
// ② LE CAS QUI PASSE — sans quoi la garde est un refus déguisé
// ══════════════════════════════════════════════════════════════════════════
Deno.test("L26-0 ② un plan sans plat dédié n'est pas touché -- par identité", () => {
  const dishes: Dish[] = [
    {
      day: "mon",
      slot: "dinner",
      memberId: null,
      boxes: [lid("box_mon_dinner_shared", [CAMILLE, MALO, YANIS, ANOUK])],
    },
    {
      day: "tue",
      slot: "lunch",
      memberId: null,
      boxes: [lid("box_tue_lunch_veg", [YANIS]), lid("box_tue_lunch_rest", [CAMILLE, MALO, ANOUK])],
    },
  ];
  const before = mouthCensus(dishes, ROSTER);
  const outcome = keepOneBoxPerMouth(dishes);
  assertEquals(outcome.removals, []);
  assertEquals(outcome.dropped, []);
  assertEquals(outcome.namesRemoved, 0);
  assertEquals(outcome.mouthsFixed, 0);
  // ⚠️ IDENTITÉ, pas égalité: un plat que rien ne touche rend SON tableau.
  assert(outcome.boxesByDish[0] === dishes[0].boxes);
  assert(outcome.boxesByDish[1] === dishes[1].boxes);
  const after = mouthCensus(applied(dishes), ROSTER);
  assertEquals(after, before);
});

Deno.test("L26-0 ② deux couvercles au même repas pour deux bouches DIFFÉRENTES restent", () => {
  const dishes: Dish[] = [
    {
      day: "wed",
      slot: "dinner",
      memberId: null,
      boxes: [lid("box_wed_dinner_shared", [CAMILLE, YANIS])],
    },
    { day: "wed", slot: "dinner", memberId: MALO, boxes: [lid("box_wed_dinner_malo", [MALO])] },
    { day: "wed", slot: "dinner", memberId: ANOUK, boxes: [lid("box_wed_dinner_anouk", [ANOUK])] },
  ];
  const census = mouthCensus(dishes, ROSTER);
  assertEquals(census, { slots: 4, unboxed: 0, double: 0 });
  const outcome = keepOneBoxPerMouth(dishes);
  assertEquals(outcome.removals, []);
  assertEquals(mouthCensus(applied(dishes), ROSTER), census);
});

// ══════════════════════════════════════════════════════════════════════════
// ③ LA MOITIÉ QUI PROTÈGE — la bouche n'est JAMAIS déshabillée
// ══════════════════════════════════════════════════════════════════════════
Deno.test("L26-0 ③ toute bouche nommée avant est encore nommée après -- sur six cases", () => {
  // Six jours × deux repas, la forme exacte du plan `3c781a71` (12/12 repas).
  const dishes: Dish[] = [];
  for (const day of ["sat", "sun", "mon", "tue", "wed", "thu"]) {
    for (const slot of ["lunch", "dinner"]) {
      dishes.push({
        day,
        slot,
        memberId: null,
        boxes: [
          lid(`box_${day}_${slot}_shared`, [CAMILLE, MALO, YANIS]),
          lid(`box_${day}_${slot}_anouk`, [ANOUK]),
        ],
      });
      dishes.push({
        day,
        slot,
        memberId: ANOUK,
        boxes: [lid(`box_${day}_${slot}_anouk_own`, [ANOUK])],
      });
    }
  }
  const before = mouthCensus(dishes, ROSTER);
  assertEquals(before.double, 12, "prémisse: les douze repas du plan mesuré");
  assertEquals(before.unboxed, 0);

  const after = mouthCensus(applied(dishes), ROSTER);
  assertEquals(after.double, 0);
  assertEquals(after.unboxed, 0, "⛔ douze doublons retirés, zéro bouche perdue");
  assertEquals(after.slots, before.slots);
});

Deno.test("L26-0 ③ la propriété bilatérale, case par case et bouche par bouche", () => {
  // Un jeu volontairement tordu: bacs qui se chevauchent, plat dédié, plat sans
  // moment, nom répété sur le même couvercle.
  const dishes: Dish[] = [
    {
      day: "fri",
      slot: "lunch",
      memberId: null,
      boxes: [
        lid("a", [CAMILLE, MALO, ANOUK]),
        lid("b", [ANOUK, YANIS]),
        lid("c", [MALO, MALO]),
      ],
    },
    { day: "fri", slot: "lunch", memberId: ANOUK, boxes: [lid("d", [ANOUK])] },
    { day: "fri", slot: null, memberId: null, boxes: [lid("e", [CAMILLE, YANIS])] },
    { day: null, slot: null, memberId: null, boxes: [lid("f", [CAMILLE]), lid("g", [CAMILLE])] },
  ];
  const namedBefore = new Map<string, Set<string>>();
  for (const dish of dishes) {
    const key = boxCellKey(dish.day, dish.slot);
    const seen = namedBefore.get(key) ?? new Set<string>();
    for (const box of dish.boxes) for (const m of box.memberIds) seen.add(m);
    namedBefore.set(key, seen);
  }
  const after = applied(dishes);
  const countAfter = new Map<string, Map<string, number>>();
  for (const dish of after) {
    const key = boxCellKey(dish.day, dish.slot);
    const byMouth = countAfter.get(key) ?? new Map<string, number>();
    for (const box of dish.boxes) {
      for (const m of new Set(box.memberIds)) byMouth.set(m, (byMouth.get(m) ?? 0) + 1);
    }
    countAfter.set(key, byMouth);
  }
  for (const [cell, mouths] of namedBefore) {
    for (const m of mouths) {
      const n = countAfter.get(cell)?.get(m) ?? 0;
      assertEquals(n, 1, `${cell}: ${m} doit être sur EXACTEMENT un couvercle, pas ${n}`);
    }
  }
  // Aucun couvercle gardé ne peut être vide.
  for (const dish of after) {
    for (const box of dish.boxes) assert(box.memberIds.length > 0, `${box.id} est vide`);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ④ LES TROIS RÈGLES DE DÉPARTAGE, CHACUNE SUR SON CAS
// ══════════════════════════════════════════════════════════════════════════
Deno.test("L26-0 ④ sans plat dédié, le couvercle où la bouche est SEULE gagne", () => {
  const dishes: Dish[] = [
    {
      day: "sat",
      slot: "dinner",
      memberId: null,
      boxes: [lid("shared", [CAMILLE, MALO, ANOUK]), lid("anouk", [ANOUK])],
    },
  ];
  const outcome = keepOneBoxPerMouth(dishes);
  assertEquals(outcome.removals.length, 1);
  assertEquals(outcome.removals[0].boxId, "shared");
  assertEquals(outcome.removals[0].keptBoxId, "anouk");
  assertEquals(outcome.removals[0].reason, "alone_on_the_lid");
  // ⚠️ AUCUN couvercle ne tombe ici: le bac commun garde Camille et Malo.
  assertEquals(outcome.dropped, []);
  assertEquals(outcome.boxesByDish[0][0].memberIds, [CAMILLE, MALO]);
});

Deno.test("L26-0 ④ deux bacs partagés: le premier dans l'ordre du document gagne", () => {
  const dishes: Dish[] = [
    {
      day: "sat",
      slot: "lunch",
      memberId: null,
      boxes: [lid("first", [CAMILLE, ANOUK]), lid("second", [ANOUK, YANIS])],
    },
  ];
  const outcome = keepOneBoxPerMouth(dishes);
  assertEquals(outcome.removals.length, 1);
  assertEquals(outcome.removals[0].keptBoxId, "first");
  assertEquals(outcome.removals[0].reason, "first_in_order");
  assertEquals(outcome.boxesByDish[0][0].memberIds, [CAMILLE, ANOUK]);
  assertEquals(outcome.boxesByDish[0][1].memberIds, [YANIS]);
});

Deno.test("L26-0 ④ le plat dédié gagne MÊME quand la bouche est seule ailleurs", () => {
  // Le brief le dit: « These people cannot be fed from the shared pot ».
  const dishes: Dish[] = [
    { day: "sun", slot: "dinner", memberId: null, boxes: [lid("shared_solo", [ANOUK])] },
    { day: "sun", slot: "dinner", memberId: ANOUK, boxes: [lid("own", [ANOUK, MALO])] },
  ];
  const outcome = keepOneBoxPerMouth(dishes);
  assertEquals(outcome.removals[0].keptBoxId, "own");
  assertEquals(outcome.removals[0].reason, "dedicated_dish");
});

// ══════════════════════════════════════════════════════════════════════════
// ⑤ LES BORDS QUI ONT DÉJÀ COÛTÉ AILLEURS
// ══════════════════════════════════════════════════════════════════════════
Deno.test("L26-0 ⑤ deux cases différentes ne se mélangent jamais", () => {
  const dishes: Dish[] = [
    { day: "mon", slot: "lunch", memberId: null, boxes: [lid("x", [ANOUK])] },
    { day: "mon", slot: "dinner", memberId: null, boxes: [lid("y", [ANOUK])] },
    { day: "tue", slot: "lunch", memberId: null, boxes: [lid("z", [ANOUK])] },
  ];
  const outcome = keepOneBoxPerMouth(dishes);
  assertEquals(outcome.removals, []);
  assertEquals(outcome.mouthsFixed, 0);
});

Deno.test("L26-0 ⑤ un nom deux fois sur le MÊME couvercle n'est pas un doublon de case", () => {
  // La porte ② du parseur l'a déjà refusé; ce module ne doit pas « corriger »
  // une seconde fois et retirer la bouche d'un bac où elle est seule.
  const dishes: Dish[] = [
    { day: "wed", slot: "lunch", memberId: null, boxes: [lid("x", [ANOUK, ANOUK])] },
  ];
  const outcome = keepOneBoxPerMouth(dishes);
  assertEquals(outcome.removals, []);
  assertEquals(outcome.dropped, []);
  assert(outcome.boxesByDish[0] === dishes[0].boxes);
});

Deno.test("L26-0 ⑤ un plat sans couvercle, et un plan sans aucun couvercle", () => {
  assertEquals(keepOneBoxPerMouth([]).removals, []);
  const dishes: Dish[] = [{ day: "thu", slot: "lunch", memberId: null, boxes: [] }];
  const outcome = keepOneBoxPerMouth(dishes);
  assertEquals(outcome.boxesByDish, [[]]);
  assertEquals(outcome.namesRemoved, 0);
});

Deno.test("L26-0 ⑤ aucun gramme n'est touché -- seuls les noms bougent", () => {
  type FatLid = OneBoxLid & { items: { term: string; grams: number }[] };
  const shared: FatLid = {
    id: "shared",
    memberIds: [CAMILLE, ANOUK],
    items: [{ term: "lentilles", grams: 1350 }],
  };
  const own: FatLid = {
    id: "own",
    memberIds: [ANOUK],
    items: [{ term: "poulet", grams: 331 }],
  };
  const dishes: OneBoxDish<FatLid>[] = [
    { day: "sun", slot: "lunch", memberId: null, boxes: [shared] },
    { day: "sun", slot: "lunch", memberId: ANOUK, boxes: [own] },
  ];
  const outcome = keepOneBoxPerMouth(dishes);
  assertEquals(outcome.boxesByDish[0][0].items, [{ term: "lentilles", grams: 1350 }]);
  assertEquals(outcome.boxesByDish[0][0].memberIds, [CAMILLE]);
  assertEquals(outcome.boxesByDish[1][0].items, [{ term: "poulet", grams: 331 }]);
  // ⚠️ L'entrée n'est pas mutée: `generated_from` doit pouvoir dire ce que le
  // MODÈLE a rendu, pas ce que l'arête en a fait.
  assertEquals(shared.memberIds, [CAMILLE, ANOUK]);
});
