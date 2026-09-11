// ⟳ LOT 9 (2026-09-07) — LA GRILLE DU FOYER : QUI MANGE QUOI, CASE PAR CASE.
//
// ══════════════════════════════════════════════════════════════════════════
// ⛔ LA PREMIÈRE ÉPREUVE EST CELLE QUI **PASSE** — une garde a besoin d'un cas
//    qui passe, sans quoi, cassée, elle bloque tout et ressemble à une garde
//    qui marche.
// ══════════════════════════════════════════════════════════════════════════
// `le_foyer_ordinaire` ci-dessous: deux adultes, mêmes moments, aucun régime,
// aucun « léger ». La grille doit rendre trois cases pleines, deux mangeurs
// chacune, ZÉRO dédié — c'est-à-dire exactement ce que la lane fait déjà.
// Elle est écrite en premier, exprès.
//
// ══════════════════════════════════════════════════════════════════════════
// LES MUTATIONS QUE CES ÉPREUVES DOIVENT FAIRE ROUGIR
// ══════════════════════════════════════════════════════════════════════════
//   M1 — `cellRegimeFor` rend le PLUS STRICT au lieu du majoritaire (la règle
//        d'avant, `strictestRegimeAt`). ROUGE: la table de trois omnivores et
//        d'une végane cesserait de dédier la végane.
//   M2 — `cellCharacterFor` rend `light` dès qu'UN mangeur l'a demandé.
//        ROUGE: `light_mixed` tomberait à zéro et un dîner partagé
//        deviendrait léger pour quelqu'un qui n'a rien demandé.
//   M3 — `dedicatedInCell` compare `>=` au lieu de `>`. ROUGE: une bouche qui
//        porte elle-même le régime de sa case recevrait un second plat
//        identique au premier.
//   M4 — la projection `byMouth` recalculée avec le rythme de la MAISON pour
//        tout le monde. ROUGE: `mouthCells` et la grille cesseraient de
//        parler du même plan (l'épreuve de projection).
//   M5 — `eatersByDish` passe le roster du PLAN au lieu de celui de la case.
//        ROUGE: un plat de mardi nourrirait quelqu'un qui n'y mange pas.
//   M6 — le filtre des moments passés retiré. ROUGE: `spent_cells` à zéro.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  CELL_LIGHT_REQUIRES_ALL_EATERS,
  type CellMouth,
  cellCharacterFor,
  cellRegimeFor,
  dedicatedInCell,
  dishBearingDelta,
  eatersByDish,
  householdCells,
} from "./household_cells.ts";
import { memberMealCells } from "./household_presence.ts";
import type { EatingOccasionSlot } from "./meal_generation.ts";

// ---------------------------------------------------------------------------
// Fabriques
// ---------------------------------------------------------------------------

const RYTHME3: EatingOccasionSlot[] = [
  { slot: "breakfast", size: null },
  { slot: "lunch", size: null },
  { slot: "dinner", size: null },
];

function mouth(over: Partial<CellMouth> & { memberId: string }): CellMouth {
  return {
    eatingSlots: null,
    away: [],
    lightSlots: [],
    diet: null,
    ownMealSlots: [],
    ...over,
  };
}

const NO_SPENT = { day: null, slots: [] as string[] };

function grid(over: Partial<Parameters<typeof householdCells>[0]> = {}) {
  return householdCells({
    mouths: [],
    houseRhythm: RYTHME3,
    windowDays: ["mon"],
    gridSlots: ["breakfast", "lunch", "dinner"],
    spentSlots: NO_SPENT,
    cookOnlyDay: null,
    ...over,
  });
}

// ---------------------------------------------------------------------------
// ① LE CAS QUI PASSE
// ---------------------------------------------------------------------------

Deno.test("le_foyer_ordinaire — deux bouches, trois cases pleines, zéro dédié", () => {
  const out = grid({
    mouths: [mouth({ memberId: "julie" }), mouth({ memberId: "marc" })],
  });
  assertEquals(out.counters.cells, 3);
  assertEquals(out.counters.non_empty, 3);
  assertEquals(out.counters.empty, 0);
  assertEquals(out.counters.eaters_hist["2"], 3);
  assertEquals(out.counters.dedicated_cells, 0);
  assertEquals(out.counters.dedicated_mouths, 0);
  assertEquals(out.counters.light, 0);
  assertEquals(out.counters.light_mixed, 0);
  assertEquals(out.counters.regime_by_cell, { none: 3 });
  for (const c of out.cells) {
    assertEquals(c.eaters, ["julie", "marc"]);
    assertEquals(c.regime, null);
    assertEquals(c.character, "normal");
    assertEquals(c.empty, false);
  }
});

