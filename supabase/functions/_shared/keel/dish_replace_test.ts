/**
 * « REMPLACER » UN PLAT DE L'APERÇU — `dish_replace.ts`, et la résolution
 * partagée de `rejected_dishes.ts`.
 *
 * Les valeurs attendues sont écrites à la main, jamais recalculées depuis les
 * constantes du module.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import type { GeneratedMeal } from "./meal_generation.ts";
import { dishReplaceKey, mergeRejectionEdit, rejectionEditPlan } from "./dish_replace.ts";
import { readDishRejections, resolveRejections } from "./rejected_dishes.ts";

const PAUL = "m-paul", LEA = "m-lea";
const NAMES = new Map([[PAUL, "Paul"], [LEA, "Léa"]]);

function dish(
  day: string,
  slot: string,
  title: string,
  memberId: string | null,
  boxes: { id: string; memberIds: string[]; preparationId?: string }[],
  uses: string[] = [],
  extra: Record<string, unknown> = {},
) {
  return {
    name: null, title, slot, day,
    ingredients: [{ term: title.split(",")[0].toLowerCase(), quantity: "200 g", in_pantry: false, amount: 200, unit: "g", state: "raw", gramsRaw: 200, quantitySource: "structured" }],
    method: "Assembler.", why: "", honours_belief_keys: [],
    uses: uses.map((preparationId) => ({ preparationId, servings: 1, kept: "fridge" })),
    boxes: boxes.map((b) => ({ id: b.id, memberIds: b.memberIds, items: [{ term: "x", grams: 100, preparationId: b.preparationId ?? null }], legacyTotalGrams: null })),
    memberId, heldOff: [],
    ...extra,
  } as unknown as GeneratedMeal["dishes"][number];
}
function prep(id: string, title: string, cookOn: string) {
  return { id, title, servingsMade: 2, method: `Préparer ${title}.`, activeMinutes: 10, totalMinutes: 20, cookOn, ingredients: [{ term: title.toLowerCase(), quantity: "500 g", in_pantry: false, amount: 500, unit: "g", state: "raw", gramsRaw: 500, quantitySource: "structured" }] } as unknown as GeneratedMeal["preparations"][number];
}
function meal(over: Partial<GeneratedMeal>): GeneratedMeal {
  return { dishes: [], preparations: [], cooking_sessions: [], shopping_list: [], rejected_numeric: [], rejected_aisles: [], protein_anchor_missing: [], empty_slots: [], session_overruns: [], ...over } as unknown as GeneratedMeal;
}

/**
 * La base: mercredi soir, la table (Léa) mange « Poulet, champignons » tiré
 * de la casserole du mardi; Paul a son plat à lui. Jeudi midi, la même table
 * reprend la casserole.
 */
function base() {
  return meal({
    dishes: [
      dish("wed", "dinner", "Poulet, champignons et riz", null, [{ id: "b1", memberIds: [LEA], preparationId: "prep_chicken" }], ["prep_chicken"]),
      dish("wed", "dinner", "Lait, pêche et avoine", PAUL, [{ id: "b2", memberIds: [PAUL] }]),
      dish("thu", "lunch", "Poulet, champignons et riz", null, [{ id: "b3", memberIds: [LEA, PAUL], preparationId: "prep_chicken" }], ["prep_chicken"]),
    ],
    preparations: [prep("prep_chicken", "Poulet aux champignons", "tue")],
    cooking_sessions: [{ day: "tue", preparationIds: ["prep_chicken"], runThrough: "", totalMinutes: 40 }] as never,
    shopping_list: [{ term: "poulet", quantity: "500 g", aisle: "meat" }] as never,
  });
}

Deno.test("dishReplaceKey: la case, la bouche, et assiette ou complément", () => {
  assertEquals(dishReplaceKey({ day: "wed", slot: "dinner", memberId: null }), "wed/dinner//plate");
  assertEquals(dishReplaceKey({ day: "wed", slot: "dinner", memberId: PAUL }), "wed/dinner/m-paul/plate");
  assertEquals(dishReplaceKey({ day: "wed", slot: "dinner", memberId: PAUL, complementsShared: true }), "wed/dinner/m-paul/extra");
});

