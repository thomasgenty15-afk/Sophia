import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  CELL_EDIT_MAX,
  cellEditInstruction,
  exclusionEditCells,
  mergeCellEdit,
  readCellEdits,
} from "./cell_edit.ts";
import type { GeneratedMeal } from "./meal_generation.ts";

// ── Le même décor que `retry_merge_test.ts` (copié, pas importé: un test n'exporte pas) ──
function dish(day: string, slot: string, title: string, prepId: string | null = null) {
  return {
    name: null, title, slot, day,
    ingredients: [{ term: title.split(",")[0].toLowerCase(), quantity: "1 kg", in_pantry: false, amount: 1000, unit: "g", state: "raw", gramsRaw: 1000, quantitySource: "structured" }],
    method: "Cuire.", why: "", honours_belief_keys: [],
    uses: prepId ? [{ preparationId: prepId, servings: 1, kept: "fridge" }] : [],
    boxes: [], memberId: null, heldOff: [],
  } as unknown as GeneratedMeal["dishes"][number];
}
function prep(id: string, title: string, cookOn: string | null) {
  return { id, title, servingsMade: 2, method: `Préparer ${title}.`, activeMinutes: 10, totalMinutes: 20, cookOn, ingredients: [{ term: title.toLowerCase(), quantity: "500 g", in_pantry: false, amount: 500, unit: "g", state: "raw", gramsRaw: 500, quantitySource: "structured" }] } as unknown as GeneratedMeal["preparations"][number];
}
function meal(over: Partial<GeneratedMeal>): GeneratedMeal {
  return { dishes: [], preparations: [], cooking_sessions: [], shopping_list: [], rejected_numeric: [], rejected_aisles: [], protein_anchor_missing: [], empty_slots: [], session_overruns: [], ...over } as unknown as GeneratedMeal;
}
const base = () => meal({
  dishes: [
    dish("thu", "lunch", "Poulet, riz", "prep_chicken"),
    dish("thu", "dinner", "Lentilles, carottes", "prep_lentils"),
    dish("fri", "lunch", "Saumon, orge"),
    dish("fri", "dinner", "Œufs, pommes de terre"),
  ],
  preparations: [prep("prep_chicken", "Poulet rôti", "wed"), prep("prep_lentils", "Lentilles", "wed")],
  cooking_sessions: [{ day: "wed", preparationIds: ["prep_chicken", "prep_lentils"], runThrough: "", totalMinutes: 40 }] as never,
  shopping_list: [{ term: "poulet rôti", quantity: "500 g", aisle: "meat" }, { term: "lentilles", quantity: "500 g", aisle: "dry" }] as never,
});
const CELL = { day: "fri" as const, slot: "dinner" as const, text: "plutôt du poulet" };

Deno.test("readCellEdits — une case lisible passe ; jour, créneau, texte, doublon, plafond se comptent", () => {
  const ok = readCellEdits([{ day: "FRI", slot: "Dinner", text: " plutôt du poulet " }]);
  assertEquals(ok.cells, [CELL]);
  assertEquals(ok.refused.total, 0);
  const bad = readCellEdits([
    { day: "vendredi", slot: "dinner", text: "x" },
    { day: "fri", slot: "soir", text: "x" },
    { day: "fri", slot: "dinner", text: "" },
    "nope",
    { day: "fri", slot: "dinner", text: "a" },
    { day: "fri", slot: "dinner", text: "b" },
  ]);
  assertEquals(bad.cells.length, 1);
  assertEquals(bad.refused.badDay, 1);
  assertEquals(bad.refused.badSlot, 1);
  assertEquals(bad.refused.badText, 1);
  assertEquals(bad.refused.malformed, 1);
  assertEquals(bad.refused.duplicate, 1);
  const many = readCellEdits(["mon", "tue", "wed", "thu"].map((day) => ({ day, slot: "lunch", text: "x" })));
  assertEquals(many.cells.length, CELL_EDIT_MAX);
  assertEquals(many.refused.tooMany, 1);
  assertEquals(readCellEdits(undefined).cells, []);
});