Deno.test("les compteurs sont TOUS présents à zéro sur une grille vide", () => {
  const out = grid({ windowDays: [], gridSlots: [] });
  assertEquals(out.cells, []);
  assertEquals(out.counters.cells, 0);
  assertEquals(out.counters.non_empty, 0);
  assertEquals(out.counters.empty, 0);
  assertEquals(out.counters.light, 0);
  assertEquals(out.counters.light_mixed, 0);
  assertEquals(out.counters.dedicated_cells, 0);
  assertEquals(out.counters.dedicated_by_reason, { regime: 0, own_meal: 0 });
  assertEquals(out.counters.one_eater_cells, 0);
  assertEquals(out.counters.cook_day_cells, 0);
  assertEquals(out.counters.spent_cells, 0);
  assertEquals(out.counters.eaters_hist, { "1": 0, "2": 0, "3": 0, "4_plus": 0 });
});

// ---------------------------------------------------------------------------
// ② LES MANGEURS D'UNE CASE
// ---------------------------------------------------------------------------

Deno.test("un moment déclaré par UNE SEULE bouche n'a qu'un mangeur", () => {
  const out = grid({
    gridSlots: ["breakfast", "lunch", "snack_pm", "dinner"],
    mouths: [
      mouth({
        memberId: "julie",
        eatingSlots: [...RYTHME3, { slot: "snack_pm", size: null }],
      }),
      mouth({ memberId: "marc", eatingSlots: RYTHME3 }),
    ],
  });
  const snack = out.cells.find((c) => c.slot === "snack_pm");
  assertEquals(snack?.eaters, ["julie"]);
  assertEquals(out.counters.one_eater_cells, 1);
  assertEquals(out.counters.eaters_hist["1"], 1);
  assertEquals(out.counters.eaters_hist["2"], 3);
});

Deno.test("une absence retire la bouche de SA case, et d'elle seule", () => {
  const out = grid({
    mouths: [
      mouth({ memberId: "julie" }),
      mouth({ memberId: "marc", away: [{ day: "mon", slots: ["dinner"] }] }),
    ],
  });
  assertEquals(out.cells.find((c) => c.slot === "dinner")?.eaters, ["julie"]);
  assertEquals(out.cells.find((c) => c.slot === "lunch")?.eaters, [
    "julie",
    "marc",
  ]);
  assertEquals(out.counters.one_eater_cells, 1);
});

Deno.test("une case que PERSONNE ne mange est vide, nommée, et sans dédié", () => {
  const out = grid({
    gridSlots: ["breakfast", "lunch", "dinner", "before_bed"],
    mouths: [mouth({ memberId: "julie" }), mouth({ memberId: "marc" })],
  });
  const late = out.cells.find((c) => c.slot === "before_bed");
  assertEquals(late?.empty, true);
  assertEquals(late?.eaters, []);
  assertEquals(late?.dedicated, []);
  assertEquals(late?.regime, null);
  assertEquals(late?.character, "normal");
  assertEquals(out.counters.empty, 1);
  assertEquals(out.counters.non_empty, 3);
});

Deno.test("un jour où TOUT LE MONDE est absent ne rend que des cases vides", () => {
  const out = grid({
    windowDays: ["mon", "tue"],
    mouths: [
      mouth({ memberId: "julie", away: [{ day: "tue", slots: [] }] }),
      mouth({ memberId: "marc", away: [{ day: "tue", slots: [] }] }),
    ],
  });
  assertEquals(out.cells.filter((c) => c.day === "tue").every((c) => c.empty), true);
  assertEquals(out.counters.empty, 3);
  assertEquals(out.counters.non_empty, 3);
});

// ---------------------------------------------------------------------------
// ③ LE CARACTÈRE — léger seulement si TOUS
// ---------------------------------------------------------------------------

Deno.test("la constante du caractère est celle que le journal nomme", () => {
  assertEquals(CELL_LIGHT_REQUIRES_ALL_EATERS, true);
});

Deno.test("une case est LÉGÈRE quand tous ses mangeurs l'ont demandé", () => {
  const out = grid({
    mouths: [
      mouth({ memberId: "julie", lightSlots: ["dinner"] }),
      mouth({ memberId: "marc", lightSlots: ["dinner"] }),
    ],
  });
  assertEquals(out.cells.find((c) => c.slot === "dinner")?.character, "light");
  assertEquals(out.counters.light, 1);
  assertEquals(out.counters.light_mixed, 0);
});

