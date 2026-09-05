import { assert, assertEquals } from "jsr:@std/assert@1";
import { mergeRetryByCell } from "./retry_merge.ts";
import { mealsDelivered } from "./meals_delivered.ts";
import type { GeneratedMeal } from "./meal_generation.ts";

const CLAIRE = "m-claire", LEA = "m-lea", ZOE = "m-zoe";
const MOUTHS = [CLAIRE, LEA, ZOE].map((memberId) => ({ memberId, cells: [{ day: "sat", slot: "dinner" }, { day: "sun", slot: "lunch" }] }));

function dish(day: string, slot: string, title: string, boxes: { id: string; memberIds: string[]; items: { term: string; grams: number; preparationId: string | null }[] }[], uses: string[] = [], held: { memberId: string; boxId: string }[] = []) {
  return {
    name: null, title, slot, day, ingredients: [{ term: title.split(",")[0].toLowerCase(), quantity: "1 kg", in_pantry: false, amount: 1000, unit: "g", state: "raw", gramsRaw: 1000, quantitySource: "structured" }],
    method: "Cuire.", why: "", honours_belief_keys: [], uses: uses.map((preparationId) => ({ preparationId, servings: 1, kept: "fridge" })),
    boxes, memberId: null, heldOff: held.map((h) => ({ ...h, cause: "regime", via: "items", preparationId: null, matched: "poulet" })),
  } as unknown as GeneratedMeal["dishes"][number];
}
function prep(id: string, title: string, cookOn: string | null, term = title.toLowerCase()) {
  return { id, title, servingsMade: 2, method: `Préparer ${title}.`, activeMinutes: 10, totalMinutes: 20, cookOn, ingredients: [{ term, quantity: "500 g", in_pantry: false, amount: 500, unit: "g", state: "raw", gramsRaw: 500, quantitySource: "structured" }] } as unknown as GeneratedMeal["preparations"][number];
}
function meal(over: Partial<GeneratedMeal>): GeneratedMeal {
  return { dishes: [], preparations: [], cooking_sessions: [], shopping_list: [], rejected_numeric: [], rejected_aisles: [], protein_anchor_missing: [], empty_slots: [], session_overruns: [], ...over } as unknown as GeneratedMeal;
}
const view = (m: GeneratedMeal) => m.dishes.map((d) => ({ title: d.title, day: d.day, slot: d.slot, memberId: d.memberId, boxes: d.boxes.map((b) => ({ id: b.id, memberIds: b.memberIds })), heldOff: d.heldOff }));

// Le plan de base: samedi soir, Léa retirée (régime) — manque; dimanche midi: tout le monde nourri.
function base() {
  return meal({
    dishes: [
      dish("sat", "dinner", "Poulet, riz", [{ id: "b_sat", memberIds: [CLAIRE, ZOE], items: [{ term: "poulet", grams: 300, preparationId: "prep_chicken" }] }], ["prep_chicken"], [{ memberId: LEA, boxId: "b_sat" }]),
      dish("sun", "lunch", "Lentilles, carottes", [{ id: "b_sun", memberIds: [CLAIRE, LEA, ZOE], items: [{ term: "lentilles", grams: 300, preparationId: "prep_lentils" }] }], ["prep_lentils"]),
    ],
    preparations: [prep("prep_chicken", "Poulet rôti", "sat"), prep("prep_lentils", "Lentilles", "sun")],
    cooking_sessions: [{ day: "sat", preparationIds: ["prep_chicken"], runThrough: "", totalMinutes: 40 }, { day: "sun", preparationIds: ["prep_lentils"], runThrough: "", totalMinutes: 30 }] as never,
    shopping_list: [{ term: "poulet rôti", quantity: "500 g", aisle: "meat" }, { term: "lentilles", quantity: "500 g", aisle: "dry" }] as never,
  });
}
// La relance: samedi soir réparé (boîte de tofu pour Léa, casserole à part) — MAIS dimanche midi cassé (Zoé retirée).
function retry() {
  return meal({
    dishes: [
      dish("sat", "dinner", "Poulet, riz", [
        { id: "b_sat", memberIds: [CLAIRE, ZOE], items: [{ term: "poulet", grams: 300, preparationId: "prep_chicken" }] },
        { id: "b_sat_lea", memberIds: [LEA], items: [{ term: "tofu", grams: 250, preparationId: "prep_tofu" }] },
      ], ["prep_chicken", "prep_tofu"]),
      dish("sun", "lunch", "Lentilles, carottes", [{ id: "b_sun", memberIds: [CLAIRE, LEA], items: [{ term: "lentilles", grams: 300, preparationId: "prep_lentils" }] }], ["prep_lentils"], [{ memberId: ZOE, boxId: "b_sun" }]),
    ],
    preparations: [prep("prep_chicken", "Poulet rôti", "sat"), prep("prep_tofu", "Tofu rôti", "sat"), prep("prep_lentils", "Lentilles", "sun")],
    cooking_sessions: [{ day: "sat", preparationIds: ["prep_chicken", "prep_tofu"], runThrough: "", totalMinutes: 50 }, { day: "sun", preparationIds: ["prep_lentils"], runThrough: "", totalMinutes: 30 }] as never,
    shopping_list: [{ term: "poulet rôti", quantity: "500 g", aisle: "meat" }, { term: "tofu rôti", quantity: "500 g", aisle: "dairy" }, { term: "lentilles", quantity: "500 g", aisle: "dry" }] as never,
  });
}

