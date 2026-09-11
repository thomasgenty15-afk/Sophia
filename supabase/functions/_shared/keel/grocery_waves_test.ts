import { assert, assertEquals } from "jsr:@std/assert@1";

// ⛔ CE TEST NE DÉPEND PAS DE `ShoppingItem`, ET C'EST DÉLIBÉRÉ. Le contrat de
// `grocery_waves.ts` est `WaveItem` — la forme MINIMALE d'un article, celle que
// satisfont aussi bien la ligne du serveur que le JSON de l'écran. Le tester
// contre le type d'un autre module ferait rougir ce fichier chaque fois que ce
// module bouge, sur des champs dont les vagues ne savent rien.
type TestItem = WaveItem & { quantity: string | null };
type TestAisle = "produce" | "protein" | "dairy" | "grains" | "pantry" | "frozen" | "other";
import {
  MAX_FRIDGE_DAYS,
  planGroceryWaves,
  rawWindowCounts,
  waveAssignments,
  waveItemCount,
  type WaveItem,
  type WavePreparation,
  wavePreparationsFromRows,
  wavesAreMeaningful,
  describeWrittenWaves,
} from "./grocery_waves.ts";

// Lundi 2026-08-03. Les jetons de jour suivent donc: mon=03 … sun=09.
const MONDAY = "2026-08-03";

// ⚠️ `food_group: null` EST ÉCRIT, plus omis. Depuis le 2026-08-23 le champ est
// REQUIS sur `WaveItem` (voir son bloc): `null` dit « cette ligne n'a pas de
// groupe » et rend le repli `MAX_FRIDGE_DAYS`, c'est-à-dire exactement ce que
// l'omission rendait — les assertions de ce fichier ne bougent pas d'un jour.
// Ce que le mot ajoute est qu'un appelant ne peut plus se taire par mégarde.
function item(term: string, aisle: TestAisle): TestItem {
  return { term, quantity: null, aisle, food_group: null };
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
    runs: null,
    freezer: false,
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
    runs: null,
    freezer: false,
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
    runs: null,
    freezer: false,
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
    runs: null,
    freezer: false,
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
    runs: null,
    freezer: false,
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
    runs: null,
    freezer: false,
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
    runs: null,
    freezer: false,
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
    runs: null,
    freezer: false,
    shoppingList: [item("Épinards", "produce")],
    preparations: [{ id: "p1", cookOn: "fri", ingredientTerms: ["epinards"] }],
  });
  assertEquals(waves[0].buyOn, "2026-08-04");
});

Deno.test("une liste vide ne produit aucune vague", () => {
  assertEquals(
    planGroceryWaves({
      startsOn: MONDAY,
      durationDays: 7,
      runs: null,
      freezer: false,
      shoppingList: [],
      preparations: [],
    }),
    [],
  );
});

Deno.test("les vagues sortent dans l'ordre chronologique", () => {
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    runs: null,
    freezer: false,
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
        runs: null,
        freezer: false,
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
    runs: null,
    freezer: false,
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
    runs: null,
    freezer: false,
    shoppingList,
    preparations: wavePreparationsFromRows([
      { id: "p1", cook_on: "mon", ingredients: [{ term: "lentilles" }] },
      { id: "p2", cook_on: "fri", ingredients: [{ term: "poulet" }] },
    ]),
  });
  const fromCamel = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    runs: null,
    freezer: false,
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
  assertEquals(wavesAreMeaningful([{ buyOn: "a", items: [], servesCookOn: null, servesCookDates: [] }]), false);
  assertEquals(
    wavesAreMeaningful([
      { buyOn: "a", items: [], servesCookOn: null, servesCookDates: [] },
      { buyOn: "b", items: [], servesCookOn: null, servesCookDates: [] },
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
    runs: null,
    freezer: false,
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
    runs: null,
    freezer: false,
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
    runs: null,
    freezer: false,
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
      runs: null,
      freezer: false,
      shoppingList: [item("poulet", "protein")],
      preparations: [],
    }),
    [],
  );
});

