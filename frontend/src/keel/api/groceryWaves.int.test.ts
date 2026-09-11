import { describe, expect, it } from "vitest";

import { type MealPreparation, readShopping, type ShoppingItem } from "./mealGeneration";
import {
  waveAssignments,
  planGroceryWaves,
  waveItemCount,
  wavesAreMeaningful,
} from "./groceryWaves";

// CE FICHIER NE TESTE PLUS UN JUMEAU — il n'y en a plus.
//
// La règle vit une seule fois, dans
// `supabase/functions/_shared/keel/grocery_waves.ts`, et ce sont ses propres
// tests Deno qui la couvrent. Ce qui reste ici est l'épreuve du BRANCHEMENT:
// que les types de l'écran (`ShoppingItem` au rayon `string`, `MealPreparation`
// en snake_case avec ses `ingredients`) traversent l'adaptateur et produisent
// les vagues attendues.
//
// Les cas gardent les noms de leurs jumeaux Deno exprès: si un jour les deux
// listes divergent, c'est que quelqu'un a réécrit une règle de ce côté-ci — le
// défaut que ce lot vient de retirer.

// Lundi 2026-08-03 → mon=03, tue=04, wed=05, thu=06, fri=07, sat=08, sun=09.
const MONDAY = "2026-08-03";

function item(term: string, aisle: string): ShoppingItem {
  // ⛔ LE `as ShoppingItem` A ÉTÉ RETIRÉ LE 2026-08-23, ET C'EST LA MOITIÉ DU
  // LOT. Ce fichier se déclare « l'épreuve du BRANCHEMENT » — et le cast le
  // dispensait précisément de vérifier la forme qu'il prétend brancher. Il est
  // resté vert pendant que `readShopping` laissait tomber `food_group`, donc
  // pendant que la date d'achat n'atteignait plus aucun écran. Un cast sur un
  // type étranger désarme le typecheck: si cette fonction ne compile plus, c'est
  // que `ShoppingItem` a bougé, et c'est exactement ce qu'on veut savoir.
  return { term, quantity: null, aisle, food_group: null, buy_on: null, freeze_on_purchase: false };
}


function prep(id: string, cookOn: string | null, terms: string[]): MealPreparation {
  return {
    id,
    title: id,
    servings_made: 4,
    // ⟳ 2026-09-11 — LES SIX CHAMPS STRUCTURÉS DU LOT C SONT REQUIS. Ce banc
    // ne mesure que les vagues de courses (le TERME et le jour de cuisson);
    // il les pose à vide plutôt que de les inventer, ce qui est aussi ce que
    // porte un plan d'avant le lot.
    ingredients: terms.map((term) => ({
      term,
      quantity: null,
      in_pantry: false,
      amount: null,
      unit: null,
      state: null,
      grams_raw: null,
      ref: null,
      ref_refused: false,
    })),
    method: "",
    active_minutes: null,
    total_minutes: null,
    cook_on: cookOn,
  };
}

