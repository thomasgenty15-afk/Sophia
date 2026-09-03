import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  dayMoments,
  defaultSelectedDay,
  effectiveSelectedDay,
  waveForDate,
} from "./planDayView";
import { buildPlanGrid } from "./planGridModel";
import { windowDates, windowDayOrder } from "../api/mealWindow";
import { readDraftPlan } from "../api/planDraft";
import type { GeneratedDish } from "../api/mealGeneration";

/**
 * LOT 1 — LA VUE PAR JOUR. Ce que ces tests protègent, dans l'ordre de ce qui
 * coûte le plus cher quand ça casse:
 *
 *   * L'ORDRE CALENDAIRE — une semaine commencée mercredi qui s'ouvrirait sur
 *     lundi ouvrirait sur un jour qui a l'air raté;
 *   * LE JOUR D'OUVERTURE — la vue jour doit ouvrir AUJOURD'HUI quand
 *     aujourd'hui est dans la fenêtre, et sur le premier jour du PLAN sinon;
 *   * LE GROUPE SANS JOUR — filtré sur un jour, il disparaîtrait d'un plan qui
 *     le contient;
 *   * LE RAIL ET LA GRILLE — deux entrées, UN état: les masquer ou les couper
 *     de `setSelectedDay` rend la vue jour inatteignable.
 */

// UNE SEMAINE COMMENCÉE MERCREDI — le cas qui a produit `windowDayOrder`.
// Les dates sont LITTÉRALES: le 2026-08-12 est un mercredi.
const STARTS = "2026-08-12";
const ORDER = windowDayOrder(STARTS, 7);
const DATES = windowDates(STARTS, 7);

describe("defaultSelectedDay — le jour qu'on ouvre", () => {
  it("la vue jour ouvre sur AUJOURD'HUI quand il est dans la fenêtre", () => {
    // Le vendredi 14: le troisième jour du plan, pas le premier.
    expect(
      defaultSelectedDay({ view: "day", order: ORDER, dates: DATES, today: "2026-08-14" }),
    ).toBe("fri");
  });

  it("aujourd'hui HORS fenêtre ⇒ le PREMIER jour du plan, jamais le calendrier", () => {
    // Un plan « suivant », regardé avant son départ: mercredi ouvre, pas lundi.
    expect(
      defaultSelectedDay({ view: "day", order: ORDER, dates: DATES, today: "2026-08-01" }),
    ).toBe("wed");
  });

  it("l'aperçu (today = startsOn) tombe sur le premier jour du brouillon", () => {
    // C'est la jointure qui rend le brouillon correct SANS code dédié:
    // `PlanDraftDialog` passe `today={draft.startsOn}` depuis toujours.
    expect(
      defaultSelectedDay({ view: "day", order: ORDER, dates: DATES, today: STARTS }),
    ).toBe("wed");
  });

  it("la vue semaine ouvre « all », quel que soit aujourd'hui", () => {
    expect(
      defaultSelectedDay({ view: "week", order: ORDER, dates: DATES, today: "2026-08-14" }),
    ).toBe("all");
  });

  it("une fenêtre courte n'ouvre que ses propres jours", () => {
    // Trois jours à partir du mercredi: le samedi n'existe pas dans ce plan.
    const order = windowDayOrder(STARTS, 3);
    const dates = windowDates(STARTS, 3);
    expect(
      defaultSelectedDay({ view: "day", order, dates, today: "2026-08-15" }),
    ).toBe("wed");
  });

  it("sans aucun jour, « all » — jamais un jeton inventé", () => {
    expect(
      defaultSelectedDay({ view: "day", order: [], dates: {}, today: "2026-08-14" }),
    ).toBe("all");
  });
});