// ===========================================================================
// ⟳ LOT `L0-a` — LA FENÊTRE CRUE, PAR GROUPE
// ===========================================================================
//
// ⛔ LE DÉFAUT MESURÉ SUR LE CAS 04, REJOUÉ ICI. `MAX_FRIDGE_DAYS = 3`
// accordait trois jours de frigo CRU à tout le monde, y compris à une volaille
// fraîche qui en tient deux. Ces tests fixent la date d'achat par GROUPE, avec
// des dates littérales — ce sont elles qui rougissent le jour où la fenêtre
// d'un groupe change.

function grouped(term: string, aisle: TestAisle, foodGroup: string | null): TestItem {
  return { term, quantity: null, aisle, food_group: foodGroup };
}

Deno.test("le poulet du vendredi ne s'achète plus le mardi, mais le jeudi", () => {
  // Vendredi 07. `poultry` tient 2 jours cru ⇒ au plus tôt mercredi 05.
  // AVANT le lot: `MAX_FRIDGE_DAYS = 3` ⇒ mardi 04, et le poulet attendait
  // trois jours. C'est exactement le cas 04.
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    runs: null,
    freezer: false,
    shoppingList: [grouped("sel", "pantry", "sauce_dressing"), grouped("poulet", "protein", "poultry")],
    preparations: [{ id: "p1", cookOn: "fri", ingredientTerms: ["poulet"] }],
  });
  assertEquals(waves.length, 2);
  assertEquals(waves[1].buyOn, "2026-08-05");
  assertEquals(waves[1].items.map((i) => i.term), ["poulet"]);
});

Deno.test("le poisson se rapproche encore: un seul jour d'écart", () => {
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    runs: null,
    freezer: false,
    shoppingList: [grouped("cabillaud", "protein", "white_fish")],
    preparations: [{ id: "p1", cookOn: "fri", ingredientTerms: ["cabillaud"] }],
  });
  assertEquals(waves.length, 1);
  assertEquals(waves[0].buyOn, "2026-08-06", "jeudi, la veille de la cuisson");
});

Deno.test("la viande en pièce garde les trois jours historiques", () => {
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    runs: null,
    freezer: false,
    shoppingList: [grouped("boeuf", "protein", "red_meat")],
    preparations: [{ id: "p1", cookOn: "fri", ingredientTerms: ["boeuf"] }],
  });
  assertEquals(waves[0].buyOn, "2026-08-04", "mardi, comme avant le lot");
});

Deno.test("les légumes frais ENTRENT dans la première vague, ils n'en sortent plus", () => {
  // ⬇️ LE SENS INVERSE, ET IL EST VOULU. `non_starchy_veg` tient sept jours:
  // les faire acheter en seconde vague coûtait un déplacement pour rien.
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    runs: null,
    freezer: false,
    shoppingList: [grouped("courgettes", "produce", "non_starchy_veg")],
    preparations: [{ id: "p1", cookOn: "fri", ingredientTerms: ["courgettes"] }],
  });
  assertEquals(waves.length, 1);
  assertEquals(waves[0].buyOn, MONDAY);
});

Deno.test("la salade reste fragile: trois jours, comme la viande en pièce", () => {
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    runs: null,
    freezer: false,
    shoppingList: [grouped("laitue", "produce", "leafy_greens")],
    preparations: [{ id: "p1", cookOn: "fri", ingredientTerms: ["laitue"] }],
  });
  assertEquals(waves[0].buyOn, "2026-08-04");
});

Deno.test("MUTATION — sans groupe, on retombe sur MAX_FRIDGE_DAYS, et ça se COMPTE", () => {
  // ⛔ C'EST L'ARME DE L'ABSTENTION. Les 181 plans déjà écrits n'ont pas de
  // `food_group`: le repli doit être exactement le comportement d'avant, ET il
  // doit être visible. Sans `unknown_group`, une liste sans aucun groupe rend
  // la même chose qu'une liste parfaitement routée.
  const sansGroupe = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    runs: null,
    freezer: false,
    shoppingList: [item("poulet", "protein")],
    preparations: [{ id: "p1", cookOn: "fri", ingredientTerms: ["poulet"] }],
  });
  assertEquals(sansGroupe[0].buyOn, "2026-08-04", "le repli est l'ancien comportement");

  assertEquals(
    rawWindowCounts([
      grouped("poulet", "protein", "poultry"),
      grouped("sel", "pantry", null),
      item("mystère", "other"),
    ]),
    { routed: 1, unknown_group: 2 },
  );
});