Deno.test("un seul demandeur sur deux ⇒ la case reste NORMALE, et ça se compte", () => {
  const out = grid({
    mouths: [
      mouth({ memberId: "julie", lightSlots: ["dinner"] }),
      mouth({ memberId: "marc" }),
    ],
  });
  assertEquals(out.cells.find((c) => c.slot === "dinner")?.character, "normal");
  assertEquals(out.counters.light, 0);
  assertEquals(
    out.counters.light_mixed,
    1,
    "quelqu'un a demandé léger et ne l'obtient pas: ça doit se lire",
  );
});

Deno.test("un demandeur SEUL dans sa case obtient bien le léger", () => {
  const out = grid({
    gridSlots: ["breakfast", "lunch", "snack_pm", "dinner"],
    mouths: [
      mouth({
        memberId: "julie",
        eatingSlots: [...RYTHME3, { slot: "snack_pm", size: null }],
        lightSlots: ["dinner"],
      }),
      mouth({ memberId: "marc", eatingSlots: RYTHME3, lightSlots: ["dinner"] }),
    ],
  });
  assertEquals(out.cells.find((c) => c.slot === "dinner")?.character, "light");
  assertEquals(out.counters.light, 1);
});

Deno.test("une case VIDE n'est jamais légère, même si son demandeur est absent", () => {
  assertEquals(cellCharacterFor("dinner", []), "normal");
});

// ---------------------------------------------------------------------------
// ④ LE RÉGIME DE LA CASE — le majoritaire, égalité au plus strict
// ---------------------------------------------------------------------------

Deno.test("le régime d'une case est le MAJORITAIRE de ses mangeurs", () => {
  assertEquals(cellRegimeFor([null, null, null, "vegan"]), null);
  assertEquals(cellRegimeFor(["vegan", "vegan", "vegan", null]), "vegan");
  assertEquals(cellRegimeFor(["vegetarian", "vegetarian", null]), "vegetarian");
});

Deno.test("à ÉGALITÉ, le plus strict gagne — et l'ordre du roster n'y change rien", () => {
  assertEquals(cellRegimeFor(["vegan", null]), "vegan");
  assertEquals(cellRegimeFor([null, "vegan"]), "vegan");
  assertEquals(cellRegimeFor(["vegetarian", "vegan"]), "vegan");
  assertEquals(cellRegimeFor(["vegan", "vegetarian"]), "vegan");
  assertEquals(cellRegimeFor(["pescatarian", "vegetarian"]), "vegetarian");
});

Deno.test("aucun mangeur ⇒ aucun régime", () => {
  assertEquals(cellRegimeFor([]), null);
});

// ---------------------------------------------------------------------------
// ⑤ LES PLATS À PART — la minorité stricte a le sien
// ---------------------------------------------------------------------------

Deno.test("une VÉGANE à une table omnivore reçoit son plat, à chaque case", () => {
  const out = grid({
    mouths: [
      mouth({ memberId: "paul" }),
      mouth({ memberId: "claire" }),
      mouth({ memberId: "leo" }),
      mouth({ memberId: "nora", diet: "vegan" }),
    ],
  });
  assertEquals(out.counters.dedicated_cells, 3);
  assertEquals(out.counters.dedicated_mouths, 3);
  assertEquals(out.counters.dedicated_by_reason.regime, 3);
  assertEquals(out.counters.dedicated_by_reason.own_meal, 0);
  for (const c of out.cells) {
    assertEquals(c.regime, null, "la casserole suit la majorité omnivore");
    assertEquals(c.dedicated, [{ memberId: "nora", reason: "regime" }]);
  }
});

Deno.test("une table majoritairement végane nourrit l'omnivore SANS second plat", () => {
  const out = grid({
    mouths: [
      mouth({ memberId: "a", diet: "vegan" }),
      mouth({ memberId: "b", diet: "vegan" }),
      mouth({ memberId: "c", diet: "vegan" }),
      mouth({ memberId: "omni" }),
    ],
  });
  for (const c of out.cells) {
    assertEquals(c.regime, "vegan");
    assertEquals(
      c.dedicated,
      [],
      "moins strict que sa case ⇒ il mange la casserole: les exclusions sont emboîtées",
    );
  }
  assertEquals(out.counters.dedicated_cells, 0);
});