describe("effectiveSelectedDay — une sélection qui survit au changement de plan", () => {
  it("« all » et un jeton de la fenêtre passent tels quels", () => {
    expect(
      effectiveSelectedDay({ selected: "all", order: ORDER, dates: DATES, today: "2026-08-14" }),
    ).toBe("all");
    expect(
      effectiveSelectedDay({ selected: "sat", order: ORDER, dates: DATES, today: "2026-08-14" }),
    ).toBe("sat");
  });

  it("un jeton hors de la NOUVELLE fenêtre retombe sur le défaut, jamais sur du vide", () => {
    // L'onglet « courant » → « suivant » garde le composant monté: un `sun`
    // choisi sur un plan de 7 jours n'existe pas dans un suivant de 3.
    const order = windowDayOrder(STARTS, 3);
    const dates = windowDates(STARTS, 3);
    expect(
      effectiveSelectedDay({ selected: "sun", order, dates, today: "2026-08-13" }),
    ).toBe("thu");
  });
});

describe("waveForDate — la vague qui tombe ce jour-là", () => {
  const WAVES = [
    { buyOn: "2026-08-12", servesCookOn: null, indices: [0, 2] },
    { buyOn: "2026-08-15", servesCookOn: "2026-08-16", indices: [1] },
  ];

  it("la jointure est une égalité de DATES — celle que `windowDates` a rendue", () => {
    // Le samedi du plan commencé mercredi: `DATES.sat` vaut le 15.
    expect(waveForDate(WAVES, DATES["sat"] ?? null)?.indices).toEqual([1]);
    expect(waveForDate(WAVES, DATES["wed"] ?? null)?.indices).toEqual([0, 2]);
  });

  it("un jour sans vague rend `null` — pas la vague la plus proche", () => {
    // Le jeudi 13: entre deux vagues. Rapprocher « au plus proche » enverrait
    // quelqu'un au magasin un jour qui n'est écrit nulle part.
    expect(waveForDate(WAVES, "2026-08-13")).toBeNull();
  });

  it("un jeton hors fenêtre n'a pas de date, donc pas de vague", () => {
    expect(waveForDate(WAVES, null)).toBeNull();
  });
});

describe("dayMoments — la colonne d'un jour, lue dans la grille", () => {
  function dish(over: Partial<GeneratedDish> = {}): GeneratedDish {
    return {
      title: "Chicken and rice",
      slot: "dinner",
      day: "wed",
      ingredients: [],
      method: "Cook it.",
      why: "",
      uses: [],
      ...over,
    } as GeneratedDish;
  }

  const GRID = buildPlanGrid({
    days: ["wed", "thu"],
    rhythm: [
      { slot: "breakfast", size: null },
      { slot: "lunch", size: null },
      { slot: "dinner", size: null },
    ],
    groups: [{ day: "wed", dishes: [dish()] }],
    awayDays: [{ day: "wed", slots: ["lunch"] }],
    fixedIntakes: [],
    dayProperties: [{ day: "thu", properties: ["leftovers"] }],
  });

  it("rend chaque moment du jour avec le motif de sa case", () => {
    expect(dayMoments(GRID, "wed")).toEqual([
      { slot: "breakfast", cell: { kind: "empty" } },
      { slot: "lunch", cell: { kind: "away" } },
      {
        slot: "dinner",
        cell: {
          kind: "dish",
          title: "Chicken and rice",
          fromBatch: false,
          // D3b — un plat de TABLE sans collision: les trois compteurs sont à
          // leur valeur de repos. L'égalité EXACTE est gardée exprès.
          ownMouths: 0,
          titleIsOwn: false,
          extraTableDishes: 0,
        },
      },
    ]);
  });

  it("lit LA colonne du jour demandé, pas la première", () => {
    expect(dayMoments(GRID, "thu").map((m) => m.cell.kind)).toEqual([
      "leftovers",
      "leftovers",
      "leftovers",
    ]);
  });

  it("un jour hors grille, ou sans jour, rend [] — rien à motiver", () => {
    expect(dayMoments(GRID, "sun")).toEqual([]);
    expect(dayMoments(GRID, null)).toEqual([]);
  });
});

/**
 * LE CÂBLAGE, TESTÉ SUR LA SOURCE.
 *
 * ⚠️ COMMENTAIRES RETIRÉS — cicatrice `caller-audit-must-strip-comments`: les
 * en-têtes de ces fichiers PARLENT du rail et de la sélection pour les
 * documenter, et un `includes` sur la source brute passerait au vert sur un
 * commentaire.
 */