Deno.test("⛔ LA CELLULE RÉPARÉE EST PRISE, LA CELLULE CASSÉE EST LAISSÉE — et personne ne manque plus", () => {
  const b = base(), r = retry();
  const before = mealsDelivered(view(b), MOUTHS), after = mealsDelivered(view(r), MOUTHS);
  assertEquals(before.missing, 1, "le plan de base devait manquer Léa samedi soir");
  assertEquals(after.missing, 1, "la relance devait manquer Zoé dimanche midi: tout-ou-rien la rejetterait");
  const out = mergeRetryByCell({ base: b, retry: r, before, after });
  assertEquals(out.cells, ["sat/dinner"]);
  const merged = mealsDelivered(view(out.meal), MOUTHS);
  assertEquals(merged.missing, 0, JSON.stringify(merged.mouths));
  // Le dimanche est celui de BASE (Zoé y est), le samedi celui de la RELANCE (Léa a sa boîte).
  const sun = out.meal.dishes.find((d) => d.day === "sun")!;
  assertEquals(sun.boxes[0].memberIds, [CLAIRE, LEA, ZOE]);
  const sat = out.meal.dishes.find((d) => d.day === "sat")!;
  assertEquals(sat.boxes.map((x) => x.id), ["b_sat", "b_sat_lea"]);
});

Deno.test("⛔ LA CASSEROLE IMPORTÉE A UNE SESSION, ET SES COURSES SUIVENT", () => {
  const b = base(), r = retry();
  const out = mergeRetryByCell({ base: b, retry: r, before: mealsDelivered(view(b), MOUTHS), after: mealsDelivered(view(r), MOUTHS) });
  assertEquals(out.importedPreparations, ["prep_tofu"]);
  assert(out.meal.preparations.some((p) => p.id === "prep_tofu"), "la casserole de tofu n'est pas dans le plan fusionné");
  const sat = out.meal.cooking_sessions.find((s) => s.day === "sat")!;
  assert(sat.preparationIds.includes("prep_tofu"), "le tofu cuit dans aucune session");
  assertEquals(out.sessionsImported, 0, "la session de samedi existait: on ne l'a pas dupliquée");
  assertEquals(out.shoppingAdded, 1);
  assert(out.meal.shopping_list.some((l) => l.term === "tofu rôti"), "le tofu n'est pas aux courses: on achèterait moins qu'il ne faut");
  // Et une casserole déjà présente, même contenu, n'est PAS dupliquée.
  assertEquals(out.meal.preparations.filter((p) => p.id === "prep_chicken").length, 1);
});

Deno.test("⛔ UN ID DÉJÀ PRIS AVEC UN AUTRE CONTENU EST RENOMMÉ, et les plats importés le citent sous son nouveau nom", () => {
  const b = base(), r = retry();
  // La relance a réécrit `prep_chicken` (autre méthode): elle ne doit pas écraser celle de base, que dimanche cite.
  r.preparations[0].method = "Rôtir au four, autrement.";
  const out = mergeRetryByCell({ base: b, retry: r, before: mealsDelivered(view(b), MOUTHS), after: mealsDelivered(view(r), MOUTHS) });
  assertEquals(out.renamed, { prep_chicken: "prep_chicken__r" });
  const sat = out.meal.dishes.find((d) => d.day === "sat")!;
  assertEquals(sat.uses.map((u) => u.preparationId), ["prep_chicken__r", "prep_tofu"]);
  assertEquals(sat.boxes[0].items[0].preparationId, "prep_chicken__r");
  // ⟳ 2026-09-05 (R2-A): la casserole de base n'est plus citée par personne (samedi est remplacé): elle SORT, elle n'est pas écrasée.
  assert(!out.meal.preparations.some((p) => p.id === "prep_chicken"), "la casserole orpheline de base est restée");
  assertEquals(out.preparationsPruned, ["prep_chicken"]);
  assert(out.meal.cooking_sessions.find((s) => s.day === "sat")!.preparationIds.includes("prep_chicken__r"));
});

