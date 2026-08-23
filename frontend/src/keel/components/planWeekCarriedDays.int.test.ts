import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import PlanResult from "./plan/PlanResult";
import type {
  CookingSession,
  GeneratedDish,
  MealPreparation,
  ShoppingItem,
} from "../api/mealGeneration";
import { groupByDay, withDaysThatCarry } from "../lib/mealBuilderModel";
import { en } from "../i18n/en";

// ===========================================================================
// D3 (2026-08-18) — LA VUE SEMAINE MONTRE LE JOUR QUI PORTE, PAS SEULEMENT
// CELUI QUI NOURRIT.
//
// ⛔ LE DÉFAUT: `groupByDay` saute un jour sans plat, donc la vue SEMAINE ne
// rendait aucun bloc pour lui — et la SESSION DE CUISINE et la VAGUE DE
// COURSES de ce jour-là partaient avec. Le dimanche de grosse cuisson, celui
// qui remplit le frigo de toute la semaine, était invisible. La vue JOUR, elle,
// traitait déjà ce cas.
//
// ⚠️ ON REND ET ON LIT. Un test sur le seul modèle serait resté vert le jour
// où `PlanResult` continue de rendre `groups`: c'est exactement la forme du
// défaut — la règle existait ailleurs et personne ne la branchait ici.
//
// ⚠️ `.ts` ET `createElement`, PAS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait JAMAIS COLLECTÉ.
// ===========================================================================

/** Lundi 2026-08-17 → dimanche 2026-08-23. */
const STARTS_ON = "2026-08-17";
const DURATION = 7;

function dish(over: Partial<GeneratedDish> = {}): GeneratedDish {
  return {
    title: "Chicken and rice bowls",
    slot: "dinner",
    day: "mon",
    method: "",
    why: "",
    ingredients: [],
    uses: [],
    // ⚠️ `boxes: []` EST OBLIGATOIRE, ET LE `as GeneratedDish` PLUS BAS EST CE
    // QUI L'A CACHÉ: le cast fait taire tsc sur un champ manquant, et
    // `boxLinesForDish` lève alors un `TypeError` au montage — écran blanc.
    // Cette fixture ne met AUCUN contenant, exprès; mais elle doit le DIRE.
    boxes: [],
    same_day: null,
    member_id: null,
    ...over,
  } as GeneratedDish;
}

function session(over: Partial<CookingSession> = {}): CookingSession {
  return {
    day: "sun",
    preparation_ids: ["prep_roast"],
    run_through: "Roast the chicken, portion it into four boxes.",
    total_minutes: 75,
    ...over,
  };
}

function prep(over: Partial<MealPreparation> = {}): MealPreparation {
  return {
    id: "prep_roast",
    title: "Sunday roast",
    servings_made: 4,
    ingredients: [{ term: "salmon", quantity: "600 g" }],
    method: "",
    active_minutes: 20,
    total_minutes: 75,
    cook_on: "sun",
    boxes: [],
    ...over,
  } as unknown as MealPreparation;
}

function item(over: Partial<ShoppingItem> = {}): ShoppingItem {
  // `protein` est PÉRISSABLE: c'est ce qui autorise une seconde vague, donc
  // une vague qui tombe ailleurs que le premier jour du plan.
  return { term: "salmon", quantity: "600 g", aisle: "protein", ...over };
}