Deno.test("deux minorités strictes dans la même case sortent toutes les deux", () => {
  const out = grid({
    mouths: [
      mouth({ memberId: "a" }),
      mouth({ memberId: "b" }),
      mouth({ memberId: "vega", diet: "vegan" }),
      mouth({ memberId: "vege", diet: "vegetarian" }),
    ],
  });
  const lunch = out.cells.find((c) => c.slot === "lunch");
  assertEquals(lunch?.regime, null);
  assertEquals(lunch?.dedicated, [
    { memberId: "vega", reason: "regime" },
    { memberId: "vege", reason: "regime" },
  ]);
});

Deno.test("porter SOI-MÊME le régime de sa case ne lève aucun second plat", () => {
  assertEquals(
    dedicatedInCell(
      "lunch",
      [mouth({ memberId: "a", diet: "vegan" }), mouth({ memberId: "b", diet: "vegan" })],
      "vegan",
    ),
    [],
  );
});

Deno.test("un repas à soi ne dédie QUE son moment", () => {
  const out = grid({
    mouths: [
      mouth({ memberId: "julie" }),
      mouth({ memberId: "marc", ownMealSlots: ["breakfast"] }),
    ],
  });
  assertEquals(
    out.cells.find((c) => c.slot === "breakfast")?.dedicated,
    [{ memberId: "marc", reason: "own_meal" }],
  );
  assertEquals(out.cells.find((c) => c.slot === "lunch")?.dedicated, []);
  assertEquals(out.counters.dedicated_by_reason.own_meal, 1);
  assertEquals(out.counters.dedicated_by_reason.regime, 0);
});

Deno.test("régime ET repas à soi ⇒ UNE seule sortie, et c'est le régime", () => {
  const out = dedicatedInCell(
    "breakfast",
    [
      mouth({ memberId: "a" }),
      mouth({ memberId: "nora", diet: "vegan", ownMealSlots: ["breakfast"] }),
    ],
    null,
  );
  assertEquals(out, [{ memberId: "nora", reason: "regime" }]);
});

// ---------------------------------------------------------------------------
// ⑤ bis — LE SANS-GLUTEN, QUI N'EST SUR AUCUN AXE (2026-09-08)
// ---------------------------------------------------------------------------
//
// ⛔ CES DEUX TESTS COUVRENT UNE LIGNE QUI N'ÉTAIT COUVERTE PAR RIEN. Mesuré
// par mutation le 2026-09-08: remettre `regimeStrictness(m.diet) >
// regimeStrictness(regime)` dans `dedicatedInCell` laissait les 39 tests de ce
// fichier VERTS. La ligne qui décide qui reçoit un plat à soi — donc qui décide
// si du blé arrive dans l'assiette d'un cœliaque — n'avait aucune épreuve.

Deno.test("⛔ une bouche SANS GLUTEN dans une case VÉGÉTARIENNE a son plat", () => {
  // Le cas exact que le classement par comptage ratait: `gluten_free` n'exclut
  // aucun GROUPE (aucun groupe ne porte le gluten — `whole_grain` tient le riz
  // autant que le blé), donc il comptait ZÉRO, donc « moins strict que
  // végétarien », donc il mangeait le plat de sa case. Avec du pain dedans.
  const out = dedicatedInCell(
    "lunch",
    [
      mouth({ memberId: "a", diet: "vegetarian" }),
      mouth({ memberId: "lubna", diet: "gluten_free" }),
    ],
    "vegetarian",
  );
  assertEquals(out, [{ memberId: "lubna", reason: "regime" }]);
});

Deno.test("⛔ ET L'INVERSE: une bouche VÉGÉTARIENNE dans une case SANS GLUTEN", () => {
  // La symétrie compte autant. Un plat sans gluten peut contenir du poulet:
  // les deux axes ne se rencontrent jamais, et chacun a son plat.
  const out = dedicatedInCell(
    "lunch",
    [
      mouth({ memberId: "lubna", diet: "gluten_free" }),
      mouth({ memberId: "zoe", diet: "vegetarian" }),
    ],
    "gluten_free",
  );
  assertEquals(out, [{ memberId: "zoe", reason: "regime" }]);
});

Deno.test("⚠️ ET LA GARDE A UN CAS QUI PASSE: même régime que sa case ⇒ rien", () => {
  // Une garde qui rendrait TOUT LE MONDE dédié ressemblerait à une garde qui
  // marche. Le plat sans gluten nourrit la bouche sans gluten.
  const out = dedicatedInCell(
    "lunch",
    [
      mouth({ memberId: "lubna", diet: "gluten_free" }),
      mouth({ memberId: "a" }),
    ],
    "gluten_free",
  );
  assertEquals(out, []);
});

