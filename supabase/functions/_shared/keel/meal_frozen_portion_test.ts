import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  buildMealPrompt,
  mealDishesPayload,
  MEAL_PROMPT_VERSION,
  parseEatingRhythm,
  parseGeneratedMeal,
} from "./meal_generation.ts";
import type { KitchenTool } from "./kitchen_equipment.ts";
import { daysOutOfBatchReach } from "./plan_feasibility.ts";
import { FREEZER_WINDOW_DAYS } from "./fridge_window.ts";

// ═══════════════════════════════════════════════════════════════════════════
// LA PART CONGELÉE A UNE CLÉ — lot `uses[].kept`, 2026-09-01
// ═══════════════════════════════════════════════════════════════════════════
//
// ── LE DÉCOR MESURÉ, ET IL EST LA RAISON D'ÊTRE DU LOT ────────────────────
// Un foyer déclare UNE session de cuisine, un congélateur, et sept jours. Avant
// ce lot il recevait un plan dont QUATRE journées n'avaient qu'un
// petit-déjeuner: 8 plats sur 21 jetés par la fenêtre du cuit, en silence.
//
// Et le modèle n'y était pour rien. Le prompt lui demandait DÉJÀ de dire que le
// surplus part au congélateur; dans la mesure il l'avait écrit TROIS fois —
// méthode du plat, méthode de la casserole, déroulé de la session. C'était de
// la prose, il n'existait aucune clé pour la lire, et la prose ne garde rien.
//
// ⛔ CE FICHIER TIENT LES DEUX MOITIÉS. Une seule — « ça passe maintenant » —
// serait une garde désarmée qui ressemble à un lot qui marche.
//   ① la fenêtre s'ouvre quand les DEUX conditions sont réunies;
//   ② elle reste fermée dès qu'il en manque une, y compris sur l'ignorance.

const WINDOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WITH_FREEZER: KitchenTool[] = ["oven", "stovetop", "microwave", "freezer"];
const NO_FREEZER: KitchenTool[] = ["oven", "stovetop", "microwave"];

/** Sept jours × (petit-déjeuner frais + déjeuner et dîner puisés au lot). */
function week(kept: "fridge" | "freezer" | null): Record<string, unknown> {
  const dishes: unknown[] = [];
  for (const day of WINDOW) {
    dishes.push({
      title: `Breakfast ${day}`,
      slot: "breakfast",
      day,
      ingredients: [{ term: "oats", quantity: "60 g" }],
      method: "mix",
      why: "y",
    });
    for (const slot of ["lunch", "dinner"]) {
      dishes.push({
        title: `${slot} ${day}`,
        slot,
        day,
        ingredients: [{ term: "salad", quantity: "1 handful" }],
        method: "reheat a portion",
        why: "y",
        // `null` = le modèle n'écrit PAS le champ. C'est le cas de toute
        // réponse rédigée avant ce lot.
        uses: [
          kept === null
            ? { preparation_id: "prep_chicken", servings: 1 }
            : { preparation_id: "prep_chicken", servings: 1, kept },
        ],
      });
    }
  }
  return {
    dishes,
    preparations: [{
      id: "prep_chicken",
      title: "Roast chicken thighs",
      servings_made: 14,
      ingredients: [{ term: "chicken thighs", quantity: "2 kg" }],
      method: "Roast the lot.",
      active_minutes: 30,
      total_minutes: 60,
      cook_on: "sun",
    }],
    cooking_sessions: [{
      day: "sun",
      preparation_ids: ["prep_chicken"],
      total_minutes: 60,
      run_through: "Oven on, roast, portion.",
    }],
    shopping_list: [{ term: "chicken thighs", quantity: "2 kg", aisle: "protein" }],
  };
}

function parse(
  kept: "fridge" | "freezer" | null,
  kitchenEquipment: readonly KitchenTool[] | null,
) {
  return parseGeneratedMeal(week(kept), {
    doctrine: null,
    safetyConstraints: null,
    mode: "to_shop",
    scope: "several_days",
    pantry: [],
    beliefKeys: [],
    eatingRhythm: parseEatingRhythm(["breakfast", "lunch", "dinner"]),
    daysToFill: WINDOW,
    awayDays: [],
    cookingTimeMin: 60,
    kitchenEquipment,
    composition: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    boxMemberIds: [],
    weighedMemberIds: [],
    cookOnlyDay: null,
    soloBoxes: false,
    boxMemberDiets: [],
    boxMemberExclusions: [],
  });
}