Deno.test("cellEditInstruction — la promesse « ONLY » touche la liste des cases, et le plan entier suit", () => {
  const p = cellEditInstruction({ planSourceText: '{"dishes":[]}', cells: [CELL], returns: "full_plan" });
  const only = p.indexOf("ONLY these cells");
  const cell = p.indexOf('- fri dinner — they wrote: "plutôt du poulet"');
  assert(only >= 0 && cell >= 0 && cell - only < 200, "la promesse et la case ne se touchent pas");
  assert(p.includes("Return the FULL plan"));
  // La case vide du calendrier : le modèle l'écrit, il ne la laisse pas vide.
  assert(p.includes("NO dish in THE PLAN below is an EMPTY cell") && p.includes("An empty cell is never an answer"));
  assert(p.endsWith('{"dishes":[]}'));
  // Les guillemets de la phrase ne cassent pas la ligne.
  assert(cellEditInstruction({ planSourceText: "", cells: [{ ...CELL, text: 'du "poulet"' }], returns: "full_plan" }).includes("they wrote: \"du 'poulet'\""));
});

Deno.test("⛔ mergeCellEdit — SEULE la case demandée est prise ; une case non demandée que le modèle a réécrite est IGNORÉE par construction", () => {
  const b = base();
  const retry = meal({
    dishes: [
      dish("thu", "lunch", "Dinde, quinoa"), // réécrite sans qu'on l'ait demandé
      dish("thu", "dinner", "Lentilles, carottes", "prep_lentils"),
      dish("fri", "lunch", "Sardines, pain"), // idem
      dish("fri", "dinner", "Poulet, courgettes", "prep_chicken"), // la case visée
    ],
    preparations: [prep("prep_chicken", "Poulet rôti", "wed"), prep("prep_lentils", "Lentilles", "wed")],
    cooking_sessions: [{ day: "wed", preparationIds: ["prep_chicken", "prep_lentils"], runThrough: "", totalMinutes: 40 }] as never,
    shopping_list: [{ term: "poulet rôti", quantity: "500 g", aisle: "meat" }, { term: "lentilles", quantity: "500 g", aisle: "dry" }, { term: "courgettes", quantity: "400 g", aisle: "produce" }] as never,
  });
  const out = mergeCellEdit({ base: b, retry, cells: [CELL], index: null, calendar: [] });
  assertEquals(out.taken, ["fri/dinner"]);
  assertEquals(out.filled, []);
  assertEquals(out.notRendered, []);
  assertEquals(out.unknown, []);
  assertEquals(out.untouched, 3);
  const titles = Object.fromEntries(out.meal.dishes.map((d) => [`${d.day}/${d.slot}`, d.title]));
  assertEquals(titles, {
    "thu/lunch": "Poulet, riz",
    "thu/dinner": "Lentilles, carottes",
    "fri/lunch": "Saumon, orge",
    "fri/dinner": "Poulet, courgettes",
  });
  // Les plats non pris sont ceux du DÉPART, octet pour octet.
  const before = JSON.stringify(b.dishes.filter((d) => `${d.day}/${d.slot}` !== "fri/dinner"));
  const after = JSON.stringify(out.meal.dishes.filter((d) => `${d.day}/${d.slot}` !== "fri/dinner"));
  assertEquals(after, before);
  // Le départ n'est pas muté.
  assertEquals(b.dishes[3].title, "Œufs, pommes de terre");
});

Deno.test("⛔ mergeCellEdit — case demandée absente de la réponse ⇒ `notRendered`, plan de départ rendu tel quel ; case inconnue au départ ⇒ `unknown`", () => {
  const b = base();
  const retry = meal({ dishes: [dish("thu", "lunch", "Dinde, quinoa")], preparations: [], cooking_sessions: [], shopping_list: [] });
  const out = mergeCellEdit({ base: b, retry, cells: [CELL, { day: "sat", slot: "lunch", text: "x" }], index: null, calendar: [] });
  assertEquals(out.taken, []);
  assertEquals(out.filled, []);
  assertEquals(out.notRendered, ["fri/dinner"]);
  assertEquals(out.unknown, ["sat/lunch"]);
  assertEquals(out.untouched, 4);
  assertEquals(JSON.stringify(out.meal), JSON.stringify(b));
});

