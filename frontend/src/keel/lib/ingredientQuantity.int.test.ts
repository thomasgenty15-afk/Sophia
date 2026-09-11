/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT C — CE QUE L'ÉCRAN REND VRAIMENT, DEPUIS LE PAYLOAD FINAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE PLAN L'EXIGE EN TOUTES LETTRES: « test de rendu RÉEL de la recette et
 * des courses depuis le payload final, puis après RECHARGEMENT du plan. Une
 * recherche de chaînes dans le code n'est pas suffisante. » Ce fichier monte
 * donc les vrais composants et lit le HTML produit.
 *
 * ⛔ `.ts` ET `createElement`, JAMAIS DE JSX. `vitest.config.ts` n'inclut que
 * `src/**` + `*.int.test.ts`: un `.tsx` ne serait JAMAIS COLLECTÉ, et le test
 * passerait pour vert en n'existant pas. Précédent `planDraftEnergy.int.test.ts`.
 *
 * ⛔ LE « RECHARGEMENT » EST UN VRAI ALLER-RETOUR JSONB. On sérialise le
 * payload, on le repasse par `readDishes` / `readPreparations` — les lecteurs
 * que le produit emploie pour monter une ligne `student_generated_meals` — et
 * on remonte les mêmes écrans. C'est là que le défaut se cachait: un lecteur
 * qui laisse tomber un champ le fait en SILENCE.
 *
 * Les nombres viennent des deux plans archivés de la campagne du 2026-09-11,
 * au caractère.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SessionPreparation } from "../components/CookingSessions";
import PlanDayBlock from "../components/plan/PlanDayBlock";
import {
  readDishes,
  readPreparations,
  readShopping,
} from "../api/mealGeneration";
import {
  ingredientQuantityState,
  ingredientQuantityText,
} from "./ingredientQuantity";

/** `/app/plan` n'est pas une page routée par langue: l'écran rend en anglais. */
function atPath(path: string): void {
  Object.defineProperty(globalThis, "location", {
    value: { pathname: path, search: "", href: `http://localhost${path}` },
    configurable: true,
    writable: true,
  });
}
function markup(node: Parameters<typeof renderToStaticMarkup>[0], path = "/app/plan"): string {
  atPath(path);
  return renderToStaticMarkup(node);
}

// ═══════════════════════════════════════════════════════════════════════════
// LE PAYLOAD FINAL — tel que le moteur l'écrit APRÈS la finalisation du lot C
// ═══════════════════════════════════════════════════════════════════════════
//
// `prep_chicken` (PERTE `1f8a8988`) et `prep_lentils` (GAIN `1eada05b`), avec
// leur `quantity` RÉGÉNÉRÉE par `finalizeQuantityProse` — c'est ce que la
// colonne `preparations` porte désormais.
const PREP_CHICKEN_FINAL = {
  id: "prep_chicken",
  title: "Poulet rôti aux poivres",
  servings_made: 3,
  method: "Saisir les cuisses, puis enfourner.",
  active_minutes: 15,
  total_minutes: 45,
  cook_on: "2026-09-11",
  ingredients: [
    {
      term: "cuisses de poulet désossées",
      quantity: "458.66 g de cuisses de poulet désossées",
      amount: 458.6625582082933,
      unit: "g",
      state: "raw",
      grams_raw: 458.6625582082933,
      ref: "chicken_thigh",
      ref_refused: false,
      in_pantry: false,
    },
    {
      term: "huile d'olive",
      quantity: "12.74 g d'huile d'olive",
      amount: 12.740626616897037,
      unit: "g",
      state: "raw",
      grams_raw: 12.740626616897037,
      ref: "olive_oil",
      ref_refused: false,
      in_pantry: false,
    },
    {
      term: "sel",
      quantity: "une pincée de sel",
      amount: null,
      unit: null,
      state: null,
      grams_raw: null,
      ref: null,
      ref_refused: false,
      in_pantry: false,
    },
  ],
};