Deno.test("rien à prendre → le plan de base, tel quel (même objet), et `cells: []`", () => {
  const b = base(), r = retry();
  const before = mealsDelivered(view(b), MOUTHS);
  // Une relance qui n'a rien réparé.
  const out = mergeRetryByCell({ base: b, retry: b, before, after: before });
  assertEquals(out.cells, []);
  assert(out.meal === b);
  // Une relance qui répare une cellule ABSENTE de ses plats ne peut rien donner.
  const r2 = retry(); r2.dishes = r2.dishes.filter((d) => d.day !== "sat");
  const out2 = mergeRetryByCell({ base: b, retry: r2, before, after: mealsDelivered(view(r2), MOUTHS) });
  assertEquals(out2.cells, []);
});

Deno.test("⛔ PUR: ni le plan de base ni la relance ne sont mutés", () => {
  const b = base(), r = retry();
  const snapB = JSON.stringify(b), snapR = JSON.stringify(r);
  mergeRetryByCell({ base: b, retry: r, before: mealsDelivered(view(b), MOUTHS), after: mealsDelivered(view(r), MOUTHS) });
  assertEquals(JSON.stringify(b), snapB);
  assertEquals(JSON.stringify(r), snapR);
});

Deno.test("une casserole importée sans session ce jour-là reçoit la session de la RELANCE pour ce jour", () => {
  const b = base(), r = retry();
  r.preparations[1] = { ...r.preparations[1], cookOn: "fri" } as never;
  r.cooking_sessions.push({ day: "fri", preparationIds: ["prep_tofu"], runThrough: "Vendredi soir.", totalMinutes: 20 } as never);
  const out = mergeRetryByCell({ base: b, retry: r, before: mealsDelivered(view(b), MOUTHS), after: mealsDelivered(view(r), MOUTHS) });
  assertEquals(out.sessionsImported, 1);
  const fri = out.meal.cooking_sessions.find((s) => s.day === "fri")!;
  assertEquals(fri.preparationIds, ["prep_tofu"]);
  assertEquals(fri.runThrough, "Vendredi soir.");
});