// ---------------------------------------------------------------------------
// ① LA FENÊTRE S'OUVRE — le cas de recette
// ---------------------------------------------------------------------------

Deno.test("RECETTE — une session, un congélateur, sept jours: 21 plats sur 21", () => {
  const meal = parse("freezer", WITH_FREEZER);
  assertEquals(meal.dishes.length, 21);
  // ⛔ ET AUCUN TROU. Le compte de plats seul ne suffirait pas: 21 plats mal
  // répartis laisseraient quand même des cases vides.
  assertEquals(meal.empty_slots, []);
  // Chaque jour a bien ses trois moments.
  for (const day of WINDOW) {
    assertEquals(
      meal.dishes.filter((d) => d.day === day).length,
      3,
      `${day} n'a pas ses trois repas`,
    );
  }
});

// ---------------------------------------------------------------------------
// ② LA FENÊTRE RESTE FERMÉE — les trois cas où elle doit mordre
// ---------------------------------------------------------------------------

Deno.test("⛔ réclamé SANS congélateur déclaré: la garde tient, et elle compte", () => {
  const meal = parse("freezer", NO_FREEZER);
  // Le comportement d'avant le lot, au plat près.
  assertEquals(meal.dishes.length, 13);
  assert(
    meal.issues.some((i) => i.startsWith("freezer_claimed_without_one:")),
    meal.issues.join(" | "),
  );
  // ⚠️ LE COMPTEUR SORT AVEC SON DÉNOMINATEUR. « 14 réclamations » ne veut rien
  // dire sans la population sur laquelle elles ont été comptées — et sans lui,
  // ce nombre se lisait à côté d'un `uses_kept_freezer: 6/6` qui portait, lui,
  // une AUTRE population. Mesuré et corrigé le 2026-09-01.
  const claim = meal.issues.find((i) => i.startsWith("freezer_claimed_without_one:"))!;
  assert(/freezer_claimed_without_one: \d+\/\d+ batch links/.test(claim), claim);
});

Deno.test("⛔ `null` — jamais demandé — ne relâche RIEN", () => {
  // La direction fail-closed: `hasKitchenTool` rend `null` quand la question
  // n'a jamais été posée, et `=== true` fait retomber ce cas sur le frigo.
  // C'est le cas de la quasi-totalité du parc, donc celui qui compte.
  assertEquals(parse("freezer", null).dishes.length, 13);
});

Deno.test("⛔ un congélateur SANS déclaration ne relâche rien non plus", () => {
  // Une part oubliée au frigo pendant six jours rend malade exactement autant
  // dans une cuisine qui possède un congélateur.
  assertEquals(parse("fridge", WITH_FREEZER).dishes.length, 13);
});

Deno.test("⚠️ LE CAS QUI PASSE — sans le champ, le plan est celui d'avant", () => {
  // Un modèle qui n'écrit jamais `kept` doit produire v19, au plat près. Sans
  // ce cas, le lot pourrait être un relâchement général déguisé en correctif.
  const sans = parse(null, WITH_FREEZER);
  assertEquals(sans.dishes.length, 13);
  assertEquals(sans.dishes.map((d) => `${d.day}/${d.slot}`).sort(), [
    "fri/breakfast",
    "mon/breakfast",
    "mon/dinner",
    "mon/lunch",
    "sat/breakfast",
    "sun/breakfast",
    "sun/dinner",
    "sun/lunch",
    "thu/breakfast",
    "tue/breakfast",
    "tue/dinner",
    "tue/lunch",
    "wed/breakfast",
  ]);
});

// ---------------------------------------------------------------------------
// ③ CE QUI PART EN BASE, ET CE QUI PART AU MODÈLE
// ---------------------------------------------------------------------------

Deno.test("`kept` s'écrit MÊME à `fridge` — une clé absente est un lot débranché", () => {
  const payload = mealDishesPayload(parse(null, null));
  const uses = payload
    .map((d) => d.uses as Array<Record<string, unknown>>)
    .find((u) => u.length > 0)!;
  assert("kept" in uses[0], Object.keys(uses[0]).join(","));
  assertEquals(uses[0].kept, "fridge");
});

