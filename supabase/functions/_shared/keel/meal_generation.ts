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

import {
  applyKeelOutputLocks,
} from "../../sophia-brain/skills/_shared/keel_output_locks.ts";
import type { CoachDoctrine } from "./doctrine.ts";
// ⟳ 2026-09-13 · LOT 1 — LE RECENSEMENT DES SURFACES, PARTAGÉ AVEC LE HANDLER.
import {
  collectOutputSurfaces,
  type OutputSurface,
  outputSurfacesText,
} from "./output_surfaces.ts";
import {
  type SafetyConstraintTable,
  safetyConstraintsPromptBlock,
  type StudentSafetyConstraint,
} from "./safety_constraints.ts";
import { findNumericTarget } from "./week_plan_generation.ts";
import { appendContentLanguageBlock } from "./locale.ts";
// ── `D3′` (2026-08-22) — LE BLOC D'ARBITRAGE SORT D'ICI ────────────────────
// Il vivait en constante locale de ce fichier, qui porte +2 872 lignes non
// commitées de six sessions: sa garde n'était donc exécutable par personne
// d'autre. Il est désormais dans un module NEUF, COMMITÉ, qui n'importe RIEN
// (règle §⑨ n° 92), avec 15 épreuves et 9 mutations attrapées sur 9.
//
// ⛔ LA VARIANTE SOLO EST GELÉE OCTET POUR OCTET, et un test le tient. Le
// périmètre de `D3′` est le FOYER: c'est là que le bloc était enterré sous 2 à
// 9 blocs, et là que son rang 1 pointait vers un régime qui n'y est pas.
import { buildPrecedenceBlock } from "./precedence_tail.ts";
// FF-061 — la ceinture de ton, jusqu'ici appliquée au seul message du soir et à
// la relance. Le `why` d'un plat vient du même modèle et s'affiche à l'élève.
import { findGuiltTripping } from "./reengagement.ts";
import { mealBodyBlocks, type MealBodyContext } from "./meal_body.ts";
import { type WeeklyAxis, WEEKLY_AXIS_LABELS_EN } from "./weekly_flow.ts";
import {
  detectProteinAnchor,
  isMainMealSlot,
  PROTEIN_ANCHOR_PROMPT_LINE,
} from "./protein_anchor.ts";
import {
  COMPOSITION_STATES,
  COMPOSITION_UNITS,
  type CompositionIndex,
  type CompositionState,
  type CompositionUnit,
  millilitresOfSlug,
  resolveCompositionLine,
} from "./food_composition.ts";
// ⟳ LOT C (2026-09-11) — LE CONTRAT DE COMPOSITION: le catalogue montré au
// modèle et la lecture de l'identifiant qu'il rend. Voir `composition_contract.ts`.
import {
  type ComposablePredicate,
  readRefSlug,
  type RefOutcome,
  type RefReading,
} from "./composition_contract.ts";
// ⟳ LOT C — LA PORTE DE COMPOSITION DU LOT A, ARMÉE PAR DÉFAUT. Voir
// `composable` sur `parseGeneratedMeal`: elle est arrivée pendant l'écriture de
// ce lot, et un défaut OUVERT n'avait plus de raison d'être.
import { isComposable } from "./food_reference_manifest.ts";
import {
  daysOutOfBatchReach,
  sessionCeilingMinutes,
  singleSessionCookDay,
} from "./plan_feasibility.ts";
import {
  cookedWindowVerdict,
  freezerClaimedWithoutOne,
  FREEZER_WINDOW_DAYS,
  type KeptWhere,
  keptWindowDays,
  emptyFridgeWindowCounts,
  type FridgeWindowCounts,
} from "./fridge_window.ts";
import { type RawReachCadence, rawReachLines } from "./raw_keeping.ts";
import { fixedIntakePromptLines, slotIsTaken } from "./fixed_intakes.ts";
import type { FixedIntake } from "./fixed_intakes.ts";
import {
  hasFreezerDeclared,
  kitchenEquipmentPromptLines,
} from "./kitchen_equipment.ts";
import type { KitchenTool } from "./kitchen_equipment.ts";
import {
  dayHasProperty,
  dayPropertyPromptLines,
  daysWithProperty,
} from "./day_properties.ts";
import type { DayPropertyEntry } from "./day_properties.ts";
// L4/D6 — LA FORME DE CUISINE. Importée, jamais recopiée: la liste des barreaux
// et les LIGNES DE CONSIGNE qui les servent vivent au même endroit
// (`COOKING_SHAPE_LINES`), et c'est là que se lit « combien de plats ce barreau
// réclame ». Aucun cycle: `household_portions.ts` n'importe pas ce fichier.
import {
  asksForASecondDish,
  // LE MÊME DÉTECTEUR QUE LES CONSIGNES DE PART, APPELÉ — pas recopié. Deux
  // définitions de « cette phrase porte-t-elle un poids » divergeraient au
  // premier ajustement, et c'est celle qu'on relit le moins qui garderait
  // l'ancienne.
  portionCarriesAQuantity,
} from "./household_portions.ts";
// ══ LA CEINTURE DE RÉGIME, IMPORTÉE ET JAMAIS RÉÉCRITE ═══════════════════════
//
// ⛔ AUCUN MATCHER MAISON ICI. `scanDietaryRegime` porte la liste FERMÉE des
// formes de surface (EN + FR), distingue la PROSE des TERMES, et désamorce les
// analogues végétaux (`isPlantAnalogue`) — « laitue » ≠ « lait », douze faux
// positifs sur douze mesurés dans ce dépôt. Une seconde lecture écrite ici
// divergerait de la première au premier aliment ajouté.
//
// Aucun cycle: `dietary_regime.ts` n'importe que `tokens.ts` et
// `forbidden_matcher.ts`.
import {
  type DietaryRegime,
} from "./dietary_regime.ts";
// ⛔ LE VOCABULAIRE FERMÉ DES GROUPES, ET SON PARSEUR — jamais une seconde
// liste. Écrire ici un `new Set(FOOD_GROUP_REFS)` aurait perdu les alias
// d'entrée que `parseFoodGroupRef` porte (`whole_grains` → `whole_grain`), et
// aurait fait diverger deux lectures du même vocabulaire au premier ajout.
import { type FoodGroupRef, parseFoodGroupRef, PROTEIN_SOURCES } from "./tokens.ts";
// ⟳ LOT `L17-0` — LA CLÉ DU GROUPE SUR LA LIGNE ÉCRITE, ET SON COMPTEUR.
// Le nom de la clé n'a qu'UN site d'écriture (`INGREDIENT_GROUP_KEY`), lu par
// l'écrivain ET par le compteur: c'est ce qui rend impossible de compter une
// clé que personne n'écrit.
// ⟳ 2026-09-13 — `reconcileIngredientGroup`: le `ref` prime sur le `group`
// déclaré quand il se résout, et le désaccord se COMPTE.
import {
  closedGroupOrNull,
  reconcileIngredientGroup,
} from "./food_group_write.ts";
import {
  allergenGroupViolations,
  groupedIngredientCount,
} from "./allergen_food_groups.ts";
import {
  readQuantityFromProse,
  weighableQuantityOf,
} from "./quantity_from_prose.ts";
// ⟳ 2026-09-12 · ÉTAPE C3 — L'IDENTITÉ ALIMENTAIRE D'UNE LIGNE DE COURSES.
// ⛔ Le parseur décidait de garder ou de jeter une ligne en comparant des
// LIBELLÉS; il partage désormais son corps avec la fusion (`retry_merge.ts`),
// et les deux comparent des identités. Voir `shopping_identity.ts`.
import {
  claimedIdentities,
  foodIdentityOf,
  freshnessGroupOf,
  isNonPurchasableIdentity,
  NON_PURCHASABLE_SLUGS,
  sortShoppingLines,
} from "./shopping_identity.ts";
// ⟳ LOT `L26-0` — L'ARÊTE QUI MANQUAIT À `mouths_double`. Le compteur CONSTATE
// depuis toujours: quatorze bouches servies deux fois sur les dix plans du
// 2026-08-22, et à chaque fois la même — une mineure. La consigne l'interdit
// DÉJÀ, mot pour mot, et elle a été servie: c'est une arête qu'il fallait, pas
// une phrase. Le module est PUR et éprouvé à part, pour la raison de tous les
// autres de cette campagne: c'est ce qui le rend mutable sur un banc.
import { keepOneBoxPerMouth } from "./box_one_per_mouth.ts";
// ⟳ LOTS `L6′-a` et `L6′-b` — LE DÉNOMINATEUR DES CONTENANTS, ET LE NOM DU
// ZÉRO. `L6′-a`: `expected` se calculait sur le foyer ENTIER même sur un plat
// dédié à UNE bouche — 72 attendus pour 38 rendus sur `3c781a71`, alors que la
// partition réelle en demande 36. `L6′-b`: `boxes: 0` porte aujourd'hui DEUX
// situations opposées (rien n'était dû / tout était dû et rien n'est venu) sous
// le même chiffre. Module PUR et éprouvé à part, comme les quatre autres de
// cette campagne.
import {
  boxDeliveryState,
  type ExpectedDish,
  mouthsFedByDish,
} from "./box_expected.ts";

// ---------------------------------------------------------------------------
// Entrées / sorties
// ---------------------------------------------------------------------------

// ⛔ LA CEINTURE DES EXCLUSIONS — lot du 2026-09-01. Une exclusion attribuée à
// une bouche était rangée, comptée, et INERTE: le plan servait quand même.
import {
  dishBitesExclusion,
} from "./food_exclusion_belt.ts";
import type { ForbiddenTerm } from "./forbidden_matcher.ts";

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
// Restent ici : l'historique des versions, `MEAL_PROMPT_VERSION`,
// `SOLO_BOX_BLOCK`, l'arbitrage, les sections du prompt système, les champs
// traduisibles, `buildMealPrompt`, les lecteurs du parseur,
// `localizeOutputLockBites`, `decodeModelJson` et `parseGeneratedMeal` (passe
// 2 du découpage). Tout est ré-exporté ici : aucun appelant ne change
// d'import. Les tests qui lisent le TEXTE de ce fichier lisent la famille
// entière (`scripts/source-families.json`). Aucun des huit modules n'importe
// ce fichier.
import {
  type AwayDay,
  DAY_TOKENS,
  dayProse,
  DEFAULT_EATING_RHYTHM,
  type EatingOccasionSlot,
  isAway,
  MEAL_SLOTS,
  type MealMode,
  type MealScope,
  type MealSlot,
  OCCASION_PROSE,
} from "./meal_vocabulary.ts";
import {
  BOX_MAX_GRAMS,
  BOX_SUM_TOLERANCE_RATIO,
  type BoxHeldOff,
  type BoxItem,
  type CookingSession,
  DISH_NAME_MAX_CHARS,
  type DishIngredient,
  type DishSameDay,
  type GeneratedDish,
  type GeneratedMeal,
  type MealBox,
  type MealPreparation,
  type PantryItem,
  SAME_DAY_KINDS,
  SAME_DAY_MAX_MINUTES,
  type SameDayKind,
  SHOPPING_AISLES,
  type ShoppingAisle,
  type ShoppingItem,
  UNQUANTIFIED_TERMS_NAMED,
  type UnsafeViolation,
} from "./meal_types.ts";
import { isInPantry, normalizePantryTerm } from "./meal_pantry.ts";
import {
  addedCookDays,
  batchSessionBudget,
  dishBudgetFor,
  dishCapFor,
  MAX_FRIDGE_DAYS,
  type MergedEater,
  usableCookDays,
} from "./meal_budget.ts";
import {
  gramsRawForIngredient,
  preparationReadyGrams,
  refForIngredient,
} from "./meal_grams.ts";
import {
  boxScanSurface,
  type MealRegimeBite,
  scanMealForRegime,
  scanRegimeSources,
} from "./meal_regime_scan.ts";
import {
  cellChecklistLines,
  emptySlotsIn,
  emptySlotsLine,
} from "./meal_slots.ts";

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

/**
 * ── POURQUOI CETTE VERSION BOUGE (FF-030, volet élève) ────────────────────
 * Elle est écrite sur chaque ligne `student_generated_meals.generated_from`, et
 * c'est le seul moyen de dire d'un plan s'il a été composé AVANT ou APRÈS que
 * le modèle connaisse les contraintes dures et le corps de l'élève. Sans
 * bascule, les deux populations se mélangent dans la même colonne et la mesure
 * du §10 de la fiche (« la part de `empty_meal` médicaux a-t-elle baissé ? »)
 * devient impossible à faire après coup.
 *
 * ── POURQUOI ELLE BOUGE ENCORE (FF-037) ──────────────────────────────────
 * La consigne gagne une section: chaque repas principal est bâti autour d'un
 * aliment protéique. Le §10 de la fiche compare la part de plats principaux
 * porteurs d'une ancre AVANT et APRÈS — et cette comparaison n'est faisable que
 * si la colonne sait séparer les deux populations. Bumper est donc la moitié
 * mesurable du lot, pas une formalité.
 *
 * ── ET ENCORE (FF-038, étage B) ──────────────────────────────────────────
 * Le contrat de sortie gagne `amount` / `unit` / `state` sur chaque
 * ingrédient. Le §10 de FF-038 demande de surveiller `rejected_numeric` après
 * ce bump — un contrat qui gagne trois champs NUMÉRIQUES est exactement le
 * genre de changement qui pousse un modèle à écrire des chiffres ailleurs — et
 * la part d'ingrédients qui arrivent sans quantité structurée. Ni l'une ni
 * l'autre n'est lisible si les deux populations se mélangent dans la colonne.
 */
// ── UN SEUL BUMP POUR FF-051 ET FF-052 ────────────────────────────────────
// Les apports fixes et les propriétés de jour touchent tous deux la consigne.
// Deux bumps successifs invalideraient deux fois le cache et rendraient
// illisible toute comparaison avant/après entre les deux lots — c'est pour ça
// que les propriétés de jour ont été faites EN DERNIER.
//
// ── v8 (2026-08-11) — `health` A UNE DIRECTION À LUI ──────────────────────
// Le brief de portions du foyer appartient à cette lignée (`household_portions
// .ts` écrit en anglais POUR ce prompt). `SERVING_DIRECTION.health` rendait la
// chaîne de `maintenance`: la consigne servie change, donc la version bouge —
// sans quoi le cache continuerait de rendre l'ancienne assiette.
//
// ⚠️ CETTE VERSION NE COUVRE QUE LE TRONC PARTAGÉ. Depuis le 2026-08-12, la
// lane FOYER a son propre numéro — `HOUSEHOLD_PROMPT_VERSION`, dans
// `household_meal_generation.ts` — et la clé écrite en base est
// `meal.en.v8…+household.v2_presence`. Ce qui ne touche QUE le foyer (la liste
// d'ids, l'envie, les règles de maison, la présence) se bumpe LÀ-BAS. Ce qui
// touche les deux lanes (brief de portions, propriétés de jour, apports fixes)
// se bumpe ICI. L2 a dû poser cet axe parce que greffer la présence avait
// changé le prompt du foyer SANS que rien ne bouge: deux plans stampés pareil
// portaient des consignes différentes, et rien n'échouait.
//
// ── v9 (2026-08-12) — LE CONTRAT DE COMPOSITION CESSE D'ÊTRE « UN SEUL PLAT »
//
// C'est le bump que v8 annonçait comme dû, et il est arrivé par L4 (le moteur
// de fusion, D6). Jusqu'ici `buildPortionBrief` disait à TOUTE composition de
// foyer, sans condition: « Cook ONE set of preparations for everyone. Do NOT
// propose separate dishes. » L'échelle de fusion a besoin de deux barreaux de
// plus — deux plats dans UNE session, puis deux sessions — donc cette ligne
// devient une VARIABLE (`CookingShape`), et c'est un changement de contrat, pas
// de formulation.
//
// ⚠️ POURQUOI ICI ET PAS SUR L'AXE FOYER. `buildPortionBrief` vit dans
// `household_portions.ts`, que ce fichier-ci définit comme du TRONC (« brief de
// portions, propriétés de jour, apports fixes »). La lane INDIVIDUELLE ne
// l'appelle pas et son prompt ne bouge pas d'un octet — mais elle est stampée
// par cette constante, et c'est le prix nommé d'avance: mieux vaut une
// population individuelle qui change de numéro sans changer de consigne qu'un
// foyer où deux consignes portent le même numéro. C'est exactement ce que L2 a
// mesuré et ce que le second axe existe pour éviter.
//
// UNE COMPOSITION ORDINAIRE REND LA MÊME CONSIGNE, À L'OCTET PRÈS: `one_dish`
// rend la ligne d'avant, mot pour mot, et un test le tient.
//
// ── CE QUI N'A PAS BUMPÉ ICI, ET POURQUOI (2026-08-12, aval de L4) ────────
// Le budget de plats d'une FUSION compte désormais la bouche reprise
// (`dishBudgetFor`), et le parseur accepte la préparation d'UNE portion que les
// barreaux ② et ③ demandent. Le code changé vit dans ce fichier — donc dans le
// tronc — et pourtant la version du tronc NE BOUGE PAS. La règle n'est pas « où
// vit le code », c'est « quelle population voit une consigne différente »:
//
//   · `merge: null` (lane individuelle, ET composition de foyer ordinaire) rend
//     EXACTEMENT le plafond d'avant, la même phrase, le même budget de
//     sessions. Deux tests le tiennent, dont un qui compare le nombre annoncé
//     au nombre appliqué.
//   · seule une FUSION voit la ligne « at most N dishes » changer de nombre, et
//     une fusion n'existe que sur la lane foyer.
//
// Le bump est donc allé sur `HOUSEHOLD_PROMPT_VERSION` (v3 → v4), qui a
// exactement la portée du changement. Bumper ici aurait re-stampé toute la
// population individuelle pour un changement qu'elle ne voit jamais — c'est
// précisément ce que le second axe existe pour éviter, et le prix que v9 a payé
// une fois est un prix qu'on ne repaie pas sans raison.
//
// ── C8 ③ · L'ORDRE DE SACRIFICE A CHANGÉ LA LANE INDIVIDUELLE, ET LA
//           VERSION NE BOUGE TOUJOURS PAS — CE N'EST PAS LE MÊME CAS QUE v4
//
// ⚠️ LE FAIT, MESURÉ LE 2026-08-12 sur le MÊME flot brut, `merge: null`,
// plafond 9:
//   · avant C7 ②, le parseur jetait `dishes[10,12,14,16]` et rendait
//     `empty_slots: sat/dinner, sun/breakfast, sun/lunch, sun/dinner`;
//   · depuis C7 ②, il les GARDE et évince quatre seconds plats de cases déjà
//     servies.
// Hors fusion, `dedicatedCells` est vide — donc aucun rang 1 — mais le rang 0
// (« premier plat d'une case ») existe toujours, et c'est lui qui fait qu'un
// second plat cède la place à un premier. Le changement est FAVORABLE: il
// remplit des cases au lieu de les laisser vides.
//
// ⚠️ ET POURTANT AUCUNE VERSION NE BOUGE, parce que ce cas n'est PAS celui de
// v4. En v4, un NOMBRE ÉCRIT DANS LA CONSIGNE changeait (« at most N dishes »)
// pour une population donnée: le modèle lisait autre chose, donc le cache
// devait tomber. Ici la consigne est byte-identique POUR TOUT LE MONDE — la
// lane individuelle, la composition de foyer ordinaire, la fusion — et c'est le
// CONTRAT DE SORTIE du parseur qui change. Une version de prompt qui bougerait
// sur un prompt identique invaliderait le cache d'une population entière sans
// qu'un seul octet servi ait changé, et le numéro cesserait de vouloir dire ce
// qu'il dit.
//
// ⚠️ LA CONTREPARTIE EST NOMMÉE, ET ELLE EST PAYÉE AILLEURS: deux plans
// stampés `v9` peuvent avoir été écrêtés par deux ordres différents. Le
// précédent invoqué est celui de L3, mot pour mot — « une seconde raison qu'une
// ligne n'apparaisse pas, relisible sur `generated_from`, pas sur la version »:
// chaque éviction est NOMMÉE dans les `issues` archivées (« surplus dish "…"
// (jour/moment) was dropped instead »), donc un plan dit lui-même quel ordre
// l'a écrêté. C'est la lecture par plan, pas par colonne — et c'est ce que ce
// chantier choisit à chaque fois que le prompt n'a pas bougé.
//
// ── v10 (2026-08-17) — LE COMMENTAIRE DU JOUR J (LOT 2 / P2) ──────────────
//
// C'est le tronc, et c'est bien le bon axe: la consigne `WHAT TODAY ACTUALLY
// TAKES` et le champ `same_day` du schéma de sortie sont servis à TOUTES les
// populations — lane individuelle, foyer ordinaire, fusion, secondaire. Il n'y a
// pas ici de « population neuve » étroite comme sur l'axe foyer: tout le monde
// voit une consigne différente, donc le cache de tout le monde doit tomber.
//
// ⚠️ `HOUSEHOLD_PROMPT_VERSION` NE BOUGE PAS, et le test le tient par égalité de
// chaîne: l'enveloppe foyer (`buildHouseholdPromptBlocks`, `buildPortionBrief`)
// ne gagne pas un octet dans ce lot — le champ demandé l'est par le schéma du
// tronc, et il est lu par le parseur partagé.
//
// ⚠️ CE BUMP PAIE AUSSI UN DÉFAUT MESURÉ QUI VOYAGEAIT DANS LE MÊME BLOC: la clé
// `"uses"` était déclarée DEUX FOIS dans `== OUTPUT JSON SCHEMA ==` (une fois
// avant `honours_belief_keys`, une fois après). Un objet JSON à clé répétée est
// légal et la seconde écrase la première — le modèle lisait donc un exemple
// contradictoire sur le champ qui porte toute la jointure des lots. Corrigé ici
// plutôt que dans un lot à part: le bloc change de toute façon, et un second
// bump pour une accolade serait un cache invalidé pour rien.
//
// ── v11 (2026-08-17) — LES QUANTITÉS DU JOUR, PESÉES OU DÉNOMBRÉES (LOT 4/P4)
//
// La décision produit renverse une orientation ancienne: les parts redeviennent
// PRÉCISES. « Prendre une poignée », « une grosse portion » ne veulent rien
// dire, et c'est le tronc qui porte la moitié qui concerne TOUT LE MONDE — ce
// qu'un plat ajoute au moment de manger s'écrit en grammes ou en unités
// dénombrables. Lane individuelle, foyer ordinaire, fusion, secondaire: les
// quatre populations voient la section `WHAT A DISH ADDS ON THE DAY`, donc le
// cache des quatre doit tomber. C'est le bon axe, sans discussion.
//
// ⚠️ `MEAL_TOKEN_FIELDS` GAGNE DEUX LIGNES DANS LE MÊME BUMP, et c'est le même
// prompt qui change: la liste est rendue dans le bloc de langue du message
// utilisateur, sur les DEUX lanes. Les identifiants de boîte y entrent parce
// qu'ils sont INVENTÉS par le modèle — piège `preparations[].id`, mot pour mot:
// en français il écrirait `boite_zoe`, cohérent avec lui-même, et l'identifiant
// traduit ne se rapprocherait plus de rien.
//
// ⚠️ ET LE PROTOCOLE DES BOÎTES, LUI, NE BOUGE PAS ICI. Le bloc qui RÉCLAME les
// boîtes vit dans l'enveloppe foyer (`HOUSEHOLD_PROMPT_VERSION`), parce que les
// ids de bouches n'existent que là et qu'une boîte par personne n'a de sujet
// qu'à partir de deux bouches. C'est exactement le partage de `for_member_id`:
// le CHAMP est dans le contrat du tronc et le parseur partagé le lit, la
// CONSIGNE est dans l'enveloppe qui connaît le roster. Servir à une personne
// seule un bloc qui nomme des bouches lui apprendrait qu'un marquage existe et
// l'inviterait à en inventer un — le raisonnement de `dishOwnerSchemaBlock`,
// deuxième fois — et alourdirait une lane dont on a mesuré le 2026-08-17
// qu'elle frôle déjà le mur de temps du worker.
//
// ── v12 (2026-08-18) — LE PLAT PORTE UN NOM, EN PLUS DE SON TITRE (L7 ③) ───
//
// La demande produit: des plats qui donnent envie, au lieu de « Chicken,
// courgette and pepper rice bowls ». La façon de la satisfaire qui CASSE le
// produit est de rendre `title` plus joli — ce champ est lu à voix haute à
// table, remplit les cases étroites de la grille, et est ce à quoi on
// reconnaît son plat au moment de le cuisiner. D'où DEUX champs, jamais un
// champ transformé: `name` (court, appétissant, facultatif au contrat) et
// `title` (descriptif, inchangé au caractère près).
//
// ⚠️ LE BON AXE EST LE TRONC, SANS DISCUSSION. La section
// `EVERY DISH HAS TWO LINES` et la clé `"name"` du schéma de sortie sont
// servies aux QUATRE populations — lane individuelle, foyer ordinaire, fusion,
// secondaire — parce qu'elles vivent dans `MEAL_SYSTEM_PROMPT`. Il n'existe
// donc AUCUNE population byte-identique sur cet axe, et c'est le cas de v10 et
// de v11 mot pour mot. `HOUSEHOLD_PROMPT_VERSION` bouge dans le même lot, pour
// l'autre moitié (équipement de cuisine, déjeuner dehors), qui ne concerne QUE
// le foyer: deux changements, deux portées, deux axes.
//
// ⚠️ `MEAL_TRANSLATABLE_FIELDS` GAGNE UNE LIGNE DANS LE MÊME BUMP, et c'est le
// même prompt qui change: la liste est rendue dans le bloc de langue du message
// utilisateur, sur les deux lanes. Un `name` anglais sous un `title` français
// serait la seule ligne visible de la grille dans la mauvaise langue.
//
// ⚠️ LA PROMESSE ET LA CLÉ SE TOUCHENT, ET C'EST LA MOITIÉ QUI COMPTE. La
// section qui ORDONNE le nom est collée juste au-dessus de
// `== OUTPUT JSON SCHEMA ==`, et `"name"` est la PREMIÈRE clé du plat. C'est la
// leçon mesurée du LOT 3C: une promesse dans un souffle et une clé dans un
// autre rendent zéro déclaration sur 291 plats. Elle porte aussi le NOMBRE
// attendu (« as many names as you have dishes. Count them ») et NOMME
// l'échappatoire que le modèle prendrait à la place (enjoliver le titre) — les
// deux leviers que 3C a mesurés, l'un après l'autre.
// ── v13 (2026-08-18) — CE QU'IL PEUT VRAIMENT FAIRE, ET CE QU'IL VEUT ──────
//
// QA 01-injection, lane solo. Quatre changements du MESSAGE UTILISATEUR, tous
// mesurés sur le run réel `798c5cd6-acbf-43e3-8dcc-97128d3edd78` avant d'être
// écrits — le prompt archivé de ce run est la preuve de chaque absence:
//
//   ① LES MOYENS DE CUISSON (`kitchenEquipmentPromptLines`). L'élève avait
//     coché « plaque, micro-ondes, blender »; le plan rendu ouvre par « Heat
//     the oven » et sert des « roast potatoes ». Le champ était collecté,
//     stocké et lu par la lane foyer, jamais dit à cette lane-ci.
//   ② LE CRAN D'ACTIVITÉ (`meal_body.ts`). Collecté par quatre tuiles qui
//     PROMETTENT de dimensionner les portions, il n'entrait que dans
//     l'enveloppe déterministe, APRÈS l'appel modèle.
//   ③ L'ASPIRATION (`student_goals.aspiration`). Écrite par `/app/plan`,
//     injectée par la lane semaine, pas même SÉLECTIONNÉE ici.
//   ④ L'EN-TÊTE DU GARDE-MANGER. `-- WHAT THEY ALREADY HAVE --` était écrit
//     DEUX FOIS dans le même message (apports fixes / placard), avec deux
//     consignes opposées. Le placard devient `WHAT IS ALREADY IN THEIR
//     CUPBOARDS`.
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE, axe par axe: ① et ② ne
// touchent que la LANE SOLO (le foyer ne passe pas `kitchenEquipment`, et son
// bloc de corps est `mealBodyBlocksForMember`, inchangé); ③ n'existe que sur
// la lane solo; ④ traverse les deux, et c'est voulu — la collision d'en-tête
// est la même des deux côtés. Un compte qui n'a répondu à AUCUNE des trois
// questions reçoit un message byte-identique à v12.
// ═══════════════════════════════════════════════════════════════════════════
// v14 — LA HIÉRARCHIE EST DITE, ET ELLE EST DITE EN DERNIER (agent 2A, ②).
// ═══════════════════════════════════════════════════════════════════════════
// Trois axes, et chacun répond à une question mesurée sur cinq scénarios réels
// (`scratchpad/qa-generation/02-ponderation-solo/`):
//
//   ① L'ORDRE. Ce prompt établissait sa hiérarchie UNIQUEMENT par la position:
//     les contraintes dures en tête, la saison plus bas, la commande en
//     dernier. Aucune phrase ne dit ce qui prime sur quoi. Et la seule phrase
//     du message qui dise « X gagne » est celle de la DOCTRINE (« Where this
//     block and your own knowledge disagree, this block wins ») — c'est-à-dire
//     que le seul rang ÉCRIT du prompt donne le sommet au coach, pas à
//     l'allergie. Le bloc `-- WHEN TWO LINES ABOVE WANT DIFFERENT THINGS --`
//     l'écrit, une fois, et il est posé dans le CRAN DE RÉCENCE (fin de
//     `== WHAT TO COOK ==`) parce que ce dépôt a mesuré qu'un modèle lit la
//     consigne la plus proche de la fin comme la plus contraignante.
//
//   ② LA FORMULATION DE L'ENVIE. `what they feel like eating THIS TIME` était
//     la SEULE ligne de désir du message sans un mot de rang — l'aspiration
//     porte « never at the cost of a hard constraint », la saison porte « It
//     ranks your choices; it does not veto anything », l'envie ne portait
//     rien. Et elle est servie à trois lignes de la fin, c'est-à-dire à la
//     place la plus contraignante du message. Mesuré (run
//     `2a000000-3100-…`): une envie qui nomme l'allergène médical de l'élève
//     ressort 21 fois dans la sortie.
//
//   ③ LA SÉVÉRITÉ EST LUE. `safetyConstraintsPromptBlock` imprime
//     `severity=medical` / `strict` / `preference` sur chaque ligne, sous
//     « These are not preferences », et AUCUNE consigne ne lit ce mot: un
//     dégoût déclaré reçoit mot pour mot l'interdiction d'une anaphylaxie
//     (R15 de la checklist ①). Le déséquilibre est double, parce que la
//     ceinture de sortie, elle, ne s'arme QUE sur `medical`
//     (`findMedicalConstraintViolations`): le prompt traite les trois pareil
//     et le code ne traite comme dur que le premier.
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE, axe par axe: ① touche TOUT
// LE MONDE (c'est le but — un ordre de priorité ne peut pas être conditionnel);
// ② ne touche que les compositions où une envie a été TAPÉE; ③ ne touche que
// les élèves qui ont au moins une contrainte déclarée. Un compte sans
// contrainte et sans envie ne voit donc QUE le bloc ①.
//
// ⚠️ TRONC PARTAGÉ AVEC LA LANE FOYER. Les trois axes traversent
// `buildMealPrompt`, donc `generate-household-meal-v1` les reçoit aussi. C'est
// VOULU pour ① et ③ (la question « qu'est-ce qui prime » ne change pas de
// réponse quand la table grandit, et la sévérité y est même plus utile:
// l'étape ① a mesuré un foyer où l'allergène d'une bouche est servi à elle).
// ⚠️ POUR ②, CETTE NOTE DISAIT « la lane foyer n'appelle jamais `preferences`
// — la ligne n'existe pas dans son message, et l'axe y est inerte ». C'était
// vrai le 2026-08-18 et FAUX depuis le 2026-08-19 (lot D): le champ d'envie de
// `MealBuilder` est rendu SANS garde de lane, et il partait nulle part sur la
// branche foyer. Il traverse maintenant (`api/household.ts` →
// `body.preferences` → ce paramètre), donc l'axe ② y est ARMÉ — et il fallait
// qu'il le soit AVANT, pas après: c'est une table entière qui lit la sortie.
// La population concernée est celle qui a tapé quelque chose dans ce champ;
// sans envie, `preferences` vaut `null` et aucune ligne n'est écrite.
// Versionné sur l'axe foyer (`HOUSEHOLD_PROMPT_VERSION` v18), pas ici: pas un
// octet de ce tronc ne change.
// ── v16 (2026-08-19) · LE GROUPE ALIMENTAIRE EST DÉCLARÉ, PLUS DEVINÉ ──────
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE: celle qui a un RÉGIME
// déclaré, sur les deux lanes. Le bloc voyage avec `dietaryRegimePromptLine`
// (`dietary_regime.ts`) et pas dans `MEAL_SYSTEM_PROMPT`, donc une composition
// sans régime rend un prompt BYTE-IDENTIQUE à celui de v15 — et deux tests le
// tiennent (`dietary_regime_solo_lane_test.ts :: « sans régime déclaré, le
// prompt est INCHANGÉ »`, et le test de v16 qui compare les deux messages).
//
// ⚠️ LE BUMP VAUT QUAND MÊME, et c'est la règle déjà écrite pour `v3` et `v5`
// de l'axe foyer: c'est la PRÉSENCE du bloc qui distingue deux populations
// dans la colonne, et une version qui ne bouge que « quand ça se voit » ne se
// relit pas. Le coût assumé est que la population sans régime change de numéro
// sans changer de consigne.
//
// CE QUE LE BLOC AJOUTE: une clé `"group"` sur chaque ingrédient, prise dans
// les trente `FOOD_GROUP_REFS` — c'est-à-dire la correction honnête du
// compteur de régime. Il restait faux sur une classe résiduelle nommée, les
// homonymes (« butter beans » compté sur `butter`) et les marqueurs végétaux
// dans un titre (« Vegan sausage » compté sur `sausage`), et aucun
// appariement plus malin ne l'aurait réparée sans rejouer « laitue ≠ lait ».
// ── v17 (2026-08-19) · LA BOÎTE APPARTIENT AU REPAS ───────────────────────
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE: TOUT LE MONDE, et sur une
// seule ligne — celle des jetons (`MEAL_TOKEN_FIELDS`, imprimée dans le bloc de
// langue). Deux entrées en sortent (`preparations[].boxes[].id`,
// `dishes[].uses[].box_id`) et une seule y entre (`dishes[].box.id`), parce que
// la jointure a disparu: le repas PORTE sa boîte, plus personne ne la cite.
//
// ⚠️ LE BUMP VAUT MÊME POUR LA LANE INDIVIDUELLE, qui ne demande aucune boîte:
// elle voit quand même une ligne de jetons différente, donc son prompt n'est
// pas byte-identique. C'est la règle déjà écrite pour v3, v5 et v16 — c'est la
// PRÉSENCE du bloc qui distingue deux populations dans la colonne.
//
// ⚠️ `HOUSEHOLD_PROMPT_VERSION` BOUGE AUSSI, ET CE N'EST PAS UN DOUBLON. Le
// SCHÉMA de la boîte et l'ORDRE de peser vivent tous deux dans l'enveloppe
// foyer, et leur population est celle des foyers d'au moins deux bouches. Deux
// changements, deux portées, deux axes: la règle « quelle population voit une
// consigne différente », appliquée deux fois dans le même lot. Précédent exact:
// v14 (2026-08-17).
//
// ── v18 (2026-08-20) · UN CONTENANT PAR GROUPE DE MANGEURS ────────────────
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE: TOUT LE MONDE, et sur la même
// ligne de jetons — `dishes[].box.id` devient `dishes[].boxes[].id`, parce que
// le repas porte désormais N contenants et non plus un. Même règle que v17, à
// une lettre près, et le bump vaut pour la lane individuelle qui ne demande
// aucune boîte: elle voit quand même une ligne de jetons différente.
//
// ── v19 (2026-08-24) · UN TERME NOMME UN SEUL ALIMENT ─────────────────────
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE: TOUT LE MONDE. La ligne
// s'ajoute au bloc `== SAY THE SAME QUANTITY TWICE ==`, que les deux lanes
// assemblent — elle interdit l'alternative dans `term` (« green or brown
// lentils », « butter or olive oil »).
//
// ⚠️ POURQUOI CE BUMP N'EST PAS COSMÉTIQUE. Mesuré le 2026-08-23: une
// alternative dans `term` ne résout pas, donc son plat ne porte aucun chiffre,
// et sur `plan-F3` c'était la SEULE protéine des trois jours — neuf
// journées-bouche sans énergie. Le résolveur a appris à lire les alternatives
// SANS CONSÉQUENCE le même jour (`resolveAlternative`), mais il refuse toujours
// les vraies; la consigne tarit la source, le résolveur rattrape le reste.
//
// ⛔ LE MILLÉSIME EST CE QUI SÉPARE LES DEUX POPULATIONS dans la colonne
// `generated_from->>'prompt_version'`. Sans lui, un plan écrit hier et un plan
// écrit demain se compteraient dans le même dénominateur, et aucun seuil ne
// serait relisible. C'est la règle déjà appliquée à v3, v5, v16, v17 et v18.
//
// ── v20 (2026-09-01) · LA PART CONGELÉE A UNE CLÉ ─────────────────────────
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE: TOUT LE MONDE. Le schéma de
// sortie gagne `dishes[].uses[].kept`, et le bloc
// `== NOTHING SITS IN THE FRIDGE FOR A WEEK ==` gagne le paragraphe qui dit
// PAR QUEL CHAMP on déclare la troisième sortie. Les deux vivent dans le tronc,
// donc les deux lanes les voient.
//
// ⚠️ POURQUOI CE BUMP N'EST PAS COSMÉTIQUE. Mesuré le 2026-09-01 sur le décor
// « une session de cuisine, un congélateur, sept jours »: 8 plats sur 21 jetés
// par la fenêtre du cuit, quatre journées réduites à leur petit-déjeuner. Le
// modèle avait pourtant écrit le congélateur TROIS fois — dans la méthode du
// plat, dans celle de la casserole, dans le déroulé de la session — parce que
// la consigne le lui demandait déjà. C'était de la prose; rien ne la lisait.
// La consigne d'avant promettait une sortie que le parseur ne pouvait pas
// entendre, ce qui est la définition d'une promesse sans clé.
//
// ⚠️ CE QUE LE BUMP NE FAIT PAS: relâcher la garde. `kept: "freezer"` n'ouvre
// la fenêtre que si le foyer a DÉCLARÉ un congélateur, et un modèle qui
// n'écrit jamais le champ produit exactement le plan de v19, au plat près.
//
// ── v21 (2026-09-01) · LES JOURS HORS DE PORTÉE SONT NOMMÉS ───────────────
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE: celle dont la fenêtre porte
// des journées qu'aucun lot n'atteint — c'est-à-dire, sans congélateur, tout
// plan plus long que trois jours par jour de cuisine. Deux lignes s'ajoutent
// sous les jours de cuisine (`canCookLines`, dans le tronc):
//   ① les journées hors de portée, NOMMÉES, avec leur sortie (cuisiner sur le
//      moment) et l'avertissement que le plat de lot y sera jeté;
//   ② la permission BORNÉE de faire déborder la session, quand elle est seule.
// Et le bloc statique du temps gagne le cas où « cuisiner moins » n'existe pas.
//
// ⚠️ POURQUOI CE BUMP N'EST PAS COSMÉTIQUE. La règle ① existait déjà, en
// général, dans `== NOTHING IS EATEN BEFORE IT IS COOKED ==` — et elle ne
// mordait pas: mesuré le 2026-09-01, le modèle a écrit huit plats de lot sur
// des journées hors de portée, tous jetés par le parseur. C'est la leçon
// d'`addedCookDays`: une règle générale ne se compare pas, un jour NOMMÉ si.
//
// ⚠️ ET ② RENVERSE UNE CONSIGNE. Jusqu'ici les minutes étaient un plafond sec
// (« cook LESS and put the rest on another cooking day »), ce qui, sur un seul
// jour de cuisine, faisait sous-nourrir la semaine — le « rest » n'avait nulle
// part où aller. La permission est bornée par `SESSION_OVERRUN_FACTOR` et
// conditionnelle: elle ne sort QUE là où l'autre sortie n'existe pas.
//
// ⛔ UN PLAN SANS TENSION REND v20 AU CARACTÈRE PRÈS. Aucune journée hors de
// portée ⇒ aucune des deux lignes, et un test le tient.
// ══════════════════════════════════════════════════════════════════════════
// v21 → v22 — L'OPTION « TOUT DANS UNE SESSION DE CUISINE » (2026-09-01)
// ══════════════════════════════════════════════════════════════════════════
//
// LA POPULATION QUI VOIT UNE CONSIGNE DIFFÉRENTE: celle qui a COCHÉ l'option,
// et elle seule. Sans la case, le prompt est byte-identique à v21 — un test le
// tient, et c'est ce qui rend les deux populations comparables dans
// `generated_from->>'prompt_version'`.
//
// ⚠️ CE N'EST PAS « UN JOUR DE CUISINE DE PLUS OU DE MOINS ». Trois choses
// changent ensemble, et aucune ne se déduit des deux autres:
//   ① les jours de cuisine sont RAMENÉS À UN — le premier coché que la fenêtre
//      contient —, et la consigne le NOMME au lieu de laisser le modèle
//      répartir (« put every cooking session on those days » en autorisait
//      trois);
//   ② la conservation devient EXPLICITE: tout ce qui ne se mange pas dans les
//      `MAX_FRIDGE_DAYS` jours doit porter `kept: "freezer"` sur son lien —
//      la clé existe depuis v20, mais rien ne la RÉCLAMAIT;
//   ③ la session a le droit de déborder (`sessionCeilingMinutes`), parce
//      qu'elle porte seule la semaine PAR CONSTRUCTION.
//
// ⛔ ET L'OPTION NE PART QU'AVEC UN CONGÉLATEUR DÉCLARÉ. La porte est chez
// l'appelant (`hasFreezerDeclared`), pas ici: ce module reçoit un booléen déjà
// tranché. Sans congélateur, ② est une instruction que la garde d'aval
// (`freezerClaimedWithoutOne`) refuserait lien par lien — on aurait écrit un
// prompt qui demande ce que le parseur jette.
// ══════════════════════════════════════════════════════════════════════════
// v22 → v23 — « JE CUISINE LA VEILLE », ET LA FIN DES JOURS DE CUISINE COCHÉS
// ══════════════════════════════════════════════════════════════════════════
//
// DEUX CHANGEMENTS, ET ILS SE TIENNENT. Le champ « les jours où tu cuisines » a
// été retiré des deux écrans le 2026-09-01: le plan ne demande plus QUELS jours
// on cuisine, seulement QUAND tombe la session. `cook_days` est désormais écrit
// vide par les deux écrivains, donc `cookDayLines` sort sur
// `declared.length === 0` — le modèle pose ses sessions lui-même — et la
// population qui voyait « they can only cook on: … » s'éteint.
//
// À sa place, `cookOnlyDay`: le plan peut commencer UN JOUR PLUS TÔT, et ce
// jour-là est une journée de cuisine où RIEN ne se mange. Ce qui change dans le
// message:
//   ① la liste « days to fill » ne le contient pas, et le plafond de plats est
//      calculé sur les jours qui portent des repas — le laisser sur la fenêtre
//      entière aurait autorisé un jour de plats de plus que le plan n'en porte;
//   ② une phrase le NOMME et interdit d'y écrire un plat (une absence ne
//      s'obéit pas: le modèle connaît le jour par la date de départ);
//   ③ il entre dans les jours de cuisine effectifs, donc `singleSessionCookDay`
//      le désigne et `daysOutOfBatchReach` sait compter à partir de lui.
//
// ⛔ SANS VEILLE ET SANS JOURS COCHÉS, LE MESSAGE EST CELUI DE v22 MOINS LA
// LIGNE DES JOURS DE CUISINE. Un test le tient.
// ══════════════════════════════════════════════════════════════════════════
// v23 → v24 — LA FENÊTRE CRUE ATTEINT ENFIN LE MODÈLE (2026-09-01)
// ══════════════════════════════════════════════════════════════════════════
//
// LA POPULATION QUI CHANGE: tout plan dont la fenêtre est assez longue pour
// qu'une famille fragile morde — c'est-à-dire tout plan de plus de deux jours.
// Un bloc s'ajoute sous les moyens de cuisson (`rawReachLines`), qui NOMME le
// dernier jour qu'une course du premier jour peut nourrir, famille par famille.
//
// ⚠️ CE N'EST PAS UNE RÈGLE NEUVE, C'EST UNE RÈGLE QUI N'ÉTAIT DITE À PERSONNE.
// `RAW_WINDOW_DAYS` date l'achat de chaque article depuis le 2026-08-22, et
// `grocery_waves.ts` en déduit correctement qu'il faudra une seconde course.
// Mais ça tourne APRÈS la composition: le modèle posait le poulet le samedi
// sans savoir, et la personne lisait une liste sans date. Rapporté sur un plan
// réel: « cuisiner le poulet acheté le lundi, le samedi ».
//
// ⛔ ELLE N'INTERDIT PAS, ELLE OBLIGE À LE DIRE. La sortie honnête — une course
// plus proche de la session — existe déjà dans le moteur; ce que le lot refuse
// est le silence.
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LES CONTENANTS D'UNE PERSONNE SEULE — 2026-09-01.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT, RAPPORTÉ SUR UN PLAN RÉEL ──────────────────────────────────
 *     « je viens de créer un plan en mode solo et il n'y a pas l'histoire des
 *       barquettes »
 *
 * ⛔ ET C'ÉTAIT UNE DÉCISION ÉCRITE, PAS UN OUBLI. `generate-meal-v1` passait
 * `boxMemberIds: []` avec ce motif, mot pour mot: « une personne seule a bien
 * des boîtes dans sa vraie cuisine; ce qu'elle n'a pas, c'est deux bouches à
 * départager — et le protocole des boîtes n'existe que pour ça ». Vérifié en
 * base: le dernier plan solo porte `with_box: 0` sur quatre plats.
 *
 * Le raisonnement était juste sur le PROTOCOLE et faux sur le PRODUIT. Ce que
 * le protocole foyer fait — départager des mangeurs — n'a effectivement aucun
 * sujet ici. Mais ce que la PERSONNE lit — « dimanche, tu remplis quatre
 * barquettes, voilà ce qu'il y a dedans » — n'a rien à voir avec le nombre de
 * bouches: c'est ce que la cuisine du dimanche produit, et ça manquait.
 *
 * ── CE QUI CHANGE PAR RAPPORT AU BLOC FOYER, ET POURQUOI ──────────────────
 * ⛔ AUCUN `member_ids`, ET C'EST LA MOITIÉ QUI COMPTE. Servir un bloc qui
 * nomme des bouches à quelqu'un qui mange seul lui apprendrait qu'un marquage
 * par personne existe et l'inviterait à en inventer un — le raisonnement de
 * `dishOwnerSchemaBlock`, et le motif exact pour lequel la lane solo n'avait
 * rien. Ici le couvercle ne porte pas de nom parce qu'il n'y a personne à
 * distinguer, et le bloc le DIT.
 *
 * ⚠️ IL S'AJOUTE AU `systemPrompt`, donc il fait une SECONDE variante
 * cacheable. C'est le prix, et il est assumé: le bloc doit être lu comme un
 * schéma (il décrit une clé de sortie), et un schéma qui vivrait dans le
 * message utilisateur serait la seule règle de forme à ne pas être avec les
 * autres.
 */
export const SOLO_BOX_BLOCK = [
  "== ONE CONTAINER PER PORTION PUT ASIDE ==",
  'Every dish that takes from a preparation carries one more key: "boxes" --',
  "the container that portion goes into on the day the batch is cooked.",
  '  "boxes": [{ "id": "box_<day>_<slot>",',
  '              "items": [{ "preparation_id": "prep_x" or null,',
  '                          "term": "what is in it",',
  '                          "grams": <whole grams of READY food> }] }]',
  "Exactly ONE box per dish that draws on a preparation. They eat alone, so no",
  "lid carries a name: the day and the meal are what tells them which one to",
  "open. Ids are lowercase ASCII, invented by you, and each one is used once in",
  "the whole plan.",
  "The grams are what goes IN the container once cooked, not the raw weight of",
  "the shopping. preparation_id is null when that item is added fresh on the",
  "day, so no batch holds it.",
  "One box holds that WHOLE meal -- every preparation the dish takes from goes",
  "in the same container, not one tub per pan. A dish that cooks from scratch",
  'on the day has no "boxes": nothing was weighed ahead for it.',
].join("\n");

// ⟳ v28 (2026-09-06) — LA LISTE DES JOURS EST ANCRÉE SUR LA DATE D'OUVERTURE
// DE LA FENÊTRE, plus sur « aujourd'hui ». Le message ne peut donc plus se
// contredire quand la fenêtre démarre la semaine prochaine, et la garde qui
// interdisait ce départ (`window_beyond_this_week`) est retirée. Le prompt
// change pour TOUTE la population — les deux lanes passent par
// `buildMealPrompt` —, et c'est très exactement le prix que le lot du
// 2026-08-12 avait refusé de payer parce que « l'écran n'a jamais proposé »
// cette fenêtre. L'écran la propose depuis aujourd'hui.
// ⟳ v29 (2026-09-07) — UNE RECETTE SE CUISINE UNE FOIS DANS LA FENÊTRE. Un lot
// couvre plusieurs jours; une seconde session ne refait pas la même
// préparation, et la renommer par son jour ne la rend pas différente. Les
// petits-déjeuners comptent. Mesuré avant: trois casseroles de muffins aux
// œufs, six matins identiques. Le tronc change pour les deux lanes.
// ⟳ v30 (2026-09-09) — LA CADENCE DE COURSES ATTEINT LA CONSIGNE. Population
// qui voit une consigne différente: celle qui a répondu aux deux questions de
// P2 ET dont le plan s'appuie sur le congélateur (`usesFreezer`) — une course
// pour plusieurs sessions. Pour elle, la sortie de la fenêtre crue devient
// « congelé à l'achat, sorti la veille » au lieu de « racheté la veille ».
// Mesuré avant: la liste disait « dinde achetée mercredi, à congeler », le
// déroulé de dimanche disait « acheter la dinde fraîche le jour même ». Pour
// tous les autres, la consigne est celle de v29 au caractère près.
// ⟳ v32 (2026-09-11, LOT D) — LA RECETTE DIT CE QUI LA TIENT. Le tronc gagne le
// bloc `== SAY WHAT HOLDS THE RECIPE TOGETHER ==`, la clé `components` sur les
// plats et les préparations, et `part` sur chaque ligne. Population concernée:
// TOUTE, les deux lanes passent par `buildMealPrompt`. Ce que ça achète est
// mesuré (revue du 2026-09-11 §5): sans cette structure, l'ajusteur de
// proportions a réécrit quatre recettes de la campagne — tahini 45 → 40 g,
// huile 25 → 20 g, laitue 50 → 68,7 g — parce qu'aucune contrainte ne portait
// le rapport sauce/base. Sans `components`, un bloc reste désormais NON
// AJUSTABLE en proportions: le prompt et le moteur changent ensemble, dans le
// même lot, et la promesse touche sa clé de schéma.
// ⟳ v33 (2026-09-12, LOT 1) — LE MODÈLE N'ÉCRIT PLUS LA LISTE DE COURSES.
// La clé `shopping_list` quitte le schéma de sortie, les deux lignes
// `shopping_list[].*` quittent `MEAL_TRANSLATABLE_FIELDS`, et la consigne
// `mode = to_shop` dit désormais d'où vient la liste. Population concernée:
// TOUTE — le bloc vit dans `MEAL_SYSTEM_PROMPT`, donc les deux lanes.
// Ce que ça achète est mesuré (revue de clôture C6 § 5): sur la campagne des
// six tirs, **2 plans sur 6 ont été refusés** parce que le modèle avait oublié
// un achat que sa propre recette demandait. La liste est maintenant PRODUITE
// depuis les ingrédients finaux (`rebuildShoppingQuantities`), donc un oubli
// du modèle ne peut plus coûter un plan — il se compte (`model_omitted`).
// ⚠️ LA LECTURE RESTE. `parseGeneratedMeal` lit toujours `root.shopping_list`
// quand elle est là: les réponses d'archive et les plans déjà écrits la
// portent, et la refuser les rendrait illisibles.
export const MEAL_PROMPT_VERSION = "meal.en.v34_the_grid_is_a_checklist";

/**
 * ③ — CE QUE `severity` VEUT DIRE, posé JUSTE SOUS la liste qui le porte.
 *
 * ⚠️ IL N'EST PAS DANS `safetyConstraintsPromptBlock`, ET C'EST DÉLIBÉRÉ. Cette
 * fonction-là est partagée par la conversation (`sophia-brain/router/run.ts`)
 * et par la lane semaine. Dans une CONVERSATION, un dégoût et une allergie
 * s'arbitrent en parlant à la personne; ici on compose une assiette sans elle,
 * et le mot `preference` doit pouvoir céder. Écrire la nuance dans la fonction
 * partagée la servirait à trois lanes dont deux ne l'ont pas demandée.
 *
 * ⚠️ CE BLOC N'ASSOUPLIT AUCUNE CEINTURE. Les trois sévérités restent
 * INTERDITES d'assiette — la seule chose qu'il change est ce qu'un dégoût a le
 * droit de COÛTER: il ne justifie pas de supprimer un repas, et il cède quand
 * il entre en collision avec une contrainte médicale, un régime ou la faisabilité.
 * Côté code, rien ne bouge: `findMedicalConstraintViolations` filtre déjà
 * `severity !== "medical"`, donc un `preference` n'a jamais armé le verrou
 * binaire et n'en perd pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * v15 — LA QUEUE DU BLOC: NE PAS NOMMER L'ALLERGÈNE DANS UN PLAN.
 * ═══════════════════════════════════════════════════════════════════════════
 * ── CE QUE ÇA COÛTAIT, MESURÉ EN RUN RÉEL ────────────────────────────────
 * Run `2a000000-3100-4000-8000-000000000001` (lane solo, v13). L'envie du
 * moment nommait l'allergène MÉDICAL de l'élève (« a proper tahini and sesame
 * noodle bowl »). Le modèle a fait EXACTEMENT ce qu'il fallait: neuf plats,
 * zéro sésame, zéro tahini, zéro viande pour une végétarienne — et il l'a
 * expliqué dans le `why` du plat concerné:
 *
 *     "I cannot honour the requested tahini and sesame because of your
 *      medical allergy, or the cold-only dinner…"
 *
 * Réponse du produit: **HTTP 422 `empty_meal`, `lock:
 * blocked_medical_constraint`**. La semaine entière détruite, sans un mot à
 * l'élève. Le verrou rejoué sur le texte exact que `parseGeneratedMeal`
 * construit rend DEUX morsures, et les deux sont dans cette phrase-là:
 * `tahini` @953 et `sesame` @964. Aucun ingrédient, aucun titre, aucune ligne
 * de courses ne mord.
 *
 * ── ET LE PROMPT ORDONNAIT CE GESTE, DE TROIS ENDROITS ───────────────────
 *   · le bloc de sécurité: « You MAY name them to warn, to exclude… »;
 *   · `-- WHAT THEY HAVE TOLD ME --`: « name the thing you could not do »;
 *   · le schéma: `"why": "one sentence: why THIS dish for THIS student"`.
 * Plus le modèle obéissait à la hiérarchie, plus sûrement son plan mourait.
 *
 * ── POURQUOI LA CEINTURE N'EST PAS TOUCHÉE ───────────────────────────────
 * Parce qu'elle a raison. « Les consignes sont consultatives, donc la garantie
 * ne peut pas vivre dans le prompt » — et le lot voisin
 * (`06-attribution-allergies`) le pose noir sur blanc: « le 422 n'est pas le
 * défaut qu'on répare, c'est le comportement CORRECT devant un plan qui NOMME
 * un jeton médical ». On ne desserre donc rien. On retire la CONSIGNE qui
 * poussait le modèle dans la phrase fatale.
 *
 * ── LA FORMULATION DE REMPLACEMENT EST MESURÉE, PAS SUPPOSÉE ─────────────
 * `findMedicalConstraintViolations` sur `sesame`/`medical`:
 *     "plain ready-cooked noodles labelled sesame-free"      → 0
 *     "noodles with no sesame"                               → 0
 *     "one of the foods on your medical list"                → 0
 *     "swapped for a seed you can eat"                       → 0
 *     "contains sesame"                                      → 1
 *     "I cannot honour the requested sesame because of your medical allergy" → 1
 * La négation ne désarme que quand elle porte sur L'ALIMENT. Dans une phrase
 * de refus elle porte sur le VERBE (« cannot honour »), et le nom reste nu.
 * C'est la cicatrice `forbidden-matcher-explanation-word-order` du dépôt, vue
 * par son autre bout. La phrase proposée est donc celle dont on a MESURÉ
 * qu'elle rend zéro morsure.
 */
const SEVERITY_READING_BLOCK = [
  "Each of those lines carries a `severity`, and it is not decoration:",
  "- severity=medical — a health event, not a taste. Never on a plate, in any",
  "  amount, in any form, cooked or raw, and never hidden in a stock or a fat.",
  "- severity=strict — off the plate too, for the same practical purpose.",
  "- severity=preference — they simply do not like it. Keep it off the plate,",
  "  but it is NOT a safety matter: it never justifies leaving a meal out, and",
  "  it is the first thing that gives way when it collides with anything above",
  "  it. Do not write about it as if it were dangerous.",
  "",
  // ── v15 ── CE QU'UN PLAN N'A PAS LE DROIT D'ÉCRIRE, ET POURQUOI ─────────
  // Voir l'en-tête `NAMING_IN_A_PLAN` juste au-dessous pour la mesure.
  "NAMING ONE OF THEM IN A PLAN IS NOT A WARNING — IT DESTROYS THE PLAN.",
  // ⚠️ LA PERMISSION DE NOMMER EST DOUZE LIGNES PLUS HAUT, DANS LE MÊME
  // MESSAGE, et elle vient d'une fonction partagée avec la CONVERSATION, où
  // elle est juste (un allergique a le droit de demander « est-ce qu'il y a
  // des arachides dedans ? »). On ne la retire donc pas: on dit, plus bas,
  // sur quelle surface elle ne vaut pas. Deux consignes qui se contredisent
  // sans que rien ne les départage, c'est le défaut que ce lot mesure.
  "The permission to name them, twelve lines above, is for a CONVERSATION.",
  // ⛔ S2 (2026-08-22) — « severity=medical » SEUL ÉTAIT DEVENU FAUX ICI.
  //
  // La ceinture de sortie couvre `medical` ET `strict` depuis
  // `BELT_BLOCKING_SEVERITIES` (`safety_constraints.ts`). Ce paragraphe
  // annonçait au modèle que seul un nom `severity=medical` détruit la semaine
  // — donc, mot pour mot, qu'un nom `severity=strict` est sans danger dans un
  // plat. Six contraintes actives (`dairy`, `lactose`, `gluten`, `fructose`,
  // `fruits_de_mer`, `mustard`) sont entrées sous la ceinture ce jour-là.
  //
  // ⚠️ CE N'EST PAS UNE PRÉCAUTION, C'EST UNE CORRECTION DE FAIT MESURÉE. Le
  // run `2a000000-3100-4000-8000-000000000001` (voir l'en-tête juste au-dessus)
  // a détruit une semaine entière parce que le modèle OBÉISSAIT au reste du
  // prompt et nommait l'allergène dans son `why`. Laisser la phrase telle
  // quelle après `S2`, c'était rouvrir ce trou pour une population neuve, avec
  // la consigne qui pousse dedans écrite dans le même message.
  "This is a plan somebody cooks from, not a conversation. A severity=medical",
  "or severity=strict name written in a dish — its title, its method, its",
  "`why`, its ingredients — or in the shopping list is caught by a",
  "deterministic belt AFTER you, and the belt does not remove that sentence:",
  "it empties the WHOLE week, and the student is shown nothing at all.",
  "So: pick a food they can eat, write the dish you DID pick, and when you have",
  "to explain the swap, write \"one of the foods on your medical list\" and never",
  "the food. That phrasing is safe; \"I cannot use <the food> because of your",
  "allergy\" is the exact sentence that empties the week.",
  // La formulation jumelle pour le cran `strict`: « medical list » serait faux
  // pour une intolérance, et un modèle à qui on donne une phrase fausse en
  // invente une autre. Mesurée à ZÉRO morsure contre les 58 contraintes
  // actives de la base, ceinture élargie comprise.
  "For a severity=strict line, the safe phrasing is \"one of the foods you keep",
  "off your plate\" — same rule, same belt, and never the food itself.",
].join("\n");

/**
 * ① — LA HIÉRARCHIE, ÉCRITE UNE FOIS, DANS LE CRAN DE RÉCENCE.
 *
 * ── POURQUOI ELLE MANQUAIT, ET CE QUE ÇA COÛTAIT ─────────────────────────
 * Ce prompt porte SIX familles de désirs qui peuvent se contredire — les
 * contraintes dures, le régime, la méthode du coach, ce que la cuisine peut
 * faire, ce que l'élève a écrit, ce dont il a envie ce soir — et il n'écrivait
 * nulle part laquelle gagne. La hiérarchie n'était portée que par la POSITION,
 * et la position dit l'inverse de ce qu'on veut: la sécurité est en TÊTE,
 * c'est-à-dire au rang que ce dépôt a mesuré comme le MOINS contraignant,
 * pendant que l'envie du soir est trois lignes avant la fin.
 *
 * Pire, la seule phrase du message qui affirme un rang est celle de la
 * doctrine: « Where this block and your own knowledge disagree, this block
 * wins ». Lue seule — et elle l'était — elle donne le sommet au coach.
 *
 * ── OÙ ELLE EST POSÉE, ET POURQUOI PAS AILLEURS ──────────────────────────
 * En queue de `== WHAT TO COOK ==`, juste avant le bloc de langue. C'est le
 * même raisonnement que celui qui a fait descendre le bloc satiété du foyer
 * après un run rouge, et que celui qui garde la commande en dernier: la
 * consigne la plus proche de la fin est lue comme la plus contraignante. Une
 * règle d'arbitrage doit occuper ce cran, sinon elle arbitre depuis le rang
 * qu'elle est censée corriger.
 *
 * ── CE QU'ELLE NE FAIT PAS ────────────────────────────────────────────────
 * Elle ne DÉPLACE rien. Les contraintes dures restent en tête du message (une
 * troncature de budget de prompt ne doit pas emporter la ligne « pas
 * d'arachide »), la saison reste où elle est. Elle ajoute la seule chose qui
 * manquait: la phrase qui dit dans quel ordre les lire.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ `D3′` (2026-08-22) — CE PARAGRAPHE-CI N'ÉTAIT VRAI QUE SUR LA LANE SOLO.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * « En queue de `== WHAT TO COOK ==`, juste avant le bloc de langue » est vrai
 * pour `generate-meal-v1` — 0 bloc après, sur 74 prompts archivés. Sur
 * `generate-household-meal-v1` c'est FAUX: le suffixe de foyer est concaténé
 * APRÈS `built.userMessage`, et la mesure du 2026-08-22 rend 2 à 9 blocs de
 * contenu après l'arbitrage (`scripts/keel_d3_position_du_bloc_20260822.ts`).
 *
 * ⛔ ET LE RANG 1 Y ÉTAIT FACTUELLEMENT FAUX. « The hard constraints and the
 * diet at the VERY TOP of this message » envoyait le modèle chercher le régime
 * en tête, alors que `== WHAT THE SHARED BASE MUST RESPECT ==` est 63 à 101
 * lignes PLUS BAS. La lane foyer a donc sa propre variante, qui NOMME ses
 * blocs de verrou au lieu de désigner une position.
 *
 * ⚠️ LE TEXTE VIT MAINTENANT DANS `precedence_tail.ts`, module NEUF et COMMITÉ
 * qui n'importe rien. Cette ligne-ci n'est plus qu'un point de câblage: le
 * texte solo est GELÉ octet pour octet et un test l'exige — ne pas
 * l'« harmoniser » avec la variante foyer par symétrie.
 */
const PRECEDENCE_BLOCK = buildPrecedenceBlock("solo");

/**
 * Les moments, un par ligne, avec leur taille quand elle a été donnée.
 *
 * LA TAILLE EST REPRISE TELLE QUELLE et jamais complétée: « large » quand il
 * l'a dit, rien quand il ne l'a pas dit. Écrire « medium » par défaut sur les
 * moments muets poserait une contrainte que personne n'a exprimée, et le modèle
 * la respecterait — c'est bien le problème. Un moment sans taille est un moment
 * que le modèle compose comme il l'entend.
 *
 * « for them » et pas « large » tout court: sans le possessif, le modèle lit
 * une consigne de portion absolue. C'est la journée de CET élève qu'on décrit,
 * et gros pour lui n'est pas gros dans l'absolu.
 */
function rhythmLines(rhythm: readonly EatingOccasionSlot[]): string {
  return rhythm
    .map((o) =>
      o.size
        ? `- ${OCCASION_PROSE[o.slot]} (${o.size} for them)`
        : `- ${OCCASION_PROSE[o.slot]}`
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// Le prompt
// ---------------------------------------------------------------------------

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-13 · LOT 2 — LE PROMPT SYSTÈME, EN SECTIONS NOMMÉES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT QUE CE DÉCOUPAGE FERME (revue du 2026-09-12, P1 §3). L'appel de
 * réparation transmettait `built.systemPrompt`, donc CE prompt entier — qui
 * demande un PLAN COMPLET, son `OUTPUT JSON SCHEMA` et la couverture de tous
 * les jours — pendant que le message utilisateur exigeait un PATCH. Deux
 * schémas contradictoires dans le même appel : le modèle peut rendre le plan
 * que le système lui demande, et le lecteur de patch n'en tire rien.
 *
 * ⛔ ET LA RÉPARATION N'EST PAS UNE DÉCOUPE PAR EXPRESSION RÉGULIÈRE. Le plan
 * l'interdit en toutes lettres. Les sections deviennent des OBJETS nommés : le
 * prompt de composition les recolle TOUTES (la chaîne est identique au
 * caractère près, un test l'épingle), et le prompt de réparation en choisit —
 * par une liste fermée, lisible, qu'on peut relire.
 *
 * ⚠️ L'ORDRE EST LE CONTRAT. `MEAL_SYSTEM_PROMPT` est leur concaténation dans
 * CET ordre ; changer l'ordre change le prompt.
 */
export const MEAL_PROMPT_SECTION_KEYS = [
  "opening",
  "method_first",
  "portion_is_one_plate",
  "stretch_starts_today",
  "cover_whole_stretch",
  "cook_vs_eat",
  "cooking_sessions",
  "keeping_window",
  "session_time_ceiling",
  "cook_before_eat",
  "minutes",
  "same_day",
  "no_nutrition_numbers",
  "quantity_twice",
  "method_names_food",
  "dish_adds_weighed",
  "student_situation",
  "two_modes",
  "components",
  "name_and_title",
  "output_schema",
] as const;
export type MealPromptSectionKey = (typeof MEAL_PROMPT_SECTION_KEYS)[number];

export interface MealPromptSection {
  readonly key: MealPromptSectionKey;
  readonly text: string;
}

/** Les sections, dans l'ordre où le prompt de composition les rend. */
export const MEAL_PROMPT_SECTIONS: readonly MealPromptSection[] = [
  {
    key: "opening",
    text: `You cook for ONE student, inside the method their coach teaches.

Output a single JSON object, nothing else. No prose outside the JSON, no markdown fences.`,
  },
  {
    key: "method_first",
    text: `== THE METHOD COMES FIRST, THE RECIPE IS YOURS ==

Your coach's method is given below. It is not a suggestion: their forbidden practices and the foods they do not put on a plate are hard limits, and you never contradict them.

Inside those limits you are free. Write real food a real person wants to eat. You are not restricted to a catalogue.`,
  },
  {
    key: "portion_is_one_plate",
    text: `== A PORTION IS ONE PERSON'S PLATE ==

You are told how many people are at the table. Every quantity you write is for
THAT many people, for the number of servings the dish actually makes — and for
nothing more.

If you are given a block headed WRITE ONE STANDARD RECIPE PER DISH, that block
is the one that governs: there, every dish is written for ONE serving whatever
the table holds, and the app multiplies it.

Measured failure, and it is the one that makes a plan unusable: "2 salmon
fillets, 500 g potatoes" written for ONE person eating ONE dinner. That is three
dinners on a plate. If a quantity only makes sense because the dish is cooked in
a batch, then say so in \`batch\` — do not silently inflate a single plate.

What you decide is the SHAPE of the plate; the app decides how much of it lands
in front of each person. So write shares, not a plate weight: roughly a third of
the plate is cooked grains, pasta, potatoes or pulses, roughly a quarter is the
protein food, there is a fat (oil, butter, cheese, nuts, avocado) — and
vegetables ON TOP of it, never instead of it. Measured failure, and it is the
quiet one: a palm of chicken on a bed of courgettes and salad looks like a meal
and carries a third of one — a whole week composed that way left the table
hungry. If the method takes the starch off the plate, that weight moves to the
protein food, the pulses and the fat; it does not vanish. You never tell the
student any of this; you use it so that when the app scales your recipe, the
plate it serves is food and not water.

${PROTEIN_ANCHOR_PROMPT_LINE}`,
  },
  {
    key: "stretch_starts_today",
    text: `== THE STRETCH STARTS TODAY ==

You are told what day it is for this student, and the exact days to fill. Use
THOSE days, in that order, and no others.

A plan handed to somebody on Wednesday that starts on Monday is half expired on
delivery — measured, and the first thing a student notices. There is no such
thing as planning a day that has already gone.`,
  },
  {
    key: "cover_whole_stretch",
    text: `== COVER THE WHOLE STRETCH, WITH FEW COOKING SESSIONS ==

When you are asked for several days, cover EVERY day of the stretch and every
meal that matters in it. A plan with Monday dinner and Wednesday dinner and
nothing in between is not a plan — the student did not ask for a partial week,
and holes are read as "the system gave up".

Covering everything does not mean cooking everything. That is what the
preparations below are for.`,
  },
  {
    key: "cook_vs_eat",
    text: `== WHAT YOU COOK IS NOT WHAT YOU EAT ==

This is the important one, and it is what makes a week both quick and bearable.

Separate PREPARATIONS from DISHES.

  A preparation is what comes out of one cooking session: 1.2 kg of roast
  chicken thighs, a pot of chilli, a tray of roast vegetables, a batch of rice.
  It carries its own ingredients — for the WHOLE batch — and its own method.

  A dish is a meal on a day. It NAMES the preparations it draws on through
  \`uses\`, and its own \`ingredients\` list only what you add at the moment of
  eating: the salad, the bread, the yogurt, the lemon.

Why it matters: one cooking of chicken becomes a rice bowl on Monday, a wrap on
Tuesday and a curry base on Thursday. THREE DIFFERENT MEALS, ONE COOKING. Making
the same student eat the identical plate four days running is technically batch
cooking and humanly a punishment — do not do it.

Rules that follow:
  - anything that needs a pan, a pot or an oven is a PREPARATION making at
    least two servings. Never a dish cooked from scratch twice in a week.
  - assemblies that need no cooking — oats and yogurt, a sandwich, fruit and
    nuts — are plain dishes with no \`uses\`, made fresh, quantities for one
    plate.
  - a dish that draws on a preparation does NOT repeat its recipe. Its method is
    what you do at that meal: "reheat a portion, add the salad and the lemon".
  - vary what you build from the same preparation. Same protein, different meal.`,
  },
  {
    key: "cooking_sessions",
    text: `== NAME THE COOKING SESSIONS, AND WRITE THE RUN-THROUGH ==

Give \`cooking_sessions\`: the days on which the student actually cooks, which
preparations get made in each, and the ORDER of the gestures — "oven on for the
tray, rice on while it roasts, chilli simmering next to it, box four portions".

Aim for two or three sessions in a week, not seven. Every preparation belongs to
exactly one session: a preparation nobody cooks is a plan the student cannot
follow.`,
  },
  {
    key: "keeping_window",
    text: `== NOTHING SITS IN THE FRIDGE FOR A WEEK ==

A cooked batch is eaten within THREE DAYS of the day it was cooked. Cooked on
Thursday means eaten by Sunday, and that is the end of it. Beyond that it is not
a meal plan, it is a plan to throw food away or to get somebody ill.

Cooked rice and cooked seafood are tighter still: same day or the day after.
Rice left sitting is the classic way to make somebody sick, and no amount of
convenience is worth it.

If a batch would have to stretch further, you have three honest ways out: cook a
smaller batch, cook it twice, or FREEZE the surplus on the cooking day. Never
stretch it in silence.

The freezer is not prose: it is a field. When a portion is taken from the
freezer rather than the fridge, write \`\"kept\": \"freezer\"\` on that entry of the
dish's \`uses\`, and say in the method that it comes out the night before. A
frozen portion has no three-day limit; a portion you only DESCRIBE as frozen
still has one, because nothing reads a description. Only claim the freezer when
this kitchen has one -- the section above says what it does not have.`,
  },
  {
    key: "session_time_ceiling",
    text: `== THE COOKING TIME THEY GAVE YOU IS A CEILING ==

When a session time is stated, the session fits inside it. It is not a target to
approach and overshoot: it is what they actually have that evening, and a
session that does not fit is a session they skip — after which the whole week
falls apart, not just that session.

If everything will not fit, cook LESS in that session and put the rest on
another cooking day. Fewer preparations that happen beat more preparations that
do not.

There is one case where that way out does not exist: when they cook on a single
day and the week cannot be fed from it. Then the session runs longer -- say so
in "total_minutes", write the real number, and never pretend it fits. A session
announced at 30 minutes that takes 55 is worse than one announced at 55: the
first is found out at the stove, the second is a decision they can make.`,
  },
  {
    key: "cook_before_eat",
    text: `== NOTHING IS EATEN BEFORE IT IS COOKED ==

A preparation must be cooked ON OR BEFORE the first day that eats from it. If
the only cooking day you have is Sunday, then Thursday, Friday and Saturday
cannot live off a Sunday batch — those days cook for themselves, or they eat
something that needs no batch at all.

This is not a preference. A plan that feeds Thursday from a Sunday session is a
plan that cannot be executed, and the student finds out at lunchtime.`,
  },
  {
    key: "minutes",
    text: `== HOW LONG THINGS TAKE ==

Every preparation carries two numbers, and they are not the same one.
"active_minutes" is time with your hands on it — chopping, stirring, turning.
"total_minutes" is from starting to finished, waiting included. A roast is 10
active and 50 total; that gap is the whole reason batch cooking works, because
the oven time is free for another preparation.

A session's "total_minutes" is the wall clock of the session, NOT the sum of its
preparations: things overlap, and pretending otherwise turns a comfortable
ninety-minute Sunday into a scary four-hour one nobody starts.

Round to the nearest five. These are estimates a cook recognises, not
measurements — but they are the numbers somebody uses to decide whether tonight
is possible, so a wrong one costs a skipped meal.

Every step that applies heat says the HEAT and the TIME, in "method" and in
"run_through" alike: the oven temperature as a number, in the unit ovens use
in their country (°C in France and most of the world, °F in the United States);
the hob level as a word (low, medium, high); and the minutes that step takes.
"Roast 25 min at 200 °C", "simmer 15 min on low, lid on", "sear 3 min a side on
high". "Cook until done" is a plate somebody burns or undercooks. The same goes
for the day-of gesture of a "cook_fresh" or "reheat_only" dish: "reheat 8 min in
a covered pan on low" tells them what to do; "reheat" alone does not.`,
  },
  {
    key: "same_day",
    text: `== WHAT TODAY ACTUALLY TAKES, ON EVERY DISH ==

Every dish carries "same_day": what the student does ON THE DAY THEY EAT IT to
get that plate in front of them, and how long that gesture takes.

  "kind" is one of four, and nothing else exists:
    "none"        - nothing to prepare. Fruit, a yogurt, a plate already made.
    "reheat_only" - take the portion out and heat it, and NOTHING else.
    "assemble"    - build the plate from what is already cooked, no cooking.
    "cook_fresh"  - a real cooking gesture that day: scramble the eggs, boil
                    the pasta, sear the fish.

  "minutes" is how long THAT gesture takes, that day. A whole number.

"minutes" IS NOT THE TIME OF THE COOKING SESSION, and confusing the two is the
failure this field exists to stop. A portion of Sunday's roast, reheated on
Wednesday, is 8 minutes - not the 50 the roast took. Announcing 50 tells
somebody with ten minutes that dinner is out of reach, and they skip it.

Say it on EVERY dish, including the ones where the answer is nothing. "none" and
"cook_fresh" are answers; a missing line is a plate somebody stands in front of
without knowing what to do. If the dish reheats, the word reheat is what they
need to read, so write "reheat_only" and say it again plainly in "method".`,
  },
  {
    key: "no_nutrition_numbers",
    text: `== NEVER PUT A NUMBER ON NUTRITION ==

No calories. No macro grams. No percentages of anything nutritional. Not as a target, not as a range, not "roughly". Nobody has measured this student.

Shopping quantities are DIFFERENT and expected: "400 g chicken thighs", "2 onions", "a bunch of parsley". A quantity says how much to buy or use; a target claims a measurement of the person. Put quantities on ingredients, never on the student.`,
  },
  {
    key: "quantity_twice",
    text: `== SAY THE SAME QUANTITY TWICE: ONCE FOR THE COOK, ONCE IN FIGURES ==

Every ingredient carries "quantity" — the phrase a person reads, exactly as you
write it today — AND three plain fields that repeat it:

  "amount": the number.
  "unit":   one of "g", "ml", "unit", "tbsp", "tsp". Nothing else exists. A
            thing you can COUNT is "unit": half a lemon is 0.5, two thighs
            are 2. Only a handful, a cup or a pinch leaves both null.
  "state":  "raw" or "cooked" — the weight you just wrote, before or after
            cooking.

"state" is REQUIRED for anything that takes on or loses water in the pan: rice,
pasta, couscous, lentils, dried beans, meat, poultry, fish -- AND every
vegetable that is cooked: onion, spinach, courgette, pepper, broccoli,
mushrooms, leeks, cabbage. A hundred grams of rice is not the same food before
and after it is boiled, and neither is a handful of spinach. Leaving it out
makes the line unusable. It does not matter for oil, nuts, cheese, yogurt, or
for anything eaten raw -- say "raw" there and move on.

EVERY INGREDIENT ALWAYS CARRIES "amount" AND "unit". Salt, black pepper and
herbs may stay a pinch; nothing else may. The chicken, the lemon, the lettuce,
the rice -- everything a person actually eats carries its number. Write "black
pepper", never bare "pepper": a pepper is also a vegetable, and the two weigh
five hundred times apart.

"term" NAMES ONE FOOD, never a choice between two. "green or brown lentils",
"butter or olive oil", "rice or quinoa" -- pick the one you are actually
cooking with and write only that. An "or" is a decision handed back to the
person at the exact moment they wanted one made, and it also makes the line
impossible to cost. Same for a slash: "yoghurt / skyr" is two foods.

Never INVENT a weight: a made-up number is worse than a missing one. But "I
did not write one" is not "I do not know". You chose this dish, so you know it
takes two chicken thighs and half a lemon -- count what is countable.

Fats, nuts and sweeteners are the strictest case: oil, butter, ghee, cream,
nut butter, tahini, nuts, seeds, honey, syrup, chocolate.
"A drizzle of olive oil" is a tablespoon -- write 1 and "tbsp". A spoon of oil
weighs what a whole plate of vegetables weighs; a blank makes the dish unreadable.`,
  },
  {
    key: "method_names_food",
    text: `== THE METHOD NAMES THE FOOD, IT DOES NOT REPEAT ITS WEIGHT ==

Write "method" and "run_through" with the ingredients NAMED — "brown the
chicken, add the rice and the stock" — and never with their amounts written out
again: not "add the 180 g of rice", not "use half of the 400 g tin".

The list of ingredients is the only place a quantity lives. The app adjusts
those quantities after you answer, and a number left inside a sentence is not
adjusted with them: it stays behind and contradicts the list, on the page the
person actually cooks from. This has happened twice in this product, on two
different sentences, and both times the prose was the half that was believed.`,
  },
  {
    key: "dish_adds_weighed",
    text: `== WHAT A DISH ADDS ON THE DAY IS WEIGHED OR COUNTED, NEVER VAGUE ==

The phrase in a DISH's "quantity" is either a weight -- "100 g dried pasta",
"40 g feta" -- or something a person can count: "half a lemon", "10 basil
leaves", "2 eggs". "A handful", "a generous portion", "some rice" say nothing
anybody can act on, and they are why the same dish comes out different every
time. Salt, pepper and herbs may stay a pinch. Everything else gets a number.`,
  },
  {
    key: "student_situation",
    text: `== THE STUDENT'S SITUATION IS NOT DECORATION ==

They tell you what their week actually looks like — a wedding on Tuesday, a holiday, a weekend away, a late shift. Cook around it. A meal that assumes an evening they do not have is a meal they will not make.`,
  },
  {
    key: "two_modes",
    text: `== THE TWO MODES ==

mode = from_pantry
  Cook with what they ALREADY have. Reach outside their list only for genuine
  staples (salt, pepper, oil, water) or when the dish is impossible otherwise.
  Anything you use that they did not list will be shown to them as something to
  buy, so keep that list short and say why it is needed.

mode = to_shop
  Compose freely. Do NOT write a shopping list: it is built from the exact
  ingredient lines of your dishes and preparations, term for term. Anything you
  want bought must appear as an ingredient, with its quantity.`,
  },
  {
    key: "components",
    text: `== SAY WHAT HOLDS THE RECIPE TOGETHER ==

The app may resize a recipe to fit somebody's plate. Scaling everything by one
factor is safe. Changing the RATIO between a sauce and what it dresses is not:
45 g of tahini with 20 g of lemon is a sauce, and 40 with 25 is another one.
The app cannot tell the two apart from your prose, and it will not try.

So say it in data. On every dish and every preparation, list its "components",
and on EVERY ingredient line write "part": the id of the component it belongs
to. One line, exactly one component. No line without a "part".

Each component has a "role", one of exactly these:
  main             the principal thing: the meat, the base, the gratin
  separable_side   an accompaniment that stands on its own, plain rice beside
                   a chicken in sauce. Its amount can move on its own.
  sauce            a sauce
  seasoning        a dressing, a marinade, weighed spices
  stuffing         a stuffing
  batter           a batter or a dough
  binder           egg, starch, breadcrumbs -- what holds it
  bound_hydration  a cooking whose liquid is part of the recipe: risotto,
                   couscous, pilaf
  garnish_fat      oil, tahini, cheese or nuts used to finish a component

Every role EXCEPT main and separable_side must name what it goes with, in
"part_of": the id of another component of the same block. Those ratios are then
kept exactly as you wrote them -- internally, and against what they dress.

ids and roles are ASCII snake_case, never translated. Write them even when the
dish has a single component: one component named "main" with every line in it is
a complete, correct answer, and it is better than leaving components out.

A block with no components, a line with no "part", a "part_of" that names
nothing: the whole block keeps your proportions untouched. Nothing breaks -- the
app simply has one less way to fit the plate, and may ask you to recompose it.`,
  },
  {
    key: "name_and_title",
    text: `== EVERY DISH HAS TWO LINES: A NAME, AND A TITLE ==

They are not the same line and they do not do the same job.

  "title" is what is on the plate, plainly: "Chicken, courgettes, peppers and
  rice". It is read out at the table, it is what somebody cooks from, and it
  never changes job. Keep writing it exactly as you already do.

  "name" is what this dish is CALLED: "Golden roast chicken bowls". Short --
  six words at most. Appetising. It is the line somebody reads when they decide
  whether they want to eat tonight.

Write BOTH, on every single dish: as many names as you have dishes. Count them
before you answer.

Do NOT make the title pretty instead. A title that becomes "Sunshine of
Marrakesh" no longer says what is on the plate, and nobody can cook a name. If
you find yourself dressing up the title, that is the name -- put it in "name"
and give the title back its plain words. And never write the same string twice:
a "name" identical to the title is a line that says nothing.`,
  },
  {
    key: "output_schema",
    text: `== OUTPUT JSON SCHEMA ==

{
  "dishes": [
    {
      "name": "short, appetising, six words at most -- what the dish is CALLED",
      "title": "...",
      "slot": "breakfast"|"snack_am"|"lunch"|"snack_pm"|"dinner"|"before_bed"|null,
      "day": "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"|null,
      "ingredients": [{ "term": "...", "quantity": "..."|null,
                        "amount": <number>|null,
                        "unit": "g"|"ml"|"unit"|"tbsp"|"tsp"|null,
                        "state": "raw"|"cooked"|null,
                        "part": "<id from this dish's components>" }],
      "components": [{ "id": "sauce", "role": "sauce", "part_of": "main" }],
      "method": "how to make it, plainly, in a short paragraph",
      "why": "one sentence: why THIS dish for THIS student this week",
      "density_check": <REQUIRED. kcal per 100 g you computed for this dish, cooked>,
      "uses": [{ "preparation_id": "prep_chicken", "servings": 1,
                 "kept": "fridge"|"freezer" }],
      "same_day": { "kind": "none"|"reheat_only"|"assemble"|"cook_fresh",
                    "minutes": <whole minutes for the day-of gesture> },
      "honours_belief_keys": ["<exact keys from the convictions list, when one applies>"]
    }
  ],
  "preparations": [
    { "id": "prep_chicken", "title": "Roast chicken thighs",
      "servings_made": 4,
      "ingredients": [{ "term": "...", "quantity": "<for the WHOLE batch>",
                        "amount": <number>|null,
                        "unit": "g"|"ml"|"unit"|"tbsp"|"tsp"|null,
                        "state": "raw"|"cooked"|null,
                        "part": "<id from this preparation's components>" }],
      "components": [{ "id": "main", "role": "main", "part_of": null }],
      "method": "how to cook the batch",
      "active_minutes": <minutes of HANDS-ON work>,
      "total_minutes": <minutes from starting to finished, waiting included>,
      "cook_on": "sun"|null }
  ],
  "cooking_sessions": [
    { "day": "sun", "preparation_ids": ["prep_chicken", "prep_rice"],
      "total_minutes": <minutes the whole session takes, start to finish>,
      "run_through": "the order of the gestures, plainly" }
  ]
}

Day tokens are exactly: mon tue wed thu fri sat sun. Never translated.`,
  },
];

/**
 * LE PROMPT DE COMPOSITION — TOUTES LES SECTIONS, DANS L'ORDRE.
 *
 * ⛔ IL N'A PAS CHANGÉ D'UN CARACTÈRE. `meal_prompt_sections_test.ts` compare
 * cette chaîne à l'empreinte figée avant le découpage : un lot qui déplace une
 * section déplacerait une consigne qui a coûté des runs réels.
 */
export const MEAL_SYSTEM_PROMPT = MEAL_PROMPT_SECTIONS
  .map((s) => s.text)
  .join("\n\n");

// ---------------------------------------------------------------------------
// LES CHAMPS DU JSON DE REPAS, RANGÉS EN DEUX TAS
//
// EXPORTÉS, et c'est le point: `generate-meal-v1` colle son bloc satiété APRÈS
// le message, donc il doit remettre le bloc de langue en queue — avec les MÊMES
// deux listes. Recopiées là-bas, elles divergeraient au premier champ ajouté,
// et la divergence serait muette: le modèle traduirait un jeton, ou laisserait
// une phrase en anglais, sans qu'aucun test ne regarde les deux listes à la fois.
// ---------------------------------------------------------------------------

/** La prose que l'élève lit — dans son plan, et sur son PDF de courses. */
export const MEAL_TRANSLATABLE_FIELDS: readonly string[] = [
  // L7 — LE NOM D'USAGE EST DE LA PROSE, ET C'EST LA PREMIÈRE LIGNE QU'ON LIT.
  // Un `title` traduit sous un `name` resté anglais donnerait « Golden roast
  // chicken bowls » au-dessus de « Poulet, courgettes, poivrons et riz » —
  // c'est-à-dire la seule ligne visible de la grille dans la mauvaise langue.
  "dishes[].name",
  "dishes[].title",
  "dishes[].method",
  "dishes[].why",
  "dishes[].ingredients[].term",
  "dishes[].ingredients[].quantity",
  "preparations[].title",
  "preparations[].method",
  "preparations[].ingredients[].term",
  "preparations[].ingredients[].quantity",
  "cooking_sessions[].run_through",
  // ⟳ LOT 1 (2026-09-12) — `shopping_list[].term` ET `[].quantity` SONT PARTIS
  // AVEC LA CLÉ QUI LES PORTAIT.
  //
  // ⛔ CE N'EST PAS UNE PERTE DE TRADUCTION, C'EST UN DÉPLACEMENT DE SOURCE.
  // Le modèle n'écrit plus de liste de courses : `rebuildShoppingQuantities`
  // la PRODUIT depuis les ingrédients. Le `term` d'une ligne produite est
  // RECOPIÉ mot pour mot de `dishes[].ingredients[].term` /
  // `preparations[].ingredients[].term`, qui sont deux lignes plus haut dans
  // CETTE liste — donc déjà dans la langue de contenu du plan. La `quantity`,
  // elle, est rendue par `renderQuantity(…, locale)`, c'est-à-dire par le même
  // rendu que la prose des recettes : « 300 g », « 2 cuillères à soupe ».
  //
  // ⚠️ DEMANDER LA TRADUCTION D'UN CHAMP QUE LE SCHÉMA NE DÉCLARE PLUS serait
  // la cicatrice `promise-and-schema-key-must-be-adjacent` prise à l'envers :
  // une promesse sans clé. Le modèle rendrait la clé « pour obéir ».
];

/**
 * Les JETONS (R1): comparés en code, ou écrits en base sous une contrainte.
 *
 * ⚠️ `preparation_id` EST LE PIÈGE DE CETTE LISTE. Il est INVENTÉ par le modèle
 * et référencé par `dishes[].uses[]`. En français il écrirait `prep_poulet` —
 * cohérent avec lui-même, donc rien ne casserait à la lecture — mais
 * `token-lint` a une règle exactement là-dessus, et un identifiant traduit ne
 * se rapproche plus de rien.
 */
export const MEAL_TOKEN_FIELDS: readonly string[] = [
  "slot",
  "day",
  "cook_on",
  "aisle",
  "servings",
  "servings_made",
  "state",
  "amount",
  "unit",
  "honours_belief_keys[]",
  "preparations[].id (ASCII snake_case, English words only)",
  "dishes[].uses[].preparation_id (must match preparations[].id exactly)",
  // ⛔ `kept` EST COMPARÉ EN CODE, donc il ne se traduit jamais. Le patron est
  // celui de `same_day.kind` juste en dessous: un `congelé` dans un plan
  // français ferait tomber la validation, la part retomberait sur la fenêtre du
  // frigo, et le plat serait JETÉ — c'est-à-dire le comportement d'avant le lot,
  // servi à la seule population qui ne compose pas en anglais.
  "dishes[].uses[].kept (one of: fridge, freezer)",
  // LOT 2 — LE GESTE DU JOUR J EST UN JETON, PAS UNE PHRASE. Il est comparé en
  // code contre `SAME_DAY_KINDS` et rendu par l'écran sous un libellé traduit;
  // un modèle qui écrirait « réchauffage » ou « nur aufwärmen » ferait tomber la
  // validation, donc le bandeau du jour, dans toutes les langues sauf l'anglais.
  // C'est le piège de `preparation_id`, mot pour mot, sur un autre champ.
  "dishes[].same_day.kind (one of: none, reheat_only, assemble, cook_fresh)",
  // L'IDENTIFIANT DE BOÎTE EST LE PIÈGE DE `preparations[].id`, UN CRAN PLUS
  // LOIN. Inventé par le modèle, il n'est plus rapproché de rien depuis que le
  // repas porte sa boîte — mais il reste écrit en base, comparé pour l'unicité,
  // et rendu en `data-box-id`. Un `boite_jeudi_midi` dans un plan anglais est un
  // jeton traduit, et c'est la règle de `token-lint`. Les prénoms qu'il contient,
  // eux, ne sont pas de la langue — ce sont des noms propres, et ils traversent
  // tels quels.
  "dishes[].boxes[].id (ASCII snake_case, English words only)",
  // ⟳ 2026-09-24 — `ingredients[].ref` N'EST PLUS DANS CETTE LISTE : le modèle
  // n'écrit plus d'identifiant, il NOMME (`renderCatalogBlock`), et la lane
  // identifie chaque aliment par son nom (`identifyPlanFoods`). L'annoncer ici
  // comme un jeton à garder contredirait « Do not write "ref" ».
  // ⟳ LOT D (2026-09-11) — LE NOM D'UN COMPOSANT ET SON RÔLE SONT DES JETONS,
  // et c'est le piège de `preparation_id` sur un cinquième champ. `part` est
  // comparé caractère pour caractère au `components[].id` du même bloc: un
  // « sauce » côté composant et un « la sauce » côté ligne ne se rapprochent
  // plus, et le bloc ENTIER retombe sur le traitement conservateur — c'est-à-
  // dire qu'il devient non ajustable, en silence, dans la seule langue qui
  // n'est pas l'anglais. Le rôle, lui, est comparé à `CULINARY_ROLES`.
  "dishes[].components[].id / .role / .part_of and ingredients[].part (ASCII snake_case, English words only)",
  "preparations[].components[].id / .role / .part_of and ingredients[].part (ASCII snake_case, English words only)",
];

/**
 * ⟳ 2026-09-05 — LE MOT SEUL NE SUFFISAIT PAS. « repetition they accept:
 * varied » est un mot; ce que le modèle en fait dépend de ce qu'on lui décrit.
 * Mesuré: un foyer keen/varied servi avec le même plat six fois et une seule
 * casserole par session. La consigne dit désormais le compromis attendu, et
 * nomme celui qu'on refuse.
 */
const RECIPE_LEVEL_HINT: Record<string, string> = {
  simple: " -- few steps, everyday ingredients, nothing that needs watching.",
  normal: " -- ordinary home cooking.",
  keen: " -- they LIKE cooking: real technique is welcome, and a session may " +
    "use its full time.",
};
const VARIETY_HINT: Record<string, string> = {
  repeat: " -- the same main dish may come back several times in the week; " +
    "fewer preparations is the right trade.",
  some: " -- a main dish may come back once or twice, never three days in a row.",
  varied: " -- no main dish twice in the week, and each cooking session makes " +
    "at least two different preparations; one pot eaten six times is the " +
    "wrong trade here.",
};

export function buildMealPrompt(args: {
  /**
   * FF-030 — LES CONTRAINTES DURES DE L'ÉLÈVE. `null` quand la lecture a
   * échoué; `[]` quand il n'en a aucune. Rendues EN TÊTE du message.
   *
   * ── CE QUE SON ABSENCE COÛTAIT, mesuré le 2026-08-08 ─────────────────────
   * `generate-meal-v1` chargeait bien `student_safety_constraints`, et ne les
   * passait qu'à `parseGeneratedMeal` — c'est-à-dire au VERROU DE SORTIE. Le
   * modèle composait donc à l'aveugle, et le verrou est BINAIRE: `clean` est
   * calculé sur la concaténation de TOUS les plats, donc un seul plat qui
   * touche l'allergène vide la semaine entière et rend `empty_meal` en 422.
   * L'élève allergique payait sa sécurité en semaines vides, sans explication.
   *
   * Les deux autres lanes injectaient déjà ce bloc (`week_plan_generation.ts`,
   * `sophia-brain/router/run.ts`), par la MÊME fonction. On copie le placement
   * plutôt que d'en inventer un: une seconde façon de rendre des contraintes
   * médicales divergerait de la première.
   *
   * REQUIS, `T | null`, jamais `T?` — voir `eatingRhythm` plus bas pour la
   * phrase que ce fichier a déjà payée trois fois. Ici la preuve d'un oubli
   * serait une assiette.
   */
  safetyConstraints: readonly StudentSafetyConstraint[] | null;
  /**
   * À QUI EST CHAQUE CONTRAINTE DURE — `null` quand il n'y a qu'une bouche.
   *
   * ── LE DÉFAUT QUE CE CHAMP FERME, mesuré le 2026-08-19 ────────────────────
   * Sur la lane FOYER, ce même bloc titrait « THIS STUDENT'S HARD CONSTRAINTS »
   * pour une tablée de quatre, et chaque ligne était `- pistachio — allergy…`,
   * détachée de sa bouche. Deux runs réels, deux erreurs opposées: l'un devine
   * juste par chance, l'autre met 120 g de l'allergène dans la boîte de
   * l'allergique et écrit l'avertissement sur l'assiette du voisin. Les DÉGOÛTS
   * du même prompt, eux (`- Peregrine: never serve fennel`), sont attachés et
   * appliqués 4 fois sur 4.
   *
   * REQUIS, `T | null`, jamais `T?` — même phrase que `safetyConstraints`
   * au-dessus et que `eatingRhythm` plus bas, et pour la même raison: ici la
   * preuve d'un oubli serait une assiette. La lane individuelle passe `null`
   * EXPRÈS, et rend alors un bloc byte-identique à celui d'avant ce lot.
   */
  safetyConstraintTable: SafetyConstraintTable | null;
  /**
   * FF-030 — CE QU'ON SAIT DE LEUR CORPS, ou `null` quand on ne sait rien (et
   * sur la lane FOYER, qui compose pour plusieurs personnes: il n'y a pas UN
   * corps, et en choisir un dimensionnerait l'assiette de tout le monde sur
   * lui).
   *
   * C'est ce qui dimensionne une portion. Le prompt système DEMANDAIT de
   * dimensionner (« a full lunch or dinner for one adult is a plate of roughly
   * 600 to 750 g ») et rien ne lui disait de qui: `height_cm` avait un écran,
   * une colonne, une contrainte de bornes et zéro lecteur.
   *
   * ⟳ LOT C (2026-09-11) — CETTE PHRASE N'EXISTE PLUS, et le champ reste. Le
   * prompt ne donne plus AUCUN poids d'assiette: il donne la FORME (un tiers de
   * féculent, un quart de protéine, un gras, les légumes par-dessus) et laisse
   * la masse au moteur. Le corps continue donc de dimensionner, mais il le fait
   * seul — plus aucune phrase générique ne peut le contredire.
   *
   * REQUIS, `T | null`, jamais `T?`, et le type porte sa propre garde: le
   * plancher TCA est un champ OBLIGATOIRE de `MealBodyContext` (FF-030 R5).
   */
  body: MealBodyContext | null;
  /**
   * FF-030 — L'AXE QUE L'ÉLÈVE VEUT VOIR MONTER, ou `null`.
   *
   * Sans lui, `performance` et `health` n'ont aucun indicateur de direction:
   * le jeton `goal` dit « santé » et s'arrête là, pendant que `fat_loss` dit
   * au moins « ça descend ». La colonne est collectée depuis le 2026-08-05 et
   * n'était même pas dans le `select` de cette lane.
   *
   * REQUIS, même raison que les deux ci-dessus.
   */
  focusAxis: WeeklyAxis | null;
  /**
   * FF-042 — LA CONSIGNE DE RÉGIME, ou `""` quand personne n'en a déclaré.
   *
   * ── CE QUE SON ABSENCE COÛTAIT, mesuré le 2026-08-18 ─────────────────────
   * `dietary_regime.ts` existe depuis FF-042: il étend un régime en groupes
   * exclus, écrit sa consigne (`dietaryRegimePromptLine`) et nomme ce qu'il
   * rend incouvrable. La lane FOYER le lit (`household_diet.ts`). La lane
   * INDIVIDUELLE n'en appelait que `uncoverableSentinelsFor` — le drapeau de
   * carence — et le mot `regime` n'apparaissait pas une seule fois dans ce
   * fichier. Autrement dit: **on posait la question à l'élève, on écrivait sa
   * réponse en base (`student_safety_constraints.diet_ref`), on en déduisait
   * qu'il lui manquerait de la B12 — et on lui composait du poulet.**
   *
   * C'est le même défaut, à la lettre, que celui que `household_diet.ts`
   * décrit en tête pour la lane foyer. On le ferme du même côté.
   *
   * ── POURQUOI UN BLOC DÉJÀ RENDU, ET PAS LE JETON DU RÉGIME ───────────────
   * Parce que les deux lanes n'ont pas la même phrase à écrire, et qu'une
   * seule d'entre elles peut la calculer:
   *   · solo — `dietaryRegimePromptLine(regime)`, tel quel;
   *   · foyer — `householdDietBlock`, qui ajoute ce que ce fichier ne peut
   *     pas savoir: quelle bouche est la plus stricte de la table, et qui
   *     reçoit son propre plat. Il est déjà rendu, par `userSuffix`.
   * Recalculer ici un régime depuis `safetyConstraints` produirait donc, sur
   * la lane foyer, une SECONDE phrase de régime dans le même prompt.
   *
   * REQUIS, `string` et jamais `T?` — la cicatrice est écrite au call site du
   * foyer, sur `safetyConstraints`: « c'est le paramètre REQUIS qui a rendu
   * cet appelant visible: le compilateur l'a listé. Optionnel, il aurait gardé
   * son trou. » Ici la preuve d'un oubli serait une assiette de viande servie
   * à quelqu'un qui a déclaré ne pas en manger.
   */
  dietBlock: string;
  doctrineBlock: string;
  /**
   * LE MAPPING ALIMENTAIRE DU COACH — `protocolBlockFor()`, vide s'il n'a rien
   * coché.
   *
   * Il est SÉPARÉ du bloc de doctrine, et ce n'est pas une commodité de
   * plomberie: la doctrine dit ce que le coach PENSE, le mapping dit avec quoi
   * il CONSTRUIT. Les fondre ferait deviner au modèle lequel est une conviction
   * qu'il peut citer à l'élève et lequel est une contrainte de composition.
   *
   * Obligatoire et pas optionnel — un appelant qui l'oublie compose des plats
   * en ignorant les trente pastilles que le coach a cochées, sans que rien
   * n'échoue. C'était exactement l'état du produit avant ce câblage.
   */
  protocolBlock: string;
  /** Les clés offertes, pour que `honours_belief_keys` soit vérifiable. */
  beliefKeys: readonly string[];
  goal: string;
  situation: string | null;
  /**
   * CE QU'ILS VEULENT VRAIMENT, DANS LEURS MOTS — `student_goals.aspiration`.
   *
   * ── POURQUOI ELLE ARRIVE ICI LE 2026-08-18 ──────────────────────────────
   * `/app/plan` la demande (« pourquoi ça compte pour toi — mieux qu'un
   * nombre »), la colonne la porte, et `generate-week-plan-v1` l'injecte
   * depuis toujours. La lane REPAS, elle, ne sélectionnait même pas la
   * colonne: mesuré sur le run réel `798c5cd6-…`, un élève qui venait
   * d'écrire son aspiration composait son plan sans qu'un caractère en
   * arrive. Le bloc `-- WHAT THEY ARE AFTER --` n'avait alors QUE le jeton
   * `goal`, un axe que plus aucune dynamique ne lève (`focus_axis`) et une
   * `situation` qu'aucun écran ne sait plus écrire — c'est-à-dire, pour tout
   * compte neuf, une seule ligne utile.
   *
   * ⚠️ MÊME PHRASE QUE LA LANE SEMAINE, VOLONTAIREMENT: elle vient de
   * `week_plan_generation.ts` mot pour mot, parce que deux formulations pour
   * le même champ dérivent, et c'est celle qui est la moins relue qui garde
   * l'ancienne. Ce qui change est ce qu'on en fait — ici, CHOISIR des plats,
   * là-bas, choisir des convictions.
   *
   * `null` = rien d'écrit ⇒ aucune ligne ajoutée (patron du bloc entier).
   */
  aspiration?: string | null;
  /** Le contexte du MOMENT, en prose libre. C'est la demande produit. */
  context: string | null;
  /**
   * CE DONT ILS ONT ENVIE POUR CETTE COMPOSITION — « mezze d'été, plein de
   * carottes ». Daté, tapé au moment de générer.
   *
   * À ne pas confondre avec `foodPreferences`, qui est ce qu'ils ont dit de leur
   * bouffe EN CONVERSATION et qui vaut pour toutes leurs semaines. L'un est une
   * envie, l'autre un goût.
   */
  preferences?: string | null;
  mode: MealMode;
  scope: MealScope;
  slot: MealSlot | null;
  servings: number;
  pantry: readonly PantryItem[];
  /** Le jeton du jour de l'élève, dans SON fuseau. Jamais celui du serveur. */
  todayToken?: string | null;
  /**
   * LA DATE DU JOUR, dans le fuseau de l'élève — et pas seulement le jour de la
   * semaine.
   *
   * « mercredi » ne dit pas si on est en février ou en août. Sans la date, rien
   * dans ce prompt ne permettait au modèle de savoir ce qui pousse en ce moment,
   * et il proposait des blanquettes en plein été.
   */
  today?: string | null;
  /**
   * LA DATE D'OUVERTURE DE LA FENÊTRE (ISO), dans le fuseau de l'élève.
   *
   * ⛔ ELLE EXISTE PARCE QUE LES JETONS DE JOUR NE SUFFISENT PAS À SITUER UNE
   * SEMAINE. `mon`…`sun` sont SEPT noms: ils ordonnent les jours d'une fenêtre,
   * ils ne disent pas DE QUELLE semaine il s'agit. Tant que le produit
   * n'acceptait qu'un départ dans la semaine en cours, « today is: wed » suffisait
   * à l'ancrer. Depuis le 2026-09-06, le départ est LIBRE (seul le passé est
   * refusé), et deux fenêtres peuvent porter exactement la même liste de jetons —
   * à sept jours d'écart, le premier jeton est même celui d'AUJOURD'HUI.
   *
   * ⚠️ C'EST DONC ELLE QUI REMPLACE LA GARDE RETIRÉE, et pas une reformulation
   * de plus. `windowStartsBeyondDayTokens` refusait `400 window_beyond_this_week`
   * pour que la contradiction n'atteigne jamais le modèle; on la rend maintenant
   * IMPOSSIBLE en nommant la date, au lieu d'interdire le geste qui la produit.
   * Voir la tombe dans `meal_plan_window.ts`.
   *
   * `null`/absent ⇒ aucune ligne, et la liste des jours reste ordonnée par
   * elle-même — le comportement d'avant ce lot pour tout appelant qui ne la
   * passe pas.
   */
  windowStartsOn?: string | null;
  /**
   * LE PAYS OÙ L'ÉLÈVE FAIT SES COURSES (ISO-3166 alpha-2), ou `null`.
   *
   * Une saison n'existe pas dans l'absolu: août est l'été en France et l'hiver
   * en Argentine, et sous l'équateur la question ne se pose pas dans ces termes.
   * On transmet donc le PAYS et la DATE — des faits — plutôt que « c'est
   * l'été », qui serait notre déduction et qu'on aurait tort d'imposer.
   */
  country?: string | null;
  /** ⟳ 2026-09-20 — vrai quand `country` est DÉDUIT de la langue, faute de `profiles.country`. */
  countryAssumed?: boolean;
  /**
   * CE QUE L'ÉLÈVE PEUT VRAIMENT FAIRE — `practical_constraints`.
   *
   * Quatre entrées qui décidaient de tout et que le moteur devinait: les jours
   * où il peut cuisiner, le temps par session, le niveau de recette, le budget.
   * Un plan parfait et inapplicable est la première cause d'abandon.
   */
  cookDays?: readonly string[];
  cookingTimeMin?: number | null;
  recipeDifficulty?: string | null;
  variety?: string | null;
  /**
   * LES MOYENS DE CUISSON DÉCLARÉS — `practical_constraints.kitchen_equipment`.
   *
   * ⚠️ TROIS VALEURS, ET LA TROISIÈME EST LA GARDE. `null` = « on ne lui a
   * jamais posé la question » ⇒ AUCUNE ligne, prompt identique à avant ce lot
   * pour tous les comptes d'avant. Le tableau déclaré ⇒ ce qui n'y est pas est
   * déclaré ABSENT, et `kitchenEquipmentPromptLines` l'interdit nommément.
   *
   * `?:` À CONTRE-COURANT DE `fixedIntakes`/`dayProperties`, ET C'EST MOTIVÉ:
   * `buildMealPrompt` a DEUX appelants, et le second est la lane foyer, hors
   * du périmètre de ce lot (son prompt expire à 4 min, chaque bloc ajouté s'y
   * paie). Un paramètre requis forcerait une édition dans son fichier. Le
   * risque que ce lot-ci l'oublie est tenu par un test de SOURCE sur le site
   * d'appel solo — `kitchen_equipment_solo_lane_test.ts`, patron
   * `dietary_regime_solo_lane_test.ts`.
   */
  kitchenEquipment?: readonly KitchenTool[] | null;
  /**
   * L'ARGENT DE CE PLAN-LÀ, EN CHIFFRE — dans la monnaie du pays de l'élève,
   * que `country` ci-dessus porte déjà.
   *
   * ── CE QUE C'ÉTAIT: `budgetBand`, « tight / normal / comfortable » ────────
   * Le mot partait au modèle tel quel, et il ne dit rien: « serré » pour une
   * personne seule et « serré » pour une table de cinq ne désignent ni la même
   * somme ni le même arbitrage. Or c'est l'arbitrage qui est demandé — quand
   * il n'y a pas d'argent, on ne « fait pas attention », on renonce à la
   * viande. Un montant se compare à un panier; un adjectif ne se compare à
   * rien.
   *
   * ⚠️ PROPRIÉTÉ REQUISE, VALEUR NULLABLE, ET LA DISTINCTION EST LA GARDE.
   * `budgetBand` était `?:` — un appelant pouvait l'oublier, et la ligne de
   * prompt disparaissait sans que rien n'échoue. C'est la cicatrice
   * `safetyBand` du dépôt, à l'identique. Ici l'absence doit être ÉCRITE:
   * `null` est une réponse (« cette composition n'a pas de budget »), une
   * propriété manquante ne compile pas.
   */
  budgetAmount: number | null;
  /**
   * ⛔ LE PLANCHER DE CE PLAN-LÀ — sous lui, le plafond ne s'écrit PAS.
   *
   * ── POURQUOI UN PLAFOND IMPOSSIBLE EST PIRE QU'AUCUN PLAFOND ─────────────
   * Le modèle ne refuse jamais un budget: il COUPE, dans l'ordre que la ligne
   * suivante lui donne, et quand l'ordre ne suffit plus il rend un plan qui a
   * l'air de tenir. « budget for this plan: 1 » pour sept jours à quatre fait
   * donc arbitrer toute la composition contre une contrainte imaginaire, et le
   * seul poste qui reste à rogner est celui que tout le reste de ce prompt
   * calcule. Ne rien dire rend un plan honnête; dire l'impossible rend un
   * mensonge.
   *
   * ⚠️ PROPRIÉTÉ REQUISE, VALEUR NULLABLE — la même distinction que
   * `budgetAmount` juste au-dessus, et pour la même cicatrice (`safetyBand`).
   * `null` est une réponse: « cette demande n'a pas de plancher » (hors des
   * deux marchés de la grille de prix, ou rien à nourrir). Une propriété
   * manquante, elle, ne compile pas — et c'est ce qui a fait remonter les deux
   * appelants au compilateur.
   *
   * ⛔ ET CE N'EST PAS UN REFUS. La fonction edge continue de composer: le
   * refus appartient au CHAMP, sur les deux écrans qui composent, parce que
   * c'est le seul endroit où quelqu'un peut corriger sa réponse. Ici on cesse
   * seulement de faire semblant.
   */
  budgetFloor: number | null;
  /**
   * CE QUE L'ÉLÈVE A DIT SUR SA BOUFFE, promu depuis la conversation.
   *
   * ── POURQUOI C'EST UN ARGUMENT NOMMÉ ICI, ET PAS UN JSONB ─────────────
   * `generate-week-plan-v1` sérialise `practical_constraints` en entier, donc
   * il verrait cette clé sans rien changer. Ce générateur-ci lit des clés
   * NOMMÉES (`eating_rhythm`, capacité de cuisine): une clé de plus y est
   * invisible tant que personne ne la passe. C'est exactement le défaut que
   * `coach_food_rules` a produit — un écran, des gardes, trente tests, et
   * aucun lecteur au runtime.
   *
   * Vide = l'élève n'a rien confirmé, et le prompt est celui d'avant.
   */
  foodPreferences?: readonly string[];
  /**
   * CE QUE L'ÉLÈVE A TAPÉ LUI-MÊME — des consignes, pas des préférences.
   *
   * Même source que `foodPreferences` (`food_preferences`), mais l'autre
   * seau de `foodPreferencesByOrigin`: ces lignes-là portent
   * `origin.source === "written"`.
   *
   * ── OPTIONNEL, ET LA GARDE EST AILLEURS — C'EST UNE DÉCISION ──────────
   * Le commentaire de `foodPreferences` raconte pourquoi une clé NOMMÉE de
   * plus est invisible tant que personne ne la passe, et cite
   * `coach_food_rules` comme le mort de cette famille: un écran, des gardes,
   * trente tests, aucun lecteur au runtime. `coachNoteBlock` en tire un champ
   * REQUIS, pour que la casse de compilation recense les appelants.
   *
   * Ici la même leçon donne l'inverse, et il faut voir pourquoi. Un champ
   * requis prouve qu'un appelant a ÉCRIT `writtenInstructions: <quelque
   * chose>` — y compris `[]`, qui est très exactement l'état débranché qu'on
   * craint. Il recense les signatures, pas les branchements.
   *
   * Ce qui tient vraiment cette lane est dans `household_voices_test.ts`: un
   * test qui LIT la source de `generate-meal-v1` et exige d'y trouver
   * `writtenInstructions: readFoodPreferences(`. Celui-là rougit sur un `[]`
   * de complaisance, ce que le typage ne saurait pas faire. Il est donc
   * strictement plus fort, et le champ n'a pas besoin d'être requis pour être
   * gardé.
   *
   * Le `?? []` du corps suit: les fixtures tournent en `--no-check`, et un
   * champ absent y donnerait un `TypeError` sur `.length` — un rouge qui ne
   * dit pas ce qu'il veut.
   */
  writtenInstructions?: readonly string[];
  /**
   * ── LOT M4 · LE MÉMO — cinq lignes, pour ce qu'aucune famille ne porte ─────
   *
   * `[]` quand il est vide, ce qui est le cas ordinaire. Les textes SEULS: ni
   * date, ni source, ni citation — le modèle compose, il n'a pas à savoir d'où
   * vient une consigne, et lui donner la phrase source la lui ferait lire deux
   * fois.
   *
   * ⛔ C'EST LE SEUL BLOC DE TEXTE LIBRE SANS FAMILLE QUE CE PROMPT REÇOIT, et
   * c'est pour ça qu'il est PLAFONNÉ À CINQ à la source (`MEMO_MAX_LINES`).
   * Un champ texte caché, sans plafond, injecté dans chaque prompt est
   * exactement le magasin que ce chantier supprime, avec un autre chapeau — et
   * la chose la plus difficile à déboguer du produit.
   */
  memo?: readonly string[];
  /**
   * LA NOTE DU COACH SUR CET ÉLÈVE — mode 1:1 assumé, `null` quand il n'y en a
   * pas (le cas ordinaire). Produit par `coachNotePromptBlock`.
   *
   * REQUIS, `T | null`, jamais `T?` — contrairement à `foodPreferences` juste
   * au-dessus, et exprès. Le commentaire de `foodPreferences` explique
   * pourquoi une clé NOMMÉE de plus est invisible ici tant que personne ne la
   * passe, et cite `coach_food_rules` comme le mort de cette famille. Un champ
   * optionnel signerait le même défaut une deuxième fois, dans le fichier qui
   * le documente.
   */
  coachNoteBlock: string | null;
  /** Les jours à remplir, à partir d'aujourd'hui. Vide = le modèle décide. */
  daysToFill?: readonly string[];
  /**
   * Les moments d'une journée NORMALE pour cet élève. Vide = il ne l'a pas dit,
   * et on retombe sur les trois repas que le moteur imposait jusqu'ici.
   */
  eatingRhythm?: readonly EatingOccasionSlot[];
  /**
   * Les moments où l'élève NE MANGE PAS ICI. Vide = il mange tout ce que son
   * rythme nomme, tous les jours de la fenêtre.
   */
  awayDays?: readonly AwayDay[];
  /**
   * FF-051 — CE QUE L'ÉLÈVE MANGE DÉJÀ, hors de ce qu'on compose.
   *
   * REQUIS, avec `[]` pour « aucun », jamais `T?`. C'est la CINQUIÈME fois que
   * ce fichier écrit cette phrase, et il l'a payée les quatre précédentes
   * (`eatingRhythm`, `awayDays`, `cookingTimeMin`, `composition`): un paramètre
   * optionnel est un paramètre qu'un appelant oublie. Ici l'oubli coûte un
   * petit-déjeuner de trop tous les matins, à quelqu'un qui avait pris la peine
   * de le dire — et rien n'échouerait.
   */
  fixedIntakes: readonly FixedIntake[];
  /**
   * FF-052 — CE QUE CERTAINS JOURS SONT, en positif.
   *
   * REQUIS, `[]` pour « rien de déclaré ». Sixième fois que ce fichier écrit
   * cette phrase; l'oubli coûterait ici un dîner neuf composé un jour de
   * restes, c'est-à-dire la moitié d'un batch jetée.
   */
  dayProperties: readonly DayPropertyEntry[];
  /**
   * L4/D6 — LA BOUCHE REPRISE PAR LA FUSION, ou `null`.
   *
   * ⚠️ REQUIS, `T | null`, jamais `T?`, et la raison est MESURÉE. La fusion
   * ajoute des plats PAR CONSTRUCTION: sans ce champ, le même prompt annonce
   * « au plus 15 plats » et « donne-lui un SECOND plat ». Un champ facultatif
   * n'aurait fait remonter AUCUN appelant au compilateur — et le jour où une
   * troisième lane apparaît, elle hériterait du budget d'une table qui n'a pas
   * la bouche qu'on lui a ajoutée. Chaque appelant DIT ce qu'il veut.
   */
  merge: MergedEater | null;
  /**
   * LE PREMIER JOUR DE LA FENÊTRE EST-IL ENCORE CUISINABLE ?
   *
   * ── LE TROU QU'IL FERME ──────────────────────────────────────────────────
   * La branche `tooLate`, plus bas, ajoute d'office une session de cuisine sur
   * le PREMIER jour de la fenêtre quand tous les jours déclarés tombent après
   * lui. C'est juste — sauf à 21 h: on demande alors à quelqu'un de faire ses
   * courses dans un magasin fermé puis de cuisiner un lot, ce soir. La branche
   * vise alors le jour SUIVANT.
   *
   * ⚠️ REQUIS ET SANS DÉFAUT, `boolean`. `true` est une AFFIRMATION (« ce
   * premier jour est encore cuisinable »), pas un repli: un appelant qui
   * n'aurait pas su lire l'horloge doit le dire en passant `true` — le
   * comportement d'hier — et pas l'hériter d'un `?`. Septième fois que ce
   * fichier écrit cette phrase.
   *
   * Le calcul appartient à `plan_hours.ts::firstWindowDayIsCookable`, avec la
   * coupure nommée; il n'est PAS recopié ici. Une seconde définition de « 18 h »
   * dériverait de la première le jour où quelqu'un la change.
   */
  firstDayCookable: boolean;
  /**
   * CE FOYER A-T-IL DÉCLARÉ UN CONGÉLATEUR ? — 2026-09-01.
   *
   * ⛔ REQUIS, ET IL NE SE DÉRIVE PAS DE `kitchenEquipment` PLUS BAS. Celui-là
   * est OPTIONNEL et la lane FOYER ne le passe délibérément pas (elle écrit son
   * propre bloc de cuisine dans son enveloppe, et un test l'y tient pour éviter
   * la consigne en double). Le déduire ferait donc `hasFreezer: false` pour
   * TOUS les foyers — c'est-à-dire nommer hors de portée des journées que le
   * congélateur rend parfaitement atteignables, et défaire sur cette lane le
   * lot qui vient de les sauver.
   *
   * ⚠️ LES DEUX LANES LE CALCULENT PAR `hasFreezerDeclared()`, jamais à la
   * main: `false` (pas de congélateur) et `null` (jamais demandé) doivent
   * rendre le même `false`, et c'est cette fonction-là qui le garantit.
   */
  hasFreezer: boolean;
  /**
   * ═════════════════════════════════════════════════════════════════════════
   * LA CADENCE DE COURSES, TELLE QUE LE MOTEUR L'A DÉRIVÉE — 2026-09-09.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * ⛔ REQUIS ET NULLABLE, jamais `?`. Neuvième fois que ce fichier écrit cette
   * phrase, et le cas mesuré est exactement celui qu'un `?` aurait laissé
   * passer: le plan de cuisine (`cooking_plan.ts`) savait « une course, trois
   * sessions, congélateur », le moteur des vagues congelait la dinde à
   * l'achat — et la consigne, qui n'en savait rien, faisait écrire au modèle
   * « acheter la dinde fraîche le jour même ». `usesFreezer` n'avait AUCUN
   * lecteur côté prompt.
   *
   * `null` = la cadence n'a jamais été déclarée (`capacity.plan === null`):
   * le bloc de la fenêtre crue est alors celui d'avant ce lot, au caractère
   * près. Sinon: la lecture de `capacity.plan`, jamais un second calcul.
   */
  groceryCadence: RawReachCadence | null;
  /**
   * ═════════════════════════════════════════════════════════════════════════
   * « TOUT DANS UNE SESSION DE CUISINE » — LA DEMANDE, 2026-09-01.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * ⛔ REQUIS ET SANS DÉFAUT, `boolean`. Un `?` aurait laissé passer les deux
   * lanes sans un mot du compilateur, et l'option se serait construite sans
   * être branchée — huitième fois que ce fichier écrit cette phrase.
   *
   * ⚠️ IL EST DÉJÀ TRANCHÉ QUAND IL ARRIVE ICI. L'appelant fait
   * `askedOneSession && hasFreezerDeclared(equipment)`; ce module ne refait pas
   * la porte. La raison est la même que pour `hasFreezer` juste au-dessus: une
   * seconde lecture de l'inventaire à cet endroit finirait par diverger de
   * celle qui compte, et c'est toujours celle qu'on regarde le moins qui garde
   * l'ancien comportement.
   *
   * ⚠️ CE N'EST PAS UN RÉGLAGE DE PROFIL. Il voyage avec la demande, comme le
   * budget et le mode de cuisson: « cette semaine-ci, je cuisine une fois » est
   * un arbitrage de semaine, et l'écrire dans `practical_constraints` le
   * rejouerait en silence sur celle où on reçoit du monde.
   */
  oneCookingSession: boolean;
  /**
   * ═════════════════════════════════════════════════════════════════════════
   * LE JOUR OÙ L'ON CUISINE ET OÙ RIEN NE SE MANGE — « je cuisine la veille ».
   * ═════════════════════════════════════════════════════════════════════════
   *
   * `null` = pas de veille, et le prompt est alors byte-identique à celui
   * d'avant ce lot. Sinon: un jeton de jour, TOUJOURS le premier de
   * `daysToFill`, accordé par `withCookDayBefore` (`meal_plan_window.ts`).
   *
   * ⛔ REQUIS ET NULLABLE, jamais `?`. Un champ facultatif ici aurait laissé
   * passer les deux lanes sans un mot du compilateur, et la veille se serait
   * construite sans atteindre le modèle — le plan aurait alors composé des
   * REPAS sur le jour de cuisine, et le parseur les aurait jetés.
   *
   * ⚠️ IL RESTE DANS `daysToFill`, ET C'EST OBLIGATOIRE. La fenêtre du cuit
   * compte les rangs sur `daysToFill`: en retirer la veille placerait la
   * casserole du jour 0 HORS fenêtre, donc `not_evaluated` — dont le seuil est
   * zéro. Il est retiré de ce que le modèle doit REMPLIR, jamais de ce qui
   * situe les jours les uns par rapport aux autres.
   */
  cookOnlyDay: string | null;
  /**
   * CETTE LANE RÉCLAME-T-ELLE DES CONTENANTS SANS NOM ? — 2026-09-01.
   *
   * `true` sur la lane INDIVIDUELLE, `false` sur la lane FOYER — qui a son
   * propre bloc (`boxSchemaBlock`, avec les `member_ids`) dans son enveloppe.
   *
   * ⛔ REQUIS ET SANS DÉFAUT. Les deux lanes doivent le DIRE: un `?` aurait
   * donné le bloc à personne (le défaut d'aujourd'hui) ou aux deux (deux
   * protocoles de boîte dans le même prompt, l'un nommant des bouches que
   * l'autre déclare inexistantes).
   */
  soloBoxes: boolean;
  /**
   * ⟳ 2026-09-07 — LE MODÈLE A-T-IL ÉCRIT UNE RECETTE STANDARD ? (v33)
   *
   * `true` quand le prompt lui a demandé UNE portion par plat et interdit les
   * boîtes: la relecture change alors sur deux points, et seulement deux.
   *
   * ⛔ REQUIS ET SANS DÉFAUT, comme `soloBoxes` juste au-dessus. Un `?` ferait
   * relire une sortie v33 avec les règles de v32 — c'est-à-dire jeter les
   * casseroles d'une seule portion, qui sont le CAS NOMINAL de v33.
   */
  standardRecipe: boolean;
  /**
   * LA LANGUE DANS LAQUELLE CES PLATS SONT ÉCRITS. REQUIS, jamais `T?`.
   *
   * Vient de `resolveArtifactLocale({studentProfile, tenantDefault})`, donc de
   * `profiles.locale` — la langue CHOISIE, celle que l'agent parle. Pas de
   * `student_goals.content_locale`, qui est la langue dans laquelle l'élève a
   * écrit sa situation (R3, troisième axe) et que tous ses écrivains sèment
   * `'en-GB'`.
   */
  contentLocale: string;
}): { systemPrompt: string; userMessage: string; contentLocale: string } {
  const rhythm = args.eatingRhythm && args.eatingRhythm.length > 0
    ? args.eatingRhythm
    : DEFAULT_EATING_RHYTHM;
  // `rhythm` RÉSOLU, jamais `args.eatingRhythm` brut: le plafond doit être celui
  // des moments que le prompt NOMME trois lignes plus haut. Passer le brut a
  // déjà produit la divergence exacte que `dishCapFor` documente — la consigne
  // demandait trois plats, le plafond en autorisait quatre.
  //
  // DEUX NOMBRES, ET ILS NE MESURENT PAS LA MÊME CHOSE.
  //   · `cap`     — les PLATS. Il compte la bouche reprise par la fusion, qui
  //                 en demande de son côté (`dishBudgetFor`).
  //   · `baseCap` — les SESSIONS, plus bas. Il ne la compte PAS, et c'est le
  //                 sujet: le barreau ② promet mot pour mot « one session at
  //                 the stove, two dishes out of it ». Dériver le budget de
  //                 sessions du plafond GONFLÉ contredirait la consigne servie,
  //                 dans le même message. Le barreau ③, lui, réclame bien une
  //                 session à part — elle se prend dans un budget qui est un
  //                 PLAFOND et non une cible (mesuré: 5 autorisées, 2 à 3
  //                 utilisées). Si un run montre que ③ manque de place, c'est
  //                 ici, en une ligne, que ça se répare.
  // ══════════════════════════════════════════════════════════════════════
  // LES JOURS À REMPLIR ≠ LES JOURS DE LA FENÊTRE — « je cuisine la veille »
  // ══════════════════════════════════════════════════════════════════════
  //
  // La veille est DANS la fenêtre (elle situe les casseroles, voir le pavé de
  // `cookOnlyDay`) et HORS des jours à remplir (rien ne s'y mange). Les deux
  // listes se séparent donc ici, une fois, et chaque lecteur prend la sienne:
  //
  //   · `daysToFill`  → les rangs, la fenêtre du cuit, les jours de cuisine;
  //   · `daysToEat`   → la commande faite au modèle, et le PLAFOND de plats.
  //
  // ⛔ LE PLAFOND SUIT `daysToEat`, ET C'EST LA MOITIÉ QUI COMPTE. Le laisser
  // sur la fenêtre entière autoriserait un jour de repas de plus que le plan
  // n'en porte — et le modèle remplit ce qu'on lui autorise: il aurait écrit
  // des plats sur le jour de cuisine, que le parseur jette ensuite.
  const windowDays = args.daysToFill ?? [];
  const daysToEat = args.cookOnlyDay === null
    ? windowDays
    : windowDays.filter((d) => d !== args.cookOnlyDay);
  const baseCap = dishCapFor(args.scope, rhythm, daysToEat.length || 7);
  const cap = dishBudgetFor({
    scope: args.scope,
    rhythm,
    daysToFill: daysToEat.length || 7,
    merge: args.merge,
  });
  // ══════════════════════════════════════════════════════════════════════
  // LA GRILLE — LES CASES À REMPLIR, ÉNUMÉRÉES
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ ELLE SORT D'`emptySlotsIn`, APPELÉE AVEC ZÉRO PLAT, ET C'EST LE POINT.
  // Le constat de trous (`shown_plan_gaps`) et le contrôle final comptent déjà
  // leur grille avec cette fonction-là; un second calcul ici aurait divergé au
  // premier absent, au premier apport fixe ou au premier jour de cuisine — et
  // la consigne aurait alors réclamé des cases que le contrôle ne compte pas.
  //
  // ⚠️ `cookOnlyDay: null` PARCE QUE `daysToEat` L'A DÉJÀ RETIRÉ. Le repasser
  // ici le retirerait deux fois, ce qui est inoffensif aujourd'hui et faux le
  // jour où `daysToEat` cesse de le filtrer.
  const cellsToFill = emptySlotsIn({
    days: daysToEat,
    cookOnlyDay: null,
    rhythm,
    dishes: [],
    awayDays: args.awayDays ?? [],
    fixedIntakes: args.fixedIntakes,
  });
  // Les absences, en prose, une ligne par jour. Calculées ici pour être
  // insérées plus bas dans la même liste que le reste des contraintes.
  const awayLines = (args.awayDays ?? []).map((a) =>
    a.slots.length === 0
      ? `- ${dayProse(a.day)}: the whole day`
      : `- ${dayProse(a.day)}: ${a.slots.map((s) => OCCASION_PROSE[s]).join(", ")}`
  );
  const pantryLines = args.pantry
    .map((p) => (p.quantity ? `- ${p.term} (${p.quantity})` : `- ${p.term}`))
    .join("\n");

  // ── LES CONTRAINTES DURES, EN TÊTE ────────────────────────────────────────
  // Même placement que `buildWeekPlanPrompt`, et pour la raison qui y est
  // écrite: si le budget de prompt tronque quoi que ce soit, ce n'est pas la
  // ligne qui dit « pas d'arachide » qui doit sauter.
  const safetyBlock = safetyConstraintsPromptBlock(
    args.safetyConstraints,
    args.safetyConstraintTable,
  );

  // Le corps, en deux blocs qui atterrissent à deux rangs différents. Le
  // plancher TCA est appliqué DANS `mealBodyBlocks`, pas ici (FF-030 R5).
  const bodyBlocks = mealBodyBlocks(args.body);

  // ── LES CONTRAINTES DE CUISINE, calculées ici pour être posées sous
  //    `-- WHAT THEY CAN COOK --` ────────────────────────────────────────────
  // LES JOURS DE CUISINE, INTERSECTÉS AVEC LA FENÊTRE. Mesuré: un élève qui
  // déclare cuisiner « dimanche et mercredi », plan généré un JEUDI, recevait
  // une session le MERCREDI — un jour déjà passé. Ses jours de cuisine sont
  // une propriété de sa semaine type; la fenêtre est ce qu'il en reste, et
  // c'est l'intersection qui est exécutable.
  //
  // L'INTERSECTION VIDE RETOMBE SUR LA FENÊTRE, jamais sur rien: quelqu'un
  // qui ne cuisine que le lundi, un vendredi, doit quand même manger. Mieux
  // vaut une session posée un jour non déclaré — qu'il déplacera — qu'un plan
  // sans aucun jour de cuisine.
  //
  // ⚠️ LE COMMENTAIRE HISTORIQUE DE CE BLOC A DÉMÉNAGÉ dans `addedCookDays`,
  // avec le calcul qu'il décrit.
  // ══════════════════════════════════════════════════════════════════════
  // « TOUT DANS UNE SESSION DE CUISINE » — 2026-09-01
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⚠️ CALCULÉ ICI, ET LU PAR TROIS BLOCS. Le jour de la session unique décide
  // la consigne (juste en dessous), les journées hors de portée
  // (`daysOutOfBatchReach`) et le plafond de temps (`sessionCeilingMinutes`).
  // Le recalculer dans chacun ferait trois réponses à une seule question, et
  // c'est celle qu'on regarde le moins qui garderait l'ancienne.
  //
  // ⛔ L'UNION, JAMAIS LES SEULS JOURS DÉCLARÉS. `addedCookDays` vient
  // peut-être de poser le seul jour cuisinable de la fenêtre; l'ignorer rendrait
  // `null` — donc une session sans jour nommé — là où le moteur en a justement
  // un. C'est la même union que `daysOutOfBatchReach` réclame, et elle était
  // écrite deux fois en ligne: elle l'est maintenant une seule.
  const effectiveCookDays = [
    // ⛔ LA VEILLE EST UN JOUR DE CUISINE, ET C'EST LE SEUL QU'ELLE SOIT. Sans
    // cette ligne, un plan « je cuisine la veille » n'aurait AUCUN jour de
    // cuisine connu: `singleSessionCookDay` rendrait `null` (donc une session
    // sans jour nommé, alors qu'on vient de l'ajouter exprès) et
    // `daysOutOfBatchReach` se tairait sur une fenêtre dont il sait tout.
    ...(args.cookOnlyDay === null ? [] : [args.cookOnlyDay]),
    ...usableCookDays({
      declared: args.cookDays ?? [],
      window: args.daysToFill ?? [],
    }),
    ...addedCookDays({
      declared: args.cookDays ?? [],
      window: args.daysToFill ?? [],
      firstDayCookable: args.firstDayCookable,
    }),
  ];
  const singleSessionDay = args.oneCookingSession
    ? singleSessionCookDay({
      window: args.daysToFill ?? [],
      cookDays: effectiveCookDays,
    })
    : null;

  const cookDayLines = ((): string[] => {
    const window = args.daysToFill ?? [];
    const declared = args.cookDays ?? [];
    // ══════════════════════════════════════════════════════════════════
    // ⛔ L'OPTION REMPLACE CETTE CONSIGNE, ELLE NE S'Y AJOUTE PAS.
    // ══════════════════════════════════════════════════════════════════
    //
    // « they can only cook on: sun, wed » et « tout tient dans UNE session »
    // se contrediraient à trois lignes d'écart, et le run réel du 2026-09-01
    // a déjà montré ce que le modèle fait de deux consignes concurrentes: il
    // suit la plus permissive et le parseur jette la différence.
    //
    // ⚠️ ELLE PASSE AUSSI AVANT LE `declared.length === 0`. Quelqu'un qui n'a
    // coché aucun jour et qui demande une session unique demande quand même
    // UNE session: se taire ici lui rendrait le plan d'avant l'option, sans
    // qu'un seul mot ne le dise.
    if (args.oneCookingSession) {
      return [
        singleSessionDay
          ? `they want ALL the cooking for this stretch done in ONE session, ` +
            `on ${singleSessionDay}. Write exactly ONE entry in ` +
            `"cooking_sessions", on that day, and cook every preparation in ` +
            `it. No second cooking day, and nothing cooked on any other day ` +
            `beyond what a plate needs on the spot.`
          : `they want ALL the cooking for this stretch done in ONE session. ` +
            `Write exactly ONE entry in "cooking_sessions", as early in the ` +
            `stretch as you can, and cook every preparation in it. No second ` +
            `cooking day, and nothing cooked on any other day beyond what a ` +
            `plate needs on the spot.`,
        // ⚠️ LA CLÉ EST NOMMÉE, ET COLLÉE À SA PROMESSE. `kept: "freezer"`
        // existe depuis v20 et RIEN ne la réclamait: mesuré le 2026-09-01, le
        // modèle écrivait « FREEZE the rest » trois fois en prose et laissait
        // la clé vide — la prose ne garde rien, et huit repas sur vingt-et-un
        // étaient jetés. Une session unique ne tient QUE si cette clé est
        // écrite, donc elle est réclamée ici, en toutes lettres.
        `they have a freezer, and it is the only reason one session can feed ` +
        `this stretch: every serving eaten more than ${MAX_FRIDGE_DAYS - 1} ` +
        `days after that session MUST carry "kept": "freezer" on its entry in ` +
        `"uses". Saying it in the method is NOT enough -- a serving without ` +
        `that key is kept in the fridge, and it will be thrown away.`,
      ];
    }
    if (declared.length === 0) return [];
    // ⚠️ LA MÊME EXPRESSION QUE L'EXPLICATION, appelée. Ce filtre était écrit
    // ici, en ligne, et `plan_rationale` ne pouvait pas le lire: il affirmait
    // donc que les jours écartés avaient été « gardés ». Voir le pavé de
    // `usableCookDays`.
    const usable = usableCookDays({ declared, window });

    // ── LA CONTRAINTE DOIT RESTER SATISFAISABLE ─────────────────────────
    // MESURÉ: jours déclarés `sun, wed`, fenêtre jeudi→dimanche.
    // L'intersection ne laisse que DIMANCHE — le dernier jour. Le modèle a
    // donc fait manger jeudi, vendredi et samedi sur un lot cuisiné le
    // dimanche: quatre repas antérieurs à leur propre cuisson. Quatre
    // `issues` sur un vrai plan, et un plan inexécutable.
    //
    // Un jour de cuisine qui arrive APRÈS les repas qu'il doit nourrir n'est
    // pas une contrainte, c'est une impasse. On ajoute donc le PREMIER jour
    // de la fenêtre — et on DIT que c'est un ajout, pour que le modèle
    // n'aille pas croire que l'élève l'a déclaré. Le pire cas est une session
    // posée un jour non déclaré, qu'il déplacera; l'autre pire cas est une
    // semaine qu'il ne peut pas cuisiner.
    //
    // ⚠️ LE CALCUL VIT DANS `addedCookDays`, ET C'EST LA MOITIÉ QUI COMPTE.
    // La phrase ci-dessous demande au modèle de DIRE que le jour est un ajout;
    // le run réel du 2026-08-12 montre qu'il ne l'a pas dit. `plan_rationale`
    // le dit désormais de façon déterministe — et il doit nommer EXACTEMENT le
    // jour que cette consigne a demandé. Deux calculs du même ajout
    // divergeraient, et c'est l'explication qui aurait tort.
    const added = addedCookDays({
      declared,
      window,
      firstDayCookable: args.firstDayCookable,
    });
    const first = added[0];
    const tooLate = added.length > 0;

    if (usable.length === 0) {
      return [
        `they usually cook on ${declared.join(", ")}, but none of those days ` +
        "are left in this stretch. Put the cooking sessions on the days you " +
        "do have, as early as possible.",
      ];
    }
    if (tooLate) {
      return [
        `they usually cook on ${usable.join(", ")} -- all of which fall after ` +
        `${first}, so nothing cooked then can feed the days before it. Cook ` +
        `on ${first} as well, and say so: it is a day they did not ask for. ` +
        "Everything before their usual day is cooked fresh, not from a batch.",
      ];
    }
    return [
      `they can only cook on: ${usable.join(", ")}. Put every cooking ` +
      "session on those days, and no others.",
    ];
  })();

  // ══════════════════════════════════════════════════════════════════════
  // LES JOURS QU'AUCUN LOT N'ATTEINT, NOMMÉS — 2026-09-01
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LA RÈGLE GÉNÉRALE EXISTAIT DÉJÀ, ET ELLE NE MORDAIT PAS. Le bloc
  // `== NOTHING IS EATEN BEFORE IT IS COOKED ==` dit, mot pour mot, que jeudi,
  // vendredi et samedi ne peuvent pas vivre d'un lot du dimanche. Mesuré le
  // 2026-09-01 sur « une session, sept jours »: le modèle a quand même écrit
  // huit plats qui puisent dans la casserole du dimanche, et le parseur les a
  // jetés — quatre journées réduites à leur petit-déjeuner.
  //
  // C'est la leçon d'`addedCookDays`, resservie: une règle générale ne se
  // compare pas, un jour NOMMÉ si. Ces jours-ci sont calculés, et par la MÊME
  // comparaison que la porte qui jette — `daysOutOfBatchReach` documente
  // pourquoi le `>=` doit être identique des deux côtés.
  //
  // ⛔ ET ON N'AJOUTE AUCUNE SESSION. Une session de plus est une vague de
  // courses de plus; la personne a dit ce qu'elle pouvait faire. C'est le
  // CONTENU de ces jours-là qui s'adapte — voir l'en-tête de
  // `plan_feasibility.ts`.
  const outOfReach = daysOutOfBatchReach({
    window: args.daysToFill ?? [],
    // L'UNION, jamais les seuls jours déclarés: `addedCookDays` vient peut-être
    // d'en poser un, et l'ignorer déclarerait hors de portée une journée que le
    // moteur rend justement atteignable. Elle est calculée plus haut, une fois.
    //
    // ⚠️ ET L'OPTION LA RÉDUIT À SON SEUL JOUR. Lire les trois jours cochés
    // pendant que la consigne n'en autorise qu'un ferait taire cette ligne sur
    // des journées que le plan ne pourra pas nourrir — le contraire exact de ce
    // pour quoi elle existe. `[]` quand aucun jour n'est connu: le module rend
    // alors `[]` lui aussi, et c'est la seule affirmation vraie (voir son
    // en-tête).
    cookDays: args.oneCookingSession
      ? (singleSessionDay === null ? [] : [singleSessionDay])
      : effectiveCookDays,
    hasFreezer: args.hasFreezer,
    maxFridgeDays: MAX_FRIDGE_DAYS,
    freezerWindowDays: FREEZER_WINDOW_DAYS,
  });

  // Le plafond de débordement, calculé UNE fois. `null` = pas de tension, et le
  // plafond déclaré reste le plafond, mot pour mot.
  const usableCookDayCount = usableCookDays({
    declared: args.cookDays ?? [],
    window: args.daysToFill ?? [],
  }).length;
  const sessionCeiling = sessionCeilingMinutes({
    cookingTimeMin: args.cookingTimeMin ?? null,
    outOfReachDays: outOfReach.length,
    cookDayCount: usableCookDayCount,
    // ⛔ SANS CETTE LIGNE, L'OPTION LIVRAIT DES JOURNÉES VIDES EN SILENCE. Avec
    // un congélateur, `outOfReach` est VIDE (la fenêtre congelée couvre le plan
    // entier), donc l'ancienne condition rendait `null` — et les trente minutes
    // déclarées restaient un plafond sec sur la seule session de la semaine.
    // Voir le pavé de `sessionCeilingMinutes`.
    singleSessionAsked: args.oneCookingSession,
  });

  const canCookLines = [
    ...cookDayLines,
    // ⚠️ SOUS LES JOURS DE CUISINE, PAS AILLEURS. Cette phrase est la
    // CONSÉQUENCE de la ligne du dessus; les séparer ferait deux faits sans
    // lien pour qui lit dans l'ordre.
    ...(outOfReach.length > 0
      ? [
        `nothing cooked in those sessions reaches ${outOfReach.join(", ")}: a ` +
        "batch does not keep that long. Those days cook for themselves on the " +
        "day, or they eat something that needs no batch at all. Do NOT write a " +
        "dish there that draws on a preparation -- it will be thrown away.",
      ]
      : []),
    // LES MOYENS DE CUISSON, JUSTE SOUS LES JOURS ET AU-DESSUS DU TEMPS.
    //
    // La place n'est pas cosmétique: « il ne peut cuisiner que mardi » et « il
    // n'a pas de four » sont la même question — ce qu'une session peut faire —
    // et le modèle décide de sa session en lisant ces lignes-là. Plus bas,
    // elles seraient sous le budget, c'est-à-dire après un arbitrage qui les
    // suppose déjà connues.
    //
    // Vide quand la question n'a jamais été posée (`null`): un compte d'avant
    // ce lot voit le prompt d'avant ce lot, au caractère près.
    ...kitchenEquipmentPromptLines(args.kitchenEquipment ?? null),
    // ══════════════════════════════════════════════════════════════════════
    // CE QU'UNE COURSE DU PREMIER JOUR PEUT ENCORE NOURRIR — 2026-09-01
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE DÉFAUT, RAPPORTÉ SUR UN PLAN RÉEL: « ça me disait de cuisiner le
    // poulet acheté le lundi, le samedi ». La fenêtre crue existait
    // (`RAW_WINDOW_DAYS`) et `grocery_waves.ts` datait déjà l'achat de chaque
    // article — mais APRÈS, à la lecture, et le modèle ne l'avait jamais su. Il
    // posait ses sessions à l'aveugle.
    //
    // ⚠️ LES JOURS SONT NOMMÉS, pas la durée. Quatrième application de la leçon
    // d'`addedCookDays`: « une règle générale ne se compare pas, un jour NOMMÉ
    // si ». Le modèle ne reçoit pas « la volaille tient deux jours », il reçoit
    // « après jeudi, une volaille ne peut plus venir de la première course ».
    //
    // ⚠️ ET LA PHRASE PORTE LA SORTIE, PAS L'INTERDICTION: cuisiner du poulet le
    // samedi est légitime, ça demande une course le jeudi. Ce qu'on refuse est
    // le SILENCE. Vide sur une fenêtre courte, où aucune famille ne mord.
    // ⚠️ `windowDays`, PAS `daysToEat`, ET C'EST UN DÉCALAGE D'UN JOUR. La
    // « première course » tombe au rang 0 de la FENÊTRE — c'est-à-dire sur la
    // veille quand il y en a une, puisque c'est ce jour-là qu'on achète pour
    // cuisiner. Compter depuis le premier jour QUI PORTE DES REPAS donnerait
    // une journée de fraîcheur de trop, dans le sens permissif.
    // ⟳ 2026-09-09 — ET LA SORTIE EST CELLE DE LA CADENCE: « une course »
    // avec congélateur fait congeler à l'achat, pas racheter la veille. Voir
    // `RawReachCadence`.
    ...rawReachLines(windowDays, args.groceryCadence),
    ...(args.cookingTimeMin
      ? [
        `time per cooking session: about ${args.cookingTimeMin} minutes. A ` +
        "session that does not fit is a session they skip.",
      ]
      : []),
    // ══════════════════════════════════════════════════════════════════════
    // QUAND LE TEMPS NE TIENT PAS, LA SESSION DÉBORDE — ET ELLE LE DIT.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ L'INTUITION ÉTAIT INVERSÉE, ET LE MOTEUR AUSSI. « Un seul jour de
    // cuisine et trente minutes ⇒ la session sera plus longue » semble évident;
    // la consigne faisait le contraire — les minutes sont un PLAFOND, « cook
    // LESS and put the rest on another cooking day ». Avec un seul jour, « le
    // rest » n'a nulle part où aller: le modèle cuisine moins, et la semaine
    // sous-nourrit. C'est la mesure déjà connue des plans qui n'atteignent pas
    // 72 % de leur propre enveloppe.
    //
    // ⚠️ LA PERMISSION EST BORNÉE ET CONDITIONNELLE, et les deux comptent.
    // Bornée: sans plafond, « tu peux déborder » rend le nombre déclaré
    // décoratif et on revient à la session de 55 minutes annoncée à 30.
    // Conditionnelle: `sessionCeilingMinutes` rend `null` dès qu'une autre
    // journée de cuisine existe — là, la sortie ordinaire est toujours la
    // bonne, et une permission générale serait une invitation à dépasser.
    ...(sessionCeiling !== null
      ? [
        // ⚠️ DEUX MOTIFS, DEUX PHRASES — et le mot compte. Sans l'option, la
        // tension est un CONSTAT (« la semaine ne peut pas être nourrie de ce
        // seul jour »); avec elle, c'est la DEMANDE de la personne, et lui
        // servir le constat lui dirait que son propre choix est un problème.
        (args.oneCookingSession
          ? "everything for this stretch is cooked in that single session, so "
          : "they cook on ONE day and this week cannot be fed from it, so ") +
        `that session is allowed to run long -- up to ${sessionCeiling} ` +
        'minutes. Put the real figure in "total_minutes". Cooking less is the ' +
        "wrong trade here: it leaves days with nothing on them.",
      ]
      : []),
    ...(args.recipeDifficulty
      ? [
        `recipe level they want: ${args.recipeDifficulty}` +
        (RECIPE_LEVEL_HINT[args.recipeDifficulty] ?? ""),
      ]
      : []),
    ...(args.variety
      ? [
        `repetition they accept: ${args.variety}` +
        (VARIETY_HINT[args.variety] ?? ""),
      ]
      : []),
    // LE BUDGET EST UN PLAFOND CHIFFRÉ, PAS UNE AMBIANCE.
    //
    // La monnaie n'est pas nommée: `country` est deux lignes plus haut dans ce
    // même prompt, et une table pays → devise tenue de notre côté serait une
    // liste fermée qui refuserait un pays légitime le jour où quelqu'un s'y
    // inscrit (voir `frontend/src/keel/api/countries.ts`).
    //
    // La consigne dit QUOI SACRIFIER, dans l'ordre. « Reste dans le budget »
    // seul laisse le modèle rogner sur les portions — c'est-à-dire sur la
    // seule chose que le reste de ce prompt calcule.
    // ⛔ SOUS LE PLANCHER, CE BLOC ENTIER DISPARAÎT — les deux lignes, pas
    // seulement le chiffre. Garder l'ordre de sacrifice sans le montant
    // demanderait au modèle de renoncer à la viande sans lui dire pourquoi,
    // c'est-à-dire d'appauvrir un plan au nom d'une contrainte qu'on vient de
    // juger inapplicable.
    ...(args.budgetAmount !== null &&
        (args.budgetFloor === null || args.budgetAmount >= args.budgetFloor)
      ? [
        `budget for this plan: ${args.budgetAmount}, in the local currency of ` +
        "their country. It covers the WHOLE shopping list for this stretch, " +
        "for every serving asked for above — it is a ceiling, not a target.",
        "when that budget is tight for the number of servings and days, cut " +
        "in THIS order: expensive proteins first (swap to eggs, legumes, " +
        "tinned fish, cheaper cuts), then out-of-season and imported produce, " +
        "then variety (repeat a batch). NEVER cut the portions themselves: " +
        "the servings are computed from bodies and directions, and a plan " +
        "that shrinks them silently is a plan that starves someone to fit a " +
        "number.",
      ]
      : []),
  ];

  const userMessage = [
    // ── LES CONTRAINTES DURES AVANT TOUT LE RESTE ───────────────────────────
    // Avant la doctrine, avant l'élève, avant la demande. Elles gagnent sur
    // tout, y compris sur la méthode du coach: un coach dont la doctrine
    // recommande les fruits à coque n'a pas écrit ça pour un anaphylactique.
    // ⛔ v15 — LE SILENCE DES CONTRAINTES A ÉTÉ TENTÉ ICI, PUIS RENDU.
    //
    // ── LE TROU EST RÉEL, ET IL EST MESURÉ ────────────────────────────────
    // `generate-meal-v1:887-891` avale l'échec de lecture dans un
    // `catch (error) { console.warn(...) }` et laisse `constraints = null`.
    // `safetyConstraintsPromptBlock(null)` rend `null` — donc le prompt d'un
    // anaphylactique dont la table est injoignable est BYTE-IDENTIQUE à celui
    // d'un élève qui n'a rien déclaré. Et la seconde moitié du double verrou
    // tombe par le MÊME `null`: `applyKeelOutputLocks` voit
    // `constraints.length === 0` et rend `disarmed_no_constraints`. Un seul
    // `catch` muet désarme les deux moitiés à la fois. Le TYPE porte pourtant
    // la distinction (`readonly StudentSafetyConstraint[] | null`).
    //
    // ── POURQUOI LE PROMPT NE LA DIT PAS, ET POURQUOI JE NE L'AI PAS FORCÉ ─
    // `meal_body_test.ts::"sans contrainte, aucun bloc de contraintes — et pas
    // un en-tête vide"` exige `assertEquals(none.userMessage,
    // unreadable.userMessage)`, avec sa raison écrite: « la distinction est
    // une information d'exploitation, pas quelque chose à raconter au
    // modèle ». La version v15 qui écrivait deux en-têtes distincts rendait ce
    // test rouge — c'est-à-dire qu'elle renversait un arbitrage ÉCRIT, en
    // passant, dans un lot qui portait sur autre chose.
    //
    // Elle inventait en outre une politique que personne n'a tranchée: sur le
    // chemin `null`, « écarte les fruits à coque, l'arachide, le sésame, les
    // crustacés et l'œuf cru » est une liste que j'aurais choisie seul, et qui
    // aurait changé le plan de tous les élèves dont une lecture échoue.
    //
    // ⚠️ CE N'EST DONC PAS « RÉPARÉ », C'EST REMONTÉ. La question — faut-il
    // REFUSER de composer quand la lecture des contraintes est en panne ? —
    // appartient à un humain, et elle est posée dans le RAPPORT de l'étape ②.
    ...(safetyBlock ? [safetyBlock, "", SEVERITY_READING_BLOCK, ""] : []),
    // ── LE RÉGIME, JUSTE SOUS LES CONTRAINTES DURES ET AVANT LA DOCTRINE ────
    // Même argument que la ligne au-dessus, et il vaut ici mot pour mot: un
    // coach dont la méthode construit sur le poulet ne l'a pas écrite pour un
    // végane. Le régime doit donc gagner sur la doctrine, comme l'allergie —
    // et il doit survivre à une troncature du budget de prompt.
    //
    // ⚠️ IL EST SÉPARÉ DU BLOC DE CONTRAINTES DURES, ET ÇA N'EST PAS UN DÉTAIL
    // DE MISE EN PAGE. `safetyConstraintTokens` exclut délibérément `dietRef`:
    // verser « vegan » dans la liste d'évitement armerait la ceinture de
    // sortie sur le mot lui-même, et ferait rejeter toute réponse qui décrit
    // un plat comme végane — donc précisément les bonnes, et seulement pour
    // les véganes. Ce dépôt a payé ce défaut en run réel avec
    // `allergen_ref='diabetes'`. La ceinture reçoit l'EXPANSION
    // (`excludedSurfaceFormsFor`), jamais le nom du régime.
    ...(args.dietBlock.trim() ? [args.dietBlock.trim(), ""] : []),
    args.doctrineBlock.trim(),
    // Le mapping suit IMMÉDIATEMENT la doctrine, et avant tout ce qui est
    // propre à l'élève: c'est la partie commune à toute la cohorte du coach,
    // donc la partie cacheable, et le budget de prompt tronque par la queue.
    ...(args.protocolBlock.trim() ? ["", args.protocolBlock.trim()] : []),
    "",
    "== THE CONVICTION KEYS YOU MAY NAME ==",
    JSON.stringify(args.beliefKeys),
    "",
    // LA NOTE DU COACH, entre la méthode et l'élève — même placement que dans
    // `buildWeekPlanPrompt`: après tout ce qui est collectif et cacheable,
    // avant tout ce que l'élève a dit de lui-même. Absente, aucune ligne.
    ...(args.coachNoteBlock ? [args.coachNoteBlock, ""] : []),
    // ── CE QUI EST DURABLE, ET CE QUI EST DATÉ, NE SE LISENT PLUS AU MÊME
    //    RANG ─────────────────────────────────────────────────────────────
    // Tout ce qui suit tenait dans une seule liste plate sous cet en-tête: la
    // cantine du midi, le mariage de mardi, la balance de dimanche et le
    // budget serré, à égalité. Une contrainte d'une semaine s'y lisait comme
    // une propriété permanente.
    //
    // Le dépôt avait déjà tranché ce problème une fois, en séparant
    // `situation` (stable) de `context` (daté). Les sous-sections généralisent
    // cet arbitrage: ce qu'ils SONT, ce qu'ils VISENT, où ils EN SONT, comment
    // leur journée TOURNE — puis, en dernier, ce qui n'est vrai que cette fois.
    //
    // UNE SOUS-SECTION SANS CONTENU N'EXISTE PAS. Un en-tête vide est du bruit
    // qui coûte du cache, et « height: not stated » est pire que le silence:
    // ça occupe le rang d'une contrainte et ça invite le modèle à commenter
    // une absence.
    "== THIS STUDENT ==",
    // ⛔ v15 — NOMMER L'IGNORANCE DU CORPS A ÉTÉ TENTÉ ICI, PUIS RENDU.
    //
    // Le constat tenait: pour un compte neuf, la section entière disparaît, et
    // rien ne dit au modèle qu'il ne sait rien — pendant que le prompt système
    // lui DEMANDAIT de dimensionner (« a full lunch or dinner for one adult is
    // a plate of roughly 600 to 750 g ») sans jamais dire de qui.
    //
    // ⟳ LOT C (2026-09-11) — LA MOITIÉ QUI RENDAIT CE TROU COÛTEUX EST PARTIE.
    // Le prompt système ne demande plus de masse d'assiette du tout: il demande
    // une FORME, et c'est `applySizing` qui décide des grammes. Ne rien savoir
    // du corps ne fait donc plus écrire de nombre au hasard — ça fait écrire une
    // recette, ce qui est exactement ce qu'on veut d'un compte neuf.
    //
    // ⚠️ ET LA LIGNE QUI LE DIRAIT EST INTERDITE PAR UNE RAISON DE SÉCURITÉ,
    // pas par du goût. `meal_body_test.ts::"un corps entièrement inconnu SOUS
    // plancher rend la même chose encore"`: le PLANCHER TCA (`restrictionFlag`)
    // blanchit le corps. Si l'absence portait un en-tête, le plancher
    // deviendrait OBSERVABLE dans le prompt — un élève à risque et un compte
    // neuf cesseraient d'être indiscernables, et « un modèle qui remarque une
    // absence la commente ». Le silence n'est pas un oubli ici: c'est la garde.
    //
    // Ce qui reste vrai et non couvert: le REPLI de dimensionnement n'est écrit
    // nulle part. Il pourrait l'être dans le prompt SYSTÈME, qui est le même
    // pour tout le monde et ne révèle donc rien de personne. Hors périmètre de
    // ce lot, nommé dans le RAPPORT.
    ...(bodyBlocks.whoTheyAre.length > 0
      ? ["", "-- WHO THEY ARE --", ...bodyBlocks.whoTheyAre]
      : []),
    "",
    "-- WHAT THEY ARE AFTER --",
    `goal: ${args.goal}`,
    // L'AXE, ET CE QU'IL AUTORISE À FAIRE. Repris de `buildWeekPlanPrompt`, y
    // compris son garde-fou: un axe que le coach n'a jamais traité ne donne
    // PAS le droit d'inventer un conseil dessus. Le produit du coach est sa
    // méthode; un axe est une direction dans laquelle la chercher, pas une
    // permission d'en écrire une.
    ...(args.focusAxis
      ? [
        `the one thing they want to see improve: ${
          WEEKLY_AXIS_LABELS_EN[args.focusAxis] ?? args.focusAxis
        }. Let it rank your choices among the dishes the method allows. If the ` +
        `coach has taught nothing that bears on it, say nothing about it rather ` +
        `than teaching something he never taught.`,
      ]
      : []),
    // L'ASPIRATION AVANT LA SITUATION: ce qu'il veut, puis ce qui l'empêche.
    // L'ordre est celui de `week_plan_generation.ts`, et il n'est pas
    // cosmétique — un modèle qui lit d'abord les contraintes compose une
    // semaine qui les contourne.
    ...(args.aspiration && args.aspiration.trim()
      ? [
        `what they are actually after, in their words: ${args.aspiration.trim()}. ` +
        `Let it rank your choices among the dishes the method allows — never ` +
        `at the cost of a hard constraint, and never as a reason to add a ` +
        `dish they did not ask for.`,
      ]
      : []),
    args.situation
      ? `their situation, in their words: ${args.situation}`
      : "their situation: not stated.",
    ...(bodyBlocks.whereTheyAreNow.length > 0
      ? ["", "-- WHERE THEY ARE NOW --", ...bodyBlocks.whereTheyAreNow]
      : []),
    "",
    // ── LA FORME DE LEUR JOURNÉE ────────────────────────────────────────
    // Sa propre sous-section, et pas une ligne perdue dans « what to cook »:
    // c'est la contrainte qui décide COMBIEN de plats existent et QUAND. Une
    // faim de 17h qu'on ne nomme pas est une faim qu'on comble ailleurs, et le
    // plan le plus juste du monde s'écroule dessus.
    "-- HOW THEIR DAY RUNS --",
    rhythmLines(rhythm),
    args.eatingRhythm && args.eatingRhythm.length > 0
      ? "Those are the moments they actually eat. Do not add a meal they did " +
        "not name, and do not drop one they did: an extra meal is a meal they " +
        "skip, a missing one is the hour they raid the cupboard."
      : "They have not told us their rhythm, so this is the default assumption " +
        "— treat it as ordinary, not as something they chose.",
    // ── CE QU'ILS NE MANGENT PAS ICI ──────────────────────────────────────
    // Nommé moment par moment, et en NÉGATIF explicite: « skip » plutôt qu'une
    // liste de ce qu'il reste. Le modèle qui reçoit une liste positive la
    // complète — c'est le comportement même d'un modèle de composition, et
    // c'est pour ça que le parseur revérifie derrière (voir `isAway`).
    ...(awayLines.length > 0
      ? [
        "",
        "-- WHEN THEY ARE NOT HERE --",
        "they are NOT eating here at these moments — compose nothing, buy " +
        "nothing, and count no portion for them:",
        ...awayLines,
      ]
      : []),
    // ── CE QU'ILS MANGENT DÉJÀ ────────────────────────────────────────────
    // Le PENDANT POSITIF de la section au-dessus, et posé juste après elle
    // pour qu'elles se lisent ensemble: « pas ici » et « déjà ça » sont les
    // deux façons dont une case de la grille peut être prise avant que le
    // modèle n'y touche.
    ...fixedIntakePromptLines(args.fixedIntakes),
    // ── CE QUE CERTAINS JOURS SONT ────────────────────────────────────────
    // Troisième façon dont une case de la grille peut être décidée avant que
    // le modèle n'y touche — et la seule des trois qui soit POSITIVE.
    ...dayPropertyPromptLines(args.dayProperties),
    // LES CONTRAINTES DE CUISINE. Elles décrivent une CAPACITÉ durable (les
    // jours où il peut cuisiner, le temps qu'il a, ce qu'il sait faire, ce
    // qu'il peut dépenser), donc elles vivent avec l'élève et non avec la
    // demande. Un plan parfait et inapplicable est la première cause
    // d'abandon.
    // ── v15 · IDEM POUR LA CAPACITÉ ─────────────────────────────────────
    // Six entrées disparaissaient ensemble et en silence: les jours de
    // cuisine, l'équipement, les minutes, le niveau, la répétition et le
    // BUDGET. Un modèle qui ne lit rien ici compose avec un four, un
    // dimanche entier et une somme illimitée — et rien ne lui dit qu'il
    // suppose. Mesuré sur le scénario « minimum vital »
    // (`2a000000-2100-4000-8000-000000000001`, 5 368 car.): 7 préparations,
    // 2 sessions, un four, aucun budget, aucune trace d'une hésitation.
    ...(canCookLines.length > 0
      ? ["", "-- WHAT THEY CAN COOK --", ...canCookLines]
      : [
        "",
        "-- WHAT THEY CAN COOK --",
        "they have told us NOTHING about their kitchen, their cooking days, " +
        "the time they have or the money they can spend. Assume an ordinary " +
        "kitchen and an ordinary week — and because it is an assumption, keep " +
        "the sessions short and the shopping list plain rather than betting " +
        "on equipment or an evening they may not have.",
      ]),
    // ══════════════════════════════════════════════════════════════════════
    // LA MOITIÉ « CONSIGNE » DES CONTENANTS SOLO — 2026-09-01, second passage
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ MESURÉ, ET C'EST LE PATRON DÉJÀ ÉCRIT DANS CE DÉPÔT. Le premier
    // passage n'a servi que le SCHÉMA (`SOLO_BOX_BLOCK`, prompt système). Run
    // réel `2235786d-…`, plan solo de sept jours: « 17 meals take from a batch
    // and NOT ONE carries a box -- 17 containers were owed, zero came back ».
    //
    // C'est exactement ce que `boxSchemaBlock` annonce en tête de sa propre
    // définition: « `member_portions` a ces DEUX moitiés et il est rempli 100 %
    // du temps; `for_member_id` n'avait que celle-ci et il est resté à zéro sur
    // douze générations. On copie le patron qui marche. » Le schéma dit qu'une
    // clé EXISTE; il ne dit pas de l'écrire.
    //
    // ⚠️ SUR LE MESSAGE, PAS SUR LE SYSTÈME, et la place n'est pas
    // interchangeable: le système est cacheable et partagé, le message porte ce
    // qu'on DEMANDE cette fois-ci. C'est la même répartition que côté foyer.
    //
    // ⛔ AUCUN NOM SUR LE COUVERCLE, redit ici: le jour et le moment sont ce qui
    // fait reconnaître un bac quand on mange seul.
    ...(args.soloBoxes
      ? [
        "",
        "-- WEIGH IT ONCE, INTO CONTAINERS NAMED BY MEAL --",
        "Nothing is weighed at mealtime. Everything is weighed at the cooking " +
        "session, straight into containers, and a meal later just takes its box " +
        "out of the fridge.",
        'Every dish that takes from a preparation carries "boxes": ONE container ' +
        "holding everything that meal takes out -- all its preparations together " +
        "in the same box, not one tub per pan. Count them before you answer: as " +
        "many boxes as you have dishes that draw on a preparation.",
        "They eat alone, so no lid carries a name -- the day and the meal are " +
        "what tells them which one to open. Its grams are that meal's portion: " +
        "they open it and eat, and nothing is weighed at the table.",
        "The cooking session run_through is the ORDER of the gestures, and " +
        "nothing else: no weights, no gram figures, no portion counts. Those " +
        "live in the boxes, each already carrying what is in it and how much.",
        'A dish that cooks from scratch on the day has no "boxes": nothing was ' +
        "weighed ahead for it.",
      ]
      : []),
    // CE QU'IL A DIT LUI-MÊME, et il l'a confirmé sur un écran. Ce ne sont ni
    // des interdits du coach (ceux-là sont dans la doctrine, avec leur double
    // verrou) ni des contraintes médicales (celles-là sont maintenant en tête
    // du message): ce sont des goûts et des contextes de vie, et ils décident
    // si une semaine est vivable.
    // ── DEUX PROVENANCES, ET LE RANG EST LA MOITIÉ DU MESSAGE ─────────────
    // Ce que quelqu'un PREND LA PEINE D'ÉCRIRE sur son alimentation ne pèse
    // pas comme une remarque glanée en conversation qu'on lui a fait
    // confirmer d'un bouton. Servies en un seul sac, les deux sont
    // indépartageables — le modèle n'a aucun moyen, même en principe, de
    // savoir laquelle il a le droit d'arbitrer.
    //
    // Et le dire ne suffit pas: la consigne du prompt REGRESSE en réel (le
    // verrou des règles de maison existe pour ça). D'où la demande explicite
    // de NOMMER ce qu'il n'a pas pu honorer — que `written_instruction_check.ts`
    // vérifie ensuite sur la sortie, déterministiquement. C'est le double
    // verrou de la doctrine, pointé sur une autre liste.
    ...((args.writtenInstructions ?? []).length > 0 ||
        (args.foodPreferences?.length ?? 0) > 0 ||
        (args.memo?.length ?? 0) > 0
      ? [
        "",
        "-- WHAT THEY HAVE TOLD ME --",
        ...((args.writtenInstructions ?? []).length > 0
          ? [
            "what they WROTE THEMSELVES about their eating. treat these as " +
            "instructions, not as suggestions:",
            ...(args.writtenInstructions ?? []).map((p) => `- ${p}`),
            // ⚠️ v15 — L'EXCEPTION EST NOMMÉE ICI, PAS SEULEMENT PLUS HAUT.
            // « name the thing you could not do » est l'ordre qui a produit
            // la phrase qui a détruit le plan du run `2a000000-3100-…`. La
            // règle générale reste (dire ce qu'on n'a pas pu faire est le
            // contrat), mais elle porte maintenant sa seule exception, à
            // l'endroit où elle est lue. Sans ça, deux consignes du même
            // message se contredisent et c'est la plus proche qui gagne.
            // ⛔ S2 (2026-08-22) — L'EXCEPTION EST DOUBLE DEPUIS QUE LA
            // CEINTURE COUVRE `strict`. « the ONE exception » nommait un seul
            // cran et laissait le modèle nommer librement un aliment
            // `severity=strict`, c'est-à-dire écrire la phrase exacte qui
            // vide désormais la semaine. Même correction, même raison, que
            // `SEVERITY_READING_BLOCK` plus haut dans ce fichier.
            "if you cannot honour one of those, say so in the \"why\" of the " +
            "dish it affects, name the thing you could not do, and say what " +
            "you did instead. do not drop it in silence. the exceptions are " +
            "a severity=medical food: for those, write \"one of the foods on " +
            "your medical list\" and never the food itself. and a " +
            "severity=strict food: for those, write \"one of the foods you " +
            "keep off your plate\" and never the food itself.",
          ]
          : []),
        ...((args.foodPreferences?.length ?? 0) > 0
          ? [
            ...((args.writtenInstructions ?? []).length > 0
              ? ["", "what came up in conversation and they confirmed. treat " +
                "these as preferences:"]
              : ["what they have told you about their eating, in their own words:"]),
            ...(args.foodPreferences ?? []).map((p) => `- ${p}`),
          ]
          : []),
        // ── LOT M4 · LE MÉMO, EN DERNIER DE LA SECTION ────────────────────
        //
        // ⚠️ APRÈS LES DEUX AUTRES SEAUX, ET C'EST DÉLIBÉRÉ. Une ligne de mémo
        // n'a NI famille NI valeur structurée: c'est ce que la personne a
        // demandé et qu'aucune case du produit ne porte. La placer devant une
        // consigne écrite ferait passer un résidu avant une instruction.
        //
        // ⛔ « FACTS ABOUT THEIR WEEK », PAS « PREFERENCES ». Le mémo n'entre
        // que pour du FACTUEL et de l'ACTIONNABLE (ses deux premières
        // conditions d'entrée); l'annoncer au modèle comme un goût lui
        // donnerait le droit de l'arbitrer contre autre chose, alors qu'une
        // ligne comme « danse le mardi, donc gros repas ce jour-là » se
        // respecte ou se dit.
        ...((args.memo?.length ?? 0) > 0
          ? [
            "",
            "facts about their week that no other field carries. these are " +
            "not preferences to weigh: honour them, or say in the \"why\" of " +
            "the dish it affects that you could not, and what you did instead:",
            ...(args.memo ?? []).map((p) => `- ${p}`),
            // ⛔ LOT A (2026-09-03) — NOMMER LE JOUR NE SUFFIT PAS, IL FAUT
            // CONTREDIRE L'A PRIORI. Cicatrice `named-day-calendar-vs-model-prior`:
            // le modèle lisse les jours quand on lui donne la donnée sans lui
            // dire que ce jour-là est l'exception. La phrase vit ICI, collée aux
            // lignes qu'elle gouverne, pas dans une section « règles » plus bas.
            "when a line names a day or a meal, that day or that meal is the " +
            "exception: compose it differently from the other days instead of " +
            "keeping every day the same.",
          ]
          : []),
      ]
      : []),
    // ── CE QUI N'EST VRAI QUE CETTE FOIS ──────────────────────────────────
    // En DERNIER de la section, et c'est le point de la séparation: le
    // contexte est daté (« mariage mardi »), l'envie a été tapée il y a dix
    // secondes, le garde-manger est l'état d'un placard ce soir. Les fondre
    // avec ce qui précède ferait traiter un mariage comme une habitude de vie
    // — et « mezze d'été cette semaine » reviendrait en février.
    "",
    "-- THIS TIME --",
    args.context
      ? `what is going on for them RIGHT NOW: ${args.context}`
      : "nothing special going on this week.",
    // ── ② L'ENVIE PORTE ENFIN SON RANG ─────────────────────────────────
    // C'était la SEULE ligne de désir du message sans un mot de rang.
    // L'aspiration porte « never at the cost of a hard constraint », la
    // saison porte « It ranks your choices; it does not veto anything »,
    // l'axe porte « Let it rank your choices among the dishes the method
    // allows ». L'envie, elle, arrivait nue — et à trois lignes de la fin,
    // c'est-à-dire à la place que ce dépôt a mesurée comme la plus
    // contraignante du message.
    //
    // MESURÉ, run `2a000000-3100-4000-8000-000000000001`: une envie qui
    // nomme l'allergène MÉDICAL de l'élève (« a proper tahini and sesame
    // noodle bowl ») ressort 21 fois dans la sortie, et la phrase qui a
    // sauvé l'assiette est venue du modèle, pas du prompt.
    //
    // La formulation est celle de l'aspiration, mot pour mot là où elle
    // dit la même chose: deux phrases différentes pour le même arbitrage
    // dérivent, et c'est la moins relue qui garde l'ancienne.
    ...(args.preferences
      ? [
        `what they feel like eating THIS TIME: ${args.preferences}. Let it ` +
        `rank your choices among the dishes everything above already allows ` +
        `— never at the cost of a hard constraint, of their diet, or of this ` +
        `coach's method. If you cannot serve what they asked for, compose the ` +
        `nearest dish that IS allowed and say so in that dish's "why".`,
      ]
      : []),
    `people at the table: ${args.servings}`,
    // LE GARDE-MANGER EST UNE SOUS-SECTION, PAS UNE SECTION. Il portait un
    // en-tête `==` posé au milieu de sous-titres `--`: pour un modèle qui lit
    // une hiérarchie, ça ferme `== THIS STUDENT ==` au mauvais endroit et
    // rattache la suite à autre chose. Le niveau suit maintenant le rang.
    // ⚠️ L'EN-TÊTE A CHANGÉ LE 2026-08-18, ET C'ÉTAIT UNE COLLISION MESURÉE.
    // Il s'appelait `-- WHAT THEY ALREADY HAVE --`, mot pour mot le même que
    // celui des APPORTS FIXES (`fixed_intakes.ts`), quarante lignes plus haut
    // dans le MÊME message. Vu sur le run réel `798c5cd6-…`: un élève avec un
    // shaker qui compose en `from_pantry` reçoit deux sections homonymes qui
    // demandent l'inverse l'une de l'autre — « compte-les comme déjà mangés et
    // ne les mets PAS sur la liste de courses » d'un côté, « voilà ce qu'il a
    // dans le placard, cuisine avec » de l'autre.
    //
    // Le mot qui distingue est le LIEU (un placard), pas la possession.
    args.mode === "from_pantry"
      ? [
        "",
        "-- WHAT IS ALREADY IN THEIR CUPBOARDS --",
        pantryLines || "- (they listed nothing)",
      ].join("\n")
      : "\n-- THEY HAVE NOT SHOPPED YET: give the full list --",
    "",
    // ── LA SAISON, ET CE QUI POUSSE LÀ OÙ ILS SONT ──────────────────────
    //
    // ON DONNE LES FAITS, PAS NOTRE DÉDUCTION. La tentation était d'écrire
    // « c'est l'été » — ce qui aurait demandé une table d'hémisphères, se serait
    // trompé sous l'équateur, et aurait imposé notre lecture à un modèle qui
    // connaît déjà les calendriers agricoles. On transmet la DATE et le PAYS;
    // ce qui pousse en Bretagne le 5 août, il le sait mieux que nous.
    //
    // ET C'EST UNE PRÉFÉRENCE, PAS UNE CONTRAINTE — c'est dit deux fois, parce
    // que ce prompt porte de vraies interdictions (allergènes, doctrine) et
    // qu'une consigne de saison lue avec le même poids ferait REFUSER des plats.
    // Personne ne doit s'entendre dire « pas de tomates, ce n'est pas la
    // saison »: la saison choisit vers quoi on tend, jamais ce qu'on écarte.
    "== WHAT IS IN SEASON WHERE THEY ARE ==",
    args.today ? `today's date: ${args.today}` : "today's date: not known.",
    args.country
      ? (args.countryAssumed === true
        ? `they shop in: ${args.country} (ISO-3166 country code — assumed from ` +
          "the language they write in, not confirmed by them)"
        : `they shop in: ${args.country} (ISO-3166 country code)`)
      : "where they shop: not known — reason about season only if their " +
        "situation says where they are.",
    // ⟳ 2026-09-20 — LE PAYS N'EST PAS QUE LA SAISON. Le même code dit dans
    // quelle unité leur four parle, comment leurs boucheries nomment un morceau
    // et dans quels formats leurs magasins vendent. Sans cette phrase, « FR »
    // ne servait qu'aux fruits et légumes.
    ...(args.country
      ? [
        "That country also sets the cooking conventions: the unit their oven " +
        "reads (°C or °F), the names cuts and products go by in their shops, " +
        "and the sizes those shops sell in. Write the recipes the way a cook " +
        "there would read them.",
      ]
      : []),
    "PREFER fruit and vegetables in season there at that date, and produce " +
    "that grows in that country over what has to be flown in. Let the season " +
    "set the WEIGHT of a dish too: a long-braised winter stew in midsummer is " +
    "food nobody wants to cook or eat when it is hot.",
    "This is a PREFERENCE and never a rule. Never drop a dish the method calls " +
    "for to honour it, never refuse an ingredient the student asked for " +
    "because it is out of season, and never tell them a food is unavailable — " +
    "you are not looking at their shops. It ranks your choices; it does not " +
    "veto anything.",
    "",
    // ── LA DEMANDE, EN DERNIER ────────────────────────────────────────────
    // Ce bloc ne décrit plus l'élève: il décrit ce qu'on demande MAINTENANT.
    // Tout ce qui appartenait à la personne (son rythme, sa capacité de
    // cuisine, ses parts, ses placards) est remonté sous `== THIS STUDENT ==`.
    //
    // Et il reste EN DERNIER exprès: ce dépôt a mesuré qu'un modèle lit la
    // consigne la plus proche de la fin comme la plus contraignante (la raison
    // est écrite dans `household_meal_generation.ts`, et le bloc satiété a été
    // déplacé pour ça après un run rouge). La chose la plus contraignante
    // ici, c'est la commande.
    "== WHAT TO COOK ==",
    `mode: ${args.mode}`,
    `how much: ${args.scope} (at most ${cap} dish${cap > 1 ? "es" : ""})`,
    // LES DEUX CONSIGNES QUI NE TIENNENT PAS DANS LE PROMPT SYSTÈME.
    //
    // Elles y étaient, et elles se perdaient: mesuré deux fois de suite, une
    // semaine demandée rendait 17 à 20 plats cuisinés SÉPARÉMENT (zéro lot) et
    // laissait des déjeuners vides. Un prompt système long dilue une règle; une
    // consigne posée juste à côté de la DEMANDE est lue.
    //
    // Elles sont chiffrées exprès. « Peu de sessions » se négocie, « au plus
    // cinq » ne se négocie pas — et le dépôt a déjà payé le fait qu'une règle
    // qualitative dans un prompt est une règle que le modèle applique quand ça
    // l'arrange.
    ...(args.scope === "several_days"
      ? [
        // LE RYTHME DE CET ÉLÈVE, PAS CELUI DE TOUT LE MONDE.
        //
        // Cette ligne disait « every day needs breakfast, lunch and dinner ».
        // Codée en dur, pour tous. Quelqu'un qui mange deux fois recevait un
        // repas de trop; quelqu'un qui s'effondre à 17h n'avait aucun endroit
        // où le dire, et sa journée s'arrêtait au déjeuner puis reprenait au
        // dîner. La règle est la même — pas de trou — mais sur SA journée.
        // ── ⛔ LA GRILLE EST ÉNUMÉRÉE, ET SON NOMBRE EST UN PLANCHER ───────
        //
        // Cette consigne était UNE PHRASE — « every day of the stretch needs
        // breakfast, lunch and dinner » — et le seul NOMBRE que le modèle
        // lisait était `at most ${cap}`, c'est-à-dire un PLAFOND. Rien ne lui
        // disait combien de plats il DEVAIT rendre.
        //
        // Mesuré le 2026-09-18 sur le foyer `5e0c3825` (6 jours du dimanche au
        // vendredi, 3 bouches, aucun rythme déclaré donc 18 cases): **12 plats
        // rendus sur 18**, le dimanche entier sauté, puis 422
        // `plan_not_deliverable` après 197 s et deux réparations. Le modèle
        // n'avait enfreint AUCUN chiffre: 12 plats sur 18 autorisés, 3 sessions
        // de cuisine sur 6. Il avait obéi aux trois règles chiffrées — plafond
        // de plats, plafond de sessions, une recette cuisinée une seule fois —
        // et laissé tomber la seule qui était en prose.
        //
        // ⛔ ON LUI DONNE DONC LA LISTE, PLUS LA RÈGLE. Les cases sont
        // énumérées `jour/moment` dans l'ordre de la fenêtre, leur nombre est
        // dit PLANCHER en toutes lettres, et la relecture est demandée avant la
        // réponse. Une liste se coche; une règle se négocie.
        //
        // ⚠️ LE PLANCHER NE PEUT PAS DÉPASSER LE PLAFOND, par construction:
        // `cellsToFill` retire les absents et les apports fixes de la grille
        // dont `baseCap` est le produit entier, et `cap` vaut `baseCap` plus le
        // supplément de fusion. Les deux nombres ne peuvent donc que se
        // rejoindre, jamais se croiser.
        `cells to fill: ${cellsToFill.length}. One line per moment, with how ` +
        "many days it covers -- count them:",
        ...cellChecklistLines(
          cellsToFill,
          rhythm.map((o) => String(o.slot)),
          daysToEat,
        ),
        `Return one dish for EACH of those ${cellsToFill.length} cells. ` +
        `${cellsToFill.length} is a FLOOR, not a number to approach: a cell ` +
        "left without a dish is a hole, and this table did not ask for a " +
        "partial stretch. Before you answer, take the lines above ONE BY ONE " +
        "and count your dishes for that moment against the number in " +
        "brackets; compose whatever is short.",
        // ── ⛔ LA CASE EST REMPLIE PAR LE PLAT DE LA TABLE, PAS PAR UN PLAT
        //    À QUELQU'UN — 2026-09-18, foyer `fagenty` ───────────────────────
        //
        // Mesuré: mercredi `before_bed`, la SEULE chose posée était « Tisane
        // aux herbes séchées » portant `for_member_id` = fabrice. La case
        // comptait donc comme remplie (`cell_without_dish` regarde s'il existe
        // UN plat à ce jour/moment), et les deux autres bouches n'avaient rien
        // — `mouth_unfed: unfed:not_named` et `cell_without_portion`. Les six
        // autres soirs portaient bien le plat de la table.
        //
        // ⚠️ LA PHRASE EST ICI, collée au plancher qu'elle corrige, et pas
        // dans `dedicatedDishBlock`: c'est CE nombre-là qu'elle qualifie. Un
        // « un plat par case » que le dédié satisfait est un plancher désarmé.
        //
        // ⚠️ ET ELLE EST ADDITIVE, PAS DISSUASIVE. La phrase vit 20 000
        // caractères AVANT le bloc « A DISH OF THEIR OWN », qui est celui qui
        // ORDONNE les plats dédiés (38 sur ce foyer). S'arrêter à « un plat
        // `for_member_id` ne prend jamais la place de celui de la table » la
        // laisse se lire comme une mise en garde CONTRE la clé, si loin de
        // l'ordre qui la réclame. La dernière ligne renvoie donc à ce bloc au
        // lieu de laisser le modèle arbitrer entre les deux.
        //
        // ⛔ ET CE CONTRÔLE-LÀ NE BLOQUE PAS. `own_meal_dish_missing` est de
        // sévérité `count`: un plan qui perdrait ses 38 plats dédiés serait
        // livré en 200 avec 38 écarts nommés. Un troc entre les deux moitiés
        // de cette consigne ne se verrait donc PAS dans le verdict — il se
        // compte, plat par plat, dans `member_id`.
        "Each of those cells needs the TABLE's dish -- a dish with NO " +
        "`for_member_id`. That dish is what fills the cell. A dish that " +
        "carries `for_member_id` is one person's own: it comes ON TOP of the " +
        "table's dish for that same cell and never takes its place -- a cell " +
        "whose only dish carries `for_member_id` is a cell where everyone " +
        "else eats nothing. Where a block below orders someone a dish of " +
        "their own, write BOTH dishes on that cell: the table's, and theirs.",
        // `baseCap`, PAS `cap` — voir les deux nombres en tête de fonction.
        `cooking sessions: at most ${batchSessionBudget(baseCap)} for the whole ` +
        "stretch. Most lunches and dinners must therefore come from BATCHES — " +
        "one cooking session, several servings, several days, declared in " +
        "`batch`. Seventeen separately-cooked dishes is not a plan anybody cooks.",
        // ── ⛔ UNE RECETTE SE CUISINE UNE FOIS DANS LA FENÊTRE — 2026-09-07 ──
        //
        // Mesuré sur le run `be373339…` (foyer de trois, six jours): TROIS
        // casseroles de muffins aux œufs, une par session (lundi, mercredi,
        // vendredi), 18 œufs chacune, et le même petit-déjeuner six matins de
        // suite. Le modèle avait respecté la lettre de « never three days in a
        // row »: il avait renommé ses casseroles « du lundi », « du mercredi »,
        // « du vendredi » et changé un légume. Rapporté à l'écran: « pourquoi il
        // y a des muffins aux œufs toute la semaine ».
        //
        // Décision produit, mot pour mot: « le but est de varier, il ne peut pas
        // y avoir deux identiques cuisinés la même semaine (dans deux sessions de
        // cuisine différentes bien entendu) ». Un LOT qui couvre plusieurs jours
        // reste le geste voulu — c'est la phrase juste au-dessus —; ce qui est
        // refusé est de REFAIRE la même préparation dans une autre session.
        //
        // ⚠️ ELLE NOMME L'ÉCHAPPATOIRE MESURÉE (renommer par le jour), et elle
        // dit que les petits-déjeuners comptent: « main dish » dans la ligne de
        // variété laissait le modèle en exclure le matin. Sans les deux, une
        // règle qualitative est une règle qu'il applique quand ça l'arrange.
        "A batch may feed several days, but a recipe is cooked ONCE in the " +
        "stretch: no two cooking sessions make the same preparation, and " +
        "renaming it by its day (\"Monday's egg muffins\", \"Wednesday's egg " +
        "muffins\") or swapping one vegetable does not make it a different " +
        "one. Breakfasts count like any other meal. When the same slot needs " +
        "covering again later in the stretch, cook something else.",
      ]
      : []),
    args.slot ? `meal: ${args.slot}` : "meal: whichever fits",
    // LE JOUR OÙ L'ON EST, et il n'y était pas. Le modèle repartait de lundi
    // par habitude: un plan généré le mercredi rendait trois jours déjà passés.
    ...(args.todayToken ? [`today is: ${args.todayToken}`] : []),
    // ── ⛔ LA CONSIGNE DES JOURS, ET ELLE A CHANGÉ DE PIVOT (2026-09-06) ──
    //
    // Elle finissait par « Do not start earlier than today ». Cette phrase
    // n'était juste que tant que la fenêtre commençait forcément dans la
    // semaine en cours: demandée un mercredi pour un départ mardi prochain,
    // elle disait au modèle de ne pas commencer avant `wed` au-dessus d'une
    // liste qui commence par `tue`. Il a refusé EN TOUTES LETTRES — `422
    // empty_meal`, `lock: disarmed_empty_text`, **après 6,2 s facturées**
    // (mesuré en HTTP réel le 2026-08-12). Ce n'était pas de la
    // désobéissance: les deux lignes se contredisaient, et aucune réponse
    // n'était juste.
    //
    // Le lot du 2026-08-12 a répondu en INTERDISANT le geste
    // (`windowStartsBeyondDayTokens`). Le 2026-09-06 a renversé cette décision
    // — un départ libre est une demande produit, « n'importe qui peut
    // sélectionner la date de début librement » —, donc la contradiction doit
    // être réparée plutôt qu'évitée.
    //
    // ⛔ LE PIVOT EST LA FENÊTRE, PLUS AUJOURD'HUI. La liste est ancrée par sa
    // DATE d'ouverture, qui est un fait non ambigu, et non par sa position
    // relative à `today`. « today is: … » et « today's date: … » restent
    // au-dessus: ils servent la saison et le ton, ils ne commandent plus
    // l'ordre.
    //
    // ⚠️ ET « ne décale pas pour commencer aujourd'hui » REMPLACE LA MOITIÉ
    // UTILE de l'ancienne phrase. Elle existait aussi contre un défaut réel —
    // le modèle repartait de lundi par habitude et rendait des jours déjà
    // passés. Une liste ancrée sur une date dit la même chose sans jamais
    // pouvoir se contredire.
    ...(daysToEat.length > 0
      ? [
        ...(args.windowStartsOn
          ? [`the stretch opens on ${args.windowStartsOn} (ISO date)`]
          : []),
        `days to fill, in this order: ${daysToEat.join(", ")}`,
        // ⛔ NOMMER LE JOUR NE SUFFIT PAS, IL FAUT CONTREDIRE L'A PRIORI.
        // La liste commençait par `sun` et portait déjà « ne décale pas pour
        // commencer aujourd'hui »; le modèle a quand même composé lundi →
        // vendredi et rendu zéro plat le dimanche (2026-09-18, foyer
        // `5e0c3825`). Une donnée qui contredit l'habitude du modèle sans la
        // NOMMER se fait lisser. Cette ligne dit l'habitude, puis la dément.
        ...(daysToEat[0] !== undefined && daysToEat[0] !== "mon"
          ? [
            `This stretch does NOT start on Monday. Its first day is ` +
            `${dayProse(daysToEat[0])}, and that ${dayProse(daysToEat[0])} ` +
            "carries its meals exactly like every other day of the list. A " +
            "plan whose first dish falls on Monday is a plan that dropped its " +
            "opening day.",
          ]
          : []),
        "Do not use any other day token. Fill exactly those days, in that " +
        "order, starting at the first one -- do not shift the list to begin " +
        "today, and do not add a day before it.",
      ]
      : []),
    // ── LE JOUR DE CUISINE QUI NE PORTE AUCUN REPAS ────────────────────────
    // ⚠️ IL EST DIT DEUX FOIS, ET C'EST VOULU: une fois ici (« n'écris aucun
    // plat ce jour-là »), une fois dans le bloc de cuisine (« c'est là que la
    // session a lieu »). La liste au-dessus ne le contient déjà plus; cette
    // phrase existe parce qu'une ABSENCE ne s'obéit pas — le modèle connaît le
    // jour par la date de départ du plan, et l'a déjà rempli quand rien ne le
    // lui interdisait.
    ...(args.cookOnlyDay !== null
      ? [
        `the stretch opens on ${args.cookOnlyDay}, and that day is a COOKING ` +
        "day only: they cook ahead on it and eat NOTHING from it. Write no " +
        `dish on ${args.cookOnlyDay} -- not a breakfast, not a snack. It is ` +
        "the day the batches are made, for the days listed above.",
      ]
      : []),
    // ── ① L'ARBITRAGE, EN DERNIER, PARCE QUE C'EST LÀ QU'IL EST LU ────────
    // Voir l'en-tête de `PRECEDENCE_BLOCK`. Il vient APRÈS la commande et
    // non avant: la commande dit QUOI produire, celui-ci dit comment
    // trancher entre deux lignes du message qui demandent l'inverse — c'est
    // la dernière chose à savoir avant d'écrire, donc la dernière écrite.
    "",
    PRECEDENCE_BLOCK,
  ].join("\n");

  return {
    // ⚠️ DEUX VARIANTES CACHEABLES, PAS UNE. Le bloc des contenants solo est un
    // SCHÉMA (il décrit une clé de sortie), donc il vit avec les autres règles
    // de forme; le poser dans le message utilisateur en aurait fait la seule
    // règle de forme ailleurs. Le prix est un second préfixe de cache, et la
    // lane foyer garde EXACTEMENT le prompt d'avant — un test le tient.
    systemPrompt: args.soloBoxes
      ? `${MEAL_SYSTEM_PROMPT}\n\n${SOLO_BOX_BLOCK}`
      : MEAL_SYSTEM_PROMPT,
    // Le bloc de langue en DERNIER, sur le `userMessage` (récence), jamais sur
    // le `systemPrompt` (cacheable, partagé par tous les élèves).
    //
    // ⚠️ `generate-meal-v1` colle un `hungerSuffix` APRÈS ce message avant
    // d'appeler le modèle. `appendContentLanguageBlock` étant idempotent, la
    // remise du bloc après ce suffixe est faite là-bas — ici on garantit qu'il
    // existe, là-bas qu'il est bien le dernier.
    userMessage: appendContentLanguageBlock(
      userMessage,
      args.contentLocale,
      MEAL_TRANSLATABLE_FIELDS,
      MEAL_TOKEN_FIELDS,
    ),
    // Le motif `maxNutrition` appliqué à la langue: la valeur qui a servi
    // RESSORT, et c'est elle que l'appelant écrit en base. Une seule
    // expression, donc aucune divergence possible.
    contentLocale: args.contentLocale,
  };
}

// ---------------------------------------------------------------------------
// Le parseur — c'est lui qui tient les quatre garanties
// ---------------------------------------------------------------------------

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * LE GROUPE ALIMENTAIRE DÉCLARÉ, VALIDÉ CONTRE LA LISTE FERMÉE.
 *
 * ── TROIS ÉTATS, ET LE COMPTEUR EN A BESOIN DES TROIS ─────────────────────
 *   · `{ declared: false, group: null }` — le modèle n'a rien écrit.
 *   · `{ declared: true,  group: null }` — il a écrit quelque chose qui n'est
 *     PAS du vocabulaire. C'est un REFUS, et il ne doit surtout pas se
 *     confondre avec le premier: « le modèle n'obéit pas » et « le modèle
 *     invente des slugs » appellent deux corrections opposées.
 *   · `{ declared: true,  group: <ref> }` — valide.
 *
 * ⛔ NE LÈVE JAMAIS. `parseFoodGroupRef` est un parseur R7 « fail loudly »:
 * une chaîne inconnue le fait JETER. Le laisser remonter ferait tomber le plan
 * ENTIER pour un mot mal orthographié dans un champ annexe — un `empty_meal`
 * sur un motif dont l'élève ne peut rien faire, exactement ce que FF-037 R5
 * interdit. On rattrape, on compte, et le plan continue avec le comportement
 * d'avant ce lot sur cet aliment-là.
 */
function readDeclaredGroup(
  ing: Record<string, unknown>,
): { declared: boolean; group: FoodGroupRef | null } {
  const raw = cleanText(ing.group ?? ing.food_group ?? ing.foodGroup);
  if (!raw) return { declared: false, group: null };
  // « null » ÉCRIT EN TOUTES LETTRES est l'échappatoire NOMMÉE de la consigne,
  // et un modèle en mode JSON la rend parfois en chaîne. La compter comme un
  // refus punirait le modèle d'avoir obéi.
  if (raw.toLowerCase() === "null") return { declared: false, group: null };
  try {
    return { declared: true, group: parseFoodGroupRef(raw) };
  } catch {
    return { declared: true, group: null };
  }
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ LOT D (2026-09-11) — LA STRUCTURE DE CUISSON, DÉCLARÉE PAR LE MODÈLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ MÊME PATRON QUE `for_member_id`, `preparation_id`, `same_day` ET `group`:
 * inventé par le modèle, vérifié contre une liste fermée, JETÉ et COMPTÉ quand
 * il n'y est pas. Ce qui est refusé ici, c'est de DÉCOUPER LA PROSE de la
 * recette pour deviner ce qui tient une sauce — le plan l'interdit nommément,
 * et ce dépôt a mesuré 12 faux positifs sur 12 la dernière fois qu'il a écrit
 * un rapprochement maison.
 *
 * ⚠️ CE PARSEUR NE VALIDE NI LES RÔLES, NI LES LIENS, NI LA COUVERTURE DES
 * LIGNES. Il TRANSPORTE ce que le modèle a écrit; c'est `bodiesOfUnit`
 * (`culinary_structure.ts`) qui décide, et qui retombe sur le traitement
 * conservateur au premier défaut. Deux endroits pour une même décision
 * rendraient le jour où elle change deux réponses différentes.
 */
function readComponents(
  raw: Record<string, unknown>,
): { id: string; role: string | null; partOf: string | null }[] {
  const list = raw.components;
  if (!Array.isArray(list)) return [];
  const out: { id: string; role: string | null; partOf: string | null }[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const id = cleanText(rec.id);
    if (!id) continue;
    out.push({
      id,
      role: cleanText(rec.role) || null,
      partOf: cleanText(rec.part_of ?? rec.partOf) || null,
    });
  }
  return out;
}

/** Le composant qu'une ligne cite. Vide ⇒ `null`, et le bloc devient conservateur. */
function readPart(ing: Record<string, unknown>): string | null {
  return cleanText(ing.part) || null;
}

/**
 * Une durée en minutes, ou `null`.
 *
 * ── PAS DE ZÉRO PAR DÉFAUT ────────────────────────────────────────────────
 * Une durée manquante rend `null`, jamais `0`: « 0 min » se lit « c'est
 * instantané », ce qui est une promesse, alors que `null` se lit « on ne sait
 * pas » et l'écran sait taire ce qu'il ne sait pas.
 *
 * ── PLAFONNÉE À QUATRE HEURES ─────────────────────────────────────────────
 * Au-delà, c'est une hallucination d'unité (des secondes prises pour des
 * minutes, une marinade de 24 h comptée comme du temps de cuisine) et l'afficher
 * ferait renoncer quelqu'un devant une session qui prend en fait une heure.
 */
function readMinutes(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(240, Math.round(n));
}

/**
 * Une quantité de courses ne porte JAMAIS d'unité d'énergie.
 *
 * Volontairement plus étroit que `findNumericTarget`: le champ `quantity` est
 * par définition une quantité, donc y interdire les grammes le rendrait
 * inutilisable. Ce qu'on interdit, c'est la seule chose qu'une quantité
 * d'achat ne peut pas être — des kcal.
 */
const ENERGY_UNIT_RE = /\d[\d.,]*\s*(kcal|kj|cal(?:orie)?s?)\b/i;

/**
 * FF-038 — LA QUANTITÉ STRUCTURÉE D'UN INGRÉDIENT, LUE PUIS RECALCULÉE.
 *
 * ── LECTURE TOLÉRANTE, JAMAIS RÉPARATRICE ────────────────────────────────
 * Un champ absent, hors liste fermée ou illisible vaut `null` et se compte.
 * Il ne se complète pas: un `state` deviné « raw » sur du riz fausse d'un
 * facteur 2,6, et toujours dans le sens qui gonfle. Le silence d'un modèle
 * n'est pas une valeur.
 *
 * ── LES GRAMMES SONT RECALCULÉS, PAS LUS ─────────────────────────────────
 * Même si le modèle rendait un champ `grams`, il ne serait pas lu. Précédent
 * `in_pantry` (garantie 2 de l'en-tête): l'arithmétique du modèle n'est pas
 * une preuve.
 *
 * `composition === null` (référentiel indisponible) ⇒ les trois champs sont
 * quand même lus et gardés, seuls les grammes manquent. La donnée structurée
 * survit à une panne de la table qui l'exploite.
 */
function readStructuredQuantity(
  ing: Record<string, unknown>,
  composition: CompositionIndex | null,
  term: string,
  /**
   * ⟳ LOT C (2026-09-11) — CE QU'ON A DÉCIDÉ DE L'IDENTIFIANT DE CETTE LIGNE.
   *
   * ⛔ REQUIS, jamais `?`. Les grammes se calculent DEPUIS la référence: laisser
   * ce paramètre optionnel ferait retomber un appelant oublieux sur le chemin
   * par terme libre — c'est-à-dire sur le défaut mesuré que le lot ferme — et
   * la seule preuve serait une assiette. Le compilateur est le seul recenseur
   * d'appelants qui ne mente pas.
   */
  reading: RefReading,
): Pick<
  DishIngredient,
  "ref" | "refRefused" | "amount" | "unit" | "state" | "gramsRaw" | "quantitySource"
> {
  const rawAmount = Number(ing.amount);
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : null;
  const unitRaw = cleanText(ing.unit).toLowerCase();
  const unit = (COMPOSITION_UNITS as readonly string[]).includes(unitRaw)
    ? (unitRaw as CompositionUnit)
    : null;
  const stateRaw = cleanText(ing.state).toLowerCase();
  const state = (COMPOSITION_STATES as readonly string[]).includes(stateRaw)
    ? (stateRaw as CompositionState)
    : null;

  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ LOT `L-1-b` · LA SECONDE COPIE DE LA QUANTITÉ — 2026-08-22
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Le prompt demande la quantité DEUX FOIS (`== SAY THE SAME QUANTITY TWICE ==`).
  // Mesuré le 2026-08-22 sur tout le corpus: sur **3 850** lignes sans `amount`,
  // **3 833 (99,6 %) portent un `quantity` textuel non vide** — le modèle a
  // écrit la copie en prose et pas la copie structurée, et le produit ne gardait
  // que celle qui manque. C'est la forme exacte de `L17-0`, sur un autre champ.
  //
  // ⛔ `amount`, `unit` ET `state` NE SONT PAS TOUCHÉS. Ils restent la
  // DÉCLARATION du modèle, ils partent tels quels en base, et les deux compteurs
  // d'obéissance à FF-038 (`structured_quantity_missing` juste en dessous,
  // `unquantified_dish_ingredients` en fin de parseur) continuent donc de
  // compter exactement la même chose qu'avant ce lot. Les fondre rendrait un
  // modèle qui cesse d'obéir indiscernable d'une lecture réparée.
  //
  // ⛔ ET AUCUN MOT N'EST LU: `weighableQuantityOf` délègue à
  // `quantity_from_prose.ts`, qui n'accepte qu'un nombre suivi d'un symbole de
  // mesure ancré des deux bouts (`150 g`, `200 ml`), un nombre nu ou une
  // fraction nue. `a handful`, `2 tbsp`, `1 large onion`, `75 g dry` rendent
  // `null`, et 60+ chaînes de refus sont testées une par une.
  const weighable = weighableQuantityOf({ amount, unit, quantity: cleanText(ing.quantity) });

  const ref = reading.slug;
  const refRefused = reading.outcome === "unknown" ||
    reading.outcome === "not_composable";

  return {
    ref,
    refRefused,
    amount,
    unit,
    state,
    gramsRaw: gramsRawForIngredient(composition, {
      term,
      ref,
      refRefused,
      quantity: cleanText(ing.quantity),
      amount,
      unit,
      state,
    }),
    quantitySource: weighable.source,
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE GROUPE QUE LE RÉFÉRENTIEL DONNE À CETTE LIGNE — 2026-09-13.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ PAR L'IDENTIFIANT SEULEMENT, JAMAIS PAR LE LIBELLÉ. `refForIngredient`
 * retombe sur le terme quand aucun `ref` n'est écrit; s'en servir ici
 * remplacerait un groupe déclaré par un groupe deviné à partir de mots — très
 * exactement ce que le dépôt s'interdit (« laitue » n'est pas « lait »). On
 * exige donc `source === "ref"`: l'identifiant a été LU DANS UNE LISTE, le
 * libellé non.
 *
 * Rend `null` dans les trois cas où la ligne doit garder ce que le modèle a
 * déclaré: pas d'index, pas de `ref`, `ref` inconnu.
 */
function referentialGroupOfLine(
  composition: CompositionIndex | null,
  ing: { term: string; ref: string | null; refRefused: boolean },
): FoodGroupRef | null {
  const resolved = resolveCompositionLine(composition, ing);
  if (resolved.source !== "ref" || resolved.ref === null) return null;
  return closedGroupOrNull(resolved.ref.foodGroupRef);
}

/**
 * LE JETON DE CONSERVATION, LU — `"fridge"` quand rien n'est dit.
 *
 * ⚠️ LE NON-DIT EST LE STRICT, et c'est ce qui rend ce lot réversible: un
 * modèle qui n'écrit jamais `kept` produit exactement le plan d'avant, au plat
 * près. Un défaut à `"freezer"` aurait relâché la fenêtre du cuit sur toute la
 * population, pour un champ que personne n'avait encore vu.
 *
 * ⚠️ UN JETON INCONNU RETOMBE SUR `"fridge"` AUSSI, sans jeter: `kept` est une
 * PRÉCISION en plus, et perdre un dîner parce qu'un modèle a écrit « frozen »
 * au lieu de « freezer » échangerait le repas contre le confort du parseur.
 * Posture `for_member_id` / `same_day` / `box_id`.
 */
function readKept(raw: unknown): KeptWhere {
  return String(raw ?? "").trim().toLowerCase() === "freezer" ? "freezer" : "fridge";
}

/**
 * LE JSON D'UNE RÉPONSE MODÈLE, CLÔTURE MARKDOWN RETIRÉE.
 *
 * ⛔ EXPORTÉ POUR N'EXISTER QU'UNE FOIS. Depuis la fermeture du lot 1
 * (2026-09-12), une réparation ne rend plus un plan mais un PATCH
 * (`plan_repair_patch.ts`) : deux lecteurs, et donc deux façons de retirer
 * les trois accents graves. Deux copies d'une même règle dont une seule reçoit
 * la correction est un défaut que ce fichier documente déjà ailleurs.
 *
 * ⚠️ IL JETTE SUR DU JSON ILLISIBLE, et c'est voulu: l'appelant sait quoi
 * faire d'un texte qu'on n'a pas su lire, ce module ne le sait pas.
 *
 * PURE: no I/O, no clock, no randomness.
 */

/**
 * ══════════════════════════════════════════════════════════════════════════
 * OÙ LE VERROU DE SORTIE MORD — SURFACE PAR SURFACE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ POURQUOI ELLE EXISTE. `applyKeelOutputLocks` lit UN SEUL TEXTE: tous les
 * plats, toutes les casseroles, toutes les notes et toute la liste concaténés.
 * Quand il mord, on sait QUE le plan est dangereux et pas OÙ — donc la seule
 * réponse possible était de tout jeter. Une arachide dans le dîner de samedi
 * rendait les six repas indisponibles.
 *
 * ⛔ ELLE NE REMPLACE PAS LE VERROU, ELLE LE REJOUE PAR SURFACE. Le même
 * appel, les mêmes contraintes, la même doctrine — une seconde détection
 * écrite à côté finirait par diverger, et c'est celle qu'on regarde le moins
 * qui laisserait passer l'arachide.
 *
 * ⛔ ET ELLE EST APPELÉE DEUX FOIS DANS LE PRODUIT: par le parseur, pour
 * nommer les morsures du premier jet; et par le générateur AVANT LA
 * LIVRAISON, sur le plan réellement écrit. La seconde est la ceinture qui
 * rend la première utilisable — « la sécurité s'applique même si le budget
 * modèle est épuisé ».
 *
 * ⚠️ `unlocalized` QUAND RIEN N'EST TROUVÉ ET QUE `globalTokens` N'EST PAS
 * VIDE: le verrou a mordu sur le texte concaténé et sur aucune surface isolée.
 * On garde un blocage global plutôt que d'accuser au hasard.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function localizeOutputLockBites(args: {
  /**
   * ⛔ LES SURFACES, RECENSÉES UNE FOIS PAR `collectOutputSurfaces`. Ce
   * paramètre a remplacé cinq listes de champs recopiées par l'appelant, et
   * c'est le défaut fermé : le texte concaténé du verrou global et cette
   * localisation descendent désormais du MÊME recensement, donc ils ne peuvent
   * plus oublier des champs différents.
   */
  readonly surfaces: readonly OutputSurface[];
  readonly groupBites: readonly {
    readonly bearer: string;
    readonly term: string;
    readonly foodGroup: string;
    readonly allergenRef: string;
  }[];
  /** Les jetons du verrou GLOBAL. Vide = il n'a pas mordu sur l'ensemble. */
  readonly globalTokens: readonly string[];
  readonly safetyConstraints: readonly StudentSafetyConstraint[] | null;
  readonly doctrine: Pick<CoachDoctrine, "forbidden" | "foods"> | null;
}): UnsafeViolation[] {
  const violations: UnsafeViolation[] = [];
  const mord = (text: string): string[] | null => {
    if (String(text ?? "").trim() === "") return null;
    const r = applyKeelOutputLocks({
      text,
      isKeelStudent: true,
      safetyConstraints: args.safetyConstraints,
      doctrine: args.doctrine,
    });
    const propre = r.reason === "clean" || r.reason.startsWith("disarmed");
    return propre ? null : r.tokens;
  };
  const vide = {
    index: null,
    sessionIndex: null,
    day: null,
    slot: null,
    title: null,
    memberId: null,
    preparationId: null,
    preparationIds: [] as readonly string[],
    memberIds: [] as readonly string[],
    term: null,
  } as const;
  for (const s of args.surfaces) {
    const tokens = mord(s.text);
    if (tokens === null) continue;
    violations.push({ where: s.kind, ...s.address, tokens });
  }
  // ⛔ LA SECONDE CEINTURE EST DÉJÀ LOCALISÉE: elle nomme le PORTEUR et le
  // groupe déclaré. On la reprend telle quelle plutôt que de la rejouer.
  for (const bite of args.groupBites) {
    violations.push({
      ...vide,
      where: "declared_group",
      title: bite.bearer,
      term: bite.term,
      tokens: [bite.allergenRef, bite.foodGroup],
    });
  }
  if (violations.length === 0 && args.globalTokens.length > 0) {
    violations.push({ ...vide, where: "unlocalized", tokens: args.globalTokens });
  }
  return violations;
}

export function decodeModelJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  return JSON.parse(
    raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  );
}

export function parseGeneratedMeal(
  raw: unknown,
  args: {
    doctrine: Pick<CoachDoctrine, "forbidden" | "foods"> | null;
    safetyConstraints: readonly StudentSafetyConstraint[] | null;
    mode: MealMode;
    scope: MealScope;
    pantry: readonly PantryItem[];
    /** Les clés de la doctrine publiée, pour filtrer `honours_belief_keys`. */
    beliefKeys: readonly string[];
    /**
     * LES MOMENTS D'UNE JOURNÉE NORMALE POUR CET ÉLÈVE — les mêmes que ceux
     * passés à `buildMealPrompt`. Vide = il ne les a pas déclarés.
     *
     * REQUIS, `T` avec une valeur explicite pour « on ne sait pas » (`[]`),
     * jamais `T?`. Ce paramètre n'existait pas, et son absence était le défaut:
     * le plafond du PROMPT suivait le rythme (5 occasions ⇒ 5 plats) pendant que
     * le plafond du PARSEUR l'ignorait et retombait sur trois. Un élève à cinq
     * repas voyait donc ses deux dernières occasions tomber APRÈS génération —
     * c'est-à-dire disparaître, sans que rien ne le dise, ce que le commentaire
     * de `dishCapFor` promettait précisément d'empêcher.
     *
     * Optionnel, il serait ré-oublié par le prochain appelant, en silence, et la
     * seule preuve serait une journée trouée. Même raisonnement que
     * `safetyConstraints` dans `buildWeekPlanPrompt`.
     */
    eatingRhythm: readonly EatingOccasionSlot[];
    /**
     * LES CONTENANTS SANS NOM — la lane individuelle, 2026-09-01.
     *
     * ⛔ REQUIS. Il ouvre UNE porte et une seule: un couvercle sans `member_ids`
     * est accepté. Tout le reste du protocole (la ceinture de régime, les
     * compteurs par bouche, `onePerMouth`) reste fermé par `boxMembers.size`,
     * qui vaut zéro sur cette lane — ces règles départagent des mangeurs, et il
     * n'y en a qu'un.
     *
     * ⚠️ IL NE SE DÉDUIT PAS DE `boxMemberIds.length === 0`. Un foyer dont le
     * roster n'a pas pu être lu rendrait alors la même chose qu'un solo, et on
     * accepterait des bacs anonymes sur une table de quatre — c'est-à-dire des
     * contenants que personne ne sait à qui ouvrir. L'appelant DIT.
     */
    soloBoxes: boolean;
    /**
     * ⟳ 2026-09-07 — RECETTE STANDARD (v33). Voir la déclaration jumelle sur
     * `MealPromptArgs`: `true` fait accepter `servings_made: 1`, qui est le cas
     * NOMINAL quand chaque plat tire une portion de sa casserole.
     *
     * ⛔ REQUIS ET SANS DÉFAUT: un `?` relirait une sortie v33 avec les règles
     * de v32 et jetterait ses casseroles.
     */
    standardRecipe: boolean;
    /**
     * LE JOUR DE CUISINE QUI NE PORTE AUCUN REPAS — « je cuisine la veille ».
     *
     * ⛔ REQUIS ET NULLABLE, et il traverse jusqu'ici parce que DEUX gardes en
     * dépendent: les cases vides (un jour sans repas n'a pas de case à remplir)
     * et le placement des plats (un plat écrit sur ce jour-là contredit la
     * consigne, et il est refusé plutôt qu'affiché).
     *
     * ⚠️ IL EST DANS `daysToFill`, comme côté prompt: c'est lui qui situe la
     * casserole du rang 0 dans la fenêtre du cuit. Le retirer de `daysToFill`
     * rendrait tous ses lots `not_evaluated`, dont le seuil est zéro.
     */
    cookOnlyDay: string | null;
    /**
     * LES JOURS RÉELLEMENT DEMANDÉS. REQUIS pour la même raison que
     * `eatingRhythm` juste au-dessus: le plafond du parseur doit être celui du
     * prompt, et un paramètre optionnel est un paramètre qu'un appelant oublie
     * — après quoi le prompt demande quatre jours et le parseur en accepte
     * sept, ce qui est exactement le débordement qu'on répare.
     */
    daysToFill: readonly string[];
    /**
     * LES MOMENTS ÉCARTÉS — les mêmes que ceux passés à `buildMealPrompt`.
     *
     * REQUIS, avec `[]` pour « aucun », jamais `T?`. C'est la troisième fois
     * que ce fichier écrit la même phrase, et elle a été payée trois fois: un
     * paramètre optionnel est un paramètre qu'un appelant oublie, après quoi la
     * consigne interdit un moment que le parseur accepte — et le plat interdit
     * arrive dans l'assiette avec l'air d'avoir été voulu.
     */
    awayDays: readonly AwayDay[];
    /**
     * LE TEMPS PAR SESSION DÉCLARÉ PAR L'ÉLÈVE, ou `null` s'il ne l'a pas dit.
     *
     * REQUIS, `T | null`, jamais `T?`: c'est un PLAFOND, et un plafond qu'un
     * appelant peut oublier de passer est un plafond désarmé — le prompt
     * l'annonce, personne ne le vérifie, et on ne le découvre qu'en mesurant un
     * plan à la main. Mesuré le 2026-08-06: 30 minutes déclarées, 55 produites.
     */
    cookingTimeMin: number | null;
    /**
     * CE QUE CETTE CUISINE POSSÈDE — `null` quand la question n'a jamais été
     * posée. 2026-09-01.
     *
     * ⚠️ REQUIS, `T | null`, jamais `T?`. C'est la SIXIÈME fois que ce fichier
     * écrit cette phrase, et il l'a payée les cinq précédentes (`eatingRhythm`,
     * `awayDays`, `cookingTimeMin`, `composition`, `fixedIntakes`): un
     * paramètre optionnel est un paramètre qu'un appelant oublie, après quoi la
     * garde du congélateur tombe sur `undefined` et se comporte comme si
     * personne n'en avait — c'est-à-dire qu'elle jette les plats que ce lot
     * existe pour garder, sans un seul rouge.
     *
     * ⛔ IL NE SERT QU'À `kept: "freezer"`, ET LA DIRECTION EST FAIL-CLOSED.
     * `null` (jamais demandé) et « pas de congélateur » retombent tous deux sur
     * `MAX_FRIDGE_DAYS`. On n'ouvre une fenêtre de conservation que sur une
     * affirmation, jamais sur une ignorance.
     */
    kitchenEquipment: readonly KitchenTool[] | null;
    /**
     * FF-038 — LE RÉFÉRENTIEL DE COMPOSITION, ou `null` quand il n'a pas pu
     * être chargé.
     *
     * REQUIS, `T | null`, jamais `T?`. C'est la QUATRIÈME fois que ce fichier
     * écrit cette phrase, et il l'a payée les trois précédentes
     * (`eatingRhythm`, `awayDays`, `cookingTimeMin`): un paramètre optionnel
     * est un paramètre qu'un appelant oublie, et la seule preuve serait une
     * colonne de grammes vide que personne ne regarde. Ici la casse de
     * compilation est LE mécanisme qui recense les deux lanes.
     *
     * `null` est un fail-open ASSUMÉ: les trois champs structurés sont quand
     * même lus et gardés, seuls les grammes manquent. L'instrumentation ne
     * doit jamais coûter un dîner à un élève.
     */
    composition: CompositionIndex | null;
    /**
     * ══════════════════════════════════════════════════════════════════════
     * LOT C (2026-09-11) — LA PORTE DE COMPOSITION DU LOT A, INJECTÉE.
     * ══════════════════════════════════════════════════════════════════════
     *
     * ⚠️ OPTIONNEL, ET SON DÉFAUT EST LA PORTE FERMÉE — c'est ce qui évite ici
     * la cicatrice « paramètre optionnel = garde désarmée ». Le défaut est
     * `isComposable` (`food_reference_manifest.ts`, lot A): un appelant qui
     * l'oublie obtient la règle, pas son absence. Le rendre REQUIS aurait cassé
     * le typecheck des fonctions edge, qui appartiennent au lot E et que ce lot
     * n'a pas le droit de modifier.
     *
     * ⛔ CE QUE CE PARAMÈTRE SERT ALORS À FAIRE: l'OUVRIR sciemment, et
     * seulement pour une MESURE. Arbitrage ② du socle — « la porte est à la
     * COMPOSITION, pas à la mesure »: rejouer un plan historique doit rester
     * possible, et `ANY_INDEXED_REF` est le prédicat qui le permet, nommé pour
     * qu'on voie ce qu'il désarme.
     *
     * ⚠️ ET LE COMPTEUR RESTE: `ref_refused` sépare `unknown` (identifiant
     * inventé) de `not_composable` (identifiant réel que le manifeste refuse).
     * Sans lui, une porte jamais franchie et une porte jamais armée rendraient
     * le même zéro.
     */
    composable?: ComposablePredicate;
    /**
     * FF-051 — LES MÊMES APPORTS QUE CEUX PASSÉS À `buildMealPrompt`.
     *
     * REQUIS, `[]` pour « aucun ». Les deux bouts, comme pour `awayDays`: une
     * consigne « ne compose pas de petit-déjeuner » sans vérification derrière
     * est une consigne qu'un modèle de composition respectera la plupart du
     * temps — et « la plupart du temps » veut dire que l'élève doit vérifier.
     */
    fixedIntakes: readonly FixedIntake[];
    /**
     * FF-052 — LES MÊMES propriétés que celles passées à `buildMealPrompt`.
     *
     * REQUIS, `[]` pour « rien ». Les deux bouts: la consigne dit « ne compose
     * rien de neuf ce jour-là », le parseur retire le plat neuf s'il arrive
     * quand même.
     */
    dayProperties: readonly DayPropertyEntry[];
    /**
     * L4/D6 — LA MÊME BOUCHE REPRISE que celle passée à `buildMealPrompt`.
     *
     * REQUIS, `T | null`, jamais `T?`. Les DEUX BOUTS, et c'est ce champ qui
     * les tient ensemble: il gouverne le budget de plats (annoncé par la
     * consigne, appliqué ici) ET la garde de préparation juste en dessous. Le
     * jour où les deux appels ne portent pas la même valeur, la consigne
     * demande un second plat que le parseur jette — c'est exactement le défaut
     * mesuré le 2026-08-12, dans les deux sens à la fois.
     */
    merge: MergedEater | null;
    /**
     * LOT 4 — LES BOUCHES À QUI UNE BOÎTE PEUT ÊTRE ATTRIBUÉE, avec leur id
     * EXACT. C'est le ROSTER ENTIER d'un foyer, et pas `dishBearerIds`: tout le
     * monde reçoit une part, seuls quelques-uns reçoivent un plat à eux.
     *
     * ⚠️ REQUIS, `[]` pour « personne », jamais `T?`. C'est la sixième fois que
     * ce fichier écrit cette phrase et il l'a payée les cinq précédentes: un
     * paramètre facultatif n'aurait fait remonter AUCUN appelant au
     * compilateur, la liste fermée serait vide sur les deux lanes, chaque boîte
     * serait refusée, et le lot entier serait construit-branché-désarmé sans un
     * seul rouge. « Paramètre de garde optionnel = garde désarmée. »
     *
     * `[]` sur la LANE INDIVIDUELLE, et c'est voulu: son prompt ne porte aucun
     * id de bouche, donc le modèle n'a rien à écrire, donc rien n'est
     * attribuable — exactement la posture de `memberId`, qui y est toujours
     * `null`. Une boîte qui arriverait quand même y est jetée et COMPTÉE.
     *
     * ⚠️ LE ROSTER ENTIER À NOUVEAU DEPUIS v4 (2026-08-20). Entre le 08-19 et le
     * 08-20 cette liste valait `weighedPortionMembers(members)` — les seules
     * bouches à objectif — parce que v3 ne donnait de contenant qu'à elles. v4
     * renverse ce silence: le bac commun NOMME les autres, donc le parseur doit
     * les accepter sur un couvercle. La distinction « qui ouvre une portion
     * millimétrée » vit maintenant dans `weighedMemberIds`, juste en dessous.
     */
    boxMemberIds: readonly string[];
    /**
     * ══════════════════════════════════════════════════════════════════════
     * LES BOUCHES DONT UN OBJECTIF OUVRE UNE PORTION MILLIMÉTRÉE.
     * ══════════════════════════════════════════════════════════════════════
     *
     * ⛔ CE N'EST PAS UNE LISTE FERMÉE DE PLUS — c'est le SEUL moyen de dériver
     * `box_counts.expected` sans le modèle. Le nombre de groupes d'un repas est
     * « une bouche à objectif = un groupe, tout le reste = un groupe », et sans
     * savoir qui a un objectif, l'attendu n'est pas calculable — donc zéro
     * contenant rendu serait indiscernable d'un foyer où personne n'en demande.
     *
     * ⚠️ REQUISE, `[]` pour « personne », jamais `T?`. Huitième fois dans ce
     * fichier: un paramètre de garde optionnel est une garde désarmée, et ici il
     * ferait lire `expected` à la moitié de sa valeur sur tout foyer à objectif,
     * c'est-à-dire un taux de couverture flatteur et faux.
     *
     * ⚠️ SOUS-ENSEMBLE DE `boxMemberIds`, et la dérive se COMPTE: un id nommé ici
     * sans être dans le roster est une seconde liste qui a divergé de la
     * première, et il est ignoré avec une `issue`.
     *
     * `[]` sur la LANE INDIVIDUELLE, comme `boxMemberIds`.
     */
    weighedMemberIds: readonly string[];
    /**
     * ══════════════════════════════════════════════════════════════════════
     * LA CEINTURE DE RÉGIME — LE RÉGIME DÉCLARÉ DE CHAQUE BOUCHE.
     * ══════════════════════════════════════════════════════════════════════
     *
     * ⛔ CE QUE CE PARAMÈTRE FERME, ET IL A ÉTÉ MESURÉ CINQ PLANS SUR CINQ.
     * Le 2026-08-19, sur la lane FOYER, un enfant VÉGANE de 9 ans a reçu
     * `Rich Smoky Beef Stew 207 g · Smoky Roast Chicken & Cauliflower 248 g`
     * dans `member_portions[].portion_note` — c'est-à-dire dans la phrase lue
     * à voix haute à table. `scanDietaryRegime` existait, il était juste, et
     * il n'avait ZÉRO appelant sur cette lane: la seule lane où plusieurs
     * régimes se rencontrent autour d'une casserole était la seule sans
     * ceinture.
     *
     * ⚠️ LA CAUSE N'ÉTAIT PAS UN RATTRAPAGE MANQUANT PLUS BAS. Le modèle avait
     * bien écrit une part pour Théodule sur ce repas, et il l'avait écrite parce
     * que le brief le lui ORDONNE (« every person eating at that meal is on the
     * lid — never two, never none »). La garde est donc ici, à l'entrée de la
     * boîte, là où l'appartenance se crée — pas plus bas, où elle ne serait
     * qu'un rattrapage, et pas chez l'appelant, où le prochain appelant
     * l'oublierait (cicatrice FF-030 R5).
     *
     * ⚠️ REQUIS, `[]` pour « personne n'a déclaré », jamais `T?`. C'est la
     * septième fois que ce fichier écrit cette phrase et il l'a payée les six
     * précédentes: un paramètre facultatif n'aurait fait remonter AUCUN
     * appelant au compilateur, la ceinture serait vide sur les deux lanes, et
     * le lot entier serait construit-branché-désarmé sans un seul rouge.
     * « Paramètre de garde optionnel = garde désarmée. »
     *
     * `[]` sur la LANE INDIVIDUELLE, et c'est voulu: elle n'a aucune boîte
     * (`boxMemberIds: []`), et elle porte DÉJÀ sa propre lecture de régime sur
     * les plats (`generate-meal-v1:2400`). La doubler ici compterait deux fois
     * la même morsure.
     *
     * ⚠️ UNE BOUCHE NOMMÉE ICI SANS ÊTRE DANS `boxMemberIds` EST UNE DÉRIVE, et
     * elle se COMPTE (`regime_belt.unknown_mouth`) au lieu de se taire: deux
     * listes qui décrivent le même roster finissent par diverger, et la seule
     * preuve serait une ceinture qui n'a jamais rien vu.
     */
    boxMemberDiets: readonly { memberId: string; regime: DietaryRegime | null }[];
    /**
     * ⛔ CE QU'UNE BOUCHE A DEMANDÉ D'ÉVITER — lot du 2026-09-01.
     *
     * Mesuré sur un tour réel: « Mon fils n'aime pas le poisson » était rangé,
     * attribué (`subject: member:Tom`), compté — **et le plan suivant servait du
     * saumon**. La lane foyer ne parle que pour `[household, titulaire]`, donc
     * l'exclusion d'un enfant n'avait AUCUN chemin pour agir.
     *
     * ⚠️ REQUIS ET POSITIONNEL, comme `boxMemberDiets`: c'est le compilateur qui
     * recense les appelants. Un `?` aurait désarmé la ceinture partout sans
     * qu'un seul appelant ne remonte — sept paramètres optionnels ont déjà été
     * des gardes mortes dans ce dépôt.
     */
    boxMemberExclusions: readonly { memberId: string; terms: readonly ForbiddenTerm[] }[];
  },
): GeneratedMeal {
  const issues: string[] = [];
  // ⟳ LOT C — LE DÉFAUT EST RÉSOLU UNE FOIS, ICI, ET C'EST LA PORTE FERMÉE.
  // Le répéter à chaque site d'appel ferait deux lectures de la même décision.
  const composable = args.composable ?? isComposable;
  const rejectedNumeric: string[] = [];
  /**
   * COMBIEN DE DÉROULÉS DE SESSION PORTENT ENCORE UN POIDS OU UN COMPTE DE
   * PORTIONS. Le brief le leur interdit (`WEIGH IT ONCE, INTO NAMED BOXES`);
   * ce nombre dit si l'interdit est suivi. Zéro sur zéro session est un
   * silence honnête — il n'y avait rien à mesurer.
   */
  let runThroughQuantity = 0;
  const rejectedAisles: string[] = [];
  /**
   * ══════════════════════════════════════════════════════════════════════
   * LOT C (2026-09-11) — CE QUE LE MODÈLE A FAIT DES IDENTIFIANTS
   * ══════════════════════════════════════════════════════════════════════
   *
   * ⛔ QUATRE CASES, ET C'EST LE POINT. Ce dépôt sait qu'un champ déclaré par le
   * modèle sans compteur ressemble exactement à un champ qu'il honore
   * (`model-declared-fields-need-a-counter`). Un seul chiffre — « 12 lignes non
   * pesées » — confondrait trois causes qui appellent trois corrections
   * opposées:
   *   · `absent`         le catalogue n'a pas été servi, ou l'aliment n'y est
   *                      pas: c'est ATTENDU, et ce n'est pas une faute;
   *   · `unknown`        l'identifiant a été INVENTÉ: durcir la consigne;
   *   · `not_composable` il existe mais le manifeste le refuse: lot A;
   *   · `accepted`       le dénominateur sans lequel les trois autres ne
   *                      veulent rien dire.
   */
  const refTally: Record<RefOutcome, number> = {
    absent: 0,
    accepted: 0,
    alias: 0,
    unknown: 0,
    not_composable: 0,
  };
  let unstructuredIngredients = 0;
  /** Les aliments DENSES laissés sans grammes — la part qui coûte le verdict. */
  const unweighedDenseTerms: string[] = [];
  /**
   * LES TERMES SANS QUANTITÉ, NOMMÉS — le troisième compteur, et il manquait.
   *
   * ── LE ZÉRO AMBIGU QU'IL FERME, MESURÉ LE 2026-08-19 ──────────────────
   * `structured_quantity_missing` rend `30/94 ingredients`. Ce nombre ne
   * distingue pas « 30 pincées de persil », qui est le produit voulu, de
   * « roast chicken thighs, 26 fois », qui est une protéine entière servie
   * sans nombre. Les deux se lisent pareil, et c'est pourquoi le défaut a
   * vécu: rejoué sur les 1 204 plats de foyer en base, 307 sont bloqués par
   * un terme sans `amount`, et la liste est dominée par des ALIMENTS.
   *
   * ⚠️ NOMMÉ, comme `energy_dense_unweighed` et pour la même raison: c'est le
   * TERME qui dit si la consigne a porté, jamais le compte. Un chiffre qui
   * descend de 30 à 8 ne dit pas si les 8 restants sont du sel ou du poulet.
   *
   * ⚠️ TOUS LES TERMES, PAS SEULEMENT LES NON-CONDIMENTS. La classe fermée des
   * condiments n'existe pas encore (elle est le lot d'après, et elle ne peut
   * pas se dériver de `food_group_ref`: le sel et le poivre y sont rangés avec
   * la vinaigrette). Nommer tout le monde laisse le lecteur voir « roast
   * chicken thighs » au milieu du persil — ce qui est très exactement le geste
   * que ce compteur doit rendre possible.
   */
  const unquantifiedTerms: string[] = [];
  let ingredientCount = 0;

  const parsed: unknown = decodeModelJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("[keel/meal] model output is not a JSON object");
  }

  const root = parsed as Record<string, unknown>;
  const allowedKeys = new Set(args.beliefKeys.map((k) => String(k).trim()).filter(Boolean));
  // LE MÊME PLAFOND QUE LE PROMPT, dérivé du MÊME rythme ET de la MÊME bouche
  // reprise. Deux copies d'un même nombre dont une seule reçoit la modification
  // est le défaut que ce fichier documente deux fois; ici les deux copies lisent
  // la même fonction avec la même entrée, donc elles ne peuvent plus diverger.
  const cap = dishBudgetFor({
    scope: args.scope,
    rhythm: args.eatingRhythm,
    daysToFill: args.daysToFill.length || 7,
    merge: args.merge,
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ LOT `L0-a` — LES DEUX FENÊTRES DE CONSERVATION
  // ══════════════════════════════════════════════════════════════════════════
  //
  //     achat ──[ FENÊTRE CRUE ]──► cuisson ──[ FENÊTRE CUITE ]──► dernière part
  //
  // ── ① LA FENÊTRE CRUE: LE GROUPE D'UN TERME ──────────────────────────────
  // Le modèle n'écrit AUCUN groupe sur la liste de courses, et `aisle` est trop
  // grossier — `protein` mélange le poisson (un jour cru) et la viande en pièce
  // (trois). Le référentiel de composition, lui, porte `food_group_ref` sur ses
  // 923 lignes: c'est la seule jointure vivante entre un terme et un groupe.
  //
  // ⚠️ `null` QUAND LE RÉFÉRENTIEL EST ABSENT, et c'est le même fail-open
  // assumé que pour les grammes: l'instrumentation ne doit jamais coûter un
  // dîner. Le repli est celui d'avant (`MAX_FRIDGE_DAYS` côté vagues) et il se
  // COMPTE.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · ÉTAPE C3 — LE DERNIER LECTEUR DE MESURE PARTANT DU LIBELLÉ
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE QU'IL FAISAIT, ET IL A ÉTÉ NOMMÉ PAR DEUX CHANTIERS SANS ÊTRE FERMÉ
  // (`NON-BRANCHE.md` ⑥) : `resolveIngredient(term)`, c'est-à-dire le LIBELLÉ
  // seul. Un identifiant écrit par le modèle (`ref: pita_wholemeal`) ne
  // comptait pas, et « pita complète » n'a aucun alias — donc `null`, donc
  // `MAX_FRIDGE_DAYS` côté vagues, donc une date d'achat potentiellement trop
  // précoce que personne ne regarde.
  //
  // ⛔ LE GROUPE VIENT DÉSORMAIS DE LA RÉFÉRENCE DE LA LIGNE, par le résolveur
  // unique du lot A — l'identifiant d'abord, le terme ensuite, rien du tout
  // quand l'identifiant a été refusé. C'est le point 6 de C3, mot pour mot.
  //
  // ⚠️ `null` QUAND LE RÉFÉRENTIEL EST ABSENT, et c'est le même fail-open
  // assumé qu'avant : l'instrumentation ne doit jamais coûter un dîner. Le
  // repli est celui d'avant, et il se COMPTE (`rawWindowCounts`).
  const foodGroupOfLine = (
    line: { term: string; ref?: string | null; refRefused?: boolean },
  ): FoodGroupRef | null => freshnessGroupOf(args.composition ?? null, line);

  // ── ② LA FENÊTRE CUITE: OÙ TOMBE UN JOUR DANS LA FENÊTRE DU PLAN ────────
  // Hissé hors de la queue de la fonction, où la règle vivait, parce qu'elle
  // devient un REFUS et qu'un refus se prononce AVANT que le plat n'entre dans
  // le plan — un plat construit puis retiré aurait déjà consommé le plafond et
  // compté ses `honours_belief_keys`.
  const fridgeWindowDays = args.daysToFill.length > 0 ? args.daysToFill : DAY_TOKENS;
  const posOf = (day: string) => {
    const at = fridgeWindowDays.indexOf(day);
    return at >= 0 ? at : DAY_TOKENS.indexOf(day);
  };
  /**
   * LES TROIS POPULATIONS. `not_evaluated` est celle qui coûte le plus cher à
   * ne pas avoir: sans elle, « la fenêtre a tourné et rien n'a mordu » et « la
   * fenêtre n'a pas tourné » rendent le même `violations: 0`.
   */
  const fridgeWindow: FridgeWindowCounts = emptyFridgeWindowCounts();

  // ══════════════════════════════════════════════════════════════════════════
  // LE CONGÉLATEUR — résolu UNE fois, et par une AFFIRMATION.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ `=== true`, ET LA COMPARAISON EST LA GARDE. `hasKitchenTool` rend
  // `true | false | null`, et le pavé de son module interdit
  // `!hasKitchenTool(...)` parce que cette forme-là traite « on ne lui a jamais
  // demandé » comme « il n'en a pas ». Ici on veut EXACTEMENT l'inverse: seule
  // une déclaration positive ouvre la fenêtre de conservation. `false` et
  // `null` retombent tous deux sur `MAX_FRIDGE_DAYS`, et c'est la seule
  // direction acceptable pour une règle qui décide si on sert un lot de six
  // jours.
  const hasFreezer = hasFreezerDeclared(args.kitchenEquipment);
  /**
   * COMBIEN DE PARTS RÉCLAMENT UN CONGÉLATEUR QUE CE FOYER N'A PAS DÉCLARÉ.
   *
   * ⚠️ SANS CE NOMBRE, LE LOT EST INVÉRIFIABLE. `kept` est un champ DÉCLARÉ PAR
   * LE MODÈLE: « il obéit » et « on n'a rien mesuré » rendent le même silence.
   * Troisième fois dans ce fichier (`model_quantity`, `model_size_word`).
   */
  /**
   * LES SESSIONS QUI PRENNENT PLUS DE TEMPS QUE DÉCLARÉ — 2026-09-01.
   *
   * ⚠️ STRUCTURÉ, PAS UNE CHAÎNE À REPARSER. Même patron qu'`empty_slots`: la
   * phrase que l'écran en tire se compose de `day`, `minutes` et `declared`, et
   * relire une ligne d'`issues` pour retrouver ces trois nombres serait un
   * matcher maison sur du texte — ce que ce dépôt refuse depuis les douze faux
   * positifs de « laitue » contre « lait ».
   */
  const sessionOverruns: { day: string; minutes: number; declared: number }[] = [];
  let freezerWithoutOne = 0;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * LES PLATS TOMBÉS PARCE QU'UN `for_member_id` REFUSÉ EN AURAIT FAIT UN
   * SECOND PLAT DE TABLE. Mesuré le 2026-09-14, 6 tirs sur 13.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * ⚠️ IL NE PEUT PAS VIVRE DANS `keptOwnerFacts`, et c'est exactement pourquoi
   * il existe. Les cinq tableaux parallèles décrivent les plats GARDÉS; un plat
   * tombé n'y a pas de ligne. Sans ce nombre, le geste le plus lourd du lot —
   * retirer un plat que le modèle a écrit — serait le seul qui ne se compte
   * nulle part, et « un compteur qui ne peut plus bouger est pire qu'absent »
   * vaut d'abord pour celui qui n'existe pas.
   *
   * ⚠️ IL SORT À CÔTÉ DES QUATRE AUTRES, PAS DEDANS: `declared === attributed +
   * refused` est une PROPRIÉTÉ testée sur la population gardée, et y verser une
   * population différente la casserait sans rien dire.
   */
  let ownerRefusedDropped = 0;
  /**
   * SA POPULATION À LUI — les liens (casserole, repas) que la fenêtre du cuit a
   * pu situer dans le temps.
   *
   * ⚠️ CE N'EST PAS CELLE DE `keptTotal`, ET LES DEUX NOMBRES SE LISAIENT MAL
   * SANS ÇA. Mesuré le 2026-09-01: `uses_kept_freezer: 6/6` à côté de
   * `freezer_claimed_without_one: 14` — 14 réclamations sur 6 parts, ce qui
   * n'a aucun sens à la lecture. Les deux comptent à deux étages: celui-ci
   * tourne sur la sortie BRUTE, avant que la garde ne jette des plats; l'autre
   * sur les parts SURVIVANTES. Chacun sort donc avec SON dénominateur.
   */
  let freezerClaimLinks = 0;
  /** Combien de parts portent un `kept` lisible — le dénominateur suit. */
  let keptDeclared = 0;
  let keptTotal = 0;

  // ── LA GARDE DE PRÉPARATION DÉPEND DE QUI MANGE ─────────────────────────
  // Résolu UNE fois, hors de la boucle: la question ne se pose pas préparation
  // par préparation, elle se pose une fois pour le plan.
  const secondDishAsked = args.merge !== null && asksForASecondDish(args.merge.shape);
  // LOT C — LA LISTE FERMÉE DES BOUCHES ATTRIBUABLES. Résolue UNE fois, hors de
  // la boucle, pour la même raison que la ligne au-dessus: la question ne se
  // pose pas plat par plat, elle se pose une fois pour le plan.
  const dishBearers = new Set(
    (args.merge?.dishBearerIds ?? []).map((id) => String(id).trim()).filter(Boolean),
  );
  // LOT 4 — LA LISTE FERMÉE DES BOUCHES À QUI UNE BOÎTE PEUT REVENIR. Le ROSTER
  // ENTIER, et pas `dishBearers`: tout le monde a une part, seuls quelques-uns
  // ont un plat à eux. Résolue une fois, hors des deux boucles.
  const boxMembers = new Set(
    args.boxMemberIds.map((id) => String(id).trim()).filter(Boolean),
  );
  // ── v4 · LES BOUCHES DONT L'OBJECTIF OUVRE UNE PORTION MILLIMÉTRÉE ────────
  //
  // ⚠️ INTERSECTÉ AVEC LE ROSTER, ET LA DÉRIVE SE COMPTE. Deux listes qui
  // décrivent la même table finissent par diverger; ici la divergence
  // gonflerait `expected` d'un groupe fantôme, donc elle ne se tait pas.
  const weighedMembers = new Set<string>();
  for (const raw of args.weighedMemberIds) {
    const id = String(raw).trim();
    if (!id) continue;
    if (!boxMembers.has(id)) {
      issues.push(
        `weighed_member_not_in_roster:${JSON.stringify(id)} -- ignored for the ` +
          `expected box count`,
      );
      continue;
    }
    weighedMembers.add(id);
  }
  // ══════════════════════════════════════════════════════════════════════════
  // LA CEINTURE DE RÉGIME — LA TABLE DES LIGNES DÉCLARÉES, RÉSOLUE UNE FOIS.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⚠️ SEULES LES BOUCHES QUI ONT DÉCLARÉ Y ENTRENT. `omnivore` n'est pas un
  // régime (il n'exclut rien), et `null` veut dire « personne n'a demandé »:
  // `household_diet.ts` fait déjà cette distinction en tête de fichier, et la
  // refaire ici en produirait une seconde version.
  const mouthRegimes = new Map<string, DietaryRegime>();
  /**
   * CE QU'UNE BOUCHE ÉVITE, par identifiant. Même forme et même porte que les
   * régimes: une bouche absente du roster n'entre pas.
   */
  const mouthExclusions = new Map<string, readonly ForbiddenTerm[]>();
  /** Une bouche nommée par les régimes mais absente du roster — voir plus haut. */
  let regimeUnknownMouth = 0;
  for (const entry of args.boxMemberDiets) {
    const memberId = String(entry?.memberId ?? "").trim();
    if (!memberId) continue;
    if (!boxMembers.has(memberId)) {
      regimeUnknownMouth++;
      continue;
    }
    if (entry.regime === null || entry.regime === undefined) continue;
    mouthRegimes.set(memberId, entry.regime);
  }
  for (const entry of args.boxMemberExclusions) {
    const memberId = String(entry?.memberId ?? "").trim();
    if (!memberId || !boxMembers.has(memberId)) continue;
    const terms = entry.terms ?? [];
    if (terms.length === 0) continue;
    mouthExclusions.set(memberId, terms);
  }
  /**
   * CE QUE LA CEINTURE A RETIRÉ, PAR PRÉPARATION — et ce n'est pas seulement
   * une trace. DEUX consommateurs le lisent, et c'est pour ça qu'il est
   * construit ici plutôt que recalculé deux fois:
   *
   *   ① la boucle « une bouche a une part » plus bas: une bouche que le RÉGIME
   *      tient hors d'une casserole n'est PAS une bouche « oubliée par le
   *      modèle ». La compter dans `mouths_unboxed` ferait lire un défaut là
   *      où le produit vient de faire son travail — et ce compteur-là est
   *      justement celui qu'on regarde pour savoir si le service tient.
   *   ② `reconcilePortions`, chez l'appelant: une PART qui cite une
   *      préparation que le régime refuse est la même affectation fausse, sur
   *      l'autre surface. Un seul scan, deux ceintures.
   */
  const regimeRefusedByPreparation = new Map<string, Set<string>>();
  /**
   * ⚠️ CINQ NOMBRES, ET LES TROIS PREMIERS SONT LA RAISON D'ÊTRE DU COMPTEUR.
   * `refused: 0` seul est AMBIGU — il rend le même zéro pour « aucune bouche
   * n'a déclaré de régime » et pour « toutes ont déclaré et rien n'a mordu ».
   * C'est le zéro que ce dépôt paie en boucle, et c'est pour ça que
   * `mouths` (combien de bouches portent une ligne) et `checked` (combien
   * d'appartenances de boîte ont été LUES) sont rendus à côté.
   *
   *   · `mouths`   — les bouches du roster qui portent un régime déclaré.
   *                  `0` ⇒ JAMAIS DÉCLARÉ, la ceinture n'avait rien à faire.
   *   · `checked`  — les appartenances (bouche × boîte) réellement examinées.
   *                  Le dénominateur. `mouths > 0 && checked === 0` ⇒ le
   *                  modèle n'a écrit aucune boîte pour ces bouches-là.
   *   · `kept`     — celles que la ceinture a laissées passer.
   *   · `refused`  — celles qu'elle a retirées. DÉCLARÉ PUIS REFUSÉ.
   *   · `silenced` — les morsures désamorcées par un analogue végétal
   *                  (« soy yoghurt », « lait d'avoine »). Sans ce nombre, une
   *                  ceinture qui blanchirait tout demain afficherait
   *                  `refused: 0`, c'est-à-dire l'image d'un régime tenu.
   *
   * PROPRIÉTÉ TESTÉE: `checked === kept + refused`.
   */
  /**
   * LA CEINTURE DES EXCLUSIONS — les MÊMES quatre nombres que celle des
   * régimes, et pour la même raison: `refused: 0` seul rend le même zéro pour
   * « personne n'a rien exclu » et « rien n'a mordu ».
   *
   *   · `mouths`  — les bouches qui portent au moins une exclusion cherchable.
   *   · `checked` — les appartenances (bouche × boîte) réellement examinées.
   *   · `kept` / `refused` — laissées passer / retirées du contenant.
   *
   * PROPRIÉTÉ: `checked === kept + refused`.
   */
  const exclusionBelt = {
    mouths: mouthExclusions.size,
    checked: 0,
    kept: 0,
    refused: 0,
    // ── ÉCHANGE · LE MÊME COUPLE QUE LE RÉGIME (2026-09-04) ──────────────
    // Le défaut mesuré: 4 refus d'exclusion sur un plan réel, et une bouche
    // sans aucune boîte à 5 repas sur 12. `refused` seul ne disait pas si le
    // modèle avait ESSAYÉ de séparer.
    bites: 0,
    separated: 0,
    not_separated: 0,
    box_scoped: 0,
  };
  const regimeBelt = {
    mouths: mouthRegimes.size,
    checked: 0,
    kept: 0,
    refused: 0,
    // ── v4 · CE QUE LA COMPOSITION AVAIT DÉJÀ RÉGLÉ ──────────────────────
    // `bites` compte les morsures détectées, `separated` celles que le modèle
    // avait résolues en donnant son contenant à la bouche mordue. Sans ce
    // couple, un modèle qui ne sépare jamais ressemble à un foyer sans régime.
    bites: 0,
    separated: 0,
    not_separated: 0,
    silenced: 0,
    silenced_homograph: 0,
    silenced_spelling: 0,
    unknown_mouth: regimeUnknownMouth,
    // ÉCHANGE · sur quelle SURFACE les couvercles ont été jugés.
    box_scoped: 0,
    citation_repaired: 0,
    item_repaired: 0,
    // ── LES TROIS NOMBRES DU CHAMP DÉCLARÉ (2026-08-19) ──────────────────
    // Comptés sur TOUS les ingrédients du plan, pas seulement sur ceux qu'une
    // bouche à régime finit par regarder: un modèle qui n'écrit jamais le
    // champ et un modèle qui l'écrit faux sont deux pannes distinctes, et
    // toutes deux se voient AVANT qu'une ceinture ait quoi que ce soit à
    // vérifier.
    groups_declared: 0,
    groups_valid: 0,
    groups_refused: 0,
    // ⛔ COMBIEN DE GROUPES VALIDES LE RÉFÉRENTIEL A DÛ CORRIGER (2026-09-13).
    // Sans ce nombre, un moteur qui réconcilie et un moteur qui a perdu sa
    // réconciliation rendent exactement le même plan livré: on ne verrait la
    // différence qu'au prochain 422 sur une bouche végane.
    groups_conflicting: 0,
    // Ce que la déclaration a FAIT, une fois arrivée à la ceinture. Sans ces
    // trois-là, un champ parfaitement rempli et un champ parfaitement ignoré
    // rendraient le même verdict — la cicatrice « un champ collecté sans
    // lecteur ressemble exactement à un champ ignoré ».
    group_excluded: 0,
    group_plant_only: 0,
    group_undecided: 0,
  };
  /** Les ids de boîte déjà pris, sur TOUT le plan — voir la porte ① plus bas. */
  const boxIdsSeen = new Set<string>();
  /** Les CONTENANTS jetés. Compté ici, jamais dérivé d'une soustraction. */
  let boxesRefused = 0;
  /** Les NOMS gardés sur les couvercles, et ceux jetés. Deux sacs, jamais une soustraction. */
  let boxNames = 0;
  let boxNamesRefused = 0;
  /** Les COMPOSANTS gardés, et ceux jetés. Même discipline. */
  let boxItems = 0;
  let boxItemsRefused = 0;
  /**
   * ⟳ 2026-09-13 — PAR QUELLE FORME UN COMPOSANT GARDÉ A ÉTÉ PESÉ.
   *
   * ⛔ DEUX SACS DISTINCTS, ET C'EST LA CICATRICE « un champ déclaré par le
   * modèle demande un compteur ». `items` seul confond « le modèle a écrit
   * `grams`, comme le schéma v4 le demande » et « le modèle a écrit une forme
   * d'ingrédient, et le lecteur l'a convertie par le référentiel ». Les deux
   * appellent des suites OPPOSÉES: la première ne demande rien, la seconde dit
   * que le prompt de ce chemin n'a pas servi son schéma. Sans la séparation, un
   * lot désarmé — le prompt qui cesse de nommer la clé — ressemble exactement à
   * un lot qui marche.
   *
   * ⚠️ `items = items_in_grams + items_from_ingredient`, par construction: ce
   * sont deux chemins exclusifs du même item gardé, pas deux mesures du même
   * nombre.
   */
  let boxItemsInGrams = 0;
  let boxItemsFromIngredientForm = 0;
  /**
   * LES CONTENANTS RECONSTRUITS DEPUIS UN `box` SINGULIER v2.
   *
   * ⛔ IL DOIT TOMBER À ZÉRO UNE FOIS LE PROMPT PASSÉ EN v4, et c'est très
   * exactement pour ça qu'il se compte. Un repli qui devient le chemin nominal
   * ne se voit par aucun autre nombre: le plan est rempli, les contenants sont
   * là, et personne ne sait que la ventilation par composant n'existe pas.
   */
  let boxesLegacyFolded = 0;
  /**
   * LOT 4C ④ — LES BOÎTES DONT LE NOMBRE AFFICHÉ N'EST PAS CELUI DU MODÈLE.
   *
   * ⛔ UNE VALEUR CORRIGÉE EN SILENCE EST UNE VALEUR DONT PERSONNE NE SAURA
   * QU'ELLE A ÉTÉ CORRIGÉE. Mesuré le 2026-08-17: sur un run réel, CINQ boîtes
   * sur sept demandaient 7500, 3600, 3600, 3600 et 2400 g, et l'écran a affiché
   * « 2000 g » cinq fois. Une `issue` le disait; `box_counts` lisait ce run
   * comme PARFAIT (`refused: 0`), et un tableau de bord SQL n'avait aucun moyen
   * de le savoir.
   *
   * ⚠️ CE N'EST PAS UN REFUS, et il ne doit pas se compter comme tel. La boîte
   * est GARDÉE, écrêtée — le plafond empêche un « 75000 g » d'entrer en base.
   * La ranger dans `refused` ferait mentir la propriété que le lot annonce
   * (« refused = les entrées jetées ») dans les deux sens à la fois.
   *
   * ⚠️ IL COMPTE DES **COMPOSANTS**, depuis le 2026-08-20 (des PARTS depuis le
   * 08-19): la grandeur bornée est toujours « un aliment, une fois, pour un
   * repas », et c'est désormais ce que la donnée dit.
   */
  let boxesCapped = 0;

  // ── LES PLATS ───────────────────────────────────────────────────────────
  // ── LES PRÉPARATIONS ────────────────────────────────────────────────────
  // Parsées AVANT les plats, parce que les plats les référencent: un `uses`
  // qui pointe une préparation inexistante doit être jeté, pas affiché comme
  // « prélève sur quelque chose » que l'élève ne trouvera nulle part.
  const preparations: MealPreparation[] = [];
  for (const [i, entry] of (Array.isArray(root.preparations) ? root.preparations : []).entries()) {
    const prep = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const id = cleanText(prep.id);
    const title = cleanText(prep.title);
    if (!id || !title) {
      issues.push(`preparations[${i}]: missing id or title, dropped`);
      continue;
    }
    const made = Number(prep.servings_made);
    // ⟳ 2026-09-07 — v33 ACCEPTE `servings_made: 1`, ET C'EST LE CAS NOMINAL.
    // Sous recette standard, une casserole est écrite POUR LES PLATS QUI LA
    // TIRENT et chaque plat en tire UNE portion: « une casserole cuisinée la
    // veille pour un seul plat » est exactement ce que le prompt demande. La
    // garde d'origine — « une préparation d'une portion n'en est pas une » —
    // était vraie quand le modèle écrivait des plats de tablée; elle jette
    // maintenant le nominal, et c'est le défaut que `secondDishAsked` avait
    // déjà mesuré une fois (`prep_zoe_tuna_pasta`, run réel du 2026-08-12).
    const onePortionOk = secondDishAsked || args.standardRecipe;
    if (!Number.isFinite(made) || (onePortionOk ? made < 1 : made <= 1)) {
      // ── UNE PORTION: ÇA DÉPEND DE COMBIEN DE BOUCHES ON SERT ────────────
      //
      // SANS FUSION, LA GARDE RESTE ENTIÈRE, et elle est juste: une préparation
      // d'UNE portion n'en est pas une, c'est un plat. La garder ferait afficher
      // une session de cuisine pour une assiette. Rien ne bouge sur la lane
      // individuelle ni sur une composition de foyer ordinaire.
      //
      // ⚠️ AUX BARREAUX ② ET ③, C'EST LE CAS NOMINAL, ET LA GARDE LE JETAIT.
      // Les deux consignes demandent au modèle une préparation POUR UNE SEULE
      // BOUCHE (« give them a SECOND dish », « their dishes »). Mesuré en run
      // réel le 2026-08-12: le modèle a rendu `prep_zoe_tuna_pasta` avec
      // `servings_made: 1`, obéissant parfaitement — la préparation a été jetée,
      // puis le plat qui la citait est devenu `unknown preparation, dropped`. EN
      // BASE, le plat de la personne fusionnée existait comme un TITRE NU,
      // rattaché à aucune préparation et à aucune session de cuisson: la
      // promesse « cuisiné dans la MÊME session » n'était nulle part dans le
      // plan écrit.
      //
      // LE PLANCHER RESTE UNE PORTION. `0`, une valeur négative ou un
      // `servings_made` illisible tombent dans les deux cas: une préparation qui
      // ne nourrit personne n'est pas un plat dédié, c'est une erreur de sortie.
      issues.push(
        onePortionOk
          ? `preparations[${i}]: servings_made must be >= 1, dropped`
          : `preparations[${i}]: servings_made must be > 1, dropped`,
      );
      continue;
    }
    const method = cleanText(prep.method);
    const numeric = findNumericTarget(`${title} ${method}`);
    if (numeric) {
      if (!rejectedNumeric.includes(numeric)) rejectedNumeric.push(numeric);
      issues.push(`preparations[${i}]: numeric target (${numeric}) -- dropped`);
      continue;
    }
    const prepIngredients: DishIngredient[] = [];
    let prepNumeric: string | null = null;
    for (const rawIng of (Array.isArray(prep.ingredients) ? prep.ingredients : [])) {
      const ing = (rawIng && typeof rawIng === "object" ? rawIng : {}) as Record<string, unknown>;
      const term = cleanText(ing.term);
      if (!term) continue;
      const quantity = cleanText(ing.quantity) || null;
      if (quantity && ENERGY_UNIT_RE.test(quantity)) { prepNumeric = "energy_unit_in_quantity"; break; }
      const termNumeric = findNumericTarget(`${quantity ?? ""} ${term}`);
      if (termNumeric) { prepNumeric = termNumeric; break; }
      const prepGroup = readDeclaredGroup(ing);
      if (prepGroup.declared) {
        regimeBelt.groups_declared++;
        if (prepGroup.group === null) regimeBelt.groups_refused++;
        else regimeBelt.groups_valid++;
      }
      // ⟳ LOT C — L'IDENTIFIANT EST LU ICI AUSSI. Une casserole porte l'essentiel
      // de la masse et de l'énergie d'une assiette (`preparationReadyGrams`):
      // n'exiger l'identifiant que sur les plats laisserait le gros du calcul au
      // terme libre, c'est-à-dire au chemin qui a confondu raisin frais et sec.
      const prepReading = readRefSlug(ing.ref, args.composition, composable);
      refTally[prepReading.outcome]++;
      const prepStructured = readStructuredQuantity(
        ing,
        args.composition,
        term,
        prepReading,
      );
      // ⛔ LA MÊME RÉCONCILIATION QUE SUR UN PLAT — 2026-09-13. Les
      // préparations sont 32 % des lignes d'ingrédient de la base, et
      // `finalPlanGate` PLIE la casserole dans le plat qui la cite
      // (`foldedFoods`): ne réparer que les plats aurait laissé un tiers des
      // lignes refuser le plan sur un groupe que leur propre `ref` dément.
      const prepGroupOfLine = reconcileIngredientGroup(
        prepGroup.group,
        referentialGroupOfLine(args.composition, {
          term,
          ref: prepStructured.ref,
          refRefused: prepStructured.refRefused,
        }),
      );
      if (prepGroupOfLine.conflicting) regimeBelt.groups_conflicting++;
      prepIngredients.push({
        term,
        quantity,
        in_pantry: isInPantry(term, args.pantry),
        ...prepStructured,
        group: prepGroupOfLine.group,
        // ⟳ LOT D — le composant culinaire cité par la ligne, transporté tel quel.
        part: readPart(ing),
      });
    }
    if (prepNumeric) {
      if (!rejectedNumeric.includes(prepNumeric)) rejectedNumeric.push(prepNumeric);
      issues.push(`preparations[${i}]: numeric target in an ingredient -- dropped`);
      continue;
    }
    const cookOnRaw = cleanText(prep.cook_on).toLowerCase();
    preparations.push({
      id,
      title,
      servingsMade: Math.min(21, Math.round(made)),
      ingredients: prepIngredients,
      method,
      activeMinutes: readMinutes(prep.active_minutes),
      totalMinutes: readMinutes(prep.total_minutes),
      cookOn: DAY_TOKENS.includes(cookOnRaw) ? cookOnRaw : null,
      // ⟳ LOT D — la structure de cuisson déclarée; VALIDÉE plus tard, jamais ici.
      components: readComponents(prep),
    });
  }
  const preparationIds = new Set(preparations.map((p) => p.id));
  /** La préparation de chaque id gardé — la réconciliation et la ceinture la lisent. */
  const preparationById = new Map(preparations.map((p) => [p.id, p]));

  const dishes: GeneratedDish[] = [];
  // ── C7 ② · CE QU'IL FAUT SAVOIR D'UN PLAT GARDÉ POUR LE SACRIFIER JUSTE ──
  //
  // Trois tableaux PARALLÈLES à `dishes`, et pas trois champs sur le plat: la
  // sortie publique (`GeneratedDish`) est écrite en base et lue par les écrans,
  // et y greffer la comptabilité interne du plafond ferait fuiter un rang de
  // sacrifice dans le plan de quelqu'un. Ils bougent ENSEMBLE, toujours: un
  // `splice` qui en oublie un décale les rangs sur tout le reste de la liste.
  /** La case `jour/moment` du plat gardé, `null` quand il n'en a pas. */
  const keptCells: (string | null)[] = [];
  /** Son rang de sacrifice — voir `dishRank`. */
  const keptRanks: number[] = [];
  /** Son index dans la sortie BRUTE: la réconciliation des courses le lit. */
  const keptRawIndex: number[] = [];
  /**
   * LOT 2 — CE QUE SON `same_day` A COÛTÉ, pour le plat GARDÉ.
   *
   * ⚠️ QUATRIÈME TABLEAU PARALLÈLE, et pour la raison exacte des trois autres:
   * il faut que le compteur `same_day` compte sur LA MÊME POPULATION que
   * `dishes` — les plats finalement gardés. Un compteur incrémenté au fil de la
   * boucle continuerait de porter le refus d'un plat que le plafond a évincé
   * trois plats plus loin: `declared` (calculé sur la sortie) et `invalid`
   * (accumulé) compteraient alors deux populations différentes. Ce dépôt a payé
   * exactement ça sur `withheld`/`over_cap`, gonflé et dégonflé en sens
   * inverses.
   */
  const keptSameDayFaults: Array<{ invalid: boolean; minutesMissing: boolean }> = [];
  /**
   * LOT 3C — CE QUE SON `for_member_id` A COÛTÉ, pour le plat GARDÉ.
   *
   * ⚠️ CINQUIÈME TABLEAU PARALLÈLE, et il suit les mêmes `splice` que les quatre
   * autres, pour la même raison: « déclaré » et « attribué » doivent décrire les
   * MÊMES lignes que `dishes`, sinon le compteur ment sur la seule question
   * qu'on lui pose.
   */
  const keptOwnerFacts: Array<{ declared: boolean; refused: boolean }> = [];
  /**
   * LES BOUCHES QUE LEUR LIGNE DÉCLARÉE TIENT HORS DU REPAS GARDÉ.
   *
   * ⚠️ SIXIÈME TABLEAU PARALLÈLE, et il suit les mêmes `splice` que les cinq
   * autres, pour la raison qu'ils portent tous: le compteur doit décrire LES
   * MÊMES LIGNES que `dishes`. Un plat évincé par le plafond emporterait sinon
   * ses retraits dans le dénominateur d'une case qu'il ne remplit plus.
   *
   * ⛔ IL SORT `mouths_unboxed` DE SON DÉNOMINATEUR, et c'est la raison d'être du
   * tableau: une bouche que le RÉGIME tient hors d'un repas n'est pas « une
   * personne debout devant le frigo sans rien qui dise combien » — c'est le
   * produit qui vient de faire son travail. La compter ferait grossir le défaut
   * exactement quand la ceinture protège le mieux.
   */
  const keptBoxHeldOff: BoxHeldOff[][] = [];
  /**
   * L7 ③ — CE QUE SON `name` A COÛTÉ, pour le plat GARDÉ.
   *
   * ⚠️ SEPTIÈME TABLEAU PARALLÈLE, et il suit les mêmes `splice` que les six
   * autres, pour la raison qu'ils portent tous: « déclaré » et « refusé »
   * doivent décrire LES MÊMES LIGNES que `dishes`. Un plat évincé par le
   * plafond emporterait sinon son refus dans un numérateur dont le
   * dénominateur ne le compte plus — « un compteur dont le numérateur et le
   * dénominateur ne comptent pas les mêmes lignes est un compteur qui ment ».
   */
  const keptNameFacts: Array<{ declared: boolean; refused: boolean }> = [];

  // ── LES CASES QUE LA CONSIGNE DE FUSION RÉCLAME POUR ELLE ───────────────
  // Vide hors fusion et au barreau ①, et c'est ce qui rend cette couche
  // silencieuse partout ailleurs: sans case réclamée, aucun second plat n'est
  // protégé, et le plafond se comporte comme avant ce lot.
  const dedicatedCells = new Set(
    (args.merge === null ? [] : args.merge.dedicatedCells).map((c) =>
      `${c.day}/${c.slot}`
    ),
  );

  /**
   * ⟳ 2026-09-14 · BÊTA 1A ② — LES BOUCHES QUE **CETTE CASE-CI** ATTEND.
   *
   * Une entrée par case réclamée. `null` dans l'ensemble = « la grille ouvre
   * la place sans nommer personne » (chemin de fusion), et alors la case
   * accepte n'importe quel porteur de la liste fermée, comme avant ce lot.
   */
  const dedicatedOwnersAt = new Map<string, Set<string | null>>();
  for (const c of (args.merge === null ? [] : args.merge.dedicatedCells)) {
    const key = `${c.day}/${c.slot}`;
    const set = dedicatedOwnersAt.get(key) ?? new Set<string | null>();
    set.add(c.memberId);
    dedicatedOwnersAt.set(key, set);
  }

  /**
   * CE PORTEUR EST-IL ATTENDU SUR CETTE CASE ?
   *
   * ⛔ TROIS RÉPONSES, ET LA TROISIÈME EST CELLE QUI FERME LE POINT 6. Une
   * case que la grille ne réclame pas n'attend personne: un plat qui s'y
   * adresse à quelqu'un n'est pas un plat dédié, c'est un plat de plus. Une
   * case réclamée « pour personne en particulier » (fusion) accepte le seul
   * porteur que la consigne nomme. Une case réclamée POUR DES BOUCHES nommées
   * n'accepte qu'elles.
   */
  const ownerExpectedAt = (cell: string | null, owner: string): boolean => {
    // ⚠️ UN PLAT SANS CASE N'EST PAS LE SUJET DE CE LOT, et sa lecture ne
    // bouge pas d'un octet: il ne nourrit personne de toute façon
    // (`mouthsFedByDish` ignore un plat sans jour ni moment), et le faire
    // basculer en plat de table ici ne ferait que déplacer un compteur.
    if (cell === null) return true;
    const owners = dedicatedOwnersAt.get(cell);
    if (owners === undefined) return false;
    return owners.has(null) || owners.has(owner);
  };

  /**
   * COMBIEN DE PLATS DÉDIÉS CETTE BOUCHE A DÉJÀ, parmi les plats GARDÉS.
   *
   * ⚠️ LU SUR `dishes`, jamais accumulé au fil de la boucle: un compteur
   * incrémenté continuerait de porter le plat qu'un `splice` vient de retirer,
   * et l'équité se calculerait sur une table qui n'existe plus.
   */
  const dedicatedTally = (owner: string | null): number => {
    if (owner === null) return 0;
    let n = 0;
    for (const kept of dishes) if (kept.memberId === owner) n++;
    return n;
  };

  /** Le plus petit nombre de plats dédiés qu'une bouche porteuse ait à cet instant. */
  const leastServedTally = (): number => {
    let min = Number.POSITIVE_INFINITY;
    for (const id of dishBearers) {
      const n = dedicatedTally(id);
      if (n < min) min = n;
    }
    return Number.isFinite(min) ? min : 0;
  };

  /**
   * LE RANG DE SACRIFICE — plus il est grand, plus le plat est jetable.
   *
   * ⚠️ C'EST LA DÉCISION DE PRODUIT QUE L4 AVAIT LAISSÉE OUVERTE (« réparer
   * vraiment demanderait de choisir quel plat sacrifier »). Le critère
   * n'invente rien: un plat AU-DELÀ de ce que la consigne réclame est le
   * surplus; un plat qui remplit une case attendue ne l'est pas.
   *
   *   `0` — le premier plat d'une case: l'assiette de la table. Jamais
   *         sacrifié tant qu'un surplus existe.
   *   `1` — le second plat d'une case où un porteur mange: le plat dédié que la
   *         consigne demande, un par repas.
   *   `2` — tout le reste: un troisième plat dans une case, un second plat
   *         dans une case où personne d'autre ne mange, un plat sans moment.
   *
   * La grille du foyer n'est PAS relue ici, et c'est voulu: les moments
   * écartés, les créneaux déjà pris, les jours de restes et les plats sans jour
   * sont tombés PLUS HAUT, chacun avec son motif. Ce qui arrive jusqu'ici a
   * déjà une case légitime.
   *
   * ══ LOT B ③ · LE CRÉNEAU PROTÉGÉ VA AU MOINS SERVI, PAS AU PREMIER ÉCRIT ══
   *
   * ⛔ LE DÉFAUT, MESURÉ ET DÉTERMINISTE. Le rang `1` — le créneau protégé
   * d'une case — était donné au SECOND plat ÉCRIT, quel qu'en soit le porteur.
   * Or le modèle écrit les bouches dans l'ordre du roster, à chaque case: le
   * porteur nommé en premier prenait donc le créneau protégé de TOUTES les
   * cases, et les autres tombaient au rang `2`, c'est-à-dire dans le sac où le
   * plafond puise. Archivé quatre fois de suite (trois runs + un plan
   * orphelin): `dish_owners {asked: 6, declared: 2, attributed: 2}` — six plats
   * promis, deux livrés, et TOUJOURS à la même personne (2 · 2 · 2 pour l'une,
   * 0 · 0 · 0 pour les deux autres). Sur sept jours: 11 plats jetés.
   *
   * ⛔ CE QUI CHANGE: à porteur connu, le rang `1` n'est accordé que si ce
   * porteur est parmi les MOINS servis de la table. Celui qui a déjà son plat
   * repasse au rang `2` tant qu'une autre bouche n'a rien — le créneau protégé
   * TOURNE, case après case, au lieu de revenir au même nom.
   *
   * ⚠️ PORTEUR INCONNU ⇒ RANG `1`, COMME AVANT, ET C'EST DÉLIBÉRÉ. Quand le
   * modèle n'a déclaré aucun `for_member_id` — le cas le plus fréquent — il n'y
   * a rien à répartir, et rendre `2` retirerait un second plat qui survit
   * aujourd'hui. La population dont le plan change est exactement celle où
   * l'attribution est LISIBLE, à l'octet près pour toutes les autres.
   *
   * ⚠️ CETTE MOITIÉ A ÉTÉ RETIRÉE PUIS REMISE, ET L'HISTOIRE VAUT D'ÊTRE LUE.
   * La mutation qui la désarme (`return 1` inconditionnel) n'a fait tomber
   * AUCUN test sur le décor SYNTHÉTIQUE du banc — la porte d'équité de
   * `sacrificeFor` y rééquilibrait seule — et elle a donc été supprimée au nom
   * de « une branche qu'aucun test ne distingue est une branche qui ment ».
   * Rejouée sur les SORTIES DE MODÈLE ARCHIVÉES (2 cases × [1 plat de table +
   * 1 plat par porteur], plafond 4), la MÊME mutation rend exactement le défaut
   * mesuré: `2 · 0 · 0`. **C'était le décor du banc qui était trop étroit, pas
   * la branche qui était inutile.** Un banc sur le décor archivé a été ajouté
   * le même jour, et c'est lui qui la tient.
   *
   * ⛔ CE N'EST PAS LE BUDGET DE PLATS. Le plafond (`dishBudgetFor`,
   * `mergeDishBonus`) n'est pas touché d'un chiffre: on ne discute pas ici du
   * nombre de places, seulement de qui s'assied.
   */
  const dishRank = (cell: string | null, owner: string | null): number => {
    if (cell === null) return 2;
    let taken = 0;
    for (const kept of keptCells) if (kept === cell) taken++;
    if (taken === 0) return 0;
    if (taken !== 1 || !dedicatedCells.has(cell)) return 2;
    if (owner === null) return 1;
    return dedicatedTally(owner) <= leastServedTally() ? 1 : 2;
  };

  /**
   * Le plat gardé le PLUS jetable, à condition qu'il le soit plus que celui qui
   * arrive. `-1` quand aucun ne l'est — et alors c'est l'arrivant qui tombe,
   * avec le motif d'avant ce lot, mot pour mot.
   *
   * ══ LOT B ③ · DEUX CHANGEMENTS, ET UN SEUL EST UNE OUVERTURE ════════════
   *
   * ① QUI EST ÉLIGIBLE. Avant, il fallait un rang STRICTEMENT plus grand:
   *    `keptRanks[p] <= rank ⇒ continue`. Conséquence mesurée: un plat dédié
   *    de rang 2 qui arrive ne pouvait JAMAIS prendre la place d'un autre plat
   *    de rang 2 — donc, sous plafond, le porteur écrit en dernier tombait
   *    quoi qu'il arrive, même quand celui écrit en premier en gardait quatre.
   *    Le rang égal devient éligible, mais sous UNE condition, et elle est
   *    étroite: les DEUX plats ont un porteur, et l'arrivant est
   *    **strictement** moins servi que le gardé. C'est-à-dire qu'un plat ne
   *    change de main que si l'échange RÉDUIT l'écart entre deux bouches.
   *    ⛔ Un plat SANS porteur ne peut ni prendre ni céder une place à rang
   *    égal: sans cette double condition, la première assiette d'une case
   *    pourrait chasser celle d'une autre case, et la grille se creuserait.
   *
   * ② QUI TOMBE, PARMI LES ÉLIGIBLES. Le rang décide toujours en premier (la
   *    couverture des créneaux passe avant tout). Ce qui départage à
   *    l'intérieur d'un rang, dans l'ordre:
   *      · le plat que PERSONNE ne réclame (`memberId === null`) tombe avant
   *        celui qui est promis à quelqu'un;
   *      · puis le porteur qui a DÉJÀ le plus de plats dédiés. Sans ce cran,
   *        une bouche perdait son unique plat pendant qu'une autre en gardait
   *        deux — le défaut exact que ce lot ferme, vu de l'autre bout;
   *      · puis le PLUS TARD écrit, qui est le départage d'avant ce lot. Il
   *        n'a pas disparu: il est descendu d'un cran.
   *
   * ⚠️ QUAND AUCUN PLAT GARDÉ NE PORTE DE `memberId` — le cas le plus fréquent —
   * ① ne s'ouvre jamais et ② est neutre: le choix est EXACTEMENT celui d'avant
   * ce lot, à l'octet.
   *
   * ⚠️ ÇA TERMINE, ET C'EST VÉRIFIABLE: chaque échange à rang égal transfère
   * une place d'un porteur STRICTEMENT plus servi vers un porteur strictement
   * moins servi, donc l'écart total ne peut que décroître, et un plat arrivant
   * n'évince au plus qu'une fois.
   */
  const sacrificeFor = (rank: number, owner: string | null): number => {
    const ownerTally = dedicatedTally(owner);
    let victim = -1;
    for (let p = 0; p < keptRanks.length; p++) {
      if (keptRanks[p] < rank) continue;
      const here = dishes[p]?.memberId ?? null;
      if (keptRanks[p] === rank) {
        // ── LA SEULE PORTE DU RANG ÉGAL, ET ELLE EST UNE PORTE D'ÉQUITÉ ──
        if (owner === null || here === null) continue;
        if (ownerTally >= dedicatedTally(here)) continue;
      }
      if (victim === -1) {
        victim = p;
        continue;
      }
      if (keptRanks[p] > keptRanks[victim]) {
        victim = p;
        continue;
      }
      if (keptRanks[p] < keptRanks[victim]) continue;
      // ── À RANG ÉGAL ──────────────────────────────────────────────────
      const best = dishes[victim]?.memberId ?? null;
      if (here === null && best !== null) {
        victim = p;
        continue;
      }
      if (here !== null && best === null) continue;
      const hereTally = dedicatedTally(here);
      const bestTally = dedicatedTally(best);
      if (hereTally > bestTally) {
        victim = p;
        continue;
      }
      if (hereTally < bestTally) continue;
      // À porteur aussi servi l'un que l'autre: le plus tard écrit.
      victim = p;
    }
    return victim;
  };

  // ── LES SESSIONS DE CUISINE ─────────────────────────────────────────────
  // Une session qui ne fait AUCUNE préparation connue est jetée: elle
  // annoncerait un dimanche de cuisine sans rien à cuisiner.
  // ⚠️ ELLES ÉTAIENT PARSÉES *APRÈS* LES PLATS, ET LE LOT `L0-a` A DÛ LES
  // REMONTER. Le jour de cuisson d'une préparation ne vient PAS de son
  // `cook_on` — il vient de la SESSION, back-fillé quelques lignes plus bas.
  // Tant que ce bloc vivait sous la boucle des plats, `prep.cookOn` y valait
  // `null` la plupart du temps, et une garde de conservation posée dans la
  // boucle n'aurait RIEN vu: elle serait passée verte sur le cas mesuré, ce
  // qui est exactement le genre de garde désarmée que ce dépôt paie en boucle.
  // Le bloc ne dépend que de `root`, `preparations` et `preparationIds`, tous
  // trois déjà résolus ici; seul l'ORDRE des lignes d'`issues` change.
  const cookingSessions: CookingSession[] = [];
  for (
    const [i, entry] of (Array.isArray(root.cooking_sessions) ? root.cooking_sessions : [])
      .entries()
  ) {
    const raw = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const dayRaw = cleanText(raw.day).toLowerCase();
    if (!DAY_TOKENS.includes(dayRaw)) {
      issues.push(`cooking_sessions[${i}]: unknown day, dropped`);
      continue;
    }
    const ids = (Array.isArray(raw.preparation_ids) ? raw.preparation_ids : [])
      .map((v) => cleanText(v))
      .filter((v) => preparationIds.has(v));
    if (ids.length === 0) {
      issues.push(`cooking_sessions[${i}]: no known preparation, dropped`);
      continue;
    }
    const runThrough = cleanText(raw.run_through);
    // ══════════════════════════════════════════════════════════════════════
    // ⛔ LE DÉROULÉ PORTAIT DES GRAMMES, ET ILS NE NOMMAIENT RIEN.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ── LE FAIT, LU À L'ÉCRAN LE 2026-08-19 ─────────────────────────────
    // « Sortir le plat après 45 minutes, répartir six portions de 450 g et
    // ranger au réfrigérateur », sur un foyer de DEUX. Ni le nombre de
    // portions ni le grammage ne correspondaient aux boîtes, et la phrase ne
    // disait pas de QUOI étaient ces 450 g. Ses mots: « il dit de faire des
    // barquettes de 450 grammes mais on sait pas à quoi ça correspond ».
    //
    // ── POURQUOI ON COMPTE AU LIEU DE COUPER ────────────────────────────
    // Le déroulé est la seule chose qui dise l'ORDRE des gestes entre deux
    // casseroles. Jeter la session (ce que fait `findNumericTarget` juste en
    // dessous, pour une cible chiffrée de corps) coûterait cet ordre-là pour
    // une faute de rédaction. Et RÉÉCRIRE la prose du modèle serait un
    // matcher maison sur du texte libre — « laitue » ≠ « lait », 12 faux
    // positifs sur 12 mesurés ici.
    //
    // ⚠️ SANS CE COMPTEUR, LA CONSIGNE SERAIT INVÉRIFIABLE. « Le modèle a
    // obéi » et « on n'a rien mesuré » rendent le même silence — c'est la
    // cicatrice `model-declared-fields-need-a-counter`, et elle a déjà servi
    // deux fois dans ce même fichier (`model_quantity`, `model_size_word`).
    if (portionCarriesAQuantity(runThrough)) {
      runThroughQuantity++;
      issues.push(
        `cooking_sessions[${i}]: run_through carries a weight or a portion ` +
          `count -- the boxes hold those, kept as written`,
      );
    }
    const numeric = findNumericTarget(runThrough);
    if (numeric) {
      if (!rejectedNumeric.includes(numeric)) rejectedNumeric.push(numeric);
      issues.push(`cooking_sessions[${i}]: numeric target (${numeric}) -- dropped`);
      continue;
    }
    cookingSessions.push({
      day: dayRaw,
      preparationIds: ids,
      runThrough,
      totalMinutes: readMinutes((raw as Record<string, unknown>).total_minutes),
    });
  }

  // ⚠️ LE COMPTEUR SORT AVEC SA POPULATION, JAMAIS SEUL. « 3 déroulés
  // chiffrés » ne veut rien dire: sur trois sessions c'est un échec total, sur
  // quarante c'est du bruit. Ce dépôt a déjà écrit deux fois qu'un compteur
  // sans dénominateur est un compteur qui ment.
  if (runThroughQuantity > 0) {
    issues.push(
      `cooking_sessions: ${runThroughQuantity}/${cookingSessions.length} ` +
        `run_through carry a weight or a portion count`,
    );
  }

  // LE JOUR DE CUISSON VIENT DE LA SESSION, pas de la préparation. Le modèle
  // remplit `cook_on` de façon inégale; la session, elle, EST le moment. Quand
  // les deux se contredisent, la session gagne — c'est elle que l'élève lit.
  for (const session of cookingSessions) {
    for (const id of session.preparationIds) {
      const prep = preparations.find((p) => p.id === id);
      if (prep) prep.cookOn = session.day;
    }
  }

  const rawDishes = Array.isArray(root.dishes) ? root.dishes : [];
  // ⟳ 2026-09-05 — CE QUE LE PLAN CITE, LU UNE FOIS SUR LE BRUT: sert à la
  // réparation de citation (une casserole qu'AUCUNE boîte d'AUCUN plat ne
  // cite est celle que le modèle a cuite pour quelqu'un sans la lui donner).
  // ⚠️ LES BOÎTES SEULEMENT, pas `uses`: un plan bien formé liste dans `uses`
  // toutes ses casseroles, y compris celle qu'aucune boîte ne sert. C'est la
  // citation par une BOÎTE qui dit « quelqu'un mange ça ».
  const citedAnywhereRaw = new Set<string>();
  for (const rd of rawDishes) {
    const d = (rd && typeof rd === "object" ? rd : {}) as Record<string, unknown>;
    for (const b of (Array.isArray(d.boxes) ? d.boxes : [])) {
      const bb = (b && typeof b === "object" ? b : {}) as Record<string, unknown>;
      for (const it of (Array.isArray(bb.items) ? bb.items : [])) {
        const ii = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
        const id = cleanText(ii.preparation_id) || cleanText(ii.preparationId);
        if (id) citedAnywhereRaw.add(id);
      }
    }
  }
  // ═════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-14 · BÊTA 1A ② — COMBIEN DE PLATS **SANS ADRESSE** PAR CASE,
  //                LU AVANT LA BOUCLE
  // ═════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LA DÉCISION D'AVANT NE REGARDAIT QUE LE PASSÉ, DONC ELLE DÉPENDAIT DE
  // L'ORDRE D'ÉCRITURE DU MODÈLE. « Ce plat porte une adresse refusée, et la
  // case porte DÉJÀ le plat de la table ⇒ on le laisse tomber » est juste
  // quand le modèle écrit la table en premier — les treize réponses archivées
  // le font, et c'est ce qui a masqué la moitié manquante. Écrite dans
  // l'autre sens (le plat adressé d'abord), la même réponse rendait le plat
  // refusé PREMIER plat de table, puis le vrai plat de table devenait le
  // second: `mouth_unfed / double`, 422, plan entier perdu. Le plan de bêta
  // l'exige en toutes lettres: « l'ordre table → dédié ou dédié → table doit
  // produire le même résultat fonctionnel ».
  //
  // ⚠️ CE COMPTE EST FAIT SUR LE BRUT, ET C'EST LE POINT. Il dit « cette case
  // a un plat sans adresse quelque part dans la réponse », pas « elle en a
  // déjà gardé un ». Les deux lectures ne diffèrent QUE par l'ordre.
  //
  // ⚠️ LA RÈGLE DE CASE EST CELLE DE LA BOUCLE, MOT POUR MOT (`slot` valide,
  // `day` valide ou `any`). Une seconde écriture de cette clé ferait deux
  // grilles, et ce fichier a déjà payé ça trois fois.
  const bareDishesPerCell = new Map<string, number>();
  for (const rd of rawDishes) {
    const d = (rd && typeof rd === "object" ? rd : {}) as Record<string, unknown>;
    if (cleanText(d.title) === "") continue;
    if (cleanText(d.for_member_id) !== "") continue;
    const slotRaw = cleanText(d.slot).toLowerCase();
    if (!(MEAL_SLOTS as readonly string[]).includes(slotRaw)) continue;
    const dayRaw = cleanText(d.day).toLowerCase();
    const key = `${DAY_TOKENS.includes(dayRaw) ? dayRaw : "any"}/${slotRaw}`;
    bareDishesPerCell.set(key, (bareDishesPerCell.get(key) ?? 0) + 1);
  }

  for (const [i, entry] of rawDishes.entries()) {
    const d = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const title = cleanText(d.title);
    if (!title) {
      issues.push(`dishes[${i}]: empty title, dropped`);
      continue;
    }

    // ══════════════════════════════════════════════════════════════════════
    // L7 ③ — LE NOM D'USAGE, DÉCLARÉ PAR LE MODÈLE, JAMAIS DÉDUIT.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ UN NOM REFUSÉ NE REJETTE JAMAIS LE PLAT. Posture `for_member_id` /
    // `same_day` / `box_id`, quatrième fois: c'est une lecture EN PLUS, et un
    // plat sans elle reste un plat qui se cuisine et se mange — l'écran
    // retombe sur le `title`, c'est-à-dire sur le produit d'avant ce lot.
    //
    // ⚠️ TROIS FAITS, ET ILS SE COMPTENT SÉPARÉMENT. « Le modèle n'a rien
    // écrit » et « il a écrit quelque chose qu'on a refusé » appellent des
    // corrections OPPOSÉES — resserrer la consigne d'un côté, desserrer la
    // règle de l'autre — et le 2026-08-17 ce dépôt a payé un diagnostic entier
    // pour les avoir confondus derrière un seul zéro.
    //
    // LES DEUX SEULES RAISONS DE REFUS, ET AUCUNE N'EST UN JUGEMENT DE GOÛT:
    //   ① plus long que `DISH_NAME_MAX_CHARS` — ce n'est plus un nom, c'est un
    //      second titre, et il ne tiendrait pas dans une case de grille;
    //   ② identique au titre — l'écran rendrait deux fois la même chaîne, l'une
    //      au-dessus de l'autre. La comparaison est une ÉGALITÉ de chaîne
    //      normalisée (casse et espaces), jamais une ressemblance: un matcher
    //      sur ce champ est exactement ce que l'en-tête de `name` interdit.
    //
    // Une clé absente, ou présente et vide, n'est NI déclarée NI refusée — même
    // discipline que `same_day`, où un plat sans clé du tout ne compte dans
    // aucun des deux.
    const nameRaw = cleanText(d.name);
    let name: string | null = null;
    let nameDeclared = false;
    let nameRefused = false;
    if (nameRaw) {
      nameDeclared = true;
      if (nameRaw.length > DISH_NAME_MAX_CHARS) {
        nameRefused = true;
        issues.push(
          `dishes[${i}]: name is ${nameRaw.length} characters, over the ` +
            `${DISH_NAME_MAX_CHARS} a name fits in -- dropped, the title is shown instead`,
        );
      } else if (
        nameRaw.toLowerCase().replace(/\s+/g, " ") ===
          title.toLowerCase().replace(/\s+/g, " ")
      ) {
        nameRefused = true;
        issues.push(
          `dishes[${i}]: name repeats the title (${JSON.stringify(title)}) -- ` +
            `dropped, one line is enough`,
        );
      } else {
        name = nameRaw;
      }
    }

    // ── LE JOUR ET LE CRÉNEAU, RÉSOLUS AVANT LE PLAFOND ──────────────────
    // L'ordre compte: un plat posé sur un moment ÉCARTÉ ne doit pas consommer
    // une place du plafond. Le laisser passer la garde du plafond avant de le
    // rejeter ferait tomber, en fin de liste, des plats parfaitement valides —
    // et l'élève verrait un jour vide sans savoir pourquoi.
    const slotRaw = cleanText(d.slot).toLowerCase();
    const slot = (MEAL_SLOTS as readonly string[]).includes(slotRaw)
      ? (slotRaw as MealSlot)
      : null;
    if (slotRaw && !slot) issues.push(`dishes[${i}]: unknown slot ${JSON.stringify(slotRaw)}, dropped`);

    const dayRaw = cleanText(d.day).toLowerCase();
    const day = DAY_TOKENS.includes(dayRaw) ? dayRaw : null;
    if (dayRaw && !day) {
      issues.push(`dishes[${i}]: unknown day token ${JSON.stringify(dayRaw)}, dropped`);
    }

    // ── UN PLAT SANS JOUR N'A PAS DE CASE, ET ÇA SE DIT ──────────────────
    //
    // ⚠️ L'ASYMÉTRIE QUE CE BLOC FERME. Un jeton de jour INCONNU était nommé
    // (juste au-dessus); un jour ABSENT ne l'était pas. Les deux produisent
    // pourtant la même chose — un plat que la grille ne sait poser nulle part.
    //
    // MESURÉ LE 2026-08-12, sur une fusion: un plan portait **16 entrées
    // `dishes` pour 3 jours**, dont **7 sans `day` ni `slot`** — « Roast
    // chicken thighs », « Quinoa », « Cooked rice »… c'est-à-dire LES MÊMES
    // SEPT TITRES que `preparations`. Le modèle avait rendu ses préparations
    // une seconde fois sous forme de plats, le budget relevé par la fusion
    // (`dishBudgetFor`) avait laissé la place, et `issues` ne disait RIEN.
    // Compté sur les autres plans du même run: **0 entrée sans jour sur 14-15**.
    // Le cas n'apparaît qu'avec le budget de fusion.
    //
    // ⚠️ POURQUOI JETER, ET PAS SEULEMENT COMPTER. Sur une fenêtre de plusieurs
    // jours, ce plat n'est ni affichable dans la grille, ni cochable, ni
    // rapprochable d'une photo: il occupe une place du plafond — donc il coûte
    // un VRAI repas de la fin de fenêtre, exactement comme le dîner du dimanche
    // que le débordement a fait tomber le 2026-08-12 — et il gonfle la liste de
    // courses de ce que la préparation achète déjà.
    //
    // ⚠️ SUR UNE FENÊTRE D'UN SEUL JOUR, ON GARDE. Il n'y a alors qu'un jour:
    // le plat est situé sans ambiguïté, et `windowSplit` le range déjà dans la
    // fenêtre. Jeter là serait retirer un repas à quelqu'un pour une clé
    // absente d'un plan qui n'en a pas besoin.
    if (!day && args.scope === "several_days") {
      issues.push(
        `dishes[${i}]: no day token on a multi-day window -- dropped ` +
          `(${JSON.stringify(title)})`,
      );
      continue;
    }

    // ── LE MOMENT ÉCARTÉ MORD ICI, PAS SEULEMENT DANS LA CONSIGNE ────────
    // Une contrainte qui n'existe que dans le prompt n'est pas une garantie:
    // un modèle de composition COMPLÈTE ce qu'on lui donne, c'est son métier.
    // Même posture que le plafond de plats et que le refus des chiffres.
    if (isAway(args.awayDays, day, slot)) {
      issues.push(
        `dishes[${i}]: ${day}/${slot ?? "any"} is a moment they are away -- dropped`,
      );
      continue;
    }

    // ── FF-051 · LE CRÉNEAU DÉJÀ PRIS ───────────────────────────────────
    // Même posture que l'absence juste au-dessus, et même raison: la consigne
    // le dit, le parseur le tient. Seuls les apports REMPLAÇANTS occupent
    // (A5) — un café au lait au petit-déjeuner nomme un moment sans le
    // prendre.
    if (slotIsTaken(args.fixedIntakes, day, slot)) {
      issues.push(
        `dishes[${i}]: ${day ?? "any"}/${slot} is already taken by a fixed intake -- dropped`,
      );
      continue;
    }

    // ══════════════════════════════════════════════════════════════════════
    // « JE CUISINE LA VEILLE » — RIEN NE SE MANGE CE JOUR-LÀ.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ UN REFUS, ET IL EST DANS LA BOUCLE. La consigne dit deux fois de ne
    // rien écrire ce jour-là (la liste des jours l'exclut, une phrase le
    // nomme); si un plat y atterrit quand même, l'afficher trahirait la
    // demande — la personne a dit « ce jour-là je cuisine, je ne mange pas
    // encore ce plan ». Refuser ICI plutôt qu'en queue de fonction évite qu'il
    // ait consommé le plafond et compté ses `honours_belief_keys` avant qu'on
    // ne le retire, exactement comme la fenêtre du cuit juste en dessous.
    //
    // ⚠️ COMPTÉ, pas silencieux: si la consigne ne mord pas, c'est le PROMPT
    // qu'il faut corriger, pas le parseur — et sans ce chiffre on ne saurait
    // pas lequel des deux.
    if (args.cookOnlyDay !== null && day === args.cookOnlyDay) {
      issues.push(
        `dishes[${i}]: ${day} is the cooking day before the plan -- nothing ` +
          `is eaten on it, the dish was dropped`,
      );
      continue;
    }

    // ── FF-052 · UN JOUR DE RESTES NE COMPOSE RIEN DE NEUF ──────────────
    // Un plat qui PUISE dans une préparation reste — c'est exactement ce
    // qu'on mange un jour de restes. Un plat qui part de zéro tombe: l'élève
    // a déclaré qu'il finirait ce qui existe, et le lui composer par-dessus
    // fait jeter la moitié de son lot.
    //
    // Le `uses` est lu PLUS BAS, mais il est déjà lisible ici sur la sortie
    // brute: le vérifier après coûterait un plat construit puis jeté, et
    // surtout un `honours_belief_keys` déjà compté.
    const usesSomething = Array.isArray(d.uses) && d.uses.length > 0;
    if (!usesSomething && dayHasProperty(args.dayProperties, day, "leftovers")) {
      issues.push(
        `dishes[${i}]: ${day} is a leftovers day -- a dish with no \`uses\` was dropped`,
      );
      continue;
    }

    // ══════════════════════════════════════════════════════════════════════
    // ⟳ LOT `L0-a` · LA FENÊTRE DU CUIT — UN REFUS, PLUS UN CONSTAT
    // ══════════════════════════════════════════════════════════════════════
    //
    // MESURÉ sur de vrais plans: des légumes rôtis cuisinés le jeudi et mangés
    // le mercredi suivant — J+6. Des boulettes à J+5, du couscous à J+5. Et
    // **29 violations sur 14 plans** encore lisibles dans `generated_from.issues`
    // le 2026-08-22.
    //
    // ── CE QUI A CHANGÉ, ET POURQUOI ───────────────────────────────────────
    // Cette règle SIGNALAIT. Le commentaire d'alors disait: « raccourcir la
    // portée retirerait un repas à l'élève, et déplacer la cuisson inventerait
    // un jour qu'il n'a pas déclaré ». Les deux moitiés restent vraies — et
    // c'est pour ça qu'on ne fait ni l'un ni l'autre. **On JETTE le plat**,
    // exactement comme un plat posé un jour d'absence ou sur un créneau déjà
    // pris. La troisième voie qu'on refuse, c'est de le SERVIR quand même.
    //
    // ⛔ C'EST UNE PORTE DE SÉCURITÉ, DONC FAIL-CLOSED. Un créneau vide se
    // voit, se comble, et ne rend personne malade. Un lot de quatre jours
    // servi avec l'air d'avoir été voulu, si.
    //
    // ⚠️ ELLE NE S'APPLIQUE QU'AUX OCCASIONS CUISINÉES À L'AVANCE. Un plat qui
    // ne PUISE dans aucune casserole n'entre dans aucune des trois populations:
    // la question ne se pose pas pour lui. Sur cinq jours, cinq des quinze
    // occasions sortent ainsi du problème — les compter donnerait quinze là où
    // dix sont en jeu.
    //
    // Le `uses` est lu sur la sortie BRUTE, ici et pas plus bas, pour la même
    // raison que le jour de restes juste au-dessus: un plat construit puis jeté
    // aurait consommé le plafond et compté ses `honours_belief_keys`.
    if (day) {
      const eatAt = posOf(day);
      let tooLate: { title: string; cookOn: string; gap: number } | null = null;
      for (const rawUse of (Array.isArray(d.uses) ? d.uses : [])) {
        const u = (rawUse && typeof rawUse === "object" ? rawUse : {}) as Record<string, unknown>;
        const prepId = cleanText(u.preparation_id);
        if (!prepId) continue;
        const prep = preparations.find((p) => p.id === prepId);
        if (!prep) continue;
        // ⛔ LA TROISIÈME POPULATION, ET C'EST ELLE QUI ÉTAIT MUETTE. Une
        // casserole SANS JOUR DE CUISSON — ni `cook_on`, ni session qui la
        // nomme — était silencieusement sautée: la fenêtre ne tournait pas, et
        // le plan sortait avec l'air d'avoir été vérifié. C'est très
        // exactement « la fenêtre n'a pas tourné » contre « la fenêtre a tourné
        // et rien n'a mordu », les deux rendant `violations: 0`.
        //
        // ⚠️ ON NE JETTE PAS LE PLAT POUR AUTANT. Un jour de cuisson manquant
        // est une faute de rédaction du modèle, pas une preuve que le lot est
        // vieux; refuser dessus retirerait un repas sur une ignorance. On
        // COMPTE, et le seuil est zéro.
        const cookAt = prep.cookOn ? posOf(prep.cookOn) : -1;
        if (cookAt < 0 || eatAt < 0) {
          fridgeWindow.not_evaluated++;
          continue;
        }
        // ── LA PART CONGELÉE N'A PAS LA FENÊTRE DU FRIGO (2026-09-01) ─────
        // Lu ici, sur la sortie BRUTE, parce que c'est ici que la garde
        // tranche. Le `kept` reconstruit plus bas arriverait après le
        // `continue` qui jette le plat.
        const keptHere = readKept(u.kept);
        freezerClaimLinks++;
        if (freezerClaimedWithoutOne({ kept: keptHere, hasFreezer })) {
          // LE MODÈLE A INVENTÉ UN APPAREIL. On ne relâche rien, et on compte:
          // sans ce nombre, « la consigne mord » et « personne ne l'a lue »
          // rendent le même silence.
          freezerWithoutOne++;
        }
        const verdict = cookedWindowVerdict(
          cookAt,
          eatAt,
          keptWindowDays({
            kept: keptHere,
            hasFreezer,
            maxFridgeDays: MAX_FRIDGE_DAYS,
          }),
        );
        // `before_cooking` appartient à l'AUTRE règle (« un lot mangé avant
        // d'être cuisiné »), qui a son propre message et signale sans jeter.
        // Le compter ici ferait disparaître l'une des deux anomalies.
        if (verdict === "before_cooking") continue;
        if (verdict === "within") {
          fridgeWindow.within++;
          continue;
        }
        fridgeWindow.violations++;
        if (!tooLate) {
          tooLate = { title: prep.title, cookOn: prep.cookOn!, gap: eatAt - cookAt };
        }
      }
      if (tooLate) {
        issues.push(
          `dishes[${i}]: "${tooLate.title}" is cooked on ${tooLate.cookOn} and ` +
            `would still be eaten on ${day} -- ${tooLate.gap} days in the fridge, ` +
            `over the ${MAX_FRIDGE_DAYS}-day limit -- dropped`,
        );
        continue;
      }
    }

    // ── QUAND ÇA DÉBORDE, C'EST LE SURPLUS QUI TOMBE (C7 ②) ─────────────
    //
    // ⚠️ LA DÉCISION QUE L4 AVAIT LAISSÉE OUVERTE EST PRISE ICI. Le parseur
    // gardait les `cap` PREMIERS plats et jetait la queue; or un modèle écrit sa
    // semaine dans l'ordre, donc le plat perdu n'était jamais « celui en trop »,
    // c'était LE DERNIER REPAS DE LA FENÊTRE. Mesuré deux fois: le dîner du
    // dimanche du foyer (L4), puis le déjeuner ET le dîner du dimanche de la
    // personne reprise, tombés d'une réponse de relance à 20 plats écrêtée à 18
    // (C7 ①).
    //
    // ⚠️ LE PLAFOND N'A PAS BOUGÉ, ET C'EST DÉLIBÉRÉ. Sur le décor mesuré il
    // vaut EXACTEMENT ce que la consigne réclame — 9 plats de foyer + 9 plats
    // dédiés = 18 — et une bonne réponse en fait 18. Lui donner de la marge
    // inviterait le modèle à « déborder poliment pour la remplir », ce que
    // `dishCapFor` documente et que ce dépôt a déjà mesuré une fois. C'est
    // l'ORDRE du sacrifice qui était faux, pas le nombre.
    //
    // ⚠️ L'ÉVICTION EST DIFFÉRÉE JUSQU'AU `push`, ET IL LE FAUT. Ce plat peut
    // encore tomber plus bas (une cible chiffrée, un ingrédient en calories):
    // sacrifier ici ferait perdre un plat gardé au profit d'un plat qui ne
    // survivra pas, c'est-à-dire un repas de moins pour rien.
    //
    // ⚠️ LOT B ③ — LE PORTEUR EST LU ICI, ET VALIDÉ ICI, PARCE QUE LE RANG EN
    // DÉPEND. La VALIDATION est la même que celle de LOT C plus bas (les deux
    // portes: la consigne a-t-elle réclamé un plat dédié, et l'id est-il dans
    // la liste fermée) — une seule écriture, deux lecteurs; les REFUS, eux,
    // restent où ils étaient, pour qu'un plat qui tombe plus haut n'ajoute pas
    // une `issue` que le plan d'avant ce lot n'avait pas.
    const declaredFor = cleanText(d.for_member_id);
    const cell = slot ? `${day ?? "any"}/${slot}` : null;
    // ⟳ 2026-09-14 · BÊTA 1A ② — LA TROISIÈME PORTE: **SUR CETTE CASE**.
    // Voir `ownerExpectedAt`. Les deux premières (la consigne a-t-elle réclamé
    // un plat dédié, l'id est-il dans la liste fermée) n'ont pas bougé.
    const ownerOf = declaredFor !== "" && secondDishAsked &&
        dishBearers.has(declaredFor) && ownerExpectedAt(cell, declaredFor)
      ? declaredFor
      : null;

    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-14 · UNE ATTRIBUTION REFUSÉE NE DEVIENT PAS UN SECOND PLAT DE
    //                TABLE. Mesuré sur 6 tirs sur 13, tous en 422.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE DÉFAUT, ET IL EST L'INVERSE EXACT DE CE QUE LE LOT C PROMETTAIT.
    // « Un `for_member_id` refusé ne rejette jamais le plat » était écrit en
    // toutes lettres, et l'effet réel était: l'attribution tombe, le plat reste
    // — mais la case portait DÉJÀ le plat de la table. Le plat dédié devenait
    // donc un SECOND plat de table, chaque bouche de la case se retrouvait
    // nommée sur deux couvercles (`meals_delivered` compte les couvercles de
    // TOUS les plats de table d'une case, `lids > 1` ⇒ `double`), et la porte
    // finale refusait le plan ENTIER en 422. La phrase disait « jamais une
    // raison de retirer un dîner à quelqu'un »; le résultat mesuré était que
    // PERSONNE n'avait de dîner — 16 refus à N=4, 24 sur un autre tir.
    //
    // ⛔ CE QU'ON RETIRE ICI NE RETIRE LE REPAS DE PERSONNE, et c'est la seule
    // raison pour laquelle ce geste est permis. La case garde son plat de
    // table, donc chaque bouche y mange EXACTEMENT une fois — y compris celle
    // que le modèle voulait servir à part, dont le § 2.2 vient d'établir
    // qu'elle n'a pas besoin d'un plat à elle (sa ligne ne diverge pas de la
    // table, et elle n'a pas déclaré son propre repas). Ce qui disparaît est le
    // DOUBLON, pas un dîner.
    //
    // ⛔ ET LE PLAT TOMBE ICI, AVANT LE PLAFOND, PAS AU BARREAU DES REFUS 900
    // LIGNES PLUS BAS. Là-bas, `sacrifice` a déjà `splice` un plat gardé pour
    // faire de la place à celui-ci: le retirer après aurait coûté un vrai repas
    // pour rien. Sa place est donc entre la lecture du porteur et le rang.
    //
    // ⚠️ LA GARDE A UN CAS QUI PASSE, ET IL EST LE CAS ORDINAIRE. Quand la case
    // ne porte encore AUCUN plat de table, un `for_member_id` refusé laisse le
    // plat devenir ce plat de table — la promesse du lot C, tenue mot pour mot.
    // C'est ce que vérifient les tests « déclaré sur une bouche INCONNUE » et
    // « déclaré au barreau ① », où le plat refusé est le seul de sa case.
    const ownerRefusedHere = declaredFor !== "" && ownerOf === null;
    // ⟳ 2026-09-14 · BÊTA 1A ② — LES DEUX MOITIÉS DE LA MÊME QUESTION:
    // « cette case a-t-elle un plat de table ? ». `keptCells` répond pour ce
    // qui est DÉJÀ gardé, `bareDishesPerCell` pour ce qui reste à venir. La
    // seconde est celle qui manquait, et c'est elle qui rend la décision
    // indépendante de l'ordre d'écriture du modèle.
    const cellHasTableDishKept = cell !== null &&
      keptCells.some((k, p) => k === cell && dishes[p].memberId === null);
    const cellHasBareDishAnywhere = cell !== null &&
      (bareDishesPerCell.get(cell) ?? 0) > 0;
    if (
      ownerRefusedHere && (cellHasTableDishKept || cellHasBareDishAnywhere)
    ) {
      ownerRefusedDropped++;
      const where = cellHasTableDishKept
        ? `${cell} already carries the table's dish`
        : `${cell} carries the table's dish elsewhere in this answer`;
      issues.push(
        !secondDishAsked
          ? `dishes[${i}]: for_member_id on a shared dish (no dedicated dish was ` +
            `asked) and ${where} -- kept, it would ` +
            `be a second table dish and feed everyone there twice, so it is dropped`
          : `dishes[${i}]: for_member_id ${JSON.stringify(declaredFor)} is not a ` +
            `mouth that gets its own dish here, and ${where}` +
            ` -- kept, it would be a second table dish and feed everyone there ` +
            `twice, so it is dropped`,
      );
      continue;
    }

    const rank = dishRank(cell, ownerOf);
    let sacrifice = -1;
    if (dishes.length >= cap) {
      sacrifice = sacrificeFor(rank, ownerOf);
      if (sacrifice === -1) {
        issues.push(`dishes[${i}]: over the ${cap}-dish cap for ${args.scope}, dropped`);
        continue;
      }
    }

    const method = cleanText(d.method);
    const why = cleanText(d.why);

    // ── GARANTIE 1 : PAS DE CIBLE CHIFFRÉE ──────────────────────────────
    // Sur la PROSE uniquement. Les quantités d'ingrédients sont traitées plus
    // bas, avec la règle qui leur convient — les mélanger ici interdirait
    // « 400 g de poulet » et rendrait le générateur incapable d'écrire une
    // recette.
    const numeric = findNumericTarget(`${title} ${method} ${why}`);
    if (numeric) {
      if (!rejectedNumeric.includes(numeric)) rejectedNumeric.push(numeric);
      issues.push(
        `dishes[${i}]: numeric target (${numeric}) -- rejected, nobody has measured this student`,
      );
      continue;
    }

    // ── FF-061 · LA CULPABILISATION, GARDÉE ICI AUSSI ────────────────────
    //
    // `findGuiltTripping` existait et n'était appliqué qu'au message du soir et
    // à la relance. Le `why` d'un plat est produit par le MÊME modèle, il est
    // affiché à l'élève (`DishCard.tsx`), et il n'était gardé de ce côté par
    // personne — le seul champ de prose libre du plan sans ceinture de ton.
    //
    // ── ON EFFACE LA PHRASE, ON NE JETTE PAS LE PLAT ─────────────────────
    // Le plat est bon; c'est sa justification qui dérape. Le rejeter ferait
    // perdre un dîner pour une tournure, et un générateur qui retire des repas
    // pour un mot est un générateur qu'on désarme. Même geste que
    // `household_restriction_lock.ts`, qui efface le `why` d'un plat plutôt que
    // le plat.
    //
    // MESURÉ AVANT DE BRANCHER (2026-08-12): 1116 `why` déjà en base,
    // **0 déclenchement**. La garde ne coûte rien aujourd'hui — elle attend le
    // jour où le modèle dérive.
    let safeWhy = why;
    if (why) {
      const guilt = findGuiltTripping(why);
      if (guilt.length > 0) {
        safeWhy = "";
        issues.push(
          `dishes[${i}]: guilt_tripping in why (${
            guilt.map((g) => g.matchedText).join(" | ")
          }) -- sentence dropped, dish kept`,
        );
      }
    }

    // ── LES INGRÉDIENTS, ET LA GARANTIE 2 ───────────────────────────────
    const ingredients: DishIngredient[] = [];
    let numericInIngredients: string | null = null;
    for (const [j, rawIng] of (Array.isArray(d.ingredients) ? d.ingredients : []).entries()) {
      const ing = (rawIng && typeof rawIng === "object" ? rawIng : {}) as Record<string, unknown>;
      const term = cleanText(ing.term);
      if (!term) {
        issues.push(`dishes[${i}].ingredients[${j}]: empty term, dropped`);
        continue;
      }
      const quantity = cleanText(ing.quantity) || null;
      // Une unité d'énergie dans une quantité est la seule porte qui restait.
      if (quantity && ENERGY_UNIT_RE.test(quantity)) {
        numericInIngredients = "energy_unit_in_quantity";
        break;
      }
      // Un macro chiffré peut aussi se cacher dans le TERME (« 30 g protein »).
      const termNumeric = findNumericTarget(`${quantity ?? ""} ${term}`);
      if (termNumeric) {
        numericInIngredients = termNumeric;
        break;
      }
      ingredientCount++;
      const declaredGroup = readDeclaredGroup(ing);
      if (declaredGroup.declared) {
        regimeBelt.groups_declared++;
        if (declaredGroup.group === null) regimeBelt.groups_refused++;
        else regimeBelt.groups_valid++;
      }
      const reading = readRefSlug(ing.ref, args.composition, composable);
      refTally[reading.outcome]++;
      const structured = readStructuredQuantity(ing, args.composition, term, reading);
      // ── CE QUI N'A PAS PU ÊTRE PESÉ EST COMPTÉ ────────────────────────
      // Sans ce compteur, un contrat de quantités structurées que le modèle
      // ignore ressemble exactement à un contrat qu'il honore: des grammes
      // absents, et rien pour dire lequel des deux. C'est la mesure du §10 de
      // FF-038, et c'est elle qui dira s'il faut durcir la consigne.
      if (structured.amount === null || structured.unit === null) {
        unstructuredIngredients++;
        unquantifiedTerms.push(term);
        // ── LES DENSES SONT COMPTÉS À PART, ET C'EST TOUT L'ÉCART ──────
        // Une pincée de sel sans grammes ne déplace rien. Un filet d'huile
        // sans grammes retire 120 kcal d'une assiette, en silence, et fait
        // s'abstenir le verdict entier (`unweighedEnergyDense`). Les compter
        // ensemble donnerait un chiffre où « 26 condiments » et « 1 huile »
        // se ressemblent, alors que le second coûte le plan et le premier
        // rien.
        if (args.composition) {
          // ⟳ LOT C — la MÊME référence que celle qui a (ou n'a pas) pesé.
          // Relire par terme libre ici ferait dire « cette huile est dense »
          // à partir d'une ligne que le moteur a refusé de peser.
          const ref = refForIngredient(args.composition, {
            term,
            ref: structured.ref,
            refRefused: structured.refRefused,
          });
          if (ref?.energyDense) unweighedDenseTerms.push(term);
        }
      }
      // ══════════════════════════════════════════════════════════════════
      // ⛔ LE `ref` PRIME SUR LE `group` DÉCLARÉ — 2026-09-13.
      // ══════════════════════════════════════════════════════════════════
      //
      // ⛔ ICI ET PAS DANS `finalPlanGate`. La garde est PURE et n'a pas le
      // référentiel: la corriger là aurait laissé la LIGNE ÉCRITE fausse —
      // un plan livré dont le yaourt de soja reste rangé au rayon laitier
      // pour tous ses lecteurs ultérieurs. Ce site est le SEUL écrivain de
      // `DishIngredient.group`, donc le groupe corrigé atteint d'un seul
      // geste la ceinture de régime, la garde finale ET le `jsonb` persisté.
      const groupOfLine = reconcileIngredientGroup(
        declaredGroup.group,
        referentialGroupOfLine(args.composition, {
          term,
          ref: structured.ref,
          refRefused: structured.refRefused,
        }),
      );
      if (groupOfLine.conflicting) regimeBelt.groups_conflicting++;
      ingredients.push({
        term,
        quantity,
        // JAMAIS `ing.in_pantry`. Le drapeau du modèle n'est pas une preuve:
        // c'est la même faute que l'accusé « c'est noté » sans ligne en base,
        // et elle se paye ici en disant « tu as tout » à quelqu'un qui n'a pas
        // les œufs, un dimanche soir, magasins fermés.
        in_pantry: isInPantry(term, args.pantry),
        ...structured,
        group: groupOfLine.group,
        // ⟳ LOT D — le composant culinaire cité par la ligne, transporté tel quel.
        part: readPart(ing),
      });
    }
    if (numericInIngredients) {
      // ── C7 ⑤ · LE REPAS LE PLUS FRAGILE D'UNE FUSION EST LE PETIT-DÉJEUNER
      //
      // ⚠️ LE VERROU EST JUSTE ET IL NE BOUGE PAS. Ce qui est écrit ici est un
      // CONSTAT, mesuré, pour que quelqu'un le lise avant de chercher ailleurs:
      // sur quatre fusions réelles, le repas qui tombe est presque toujours le
      // petit-déjeuner, et par DEUX causes distinctes.
      //
      //   · CETTE garde — `whey protein 90 g` (L4/O6), puis `protein pancake
      //     mix` (runs 3 et 4): un aliment dont le NOM porte un macro se lit
      //     comme une cible chiffrée, et le plat entier est rejeté. Le
      //     petit-déjeuner est le seul repas dont le rayon vend des produits
      //     nommés d'après un macro; c'est ce qui le rend fragile, pas la garde.
      //   · la relance d'ancre protéique (run 1), qui ne regarde QUE les repas
      //     principaux et pouvait rendre un plan amputé de ses petits-déjeuners
      //     dédiés — refermé par C7 ①.
      //
      // Rien de tout ça n'est un défaut à réparer ici: la case vide est
      // comptée (C2 ④, `empty_slots`) et nommée au modèle. Ce qui manque est
      // une DÉCISION sur la recomposition d'une case vide, et personne ne l'a
      // prise. Le fait, lui, est maintenant écrit là où on tombera dessus.
      if (!rejectedNumeric.includes(numericInIngredients)) {
        rejectedNumeric.push(numericInIngredients);
      }
      issues.push(
        `dishes[${i}]: numeric target (${numericInIngredients}) in an ingredient -- ` +
          `dish rejected (${day ?? "any"}/${slot ?? "any"})`,
      );
      continue;
    }

    // `honours_belief_keys` est INFORMATIF, donc une clé inventée est jetée et
    // comptée — jamais une raison de rejeter le plat. Le laisser passer
    // afficherait en revanche à l'élève une conviction que son coach n'a pas.
    const honours: string[] = [];
    for (const k of (Array.isArray(d.honours_belief_keys) ? d.honours_belief_keys : [])) {
      const key = cleanText(k);
      if (!key) continue;
      if (!allowedKeys.has(key)) {
        issues.push(`dishes[${i}]: honours_belief_keys ${JSON.stringify(key)} is not in the doctrine, dropped`);
        continue;
      }
      if (!honours.includes(key)) honours.push(key);
    }

    // CE QUE LE PLAT PRÉLÈVE. Une référence inconnue est JETÉE et comptée: la
    // garder afficherait « prélève sur la préparation X » quand X n'existe
    // nulle part, et l'élève chercherait une casserole qu'on ne lui a jamais
    // demandé de faire.
    const uses: GeneratedDish["uses"] = [];
    for (const rawUse of (Array.isArray(d.uses) ? d.uses : [])) {
      const u = (rawUse && typeof rawUse === "object" ? rawUse : {}) as Record<string, unknown>;
      const prepId = cleanText(u.preparation_id);
      if (!prepId) continue;
      if (!preparationIds.has(prepId)) {
        issues.push(
          `dishes[${i}].uses: unknown preparation ${JSON.stringify(prepId)}, dropped`,
        );
        continue;
      }
      const servings = Number(u.servings);
      // ── LE DÉNOMINATEUR SE COMPTE ICI, SUR LES PARTS GARDÉES ───────────
      // Après le `continue` des références inconnues: une part qui n'existe
      // pas ne se compte ni au numérateur ni au dénominateur.
      keptTotal++;
      const kept = readKept(u.kept);
      if (kept === "freezer") keptDeclared++;
      uses.push({
        preparationId: prepId,
        servings: Number.isFinite(servings) && servings > 0
          ? Math.min(12, Math.round(servings))
          : 1,
        // ⚠️ LA MÊME LECTURE QUE LA GARDE, par la MÊME fonction. La garde
        // tranche plus haut, sur la sortie brute; si elle lisait un jeton et
        // la ligne écrite un autre, le plan servi contredirait la fenêtre qui
        // l'a laissé passer.
        //
        // ⛔ ET LE JETON EST GARDÉ TEL QUEL, MÊME SANS CONGÉLATEUR. Le rabattre
        // sur `"fridge"` effacerait la trace de ce que le modèle a réclamé —
        // or c'est exactement ce que `freezer_claimed_without_one` compte, et
        // un compteur dont la donnée a été nettoyée en amont ne compte rien.
        kept,
      });
    }

    // ══════════════════════════════════════════════════════════════════════
    // LES CONTENANTS DE CE REPAS, DÉCLARÉS ET VALIDÉS FERMÉS (v4, 2026-08-20)
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ CINQ PORTES, ET AUCUNE NE JETTE LE PLAT. Un contenant est une PRÉCISION
    // en plus; perdre un dîner parce qu'un modèle a écrit « 150 » sous forme de
    // chaîne échangerait le repas contre le confort du parseur. Posture
    // `for_member_id` / `same_day`, cinquième fois.
    //
    //   ① l'`id` existe et n'est pas déjà pris DANS LE PLAN. Deux couvercles du
    //      même nom dans un frigo ne décident rien devant la porte — c'est le
    //      défaut n°3, et il ne se répare pas en aval.
    //   ② chaque nom est une bouche de la LISTE FERMÉE. Un id inconnu est jeté
    //      (pas le contenant entier: un bac amputé d'un nom fantôme reste servi
    //      aux autres). Zéro nom gardé ⇒ le contenant tombe — « un bac pour
    //      personne » n'est pas une instruction, et « sers-toi » se dit par
    //      l'ABSENCE de contenant, jamais par un contenant vide.
    //   ③ un nom UNE SEULE FOIS par couvercle. Deux fois n'ajoute rien et
    //      laisserait croire à deux parts, ce que v4 existe pour supprimer.
    //   ④ chaque `item` porte une étiquette, des grammes ENTIERS et > 0, et un
    //      `preparation_id` qui désigne une casserole DE CE PLAN (ou `null` =
    //      ajouté frais le jour même, hors contrôle de fournée). Zéro item gardé
    //      ⇒ le contenant tombe: un couvercle sans contenu ne se remplit pas.
    //   ⑤ le plat prélève sur au moins une préparation. Rien n'a été pesé
    //      d'avance pour un plat cuisiné de zéro le jour même.
    //
    // ⛔ ET LE PARSEUR NE FABRIQUE PAS LE CONTENANT DE TINO. Retirer « la
    // viande » de ses `items` demande de savoir ce qui est la viande, et surtout
    // de décider si ce qui reste est un repas ou une assiette de riz. C'est une
    // décision de COMPOSITION: elle appartient au modèle, à qui la consigne
    // demande la séparation. Le parseur VALIDE, il n'invente pas.
    //
    // ⚠️ LA CEINTURE DE RÉGIME EST LE FILET, PLUS LE MODÈLE (v4). Elle reste
    // armée — le modèle n'a pas séparé ⇒ on retire la bouche du couvercle — et
    // elle ne touche AUCUN gramme: retirer un nom d'un bac ne redimensionne pas
    // le bac. On REFUSE UNE DÉCLARATION, exactement comme la porte ② refuse un
    // `member_id` qui n'est pas du foyer; on ne réécrit pas la sortie du modèle.
    const boxes: MealBox[] = [];
    /**
     * Les bouches que leur ligne déclarée tient hors de CE repas, AVEC LA
     * CAUSE et le contenant dont le nom a été retiré (2026-09-04).
     *
     * ⛔ LA CAUSE N'EST PAS COSMÉTIQUE. Un régime est une ligne qu'on ne
     * franchit pas; un dégoût est un goût. L'invariant « personne sans repas »
     * ne leur doit pas le même dernier recours, et il ne peut pas le deviner
     * après coup: un nom absent d'un couvercle ne dit pas s'il en a été retiré
     * ni par quoi.
     */
    const boxHeldOff: BoxHeldOff[] = [];
    /** Vrai dès qu'un contenant a été DÉCLARÉ sur ce plat, gardé ou non. */
    let declaredABox = false;
    // ── LA MORSURE DE CE PLAT, LUE UNE FOIS PAR LIGNE DÉCLARÉE ─────────────
    //
    // ⚠️ MÉMOÏSÉE PAR RÉGIME, PAS PAR BOUCHE, et c'est le contrat de
    // `scanMealForRegime`: il ne lit que la ligne et le repas, jamais l'identité
    // de qui la porte. Deux véganes à la même table rendraient deux fois le même
    // verdict, et le second est du temps perdu sur une lane qui frôle déjà le
    // mur de quatre minutes du worker.
    //
    // ⟳ ÉCHANGE (2026-09-04) — LA CLÉ PORTE AUSSI LA SURFACE. Un plat a
    // désormais plusieurs surfaces de lecture: la sienne, et une par boîte qui
    // déclare des items. Mémoïser par régime seul ferait répondre la première
    // boîte lue pour toutes les autres — et l'échange composé correctement se
    // ferait refuser parce qu'une AUTRE boîte du même plat porte du poulet.
    const biteByRegime = new Map<string, MealRegimeBite>();
    const biteFor = (
      regime: DietaryRegime,
      surface: { terms: string[]; prepIds: string[] } | null,
      boxId: string,
    ): MealRegimeBite => {
      const key = `${regime}::${surface === null ? "dish" : boxId}`;
      const seen = biteByRegime.get(key);
      if (seen) return seen;
      const breach = surface === null
        ? scanMealForRegime(
          regime,
          { title, method, ingredients },
          uses,
          preparationById,
        )
        : scanRegimeSources(regime, [
          {
            prepId: null,
            prose: [],
            items: surface.terms.map((term) => ({ term, group: null })),
          },
          ...surface.prepIds.flatMap((id) => {
            const prep = preparationById.get(id);
            return prep === undefined ? [] : [{
              prepId: prep.id,
              prose: [prep.title, prep.method],
              items: [...prep.ingredients],
            }];
          }),
        ]);
      biteByRegime.set(key, breach);
      return breach;
    };

    /**
     * UN CONTENANT DÉCLARÉ, PASSÉ AUX CINQ PORTES.
     *
     * `legacyShares` porte le repli v2: la somme des parts d'un `box` singulier,
     * qui est la seule chose VRAIE qu'on puisse en tirer — et qui est bien une
     * quantité de bac. `null` sur le chemin v4.
     */
    const takeBox = (raw: unknown, legacy: boolean): void => {
      if (raw === null || raw === undefined || typeof raw !== "object") return;
      declaredABox = true;
      const bx = raw as Record<string, unknown>;
      const boxId = cleanText(bx.id);
      if (!boxId) {
        boxesRefused++;
        issues.push(`dishes[${i}].boxes: no id, dropped`);
        return;
      }
      if (boxIdsSeen.has(boxId)) {
        boxesRefused++;
        issues.push(
          `dishes[${i}].boxes: box id ${JSON.stringify(boxId)} is already used in ` +
            `this plan, dropped`,
        );
        return;
      }
      const where = `dishes[${i}].boxes[${JSON.stringify(boxId)}]`;
      // ⚠️ CALCULÉE AVANT LA BOUCLE DES NOMS, ET SUR LE BRUT. Les items ne
      // sont validés que plus bas (portes ③ et ④); les ceintures, elles, se
      // prononcent AVANT. Attendre la validation ferait juger le couvercle sur
      // le plat pendant que la boîte, elle, dit autre chose.
      let surface = legacy ? null : boxScanSurface(bx, preparationById);
      // ══ PORTE ② · LES NOMS SUR LE COUVERCLE ═══════════════════════════════
      //
      // ⚠️ LE REPLI v2 LIT SES NOMS DANS `shares[]`. Un plan écrit avant ce lot
      // porte une part par personne; les `member_id` de ces parts SONT le
      // groupe, et c'est ce qui fait qu'aucun couvercle déjà en base ne perd son
      // nom quand la forme change sous lui.
      const rawNames = legacy
        ? (Array.isArray(bx.shares) ? bx.shares : []).map((entry) => {
          const sh = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
          return cleanText(sh.member_id) || cleanText(sh.memberId);
        })
        : (Array.isArray(bx.member_ids) ? bx.member_ids : Array.isArray(bx.memberIds) ? bx.memberIds : [])
          .map((v) => cleanText(v));
      const memberIds: string[] = [];
      const seenMouths = new Set<string>();
      /** Vrai dès qu'une bouche a été retirée par sa ligne — voir les deux motifs. */
      let heldOffHere = false;
      for (const memberId of rawNames) {
        if (!memberId) {
          boxNamesRefused++;
          issues.push(`${where}: a name on the lid is empty, dropped`);
          continue;
        }
        if (!boxMembers.has(memberId)) {
          boxNamesRefused++;
          issues.push(
            `${where}: member_id ${JSON.stringify(memberId)} is not a mouth of ` +
              `this plan, dropped`,
          );
          continue;
        }
        if (seenMouths.has(memberId)) {
          boxNamesRefused++;
          issues.push(
            `${where}: ${JSON.stringify(memberId)} is on this lid twice -- the ` +
              `second is dropped`,
          );
          continue;
        }
        seenMouths.add(memberId);
        // ══ PORTE ②bis · LA LIGNE DÉCLARÉE DE CETTE BOUCHE ══════════════════
        //
        // ⛔ CE N'EST PAS UNE RÉÉCRITURE DE LA SORTIE DU MODÈLE. Rien de la
        // prose n'est touché: aucun titre, aucune méthode, aucun `why`, aucune
        // `portion_note`, et AUCUN gramme — le bac garde exactement le contenu
        // que le modèle lui a donné. On REFUSE UNE DÉCLARATION.
        //
        // ⛔ ET C'EST UN RETRAIT, PAS UN REFUS DU PLAN. Mesuré: CINQ plans foyer
        // sur cinq portaient la brèche. Refuser le plan aurait rendu
        // `422 empty_meal` à 100 % des foyers où un végane mange — faire payer
        // son régime en semaines vides à la seule population que cette ceinture
        // existe pour protéger.
        const regime = mouthRegimes.get(memberId);
        if (regime) {
          let breach = biteFor(regime, surface, boxId);
          // ⟳ 2026-09-05 — LA CITATION SE RÉPARE AVANT QUE LA BOUCHE NE TOMBE.
          // Mesuré (C07, v28): le modèle cuit un pot de tofu POUR Léa, et sa
          // boîte cite le pot de poulet — le tofu n'est cité par personne. La
          // ceinture la retirait 11 fois sur 11; deux relances et une fusion
          // en resservaient 8; trois repas restaient sans elle. Ici, quand
          // l'item de sa boîte est propre (le terme ne mord pas) et que seule la
          // casserole citée mord, on cherche la casserole ORPHELINE du même
          // jour que sa ligne accepte, et on ré-adresse la citation. Strict:
          // toutes les bouches du couvercle portent cette ligne (on ne change
          // pas l'assiette d'un omnivore), une seule candidate, comptée.
          if (
            breach.matched !== null && surface !== null &&
            rawNames.every((n) => !n || mouthRegimes.get(n) === regime)
          ) {
            // ⟳ 2026-09-05 soir (C03): le TERME peut mordre aussi — « saumon »
            // dans la boîte de la végane, pendant que son pot de tofu du jour
            // n'est cité par personne. Même évidence: on réécrit l'item
            // (terme + citation), compté à part (`item_repaired`).
            const biting = new Set(breach.preparationIds);
            const dayRefs = biting.size > 0 ? [...biting] : surface.prepIds;
            const sameDay = new Set(
              dayRefs.map((id) => preparationById.get(id)?.cookOn ?? null),
            );
            // Candidate: cuite le même jour, citée par AUCUNE boîte ni aucun
            // `uses` du plan brut (le pot que personne ne mange), qui porte
            // une protéine (le rôle du composant échangé), et que la ligne
            // accepte. Un pot de riz orphelin n'est pas une candidate.
            const candidates = [...preparationById.values()].filter((p) =>
              !biting.has(p.id) && !citedAnywhereRaw.has(p.id) &&
              sameDay.has(p.cookOn ?? null) &&
              detectProteinAnchor(p.ingredients) &&
              biteFor(regime, { terms: [], prepIds: [p.id] }, `${boxId}#cand:${p.id}`)
                  .matched === null
            );
            if (candidates.length === 1) {
              const target = candidates[0].id;
              const rawItems = Array.isArray(bx.items) ? bx.items : [];
              let termsRewritten = 0;
              let citationsRewritten = 0;
              for (const [k, entry] of rawItems.entries()) {
                const it = (entry && typeof entry === "object" ? entry : null) as Record<string, unknown> | null;
                if (!it) continue;
                const cited = cleanText(it.preparation_id) || cleanText(it.preparationId);
                const term = cleanText(it.term);
                const termBites = term !== "" &&
                  biteFor(regime, { terms: [term], prepIds: [] }, `${boxId}#term:${k}`).matched !== null;
                if (!biting.has(cited) && !termBites) continue;
                if (termBites) {
                  it.term = candidates[0].title.toLowerCase();
                  termsRewritten++;
                }
                if (cited !== target) citationsRewritten++;
                it.preparation_id = target;
                delete it.preparationId;
              }
              const repaired = boxScanSurface(bx, preparationById);
              const again = repaired === null ? breach : biteFor(regime, repaired, `${boxId}#repaired`);
              if (again.matched === null) {
                surface = repaired;
                breach = again;
                if (citationsRewritten > 0) regimeBelt.citation_repaired++;
                if (termsRewritten > 0) regimeBelt.item_repaired++;
                issues.push(
                  `${where}: ${JSON.stringify(memberId)} is ${regime} and the box cited ` +
                    `${JSON.stringify([...biting][0])} -- re-pointed to ${JSON.stringify(target)}, ` +
                    `cooked the same day and cited by no box of this plan`,
                );
              }
            }
          }
          regimeBelt.checked++;
          if (surface !== null) regimeBelt.box_scoped++;
          regimeBelt.silenced += breach.silenced;
          regimeBelt.silenced_homograph += breach.silencedHomograph;
          regimeBelt.silenced_spelling += breach.silencedSpelling;
          regimeBelt.group_excluded += breach.groupExcluded;
          regimeBelt.group_plant_only += breach.groupPlantOnly;
          regimeBelt.group_undecided += breach.groupUndecided;
          if (breach.matched !== null) {
            regimeBelt.refused++;
            boxNamesRefused++;
            heldOffHere = true;
            if (!boxHeldOff.some((h) => h.memberId === memberId)) {
              boxHeldOff.push({
                memberId,
                cause: "regime",
                boxId,
                via: breach.preparationIds.length > 0 ? "preparation" : "items",
                preparationId: breach.preparationIds[0] ?? null,
                matched: breach.matched,
              });
            }
            issues.push(
              `${where}: ${JSON.stringify(memberId)} is ${regime} and "${title}" ` +
                `breaks that line (${breach.matched}) -- mouth dropped from the box`,
            );
            continue;
          }
          regimeBelt.kept++;
        }
        // ══ PORTE ②ter · CE QUE CETTE BOUCHE A DEMANDÉ D'ÉVITER ════════════
        //
        // ⛔ MÊME GESTE QUE LE RÉGIME, ET POUR LE MÊME MOTIF: on retire LA
        // BOUCHE du contenant, jamais le plat ni le plan. Le plat reste, les
        // autres sont servis, et la personne concernée ne l'est plus.
        // Refuser le plan ferait payer son goût en semaine vide à la seule
        // personne que cette ceinture existe pour servir.
        //
        // ⚠️ SURFACE `ingredients`, JAMAIS `all`. `termsOfInstruction` rend du
        // bruit (« fils » → `fil`, mesuré), et ici un faux positif coûte le
        // repas de quelqu'un: on ne lit que ce que le modèle a NOMMÉ comme
        // aliment.
        const exclusions = mouthExclusions.get(memberId);
        if (exclusions) {
          const bite = surface === null
            ? dishBitesExclusion({
              dish: { title, method, ingredients },
              uses,
              preparationById,
              terms: exclusions,
              surface: "ingredients",
              // ⟳ 2026-09-21 — LE MOMENT DE CE PLAT. Une exclusion écrite pour
              // le petit-déjeuner ne juge pas un dîner: sans ce filtre, le
              // moment n'était qu'un mot dans le texte, invisible ici.
              slot,
            })
            : dishBitesExclusion({
              // ⚠️ TITRE ET MÉTHODE VIDES, ET C'EST LE POINT. `surface:
              // "ingredients"` ne lisait déjà pas la prose du plat; ici on ne
              // lui en donne même pas, et les « ingrédients » sont les items du
              // CONTENANT. Ce que la boîte porte, plus ce que ses casseroles
              // portent — rien du plat.
              dish: {
                title: "",
                method: "",
                ingredients: surface.terms.map((term) => ({ term })),
              },
              uses: surface.prepIds.map((preparationId) => ({ preparationId })),
              preparationById,
              terms: exclusions,
              surface: "ingredients",
              slot,
            });
          exclusionBelt.checked++;
          if (surface !== null) exclusionBelt.box_scoped++;
          if (bite.matched !== null) {
            exclusionBelt.refused++;
            boxNamesRefused++;
            heldOffHere = true;
            if (!boxHeldOff.some((h) => h.memberId === memberId)) {
              boxHeldOff.push({
                memberId,
                cause: "exclusion",
                boxId,
                via: bite.preparationIds.length > 0 ? "preparation" : "items",
                preparationId: bite.preparationIds[0] ?? null,
                matched: bite.matched,
              });
            }
            issues.push(
              `${where}: ${JSON.stringify(memberId)} asked to avoid ` +
                `${JSON.stringify(bite.because ?? bite.matched)} and "${title}" ` +
                `contains ${bite.matched} -- mouth dropped from the box`,
            );
            continue;
          }
          exclusionBelt.kept++;
        }
        memberIds.push(memberId);
      }
      // ══ PORTE ④ · CE QU'IL Y A DEDANS ═════════════════════════════════════
      const items: BoxItem[] = [];
      let legacyTotalGrams: number | null = null;
      if (legacy) {
        // ⛔ LE REPLI v2 N'INVENTE AUCUNE VENTILATION. v2 portait une part PAR
        // PERSONNE et aucun découpage par composant. La seule chose vraie qu'on
        // puisse en tirer est la SOMME — et une somme sur un bac partagé est
        // exactement ce que v4 appelle une quantité de bac. Elle sort donc en
        // `legacyTotalGrams`, jamais en `items` fabriqués: un `item` inventé
        // porterait un `term` que personne n'a écrit, c'est-à-dire un mensonge.
        let total = 0;
        for (const entry of (Array.isArray(bx.shares) ? bx.shares : [])) {
          const sh = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
          const rawGrams = Number(sh.grams);
          if (!Number.isFinite(rawGrams) || rawGrams <= 0) continue;
          const grams = Math.min(BOX_MAX_GRAMS, Math.round(rawGrams));
          if (grams !== Math.round(rawGrams)) {
            boxesCapped++;
            issues.push(
              `${where}: ${Math.round(rawGrams)} g is over the ${BOX_MAX_GRAMS}-gram ` +
                `ceiling -- capped`,
            );
          }
          total += grams;
        }
        legacyTotalGrams = total > 0 ? total : null;
      } else {
        for (const entry of (Array.isArray(bx.items) ? bx.items : [])) {
          const it = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
          const term = cleanText(it.term);
          if (!term) {
            boxItemsRefused++;
            issues.push(`${where}: an item names no food, dropped`);
            continue;
          }
          // ⚠️ `null` EST UNE VALEUR, PAS UNE ABSENCE: « ajouté frais le jour
          // même », donc hors du contrôle de fournée. Un id ÉCRIT qui ne désigne
          // aucune casserole du plan est autre chose — c'est une jointure morte,
          // et la laisser passer citerait une casserole que personne ne cuisine.
          // Patron `dishes[].uses[].preparation_id`, mot pour mot.
          const rawPrep = cleanText(it.preparation_id) || cleanText(it.preparationId);
          if (rawPrep && !preparationById.has(rawPrep)) {
            boxItemsRefused++;
            issues.push(
              `${where}: item ${JSON.stringify(term)} draws on ` +
                `${JSON.stringify(rawPrep)}, which is not a preparation of this ` +
                `plan, dropped`,
            );
            continue;
          }
          // ══════════════════════════════════════════════════════════════════
          // ⟳ 2026-09-13 — DEUX FORMES D'ITEM, ET LA SECONDE EST CELLE QUE LE
          // PROMPT ENSEIGNE SUR CE CHEMIN.
          // ══════════════════════════════════════════════════════════════════
          //
          // ⛔ LE DÉFAUT QUE CE BLOC FERME, MESURÉ AU CARACTÈRE. Sous
          // `sizingPath === "portion_v1"`, `boxSchemaBlock` n'est pas servi
          // (`household_meal_generation.ts`) — or c'était le SEUL endroit du
          // prompt qui nommait la clé `grams` d'un item de contenant. Le bloc de
          // régime, lui, ordonne toujours « the one component that line refuses
          // is served PER BOX ... with its own "items" »
          // (`household_diet.ts`). Le modèle écrit donc la seule forme d'item
          // qu'on lui enseigne — celle d'un INGRÉDIENT:
          //   {"term":"ham","quantity":"6 unités de jambon","amount":6,
          //    "unit":"unit","state":"raw","ref":"ham","group":"red_meat"}
          // Tir réel N=2 du 2026-09-13 (`gain-lot3r2-…`): **8 items sur 8
          // jetés**, `delivery: "none_delivered"`, et avec eux l'ancre protéique
          // des quatre repas principaux (jambon pour Max, tofu pour Lea).
          //
          // ⛔ AUCUNE CONVERSION MAISON. La forme d'ingrédient passe par les
          // lecteurs de production, dans l'ordre exact du parseur de plats:
          // `readRefSlug` pour l'identifiant, `readStructuredQuantity` pour la
          // quantité (structurée, puis la copie en prose), puis
          // `preparationReadyGrams` pour la masse PRÊTE — « 6 unités » de jambon
          // deviennent des grammes par `unit_grams` du référentiel, jamais par
          // un barème écrit ici. C'est le geste que `portion_sizing.ts` fait
          // déjà quand LE MOTEUR fabrique un item de contenant à partir d'une
          // ligne d'ingrédient (`readyGramsOfOne`, même arithmétique).
          //
          // ⚠️ `grams` GAGNE QUAND ELLE EST LÀ, et cet ordre est le contrat: une
          // sortie v4 conforme ne change pas de chemin, ne change pas de nombre,
          // et ne passe par aucune résolution de référentiel.
          //
          // ⚠️ ET UNE LIGNE QU'ON NE SAIT PAS CONVERTIR RESTE REFUSÉE. Sans
          // `ref` résoluble, ou sans quantité lisible, `preparationReadyGrams`
          // rend `null` et l'item tombe comme avant, avec son motif.
          const rawGrams = Number(it.grams);
          const declaredGrams = Number.isFinite(rawGrams) && rawGrams > 0 ? rawGrams : null;
          let usableGrams = declaredGrams;
          let itemRef: string | null = null;
          let itemRefRefused = false;
          if (usableGrams === null) {
            const reading = readRefSlug(it.ref, args.composition, composable);
            const structured = readStructuredQuantity(it, args.composition, term, reading);
            const ready = preparationReadyGrams([{
              term,
              quantity: cleanText(it.quantity) || null,
              in_pantry: false,
              group: null,
              part: null,
              ...structured,
            }], args.composition);
            if (ready !== null && ready > 0) {
              usableGrams = ready;
              // ⟳ LOT A — L'IDENTITÉ DE LA LIGNE SUIT DANS LA BOÎTE, et elle
              // n'est portée QUE sur ce chemin: ici l'identifiant a été LU et
              // c'est LUI qui a pesé l'item. Sur le chemin `grams`, rien n'a été
              // lu et le commentaire d'en dessous tient toujours.
              itemRef = structured.ref;
              itemRefRefused = structured.refRefused;
              boxItemsFromIngredientForm++;
            }
          }
          if (usableGrams === null) {
            boxItemsRefused++;
            issues.push(
              `${where}: item ${JSON.stringify(term)} has no usable grams, dropped`,
            );
            continue;
          }
          if (declaredGrams !== null) boxItemsInGrams++;
          const grams = Math.min(BOX_MAX_GRAMS, Math.round(usableGrams));
          if (grams !== Math.round(usableGrams)) {
            boxesCapped++;
            issues.push(
              `${where}: ${Math.round(usableGrams)} g of ${JSON.stringify(term)} is ` +
                `over the ${BOX_MAX_GRAMS}-gram ceiling for one item -- capped`,
            );
          }
          // ⟳ LOT A — LE MODÈLE N'ÉCRIT PAS D'IDENTIFIANT SUR SES ITEMS DE
          // CONTENANT, et on ne lui en invente pas un en rapprochant le terme
          // d'une ligne d'ingrédient homonyme: deux lignes du même plat peuvent
          // porter le même nom (sel de cuisson et sel de finition). Ces items
          // suivent donc le chemin historique par le terme. Ceux que le MOTEUR
          // écrit ensuite (`applySizing`) portent, eux, l'identité de leur
          // ligne — et ce sont eux qui survivent sur la lane v4.
          items.push({
            preparationId: rawPrep || null,
            term,
            grams,
            ref: itemRef,
            refRefused: itemRefRefused,
            // ⟳ 2026-09-22 — LE VOLUME SUIT L'IDENTIFIANT, ET SEULEMENT LUI.
            // `itemRef` n'est posé que sur le chemin où le référentiel a servi
            // à PESER cet item; sur le chemin `grams` déclaré, rien n'a été lu
            // et il n'y a donc aucune fiche à interroger. Pas de rattrapage par
            // le libellé, pour la raison écrite juste au-dessus.
            ml: millilitresOfSlug(args.composition, itemRef, grams),
          });
        }
      }
      // ══ CE QUI TOMBE, ET AVEC QUEL MOTIF ══════════════════════════════════
      if (memberIds.length === 0 && !args.soloBoxes) {
        boxesRefused++;
        // ⚠️ DEUX MOTIFS, PAS UN. « aucune bouche connue » et « toutes ses
        // bouches sont tenues dehors par leur régime » sont deux causes
        // opposées: la première est un modèle qui invente des noms, la seconde
        // est le produit qui protège quelqu'un. Un seul message aurait rendu les
        // deux indiscernables dans le journal.
        issues.push(
          heldOffHere
            ? `${where}: every mouth on it is held off "${title}" by their ` +
              `declared line, dropped`
            : `${where}: no usable name on the lid, dropped`,
        );
        return;
      }
      if (items.length === 0 && legacyTotalGrams === null) {
        // ⛔ « SERS-TOI » SE DIT PAR L'ABSENCE DE CONTENANT, JAMAIS PAR UN
        // CONTENANT VIDE. Un couvercle nommé sur un bac dont on ne sait pas quoi
        // mettre dedans envoie quelqu'un au frigo chercher une boîte que
        // personne n'a remplie.
        boxesRefused++;
        issues.push(`${where}: nothing to put in it, dropped`);
        return;
      }
      if (uses.length === 0) {
        // ⛔ UN CONTENANT SUR UN PLAT QUI NE PRÉLÈVE RIEN N'A RIEN À CONTENIR.
        // Le protocole pèse à la SESSION de cuisine, dans ce qui sort d'une
        // casserole; un plat cuisiné de zéro le jour même n'a pas été pesé
        // d'avance. Jeté et compté — jamais le plat, qui reste un plat qui se
        // cuisine et se mange.
        boxesRefused++;
        issues.push(
          `${where}: the dish draws on no preparation -- nothing was weighed ` +
            `ahead, dropped`,
        );
        return;
      }
      boxIdsSeen.add(boxId);
      boxNames += memberIds.length;
      boxItems += items.length;
      if (legacyTotalGrams !== null) boxesLegacyFolded++;
      boxes.push({ id: boxId, memberIds, items, legacyTotalGrams });
    };

    // ── LE CHEMIN v4, PUIS LE REPLI v2 ────────────────────────────────────
    //
    // ⛔ LE PARSEUR LIT LES DEUX FORMES, EXACTEMENT COMME LE FRONT. Tant que le
    // prompt n'est pas passé en v4, le modèle écrit encore `box` au singulier:
    // sans ce repli, ce lot rendrait ZÉRO contenant sur toute la population, et
    // on lirait « le modèle n'obéit pas » en ayant corrigé la mauvaise moitié.
    //
    // ⚠️ `boxes` GAGNE DÈS QU'ELLE EST UN TABLEAU, même vide: un modèle passé en
    // v4 qui n'écrit aucun contenant sur ce plat a dit quelque chose, et aller
    // chercher un `box` v2 derrière lui ferait remonter une forme qu'il n'a pas
    // voulue.
    if (Array.isArray(d.boxes)) {
      for (const entry of d.boxes) takeBox(entry, false);
    } else {
      takeBox(d.box, true);
    }

    // ══ LA MORSURE, COMPTÉE SUR LE PLAT ET PAS SUR LE COUVERCLE ═══════════
    //
    // ⛔ C'EST LE COMPTEUR QUE v4 RÉCLAME: sans lui, un modèle qui ne sépare
    // JAMAIS ressemble exactement à un foyer sans régime — la ceinture retire en
    // silence et tout le monde a l'air servi.
    //
    // ⚠️ LA POPULATION EST « LES PLATS QUI DÉCLARENT UN CONTENANT ». Sur un plat
    // sans couvercle, personne n'est nommé: compter chaque bouche mordue comme
    // « séparée » gonflerait le numérateur avec des plats où la question ne se
    // pose pas.
    //
    // ⚠️ ET `regimeRefusedByPreparation` SE REMPLIT SUR TOUTE MORSURE, séparée ou
    // non. C'est un fait de CASSEROLE, pas de couvercle: une bouche dont la
    // ligne refuse cette préparation ne doit pas en recevoir une part dans
    // `member_portions`, que le modèle l'ait sortie du bac ou non.
    // ⟳ ÉCHANGE (2026-09-04) — « SÉPARÉ » SE LIT SUR LE GESTE DE LA CEINTURE,
    // PLUS SUR LA PRÉSENCE DU NOM.
    //
    // Ce compteur lisait `namedOnThisDish`: le modèle a-t-il nommé cette bouche
    // sur ce plat? Sous la boîte d'échange, la réponse est OUI dans le cas
    // NOMINAL — la végétarienne est nommée, sur SA boîte de tofu. L'ancienne
    // lecture aurait compté chaque échange réussi comme un échec de séparation,
    // c'est-à-dire fait mentir le seul nombre qui dit si la consigne porte.
    //
    // La question juste est: la ceinture a-t-elle dû retirer ce nom? Si oui, le
    // modèle n'avait pas séparé et le moteur a rattrapé. Si non — nommée sur sa
    // propre boîte, ou pas nommée du tout — la composition a fait son travail.
    const heldOffByRegime = new Set(
      boxHeldOff.filter((h) => h.cause === "regime").map((h) => h.memberId),
    );
    const dishRegimeBites: DietaryRegime[] = [];
    for (const [memberId, regime] of mouthRegimes) {
      // ⚠️ LA SURFACE DU PLAT, ICI, ET C'EST VOULU: cette boucle demande « ce
      // PLAT mord-il cette ligne? », pas « ce contenant la mord-il? ». C'est
      // elle qui alimente `regime_refusals`, dont la seconde surface
      // (`preparation_shares`) ne connaît aucune boîte.
      const breach = biteFor(regime, null, "");
      // ⟳ 2026-09-05: la morsure au niveau PLAT est aussi le dénominateur —
      // « ce plat porte ce que cette ligne refuse » (voir `regimeBites`).
      if (breach.matched !== null && !dishRegimeBites.includes(regime)) {
        dishRegimeBites.push(regime);
      }
      if (breach.matched === null) continue;
      for (const prepId of breach.preparationIds) {
        const seen = regimeRefusedByPreparation.get(prepId) ?? new Set<string>();
        seen.add(memberId);
        regimeRefusedByPreparation.set(prepId, seen);
      }
      if (!declaredABox) continue;
      regimeBelt.bites++;
      if (heldOffByRegime.has(memberId)) regimeBelt.not_separated++;
      else regimeBelt.separated++;
    }
    // ── LOT C · LA MÊME MESURE, POUR LES DÉGOÛTS ─────────────────────────
    // Elle n'existait pas: `exclusion_belt` ne portait que `refused`, et un
    // modèle qui ne compose JAMAIS la boîte d'échange rendait le même compte
    // qu'un foyer où personne n'évite rien.
    const heldOffByExclusion = new Set(
      boxHeldOff.filter((h) => h.cause === "exclusion").map((h) => h.memberId),
    );
    const dishExclusionBites: string[] = [];
    for (const [memberId, terms] of mouthExclusions) {
      const bite = dishBitesExclusion({
        dish: { title, method, ingredients },
        uses,
        preparationById,
        terms,
        surface: "ingredients",
        slot,
      });
      if (bite.matched === null) continue;
      // ⟳ 2026-09-06 — enregistré AVANT la garde `declaredABox` : un plat sans
      // boîte mord quand même, et c'est justement lui que l'invariant sert à
      // tout le monde (voir `exclusionBites`).
      dishExclusionBites.push(memberId);
      if (!declaredABox) continue;
      exclusionBelt.bites++;
      if (heldOffByExclusion.has(memberId)) exclusionBelt.not_separated++;
      else exclusionBelt.separated++;
    }

    // ── C7 ② · LE SURPLUS TOMBE MAINTENANT, ET PAS AVANT ────────────────
    // Le plat a franchi TOUTES les gardes: il est écrit dans le plan. C'est le
    // seul moment où retirer un plat déjà gardé est justifié.
    if (sacrifice >= 0) {
      issues.push(
        `dishes[${i}]: over the ${cap}-dish cap for ${args.scope} -- kept, and the ` +
          `surplus dish ${JSON.stringify(dishes[sacrifice].title)} ` +
          `(${keptCells[sacrifice] ?? "no slot"}) was dropped instead`,
      );
      dishes.splice(sacrifice, 1);
      keptCells.splice(sacrifice, 1);
      keptRanks.splice(sacrifice, 1);
      keptRawIndex.splice(sacrifice, 1);
      keptSameDayFaults.splice(sacrifice, 1);
      keptOwnerFacts.splice(sacrifice, 1);
      // L7 ③ — LE SEPTIÈME TABLEAU SUIT LE MÊME `splice`, sans quoi le refus
      // d'un plat évincé resterait dans un compteur dont le dénominateur ne le
      // compte plus.
      keptNameFacts.splice(sacrifice, 1);
      keptBoxHeldOff.splice(sacrifice, 1);
    }

    // ══════════════════════════════════════════════════════════════════════
    // LOT C — À QUI CE PLAT EST DÉDIÉ, POSÉ À LA CRÉATION
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ DEUX PORTES, ET LES DEUX COMPTENT.
    //
    //   ① LA CONSIGNE DOIT AVOIR RÉCLAMÉ UN PLAT DÉDIÉ (`secondDishAsked`). Au
    //      barreau ① le prompt dit « Do NOT propose separate dishes »: un
    //      `for_member_id` qui arriverait quand même attribuerait le plat de la
    //      TABLE à une personne, et la vue par personne le retirerait alors à
    //      tous les autres. C'est un faux plus cher que l'absence.
    //   ② L'ID DOIT ÊTRE DANS LA LISTE FERMÉE (`dishBearerIds`) — les bouches à
    //      qui la consigne promet vraiment un plat. Le patron est celui de
    //      `preparation_id` juste au-dessus: inventé par le modèle, vérifié
    //      contre une liste, JETÉ et compté quand il n'y est pas.
    //
    // ⛔ AUCUNE LECTURE DE TITRE. Le seul marqueur qui existait avant ce lot
    // était « for Zoe » écrit dans le titre par le modèle, et un matcher
    // là-dessus attribuerait de travers dès « Chicken for Zoe and Marc » — et
    // rien du tout dès que le plan sort en français.
    //
    // ⚠️ UN `for_member_id` REFUSÉ NE REJETTE PAS LE PLAT — TANT QUE LE PLAT
    // PEUT ENCORE ÊTRE LE PLAT DE LA TABLE DE SA CASE. L'attribution est une
    // lecture EN PLUS; un plat sans elle reste un plat qui se cuisine et se
    // mange. Même posture que `honours_belief_keys`: informatif, donc jeté et
    // compté.
    //
    // ⛔ LA SEULE EXCEPTION, ET ELLE EST MESURÉE (2026-09-14). Quand la case
    // porte DÉJÀ le plat de la table, garder ce plat-ci en ferait un SECOND
    // plat de table: chaque bouche de la case serait nommée sur deux
    // couvercles, `meals_delivered` rendrait `double`, et la porte finale
    // refuserait le PLAN ENTIER. Ce plat-là tombe donc, ~900 lignes plus haut
    // (avant le plafond, pour ne pas avoir évincé un vrai repas au passage), il
    // est nommé dans `issues` et compté dans `dish_owner_counts.refused_dropped`.
    // La phrase d'origine — « jamais une raison de retirer un dîner à
    // quelqu'un » — reste vraie et c'est même ce qui l'impose: le geste retire
    // un doublon, la case garde son plat, et chaque bouche y mange une fois.
    //
    // ⚠️ LOT 3C — LES DEUX FAITS SE COMPTENT SÉPARÉMENT, ET C'EST LE POINT.
    // « Le modèle n'a rien écrit » et « le modèle a écrit un id qu'on a refusé »
    // rendaient tous deux `attributed: 0`, et ils appellent des corrections
    // opposées. Voir `dish_owner_counts`.
    //
    // ⚠️ LOT B ③ — `declaredFor` ET `ownerOf` SONT LUS PLUS HAUT, PAS ICI, et
    // c'est une contrainte d'ORDRE: le rang de sacrifice a besoin de savoir à
    // qui ce plat est promis AVANT de choisir qui évincer. Les DEUX PORTES
    // ci-dessus sont exactement celles qui composent `ownerOf` — une seule
    // écriture, jamais deux, sans quoi le rang et l'attribution finiraient par
    // ne plus parler du même plat. Ce qui reste ici, ce sont les REFUS NOMMÉS,
    // et ils restent ici pour que le plan d'un plat tombé plus haut ne gagne
    // aucune `issue` neuve.
    const memberId: string | null = ownerOf;
    const ownerDeclared = declaredFor !== "";
    // ⚠️ `ownerRefusedHere` EST LU, PAS RECALCULÉ. Le plat dont l'attribution
    // refusée aurait fait un second plat de table est déjà tombé plus haut: ce
    // qui arrive ici est le refus qui laisse le plat devenir le plat de table
    // de sa case, et une seconde écriture de la même condition finirait par
    // s'écarter de la première.
    let ownerRefused = false;
    if (ownerRefusedHere) {
      ownerRefused = true;
      issues.push(
        !secondDishAsked
          ? `dishes[${i}]: for_member_id on a shared dish (no dedicated dish was ` +
            `asked), dropped`
          : `dishes[${i}]: for_member_id ${JSON.stringify(declaredFor)} is not a ` +
            `mouth that gets its own dish, dropped`,
      );
    }

    // ══════════════════════════════════════════════════════════════════════
    // LOT 2 — CE QU'ON FAIT LE JOUR MÊME, DÉCLARÉ ET VALIDÉ FERMÉ
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE PATRON EST CELUI DE `for_member_id` JUSTE AU-DESSUS, ET IL N'EST PAS
    // NÉGOCIABLE ICI: le jeton est INVENTÉ par le modèle, vérifié contre
    // `SAME_DAY_KINDS`, JETÉ et COMPTÉ quand il n'y est pas. Aucune lecture de
    // `method` n'intervient — le seul marqueur qui existait avant ce lot était la
    // prose (« reheat a portion »), et un matcher là-dessus se tromperait sur
    // « do not reheat », sur « assemble the reheated chicken », et sur la
    // totalité des plans rendus en français. « Jamais de matcher maison »,
    // douzième fois.
    //
    // ⚠️ UN `same_day` REFUSÉ NE REJETTE JAMAIS LE PLAT. Posture
    // `for_member_id` / `honours_belief_keys`: le commentaire du jour est une
    // lecture EN PLUS, et retirer un dîner à quelqu'un parce qu'un modèle a
    // écrit « warm_up » au lieu de « reheat_only » serait payer un champ
    // informatif au prix d'un repas.
    let sameDay: DishSameDay | null = null;
    let sameDayInvalid = false;
    let sameDayMinutesMissing = false;
    const rawSameDay = d.same_day;
    if (rawSameDay !== null && rawSameDay !== undefined) {
      const sd = (typeof rawSameDay === "object" ? rawSameDay : {}) as Record<
        string,
        unknown
      >;
      const kindRaw = cleanText(sd.kind).toLowerCase();
      if (!(SAME_DAY_KINDS as readonly string[]).includes(kindRaw)) {
        sameDayInvalid = true;
        issues.push(
          `dishes[${i}]: same_day.kind ${JSON.stringify(kindRaw)} is not one of ` +
            `${SAME_DAY_KINDS.join("/")}, dropped`,
        );
      } else {
        // LES MINUTES SONT LUES À PART, ET LEUR ABSENCE NE COÛTE PAS LE JETON.
        // Le geste (« à réchauffer ») est ce qui manquait au produit; la durée
        // est ce qui le rend décidable. Perdre le premier parce que le second
        // est illisible échangerait la moitié qui compte contre la moitié qui
        // aide. `null`, JAMAIS zéro: « 0 min » se lit « c'est instantané ».
        const minutesRaw = Number(sd.minutes);
        let minutes: number | null = null;
        if (Number.isFinite(minutesRaw) && minutesRaw >= 0) {
          minutes = Math.min(SAME_DAY_MAX_MINUTES, Math.round(minutesRaw));
          if (minutes !== Math.round(minutesRaw)) {
            issues.push(
              `dishes[${i}]: same_day.minutes ${Math.round(minutesRaw)} is over the ` +
                `${SAME_DAY_MAX_MINUTES}-minute ceiling for a day-of gesture -- capped`,
            );
          }
        } else {
          sameDayMinutesMissing = true;
          issues.push(
            `dishes[${i}]: same_day.kind is ${kindRaw} but its minutes are not a ` +
              `usable number -- the gesture is kept, the duration is not invented`,
          );
        }
        sameDay = { kind: kindRaw as SameDayKind, minutes };

        // ── LA COHÉRENCE DOUCE: COMPTÉE, NOMMÉE, JAMAIS REJETÉE ───────────
        // Trois contradictions que la donnée porte déjà et que personne ne
        // lisait: un plat qui dit « juste réchauffer » sans rien à réchauffer,
        // un plat qui dit « rien à préparer » en puisant dans un lot, et un
        // plat qui dit « rien à préparer » en annonçant une durée. Aucune ne
        // rend le plan inexécutable — on ne peut pas savoir laquelle des deux
        // moitiés a tort — donc c'est un CONSTAT, du même rang que
        // `protein_anchor_missing`.
        if (sameDay.kind === "reheat_only" && uses.length === 0) {
          issues.push(
            `dishes[${i}]: same_day says reheat_only but the dish uses no ` +
              `preparation -- nothing to reheat`,
          );
        }
        if (sameDay.kind === "none" && uses.length > 0) {
          issues.push(
            `dishes[${i}]: same_day says none but the dish draws on ` +
              `${uses.length} preparation(s) -- at least the box comes out`,
          );
        }
        // ⚠️ MESURÉ EN RUN RÉEL LE 2026-08-17, ET C'EST POURQUOI CE TROISIÈME
        // CONSTAT EXISTE. Sur un plan foyer de 24 plats, DEUX portaient
        // `{kind: "none", minutes: 5}` — « Apple and peanut butter »,
        // « Hummus and carrot sticks ». L'écran compose alors le libellé du
        // jeton avec la durée et rend « Rien à préparer — 5 min », qui se
        // contredit dans la même ligne. Le modèle lit `none` comme « rien à
        // CUIRE » là où le prompt dit « rien à FAIRE »; le geste réel de ces
        // deux plats est `assemble`.
        //
        // Compté, jamais rejeté, pour la raison des deux constats du dessus: on
        // ne sait pas laquelle des deux moitiés a tort — la durée peut être
        // juste et le jeton faux. C'est le prompt qu'il faudra resserrer, et ce
        // constat est ce qui rendra le resserrage mesurable.
        if (sameDay.kind === "none" && sameDay.minutes !== null && sameDay.minutes > 0) {
          issues.push(
            `dishes[${i}]: same_day says none but announces ` +
              `${sameDay.minutes} minute(s) -- nothing to prepare cannot take time`,
          );
        }
      }
    }

    dishes.push({
      // L7 ③ — LE NOM D'ABORD, COMME DANS LE SCHÉMA. `null` quand le modèle
      // n'en a pas rendu d'utilisable: l'écran affiche alors le `title`.
      name,
      title,
      slot,
      day,
      ingredients,
      method,
      // FF-061: la phrase EFFACÉE quand elle culpabilise, jamais la brute.
      why: safeWhy,
      // ⟳ 2026-09-10 — LA VÉRIFICATION QUE LE MODÈLE DIT AVOIR FAITE.
      // ⛔ LU, JAMAIS CRU. Rien ne décide sur ce nombre: le moteur pèse le plat
      // comme avant. Il sert à comparer ce qu'il DIT avoir calculé à ce qu'on
      // MESURE — et donc à savoir s'il calcule mal ou s'il vise mal.
      // ⚠️ Une valeur absurde ne vaut pas mieux qu'une absence: au-delà de
      // 900 kcal/100 g on est au-dessus de l'huile pure (884), donc ce n'est
      // pas une densité de plat. On rend `null` plutôt que de journaliser un
      // écart calculé contre un nombre qui ne veut rien dire.
      densityCheck: (() => {
        // ⛔ `d`, LE PLAT BRUT — PAS `raw`. Mesuré le 2026-09-10: écrit
        // `raw.density_check`, le champ ressortait `null` sur 16 plats sur 16,
        // et j'ai cru que le modèle ignorait la consigne. `raw` désigne autre
        // chose dans cette portée; le plat rendu par le modèle est `d`. Un
        // champ neuf lu sur le mauvais objet ressemble EXACTEMENT à un modèle
        // qui n'obéit pas — et c'est le genre de conclusion qui fait durcir un
        // prompt pour rien.
        const brut = Number((d as Record<string, unknown>).density_check);
        if (!Number.isFinite(brut) || brut <= 0 || brut > 900) return null;
        return Math.round(brut * 10) / 10;
      })(),
      honours_belief_keys: honours,
      uses,
      // LES CONTENANTS DU REPAS, POSÉS À LA CRÉATION comme `memberId` et
      // `sameDay`.
      boxes,
      // ÉCHANGE — ce que la ceinture a retiré des couvercles de CE plat, posé
      // à la création comme le reste. Interne: `mealDishesPayload` ne le
      // recopie pas, la base n'en voit rien.
      heldOff: boxHeldOff,
      regimeBites: dishRegimeBites,
      exclusionBites: dishExclusionBites,
      memberId,
      sameDay,
      // ⟳ LOT D — la structure de cuisson du FRAIS de ce plat, transportée
      // telle quelle. `d` est le plat rendu par le modèle; `readComponents`
      // ne valide rien, `bodiesOfUnit` décide.
      components: readComponents(d as Record<string, unknown>),
    });
    keptSameDayFaults.push({
      invalid: sameDayInvalid,
      minutesMissing: sameDayMinutesMissing,
    });
    keptOwnerFacts.push({ declared: ownerDeclared, refused: ownerRefused });
    keptNameFacts.push({ declared: nameDeclared, refused: nameRefused });
    keptBoxHeldOff.push(boxHeldOff);
    keptCells.push(cell);
    keptRanks.push(rank);
    keptRawIndex.push(i);
  }

  // ── LA LISTE DE COURSES ─────────────────────────────────────────────────
  const shopping: ShoppingItem[] = [];
  const seenShopping = new Set<string>();
  for (const [i, rawItem] of (Array.isArray(root.shopping_list) ? root.shopping_list : []).entries()) {
    const s = (rawItem && typeof rawItem === "object" ? rawItem : {}) as Record<string, unknown>;
    const term = cleanText(s.term);
    if (!term) {
      issues.push(`shopping_list[${i}]: empty term, dropped`);
      continue;
    }
    const quantity = cleanText(s.quantity) || null;
    if (quantity && ENERGY_UNIT_RE.test(quantity)) {
      if (!rejectedNumeric.includes("energy_unit_in_quantity")) {
        rejectedNumeric.push("energy_unit_in_quantity");
      }
      issues.push(`shopping_list[${i}]: a shopping quantity is never in calories -- dropped`);
      continue;
    }

    // ── GARANTIE 3 : RAYON DANS LE VOCABULAIRE FERMÉ ───────────────────
    const aisleRaw = cleanText(s.aisle).toLowerCase();
    let aisle: ShoppingAisle;
    if ((SHOPPING_AISLES as readonly string[]).includes(aisleRaw)) {
      aisle = aisleRaw as ShoppingAisle;
    } else {
      // Dégradé vers `other` plutôt que rejeté: perdre un ingrédient parce que
      // le modèle a écrit « vegetables » au lieu de « produce » enverrait
      // l'élève au supermarché avec une liste incomplète. Le rayon est du
      // confort de rangement, pas une garantie de sécurité — la dégradation
      // est donc le bon arbitrage, et elle est COMPTÉE.
      if (aisleRaw && !rejectedAisles.includes(aisleRaw)) rejectedAisles.push(aisleRaw);
      if (aisleRaw) issues.push(`shopping_list[${i}]: unknown aisle ${JSON.stringify(aisleRaw)}, filed under other`);
      aisle = "other";
    }

    // Dédup sur le terme normalisé: deux plats qui utilisent des oignons ne
    // doivent pas produire deux lignes « oignons ».
    const dedup = normalizePantryTerm(term);
    if (seenShopping.has(dedup)) {
      issues.push(`shopping_list[${i}]: duplicate ${JSON.stringify(term)}, kept the first`);
      continue;
    }
    seenShopping.add(dedup);
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-12 · C3 — L'IDENTITÉ ET LA QUANTITÉ, RÉSOLUES UNE FOIS ICI
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ UNE SEULE RÉSOLUTION, ET C'EST CELLE DU LOT A. `resolveCompositionLine`
    // décide: l'identifiant du modèle d'abord, le libellé ensuite, rien du tout
    // quand l'identifiant a été refusé. Le GROUPE sort de la même référence
    // (point 6 de C3), donc il ne peut plus diverger de l'identité.
    //
    // ⚠️ LA QUANTITÉ STRUCTURÉE EST LUE DE LA PROSE, PAR LE LECTEUR EXISTANT.
    // `readQuantityFromProse` ne lit AUCUN mot: un nombre suivi de `g`, `ml`,
    // ou un nombre nu, ancré des deux bouts. C'est un TRANSPORT, pas une
    // interprétation — et la vraie quantité, celle du plan final arrondi, est
    // recalculée par la lane (`rebuildShoppingQuantities`) avant l'écriture.
    const lineRef = resolveCompositionLine(args.composition ?? null, { term, ref: null });
    const prose = readQuantityFromProse(quantity);
    shopping.push({
      term,
      quantity,
      aisle,
      food_group: lineRef.ref?.foodGroupRef ?? null,
      ref: lineRef.ref?.slug ?? null,
      amount: prose?.amount ?? null,
      // ⚠️ `unit` DE LA PROSE VAUT `"unit"` POUR UN NOMBRE NU — c'est le
      // vocabulaire fermé de `readQuantityFromProse`, pas une invention.
      unit: prose?.unit ?? null,
      // ⛔ `raw` EST UNE AFFIRMATION DU PANIER: 500 g de riz au magasin sont
      // 500 g CRUS. `null` quand il n'y a aucune quantité à qualifier.
      state: prose === null ? null : "raw",
      purchasable: lineRef.ref === null || !NON_PURCHASABLE_SLUGS.has(lineRef.ref.slug),
    });
  }

  // ── C7 ③ · ON N'ACHÈTE PAS POUR UN PLAT QUI N'EST PAS AU PLAN ──────────
  //
  // ⚠️ MESURÉ LE 2026-08-12 SUR TROIS FUSIONS RÉELLES. Le plafond et le rejet
  // de cible chiffrée jettent des plats; la liste de courses, parsée plus bas,
  // n'en savait rien. Run 1: CINQ lignes orphelines (`kidney beans`, `pork
  // mince`, `bok choy`, `sesame oil`, `soy sauce`) — exactement les ingrédients
  // des deux plats tombés. Run 3: TROIS. Le foyer paie et jette.
  //
  // ── LE RATTACHEMENT, ET POURQUOI IL EST EXACT ET PAS TOLÉRANT ──────────
  // ⚠️ JAMAIS DE MATCHER MAISON SUR DU TEXTE ALIMENTAIRE. « laitue » contient
  // « lait », et `isInPantry` — qui accepte justement l'inclusion — dirait donc
  // qu'une ligne « lait » couvre une « laitue ». Ici, une correspondance fausse
  // RETIRE une ligne de courses: quelqu'un part au magasin sans ce qu'il lui
  // faut. Le seul rattachement utilisé est donc l'ÉGALITÉ normalisée
  // (`normalizePantryTerm`), c'est-à-dire exactement la jointure que ce fichier
  // fait déjà deux fois — le dédoublonnage de la liste juste au-dessus, et la
  // reprise du rayon en mode `from_pantry` juste en dessous.
  //
  // ── TROIS SORTS, ET LE DOUTE NE RETIRE RIEN ───────────────────────────
  //   · la ligne est réclamée par un plat GARDÉ (ou une préparation gardée)
  //     ⇒ elle reste, même si un plat tombé la citait aussi. « Ne retire que si
  //     plus AUCUN plat gardé ne la réclame »: un oignon sert cinq plats.
  //   · la ligne est réclamée par un plat TOMBÉ et par personne d'autre
  //     ⇒ elle part, et son terme est NOMMÉ dans les `issues`.
  //   · la ligne ne se rattache à RIEN de connu ⇒ ELLE RESTE, et elle est
  //     COMPTÉE. C'est le « je n'ai pas su rattacher » du lot: le modèle écrit
  //     « chicken breasts » dans la liste et « chicken breast » dans le plat,
  //     et deviner là-dessus coûterait un dîner.
  //
  // ── C8 ② · LE DOUTE SE COMPTE MÊME QUAND AUCUN PLAT N'EST TOMBÉ ────────
  //
  // ⚠️ MESURÉ SUR LES FUSIONS RÉELLES, DEUX FOIS. Sur les réponses brutes du
  // 2026-08-12, deux runs sur quatre portaient une ligne réclamée par AUCUN
  // plat gardé (`spring greens`, `protein pancakes`). Sur les 18 fusions
  // ARCHIVÉES en base: HUIT en portent au moins une, et TROIS d'entre elles
  // n'ont fait tomber aucun plat (`be17ae53…`, `dc5c8dd3…`, `c4f36c5f…`).
  //
  // Ces trois-là étaient MUETTES: toute la réconciliation vivait sous « un plat
  // est tombé », donc le doute n'était compté que par accident, quand un plat
  // tombait par ailleurs. Le foyer achetait pour rien, EN SILENCE.
  //
  // ⚠️ CE QUI CHANGE EST LE COMPTE, JAMAIS L'ACTION. Une ligne qu'on ne sait
  // pas rattacher RESTE — c'est l'arbitrage de C7 ③ et il ne bouge pas d'un
  // octet: une correspondance fausse retire une ligne dont un plat a besoin.
  // Le RETRAIT continue de n'exister que pour une ligne réclamée par un plat
  // TOMBÉ, donc `droppedDishTerms` vide ⇒ aucune ligne ne part, jamais.
  //
  // LE CAS QUI PASSE DEVIENT PLUS ÉTROIT, ET C'EST LE BON: un plan dont chaque
  // ligne est réclamée par un plat gardé ne porte AUCUNE `issue` de courses et
  // ne perd rien. C'était « aucun plat tombé »; c'est désormais « tout est
  // rattaché ».
  //
  // ⟳ 2026-09-12 · C3 — LES TROIS SORTS PASSENT À L'IDENTITÉ, ET LE PARSEUR
  // PARTAGE DÉSORMAIS SON CORPS AVEC LA FUSION (`sortShoppingLines`). La règle
  // ne change pas d'un octet; ce qui change est ce qu'on compare. « citrons »
  // et « citron » atteignent le même slug, donc une ligne au pluriel cesse de
  // tomber dans `unattributed` par accident — et une ligne d'un plat tombé est
  // reconnue même si le modèle l'a écrite au singulier d'un côté.
  const keptDishIndexes = new Set(keptRawIndex);
  const droppedDishIdentities = new Set<string>();
  for (const [i, entry] of rawDishes.entries()) {
    if (keptDishIndexes.has(i)) continue;
    const dropped = (entry && typeof entry === "object" ? entry : {}) as Record<
      string,
      unknown
    >;
    for (const rawIng of (Array.isArray(dropped.ingredients) ? dropped.ingredients : [])) {
      const ing = (rawIng && typeof rawIng === "object" ? rawIng : {}) as Record<
        string,
        unknown
      >;
      const term = cleanText(ing.term);
      if (!term) continue;
      droppedDishIdentities.add(
        foodIdentityOf(args.composition ?? null, {
          term,
          ref: typeof ing.ref === "string" ? ing.ref : null,
        }).identity,
      );
    }
  }
  let reconciledShopping = shopping;
  if (shopping.length > 0) {
    // ⚠️ LES PRÉPARATIONS GARDÉES COMPTENT COMME DES RÉCLAMANTES. Un plat de
    // lot ne répète pas la recette de sa préparation (le prompt système le
    // demande): ne regarder que `dish.ingredients` ferait retirer les courses
    // de toutes les cuissons par lot.
    const claimed = claimedIdentities(args.composition ?? null, [...dishes, ...preparations]);
    const sorted = sortShoppingLines({
      index: args.composition ?? null,
      lines: shopping,
      claimed,
      removed: droppedDishIdentities,
    });
    reconciledShopping = sorted.kept;
    const orphans = sorted.dropped.map((l) => l.term);
    const unattached = sorted.counts.unattributed;
    if (orphans.length > 0) {
      issues.push(
        `shopping_list: ${orphans.length} line(s) bought for a dish that is not in ` +
          `the plan -- removed (${orphans.join(", ")})`,
      );
    }
    if (unattached > 0) {
      issues.push(
        `shopping_list_unattributed: ${unattached}/${shopping.length} lines match ` +
          `no kept and no dropped ingredient -- kept, not guessed`,
      );
    }
  }

  // ── EN MODE `from_pantry`, LA LISTE EST CE QUI MANQUE ───────────────────
  // Recalculée à partir des ingrédients réellement retenus, pas reprise du
  // modèle: c'est la seule façon que « il ne te manque rien » soit vrai.
  let finalShopping = reconciledShopping;
  if (args.mode === "from_pantry") {
    const missing: ShoppingItem[] = [];
    const seenMissing = new Set<string>();
    for (const dish of dishes) {
      for (const ing of dish.ingredients) {
        if (ing.in_pantry) continue;
        // ⟳ 2026-09-12 · C3 — DÉDUP PAR IDENTITÉ: deux plats qui écrivent
        // « oignon » et « oignons » ne font plus deux lignes de courses.
        const dedup = foodIdentityOf(args.composition ?? null, ing).identity;
        if (seenMissing.has(dedup)) continue;
        seenMissing.add(dedup);
        // On garde le rayon que le modèle avait donné pour ce terme s'il en a
        // donné un; sinon `other`. LA LISTE RÉCONCILIÉE (C7 ③), pas la brute:
        // une ligne retirée parce qu'elle n'appartenait qu'à un plat tombé n'a
        // pas à revenir par la porte du rayon.
        const known = reconciledShopping.find((s) =>
          foodIdentityOf(args.composition ?? null, s).identity === dedup
        );
        const prose = readQuantityFromProse(ing.quantity ?? known?.quantity ?? null);
        missing.push({
          term: ing.term,
          quantity: ing.quantity ?? known?.quantity ?? null,
          aisle: known?.aisle ?? "other",
          // ⟳ `L0-a`, puis C3 — résolu sur la LIGNE de l'INGRÉDIENT (son
          // identifiant compris), pas recopié de la ligne connue: c'est cet
          // aliment-là qui part en courses.
          food_group: foodGroupOfLine(ing),
          ref: refForIngredient(args.composition ?? null, ing)?.slug ?? null,
          // ⚠️ LA QUANTITÉ STRUCTURÉE DE L'INGRÉDIENT GAGNE, la prose ne sert
          // que de repli — même ordre que partout ailleurs.
          amount: ing.amount ?? prose?.amount ?? null,
          unit: ing.unit ?? prose?.unit ?? null,
          state: ing.amount !== null || prose !== null ? "raw" : null,
          purchasable: !isNonPurchasableIdentity(dedup),
        });
      }
    }
    finalShopping = missing;
  }

  // ── GARANTIE 4 : LA CEINTURE DE SORTIE, SUR TOUT LE TEXTE VISIBLE ───────
  // Titres, méthode, justification, ingrédients ET liste de courses. Oublier
  // la liste laisserait passer l'allergène par la porte de derrière — c'est
  // exactement le défaut mesuré sur le plan hebdo, où la citation du coach
  // échappait au filtre numérique parce que personne ne l'avait listée comme
  // du texte visible.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // LES DEUX SURFACES QUI MANQUAIENT (2026-08-19) — LA CUISSON, ET LA PHRASE
  // LUE À TABLE.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE DÉFAUT, MESURÉ SUR UN PLAN RÉEL. La liste ci-dessus ne portait QUE
  // les plats et les courses: zéro titre de préparation, zéro `portion_note`.
  // Sur ce plan, un contact croisé DÉCLARÉ — « roast on the other half of the
  // chicken tray » — vivait dans une surface que rien ne lisait. La garantie de
  // `CONTRACT.md` est écrite comme globale; elle s'arrêtait à deux clés du
  // JSON sur quatre.
  //
  // ⚠️ LA PRÉPARATION EST DU TEXTE QUE QUELQU'UN CUISINE. On y met les TROIS
  // champs — titre, méthode, ingrédients — et pas le seul titre. Ne ceinturer
  // que le titre serait la cicatrice « garde posée sur un seul des deux
  // champs », rejouée à l'étage du dessous: la recette d'un lot ne vit QUE
  // dans la préparation (le prompt système interdit au plat de la répéter),
  // donc la méthode de préparation est le seul endroit où « l'autre moitié du
  // plateau » peut s'écrire.
  //
  // ⚠️ `member_portions` EST LU SUR LA RACINE DE **CE** JSON, pas passé par
  // l'appelant. C'est la même clé de premier niveau qu'`extractMemberPortions`
  // relit plus tard sur `mealSourceText`; la lire ici lie structurellement la
  // note au plan qu'on est en train de verrouiller, alors qu'un paramètre
  // aurait laissé l'appelant libre de passer les notes d'une AUTRE réponse —
  // le défaut du `current` périmé, déjà payé sur cette lane (18 parts
  // orphelines sur 18, après une relance d'ancre).
  //
  // ⛔ LA NÉGATION RESTE TOLÉRÉE, ET CE N'EST PAS UNE RÈGLE NEUVE. C'est le
  // piège de cette extension, et il est mesuré: `portion_note` porte
  // LÉGITIMEMENT « Ensure no sesame is present » sur l'assiette de la personne
  // allergique — c'est le BON comportement, et c'est même la seule façon
  // d'écrire une consigne de contact croisé. Le texte part dans le MÊME
  // `applyKeelOutputLocks` que les plats, donc dans le même
  // `findForbiddenMatches` avec `allowNegatedMentions` par défaut: la
  // tolérance est portée par le moteur commun (condition de désarmement n°3 de
  // la doctrine P9), pas réécrite ici. Une seconde formulation de la même
  // règle à deux fichiers d'écart est un générateur de divergence.
  const renderedPortionNotes: string[] = [];
  for (const rawPortion of (Array.isArray(root.member_portions) ? root.member_portions : [])) {
    const portion = (rawPortion && typeof rawPortion === "object" ? rawPortion : {}) as Record<
      string,
      unknown
    >;
    // Les DEUX graphies, comme `household_portions.ts` les lit: le modèle rend
    // du snake_case, mais une relecture passée par un objet TS rendrait du
    // camelCase, et une ceinture qui n'en connaîtrait qu'une serait muette la
    // moitié du temps sans le dire.
    const note = cleanText(portion.portion_note ?? portion.portionNote);
    if (note) renderedPortionNotes.push(note);
    // LES NOTES DE PART AUSSI. Une part de préparation est la phrase qui dit
    // « prends dans le plateau à poulet »: c'est exactement la surface du
    // contact croisé mesuré, une ligne plus bas que `portion_note`.
    for (const rawShare of (Array.isArray(portion.preparation_shares) ? portion.preparation_shares : [])) {
      const share = (rawShare && typeof rawShare === "object" ? rawShare : {}) as Record<
        string,
        unknown
      >;
      const shareNote = cleanText(share.note);
      if (shareNote) renderedPortionNotes.push(shareNote);
    }
  }
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-13 · LOT 1 — UN SEUL RECENSEMENT, DEUX CONTRÔLES
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE TABLEAU ÉTAIT ÉCRIT À LA MAIN ICI, ET UN AUTRE L'ÉTAIT DANS LE
  // HANDLER. Les deux listaient des champs différents, et aucun des deux ne
  // portait `cooking_sessions[].run_through` ni `dishes[].name` : « Ajouter du
  // beurre de cacahuète au riz. » dans le seul déroulé d'une session passait
  // le parseur et sortait `clean` (revue du 2026-09-12, P1 §2, reproduit).
  //
  // ⛔ LE TEXTE DU VERROU GLOBAL DESCEND DES MÊMES SURFACES QUE LA
  // LOCALISATION. Tant qu'ils étaient deux listes, l'une pouvait oublier ce que
  // l'autre lisait — sans que rien ne le dise.
  const outputSurfaces = collectOutputSurfaces({
    dishes,
    preparations,
    cookingSessions,
    portionNotes: renderedPortionNotes,
    shoppingTerms: finalShopping.map((s) => s.term),
    // ⚠️ VIDE ICI, ET CE N'EST PAS UN OUBLI: `explanation` est une clé de la
    // lane FOYER, extraite du texte source par `extractExplanation` et filtrée
    // par `gatePlanExplanation` bien après ce parseur. La ceinture FINALE du
    // handler la contrôle, sur les lignes qui partiront réellement à l'écran.
    explanationLines: [],
  });
  const rendered = outputSurfacesText(outputSurfaces);

  const lock = applyKeelOutputLocks({
    text: rendered,
    isKeelStudent: true,
    safetyConstraints: args.safetyConstraints,
    doctrine: args.doctrine,
  });
  // ── LA SECONDE CEINTURE: LE GROUPE ÉCRIT PAR LE MODÈLE ────────────────────
  //
  // Mesuré le 2026-09-05 sur un plan réel (A06-r2): Tom, `allergen_ref='egg'`,
  // `severity='medical'`, a reçu une préparation dont un ingrédient s'écrivait
  // `œufs` ET portait `group = "eggs"`. Le verrou ci-dessus lit du TEXTE; la
  // ligature lui échappait (réparée depuis dans `forbidden_matcher.ts`) et le
  // GROUPE ne lui servait à rien. Deux gardes ratent des choses différentes:
  // celle-ci ne lit aucune prose, seulement ce que le modèle a lui-même
  // déclaré, et aucune graphie ne peut plus la contourner.
  //
  // ⛔ MÊME CONSÉQUENCE QUE LE VERROU DE TEXTE, exprès: `clean` retombe à
  // `false`, ce qui vide plats et préparations plus bas. Un allergène médical
  // servi n'est pas un plan qu'on rend amputé d'une ligne, c'est un plan qu'on
  // ne rend pas. Une seconde politique ici serait une seconde doctrine.
  const allergenGroupBites = allergenGroupViolations(
    [...dishes, ...preparations],
    args.safetyConstraints ?? [],
  );
  const groupedIngredients = groupedIngredientCount([...dishes, ...preparations]);
  if (allergenGroupBites.length > 0) {
    console.error("keel.meal.allergen_group_violation", {
      violations: allergenGroupBites.length,
      // ⚠️ LE DÉNOMINATEUR, sinon « 0 morsure » ne se distingue pas de « aucun
      // ingrédient ne portait de groupe » — la ceinture serait muette et
      // ressemblerait à une ceinture propre.
      grouped_ingredients: groupedIngredients,
      groups: [...new Set(allergenGroupBites.map((v) => v.foodGroup))].join(","),
      refs: [...new Set(allergenGroupBites.map((v) => v.allergenRef))].join(","),
    });
    for (const bite of allergenGroupBites) {
      issues.push(
        `allergen_group_served: ${bite.bearer} carries ${bite.term} (${bite.foodGroup}) against ${bite.allergenRef}`,
      );
    }
  }
  const clean = (lock.reason === "clean" || lock.reason.startsWith("disarmed")) &&
    allergenGroupBites.length === 0;

  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-12 · FERMETURE LOT 2 — LA CANDIDATE NON LIVRABLE, ET OÙ ELLE MORD
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE DÉFAUT QUE CE BLOC FERME, ET IL EST DANS `RESTE-A-FAIRE.md` : le
  // verrou lit UN SEUL TEXTE — tous les plats, toutes les casseroles, toutes
  // les notes et toute la liste de courses concaténés. Quand il mord, `clean`
  // tombe et les quatre tableaux sortent VIDES. Une arachide dans le dîner de
  // samedi rend donc les SIX repas indisponibles, et rien ne dit lequel était
  // en cause. Le plan de fermeture l'exige : « localiser les violations par
  // plat, préparation, note de portion, méthode, session, courses ou autre
  // surface visible » et « une violation de texte doit être corrigée sur sa
  // surface sans faire disparaître une recette saine sans lien ».
  //
  // ⛔ CE QUI NE CHANGE PAS, ET C'EST LA MOITIÉ QUI PROTÈGE. `dishes`,
  // `preparations`, `cooking_sessions` et `shopping_list` SORTENT TOUJOURS
  // VIDES quand le verrou a mordu : aucun appelant existant ne voit une
  // candidate dangereuse, et aucun chemin de publication ne s'ouvre. Ce qui est
  // ajouté vit à côté, sous un nom qui dit ce qu'il est.
  //
  // ⚠️ ET IL NE COÛTE RIEN SUR LE CHEMIN NOMINAL : la localisation ne tourne
  // QUE lorsque le verrou a déjà mordu.
  const unsafeCandidate = clean ? null : {
    dishes,
    preparations,
    cooking_sessions: cookingSessions,
    shopping_list: finalShopping,
    violations: localizeOutputLockBites({
      surfaces: outputSurfaces,
      groupBites: allergenGroupBites,
      globalTokens: lock.tokens,
      safetyConstraints: args.safetyConstraints,
      doctrine: args.doctrine,
    }),
  };

  // ── FF-037 : L'ANCRE PROTÉIQUE DES REPAS PRINCIPAUX ─────────────────────
  // Une règle qui n'existe que dans le prompt n'est pas une garantie. Ce
  // fichier l'écrit déjà trois fois — pour le plafond de plats, les moments
  // écartés et le temps de session — et l'a payée les trois fois. La consigne
  // demande une ancre; ceci VÉRIFIE qu'elle est là.
  //
  // PASS-WITH-ISSUE. Le plat est conservé. Seul le verrou binaire de sécurité
  // vide un repas; un constat de composition n'a jamais ce pouvoir, et un
  // `empty_meal` sur un motif pareil serait un refus dont l'élève ne peut rien
  // faire (FF-037 R5).
  //
  // LES INGRÉDIENTS DE LA PRÉPARATION COMPTENT. Le prompt système demande
  // explicitement qu'un plat qui puise dans un lot NE RÉPÈTE PAS sa recette:
  // ne regarder que `dish.ingredients` ferait donc signaler tous les plats de
  // batch, c'est-à-dire précisément l'architecture qu'on a demandée.
  const proteinAnchorMissing: string[] = [];
  for (const [i, dish] of dishes.entries()) {
    if (!isMainMealSlot(dish.slot)) continue;
    const fromPreparations = dish.uses.flatMap((u) =>
      preparations.find((p) => p.id === u.preparationId)?.ingredients ?? []
    );
    if (detectProteinAnchor([...dish.ingredients, ...fromPreparations])) continue;
    proteinAnchorMissing.push(dish.title);
    issues.push(
      `dishes[${i}]: protein_source_missing -- ${dish.slot} carries no protein food`,
    );
  }

  // ── FF-038 : CE QUE LE CONTRAT DE QUANTITÉS A RENDU ─────────────────────
  // UNE SEULE issue agrégée, et pas une par ingrédient: le contrat est
  // nouveau, un modèle qui l'ignore en entier produirait quarante lignes
  // identiques qui noieraient les constats utiles (un allergène, un lot gardé
  // six jours). Le CHIFFRE est ce qu'on veut lire, pas la liste.
  if (ingredientCount > 0 && unstructuredIngredients > 0) {
    issues.push(
      `structured_quantity_missing: ${unstructuredIngredients}/${ingredientCount} ingredients`,
    );
  }
  // ══════════════════════════════════════════════════════════════════════════
  // LOT C (2026-09-11) · CE QUE LES IDENTIFIANTS DE RÉFÉRENCE ONT DONNÉ
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ DEUX `issues` ET PAS UNE, PARCE QUE CE SONT DEUX FAITS DIFFÉRENTS.
  //
  //   · `ref_absent` — le modèle n'a écrit aucun identifiant. C'est le cas
  //     NOMINAL tant que le catalogue n'est pas servi, et c'est aussi le cas
  //     ATTENDU pour un aliment hors catalogue. Il sort avec son dénominateur:
  //     sans lui, « 40 absents » ne dit pas si c'est tout le plan ou un quart.
  //   · `ref_refused` — il a écrit un identifiant faux. Celui-là est une
  //     DÉSOBÉISSANCE ou un référentiel troué, et les deux causes sont
  //     séparées (`unknown` / `not_composable`).
  //
  // ⚠️ AUCUN PLAT N'EST JETÉ POUR ÇA. Le refus porte sur la PESÉE, jamais sur
  // l'assiette: perdre un dîner parce qu'un modèle a mal recopié un slug
  // échangerait le repas contre le confort du parseur. La ligne survit, elle
  // n'est simplement pesée par personne — et ce silence-là est compté.
  //
  // ⚠️ LE DÉNOMINATEUR EST CELUI DES IDENTIFIANTS, PAS `ingredientCount`.
  // `ingredientCount` ne compte que les lignes des PLATS; `refTally` compte
  // aussi celles des préparations, où vit l'essentiel de la masse. Les diviser
  // l'un par l'autre rendrait des taux au-dessus de 100 %.
  const refLines = refTally.absent + refTally.accepted + refTally.alias +
    refTally.unknown + refTally.not_composable;
  if (refTally.absent > 0 && refLines > 0) {
    issues.push(`ref_absent: ${refTally.absent}/${refLines} ingredients`);
  }
  if (refTally.unknown > 0 || refTally.not_composable > 0) {
    issues.push(
      `ref_refused: ${refTally.unknown} unknown, ${refTally.not_composable} not_composable, ` +
        `${refTally.accepted} accepted`,
    );
  }
  // ⟳ 2026-09-24 — un autre nom connu accepté comme identifiant: compté, sans
  // quoi « le modèle cite la liste » et « on rattrape ses synonymes » se liraient pareil.
  if (refTally.alias > 0) {
    issues.push(`ref_alias: ${refTally.alias} accepted via food_composition_aliases`);
  }
  // ── LA PART DENSE, NOMMÉE ───────────────────────────────────────────────
  // Ici on NOMME, contrairement au compteur ci-dessus: la liste est courte par
  // construction (une huile, un beurre), et c'est le terme exact qu'il faut
  // pour savoir si la consigne du prompt a porté. Mesuré le 2026-08-12 sur 80
  // générations: 82 lignes d'huile d'olive sans quantité, chacune éteignant le
  // verdict de son plan.
  if (unweighedDenseTerms.length > 0) {
    issues.push(
      `energy_dense_unweighed: ${[...new Set(unweighedDenseTerms)].join(", ")}`,
    );
  }
  // ── LES TERMES SANS QUANTITÉ, NOMMÉS ET PLAFONNÉS ───────────────────────
  // ⚠️ LE PLAFOND EST DIT, JAMAIS SILENCIEUX. Une troncature muette se lit
  // « il n'y avait que douze termes », ce qui est le contraire du constat.
  if (unquantifiedTerms.length > 0) {
    const uniq = [...new Set(unquantifiedTerms)];
    const shown = uniq.slice(0, UNQUANTIFIED_TERMS_NAMED);
    const rest = uniq.length - shown.length;
    issues.push(
      `unquantified_terms: ${shown.join(", ")}${rest > 0 ? ` (+${rest} more)` : ""}`,
    );
  }
  if (args.composition === null) {
    // NOMMÉ, sinon un référentiel indisponible en boucle ressemblerait à un
    // modèle qui n'écrit pas ses quantités — deux causes opposées, une seule
    // apparence.
    issues.push("composition_index_unavailable: grams not computed");
  }


  // ── UNE SESSION QUI DÉBORDE LE TEMPS DÉCLARÉ ────────────────────────────
  // Le temps par session est une CONTRAINTE, pas une indication: c'est ce que
  // l'élève a ce soir-là. Le prompt le dit; ceci le vérifie, parce que mesuré
  // le 2026-08-06 il annonçait « about 30 minutes » et recevait une session de
  // 55. La marge de dix minutes n'est pas de la complaisance: une estimation de
  // cuisine à cinq minutes près n'existe pas, et signaler 62 contre 60 ferait
  // du bruit que personne ne lirait — ce qui finit par cacher les vrais 95.
  //
  // ⟳ 2026-09-01 — IL NE SE CONTENTE PLUS DE COMPTER. Un `issues` n'a aucun
  // lecteur côté écran: la session débordait, le fait partait en base, et la
  // personne découvrait la vraie durée devant ses casseroles. Le dépassement
  // est désormais RENDU (`session_overruns`), et `plan_rationale` en fait une
  // phrase — c'est la moitié « et il le DIT » de la décision du jour.
  //
  // ⚠️ LA LIGNE D'`issues` RESTE, ELLE NE DOUBLE PAS LA PHRASE. Elles ne
  // servent pas au même lecteur: `issues` se relit en base pour savoir si la
  // consigne mord, la phrase se lit à table. Retirer la première rendrait le
  // lot invérifiable en production.
  if (args.cookingTimeMin) {
    for (const session of cookingSessions) {
      if (session.totalMinutes === null) continue;
      if (session.totalMinutes > args.cookingTimeMin + 10) {
        sessionOverruns.push({
          day: session.day,
          minutes: session.totalMinutes,
          declared: args.cookingTimeMin,
        });
        issues.push(
          `cooking session on ${session.day} runs ${session.totalMinutes} min, ` +
          `but they said they have about ${args.cookingTimeMin}`,
        );
      }
    }
  }

  // ── UN LOT GARDÉ TROP LONGTEMPS — ⟳ LA RÈGLE A DÉMÉNAGÉ, LOT `L0-a` ─────
  //
  // ⛔ ELLE N'EST PLUS ICI, ET CE N'EST PAS UN OUBLI. Elle SIGNALAIT depuis la
  // queue de la fonction, sur le plan déjà assemblé; elle REFUSE maintenant, et
  // un refus se prononce dans la boucle des plats — sans quoi le plat aurait
  // déjà consommé le plafond et compté ses `honours_belief_keys` avant qu'on ne
  // le retire. Voir « ⟳ LOT `L0-a` · LA FENÊTRE DU CUIT » plus haut, et
  // `fridge_window.ts` pour la règle elle-même.
  //
  // ⚠️ `window` RESTE DÉFINIE ICI parce que `cookedAfterEating`, juste en
  // dessous, la lit. C'est la MÊME expression que `fridgeWindowDays` plus haut:
  // deux noms, une seule lecture, et aucune des deux ne recopie l'autre.
  const window = fridgeWindowDays;

  // ── FF-052 · UN JOUR DE BATCH SANS SESSION ───────────────────────────────
  // ON COMPTE, ON N'INVENTE PAS. C'est l'asymétrie délibérée avec `leftovers`
  // (qui, lui, RETIRE): on peut supprimer un plat qui n'aurait pas dû exister,
  // on ne peut pas inventer une session que le modèle n'a pas écrite —
  // fabriquer une préparation produirait une recette que personne n'a rédigée,
  // avec des quantités que personne n'a posées.
  //
  // Un `issues` compté est ce que ce dépôt fait des non-conformités du modèle,
  // et c'est ce qui dira, en production, si la consigne mord. Si elle ne mord
  // pas, c'est le PROMPT qu'il faut corriger, pas le parseur.
  //
  // Restreint à la FENÊTRE: réclamer une session un jour qu'on n'a pas demandé
  // de remplir produirait une issue sur chaque plan, pour toujours.
  for (const day of daysWithProperty(args.dayProperties, "batch_cook")) {
    if (args.daysToFill.length > 0 && !args.daysToFill.includes(day)) continue;
    if (preparations.some((p) => p.cookOn === day)) continue;
    issues.push(
      `${day} is a batch-cooking day -- no preparation was cooked there`,
    );
  }

  // ── UN LOT MANGÉ AVANT D'ÊTRE CUISINÉ ────────────────────────────────────
  // MESURÉ: fenêtre jeudi→dimanche, seul jour de cuisine déclaré encore
  // disponible le dimanche, et le modèle a fait puiser le déjeuner de JEUDI
  // dans un lot cuisiné le DIMANCHE. La consigne le dit maintenant; ceci le
  // VÉRIFIE, parce qu'une consigne de prompt n'est pas une garantie et que ce
  // dépôt a déjà payé plusieurs fois la différence.
  //
  // On SIGNALE, on ne réécrit pas: déplacer la session inventerait un jour de
  // cuisine que l'élève n'a pas déclaré, et retirer le plat lui prendrait un
  // repas. L'anomalie est nommée dans `issues`, qui est ce qu'on lit quand un
  // plan sort de travers.
  const orderOf = (day: string) => DAY_TOKENS.indexOf(day);
  /**
   * CETTE CUISSON TOMBE-T-ELLE APRÈS CE REPAS ?
   *
   * Les deux jours sont lus dans l'ordre de la FENÊTRE, pas du calendrier: un
   * plan jeudi→dimanche a jeudi en premier, et « lundi » y serait la semaine
   * suivante. Le repli calendaire ne sert qu'aux jetons hors fenêtre.
   *
   * ⚠️ EXTRAITE PARCE QUE DEUX RÈGLES LA POSENT MAINTENANT: « un lot mangé avant
   * d'être cuisiné » (juste en dessous) et « une boîte citée avant d'être
   * remplie » (LOT 4/C5). Deux copies de cette comparaison finiraient par
   * diverger sur la fenêtre courte, et c'est la seconde — la plus jeune — qui
   * garderait l'ancienne lecture.
   */
  const cookedAfterEating = (cookOn: string, eatDay: string): boolean => {
    const cookAt = window.indexOf(cookOn);
    const eatAt = window.indexOf(eatDay);
    return cookAt >= 0 && eatAt >= 0
      ? cookAt > eatAt
      : orderOf(cookOn) > orderOf(eatDay);
  };
  for (const dish of dishes) {
    if (!dish.day) continue;
    for (const use of dish.uses) {
      const prep = preparations.find((p) => p.id === use.preparationId);
      if (!prep?.cookOn || !dish.day) continue;
      if (cookedAfterEating(prep.cookOn, dish.day)) {
        issues.push(
          `"${dish.title}" (${dish.day}) eats from "${prep.title}", cooked on ` +
          `${prep.cookOn} -- after the meal`,
        );
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ LOT `L26-0` · UNE BOUCHE, UN CONTENANT, PAR REPAS — L'ARÊTE
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ MESURÉ LE 2026-08-22 SUR LES DIX PLANS NEUFS: `mouths_double` mord sur
  // QUATRE d'entre eux — 4 / 4 / 2 / 4, quatorze bouches servies deux fois au
  // même repas, et à chaque fois la MÊME: `fa68cbac…`, née 2011. Deux bacs, le
  // même contenu, la même casserole: 662 g pour une adolescente.
  //
  // ⛔ ET CE N'EST PAS UN DÉFAUT DE CONSIGNE. `boxSchemaBlock` se termine par
  // « And do NOT name the same person on two boxes of one meal », il sort dès
  // deux bouches et il a été SERVI. Le modèle l'a violée 14 fois sur 14. Une
  // règle qui ne vit que dans un prompt régresse sans que personne le voie.
  //
  // ⚠️ POURQUOI ICI ET PAS DANS `takeBox`. La porte ② refuse un nom deux fois
  // sur le MÊME couvercle (`seenMouths`), et rien de plus; le doublon, lui, se
  // forme à cheval sur DEUX plats de la même case — le plat de la table et le
  // plat dédié, ou les deux boîtes d'un échange mal composé. Il n'est visible qu'une fois tous les plats
  // gardés, donc après la boucle, et avant tout ce qui lit `dish.boxes`: la
  // réconciliation des grammes juste en dessous compterait sinon deux fois la
  // même part contre la même casserole.
  //
  // ⛔ LE COMPTEUR RESTE ARMÉ, ET C'EST LE POINT. `mouths_double` mesure
  // désormais ce que le MODÈLE rend, les `issues` disent ce que l'arête a
  // retiré, et `names_refused` porte l'écart. Remplacer le compteur par
  // l'arête rendrait un modèle qui régresse indiscernable d'un modèle qui
  // obéit.
  //
  // ⚠️ ON RETIRE UNE DÉCLARATION, JAMAIS UN GRAMME — posture de la porte ②bis,
  // mot pour mot. Et un couvercle qui perd son dernier nom TOMBE, comme celui
  // qui n'en avait aucun d'utilisable; il ne peut déshabiller personne, un nom
  // n'étant retiré que lorsqu'il reste ailleurs dans la même case.
  const onePerMouth = keepOneBoxPerMouth(dishes);
  if (onePerMouth.namesRemoved > 0) {
    for (const [d, dish] of dishes.entries()) dish.boxes = onePerMouth.boxesByDish[d];
    // ⚠️ LES COMPTEURS SUIVENT LA SORTIE. `names` est accumulé à la poussée du
    // couvercle; sans ces deux lignes il décrirait des noms que le plan ne
    // porte plus, et `names === (ce qu'on lit sur les bacs)` cesserait d'être
    // vérifiable de l'extérieur — le défaut exact que `box_counts` existe pour
    // ne pas avoir.
    boxNames -= onePerMouth.namesRemoved;
    boxNamesRefused += onePerMouth.namesRemoved;
    boxesRefused += onePerMouth.dropped.length;
    for (const removal of onePerMouth.removals) {
      issues.push(
        `${removal.cell}: ${JSON.stringify(removal.memberId)} was named on ` +
          `${removal.namedOn} boxes of one meal -- dropped from ` +
          `${JSON.stringify(removal.boxId)}, kept on ` +
          `${JSON.stringify(removal.keptBoxId)} (${removal.reason})`,
      );
    }
    for (const drop of onePerMouth.dropped) {
      issues.push(
        `${drop.cell}: box ${JSON.stringify(drop.boxId)} lost its last name to the ` +
          `one-box-per-mouth rule, dropped`,
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LA RÉCONCILIATION DES GRAMMES — LA PART D'UNE CASSEROLE, À TRAVERS SES REPAS
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ ELLE A CHANGÉ DE FORME AVEC L'UNITÉ, ET L'ARBITRAGE LE DEMANDE EN TOUTES
  // LETTRES. Une boîte ne pend plus à une casserole: elle porte un REPAS ENTIER,
  // toutes préparations confondues. La question « cette casserole suffit-elle ? »
  // se pose donc en SOMMANT la part de cette préparation à travers les repas qui
  // la reprennent — un `Σ boîtes de la préparation` n'a plus de sujet.
  //
  // ── COMMENT LA PART D'UNE CASSEROLE DANS UN REPAS SE CALCULE ─────────────
  // Le repas tire de N casseroles et sa boîte porte UN total. On le répartit au
  // PRORATA de ce que chaque reprise tire vraiment: `production / portions × le
  // nombre de portions reprises`, la seule grandeur du plan qui dise ce qu'une
  // reprise pèse. Un repas à une seule casserole rend le total tel quel, ce qui
  // est le cas majoritaire et le cas intuitif.
  //
  // ⛔ ET ON S'ABSTIENT DÈS QU'UN SEUL MORCEAU MANQUE. Un repas dont UNE des
  // casseroles n'est pas reconstructible ne se répartit pas: attribuer son total
  // aux autres les ferait toutes déborder, et on fabriquerait une `issue` nommée
  // sur des plans qui ont RAISON. Les préparations d'un tel repas passent en
  // `sum_unverifiable`, jamais en `sum_over`. C'est le patron des trois cas de
  // `gramsRaw`, un cran plus haut: on ne présente jamais « vérifié » ce qui est
  // « on ne sait pas ».
  //
  // ⛔ ON COMPTE ET ON NOMME, ON NE REJETTE JAMAIS. Retirer une part parce que la
  // somme dépasse choisirait à qui retirer sa portion, sur une arithmétique dont
  // ce module documente lui-même la bande d'erreur (±10-15 %). Le plan est écrit,
  // l'écart est nommé, et c'est un humain qui décide si ça doit devenir un refus.
  const produced = new Map<string, number | null>();
  for (const prep of preparations) {
    produced.set(prep.id, preparationReadyGrams(prep.ingredients, args.composition));
  }
  /** Ce que les repas en boîte tirent de chaque préparation, en grammes de prêt. */
  const drawnFromPrep = new Map<string, number>();
  /** Les préparations qu'un repas non répartissable a rendues invérifiables. */
  const unreconcilable = new Set<string>();
  /** Les préparations qu'au moins un repas en boîte reprend. */
  const boxedPreparations = new Set<string>();
  for (const dish of dishes) {
    if (dish.boxes.length === 0 || dish.uses.length === 0) continue;
    for (const use of dish.uses) boxedPreparations.add(use.preparationId);
    // ══ v4 · CHAQUE COMPOSANT NOMME SA CASSEROLE, DONC IL N'Y A PLUS DE
    //         PRORATA À FAIRE ═════════════════════════════════════════════
    //
    // ⚠️ C'EST LE SEUL ENDROIT DU LOT OÙ v4 SIMPLIFIE AU LIEU D'AJOUTER. La
    // difficulté de « un contenant par repas » était qu'un couvercle portait UN
    // total pour N casseroles, et qu'il fallait le répartir au prorata — donc
    // s'abstenir dès qu'une casserole n'était pas reconstructible. Un `item`
    // porte son `preparation_id`: l'attribution est EXACTE, et une casserole
    // illisible n'empêche plus de vérifier ses voisines.
    //
    // ⚠️ UN `item` À `preparationId: null` NE TIRE SUR AUCUNE FOURNÉE — il est
    // ajouté frais le jour même. L'attribuer à qui que ce soit ferait déborder
    // une casserole avec du pain acheté le matin.
    let legacyTotal = 0;
    for (const box of dish.boxes) {
      for (const item of box.items) {
        if (item.preparationId === null) continue;
        drawnFromPrep.set(
          item.preparationId,
          (drawnFromPrep.get(item.preparationId) ?? 0) + item.grams,
        );
      }
      legacyTotal += box.legacyTotalGrams ?? 0;
    }
    if (legacyTotal <= 0) continue;
    // ══ LE REPLI v2 · UN TOTAL POUR N CASSEROLES, RÉPARTI AU PRORATA ═════
    //
    // ⛔ ON S'ABSTIENT DÈS QU'UN SEUL MORCEAU MANQUE. Un repas dont UNE des
    // casseroles n'est pas reconstructible ne se répartit pas: attribuer son
    // total aux autres les ferait toutes déborder, et on fabriquerait une
    // `issue` nommée sur des plans qui ont RAISON.
    /** Ce que chaque reprise tire de sa casserole — le poids du prorata. */
    const weights: { preparationId: string; weight: number }[] = [];
    let unknown = false;
    for (const use of dish.uses) {
      const prep = preparationById.get(use.preparationId);
      const made = produced.get(use.preparationId) ?? null;
      if (!prep || made === null || prep.servingsMade <= 0) {
        unknown = true;
        continue;
      }
      weights.push({
        preparationId: use.preparationId,
        weight: (made / prep.servingsMade) * use.servings,
      });
    }
    const sumWeights = weights.reduce((sum, w) => sum + w.weight, 0);
    if (unknown || sumWeights <= 0) {
      for (const use of dish.uses) unreconcilable.add(use.preparationId);
      continue;
    }
    for (const w of weights) {
      drawnFromPrep.set(
        w.preparationId,
        (drawnFromPrep.get(w.preparationId) ?? 0) + legacyTotal * (w.weight / sumWeights),
      );
    }
  }
  let boxSumChecked = 0;
  let boxSumOver = 0;
  let boxSumUnverifiable = 0;
  for (const [p, prep] of preparations.entries()) {
    if (!boxedPreparations.has(prep.id)) continue;
    const made = produced.get(prep.id) ?? null;
    if (made === null || unreconcilable.has(prep.id)) {
      boxSumUnverifiable++;
      continue;
    }
    boxSumChecked++;
    const drawn = drawnFromPrep.get(prep.id) ?? 0;
    if (drawn > made * BOX_SUM_TOLERANCE_RATIO) {
      boxSumOver++;
      issues.push(
        `preparations[${p}]: the meals that take from "${prep.title}" hold ` +
          `${Math.round(drawn)} g but it makes about ${Math.round(made)} g ready -- ` +
          `the boxes cannot all be filled`,
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UNE BOUCHE A UNE PART À CE REPAS, OU ELLE N'EN A PAS
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ CE QUI EST COMPTÉ ICI N'EST PAS LA FORME D'UNE BOÎTE, C'EST L'EXÉCUTABILITÉ
  // DU JEU DE BOÎTES. Les quatre portes du dessus valident qu'une boîte est bien
  // FORMÉE — un id unique, des bouches du roster, des grammes utilisables. Aucune
  // ne valide la propriété que la consigne énonce: « chaque personne attablée est
  // dans exactement une boîte de ce repas ».
  //
  // ⚠️ C'EST LE DÉFAUT N°1 DU RUN `76be8ce3`, ET IL SE COMPTE ICI. Huit boîtes
  // sur seize n'atteignaient personne, et **toutes celles de la seconde bouche**:
  // Christèle n'aurait eu de boîte à AUCUN repas. Le compteur d'alors regardait
  // la casserole, jamais la bouche, et affichait 100 %.
  //
  // ⚠️ LA POPULATION EST LA **CASE** (jour × moment), PAS LE PLAT. Sur une case
  // dédiée il y a deux plats — celui de la table et celui d'une bouche — et deux
  // boîtes: chacun est dans UNE des deux, et lire plat par plat déclarerait
  // chacun « oublié » par l'autre. C'est la case qui est le repas.
  //
  // ⛔ ON COMPTE ET ON NOMME, ON NE REJETTE JAMAIS — posture de tout le lot.
  const boxedCells = new Map<string, { boxes: number; byMouth: Map<string, number>; heldOff: Set<string> }>();
  for (const [d, dish] of dishes.entries()) {
    if (dish.boxes.length === 0) continue;
    // ⚠️ UN PLAT SANS MOMENT VAUT POUR LA JOURNÉE, ET UN PLAT SANS JOUR POUR LA
    // FENÊTRE. Sa clé est donc ce qu'il porte, sans rien inventer: deux plats
    // sans case ne se comparent qu'entre eux.
    const key = `${dish.day ?? "any"}/${dish.slot ?? "any"}`;
    const cellState = boxedCells.get(key) ??
      { boxes: 0, byMouth: new Map<string, number>(), heldOff: new Set<string>() };
    // ⚠️ LES CONTENANTS, PAS LES PLATS — v4. Un repas en produit N, un par
    // groupe: compter les plats ferait lire « une boîte » sur une case qui en
    // porte quatre.
    cellState.boxes += dish.boxes.length;
    for (const box of dish.boxes) {
      for (const memberId of box.memberIds) {
        cellState.byMouth.set(memberId, (cellState.byMouth.get(memberId) ?? 0) + 1);
      }
    }
    for (const held of keptBoxHeldOff[d] ?? []) cellState.heldOff.add(held.memberId);
    boxedCells.set(key, cellState);
  }
  let boxMouthSlots = 0;
  let boxMouthsUnboxed = 0;
  let boxMouthsDouble = 0;
  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ UNE BOUCHE TENUE DEHORS EST UNE BOUCHE SANS BOÎTE (2026-09-04)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Ce bloc SAUTAIT les bouches que la ceinture avait retirées, et retranchait
  // même leur part du dénominateur (`mouth_slots`). L'intention était bonne: ne
  // pas accuser le modèle d'un trou que le moteur venait de creuser.
  //
  // Sa conséquence ne l'était pas. Mesuré le 2026-09-04 sur un plan vivant:
  // cinq repas où la même bouche n'avait AUCUNE boîte — quatre plats de
  // lentilles qu'elle avait demandé d'éviter — et `mouths_unboxed: 0`. Le trou
  // existait, dans l'assiette de quelqu'un, et le plan se lisait vert.
  //
  // La cause N'EXCUSE PLUS, elle S'ÉCRIT à côté du constat. Qui répare est une
  // autre question, et elle a désormais son module (`meals_delivered.ts`).
  for (const [key, cellState] of boxedCells) {
    boxMouthSlots += boxMembers.size;
    for (const memberId of boxMembers) {
      const inBoxes = cellState.byMouth.get(memberId) ?? 0;
      if (inBoxes === 1) continue;
      // ⚠️ L'IDENTIFIANT, PAS LE PRÉNOM, et c'est un choix mesuré: ce parseur ne
      // reçoit QUE des ids (`boxMemberIds`), et les prénoms vivent dans
      // l'enveloppe foyer. Les faire descendre jusqu'ici demanderait un second
      // paramètre requis et ses quarante-neuf sites de test, pour une chaîne que
      // personne ne lit à l'écran. La jointure vers `household_members.
      // display_name` se fait en SQL.
      if (inBoxes === 0) {
        boxMouthsUnboxed++;
        issues.push(
          `${key}: ${JSON.stringify(memberId)} has no box at that meal` +
            (cellState.heldOff.has(memberId)
              ? " -- held off it by their declared line"
              : ""),
        );
        continue;
      }
      boxMouthsDouble++;
      issues.push(
        `${key}: ${JSON.stringify(memberId)} is named on ${inBoxes} boxes of one ` +
          `meal -- two containers for one person`,
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ LA POPULATION QUE `mouth_slots` EXCLUT — nommée le 2026-08-23.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `mouth_slots` se prend sur les cases qui portent AU MOINS UN contenant, et
  // c'est sa définition écrite, pas un défaut: une case sans contenant n'a rien
  // à réconcilier. Mais l'exclusion, elle, ne se comptait nulle part — et
  // `boxDeliveryState` rend `served` dès que `with_box === meals`, où `meals` ne
  // compte déjà que les plats qui prélèvent sur une fournée.
  //
  // ── CE QUE ÇA A CACHÉ, MESURÉ LE 2026-08-23 SUR UN PLAN FOYER RÉEL ────────
  // Sept plats, cinq boîtés, trois bouches. Deux petits-déjeuners assemblés le
  // jour même n'avaient AUCUN contenant — ce qui est LÉGITIME (« A dish that
  // cooks from scratch on the day has no boxes ») — mais les six parts qu'ils
  // représentent (2 cases × 3 bouches) étaient hors dénominateur. Le plan
  // rendait `mouths_unboxed: 2` et `delivery: "served"`, et rien ne disait que
  // deux repas sur sept n'étaient dimensionnés pour personne.
  //
  // ⛔ CE N'EST PAS UN DÉFAUT, C'EST UNE ABSTENTION — et la règle du dépôt est
  // qu'elle se compte au lieu de se déguiser en résolution. Un lecteur qui veut
  // savoir « quelle part de la fenêtre le protocole des contenants gouverne »
  // a maintenant les deux nombres côte à côte, sans qu'aucun des deux ne change
  // de sens.
  //
  // ⚠️ AUCUNE `issue` N'EST POUSSÉE ICI. Un petit-déjeuner assemblé le matin est
  // le cas nominal, et l'annoncer comme un manque ferait exactement ce que la
  // garde du roster vient de retirer sur la lane individuelle.
  const cellsWithBox = new Set(boxedCells.keys());
  const cellsNoBox = new Set<string>();
  for (const dish of dishes) {
    const key = `${dish.day ?? "any"}/${dish.slot ?? "any"}`;
    if (!cellsWithBox.has(key)) cellsNoBox.add(key);
  }

  // ── C2 ④ · LES CASES QUE PERSONNE NE REMPLIT ────────────────────────────
  //
  // MESURÉ DEUX FOIS LE 2026-08-12: les cinq petits-déjeuners du foyer sont
  // tombés d'un coup parce qu'un plat citait « whey protein 90 g », et la seule
  // trace était la ligne du plat REJETÉ. « Ce plat est tombé » et « il n'y a
  // plus de petit-déjeuner de la semaine » ne sont pas la même information, et
  // c'est la seconde qu'on lit quand on ouvre son plan.
  //
  // ⚠️ CONSTAT, JAMAIS RÉPARATION. On ne recompose pas la case: choisir quoi y
  // mettre est une décision de produit que personne n'a prise, et l'inventer ici
  // écrirait une recette que personne n'a rédigée. Même posture, mot pour mot,
  // que « un jour de batch sans session » vingt lignes plus haut.
  //
  // GARDÉ SUR `clean`, comme les plats: quand le verrou de sortie a vidé le
  // plan entier, annoncer vingt et une cases vides serait un bruit qui
  // masquerait le seul fait utile (l'allergène).
  //
  // UNE SEULE `issue` AGRÉGÉE, et la liste STRUCTURÉE à côté: vingt et une
  // lignes noieraient les constats utiles, et un `issues.length` qui explose
  // change ce qu'un lecteur voit en premier.
  const emptySlots = clean
    ? emptySlotsIn({
      days: args.daysToFill,
      cookOnlyDay: args.cookOnlyDay,
      rhythm: args.eatingRhythm,
      dishes,
      awayDays: args.awayDays,
      fixedIntakes: args.fixedIntakes,
    })
    : [];
  if (emptySlots.length > 0) {
    issues.push(`empty_slots: ${emptySlotsLine(emptySlots)}`);
  }

  // ── LOT 2 · LE COMPTEUR DU GESTE DU JOUR J ──────────────────────────────
  //
  // Calculé ICI, une seule fois, sur les tableaux FINAUX — donc sur exactement
  // la population que le plan porte. `declared` se lit sur la sortie,
  // `invalid`/`minutes_missing` sur le tableau parallèle qui a suivi les mêmes
  // `splice`: les quatre nombres décrivent les mêmes lignes.
  //
  // GARDÉ SUR `clean`, comme les plats eux-mêmes: quand le verrou de sortie a
  // vidé le plan, annoncer « 6 plats, 5 déclarés » sur un plan qui n'a plus
  // aucun plat serait un chiffre faux sur une ligne réelle.
  const sameDayCounts = clean
    ? {
      dishes: dishes.length,
      declared: dishes.filter((d) => d.sameDay !== null).length,
      invalid: keptSameDayFaults.filter((f) => f.invalid).length,
      minutes_missing: keptSameDayFaults.filter((f) => f.minutesMissing).length,
    }
    : { dishes: 0, declared: 0, invalid: 0, minutes_missing: 0 };

  // LOT 3C — MÊME DISCIPLINE, MÊME POPULATION, MÊME GARDE `clean`. `attributed`
  // se lit sur la sortie (`memberId`), `declared`/`refused` sur le tableau
  // parallèle qui a suivi les mêmes `splice`.
  const dishOwnerCounts = clean
    ? {
      dishes: dishes.length,
      declared: keptOwnerFacts.filter((f) => f.declared).length,
      attributed: dishes.filter((d) => d.memberId !== null).length,
      refused: keptOwnerFacts.filter((f) => f.refused).length,
      // ⚠️ ACCUMULÉ, PAS LU SUR LA SORTIE — et il le faut: ces plats ne sont
      // plus là. C'est la seule exception aux quatre nombres ci-dessus, et elle
      // est nommée dans le type.
      refused_dropped: ownerRefusedDropped,
    }
    : { dishes: 0, declared: 0, attributed: 0, refused: 0, refused_dropped: 0 };

  // L7 ③ — MÊME DISCIPLINE, MÊME POPULATION, MÊME GARDE `clean`. `kept` se lit
  // sur la SORTIE (`name !== null`), `declared`/`refused` sur le tableau
  // parallèle qui a suivi les mêmes `splice`: les trois décrivent les mêmes
  // lignes, et `declared === kept + refused` est vérifiable de l'extérieur.
  const nameCounts = clean
    ? {
      dishes: dishes.length,
      declared: keptNameFacts.filter((f) => f.declared).length,
      kept: dishes.filter((d) => d.name !== null).length,
      refused: keptNameFacts.filter((f) => f.refused).length,
    }
    : { dishes: 0, declared: 0, kept: 0, refused: 0 };

  // ── LA VARIÉTÉ DES ANCRES PROTÉIQUES ────────────────────────────────────
  //
  // ⚠️ SUR LES PLATS **PLIÉS**, préparations comprises. En batch cooking la
  // protéine n'est PAS dans le plat: le plat dit « une portion du poulet de
  // dimanche », et le kilo de cuisses vit dans la préparation. Compter les
  // seuls `dish.ingredients` rendrait `distinct: 0` sur un plan qui tourne
  // pourtant sur une seule ancre — c'est-à-dire le contraire de ce qu'on
  // mesure. C'est la cicatrice de `foldPreparationsIntoDishes`, à la lettre:
  // « 51 % de la protéine hors des plats ».
  //
  // ⚠️ MÊME GARDE `clean` que les deux compteurs voisins, et `composition`
  // absent rend des zéros: on ne prétend pas qu'un plan n'a pas d'ancre parce
  // qu'on n'a pas su lire.
  const proteinSourceCounts = (() => {
    if (!clean || !args.composition) {
      return { distinct: 0, dishes_with: 0, dishes: 0 };
    }
    const index = args.composition;
    const set = new Set<string>(PROTEIN_SOURCES);
    const byId = new Map(preparations.map((p) => [p.id, p]));
    const groups = new Set<string>();
    let dishesWith = 0;
    for (const dish of dishes) {
      // ⟳ LOT A (2026-09-11) — LES LIGNES, PAS LEURS LIBELLÉS. Ce compteur
      // aplatissait les ingrédients en `string[]` puis les résolvait par le
      // terme: une ancre protéique dont le libellé français n'a pas d'alias ne
      // comptait pas, alors que sa ligne portait un identifiant vérifié. Le
      // plan sortait « moins varié » qu'il ne l'est.
      const lignes: DishIngredient[] = [
        ...dish.ingredients,
        ...dish.uses.flatMap((u) => byId.get(u.preparationId)?.ingredients ?? []),
      ];
      let has = false;
      for (const ligne of lignes) {
        const ref = resolveCompositionLine(index, ligne).ref;
        if (!ref || !set.has(String(ref.foodGroupRef))) continue;
        groups.add(String(ref.foodGroupRef));
        has = true;
      }
      if (has) dishesWith++;
    }
    return {
      distinct: groups.size,
      dishes_with: dishesWith,
      dishes: dishes.length,
    };
  })();

  // ── LE COMPTEUR DES BOÎTES ──────────────────────────────────────────────
  //
  // MÊME DISCIPLINE, MÊME GARDE `clean` que les deux du dessus: quand le verrou
  // de sortie a vidé le plan, annoncer « 12 repas, 12 boîtes » sur une ligne qui
  // n'en porte plus aucune serait un chiffre faux sur une ligne réelle.
  //
  // ⚠️ `meals` SE LIT SUR LA SORTIE, PAS SUR LA DEMANDE. Le dénominateur est la
  // population des plats GARDÉS qui prélèvent sur une préparation — la seule à
  // qui la consigne promet une boîte. Un plat cuisiné de zéro n'a rien de pesé
  // d'avance, et l'inclure ferait lire un défaut sur l'état correct.
  const boxedMeals = dishes.filter((d) => d.uses.length > 0);
  // ══════════════════════════════════════════════════════════════════════════
  // COMBIEN DE CONTENANTS CE PLAN DEVAIT PRODUIRE — DÉRIVÉ SANS LE MODÈLE
  // ══════════════════════════════════════════════════════════════════════════
  //
  //     groupes(repas) = { chaque bouche à objectif, SEULE }
  //                    ∪ partition( le reste, par LIGNE que CE plat mord )
  //
  // ⛔ C'EST LE DÉNOMINATEUR DU COMPTEUR PRINCIPAL, et il ne lit RIEN de ce que
  // le modèle a rendu sur les boîtes: seulement le roster, les objectifs, les
  // lignes déclarées et les plats gardés. Sans lui, `boxes: 0` est indiscernable
  // d'un foyer où personne ne demande de pesée — c'est-à-dire qu'un lot désarmé
  // ressemble exactement à un lot qui marche.
  //
  // ⚠️ IL SURCOMPTE LA PRÉSENCE, ET C'EST DIT ICI PLUTÔT QUE CACHÉ. Le roster
  // d'un repas est le foyer ENTIER: si Christèle dîne dehors jeudi, le contenant
  // commun rétrécit mais le nombre de GROUPES ne bouge pas — sauf si elle était
  // seule de sa ligne, auquel cas l'attendu est trop haut d'une unité. La
  // présence par bouche vit dans l'enveloppe foyer et ne descend pas jusqu'ici.
  // C'est une borne HAUTE nommée, exactement comme `mouth_slots`, pas un
  // dénominateur inventé.
  //
  // ⚠️ ET IL SE CALCULE SUR LES PLATS **GARDÉS** qui prélèvent sur une
  // préparation — la même population que `meals`. Un plat évincé par le plafond
  // ne promettait plus rien.
  //
  // ⟳ LOT `L6′-a` — ⛔ ET IL SURCOMPTAIT UNE SECONDE FOIS, CELLE-LÀ RÉPARABLE:
  // il ajoutait `weighedMembers.size + lines.size` sur TOUT plat gardé, **sans
  // jamais regarder `dish.memberId`**. Un plat dédié à Anouk réclamait donc les
  // trois groupes du foyer entier, et le plat de la TABLE de la même case la
  // réclamait une seconde fois alors qu'elle n'en mange pas.
  //
  //     `3c781a71`: 24 plats boîtés = 12 dédiés + 12 de table, et les 12 de
  //     table sont dans la MÊME case qu'un dédié (12/12, mesuré en SQL).
  //     avant : 24 × (2 + 1)                                   = 72
  //     après : 12 × 1 (Anouk seule) + 12 × 2 (Malo, puis le reste) = 36
  //     rendu par le modèle                                       = 38
  //
  // ⇒ **38/72 = 52,8 %** devient **38/36 = 105,6 %**: le modèle ne « n'obéit
  // qu'à moitié », il rend PLUS de contenants que la partition n'en demande. Un
  // dénominateur faux dans le sens PESSIMISTE envoie un lot chercher un défaut
  // là où il n'y en a pas.
  //
  // ⚠️ QUI PART EST DÉCIDÉ PAR LE MODULE PUR, PAS ICI, et la partition en
  // LIGNES reste ici: c'est le seul endroit qui a `scanMealForRegime` et les
  // préparations. Le module rend des ensembles de bouches, ce fichier y
  // intersecte ses groupes.
  let boxesExpected = 0;
  /** Les bouches que chaque plat nourrit — `null` sur un plat non boîté. */
  const fedByDish = mouthsFedByDish(
    dishes.map((d): ExpectedDish => ({
      day: d.day,
      slot: d.slot,
      memberId: d.memberId,
      boxable: d.uses.length > 0,
    })),
    boxMembers,
  );
  if (boxMembers.size > 0) {
    for (const [d, dish] of dishes.entries()) {
      const fed = fedByDish.fedByDish[d];
      if (fed === null) continue;
      /** Le reste DE CE PLAT: ses mangeurs, moins les bouches à objectif. */
      const restMembers = [...fed].filter((id) => !weighedMembers.has(id));
      // ⚠️ LA PARTITION EST CELLE DE **CE PLAT**. Un végétarien et un omnivore
      // qui mangent le même dahl sont dans le MÊME bac: c'est le plat qui
      // décide, jamais l'étiquette de la personne.
      //
      // ⟳ ÉCHANGE (2026-09-04) — LE DÉGOÛT PARTITIONNE AUSSI. Un régime n'est pas
      // la seule ligne qui sépare un bac: « Marc n'aime pas les lentilles »
      // demande à Marc son propre contenant sur un plat de lentilles, exactement
      // comme un régime. Sans cette moitié, la boîte d'échange que la consigne
      // réclame arrivait EN TROP au dénominateur, et un plan correct se lisait
      // comme un modèle qui sur-produit.
      //
      // ⚠️ LA CLÉ EST LA RÈGLE, PAS LA BOUCHE. Deux personnes qui évitent la
      // même chose partagent un bac; deux personnes qui évitent des choses
      // différentes en ont deux. `because` porte le texte de la règle, donc il
      // groupe exactement comme il faut.
      //
      // ⚠️ LE RÉGIME PRIME, comme à la ceinture: elle le vérifie en premier et
      // sort avant l'exclusion. Deux clés pour une seule bouche compteraient un
      // bac fantôme.
      const lines = new Set<string>();
      for (const memberId of restMembers) {
        const regime = mouthRegimes.get(memberId);
        if (regime) {
          const breach = scanMealForRegime(
            regime,
            { title: dish.title, method: dish.method, ingredients: dish.ingredients },
            dish.uses,
            preparationById,
          );
          if (breach.matched !== null) {
            lines.add(regime);
            continue;
          }
        }
        const avoided = mouthExclusions.get(memberId);
        if (avoided) {
          const bite = dishBitesExclusion({
            dish: {
              title: dish.title,
              method: dish.method,
              ingredients: dish.ingredients,
            },
            uses: dish.uses,
            preparationById,
            terms: avoided,
            surface: "ingredients",
            // ⚠️ LE PLAT PORTE SON MOMENT ICI: on relit un plan déjà écrit.
            slot: dish.slot ?? null,
          });
          if (bite.matched !== null) {
            lines.add(`avoid:${bite.because ?? bite.matched}`);
            continue;
          }
        }
        lines.add("");
      }
      let weighedHere = 0;
      for (const memberId of weighedMembers) if (fed.has(memberId)) weighedHere++;
      boxesExpected += weighedHere + lines.size;
    }
  }
  // ══════════════════════════════════════════════════════════════════════════
  // LES CONTENANTS DUS À UNE PERSONNE SEULE — 2026-09-01
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE COMPTE EST DÉRIVABLE, DONC LE COMPTEUR EST OBLIGATOIRE. Un plat qui
  // puise dans une casserole a été pesé d'avance: il lui faut un contenant.
  // Un plat cuisiné de zéro le jour même n'en a pas. Le dénominateur est donc
  // « les plats qui puisent », et sans lui `boxes: 0` serait le même zéro pour
  // « le modèle n'a rien écrit » et pour « ce plan n'a aucun lot » — c'est le
  // zéro que ce dépôt paie en boucle.
  //
  // ⚠️ LA BRANCHE EST EXCLUSIVE DE CELLE DU DESSUS: `boxMembers.size` vaut zéro
  // sur cette lane, et `soloBoxes` est faux sur l'autre. Les additionner
  // gonflerait `expected` d'un protocole que le prompt n'a pas servi.
  if (args.soloBoxes && boxMembers.size === 0) {
    for (const dish of dishes) if (dish.uses.length > 0) boxesExpected += 1;
  }
  // ⛔ CE QUI SE NOMME AU LIEU DE SE TAIRE. Les deux cas ci-dessous ne devraient
  // pas arriver — le parseur valide déjà `for_member_id` contre la liste fermée
  // des porteurs de plat — et c'est exactement pour ça qu'ils se comptent: ils
  // signifieraient que deux listes décrivant la même table ont divergé, et
  // `expected` mentirait sans que rien ne le dise.
  //
  // ══════════════════════════════════════════════════════════════════════════
  // ⛔ LE ROSTER EST LA PORTE, ICI AUSSI — posée le 2026-08-23.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // `mouthsFedByDish` est appelée INCONDITIONNELLEMENT vingt lignes plus haut,
  // et la garde `if (boxMembers.size > 0)` se referme AVANT ces deux boucles.
  // Or la lane SOLO passe `boxMemberIds: []` exprès (`generate-meal-v1/index.ts`)
  // — le protocole des contenants n'existe que pour départager deux bouches.
  // Avec un roster vide, `mouthsFedByDish` ne trouve personne à nourrir, donc
  // CHAQUE plat de table tombe dans `sharedFedNobody`.
  //
  // Mesuré le 2026-08-23 sur sept plans solo sur sept: jusqu'à SEPT fois par
  // plan, « the table's dish feeds nobody -- every mouth has a dish of its own »
  // pour quelqu'un qui vit seul. Le message décrit une table qui n'existe pas,
  // et il noie la liste d'`issues` là où elle porte de vraies alertes.
  //
  // ⚠️ C'EST EXACTEMENT LA PORTE QUE `boxDeliveryState` A DÉJÀ, cinquante
  // lignes plus bas (`roster: boxMembers.size`, avec sa propre cicatrice écrite:
  // « Sans cette entrée, l'alarme sonnerait sur CHAQUE plan solo pour une
  // consigne jamais servie »). Elle manquait ici, et pour la même raison elle
  // manquait en silence: une issue de plus ne fait rien échouer.
  //
  // ⛔ LA GARDE PORTE SUR LE ROSTER, PAS SUR LE CONTENU. Filtrer les cellules
  // une par une masquerait le vrai cas — une table de plusieurs bouches dont
  // un plat commun ne nourrit personne — qui est précisément ce que ces deux
  // boucles existent pour dire.
  if (boxMembers.size > 0) {
    for (const cell of fedByDish.sharedFedNobody) {
      issues.push(
        `${cell}: the table's dish feeds nobody -- every mouth has a dish of its own`,
      );
    }
    for (const memberId of fedByDish.dedicatedOffRoster) {
      issues.push(
        `dedicated dish for ${JSON.stringify(memberId)}, who is not on the box ` +
          `roster -- nobody was excluded from the shared pot for it`,
      );
    }
  }
  // ══════════════════════════════════════════════════════════════════════════
  // ⟳ LOT `L6′-b` — CE QUE `boxes: 0` VEUT DIRE. DEUX ZÉROS, DEUX CAUSES.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ LA FICHE CONCLUAIT AU TIRAGE SUR DEUX PLANS. SUR DIX, ET EN LISANT LES
  // SORTIES BRUTES DU MODÈLE (`llm_raw_response_events`), LES DEUX ZÉROS DU
  // 2026-08-22 ONT DEUX CAUSES DISTINCTES, ET AUCUNE N'EST LE HASARD:
  //
  //   · `09240cb5` — la sortie brute porte `"preparations": []`. Douze plats,
  //     aucun `uses` non vide. **Aucun contenant n'était DÛ**: `boxes: 0` et
  //     `expected: 0` sont tous les deux JUSTES.
  //   · `5058be6a` — six préparations, vingt-six plats qui y prélèvent, et
  //     **zéro clé `boxes`**, alors que le modèle parle des boîtes EN TOUTES
  //     LETTRES onze fois dans ses `method` et ses `run_through`. Le parseur n'a
  //     rien refusé (`refused: 0`, `names_refused: 0`, `items_refused: 0`).
  //     ⇒ **le modèle a obéi en PROSE et sauté la clé de schéma.**
  //
  // ⛔ ET UN CHIFFRE NE PEUT PAS PORTER ÇA. `0` est aujourd'hui le même sur les
  // deux, et les deux appellent des corrections OPPOSÉES. Le nom, lui, le peut.
  // ⚠️ CE LOT NE RÉPARE PAS LE TAUX — décision de la vague D. Il rend l'absence
  // visible, et il ne touche NI un gramme, NI un couvercle, NI un nom: aucune
  // bouche ne peut être déshabillée par ici, la mineure comprise.
  const boxDelivery = boxDeliveryState({
    clean,
    // ⛔ LE ROSTER, ET IL EST LA PORTE. La lane SOLO passe `boxMemberIds: []`
    // EXPRÈS — le protocole des contenants n'existe que pour départager deux
    // bouches — et son plan en base porte `{meals: 10, with_box: 0}`. Sans
    // cette entrée, l'alarme sonnerait sur CHAQUE plan solo pour une consigne
    // jamais servie.
    // ⟳ 2026-09-01 — `1` SUR LA LANE SOLO, et c'est ce qui ARME l'alarme. Le
    // pavé ci-dessus décrivait un état révolu: la lane individuelle sert
    // désormais `SOLO_BOX_BLOCK`, donc un plan solo sans un seul contenant est
    // une consigne servie et non suivie — exactement ce que cette alarme
    // existe pour dire. La laisser à zéro l'aurait rendue muette sur la moitié
    // du produit, pour un motif qui n'était plus vrai.
    roster: args.soloBoxes && boxMembers.size === 0 ? 1 : boxMembers.size,
    meals: boxedMeals.length,
    withBox: boxedMeals.filter((d) => d.boxes.length > 0).length,
  });
  // ⟳ 2026-09-08 — CE QUE CETTE LIGNE MESURE, ET CE QU'ELLE NE MESURE PAS.
  //
  // ⛔ ELLE EST CALCULÉE DANS `parseGeneratedMeal`, donc sur LA SORTIE DU
  // MODÈLE — pas sur le plan livré. L'ancienne formulation (« NOT ONE carries
  // a box », « zero came back ») décrivait le PLAN, et c'est faux dès qu'un
  // chemin déterministe autore les contenants en aval: `applySizing`
  // (`portion_sizing.ts`, chemin `portion_v1`) fabrique les boîtes lui-même,
  // avec des ids `box_<jour>_<créneau>_<rang>`, et la lane foyer les recolle
  // dans `meal.dishes` AVANT le verrou des règles de maison.
  //
  // Mesuré le 2026-09-08, brouillon `65238bf8` (foyer d'une bouche, 1 jour):
  // cette ligne annonçait « 3 containers were owed, zero came back » pendant
  // que les QUATRE plats du plan livré portaient chacun leur boîte, grammes et
  // destinataire compris (`box_wed_lunch_2`, 700 g). Un lecteur — humain ou
  // agent — conclut « le plan est cassé » sur un plan correct.
  //
  // ⚠️ ON NE DÉSARME PAS L'ALARME, ON LA RENOMME. Le fait qu'elle porte reste
  // vrai et reste utile: la consigne `SOLO_BOX_BLOCK` a été servie au modèle,
  // et le modèle ne l'a pas suivie. C'est le signal qui dira s'il faut
  // corriger le PROMPT — précédent explicite du run `5058be6a`, où le modèle
  // avait obéi EN PROSE et sauté la clé de schéma. La taire rendrait cette
  // régression invisible.
  //
  // ⛔ CE QUI RESTE OUVERT, NOMMÉ: les compteurs `boxes` de la réponse sont
  // eux aussi figés à la lecture, donc un plan dont les boîtes sont autorées
  // en aval sort avec `with_box: 0`. Les recalculer après `applySizing`
  // demande de décider où vit la source de vérité des contenants — ce lot ne
  // le fait pas, et ne touche NI un gramme, NI un couvercle, NI un nom.
  if (boxDelivery === "none_delivered") {
    issues.push(
      `model_returned_no_box: 0/${boxesExpected} -- ${boxedMeals.length} meals ` +
        `take from a batch and the model emitted no box key; a deterministic ` +
        `sizing path may still author them downstream, so this line is about ` +
        `the MODEL's output, not about the shipped plan`,
    );
  }
  // ══════════════════════════════════════════════════════════════════════════
  // LE CONGÉLATEUR, COMPTÉ — 2026-09-01
  // ══════════════════════════════════════════════════════════════════════════
  //
  // ⛔ DEUX NOMBRES QUI NE MESURENT PAS LA MÊME CHOSE, ET AUCUN NE SORT SEUL.
  //   · `uses_kept_freezer` — la consigne MORD-ELLE ? Sans son dénominateur,
  //     « 7 parts congelées » ne veut rien dire: sur 7 c'est un plan tout au
  //     congélateur, sur 140 c'est du bruit. Le dépôt a déjà écrit deux fois
  //     qu'un compteur sans dénominateur est un compteur qui ment.
  //   · `freezer_claimed_without_one` — le modèle a-t-il inventé un appareil ?
  //     C'est une NON-CONFORMITÉ, pas une mesure d'adoption, et la confondre
  //     avec la première ferait passer une invention pour une obéissance.
  //
  // ⚠️ ILS SORTENT MÊME À ZÉRO SUR LE NUMÉRATEUR, tant qu'il y a un
  // dénominateur: `0/14` dit « le champ existe et personne ne l'écrit », ce qui
  // est le signal qui dira, en production, s'il faut corriger le PROMPT plutôt
  // que le parseur. Se taire à zéro rendrait un lot débranché indiscernable
  // d'un lot que le modèle n'utilise pas.
  if (keptTotal > 0) {
    issues.push(`uses_kept_freezer: ${keptDeclared}/${keptTotal}`);
  }
  if (freezerWithoutOne > 0) {
    issues.push(
      `freezer_claimed_without_one: ${freezerWithoutOne}/${freezerClaimLinks} ` +
        `batch links -- kept on the ${MAX_FRIDGE_DAYS}-day fridge window`,
    );
  }

  const boxCounts = clean
    ? {
      meals: boxedMeals.length,
      with_box: boxedMeals.filter((d) => d.boxes.length > 0).length,
      boxes: dishes.reduce((n, d) => n + d.boxes.length, 0),
      expected: boxesExpected,
      /** ⟳ `L6′-b` — le NOM du zéro. Voir le bloc juste au-dessus. */
      delivery: boxDelivery,
      refused: boxesRefused,
      names: boxNames,
      names_refused: boxNamesRefused,
      items: boxItems,
      /** ⟳ 2026-09-13 — la FORME par laquelle chaque composant gardé a été pesé. */
      items_in_grams: boxItemsInGrams,
      items_from_ingredient: boxItemsFromIngredientForm,
      items_refused: boxItemsRefused,
      capped: boxesCapped,
      legacy_folded: boxesLegacyFolded,
      preparations: preparations.length,
      sum_checked: boxSumChecked,
      sum_over: boxSumOver,
      sum_unverifiable: boxSumUnverifiable,
      mouth_slots: boxMouthSlots,
      mouths_unboxed: boxMouthsUnboxed,
      mouths_double: boxMouthsDouble,
      mouths_double_model: onePerMouth.mouthsFixed,
      cells_no_box: cellsNoBox.size,
      mouths_no_box_cell: cellsNoBox.size * boxMembers.size,
    }
    : {
      meals: 0,
      with_box: 0,
      boxes: 0,
      expected: 0,
      // ⚠️ `plan_emptied`, JAMAIS `no_batch_cooking`. Ici `meals` vaut zéro
      // parce que le verrou de sortie a vidé le plan, pas parce que ce foyer ne
      // cuisine rien d'avance — les confondre serait un chiffre faux sur une
      // ligne réelle, ce que la garde `clean` existe pour éviter.
      delivery: boxDelivery,
      refused: 0,
      names: 0,
      names_refused: 0,
      items: 0,
      items_in_grams: 0,
      items_from_ingredient: 0,
      items_refused: 0,
      capped: 0,
      legacy_folded: 0,
      preparations: 0,
      sum_checked: 0,
      sum_over: 0,
      sum_unverifiable: 0,
      mouth_slots: 0,
      mouths_unboxed: 0,
      mouths_double: 0,
      mouths_double_model: 0,
      cells_no_box: 0,
      mouths_no_box_cell: 0,
    };

  // ⛔ DÉTERMINISTE, LU SUR LA SORTIE FINALE. `amount` est déjà structuré depuis
  // FF-038: aucune prose n'est relue, aucun matcher n'existe ici. Et le calcul
  // se fait sur `dishes` — donc sur les plats GARDÉS, pas sur ceux que le
  // plafond a évincés en cours de boucle, ce que le compteur voisin
  // `structured_quantity_missing` ne sait pas faire.
  const dishQuantityCounts = clean
    ? {
      ingredients: dishes.reduce((n, d) => n + d.ingredients.length, 0),
      unquantified: dishes.reduce(
        (n, d) => n + d.ingredients.filter((ing) => ing.amount === null).length,
        0,
      ),
    }
    : { ingredients: 0, unquantified: 0 };

  return {
    dishes: clean ? dishes : [],
    preparations: clean ? preparations : [],
    cooking_sessions: clean ? cookingSessions : [],
    shopping_list: clean ? finalShopping : [],
    rejected_numeric: rejectedNumeric,
    rejected_aisles: rejectedAisles,
    empty_slots: emptySlots,
    session_overruns: clean ? sessionOverruns : [],
    same_day_counts: sameDayCounts,
    dish_owner_counts: dishOwnerCounts,
    name_counts: nameCounts,
    protein_sources: proteinSourceCounts,
    box_counts: boxCounts,
    // ⚠️ RENDUS HORS DE `clean`, ET C'EST DÉLIBÉRÉ — contrairement à
    // `box_counts`. Quand le verrou de sortie a vidé le plan, `boxes: 0` est
    // juste (il n'y a plus de boîte à compter). Mais « la ceinture de régime
    // n'a rien retiré » serait alors un MENSONGE sur ce qui s'est passé: elle a
    // bel et bien lu et retiré, et c'est ce qu'on veut savoir en relisant un
    // plan vide. Un compteur qui se tait quand la sortie est sale est un
    // compteur muet précisément le jour où on le consulte.
    fridge_window: fridgeWindow,
    regime_belt: regimeBelt,
    // ⛔ RENDU, PAS SEULEMENT COMPTÉ. Une ceinture dont les nombres ne sortent
    // pas du parseur est indiscernable d'une ceinture absente — et celle-ci
    // existe précisément parce qu'une exclusion inerte ressemblait trait pour
    // trait à une exclusion honorée.
    exclusion_belt: exclusionBelt,
    regime_refusals: [...regimeRefusedByPreparation.entries()].map((
      [preparation_id, ids],
    ) => ({ preparation_id, member_ids: [...ids] })),
    unquantified_dish_ingredients: dishQuantityCounts,
    // Gardé sur `clean` comme les plats eux-mêmes: relancer pour une ancre
    // quand la semaine entière vient d'être vidée par un allergène ferait
    // réparer la mauvaise chose, et à la deuxième sortie sale on aurait dépensé
    // deux générations pour rien.
    protein_anchor_missing: clean ? proteinAnchorMissing : [],
    /**
     * ⛔ INTERNE, JAMAIS PUBLIÉ. `null` quand la sortie est propre. Non nul, il
     * porte le plan que le verrou vient de vider ET l'endroit exact où il a
     * mordu — pour qu'une réparation puisse viser CETTE unité au lieu de
     * refaire les six repas. Ce n'est ni un aperçu, ni un plan activable: les
     * quatre tableaux publics restent vides.
     */
    unsafe_candidate: unsafeCandidate,
    issues,
    lock,
  };
}
