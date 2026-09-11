// ═══════════════════════════════════════════════════════════════════════════
// KEEL · LE PLANCHER DU BUDGET — CE QUE CES CAS PROUVENT, ET CE QU'ILS NE
// PROUVENT PAS.
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ CE FICHIER NE VÉRIFIE PAS LES PRIX. Les six paniers ont été mesurés sur la
// grille du dépôt le 2026-09-11, et la requête entière est archivée dans
// `scratchpad/2026-09-11-PLANCHER-BUDGET/mesure.sql` avec sa sortie. Un test
// unitaire qui rejouerait la mesure aurait besoin de la base; ce qu'il peut
// garder, lui, c'est que les nombres RESTENT ceux qui ont été mesurés
// (`constant_pins_test.ts`) et que la RÈGLE qui s'appuie dessus est juste.
//
// ⛔ ET IL NE PROUVE AUCUN COÛT DE PLAN. Le plancher borne une SAISIE; ce qu'un
// plan coûte vraiment se compte dans `meal_cost.ts`, s'abstient dès qu'une
// ligne manque, et ne se rapproche pas de ce module.
// ═══════════════════════════════════════════════════════════════════════════

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  assessBudget,
  BUDGET_FLOOR_PER_MOUTH_DAY,
  BUDGET_PLAUSIBLE_PER_MOUTH_DAY,
  budgetBoundsFor,
  budgetDietOf,
  budgetMarketFor,
  budgetMouthDays,
} from "./budget_floor.ts";
import { COST_MARKETS } from "./meal_cost.ts";
import { DIETARY_REGIMES } from "./dietary_regime.ts";

const THREE_MEALS = ["breakfast", "lunch", "dinner"] as const;

