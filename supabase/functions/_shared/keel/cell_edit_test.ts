import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  CELL_EDIT_MAX,
  cellEditInstruction,
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
  const p = cellEditInstruction({ planSourceText: '{"dishes":[]}', cells: [CELL] });
  const only = p.indexOf("ONLY these cells");
  const cell = p.indexOf('- fri dinner — they wrote: "plutôt du poulet"');
  assert(only >= 0 && cell >= 0 && cell - only < 200, "la promesse et la case ne se touchent pas");
  assert(p.includes("Return the FULL plan"));
  // La case vide du calendrier : le modèle l'écrit, il ne la laisse pas vide.
  assert(p.includes("NO dish in THE PLAN below is an EMPTY cell") && p.includes("An empty cell is never an answer"));
  assert(p.endsWith('{"dishes":[]}'));
  // Les guillemets de la phrase ne cassent pas la ligne.
  assert(cellEditInstruction({ planSourceText: "", cells: [{ ...CELL, text: 'du "poulet"' }] }).includes("they wrote: \"du 'poulet'\""));
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