// ---------------------------------------------------------------------------
// ⑥ LES MOMENTS PASSÉS, LE JOUR DE CUISINE
// ---------------------------------------------------------------------------

Deno.test("les moments passés du PREMIER JOUR sont retirés, et comptés", () => {
  const out = grid({
    windowDays: ["mon", "tue"],
    mouths: [mouth({ memberId: "julie" }), mouth({ memberId: "marc" })],
    spentSlots: { day: "mon", slots: ["breakfast", "lunch"] },
  });
  assertEquals(out.cells.find((c) => c.day === "mon" && c.slot === "lunch")?.empty, true);
  assertEquals(out.cells.find((c) => c.day === "tue" && c.slot === "lunch")?.empty, false);
  assertEquals(out.counters.spent_cells, 4, "deux moments × deux bouches");
});

Deno.test("le jour de cuisine n'est pas RETIRÉ, il est COMPTÉ", () => {
  const out = grid({
    windowDays: ["sun", "mon"],
    mouths: [mouth({ memberId: "julie" })],
    cookOnlyDay: "sun",
  });
  assertEquals(out.counters.cook_day_cells, 3);
  assertEquals(
    out.cells.filter((c) => c.day === "sun").every((c) => c.empty),
    false,
    "la veille garde ses cases: la projection l'exige, et le calendrier tranchera",
  );
});

// ---------------------------------------------------------------------------
// ⑦ LA PROJECTION — `byMouth` est ce que `mouthCells` lit
// ---------------------------------------------------------------------------

Deno.test("PROJECTION — `byMouth` reproduit `mouthCells` octet pour octet", () => {
  const windowDays = ["mon", "tue", "wed"];
  const spentSlots = { day: "mon", slots: ["breakfast"] };
  const mouths = [
    mouth({ memberId: "paul" }),
    mouth({ memberId: "claire", eatingSlots: [{ slot: "lunch", size: null }] }),
    mouth({ memberId: "leo", away: [{ day: "tue", slots: [] }] }),
    mouth({
      memberId: "nora",
      diet: "vegan",
      away: [{ day: "wed", slots: ["dinner"] }],
    }),
  ];
  const out = householdCells({
    mouths,
    houseRhythm: RYTHME3,
    windowDays,
    gridSlots: ["breakfast", "lunch", "dinner"],
    spentSlots,
    cookOnlyDay: null,
  });

  // La construction d'AUJOURD'HUI, recopiée de `index.ts :: mouthCells`.
  const spent = new Set(spentSlots.slots);
  const firstDay = windowDays[0];
  const legacy = mouths.map((m) => ({
    memberId: m.memberId,
    regime: m.diet,
    cells: memberMealCells({
      away: m.away,
      rhythm: m.eatingSlots ?? RYTHME3,
      windowDays,
    }).filter((c) =>
      !(spent.size > 0 && c.day === firstDay && spent.has(String(c.slot)))
    ),
  }));

  assertEquals(out.byMouth, legacy);
});

Deno.test("PROJECTION — une bouche sans aucun moment ne rend aucune case", () => {
  const out = grid({
    mouths: [mouth({ memberId: "julie", eatingSlots: [] })],
  });
  assertEquals(out.byMouth[0].cells, []);
  assertEquals(out.counters.non_empty, 0);
  assertEquals(out.counters.empty, 3);
});

Deno.test("DÉTERMINISME — deux appels identiques rendent la même grille", () => {
  const args = {
    mouths: [
      mouth({ memberId: "b", diet: "vegan", lightSlots: ["dinner"] }),
      mouth({ memberId: "a", ownMealSlots: ["breakfast"] }),
    ],
    houseRhythm: RYTHME3,
    windowDays: ["mon", "tue"],
    gridSlots: ["breakfast", "lunch", "dinner"],
    spentSlots: NO_SPENT,
    cookOnlyDay: null,
  };
  assertEquals(householdCells(args), householdCells(args));
});

// ---------------------------------------------------------------------------
// ⑧ L'ÉCART AVEC LA RÈGLE D'AUJOURD'HUI
// ---------------------------------------------------------------------------

// ⚠️ TROIS OMNIVORES, PAS UN. À deux bouches, une végane et un omnivore sont à
// ÉGALITÉ, et l'égalité va au plus strict: la table mange végane et personne
// n'est dédié. Il faut une vraie MINORITÉ pour que l'écart existe — c'est la
// règle de `cellRegimeFor`, et l'écrire ici évite d'aller « corriger » le
// module la prochaine fois que ce test surprend quelqu'un.
function tableAvecUneVegane() {
  return grid({
    mouths: [
      mouth({ memberId: "paul" }),
      mouth({ memberId: "claire" }),
      mouth({ memberId: "leo" }),
      mouth({ memberId: "nora", diet: "vegan" }),
    ],
  });
}