Deno.test("⛔ mergeCellEdit — une case que le CALENDRIER sert mais que le plan laissait VIDE est connue : rendue par le modèle ⇒ prise et comptée `filled` ; absente de la réponse ⇒ `notRendered`, jamais `unknown`", () => {
  // Mesuré le 2026-09-21 sur `d65f57e2` : « il manque le repas du mardi midi »
  // → la case n'avait aucun plat, le modèle l'a écrite, la fusion refusait
  // `cell_unknown`. Ici : sat/lunch n'est pas dans le plan de départ.
  const b = base();
  const ask = { day: "sat" as const, slot: "lunch" as const, text: "il manque ce repas" };
  const calendar = [{ day: "sat", slot: "lunch" }, { day: "fri", slot: "dinner" }];
  const rendered = meal({
    dishes: [...b.dishes, dish("sat", "lunch", "Sardines, pain")],
    preparations: [...b.preparations],
    cooking_sessions: [...b.cooking_sessions],
    shopping_list: [...b.shopping_list, { term: "sardines", quantity: "200 g", aisle: "fish" }] as never,
  });
  const out = mergeCellEdit({ base: b, retry: rendered, cells: [ask], index: null, calendar });
  assertEquals(out.taken, ["sat/lunch"]);
  assertEquals(out.filled, ["sat/lunch"]);
  assertEquals(out.unknown, []);
  assertEquals(out.notRendered, []);
  assertEquals(out.untouched, 4);
  assertEquals(out.meal.dishes.length, 5);
  assertEquals(out.meal.dishes.find((d) => d.day === "sat" && d.slot === "lunch")?.title, "Sardines, pain");
  // Le modèle n'a pas rendu la case vide : elle n'est pas « inconnue », elle
  // est « non rendue » — l'écran dit la bonne chose.
  const silent = mergeCellEdit({ base: b, retry: b, cells: [ask], index: null, calendar });
  assertEquals(silent.taken, []);
  assertEquals(silent.filled, []);
  assertEquals(silent.notRendered, ["sat/lunch"]);
  assertEquals(silent.unknown, []);
  // Sans le calendrier, la même case reste inconnue : la garde tient à l'argument.
  assertEquals(mergeCellEdit({ base: b, retry: rendered, cells: [ask], index: null, calendar: [] }).unknown, ["sat/lunch"]);
});

// ⟳ 2026-09-24 — L'AJUSTEMENT PAR EXCLUSION (`cells_from: "exclusions"`).

Deno.test("cellEditInstruction `cells_only` — ne redemande que les cases, et lève le plancher du calendrier", () => {
  const p = cellEditInstruction({ planSourceText: '{"dishes":[]}', cells: [CELL], returns: "cells_only" });
  assert(!p.includes("Return the FULL plan"), "le plan entier est encore redemandé");
  assert(p.includes("Return ONLY the listed cells"));
  // Le plancher « 35 cells » du brief ne vaut pas pour cette réponse : sans
  // cette phrase, les deux consignes se contredisent.
  assert(p.includes("it does not apply to this answer"));
  // Chaque plat de la case revient, sinon la fusion perd le plat non touché.
  assert(p.includes("every dish of each listed cell"));
  assert(p.endsWith('{"dishes":[]}'));
});

Deno.test("exclusionEditCells — une case par jour/moment mordu, dans l'ordre de la semaine, les plats nommés", () => {
  const cells = exclusionEditCells([
    { dish: "Tofu, pâtes", matched: "Tofu", because: "tofu", day: "wed", slot: "dinner", who: null },
    { dish: "Yaourt, tofu", matched: "tofu", because: "tofu", day: "sat", slot: "snack_am", who: null },
    { dish: "Tofu, seigle", matched: "Tofu", because: "tofu", day: "sat", slot: "snack_am", who: null },
    { dish: "Dinde, orge", matched: "orge", because: "orge perlée", day: "sat", slot: "lunch", who: null },
    // Illisibles : jamais une case devinée.
    { dish: "X", matched: "tofu", because: "tofu", day: null, slot: "lunch", who: null },
    { dish: "Y", matched: "tofu", because: "tofu", day: "sat", slot: "goûter", who: null },
  ]);
  assertEquals(cells.map((c) => `${c.day}/${c.slot}`).sort(), ["sat/lunch", "sat/snack_am", "wed/dinner"]);
  const at = (k: string) => cells.find((c) => `${c.day}/${c.slot}` === k)!;
  // Deux plats mordus sur la même case : une seule case, les deux nommés.
  assert(at("sat/snack_am").text.includes("«Yaourt, tofu»") && at("sat/snack_am").text.includes("«Tofu, seigle»"));
  assert(at("sat/lunch").text.includes("«orge perlée»"));
  assert(at("sat/lunch").text.includes("the household no longer eats «orge perlée»"));
  // Pas de guillemet droit : la ligne de consigne les remplace, et le texte
  // resterait lisible de toute façon.
  assert(cells.every((c) => !c.text.includes('"')));
  assertEquals(exclusionEditCells([]), []);
});

