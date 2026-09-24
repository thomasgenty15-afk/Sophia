/**
 * REPAS GÉNÉRÉS — composer un repas (ou quelques-uns) pour UN élève, à partir
 * de sa méthode, de son contexte du moment et de ce qu'il a dans ses placards.
 *
 * ── CE QUI DISTINGUE CE FICHIER DE `week_plan_generation.ts` ─────────────
 * Le plan de la semaine produit des LIGNES DE MÉTHODE (« construis ton
 * déjeuner autour d'une ancre protéique »). Chacune DOIT nommer la conviction
 * qu'elle applique, et la base le refuse sinon: une ligne de méthode sans
 * origine est une méthode inventée.
 *
 * Ce fichier-ci produit des PLATS. Un plat est une application libre. La
 * doctrine du coach est toujours injectée et ses contre-indications sont
 * verrouillées, mais elle ne dicte pas la recette — arbitrage produit du
 * 2026-08-04. `honours_belief_keys` est donc renseigné quand le modèle sait le
 * dire, et il est INFORMATIF: aucun CHECK ne l'exige, et le lecteur de ce
 * fichier ne doit pas croire qu'il le garantit.
 *
 * ── CE QUI EST GARANTI ICI, DÉTERMINISTE, TESTÉ ──────────────────────────
 *   1. Aucun plat ne porte de cible chiffrée d'énergie ou de macro. Les
 *      QUANTITÉS de courses, elles, passent: « 400 g de poulet » est une
 *      portion à acheter, « 30 g de protéines » est une cible que personne n'a
 *      mesurée. Cette distinction est la règle du produit, pas une tolérance.
 *   2. « Tu as déjà ça » est VÉRIFIÉ contre le garde-manger que l'élève a
 *      tapé, jamais lu sur le drapeau du modèle. Ce dépôt a une classe
 *      d'incidents « accusé fantôme » (le bot dit « c'est noté » sans ligne en
 *      base); dire « tu as tout » à quelqu'un qui n'a pas les œufs est la même
 *      faute, servie au moment des courses.
 *   3. Le rayon d'une ligne de courses vient d'un vocabulaire FERMÉ. Un rayon
 *      inventé est une ligne qu'aucun rendu ne sait placer.
 *   4. Le repas rendu passe la ceinture de sortie complète: interdits du
 *      coach, ALIMENTS DÉCONSEILLÉS, contraintes médicales de l'élève. En
 *      entier — un repas amputé en silence de son ingrédient dangereux reste
 *      un repas qu'on a servi à quelqu'un qui ne devait pas le voir.
 *
 * ── CE QUI N'EST PAS GARANTI, ET IL FAUT LE DIRE ─────────────────────────
 *   Que la recette soit bonne, faisable dans le temps annoncé, ou qu'elle
 *   plaise. Aucun code ne juge une recette. C'est pour ça que l'élève voit ce
 *   qu'il a sous la main et ce qu'il doit acheter: il tranche, pas nous.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

// ---------------------------------------------------------------------------
// ⟳ 2026-09-24 · LOT 2d-1 DU DÉCOUPAGE — HUIT MODULES SONT SORTIS DE CE FICHIER
// ---------------------------------------------------------------------------
//
// Déplacés tels quels, sans changer une ligne de logique ni un octet de prompt :
//   · modes, moments, rythme, absences, prose des jours → `meal_vocabulary.ts`
//   · les types de sortie et leurs bornes              → `meal_types.ts`
//   · le plan mis en forme pour la base                → `meal_payloads.ts`
//   · le garde-manger                                  → `meal_pantry.ts`
//   · budget de plats, sessions, jours de cuisine      → `meal_budget.ts`
//   · les grammes d'une ligne et d'une préparation     → `meal_grams.ts`
//   · la ceinture de régime sur un plat, une boîte     → `meal_regime_scan.ts`
//   · les cases vides de la grille                     → `meal_slots.ts`
// La passe 2 (lot 2d-2, ci-dessous) a sorti le reste. Tout est ré-exporté
// ici : aucun appelant ne change d'import. Les tests qui lisent le TEXTE de
// ce fichier lisent la famille
// entière (`scripts/source-families.json`). Aucun des huit modules n'importe
// ce fichier.

// ---------------------------------------------------------------------------
// ⟳ 2026-09-24 · LOT 2d-2 DU DÉCOUPAGE — LE PROMPT ET LE PARSEUR SONT SORTIS
// ---------------------------------------------------------------------------
//
// Déplacés tels quels, sans changer une ligne de logique ni un octet de prompt :
//   · l'historique des versions, `MEAL_PROMPT_VERSION`, `SOLO_BOX_BLOCK`,
//     l'arbitrage, les sections du prompt système, les champs traduisibles,
//     les indices recette/variété                    → `meal_prompt_text.ts`
//   · `buildMealPrompt`                              → `meal_prompt.ts`
//   · les lecteurs du parseur, `localizeOutputLockBites`, `decodeModelJson`,
//     `parseGeneratedMeal`                           → `meal_parse.ts`
// Ce fichier ne garde que cet en-tête et les ré-exports : il n'importe plus
// rien. `MEAL_PROMPT_VERSION` et `SOLO_BOX_BLOCK` ne sont pas restés ici parce
// que `buildMealPrompt` lit `SOLO_BOX_BLOCK` : l'importer depuis ce fichier
// serait un import circulaire. Aucun des onze modules n'importe ce fichier.

export {
  BUDGET_MAX,
  dayProse,
  DEFAULT_EATING_RHYTHM,
  EATING_OCCASIONS,
  householdGridSlots,
  isAway,
  MEAL_MODES,
  MEAL_SCOPES,
  MEAL_SIZES,
  MEAL_SLOTS,
  OCCASION_PROSE,
  occasionList,
  parseAwayDays,
  parseEatingRhythm,
  usableBudget,
} from "./meal_vocabulary.ts";
export type {
  AwayDay,
  EatingOccasion,
  EatingOccasionSlot,
  HouseholdGridSlots,
  MealMode,
  MealScope,
  MealSize,
  MealSlot,
} from "./meal_vocabulary.ts";
export {
  BOX_MAX_GRAMS,
  BOX_SUM_TOLERANCE_RATIO,
  DISH_NAME_MAX_CHARS,
  SAME_DAY_KINDS,
  SAME_DAY_MAX_MINUTES,
  SHOPPING_AISLES,
  UNQUANTIFIED_TERMS_NAMED,
} from "./meal_types.ts";
export type {
  BoxHeldOff,
  BoxItem,
  CookingSession,
  DishIngredient,
  DishSameDay,
  GeneratedDish,
  GeneratedMeal,
  MealBox,
  MealComponent,
  MealPreparation,
  MealSlotCase,
  PantryItem,
  SameDayKind,
  ShoppingAisle,
  ShoppingItem,
  UnsafeViolation,
} from "./meal_types.ts";
export {
  mealDishesPayload,
  mealPreparationsPayload,
  mealSessionsPayload,
  mealShoppingPayload,
  outputContractLinesOf,
} from "./meal_payloads.ts";
export { isInPantry, normalizePantryTerm } from "./meal_pantry.ts";
export {
  addedCookDays,
  batchSessionBudget,
  dishBudgetFor,
  dishCapFor,
  MAX_FRIDGE_DAYS,
  usableCookDays,
} from "./meal_budget.ts";
export type { MergedEater } from "./meal_budget.ts";
export {
  gramsRawForIngredient,
  preparationReadyGrams,
  preparationReadyKcal,
  refForIngredient,
  regramMeal,
} from "./meal_grams.ts";
export { boxScanSurface, scanRegimeSources } from "./meal_regime_scan.ts";
export type { RegimeScanSource } from "./meal_regime_scan.ts";
export {
  cellChecklistLines,
  emptySlotsIn,
  emptySlotsLine,
} from "./meal_slots.ts";
export {
  MEAL_PROMPT_SECTION_KEYS,
  MEAL_PROMPT_SECTIONS,
  MEAL_PROMPT_VERSION,
  MEAL_SYSTEM_PROMPT,
  MEAL_TOKEN_FIELDS,
  MEAL_TRANSLATABLE_FIELDS,
  SOLO_BOX_BLOCK,
} from "./meal_prompt_text.ts";
export type {
  MealPromptSection,
  MealPromptSectionKey,
} from "./meal_prompt_text.ts";
export { buildMealPrompt } from "./meal_prompt.ts";
export {
  decodeModelJson,
  localizeOutputLockBites,
  parseGeneratedMeal,
} from "./meal_parse.ts";
