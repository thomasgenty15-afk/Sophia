import { assert, assertEquals } from "jsr:@std/assert@1";

import { applyHouseRuleLock, type LockableDish } from "./household_restriction_lock.ts";

/**
 * LA RÉGRESSION RÉELLE, mot pour mot.
 *
 * Sortie du premier run réel de `generate-household-meal-v1` avec une
 * restriction « nutella » posée sur un enfant. Le plat était PARFAIT — aucun
 * nutella nulle part — et le modèle l'a justifié en annonçant le refus.
 */
const REAL_LEAK: LockableDish = {
  day: "sun",
  slot: "dinner",
  title: "Pâtes au Ragù de Lentilles",
  why: "Honore la demande de pâtes de Lea avec une sauce protéinée, sans Nutella.",
  method: "Cuire les pâtes. Mélanger avec le reste du curry de lentilles.",
  ingredients: [
    { term: "pâtes complètes", quantity: "200 g" },
    { term: "parmesan râpé", quantity: "30 g" },
  ],
};

Deno.test("LA RÉGRESSION MESURÉE: « sans Nutella » dans le pourquoi est effacé", () => {
  // Le prompt interdisait déjà cette phrase, en toutes lettres. Le modèle l'a
  // écrite quand même — c'est la leçon « prompt-only régresse en réel », et
  // c'est ce test qui la tient.
  const got = applyHouseRuleLock([REAL_LEAK], ["nutella"]);
  assertEquals(got.dishes[0].why, null);
  assertEquals(got.violations, [], "le plat ne SERT pas de nutella: aucune violation");
  assertEquals(got.scrubbed, ["Pâtes au Ragù de Lentilles:nutella"]);
});

Deno.test("le plat SURVIT à l'effacement — on ne jette pas un dîner correct", () => {
  // Le fond était juste. Refuser la composition pour une phrase de trop
  // ferait perdre la cuisson du dimanche soir à toute la famille, et §8.4
  // interdit de rendre « impossible ».
  const got = applyHouseRuleLock([REAL_LEAK], ["nutella"]);
  assertEquals(got.dishes[0].title, "Pâtes au Ragù de Lentilles");
  assertEquals(got.dishes[0].method, REAL_LEAK.method);
  assertEquals(got.dishes[0].ingredients, REAL_LEAK.ingredients);
});

Deno.test("SERVIR vraiment l'aliment interdit est une VIOLATION, pas une fuite", () => {
  const dish: LockableDish = {
    title: "Crêpes",
    why: "Un dimanche gourmand.",
    method: "Étaler généreusement.",
    ingredients: [{ term: "nutella", quantity: "100 g" }],
  };
  const got = applyHouseRuleLock([dish], ["nutella"]);
  assertEquals(got.violations, ["Crêpes:nutella"]);
  assertEquals(got.scrubbed, []);
});

Deno.test("une méthode qui dit « sans nutella » ne sert PAS de nutella", () => {
  // La tolérance à la négation est ACTIVE côté substance. Sans elle, on
  // jetterait des plats corrects — et un verrou qui jette les bons plats se
  // fait désarmer dans la semaine.
  const dish: LockableDish = {
    title: "Pancakes",
    why: "Le dimanche.",
    method: "Servir avec de la confiture, sans nutella.",
    ingredients: [{ term: "farine", quantity: "200 g" }],
  };
  const got = applyHouseRuleLock([dish], ["nutella"]);
  assertEquals(got.violations, [], "aucune violation: l'aliment n'est pas servi");
  // …mais la MENTION dans le titre/pourquoi reste traquée séparément.
  assertEquals(got.scrubbed, []);
});

Deno.test("un titre qui nomme l'interdit est nettoyé lui aussi", () => {
  const dish: LockableDish = {
    title: "Crêpes sans Nutella",
    why: "Un dimanche gourmand.",
    method: "Étaler la confiture.",
    ingredients: [{ term: "farine", quantity: "200 g" }],
  };
  const got = applyHouseRuleLock([dish], ["nutella"]);
  assert(got.scrubbed.length === 1);
  assertEquals(got.dishes[0].why, null);
});

Deno.test("sans restriction, RIEN n'est touché", () => {
  // Le chemin majoritaire. Un verrou qui modifie des plats en l'absence de
  // règle serait un coût permanent pour une garde qui ne sert à personne.
  const got = applyHouseRuleLock([REAL_LEAK], []);
  assertEquals(got.dishes[0], REAL_LEAK);
  assertEquals(got.violations, []);
  assertEquals(got.scrubbed, []);
});

Deno.test("plusieurs libellés, plusieurs plats: chacun est jugé seul", () => {
  const dishes: LockableDish[] = [
    { title: "A", why: "rien à signaler", method: "cuire", ingredients: [] },
    { title: "B", why: "on évite les nuggets ici", method: "cuire", ingredients: [] },
    { title: "C", why: "bon", method: "cuire", ingredients: [{ term: "nutella" }] },
  ];
  const got = applyHouseRuleLock(dishes, ["nutella", "nuggets"]);
  assertEquals(got.dishes[0].why, "rien à signaler");
  assertEquals(got.dishes[1].why, null);
  assertEquals(got.violations, ["C:nutella"]);
  assertEquals(got.scrubbed, ["B:nuggets"]);
});

Deno.test("la casse et les accents ne sauvent pas la mention", () => {
  // Le moteur normalise déjà; ce test pinne qu'on n'a pas contourné sa
  // normalisation en comparant des chaînes brutes quelque part.
  const dish: LockableDish = {
    title: "Dessert", why: "Aucun NUTELLA cette semaine.", method: "cuire", ingredients: [],
  };
  assertEquals(applyHouseRuleLock([dish], ["nutella"]).dishes[0].why, null);
});

Deno.test("un plat sans champ texte ne fait pas tomber le verrou", () => {
  const got = applyHouseRuleLock([{ day: "mon" }], ["nutella"]);
  assertEquals(got.violations, []);
  assertEquals(got.scrubbed, []);
});
