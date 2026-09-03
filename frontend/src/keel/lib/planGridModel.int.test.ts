import { describe, expect, it } from "vitest";

import { buildPlanGrid, daysFedBy, emptyCellCount } from "./planGridModel";
import type { GeneratedDish } from "../api/mealGeneration";

// FF-053 — LA GRILLE. Ce que ces tests protègent, dans l'ordre de ce qui coûte
// le plus cher quand ça casse:
//
//   * LES QUATRE SILENCES CONFONDUS — si « cantine », « shaker », « restes » et
//     « le modèle n'a rien mis » se ressemblent, la seule anomalie que cet écran
//     pouvait révéler devient invisible, et les trois déclarations légitimes
//     deviennent inquiétantes;
//   * LE LOT NON MARQUÉ — trois cases identiques jugées comme de la paresse
//     alors que c'est une seule casserole. On corrigerait le comportement que
//     FF-052 cherche à produire;
//   * L'ORDRE CALENDAIRE — une semaine qui commence mercredi s'ouvrirait sur
//     deux jours qui ont l'air ratés;
//   * LES LIGNES FIXES — des lignes vides à relire chaque semaine, pour des
//     moments que l'élève a déjà dit ne pas prendre.

function dish(over: Partial<GeneratedDish> = {}): GeneratedDish {
  return {
    title: "Chicken and rice",
    slot: "dinner",
    day: "mon",
    ingredients: [],
    method: "Cook it.",
    why: "",
    uses: [],
    // ⚠️ `boxes: []` EST OBLIGATOIRE, ET LE `as GeneratedDish` PLUS BAS EST CE
    // QUI L'A CACHÉ: le cast fait taire tsc sur un champ manquant, et
    // `boxLinesForDish` lève alors un `TypeError` au montage — écran blanc.
    // Cette fixture ne met AUCUN contenant, exprès; mais elle doit le DIRE.
    boxes: [],
    ...over,
  } as GeneratedDish;
}

const RHYTHM = [
  { slot: "breakfast" as const, size: null },
  { slot: "lunch" as const, size: null },
  { slot: "dinner" as const, size: null },
];

function grid(over: Partial<Parameters<typeof buildPlanGrid>[0]> = {}) {
  return buildPlanGrid({
    days: ["mon", "tue"],
    rhythm: RHYTHM,
    groups: [],
    awayDays: [],
    fixedIntakes: [],
    dayProperties: [],
    ...over,
  });
}

describe("FF-053 — la géométrie", () => {
  it("les lignes viennent du RYTHME, pas d'une liste de six", () => {
    expect(grid().rows.map((r) => r.slot)).toEqual([
      "breakfast",
      "lunch",
      "dinner",
    ]);
    // La collation de 17 h en fait une quatrième, et rien d'autre ne change.
    const withSnack = grid({
      rhythm: [...RHYTHM, { slot: "snack_pm" as const, size: null }],
    });
    expect(withSnack.rows.map((r) => r.slot)).toEqual([
      "breakfast",
      "lunch",
      "dinner",
      "snack_pm",
    ]);
  });

  it("les colonnes gardent l'ordre du PLAN, jamais celui du calendrier", () => {
    // Une composition faite un mercredi: `mon` et `tue` sont la semaine
    // SUIVANTE. Triés par calendrier, ils arriveraient en tête et l'élève
    // ouvrirait son écran sur deux jours qui ont l'air ratés.
    const g = grid({ days: ["wed", "thu", "fri", "sat", "sun", "mon", "tue"] });
    expect(g.days).toEqual(["wed", "thu", "fri", "sat", "sun", "mon", "tue"]);
    expect(g.rows[0].cells).toHaveLength(7);
  });
});