function decode(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function textOf(over: {
  dishes?: readonly GeneratedDish[];
  cookingSessions?: readonly CookingSession[];
  shoppingList?: readonly ShoppingItem[];
  preparations?: readonly MealPreparation[];
} = {}): string {
  return decode(renderToStaticMarkup(createElement(PlanResult, {
    dishes: over.dishes ?? [dish()],
    preparations: over.preparations ?? [],
    cookingSessions: over.cookingSessions ?? [],
    shoppingList: over.shoppingList ?? [],
    portions: [],
    startsOn: STARTS_ON,
    durationDays: DURATION,
    today: STARTS_ON,
    emptyLabel: "Tell me where to start above.",
    defaultView: "week",
  }))).replace(/<[^>]*>/g, "");
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * Le TITRE d'un bloc jour, et pas le bouton du rail ni l'en-tête de colonne:
 * ceux-là portent le jour ABRÉGÉ (`.slice(0, 3)` — « Sun »), le bloc porte le
 * jour ENTIER (« Sunday »). Chercher le nom entier suffit donc à ne compter
 * que les blocs.
 *
 * ⚠️ CETTE ÉQUIVALENCE EST TENUE PAR UN ROUGE, pas par un raisonnement: « la
 * moitié qui retient » ci-dessous exige l'ABSENCE de « Tuesday » sur une
 * semaine dont le rail nomme pourtant les sept jours. Le jour où un rail ou un
 * en-tête écrirait le nom entier, ce test tombe — et ce compteur avec lui.
 */
function blockHeadings(html: string, day: string): number {
  return occurrences(html, day);
}

describe("D3 · le modèle: `withDaysThatCarry`", () => {
  const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const groups = groupByDay([dish()], order);

  it("⛔ LE DÉFAUT — un jour SANS plat mais avec une session est rendu", () => {
    const out = withDaysThatCarry({
      groups,
      order,
      sessionDays: ["sun"],
      groceryDays: [],
    });
    expect(out.map((g) => g.day)).toEqual(["mon", "sun"]);
    expect(out[1].dishes).toEqual([]);
  });

  it("⛔ LE DÉFAUT — un jour SANS plat mais avec des courses est rendu", () => {
    const out = withDaysThatCarry({
      groups,
      order,
      sessionDays: [],
      groceryDays: ["thu"],
    });
    expect(out.map((g) => g.day)).toEqual(["mon", "thu"]);
  });

  it("⚠️ LA MOITIÉ QUI RETIENT — un jour TOTALEMENT vide reste absent", () => {
    const out = withDaysThatCarry({
      groups,
      order,
      sessionDays: [],
      groceryDays: [],
    });
    expect(out.map((g) => g.day), "la semaine se remplit de blocs muets")
      .toEqual(["mon"]);
  });

  it("l'ordre est celui du PLAN, pas le calendrier", () => {
    // Une composition faite un mercredi: `wed…sun` puis `mon, tue`.
    const planOrder = ["wed", "thu", "fri", "sat", "sun", "mon", "tue"];
    const out = withDaysThatCarry({
      groups: groupByDay([dish({ day: "tue" })], planOrder),
      order: planOrder,
      sessionDays: ["wed"],
      groceryDays: ["sun"],
    });
    expect(out.map((g) => g.day)).toEqual(["wed", "sun", "tue"]);
  });

  it("le groupe SANS jour reste en tête, et il n'est jamais dupliqué", () => {
    const out = withDaysThatCarry({
      groups: groupByDay([dish({ day: null }), dish()], order),
      order,
      sessionDays: ["sun"],
      groceryDays: [],
    });
    expect(out.map((g) => g.day)).toEqual([null, "mon", "sun"]);
  });

  it("un jour qui a DÉJÀ ses plats n'est pas rendu deux fois", () => {
    const out = withDaysThatCarry({
      groups,
      order,
      sessionDays: ["mon"],
      groceryDays: ["mon"],
    });
    expect(out.map((g) => g.day)).toEqual(["mon"]);
    expect(out[0].dishes.length, "les plats du jour ont été écrasés").toBe(1);
  });
});

describe("D3 · l'écran: la vue SEMAINE", () => {
  it("⛔ LE DÉFAUT MESURÉ — la session du dimanche se voit maintenant", () => {
    const html = textOf({
      dishes: [dish()],
      cookingSessions: [session()],
    });
    expect(html, "le titre du bloc du dimanche manque").toContain("Sunday");
    expect(html, "la session du jour n'est pas rendue")
      .toContain(en["meals.result.day_session"]);
  });

  it("⛔ LA VAGUE DE COURSES D'UN JOUR SANS REPAS SE VOIT AUSSI", () => {
    // `salmon` est périssable et sa cuisson est dimanche: la vague tombe
    // jeudi (cuisson − 3 jours de frigo), un jour qui n'a AUCUN plat.
    const html = textOf({
      dishes: [dish()],
      preparations: [prep()],
      shoppingList: [item(), item({ term: "rice", aisle: "pantry" })],
    });
    expect(html, "le bloc du jeudi manque").toContain("Thursday");
    expect(html).toContain(en["meals.result.day_groceries_one"]);
  });

  it("⚠️ LA MOITIÉ QUI RETIENT — les jours vides n'apparaissent pas", () => {
    const html = textOf({ dishes: [dish()] });
    // Le rail nomme les sept jours en ABRÉGÉ (« Mon », « Tue »…); seuls les
    // BLOCS portent le jour entier. Un seul bloc: lundi.
    expect(html).toContain("Monday");
    for (const day of ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]) {
      expect(html, `${day} est rendu alors qu'il ne porte rien`)
        .not.toContain(day);
    }
    expect(html).not.toContain("Sunday");
  });

  it("⚠️ UNE VAGUE VIDE N'OUVRE PAS DE JOUR — le bloc serait creux", () => {
    // Aucun article périssable ⇒ une seule vague, au premier jour du plan.
    // Rien ne doit ouvrir mardi..dimanche.
    const html = textOf({
      dishes: [dish()],
      preparations: [prep()],
      shoppingList: [item({ term: "rice", aisle: "pantry" })],
    });
    expect(html).not.toContain("Thursday");
    expect(html).not.toContain("Sunday");
  });

  it("⚠️ LE CAS QUI PASSE — une semaine pleine se rend comme avant", () => {
    const html = textOf({
      dishes: [dish(), dish({ day: "tue" }), dish({ day: "sun" })],
    });
    expect(html).toContain("Monday");
    expect(html).toContain("Tuesday");
    expect(html).toContain("Sunday");
    expect(html).not.toContain("Wednesday");
  });

  it("⚠️ AUCUN PLAT DU TOUT MAIS UNE SESSION ⇒ le plan n'est pas « vide »", () => {
    const html = textOf({ dishes: [], cookingSessions: [session()] });
    expect(html, "un plan qui a une session à faire se dit vide")
      .not.toContain("Tell me where to start above.");
    expect(html).toContain(en["meals.result.day_session"]);
  });

  it("⚠️ VRAIMENT RIEN ⇒ la phrase de l'appelant, inchangée", () => {
    const html = textOf({ dishes: [] });
    expect(html).toContain("Tell me where to start above.");
  });
});

describe("D3 · la vue JOUR ne change pas", () => {
  it("un jour choisi sans plat porte toujours sa session", () => {
    // C'est le comportement d'AVANT ce lot, et il ne doit pas bouger: la vue
    // jour rendait déjà le jour choisi même vide.
    const html = decode(renderToStaticMarkup(createElement(PlanResult, {
      dishes: [dish()],
      preparations: [],
      cookingSessions: [session({ day: "mon" })],
      shoppingList: [],
      portions: [],
      startsOn: STARTS_ON,
      durationDays: DURATION,
      today: STARTS_ON,
      emptyLabel: "Tell me where to start above.",
      defaultView: "day",
    }))).replace(/<[^>]*>/g, "");
    expect(html).toContain("Monday");
    expect(html).toContain(en["meals.result.day_session"]);
    // ⚠️ En vue jour, un SEUL bloc: celui du jour choisi.
    expect(blockHeadings(html, "Sunday")).toBe(0);
  });
});