Deno.test("un groupe non périssable au rayon périssable ne déplace rien", () => {
  // `PERISHABLE_AISLES` reste la porte extérieure: ce lot change la LARGEUR de
  // la fenêtre, pas la liste de ce qui en a une.
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    runs: null,
    freezer: false,
    shoppingList: [grouped("riz", "pantry", "white_fish")],
    preparations: [{ id: "p1", cookOn: "fri", ingredientTerms: ["riz"] }],
  });
  assertEquals(waves.length, 1);
  assertEquals(waves[0].buyOn, MONDAY, "le rayon `pantry` n'a pas de fenêtre");
});

// ---------------------------------------------------------------------------
// A1 (chantier-0903/CUISINE, 2026-09-03) — `servesCookOn` SUR LA PREMIÈRE VAGUE
// ---------------------------------------------------------------------------
//
// ⛔ LE DÉFAUT QUE CES DEUX TESTS FERMENT, ET IL EST SILENCIEUX. `serves` ne se
// posait que si `buyOn > startsOn`. Avec la veille de A1, `startsOn` EST la
// veille et la première vague y tombe: la règle marchait par COÏNCIDENCE. Elle
// se casse dès que la première vague tombe APRÈS le début du plan — tout
// périssable, cuisson tardive — et alors `servesCookOn` reste `null` PARTOUT,
// `shiftProposalAfterShoppingLater` (`accident.ts`) ne propose plus rien, et
// rien ne rougit. La règle est donc `buyOn > firstBuyOn`.

Deno.test("A1 — la PREMIÈRE vague ne porte pas de phrase, même tombée après le début", () => {
  // Tout est périssable et rien ne se cuisine avant la fin de semaine: la
  // première vague tombe le MERCREDI 05 (samedi 08 − 3 jours de salade), pas
  // le lundi.
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    runs: null,
    freezer: false,
    shoppingList: [
      { term: "salade", quantity: null, aisle: "produce", food_group: "leafy_greens" },
      { term: "poisson", quantity: null, aisle: "protein", food_group: "fish" },
    ],
    preparations: [
      { id: "p1", cookOn: "sat", ingredientTerms: ["salade"] },
      { id: "p2", cookOn: "sun", ingredientTerms: ["poisson"] },
    ],
  });
  assert(waves.length >= 2, `attendu ≥ 2 vagues, vu ${waves.length}`);
  // ⛔ LA PREMIÈRE TOMBE APRÈS LE DÉBUT DU PLAN — c'est le cas que l'ancienne
  // règle ne savait pas voir.
  assert(waves[0].buyOn > MONDAY, `première vague le ${waves[0].buyOn}`);
  assertEquals(waves[0].servesCookOn, null);
  // ⛔ ET TOUTES LES SUIVANTES PORTENT LEUR CUISSON (invariant C3).
  for (const wave of waves.slice(1)) {
    assert(
      wave.servesCookOn !== null,
      `la vague du ${wave.buyOn} ne dit pas pour quelle cuisson elle existe`,
    );
  }
});

