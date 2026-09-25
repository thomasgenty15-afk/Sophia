/**
 * ⟳ 2026-09-25 — LA BOÎTE EST DÉJÀ FAITE (`MEAL_PROMPT_VERSION` v35,
 * `HOUSEHOLD_PROMPT_VERSION` v43).
 *
 * ── LE DÉFAUT MESURÉ ─────────────────────────────────────────────────────
 * Le code range chaque repas qui tire sur des casseroles dans UNE boîte, plat
 * et féculent côte à côte (`portion_sizing_apply.ts`), et le Boxing de la
 * session la fait remplir. Le modèle ne le savait pas: sur les 7 derniers plans,
 * 59 repas en boîte tirant sur deux casseroles, 59 méthodes qui réunissaient
 * ou réchauffaient séparément la viande et le féculent — « Assembler froids le
 * filet de porc aux légumes et les pâtes » (plan `8ad9dec6`), « dans deux
 * poêles couvertes ». Le déroulé de session finissait par « Répartir chaque
 * préparation séparément en deux portions », contre le Boxing juste en dessous.
 *
 * Ce que ce fichier tient:
 *   ① le fait du contenant unique vit DANS le bloc `same_day`, à côté du mot
 *      `method` — une promesse loin de sa clé est suivie à 0 %;
 *   ② il nomme ses deux seuls contenus (chaud ou froid PAR PLAT, ajouts
 *      frais), sans phrase de repli entière à recopier (v36);
 *   ③ l'exemple « reheat a portion » et « box four portions » sont partis;
 *   ④ la ligne de schéma de `method` et celle de `run_through` le redisent,
 *      et le déroulé exige ses minutes (v37);
 *   ⑤ la phrase du féculent ne fait plus mettre en boîte au déroulé;
 *   ⑥ aucun aliment dans les exemples du geste du jour (v37);
 *   ⑦ l'huile ajoutée a un plancher de 5 ml (v44);
 *   ⑧ tout plat en boîte se réchauffe; le froid, seulement pour une salade
 *      dont le titre le dit (v40).
 *
 * ⚠️ UN EXEMPLE CITÉ EST RECOPIÉ. Mesuré deux fois le même jour: la phrase
 * du froid (14/14 méthodes) et « drizzle the olive oil and grate the
 * parmesan » (huile ajoutée à 13 repas sur 14, réduite à 0,3 ml).
 */
import { assert } from "jsr:@std/assert@1";
import { MEAL_PROMPT_SECTIONS, MEAL_SYSTEM_PROMPT } from "./meal_prompt_text.ts";
import { standardRecipeBlock } from "./household_standard_recipe.ts";

function section(key: string): string {
  const found = MEAL_PROMPT_SECTIONS.find((s) => s.key === key);
  assert(found, `section « ${key} » introuvable`);
  return found.text;
}

Deno.test("① le fait du contenant unique est dans `same_day`, à côté de `method`", () => {
  const text = section("same_day");
  const fact = text.indexOf('A dish with "uses" comes out of ONE container.');
  assert(fact > 0, text);
  const method = text.indexOf('So the "method" of a dish with "uses"', fact);
  assert(method > fact, "la phrase sur `method` ne suit plus le fait");
  // Mesuré à l'écriture: 267 caractères.
  assert(method - fact < 400, `fait et clé trop loin: ${method - fact}`);
});

Deno.test("② deux contenus seulement: chaud ou froid PAR PLAT, puis les ajouts", () => {
  // Les phrases passent à la ligne à 80 colonnes: on compare sans elles.
  const text = section("same_day").replace(/\s+/g, " ");
  // ⟳ v43 — le MOMENT décide: réchauffé au déjeuner et au dîner.
  assert(text.includes("hot or cold, and the MOMENT decides. At lunch and at dinner the dish is REHEATED"), text);
  assert(text.includes("its title says it is a salad"));
  assert(text.includes("what to do with each food the dish adds fresh that day, if it adds any"));
  assert(text.includes("Never name what is already in the container"));
});

Deno.test("② bis — ⟳ v36 : aucune phrase de repli entière à recopier", () => {
  // v35 citait « Eat it cold, straight from the container. »: 14 méthodes sur
  // 14 la recopiaient au premier run (brouillon `6b9be1e0`), dîners compris.
  const text = section("same_day").replace(/\s+/g, " ");
  assert(!/eat it cold, straight from the container/i.test(text), text);
});

Deno.test("③ plus d'exemple qui fait sortir « une portion » ni mettre en boîte au déroulé", () => {
  assert(!MEAL_SYSTEM_PROMPT.includes("reheat a portion, add the salad"));
  assert(!MEAL_SYSTEM_PROMPT.includes("box four portions"));
  assert(section("cooking_sessions").includes("The run-through ends when the cooking does."));
});

Deno.test("④ le schéma de sortie le redit sur `method` et `run_through`", () => {
  assert(MEAL_SYSTEM_PROMPT.includes(
    '"method": "how to make it, plainly, in a short paragraph; with uses: heated or cold, and what is added fresh -- the container holds the rest"',
  ));
  assert(MEAL_SYSTEM_PROMPT.includes(
    '"run_through": "the order of the cooking gestures, each with its heat and its minutes; it ends when the cooking does"',
  ));
});