Deno.test("readDishRejections: une occurrence illisible tombe seule; doublons et plafond comptés", () => {
  const read = readDishRejections([
    { day: "wed", slot: "dinner", member_id: PAUL, title: "Lait, pêche et avoine", reason: "  trop   sucré " },
    { day: "wed", slot: "dinner", member_id: PAUL, title: "Lait, pêche et avoine", reason: "encore" },
    { day: "xyz", slot: "dinner", member_id: null, title: "A", reason: "r" },
    { day: "thu", slot: "lunch", member_id: null, title: "B", reason: "" },
    { day: "thu", slot: "lunch", member_id: null, title: "B", reason: "y".repeat(281) },
    7,
  ]);
  assertEquals(read.targets, [
    { day: "wed", slot: "dinner", memberId: PAUL, title: "Lait, pêche et avoine", reason: "trop sucré" },
  ]);
  assertEquals(read.refused, { malformed: 4, duplicate: 1, tooMany: 0 });
  const many = readDishRejections(
    Array.from({ length: 30 }, (_, i) => ({ day: "mon", slot: `s${i}`, member_id: null, title: "T", reason: "r" })),
  );
  assertEquals(many.targets.length, 24);
  assertEquals(many.refused.tooMany, 6);
});

Deno.test("resolveRejections: un titre, toutes ses occurrences, les bouches de SES boîtes", () => {
  const b = base();
  const out = resolveRejections({
    dishes: b.dishes as never,
    targets: [
      { day: "wed", slot: "dinner", memberId: null, title: "poulet, champignons et riz", reason: "pas de champignons" },
      { day: "thu", slot: "lunch", memberId: null, title: "Poulet, champignons et riz", reason: "pas de champignons" },
      // Brouillon changé depuis l'affichage: introuvable, compté.
      { day: "fri", slot: "dinner", memberId: null, title: "Soupe", reason: "r" },
    ],
  });
  assertEquals(out.resolved, 2);
  assertEquals(out.unknown, 1);
  assertEquals(out.toFile, [{
    title: "Poulet, champignons et riz",
    name: null,
    reason: "pas de champignons",
    // Léa le mercredi, Léa et Paul le jeudi.
    eaterIds: [LEA, PAUL],
  }]);
});

Deno.test("rejectionEditPlan: une case par plat barré, l'extension nommée, le complément jamais pris", () => {
  const b = base();
  b.dishes.push(dish("fri", "lunch", "Lait, pêche et avoine", PAUL, [{ id: "b9", memberIds: [PAUL] }], [], { complementsShared: true }));
  const plan = rejectionEditPlan({
    base: b,
    targets: [
      { day: "wed", slot: "dinner", memberId: PAUL, title: "Lait, pêche et avoine", reason: "trop sucré" },
      { day: "fri", slot: "lunch", memberId: PAUL, title: "Lait, pêche et avoine", reason: "trop sucré" },
    ],
    // La garde retirerait Paul du poulet de jeudi (« champignons »).
    extended: [{ dishIndex: 2, memberId: PAUL, matched: "champignons" }],
    names: NAMES,
  });
  assertEquals(plan.resolved, 1);
  assertEquals(plan.unknown, 1, "un complément barré ne se remplace pas seul");
  assertEquals(plan.dishKeys, ["thu/lunch//plate", "wed/dinner/m-paul/plate"]);
  assertEquals(plan.extended, [{ key: "thu/lunch//plate", title: "Poulet, champignons et riz" }]);
  assertEquals(plan.cells.map((c) => `${c.day}/${c.slot}`), ["wed/dinner", "thu/lunch"]);
  const wed = plan.cells[0].text;
  assert(wed.includes("«Lait, pêche et avoine»") && wed.includes("served to Paul"), wed);
  assert(wed.includes("«trop sucré»"), wed);
  assert(wed.endsWith("Copy every other dish of this cell exactly."), wed);
  assert(plan.cells[1].text.includes("which Paul no longer eats"), plan.cells[1].text);
});