Deno.test("A1 — la vague du RANG 0 (la veille) reste muette, la suivante parle", () => {
  // La fenêtre servie sous A1: dimanche 02/08 est la veille, on mange du lundi
  // au dimanche suivant. `startsOn` EST la veille — la borne `.eq(startsOn)`
  // reste donc juste, et c'est ce que ce test verrouille.
  const SUNDAY_BEFORE = "2026-08-02";
  const waves = planGroceryWaves({
    startsOn: SUNDAY_BEFORE,
    durationDays: 8,
    runs: null,
    freezer: false,
    shoppingList: [
      { term: "lentilles", quantity: null, aisle: "pantry", food_group: null },
      { term: "poulet", quantity: null, aisle: "protein", food_group: "poultry" },
    ],
    preparations: [
      { id: "p1", cookOn: "sun", ingredientTerms: ["lentilles"] },
      { id: "p2", cookOn: "fri", ingredientTerms: ["poulet"] },
    ],
  });
  assertEquals(waves.length, 2);
  assertEquals(waves[0].buyOn, SUNDAY_BEFORE);
  assertEquals(waves[0].servesCookOn, null);
  assert(waves[1].servesCookOn !== null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ LOT C (2026-09-04) — LE REPLI SUR LA CADENCE, ET LA MARQUE « À CONGELER »
//
// LE CAS DU PRODUIT, dit par l'utilisateur: « quand il y a une session de
// courses mais deux sessions de cuisine, les aliments qui doivent être congelés
// doivent être indiqués ». Jusqu'à ce lot cette configuration n'existait pas —
// une course forçait une session — donc la marque n'avait aucun plan où se
// poser.
//
// ⛔ ET LA CONTRE-ÉPREUVE EST LA MOITIÉ QUI COMPTE: sans congélateur on ne
// replie RIEN, et un article qui tient jusqu'à sa cuisson n'est PAS marqué.
// Une instruction inutile apprend à ignorer les autres.
// ═══════════════════════════════════════════════════════════════════════════

const LATE_COOK: WavePreparation[] = [
  { id: "p1", cookOn: "mon", ingredientTerms: ["lentilles"] },
  { id: "p2", cookOn: "sat", ingredientTerms: ["poulet"] },
];
const TWO_LINES: TestItem[] = [
  { term: "lentilles", quantity: null, aisle: "pantry", food_group: null },
  { term: "poulet", quantity: null, aisle: "protein", food_group: null },
];

Deno.test("⛔ LOT C — UNE course + congélateur: UNE vague, et le poulet est marqué", () => {
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    runs: 1,
    freezer: true,
    shoppingList: TWO_LINES,
    preparations: LATE_COOK,
  });
  assertEquals(waves.length, 1, "une seule course demandée, une seule vague");
  assertEquals(waves[0].buyOn, MONDAY);
  assertEquals(waveItemCount(waves), 2, "aucune ligne n'est perdue dans le repli");
  // Le poulet est cuisiné samedi et acheté lundi: `MAX_FRIDGE_DAYS` (3) le fait
  // périmer jeudi. Il part au congélateur en rentrant du magasin.
  assertEquals(waves[0].freezeOnPurchase.map((i) => i.term), ["poulet"]);
});

Deno.test("⛔ LOT C — LA CONTRE-ÉPREUVE: sans congélateur, on ne replie PAS", () => {
  // Replier ici ferait acheter lundi un poulet cuisiné samedi, sans rien pour
  // le garder. La cadence demandée cède devant la conservation, et c'est le bon
  // ordre: un plan qui tient sur le papier et pourrit dans le frigo est pire
  // qu'une course de plus.
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    runs: 1,
    freezer: false,
    shoppingList: TWO_LINES,
    preparations: LATE_COOK,
  });
  assertEquals(waves.length, 2);
  for (const w of waves) assertEquals(w.freezeOnPurchase, []);
});