describe("planGroceryWaves", () => {
  it("un plan de 7 jours avec une cuisson tardive produit DEUX vagues", () => {
    // LE CAS QUI JUSTIFIE LE MODULE. Le poulet du vendredi ne s'achète pas le
    // lundi: il ne tiendrait pas. Toutes les apps de la catégorie sortent une
    // liste unique — c'est exactement ce qu'on ne fait pas.
    const waves = planGroceryWaves({
      startsOn: MONDAY,
      durationDays: 7,
      shoppingList: [
        item("lentilles", "pantry"),
        item("carottes", "produce"),
        item("poulet", "protein"),
      ],
      preparations: [
        prep("p1", "mon", ["lentilles", "carottes"]),
        prep("p2", "fri", ["poulet"]),
      ],
    });
    expect(waves).toHaveLength(2);
    expect(waves[0].buyOn).toBe(MONDAY);
    expect(waves[1].buyOn).toBe("2026-08-04");
    expect(waves[1].items.map((i) => i.term)).toEqual(["poulet"]);
    expect(waves[1].servesCookOn).toBe("2026-08-07");
  });

  it("un plan court ne produit qu'UNE vague", () => {
    const waves = planGroceryWaves({
      startsOn: MONDAY,
      durationDays: 3,
      shoppingList: [item("poulet", "protein")],
      preparations: [prep("p1", "wed", ["poulet"])],
    });
    expect(waves).toHaveLength(1);
    expect(waves[0].servesCookOn).toBeNull();
  });

  it("l'épicerie ne part JAMAIS en seconde vague", () => {
    // Elle se garde. Envoyer quelqu'un racheter du riz en milieu de semaine
    // serait une corvée inventée, et le produit promet d'en retirer.
    const waves = planGroceryWaves({
      startsOn: MONDAY,
      durationDays: 7,
      shoppingList: [item("riz", "grains")],
      preparations: [prep("p1", "sat", ["riz"])],
    });
    expect(waves).toHaveLength(1);
  });

  it("le surgelé se garde: première vague", () => {
    const waves = planGroceryWaves({
      startsOn: MONDAY,
      durationDays: 7,
      shoppingList: [item("petits pois surgelés", "frozen")],
      preparations: [prep("p1", "sun", ["petits pois surgelés"])],
    });
    expect(waves).toHaveLength(1);
    expect(waves[0].buyOn).toBe(MONDAY);
  });

  it("un ingrédient utilisé DEUX fois suit la cuisson la plus précoce", () => {
    // Acheter pour la seconde cuisson ferait rater la première, et le piège se
    // referme en silence: la liste est complète, mais mardi il manque le poulet.
    const waves = planGroceryWaves({
      startsOn: MONDAY,
      durationDays: 7,
      shoppingList: [item("poulet", "protein")],
      preparations: [prep("p1", "sat", ["poulet"]), prep("p2", "tue", ["poulet"])],
    });
    expect(waves).toHaveLength(1);
    expect(waves[0].buyOn).toBe(MONDAY);
  });

  it("RIEN NE DISPARAÎT — un terme non rattaché part en première vague", () => {
    const shoppingList = [
      item("poulet", "protein"),
      item("un truc que personne ne cuisine", "produce"),
      item("sel", "pantry"),
    ];
    const waves = planGroceryWaves({
      startsOn: MONDAY,
      durationDays: 7,
      shoppingList,
      preparations: [prep("p1", "sat", ["poulet"])],
    });
    expect(waveItemCount(waves)).toBe(shoppingList.length);
    expect(waves[0].items.some((i) => i.term === "un truc que personne ne cuisine")).toBe(true);
  });

  it("aucune préparation datée: tout en première vague, rien de perdu", () => {
    const waves = planGroceryWaves({
      startsOn: MONDAY,
      durationDays: 7,
      shoppingList: [item("poulet", "protein"), item("riz", "grains")],
      preparations: [prep("p1", null, ["poulet", "riz"])],
    });
    expect(waves).toHaveLength(1);
    expect(waveItemCount(waves)).toBe(2);
  });

  it("le rapprochement tolère la casse et les accents", () => {
    const waves = planGroceryWaves({
      startsOn: MONDAY,
      durationDays: 7,
      shoppingList: [item("Épinards", "produce")],
      preparations: [prep("p1", "fri", ["epinards"])],
    });
    expect(waves[0].buyOn).toBe("2026-08-04");
  });

  it("une liste vide ne produit aucune vague", () => {
    expect(
      planGroceryWaves({
        startsOn: MONDAY, durationDays: 7, shoppingList: [], preparations: [],
      }),
    ).toEqual([]);
  });

  it("SANS FENÊTRE, aucune vague — on ne devine pas une date d'achat", () => {
    // Propre au front: une ligne lue avant `20260807090000_meal_plan_window`
    // n'a pas de `starts_on`. Inventer une date enverrait quelqu'un faire ses
    // courses un jour qui n'est écrit nulle part.
    expect(
      planGroceryWaves({
        startsOn: "", durationDays: 7,
        shoppingList: [item("poulet", "protein")],
        preparations: [],
      }),
    ).toEqual([]);
  });
});

describe("wavesAreMeaningful — une seule vague ne se montre pas", () => {
  it("deux vagues se montrent", () => {
    expect(wavesAreMeaningful([
      { buyOn: "a", items: [], servesCookOn: null, servesCookDates: [] },
      { buyOn: "b", items: [], servesCookOn: null, servesCookDates: [] },
    ])).toBe(true);
  });

  it("une seule vague ne se montre pas", () => {
    // C'est la liste plate d'avant. Un en-tête « à acheter maintenant » posé
    // sur la totalité n'ajoute qu'un mot à lire.
    expect(wavesAreMeaningful([{ buyOn: "a", items: [], servesCookOn: null, servesCookDates: [] }])).toBe(false);
    expect(wavesAreMeaningful([])).toBe(false);
  });
});