Deno.test("rejectionEditPlan: une raison tue (refusée par la garde) ne se cite pas", () => {
  const plan = rejectionEditPlan({
    base: base(),
    targets: [{ day: "wed", slot: "dinner", memberId: PAUL, title: "Lait, pêche et avoine", reason: "" }],
    extended: [],
    names: NAMES,
  });
  assertEquals(plan.resolved, 1);
  const text = plan.cells[0].text;
  assert(!text.includes("they said"), text);
  assert(text.startsWith("they turned down «Lait, pêche et avoine», served to Paul. Put a DIFFERENT dish"), text);
});

Deno.test("mergeRejectionEdit: seul le plat barré change — l'autre plat de la case reste celui de la base", () => {
  const b = base();
  // La réponse du modèle: la case de mercredi soir, avec le plat de Paul
  // remplacé ET une copie DÉRIVÉE du plat de la table (titre changé).
  const r = meal({
    dishes: [
      dish("wed", "dinner", "Poulet, poivrons et riz", null, [{ id: "b1", memberIds: [LEA], preparationId: "prep_chicken" }], ["prep_chicken"]),
      dish("wed", "dinner", "Yaourt, framboises et noix", PAUL, [{ id: "b2", memberIds: [PAUL] }]),
    ],
    preparations: [prep("prep_chicken", "Poulet aux champignons", "tue")],
  });
  const out = mergeRejectionEdit({
    base: b,
    retry: r,
    dishKeys: ["wed/dinner/m-paul/plate"],
    refusedTitleKeys: new Set(["lait, pêche et avoine"]),
    index: null,
  });
  assertEquals(out.taken, ["wed/dinner/m-paul/plate"]);
  assertEquals(out.notRendered, []);
  assertEquals(out.untouched, 2);
  const titles = out.meal.dishes.map((d) => `${d.day}/${d.slot}/${d.memberId ?? ""}: ${d.title}`).sort();
  assertEquals(titles, [
    "thu/lunch/: Poulet, champignons et riz",
    "wed/dinner/: Poulet, champignons et riz",
    "wed/dinner/m-paul: Yaourt, framboises et noix",
  ]);
  // La casserole du plat gardé est toujours là.
  assertEquals(out.meal.preparations.map((p) => p.id), ["prep_chicken"]);
});

Deno.test("mergeRejectionEdit: rendu sous le titre refusé ⇒ pas pris, et dit", () => {
  const b = base();
  const r = meal({
    dishes: [dish("wed", "dinner", "LAIT, pêche et avoine", PAUL, [{ id: "b2", memberIds: [PAUL] }])],
  });
  const out = mergeRejectionEdit({
    base: b,
    retry: r,
    dishKeys: ["wed/dinner/m-paul/plate"],
    refusedTitleKeys: new Set(["lait, pêche et avoine"]),
    index: null,
  });
  assertEquals(out.taken, []);
  assertEquals(out.sameTitle, ["wed/dinner/m-paul/plate"]);
  assertEquals(out.meal.dishes.find((d) => d.memberId === PAUL)?.title, "Lait, pêche et avoine");
});

Deno.test("mergeRejectionEdit: absent de la réponse (ou rendu pour la table) ⇒ non rendu", () => {
  const b = base();
  const r = meal({
    // Le modèle a mis le plat de Paul à la table: autre clé, pas pris.
    dishes: [dish("wed", "dinner", "Yaourt, framboises", null, [{ id: "b2", memberIds: [PAUL] }])],
  });
  const out = mergeRejectionEdit({
    base: b,
    retry: r,
    dishKeys: ["wed/dinner/m-paul/plate"],
    refusedTitleKeys: new Set(),
    index: null,
  });
  assertEquals(out.taken, []);
  assertEquals(out.notRendered, ["wed/dinner/m-paul/plate"]);
  assertEquals(out.meal.dishes.length, 3);
});
