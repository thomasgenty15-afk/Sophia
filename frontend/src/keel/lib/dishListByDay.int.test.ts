import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { groupDishListByDay } from "./dishListByDay";

/**
 * LOT 1 — LES LISTES PLATES DEVIENNENT PAR JOUR. Ce que ces tests protègent:
 *
 *   * L'ORDRE DU PLAN — une semaine commencée mercredi liste mercredi en
 *     tête, jamais lundi;
 *   * RIEN NE SE PERD — un plat sans jour, ou d'un jeton hors fenêtre, tombe
 *     dans le groupe sans titre au lieu de disparaître;
 *   * LES TROIS MONTAGES — la semaine d'une bouche, « ce que la maison
 *     cuisine » et « ta part » rendent LA même liste, sans enrichissement.
 */

const DISHES = [
  { day: "fri", slot: "dinner", title: "Salmon and potatoes" },
  // ⚠️ LE PIÈGE DU CALENDRIER, dans la fixture exprès: sur un plan commencé
  // mercredi, `mon` est la semaine SUIVANTE — il doit sortir EN DERNIER.
  // Trié par calendrier, il sortirait en tête, et ce test resterait vert sur
  // une fixture qui ne porterait que `wed` et `fri` (mesuré: la première
  // version de ce fichier ne mordait pas).
  { day: "mon", slot: "dinner", title: "Chili" },
  { day: "wed", slot: "dinner", title: "Chicken and rice" },
  { day: "wed", slot: "breakfast", title: "Yogurt bowls" },
  { day: "fri", slot: "lunch", title: "Leftover bowls", note: "a bigger scoop" },
];

// L'ordre d'un plan commencé MERCREDI: `wed` d'abord, `mon` en queue.
const ORDER = ["wed", "thu", "fri", "sat", "sun", "mon", "tue"];

describe("groupDishListByDay", () => {
  it("groupe dans l'ordre du PLAN, jamais celui du calendrier", () => {
    const groups = groupDishListByDay({ order: ORDER, dishes: DISHES });
    expect(groups.map((g) => g.day)).toEqual(["wed", "fri", "mon"]);
  });

  it("dans un jour, les plats suivent l'ordre des moments", () => {
    const groups = groupDishListByDay({ order: ORDER, dishes: DISHES });
    expect(groups[0].dishes.map((d) => d.title)).toEqual([
      "Yogurt bowls",
      "Chicken and rice",
    ]);
  });

  it("la part voyage avec le plat, `null` quand il n'y en a pas", () => {
    const groups = groupDishListByDay({ order: ORDER, dishes: DISHES });
    const friday = groups.find((g) => g.day === "fri");
    expect(friday?.dishes.map((d) => d.note)).toEqual(["a bigger scoop", null]);
  });

  it("un plat sans jour tombe dans le groupe SANS TITRE, en tête — jamais perdu", () => {
    const groups = groupDishListByDay({
      order: ORDER,
      dishes: [...DISHES, { day: null, slot: null, title: "Overnight oats" }],
    });
    expect(groups[0].day).toBeNull();
    expect(groups[0].dishes.map((d) => d.title)).toEqual(["Overnight oats"]);
    // Et RIEN ne se perd: chaque plat reçu ressort exactement une fois.
    expect(groups.reduce((n, g) => n + g.dishes.length, 0)).toBe(6);
  });

  it("un jeton HORS fenêtre rejoint le groupe sans titre — un plan tronqué garde ses plats", () => {
    const groups = groupDishListByDay({
      order: ["wed", "thu", "fri"],
      dishes: DISHES.concat([{ day: "sun", slot: "lunch", title: "Roast" }]),
    });
    expect(groups[0].day).toBeNull();
    // `mon` est hors de cette fenêtre de trois jours: lui aussi est gardé —
    // et le groupe sans titre suit l'ordre des moments (déjeuner avant dîner).
    expect(groups[0].dishes.map((d) => d.title)).toEqual(["Roast", "Chili"]);
    expect(groups.reduce((n, g) => n + g.dishes.length, 0)).toBe(6);
  });

  it("un moment inconnu passe en queue, jamais devant le petit déjeuner", () => {
    const groups = groupDishListByDay({
      order: ORDER,
      dishes: [
        { day: "wed", slot: "snack", title: "Legacy snack" },
        { day: "wed", slot: "breakfast", title: "Yogurt bowls" },
      ],
    });
    expect(groups[0].dishes.map((d) => d.title)).toEqual([
      "Yogurt bowls",
      "Legacy snack",
    ]);
  });

  it("sans plats, aucun groupe — le rendu se tait", () => {
    expect(groupDishListByDay({ order: ORDER, dishes: [] })).toEqual([]);
  });
});

/**
 * LES TROIS MONTAGES, TESTÉS SUR LA SOURCE.
 *
 * ⚠️ COMMENTAIRES RETIRÉS — cicatrice `caller-audit-must-strip-comments`.
 */
describe("les trois montages de la liste par jour", () => {
  const ROOT = resolve(__dirname, "../../../..");

  function code(rel: string): string {
    return readFileSync(resolve(ROOT, rel), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .split("\n")
      .map((line) => {
        const at = line.indexOf("//");
        if (at < 0) return line;
        if (at > 0 && line[at - 1] === ":") return line;
        return line.slice(0, at);
      })
      .join("\n");
  }

  it("la semaine d'une bouche rend la liste extraite", () => {
    const src = code("frontend/src/keel/components/plan/PlanByPerson.tsx");
    expect(src, "`OnePerson` ne rend plus la liste par jour").toContain(
      "<DishListByDay groups={week} />",
    );
  });

  it("« ce que la maison cuisine » est par jour, dans l'ordre du PLAN", () => {
    const src = code("frontend/src/keel/components/HouseholdPlanCard.tsx");
    expect(src, "la liste plate littérale est revenue").toContain(
      "<DishListByDay",
    );
    expect(src, "l'ordre ne vient plus de la fenêtre du plan").toContain(
      "windowDayOrder(meal.startsOn, meal.durationDays)",
    );
  });

  it("« ta part » est par jour, et le monteur passe l'ordre du plan", () => {
    const card = code("frontend/src/keel/components/plan/MyShareCard.tsx");
    expect(card, "la liste plate littérale est revenue").toContain(
      "<DishListByDay",
    );
    expect(card, "l'ordre n'est plus celui du plan").toContain(
      "order: dishDayOrder,",
    );
    const page = code("frontend/src/keel/pages/StudentWeekPlanPage.tsx");
    expect(page, "le monteur ne passe plus l'ordre").toContain("dishDayOrder={");
  });

  it("⛔ la liste ne s'enrichit pas: ni recette, ni pourquoi, ni session", () => {
    // Un secondaire n'a ni `ingredients` ni `why` ni sessions — c'est une
    // garde produit, pas un manque. Le composant ne doit même pas connaître
    // ces mots.
    const src = code("frontend/src/keel/components/plan/DishListByDay.tsx") +
      code("frontend/src/keel/lib/dishListByDay.ts");
    for (const forbidden of ["ingredient", "why", "method", "session", "uses"]) {
      expect(src, `« ${forbidden} » est entré dans la liste par jour`)
        .not.toMatch(new RegExp(forbidden, "i"));
    }
  });

  it("⛔ aucune lecture de titre — jamais de matcher maison", () => {
    const model = code("frontend/src/keel/lib/dishListByDay.ts");
    for (const forbidden of ["includes(", "toLowerCase(", "match(", "indexOf("]) {
      expect(model, `${forbidden} sur les titres est apparu`).not.toContain(
        `title.${forbidden}`,
      );
    }
  });
});
