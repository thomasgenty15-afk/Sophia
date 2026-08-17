import { describe, expect, it } from "vitest";

import {
  MEAL_COLUMNS,
  readDishes,
  readMealRow,
  readMemberPortions,
} from "./mealGeneration";
import { readDraftPlan } from "./planDraft";

// ===========================================================================
// LOT 3 (2026-08-17) — CE QUI ARRIVE JUSQU'À L'ÉCRAN, SUR LA VALEUR
//
// ⚠️ CES TESTS LISENT DES VALEURS, PAS DES LITTÉRAUX DE SOURCE. C'est la
// leçon mesurée du LOT 1: `shoppingList={draft.shoppingList}` restait VERT
// pendant que le lecteur du brouillon rendait `[]` en dur. Un champ que le
// serveur écrit et qu'un lecteur jette est indiscernable d'un champ qui
// n'existe pas — des deux côtés, l'écran se tait.
//
// Deux champs sont en jeu ici, et tous deux étaient dans ce cas:
//   · `dishes[].member_id`      — écrit depuis le lot C du 2026-08-15
//   · `member_portions`         — rendu par la branche `isDraft` du foyer
// ===========================================================================

/** Un plat brut, tel qu'il sort de la colonne `dishes` (jsonb). */
function rawDish(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Greek yogurt bowls with peaches",
    slot: "breakfast",
    day: "fri",
    method: "Spoon the yogurt into bowls.",
    why: "",
    ingredients: [],
    uses: [],
    ...over,
  };
}

describe("LOT 3 · l'attribution d'un plat arrive jusqu'à l'écran", () => {
  it("⛔ `member_id` est LU — le champ existait en base et se perdait ici", () => {
    const [dish] = readDishes([rawDish({ member_id: "mem-zoe" })]);
    expect(
      dish.member_id,
      "le plat dédié arrive sans son attribution: la vue jour ne peut plus " +
        "séparer ce qui se prépare pour qui",
    ).toBe("mem-zoe");
  });

  it("absent ou vide ⇒ `null`, c'est-à-dire le plat de la table", () => {
    expect(readDishes([rawDish()])[0].member_id).toBeNull();
    // Une chaîne vide n'est PAS une bouche: attribuée telle quelle, elle ferait
    // chercher à l'écran un membre qui n'existe pas.
    expect(readDishes([rawDish({ member_id: "   " })])[0].member_id).toBeNull();
    expect(readDishes([rawDish({ member_id: null })])[0].member_id).toBeNull();
  });

  /**
   * ⛔ LE TEST QUI TOMBE SI UN MATCHER REVIENT.
   *
   * Les deux plats portent le MÊME titre, et ce titre nomme « Zoe ». Le seul
   * qui soit attribué est celui qui porte `member_id` — l'autre est le plat de
   * la table, quoi que son titre raconte. Un lecteur qui déduirait
   * l'attribution du texte rendrait ici DEUX plats attribués (ou deux à la
   * mauvaise bouche): « jamais de matcher maison », 12 faux positifs sur 12
   * mesurés, et celui-ci se tromperait aussi dès « Chicken for Zoe and Marc ».
   */
  it("⛔ le titre ne décide de RIEN — deux titres identiques, une seule attribution", () => {
    const same = "Greek yogurt bowls with peaches, granola and seeds for Zoe";
    const dishes = readDishes([
      rawDish({ title: same, member_id: "mem-zoe" }),
      rawDish({ title: same }),
    ]);
    expect(dishes[0].member_id).toBe("mem-zoe");
    expect(
      dishes[1].member_id,
      "un prénom lu dans le titre a attribué un plat commun",
    ).toBeNull();
  });
});