Deno.test("un jeton inconnu retombe sur `fridge` SANS jeter le plat", () => {
  // Posture `for_member_id` / `same_day` / `box_id`: `kept` est une PRÉCISION
  // en plus, et perdre un dîner parce qu'un modèle a écrit « frozen » au lieu
  // de « freezer » échangerait le repas contre le confort du parseur.
  const meal = parseGeneratedMeal({
    dishes: [{
      title: "lunch mon",
      slot: "lunch",
      day: "mon",
      ingredients: [],
      method: "x",
      why: "y",
      uses: [{ preparation_id: "prep_chicken", servings: 1, kept: "frozen" }],
    }],
    preparations: [{
      id: "prep_chicken",
      title: "Chicken",
      servings_made: 4,
      ingredients: [],
      method: "roast",
      cook_on: "mon",
    }],
    shopping_list: [],
  }, {
    doctrine: null,
    safetyConstraints: null,
    mode: "to_shop",
    scope: "several_days",
    pantry: [],
    beliefKeys: [],
    eatingRhythm: parseEatingRhythm(["lunch"]),
    daysToFill: ["mon", "tue"],
    awayDays: [],
    cookingTimeMin: null,
    kitchenEquipment: ["freezer"],
    composition: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    boxMemberIds: [],
    weighedMemberIds: [],
    cookOnlyDay: null,
    soloBoxes: false,
    boxMemberDiets: [],
    boxMemberExclusions: [],
  });
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.dishes[0].uses[0].kept, "fridge");
});

Deno.test("PROMPT — la consigne du congélateur TOUCHE la clé qu'elle décrit", () => {
  // ⛔ « LA PROMESSE ET LA CLÉ DE SCHÉMA DOIVENT SE TOUCHER. » C'est la
  // cicatrice qui explique ce lot entier: la sortie « congèle le surplus »
  // existait depuis toujours, en prose, à distance de tout champ — taux de
  // captation mesuré, zéro. Ce test tient l'adjacence.
  const { systemPrompt } = buildMealPrompt({
    firstDayCookable: true,
    hasFreezer: false,
    oneCookingSession: false,
    cookOnlyDay: null,
    soloBoxes: false,
    contentLocale: "en-US",
    budgetAmount: null,
    dietBlock: "",
    doctrineBlock: "",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    protocolBlock: "",
    beliefKeys: [],
    goal: "health",
    situation: null,
    context: null,
    mode: "to_shop",
    scope: "several_days",
    slot: null,
    servings: 1,
    pantry: [],
    safetyConstraints: null,
    safetyConstraintTable: null,
    body: null,
    focusAxis: null,
    cookDays: [],
    daysToFill: WINDOW,
    todayToken: "sun",
    today: "2026-08-23",
  });

  // La clé est dans le schéma…
  assert(systemPrompt.includes('"kept": "fridge"|"freezer"'), "schéma sans la clé");
  // …et la consigne NOMME le champ, littéralement, pas « comme dit plus haut ».
  assert(
    systemPrompt.includes('`"kept": "freezer"`'),
    "la consigne ne nomme pas la clé",
  );
  // Et elle dit que la prose seule ne garde rien — l'échappatoire nommée.
  assert(
    systemPrompt.includes("still has one, because nothing reads a description"),
    "l'échappatoire de la prose n'est pas fermée",
  );

  // Le millésime a bougé: sans lui, les plans d'avant et d'après se
  // compteraient dans le même dénominateur.
  // ⚠️ v21 (2026-09-01) — LES JOURS HORS DE PORTÉE D'UN LOT SONT NOMMÉS, et la
  // session seule a le droit de déborder en le disant. Population: les fenêtres
  // qui portent une journée qu'aucun lot n'atteint. Un plan sans tension rend
  // v20 au caractère près, et un test le tient.
  // ⚠️ v25 (2026-09-03) — LA VEILLE EST DÉRIVÉE, PLUS COCHÉE (P1, A1).
  // La CONSIGNE n'a pas changé d'un caractère: `cookOnlyDay` existait déjà.
  // Ce qui change est la POPULATION qui la reçoit — jusqu'ici les seuls plans
  // qui portaient un jour de cuisine sans repas étaient ceux dont quelqu'un
  // avait coché une case; ils le portent désormais par défaut, dès que le
  // calendrier et l'heure le permettent. Comparer les plans d'avant et d'après
  // sous un même millésime rendrait la mesure fausse.
  // ⚠️ v26 (2026-09-03, A2/P2) — LE STYLE DE CUISINE POSE LES SESSIONS.
  // Population qui voit une consigne différente: celle qui a répondu aux DEUX
  // questions de P2 (`cooking_style` + `grocery_runs`). Pour elle, `cook_days`
  // et le plafond de temps de session ne viennent plus de la colonne mais de
  // la dérivation; pour tous les autres, la consigne est celle de v25 au
  // caractère près, et un test de rationale le tient ligne à ligne.
  assertEquals(MEAL_PROMPT_VERSION, "meal.en.v26_the_cooking_style_sets_the_sessions");
});