Deno.test("⛔ LOT C — LA PROPRIÉTÉ: ce que le repli déplace est TOUJOURS hors de portée", () => {
  // ⚠️ CE TEST REMPLACE UN TEST FAIBLE, ET LE MOTIF VAUT D'ÊTRE ÉCRIT.
  // J'avais écrit « un article qui tient n'est pas marqué » sur un décor qui ne
  // produisait qu'UNE vague: aucun repli n'avait lieu, la liste était vide pour
  // cette raison-là, et une mutation qui marquait TOUT restait verte. Le test
  // passait pour la mauvaise raison.
  //
  // La vérité est plus forte: un article que le repli déplace est FORCÉMENT
  // hors de portée de sa fenêtre (démonstration dans `grocery_waves.ts`). Ce
  // qu'il faut donc éprouver, c'est que les articles qui TIENNENT ne sont pas
  // déplacés du tout — ils sont déjà dans la première vague.
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    runs: 2,
    freezer: true,
    shoppingList: [
      { term: "lentilles", quantity: null, aisle: "pantry", food_group: "legumes" },
      { term: "fromage", quantity: null, aisle: "dairy", food_group: "dairy_cheese" },
      { term: "poisson", quantity: null, aisle: "protein", food_group: "white_fish" },
      { term: "poulet", quantity: null, aisle: "protein", food_group: "poultry" },
    ],
    preparations: [
      { id: "p1", cookOn: "mon", ingredientTerms: ["lentilles"] },
      // Le fromage tient 14 jours: il est acheté lundi quoi qu'il arrive.
      { id: "p2", cookOn: "sun", ingredientTerms: ["fromage"] },
      // Le poisson tient 1 jour, le poulet 2: leurs vagues tombent tard.
      { id: "p3", cookOn: "fri", ingredientTerms: ["poulet"] },
      { id: "p4", cookOn: "sun", ingredientTerms: ["poisson"] },
    ],
  });
  assertEquals(waves.length, 2, "deux courses demandées, deux vagues");
  const marked = waves.flatMap((w) => w.freezeOnPurchase.map((i) => i.term)).sort();
  // ⛔ LE FROMAGE ET LES LENTILLES NE SONT PAS MARQUÉS — non pas parce qu'un
  // contrôle les a épargnés, mais parce qu'ils n'ont jamais quitté la première
  // vague. C'est la forme juste de « ce qui tient n'est pas marqué ».
  assert(!marked.includes("fromage"), `fromage marqué à tort: ${marked.join(",")}`);
  assert(!marked.includes("lentilles"), `lentilles marquées à tort: ${marked.join(",")}`);
  // Et le repli a bien eu lieu: la troisième vague a été absorbée, son article
  // est marqué.
  assertEquals(marked, ["poisson"], "seul l'article de la vague absorbée est marqué");
  assertEquals(waveItemCount(waves), 4, "aucune ligne perdue");
  // ⛔ ET IL ATTERRIT SUR LA DERNIÈRE VAGUE GARDÉE, pas sur la première.
  // Une mutation qui reversait sur la première restait verte sans cette ligne.
  // Ce que ça change n'est pas CE QUI est congelé — le repli congèle tout ce
  // qu'il déplace, par construction — mais QUAND on l'achète: reverser sur la
  // première vague ferait acheter le poisson du dimanche dès le lundi, pour le
  // laisser six jours au congélateur au lieu de deux.
  assertEquals(
    waves[waves.length - 1].freezeOnPurchase.map((i) => i.term),
    ["poisson"],
    "l'article absorbé rejoint la vague la PLUS TARDIVE que la cadence autorise",
  );
  assertEquals(waves[0].freezeOnPurchase, []);
});

Deno.test("LOT C — la cadence NON DÉCLARÉE (`null`) ne replie rien", () => {
  // `null` est une valeur: « ni style ni nombre de courses ». La conservation
  // garde la main, exactement comme avant ce lot.
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    runs: null,
    freezer: true,
    shoppingList: TWO_LINES,
    preparations: LATE_COOK,
  });
  assertEquals(waves.length, 2);
  for (const w of waves) assertEquals(w.freezeOnPurchase, []);
});