/** Sept jours de rythme complet, pour une bouche. */
function fullWeek(): { declaredSlots: readonly string[]; askedSlots: readonly string[] }[] {
  return Array.from({ length: 7 }, () => ({
    declaredSlots: [...THREE_MEALS],
    askedSlots: [...THREE_MEALS],
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LES DEUX TABLES COUVRENT LES DEUX LISTES FERMÉES, ET RIEN DE PLUS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("① les tables couvrent CHAQUE marché et CHAQUE régime, plus l'omnivore", () => {
  // ⚠️ LU À L'EXÉCUTION, pas recopié. Le typage rend déjà l'oubli impossible à
  // la compilation; ce cas garde l'autre sens — une ligne EN TROP, qu'aucun
  // `Record` ne verrait, et qui désignerait un régime que le produit n'exécute
  // pas.
  const attendus = [...DIETARY_REGIMES, "omnivore"].sort();
  for (const market of COST_MARKETS) {
    assertEquals(
      Object.keys(BUDGET_FLOOR_PER_MOUTH_DAY[market]).sort(),
      attendus,
      `plancher · ${market}`,
    );
    assertEquals(
      Object.keys(BUDGET_PLAUSIBLE_PER_MOUTH_DAY[market]).sort(),
      attendus,
      `seuil · ${market}`,
    );
  }
});

Deno.test("① le seuil de ce qu'on DIT est toujours au-dessus du plancher qui REFUSE", () => {
  // Un seuil d'explication SOUS le plancher de refus rendrait la bande
  // « serré » vide: on refuserait sans jamais expliquer, et la moitié douce du
  // module serait morte sans qu'un seul test bouge.
  for (const market of COST_MARKETS) {
    for (const diet of [...DIETARY_REGIMES, "omnivore"] as const) {
      assert(
        BUDGET_PLAUSIBLE_PER_MOUTH_DAY[market][diet] >
          BUDGET_FLOOR_PER_MOUTH_DAY[market][diet],
        `${market}/${diet}: seuil ${
          BUDGET_PLAUSIBLE_PER_MOUTH_DAY[market][diet]
        } ≤ plancher ${BUDGET_FLOOR_PER_MOUTH_DAY[market][diet]}`,
      );
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LA PROPRIÉTÉ MESURÉE: LE RÉGIME NE DURCIT PAS LE PLANCHER
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("② un carnivore et un végane ont EXACTEMENT le même plancher", () => {
  // C'est le fait que la grille rend, et il est contre-intuitif: le panier le
  // moins cher est déjà végétalien (pâtes, lentilles, pomme de terre, huile),
  // donc les quatre régimes de l'axe animal l'autorisent tous. Si quelqu'un
  // « corrige » un jour ces nombres pour faire payer la viande plus cher, ce
  // cas rougit — et c'est bien ce qu'on veut: la viande ne fait pas le
  // plancher, elle fait le CONFORT, qui est l'autre table.
  for (const market of COST_MARKETS) {
    const table = BUDGET_FLOOR_PER_MOUTH_DAY[market];
    assertEquals(table.omnivore, table.vegan, market);
    assertEquals(table.omnivore, table.vegetarian, market);
    assertEquals(table.omnivore, table.pescatarian, market);
  }
});

Deno.test("② le jour frugal d'un végane est le MOINS cher des cinq", () => {
  for (const market of COST_MARKETS) {
    const table = BUDGET_PLAUSIBLE_PER_MOUTH_DAY[market];
    for (const diet of [...DIETARY_REGIMES, "omnivore"] as const) {
      assert(
        table.vegan <= table[diet],
        `${market}: vegan ${table.vegan} > ${diet} ${table[diet]}`,
      );
    }
  }
});

Deno.test("② sans gluten: la France paie plus cher, les États-Unis non", () => {
  // ⚠️ LES DEUX MARCHÉS NE VONT PAS DANS LE MÊME SENS, et c'est la grille qui
  // le dit: en France le riz coûte plus que les pâtes, aux États-Unis moins.
  // Un test qui n'aurait gardé que « sans gluten coûte plus cher » aurait figé
  // l'attente française sur les deux marchés.
  assert(
    BUDGET_FLOOR_PER_MOUTH_DAY.fr.gluten_free >
      BUDGET_FLOOR_PER_MOUTH_DAY.fr.omnivore,
  );
  assertEquals(
    BUDGET_FLOOR_PER_MOUTH_DAY.us.gluten_free,
    BUDGET_FLOOR_PER_MOUTH_DAY.us.omnivore,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE CAS QUI A OUVERT CE LOT: 1 € POUR SEPT JOURS À QUATRE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("③ 1 € pour sept jours à quatre est REFUSÉ, et le refus porte son chiffre", () => {
  const mouths = [1, 2, 3, 4].map(() => ({
    diet: "omnivore",
    mouthDays: budgetMouthDays(fullWeek()),
  }));
  const verdict = assessBudget({ amount: 1, market: "fr", mouths });
  assertEquals(verdict.kind, "below_floor");
  assert(verdict.kind === "below_floor");
  // 4 bouches × 7 jours × 2,65 € = 74,20 €
  assertEquals(verdict.floor, 74.2);
  assert(verdict.plausible > verdict.floor);
});

Deno.test("③ le même foyer à 90 € passe, en « serré », et à 110 € il passe tout court", () => {
  const mouths = [1, 2, 3, 4].map(() => ({
    diet: "omnivore",
    mouthDays: budgetMouthDays(fullWeek()),
  }));
  assertEquals(assessBudget({ amount: 90, market: "fr", mouths }).kind, "tight");
  // 4 × 7 × 3,77 = 105,56 €
  assertEquals(assessBudget({ amount: 110, market: "fr", mouths }).kind, "ok");
});

Deno.test("③ UNE personne, sept jours: le plancher tient dans un chiffre qu'on peut relire", () => {
  const mouths = [{ diet: "omnivore", mouthDays: budgetMouthDays(fullWeek()) }];
  const bounds = budgetBoundsFor({ market: "fr", mouths })!;
  assertEquals(bounds.floor, 18.55); // 7 × 2,65
  assertEquals(bounds.plausible, 26.39); // 7 × 3,77
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ CE QUE LE PLANCHER COMPTE: DES PARTS DE JOURNÉE, PAS DES PERSONNES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("④ quelqu'un qui ne dîne que le soir vaut une journée PLEINE, pas 0,35", () => {
  // `dayCoverageOf` normalise par ce que la bouche déclare: pour elle, le dîner
  // EST sa journée. Compter 0,35 ferait un plancher trois fois trop bas pour
  // toute une population — celle qui ne déclare qu'un repas.
  const dinnerOnly = budgetMouthDays([
    { declaredSlots: ["dinner"], askedSlots: ["dinner"] },
  ]);
  assertEquals(dinnerOnly, 1);
});

Deno.test("④ un midi dehors fait DESCENDRE la part de cette journée", () => {
  // Trois repas déclarés (0,25 + 0,40 + 0,35 = 1,00), le déjeuner retiré: il
  // reste 0,60. C'est la table `SLOT_DAY_WEIGHT`, lue et pas recopiée.
  const day = budgetMouthDays([
    { declaredSlots: [...THREE_MEALS], askedSlots: ["breakfast", "dinner"] },
  ]);
  assertEquals(Math.round(day * 100) / 100, 0.6);
});

Deno.test("⛔ ④ un jour SANS AUCUN créneau composé ne compte pour RIEN", () => {
  // ⚠️ LE REPLI DE `dayCoverageOf` EST FAUX ICI, et c'est pour ça que ce cas
  // existe: il rend `1` sur une composition vide (sa garde anti-division par
  // zéro, écrite pour un dénominateur d'énergie). Laissé tel quel, un jour
  // d'absence totale aurait coûté une journée pleine de plancher.
  assertEquals(
    budgetMouthDays([
      { declaredSlots: [...THREE_MEALS], askedSlots: [] },
      { declaredSlots: [...THREE_MEALS], askedSlots: [...THREE_MEALS] },
    ]),
    1,
  );
});

Deno.test("④ une semaine à moitié dehors coûte moins qu'une semaine à table", () => {
  const away = budgetMouthDays(
    Array.from({ length: 7 }, (_, i) => ({
      declaredSlots: [...THREE_MEALS],
      askedSlots: i % 2 === 0 ? [...THREE_MEALS] : ["dinner"],
    })),
  );
  assert(away < 7, `${away} devrait être sous 7`);
  const bounds = budgetBoundsFor({
    market: "fr",
    mouths: [{ diet: "omnivore", mouthDays: away }],
  })!;
  assert(bounds.floor < 18.55, `${bounds.floor} devrait être sous la semaine pleine`);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ L'ABSTENTION — HORS DES DEUX MARCHÉS, ET SUR UNE DEMANDE VIDE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑤ hors FR et US, aucun plancher — jamais une conversion inventée", () => {
  assertEquals(budgetMarketFor("MA"), null);
  assertEquals(budgetMarketFor("CA"), null);
  assertEquals(budgetMarketFor(null), null);
  assertEquals(budgetMarketFor(""), null);
  const mouths = [{ diet: "omnivore", mouthDays: 7 }];
  assertEquals(budgetBoundsFor({ market: null, mouths }), null);
  assertEquals(assessBudget({ amount: 1, market: null, mouths }).kind, "unbounded");
});

Deno.test("⑤ les deux marchés se lisent quelle que soit la casse", () => {
  assertEquals(budgetMarketFor("FR"), "fr");
  assertEquals(budgetMarketFor("fr"), "fr");
  assertEquals(budgetMarketFor(" us "), "us");
});

Deno.test("⑤ une demande qui ne nourrit personne n'a pas de borne — et pas `ok`", () => {
  assertEquals(budgetBoundsFor({ market: "fr", mouths: [] }), null);
  assertEquals(
    assessBudget({ amount: 500, market: "fr", mouths: [] }).kind,
    "unbounded",
  );
  // Une bouche présente mais jamais nourrie ne fabrique pas de borne non plus.
  assertEquals(
    budgetBoundsFor({ market: "fr", mouths: [{ diet: "vegan", mouthDays: 0 }] }),
    null,
  );
});

Deno.test("⑤ un montant illisible ne fabrique NI refus NI approbation", () => {
  const mouths = [{ diet: "omnivore", mouthDays: 7 }];
  assertEquals(assessBudget({ amount: null, market: "fr", mouths }).kind, "unbounded");
  assertEquals(assessBudget({ amount: 0, market: "fr", mouths }).kind, "unbounded");
  assertEquals(
    assessBudget({ amount: Number.NaN, market: "fr", mouths }).kind,
    "unbounded",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LE RÉGIME LU, ET LE FOYER MÉLANGÉ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑥ un régime inconnu vaut `omnivore`, et ce repli ne peut REFUSER personne", () => {
  assertEquals(budgetDietOf(null), "omnivore");
  assertEquals(budgetDietOf("carnivore_strict"), "omnivore");
  assertEquals(budgetDietOf("VEGAN"), "vegan");
  assertEquals(budgetDietOf(" gluten_free "), "gluten_free");
  // La preuve que le repli est sûr: son plancher est celui de tout le monde.
  assertEquals(
    BUDGET_FLOOR_PER_MOUTH_DAY.fr.omnivore,
    BUDGET_FLOOR_PER_MOUTH_DAY.fr.vegan,
  );
});

Deno.test("⑥ un foyer mélangé additionne les bouches, chacune à SON tarif", () => {
  const bounds = budgetBoundsFor({
    market: "fr",
    mouths: [
      { diet: "omnivore", mouthDays: 7 },
      { diet: "gluten_free", mouthDays: 7 },
    ],
  })!;
  // 7 × 2,65 + 7 × 2,77 = 37,94
  assertEquals(bounds.floor, 37.94);
  // 7 × 3,77 + 7 × 3,92 = 53,83
  assertEquals(bounds.plausible, 53.83);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LES ARRONDIS, CHACUN DU CÔTÉ OÙ IL NE SE CONTREDIT PAS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑦ le plancher s'arrondit vers le HAUT, le seuil vers le BAS", () => {
  // 3 bouches × 1 jour × 2,65 = 7,95 (exact). On prend une part fractionnaire
  // pour sortir un centime: 0,6 jour × 2,65 = 1,59 exactement… donc on empile
  // trois parts de 0,6 pour tomber sur 4,77.
  const bounds = budgetBoundsFor({
    market: "fr",
    mouths: [{ diet: "omnivore", mouthDays: 0.6 * 3 }],
  })!;
  // 1,8 × 2,65 = 4,77 ; 1,8 × 3,77 = 6,786 → 6,78 (vers le bas)
  assertEquals(bounds.floor, 4.77);
  assertEquals(bounds.plausible, 6.78);
  // ⛔ LA PROPRIÉTÉ, PAS LE CHIFFRE: un budget égal au plancher passe toujours.
  assert(assessBudget({
    amount: bounds.floor,
    market: "fr",
    mouths: [{ diet: "omnivore", mouthDays: 1.8 }],
  }).kind !== "below_floor");
});

Deno.test("⑦ un budget PILE au plancher n'est pas refusé; un centime en dessous l'est", () => {
  const mouths = [{ diet: "omnivore", mouthDays: 7 }];
  assertEquals(assessBudget({ amount: 18.55, market: "fr", mouths }).kind, "tight");
  assertEquals(
    assessBudget({ amount: 18.54, market: "fr", mouths }).kind,
    "below_floor",
  );
});