const PREP_LENTILS_FINAL = {
  id: "prep_lentils",
  title: "Lentilles mijotées à la carotte",
  servings_made: 2,
  method: "Faire revenir l'oignon, ajouter les lentilles, couvrir et mijoter.",
  active_minutes: 10,
  total_minutes: 35,
  cook_on: "2026-09-12",
  ingredients: [
    {
      term: "lentilles sèches",
      quantity: "60 g",
      amount: 60,
      unit: "g",
      state: "raw",
      grams_raw: 60,
      ref: "lentils_dry",
      ref_refused: false,
      in_pantry: false,
    },
    {
      term: "huile d’olive",
      quantity: "0.77 tbsp d’huile d’olive",
      amount: 0.7703703703703704,
      unit: "tbsp",
      state: "raw",
      grams_raw: 11.555555555555555,
      ref: "olive_oil",
      ref_refused: false,
      in_pantry: false,
    },
  ],
};

/** Ce que la colonne `dishes` porte: le frais du plat, et sa boîte. */
const DISH_FINAL = {
  title: "Bol de lentilles",
  slot: "dinner",
  day: "2026-09-12",
  method: "Assembler.",
  why: "",
  uses: [{ preparation_id: "prep_lentils", servings: 1, kept: "fridge" }],
  ingredients: [
    {
      term: "tahini",
      quantity: "38.52 g de tahini",
      amount: 38.52,
      unit: "g",
      state: "raw",
      grams_raw: 38.52,
      ref: "tahini",
      ref_refused: false,
      in_pantry: false,
    },
  ],
  boxes: [{
    id: "b1",
    member_ids: ["m1"],
    items: [{ preparation_id: "prep_lentils", term: "lentilles", grams: 180, ref: "lentils_dry", ref_refused: false }],
    legacy_total_grams: null,
  }],
  member_id: "m1",
  same_day: null,
};

const SHOPPING_FINAL = [
  { term: "cuisses de poulet", quantity: "500 g", aisle: "protein", food_group: "meat_poultry", buy_on: "2026-09-11" },
  { term: "lentilles sèches", quantity: "250 g", aisle: "grains", food_group: "grains_starch", buy_on: "2026-09-11" },
];

/** L'aller-retour que fait la base: `jsonb` écrit, `jsonb` relu. */
function reload<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}