Deno.test("⛔ LOT C — `runs` et `freezer` sont REQUIS, et l'oubli JETTE", () => {
  // Un paramètre de garde optionnel est une garde désarmée: un appelant qui se
  // tait obtiendrait le repli le plus permissif, en silence.
  for (const bad of [0, -1, Number.NaN, "2" as unknown as number]) {
    let threw = false;
    try {
      planGroceryWaves({
        startsOn: MONDAY,
        durationDays: 7,
        runs: bad,
        freezer: true,
        shoppingList: TWO_LINES,
        preparations: LATE_COOK,
      });
    } catch { threw = true; }
    assert(threw, `runs=${String(bad)} doit jeter`);
  }
  let threwFreezer = false;
  try {
    planGroceryWaves({
      startsOn: MONDAY,
      durationDays: 7,
      runs: 1,
      freezer: undefined as unknown as boolean,
      shoppingList: TWO_LINES,
      preparations: LATE_COOK,
    });
  } catch { threwFreezer = true; }
  assert(threwFreezer, "freezer manquant doit jeter");
});

Deno.test("⛔ LOT C — `freezeIndices` est un SOUS-ENSEMBLE de `indices`", () => {
  const got = waveAssignments({
    startsOn: MONDAY,
    durationDays: 7,
    runs: 1,
    freezer: true,
    shoppingList: TWO_LINES,
    preparations: LATE_COOK,
  });
  assertEquals(got.length, 1);
  assertEquals(got[0].indices, [0, 1]);
  // Le poulet est en position 1 de la liste d'origine.
  assertEquals(got[0].freezeIndices, [1]);
  for (const i of got[0].freezeIndices) {
    assert(got[0].indices.includes(i), `${i} doit être dans indices`);
  }
});

Deno.test("⛔ LOT C — LA SALADE NE SE CONGÈLE PAS, et sa vague survit", () => {
  // ⟳ TROUVÉ SUR UN TIR RÉEL (2026-09-04, 22h03), pas en relecture. Le premier
  // plan replié a rendu « salade verte — à congeler ». Une instruction fausse
  // est pire qu'une absente: elle apprend à ignorer les autres, y compris celle
  // qui portait sur le poisson juste au-dessus.
  const waves = planGroceryWaves({
    startsOn: MONDAY,
    durationDays: 7,
    runs: 1,
    freezer: true,
    shoppingList: [
      { term: "lentilles", quantity: null, aisle: "pantry", food_group: "legumes" },
      { term: "salade verte", quantity: null, aisle: "produce", food_group: "leafy_greens" },
      { term: "poisson", quantity: null, aisle: "protein", food_group: "white_fish" },
    ],
    preparations: [
      { id: "p1", cookOn: "mon", ingredientTerms: ["lentilles"] },
      { id: "p2", cookOn: "sat", ingredientTerms: ["salade verte"] },
      { id: "p3", cookOn: "sat", ingredientTerms: ["poisson"] },
    ],
  });
  const marked = waves.flatMap((w) => w.freezeOnPurchase.map((i) => i.term));
  assert(!marked.includes("salade verte"), `salade marquée à tort: ${marked.join(",")}`);
  assert(marked.includes("poisson"), "le poisson, lui, se congèle très bien");
  // ⛔ ET LA VAGUE SURVIT: la cadence demandée cède devant la physique, et le
  // refus se COMPTE. Sans `keptForFreshness`, la personne verrait une course de
  // plus sans savoir pourquoi.
  assertEquals(waves.length, 2, "une course demandée, deux vagues — et c'est juste");
  const kept = waves.flatMap((w) => w.keptForFreshness.map((i) => i.term));
  assertEquals(kept, ["salade verte"]);
});