// ═══════════════════════════════════════════════════════════════════════════
// LOT 2 — LES JOURS HORS DE PORTÉE, NOMMÉS DANS LA CONSIGNE
// ═══════════════════════════════════════════════════════════════════════════

function promptFor(over: Record<string, unknown>) {
  return buildMealPrompt({
    firstDayCookable: true,
    hasFreezer: false,
    oneCookingSession: false,
    cookOnlyDay: null,
    soloBoxes: false,
    contentLocale: "en-US",
    budgetAmount: null,
    dietBlock: "",
    doctrineBlock: "",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    protocolBlock: "",
    beliefKeys: [],
    goal: "health",
    situation: null,
    context: null,
    mode: "to_shop",
    scope: "several_days",
    slot: null,
    servings: 1,
    pantry: [],
    safetyConstraints: null,
    safetyConstraintTable: null,
    body: null,
    focusAxis: null,
    cookDays: [],
    daysToFill: WINDOW,
    todayToken: "sun",
    today: "2026-08-23",
    ...over,
  });
}

Deno.test("PROMPT — la consigne NOMME exactement les jours hors de portée", () => {
  // ⛔ TROISIÈME APPLICATION DE LA MÊME RÈGLE, après `addedCookDays` et
  // `usableCookDays`: la consigne et l'explication doivent lire LA MÊME
  // fonction, sinon c'est l'explication qui a tort.
  const { userMessage } = promptFor({ cookDays: ["sun"] });
  const out = daysOutOfBatchReach({
    window: WINDOW,
    cookDays: ["sun"],
    hasFreezer: false,
    maxFridgeDays: 3,
    freezerWindowDays: FREEZER_WINDOW_DAYS,
  });
  assertEquals(out, ["wed", "thu", "fri", "sat"]);
  assert(
    userMessage.includes(`nothing cooked in those sessions reaches ${out.join(", ")}`),
    "la consigne ne nomme pas les jours que l'explication va nommer",
  );
  // Et elle dit ce que ça COÛTE d'écrire un plat de lot là — c'est cette
  // moitié-là qui manquait: la règle générale existait, sans conséquence.
  assert(userMessage.includes("it will be thrown away"), userMessage);
});

Deno.test("⚠️ LE CAS QUI PASSE — sans tension, aucune des deux lignes neuves", () => {
  // ⛔ SANS CE CAS, LE LOT SERAIT DEUX PHRASES SERVIES À TOUT LE MONDE. Une
  // fenêtre de trois jours cuisinée le premier jour n'a rien hors de portée:
  // le prompt doit être celui de v20, au caractère près.
  const { userMessage } = promptFor({
    cookDays: ["sun"],
    daysToFill: ["sun", "mon", "tue"],
    cookingTimeMin: 30,
  });
  assert(!userMessage.includes("nothing cooked in those sessions reaches"), userMessage);
  assert(!userMessage.includes("allowed to run long"), userMessage);
  // Le plafond déclaré, lui, est toujours servi tel quel.
  assert(userMessage.includes("about 30 minutes"), userMessage);
});

Deno.test("le congélateur DÉCLARÉ fait taire la ligne des jours hors de portée", () => {
  // ⚠️ CE TEST EST LA JOINTURE DES DEUX LOTS. Sans lui, la consigne du Lot 2
  // interdirait les plats de lot exactement là où le Lot 1 vient de les rendre
  // possibles — et les deux se contrediraient dans le même message.
  const { userMessage } = promptFor({ cookDays: ["sun"], hasFreezer: true });
  assert(!userMessage.includes("nothing cooked in those sessions reaches"), userMessage);
});

