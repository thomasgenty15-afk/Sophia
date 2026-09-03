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

/**
 * ⚠️ `dishIndex` EST PORTÉ PAR CHAQUE FIXTURE, ET IL NE PEUT PAS ÊTRE OPTIONNEL.
 *
 * C'est la POSITION dans le `dishes[]` STOCKÉ, capturée AVANT tout filtre — et
 * ce module est précisément celui qui REGROUPE et RETRIE. Le rang d'affichage
 * qui en sort n'est donc pas une position, et c'est tout l'objet du champ: la
 * coche se pose sur `dishIndex`, jamais sur le rang. Le rendre optionnel pour
 * faire taire un test rouvrirait le trou qu'A8.1 a fermé — la coche d'un membre
 * posée sur le plat suivant. On complète les fixtures; on ne desserre pas le
 * type.
 *
 * `null` reste une valeur permise, et elle a un sens: un plat que le montage
 * n'a pas su situer dans le `dishes[]` stocké n'a pas de case à cocher.
 */
const DISHES = [
  { dishIndex: 0, day: "fri", slot: "dinner", title: "Salmon and potatoes" },
  // ⚠️ LE PIÈGE DU CALENDRIER, dans la fixture exprès: sur un plan commencé
  // mercredi, `mon` est la semaine SUIVANTE — il doit sortir EN DERNIER.
  // Trié par calendrier, il sortirait en tête, et ce test resterait vert sur
  // une fixture qui ne porterait que `wed` et `fri` (mesuré: la première
  // version de ce fichier ne mordait pas).
  { dishIndex: 1, day: "mon", slot: "dinner", title: "Chili" },
  { dishIndex: 2, day: "wed", slot: "dinner", title: "Chicken and rice" },
  { dishIndex: 3, day: "wed", slot: "breakfast", title: "Yogurt bowls" },
  {
    dishIndex: 4,
    day: "fri",
    slot: "lunch",
    title: "Leftover bowls",
    note: "a bigger scoop",
  },
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
      dishes: [
        ...DISHES,
        { dishIndex: 5, day: null, slot: null, title: "Overnight oats" },
      ],
    });
    expect(groups[0].day).toBeNull();
    expect(groups[0].dishes.map((d) => d.title)).toEqual(["Overnight oats"]);
    // Et RIEN ne se perd: chaque plat reçu ressort exactement une fois.
    expect(groups.reduce((n, g) => n + g.dishes.length, 0)).toBe(6);
  });

  it("un jeton HORS fenêtre rejoint le groupe sans titre — un plan tronqué garde ses plats", () => {
    const groups = groupDishListByDay({
      order: ["wed", "thu", "fri"],
      dishes: DISHES.concat([
        { dishIndex: 5, day: "sun", slot: "lunch", title: "Roast" },
      ]),
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
        { dishIndex: 0, day: "wed", slot: "snack", title: "Legacy snack" },
        { dishIndex: 1, day: "wed", slot: "breakfast", title: "Yogurt bowls" },
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

  it("la semaine d'une bouche rend la liste extraite, SANS case (A8.1, R11)", () => {
    const src = code("frontend/src/keel/components/plan/PlanByPerson.tsx");
    expect(src, "`OnePerson` ne rend plus la liste par jour").toContain(
      "<DishListByDay groups={week}",
    );
    // ⛔ LA MOITIÉ AJOUTÉE PAR A8.1, ET C'EST UN INTERDIT PRODUIT. Cette vue
    // est celle du MAÎTRE, qui y parcourt la semaine de chaque bouche. Une
    // case y serait le maître déclarant la consommation d'un profil réclamé à
    // sa place — FF-058 R11: la consommation est un fait de PERSONNE.
    //
    // MUTATION QUI DOIT ROUGIR: passer ici le binder de `MyShareCard`.
    expect(src, "une case est apparue dans la vue PAR PERSONNE du maître")
      .toContain("<DishListByDay groups={week} bindTick={null} />");
  });

  it("⛔ « ce que la maison cuisine » ne coche pas non plus (A8.1)", () => {
    // La seconde surface de LECTURE. Ses coches à lui vivent dans sa part, sur
    // `/app/plan`: deux endroits pour le même fait finiraient par montrer deux
    // états, sans que rien à l'écran dise lequel ment.
    const src = code("frontend/src/keel/components/HouseholdPlanCard.tsx");
    expect(src, "une case est apparue sur « ce que la maison cuisine »")
      .toContain("bindTick={null}");
  });

  it("⛔ « ta part » est la SEULE des trois à cocher — et par la liaison unique", () => {
    const card = code("frontend/src/keel/components/plan/MyShareCard.tsx");
    // LE CAS QUI PASSE. Sans lui, les deux `bindTick={null}` ci-dessus
    // seraient une garde parfaite sur une porte qui ne s'ouvre nulle part.
    expect(card, "« ta part » ne lie plus aucune case").toContain("bindTick={");
    expect(card, "« ta part » ne passe plus par `bindAt`").toContain(
      "ticks.bindAt(",
    );
    // ⛔ ET ELLE N'ÉCRIT PAS ELLE-MÊME. `useMealTicks` est la liaison unique;
    // un `tickMeal`/`untickMeal` appelé depuis une carte serait le second
    // câblage que ce hook existe pour empêcher — et ici il ferait écrire deux
    // comptes différents sur le même plat.
    for (const forbidden of ["tickMeal", "untickMeal"]) {
      expect(card, `« ta part » écrit elle-même (${forbidden})`)
        .not.toContain(`${forbidden}(`);
    }
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
    //
    // LOT 2 (2026-08-17) — `same_day` REJOINT LA LISTE. Le bandeau du jour J
    // est une instruction de CUISINE: il dit quoi réchauffer, quoi assembler,
    // combien de temps. C'est ce que fait le maître, pas ce que lit une bouche
    // qui vient voir ce que la maison mange. Le laisser entrer ici serait le
    // même enrichissement muet que `method`, par une porte neuve.
    const src = code("frontend/src/keel/components/plan/DishListByDay.tsx") +
      code("frontend/src/keel/lib/dishListByDay.ts");
    for (
      const forbidden of ["ingredient", "why", "method", "session", "uses", "same_day"]
    ) {
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
