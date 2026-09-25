import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import DishCard from "./DishCard";
import { BoxTable } from "./plan/BoxTable";
import {
  DISH_SIDE_COURSE_KINDS,
  DISH_SIDE_COURSE_SOURCES,
  type GeneratedDish,
  type MemberPortionView,
  readDishes,
  readShopping,
} from "../api/mealGeneration";
import {
  boxLinesForDish,
  boxLinesForSession,
  looseSideLinesForDish,
} from "../lib/mealBoxes";
import { ingredientQuantityText } from "../lib/ingredientQuantity";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";
import { setChosenUiLocaleForTest } from "../i18n/runtime";
import {
  SIDE_COURSE_KINDS,
  SIDE_COURSE_SOURCES,
} from "../../../../supabase/functions/_shared/keel/side_courses_types.ts";

// ===========================================================================
// ⟳ 2026-09-23 — LES À-CÔTÉS À L'ÉCRAN: « À CÔTÉ », SOUS LA BONNE BOÎTE.
//
// Le moteur range les à-côtés d'une personne sous le plat qui la sert, dans
// `dishes[i].side_courses[]` (`attachSideCourses`). Ce fichier tient ce que la
// personne LIT:
//   ① le lecteur recopie la clé, strictement (une entrée invalide tombe seule);
//   ② la ligne « À côté » est sous SA boîte à elle, et sous un bac commun elle
//      porte son prénom (« Christèle : 1 × yaourt nature »), en fr et en en;
//   ③ le poids du plat n'inclut jamais l'à-côté;
//   ④ au Boxing, seule une entrée tirée d'une casserole (une soupe) apparaît,
//      comme n'importe quelle part de marmite;
//   ⑤ un plan d'avant ce lot se rend exactement comme avant;
//   ⑥ rien ne dit d'où vient l'aliment.
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` ne collecte
// que `src/**/*.int.test.ts`. Les nombres sont écrits EN DUR.
// ===========================================================================

const THOMAS = "mem-thomas";
const CHRISTELE = "mem-christele";
const FABRICE = "mem-fabrice";

function person(memberId: string, displayName: string): MemberPortionView {
  return { memberId, displayName, portionNote: null, eatingSlots: null, shares: [] };
}

/** L'ORDRE DU ROSTER — celui des prénoms sur les couvercles et les lignes. */
const ROSTER = [
  person(THOMAS, "Thomas"),
  person(CHRISTELE, "Christèle"),
  person(FABRICE, "Fabrice"),
];

/** Un déjeuner de jeudi: la boîte de Thomas seul, le bac commun des deux autres. */
function lunchPayload(sideCourses: unknown): Record<string, unknown> {
  const dish: Record<string, unknown> = {
    title: "Poulet, riz et courgettes",
    name: "Poulet au riz",
    slot: "lunch",
    day: "thu",
    method: "",
    why: "",
    ingredients: [],
    uses: [{ preparation_id: "prep_chicken", servings: 3, kept: "fridge" }],
    boxes: [
      {
        id: "box_thu_lunch_thomas",
        member_ids: [THOMAS],
        items: [
          { preparation_id: "prep_chicken", term: "poulet rôti", grams: 300 },
          { preparation_id: "prep_rice", term: "riz", grams: 200 },
        ],
      },
      {
        id: "box_thu_lunch_table",
        member_ids: [FABRICE, CHRISTELE],
        items: [
          { preparation_id: "prep_chicken", term: "poulet rôti", grams: 400 },
          { preparation_id: "prep_rice", term: "riz", grams: 300 },
        ],
      },
    ],
    same_day: { kind: "reheat_only", minutes: 5 },
    member_id: null,
  };
  if (sideCourses !== undefined) dish.side_courses = sideCourses;
  return dish;
}

/** Les à-côtés du déjeuner, dans la forme exacte de `DishSideCoursePayload`. */
const LUNCH_SIDES = [
  {
    member_id: THOMAS,
    kind: "cheese",
    term: "comté",
    ref: null,
    grams: 30,
    unit_count: null,
    preparation_id: null,
    source: "model",
  },
  {
    member_id: THOMAS,
    kind: "dessert",
    term: "pomme",
    ref: "apple",
    grams: 150,
    unit_count: 1,
    preparation_id: null,
    source: "engine_fallback",
  },
  {
    member_id: CHRISTELE,
    kind: "dessert",
    term: "yaourt nature",
    ref: "plain_yogurt",
    grams: 125,
    unit_count: 1,
    preparation_id: null,
    source: "engine_fallback",
  },
  {
    member_id: FABRICE,
    kind: "starter",
    term: "soupe de courgettes",
    ref: null,
    grams: 250,
    unit_count: null,
    preparation_id: "prep_soup",
    source: "model",
  },
];

function lunch(sideCourses: unknown = LUNCH_SIDES): GeneratedDish {
  const [d] = readDishes([lunchPayload(sideCourses)]);
  return d;
}

/**
 * LE MÊME DÉJEUNER, ÉCRIT AVANT CE LOT: la clé `side_courses` n'existe pas.
 * ⚠️ Pas `lunch(undefined)`: un `undefined` explicite prend la valeur par défaut.
 */
function oldLunch(): GeneratedDish {
  const payload = lunchPayload(undefined);
  expect("side_courses" in payload).toBe(false);
  return readDishes([payload])[0];
}

function decode(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function markup(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return decode(renderToStaticMarkup(node));
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * ⟳ 2026-09-25 — LA LIGNE « À CÔTÉ » DU TITRE, À PLAT: le libellé est un
 * `<span>` en encre pleine, les aliments suivent. On retire ce `<span>` pour
 * lire la phrase entière d'un seul tenant.
 */
function flatSides(html: string): string {
  return html.replace(/<span class="font-medium text-ink">([^<]*)<\/span> /g, "$1 ");
}

/** La source d'un fichier, commentaires retirés — patron du dépôt. */
function code(rel: string): string {
  return readFileSync(resolve(__dirname, rel), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** `uiLocale()` lit le chemin courant: `/app/plan` est l'écran des boîtes. */
function atLocale(locale: "en" | "fr"): void {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: "/app/plan", search: "", href: "http://localhost/app/plan" },
    configurable: true,
    writable: true,
  });
  setChosenUiLocaleForTest(locale);
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "location");
  setChosenUiLocaleForTest("en");
});

function dishCard(dish: GeneratedDish, extra: Record<string, unknown> = {}): string {
  return markup(createElement(DishCard, {
    dish,
    slotBadge: false,
    boxes: boxLinesForDish(dish, ROSTER),
    ...extra,
  }));
}

// ---------------------------------------------------------------------------
// ① LE LECTEUR
// ---------------------------------------------------------------------------

describe("readDishes lit `side_courses`", () => {
  it("recopie chaque champ de la charge, tel quel", () => {
    const d = lunch();
    expect(d.side_courses).toEqual([
      {
        member_id: THOMAS,
        kind: "cheese",
        term: "comté",
        ref: null,
        grams: 30,
        unit_count: null,
        preparation_id: null,
        source: "model",
      },
      {
        member_id: THOMAS,
        kind: "dessert",
        term: "pomme",
        ref: "apple",
        grams: 150,
        unit_count: 1,
        preparation_id: null,
        source: "engine_fallback",
      },
      {
        member_id: CHRISTELE,
        kind: "dessert",
        term: "yaourt nature",
        ref: "plain_yogurt",
        grams: 125,
        unit_count: 1,
        preparation_id: null,
        source: "engine_fallback",
      },
      {
        member_id: FABRICE,
        kind: "starter",
        term: "soupe de courgettes",
        ref: null,
        grams: 250,
        unit_count: null,
        preparation_id: "prep_soup",
        source: "model",
      },
    ]);
  });

  it("absent, `null` ou pas un tableau ⇒ `[]`", () => {
    expect(oldLunch().side_courses).toEqual([]);
    expect(lunch(null).side_courses).toEqual([]);
    expect(lunch({ member_id: THOMAS }).side_courses).toEqual([]);
  });

  it("⛔ lecteur strict: chaque entrée invalide tombe SEULE, la valide reste", () => {
    const valid = LUNCH_SIDES[2];
    const d = lunch([
      null,
      "yaourt",
      { ...valid, member_id: "" },
      { ...valid, member_id: 12 },
      { ...valid, kind: "soup" },
      { ...valid, source: "coach" },
      { ...valid, term: "   " },
      { ...valid, grams: 0 },
      { ...valid, grams: "125" },
      { ...valid, grams: 0.4 },
      { ...valid, unit_count: 0 },
      { ...valid, unit_count: 1.5 },
      { ...valid, unit_count: "1" },
      valid,
    ]);
    expect(d.side_courses.length).toBe(1);
    expect(d.side_courses[0].term).toBe("yaourt nature");
  });

  it("un `ref` ou un `preparation_id` vide vaut `null`; les grammes s'arrondissent", () => {
    const d = lunch([{ ...LUNCH_SIDES[0], ref: "", preparation_id: "  ", grams: 29.6 }]);
    expect(d.side_courses).toEqual([{
      member_id: THOMAS,
      kind: "cheese",
      term: "comté",
      ref: null,
      grams: 30,
      unit_count: null,
      preparation_id: null,
      source: "model",
    }]);
  });

  it("les deux vocabulaires sont ceux du moteur (recopiés, pas importés)", () => {
    expect([...DISH_SIDE_COURSE_KINDS]).toEqual(["starter", "cheese", "dessert", "bread"]);
    expect([...DISH_SIDE_COURSE_KINDS]).toEqual([...SIDE_COURSE_KINDS]);
    expect([...DISH_SIDE_COURSE_SOURCES]).toEqual(["model", "engine_fallback"]);
    expect([...DISH_SIDE_COURSE_SOURCES]).toEqual([...SIDE_COURSE_SOURCES]);
  });

  it("`DishSideCourse` a exactement les champs de `DishSideCoursePayload`", () => {
    const fieldsOf = (src: string, head: string) => {
      const start = src.indexOf(head);
      expect(start, head).toBeGreaterThan(-1);
      const body = src.slice(start + head.length, src.indexOf("\n}", start));
      return [...body.matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1]).sort();
    };
    const engine = fieldsOf(
      code("../../../../supabase/functions/_shared/keel/side_courses_types.ts"),
      "export interface DishSideCoursePayload {",
    );
    const front = fieldsOf(code("../api/mealGeneration.ts"), "export interface DishSideCourse {");
    expect(engine).toEqual([
      "grams",
      "kind",
      "member_id",
      "preparation_id",
      "ref",
      "source",
      "term",
      "unit_count",
    ]);
    expect(front).toEqual(engine);
  });
});

// ---------------------------------------------------------------------------
// ② LA LIGNE « À CÔTÉ », SOUS LA BONNE BOÎTE
// ---------------------------------------------------------------------------

describe("les à-côtés d'une personne se lisent sous SA boîte", () => {
  it("fr — boîte à un nom: les aliments seuls; bac commun: le prénom devant", () => {
    atLocale("fr");
    const [thomasBox, tableBox] = boxLinesForDish(lunch(), ROSTER);
    expect(thomasBox.id).toBe("box_thu_lunch_thomas");
    expect(thomasBox.sides.map((s) => [s.memberId, s.name, s.text])).toEqual([
      [THOMAS, null, "comté ~30 g, 1 × pomme"],
    ]);
    expect(tableBox.id).toBe("box_thu_lunch_table");
    // ⚠️ L'ORDRE DU ROSTER (Christèle avant Fabrice), pas celui de `member_ids`.
    expect(tableBox.sides.map((s) => [s.memberId, s.name, s.text])).toEqual([
      [CHRISTELE, "Christèle", "Christèle : 1 × yaourt nature"],
      [FABRICE, "Fabrice", "Fabrice : soupe de courgettes ~250 g"],
    ]);
  });

  it("en — même placement, gabarits anglais", () => {
    atLocale("en");
    const [thomasBox, tableBox] = boxLinesForDish(lunch(), ROSTER);
    expect(thomasBox.sides.map((s) => s.text)).toEqual(["comté ~30 g, 1 × pomme"]);
    expect(tableBox.sides.map((s) => s.text)).toEqual([
      "Christèle: 1 × yaourt nature",
      "Fabrice: soupe de courgettes ~250 g",
    ]);
  });

  it("⛔ sa boîte à elle passe avant un bac commun qui la nomme aussi", () => {
    atLocale("fr");
    const payload = lunchPayload([LUNCH_SIDES[2]]);
    // Christèle a SA boîte, ET elle est nommée dans le bac commun.
    (payload.boxes as Record<string, unknown>[]).push({
      id: "box_thu_lunch_christele",
      member_ids: [CHRISTELE],
      items: [{ preparation_id: "prep_chicken", term: "poulet rôti", grams: 180 }],
    });
    const lines = boxLinesForDish(readDishes([payload])[0], ROSTER);
    const byId = new Map(lines.map((l) => [l.id, l.sides.map((s) => s.text)]));
    expect(byId.get("box_thu_lunch_christele")).toEqual(["1 × yaourt nature"]);
    expect(byId.get("box_thu_lunch_table")).toEqual([]);
    expect(byId.get("box_thu_lunch_thomas")).toEqual([]);
  });

  it("un prénom inconnu (plan relu sans ses parts) ne montre jamais l'identifiant", () => {
    atLocale("fr");
    const [, tableBox] = boxLinesForDish(lunch(), []);
    expect(tableBox.sides.map((s) => [s.name, s.text])).toEqual([
      [null, "1 × yaourt nature"],
      [null, "soupe de courgettes ~250 g"],
    ]);
    expect(tableBox.sides.map((s) => s.text).join(" ")).not.toContain("mem-");
  });

  // ⟳ 2026-09-25 — SUR LA CARTE, « À CÔTÉ » EST LA DEUXIÈME LIGNE DU TITRE,
  // plus un bloc sous chaque couvercle: une ligne par personne, prénom compris
  // (sous le titre, aucun couvercle ne dit plus à qui est le fromage).
  it("fr — la carte rend « À côté » sous le titre, une ligne par personne, avant les couvercles", () => {
    atLocale("fr");
    const html = dishCard(lunch());
    expect(occurrences(html, `>${fr["meals.boxes.side_courses"]}<`)).toBe(0);
    expect(html).not.toContain("data-box-sides");
    const title = flatSides(html).indexOf(">Poulet, riz et courgettes<");
    const sideThomas = flatSides(html).indexOf(">À côté pour Thomas : comté ~30 g, 1 × pomme<");
    const sideChristele = flatSides(html).indexOf(">À côté pour Christèle : 1 × yaourt nature<");
    const sideFabrice = flatSides(html).indexOf(">À côté pour Fabrice : soupe de courgettes ~250 g<");
    const firstBox = flatSides(html).indexOf("data-box-id");
    expect(title).toBeGreaterThan(-1);
    expect(sideThomas).toBeGreaterThan(title);
    expect(sideChristele).toBeGreaterThan(sideThomas);
    expect(sideFabrice).toBeGreaterThan(sideChristele);
    expect(firstBox).toBeGreaterThan(sideFabrice);
    expect(occurrences(html, `data-side-member-id="${CHRISTELE}"`)).toBe(1);
  });

  it("en — la carte rend « On the side for … »", () => {
    atLocale("en");
    const html = dishCard(lunch());
    expect(flatSides(html)).toContain(">On the side for Christèle: 1 × yaourt nature<");
    expect(flatSides(html)).toContain(">On the side for Thomas: comté ~30 g, 1 × pomme<");
    expect(html).not.toContain(fr["meals.boxes.side_courses"]);
  });

  it("une seule bouche à ce repas: « À côté : … », sans prénom", () => {
    atLocale("fr");
    const payload = lunchPayload([LUNCH_SIDES[0], LUNCH_SIDES[1]]);
    payload.boxes = [(payload.boxes as unknown[])[0]];
    const html = dishCard(readDishes([payload])[0]);
    expect(flatSides(html)).toContain(">À côté : comté ~30 g, 1 × pomme<");
    expect(html).not.toContain("À côté pour");
  });

  it("⛔ sur l'aperçu (ligne compacte FERMÉE), l'à-côté se lit, sans grammes", () => {
    atLocale("fr");
    const html = flatSides(dishCard(lunch(), { compact: true }));
    const closed = html.indexOf(" hidden=\"\"");
    const side = html.indexOf(">À côté pour Thomas : comté, pomme<");
    expect(closed).toBeGreaterThan(-1);
    expect(side).toBeGreaterThan(-1);
    expect(side).toBeLessThan(closed);
    expect(html.slice(0, closed)).not.toContain("comté ~30 g");
    // ⟳ 2026-09-25 — OUVERTE, la carte les chiffre par type dans le geste du
    // jour (« Fromage : comté ~30 g »), demande du propriétaire: la ligne
    // fermée ne disait pas combien.
    expect(html.slice(closed)).toContain("comté ~30 g");
  });

});

// ---------------------------------------------------------------------------
// ③ LE POIDS DU PLAT RESTE LE PLAT
// ---------------------------------------------------------------------------

describe("⛔ l'à-côté n'entre pas dans le poids du plat", () => {
  it("le total d'une boîte est celui de ses items, avec ou sans à-côtés", () => {
    atLocale("fr");
    const withSides = boxLinesForDish(lunch(), ROSTER);
    const without = boxLinesForDish(lunch([]), ROSTER);
    expect(withSides.map((l) => l.total)).toEqual([500, 700]);
    expect(without.map((l) => l.total)).toEqual([500, 700]);
    // Et aucun item n'a été fabriqué à partir d'un à-côté.
    expect(withSides[0].items.map((i) => i.term)).toEqual(["poulet rôti", "riz"]);
  });

  it("au Boxing, la soupe se pèse sur sa propre ligne, jamais dans les items", () => {
    atLocale("fr");
    const [, tableBox] = boxLinesForSession(
      ["prep_chicken", "prep_rice", "prep_soup"],
      [lunch()],
      ROSTER,
      [],
    );
    expect(tableBox.items.map((i) => [i.term, i.grams])).toEqual([
      ["poulet rôti", 400],
      ["riz", 300],
    ]);
    expect(tableBox.total).toBe(700);
  });
});

// ---------------------------------------------------------------------------
// ④ LA SESSION DE CUISINE
// ---------------------------------------------------------------------------

describe("au Boxing, seule une entrée tirée d'une casserole apparaît", () => {
  it("le fruit, le yaourt et le fromage s'ajoutent le jour même: absents", () => {
    atLocale("fr");
    const lines = boxLinesForSession(
      ["prep_chicken", "prep_rice", "prep_soup"],
      [lunch()],
      ROSTER,
      [],
    );
    expect(lines.map((l) => [l.id, l.sides.map((s) => [s.name, s.items.map((i) => i.term)])]))
      .toEqual([
        ["box_thu_lunch_thomas", []],
        ["box_thu_lunch_table", [["Fabrice", ["soupe de courgettes"]]]],
      ]);
  });

  it("le Boxing rend la soupe comme une part: le terme, et le gramme exact à droite", () => {
    atLocale("fr");
    const lines = boxLinesForSession(["prep_chicken", "prep_soup"], [lunch()], ROSTER, []);
    const html = markup(createElement(BoxTable, { lines, context: "session" }));
    expect(occurrences(html, `>${fr["meals.boxes.side_courses"]}<`)).toBe(1);
    expect(html).toContain(">soupe de courgettes<");
    expect(html).toContain(`>${fr["meals.boxes.grams"].replace("{n}", "250")}<`);
    // Le tilde est celui de la carte du repas: au Boxing, on pèse.
    expect(html).not.toContain("~250 g");
    expect(html).not.toContain("pomme");
    expect(html).not.toContain("yaourt");
  });

  // ⟳ 2026-09-23 — AVEC `scope` (une session ne pèse que SES casseroles): la
  // boîte de Thomas ne tient rien de la soupe, elle n'est pas à remplir ici; le
  // bac de la table ne pèse ni le poulet ni le riz (autre session, NOMMÉS), mais
  // il porte la soupe de Fabrice.
  it("une session qui ne fait QUE la soupe remplit ce repas-là aussi", () => {
    atLocale("fr");
    const lines = boxLinesForSession(["prep_soup"], [lunch()], ROSTER, []);
    expect(lines.map((l) => l.id)).toEqual(["box_thu_lunch_table"]);
    expect(lines[0].items).toEqual([]);
    expect(lines[0].fromOtherSessions.map((p) => p.term)).toEqual(["poulet rôti", "riz"]);
    expect(lines[0].sides.map((s) => s.memberId)).toEqual([FABRICE]);
  });

  it("une session sans rapport ne le remplit pas", () => {
    expect(boxLinesForSession(["prep_other"], [lunch()], ROSTER, [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ④ bis — L'À-CÔTÉ QU'AUCUNE BOÎTE NE PORTE: LA CARTE LE REND
// ---------------------------------------------------------------------------

describe("un à-côté rattaché à un plat sans boîte qui nomme la personne", () => {
  function tableDish(): GeneratedDish {
    const payload = lunchPayload([LUNCH_SIDES[1], LUNCH_SIDES[2]]);
    payload.boxes = [];
    payload.uses = [];
    payload.ingredients = [{ term: "salade verte", quantity: "80 g", amount: 80, unit: "g" }];
    return readDishes([payload])[0];
  }

  it("fr — la carte rend « À côté » sous le titre, avec les prénoms connus", () => {
    atLocale("fr");
    const html = dishCard(tableDish(), {
      eaters: [
        { memberId: THOMAS, name: "Thomas" },
        { memberId: CHRISTELE, name: "Christèle" },
      ],
    });
    const ingredient = html.indexOf(">salade verte<");
    const block = html.indexOf("data-dish-sides");
    expect(ingredient).toBeGreaterThan(-1);
    expect(block).toBeGreaterThan(-1);
    expect(block).toBeLessThan(ingredient);
    expect(flatSides(html)).toContain(">À côté pour Thomas : 1 × pomme<");
    expect(flatSides(html)).toContain(">À côté pour Christèle : 1 × yaourt nature<");
  });

  it("en — même ligne, gabarit anglais", () => {
    atLocale("en");
    const html = dishCard(tableDish(), {
      eaters: [{ memberId: THOMAS, name: "Thomas" }],
    });
    expect(flatSides(html)).toContain(">On the side for Thomas: 1 × pomme<");
    // Christèle n'est pas dans les mangeurs connus: ses aliments seuls.
    expect(flatSides(html)).toContain(">On the side: 1 × yaourt nature<");
    expect(html).not.toContain("mem-christele<");
  });

  it("un plat qui porte ses boîtes n'a aucun à-côté « sans boîte »", () => {
    atLocale("fr");
    expect(looseSideLinesForDish(lunch(), [])).toEqual([]);
    // Une seule ligne de titre, pas un second bloc.
    expect(occurrences(dishCard(lunch()), "data-dish-sides")).toBe(1);
  });

  it("un plat sans rien d'autre qu'un à-côté le montre sans rien à déplier", () => {
    atLocale("fr");
    const payload = lunchPayload([LUNCH_SIDES[1]]);
    payload.boxes = [];
    payload.uses = [];
    const html = dishCard(readDishes([payload])[0]);
    expect(html).not.toContain("aria-expanded");
    expect(flatSides(html)).toContain(">À côté : 1 × pomme<");
  });
});

// ---------------------------------------------------------------------------
// ⑤ UN PLAN D'AVANT CE LOT SE REND COMME AVANT
// ---------------------------------------------------------------------------

describe("un plan sans `side_courses` se rend exactement comme avant", () => {
  it("fr et en — le HTML sans la clé est celui d'une clé vide, sans aucun « À côté »", () => {
    for (const locale of ["fr", "en"] as const) {
      atLocale(locale);
      const before = dishCard(oldLunch());
      expect(before).toBe(dishCard(lunch([])));
      expect(before).not.toContain("data-box-sides");
      expect(before).not.toContain("data-dish-sides");
      expect(before).not.toContain(fr["meals.boxes.side_courses"]);
      expect(before).not.toContain(en["meals.boxes.side_courses"]);
      const session = markup(createElement(BoxTable, {
        lines: boxLinesForSession(["prep_chicken"], [oldLunch()], ROSTER, []),
        context: "session",
      }));
      expect(session).toBe(markup(createElement(BoxTable, {
        lines: boxLinesForSession(["prep_chicken"], [lunch([])], ROSTER, []),
        context: "session",
      })));
      expect(session).not.toContain("data-box-sides");
    }
  });

  it("des à-côtés tous invalides se rendent comme aucun", () => {
    atLocale("fr");
    expect(dishCard(lunch([{ ...LUNCH_SIDES[0], kind: "soup" }]))).toBe(dishCard(lunch([])));
  });
});

// ---------------------------------------------------------------------------
// ⑥ AUCUNE PROVENANCE
// ---------------------------------------------------------------------------

describe("⛔ rien n'indique d'où vient un à-côté", () => {
  it("un aliment de secours se rend comme un aliment nommé par le modèle", () => {
    atLocale("fr");
    const fromModel = lunch([{ ...LUNCH_SIDES[2], source: "model" }]);
    const fromFallback = lunch([{ ...LUNCH_SIDES[2], source: "engine_fallback" }]);
    expect(dishCard(fromModel)).toBe(dishCard(fromFallback));
    const html = dishCard(fromFallback);
    expect(html).not.toContain("engine_fallback");
    expect(html).not.toContain("fallback");
  });

  it("aucun rendu ne lit `source` (code, commentaires retirés)", () => {
    for (const rel of ["../lib/mealBoxes.ts", "./plan/BoxTable.tsx", "./DishCard.tsx"]) {
      expect(code(rel), rel).not.toMatch(/\.source\b/);
    }
  });
});

// ---------------------------------------------------------------------------
// LA LISTE DE COURSES — LES LIGNES EN UNITÉS
// ---------------------------------------------------------------------------

describe("courses: une ligne d'à-côté en unités se lit « pomme · 2 »", () => {
  // `sideShoppingLines` écrit `{ amount: 2, unit: "unit", quantity: "2" }`, et
  // `shoppingNeedsOf` rend la quantité par `renderQuantity`: le nombre nu.
  // Le panneau rend `term` puis la quantité (`ShoppingListPanel`), comme pour
  // « œufs · 6 ». ⚠️ Pas de « 2 pommes »: accorder un mot écrit par le modèle
  // serait un matcher maison.
  const [line] = readShopping([{
    term: "pomme",
    quantity: "2",
    aisle: "produce",
    food_group: "other_fruit",
    buy_on: null,
    ref: "apple",
    amount: 2,
    unit: "unit",
    state: "raw",
  }]);

  it("fr — le compte seul, sans unité de poids", () => {
    atLocale("fr");
    expect(line.unit).toBe("unit");
    expect(ingredientQuantityText(line)).toBe("2");
  });

  it("en — le compte seul, sans unité de poids", () => {
    atLocale("en");
    expect(ingredientQuantityText(line)).toBe("2");
  });

  it("le panneau rend le terme, puis la quantité dérivée", () => {
    const src = code("./ShoppingListPanel.tsx");
    const term = src.indexOf("<span>{item.term}</span>");
    const quantity = src.indexOf("ingredientQuantityText(item) && (");
    expect(term).toBeGreaterThan(-1);
    expect(quantity).toBeGreaterThan(term);
  });
});