describe("waveAssignments — les index d'origine, pour ne pas casser les ratures", () => {
  const shoppingList = [
    item("lentilles", "pantry"),
    item("poulet", "protein"),
    item("carottes", "produce"),
  ];
  const preparations = [
    prep("p1", "mon", ["lentilles"]),
    prep("p2", "fri", ["poulet"]),
  ];

  it("rend des INDEX, jamais des copies d'articles", () => {
    // `ShoppingListPanel` identifie une rature par son index dans la liste
    // d'origine. Rendre des sous-listes obligerait à réindexer, donc à faire
    // sauter une rature dès que la vague change de taille.
    const got = waveAssignments({
      startsOn: MONDAY, durationDays: 7, shoppingList, preparations,
    });
    expect(got).toHaveLength(2);
    expect(got[0].indices).toEqual([0, 2]);
    expect(got[1].indices).toEqual([1]);
  });

  it("DEUX ARTICLES AU MÊME TERME reçoivent DEUX index différents", () => {
    // Le piège de l'appariement par terme: deux lignes « poulet » (la cuisse
    // et le blanc) se verraient attribuer le même index, et cocher l'une
    // rayerait l'autre.
    const doubled = [
      item("poulet", "protein"),
      item("poulet", "protein"),
    ];
    const got = waveAssignments({
      startsOn: MONDAY, durationDays: 7,
      shoppingList: doubled,
      preparations: [prep("p1", "fri", ["poulet"])],
    });
    const all = got.flatMap((w) => w.indices).sort();
    expect(all).toEqual([0, 1]);
  });

  it("chaque index apparaît EXACTEMENT une fois — rien perdu, rien doublé", () => {
    const got = waveAssignments({
      startsOn: MONDAY, durationDays: 7, shoppingList, preparations,
    });
    const all = got.flatMap((w) => w.indices).sort((a, b) => a - b);
    expect(all).toEqual([0, 1, 2]);
  });

  it("sans fenêtre, aucune affectation", () => {
    expect(waveAssignments({
      startsOn: "", durationDays: 7, shoppingList, preparations,
    })).toEqual([]);
  });
});

// ===========================================================================
// LA COUTURE QUI MANQUAIT — de la charge JSON jusqu'à la date d'achat.
//
// ⛔ CE QUI EST TESTÉ ICI N'EST PAS LA RÈGLE DES VAGUES (elle vit côté Deno),
// C'EST LE TRAJET DU CHAMP. `readShopping` ne recopiait pas `food_group`;
// `WaveItem.food_group` étant facultatif, la structure restait satisfaite et
// AUCUN test ne rougissait. Mesuré sur 10 plans réels le 2026-08-23: tous les
// articles retombaient sur `MAX_FRIDGE_DAYS`, il n'y avait plus qu'une vague, et
// `wavesAreMeaningful` la masquait — la liste de courses ne portait aucun jour.
//
// ⚠️ ON PART DE LA CHARGE BRUTE, PAS D'UN `ShoppingItem` FABRIQUÉ. Construire
// l'objet à la main ici testerait le lecteur qu'on vient d'écrire contre
// lui-même. C'est `shopping_list` tel que la fonction edge le rend.
// ===========================================================================

describe("readShopping → waveAssignments (la couture)", () => {
  /** `shopping_list` tel que `mealShoppingPayload` l'écrit. */
  const payload = [
    { term: "lentilles", quantity: "300 g", aisle: "pantry", food_group: "legumes", buy_on: null, freeze_on_purchase: false },
    { term: "poulet", quantity: "1 kg", aisle: "protein", food_group: "poultry", buy_on: null, freeze_on_purchase: false },
  ];
  const cook = [prep("p1", "mon", ["lentilles"]), prep("p2", "fri", ["poulet"])];

  it("le groupe traverse le lecteur et fixe la date d'achat", () => {
    const list = readShopping(payload);
    expect(list.map((i) => i.food_group)).toEqual(["legumes", "poultry"]);

    // `poultry` tient 2 jours cru ⇒ vendredi 07 − 2 = mercredi 05.
    const waves = waveAssignments({
      startsOn: MONDAY, durationDays: 7, shoppingList: list, preparations: cook,
    });
    expect(waves).toHaveLength(2);
    expect(waves[1].buyOn).toBe("2026-08-05");
  });

  it("MUTATION — sans le groupe, la date recule et il n'y a plus qu'une vague à montrer", () => {
    // ⛔ C'EST LE DÉFAUT D'HIER, REJOUÉ. On retire le champ de la charge (ce que
    // fait un plan écrit avant `L0-a`, et ce que faisait `readShopping` pour
    // TOUT LE MONDE): `rawWindowDaysFor(null)` rend `null`, le repli
    // `MAX_FRIDGE_DAYS = 3` s'applique, et le poulet remonte au mardi 04.
    const sansGroupe = payload.map(({ food_group: _drop, ...rest }) => rest);
    const list = readShopping(sansGroupe);
    expect(list.map((i) => i.food_group)).toEqual([null, null]);

    const waves = waveAssignments({
      startsOn: MONDAY, durationDays: 7, shoppingList: list, preparations: cook,
    });
    expect(waves[1].buyOn).toBe("2026-08-04");
    // ⚠️ ET LA DIFFÉRENCE EST VISIBLE À L'ŒIL: un jour d'écart sur le même plan.
    // Si un jour ces deux dates redeviennent égales, c'est que le champ ne
    // traverse plus — et c'est ce test-ci qui doit le dire, pas un run réel.
    expect(waves[1].buyOn).not.toBe("2026-08-05");
  });
});