Deno.test("CÂBLAGE — la fusion par cellule est la SECONDE voie d'acceptation, après le tout-ou-rien, et se compte sur les deux surfaces", async () => {
  const src = await Deno.readTextFile(new URL("../../generate-household-meal-v1/index.ts", import.meta.url));
  const whole = src.indexOf("after.missing < delivered.missing");
  const merge = src.indexOf("mergeRetryByCell({ base: meal, retry: retried, before: delivered, after })");
  assert(whole > 0 && merge > whole, "la fusion ne vient pas APRÈS l'acceptation entière: une relance meilleure en entier doit remplacer, pas fusionner");
  // ⟳ 2026-09-05 (R2, mutation W2): la CONDITION du tout-ou-rien, pas sa
  // seule présence dans le fichier — un `false &&` devant restait vert.
  assert(
    /if \(\s*retried\.dishes\.length >= meal\.dishes\.length &&\s*after\.missing < delivered\.missing\s*\) \{/.test(src),
    "le tout-ou-rien n'est plus la condition telle quelle: une relance meilleure en entier ne remplacerait plus",
  );
  const branch = src.slice(merge, src.indexOf("unfedRetryMergedCells += merge.cells.length"));
  assert(!/mealSourceText = /.test(branch), "la fusion remplace le texte source: les portions par bouche liraient un autre plan");
  assert(/const merged = mealsDelivered\(deliveredViewOf\(merge\.meal\), mouthCells\);/.test(src), "le plan fusionné n'est pas recompté");
  assert(/if \(!\(merged\.missing < delivered\.missing\)\) break;/.test(src), "une fusion qui n'améliore pas serait acceptée");
  assertEquals((src.match(/retry_merged_cells: unfedRetryMergedCells,/g) || []).length, 2, "les cellules fusionnées ne se comptent pas sur le journal ET l'archive");
});

// ⟳ 2026-09-05 — CE QUE LA FUSION DÉFAIT (relecture R2). Le plat de samedi
// est REMPLACÉ (poulet → tofu, casserole à part): la casserole du poulet ne
// doit rester ni dans le plan, ni dans la session, ni aux courses.
function retryReplacing(tofuCookOn = "sat") {
  return meal({
    dishes: [
      dish("sat", "dinner", "Tofu, riz", [{ id: "b_sat", memberIds: [CLAIRE, LEA, ZOE], items: [{ term: "tofu", grams: 300, preparationId: "prep_tofu" }] }], ["prep_tofu"]),
      dish("sun", "lunch", "Lentilles, carottes", [{ id: "b_sun", memberIds: [CLAIRE, LEA] , items: [{ term: "lentilles", grams: 300, preparationId: "prep_lentils" }] }], ["prep_lentils"], [{ memberId: ZOE, boxId: "b_sun" }]),
    ],
    preparations: [prep("prep_tofu", "Tofu rôti", tofuCookOn), prep("prep_lentils", "Lentilles", "sun")],
    cooking_sessions: [{ day: tofuCookOn, preparationIds: ["prep_tofu"], runThrough: "", totalMinutes: 25 }, { day: "sun", preparationIds: ["prep_lentils"], runThrough: "", totalMinutes: 30 }] as never,
    shopping_list: [{ term: "tofu rôti", quantity: "500 g", aisle: "dairy" }, { term: "riz", quantity: "1 kg", aisle: "dry" }, { term: "lentilles", quantity: "500 g", aisle: "dry" }] as never,
  });
}
const merge = (b: GeneratedMeal, r: GeneratedMeal) =>
  mergeRetryByCell({ base: b, retry: r, before: mealsDelivered(view(b), MOUTHS), after: mealsDelivered(view(r), MOUTHS) });

Deno.test("⛔ R2-A — LA CASSEROLE DU PLAT REMPLACÉ SORT: du plan, de sa session, et des courses", () => {
  const out = merge(base(), retryReplacing());
  assertEquals(out.cells, ["sat/dinner"]);
  assertEquals(out.preparationsPruned, ["prep_chicken"], "on cuirait un poulet que personne ne mange");
  assertEquals(out.meal.preparations.map((p) => p.id).sort(), ["prep_lentils", "prep_tofu"]);
  const sat = out.meal.cooking_sessions.find((s) => s.day === "sat")!;
  assertEquals(sat.preparationIds, ["prep_tofu"], "la session de samedi cuit encore le poulet");
  assert(!out.meal.shopping_list.some((l) => l.term === "poulet rôti"), "on achète le poulet d'un plat qui n'existe plus");
  assertEquals(out.shoppingPruned, 1);
  assert(out.meal.shopping_list.some((l) => l.term === "tofu rôti"), "le tofu n'est pas aux courses");
  // Le riz de la relance n'est réclamé par aucun plat ni casserole de la fixture: il n'entre pas.
  assert(!out.meal.shopping_list.some((l) => l.term === "riz"), out.meal.shopping_list.map((l) => l.term).join(","));
  assertEquals(out.shoppingConflicts, 0);
});

Deno.test("⛔ R2-E — MÊME FICHE, AUTRE JOUR DE CUISSON: ce n'est PAS la même casserole, elle est importée sous un autre nom", () => {
  const r = retryReplacing();
  // La relance cuit SES lentilles samedi et le dîner de samedi les cite.
  r.preparations[1] = prep("prep_lentils", "Lentilles", "sat");
  r.dishes[0].uses.push({ preparationId: "prep_lentils", servings: 1, kept: "fridge" } as never);
  r.cooking_sessions[0].preparationIds.push("prep_lentils");
  const out = merge(base(), r);
  assertEquals(out.renamed, { prep_lentils: "prep_lentils__r" });
  assert(out.importedPreparations.includes("prep_lentils__r"));
  const satDish = out.meal.dishes.find((d) => d.day === "sat")!;
  assert(satDish.uses.some((u) => u.preparationId === "prep_lentils__r"), "le dîner de samedi cite encore la casserole de dimanche");
  const sat = out.meal.cooking_sessions.find((s) => s.day === "sat")!;
  assert(sat.preparationIds.includes("prep_lentils__r"), "les lentilles de samedi ne cuisent dans aucune session");
  // Et la casserole de dimanche reste à dimanche, pour le plat de dimanche.
  assertEquals(out.meal.preparations.find((p) => p.id === "prep_lentils")!.cookOn, "sun");
});

Deno.test("les courses déjà présentes à une AUTRE quantité gardent la base, et l'écart se compte", () => {
  const r = retryReplacing();
  r.preparations[1] = prep("prep_lentils", "Lentilles", "sat");
  r.dishes[0].uses.push({ preparationId: "prep_lentils", servings: 1, kept: "fridge" } as never);
  r.shopping_list = [...r.shopping_list.filter((l) => l.term !== "lentilles"), { term: "lentilles", quantity: "1 kg", aisle: "dry" }] as never;
  const out = merge(base(), r);
  assertEquals(out.shoppingConflicts, 1);
  assertEquals(out.meal.shopping_list.find((l) => l.term === "lentilles")!.quantity, "500 g", "la base a été requantifiée sans modèle de quantités");
});

Deno.test("une session vidée par l'élagage disparaît; la casserole importée cuit un autre jour reçoit SA session", () => {
  const out = merge(base(), retryReplacing("fri"));
  assert(!out.meal.cooking_sessions.some((s) => s.day === "sat"), "une session qui ne cuit rien est restée");
  assertEquals(out.sessionsDropped, 1);
  assertEquals(out.sessionsImported, 1);
  assertEquals(out.meal.cooking_sessions.find((s) => s.day === "fri")!.preparationIds, ["prep_tofu"]);
});
