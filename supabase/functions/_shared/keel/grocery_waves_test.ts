import { assert, assertEquals } from "jsr:@std/assert@1";

import type { ShoppingItem } from "./meal_generation.ts";
import {
  MAX_FRIDGE_DAYS,
  planGroceryWaves,
  waveAssignments,
  waveItemCount,
  type WavePreparation,
  wavePreparationsFromRows,
  wavesAreMeaningful,
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

// ===========================================================================
// SANS FENÊTRE, AUCUNE VAGUE
// ===========================================================================
// La garde vivait côté écran tant que le jumeau existait. Elle est REMONTÉE
// ici avec le reste: une ligne écrite avant `20260807090000_meal_plan_window`
// n'a pas de `starts_on`, et le PDF du frigo la lira comme l'écran la lit.

Deno.test("sans date de départ, aucune vague — on ne devine pas un jour de courses", () => {
  for (const startsOn of ["", "pas une date", "2026-8-3"]) {
    assertEquals(
      planGroceryWaves({
        startsOn,
        durationDays: 7,
        shoppingList: [item("poulet", "protein")],
        preparations: [{ id: "p1", cookOn: "fri", ingredientTerms: ["poulet"] }],
      }),
      [],
      `"${startsOn}" ne doit produire aucune vague`,
    );
  }
});

// ===========================================================================
// LA BORNE VIENT D'AILLEURS, ET ELLE GOUVERNE VRAIMENT LE DÉCOUPAGE
// ===========================================================================
// Ce test est écrit EN FONCTION de `MAX_FRIDGE_DAYS`: il affirme que le
// découpage LIT la borne, où qu'elle soit fixée. Il ne remplace pas les tests
// qui pinnent "2026-08-04" en dur — ce sont eux qui pinnent la VALEUR, et qui
// virent au rouge le jour où quelqu'un la change. Les deux ensemble disent:
// « la borne vaut 3, et c'est bien elle qui décide ».
Deno.test("la date d'achat de la seconde vague est déduite de MAX_FRIDGE_DAYS", () => {
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList: [item("sel", "pantry"), item("poulet", "protein")],
    preparations: [{ id: "p1", cookOn: "sun", ingredientTerms: ["poulet"] }],
  });
  // Dimanche 09 moins la borne.
  const cook = new Date("2026-08-09T12:00:00Z");
  cook.setUTCDate(cook.getUTCDate() - MAX_FRIDGE_DAYS);
  assertEquals(waves.length, 2);
  assertEquals(waves[1].buyOn, cook.toISOString().slice(0, 10));
  assertEquals(waves[1].items.map((i) => i.term), ["poulet"]);
});

// ===========================================================================
// LA FORME PERSISTÉE — ce que l'écran et le PDF lisent réellement
// ===========================================================================

Deno.test("wavePreparationsFromRows: la ligne snake_case devient l'entrée du calcul", () => {
  const preps = wavePreparationsFromRows([
    {
      id: "p1",
      cook_on: "fri",
      ingredients: [{ term: "poulet" }, { term: "thym" }],
    },
  ]);
  assertEquals(preps, [
    { id: "p1", cookOn: "fri", ingredientTerms: ["poulet", "thym"] },
  ]);
});

Deno.test("wavePreparationsFromRows tolère une ligne creuse sans rien inventer", () => {
  // Une préparation sans `cook_on` ni ingrédients est le cas normal quand le
  // modèle n'a pas rendu de session: elle doit passer, pas exploser.
  assertEquals(wavePreparationsFromRows([{}]), [
    { id: "", cookOn: null, ingredientTerms: [] },
  ]);
  assertEquals(
    wavePreparationsFromRows([{ id: "p1", cook_on: null, ingredients: null }]),
    [{ id: "p1", cookOn: null, ingredientTerms: [] }],
  );
});

Deno.test("la ligne persistée produit les MÊMES vagues que la forme camelCase", () => {
  // Le seul geste que l'écran fait encore: passer sa ligne à l'adaptateur.
  // Si les deux chemins divergeaient, le jumeau serait revenu par la fenêtre.
  const shoppingList = [item("lentilles", "pantry"), item("poulet", "protein")];
  const fromRows = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList,
    preparations: wavePreparationsFromRows([
      { id: "p1", cook_on: "mon", ingredients: [{ term: "lentilles" }] },
      { id: "p2", cook_on: "fri", ingredients: [{ term: "poulet" }] },
    ]),
  });
  const fromCamel = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList,
    preparations: [
      { id: "p1", cookOn: "mon", ingredientTerms: ["lentilles"] },
      { id: "p2", cookOn: "fri", ingredientTerms: ["poulet"] },
    ],
  });
  assertEquals(fromRows, fromCamel);
  assertEquals(fromRows.length, 2);
});

// ===========================================================================
// MONTRER, OU NE PAS MONTRER
// ===========================================================================
// Règle de PRODUIT, pas de rendu: un PDF se pose exactement la même question.
// Elle vivait côté écran, elle vit ici.

Deno.test("wavesAreMeaningful: une seule vague ne se montre pas", () => {
  assertEquals(wavesAreMeaningful([]), false);
  assertEquals(wavesAreMeaningful([{ buyOn: "a", items: [], servesCookOn: null }]), false);
  assertEquals(
    wavesAreMeaningful([
      { buyOn: "a", items: [], servesCookOn: null },
      { buyOn: "b", items: [], servesCookOn: null },
    ]),
    true,
  );
});

// ===========================================================================
// LES INDEX D'ORIGINE — pour ne pas casser les ratures
// ===========================================================================

Deno.test("waveAssignments rend des INDEX, jamais des copies d'articles", () => {
  const shoppingList = [
    item("lentilles", "pantry"),
    item("poulet", "protein"),
    item("carottes", "produce"),
  ];
  const got = waveAssignments({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList,
    preparations: [
      { id: "p1", cookOn: "mon", ingredientTerms: ["lentilles"] },
      { id: "p2", cookOn: "fri", ingredientTerms: ["poulet"] },
    ],
  });
  assertEquals(got.length, 2);
  assertEquals(got[0].indices, [0, 2]);
  assertEquals(got[1].indices, [1]);
});

Deno.test("DEUX ARTICLES AU MÊME TERME reçoivent DEUX index différents", () => {
  // Le piège de l'appariement par terme: la cuisse et le blanc s'appellent
  // tous les deux « poulet », et cocher l'un rayerait l'autre.
  const got = waveAssignments({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList: [item("poulet", "protein"), item("poulet", "protein")],
    preparations: [{ id: "p1", cookOn: "fri", ingredientTerms: ["poulet"] }],
  });
  assertEquals(got.flatMap((w) => w.indices).sort(), [0, 1]);
});

Deno.test("chaque index apparaît EXACTEMENT une fois — rien perdu, rien doublé", () => {
  const shoppingList = [
    item("lentilles", "pantry"),
    item("poulet", "protein"),
    item("carottes", "produce"),
  ];
  const got = waveAssignments({
    startsOn: MONDAY,
    durationDays: 7,
    shoppingList,
    preparations: [
      { id: "p1", cookOn: "mon", ingredientTerms: ["lentilles"] },
      { id: "p2", cookOn: "fri", ingredientTerms: ["poulet"] },
    ],
  });
  assertEquals(got.flatMap((w) => w.indices).sort((a, b) => a - b), [0, 1, 2]);
});

Deno.test("sans fenêtre, aucune affectation", () => {
  assertEquals(
    waveAssignments({
      startsOn: "",
      durationDays: 7,
      shoppingList: [item("poulet", "protein")],
      preparations: [],
    }),
    [],
  );
});