Deno.test("la session seule a le droit de déborder, avec un plafond CHIFFRÉ", () => {
  const { userMessage } = promptFor({ cookDays: ["sun"], cookingTimeMin: 30 });
  assert(userMessage.includes("allowed to run long -- up to 60 minutes"), userMessage);
  // ⛔ ET LE PLAFOND DÉCLARÉ RESTE DIT: la permission ne le remplace pas, elle
  // s'ajoute. Le retirer ferait de « 60 » la nouvelle cible.
  assert(userMessage.includes("about 30 minutes"), userMessage);
});

Deno.test("deux jours de cuisine ⇒ AUCUNE permission de déborder", () => {
  // La sortie ordinaire existe (« mets le reste sur l'autre jour »), donc la
  // permission ne sort pas. Une permission générale serait une invitation.
  const { userMessage } = promptFor({
    cookDays: ["sun", "wed"],
    cookingTimeMin: 30,
  });
  assert(!userMessage.includes("allowed to run long"), userMessage);
});

Deno.test("une session qui déborde est RENDUE, pas seulement comptée", () => {
  // ⛔ LA CONTREPARTIE DE LA PERMISSION. Autoriser le débordement sans le
  // rendre lisible aurait légalisé le silence: la personne découvrait la vraie
  // durée devant ses casseroles.
  const meal = parseGeneratedMeal({
    dishes: [{
      title: "lunch sun",
      slot: "lunch",
      day: "sun",
      ingredients: [],
      method: "x",
      why: "y",
      uses: [{ preparation_id: "prep_chicken", servings: 1 }],
    }],
    preparations: [{
      id: "prep_chicken",
      title: "Chicken",
      servings_made: 4,
      ingredients: [],
      method: "roast",
      cook_on: "sun",
    }],
    cooking_sessions: [{
      day: "sun",
      preparation_ids: ["prep_chicken"],
      total_minutes: 75,
      run_through: "roast, portion",
    }],
    shopping_list: [],
  }, {
    doctrine: null,
    safetyConstraints: null,
    mode: "to_shop",
    scope: "several_days",
    pantry: [],
    beliefKeys: [],
    eatingRhythm: parseEatingRhythm(["lunch"]),
    daysToFill: ["sun", "mon"],
    awayDays: [],
    cookingTimeMin: 30,
    kitchenEquipment: null,
    composition: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    boxMemberIds: [],
    weighedMemberIds: [],
    cookOnlyDay: null,
    soloBoxes: false,
    boxMemberDiets: [],
    boxMemberExclusions: [],
  });
  assertEquals(meal.session_overruns, [{ day: "sun", minutes: 75, declared: 30 }]);
  // ⚠️ ET LA LIGNE D'`issues` RESTE: elle ne sert pas au même lecteur. Sans
  // elle, le lot deviendrait invérifiable en base.
  assert(
    meal.issues.some((i) => i.includes("runs 75 min")),
    meal.issues.join(" | "),
  );
});

Deno.test("⚠️ LE CAS QUI PASSE — une session dans les clous ne remonte rien", () => {
  // La marge de dix minutes est celle d'avant, et elle n'a pas bougé: signaler
  // 62 contre 60 ferait du bruit qui finit par cacher les vrais 95.
  const meal = parseGeneratedMeal({
    dishes: [{
      title: "lunch sun",
      slot: "lunch",
      day: "sun",
      ingredients: [],
      method: "x",
      why: "y",
      uses: [{ preparation_id: "prep_chicken", servings: 1 }],
    }],
    preparations: [{
      id: "prep_chicken",
      title: "Chicken",
      servings_made: 4,
      ingredients: [],
      method: "roast",
      cook_on: "sun",
    }],
    cooking_sessions: [{
      day: "sun",
      preparation_ids: ["prep_chicken"],
      total_minutes: 38,
      run_through: "roast, portion",
    }],
    shopping_list: [],
  }, {
    doctrine: null,
    safetyConstraints: null,
    mode: "to_shop",
    scope: "several_days",
    pantry: [],
    beliefKeys: [],
    eatingRhythm: parseEatingRhythm(["lunch"]),
    daysToFill: ["sun", "mon"],
    awayDays: [],
    cookingTimeMin: 30,
    kitchenEquipment: null,
    composition: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    boxMemberIds: [],
    weighedMemberIds: [],
    cookOnlyDay: null,
    soloBoxes: false,
    boxMemberDiets: [],
    boxMemberExclusions: [],
  });
  assertEquals(meal.session_overruns, []);
});
