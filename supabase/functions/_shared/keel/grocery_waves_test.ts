import { assert, assertEquals } from "jsr:@std/assert@1";

import type { ShoppingItem } from "./meal_generation.ts";
import {
  planGroceryWaves,
  type WavePreparation,
  waveItemCount,
} from "./grocery_waves.ts";

// Lundi 2026-08-03. Les jetons de jour suivent donc: mon=03 … sun=09.
const MONDAY = "2026-08-03";

function item(term: string, aisle: ShoppingItem["aisle"]): ShoppingItem {
  return { term, quantity: null, aisle };
}

Deno.test("un plan de 7 jours avec une cuisson tardive produit DEUX vagues", () => {
  // LE CAS QUI JUSTIFIE LE MODULE. Le poulet du vendredi ne s'achète pas le
  // lundi: il ne tiendrait pas. Toutes les apps de la catégorie sortent une
  // liste unique, et c'est exactement ce qu'on ne fait pas ici.
  const preparations: WavePreparation[] = [
    { id: "p1", cookOn: "mon", ingredientTerms: ["lentilles", "carottes"] },
    { id: "p2", cookOn: "fri", ingredientTerms: ["poulet"] },
  ];
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList: [
      item("lentilles", "pantry"),
      item("carottes", "produce"),
      item("poulet", "protein"),
      item("huile d'olive", "pantry"),
    ],
    preparations,
  });

  assertEquals(waves.length, 2);
  assertEquals(waves[0].buyOn, MONDAY);
  // Vendredi 07 moins 3 jours de frigo = mardi 04.
  assertEquals(waves[1].buyOn, "2026-08-04");
  assertEquals(waves[1].items.map((i) => i.term), ["poulet"]);
  assertEquals(waves[1].servesCookOn, "2026-08-07");
});

Deno.test("un plan court ne produit qu'UNE vague", () => {
  // Si tout tient dans MAX_FRIDGE_DAYS, une seconde vague n'ajoute qu'un
  // déplacement. La cadence sert la fraîcheur; sans besoin de fraîcheur, elle
  // disparaît.
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 3,
    shoppingList: [item("poulet", "protein"), item("riz", "grains")],
    preparations: [{ id: "p1", cookOn: "wed", ingredientTerms: ["poulet", "riz"] }],
  });
  assertEquals(waves.length, 1);
  assertEquals(waves[0].buyOn, MONDAY);
  assertEquals(waves[0].servesCookOn, null);
});

Deno.test("l'épicerie ne part JAMAIS en seconde vague, même pour une cuisson tardive", () => {
  // Elle se garde. Envoyer quelqu'un racheter du riz en milieu de semaine
  // serait une corvée inventée — et le produit promet d'en retirer, pas d'en
  // ajouter.
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList: [item("riz", "grains"), item("conserve de tomates", "pantry")],
    preparations: [{ id: "p1", cookOn: "sat", ingredientTerms: ["riz", "conserve de tomates"] }],
  });
  assertEquals(waves.length, 1);
  assertEquals(waves[0].buyOn, MONDAY);
});

Deno.test("le surgelé se garde: première vague", () => {
  // Le seul choix discutable de PERISHABLE_AISLES, donc celui qu'on pinne.
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList: [item("petits pois surgelés", "frozen")],
    preparations: [{ id: "p1", cookOn: "sun", ingredientTerms: ["petits pois surgelés"] }],
  });
  assertEquals(waves.length, 1);
  assertEquals(waves[0].buyOn, MONDAY);
});

Deno.test("un ingrédient utilisé DEUX fois suit la cuisson la plus précoce", () => {
  // Acheter pour la seconde cuisson ferait rater la première. Le piège se
  // referme silencieusement: la liste est complète, mais le mardi il manque
  // le poulet.
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList: [item("poulet", "protein")],
    preparations: [
      { id: "p1", cookOn: "sat", ingredientTerms: ["poulet"] },
      { id: "p2", cookOn: "tue", ingredientTerms: ["poulet"] },
    ],
  });
  assertEquals(waves.length, 1);
  // Mardi 04 moins 3 jours = 2026-08-01, avant le début du plan → borné au début.
  assertEquals(waves[0].buyOn, MONDAY);
});

Deno.test("RIEN NE DISPARAÎT — un terme non rattaché part en première vague", () => {
  // La propriété qui compte le plus. Une liste qui perd un ingrédient en
  // silence est pire qu'une liste plate: on s'en aperçoit devant la casserole.
  const shoppingList = [
    item("poulet", "protein"),
    item("un truc que personne ne cuisine", "produce"),
    item("sel", "pantry"),
  ];
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList,
    preparations: [{ id: "p1", cookOn: "sat", ingredientTerms: ["poulet"] }],
  });
  assertEquals(waveItemCount(waves), shoppingList.length);
  assert(
    waves[0].items.some((i) => i.term === "un truc que personne ne cuisine"),
    "l'orphelin doit être achetable dès la première vague",
  );
});

Deno.test("aucune préparation datée: tout en première vague, rien de perdu", () => {
  // Le modèle ne rend pas toujours de session. Sans date de cuisson, on ne
  // peut RIEN déduire — et « je ne sais pas » doit donner une liste unique,
  // jamais une liste vide.
  const shoppingList = [item("poulet", "protein"), item("riz", "grains")];
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList,
    preparations: [{ id: "p1", cookOn: null, ingredientTerms: ["poulet", "riz"] }],
  });
  assertEquals(waves.length, 1);
  assertEquals(waveItemCount(waves), 2);
});

Deno.test("le rapprochement tolère la casse et les accents", () => {
  // La liste de courses et les ingrédients viennent du MÊME modèle mais pas du
  // même champ: « Poulet » d'un côté, « poulet » de l'autre est le cas normal,
  // pas l'exception.
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList: [item("Épinards", "produce")],
    preparations: [{ id: "p1", cookOn: "fri", ingredientTerms: ["epinards"] }],
  });
  assertEquals(waves[0].buyOn, "2026-08-04");
});

Deno.test("une liste vide ne produit aucune vague", () => {
  assertEquals(
    planGroceryWaves({ startsOn: MONDAY, durationDays: 7, shoppingList: [], preparations: [] }),
    [],
  );
});

Deno.test("les vagues sortent dans l'ordre chronologique", () => {
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList: [
      item("poisson", "protein"),
      item("sel", "pantry"),
      item("steak", "protein"),
    ],
    preparations: [
      { id: "p1", cookOn: "sun", ingredientTerms: ["poisson"] },
      { id: "p2", cookOn: "thu", ingredientTerms: ["steak"] },
    ],
  });
  const dates = waves.map((w) => w.buyOn);
  assertEquals([...dates].sort(), dates);
});