Deno.test("l'écart NOMME la végane que la règle d'aujourd'hui ne dédie pas", () => {
  const delta = dishBearingDelta(tableAvecUneVegane().cells, []);
  assertEquals(delta.onlyInCells, ["nora"]);
  assertEquals(delta.onlyInCurrent, []);
  assertEquals(delta.delta, 1);
});

Deno.test("l'écart est NUL quand les deux règles nomment les mêmes bouches", () => {
  assertEquals(dishBearingDelta(tableAvecUneVegane().cells, ["nora"]).delta, 0);
});

Deno.test("l'écart nomme AUSSI la bouche que la règle d'aujourd'hui dédie seule", () => {
  const delta = dishBearingDelta(tableAvecUneVegane().cells, ["nora", "paul"]);
  assertEquals(delta.onlyInCells, []);
  assertEquals(delta.onlyInCurrent, ["paul"], "l'omnivore à exigence de R5");
  assertEquals(delta.delta, 1);
});

// ---------------------------------------------------------------------------
// ⑨ LES MANGEURS DE CHAQUE PLAT
// ---------------------------------------------------------------------------

Deno.test("un plat de table nourrit les mangeurs de SA case, pas le roster du plan", () => {
  const out = grid({
    windowDays: ["mon", "tue"],
    mouths: [
      mouth({ memberId: "julie" }),
      mouth({ memberId: "marc", away: [{ day: "tue", slots: [] }] }),
    ],
  });
  const fed = eatersByDish({
    dishes: [
      { day: "mon", slot: "lunch", memberId: null },
      { day: "tue", slot: "lunch", memberId: null },
    ],
    cells: out.cells,
  });
  assertEquals([...(fed.fedByDish[0] ?? [])].sort(), ["julie", "marc"]);
  assertEquals([...(fed.fedByDish[1] ?? [])], ["julie"]);
  assertEquals(fed.counters.placed, 2);
  assertEquals(fed.counters.off_cell, 0);
});

Deno.test("un plat dédié retire sa bouche du plat de table de la MÊME case", () => {
  const out = grid({
    mouths: [
      mouth({ memberId: "paul" }),
      mouth({ memberId: "claire" }),
      mouth({ memberId: "nora", diet: "vegan" }),
    ],
  });
  const fed = eatersByDish({
    dishes: [
      { day: "mon", slot: "lunch", memberId: null },
      { day: "mon", slot: "lunch", memberId: "nora" },
      { day: "mon", slot: "dinner", memberId: null },
    ],
    cells: out.cells,
  });
  assertEquals([...(fed.fedByDish[0] ?? [])].sort(), ["claire", "paul"]);
  assertEquals([...(fed.fedByDish[1] ?? [])], ["nora"]);
  assertEquals(
    [...(fed.fedByDish[2] ?? [])].sort(),
    ["claire", "nora", "paul"],
    "l'exclusion vaut pour LA CASE, pas pour le plan",
  );
  assertEquals(fed.counters.excluded, 1);
});

Deno.test("DEUX dédiés dans une case laissent N−2 au plat de la table", () => {
  const out = grid({
    mouths: [
      mouth({ memberId: "a" }),
      mouth({ memberId: "b" }),
      mouth({ memberId: "vega", diet: "vegan" }),
      mouth({ memberId: "vege", diet: "vegetarian" }),
    ],
  });
  const fed = eatersByDish({
    dishes: [
      { day: "mon", slot: "lunch", memberId: null },
      { day: "mon", slot: "lunch", memberId: "vega" },
      { day: "mon", slot: "lunch", memberId: "vege" },
    ],
    cells: out.cells,
  });
  assertEquals([...(fed.fedByDish[0] ?? [])].sort(), ["a", "b"]);
  assertEquals(fed.counters.excluded, 2);
});

Deno.test("l'ordre du document ne change RIEN à la partition", () => {
  const out = grid({
    mouths: [mouth({ memberId: "a" }), mouth({ memberId: "nora", diet: "vegan" })],
  });
  const shared = { day: "mon", slot: "lunch", memberId: null };
  const own = { day: "mon", slot: "lunch", memberId: "nora" };
  const before = eatersByDish({ dishes: [shared, own], cells: out.cells });
  const after = eatersByDish({ dishes: [own, shared], cells: out.cells });
  assertEquals([...(before.fedByDish[0] ?? [])], ["a"]);
  assertEquals([...(after.fedByDish[1] ?? [])], ["a"]);
});