function prepCard(prep: unknown): string {
  return markup(
    createElement(SessionPreparation, {
      prep: prep as never,
      feeds: [],
      open: true,
      onToggle: () => {},
    }),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LA FIXTURE POULET — rendue par la vraie carte de cuisine
// ═══════════════════════════════════════════════════════════════════════════

describe("① la recette affiche la quantité finale, jamais l'ancienne", () => {
  it("la carte de cuisine rend 458.66 g, et pas 360 g", () => {
    const html = prepCard(PREP_CHICKEN_FINAL);
    expect(html).toContain("458.66 g de cuisses de poulet désossées");
    // ⛔ LE CAS QUI MORD: l'ancien nombre n'est nulle part dans le HTML.
    expect(html).not.toContain("360");
    // La ligne sans donnée structurée garde son texte — rien n'est écrasé.
    expect(html).toContain("une pincée de sel");
  });

  it("⛔ APRÈS RECHARGEMENT du plan, le même nombre", () => {
    // Le vrai chemin du produit: la colonne `preparations` relue par
    // `readPreparations`, puis remontée. C'est ici que `readIngredients`
    // laissait tomber `amount` et `unit` en silence.
    const relu = readPreparations(reload([PREP_CHICKEN_FINAL]));
    expect(relu[0].ingredients[0].amount).toBe(458.6625582082933);
    expect(relu[0].ingredients[0].unit).toBe("g");
    expect(relu[0].ingredients[0].ref).toBe("chicken_thigh");
    const html = prepCard(relu[0]);
    expect(html).toContain("458.66 g de cuisses de poulet désossées");
    expect(html).not.toContain("360");
  });

  it("⛔ et même si la PROSE persistée était restée périmée", () => {
    // ⛔ C'EST LA MOITIÉ QUI COMPTE. La finalisation du moteur répare la base;
    // ce test-ci prouve que l'écran ne dépend plus d'elle. Un plan écrit par
    // une version antérieure — ou par une mutation ajoutée APRÈS la
    // finalisation — porte la vieille prose ET la bonne donnée: l'écran doit
    // rendre la donnée.
    const perime = {
      ...PREP_CHICKEN_FINAL,
      ingredients: PREP_CHICKEN_FINAL.ingredients.map((i, at) =>
        at === 0 ? { ...i, quantity: "360 g de cuisses de poulet désossées" } : i
      ),
    };
    const html = prepCard(readPreparations(reload([perime]))[0]);
    expect(html).toContain("458.66 g de cuisses de poulet désossées");
    expect(html).not.toContain("360");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LA FIXTURE LENTILLES — le RAPPORT affiché, après toutes les transformations
// ═══════════════════════════════════════════════════════════════════════════

describe("② 60 g de lentilles ne restent pas avec 2 cuillères d'huile", () => {
  it("le nombre, l'unité et le rapport, sur l'écran", () => {
    const relu = readPreparations(reload([PREP_LENTILS_FINAL]))[0];
    const html = prepCard(relu);
    expect(html).toContain("60 g");
    // L'unité reste une cuillère: aucune conversion par une densité inventée.
    expect(html).toContain("0.77 tbsp");
    expect(html).not.toContain("2 cuillères");
    expect(html).not.toContain("2 tbsp");
    // ⛔ LE RAPPORT, RELU DANS LES DEUX TEXTES RENDUS. C'est la vraie mesure:
    // la revue a montré un rapport affiché 2,6 fois celui du calcul.
    const huile = Number(ingredientQuantityText(relu.ingredients[1])!.split(" ")[0]);
    const lentilles = Number(ingredientQuantityText(relu.ingredients[0])!.split(" ")[0]);
    expect(Math.abs((huile / lentilles) / (0.7703703703703704 / 60) - 1)).toBeLessThan(0.01);
  });

  it("⛔ le cas qui mord: l'ancienne prose donnait bien ×2,6", () => {
    // Sans cette moitié, le test ci-dessus passerait aussi sur un défaut qui
    // n'a jamais existé.
    expect(Math.abs((2 / 60) / (0.7703703703703704 / 60) - 2.596)).toBeLessThan(0.01);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LOT PARTAGÉ vs PORTION — deux nombres, deux endroits
// ═══════════════════════════════════════════════════════════════════════════

describe("③ le lot d'une casserole et la part d'une personne ne se confondent pas", () => {
  it("la casserole affiche son lot, le couvercle affiche 180 g", () => {
    const prep = readPreparations(reload([PREP_LENTILS_FINAL]))[0];
    const dish = readDishes(reload([DISH_FINAL]))[0];
    // Le lot: 60 g de lentilles sèches pour deux parts.
    expect(ingredientQuantityText(prep.ingredients[0])).toBe("60 g");
    // La part: 180 g dans la boîte de `m1`. Un GRAMME NU, jamais une prose —
    // le périmètre est déjà séparé par la structure du payload.
    expect(dish.boxes[0].items[0].grams).toBe(180);
    // Le frais du plat, lui, est bien finalisé aussi.
    expect(ingredientQuantityText(dish.ingredients[0])).toBe("38.52 g de tahini");
    // ⛔ LE CAS QUI MORD: le lot n'est pas rendu à la valeur de la part.
    expect(ingredientQuantityText(prep.ingredients[0])).not.toBe("180 g");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LES COURSES — rendues depuis le payload final, puis rechargées
// ═══════════════════════════════════════════════════════════════════════════

describe("④ le bloc du jour rend recette ET courses depuis le payload final", () => {
  it("les deux quantités survivent au rechargement, sur le même écran", () => {
    // ⚠️ `PlanDayBlock` ET PAS `ShoppingListPanel`: le panneau de courses est
    // un `Modal`, donc un `createPortal(…, document.body)` que le rendu serveur
    // ne sait pas monter (`environment: "node"` dans `vitest.config.ts`). Le
    // bloc du jour rend la MÊME liste par les mêmes accesseurs
    // (`groupByAisle`, `item.quantity`) ET les ingrédients des casseroles: un
    // seul écran porte donc les deux moitiés du lot.
    const relu = readShopping(reload(SHOPPING_FINAL));
    const preps = readPreparations(reload([PREP_CHICKEN_FINAL, PREP_LENTILS_FINAL]));
    const dishes = readDishes(reload([DISH_FINAL]));
    const html = markup(
      createElement(PlanDayBlock, {
        group: { day: "2026-09-12", dishes },
        date: "2026-09-12",
        today: "2026-09-12",
        preparations: preps,
        allDishes: dishes,
        cookingSessions: [{
          day: "2026-09-12",
          preparation_ids: ["prep_chicken", "prep_lentils"],
          run_through: "",
          total_minutes: 60,
        }],
        // `freezeIndices` fait sortir les lignes de courses SANS dépliage —
        // c'est le seul bloc de cette carte qui se rend fermé.
        wave: {
          buyOn: "2026-09-12",
          servesCookOn: "2026-09-12",
          indices: [0, 1],
          freezeIndices: [0, 1],
        },
        shoppingList: relu,
        moments: [],
        timingLine: null,
        portions: [],
      } as never),
    );
    // Les courses, telles que la ligne les porte.
    expect(html).toContain("500 g");
    expect(html).toContain("250 g");
    expect(html).toContain("cuisses de poulet");
    // ⛔ LA RECETTE, SUR LE MÊME RENDU ET APRÈS LE MÊME RECHARGEMENT: le frais
    // du plat sort à 38.52 g, la valeur calculée — l'archive en affichait
    // « 100 g ». C'est la moitié GAIN du défaut mesuré.
    //
    // ⚠️ LA CARTE DE CUISSON EST REPLIÉE À L'OUVERTURE (`aria-expanded=false`),
    // donc les lignes des CASSEROLES ne sont pas dans ce HTML-ci. Elles sont
    // rendues par `SessionPreparation` au bloc ① ci-dessus, dépliée. Le dire
    // plutôt qu'assurer une couverture qu'on n'a pas.
    expect(html).toContain("38.52 g de tahini");
    expect(html).not.toContain("100 g de tahini");
    expect(html).toContain('aria-expanded="false"');
    // ⛔ CE QUE CE TEST NE PROUVE PAS, ET IL FAUT LE DIRE: `shopping_list[]` ne
    // porte AUCUNE donnée structurée — ni `amount`, ni `unit`, ni `ref`. Sa
    // quantité est une prose que le moteur réécrit par `scaleShoppingList`, et
    // l'écran ne peut rien en dériver. Agréger les courses par identité
    // alimentaire et contrôler la SUFFISANCE des quantités est le lot E.
    expect(Object.keys(relu[0])).not.toContain("amount");
  });

  it("⛔ le cas qui mord: un champ laissé tomber par le lecteur se voit", () => {
    // `food_group` et `buy_on` ont chacun été perdus par ce lecteur par le
    // passé, en silence (`readShopping`, cicatrices du 2026-08-23 et du
    // 2026-09-01). On les relit ici pour que la troisième fois soit rouge.
    const relu = readShopping(reload(SHOPPING_FINAL));
    expect(relu[0].food_group).toBe("meat_poultry");
    expect(relu[0].buy_on).toBe("2026-09-11");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ L'ÉTAT DE LECTURE, ET LA LANGUE DE L'ÉCRAN
// ═══════════════════════════════════════════════════════════════════════════

describe("⑤ l'état de lecture est explicite, et la virgule suit la page", () => {
  it("donnée structurée · texte historique · rien", () => {
    atPath("/app/plan");
    expect(ingredientQuantityState(PREP_CHICKEN_FINAL.ingredients[0])).toBe("structured");
    // ⛔ UNE ANCIENNE LIGNE GARDE SON TEXTE, ET ON SAIT QUE C'EST LE SIEN. Sans
    // cet état, une prose d'avant FF-038 et une prose régénérée se liraient
    // pareil — et on ne pourrait plus mesurer si le lot travaille.
    expect(ingredientQuantityState(PREP_CHICKEN_FINAL.ingredients[2])).toBe("historic_text");
    expect(ingredientQuantityText({ quantity: null })).toBe(null);
    expect(ingredientQuantityState({ quantity: null })).toBe("absent");
  });

  it("la même donnée, deux conventions décimales selon la page", () => {
    const huile = PREP_LENTILS_FINAL.ingredients[1];
    // `/app/plan` n'est pas une page routée par langue ⇒ locale par défaut `en`.
    atPath("/app/plan");
    expect(ingredientQuantityText(huile)).toBe("0.77 tbsp d’huile d’olive");
    // `/` est la SEULE page routée par langue, et elle porte le français
    // (`LOCALE_ROUTED_PATHS`, `EN_PATH_PREFIX`): virgule décimale et le mot.
    atPath("/");
    expect(ingredientQuantityText(huile)).toBe("0,77 cuillère à soupe d’huile d’olive");
    // ⛔ LE CAS QUI MORD: les deux rendus DIFFÈRENT. Un test qui les
    // comparerait au même attendu passerait sur une locale codée en dur.
    atPath("/app/plan");
    expect(ingredientQuantityText(huile)).not.toContain("0,77");
  });
});
