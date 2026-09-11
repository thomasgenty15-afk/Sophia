import { assert, assertEquals } from "jsr:@std/assert@1";
import { mergeRetryByCell, mergeRetryCells, summedShoppingQuantity, unforkReworkedPots } from "./retry_merge.ts";
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
  assert(/if \(!\(merged\.missing < delivered\.missing\)\) \{\n\s*rejected\("merge_no_gain"\);\n\s*break;/.test(src), "une fusion qui n'améliore pas serait acceptée, ou ne se journalise plus");
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

Deno.test("les courses déjà présentes à une quantité ILLISIBLE gardent la base, et l'écart se compte", () => {
  const r = retryReplacing();
  r.preparations[1] = prep("prep_lentils", "Lentilles", "sat");
  r.dishes[0].uses.push({ preparationId: "prep_lentils", servings: 1, kept: "fridge" } as never);
  r.shopping_list = [...r.shopping_list.filter((l) => l.term !== "lentilles"), { term: "lentilles", quantity: "1 kg", aisle: "dry" }] as never;
  const out = merge(base(), r);
  assertEquals(out.shoppingConflicts, 1);
  assertEquals(out.shoppingSummed, 0);
  assertEquals(out.meal.shopping_list.find((l) => l.term === "lentilles")!.quantity, "500 g", "« 1 kg » ne se lit pas sans convention: la base reste");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-09 — LA RELANCE AJOUTE DES PLATS, SES COURSES S'AJOUTENT
//
// ⛔ LE CAS RAPPORTÉ (poul, brouillon du 2026-09-08): la relance des créneaux
// vides ajoutait un poulet rôti (450 g de cuisses) au mercredi, la base avait
// déjà « cuisses de poulet 400 g » pour vendredi. Même terme ⇒ la base restait,
// et la liste disait 400 g pour 850 g nécessaires.
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LE CAS RAPPORTÉ — même terme des deux côtés en grammes: les quantités s'ADDITIONNENT", () => {
  const r = retryReplacing();
  r.preparations[1] = prep("prep_lentils", "Lentilles", "sat");
  r.dishes[0].uses.push({ preparationId: "prep_lentils", servings: 1, kept: "fridge" } as never);
  r.shopping_list = [...r.shopping_list.filter((l) => l.term !== "lentilles"), { term: "lentilles", quantity: "450 g", aisle: "dry" }] as never;
  const out = merge(base(), r);
  assertEquals(out.shoppingSummed, 1);
  assertEquals(out.shoppingConflicts, 0);
  assertEquals(out.meal.shopping_list.find((l) => l.term === "lentilles")!.quantity, "950 g");
  // Et la ligne n'est pas dupliquée: une seule « lentilles », à la somme.
  assertEquals(out.meal.shopping_list.filter((l) => l.term === "lentilles").length, 1);
});

Deno.test("summedShoppingQuantity — additionne g, ml et le nombre nu; refuse le reste", () => {
  assertEquals(summedShoppingQuantity("400 g", "450 g"), "850 g");
  assertEquals(summedShoppingQuantity("250 ml", "100 ml"), "350 ml");
  assertEquals(summedShoppingQuantity("2", "3"), "5");
  assertEquals(summedShoppingQuantity("1,5 g", "1.5 g"), "3 g");
  // ⛔ AUCUNE CONVENTION: pas de kg → g, pas d'unité comptée, pas d'unités mêlées.
  assertEquals(summedShoppingQuantity("500 g", "1 kg"), null);
  assertEquals(summedShoppingQuantity("8 œufs", "1 œuf"), null);
  assertEquals(summedShoppingQuantity("1 bouquet", "1 bouquet"), null);
  assertEquals(summedShoppingQuantity("200 g", "2"), null);
  assertEquals(summedShoppingQuantity(null, "200 g"), null);
});

Deno.test("une session vidée par l'élagage disparaît; la casserole importée cuit un autre jour reçoit SA session", () => {
  const out = merge(base(), retryReplacing("fri"));
  assert(!out.meal.cooking_sessions.some((s) => s.day === "sat"), "une session qui ne cuit rien est restée");
  assertEquals(out.sessionsDropped, 1);
  assertEquals(out.sessionsImported, 1);
  assertEquals(out.meal.cooking_sessions.find((s) => s.day === "fri")!.preparationIds, ["prep_tofu"]);
});

// ⟳ 2026-09-06 (FD2) — une cellule où MOINS de bouches manquent est prise, même incomplète.
Deno.test("⛔ UNE CELLULE VIDE POUR QUATRE, RENDUE NOURRIE POUR TROIS, EST PRISE", () => {
  // Base: samedi soir sans aucun plat (quatre manquants, `no_dish`) ; dimanche midi nourri.
  const b = meal({
    dishes: [dish("sun", "lunch", "Lentilles, carottes", [{ id: "b_sun", memberIds: [CLAIRE, LEA, ZOE], items: [{ term: "lentilles", grams: 300, preparationId: "prep_lentils" }] }], ["prep_lentils"])],
    preparations: [prep("prep_lentils", "Lentilles", "sun")],
    cooking_sessions: [{ day: "sun", preparationIds: ["prep_lentils"], runThrough: "", totalMinutes: 30 }] as never,
    shopping_list: [{ term: "lentilles", quantity: "500 g", aisle: "dry" }] as never,
  });
  // Relance: samedi soir composé, Léa retirée (régime) — deux nourries sur trois.
  const r = meal({
    dishes: [dish("sat", "dinner", "Poulet, riz", [{ id: "b_sat", memberIds: [CLAIRE, ZOE], items: [{ term: "poulet", grams: 300, preparationId: "prep_chicken" }] }], ["prep_chicken"], [{ memberId: LEA, boxId: "b_sat" }])],
    preparations: [prep("prep_chicken", "Poulet rôti", "sat")],
    cooking_sessions: [{ day: "sat", preparationIds: ["prep_chicken"], runThrough: "", totalMinutes: 40 }] as never,
    shopping_list: [{ term: "poulet rôti", quantity: "500 g", aisle: "meat" }] as never,
  });
  const before = mealsDelivered(view(b), MOUTHS), after = mealsDelivered(view(r), MOUTHS);
  assertEquals(before.missing, 3, "prémisse: samedi soir manque aux trois");
  const out = mergeRetryByCell({ base: b, retry: r, before, after });
  assertEquals(out.cells, ["sat/dinner"], "la cellule passée de trois manquants à un n'est pas prise");
  const merged = mealsDelivered(view(out.meal), MOUTHS);
  assertEquals(merged.missing, 1, JSON.stringify(merged.mouths));
});

Deno.test("une cellule où AUTANT de bouches manquent n'est pas prise", () => {
  const b = meal({ dishes: [dish("sat", "dinner", "Poulet, riz", [{ id: "b_sat", memberIds: [CLAIRE, ZOE], items: [{ term: "poulet", grams: 300, preparationId: null }] }], [], [{ memberId: LEA, boxId: "b_sat" }])] });
  const r = meal({ dishes: [dish("sat", "dinner", "Dinde, riz", [{ id: "b_sat2", memberIds: [CLAIRE, ZOE], items: [{ term: "dinde", grams: 300, preparationId: null }] }], [], [{ memberId: LEA, boxId: "b_sat2" }])] });
  const out = mergeRetryByCell({ base: b, retry: r, before: mealsDelivered(view(b), MOUTHS), after: mealsDelivered(view(r), MOUTHS) });
  assertEquals(out.cells, []);
});

// ===========================================================================
// UNE CASE REPRISE PAR LA RELANCE N'EST PLUS UN TROU — 2026-09-06
//
// ── LE DÉFAUT, MESURÉ EN RUN RÉEL ────────────────────────────────────────
// Request `4d5bb72d-6d01-4ce1-83d4-3917032e1284`: foyer de trois, cinq jours.
// La relance a repris NEUF cellules (`unfed_retry_merged`: tue/breakfast,
// tue/snack_pm, wed/breakfast, wed/snack_pm, thu/breakfast, thu/lunch,
// thu/snack_pm, fri/breakfast, fri/snack_pm) et `meals_delivered` a rendu
// « fed: 60, missing: 0 ». L'explication du plan annonçait quand même:
//
//     « 9 repas n'ont pas été composés, sur mardi, mercredi, jeudi et
//       vendredi. »
//
// Le compte ET les jours étaient exactement ceux des cellules reprises. Un plan
// qui déclare vide une case qu'il vient de remplir est un fait faux que la
// personne ne peut pas démentir: elle a le plat sous les yeux.
//
// ── POURQUOI ÇA NE SE VOIT PAS DANS `retry_merge.ts` ─────────────────────
// `mergeRetryCells` est PUR et ne connaît que des plats, des casseroles, des
// sessions et des courses. `empty_slots` est un constat du PARSEUR sur le
// premier tour: la fusion n'a aucune raison de le recalculer, et ce n'est pas
// à elle de le faire. C'est donc à la LANE de retirer les cases qu'elle vient
// de reprendre — et la lane solo le faisait déjà pendant que la lane foyer
// l'oubliait. La même idée à deux endroits, un seul tenu à jour.
//
// ⚠️ CE TEST LIT LA SOURCE, ET C'EST ASSUMÉ. Le geste manquant n'est pas dans
// un module testable: il est dans les deux points d'entrée, entre `meal =
// merge.meal` et la suite. Un test de comportement demanderait de monter une
// fonction edge entière pour trois lignes.
// ===========================================================================

Deno.test("les deux lanes retirent d'`empty_slots` les cases que la relance a reprises", async () => {
  for (
    const fn of ["generate-household-meal-v1"]
  ) {
    const src = (await Deno.readTextFile(
      new URL(`../../${fn}/index.ts`, import.meta.url),
    ))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

    // LE CAS QUI PASSE, et il est obligatoire: sans lui, une lane qui aurait
    // perdu la relance ENTIÈRE serait verte — plus de fusion, donc plus de
    // trou périmé, donc plus rien à retirer.
    const at = src.indexOf("meal = merge.meal;");
    assert(
      at >= 0,
      `${fn}: la fusion de relance a disparu — test à réviser, pas à contourner.`,
    );

    // Le retrait DANS LA FOULÉE de la fusion, pas ailleurs dans le fichier: un
    // filtre posé plus haut porterait sur un plan que la fusion n'a pas encore
    // touché.
    const tail = src.slice(at, at + 600);
    assert(
      /meal\.empty_slots = slotsStillEmpty\(meal\.empty_slots, merge\.cells\)/
        .test(tail),
      `${fn}: le plan garde ses trous d'AVANT la relance. L'explication ` +
        `annoncera « n repas n'ont pas été composés » sur des cases qui ` +
        `portent un plat — le défaut mesuré le 2026-09-06.`,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LA FOURCHE DE LA CASSEROLE PARTAGÉE — mesurée, jamais comptée (2026-09-08)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LE PLAN `plan-L6-20260907-204913.json`, RÉDUIT À SON OS. Une bouche, deux
 * repas, une casserole de riz tirée par les deux; la réparation ne demande que
 * le déjeuner.
 */
function planRiz() {
  return meal({
    dishes: [
      dish("mon", "lunch", "Poulet et riz", [], ["prep_rice"]),
      dish("mon", "dinner", "Riz sauté", [], ["prep_rice"]),
    ],
    preparations: [prep("prep_rice", "Riz", "mon", "riz")],
    cooking_sessions: [
      { day: "mon", preparationIds: ["prep_rice"], runThrough: "", totalMinutes: 30 },
    ] as never,
    shopping_list: [{ term: "riz", quantity: "500 g", aisle: "dry" }] as never,
  });
}

/** La relance rend le déjeuner densifié, avec un riz plus riche sous le MÊME id. */
function relanceRiz() {
  const m = planRiz();
  m.preparations[0].method = "Riz au beurre, cuit dans un bouillon.";
  m.dishes = [m.dishes[0]];
  m.cooking_sessions = [
    { day: "mon", preparationIds: ["prep_rice"], runThrough: "", totalMinutes: 30 },
  ] as never;
  return m;
}

Deno.test("⛔ LA FOURCHE EXISTE, ET ELLE EST MESURÉE — deux riz cuits pour une personne", () => {
  // ⛔ CE TEST DÉCRIT LE COMPORTEMENT AVANT DÉFOURCHAGE, ET IL DOIT RESTER
  // VERT. `mergeRetryCells` a raison de renommer: le dîner, qui n'a pas été
  // repris, cite encore l'ancienne recette — l'écraser lui servirait un plat
  // qu'on n'a pas relu. Le défaut n'est pas dans la fusion, il est dans ce que
  // personne ne faisait APRÈS.
  const out = mergeRetryCells({
    base: planRiz(),
    retry: relanceRiz(),
    cells: ["mon/lunch"],
  });
  assertEquals(out.renamed, { prep_rice: "prep_rice__r" });
  assertEquals(out.meal.preparations.map((p) => p.id).sort(), ["prep_rice", "prep_rice__r"]);
  const session = out.meal.cooking_sessions.find((s) => s.day === "mon")!;
  assertEquals(session.preparationIds.sort(), ["prep_rice", "prep_rice__r"], "deux riz cuits");
});

Deno.test("⛔ DÉFOURCHAGE — une casserole RÉÉCRIVABLE retrouve son nom, et une seule cuit", () => {
  // ⛔ `reworkable` VEUT DIRE « TOUS SES MANGEURS VONT DANS LE MÊME SENS »
  // (`repairabilityOf`). Sa version réécrite vaut donc pour eux tous: la garder
  // en double fait cuire deux fois ce qu'on a demandé de réécrire une fois.
  const out = mergeRetryCells({
    base: planRiz(),
    retry: relanceRiz(),
    cells: ["mon/lunch"],
  });
  const { meal: fusionne, unforked, forked } = unforkReworkedPots(out, new Set(["prep_rice"]));
  assertEquals(unforked, ["prep_rice"]);
  assertEquals(forked, []);
  assertEquals(fusionne.preparations.map((p) => p.id), ["prep_rice"], "une seule casserole");
  // ⛔ ET C'EST LA RÉÉCRITE QUI SURVIT. Garder l'ancienne jetterait la
  // réparation qu'on vient de payer.
  assertEquals(fusionne.preparations[0].method, "Riz au beurre, cuit dans un bouillon.");
  // Les deux plats la citent sous son nom d'origine.
  for (const d of fusionne.dishes) {
    assertEquals(d.uses.map((u) => u.preparationId), ["prep_rice"]);
  }
  // ⚠️ ET LA SESSION NE LA PORTE QU'UNE FOIS. Elle portait les deux ids: les
  // renommer sans dédoublonner laisserait « riz, riz » sur la liste de cuisine.
  assertEquals(
    fusionne.cooking_sessions.find((s) => s.day === "mon")!.preparationIds,
    ["prep_rice"],
  );
});

Deno.test("⛔ DÉFOURCHAGE — une casserole GELÉE reste fourchée, et se COMPTE", () => {
  // ⛔ LA MOITIÉ QU'ON NE RÉPARE PAS, ET C'EST VOULU. Si la casserole était
  // gelée, le modèle avait interdiction d'y toucher: qu'elle revienne modifiée
  // est un fait à voir, pas à effacer. La fusion garde donc les deux versions
  // — le plat réparé a la sienne, les autres gardent la leur — et `forked` le
  // dit, pour que le tir suivant sache que la consigne n'a pas été tenue.
  const out = mergeRetryCells({
    base: planRiz(),
    retry: relanceRiz(),
    cells: ["mon/lunch"],
  });
  const { meal: fusionne, unforked, forked } = unforkReworkedPots(out, new Set());
  assertEquals(unforked, []);
  assertEquals(forked, ["prep_rice"], "le modèle a touché une casserole gelée");
  assertEquals(fusionne.preparations.length, 2, "et les deux versions restent");
});

Deno.test("DÉFOURCHAGE — sans renommage, rien ne bouge", () => {
  // Le cas nominal: la relance n'a pas réécrit la casserole, il n'y a rien à
  // défourcher. Une fonction qui « répare » quand il n'y a rien à réparer est
  // une fonction qui déplacera un jour ce qu'on ne lui a pas demandé.
  const out = mergeRetryCells({ base: planRiz(), retry: planRiz(), cells: ["mon/lunch"] });
  assertEquals(out.renamed, {});
  const { unforked, forked, meal: m } = unforkReworkedPots(out, new Set(["prep_rice"]));
  assertEquals([unforked, forked], [[], []]);
  assertEquals(m.preparations.map((p) => p.id), ["prep_rice"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-08 — L'ENTRÉE DE DERNIER RECOURS N'IMPORTE QUE LES PLATS AJOUTÉS
// ═══════════════════════════════════════════════════════════════════════════
import { appendDedicatedDishes } from "./retry_merge.ts";

function plat(day: string, slot: string, title: string, memberId: string | null, uses: string[] = []) {
  return {
    day, slot, title, memberId, method: "", ingredients: [], boxes: [],
    uses: uses.map((preparationId) => ({ preparationId })),
  } as unknown as Parameters<typeof appendDedicatedDishes>[0]["base"]["dishes"][number];
}
function repas(dishes: unknown[], preparations: unknown[] = []) {
  return { dishes, preparations, cooking_sessions: [], shopping_list: [], empty_slots: [] } as unknown as Parameters<typeof appendDedicatedDishes>[0]["base"];
}

Deno.test("⛔ appendDedicatedDishes — n'importe QUE les plats des porteurs ajoutés, la table et les dédiés d'avant restent ceux de la base", () => {
  // ⛔ MESURÉ AU TIR CATCH3 : le modèle avait rendu la case SANS le plat de la
  // végane. Une fusion de case entière lui aurait retiré son plat.
  const base = repas([plat("wed", "lunch", "Couscous", null), plat("wed", "lunch", "Couscous tofu", "nora")]);
  const retry = repas([
    plat("wed", "lunch", "Couscous refait", null),           // la table réécrite : IGNORÉE
    plat("wed", "lunch", "Couscous tofu REFAIT", "nora"),    // le dédié existant réécrit : IGNORÉ (porteur non demandé)
    plat("wed", "lunch", "Pain et cacahuètes", "paul"),      // ajouté : PRIS
    plat("wed", "lunch", "Pain et cacahuètes", "leo"),       // ajouté : PRIS
    plat("wed", "dinner", "Autre chose", "paul"),            // hors case demandée : IGNORÉ
  ]);
  const r = appendDedicatedDishes({ base, retry, asks: [{ cell: "wed/lunch", memberId: "paul" }, { cell: "wed/lunch", memberId: "leo" }] });
  assertEquals(r.added.map((a) => a.memberId).sort(), ["leo", "paul"]);
  assertEquals(r.missing, []);
  const titres = r.meal.dishes.map((d) => `${d.memberId ?? "table"}:${d.title}`).sort();
  // ⛔ LE PLAT DE NORA EST CELUI DE LA BASE, PAS LA VERSION REFAITE : un porteur
  // qui n'est pas dans `bearers` n'entre jamais, même s'il est dans la case.
  assertEquals(titres, ["leo:Pain et cacahuètes", "nora:Couscous tofu", "paul:Pain et cacahuètes", "table:Couscous"]);
  assertEquals(r.meal.dishes.filter((d) => d.memberId === "nora").length, 1, "le plat de Nora est entré deux fois");
  // ⛔ LA BASE N'EST PAS MUTÉE.
  assertEquals(base.dishes.length, 2);
});

Deno.test("⛔ appendDedicatedDishes — un plat ajouté qui CITE une casserole est refusé, les autres entrent", () => {
  const base = repas([plat("wed", "lunch", "Couscous", null)]);
  const retry = repas([
    plat("wed", "lunch", "Riz au poulet", "paul", ["prep_rice"]),
    plat("wed", "lunch", "Noix et fromage", "leo"),
  ]);
  const r = appendDedicatedDishes({ base, retry, asks: [{ cell: "wed/lunch", memberId: "paul" }, { cell: "wed/lunch", memberId: "leo" }] });
  assertEquals(r.rejected_citing_pot, 1);
  assertEquals(r.added.map((a) => a.memberId), ["leo"]);
  assertEquals(r.missing, [{ cell: "wed/lunch", memberId: "paul" }]);
});

Deno.test("⛔ appendDedicatedDishes — un porteur non rendu est NOMMÉ manquant, et un doublon n'entre qu'une fois", () => {
  const base = repas([plat("wed", "lunch", "Couscous", null)]);
  const retry = repas([plat("wed", "lunch", "Noix", "leo"), plat("wed", "lunch", "Noix encore", "leo")]);
  const r = appendDedicatedDishes({ base, retry, asks: [{ cell: "wed/lunch", memberId: "paul" }, { cell: "wed/lunch", memberId: "leo" }] });
  assertEquals(r.added.length, 1);
  assertEquals(r.missing, [{ cell: "wed/lunch", memberId: "paul" }]);
});


Deno.test("⛔ appendDedicatedDishes — `missing` compte les PAIRES demandées, pas le produit cartésien", () => {
  // Mesuré au tir CATCH5 : 2 porteurs × 2 cases = 4 paires « manquantes » pour
  // 2 plats demandés (`missing: 3`, `asked: 2`). Paul est attendu au déjeuner,
  // Léo au dîner ; ni l'un ni l'autre n'est « manquant » dans l'autre case.
  const base = repas([plat("wed", "lunch", "Couscous", null), plat("wed", "dinner", "Soupe", null)]);
  const retry = repas([plat("wed", "lunch", "Noix", "paul"), plat("wed", "lunch", "Noix", "leo")]);
  const r = appendDedicatedDishes({ base, retry, asks: [{ cell: "wed/lunch", memberId: "paul" }, { cell: "wed/dinner", memberId: "leo" }] });
  assertEquals(r.added, [{ cell: "wed/lunch", memberId: "paul" }]);
  // Léo au déjeuner n'était pas demandé : ignoré, pas ajouté.
  assertEquals(r.missing, [{ cell: "wed/dinner", memberId: "leo" }]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-08 — L'ÉPISSAGE : on ne lit que ce qu'on a autorisé
// ═══════════════════════════════════════════════════════════════════════════
import { spliceReworkableUnits } from "./retry_merge.ts";

function sIng(term: string, quantity: string) { return { term, quantity } as unknown as GeneratedMeal["dishes"][number]["ingredients"][number]; }
function sDish(day: string, slot: string, title: string, memberId: string | null, ingredients: unknown[], uses: string[] = []) {
  return { day, slot, title, memberId, method: "", ingredients, boxes: [], uses: uses.map((preparationId) => ({ preparationId })) } as unknown as GeneratedMeal["dishes"][number];
}
function sPot(id: string, ingredients: unknown[], servingsMade = 2) { return { id, title: id, ingredients, servingsMade } as unknown as GeneratedMeal["preparations"][number]; }
function sMeal(dishes: unknown[], preparations: unknown[], shopping: { term: string; quantity: string }[] = []) {
  return { dishes, preparations, cooking_sessions: [], shopping_list: shopping, empty_slots: [] } as unknown as GeneratedMeal;
}

Deno.test("⛔ ÉPISSAGE — le frais autorisé et la casserole autorisée sont remplacés ; la casserole GELÉE et l'AUTRE plat ne bougent pas, même réécrits", () => {
  const base = sMeal(
    [sDish("wed", "lunch", "Riz poulet", null, [sIng("huile", "1 tbsp")], ["prep_rice", "prep_chicken"]), sDish("wed", "lunch", "Riz tofu", "nora", [sIng("citron", "1")], ["prep_rice"])],
    [sPot("prep_rice", [sIng("riz", "200 g")]), sPot("prep_chicken", [sIng("poulet", "400 g")])],
    [{ term: "riz", quantity: "200 g" }, { term: "poulet", quantity: "400 g" }, { term: "huile", quantity: "1" }, { term: "citron", quantity: "1" }],
  );
  const retry = sMeal(
    [sDish("wed", "lunch", "Riz poulet crémeux", null, [sIng("huile", "3 tbsp"), sIng("parmesan", "40 g")], ["prep_rice", "prep_chicken"]), sDish("wed", "lunch", "Riz tofu REFAIT", "nora", [sIng("tahini", "30 g")], ["prep_rice"])],
    [sPot("prep_rice", [sIng("riz", "200 g"), sIng("beurre", "40 g")], 9), sPot("prep_chicken", [sIng("poulet", "900 g"), sIng("crème", "200 ml")])],
    [{ term: "parmesan", quantity: "40 g" }, { term: "beurre", quantity: "40 g" }, { term: "crème", quantity: "200 ml" }, { term: "tahini", quantity: "30 g" }],
  );
  const r = spliceReworkableUnits({ base, retry, asks: [{ dishIndex: 0, freshReworkable: true, reworkablePotIds: ["prep_chicken"] }] });
  // frais du plat demandé : remplacé (et son titre suit)
  assertEquals(r.meal.dishes[0].ingredients.map((i) => i.term), ["huile", "parmesan"]);
  assertEquals(r.meal.dishes[0].title, "Riz poulet crémeux");
  // casserole autorisée : ingrédients remplacés, id et servingsMade GARDÉS
  const chicken = r.meal.preparations.find((p) => p.id === "prep_chicken")!;
  assertEquals(chicken.ingredients.map((i) => i.term), ["poulet", "crème"]);
  assertEquals(chicken.servingsMade, 2);
  // ⛔ casserole GELÉE : réécrite dans la relance, INTACTE ici
  assertEquals(r.meal.preparations.find((p) => p.id === "prep_rice")!.ingredients.map((i) => i.term), ["riz"]);
  // ⛔ l'AUTRE plat (Nora) : réécrit dans la relance, INTACT ici
  assertEquals(r.meal.dishes[1].title, "Riz tofu");
  assertEquals(r.meal.dishes[1].ingredients.map((i) => i.term), ["citron"]);
  // courses : les termes des unités épissées entrent, les autres non ; le beurre (gelée) n'entre pas
  assertEquals(r.meal.shopping_list.map((l) => l.term).sort(), ["citron", "crème", "huile", "parmesan", "poulet", "riz"]);
  // ⟳ 2026-09-11 · LOT E — DEUX COMPTEURS DE PLUS, ET TOUS DEUX À ZÉRO ICI:
  // la relance rend le MÊME ensemble de casseroles (`uses_mismatch: 0`), et les
  // plats de cette fixture ne portent aucun `densityCheck` à invalider.
  assertEquals(r.counts, { fresh_spliced: 1, pots_spliced: 1, dish_missing: 0, pot_missing: 0, shopping_added: 2, shopping_pruned: 0, uses_mismatch: 0, density_checks_cleared: 0 });
  assertEquals(r.dishesSpliced, [0]);
  // ⛔ la base n'est pas mutée
  assertEquals(base.dishes[0].ingredients.map((i) => i.term), ["huile"]);
});

Deno.test("⛔ ÉPISSAGE — un plat ou une casserole autorisés ABSENTS de la relance sont NOMMÉS, et la base reste", () => {
  const base = sMeal([sDish("wed", "lunch", "Riz poulet", null, [sIng("huile", "1")], ["prep_rice"])], [sPot("prep_rice", [sIng("riz", "200 g")])]);
  const retry = sMeal([sDish("wed", "dinner", "Autre", null, [sIng("x", "1")])], []);
  const r = spliceReworkableUnits({ base, retry, asks: [{ dishIndex: 0, freshReworkable: true, reworkablePotIds: ["prep_rice"] }] });
  assertEquals(r.counts.dish_missing, 1);
  assertEquals(r.counts.pot_missing, 1);
  assertEquals(r.dishesSpliced, []);
  assertEquals(r.meal.dishes[0].ingredients.map((i) => i.term), ["huile"]);
});

Deno.test("⛔ ÉPISSAGE — le plat est apparié par la case ET son porteur", () => {
  // Deux plats dans la case, titres voisins : le dédié ne doit pas prendre le
  // frais de la table (défaut mesuré au tir BASCULE sur la garde d'identité).
  const base = sMeal([sDish("wed", "lunch", "Riz poulet", null, [sIng("huile", "1")]), sDish("wed", "lunch", "Riz tofu", "nora", [sIng("citron", "1")])], []);
  // ⛔ LA TABLE D'ABORD dans la relance : un appariement par la case seule
  // prendrait le premier plat de la case — celui de la table — et donnerait
  // le parmesan à Nora. C'est le défaut mesuré au tir BASCULE.
  const retry = sMeal([sDish("wed", "lunch", "Riz poulet", null, [sIng("parmesan", "40 g")]), sDish("wed", "lunch", "Riz tofu", "nora", [sIng("tahini", "30 g")])], []);
  const r = spliceReworkableUnits({ base, retry, asks: [{ dishIndex: 1, freshReworkable: true, reworkablePotIds: [] }] });
  assertEquals(r.meal.dishes[1].ingredients.map((i) => i.term), ["tahini"]);
  assertEquals(r.meal.dishes[0].ingredients.map((i) => i.term), ["huile"]);
});

Deno.test("⟳ appendDedicatedDishes — le plat ajouté est un COMPLÉMENT, et ses courses entrent", () => {
  // 2026-09-09 : c'est ICI, et seulement ici, que `complementsShared` s'écrit.
  const base = repas([plat("wed", "lunch", "Couscous", null)]);
  const retry = {
    ...repas([
      { ...plat("wed", "lunch", "Pain et fromage", "paul"), ingredients: [{ term: "bread", quantity: "60 g" }, { term: "cheese", quantity: "30 g" }] },
    ]),
    shopping_list: [
      { term: "bread", quantity: "1 loaf" },
      { term: "cheese", quantity: "200 g" },
      { term: "salmon", quantity: "400 g" }, // réclamé par personne : IGNORÉ
    ],
  } as unknown as Parameters<typeof appendDedicatedDishes>[0]["retry"];
  const r = appendDedicatedDishes({ base, retry, asks: [{ cell: "wed/lunch", memberId: "paul" }] });
  assertEquals(r.added, [{ cell: "wed/lunch", memberId: "paul" }]);
  const added = r.meal.dishes.find((d) => d.memberId === "paul")!;
  assertEquals(added.complementsShared, true, "le plat ajouté n'est pas marqué complément");
  assertEquals(r.meal.dishes.find((d) => d.memberId === null)!.complementsShared, undefined, "la table a reçu le drapeau");
  assertEquals(r.shopping_added, 2);
  assertEquals(r.meal.shopping_list.map((l) => l.term).sort(), ["bread", "cheese"]);
});