Deno.test("un plat frais NOURRIT — la garde du contenant ne décide plus qui mange", () => {
  const out = grid({ mouths: [mouth({ memberId: "julie" })] });
  const fed = eatersByDish({
    dishes: [{ day: "mon", slot: "breakfast", memberId: null }],
    cells: out.cells,
  });
  assertEquals(
    [...(fed.fedByDish[0] ?? [])],
    ["julie"],
    "un petit-déjeuner sans casserole nourrit quand même: tout ce qui est mangé compte",
  );
  assertEquals(fed.counters.placed, 1);
});

Deno.test("un plat posé sur une case VIDE est écarté, et nommé", () => {
  const out = grid({
    gridSlots: ["breakfast", "lunch", "dinner", "before_bed"],
    mouths: [mouth({ memberId: "julie" })],
  });
  const fed = eatersByDish({
    dishes: [
      { day: "mon", slot: "before_bed", memberId: null },
      { day: "mon", slot: "lunch", memberId: null },
    ],
    cells: out.cells,
  });
  assertEquals(fed.fedByDish[0], null);
  assertEquals(fed.counters.off_cell, 1);
  assertEquals(fed.counters.placed, 1);
});

Deno.test("un plat sans jour ni moment est écarté, jamais deviné", () => {
  const out = grid({ mouths: [mouth({ memberId: "julie" })] });
  const fed = eatersByDish({
    dishes: [{ day: null, slot: "lunch", memberId: null }, {
      day: "mon",
      slot: null,
      memberId: null,
    }],
    cells: out.cells,
  });
  assertEquals(fed.fedByDish, [null, null]);
  assertEquals(fed.counters.off_cell, 2);
});

Deno.test("un plat dédié à une bouche qui ne mange PAS là est nommé", () => {
  const out = grid({
    mouths: [
      mouth({ memberId: "julie" }),
      mouth({ memberId: "marc", away: [{ day: "mon", slots: ["dinner"] }] }),
    ],
  });
  const fed = eatersByDish({
    dishes: [
      { day: "mon", slot: "dinner", memberId: null },
      { day: "mon", slot: "dinner", memberId: "marc" },
    ],
    cells: out.cells,
  });
  assertEquals([...(fed.fedByDish[0] ?? [])], ["julie"]);
  assertEquals(fed.counters.dedicated_off_cell, 1);
});

Deno.test("un plat de table dont tous les mangeurs sont dédiés ne nourrit PERSONNE, et le dit", () => {
  const out = grid({
    mouths: [mouth({ memberId: "nora", diet: "vegan" })],
  });
  const fed = eatersByDish({
    dishes: [
      { day: "mon", slot: "lunch", memberId: null },
      { day: "mon", slot: "lunch", memberId: "nora" },
    ],
    cells: out.cells,
  });
  assertEquals([...(fed.fedByDish[0] ?? [])], []);
  assertEquals(fed.counters.shared_fed_nobody, 1);
  assertEquals(fed.counters.fed_hist["0"], 1);
});

Deno.test("les compteurs de partition ont un DÉNOMINATEUR non nul sur un vrai plan", () => {
  const out = grid({
    windowDays: ["mon", "tue"],
    mouths: [
      mouth({ memberId: "paul" }),
      mouth({ memberId: "claire" }),
      mouth({ memberId: "nora", diet: "vegan" }),
    ],
  });
  const dishes = out.cells
    .filter((c) => !c.empty)
    .flatMap((c) => [
      { day: c.day, slot: c.slot, memberId: null },
      ...c.dedicated.map((d) => ({ day: c.day, slot: c.slot, memberId: d.memberId })),
    ]);
  const fed = eatersByDish({ dishes, cells: out.cells });
  assertEquals(fed.counters.dishes, 12, "6 cases × (1 plat de table + 1 dédié)");
  assertEquals(fed.counters.placed, 12);
  assertEquals(fed.counters.off_cell, 0);
  assertEquals(fed.counters.excluded, 6);
  assertEquals(fed.counters.shared_fed_nobody, 0);
  assertEquals(fed.counters.fed_hist["2"], 6, "la table garde Paul et Claire");
  assertEquals(fed.counters.fed_hist["1"], 6, "Nora sur son plat");
});

// ---------------------------------------------------------------------------
// ⑩ LE CÂBLAGE — un module pur que personne n'appelle est un document
// ---------------------------------------------------------------------------