// ⟳ 2026-09-24 — LE DÉROULÉ D'UNE SESSION SUIT SES CASSEROLES APRÈS LA FUSION.
// Lu sur l'ajustement « plus de tofu » : la session du mercredi cuisait une
// autre casserole et disait encore « enfourner le tofu ».
function baseWithRunThrough() {
  const b = base();
  b.cooking_sessions = [{ day: "wed", preparationIds: ["prep_chicken", "prep_lentils"], runThrough: "Rôtir le poulet 40 min. Cuire les lentilles 25 min.", totalMinutes: 45 }] as never;
  return b;
}
const THU_LUNCH = { day: "thu" as const, slot: "lunch" as const, text: "plus de poulet" };

Deno.test("⛔ fusion — la session change de casseroles ET la relance la décrit entière ⇒ son déroulé est pris", () => {
  const retry = meal({
    dishes: [dish("thu", "lunch", "Dinde, riz", "prep_turkey")],
    preparations: [prep("prep_turkey", "Dinde rôtie", "wed"), prep("prep_lentils", "Lentilles", "wed")],
    cooking_sessions: [{ day: "wed", preparationIds: ["prep_turkey", "prep_lentils"], runThrough: "Rôtir la dinde 35 min. Cuire les lentilles 25 min.", totalMinutes: 40 }] as never,
  });
  const out = mergeCellEdit({ base: baseWithRunThrough(), retry, cells: [THU_LUNCH], index: null, calendar: [] });
  const wed = out.meal.cooking_sessions.find((s) => s.day === "wed")!;
  assertEquals([...wed.preparationIds].sort(), ["prep_lentils", "prep_turkey"]);
  assertEquals(wed.runThrough, "Rôtir la dinde 35 min. Cuire les lentilles 25 min.");
  assertEquals(out.merge.runThroughsReplaced, 1);
});

Deno.test("⛔ fusion — la relance ne décrit pas toute la session ⇒ la phrase de la casserole partie tombe, la sienne s'ajoute", () => {
  const retry = meal({
    dishes: [dish("thu", "lunch", "Dinde, riz", "prep_turkey")],
    preparations: [prep("prep_turkey", "Dinde rôtie", "wed")],
    cooking_sessions: [{ day: "wed", preparationIds: ["prep_turkey"], runThrough: "Rôtir la dinde 35 min.", totalMinutes: 35 }] as never,
  });
  const out = mergeCellEdit({ base: baseWithRunThrough(), retry, cells: [THU_LUNCH], index: null, calendar: [] });
  const wed = out.meal.cooking_sessions.find((s) => s.day === "wed")!;
  assert(!/poulet/i.test(wed.runThrough), `le poulet retiré est encore dans le déroulé : ${wed.runThrough}`);
  assert(wed.runThrough.includes("Cuire les lentilles 25 min."), "la casserole gardée a perdu sa phrase");
  assert(wed.runThrough.includes("Rôtir la dinde 35 min."), "la casserole ajoutée n'est pas décrite");
  assertEquals(out.merge.runThroughsTrimmed, 1);
});

Deno.test("fusion — LE CAS QUI PASSE : une session dont les casseroles ne bougent pas garde son texte au mot près", () => {
  const retry = meal({ dishes: [dish("fri", "dinner", "Poulet, riz")] });
  const out = mergeCellEdit({ base: baseWithRunThrough(), retry, cells: [CELL], index: null, calendar: [] });
  assertEquals(out.meal.cooking_sessions[0].runThrough, "Rôtir le poulet 40 min. Cuire les lentilles 25 min.");
  assertEquals(out.merge.runThroughsReplaced + out.merge.runThroughsTrimmed, 0);
});

Deno.test("exclusionEditCells — une exclusion d'UNE personne nomme la personne, pas la maison", () => {
  const cells = exclusionEditCells([
    { dish: "Saumon, semoule", matched: "Saumon", because: "saumon", day: "sun", slot: "lunch", who: "Christèle" },
    { dish: "Tofu, riz", matched: "Tofu", because: "tofu", day: "sun", slot: "lunch", who: null },
  ]);
  assertEquals(cells.length, 1);
  assert(cells[0].text.includes("Christèle no longer eats «saumon»"));
  assert(cells[0].text.includes("the household no longer eats «tofu»"));
});