Deno.test("④ bis — ⟳ v37 : les minutes du déroulé sont exigées dans le bloc des sessions", () => {
  // v35/v36: 4 déroulés sur 12 renvoyaient à « son temps indiqué », 0 sur 116
  // avant. La clé de schéma ci-dessus et le bloc disent la même exigence.
  const text = section("cooking_sessions").replace(/\s+/g, " ");
  assert(text.includes("Every gesture that heats says its minutes as a number, the starch pot included."), text);
});

Deno.test("⑥ ⟳ v37 : aucun aliment dans les exemples du geste du jour", () => {
  // v35/v36: « drizzle the olive oil and grate the parmesan », « squeeze the
  // lemon » étaient recopiés — huile ajoutée à 13 repas sur 14, réduite à 0,3 ml.
  const sameDay = section("same_day").replace(/\s+/g, " ");
  // « A grain salad » reste: c'est un exemple de plat FROID, pas un ajout.
  for (const food of ["olive oil", "parmesan", "lemon"]) {
    assert(!sameDay.toLowerCase().includes(food), `« ${food} » est revenu dans same_day`);
  }
  const cookVsEat = section("cook_vs_eat").replace(/\s+/g, " ");
  assert(!cookVsEat.includes("add the salad and the lemon"), "l'exemple aliment est revenu");
});

Deno.test("⑦ ⟳ v44 : l'huile ajoutée a un plancher de 5 ml, à côté de la règle du gras", () => {
  const text = standardRecipeBlock({ normal: 100, light: 80 }, { served: false }).join("\n");
  const rule = text.indexOf("The fat of a plate is a drizzle");
  const floor = text.indexOf("Oil a dish adds fresh on the day is at least 5 ml");
  assert(rule >= 0 && floor > rule, text);
  assert(floor - rule < 300, `plancher trop loin de la règle: ${floor - rule}`);
  assert(text.includes("A plate that cannot take 5 ml more adds no oil."));
});

Deno.test("⑧ ⟳ v40 : tout plat en boîte se réchauffe; le froid, seulement une salade qui le dit", () => {
  // v37 laissait « unless the dish itself is meant cold » (4 dîners sur 7
  // froids, `ffad99ae`); v38 laissait le froid au déjeuner avec « a grain
  // salad » en exemple (7 déjeuners sur 7 « comme une salade de céréales »,
  // poulet mijoté compris, `54aec009`).
  const text = section("same_day").replace(/\s+/g, " ");
  assert(!text.includes("unless the dish itself is meant cold"), "la porte v37 est revenue");
  assert(!text.includes("Only a LUNCH may be eaten cold"), "la porte v38 est revenue");
  assert(!/grain salad/i.test(text), "l'exemple recopié est revenu");
  assert(text.includes("nothing about what is in the container"));
});

Deno.test("⑤ la phrase du féculent ne fait plus mettre en boîte au déroulé", () => {
  const text = standardRecipeBlock({ normal: 100, light: 80 }, { served: false }).join("\n");
  assert(!text.includes("side by side in each box"), text);
  assert(text.includes("side by side in ONE container\nper meal."), text);
});

Deno.test("⑨ ⟳ v41 : le poisson cuit suit J+2 comme le code; le riz garde sa ligne", () => {
  // Décision du propriétaire (2026-09-25): « garde J+2 et retire la phrase du
  // prompt ». La limite « same day or the day after » pour le poisson
  // contredisait `MAX_FRIDGE_DAYS` et `PLATE_WINDOW_DAYS`, sans rien pour la
  // vérifier.
  const text = section("keeping_window").replace(/\s+/g, " ");
  assert(!/seafood/i.test(text), text);
  assert(text.includes("Cooked rice is tighter still: same day or the day after."), text);
});

Deno.test("⑩ ⟳ v43 : au petit-déjeuner et au goûter, le plat se mange comme sa préparation est faite", () => {
  // Banc des trois foyers: des œufs durs du matin « réchauffés 8 min à la
  // casserole couverte » — la règle v40 (« tout plat en boîte se réchauffe »)
  // appliquée à un petit-déjeuner froid.
  const text = section("same_day").replace(/\s+/g, " ");
  assert(text.includes("At breakfast and at a snack, the dish is eaten the way its preparation was made to be eaten"), text);
  assert(text.includes("made to be eaten cold, it gets no reheating step"), text);
  assert(!text.includes("at lunch as at dinner"), "la règle v40 est revenue");
});

Deno.test("⑪ ⟳ v43 : aucun geste de réchauffage cité en exemple, nulle part", () => {
  // Mesuré: « tip it into a covered pan, 8 min on low » recopié sur tous les
  // plats, micro-ondes coché. Un exemple cité est recopié.
  for (const key of ["same_day", "cook_vs_eat", "minutes"]) {
    const text = section(key).replace(/\s+/g, " ");
    assert(!/covered pan, 8 min/i.test(text), `${key}: ${text}`);
    assert(!/reheat 8 min/i.test(text), `${key}: ${text}`);
  }
});