describe("FF-053 R3 — les cinq états d'une case", () => {
  it("un plat GAGNE toujours, quelle que soit la déclaration", () => {
    const g = grid({
      groups: [{ day: "mon", dishes: [dish({ slot: "lunch" })] }],
      // Toutes les raisons de se taire sont posées EN MÊME TEMPS: le plat
      // existe, donc il se mange.
      awayDays: [{ day: "mon", slots: ["lunch"] }],
      fixedIntakes: [{
        foodRef: "whey",
        label: "mon shaker",
        slot: "lunch",
        replacesMeal: true,
        days: [],
      }],
      dayProperties: [{ day: "mon", properties: ["leftovers"] }],
    });
    expect(g.rows[1].cells[0]).toEqual({
      kind: "dish",
      title: "Chicken and rice",
      fromBatch: false,
      ownMouths: 0,
      titleIsOwn: false,
      extraTableDishes: 0,
    });
  });

  it("« absent » prime sur l'apport fixe et sur les restes", () => {
    const g = grid({
      awayDays: [{ day: "mon", slots: ["lunch"] }],
      fixedIntakes: [{
        foodRef: "whey",
        label: "mon shaker",
        slot: "lunch",
        replacesMeal: true,
        days: [],
      }],
      dayProperties: [{ day: "mon", properties: ["leftovers"] }],
    });
    expect(g.rows[1].cells[0]).toEqual({ kind: "away" });
  });

  it("une journée entière écarte TOUS les moments", () => {
    // `slots: []` vaut la journée entière — convention de FF-002, tenue des
    // deux côtés de la frontière.
    const g = grid({ awayDays: [{ day: "tue", slots: [] }] });
    expect(g.rows.map((r) => r.cells[1].kind)).toEqual([
      "away",
      "away",
      "away",
    ]);
    // …et le jour d'à côté n'est pas touché.
    expect(g.rows[0].cells[0]).toEqual({ kind: "empty" });
  });

  it("l'apport fixe nomme la case avec les MOTS DE L'ÉLÈVE", () => {
    const g = grid({
      fixedIntakes: [{
        foodRef: "whey_protein_powder",
        label: "mon shaker du matin",
        slot: "breakfast",
        replacesMeal: true,
        days: ["mon"],
      }],
    });
    expect(g.rows[0].cells[0]).toEqual({
      kind: "fixed_intake",
      label: "mon shaker du matin",
    });
    // Mardi n'est pas dans `days`: le petit-déjeuner y est simplement absent.
    expect(g.rows[0].cells[1]).toEqual({ kind: "empty" });
  });

  it("un apport qui NE REMPLACE PAS ne prend aucune case", () => {
    // A5 de FF-051: « un café au lait au petit-déjeuner » nomme un moment sans
    // le prendre. La grille doit dire la même chose que le moteur.
    const g = grid({
      fixedIntakes: [{
        foodRef: "whole_milk",
        label: "mon café au lait",
        slot: "breakfast",
        replacesMeal: false,
        days: [],
      }],
    });
    expect(g.rows[0].cells[0]).toEqual({ kind: "empty" });
  });

  it("un jour de restes le DIT, au lieu de paraître vide", () => {
    const g = grid({ dayProperties: [{ day: "tue", properties: ["leftovers"] }] });
    expect(g.rows.map((r) => r.cells[1].kind)).toEqual([
      "leftovers",
      "leftovers",
      "leftovers",
    ]);
    // `batch_cook` n'explique AUCUNE absence: on cuisine ce jour-là, on n'y
    // saute pas de repas.
    const batch = grid({
      dayProperties: [{ day: "tue", properties: ["batch_cook"] }],
    });
    expect(batch.rows[0].cells[1]).toEqual({ kind: "empty" });
  });

  it("le cinquième état existe, et c'est le seul défaut", () => {
    const g = grid({
      groups: [{ day: "mon", dishes: [dish({ slot: "dinner" })] }],
    });
    // 3 lignes × 2 jours = 6 cases, une seule remplie.
    expect(emptyCellCount(g)).toBe(5);
  });
});

describe("FF-053 R4 — le lot se dit", () => {
  it("un plat issu d'une préparation est MARQUÉ", () => {
    const g = grid({
      groups: [{
        day: "mon",
        dishes: [dish({ slot: "dinner", uses: [{ preparation_id: "p1", servings: 1, kept: "fridge" as const }] })],
      }],
    });
    expect(g.rows[2].cells[0]).toEqual({
      kind: "dish",
      title: "Chicken and rice",
      fromBatch: true,
      // D3b — le plan de cette fixture est un plan de TABLE sans collision:
      // les trois compteurs sont à leur valeur de repos, et l'égalité EXACTE
      // est gardée exprès. Un champ neuf qui apparaîtrait sans son test doit
      // faire rougir celui-ci.
      ownMouths: 0,
      titleIsOwn: false,
      extraTableDishes: 0,
    });
  });

  it("trois cases identiques se distinguent d'un lot par ce drapeau seul", () => {
    const batched = dish({
      slot: "dinner",
      uses: [{ preparation_id: "p1", servings: 1, kept: "fridge" as const }],
    });
    const lazy = dish({ slot: "dinner" });
    const g = grid({
      days: ["mon", "tue"],
      groups: [
        { day: "mon", dishes: [batched] },
        { day: "tue", dishes: [lazy] },
      ],
    });
    const cells = g.rows[2].cells;
    // Même titre des deux côtés — c'est exactement le piège.
    expect(cells[0]).toMatchObject({ title: "Chicken and rice" });
    expect(cells[1]).toMatchObject({ title: "Chicken and rice" });
    // Et pourtant l'un est une casserole, l'autre une répétition.
    expect(cells[0]).toMatchObject({ fromBatch: true });
    expect(cells[1]).toMatchObject({ fromBatch: false });
  });
});

