import { describe, expect, it } from "vitest";

import type { MealPreparation, ShoppingItem } from "./mealGeneration";
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
  return { term, quantity: null, aisle } as ShoppingItem;
}

function prep(id: string, cookOn: string | null, terms: string[]): MealPreparation {
  return {
    id,
    title: id,
    servings_made: 4,
    ingredients: terms.map((term) => ({ term, quantity: null, in_pantry: false })),
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
      { buyOn: "a", items: [], servesCookOn: null },
      { buyOn: "b", items: [], servesCookOn: null },
    ])).toBe(true);
  });

  it("une seule vague ne se montre pas", () => {
    // C'est la liste plate d'avant. Un en-tête « à acheter maintenant » posé
    // sur la totalité n'ajoute qu'un mot à lire.
    expect(wavesAreMeaningful([{ buyOn: "a", items: [], servesCookOn: null }])).toBe(false);
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