Deno.test("CÂBLAGE — la grille est calculée AVANT le prompt, et `mouthCells` en est la projection", async () => {
  const src = await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  const gridAt = src.indexOf("const householdGrid = householdCells({");
  // ⟳ LOT 11 — LE BRIEF S'ASSEMBLE EN DEUX TEMPS: son objet d'entrée, puis le
  // constructeur CHOISI (v33 empilé, ou v34 cartes/calendrier). Ce qui se
  // garde ici n'a pas changé — la grille doit précéder le brief, sans quoi le
  // calendrier ne pourrait pas la lire — mais le point d'ancrage est
  // maintenant l'objet d'entrée, qui est ce que les deux constructeurs lisent.
  const promptAt = src.indexOf("const householdPromptInput = {");
  const logAt = src.indexOf('tag: "keel.household_meal.cells"');
  // ⟳ 2026-09-08 — LA PROJECTION SE LIT SUR SA SOURCE, PAS SUR SON LITTÉRAL.
  // Une autre session a rendu `mouthCells` conditionnel (le jour de cuisine
  // n'attend aucun repas), et l'assertion d'égalité de chaîne est tombée sur un
  // code JUSTE. Ce qui se garde est que la grille en est la SEULE source.
  const projectionAt = src.indexOf("const mouthCells = ");
  const deliveredAt = src.indexOf("mealsDelivered(deliveredViewOf(meal), mouthCells)");

  assert(gridAt > 0, "la grille n'est pas calculée: le module ne sert à rien");
  assert(promptAt > 0, "l'objet d'entrée du brief a été renommé");
  assert(
    gridAt < promptAt,
    "la grille est calculée APRÈS le prompt: le calendrier ne pourrait pas la lire",
  );
  // ⛔ ET LE CALENDRIER LA LIT VRAIMENT. Sans cette ligne, la grille pourrait
  // être calculée en avance, journalisée, et le brief v34 en recalculer une
  // seconde — c'est le défaut que le lot 9 existe pour fermer, déplacé d'un
  // cran.
  assert(
    src.includes("cells: householdGrid.cells,"),
    "le brief v34 ne lit pas la grille: deux idées de « qui mange quand »",
  );
  assert(logAt > gridAt, "la grille n'est pas journalisée: on ne saurait pas ce qu'elle voit");
  assert(
    projectionAt > gridAt,
    "`mouthCells` n'est pas la projection: deux grilles finiraient par diverger",
  );
  const projection = src.slice(projectionAt, projectionAt + 400);
  assert(
    projection.includes("householdGrid.byMouth"),
    "`mouthCells` ne dérive plus de la grille: deux idées de « qui mange quand »",
  );
  assert(
    deliveredAt > projectionAt,
    "l'invariant de livraison lit une autre grille que celle du prompt",
  );
  // ⛔ UNE SEULE BOUCLE `memberMealCells` PAR BOUCHE DANS LA LANE. Elle vit
  // maintenant dans le module; celle qui reste sert à la FUSION
  // (`mergedEaterCells`) et aux porteurs (`compositionEaterCells`), pas à la
  // grille. Un troisième appel serait le second calcul que ce lot supprime.
  assert(
    !/const mouthCells = platedMembers\.map/.test(src),
    "la boucle d'avant est revenue à côté de la projection",
  );
  // L'écart avec la règle d'aujourd'hui est mesuré, pas appliqué.
  assert(
    src.includes("dishBearingDelta("),
    "l'écart entre les deux règles de plat dédié n'est pas mesuré",
  );
});

// ⟳ 2026-09-09 — LE COMPLÉMENT, LU SUR LA GRILLE.
Deno.test("un plat à un nom marqué complément laisse sa bouche sur le plat de table de la case, et est nommé complément", () => {
  const out = grid({
    mouths: [mouth({ memberId: "paul" }), mouth({ memberId: "claire" })],
  });
  const day = out.cells.find((c) => !c.empty)!.day;
  const slot = out.cells.find((c) => !c.empty)!.slot;
  const fed = eatersByDish({
    dishes: [
      { day, slot, memberId: null },
      { day, slot, memberId: "paul", complementsShared: true },
    ],
    cells: out.cells,
  });
  assertEquals([...(fed.fedByDish[0] ?? [])].sort(), ["claire", "paul"], "Paul a quitté la table");
  assertEquals([...(fed.fedByDish[1] ?? [])], ["paul"]);
  assertEquals(fed.complementByDish, [false, true]);
  assertEquals(fed.counters.complements, 1);
  assertEquals(fed.counters.excluded, 0);
});