describe("le câblage de la vue jour", () => {
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

  const RESULT = "frontend/src/keel/components/plan/PlanResult.tsx";
  const GRID = "frontend/src/keel/components/plan/PlanGrid.tsx";

  it("le rail des jours existe, et il écrit dans LA sélection", () => {
    const src = code(RESULT);
    expect(src, "le bouton « toute la semaine » a disparu").toContain(
      'mealCopy("meals.result.day_all")',
    );
    expect(src, "le rail n'écrit plus la sélection").toContain(
      'onClick={() => setSelectedDay("all")}',
    );
    expect(src, "les jours du rail n'écrivent plus la sélection").toContain(
      "onClick={() => setSelectedDay(day)}",
    );
  });

  it("la grille est le sélecteur naturel: son `<th>` filtre le détail", () => {
    const grid = code(GRID);
    expect(grid, "le `<th>` n'est plus cliquable").toContain(
      "onClick={() => props.onSelectDay?.(day)}",
    );
    const result = code(RESULT);
    expect(result, "`PlanResult` ne branche plus la grille sur la sélection")
      .toContain("onSelectDay={(day) => setSelectedDay(day)}");
  });

  it("la grille et le détail lisent la MÊME dérivation du plan", () => {
    const src = code(RESULT);
    // Une seule expansion par jour (`groupByDay`), lue par la grille ET par
    // les blocs: deux dérivations du même plan divergent.
    expect(src).toContain("const groups = groupByDay(props.dishes, dayOrder);");
    expect(src.match(/groupByDay\(/g)?.length, "une seconde dérivation est apparue").toBe(1);
    expect(src, "la grille ne lit plus `groups`").toContain("groups,");
    expect(src, "le détail ne lit plus `groups`").toContain("shownGroups.map");
  });

  it("le groupe SANS JOUR n'est jamais perdu par la vue jour", () => {
    const src = code(RESULT);
    expect(src, "le groupe `day: null` est filtré par la vue jour").toContain(
      "...(undated ? [undated] : []),",
    );
  });

  it("la sélection passe par `effectiveSelectedDay` — jamais un état brut", () => {
    const src = code(RESULT);
    expect(src, "une sélection périmée rendrait un écran vide").toContain(
      "effectiveSelectedDay({",
    );
  });

  it("l'aperçu ouvre la SEMAINE, le validé ouvre le JOUR", () => {
    const dialog = code("frontend/src/keel/components/plan/PlanDraftDialog.tsx");
    expect(dialog, "l'aperçu n'ouvre plus en semaine entière").toContain(
      'defaultView="week"',
    );
    const result = code(RESULT);
    expect(result, "le défaut n'est plus la vue jour").toContain(
      'props.defaultView ?? "day"',
    );
  });

  const BLOCK = "frontend/src/keel/components/plan/PlanDayBlock.tsx";

  it("le bloc jour rend LA session de son jour, filtrée sur le jeton", () => {
    const block = code(BLOCK);
    expect(block, "la session du jour est débranchée").toContain(
      "props.cookingSessions.filter((s) => s.day === group.day)",
    );
    expect(block, "la carte de session a disparu").toContain("<DaySessionCard");
  });

  it("la vague du jour vient de `waveForDate`, jointe par la DATE de `windowDates`", () => {
    const result = code(RESULT);
    // Le module serveur réexporté fait les vagues; l'écran ne recode rien.
    expect(result, "les vagues ne viennent plus du module serveur").toContain(
      "waveAssignments({",
    );
    expect(result, "la jointure jeton→date est cassée ou recodée").toContain(
      "waveForDate(waves, dayDates[group.day] ?? null)",
    );
    const block = code(BLOCK);
    expect(block, "le bloc courses du jour a disparu").toContain(
      "<DayGroceriesCard",
    );
  });

  it("les deux surfaces passent la liste de courses — même corps de plan", () => {
    const builder = code("frontend/src/keel/components/MealBuilder.tsx");
    expect(builder, "le validé ne passe plus la liste").toContain(
      "shoppingList={result?.shoppingList ?? []}",
    );
    const dialog = code("frontend/src/keel/components/plan/PlanDraftDialog.tsx");
    expect(dialog, "l'aperçu ne passe plus la liste").toContain(
      "shoppingList={draft.shoppingList}",
    );
  });

  /**
   * ⚠️ LE TEST AU-DESSUS EST UN TEST DE CÂBLAGE, ET IL A ÉTÉ VERT SUR UNE PROP
   * MORTE. `PlanDraftDialog` passait bien `draft.shoppingList` — mais
   * `readDraftPlan` rendait `shoppingList: []` EN DUR, sous un commentaire qui
   * avait survécu à sa cause (« le brouillon ne montre pas de courses:
   * `PlanResult` n'en rend pas »), vrai avant le LOT 1 et faux depuis. La carte
   * « les courses du jour » ne pouvait donc structurellement pas apparaître à
   * l'aperçu, alors qu'elle apparaît sur le plan adopté — mesuré au navigateur
   * le 2026-08-17, aucun jour de l'aperçu ne la portait.
   *
   * Ce test-ci mord sur la VALEUR, pas sur un littéral de source: c'est le seul
   * qui tombe quand le lecteur rejette la ligne que le serveur a rendue.
   */
  it("l'aperçu porte VRAIMENT ses courses — le lecteur ne les jette pas", () => {
    const plan = readDraftPlan({
      window: { starts_on: STARTS, duration_days: 7 },
      dishes: [],
      shopping_list: [
        // ⟳ 2026-08-23 — `food_group` EST DANS LA CHARGE DEPUIS `L0-a`, et le
        // lecteur le laissait tomber. C'est lui qui porte la date d'achat.
        { term: "chicken thighs", quantity: "1.2 kg", aisle: "butcher", food_group: "poultry" },
        { term: "couscous", quantity: "500 g", aisle: "dry_goods" },
      ],
    });
    expect(plan.shoppingList, "le lecteur du brouillon jette la liste de courses")
      .toHaveLength(2);
    expect(plan.shoppingList[0]).toEqual({
      term: "chicken thighs",
      quantity: "1.2 kg",
      aisle: "butcher",
      // ⛔ IL TRAVERSE, et cette assertion exhaustive est ce qui le prouve.
      food_group: "poultry",
      // ⟳ 2026-09-01 — LA DATE D'ACHAT TRAVERSE AUSSI, et l'assertion reste
      // EXHAUSTIVE exprès: c'est elle qui a fait rougir le jour où le champ est
      // né, plutôt que de le laisser se perdre en silence comme `food_group`
      // s'était perdu. `null` ici parce que la réponse simulée n'en porte pas.
      buy_on: null,
    });
    // ⚠️ ET SON ABSENCE RESTE UNE ABSENCE: la seconde ligne n'en porte pas
    // (un plan écrit avant `L0-a`), et le lecteur rend `null` — une valeur
    // pleine qui dit « pas de groupe », jamais un champ manquant.
    expect(plan.shoppingList[1].food_group).toBeNull();
    // Et l'absence reste une absence: une réponse sans liste rend `[]`, pas un
    // article vide — c'est le cas passant de la garde.
    expect(
      readDraftPlan({ window: { starts_on: STARTS, duration_days: 7 } })
        .shoppingList,
    ).toEqual([]);
  });

  it("le motif d'un moment vide vient de la grille, en vue jour", () => {
    const result = code(RESULT);
    expect(result, "les moments ne sont plus lus dans la grille").toContain(
      'moments={shown === "all" ? [] : dayMoments(grid, group.day)}',
    );
    const block = code(BLOCK);
    expect(block, "les silences du jour ne sont plus rendus").toContain(
      'props.moments.filter((m) => m.cell.kind !== "dish")',
    );
  });

  it("⛔ aucune règle de vague recodée côté écran", () => {
    // `MAX_FRIDGE_DAYS` et la règle « périssable » vivent dans le module
    // serveur. Leur retour ici serait le jumeau supprimé le 2026-08-10.
    for (const rel of [RESULT, BLOCK, "frontend/src/keel/lib/planDayView.ts"]) {
      const src = code(rel);
      expect(src, `une règle de vague est recodée dans ${rel}`)
        .not.toContain("MAX_FRIDGE_DAYS");
      expect(src, `une règle de fraîcheur est recodée dans ${rel}`)
        .not.toContain("PERISHABLE");
    }
  });
});