Deno.test("⛔ LOT C — la liste des incongelables, sur les groupes qu'elle peut ATTEINDRE", () => {
  // ⚠️ ET LA MOITIÉ DE LA LISTE EST INATTEIGNABLE PAR CE CHEMIN, écrit ici
  // plutôt que masqué par un test qui n'éprouverait rien. Seul un aliment dont
  // la fenêtre crue est COURTE forme une vague tardive, donc seul lui peut être
  // absorbé par un repli, donc seul lui peut être marqué:
  //
  //     leafy_greens 3 j  → atteignable, et c'est le cas mesuré en réel
  //     dairy_yogurt 7 j  → jamais déplacé sur une fenêtre de 7 jours
  //     eggs        21 j  → jamais déplacé
  //
  // Les deux derniers sont dans `NOT_FREEZABLE` par prudence, pas par mesure.
  // Ils y coûtent zéro et protègent d'une fenêtre plus longue un jour.
  for (const [group, freezable] of [
    ["leafy_greens", false],
    ["white_fish", true],
    ["poultry", true],
    ["red_meat", true],
  ] as const) {
    const waves = planGroceryWaves({
      startsOn: MONDAY,
      durationDays: 7,
      runs: 1,
      freezer: true,
      shoppingList: [
        { term: "lentilles", quantity: null, aisle: "pantry", food_group: "legumes" },
        { term: "sujet", quantity: null, aisle: "produce", food_group: group },
      ],
      preparations: [
        { id: "p1", cookOn: "mon", ingredientTerms: ["lentilles"] },
        { id: "p2", cookOn: "sat", ingredientTerms: ["sujet"] },
      ],
    });
    const marked = waves.flatMap((w) => w.freezeOnPurchase.map((i) => i.term));
    assertEquals(marked.includes("sujet"), freezable, `${group} → ${marked.join(",")}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LES VAGUES ÉCRITES DISENT — 2026-09-09
//
// ⛔ LE CAS RAPPORTÉ (poul, brouillon du 2026-09-08): « ce qui se cuisine
// dimanche s'achète au plus près de ce jour-là » sur une dinde prise à la
// PREMIÈRE course et congelée en rentrant. La phrase venait de
// `rawKeepingBreaches`, qui ne sait pas ce que ce module a fait de l'article.
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ describeWrittenWaves — la dinde congelée n'est PAS « achetée plus tard », le persil oui", () => {
  const out = describeWrittenWaves({
    window: ["wed", "thu", "fri", "sat", "sun", "mon"],
    shoppingList: [
      { term: "dinde hachée", buy_on: "2026-09-09", freeze_on_purchase: true },
      { term: "persil", buy_on: "2026-09-10", freeze_on_purchase: false },
      { term: "cuisses de poulet désossées", buy_on: "2026-09-09", freeze_on_purchase: false },
      { term: "huile d’olive", buy_on: "2026-09-09", freeze_on_purchase: false },
    ],
    preparations: [
      { id: "prep_turkey_meatballs", cookOn: "sun", ingredientTerms: ["dinde hachée", "persil", "huile d’olive"] },
      { id: "prep_chicken", cookOn: "fri", ingredientTerms: ["cuisses de poulet désossées"] },
      { id: "prep_roast_chicken", cookOn: "wed", ingredientTerms: ["cuisses de poulet désossées"] },
    ],
  });
  assertEquals(out.frozenAtPurchase, [
    { cookOn: "sun", buyOn: "2026-09-09", terms: ["dinde hachée"] },
  ]);
  // Le persil de dimanche est bien acheté après la première course.
  assertEquals(out.laterShopDays, ["sun"]);
  assertEquals(out.frozenPreparationIds, ["prep_turkey_meatballs"]);
});

Deno.test("describeWrittenWaves — un terme nourrit DEUX cuissons: les deux sont rattachées", () => {
  const out = describeWrittenWaves({
    window: ["mon", "tue", "wed", "thu", "fri"],
    shoppingList: [{ term: "poisson", buy_on: "2026-09-07", freeze_on_purchase: true }],
    preparations: [
      { id: "a", cookOn: "wed", ingredientTerms: ["Poisson"] },
      { id: "b", cookOn: "fri", ingredientTerms: ["poisson"] },
    ],
  });
  assertEquals(out.frozenAtPurchase.map((f) => f.cookOn), ["wed", "fri"]);
  assertEquals(out.frozenPreparationIds.sort(), ["a", "b"]);
});

Deno.test("describeWrittenWaves — sans date écrite, rien n'est inventé", () => {
  const out = describeWrittenWaves({
    window: ["mon", "tue"],
    shoppingList: [{ term: "x" }],
    preparations: [{ id: "p", cookOn: "tue", ingredientTerms: ["x"] }],
  });
  assertEquals(out, { frozenAtPurchase: [], laterShopDays: [], frozenPreparationIds: [] });
});