describe("LOT 3 · `member_portions`, un seul lecteur, deux surfaces", () => {
  const raw = [
    {
      member_id: "mem-zoe",
      display_name: "Zoé",
      portion_note: "Take a bigger portion of chicken and rice.",
      preparation_shares: [
        { preparation_id: "prep_chicken", note: "2 portions of chicken" },
        // Une part sans texte ne dirait rien à côté d'un plat: elle tombe.
        { preparation_id: "prep_rice", note: "" },
      ],
    },
    // Une bouche sans `member_id` n'est jointe à rien: elle tombe.
    { display_name: "Personne", preparation_shares: [] },
  ];

  it("le prénom vient de la LIGNE MEMBRE, recopiée par le moteur (F5)", () => {
    const [zoe, ...rest] = readMemberPortions(raw);
    expect(zoe.displayName).toBe("Zoé");
    expect(zoe.memberId).toBe("mem-zoe");
    expect(rest, "une bouche sans identifiant est passée").toHaveLength(0);
  });

  it("les parts sans texte tombent, les autres gardent leur `preparation_id`", () => {
    const [zoe] = readMemberPortions(raw);
    expect(zoe.shares).toEqual([
      { preparationId: "prep_chicken", note: "2 portions of chicken" },
    ]);
  });

  /**
   * ⛔ LA COLONNE ET SON LECTEUR, TESTÉS ENSEMBLE.
   *
   * `MEAL_COLUMNS` est la chaîne RÉELLEMENT envoyée à PostgREST — pas une
   * copie. Sans `member_portions` dedans, `readMealRow` reçoit `undefined` et
   * rend `[]` sans un seul rouge: le lecteur est correct, la donnée n'arrive
   * jamais. C'est le défaut exact du LOT 1, déplacé d'un cran en amont.
   */
  it("⛔ le plan ÉCRIT porte ses parts — la colonne est demandée, et relue", () => {
    expect(
      MEAL_COLUMNS.split(/[\s,]+/),
      "`member_portions` n'est pas demandée à PostgREST",
    ).toContain("member_portions");
    // Le compagnon qui PASSE: si cette assertion tombait, c'est la découpe de
    // la chaîne qui serait fausse, pas la colonne.
    expect(MEAL_COLUMNS.split(/[\s,]+/)).toContain("dishes");

    const plan = readMealRow({
      id: "plan-1",
      plan_kind: "household",
      starts_on: "2026-08-20",
      duration_days: 7,
      dishes: [rawDish({ member_id: "mem-zoe" })],
      member_portions: raw,
    });
    expect(plan.memberPortions.map((p) => p.displayName)).toEqual(["Zoé"]);
    expect(plan.dishes[0].member_id).toBe("mem-zoe");
  });

  /**
   * ⛔ C8 — L'APERÇU REND LE MÊME CORPS DE PLAN.
   *
   * Le serveur rend `member_portions` sur `intent: "draft"` sans en écrire
   * aucune. Si le lecteur du brouillon la jetait, la séparation par personne
   * existerait sur le plan adopté et pas à l'aperçu — le défaut que 1B a
   * mesuré sur la liste de courses, à l'identique.
   */
  it("⛔ l'APERÇU porte ses parts et ses attributions, comme le plan écrit", () => {
    const draft = readDraftPlan({
      window: { starts_on: "2026-08-20", duration_days: 7 },
      dishes: [rawDish({ member_id: "mem-zoe" })],
      member_portions: raw,
    });
    expect(
      draft.memberPortions.map((p) => p.memberId),
      "l'aperçu jette les parts que le serveur lui rend",
    ).toEqual(["mem-zoe"]);
    expect(draft.dishes[0].member_id).toBe("mem-zoe");
  });

  it("⚠️ LE CAS QUI PASSE — la lane individuelle n'en rend aucune, et ce n'est pas un manque", () => {
    // `generate-meal-v1` n'écrit AUCUNE `member_portions`: le champ est absent
    // du payload, et le lecteur doit rendre `[]` — jamais inventer une bouche.
    const draft = readDraftPlan({
      window: { starts_on: "2026-08-20", duration_days: 7 },
      dishes: [rawDish()],
    });
    expect(draft.memberPortions).toEqual([]);
    expect(draft.dishes[0].member_id).toBeNull();
  });
});