describe("FF-053 — le bloc cuisine", () => {
  it("une préparation dit QUELS JOURS elle nourrit", () => {
    // C'est toute la raison du bloc: « rôti du dimanche » sans cette ligne ne
    // dit pas qu'on en mange lundi, mardi et mercredi — et replier les jours
    // achèverait de le cacher.
    const dishes = [
      dish({ day: "mon", uses: [{ preparation_id: "roast", servings: 1, kept: "fridge" as const }] }),
      dish({ day: "tue", uses: [{ preparation_id: "roast", servings: 1, kept: "fridge" as const }] }),
      dish({ day: "wed", uses: [{ preparation_id: "roast", servings: 1, kept: "fridge" as const }] }),
      dish({ day: "thu" }),
    ];
    expect(daysFedBy("roast", dishes)).toEqual(["mon", "tue", "wed"]);
  });

  it("un jour ne se compte qu'une fois, même avec deux plats", () => {
    const dishes = [
      dish({ day: "mon", slot: "lunch", uses: [{ preparation_id: "p", servings: 1, kept: "fridge" as const }] }),
      dish({ day: "mon", slot: "dinner", uses: [{ preparation_id: "p", servings: 1, kept: "fridge" as const }] }),
    ];
    expect(daysFedBy("p", dishes)).toEqual(["mon"]);
  });

  it("un plat sans jour ne nourrit aucun jour", () => {
    const dishes = [
      dish({ day: null, uses: [{ preparation_id: "p", servings: 1, kept: "fridge" as const }] }),
    ];
    expect(daysFedBy("p", dishes)).toEqual([]);
  });

  it("une préparation que personne n'utilise ne nourrit rien", () => {
    expect(daysFedBy("orpheline", [dish({ day: "mon" })])).toEqual([]);
  });
});

// ===========================================================================
// L3 (2026-08-18) — « DEHORS » N'EST PAS « ABSENT », SUR LA GRILLE DU PLAN
//
// Le cinquième silence. Il se distingue du premier par une seule chose: il
// aura le droit de porter un ordre de grandeur, et l'autre non. Les confondre
// ferait taire le conseil du midi de quelqu'un qui déjeune dehors tous les
// jours, ou le ferait apparaître pendant ses vacances.
// ===========================================================================

describe("L3 — le cinquième silence", () => {
  it("un midi marqué « dehors » ne se lit PAS comme une absence", () => {
    const g = grid({
      awayDays: [{ day: "tue", slots: ["lunch"], kind: "eating_out" }],
    });
    const lunch = g.rows.find((r) => r.slot === "lunch")!;
    expect(lunch.cells[1]).toEqual({ kind: "eating_out" });
    // Et le reste de la journée est INTACT: la marque porte sur une case, pas
    // sur un jour.
    expect(g.rows.find((r) => r.slot === "dinner")!.cells[1]).toEqual({
      kind: "empty",
    });
  });

  it("une absence SANS jeton reste une absence — les lignes d'avant ce lot", () => {
    // C'est la compatibilité, et elle se mesure ici: la colonne porte des
    // milliers d'entrées sans `kind`, et les lire « dehors » ferait apparaître
    // un conseil chiffré sur des vacances déclarées il y a des jours.
    const g = grid({ awayDays: [{ day: "tue", slots: ["lunch"] }] });
    expect(g.rows.find((r) => r.slot === "lunch")!.cells[1]).toEqual({
      kind: "away",
    });
  });

  it("LE SILENCE GAGNE: absent et dehors sur la même case donnent « absent »", () => {
    const g = grid({
      awayDays: [
        { day: "tue", slots: ["lunch"], kind: "eating_out" },
        { day: "tue", slots: ["lunch"], kind: "away" },
      ],
    });
    expect(g.rows.find((r) => r.slot === "lunch")!.cells[1]).toEqual({
      kind: "away",
    });
  });

  it("un PLAT gagne toujours, même sur une case marquée dehors", () => {
    // La précédence d'origine ne bouge pas: s'il y a un plat, il se mange.
    const g = grid({
      groups: [{ day: "tue", dishes: [dish({ day: "tue", slot: "lunch" })] }],
      awayDays: [{ day: "tue", slots: ["lunch"], kind: "eating_out" }],
    });
    expect(g.rows.find((r) => r.slot === "lunch")!.cells[1].kind).toBe("dish");
  });

  it("« dehors » n'entre PAS dans le taux de cases vides", () => {
    // `emptyCellCount` est un taux de DÉFAUT de composition. Y compter un midi
    // que la personne a demandé à sortir du plan ferait passer une déclaration
    // pour une panne.
    const g = grid({
      awayDays: [{ day: "tue", slots: ["lunch"], kind: "eating_out" }],
    });
    // 2 jours × 3 moments = 6 cases, une seule est « dehors ».
    expect(emptyCellCount(g)).toBe(5);
  });
});
