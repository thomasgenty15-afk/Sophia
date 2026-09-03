/// <reference path="../tsserver-shims.d.ts" />
import { memoFrom, memoLinesForPrompt } from "../_shared/keel/memo.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError, readableErrorMessage } from "../_shared/error-log.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import {
  keelGenerationModel,
  PLAN_HTTP_TIMEOUT_MS,
  PLAN_REASONING_EFFORT,
} from "../_shared/keel/generation_model.ts";
import {
  doctrineBeliefsFor,
  doctrineBlockFor,
} from "../_shared/keel/doctrine_loader.ts";
// LOT C ① — LA PORTE DU FOYER, ET SON PARAMÈTRE EST REQUIS. Voir
// `loadHouseholdDoctrine`: l'option est facultative sur le chargeur générique
// pour que les lanes sans table gardent le comportement d'avant; ici l'oubli
// doit casser à la compilation.
import { loadHouseholdDoctrine } from "../_shared/keel/household_doctrine.ts";
import { coachNotePromptBlock, loadCoachNote } from "../_shared/keel/coach_note.ts";
import { loadPublishedProtocol, protocolBlockFor } from "../_shared/keel/protocol_loader.ts";
import {
  loadStudentSafetyConstraints,
  type StudentSafetyConstraint,
} from "../_shared/keel/safety_constraints.ts";
// ══ LOT C · LES VOIX NE PORTENT PLUS QUE DU STRUCTURÉ ═══════════════════════
//
// ⛔ `household_voices_io.ts` A ÉTÉ SUPPRIMÉ, ET CE N'EST PAS UN NETTOYAGE. Ce
// module existait pour UNE chose: lire la colonne `food_preferences` — le
// magasin PLAT — de chaque titulaire à table, et la réconcilier contre
// `memory_items` avant de la donner au modèle. Le magasin plat est fermé
// (nomenclature §2.1, §2.6): il n'a plus d'écrivain, donc plus rien à lire.
//
// ⚠️ CE QUI RESTE, ET C'EST L'ESSENTIEL: le bloc des voix existe toujours, et
// il porte les items STRUCTURÉS du composeur — `food.exclude`, `method.avoid`,
// avec leur `kind`, leur sujet et leur date. Le plafond par membre et la garde
// de non-divulgation vivent toujours dans `buildHouseholdVoices`, et rien ne
// les contourne: ce lot retire une SOURCE, jamais une garde.
import type { RawMemberVoice } from "../_shared/keel/household_voices.ts";
// ══ LOT 1C · LA LECTURE DES ÉLÉMENTS RETENUS ════════════════════════════════
// `readRetainedItems` et PAS `retainedItemsFrom`: même magasin, même lecture,
// mais l'enrobage rend en plus le compteur des lignes REFUSÉES — sans lui,
// « rien en base » et « rien de lisible » se ressemblent dans la trace.
import { readRetainedItems } from "../_shared/keel/food_preference_promotion.ts";
import {
  HOUSEHOLD_SUBJECT,
  memberSubject,
  type RetainedItem,
} from "../_shared/keel/retained_item.ts";
import { nextPlanItemsFor } from "../_shared/keel/retained_next_plan.ts";
import {
  compositionLinesFor,
  cravingLinesFor,
  logisticsOverlayFor,
  portionAdjustsFor,
  rhythmOverlayFor,
  routeRetainedItems,
  routingTrace,
} from "../_shared/keel/retained_items_routing.ts";
import {
  dayTokenInZone,
  localDateInZone,
  localMinuteInZone,
} from "../_shared/keel/local_date.ts";
// L'HEURE QU'IL EST, ET CE QU'ELLE INTERDIT. Les trois coupures y sont des
// CONSTANTES NOMMÉES; aucune n'est recopiée ici.
import {
  firstWindowDayIsCookable,
  leadDayFor,
  proposedWindowStart,
  rhythmClockFrom,
  slotsPassedToday,
} from "../_shared/keel/plan_hours.ts";
// POURQUOI CES JOURS-LÀ — déterministe, assemblé par le serveur, jamais
// demandé au modèle.
import { explainPlanChoices } from "../_shared/keel/plan_rationale.ts";
import { explainPlanTradeoffs } from "../_shared/keel/plan_tradeoffs.ts";
// FF-061 — CE QUI A ÉTÉ FAIT DE CE QUI AVAIT ÉTÉ DEMANDÉ. Les quatre portes
// vivent DANS le module.
import { reportOnRequest } from "../_shared/keel/request_report.ts";
import { gateRequestReport } from "../_shared/keel/request_report_gate.ts";
import { type ForbiddenTerm } from "../_shared/keel/forbidden_matcher.ts";
// LA PHRASE ÉCRITE SUR UN BROUILLON — gardée À L'ENTRÉE, parce qu'elle part au
// modèle dans le même message que la doctrine et les règles de maison.
import {
  type DraftNoteVerdict,
  draftNoteInstruction,
  hasDraftNote,
  readDraftNote,
} from "../_shared/keel/plan_draft_note.ts";
// LOT 2D — LE RETOUR SUR LE BROUILLON, RANGÉ. Le module (lot 2B) était livré,
// testé et SANS AUCUN APPELANT: c'est le mode d'échec n°1 de ce dépôt, et
// `draft_note_classify_wiring_test.ts` épingle désormais cet appel-ci.
//
// ⛔ IL PREND LE VERDICT, PAS LE TEXTE. `body.draft_note` brut rouvrirait dans
// un SECOND appel modèle le trou que `readDraftNote` ferme (cible chiffrée,
// interdit de doctrine, plancher TCA). Le type l'interdit; ne pas le contourner.
import { classifyAndPersistDraftNote } from "../_shared/keel/draft_note_classify_io.ts";
import { foodTermsOf } from "../_shared/keel/plan_feedback_chat.ts";
import {
  countHungerDays,
  type HungerWindowSignal,
  hungerSignalProvenance,
  satietyUserSuffix,
} from "../_shared/keel/hunger_signal.ts";
import { loadHungerDays } from "../_shared/keel/hunger_signal_io.ts";
import {
  firstBlockingPlan,
  type PlanTiming,
  planTimingOf,
  type MealWindowRequest,
  dayTokenOf,
  resolveRequestedWindow,
  withCookDayBefore,
  windowDayOrder,
  windowStartsBeyondDayTokens,
} from "../_shared/keel/meal_plan_window.ts";
import {
  addedCookDays,
  MAX_FRIDGE_DAYS,
  buildMealPrompt,
  DEFAULT_EATING_RHYTHM,
  type EatingOccasion,
  EATING_OCCASIONS,
  type EatingOccasionSlot,
  emptySlotsIn,
  emptySlotsLine,
  MEAL_PROMPT_VERSION,
  type MealScope,
  type GeneratedMeal,
  mealDishesPayload,
  mealPreparationsPayload,
  mealSessionsPayload,
  mealShoppingPayload,
  MEAL_TOKEN_FIELDS,
  MEAL_TRANSLATABLE_FIELDS,
  type MergedEater,
  parseEatingRhythm,
  parseGeneratedMeal,
  regramMeal,
  usableBudget,
  // L8 — CE QUE LA CASSEROLE PRODUIT VRAIMENT, et la tolerance de somme du
  // parseur. Les DEUX sont importees plutot que recopiees: le redimensionnement
  // des boites doit comparer a la MEME production et avec la MEME bande
  // d'incertitude que la verification de somme du parseur, sinon l'un accepte ce
  // que l'autre refuse sur le meme plan.
  BOX_SUM_TOLERANCE_RATIO,
  preparationReadyGrams,
  usableCookDays,
} from "../_shared/keel/meal_generation.ts";
// ⟳ LOT `L0-a` — les deux nombres de la fenêtre CRUE, sur la liste de courses.
import { rawWindowCounts } from "../_shared/keel/grocery_waves.ts";
import {
  appendContentLanguageBlock,
  resolveArtifactLocale,
} from "../_shared/keel/locale.ts";
import {
  type MemberAway,
  memberMealCells,
  parseMemberAway,
  parseWorkLunch,
  resolveWindowPresence,
} from "../_shared/keel/household_presence.ts";
import {
  type MemberOwnPlan,
  parseOwnPlans,
  plansOverlap,
  resolveHandOff,
} from "../_shared/keel/household_hand.ts";
import {
  bestMergePair,
  buildUnmergeBlock,
  MERGE_MEMBER_AWAY_ALL_WINDOW,
  MERGE_SHAPE_NOT_HONOURED,
  MERGE_WINDOW_ALL_PAST,
  MERGE_WINDOW_UNREADABLE,
  type MergeMaterialDish,
  type MergedFromEntry,
  type MergeWindow,
  mergedFromEntry,
  mergeLadder,
  mergeMaterialShown,
  observeMergeShape,
  type PlanSpan,
  // G5 — LE CRITÈRE DE DIVERGENCE EST CELUI DE LA FUSION, LU ET PAS RÉÉCRIT.
  // « Une casserole déjà composée peut toujours en donner moins, jamais plus
  // qu'elle n'en contient »: `servingConflicts` porte cette phrase depuis D6,
  // et une seconde lecture ailleurs finirait par en dire autre chose.
  servingConflicts,
} from "../_shared/keel/household_merge.ts";
import {
  carryMergedFrom,
  heldMemberIds,
  mergeCarriers,
  mergeStandings,
} from "../_shared/keel/household_merge_notice.ts";
import {
  type LiveHouseholdPlan,
  loadLiveHouseholdPlans,
  storedCookingDays,
  storedDishes,
} from "../_shared/keel/household_merge_notice_io.ts";
// L7/D11 — LE PLAFOND. Ce module ne compte RIEN: `N`, le `+ 3` et le lundi ISO
// vivent en base (migration 20260812170000), et il n'en relit que le verdict.
import {
  MERGE_QUOTA_EXHAUSTED,
  type MergeQuotaState,
  mergeQuotaRefusalDetail,
  parseMergeQuota,
} from "../_shared/keel/household_merge_quota.ts";
import { proteinAnchorRetryInstruction } from "../_shared/keel/protein_anchor.ts";
import type { CompositionIndex } from "../_shared/keel/food_composition.ts";
import { loadCompositionIndex } from "../_shared/keel/food_composition_io.ts";
// LOT 18 — la réparation du référentiel, un seul appel par plan, un repli qui
// ne peut pas échouer, et AUCUN alias écrit. Voir `composition_fill.ts`.
import {
  compositionFillColumns,
  fillPlanComposition,
  repairPlanComposition,
} from "../_shared/keel/composition_fill_io.ts";
// ⟳ LOT `L17-0` — les DEUX populations du groupe déclaré: ce que le modèle
// écrit, et ce qui atteint la base. Le compteur lit la charge ÉCRITE.
import { foodGroupWriteCounts } from "../_shared/keel/food_group_write.ts";
// LE PLIAGE EST IMPORTÉ, JAMAIS RECOPIÉ — 41 % de l'énergie et 51 % de la
// protéine vivent dans les préparations, et une seconde écriture du prorata
// divergerait de celle qui rend le chiffre affiché.
import { foldPreparationsIntoDishes } from "../_shared/keel/meal_verdict.ts";
import {
  MEMBER_AGE_STATES,
  type MemberAgeState,
} from "../_shared/keel/household.ts";
import { applyHouseRuleLock } from "../_shared/keel/household_restriction_lock.ts";
// ── LE RÉGIME À TABLE (R4/R5) — LE DÉFAUT ① DE LA SPEC ─────────────────────
// Avant le 2026-08-14, ce fichier ne portait AUCUNE occurrence du mot « diet »:
// un maître végane recevait de la viande. Le moteur qui sait ce qu'un régime
// exclut est `dietary_regime.ts`, importé jusque-là par la seule lane
// individuelle; `household_diet.ts` est ce qu'il ne pouvait pas savoir — qu'il
// y a plusieurs bouches autour d'une seule casserole.
import {
  dietDiverges,
  householdDietBlock,
  memberRegime,
  strictestRegimeAt,
} from "../_shared/keel/household_diet.ts";
import type { DietaryRegime } from "../_shared/keel/dietary_regime.ts";
import {
  type HouseholdAllergyRow,
  householdConstraintMouths,
  householdHardConstraints,
  loadHouseholdAllergies,
} from "../_shared/keel/household_safety.ts";
import {
  buildHouseholdPromptBlocks,
  // LOT C ② — LE COMPTEUR DE L'ATTRIBUTION D'UNE RÈGLE DANS UN `why`.
  countWhyRuleAttributions,
  extractMemberPortions,
  HOUSEHOLD_PROMPT_VERSION,
  type HouseholdRestriction,
} from "../_shared/keel/household_meal_generation.ts";
// ⛔ C1 — LE TAG DU COMPTEUR DE CONTAMINATION CROISÉE. Le BLOC, lui, n'est pas
// importé ici: il est écrit par le module qui porte la règle et assemblé par
// `buildHouseholdPromptBlocks`, qui décide sa position. L'appeler d'ici en
// ferait une seconde évaluation des mêmes prémisses.
import { CROSS_CONTACT_BLOCK_TAG } from "../_shared/keel/cross_contact.ts";
// ── `D3′` · L'ARBITRAGE ENTRE DEUX BOUCHES QUI VEULENT LE CONTRAIRE ────────
// ⛔ MODULE NEUF, COMMITÉ, QUI N'IMPORTE RIEN (règle §⑨ n° 92) — 15 épreuves,
// 9 mutations attrapées sur 9, vertes depuis un arbre qui ne contient QUE ces
// deux fichiers. Le texte du bloc, son déplacement en queue, le verdict de
// position et le compteur à deux populations vivent tous là-bas: ici il n'y a
// que le câblage et les objets de CE prompt.
import {
  countPrecedenceRanks,
  movePrecedenceToTail,
  PRECEDENCE_COUNTER_TAG,
  type PrecedenceObjects,
  precedenceTailVerdict,
} from "../_shared/keel/precedence_tail.ts";
// L7 ① — LE LECTEUR À TROIS VALEURS DES MOYENS DE CUISSON (L2, 2026-08-18).
// ⛔ `hasKitchenTool` N'EST PAS IMPORTÉ ICI, ET C'EST VOULU: le seul chemin qui
// décide d'une interdiction est `missingKitchenTools()`, appelé dans le module
// qui écrit le bloc. Voir l'en-tête de `kitchenBlock`.
import {
  hasFreezerDeclared,
  readKitchenEquipment,
} from "../_shared/keel/kitchen_equipment.ts";
// ⟳ A2 (2026-09-03) — « COMMENT VOULEZ-VOUS CUISINER » ET « COMBIEN DE
// COURSES ». Le module est PUR et les DEUX lanes l'appellent: la dérivation
// (sessions, jours de cuisine, budget de temps) n'est écrite qu'une fois,
// contrairement à `readCookingCapacity` qui vit en double dans ces deux
// fichiers depuis toujours.
import {
  type CookingStyle,
  type GroceryRuns,
  readCookingStyle,
  readGroceryRuns,
  resolveCookingCapacity,
  unusedGroceryRuns,
} from "../_shared/keel/cooking_plan.ts";
import {
  daysOutOfBatchReach,
  singleSessionCookDay,
} from "../_shared/keel/plan_feasibility.ts";
import {
  buyDatesByIndex,
  wavePreparationsFromRows,
} from "../_shared/keel/grocery_waves.ts";
import {
  daysNeedingTheirOwnShop,
  rawKeepingBreaches,
} from "../_shared/keel/raw_keeping.ts";
import {
  EXTRA_BEARING_SLOTS,
  extrasOf,
  type MealExtra,
  MEAL_EXTRAS_SOURCES,
  type MealExtrasSource,
  resolveSlotExtras,
} from "../_shared/keel/meal_extras.ts";
import { FREEZER_WINDOW_DAYS } from "../_shared/keel/fridge_window.ts";
// ③ — LES JOURS QUE LE FOYER NE DÉPLACE PAS (2026-08-20).
import {
  type HouseholdTradition,
  parseTraditions,
  traditionCounts,
  traditionOutcomes,
} from "../_shared/keel/household_traditions.ts";
import {
  // C6 — COMBIEN DE PLATS DÉDIÉS, DÉCIDÉ EN UN SEUL ENDROIT.
  dedicatedDishesFor,
  memberPortionsPayload,
  type MemberGoal,
  MEMBER_GOALS,
  type PortionMember,
  reconcilePortions,
  servingDemandsFor,
  // G5 — LE TEMPS PLAFONNE, LA DIVERGENCE DÉCLENCHE (arbitrage B1).
  type CookingShape,
  timeAllowsASecondDish,
  weeklyCookingMinutes,
  // LOT B — LE MODE DE CUISSON DEMANDÉ. Un plafond, jamais un ordre: le calcul
  // reste le calcul, et le choix ne peut que le retenir.
  asksForASecondDish,
  capCookingShape,
  readCookingShape,
  // ══════════════════════════════════════════════════════════════════════════
  // L8 — LA CIBLE DIMENSIONNE LES GRAMMAGES. Renversement du 2026-08-18,
  // `docs/keel/CALORIE_REVERSAL.md` §7.
  //
  // ⛔ LA PORTE N'EST PAS ICI, ET C'EST LE POINT. Ce fichier n'importe NI
  // `energySafetyGates` NI `canSizeFromTarget`: la chaine s'assemble dans le
  // module PUR, par bouche, avec l'age de CETTE bouche. Un generateur qui
  // assemblerait la chaine lui-meme choisirait de quel age et de quel plancher
  // il se sert — et la propriete R6 (retournee) le refuse par un test de source.
  // ══════════════════════════════════════════════════════════════════════════
  BODY_SHARE_REASONS,
  countPortionNoteDrift,
  bodyShareFactors,
  type BodyShareReason,
  BOX_SIZING_REASONS,
  type BoxSizingReason,
  householdMouthFactors,
  type MouthRestrictionState,
  sizeBoxesFromTarget,
  householdAppetite,
  weighedPortionMembers,
  weightGroupCount,
} from "../_shared/keel/household_portions.ts";
// ── L0bis — LE GARDE D'ÉNERGIE DES CONDITIONS DÉCLARÉES ───────────────────
// Il ne touche QUE le calcul. `conditionRef` n'entre dans aucune ceinture de
// sortie: l'y mettre a déjà bâillonné un message d'urgence en run réel.
import {
  conditionGatePopulationOf,
  evictsPregnancyFoods,
  goalUnderConditionGate,
  newConditionGateCounter,
  pregnancyFoodBlockFor,
} from "../_shared/keel/condition_energy_gate.ts";
// ══════════════════════════════════════════════════════════════════════════
// LE CHANTIER DU GRAMMAGE — l'ancrage absolu (`scratchpad/…-MASTER-PROMPT-
// GRAMMAGE.md`). `mouth_energy` dit ce que la journée LIVRE, `mouth_anchor` ce
// que le corps DEMANDE, et le second REMPLACE le facteur relatif quand il tire.
// ══════════════════════════════════════════════════════════════════════════
import {
  ANCHOR_REASONS,
  type AnchorFactor,
  householdAnchors,
  MEAL_STRUCTURE_STATES,
  type SlotExtraKcal,
  mealStructureState,
} from "../_shared/keel/mouth_anchor.ts";
import {
  type MouthDayEnergy,
  mouthDayEnergy,
} from "../_shared/keel/mouth_energy.ts";
import {
  UNMET_CAUSES,
  type UnmetCause,
  unmetDemand,
} from "../_shared/keel/pot_demand.ts";
// LA DIRECTION D'UN OBJECTIF, LUE UNE SEULE FOIS DANS LE DÉPÔT.
import { scaleDirectionOf } from "../_shared/keel/weight_pace.ts";
// L8 — LA POSITION DU COACH SUR `counting`, REDUITE. C'est une LECTURE de
// doctrine, pas la porte: elle ne decide rien seule, elle rend l'un des trois
// etats que le module pur fera passer par `energySafetyGates`.
import { countingStanceFrom } from "../_shared/keel/energy_gate.ts";
// G4 — CE QUE CHAQUE BOUCHE MANGE QUAND ELLE NE MANGE PAS LE PLAT DE LA MAISON.
// La garde de texte n'est PAS ici: `gateMemberHabits` délègue à
// `plan_draft_note.ts::readDraftNote`, la même porte que la note de reprise.
import {
  gateMemberHabits,
  type MemberHabit,
  // LE MÊME PRÉDICAT QUE LE BRIEF, APPELÉ — voir `dishBearingMembers`.
  ownMealSlots,
  parseMemberExtras,
  parseMemberHabits,
} from "../_shared/keel/household_habits.ts";
import { loadHouseholdMemberBodies } from "../_shared/keel/household_bodies.ts";
// FF-051 · CE QUE CHAQUE BOUCHE MANGE DÉJÀ. Le jumeau du chargeur de corps
// juste au-dessus, et pour la même raison qu'il est un module: l'appariement,
// la règle « un apport ne prend pas le repas de la tablée » et le coût ne se
// prouvent que là-bas.
import { loadHouseholdFixedIntakes } from "../_shared/keel/household_fixed_intakes.ts";
import {
  memberDeltasPayload,
  resolveHousehold,
  toHouseholdMember,
} from "../_shared/keel/household_composition.ts";
import {
  envelopeFor,
  ACTIVITY_ANSWER_STATES,
  ACTIVITY_FACTOR_SOURCES,
  activityAnswerState,
  activityFactorOf,
  type MouthBody,
  type PortionAdjustFor,
} from "../_shared/keel/meal_envelope.ts";
import {
  dishBitesExclusion,
  exclusionRetryInstruction,
  exclusionTermsFor,
} from "../_shared/keel/food_exclusion_belt.ts";
// ⛔ LE MÊME ARBITRE QUE L'ENVELOPPE — lot M3. Voir `portionIndexMoves`: ce
// compteur lisait `winningPortionAdjust`, qui n'arbitre plus rien.
import {
  portionIndexFor,
  portionIndexMoves,
} from "../_shared/keel/feedback_index.ts";
import { MEAL_BODY_GENDERS } from "../_shared/keel/meal_body.ts";
import {
  ACTIVITY_LEVELS,
  type ActivityLevel,
  APPETITE_LEVELS,
  type AppetiteLevel,
  DAY_ACTIVITY_LEVELS,
  type DayActivityLevel,
  GOAL_TOKENS,
  type GoalToken,
  SPORT_FREQUENCIES,
  type SportFrequency,
} from "../_shared/keel/tokens.ts";
import { weekStartOf } from "../_shared/keel/weekly_flow_io.ts";

/**
 * `generate-household-meal-v1` — UNE cuisson, des portions qui divergent.
 *
 * Autorité produit: docs/keel/PIVOT-FOYER.md §3 (l'unité est la session de
 * cuisine). Le CONSEIL DE FAMILLE de §8 est mort le 2026-08-08: les envies
 * sont UNE ligne écrite par le compte maître pour tout le monde
 * (CHANTIER-FOYER-PROFILS.md, lot 5), et plus une récolte par membre.
 *
 * ── POURQUOI UNE FONCTION DE PLUS PLUTÔT QU'UN DRAPEAU SUR L'EXISTANTE ───
 * `generate-meal-v1` marche, il est couvert, et il sert le chemin MAJORITAIRE:
 * l'entrée du produit est à 1 (§5), donc la plupart des compositions n'ont pas
 * de foyer. Lui ajouter une branche « si foyer » ferait porter à chaque
 * composition individuelle le risque d'une régression de foyer — et ce dépôt a
 * déjà écrit la règle en toutes lettres pour `generate-plan-v2`: on ne mute pas
 * un générateur qui marche, on duplique et on le dit.
 *
 * Ce qui est PARTAGÉ (le moteur, le verrou, le parseur, l'écriture
 * transactionnelle) l'est par IMPORT, jamais par copie. Ce qui est propre au
 * foyer vit dans `_shared/keel/household_*.ts`.
 *
 * ── CE QU'ELLE ÉCRIT, ET CE QU'ELLE N'ÉCRIT PAS ─────────────────────────
 * Elle écrit UNE ligne `student_generated_meals`, par la même RPC que le
 * chemin individuel — donc avec le même verrou consultatif, le même
 * remplacement nommé et la même troncature. Elle n'envoie AUCUN message, ne
 * pose aucun rappel, ne notifie personne: la livraison proactive au foyer est
 * un autre chantier, et un générateur qui notifie est un générateur qu'on ne
 * peut plus appeler pour essayer.
 *
 * ── POUR QUI ELLE COMPOSE, DEPUIS L3 (D2/D7, 2026-08-12) ────────────────
 * CE PLAN EST LE PLAN DU MAÎTRE. Lui, toutes les bouches sans compte, et tout
 * compte secondaire qui n'a PAS pris la main. Un secondaire qui a généré et
 * VALIDÉ son propre plan couvrant cette fenêtre en est retiré: il mange le
 * sien. C'est `resolveHandOff` (`_shared/keel/household_hand.ts`) qui le dit,
 * et lui seul.
 *
 * Sans geste du maître, les deux plans COEXISTENT: le foyer cuisine sans lui,
 * il cuisine pour lui, et personne ne fusionne. C'est le REPLI du modèle
 * (D8: « dans tous les cas le user garde son plan »), et il tient seul.
 *
 * ── DEUX OPÉRATIONS, UNE SEULE PORTE (L4, D6/D10, 2026-08-12) ───────────
 * `operation: "compose"` (le DÉFAUT, et le comportement de toujours) écrit le
 * plan du foyer. `operation: "merge"` REPREND à cette table quelqu'un qui
 * mangeait son propre plan, et écrit un NOUVEAU plan du foyer.
 *
 * ELLES PARTAGENT CE FICHIER PARCE QU'ELLES PARTAGENT LEURS PRÉCONDITIONS: le
 * gel 402 (L1), la résolution du foyer et le droit du maître, l'union des
 * allergies, le plafond de bouches, les deux axes de version de prompt. Une
 * seconde fonction edge aurait dupliqué cinq gardes — et ce dépôt a déjà payé
 * plusieurs fois « deux définitions qui divergent au premier ajustement ».
 *
 * CE QUE LA FUSION N'ÉCRASE JAMAIS: le plan PERSONNEL du secondaire. Elle écrit
 * une ligne neuve sur le compte du MAÎTRE (`plan_kind = 'household'`); la RPC
 * d'écriture ne touche que les lignes de `p_user_id` ET de la même nature, donc
 * la ligne du secondaire est hors de portée par construction. C'est ce qui rend
 * la défusion de D8 possible: il y a toujours un plan à retrouver.
 *
 * ── LE MINEUR N'EST PAS UNE CIBLE (§8.4), ET « JE NE SAIS PAS » NON PLUS ─
 * L'objectif d'une bouche SANS COMPTE vit sur sa ligne de foyer depuis le
 * 2026-08-10 — sans quoi une personne sans compte n'en aurait aucun, et la
 * bifurcation des portions serait muette pour exactement les gens que le
 * produit veut servir.
 *
 * ⚠️ CORRIGÉ LE 2026-08-11 (D1): dès que la bouche A UN COMPTE, son objectif
 * vient de SON « about you » (`student_goals`), pas de sa ligne. Deux sources
 * qui divergent sans arbitre écrit, c'est le doublon qui produit un bug six
 * mois plus tard. La résolution est faite UNE SEULE FOIS, dans
 * `keel_household_roster_for`, donc ce fichier n'a pas à la connaître — mais
 * ce commentaire, lui, affirmait le contraire de ce que le code fait.
 *
 * La ceinture a donc changé de nature. Elle n'est plus « on ne LIT PAS la table
 * pour un mineur » (un filtre de requête); elle est `goalApplies` dans
 * `household.ts`, et elle refuse DEUX cas au lieu d'un: le mineur, et la bouche
 * dont l'âge est INCONNU. Le second est le cas neuf et le plus mordant — depuis
 * que le compte maître saisit des bouches à la main, une ligne peut n'avoir
 * aucune date, et l'ancienne garde SQL (`coalesce(is_minor, false)`) l'aurait
 * traitée comme un adulte.
 *
 * `student_goals` reste lu, pour le COMPTE MAÎTRE seul: sa `situation`, ses
 * contraintes pratiques et sa langue gouvernent la composition entière. Ce
 * n'est plus une source de portion.
 */

const FN_NAME = "generate-household-meal-v1";
const DRAFT_ADOPTION_MODEL_TIMEOUT_MS = 100_000;

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`[${FN_NAME}] missing env ${name}`);
  return v;
}

function adminClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Même lecture défensive que le chemin individuel. */
function readWindowRequest(raw: unknown): MealWindowRequest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const w = raw as Record<string, unknown>;
  const kind = String(w.kind ?? "").trim();
  if (kind === "until_sunday") return { kind: "until_sunday" };
  if (kind === "days") {
    const count = Number(w.count);
    return Number.isFinite(count) ? { kind: "days", count } : null;
  }
  if (kind === "exact") {
    const startsOn = String(w.starts_on ?? "").trim();
    const durationDays = Number(w.duration_days);
    if (!startsOn || !Number.isFinite(durationDays)) return null;
    return { kind: "exact", startsOn, durationDays };
  }
  return null;
}

function readCookingCapacity(pc: Record<string, unknown> | null) {
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const pick = (value: unknown, allowed: readonly string[]): string | null => {
    const raw = String(value ?? "").trim();
    return allowed.includes(raw) ? raw : null;
  };
  const time = Number(pc?.cooking_time_min);
  return {
    cookDays: Array.isArray(pc?.cook_days)
      ? (pc!.cook_days as unknown[]).map(String).filter((d) => DAYS.includes(d))
      : [],
    cookingTimeMin: Number.isFinite(time) && time > 0 ? Math.min(240, Math.round(time)) : null,
    recipeDifficulty: pick(pc?.recipe_difficulty, ["simple", "normal", "keen"]),
    variety: pick(pc?.variety, ["repeat", "some", "varied"]),
    // LE BUDGET EST UN MONTANT, ET IL EST RELU ICI PLUTÔT QUE REÇU DANS LA
    // REQUÊTE. L'écran qui compose l'écrit dans `practical_constraints`
    // juste avant d'appeler — la même route que le rythme et les jours de
    // cuisine. Deux chemins pour un seul chiffre, et c'est toujours celui
    // que l'écran ne montre pas qui gagne.
    //
    // `null` quand il est absent, à zéro, illisible ou absurde: aucune de
    // ces formes ne devient une consigne. `Number(null)` vaut 0 ET est
    // fini — un `!= null` laisserait passer « budget: 0 ».
    budgetAmount: usableBudget(pc?.budget_amount),
    // ⟳ A2 — LUES ICI, RÉSOLUES AILLEURS. Cette fonction ne fait que LIRE la
    // colonne; la dérivation (sessions, jours, minutes) vit dans
    // `resolveCookingCapacity` (`_shared/keel/cooking_plan.ts`), appelée par
    // les DEUX lanes. `readCookingCapacity`, elle, est dupliquée entre les deux
    // fichiers depuis toujours et sans test qui les compare — la dérivation ne
    // le sera pas, et un test lit les deux sources pour le prouver.
    //
    // ⛔ `null` = LA QUESTION N'A JAMAIS ÉTÉ POSÉE, jamais « le moins
    // possible »: cicatrice `20260818110000:48-51`.
    cookingStyle: readCookingStyle(pc),
    groceryRuns: readGroceryRuns(pc),
  };
}

interface LoadedMember extends PortionMember {
  /**
   * `null` pour une bouche sans compte. Sert UNIQUEMENT à savoir où chercher
   * ses contraintes de sécurité et son corps, qui restent clés sur
   * `auth.users`. Ce n'est PAS son identité: `memberId` l'est.
   */
  userId: string | null;
  /** Pour l'union des contraintes de sécurité du foyer. */
  isOwner: boolean;
  /**
   * D14 — QUAND CETTE BOUCHE N'EST PAS LÀ, les deux sources résolues.
   *
   * `effective` est ce qui compte; `self` et `household` ne servent qu'à la
   * trace du plan — sans elles, « pourquoi manque-t-il une assiette ? » n'a
   * pas de réponse trois jours plus tard.
   */
  away: MemberAway;
  /**
   * D2/D7 — LES PLANS QUI POURRAIENT RETIRER CETTE BOUCHE DE LA TABLE.
   *
   * « Pourraient »: la base a filtré (personnel · vivant · validé · ce foyer),
   * la fenêtre n'est pas encore comparée. `resolveHandOff` s'en charge, et lui
   * seul.
   */
  ownPlans: MemberOwnPlan[];
  /**
   * R1/R2 — LE RÉGIME DE CETTE BOUCHE, déjà tranché en base entre son « about
   * you » (si elle a un compte) et sa ligne (sinon), exactement comme `goal` et
   * `eating_rhythm`. `null` = personne n'a rien déclaré, OU « je mange de
   * tout »: ce module ne raisonne que sur des RESTRICTIONS, et les deux n'en
   * posent aucune (voir `memberRegime`).
   *
   * ⚠️ IL N'EST PAS SUR `PortionMember`, ET C'EST VOULU. Un régime gouverne ce
   * qu'il y a DANS la casserole, jamais la taille d'une part: le mettre sur le
   * brief de portions inviterait le modèle à écrire « ta part végétarienne »
   * dans une consigne lue à voix haute à table, ce que `FORBIDDEN_PORTION_TERMS`
   * n'attrape pas.
   */
  diet: DietaryRegime | null;
  /**
   * CE QU'ELLE PREND À CÔTÉ DU PLAT, PAR MOMENT (2026-09-01).
   *
   * Clé = moment (`lunch` / `dinner`), valeur = les jetons de `MEAL_EXTRAS`.
   * Source: `household_member_habits.slots[].extras`.
   *
   * ⛔ REQUIS, JAMAIS `?`. Une clé ABSENTE de l'objet dit « ce moment n'a pas
   * été renseigné » et fait replier sur les trois booléens par personne; un
   * CHAMP absent dirait la même chose par accident, sur chaque appelant qui a
   * oublié de le passer. C'est la cicatrice « un paramètre de garde optionnel
   * est une garde désarmée »: `{}` se lit, `undefined` se traverse.
   *
   * ⚠️ IL N'EST PAS SUR `PortionMember`, pour la même raison que `diet`: il
   * dimensionne la CIBLE d'un repas, il n'a rien à dire dans une consigne lue
   * à table.
   */
  mealExtras: Record<string, MealExtra[]>;
}

/**
 * Un nombre de PostgREST, ou `null`.
 *
 * `numeric` arrive en CHAÎNE (« 26.5 ») par la couche JSON de PostgREST, pas en
 * nombre: un `typeof === "number"` aurait rendu `null` sur chaque corps saisi,
 * et le lot serait inerte sans qu'aucun test de module ne le voie.
 */
function num(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Une ligne de `keel_household_roster_for`, telle que la base la rend. */
interface RosterRow {
  member_id: string;
  user_id: string | null;
  first_name: string;
  age_state: string;
  role: string;
  goal: string | null;
  // D14 — L'UNION DES DEUX SOURCES, DÉJÀ FAITE EN BASE. Chaque entrée porte
  // sa `source` (`self` | `household`); `parseMemberAway` la relit sans
  // jamais refaire la fusion (voir `household_presence.ts`).
  away_days: unknown;
  // D2/D7 — LES PLANS PERSONNELS VIVANTS ET VALIDÉS de cette bouche, DANS
  // CE FOYER. Déjà filtrés par la base sur tout ce qu'elle peut voir seule;
  // ce qui reste à décider est le RECOUVREMENT de la fenêtre, et il est
  // décidé dans `household_hand.ts`, jamais ici.
  own_plans: unknown;
  // LES MOMENTS OÙ CETTE BOUCHE MANGE, déjà tranchés en base entre son
  // « about you » (si elle a un compte) et sa ligne (sinon) — exactement comme
  // `goal` au-dessus. `null` = personne ne l'a dit.
  eating_rhythm: unknown;
  // R2 — SON RÉGIME, tranché en base par la MÊME règle: une bouche avec compte
  // le porte dans son « about you » (`student_safety_constraints.diet_ref`, ou
  // `practical_constraints.diet_asked` pour l'omnivore), une bouche sans compte
  // sur sa ligne. `null` = personne n'a demandé.
  diet: unknown;
}

/** Une ligne de `keel_household_habits_for`, telle que la base la rend (G1). */
interface HabitRow {
  member_id: string;
  slots: unknown;
  note: string | null;
}

// ===========================================================================
// L4 · D6 · D15 · D16 — LA FUSION, RÉSOLUE AVANT TOUTE DÉPENSE
//
// Tout ce bloc s'exécute AVANT le premier appel modèle, et c'est sa raison
// d'être autant que sa position: chacun de ses refus se tranche sur deux
// fenêtres, un roster et une date. L1 a mesuré 28,6 s et 225 s de génération
// brûlées sur des refus de cette nature; le test de POSITION est dans
// `_shared/keel/household_merge_test.ts` (« AUCUN REFUS DE FUSION NE SE PAIE AU
// PRIX D'UNE GÉNÉRATION »), et il garde la position PAR LA SOURCE parce qu'en
// HTTP un refus tardif est indiscernable d'un refus précoce.
//
// ⚠️ JUSQU'AU 2026-08-12, CE COMMENTAIRE NOMMAIT UN FICHIER DE TEST QUI N'A
// JAMAIS EXISTÉ. Un commentaire qui ment sur l'existence de sa propre garde est
// pire qu'une absence de commentaire: il fait croire la garde posée à qui vient
// vérifier, et c'est le seul lecteur qui compte. Le nom fautif n'est pas répété
// ici — un test (« AUCUN COMMENTAIRE DU GÉNÉRATEUR NE NOMME UN TEST QUI
// N'EXISTE PAS ») refuse désormais TOUT nom de fichier de test introuvable dans
// ce fichier, y compris cité en exemple.
// ===========================================================================

/**
 * Un plan déjà écrit, relu pour la fusion. Jamais le `why` d'un plat.
 *
 * ⚠️ LA LECTURE VIT DÉSORMAIS DANS `household_merge_notice_io.ts` (L5), et pas
 * ici. Le lecteur de propositions a besoin EXACTEMENT du même plan du foyer,
 * avec le même prédicat: deux `select` écrits séparément auraient divergé, et
 * ce dépôt a mesuré deux fois le 2026-08-12 ce que coûte un lecteur du plan du
 * foyer qui ne filtre pas comme les autres.
 */
type StoredPlan = LiveHouseholdPlan;

interface ResolvedMerge {
  member: RosterRow;
  /** Le plan personnel repris. UN seul par appel — voir plus bas. */
  personalPlan: StoredPlan;
  /** Le plan du foyer dans lequel on le reprend. */
  householdPlan: StoredPlan;
  window: MergeWindow;
  /**
   * O1 — LES AUTRES PLANS PERSONNELS QUI MORDENT SUR LA FENÊTRE FUSIONNÉE.
   *
   * Une fusion reprend UN plan. Deux plans personnels adjacents qui couvrent
   * ensemble la fenêtre demanderaient deux gestes du maître, et c'est l'option
   * la plus réversible: fusionner les deux d'un coup déciderait à la place de
   * D10 (« la fusion est manuelle, sur proposition »), et rien ne dit que la
   * proposition doit les grouper. Ce qui n'est PAS acceptable, c'est le
   * silence: les autres plans sont tracés en `issues`, donc visibles.
   */
  otherOverlappingPlanIds: string[];
}

interface MergeRefusal {
  refusal: string;
  detail: string;
}

async function resolveMergeRequest(args: {
  admin: SupabaseClient;
  roster: readonly RosterRow[];
  memberId: string;
  todayDate: string;
  /**
   * Les plans du foyer vivants, déjà lus une fois pour tout ce fichier.
   *
   * ⚠️ PASSÉS PLUTÔT QUE RELUS (L5). Cette fonction faisait son propre `select`;
   * le lecteur de propositions en aurait fait un second, avec son propre
   * prédicat, et ce dépôt a mesuré deux fois le 2026-08-12 ce que coûte un
   * lecteur du plan du foyer qui ne filtre pas comme les autres. Le propriétaire
   * et le foyer ne sont donc plus des arguments d'ici: ils appartiennent à la
   * lecture, qui vit dans `household_merge_notice_io.ts`.
   */
  householdPlans: readonly StoredPlan[];
}): Promise<ResolvedMerge | MergeRefusal> {
  const member = args.roster.find((r) => r.member_id === args.memberId);
  if (!member) {
    return {
      refusal: "merge_member_not_in_household",
      detail: "That person is not in this household.",
    };
  }
  // D2 — LE MAÎTRE N'EST JAMAIS EXCLU, donc il n'y a jamais rien à reprendre
  // pour lui. Son plan du foyer EST son plan. Sans ce refus, une fusion sur
  // lui-même irait jusqu'à `merge_member_has_no_plan`, qui serait un
  // diagnostic faux.
  if (member.role === "owner") {
    return {
      refusal: "merge_member_is_owner",
      detail: "The household plan is already yours: there is nothing to bring back.",
    };
  }

  const ownPlans = parseOwnPlans(member.own_plans);
  if (ownPlans.length === 0) {
    return {
      refusal: "merge_member_has_no_plan",
      detail: "That person has no validated plan of their own, so they are " +
        "already being cooked for.",
    };
  }

  // LE PLAN DU FOYER, VIVANT. Lu UNE fois par requête, par le lecteur partagé
  // (`household_merge_notice_io.ts`), et passé ici: `plan_kind = 'household'`
  // y est obligatoire et ce n'est pas une précaution — un plan PERSONNEL porte
  // aussi `household_id`, et deux lecteurs indépendants sont déjà tombés dedans
  // le 2026-08-12.
  const householdPlans = args.householdPlans;
  if (householdPlans.length === 0) {
    return {
      refusal: "merge_no_household_plan",
      detail: "There is no live household plan to merge into. Compose one first.",
    };
  }

  // ── LA MEILLEURE PAIRE (plan du foyer, plan personnel) ──────────────────
  // Au plus deux plans du foyer sont vivants à la fois (la contrainte
  // d'exclusion le garantit: le courant et le suivant), et un membre peut
  // porter plusieurs plans personnels adjacents. On garde la paire dont la
  // fenêtre FUSIONNABLE — intersection coupée au pivot — est la plus longue:
  // c'est la seule mesure qui parle de jours réellement repris.
  //
  // ⚠️ LE CHOIX EST FAIT PAR `bestMergePair`, ET PAS ICI (L5). La PROPOSITION
  // de D10 doit annoncer exactement ce que cette fusion-ci fera; une seconde
  // arithmétique dans le lecteur aurait promis des jours que la fusion ne prend
  // pas, et les deux nombres auraient été plausibles.
  const best = bestMergePair({
    householdPlans,
    personalPlans: ownPlans,
    today: args.todayDate,
  });
  if (!best.ok) {
    return {
      refusal: best.refusal,
      detail: best.refusal === MERGE_WINDOW_ALL_PAST
        ? "Everything those two plans share is already behind us. A merge only " +
          "touches days nobody has eaten yet."
        : best.refusal === MERGE_WINDOW_UNREADABLE
        ? "One of those two plans does not carry a readable window."
        : "That person's plan and the household plan do not share a single day.",
    };
  }

  // LE PLAN PERSONNEL, EN ENTIER. Le roster n'en rend que la FENÊTRE (id,
  // dates, validation): il n'a jamais eu à porter des plats, et l'élargir pour
  // ce lot ferait grossir la lecture que le chat fait à chaque tour.
  const personalRes = await args.admin
    .from("student_generated_meals")
    .select("id, starts_on, duration_days, lead_days, validated_at, cooking_sessions, dishes")
    .eq("id", best.personal.id)
    .maybeSingle();
  if (personalRes.error) throw personalRes.error;
  const personalRow = (personalRes.data ?? null) as Record<string, unknown> | null;
  if (!personalRow) {
    // La ligne était là quand le roster l'a vue, et elle ne l'est plus. On
    // refuse plutôt que de fusionner un plan qu'on n'a pas relu.
    return {
      refusal: "merge_plan_vanished",
      detail: "That plan is no longer readable. Try again.",
    };
  }

  // ⚠️ `recomposed`, ET SURTOUT PAS `window` — C5 ②, LE JUMEAU DU P0 DE L10 ①.
  //
  // MESURÉ EN HTTP RÉEL LE 2026-08-12. Plan du foyer `[2026-08-12 +3]`, il
  // cuisine VENDREDI 14 pour Iris; le plan personnel VALIDÉ ET VIVANT d'Iris
  // `[2026-08-14 +1]` couvre exactement ce jour-là. `other_overlapping_plan_ids`
  // est rendu `[]`, aucune `issue`: le maître cuisinait une assiette pour
  // quelqu'un qui avait son plan ce jour-là, et RIEN ne le disait.
  //
  // La cause est la même confusion que le P0 de L10 ①, à un site de plus: ce
  // contrôle interrogeait `window` — les jours de SON plan qui reviennent —
  // alors que ce qu'on ÉCRIT est `recomposed`, la queue du plan du foyer. Quand
  // `recomposed` est plus LONGUE (le plan personnel finit avant la fin de la
  // semaine du foyer), les jours en trop ne sont contrôlés par personne.
  //
  // ⚠️ C3 ⑤ REND CE CAS ATTEIGNABLE: c'est lui qui autorise deux plans
  // personnels adjacents. Avant lui, un second plan mordant était rare.
  //
  // RETOUR ARRIÈRE: cette ligne. Son prix est le silence ci-dessus.
  const mergedSpan: PlanSpan = best.window.recomposed;
  return {
    member,
    householdPlan: best.household,
    personalPlan: {
      id: String(personalRow.id),
      startsOn: String(personalRow.starts_on ?? best.personal.startsOn),
      durationDays: Number(personalRow.duration_days ?? best.personal.durationDays),
      // ⟳ A1 (2026-09-03) — la veille de la ligne PERSONNELLE reprise. Elle
      // sort du même `select` que le reste (`personalRow`); `?? 0` couvre une
      // base non migrée, où « pas de veille » est ce que la ligne porte.
      leadDays: Number(personalRow.lead_days ?? 0),
      validatedAt: personalRow.validated_at == null
        ? null
        : String(personalRow.validated_at),
      cookingDays: storedCookingDays(personalRow.cooking_sessions),
      dishes: storedDishes(personalRow.dishes),
      generatedFrom: null,
    },
    window: best.window,
    otherOverlappingPlanIds: ownPlans
      .filter((p) => p.id !== best.personal.id && plansOverlap(p, mergedSpan))
      .map((p) => p.id),
  };
}

// ===========================================================================
// L5 · D8 — LA DÉFUSION, RÉSOLUE AVANT TOUTE DÉPENSE ELLE AUSSI
//
// « Refaire le plan du foyer SANS user X » est la première des trois sorties de
// D8, et c'est celle qui préserve les courses déjà faites. Elle recompose la
// QUEUE du plan du foyer vivant — ce qu'il lui reste à partir d'aujourd'hui
// (D16) — sans la personne, et avec la consigne écrite mot pour mot dans le
// registre (`buildUnmergeBlock`).
//
// ⚠️ ON NE DÉFUSIONNE QUE CE QUI A ÉTÉ FUSIONNÉ. Le refus
// `unmerge_member_not_merged` n'est pas une formalité: sans lui, cette
// opération deviendrait « retire n'importe qui de la table », c'est-à-dire une
// exclusion permanente que rien dans ce chantier n'autorise — D8 parle d'une
// personne QUE LE MAÎTRE A REPRISE et qui vient de valider autre chose.
//
// ⚠️ ELLE N'ÉCRIT RIEN SUR LE COMPTE DU SECONDAIRE, exactement comme la fusion:
// « dans tous les cas, X garde son plan » est l'invariant du modèle, et il est
// STRUCTUREL — `write_student_meal_plan` ne touche que les lignes de
// `p_user_id` (le maître) et de la même nature.
// ===========================================================================

interface ResolvedUnmerge {
  member: RosterRow;
  /** Le plan du foyer qu'on recompose. C'est LUI, « le plan de base » (D8). */
  basePlan: StoredPlan;
  /** Ce qu'il reste de ce plan à partir d'aujourd'hui. */
  window: MergeWindow;
}

function resolveUnmergeRequest(args: {
  roster: readonly RosterRow[];
  memberId: string;
  todayDate: string;
  householdPlans: readonly StoredPlan[];
}): ResolvedUnmerge | MergeRefusal {
  const member = args.roster.find((r) => r.member_id === args.memberId);
  if (!member) {
    return {
      refusal: "unmerge_member_not_in_household",
      detail: "That person is not in this household.",
    };
  }
  if (member.role === "owner") {
    return {
      refusal: "unmerge_member_is_owner",
      detail: "The household plan is theirs: there is nobody to take out of it.",
    };
  }

  // LE PLAN DE BASE EST LE PLAN VIVANT QUI PORTE LA REPRISE. Pas le plan
  // d'avant la fusion: les courses se font sur le plan que l'écran montre, et
  // c'est celui-là. Voir le long commentaire de `buildUnmergeBlock`.
  //
  // ⚠️ ET « LE PLAN VIVANT » N'EST PAS « LE PREMIER DE LA LISTE ». Jusqu'au
  // 2026-08-12 cette ligne était un `.find(...)` sur une liste triée par
  // `starts_on` CROISSANT: elle prenait donc le plan du foyer le PLUS ANCIEN,
  // alors que deux sont vivants en même temps par contrat (le courant et le
  // suivant, ce que `prepare_next` produit). Mesuré en HTTP: un plan 08-05/4 j
  // périmé portant la reprise à côté du plan courant 08-12/5 j qui la portait
  // aussi, et `operation: "unmerge"` rendait 409 `unmerge_window_all_past`
  // pendant que le lecteur offrait le bouton — le maître n'avait alors AUCUN
  // moyen de défaire la reprise sur le plan qu'il est en train de manger.
  //
  // `mergeCarriers` est la même fonction que celle du lecteur de propositions,
  // exactement comme `bestMergePair` l'est pour la fusion: la proposition et le
  // geste choisissent la même ligne, ou ils divergent.
  const carrier = mergeCarriers({
    householdPlans: args.householdPlans,
    today: args.todayDate,
  }).get(args.memberId) ?? null;
  if (!carrier) {
    return {
      refusal: "unmerge_member_not_merged",
      detail: "No live household plan has brought that person back to this " +
        "table, so there is nothing to undo.",
    };
  }
  if (carrier.tail === null) {
    return {
      refusal: carrier.tailRefusal === MERGE_WINDOW_UNREADABLE
        ? "unmerge_window_unreadable"
        : "unmerge_window_all_past",
      detail: "That household plan has no day left ahead of it. There is " +
        "nothing left to cook differently.",
    };
  }

  return { member, basePlan: carrier.plan, window: carrier.tail };
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  try {
    const admin = adminClient();

    // --- identité: le JWT, jamais un user_id du client --------------------
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }
    const userId = user.id;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const issues: string[] = [];

    // ── LE FOYER, ET LE DROIT DE COMPOSER POUR LUI ──────────────────────
    // SEUL LE COMPTE MAÎTRE compose. Ce n'est pas une hiérarchie de confort:
    // la composition RETIRE le plan courant de la personne pour qui elle est
    // écrite (voir la RPC), donc laisser n'importe quel membre la déclencher
    // laisserait un colocataire effacer la semaine d'un autre.
    const meRes = await admin
      .from("household_members")
      .select("household_id, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (meRes.error) throw meRes.error;
    const me = meRes.data as { household_id?: string; role?: string } | null;
    if (!me?.household_id) {
      return jsonResponse(req, { error: "no_household", request_id: requestId }, { status: 409 });
    }
    if (me.role !== "owner") {
      return jsonResponse(req, { error: "not_owner", request_id: requestId }, { status: 403 });
    }
    const householdId = me.household_id;

    // ── LE GEL À L'IMPAYÉ (chantier 3, D4) ──────────────────────────────
    //
    // ON GÈLE LA PRODUCTION, PAS LA CONSULTATION. Cette porte-ci est la
    // production: elle écrit un plan et RETIRE le plan courant. Le plan déjà
    // écrit, l'écran du foyer et le chat restent ouverts — geler, ce n'est pas
    // effacer, et un foyer qui revient dans trois mois doit retrouver
    // exactement ce qu'il a laissé.
    //
    // ⚠️ AUCUNE RÈGLE N'EST ÉCRITE ICI. `keel_household_is_covered` est LA
    // définition unique du dépôt (migration 20260811050000): abonnement du
    // maître vivant, ou essai qui couvre encore. La réécrire en TypeScript —
    // « si free_until < aujourd'hui » — ferait deux définitions qui
    // divergeraient au premier ajustement, et personne ne saurait laquelle
    // ment. C'est le piège n°1 de ce lot, nommé dans le chantier.
    //
    // LE REFUS EST NOMMÉ, ET C'EST LA MOITIÉ DU TRAVAIL. Un 500 ou un silence
    // se lit comme une panne et fait ouvrir un ticket au lieu d'un paiement.
    // 402 plutôt qu'un 409 de plus: le statut dit déjà de quoi il s'agit, et
    // l'écran lit `error` pour choisir sa phrase.
    //
    // FAIL-OPEN, ET C'EST L'ARBITRAGE INVERSE DE CELUI DES ALLERGIES.
    // Une lecture de sécurité en panne doit REFUSER de cuisiner (plus bas, en
    // toutes lettres). Une lecture de FACTURATION en panne doit laisser
    // passer: se tromper de sens ici coupe un client qui paie, ce qu'aucun
    // nouvel essai ne répare — c'est le même arbitrage que
    // `stripe-create-checkout-session`, qui démarre à zéro profil plutôt que
    // de sur-facturer sur une lecture ratée. L'échec est journalisé BRUYAMMENT
    // pour qu'une garde muette ne passe pas pour une garde qui ne mord jamais.
    const coverRes = await admin.rpc("keel_household_is_covered", {
      p_household: householdId,
    });
    if (coverRes.error) {
      await logEdgeFunctionError({
        functionName: FN_NAME,
        requestId,
        error: coverRes.error,
        metadata: { source: "household_coverage", household: householdId },
      });
      issues.push("household_coverage_unreadable");
    } else if (coverRes.data === false) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.frozen",
        user_id: userId,
        household_id: householdId,
      }));
      // `skipErrorLog`: UN IMPAYÉ N'EST PAS UN INCIDENT. Voir le jumeau dans
      // `generate-meal-v1`. La trace utile est juste au-dessus
      // (`keel.household_meal.frozen`); ce qui partait en plus dans
      // `system_error_logs`, au niveau `error`, était du bruit qu'un foyer
      // gelé produit à chaque appui.
      return jsonResponse(req, {
        error: "household_frozen",
        detail: "This household is paused. Nothing has been deleted - the " +
          "current plan stays readable, and composing resumes as soon as the " +
          "subscription does.",
        request_id: requestId,
      }, { status: 402, skipErrorLog: true });
    }

    // ── CE QUI EST DÉCIDABLE ICI NE SE PAIE PAS AU PRIX D'UN APPEL MODÈLE ──
    // Ces deux valeurs ne dépendent QUE du corps de la requête. Elles étaient
    // lues et validées juste avant l'écriture, c'est-à-dire APRÈS la
    // génération: mesuré le 2026-08-11, 28,6 s de modèle brûlées pour finir sur
    // `replaces_required`. Le refus remonte donc ici, avant toute dépense.
    //
    // `replace_current` reste le défaut — le changer modifierait le
    // comportement d'un appelant qui omet `intent` mais fournit `replaces` —
    // mais il échoue désormais immédiatement, et en le nommant.
    //
    // ── L4/D6 — DEUX OPÉRATIONS, UNE SEULE PORTE ────────────────────────
    //
    // `compose` est ce que cette fonction fait depuis toujours, et c'est le
    // DÉFAUT: un appelant qui n'envoie pas `operation` reçoit exactement le
    // comportement d'avant ce lot, y compris le front, qui n'en envoie pas.
    //
    // `merge` reprend à la table quelqu'un qui mangeait son propre plan (D6,
    // D10). Elle vit ICI plutôt que dans une fonction à elle parce qu'elle
    // exige EXACTEMENT les mêmes préconditions: le gel 402 (L1), la résolution
    // du foyer, l'union des allergies, le plafond de bouches, la version de
    // prompt. Une seconde fonction dupliquerait cinq gardes, et ce dépôt a
    // déjà payé plusieurs fois « deux définitions qui divergent au premier
    // ajustement ». Les cinq gardes sont donc franchies une seule fois, plus
    // haut, par le même chemin, pour les deux opérations.
    //
    // ⚠️ LA FUSION NE PREND NI `window` NI `intent` DU CLIENT, ET C'EST LE
    // POINT. Sa fenêtre est l'INTERSECTION des deux plans coupée au premier
    // jour non consommé (D15/D16): elle se DÉDUIT, elle ne se demande pas. Un
    // client qui pourrait la choisir pourrait refusionner hier.
    const operation = String(body.operation ?? "compose").trim();
    if (
      operation !== "compose" && operation !== "merge" && operation !== "unmerge"
    ) {
      return jsonResponse(req, {
        error: "unknown_operation",
        detail: "operation must be compose, merge or unmerge",
        request_id: requestId,
      }, { status: 400 });
    }
    const mergeMemberId = String(body.merge_member_id ?? "").trim() || null;
    if (operation === "merge" && !mergeMemberId) {
      return jsonResponse(req, {
        error: "merge_member_required",
        detail: "operation=merge must name the person it brings back " +
          "(`merge_member_id`).",
        request_id: requestId,
      }, { status: 400 });
    }
    // ── L5/D8 — LA DÉFUSION ────────────────────────────────────────────────
    // Son paramètre porte un autre nom que celui de la fusion, exprès: les deux
    // opérations désignent une personne, et un `member_id` unique aurait rendu
    // « je fusionne Zoé » et « je sors Zoé » indiscernables dans un journal, un
    // rejeu ou un rapport de bug. Le nom dit le geste.
    const unmergeMemberId = String(body.unmerge_member_id ?? "").trim() || null;
    if (operation === "unmerge" && !unmergeMemberId) {
      return jsonResponse(req, {
        error: "unmerge_member_required",
        detail: "operation=unmerge must name the person it takes back out " +
          "(`unmerge_member_id`).",
        request_id: requestId,
      }, { status: 400 });
    }
    // `intent` et `replaces` restent des ENTRÉES pour la composition, et
    // deviennent des SORTIES pour la fusion (voir plus bas): d'où le `let`.
    let intent = String(body.intent ?? "replace_current").trim();
    let replaces = String(body.replaces ?? "").trim() || null;
    if (operation === "compose") {
      // ── `draft` — LE TROISIÈME MOT, ET IL N'ÉCRIT RIEN ──────────────────
      // Même contrat que sur la lane individuelle: il compose à l'identique et
      // saute la SEULE écriture (`write_student_meal_plan`). Toutes les gardes
      // amont mordent pareil — gel, `not_owner`, `empty_household`, fenêtre,
      // chevauchement, plancher TCA, doctrine, verrou de règles de maison.
      //
      // ⚠️ RÉSERVÉ À `compose`. `merge` et `unmerge` sont des GESTES du maître
      // sur des plans qui existent: en prévisualiser un n'aurait pas de sens, et
      // le quota de fusion se consomme dans le même chemin.
      if (
        intent !== "replace_current" && intent !== "prepare_next" &&
        intent !== "draft"
      ) {
        return jsonResponse(req, {
          error: "unknown_intent",
          detail: "intent must be replace_current, prepare_next or draft",
          request_id: requestId,
        }, { status: 400 });
      }
      if (intent === "draft" && replaces !== null) {
        return jsonResponse(req, {
          error: "unknown_intent",
          detail: "intent=draft writes nothing, so it cannot name a `replaces`.",
          request_id: requestId,
        }, { status: 400 });
      }
      if (intent === "replace_current" && replaces === null) {
        return jsonResponse(req, {
          error: "replaces_required",
          detail:
            "intent=replace_current must name the plan it replaces (`replaces`).",
          request_id: requestId,
        }, { status: 400 });
      }
    } else if (intent === "draft") {
      // Un aperçu de fusion n'existe pas: `merge`/`unmerge` déplacent des plans
      // déjà écrits, et le quota se prend dans le même chemin.
      return jsonResponse(req, {
        error: "unknown_intent",
        detail: "intent=draft is only available on operation=compose",
        request_id: requestId,
      }, { status: 400 });
    }
    /** Un aperçu: tout se calcule, rien ne s'écrit. */
    const isDraft = operation === "compose" && intent === "draft";
    // Après validation d'un aperçu, une seule passe modèle doit pouvoir
    // atteindre l'écriture avant l'expiration de la fonction. Les gardes de
    // sécurité restent actives; seules les relances d'amélioration sont
    // retirées de ce chemin borné.
    const adoptingDraft = operation === "compose" && !isDraft &&
      body.adopting_draft === true;

    // ══════════════════════════════════════════════════════════════════════
    // LE MODE DE CUISSON DEMANDÉ — UNE ENTRÉE DE LA DEMANDE, JAMAIS UN RÉGLAGE
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⚠️ IL VOYAGE AVEC LA DEMANDE, ET C'EST UN ARBITRAGE — le même que le
    // budget, déplacé du profil vers la composition le 2026-08-13. Le motif est
    // écrit dans `CookingCapacityCard`: « un réglage de profil s'écrit une fois
    // et s'applique en silence à toutes les semaines suivantes, y compris celle
    // où on reçoit du monde ». Une colonne ici aurait fait cuisiner trois plats
    // le mardi ordinaire d'un foyer qui avait répondu pour un dimanche.
    //
    // ⚠️ ABSENT ⇒ `null`, ET LE CALCUL GOUVERNE SEUL. Toutes les requêtes
    // écrites avant ce lot passent par là, et leur sortie est byte-identique.
    // Un jeton inconnu rend `null` lui aussi (`readCookingShape`): « je n'ai
    // pas su lire » et « rien n'a été demandé » produisent le même
    // comportement, et c'est la direction sûre.
    //
    // ⛔ ET IL N'EST JAMAIS RELU D'UN PLAN PRÉCÉDENT. `generated_from` l'ARCHIVE
    // (plus bas) pour qu'on puisse relire une composition; il n'a aucun lecteur,
    // et c'est ce qui garantit qu'une semaine ne réapplique pas le choix de la
    // précédente.
    const askedCookingShape = readCookingShape(body.cooking_shape);
    // ══════════════════════════════════════════════════════════════════════
    // « TOUT DANS UNE SESSION DE CUISINE » — LA DEMANDE, 2026-09-01.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⚠️ `=== true`, ET LA COMPARAISON EST LA GARDE. Le corps vient du réseau:
    // `"false"`, `0` et `{}` sont tous truthy ou falsy pour de mauvaises
    // raisons. Seul le booléen `true` est une demande.
    //
    // ⛔ CE N'EST PAS ENCORE LA DÉCISION: la porte est le CONGÉLATEUR, et
    // l'inventaire n'est lu que bien plus bas (`kitchenEquipment`).
    //
    // ⚠️ COMME `cooking_shape`, IL N'EST JAMAIS RELU D'UN PLAN PRÉCÉDENT. Une
    // semaine ne réapplique pas le choix de la précédente: c'est un arbitrage
    // de semaine, pas un réglage de profil.
    const askedOneCookingSession = body.one_cooking_session === true;
    // ══════════════════════════════════════════════════════════════════════
    // « JE CUISINE LA VEILLE » — PLUS UNE DEMANDE, UNE DÉRIVATION (A1,
    // 2026-09-03).
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ `body.cook_the_day_before` N'EST PLUS LU, ET SON RETRAIT EST LE LOT.
    // Les courses et la cuisson se font la veille, automatiquement; c'est
    // `leadDayFor` (`plan_hours.ts`) qui tranche, plus bas, quand la date de
    // départ et l'heure locale sont connues. Un corps qui porte encore la
    // clé — un onglet ouvert avant le déploiement — est ignoré en silence:
    // il demandait ce qu'on fait désormais par défaut.
    //
    // ⚠️ ET LA DÉCISION NE PEUT PAS REMONTER ICI: elle a besoin de `todayDate`
    // et de l'horloge du fuseau de la personne, résolus quarante lignes plus
    // bas. La poser ici demanderait de deviner l'heure, et une heure devinée
    // accorde une veille qui n'existe pas.
    //
    // ── LA REPRISE D'UN APERÇU EST CÂBLÉE, ET PAS ICI ────────────────────
    // Même seam que sur la lane individuelle: `body.draft_note` part au modèle
    // dans le MÊME message que la doctrine et les règles de maison, donc il
    // passe par la garde d'entrée `plan_draft_note.ts::readDraftNote`. Elle a
    // besoin des interdits du coach et du plancher TCA du compte qui compose:
    // le câblage vit donc plus bas, juste après le chargement de la doctrine, et
    // il refuse `note_unusable` avant tout appel modèle.

    // ── LES MEMBRES, PAR LA MÊME PORTE QUE LE CHAT ──────────────────────
    // `keel_household_roster_for` et pas une lecture de table: c'est le SEUL
    // lecteur du roster, partagé avec `household_turn_context`. Deux SELECT sur
    // `household_members` divergeraient au premier ajustement, et la divergence
    // serait silencieuse — le générateur composerait pour un foyer que le chat
    // décrit autrement.
    //
    // Il rend `member_id` (l'identité d'une bouche), `user_id` (NULL tant que
    // la personne n'a pas réclamé son profil), le prénom, l'état d'âge à trois
    // valeurs et l'objectif — tout ce dont la bifurcation a besoin, et rien qui
    // exige un compte.
    const rosterRes = await admin.rpc("keel_household_roster_for", { p_user: userId });
    if (rosterRes.error) throw rosterRes.error;
    const roster = (rosterRes.data ?? []) as RosterRow[];
    if (roster.length === 0) {
      return jsonResponse(req, { error: "empty_household", request_id: requestId }, { status: 409 });
    }
    // LES COMPTES DU FOYER — un sous-ensemble, désormais. Sert l'union des
    // contraintes de sécurité, qui reste clée sur `auth.users`.
    const accountIds = roster
      .map((r) => r.user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    // ── G4 · CE QUE CHAQUE BOUCHE MANGE QUAND CE N'EST PAS LE PLAT DE LA
    //         MAISON (2026-08-14) ────────────────────────────────────────
    //
    // ⚠️ LE DÉFAUT QUE CETTE LECTURE FERME A UNE DATE ET UN CHIFFRE: un plan
    // réel a servi des ŒUFS BROUILLÉS SEPT MATINS D'AFFILÉE à une femme qui
    // mange une pomme. Le plan n'avait pas ignoré son habitude — personne ne la
    // lui avait demandée, et il n'existait aucun champ où la ranger.
    //
    // `keel_household_habits_for` et PAS un select sur la table: elle est
    // fermée à `anon` comme à `authenticated`, et la fonction à argument est la
    // porte du SERVEUR — `auth.uid()` est NULL sous `service_role`, cicatrice
    // que ce dépôt a déjà payée par des RPC entièrement mortes.
    //
    // UNE BOUCHE ABSENTE DU RÉSULTAT MANGE LE PLAT DE LA MAISON. C'est le cas
    // majoritaire, et il est GRATUIT: pas de ligne, pas de fragment de prompt,
    // pas de jeton dépensé.
    //
    // ⚠️ LE TEXTE N'EST PAS ENCORE GARDÉ ICI. `readDraftNote` a besoin des
    // interdits du coach et du plancher TCA, tous deux chargés bien plus bas;
    // le gardiennage se fait donc en UN endroit, juste avant la construction du
    // prompt (`gateMemberHabits`). Ce qui sort d'ici est BRUT, et rien ne doit
    // le mettre dans un prompt sans passer par là.
    const habitsRes = await admin.rpc("keel_household_habits_for", { p_user: userId });
    if (habitsRes.error) throw habitsRes.error;
    // ⚠️ `extras` VOYAGE À CÔTÉ DES HABITUDES, PAS DEDANS. Les deux sortent de
    // la MÊME colonne `slots`, et c'est voulu — mais `parseMemberHabits` JETTE
    // les entrées sans prose (une entrée muette fait inventer le modèle), or une
    // entrée « midi, rien à côté du plat » est exactement ça: muette et
    // porteuse. Les fondre perdrait la réponse la plus fréquente.
    const rawHabits = new Map<
      string,
      {
        slots: MemberHabit[];
        note: string | null;
        extras: Record<string, MealExtra[]>;
      }
    >();
    for (const row of (habitsRes.data ?? []) as HabitRow[]) {
      const memberId = String(row.member_id ?? "").trim();
      if (memberId.length === 0) continue;
      const note = String(row.note ?? "").trim();
      rawHabits.set(memberId, {
        slots: parseMemberHabits(row.slots),
        note: note.length > 0 ? note : null,
        extras: parseMemberExtras(row.slots),
      });
    }

    // --- LE JOUR DU COMPTE MAÎTRE, dans SON fuseau ------------------------
    // Le foyer cuisine ensemble: il n'a qu'un seul calendrier, et c'est celui
    // de la personne qui compose. Faire la moyenne de quatre fuseaux
    // produirait une date que personne n'habite.
    const ownerProfileRes = await admin
      .from("profiles")
      .select("id, timezone, country, locale")
      .eq("id", userId)
      .maybeSingle();
    if (ownerProfileRes.error) throw ownerProfileRes.error;
    const ownerProfile = (ownerProfileRes.data ?? {}) as Record<string, unknown>;
    const timezone = String(ownerProfile.timezone ?? "").trim();
    if (!timezone) {
      return jsonResponse(req, {
        error: "local_day_unresolved",
        detail: "We could not tell what day it is where you are, and a meal " +
          "plan has to carry real dates.",
        request_id: requestId,
      }, { status: 409 });
    }
    const todayToken = dayTokenInZone(timezone, new Date());
    const todayDate = localDateInZone(timezone, new Date());
    // ── L'HEURE QU'IL EST À CETTE TABLE ─────────────────────────────────
    // Même calendrier que la date juste au-dessus, donc même fuseau: celui du
    // compte qui compose. `null` = « je n'ai pas su lire l'horloge », et chaque
    // règle de `plan_hours.ts` rend alors le produit d'hier. Il ne fait échouer
    // aucune composition: le fuseau est déjà exigé six lignes plus haut.
    let localMinuteOfDay: number | null = null;
    try {
      localMinuteOfDay = localMinuteInZone(timezone, new Date());
    } catch (error) {
      console.warn(`[${FN_NAME}] local clock unreadable`, error);
    }
    /** L'heure pleine, telle que `plan_hours.ts` la demande. */
    const hourNow = localMinuteOfDay === null
      ? null
      : Math.floor(localMinuteOfDay / 60);
    const country = String(ownerProfile.country ?? "").trim() || null;
    // ── LA LANGUE DU FOYER, RÉSOLUE ICI ET UNE SEULE FOIS ────────────────
    //
    // Même raisonnement que le fuseau juste au-dessus: le foyer cuisine
    // ensemble, il n'a qu'une seule table, donc une seule langue — celle du
    // compte maître, qui compose. Mélanger les langues des membres produirait
    // un plan que personne ne lit entièrement.
    //
    // ⚠️ `profiles.locale` et pas `student_goals.content_locale`: la seconde
    // dit dans quelle langue la personne a écrit sa situation (R3, troisième
    // axe), et tous ses écrivains la sèment `'en-GB'`.
    const householdContentLocale = resolveArtifactLocale({
      studentProfile: String(ownerProfile.locale ?? "").trim() || null,
      tenantDefault: null,
    });

    // ── LA FENÊTRE, REMONTÉE ICI (L3, 2026-08-12) ───────────────────────
    //
    // ELLE ÉTAIT RÉSOLUE 180 LIGNES PLUS BAS, et elle est remontée pour DEUX
    // raisons qui vont dans le même sens.
    //
    //   1. C'EST LE MÊME GESTE QUE `intent`/`replaces` PLUS HAUT: ce qui ne
    //      dépend que du corps de la requête se refuse avant toute dépense.
    //      Un `window_required` se payait jusqu'ici d'une lecture d'objectif,
    //      d'un roster et de N lectures de corps.
    //   2. LA PRISE DE MAIN A BESOIN DE LA FENÊTRE (D2/D7). Savoir qui mange
    //      son propre plan, c'est comparer sa fenêtre à CELLE-CI — et cette
    //      réponse doit être connue AVANT qu'on dimensionne quoi que ce soit
    //      pour la tablée.
    //
    // ⚠️ UN SEUL EFFET DE BORD, ET IL EST ASSUMÉ: un appel qui n'a NI fenêtre
    // NI objectif reçoit désormais `window_required` (400) là où il recevait
    // `goal_required` (409). C'est l'ordre qu'a déjà `generate-meal-v1`, où la
    // fenêtre est validée bien avant l'objectif; les deux lanes disaient deux
    // choses différentes du même appel mal formé.
    let startsOn: string;
    let durationDays: number;
    // CE QUI A ÉTÉ DEMANDÉ AVANT RÉSOLUTION — sert à dire ce qui a été coupé.
    // `null` sur `merge`/`unmerge`: leur fenêtre est DÉDUITE d'un plan vivant,
    // personne ne l'a demandée, donc rien n'y a été coupé. `null` sur
    // `until_sunday` aussi: cette forme demande « ce qu'il reste ».
    let requestedWindowFacts: { startsOn: string; durationDays: number } | null = null;
    /**
     * L4 — TOUT CE QUE LA FUSION A RÉSOLU AVANT LE MODÈLE.
     *
     * `null` sur une composition ordinaire, et c'est ce qui rend le reste de ce
     * fichier lisible: chaque endroit qui doit se comporter autrement le dit en
     * une ligne (`merge === null ? … : …`) au lieu de porter une branche.
     */
    let merge: ResolvedMerge | null = null;
    /**
     * L5/D8 — CE QUE LA DÉFUSION A RÉSOLU AVANT LE MODÈLE. `null` partout
     * ailleurs, même règle que `merge` juste au-dessus.
     */
    let unmerge: ResolvedUnmerge | null = null;

    // ── LES PLANS DU FOYER VIVANTS, LUS UNE FOIS POUR LES TROIS OPÉRATIONS ──
    //
    // La fusion en a besoin pour choisir sa paire, la défusion pour retrouver
    // le plan qui porte la reprise, et la COMPOSITION ORDINAIRE pour relire
    // `merged_from` — c'est-à-dire pour ne pas ré-exclure en silence quelqu'un
    // que le maître venait de reprendre (L4, trou n°2). Une lecture par
    // opération aurait fait trois prédicats à tenir alignés.
    const householdPlans = await loadLiveHouseholdPlans(admin, {
      ownerUserId: userId,
      householdId,
    });

    if (operation === "merge") {
      const resolvedMerge = await resolveMergeRequest({
        admin,
        roster,
        memberId: mergeMemberId!,
        todayDate,
        householdPlans,
      });
      if ("refusal" in resolvedMerge) {
        // ⚠️ AUCUN DE CES REFUS NE COÛTE UN APPEL MODÈLE, et c'est la moitié
        // qui compte. Ils ne dépendent que de deux fenêtres, d'un roster et
        // d'une date — L1 a mesuré 28,6 s et 225 s brûlées sur des refus de
        // cette nature, et un test de position garde celui-ci.
        console.log(JSON.stringify({
          tag: "keel.household_meal.merge_refused",
          user_id: userId,
          household_id: householdId,
          member_id: mergeMemberId,
          reason: resolvedMerge.refusal,
        }));
        return jsonResponse(req, {
          error: resolvedMerge.refusal,
          detail: resolvedMerge.detail,
          request_id: requestId,
        }, { status: 409 });
      }
      // ── L7/D11 — LE PLAFOND, REFUSÉ ICI EN MILLISECONDES ───────────────
      //
      // ⚠️ CE N'EST PAS LA GARDE. La garde est le prédicat de
      // `keel_household_claim_merge_quota`, juste avant l'appel modèle: deux
      // fusions lancées en même temps liraient TOUTES LES DEUX un compteur non
      // plein ici, et c'est très exactement le défaut que ce dépôt a payé sur
      // `keel_validate_meal_plan`. Ce refus-ci est un refus RAPIDE — il évite
      // au foyer déjà plein de traverser une doctrine, un roster, des voix et
      // huit lectures pour finir sur le même mot.
      //
      // IL EST ICI, ET PAS PLUS HAUT, parce que les onze refus de L4 sont plus
      // précis que lui: « cette personne n'est pas dans ce foyer » vaut mieux
      // que « le foyer a fini sa semaine », même quand les deux sont vrais.
      //
      // FAIL-OPEN, comme la lecture de facturation deux gardes plus haut et
      // pour la même raison: se tromper de sens couperait un foyer qui paie
      // sur une lecture ratée. Le vrai plafond, lui, ne peut pas rater — il est
      // dans le prédicat de l'écriture.
      const quotaPeek = await admin.rpc("keel_household_merge_quota_state", {
        p_household: householdId,
        p_local_date: todayDate,
      });
      if (quotaPeek.error) {
        await logEdgeFunctionError({
          functionName: FN_NAME,
          requestId,
          error: quotaPeek.error,
          metadata: { source: "merge_quota_state", household: householdId },
        });
        issues.push("merge_quota_unreadable");
      } else {
        const state = parseMergeQuota(quotaPeek.data);
        if (state?.exhausted) {
          console.log(JSON.stringify({
            tag: "keel.household_meal.merge_quota_exhausted",
            user_id: userId,
            household_id: householdId,
            member_id: mergeMemberId,
            used: state.used,
            limit: state.limit,
            week_start: state.weekStart,
            stage: "peek",
          }));
          // 429 ET PAS 409: le statut dit déjà de quoi il s'agit, comme le 402
          // du gel. `skipErrorLog` pour la même raison qu'au gel — UN PLAFOND
          // ATTEINT N'EST PAS UN INCIDENT. L1 a mesuré 15 lignes de
          // `system_error_logs`, au niveau `error`, pour des refus de paiement
          // en une seule session de test.
          return jsonResponse(req, {
            error: MERGE_QUOTA_EXHAUSTED,
            detail: mergeQuotaRefusalDetail(state),
            merge_quota: {
              used: state.used,
              limit: state.limit,
              remaining: state.remaining,
              week_start: state.weekStart,
              resets_on: state.resetsOn,
            },
            request_id: requestId,
          }, { status: 429, skipErrorLog: true });
        }
      }
      merge = resolvedMerge;
      // ⚠️ `recomposed`, ET SURTOUT PAS `window` (D1, QA du 2026-08-12).
      // `window` dit les jours de SON plan qui reviennent — c'est ce que la
      // proposition annonce. Ce qu'on ÉCRIT est la queue du plan du foyer:
      // écrire `window` quand elle est plus courte coûtait un 409
      // `plan_overlaps_existing` APRÈS 16,1 s de modèle, ou faisait disparaître
      // la fin de la semaine en silence quand la RPC acceptait. Voir le
      // commentaire de `MergeWindow.recomposed`.
      startsOn = merge.window.recomposed.startsOn;
      durationDays = merge.window.recomposed.durationDays;
      // ── L'INTENTION SE DÉDUIT, ELLE NE SE DEMANDE PAS ─────────────────
      // Deux cas, et un seul est un remplacement.
      //   · La fusion commence LE MÊME JOUR que le plan du foyer ⇒ elle le
      //     REMPLACE, et la RPC retire l'ancien.
      //   · Elle commence PLUS TARD (des jours déjà consommés, D16) ⇒ le plan
      //     du foyer doit SURVIVRE, tronqué à ces jours-là. C'est exactement ce
      //     que fait la boucle de chevauchement de `write_student_meal_plan`,
      //     et c'est ce qui réalise « hors intersection, chacun garde ce qu'il
      //     avait » sans une ligne de code de plus.
      intent = startsOn === merge.householdPlan.startsOn
        ? "replace_current"
        : "prepare_next";
      replaces = intent === "replace_current" ? merge.householdPlan.id : null;
    } else if (operation === "unmerge") {
      const resolvedUnmerge = resolveUnmergeRequest({
        roster,
        memberId: unmergeMemberId!,
        todayDate,
        householdPlans,
      });
      if ("refusal" in resolvedUnmerge) {
        // MÊME `tag` QUE LES REFUS DE FUSION, à un mot près. Un décompte de
        // refus doit pouvoir se lire par opération; deux formes de log pour le
        // même fait rendraient tout décompte faux, et personne ne le verrait
        // (mesuré sur `merge_member_away_all_window`, 2026-08-12).
        console.log(JSON.stringify({
          tag: "keel.household_meal.unmerge_refused",
          user_id: userId,
          household_id: householdId,
          member_id: unmergeMemberId,
          reason: resolvedUnmerge.refusal,
        }));
        return jsonResponse(req, {
          error: resolvedUnmerge.refusal,
          detail: resolvedUnmerge.detail,
          request_id: requestId,
        }, { status: 409 });
      }
      unmerge = resolvedUnmerge;
      // ⚠️ LA FENÊTRE SE DÉDUIT ICI AUSSI, ET POUR LA MÊME RAISON QUE LA FUSION.
      // C'est la QUEUE du plan de base — ce qu'il lui reste à partir
      // d'aujourd'hui (D16). Un client qui pourrait la choisir pourrait refaire
      // hier, ou refaire une semaine que ce plan ne couvre pas.
      //
      // `recomposed` comme la fusion, et ici les deux sont ÉGAUX par
      // construction: la queue d'un plan finit le même jour que lui
      // (`resolveTailWindow` croise le plan avec lui-même). On lit quand même
      // le même champ des deux côtés — le jour où la défusion changera de
      // fenêtre, elle passera par la même porte, et un test le tient.
      startsOn = unmerge.window.recomposed.startsOn;
      durationDays = unmerge.window.recomposed.durationDays;
      intent = startsOn === unmerge.basePlan.startsOn
        ? "replace_current"
        : "prepare_next";
      replaces = intent === "replace_current" ? unmerge.basePlan.id : null;
    } else {
      const windowRequest = readWindowRequest(body.window);
      if (!windowRequest) {
        return jsonResponse(req, {
          error: "window_required",
          detail: "window must be {kind:'until_sunday'} | {kind:'days',count} | " +
            "{kind:'exact',starts_on,duration_days}",
          request_id: requestId,
        }, { status: 400 });
      }
      requestedWindowFacts = windowRequest.kind === "days"
        ? { startsOn: todayDate, durationDays: Math.round(windowRequest.count) }
        : windowRequest.kind === "exact"
        ? {
          startsOn: windowRequest.startsOn,
          durationDays: Math.round(windowRequest.durationDays),
        }
        : null;
      try {
        const resolved = resolveRequestedWindow(windowRequest, todayDate);
        startsOn = resolved.startsOn;
        durationDays = resolved.durationDays;
      } catch (error) {
        return jsonResponse(req, {
          error: "bad_window",
          detail: readableErrorMessage(error),
          request_id: requestId,
        }, { status: 400 });
      }

      // ══ C2 ② — LES JETONS DE JOUR NE VONT PAS AU-DELÀ DE DIMANCHE ════════
      //
      // La même garde que `generate-meal-v1`, par la même fonction pure, et
      // pour la même raison mesurée: le message porte « today is: wed » à côté
      // de « days to fill: tue, wed », et le modèle refuse — 6,2 s facturées.
      //
      // ⚠️ ELLE EST DANS LA BRANCHE `compose` ET NULLE PART AILLEURS. La fusion
      // et la défusion DÉDUISENT leur fenêtre d'un plan vivant (`recomposed`),
      // dont le pivot est au plus tôt aujourd'hui: elles ne peuvent pas la
      // fabriquer. Placer la garde au-dessus des trois l'aurait rendue
      // impossible à faire mordre — une garde sans cas est une garde qu'on
      // croit posée.
      if (windowStartsBeyondDayTokens(startsOn, todayDate)) {
        return jsonResponse(req, {
          error: "window_beyond_this_week",
          detail: "A plan is written in day names (mon, tue...), and those " +
            "only reach as far as this Sunday. Start your window this week, " +
            "or compose next week's plan once it has started.",
          request_id: requestId,
          // C5 ④ — `skipErrorLog`: UNE DATE CHOISIE PAR LE MAÎTRE N'EST PAS UN
          // INCIDENT. Même arbitrage, et même mot, que le 402 du gel et le 429
          // du plafond de ce fichier. Le critère est étroit: se tait un refus
          // causé par LA SAISIE; un refus causé par une PANNE parle toujours.
        }, { status: 400, skipErrorLog: true });
      }

      // ══ C2 ③ — LE JUMEAU DU P0 DE LA FUSION, SUR LA PORTE `compose` ══════
      //
      // La fenêtre de `compose` est PARAMÉTRÉE PAR LE CLIENT
      // (`{kind:"days", count:N}`, `{kind:"exact", …}`), donc une fenêtre
      // strictement intérieure au plan du foyer vivant est atteignable — et
      // `write_student_meal_plan` la refuse exprès (correctif du 2026-08-11),
      // APRÈS le modèle. C'est le défaut que L10 ① a fermé côté fusion et
      // laissé ouvert ici, en le nommant.
      //
      // ⚠️ MÊME RÈGLE, MÊME FONCTION. `firstBlockingPlan` rejoue la boucle de
      // chevauchement de la RPC, celle que `mergeWindowWritable` appelle aussi.
      //
      // ⚠️ ON RELIT `householdPlans`, DÉJÀ CHARGÉ POUR LES TROIS OPÉRATIONS.
      // Son prédicat est plus ÉTROIT que celui de la RPC (il filtre en plus sur
      // `household_id`, décision de L5): un maître qui aurait changé de foyer
      // garderait donc un cas rare qui paie le modèle avant de tomber sur le
      // 409 de la base. C'est le bon sens du compromis — un second lecteur avec
      // un troisième prédicat est la dette que ce chantier a payée deux fois le
      // 2026-08-12.
      const blocking = firstBlockingPlan({
        live: householdPlans.map((p) => ({
          id: p.id,
          startsOn: p.startsOn,
          durationDays: p.durationDays,
          // ⟳ A1 (2026-09-03) — la veille de la ligne, projetée par
          // `loadLiveHouseholdPlans`. `firstBlockingPlan` compare des JOURS
          // MANGÉS; sans elle on refuserait le plan N+1 que la base accepte.
          leadDays: p.leadDays,
        })),
        window: { startsOn, durationDays },
        replacesId: intent === "replace_current" ? replaces : null,
      });
      if (blocking) {
        console.log(JSON.stringify({
          tag: "keel.household_meal.window_overlaps",
          user_id: userId,
          household_id: householdId,
          window: [startsOn, durationDays],
          clash: [blocking.plan.id, blocking.plan.startsOn, blocking.plan.durationDays],
          verdict: blocking.verdict,
        }));
        return jsonResponse(req, {
          error: "plan_overlaps_existing",
          detail: blocking.verdict === "encloses"
            ? "That window sits inside a plan this household already has, and " +
              "writing it would leave the end of that plan with nothing. Cover " +
              "it to its last day, or replace it."
            : "This household already has a plan that starts on that day or " +
              "later. Replace it, or start your window before it.",
          request_id: requestId,
          // C5 ④ — `skipErrorLog`, MÊME CRITÈRE. La fenêtre de `compose` est
          // PARAMÉTRÉE PAR LE CLIENT: une fenêtre intérieure au plan du foyer
          // vivant est un geste de l'écran, pas une panne.
        }, { status: 409, skipErrorLog: true });
      }
    }

    // ── L'OBJECTIF DU MAÎTRE: LA DOCTRINE DU REPAS ──────────────────────
    // `student_goals` du compte maître SEUL, et pour une raison qui n'est plus
    // celle d'avant: cette ligne ne sert plus à dimensionner des portions, elle
    // porte la SITUATION, les contraintes pratiques et la langue — c'est-à-dire
    // ce qui gouverne la composition entière. Les objectifs des membres, eux,
    // vivent désormais sur leur ligne de foyer.
    const ownerGoalRes = await admin
      .from("student_goals")
      .select("user_id, goal, situation, practical_constraints, content_locale")
      .eq("user_id", userId)
      .maybeSingle();
    if (ownerGoalRes.error) throw ownerGoalRes.error;
    const ownerGoal = ownerGoalRes.data as Record<string, unknown> | null;
    if (!ownerGoal) {
      return jsonResponse(req, {
        error: "goal_required",
        detail: "Set a goal and situation before we cook for your household.",
        request_id: requestId,
      }, { status: 409 });
    }

    // ── LES BOUCHES ─────────────────────────────────────────────────────
    // L'objectif vient de la ligne membre pour une bouche SANS compte, et de
    // son « about you » dès qu'elle en a un — arbitré le 2026-08-11 (D1) et
    // résolu dans `keel_household_roster_for`, jamais ici. La
    // ceinture n'est plus « on ne lit pas la table pour un mineur » — elle est
    // `goalApplies`, dans `household.ts`, et elle refuse DEUX cas: le mineur,
    // et la bouche dont l'âge est inconnu. Le second est neuf, et c'est celui
    // qui mordait: une bouche saisie sans date aurait reçu la direction de son
    // objectif comme si on savait qu'elle est adulte.
    //
    // ── LE CORPS, PAR BOUCHE QUI EN A UN (lot 3B) ───────────────────────
    // Avant ce lot, réclamer son profil ne changeait RIEN à la portion servie
    // par le foyer: `body: null` partait au prompt (et y reste, plus bas — un
    // repas de foyer n'a pas UN corps), et la ligne de brief d'un membre ne
    // portait qu'un jeton d'objectif. Le corps entre maintenant PAR MEMBRE,
    // dans le brief de portions, où il a un sens: c'est la taille d'une
    // assiette qu'il dimensionne, pas la composition du plat.
    //
    // Le jour local passé est celui du COMPTE MAÎTRE, comme partout ici.
    const bodies = await loadHouseholdMemberBodies(admin, {
      members: roster.map((r) => ({ memberId: r.member_id, userId: r.user_id })),
      todayLocalDate: todayDate,
    });
    issues.push(...bodies.issues);
    // LE COÛT, OBSERVABLE EN PRODUCTION ET PAS SEULEMENT DANS UN RAPPORT. Ce
    // lot fait passer la lecture de corps de 1 à N par génération; un nombre
    // qu'on ne journalise pas est un nombre que personne ne verra doubler.
    console.log(JSON.stringify({
      tag: "keel.household_meal.member_bodies",
      user_id: userId,
      household_id: householdId,
      members: roster.length,
      accounts: accountIds.length,
      with_body: bodies.byMember.size,
      reads: bodies.reads,
    }));

    const members: LoadedMember[] = roster.map((r) => {
      const rawGoal = String(r.goal ?? "").trim();
      const goal = (MEMBER_GOALS as readonly string[]).includes(rawGoal)
        ? (rawGoal as MemberGoal)
        : null;
      const ageState = (MEMBER_AGE_STATES as readonly string[]).includes(r.age_state)
        ? (r.age_state as MemberAgeState)
        // Un état inconnu du vocabulaire vaut `unknown`, jamais `adult`: c'est
        // la même direction sûre que la fonction SQL, et elle doit survivre à
        // un désalignement entre les deux.
        : "unknown";
      return {
        memberId: r.member_id,
        userId: r.user_id,
        // Le prénom vient de la LIGNE, plus de `profiles`. Une seule source,
        // donc aucune branche entre une bouche avec compte et une sans.
        displayName: String(r.first_name ?? "").trim() || "Member",
        goal,
        ageState,
        // APPARIÉ SUR `member_id`, jamais sur `user_id`. C'est le même
        // re-clavetage que les portions, et pour la même raison: une bouche qui
        // réclame son profil ne change pas d'identité ce jour-là.
        body: bodies.byMember.get(r.member_id) ?? null,
        isOwner: r.role === "owner",
        // D14. AUCUNE FUSION ICI: le roster a déjà concaténé les deux sources,
        // et `parseAwayDays` est l'opérateur d'union. Refaire la résolution
        // dans ce fichier ferait un second avis sur qui est là.
        away: parseMemberAway(r.away_days),
        // D2/D7. AUCUN JUGEMENT ICI NON PLUS: on lit la forme, on ne compare
        // aucune fenêtre. `resolveHandOff`, juste en dessous, est le seul
        // endroit du produit qui décide qu'une bouche a pris la main.
        ownPlans: parseOwnPlans(r.own_plans),
        // ── QUAND ELLE MANGE, À ELLE ────────────────────────────────────
        // `null` traverse tel quel: il veut dire « personne ne l'a dit », et
        // c'est le prompt du foyer qui décide que ça signifie « aux moments de
        // la maison ». Le convertir ici en rythme de la maison ferait écrire,
        // sur la ligne de quelqu'un, un fait que personne n'a énoncé.
        //
        // ⚠️ LE `.map((s) => s.slot)` A ÉTÉ RETIRÉ LE 2026-08-14, ET C'ÉTAIT
        // LUI QUI PERDAIT LA TAILLE. Le roster la rend (colonne pour une
        // bouche sans compte, « about you » pour un compte), le parseur la
        // lit, et cette projection la jetait juste avant `buildPortionBrief`.
        // On garde donc `EatingOccasionSlot` entier — c'est le type du moteur.
        eatingSlots: r.eating_rhythm === null || r.eating_rhythm === undefined
          ? null
          : parseEatingRhythm(r.eating_rhythm),
        // ── G4 · CE QU'ELLE MANGE À LA PLACE ────────────────────────────
        // BRUT à ce stade, et le champ le dit: la garde de texte s'applique en
        // un seul endroit, juste avant le prompt. Le poser ici DÉJÀ gardé
        // demanderait la doctrine du coach, chargée 400 lignes plus bas — et
        // deux gardes séparées par 400 lignes finissent par en être une seule,
        // celle qu'on oublie d'appliquer.
        habits: rawHabits.get(r.member_id)?.slots ?? [],
        habitNote: rawHabits.get(r.member_id)?.note ?? null,
        // ── CE QU'ELLE PREND À CÔTÉ DU PLAT, MOMENT PAR MOMENT (2026-09-01) ─
        //
        // ⛔ PAS DE GARDE DE TEXTE ICI, ET CE N'EST PAS UN OUBLI. Ce champ ne
        // porte AUCUNE prose: `parseMemberExtras` n'accepte que les cinq jetons
        // de `MEAL_EXTRAS`, et tout le reste est écarté avant d'arriver ici.
        // `gateMemberHabits` protège des mots que quelqu'un a écrits; une liste
        // fermée n'en contient jamais.
        //
        // ⚠️ `{}` ET UNE CLÉ ABSENTE VEULENT DIRE LA MÊME CHOSE — « ce moment
        // n'a pas été renseigné » — et c'est ce qui rend le repli légitime.
        mealExtras: rawHabits.get(r.member_id)?.extras ?? {},
        // ── R2 · CE QU'ELLE NE MANGE PAS ────────────────────────────────
        // Le roster a DÉJÀ tranché entre le compte et la ligne; ici on ne fait
        // que valider le jeton contre la liste fermée du moteur. `omnivore`
        // devient `null` en traversant `memberRegime`, et c'est exact: « je
        // mange de tout » ne pose aucune restriction sur la casserole.
        diet: memberRegime(r.diet),
      };
    });

    // ── D2 · D7 — QUI A PRIS LA MAIN (L3, 2026-08-12) ────────────────────
    //
    // LA BASCULE DU MODÈLE, ET ELLE TIENT EN UNE PHRASE: le plan du maître EST
    // le plan du foyer — lui, plus toutes les bouches sans compte, plus tout
    // compte secondaire qui n'a PAS pris la main. Celui qui a pris la main
    // mange SON plan, donc il ne mange pas celui-ci, donc on ne le compose pas.
    //
    // LA POSTURE PAR DÉFAUT EST « NE RIEN FAIRE » (D7). Un secondaire sans plan
    // validé est composé ici comme une bouche ordinaire; ce n'est pas un cas
    // dégradé, c'est le cas nominal — « la composition n'attend jamais
    // personne ».
    //
    // ⚠️ CE FILTRE ET CELUI DE LA PRÉSENCE NE S'IGNORENT PAS, ILS SE COMPOSENT.
    // `platedMembers` (plus bas, D14) retire les bouches absentes à CHAQUE
    // moment de la fenêtre; il part désormais de `composedMembers`, pas de
    // `members`. Une même personne peut très bien avoir pris la main ET être
    // partie toute la semaine, et deux filtres qui se croiseraient sans se
    // connaître finiraient par diverger. L'ordre est celui-ci parce que la
    // prise de main ne dépend pas de la présence, alors que l'absence totale
    // est CALCULÉE sur la tablée qu'on compose.
    //
    // CE QUI NE SUIT PAS L'EXCLUSION, ET POURQUOI:
    //   · L'UNION DES ALLERGIES (`accountIds`, `loadHouseholdAllergies`) reste
    //     sur le foyer ENTIER. Une allergie gouverne la casserole; la retirer
    //     parce que son porteur mange ailleurs cette semaine ferait dépendre
    //     une ceinture de sécurité d'une décision de calendrier. C'est le sens
    //     fail-closed de tout ce fichier.
    //   · LES RÈGLES DE MAISON (`restrictions`) restent entières, parce que le
    //     VERROU (`applyHouseRuleLock`) applique leurs libellés au plat, sans
    //     regarder pour qui. Filtrer la consigne sans filtrer le verrou ferait
    //     diverger ce qu'on demande et ce qu'on impose.
    //   · LES DÉCOMPTES DE `generated_from.household` décrivent LE FOYER
    //     (combien de bouches, combien de mineurs). Le nombre de bouches
    //     réellement servies se lit sur `servings`, et qui a été retiré sur
    //     `hand` juste à côté.
    //
    // ⚠️ L4 — LA FUSION PASSE PAR ICI, ET SEULEMENT PAR ICI. Reprendre
    // quelqu'un à la table, c'est annuler ce que son plan personnel aurait
    // fait; le faire APRÈS coup, dans ce fichier, ferait DEUX endroits qui
    // décident qui est à table, et celui qui a raison ne serait plus lisible.
    // `reclaimed` est un paramètre REQUIS de `resolveHandOff` pour cette raison
    // exacte — une fusion qui oublie de le passer composerait sans la personne
    // qu'elle fusionne, sans qu'une ligne échoue.
    //
    // ── L5 · D8 — CE QUE LE PLAN VIVANT DIT DÉJÀ DES REPRISES ────────────
    //
    // `merged_from` est relu sur les plans du foyer QUI MORDENT SUR LA FENÊTRE
    // qu'on recompose, et sur eux seuls: la provenance d'un plan de la semaine
    // prochaine ne dit rien de la table de cette semaine-ci. C'est aussi la
    // PORTÉE que le lecteur annonce avec chaque `held` — il rend la fenêtre du
    // plan porteur, précisément pour que « la prochaine composition la
    // re-reprendra » ne soit vrai que là où cette ligne-ci le rend vrai.
    //
    // ⚠️ ET C'EST `mergeCarriers` QUI CHOISIT, pas un `find` sur la liste. Deux
    // plans vivants peuvent porter la même reprise (le report la recopie d'un
    // plan à l'autre); garder « la première entrée trouvée » revenait à garder
    // celle du plan le PLUS ANCIEN, donc à comparer la date D8 d'un geste
    // périmé. Même fonction que la défusion et que le lecteur: si les trois ne
    // désignent pas la même ligne, ils se contredisent sans jamais échouer.
    //
    // ⚠️ AUCUN ÉTAT N'EST STOCKÉ, ET C'EST LA DÉCISION. « Untel est fusionné »
    // aurait été une colonne de plus, donc un écrivain de plus à ne jamais
    // oublier; ici la donnée est celle que L4 écrit déjà, datée, sur la ligne
    // même du plan qu'elle décrit.
    const carriedFromPlans = householdPlans.filter((plan) =>
      plansOverlap(plan, { startsOn, durationDays })
    );
    const priorMergedFrom: MergedFromEntry[] = [
      ...mergeCarriers({ householdPlans: carriedFromPlans, today: todayDate })
        .values(),
    ].map((c) => c.entry);
    const standings = mergeStandings({
      mergedFrom: priorMergedFrom,
      plansByMember: new Map(members.map((m) => [m.memberId, m.ownPlans])),
    });
    // LA FUSION QU'ON VIENT DE DEMANDER N'EST PAS « COLLANTE », ELLE EST
    // DEMANDÉE: on la retire d'ici pour qu'elle ne soit pas comptée deux fois,
    // et la défusion retire la sienne pour que le mécanisme collant n'annule
    // pas le geste qui l'annule.
    const stickyReclaimed = heldMemberIds(standings).filter((id) =>
      id !== merge?.member.member_id && id !== unmerge?.member.member_id
    );
    if (priorMergedFrom.length > 0) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.merge_standing",
        user_id: userId,
        household_id: householdId,
        operation,
        carried: priorMergedFrom.length,
        held: stickyReclaimed.length,
        revalidated: standings.filter((s) => s.warn).map((s) => s.memberId),
      }));
    }
    //
    // ⚠️ L5 — LA FUSION EST COLLANTE, ET C'EST ICI QUE ÇA SE JOUE. Avant ce
    // lot, recomposer la même fenêtre en `compose` RÉ-EXCLUAIT la personne
    // qu'on venait de reprendre: son plan personnel couvre toujours la fenêtre,
    // donc la règle de L3 la retirait, et le maître perdait sa fusion sans
    // l'avoir demandé. `stickyReclaimed` relit `merged_from` sur le plan VIVANT
    // et re-reprend qui n'a pas revalidé depuis (voir juste au-dessus).
    //
    // ⚠️ ET UNE RÉ-VALIDATION NE SE RATTRAPE PAS EN SILENCE: qui a validé un
    // plan APRÈS la fusion n'est PAS re-repris (`hold: false`), parce que c'est
    // très exactement le cas que D8 fait remonter au maître avec trois sorties.
    // Le reprendre d'office déciderait à sa place — l'inverse de D10.
    const handOff = resolveHandOff({
      members,
      window: { startsOn, durationDays },
      reclaimed: merge === null
        ? stickyReclaimed
        : [merge.member.member_id, ...stickyReclaimed],
      // L5/D8 — LA DÉFUSION. Elle gagne sur la reprise collante juste au-dessus:
      // c'est le geste qui annule le geste.
      excluded: unmerge === null ? [] : [unmerge.member.member_id],
    });
    const composedMembers = handOff.composed;
    // ⚠️ C3/O1 — UNE `issue` PAR PERSONNE, PAS PAR PLAN. `hand.taken` porte
    // désormais DEUX entrées pour une bouche que deux plans adjacents couvrent
    // ensemble (`personal_plans_cover_window`). Une `issue` par entrée aurait
    // fait lire « Zoé a pris la main » deux fois dans la même réponse, et tout
    // décompte de `member_took_the_hand` aurait compté des plans en croyant
    // compter des gens. L'archive, elle, garde bien les deux lignes.
    for (const id of new Set(handOff.taken.map((t) => t.member_id))) {
      issues.push(`member_took_the_hand:${id}`);
    }
    for (const r of handOff.reclaimed) {
      issues.push(`member_reclaimed_by_merge:${r.member_id}`);
    }
    for (const u of handOff.unmerged) {
      // ⚠️ `covers_window` EST DANS L'`issue`, PAS SEULEMENT DANS L'ARCHIVE.
      // Une défusion peut retirer quelqu'un dont le plan ne couvre pas tous les
      // jours: c'est le droit du maître (D8), mais « il n'a rien à manger
      // jeudi » doit se lire sans ouvrir `generated_from`.
      issues.push(
        `member_unmerged:${u.member_id}${u.covers_window ? "" : ":uncovered"}`,
      );
    }
    for (const s of standings) {
      // D8 — LE PLAN QU'ON ÉCRIT PORTE-T-IL UNE REPRISE PÉRIMÉE ? Tracé sur la
      // ligne elle-même: sans ça, « pourquoi ce plan cuisine-t-il encore les
      // plats d'un plan que l'intéressé a remplacé » n'a pas de réponse trois
      // jours plus tard.
      if (s.warn) issues.push(`merge_revalidated_since:${s.memberId}`);
    }
    for (const id of merge?.otherOverlappingPlanIds ?? []) {
      // O1, rendu VISIBLE plutôt que tranché en silence: cette personne porte
      // un AUTRE plan personnel qui mord sur la fenêtre fusionnée, et cette
      // fusion-ci ne l'a pas repris.
      issues.push(`merge_other_overlapping_plan:${id}`);
    }
    if (
      handOff.taken.length > 0 || handOff.partial.length > 0 ||
      handOff.reclaimed.length > 0 || handOff.unmerged.length > 0
    ) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.hand",
        user_id: userId,
        household_id: householdId,
        taken: handOff.taken.length,
        partial: handOff.partial.length,
        reclaimed: handOff.reclaimed.length,
        unmerged: handOff.unmerged.length,
        composed: composedMembers.length,
        window: [startsOn, durationDays],
      }));
    }

    // ── LE FOYER N'A PLUS RIEN À COMPOSER — UN REFUS À LUI ───────────────
    //
    // ⚠️ SANS CE REFUS, LE CAS NE TOMBERAIT PAS SUR `window_fully_away`: il
    // tomberait BIEN PLUS BAS et BIEN PLUS MAL. `resolveWindowPresence` rend un
    // échec OUVERT quand la liste est vide (`fullyAway: false`, tout le monde à
    // table), donc la composition continuerait — pour zéro bouche, avec une
    // liste d'ids vide, jusqu'à un appel modèle payé pour un plan que personne
    // ne mange. Le refus doit donc être ICI, et porter sa propre cause: dire
    // « personne n'est là » quand tout le monde est là mais cuisine pour soi
    // serait un diagnostic faux.
    //
    // ⚠️ AUJOURD'HUI IL NE PEUT PAS SE DÉCLENCHER, ET C'EST ÉCRIT EXPRÈS. Le
    // maître n'est JAMAIS exclu (D2), et il est toujours dans son roster —
    // `composedMembers` porte donc au moins une bouche. Cette garde tient
    // l'invariant plutôt que le symptôme: le jour où un non-maître pourra
    // composer, ou où le maître pourra prendre la main, elle est déjà juste.
    // Son cas passant, lui, est réel et testé sur le module pur
    // (`household_hand_test.ts`: un roster sans maître rend `composed: []`).
    if (composedMembers.length === 0) {
      return jsonResponse(req, {
        error: "all_members_have_own_plan",
        detail: "Everyone in this household is already cooking from their own " +
          "plan over that stretch, so there is nothing left for the household " +
          "to compose.",
        request_id: requestId,
      }, { status: 409 });
    }

    // ── FF-043 · LA RÉSOLUTION FOYER ────────────────────────────────────
    // L'ordre est l'algorithme du design §4.1, et il n'est pas négociable: le
    // VERROU DE LANE d'abord, avant tout calcul. Évalué après le
    // dimensionnement, il faudrait défaire des enveloppes déjà posées — et un
    // défaisage se rate en silence.
    //
    // ⚠️ LE CORPS RESTE `null` DANS LE PROMPT (plus bas, et le commentaire y
    // est). Ce qui suit dimensionne dans le MOTEUR: le modèle ne reçoit jamais
    // une enveloppe, il reçoit un plat et des directions de service.
    const refRes = await admin
      .from("households")
      .select("reference_member_id")
      .eq("id", householdId)
      .maybeSingle();
    if (refRes.error) throw refRes.error;

    // ── LE CORPS DE CHAQUE BOUCHE, Y COMPRIS SANS COMPTE (2026-08-12) ────
    //
    // ⚠️ CE N'EST PAS `loadHouseholdMemberBodies`, ET LES DEUX COEXISTENT.
    //   · `bodies` (plus haut, FF-047) lit le corps des bouches QUI ONT UN
    //     COMPTE — série de pesées datées + plancher TCA — et sert le BRIEF,
    //     c'est-à-dire ce que le modèle LIT. Il ne rend rien d'un mineur.
    //   · `lineBodies` (ici) lit le corps que le maître a SAISI pour chaque
    //     bouche, mineurs compris, et sert le MOTEUR: le MIN du tronc et les
    //     add-ons. Il n'entre dans aucun prompt.
    //
    // C'est la ligne de partage du lot: on CALCULE avec, on n'ÉNONCE jamais.
    //
    // ⚠️ `keel_household_bodies_for` prend le foyer en ARGUMENT: `auth.uid()`
    // est NULL sous la clé de service, et une RPC gatée dessus serait morte ici.
    const lineBodyRes = await admin.rpc("keel_household_bodies_for", {
      p_household: householdId,
    });
    if (lineBodyRes.error) throw lineBodyRes.error;
    const lineBodies = new Map<string, MouthBody>();
    const lineStructures = new Map<
      string,
      { dessert: boolean | null; cheese: boolean | null; bread: boolean | null }
    >();
    // ⑤ — LES FICHES À QUI LA QUESTION A ÉTÉ POSÉE. C'est ce booléen, et lui
    // seul, qui sépare « pas posé » de « pas répondu »: la valeur est `null`
    // dans les deux cas.
    const row_appetite_asked = new Set<string>();
    for (const row of (lineBodyRes.data ?? []) as Array<Record<string, unknown>>) {
      const memberId = String(row.member_id ?? "").trim();
      if (!memberId) continue;
      const height = num(row.height_cm);
      const weight = num(row.weight_kg);
      const rawGender = String(row.gender ?? "").trim();
      const age = num(row.age_years);
      // TOUT-OU-RIEN, comme en base. Un demi-corps n'existe pas côté table
      // (les trois colonnes y sont `not null`); on ne le fabrique pas ici en
      // acceptant une ligne partielle qu'une jointure future rendrait.
      if (height === null || weight === null || rawGender === "") continue;
      lineBodies.set(memberId, {
        heightCm: height,
        weightKg: weight,
        gender: (MEAL_BODY_GENDERS as readonly string[]).includes(rawGender)
          ? (rawGender as MouthBody["gender"])
          // Une valeur hors vocabulaire vaut `null`, jamais un repli sur
          // `male`: les équations ont des coefficients par sexe, et choisir
          // serait assigner — sur le corps d'un enfant, le plus souvent.
          : null,
        ageYears: age,
        // ⚠️ LU DEPUIS LA RPC, QUI LE REND DEPUIS LE 2026-08-18. Hors
        // vocabulaire ⇒ `null`, jamais un repli sur un cran: le repli
        // documenté est l'hypothèse (1,5 adulte, 1,6 enfant), et choisir un
        // cran à la place de quelqu'un ferait peser une réponse qu'il n'a pas
        // donnée. Sur un MINEUR, `childActivityFactor` empêche en plus ce
        // champ de faire DESCENDRE son besoin.
        activityLevel:
          (ACTIVITY_LEVELS as readonly string[]).includes(
              String(row.activity_level ?? "").trim(),
            )
            ? (String(row.activity_level).trim() as ActivityLevel)
            : null,
        // ── ② LES DEUX AXES (2026-08-20) ──────────────────────────────
        // MÊME règle de lecture que le cran juste au-dessus: hors vocabulaire
        // ⇒ `null`, jamais un repli. `asked` vient d'un BOOLÉEN rendu par la
        // RPC (`activity_axes_asked_at is not null`), et c'est lui — lui seul —
        // qui sépare « pas posé » de « pas répondu » dans le compteur.
        activityAxes: {
          day: (DAY_ACTIVITY_LEVELS as readonly string[]).includes(
              String(row.day_activity ?? "").trim(),
            )
            ? (String(row.day_activity).trim() as DayActivityLevel)
            : null,
          sport: (SPORT_FREQUENCIES as readonly string[]).includes(
              String(row.sport_frequency ?? "").trim(),
            )
            ? (String(row.sport_frequency).trim() as SportFrequency)
            : null,
          asked: row.activity_axes_asked === true,
        },
        // ── ⑤ L'APPÉTIT (2026-08-20) ─────────────────────────────────
        // MÊME règle de lecture: hors vocabulaire ⇒ `null`, jamais un repli
        // sur un cran. `null` rend x1,00, un neutre VRAI.
        appetite: (APPETITE_LEVELS as readonly string[]).includes(
            String(row.appetite ?? "").trim(),
          )
          ? (String(row.appetite).trim() as AppetiteLevel)
          : null,
      });
      // ── ① CE QU'ELLE PREND À CÔTÉ DU PLAT (2026-08-20) ──────────────────
      //
      // ⛔ DANS UNE MAP À PART, PAS SUR `MouthBody`. Une structure de repas
      // n'est pas une mesure du corps: elle ne rentre dans AUCUNE équation
      // d'entretien, elle n'est lue que par `composedDishShare`. Les mêler
      // ferait passer une déclaration sur l'assiette pour un fait corporel —
      // et `MouthBody` traverse des chemins (Schofield, Mifflin) où rien de ce
      // genre n'a à entrer.
      //
      // ⚠️ ET LA LIGNE EXISTE MÊME QUAND LA QUESTION N'A PAS ÉTÉ POSÉE. La map
      // ne porte une entrée que si `meal_structure_asked` est vrai; l'ABSENCE
      // d'entrée est ce que `AnchorMouth.structure = null` veut dire, c'est-à-
      // dire `not_asked`. Poser un objet à trois `null` ici ferait lire « on a
      // demandé, personne n'a répondu » sur toute la base d'avant le lot.
      if (row.appetite_asked === true) row_appetite_asked.add(memberId);
      if (row.meal_structure_asked === true) {
        lineStructures.set(memberId, {
          dessert: typeof row.takes_dessert === "boolean" ? row.takes_dessert : null,
          cheese: typeof row.takes_cheese === "boolean" ? row.takes_cheese : null,
          bread: typeof row.takes_bread === "boolean" ? row.takes_bread : null,
        });
      }
    }
    // ── ③ LES JOURS QUE LE FOYER NE DÉPLACE PAS (2026-08-20) ────────────
    //
    // « Le dimanche c'est rôti. » Casser un de ces jours fait fermer l'app —
    // pas parce que le plat est mauvais, parce qu'il est DÉPLACÉ.
    //
    // ⚠️ `keel_household_traditions_for` PREND LE FOYER EN ARGUMENT, comme
    // `keel_household_bodies_for` et pour la même raison: `auth.uid()` est NULL
    // sous la clé de service, et une RPC gatée dessus serait morte ici.
    //
    // ⚠️ FAIL-SOFT, ET LA DIRECTION EST CHOISIE. Une lecture en panne rend `[]`
    // — c'est-à-dire le produit d'avant ce lot. La direction inverse (refuser
    // de composer) ferait qu'une table indisponible empêche un foyer de dîner.
    let traditions: HouseholdTradition[] = [];
    {
      const traditionRes = await admin.rpc("keel_household_traditions_for", {
        p_household: householdId,
      });
      if (traditionRes.error) {
        issues.push("household_traditions_unreadable");
      } else {
        traditions = parseTraditions(traditionRes.data ?? []);
      }
    }

    // ── LES RESTRICTIONS DE MAISON ──────────────────────────────────────
    // Lues telles quelles. Le fait qu'elles soient LÉGITIMES a déjà été tranché
    // à l'écriture (`keel_household_add_restriction`: compte maître, membre de
    // ce foyer). Les rejuger ici ferait une seconde définition de la règle, qui
    // divergerait.
    //
    // ⚠️ CETTE TABLE NE CONTIENT QUE DU POUVOIR DOMESTIQUE. Les allergies du
    // foyer vivent dans `household_member_allergies`, lue plus bas avec l'union
    // de sécurité — voir l'en-tête de `household_safety.ts` pour la raison, qui
    // est que le verrou d'en dessous EFFACE le « pourquoi » du plat.
    const restrRes = await admin
      .from("household_food_restrictions")
      .select("member_id, label")
      .eq("household_id", householdId);
    if (restrRes.error) throw restrRes.error;
    const nameOf = new Map(members.map((m) => [m.memberId, m.displayName]));
    const restrictions: HouseholdRestriction[] =
      ((restrRes.data ?? []) as Array<{ member_id: string; label: string }>)
        .filter((r) => nameOf.has(r.member_id))
        .map((r) => ({
          memberId: r.member_id,
          memberDisplayName: nameOf.get(r.member_id)!,
          label: r.label,
        }));

    // ── LES ENVIES DE LA SEMAINE ────────────────────────────────────────
    // ── L'ANCRE EST LE LUNDI, PAS LE JOUR DE DÉPART (lot 5) ─────────────
    // La lecture filtrait sur `week_start = startsOn`. Une ligne écrite lundi
    // n'était alors PAS trouvée par une composition lancée mercredi: le foyer
    // recevait un plan qui ignorait ce qu'il avait demandé, sans une seule
    // erreur nulle part. `keel_household_submit_envy` recale à l'écriture sur
    // le lundi ISO; on recale ici à la lecture, avec la même arithmétique.
    // Une semaine PASSÉE ne remonte donc jamais — c'est toute la raison pour
    // laquelle cette table garde une ancre plutôt qu'une colonne éternelle.
    const envyWeek = weekStartOf(startsOn);
    const envyRes = await admin
      .from("household_envy_submissions")
      .select("body")
      .eq("household_id", householdId)
      .eq("week_start", envyWeek)
      .maybeSingle();
    if (envyRes.error) throw envyRes.error;
    // UNE LIGNE, ÉCRITE PAR LE COMPTE MAÎTRE POUR TOUT LE MONDE. La récolte
    // par membre est morte au lot 5 (elle faisait relancer tout le monde), et
    // avec elle le pont user_id → member_id: le bloc n'a plus de nom à porter.
    const envyLine = ((envyRes.data ?? null) as { body: string } | null)?.body ?? null;

    // ── LA MÉTHODE: CELLE DU COMPTE MAÎTRE ──────────────────────────────
    // Un foyer suit UNE méthode. Mélanger celles de deux coachs produirait un
    // plan qu'aucun des deux n'a écrit, signé des deux — exactement ce que le
    // verrou existe pour empêcher.
    //
    // ══════════════════════════════════════════════════════════════════════
    // LOT C ① — LA MÉTHODE NE BOUGE PAS; LE FILTRE PAR OBJECTIF SUIT LA BOUCHE.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ CETTE LIGNE ÉTAIT `loadPublishedDoctrine(admin, userId)`, ET C'EST LE
    // DÉFAUT MESURÉ LE 2026-08-19. La variante servie était compilée sur
    // `student_goals.goal` du TITULAIRE seul: sur un foyer dont la maîtresse de
    // maison est en `fat_loss` et dont l'athlète est en `muscle_gain`, la
    // croyance que le coach a écrite POUR la prise de muscle était absente des
    // 6 prompts sur 6. Le coach, lui, reste le même — c'est le seul point qui
    // n'était pas négociable.
    //
    // ⚠️ `composedMembers` ET PAS `members`: les bouches que CETTE composition
    // couvre, après les prises de main et les défusions. Une personne qui
    // compose sa semaine de son côté ne doit pas tirer une ligne de doctrine
    // dans la casserole d'un foyer où elle ne mange pas.
    //
    // ⛔ LES MINEURS N'Y ENTRENT PAS, ET C'EST UNE DÉCISION, PAS UN OUBLI.
    // `goalApplies` ouvre bien la direction de service d'un mineur depuis le
    // 2026-08-14 — une direction est une consigne de service. Mais ce bloc-ci
    // écrirait, dans le prompt, le PRÉNOM D'UN ENFANT à côté d'un jeton
    // d'objectif (« Zoe (fat_loss) »), et le prompt est la seule chose qui se
    // retrouve, mesurée quatre runs sur quatre, recopiée dans un champ lu à
    // voix haute à table. « Le corps d'un mineur ne s'énonce jamais » couvre
    // aussi la direction qu'on lui prête. Un enfant reçoit la variante du
    // titulaire, comme avant ce lot.
    const doctrine = await loadHouseholdDoctrine(admin, {
      ownerUserId: userId,
      tableGoals: composedMembers
        .filter((m) => m.ageState === "adult" && m.goal !== null && !m.isOwner)
        .map((m) => ({ goal: m.goal as GoalToken, who: m.displayName })),
    });
    if (!doctrine.coachId) {
      return jsonResponse(req, { error: "no_coach", request_id: requestId }, { status: 409 });
    }
    const beliefKeys = doctrineBeliefsFor(doctrine)
      .map((b) => String(b.key ?? "").trim())
      .filter(Boolean);
    const coachNote = await loadCoachNote(admin, userId);

    // ── ③ LA POSITION DU COACH, RÉDUITE ──────────────────────────────────
    // Le foyer suit UNE méthode, celle du compte maître (c'est déjà la règle du
    // verrou de doctrine, juste au-dessus). `doctrine.coachId` est non nul ici
    // — la fonction a rendu 409 sinon. Une doctrine ILLISIBLE vaut
    // `no_counting`: fail-closed, exactement comme `countingStanceFrom` le
    // documente.
    //
    // ⚠️ HISSÉ ICI LE 2026-08-19, ET LE DÉPLACEMENT EST LA MOITIÉ DU LOT. Ce
    // bloc vivait APRÈS l'appel modèle, avec le dimensionnement des boîtes. Or
    // le PROMPT a besoin de savoir combien de poids différents la table sert:
    // sans ce nombre, le modèle écrit une boîte par CLASSE (adultes ensemble,
    // mineurs ensemble) et `sizeBoxesFromTarget` ne peut plus rien appliquer
    // (`shared_mixed`). Un seul `const`, deux lecteurs.
    const coachCounting = countingStanceFrom({
      hasCoach: true,
      doctrineReadable: doctrine.doctrine !== null,
      forbiddenTokens: (doctrine.doctrine?.forbidden ?? [])
        .map((f) => String(f.token ?? "").trim())
        .filter(Boolean),
    });

    // ══════════════════════════════════════════════════════════════════════
    // ⛔ LA CEINTURE TCA D'UNE BOUCHE — QUATRE ÉTATS, ET C'EST LE CORRECTIF
    //    DU 2026-08-19.
    // ══════════════════════════════════════════════════════════════════════
    // C'était `member.body?.restrictionFlag ?? true`, DANS le module pur:
    // l'objet du COMPTE (`MealBodyContext`) décidait du sort du corps de la
    // FICHE. Toute bouche sans compte valait `true`, donc `restriction_floor`,
    // donc aucun dimensionnement — et le journal annonçait un plancher
    // alimentaire là où il n'y avait qu'une absence de compte. Mesuré sur
    // 4 plans / 3 foyers: `{"sized":1,"restriction_floor":3,"no_body":0}`.
    //
    // ⚠️ LA DISTINCTION SE FAIT ICI PARCE QUE C'EST ICI QU'ON SAIT. `userId`
    // n'existe pas sur `PortionMember` (c'est voulu: une bouche EST un
    // `member_id`), et le module pur ne peut donc pas savoir si le `null` de
    // `body` veut dire « pas de compte » ou « compte illisible ». Le
    // générateur, lui, a la ligne de roster sous la main.
    //
    // ⚠️ LE FAIL-CLOSED N'EST PAS LEVÉ, IL EST RESSERRÉ SUR L'INCONNU: un
    // compte dont la lecture de corps a échoué, ou dont le verdict de plancher
    // est illisible, reste fermé — sous le nom `restriction_unknown`.
    const restrictionOf = (m: LoadedMember): MouthRestrictionState => {
      if (m.userId === null) return "no_account";
      if (m.body === null || m.body.restrictionFlag === null) return "unreadable";
      return m.body.restrictionFlag ? "raised" : "clear";
    };
    // COMBIEN DE POIDS DIFFÉRENTS LA TABLE SERT — le seul résultat du moteur
    // qui entre dans le prompt, et il n'y entre que comme un NOMBRE DE BOÎTES.
    // ⚠️ Le cran de rythme (`paceByMember`) n'est lu qu'APRÈS le modèle: ce
    // compte porte donc la part de FICHE seule. Il ne peut être que bas d'une
    // unité, jamais haut — voir `weightGroupCount`.
    const promptWeightGroups = weightGroupCount(
      bodyShareFactors(
        members.map((m) => ({
          memberId: m.memberId,
          ageState: m.ageState,
          restriction: restrictionOf(m),
          body: lineBodies.get(m.memberId) ?? null,
        })),
        coachCounting,
      ),
    );

    // ── LES INTERDITS DU COACH, DANS LA FORME DU MATCHER ─────────────────
    // Miroir de `findDoctrineViolations` (`doctrine.ts:1088-1099`), qui n'exporte
    // pas cette projection.
    //
    // ⚠️ HISSÉ ICI PAR LE SEAM DU BROUILLON, comme sur la lane individuelle: il
    // vivait avec FF-061, donc APRÈS l'appel modèle, et la garde d'entrée de la
    // phrase de reprise en a besoin AVANT. Un seul `const`, deux lecteurs — une
    // seconde projection en ferait une troisième copie de la même liste.
    const doctrineForbidden: ForbiddenTerm[] = (doctrine.doctrine?.forbidden ?? [])
      .map((f) => ({
        ruleId: String(f.token ?? "").trim(),
        token: String(f.token ?? "").trim(),
        surfaceForms: f.surfaceForms,
      }))
      .filter((t) => t.token.length > 0);

    // ── LA PHRASE ÉCRITE SUR UN BROUILLON (§4.3.2) ───────────────────────
    //
    // Même garde et même tuyau que la lane individuelle: elle s'AJOUTE en queue
    // du message par le point de composition unique, elle ne remplace aucun
    // bloc, et elle est jugée AVANT tout appel modèle.
    //
    // ⚠️ `restrictionFlag` — CELUI DU COMPTE QUI COMPOSE, en fail-closed. Le
    // foyer n'a pas de plancher TCA de foyer (`restriction_flag` est par
    // membre); c'est à la personne qui écrit la phrase qu'on doit le plancher,
    // et c'est elle qui l'écrit. Même arbitrage que la porte 1 de FF-061, dix
    // lignes plus bas dans ce fichier.
    let draftNoteSuffix = "";
    // ── LOT 2D · LE VERDICT SURVIT À CE BLOC, ET LUI SEUL ──────────────────
    // Il est relu ~3200 lignes plus bas, APRÈS l'écriture du plan du foyer,
    // pour ranger ce que le maître a demandé (`classifyAndPersistDraftNote`).
    //
    // ⛔ C'EST LE VERDICT QU'ON GARDE, PAS `body.draft_note` NI `note.usable`.
    // Le classifieur exige un `DraftNoteVerdict` — seul `readDraftNote` en
    // produit — parce que sa charge repart au modèle: une `string` rouvrirait
    // la garde d'entrée dans un second appel. Le type ferme la porte, et
    // remplacer cette variable par une chaîne ne compilerait pas.
    let draftNoteVerdict: DraftNoteVerdict | null = null;
    if (operation === "compose" && hasDraftNote(body.draft_note)) {
      const note = readDraftNote({
        raw: body.draft_note,
        doctrineForbidden,
        restrictionFlag:
          composedMembers.find((m) => m.userId === userId)?.body?.restrictionFlag ??
            true,
      });
      console.log(JSON.stringify({
        tag: "keel.household_meal.draft_note",
        user_id: userId,
        intent,
        refusal: note.refusal,
        dropped: note.dropped,
      }));
      // `usable === null` testé AVEC le refus, jamais rattrapé par un `?? ""`:
      // une puce vide serait une demande que personne n'a écrite.
      if (note.refusal !== null || note.usable === null) {
        // ⚠️ LITTÉRAL, JAMAIS UN TERNAIRE — `planRefusals.int.test.ts` ne voit
        // que les chaînes littérales dans `jsonResponse(req, { error: "…" })`.
        return jsonResponse(req, {
          error: "note_unusable",
          request_id: requestId,
        }, { status: 400 });
      }
      draftNoteSuffix = `\n\n${draftNoteInstruction(note.usable)}`;
      // ⚠️ APRÈS LES DEUX REFUS CI-DESSUS, JAMAIS AVANT. Une note refusée sort
      // en 400 et n'atteint jamais l'écriture: le classifieur ne verra donc
      // que des verdicts que la garde a laissés passer.
      draftNoteVerdict = note;
    }

    let protocolBlock = "";
    try {
      const protocol = await loadPublishedProtocol(admin, userId);
      protocolBlock = protocolBlockFor(protocol, doctrine.doctrine?.coachDisplayName ?? null);
    } catch (error) {
      console.warn(`[${FN_NAME}] coach food mapping unavailable`, error);
    }

    // ── LES CONTRAINTES DURES: L'UNION DU FOYER ─────────────────────────
    // Une allergie d'un seul membre gouverne TOUTE la casserole. C'est la
    // seule lecture de ce fichier qui s'applique aussi aux mineurs, et c'est
    // délibéré: refuser un objectif à un enfant n'a rien à voir avec ignorer
    // son allergie.
    //
    // ⚠️ LA PREMIÈRE RÉDACTION DE CE BLOC ÉTAIT FAUSSE, et le typecheck ne
    // l'a pas vue: elle traitait le retour comme un objet portant un champ
    // `.constraints`, derrière un `as any` posé pour faire passer le client.
    // `loadStudentSafetyConstraints` rend un TABLEAU. Le cast désarmait
    // exactement le contrôle qui l'aurait dit — la leçon
    // `as-cast-on-foreign-type-disarms-typecheck` du dépôt, commise à
    // nouveau. Le type est donc explicite ici, et l'union est une
    // concaténation.
    //
    // ET UNE LECTURE CASSÉE NE DOIT PAS DÉGRADER EN « AUCUNE CONTRAINTE ».
    // Sur le chemin individuel, un `catch` qui avale l'erreur laisse l'élève
    // sans son verrou d'allergène pour un repas. Ici il l'enlèverait à TOUT LE
    // FOYER, y compris aux enfants. On refuse la composition plutôt que de la
    // rendre sans ceinture.
    const constraints: StudentSafetyConstraint[] = [];
    for (const id of accountIds) {
      try {
        constraints.push(...await loadStudentSafetyConstraints(admin as never, id));
      } catch (error) {
        await logEdgeFunctionError({
          functionName: FN_NAME,
          requestId,
          error,
          metadata: { source: "safety_constraints", member: id },
        });
        return jsonResponse(req, {
          error: "safety_constraints_unreadable",
          detail: "We could not read this household's hard constraints, and we " +
            "will not cook without them.",
          request_id: requestId,
        }, { status: 503 });
      }
    }

    // ── LES ALLERGIES DES BOUCHES SANS COMPTE (lot 4) ───────────────────
    //
    // La boucle du dessus ne parcourt que `accountIds`, et c'était le trou:
    // `student_safety_constraints` est clée sur `user_id`, donc l'allergie
    // d'un enfant de six ans n'entrait dans AUCUNE union — alors que l'écran
    // du foyer la réclamait. Le produit promettait ce qu'il ne tenait pas, et
    // le silence tombait du côté dangereux.
    //
    // MÊME FAIL-CLOSED, ET C'EST NON NÉGOCIABLE. Un `catch` qui avale l'erreur
    // ici retirerait sa ceinture à la seule population qui ne peut pas la
    // redéclarer elle-même. `loadHouseholdAllergies` lève; on refuse la
    // composition, exactement comme au-dessus.
    let householdAllergies: HouseholdAllergyRow[];
    try {
      householdAllergies = await loadHouseholdAllergies(admin as never, householdId);
    } catch (error) {
      await logEdgeFunctionError({
        functionName: FN_NAME,
        requestId,
        error,
        metadata: { source: "household_allergies", household: householdId },
      });
      return jsonResponse(req, {
        error: "safety_constraints_unreadable",
        detail: "We could not read this household's hard constraints, and we " +
          "will not cook without them.",
        request_id: requestId,
      }, { status: 503 });
    }

    // ── LE PROMPT ───────────────────────────────────────────────────────
    const goalRow = ownerGoal as Record<string, unknown>;

    // LA SÉPARATION DES DEUX NATURES, décidée en UN endroit et pas ici.
    // `householdHardConstraints` rend l'union de sécurité d'un côté et les
    // libellés du verrou de l'autre; les calculer séparément aux deux points
    // d'appel remettrait la question « et si on mélangeait ? » à chaque
    // lecture. Une allergie qui passerait par le verrou verrait sa raison
    // MÉDICALE effacée du plat, au même rang qu'un Nutella interdit.
    const householdSplit = householdHardConstraints({
      allergies: householdAllergies,
      houseRules: restrictions,
      // La langue du foyer est celle du compte maître, comme le reste de ce
      // qui gouverne la composition — et c'est MAINTENANT la même expression
      // que celle qui écrit le prompt et la ligne en base. Elle valait
      // `goalRow.content_locale`, une autre colonne, semée `'en-GB'` par tous
      // ses écrivains: les libellés du verrou pouvaient donc être anglais dans
      // un plan français.
      contentLocale: householdContentLocale,
    });
    constraints.push(...householdSplit.safetyConstraints);
    if (householdSplit.safetyConstraints.length > 0) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.member_allergies",
        user_id: userId,
        household_id: householdId,
        rows: householdAllergies.length,
        refs: householdSplit.safetyConstraints.length,
      }));
    }

    // ── À QUI EST CHAQUE CONTRAINTE DURE (2026-08-19) ────────────────────
    //
    // ⛔ LE DÉFAUT QUE CE BLOC FERME, MESURÉ SUR DEUX RUNS RÉELS. Les lignes
    // partaient au modèle DÉTACHÉES de leur bouche — `- pistachio — allergy`,
    // sous un en-tête AU SINGULIER pour une tablée de quatre. F1
    // (`f0100001-…`) a deviné la bouche et deviné juste par chance; F2
    // (`f0100002-…`) a mis 120 g de traybake au pistachio dans la boîte de
    // l'ALLERGIQUE et écrit l'avertissement sur l'assiette du VOISIN. Les deux
    // runs sont morts en 422 `empty_meal` sur le verrou binaire: le foyer
    // payait sa sécurité en semaines vides.
    //
    // Le patron copié est celui des RÈGLES DE MAISON, dix lignes plus bas dans
    // le même prompt: `- Peregrine: never serve fennel`, attachée, appliquée
    // 4 fois sur 4.
    //
    // ⚠️ DEUX CLÉS, PARCE QU'IL Y A DEUX PROVENANCES. `student_safety_
    // constraints` porte un `user_id`; `household_member_allergies` porte un
    // `member_id` et sa bouche n'a peut-être aucun compte — c'est toute la
    // raison d'être de cette table. Le roster (`members`) est la seule source
    // qui tient les deux clés, et il les tient déjà.
    const nameOfMember = new Map(
      members.map((m) => [m.memberId, m.displayName]),
    );
    const nameOfAccount = new Map(
      members
        .filter((m) => typeof m.userId === "string" && m.userId !== "")
        .map((m) => [m.userId as string, m.displayName]),
    );
    const constraintMouths = householdConstraintMouths({
      constraints,
      memberIdOf: householdSplit.memberIdOf,
      nameOfMember,
      nameOfAccount,
    });
    // ⚠️ TROIS NOMBRES, JAMAIS DEUX (cicatrice du dépôt): « déclaré / attribué »
    // rendrait le même zéro pour « aucune contrainte » et pour « quatre
    // contraintes, aucune bouche retrouvée ». Sans `unattributed`, un lot
    // désarmé ressemble exactement à un lot qui marche.
    if (constraintMouths.declared > 0) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.constraint_attribution",
        user_id: userId,
        household_id: householdId,
        declared: constraintMouths.declared,
        attributed: constraintMouths.attributed,
        unattributed: constraintMouths.unattributed,
      }));
    }

    // ══════════════════════════════════════════════════════════════════════
    // L0bis — LES CONDITIONS DÉCLARÉES DE CHAQUE BOUCHE, ET LEUR COMPTEUR
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ UNE SEULE PROVENANCE, ET ELLE EXCLUT UNE POPULATION ENTIÈRE. À la
    // différence de `constraintMouths` juste au-dessus, il n'y a PAS deux
    // sources ici: `student_safety_constraints.condition_ref` est clée sur
    // `user_id`, et il n'existe AUCUNE table `household_member_conditions`.
    // Une bouche SANS COMPTE ne peut donc porter aucune condition, et la garde
    // de grossesse ne peut pas la protéger. C'est un trou NOMMÉ — fiche
    // `L0bis-a`, décision produit n° 5 du registre foyer — pas un oubli.
    //
    // ⚠️ LE COMPTEUR A QUATRE POPULATIONS, PAS DEUX. « la garde a mordu / n'a
    // pas mordu » rendrait le même zéro pour « personne n'a déclaré » et pour
    // « quatre personnes ont un diabète et la garde les laisse passer »: un
    // branchement mort et un branchement sain donneraient le même journal.
    // `other` est la colonne qui prouve que la garde NE MORD PAS TROP LARGE.
    const conditionRefsByMember = new Map<string, string[]>();
    for (const constraint of constraints) {
      const ref = String(constraint.conditionRef ?? "").trim();
      if (ref === "") continue;
      const member = members.find((m) => m.userId === constraint.userId);
      if (!member) continue;
      const bag = conditionRefsByMember.get(member.memberId) ?? [];
      bag.push(ref);
      conditionRefsByMember.set(member.memberId, bag);
    }
    const conditionRefsOf = (memberId: string): readonly string[] =>
      conditionRefsByMember.get(memberId) ?? [];
    const conditionGate = newConditionGateCounter();
    const pregnantMouthNames: string[] = [];
    for (const m of members) {
      const population = conditionGatePopulationOf(conditionRefsOf(m.memberId));
      conditionGate[population]++;
      if (evictsPregnancyFoods(population)) pregnantMouthNames.push(m.displayName);
    }
    console.log(JSON.stringify({
      tag: "keel.household_meal.condition_gate",
      user_id: userId,
      household_id: householdId,
      // ⚠️ JOURNALISÉ SUR TOUS LES PLANS, y compris ceux où il ne compte que
      // des `none`. Un compteur qui ne parle que lorsqu'il mord ne distingue
      // pas « aucune grossesse déclarée » de « le compteur n'a pas tourné ».
      ...conditionGate,
    }));
    // ── L'ÉVICTION LISTERIA, POUR ELLE SEULE ────────────────────────────
    // ⚠️ CE N'EST PAS UNE ALLERGIE. Une allergie gouverne LA CASSEROLE; ceci
    // gouverne UNE assiette. Le bloc le dit en toutes lettres au modèle, et il
    // ne sort que pour la population `pregnancy` — l'allaitement ne le reçoit
    // pas (voir `pregnancyFoodBlockFor`).
    const pregnancyBlock = pregnancyFoodBlockFor(pregnantMouthNames);
    const pregnancySuffix = pregnancyBlock === null ? "" : `\n\n${pregnancyBlock}`;

    // ══════════════════════════════════════════════════════════════════════
    // ⛔ C1 — QUI, À CETTE TABLE, EST À RISQUE MÉDICAL. LA PREMIÈRE DES DEUX
    //         PRÉMISSES DU BLOC DE CONTAMINATION CROISÉE.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LA SÉVÉRITÉ, ET RIEN D'AUTRE. `severity='medical'` est le seul cran où
    // une trace compte: une préférence contrariée est une déception, une
    // intolérance est une mauvaise soirée, une allergie médicale est une
    // hospitalisation. Élargir à `strict` ferait sortir ce bloc sur des plans
    // qui n'en ont pas besoin et le banaliserait — c'est le mécanisme par
    // lequel une consigne cesse d'être lue.
    //
    // ⚠️ LES DEUX PROVENANCES, ET C'EST LE MÊME PONT QUE `constraintMouths`
    // dix lignes plus haut: `household_member_allergies` porte un `member_id`
    // (résolu par `memberIdOf`), `student_safety_constraints` porte un
    // `user_id` (résolu par le roster). Une seule des deux ferait un bloc qui
    // ignore soit les bouches sans compte, soit les titulaires.
    //
    // ⛔ ET LES NON ATTRIBUÉES SONT COMPTÉES, PAS OMISES. Une contrainte
    // médicale dont la bouche ne se résout pas en prénom reste une contrainte
    // médicale; l'omettre retirerait la règle pour cause de prénom manquant,
    // c'est-à-dire exactement pour la population la plus fragile. Le module
    // écrit alors « someone at this table », comme le bloc des contraintes
    // dures juste au-dessus dans le même prompt.
    const medicalMouthByMember = new Map<string, string>();
    let unnamedMedicalConstraints = 0;
    for (const c of constraints) {
      if (c.severity !== "medical") continue;
      const byMember = householdSplit.memberIdOf.get(c.id);
      if (byMember) {
        const name = String(nameOfMember.get(byMember) ?? "").trim();
        if (name !== "") {
          medicalMouthByMember.set(byMember, name);
          continue;
        }
        unnamedMedicalConstraints += 1;
        continue;
      }
      const owner = members.find((m) => m.userId && m.userId === c.userId);
      const ownerName = String(owner?.displayName ?? "").trim();
      if (owner && ownerName !== "") {
        medicalMouthByMember.set(owner.memberId, ownerName);
        continue;
      }
      unnamedMedicalConstraints += 1;
    }
    // ORDRE DU ROSTER, ET PAS ORDRE DE DÉCOUVERTE — la même raison que la liste
    // des porteurs de règle juste en dessous: le prompt nomme déjà ces bouches
    // ailleurs dans l'ordre du roster, et une liste dans un autre ordre se lit
    // comme une autre liste.
    const medicalMouths = members
      .filter((m) => medicalMouthByMember.has(m.memberId))
      .map((m) => ({ memberId: m.memberId, displayName: m.displayName }));

    // ══════════════════════════════════════════════════════════════════════
    // LOT C ② — QUI, À CETTE TABLE, PORTE UNE RÈGLE DONT UN `why` POURRAIT SE
    //           RÉCLAMER. LA LISTE FERMÉE, RÉSOLUE UNE FOIS.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ TROIS PROVENANCES, ET IL FAUT LES TROIS. Une règle qui fait choisir un
    // plat vient d'une contrainte dure (`student_safety_constraints` +
    // `household_member_allergies`), d'un régime déclaré, ou d'une règle de
    // maison. N'en prendre que deux ferait REFUSER une attribution juste: une
    // bouche omnivore dont la seule règle est « jamais de champignon » sortirait
    // de la liste, et le compteur compterait comme une mauvaise attribution ce
    // qui n'en est pas une. Un compteur qui crie faux est un compteur qu'on
    // cesse de lire.
    //
    // ⚠️ ELLE SERT AUX DEUX BOUTS — le prompt la montre au modèle, le compteur
    // valide contre elle. C'est le `const` unique du patron `dishBearers`: deux
    // résolutions feraient refuser un id que le prompt vient d'écrire.
    //
    // ⚠️ ORDRE DU ROSTER, ET PAS ORDRE DE DÉCOUVERTE. Le prompt nomme déjà ces
    // bouches quatre fois ailleurs dans l'ordre du roster (la liste d'ids, le
    // brief de portions, les absences, les règles de maison); une cinquième
    // liste dans un autre ordre se lit comme une autre liste.
    const ruleHolderIds = new Set<string>();
    for (const c of constraints) {
      const byMember = householdSplit.memberIdOf.get(c.id);
      if (byMember) {
        ruleHolderIds.add(byMember);
        continue;
      }
      // Une contrainte venue de `student_safety_constraints` porte un `user_id`
      // et pas de `member_id`: c'est le roster qui fait le pont, et c'est le
      // même pont que `householdConstraintMouths` juste au-dessus.
      const owner = members.find((m) => m.userId && m.userId === c.userId);
      if (owner) ruleHolderIds.add(owner.memberId);
    }
    for (const m of members) {
      // `diet` est déjà `null` pour « personne n'a rien demandé » et ne vaut
      // jamais `omnivore` (`DIETARY_REGIMES` n'en contient pas): un omnivore
      // n'exclut rien, donc il n'a rien qu'un `why` puisse invoquer.
      if (m.diet !== null) ruleHolderIds.add(m.memberId);
    }
    for (const r of restrictions) ruleHolderIds.add(r.memberId);
    const ruleHolders = members
      .filter((m) => ruleHolderIds.has(m.memberId))
      .map((m) => ({ memberId: m.memberId, displayName: m.displayName }));

    // ⛔ LOT C — LE MAGASIN PLAT N'ATTEINT PLUS LE PROMPT, DONC IL N'Y A PLUS
    // RIEN À RÉCONCILIER ICI.
    //
    // Ce bloc appelait `reconcileFoodPreferencesFor`, qui relisait
    // `memory_items` à CHAQUE génération pour retirer de `food_preferences` ce
    // que la conversation avait démenti. Il avait été posé le 2026-08-08 parce
    // que c'était « le troisième chemin découvert » — et la garde était juste:
    // une préférence rétractée continuait d'être servie au modèle.
    //
    // Le lot C ferme le magasin lui-même (nomenclature §2.1 et §2.6): la
    // colonne n'entre plus dans aucun prompt, ni par le tronc, ni par les voix.
    // Une préférence rétractée ne peut donc plus être servie — ce que la
    // réconciliation obtenait par une lecture par génération, la fermeture
    // l'obtient par construction. FF-026 R3 est tenue plus fort qu'avant.
    //
    // ⚠️ ET `memory_items` DISPARAÎT DE CETTE LANE. C'est mesurable, et un test
    // l'exige: `grep -rn memory_items supabase/functions/generate-*` rend zéro.

    // ══ LOT 1C · LA MÉMOIRE STRUCTURÉE ENTRE ICI ═══════════════════════════
    //
    // ⚠️ AVANT `const pc`, et c'est la seule place possible: `logistics.set`
    // CORRIGE `practical_constraints`, et `pc` est la référence que TOUS les
    // lecteurs de cette colonne partagent ensuite (rythme, capacité,
    // équipement). Poser le correctif après cette ligne le rendrait invisible
    // à tous, et la trace dirait le contraire du prompt.
    //
    // Chaque famille va où son lecteur l'attend (nomenclature §2 axe 1):
    //   `food.*` / `method.*` → le bloc DES VOIX, sous le titulaire concerné
    //                           (voir plus bas — jamais le tronc, D4/L6);
    //   `portion.adjust`      → l'audience, calculée ICI sur le vrai roster;
    //   `rhythm.set`          → l'union des moments de la maison;
    //   `logistics.set`       → `practical_constraints`, ici;
    //   `craving`             → la ligne d'envies du foyer.
    const retainedDurable = readRetainedItems(
      goalRow.practical_constraints as Record<string, unknown> | null,
    );
    // ⚠️ CE BLOC ÉTAIT DOUBLEMENT FAUX JUSQU'AU LOT 1J. Il disait que le canal
    // `next_plan` de cette lane était `household_envy_submissions`, « clé sur
    // `household_id` », et que c'était « la différence avec les deux lanes
    // individuelles, où le vide est structurel ». Le canal a déménagé (§7.2),
    // et l'ancienne clé `user_id` de cette table a été DROPPÉE (§7.1): il n'y a
    // donc plus ni ce magasin-là, ni cette différence-là.
    //
    // CE QUI EST VRAI: `nextPlanItemsFor({admin, userId, today})` lit
    // `student_goals.practical_constraints.retained_next_plan`, PAR `user_id`
    // SEUL, et les TROIS lanes sont servies par le même chemin — le solo comme
    // le foyer. `household_envy_submissions` reste ce qu'il a toujours été: la
    // phrase libre du maître pour toute la maison (`envyLine`, plus bas), une
    // ligne par foyer et par semaine.
    let retainedNextPlan: RetainedItem[] = [];
    try {
      retainedNextPlan = await nextPlanItemsFor({
        admin,
        userId,
        today: todayDate,
      });
    } catch (error) {
      // BEST-EFFORT: un générateur qui rend une erreur à une famille le samedi
      // soir est un produit mort (§8.4).
      console.warn(`[${FN_NAME}] next_plan retained items unreadable`, error);
      issues.push("retained_next_plan_unreadable");
    }
    const routedRetained = routeRetainedItems([
      ...retainedDurable.items,
      ...retainedNextPlan,
    ]);
    // ⚠️ LE MAGASIN LU EST CELUI DU SEUL TITULAIRE QUI COMPOSE — LES DEUX
    // MAGASINS, ET LE TROU EST PLUS LARGE QUE CE QU'ON A LONGTEMPS ÉCRIT ICI.
    //
    // Ce commentaire ne nommait que le magasin DURABLE (`retained_items`, que
    // `loadHouseholdVoices` ne lit pas encore). Il manquait la moitié qui coûte
    // le plus cher: `nextPlanItemsFor` est appelée avec le `userId` de la seule
    // personne qui appuie sur le bouton, donc **les envies de la semaine
    // déposées par les AUTRES titulaires ne sont lues par PERSONNE**. Elles
    // vivent dans LEUR `practical_constraints.retained_next_plan`, et aucun
    // chemin de cette lane n'y descend. Un membre qui écrit « des fajitas cette
    // semaine » sur son propre compte voit sa demande enregistrée, affichée sur
    // sa carte, et sans le moindre effet sur le plan de la maison — dès que ce
    // n'est pas lui qui compose.
    //
    // ⛔ TROU NOMMÉ, PAS UN OUBLI DE CÂBLAGE, et il ne se referme pas ici: qui
    // parle pour la maison quand deux titulaires demandent des choses opposées
    // est une DÉCISION PRODUIT (le §2 axe 3 de la nomenclature ne tranche que
    // les portions). Techniquement, fermer les deux moitiés demande d'écrire
    // dans `household_voices_io.ts`, qui n'appartient pas à ce lot.
    const ownerMemberId = members.find((m) => m.userId === userId)?.memberId ??
      null;
    const ownerSubject = ownerMemberId ? memberSubject(ownerMemberId) : null;
    // `household` ET la bouche du titulaire: c'est SA colonne qu'on lit, donc
    // un item qu'il aurait écrit sur lui-même le concerne. Les autres bouches
    // sont comptées (`otherSubjects`), jamais appliquées — appliquer la règle
    // d'une bouche à la table entière est exactement ce que l'axe 3 interdit.
    const retainedSpeaksFor = ownerSubject
      ? [HOUSEHOLD_SUBJECT, ownerSubject]
      : [HOUSEHOLD_SUBJECT];
    const retainedLogistics = logisticsOverlayFor({
      items: routedRetained.logistics,
      speaksFor: retainedSpeaksFor,
    });
    if (Object.keys(retainedLogistics.patch).length > 0) {
      goalRow.practical_constraints = {
        ...(goalRow.practical_constraints ?? {}) as Record<string, unknown>,
        ...retainedLogistics.patch,
      };
    }
    const retainedRhythm = rhythmOverlayFor({
      items: routedRetained.rhythm,
      speaksFor: retainedSpeaksFor,
    });
    const retainedComposition = compositionLinesFor({
      items: routedRetained.composition,
      speaksFor: retainedSpeaksFor,
    });
    const retainedCravings = cravingLinesFor({
      items: routedRetained.craving,
      speaksFor: retainedSpeaksFor,
    });
    // ── `portion.adjust` · L'AUDIENCE, SUR LE VRAI ROSTER ─────────────────
    //
    // C'est la SEULE des trois lanes qui a des bouches avec leur `ageState`,
    // donc la seule où la règle du §2 axe 3 a quelque chose à mordre: un
    // ajustement À LA BAISSE sans sujet explicite ne s'applique pas à un
    // mineur, ni à une bouche dont l'âge n'a pas été saisi.
    //
    // ⛔ LA RÈGLE N'EST PAS RÉÉCRITE ICI. `subjectsForPortionAdjust` (socle) la
    // tient; `portionAdjustsFor` ne fait que l'appeler par item. Deux copies
    // divergeraient, et c'est celle qu'on relit le moins qui retirerait de la
    // nourriture à un enfant, en silence.
    //
    // ⛔ ET RIEN N'EST TRADUIT EN ÉNERGIE ICI. `envelopeFor` est le lecteur, et
    // la traduction vit dans `applyPortionAdjust`, en aval, là où le plancher
    // TCA s'applique. Ce bloc transmet `{direction, magnitude}` intacts.
    const retainedPortion = portionAdjustsFor(
      routedRetained.portion,
      members.map((m) => ({ memberId: m.memberId, ageState: m.ageState })),
    );
    /**
     * ── LOT 1G · CE QUI PART À L'ENVELOPPE, BOUCHE PAR BOUCHE ─────────────
     *
     * Une fonction et pas un littéral recopié dans la résolution: deux
     * constructions du même couple divergeraient, et celle qu'on relit le
     * moins finirait par passer une bouche sans son `ageState` — c'est-à-dire
     * la garde du §2 axe 3 désarmée sans qu'une ligne ne le dise.
     *
     * ⚠️ `items` EST LA LISTE ENTIÈRE, PAS `retainedPortion`. Le filtrage par
     * bouche est le travail de `subjectsForPortionAdjust`, appelé par
     * `winningPortionAdjust` avec le roster réduit à cette bouche. Pré-filtrer
     * ici ferait une seconde application de la règle, en amont de celle qui
     * fait autorité. `retainedPortion` sert au CONSTAT (qui est exclu, et
     * pourquoi), calculé sur le VRAI roster — pas à l'effet.
     */
    const portionAdjustFor = (
      mouth: { memberId: string; ageState: MemberAgeState },
    ): PortionAdjustFor => ({
      mouth: { memberId: mouth.memberId, ageState: mouth.ageState },
      items: routedRetained.portion,
    });
    // ⚠️ `composedMembers`, PAS `members` (L3). Cette résolution décide la
    // DIRECTION DE SERVICE du tronc commun et les add-ons par bouche: y laisser
    // quelqu'un qui mange son propre plan tirerait la casserole vers un
    // objectif que personne à cette table ne porte, et promettrait des grammes
    // à un absent dans `member_deltas`.
    const composerMemberId =
      composedMembers.find((m) => m.userId === userId)?.memberId ?? null;
    const resolution = resolveHousehold({
      members: composedMembers.map((m) =>
        toHouseholdMember(
          m,
          // ① L'ENVELOPPE DU COMPTE. `goalApplies` a déjà mis `goal` à `null`
          // pour un mineur et pour une bouche d'âge inconnu, donc aucune
          // enveloppe d'OBJECTIF n'en dérive — la garde vit là-bas, pas ici.
          // Elle porte la série de pesées et le plancher TCA, et c'est pour ça
          // qu'elle gagne toujours dans `mouthEnvelope`, y compris dégradée.
          m.goal === null || m.body === null ? null : envelopeFor(
            // ── L0bis · LA GROSSESSE ANNULE LE DÉFICIT DE **CETTE** BOUCHE ──
            // ⛔ PAR BOUCHE, jamais pour la table: une condition déclarée par
            // une personne ne doit pas rabattre l'objectif de son conjoint.
            // C'est la même clause C8 que la chaîne de grammage, appliquée à
            // l'enveloppe. Et seul `fat_loss` est coercé — voir
            // `goalUnderConditionGate`.
            goalUnderConditionGate(
              (GOAL_TOKENS as readonly string[]).includes(m.goal)
                ? (m.goal as GoalToken)
                // Repli du 2026-08-18: valait `"health"`, qui n'existe plus.
                // `maintenance` est ce sur quoi `health` se replie, et c'est la
                // seule lecture sûre d'un jeton illisible — elle ne creuse aucun
                // déficit et n'ouvre aucun surplus.
                : "maintenance",
              conditionGatePopulationOf(conditionRefsOf(m.memberId)),
            ).goal,
            m.body,
            m.body.ageBand,
            // FAIL-CLOSED, comme sur la lane individuelle.
            m.body.restrictionFlag ?? true,
            // Le pilotage du coach du foyer n'entre pas ici: le tronc est
            // commun, et la doctrine qui le gouverne est celle du RÉFÉRENT,
            // pas celle de chaque membre. À instruire avec FF-043 §11.
            null,
            // ⚠️ CE QUI EST BRANCHÉ, ET CE QUI NE L'EST PAS ENCORE.
            // On lit le cran de la FICHE de cette bouche
            // (`household_member_bodies`, via `keel_household_bodies_for`).
            // Le cran d'un COMPTE vit sur `profiles.activity_level`, et cette
            // lane ne charge pas les profils des membres — elle charge des
            // corps par `member_id`. `null` en sortie veut alors dire « on ne
            // sait pas » et rend l'hypothèse 1,5, c'est-à-dire EXACTEMENT le
            // comportement d'avant ce lot: rien ne se dégrade, une moitié
            // reste à câbler. Le chargement du profil par membre appartient au
            // lot qui fait entrer la cible dans les grammages (L8), qui
            // traverse déjà cette résolution.
            lineBodies.get(m.memberId)?.activityLevel ?? null,
            // ── ② LES DEUX AXES, PAR LE MÊME CHEMIN QUE LE CRAN ──────────
            // Même source (`keel_household_bodies_for`), même limite: cette
            // lane lit des CORPS par `member_id`, pas des profils. Une bouche
            // sans corps de fiche rend `{null, null, asked: false}`, et
            // `activityFactorOf` retombe alors sur le cran, puis sur
            // l'hypothèse — c'est-à-dire EXACTEMENT le nombre d'avant ce lot.
            lineBodies.get(m.memberId)?.activityAxes ??
              { day: null, sport: null, asked: false },
            // ⑤ — même source, même limite. Une bouche sans corps de fiche rend
            // `null`, c'est-à-dire x1,00: le nombre d'avant ce lot.
            lineBodies.get(m.memberId)?.appetite ?? null,
            // ── `portion.adjust` · BRANCHÉ (lot 1G) ───────────────────────
            // Le défaut n'était PAS une traduction manquante, c'était un ORDRE:
            // cette résolution vivait ~430 lignes AU-DESSUS de la lecture des
            // items retenus. Le lot 1G a descendu le bloc entier sous cette
            // lecture — un déplacement, sans une ligne réécrite.
            //
            // ⛔ L'AUDIENCE NE SE CALCULE PAS ICI. On passe la bouche et les
            // items; `winningPortionAdjust` (meal_envelope) appelle
            // `subjectsForPortionAdjust` avec le roster réduit à CETTE bouche.
            // La règle du §2 axe 3 mord donc là où elle est écrite, une seule
            // fois: un mineur — et une bouche dont l'âge n'a pas été saisi — ne
            // reçoit aucun `down` sans sujet explicite, et l'exclusion sort
            // dans `keel.household_meal.retained_items` avec son motif.
            portionAdjustFor(m),
          ),
          // ② LE CORPS DE LA FICHE — REQUIS, et c'est lui qui répare le lot.
          // Il n'achète qu'une MAINTENANCE (pédiatrique pour un mineur), jamais
          // un objectif: sans série de pesées il n'y a pas de plancher TCA
          // derrière, donc rien qui puisse arrêter une restriction. Une
          // maintenance ne peut que faire descendre le tronc ou ouvrir un
          // add-on. `mouthEnvelope` porte la règle; ici on ne fait que fournir.
          lineBodies.get(m.memberId) ?? null,
        )
      ),
      declaredReferenceMemberId: refRes.data?.reference_member_id ?? null,
      composerMemberId,
      daysCovered: 7,
    });
    issues.push(...resolution.issues);
    console.log(JSON.stringify({
      tag: "keel.household_meal.composition",
      user_id: userId,
      household_id: householdId,
      // LE MODE MÉLANGE les deux populations (un membre protégé, ou aucune
      // enveloppe calculable): il ne désigne personne. C'est la raison pour
      // laquelle il est journalisable.
      mode: resolution.mode,
      deltas: resolution.deltas.length,
      family_service: resolution.familyService,
      // ══════════════════════════════════════════════════════════════════════
      // ⛔ CE QUI ÉTAIT ÉCRIT ICI ÉTAIT UN KCAL/JOUR PAR BOUCHE, DANS UN LOG
      // NOMINATIF, SANS QU'AUCUNE PORTE N'AIT TOURNÉ.
      // ══════════════════════════════════════════════════════════════════════
      //
      // `residual_gaps: resolution.residualGaps.map((g) => g.gapKcalPerDay)`
      // partait à côté de `user_id` ET de `household_id`, dans l'ordre des
      // membres — donc rapprochable d'une personne. `gapKcalPerDay` est un
      // kcal/jour par bouche (`household_composition.ts`), et NI `canShowEnergy`
      // NI `energySafetyGates` n'ont d'appelant dans cette fonction: la clause
      // C5 du contrat TCA (« ni réponse HTTP, ni ligne de base, ni prompt, ni
      // log nominatif, ni écran sans que la porte ait dit oui AVANT que le
      // nombre soit calculé ») était violée à l'instant où la ligne s'écrivait.
      // Trouvé par L4-B le 2026-08-18, sur une ligne antérieure (`9cd01739`).
      //
      // ⚠️ ON AGRÈGE, ON NE SUPPRIME PAS. `residual_gaps` est l'instrumentation
      // d'A3: sans elle, la décision d'armer le slot de dressage se prendrait à
      // l'aveugle. Ce qu'elle sert à décider est « y a-t-il des écarts, et
      // sont-ils gros ? » — deux questions auxquelles un COMPTE et une BANDE
      // répondent, et qui ne désignent personne. Ce qu'elle ne doit pas servir
      // à faire est de lire le déficit de la troisième bouche de la maison.
      //
      // Les bandes sont grossières exprès: `lt_200` / `gte_200` sépare « un
      // reste d'arrondi » de « une bouche que la casserole ne sert pas », ce
      // qui est la seule décision qui se prend là-dessus.
      residual_gaps_count: resolution.residualGaps.length,
      residual_gaps_max_band: resolution.residualGaps.length === 0
        ? "none"
        : Math.max(...resolution.residualGaps.map((g) => g.gapKcalPerDay)) >= 200
        ? "gte_200"
        : "lt_200",
    }));

    console.log(JSON.stringify({
      tag: "keel.household_meal.retained_items",
      user_id: userId,
      household_id: householdId,
      ...routingTrace({ routed: routedRetained, adjustments: retainedPortion }),
      // Ce que le magasin a REFUSÉ à la lecture. Zéro ne veut pas dire « rien
      // en base »: il veut dire « rien d'illisible », et les deux se
      // confondraient sans ce nombre.
      refused: retainedDurable.refused.total,
      legacy_notes: retainedDurable.legacyNotes.length,
      other_subjects: retainedComposition.otherSubjects.length +
        retainedLogistics.otherSubjects.length +
        retainedRhythm.otherSubjects.length +
        retainedCravings.otherSubjects.length,
      // ══ LOT C · LE COMPTEUR DE FIN DE VIE DE DEUX FAMILLES ══════════════
      //
      // `rhythm.set` et `logistics.set` N'ONT PLUS D'ÉCRIVAIN: le lot M5 a
      // retiré la cellule à `questionnaire` et à `draft_note` (le bilan écrit
      // le CHAMP), et la carte ne les propose plus au « Ranger dans ». Ce
      // lecteur-ci est gardé UN CYCLE pour les lignes déjà en base.
      //
      // ⚠️ CE N'EST PAS UNE TRACE DE PLUS, C'EST LA MESURE QUI DÉCIDE. Zéro sur
      // la campagne ⇒ les deux lecteurs partent. Sans ce compteur, la question
      // « est-ce que quelqu'un s'en sert encore ? » n'aurait pour réponse
      // qu'une intuition, et le chemin resterait pour toujours « au cas où ».
      //
      // ⛔ IL COMPTE CE QUI A GAGNÉ, pas ce qui a été lu: une ligne écartée
      // parce qu'elle parle d'une autre bouche est déjà dans `other_subjects`.
      rhythm_served: retainedRhythm.served,
      logistics_served: retainedLogistics.served,
      // ⚠️ LE COMPTEUR A CHANGÉ DE SENS AU LOT 1G, ET C'EST VOLONTAIRE.
      // Il valait `portion_unapplied` — le nombre d'ajustements que
      // l'enveloppe NE recevait pas. Le laisser tel quel maintenant que le
      // câblage existe donnerait le même nombre pour « rien à appliquer » et
      // pour « tout appliqué »: un lot désarmé ressemblerait trait pour trait
      // à un lot qui marche.
      //
      // `portion_applied` compte les BOUCHES dont l'enveloppe a réellement
      // bougé, et il est calculé par le MÊME arbitre que celui qu'`envelopeFor`
      // applique — pas par une seconde lecture à la main de la règle du §2
      // axe 3.
      //
      // ⛔ CETTE PHRASE A ÉTÉ FAUSSE ENTRE LE LOT M3 ET LE 2026-09-01. Elle
      // nommait `winningPortionAdjust`, l'arbitre d'AVANT M3, alors que
      // l'enveloppe se règle désormais sur une POSITION. Les deux divergent sur
      // le scénario même de M3: « un peu trop » puis « un peu trop peu » rend
      // un dernier ajustement non nul (⇒ compté servi) pour une position de 0
      // (⇒ enveloppe intacte). C'est `portionIndexMoves` qui tient maintenant
      // la phrase, et il est le SEUL à la tenir — trois appelants, une ligne.
      //
      // Les trois nombres se lisent ENSEMBLE, et c'est ce qui les rend utiles:
      //   `portion` (routingTrace) = ce qui est sorti du magasin
      //   `portion_applied`        = les bouches servies
      //   `portion_excluded`       = qui a été retiré, avec son motif
      // Un `portion` non nul avec `portion_applied: 0` et `portion_excluded`
      // vide est la signature exacte d'un câblage rompu.
      portion_applied: composedMembers.filter((m) => {
        const adjust = portionAdjustFor(m);
        return portionIndexMoves(portionIndexFor({
          mouth: adjust.mouth,
          items: adjust.items ?? [],
        }));
      }).length,
    }));

    const pc = goalRow.practical_constraints as Record<string, unknown> | null;
    // ⚠️ HISSÉ LE 2026-09-01, ET C'EST LA RAISON D'ÊTRE DU `const`. Cet
    // inventaire était lu EN LIGNE au site du prompt; le parseur en a désormais
    // besoin aussi (`kept: "freezer"` n'ouvre la fenêtre de conservation que
    // sur un congélateur déclaré). Deux `readKitchenEquipment(pc)` seraient
    // deux idées de ce que cette cuisine possède — et c'est celle qu'on regarde
    // le moins qui garderait l'ancienne. La lane solo le hisse déjà, au même
    // titre et pour la même raison.
    const kitchenEquipment = readKitchenEquipment(pc);
    // ══════════════════════════════════════════════════════════════════════
    // LA PORTE DE L'OPTION — ET ELLE EST ICI, UNE SEULE FOIS.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ `hasFreezerDeclared`, JAMAIS `!== false`. « Pas de congélateur » et
    // « on ne lui a jamais demandé » rendent le même refus: une session unique
    // sur sept jours n'est tenable QUE par le congélateur, et l'ouvrir sur une
    // ignorance servirait un plan dont le parseur jetterait la moitié — la
    // mesure du 2026-09-01, huit repas sur vingt-et-un.
    //
    // ⚠️ L'ÉCRAN POSE DÉJÀ LA MÊME PORTE (champ désactivé sans congélateur).
    // Ce n'est pas une garde en double: l'écran décide ce qu'il PROPOSE, cette
    // ligne décide ce que le moteur FAIT — et le corps de la requête est écrit
    // par le réseau, pas par l'écran.
    // ⟳ A2 (2026-09-03) — « UNE SEULE COURSE » ENTRE PAR CETTE PORTE-CI, et
    // par aucune autre. `grocery_runs = 1` veut dire « je passe au magasin une
    // fois »: le plan doit donc tenir sur UNE session, ce qui est exactement ce
    // que `one_cooking_session` demande. C'est une DEMANDE de plus, pas une
    // quatrième porte du congélateur — trois implémentations de cette règle
    // sont déjà alignées par `freezerMirror.int.test.ts`, et une quatrième les
    // ferait diverger au premier ajustement.
    //
    // ⚠️ LU UNE SEULE FOIS, ICI, ET REDESCENDU. `resolveCookingCapacity` reçoit
    // `groceryRuns` en argument plus bas: deux `readGroceryRuns(pc)` seraient
    // deux idées de la même colonne, et c'est celle qu'on regarde le moins qui
    // garderait l'ancienne (la leçon de `readKitchenEquipment`, dix lignes
    // au-dessus).
    const groceryRuns = readGroceryRuns(pc);
    const askedOneSession = askedOneCookingSession || groceryRuns === 1;
    const oneCookingSession = askedOneSession &&
      hasFreezerDeclared(kitchenEquipment);
    if (askedOneSession && !oneCookingSession) {
      // Comptable en SQL sur la ligne du plan. `plan_rationale` le DIT à la
      // personne; sans ce compteur, une option ignorée en silence serait
      // indiscernable d'une option jamais cochée.
      issues.push("one_cooking_session_refused: no freezer declared");
    }
    // ── LES MOMENTS DE LA MAISON = L'UNION DES MOMENTS DES BOUCHES ────────
    //
    // ⚠️ CE N'EST PAS UNE COMMODITÉ, C'EST CE QUI REND LE RYTHME PAR BOUCHE
    // ATTEIGNABLE. La grille du plan est bâtie sur CE rythme-là: un créneau
    // absent d'ici n'existe nulle part dans le plan. Sans l'union, déclarer
    // « Tom prend un goûter » n'aurait produit aucun goûter — le fait serait
    // écrit en base, affiché à l'écran, et sans le moindre effet. Le dépôt a
    // déjà payé cette forme-là plusieurs fois (le régime, le shaker, le
    // budget): une donnée collectée dont aucun aval ne se sert.
    //
    // L'UNION, ET PAS UN REMPLACEMENT: le maître garde ses moments, chaque
    // bouche ajoute les siens, et `buildPortionBrief` dit ensuite qui mange à
    // quoi. La grille couvre tout le monde; les assiettes, elles, sont
    // individuelles.
    //
    // Une bouche à `null` n'ajoute rien: elle mange aux moments de la maison,
    // ce qui est exactement ce que l'union contient déjà.
    //
    // ⚠️ LES BOUCHES ENTRENT PAR LEUR SEUL `slot`, ET C'EST DÉLIBÉRÉ DEPUIS QUE
    // `eatingSlots` PORTE LA TAILLE. Cette union dimensionne LA GRILLE DU
    // PLAN — quels moments existent dans la semaine —, pas les assiettes. Y
    // laisser entrer les objets ferait gagner la taille du DERNIER membre lu
    // sur celle du maître pour un même moment (`parseEatingRhythm` écrase, une
    // chaîne nue n'écrase pas): la taille d'une personne deviendrait la taille
    // de la maison, sans que personne l'ait dit. Ce que la taille d'une bouche
    // gouverne est SA part, et c'est `buildPortionBrief` qui l'écrit, ligne par
    // ligne.
    const eatingRhythm = ((): EatingOccasionSlot[] => {
      const union = parseEatingRhythm([
        ...(Array.isArray(pc?.eating_rhythm) ? pc!.eating_rhythm as unknown[] : []),
        ...members.flatMap((m) => (m.eatingSlots ?? []).map((o) => o.slot)),
      ]);
      // LOT 1C — `rhythm.set` CORRIGE l'union, il ne la remplace pas. Rien à
      // corriger ⇒ la valeur d'avant ce lot, au slot près.
      //
      // ⚠️ APRÈS L'UNION, ET PAS DEDANS. Un item retenu qui RETIRE un moment
      // doit le retirer de la grille du plan — le glisser dans le tableau
      // d'entrée de `parseEatingRhythm` ne saurait qu'en AJOUTER, et un
      // « plus de goûter » n'aurait alors aucun effet.
      if (
        retainedRhythm.present.length === 0 && retainedRhythm.absent.length === 0
      ) {
        return union;
      }
      const bySlot = new Map<EatingOccasion, EatingOccasionSlot>();
      for (const entry of union) bySlot.set(entry.slot, entry);
      for (const occasion of retainedRhythm.absent) bySlot.delete(occasion);
      for (const occasion of retainedRhythm.present) {
        // La taille n'est PAS inventée: un `rhythm.set` dit qu'un moment
        // existe, jamais quelle taille il fait. `size: null` est ce que
        // `parseEatingRhythm` rend d'un moment déclaré sans taille.
        if (!bySlot.has(occasion)) bySlot.set(occasion, { slot: occasion, size: null });
      }
      return EATING_OCCASIONS.filter((s) => bySlot.has(s)).map((s) => bySlot.get(s)!);
    })();
    // ══════════════════════════════════════════════════════════════════════
    // « JE CUISINE LA VEILLE » — LA FENÊTRE RECULE D'UN JOUR, ICI ET NULLE
    // PART AILLEURS.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ APRÈS `resolveRequestedWindow` (la fenêtre de la personne est validée
    // telle QU'ELLE l'a saisie) et AVANT `daysToFill`, qui est lu par tout le
    // reste du moteur. Une fenêtre corrigée à mi-parcours laisserait la moitié
    // des lecteurs sur l'ancienne.
    //
    // ⚠️ LE REFUS N'EMPÊCHE PAS DE COMPOSER. Ne pas pouvoir reculer (plan qui
    // commence aujourd'hui, ou fenêtre déjà à sept jours) sert la fenêtre
    // demandée, et `plan_rationale` dit pourquoi. Rendre 400 transformerait une
    // préférence en mur.
    // ⟳ A1 (2026-09-03) — `asked` EST DÉRIVÉ, ET C'EST LA MOITIÉ DU LOT.
    //
    // `leadDayFor` lit la date de départ, le jour local et l'HEURE locale, avec
    // la coupure de `SHOPPING_CUTOFF_HOUR`. Ses cinq motifs sont des phrases;
    // `withCookDayBefore` peut encore refuser la fenêtre (sept jours mangés),
    // et c'est `planTimingOf` qui tranche lequel des deux explique.
    //
    // ⚠️ `hourNow: null` NE DEVIENT JAMAIS MINUIT. Une horloge illisible rend
    // `clock_unreadable`, donc pas de veille — le produit d'hier, nommé. La
    // deviner accorderait une veille que personne n'a le temps de cuisiner.
    const lead = leadDayFor({ startsOn, today: todayDate, hourNow });
    const cookAhead = withCookDayBefore({ startsOn, durationDays }, {
      asked: lead.leadDay !== null,
      today: todayDate,
    });
    startsOn = cookAhead.startsOn;
    durationDays = cookAhead.durationDays;
    const cookOnlyDay: string | null = cookAhead.cookOnlyDay;
    if (cookAhead.refused !== null) {
      issues.push(`cook_the_day_before_refused: ${cookAhead.refused}`);
    }
    // ── CE QUE LA RÉPONSE, LA LIGNE ET L'ÉCRAN LISENT, ASSEMBLÉ UNE FOIS ────
    // ⛔ UNE SEULE EXPRESSION POUR TROIS DESTINATIONS. `timing` part dans la
    // réponse (l'aperçu le rend), dans `generated_from` (il reste lisible en
    // SQL trois jours plus tard) et dans `plan_rationale` (la phrase). Trois
    // calculs du même fait divergeraient au premier ajustement — c'est la
    // forme de défaut que ce dépôt a déjà payée sur `usableCookDays`,
    // `addedCookDays` et `rationaleCookDays`.
    const planTiming: PlanTiming = planTimingOf(lead, cookAhead);

    const declaredCapacity = readCookingCapacity(pc);
    // ⟳ A1 — `scope` SE DÉRIVE DES JOURS **MANGÉS**. Une fenêtre de deux jours
    // dont l'un est la veille est un plan D'UN JOUR; la RPC dérive la même
    // chose de son côté (`20260903170000`), et les deux doivent rester
    // d'accord.
    const daysToEat = durationDays - (cookOnlyDay === null ? 0 : 1);
    const scope: MealScope = daysToEat === 1 ? "day" : "several_days";
    const daysToFill = windowDayOrder(startsOn, durationDays);

    // ══════════════════════════════════════════════════════════════════════
    // ⟳ A2 (2026-09-03) — LES DEUX RÉPONSES DE P2, APPLIQUÉES ICI ET NULLE
    // PART AILLEURS.
    // ══════════════════════════════════════════════════════════════════════
    //
    // `resolveCookingCapacity` vit dans `_shared/keel/cooking_plan.ts` et les
    // DEUX lanes l'appellent — contrairement à `readCookingCapacity`, qui est
    // recopiée dans les deux fichiers depuis toujours et sans test qui les
    // compare. La dérivation ne sera pas recopiée: un test lit les deux sources.
    //
    // ⛔ SANS LES DEUX RÉPONSES, RIEN NE CHANGE. Style ou cadence absents ⇒
    // `plan: null`, les quatre champs déclarés ressortent tels quels, et la
    // sortie est byte-identique à celle d'avant ce lot. C'est le chemin de tout
    // compte antérieur à P2, et il est le plus fréquent aujourd'hui.
    //
    // ⚠️ APRÈS `withCookDayBefore` ET APRÈS L'INVENTAIRE: la dérivation a
    // besoin de la fenêtre SERVIE (le rang 0 est la veille) et du congélateur.
    // La remonter d'une ligne poserait les sessions sur la fenêtre demandée, et
    // la première tomberait sur le premier jour MANGÉ au lieu de la veille.
    //
    // ⚠️ `daysToEat` EST LA FENÊTRE, PAS LA PRÉSENCE. Les absences réduisent ce
    // qu'on cuisine, pas les jours où l'on PEUT cuisiner: quelqu'un qui déjeune
    // dehors le mardi est chez lui le lundi soir. Soustraire les absences ici
    // resserrerait la cadence de courses sur une raison qui n'en est pas une.
    const capacity = resolveCookingCapacity({
      declared: declaredCapacity,
      style: declaredCapacity.cookingStyle,
      runs: groceryRuns,
      // ⛔ LE TRI-ÉTAT EST DÉJÀ RÉDUIT, ET AU BON ENDROIT. `hasFreezerDeclared`
      // rend le même `false` pour « pas de congélateur » et « jamais demandé »
      // — la direction fail-closed, décidée une fois pour toutes.
      freezer: hasFreezerDeclared(kitchenEquipment),
      windowDays: daysToFill as never,
      leadDay: cookOnlyDay !== null,
      daysToEat,
    });

    // ── D14 · QUI EST LÀ, ET QUAND ────────────────────────────────────────
    //
    // CE QUE CE BLOC REMPLACE, ET POURQUOI L'ANCIEN COMMENTAIRE MENTAIT.
    // Une seule ligne vivait ici: `parseAwayDays(pc?.away_days)`, lue sur la
    // ligne `student_goals` du PROPRIÉTAIRE, et un commentaire disait que
    // l'absence individuelle d'un membre « est une autre question ». Elle ne
    // l'est plus, et elle ne l'a jamais été: cette lecture avait DEUX défauts
    // opposés.
    //
    //   · Une bouche SANS COMPTE n'a aucune ligne `student_goals`. L'absence
    //     d'un enfant parti en camp n'existait donc nulle part, et le foyer
    //     cuisinait pour lui toute la semaine.
    //   · L'absence du MAÎTRE supprimait le repas de TOUT LE MONDE — l'exact
    //     contraire de FF-002 §9: « si le père n'est pas là samedi, la session
    //     de cuisson du foyer ne disparaît pas, seules ses portions changent ».
    //
    // Sa déclaration à lui n'est pas perdue pour autant: elle arrive
    // désormais par le roster, sur SA ligne de membre, avec la source `self`
    // (D14). Elle compte comme celle de n'importe qui — pour lui seul.
    //
    // LE RYTHME PASSÉ EST LE RYTHME RÉSOLU. `buildMealPrompt` retombe sur
    // `DEFAULT_EATING_RHYTHM` quand la liste est vide; compter la présence sur
    // le brut ferait raisonner sur des moments que la consigne ne nomme pas —
    // et un rythme vide ferait de chaque jour un jour désert.
    //
    // ⚠️ `composedMembers`, PAS `members` (L3). La présence dimensionne la
    // CASSEROLE: compter l'absence de quelqu'un qui mange son propre plan
    // ferait descendre `servings` deux fois pour une seule bouche, et sa
    // déclaration d'absence n'a rien à dire de ce dîner-ci. Le cas
    // « personne ne reste » a déjà été refusé plus haut, nommément — cette
    // liste n'est donc jamais vide, et `fullyAway` garde le sens que FF-002 lui
    // donne: personne n'est LÀ, et non personne n'est CONCERNÉ.
    const presence = resolveWindowPresence({
      members: composedMembers.map((m) => ({
        memberId: m.memberId,
        displayName: m.displayName,
        away: m.away,
      })),
      rhythm: eatingRhythm.length > 0 ? eatingRhythm : DEFAULT_EATING_RHYTHM,
      windowDays: daysToFill,
    });

    // LE SEUL MOMENT QUI SORT DE LA COMPOSITION EST CELUI QUE PERSONNE NE
    // PARTAGE. Il part par le même chemin que sur la lane individuelle — la
    // consigne ET le parseur (FF-002 R3): une consigne seule n'est pas une
    // garantie, le modèle recompose ce qu'on lui a dit d'éviter.
    const declaredAway = presence.householdAway;

    // ── LA JOURNÉE DÉJÀ ENTAMÉE ─────────────────────────────────────────
    //
    // Quand la fenêtre démarre AUJOURD'HUI, les moments déjà passés sortent de
    // la composition. On réutilise le SEUL mécanisme qui retire un moment d'une
    // journée (`AwayDay`), armé des deux côtés — la consigne ET le parseur.
    //
    // ⚠️ POUR LE PREMIER JOUR SEULEMENT, et ⚠️ CE N'EST PAS UNE ABSENCE
    // DÉCLARÉE. La trace de présence (`presence.trace`, écrite plus bas) ne doit
    // porter que ce que des PERSONNES ont déclaré: attribuer à quelqu'un une
    // absence qui n'est qu'une heure ferait chercher un coupable là où il n'y a
    // qu'une horloge. Les deux listes ne fusionnent qu'ICI, pour le prompt.
    //
    // ⚠️ LE RYTHME PASSÉ EST LE RYTHME RÉSOLU, comme pour `resolveWindowPresence`
    // juste au-dessus: raisonner sur le brut ferait tomber des moments que la
    // consigne ne nomme pas.
    const slotsDroppedToday = startsOn === todayDate
      ? slotsPassedToday({
        hourNow,
        rhythm: eatingRhythm.length > 0 ? eatingRhythm : DEFAULT_EATING_RHYTHM,
        declaredHours: rhythmClockFrom(
          Array.isArray(pc?.eating_rhythm) ? pc!.eating_rhythm : [],
        ),
      })
      : [];
    const awayDays = slotsDroppedToday.length === 0 ? declaredAway : (() => {
      const row = declaredAway.find((a) => a.day === todayToken);
      if (row && row.slots.length === 0) return declaredAway;
      const merged = new Set<string>([...(row?.slots ?? []), ...slotsDroppedToday]);
      return [
        ...declaredAway.filter((a) => a.day !== todayToken),
        { day: todayToken, slots: EATING_OCCASIONS.filter((s) => merged.has(s)) },
      ];
    })();

    // ── LE PREMIER JOUR EST-IL ENCORE CUISINABLE ? ──────────────────────
    // Passé la coupure courses, la session que `buildMealPrompt` ajoute
    // d'office (branche `tooLate`) vise le jour SUIVANT. La coupure vit dans
    // `plan_hours.ts`, jamais recopiée ici.
    const firstDayCookable = firstWindowDayIsCookable({
      windowStartsOn: startsOn,
      todayLocalDate: todayDate,
      hourNow,
    });

    // ── LA FENÊTRE QU'ON PROPOSERAIT ────────────────────────────────────
    // ⚠️ UNE PROPOSITION D'ÉCRAN, JAMAIS UN REFUS SERVEUR. La requête qui vient
    // d'arriver est déjà acceptée.
    const proposed = proposedWindowStart({ todayLocalDate: todayDate, hourNow });
    const suggestedWindow = {
      starts_on: proposed.startsOn,
      shifted: proposed.shifted,
    };

    // ── FF-002 §7 · LA FENÊTRE ENTIÈREMENT DÉSERTÉE ──────────────────────
    // Refus NOMMÉ, et pas un plan de zéro plat: « un plan de zéro plat est un
    // écran cassé » (R6). Le nom est celui que la fiche a posé — la lane
    // individuelle ne l'implémente toujours pas, et c'est écrit dans le rapport
    // de ce lot plutôt que corrigé ici en passant.
    if (presence.fullyAway) {
      return jsonResponse(req, {
        error: "window_fully_away",
        detail: "Nobody in this household is eating here over that stretch. " +
          "Shorten the window, or take an absence back.",
        request_id: requestId,
      }, { status: 409 });
    }
    // ── L4 · FUSIONNER QUELQU'UN QUI N'EST LÀ AUCUN MOMENT N'A PAS DE SENS ──
    // Il n'aurait pas d'assiette (`platedMembers` le filtre plus bas), et le
    // plan porterait `merged_from` pour une personne absente de sa propre
    // fusion. Le refus est ICI, avant le modèle: la présence est déjà résolue,
    // et rien de ce qui suit ne changerait la réponse.
    if (
      merge !== null &&
      presence.absentAllWindow.includes(merge.member.member_id)
    ) {
      // ⚠️ IL ÉTAIT LE SEUL REFUS DE FUSION MUET, ET ÇA S'EST VU EN PRODUCTION.
      // Vérifié dans les logs du runtime le 2026-08-12: trois lignes
      // `merge_refused` pour les autres motifs, aucune pour celui-ci. Un refus
      // qu'on ne compte pas est un refus dont on ne saura jamais s'il tombe
      // souvent — et celui-ci tombe sur une personne QUE LE MAÎTRE VENAIT DE
      // DÉSIGNER, ce qui en fait le plus intéressant des onze.
      //
      // MÊME `tag` ET MÊME FORME que les dix autres (`resolveMergeRequest`
      // plus haut): deux formes de log pour le même fait rendraient tout
      // décompte faux, et personne ne le verrait.
      console.log(JSON.stringify({
        tag: "keel.household_meal.merge_refused",
        user_id: userId,
        household_id: householdId,
        member_id: merge.member.member_id,
        reason: MERGE_MEMBER_AWAY_ALL_WINDOW,
      }));
      return jsonResponse(req, {
        error: MERGE_MEMBER_AWAY_ALL_WINDOW,
        detail: "That person is marked away for every meal of those days, so " +
          "there is nothing to bring them back to. Take the absence back first.",
        request_id: requestId,
      }, { status: 409 });
    }
    if (presence.trace.length > 0) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.presence",
        user_id: userId,
        household_id: householdId,
        members_away: presence.trace.length,
        deserted_slots: presence.householdAway.length,
        servings: presence.servings,
      }));
    }

    // ── QUI A UNE ASSIETTE DANS CE PLAN ──────────────────────────────────
    //
    // MESURÉ EN RUN RÉEL LE 2026-08-12: un plan cuisiné pour UNE personne
    // portait QUATRE `member_portions`, dont trois pour des bouches absentes à
    // chaque moment de la fenêtre. `TableCard` les affichait telles quelles —
    // « une portion adulte pleine » servie d'une casserole dimensionnée sans
    // eux. `servings` était juste, l'assiette mentait.
    //
    // On filtre ICI, en amont, et pas seulement à la réconciliation: si le
    // prompt continuait de nommer ces ids, le modèle continuerait de rendre
    // leurs portions et `reconcilePortions` les compterait en
    // `portion_for_unknown_member`. Une bouche absente toute la fenêtre ne doit
    // simplement pas exister pour ce plan-là.
    //
    // QUI MANQUE UN SEUL DÎNER RESTE ICI: il mange les autres jours. Le détail
    // par jour vit dans le bloc de présence, pas dans cette liste.
    //
    // Jamais vide: `fullyAway` a déjà refusé plus haut le cas où personne n'est
    // là à aucun moment, donc au moins une bouche survit à ce filtre.
    //
    // ⚠️ IL PART DE `composedMembers`, PAS DE `members` (L3). Il y a DEUX
    // raisons de ne pas avoir d'assiette dans ce plan, et elles s'empilent sur
    // la même personne: avoir pris la main (elle mange son plan) et être
    // absente toute la fenêtre (elle ne mange nulle part ici). Les deux filtres
    // se composent en cascade au lieu de se croiser — deux listes calculées
    // chacune sur `members` finiraient par se contredire, et l'une des deux
    // gagnerait en silence.
    const platedMembers = presence.absentAllWindow.length === 0
      ? composedMembers
      : composedMembers.filter((m) =>
        !presence.absentAllWindow.includes(m.memberId)
      );
    for (const id of presence.absentAllWindow) {
      issues.push(`member_away_all_window:${id}`);
    }

    // ── FF-051 · CE QUE CHAQUE BOUCHE MANGE DÉJÀ (D1b, 2026-08-18) ────────
    //
    // ⚠️ CE BLOC REMPLACE TROIS `fixedIntakes: []` EN DUR, et le commentaire
    // qui les tenait n'était pas faux — il était incomplet. Il disait: « lire
    // ici `practical_constraints` DU SEUL TITULAIRE ferait sauter le
    // petit-déjeuner de TOUTE la tablée parce qu'UNE personne prend un
    // shaker ». C'est vrai des DEUX défauts qu'il nomme, et le chargeur les
    // ferme tous les deux plutôt que de renoncer à la donnée:
    //
    //   · « du seul titulaire »  →  il lit CHAQUE bouche qui a un compte, et
    //     attribue chaque ligne à son prénom. Le shaker d'Ana n'est pas celui
    //     de la table, et la consigne le dit maintenant mot pour mot.
    //   · « ferait sauter le petit-déjeuner » →  aucun apport ne PREND un
    //     moment au foyer (`replacesMeal` ramené à `false`, et COMPTÉ). Le
    //     mécanisme qui supprime une case reste celui de l'absence, qui est
    //     déclarée par une personne POUR la tablée.
    //
    // ⚠️ `platedMembers`, ET PAS `members`. Même cascade que le brief de
    // portions: qui a pris la main mange son propre plan, qui est absent toute
    // la fenêtre n'a pas d'assiette ici. Retirer un aliment des courses d'une
    // tablée pour quelqu'un qu'elle ne nourrit pas serait un repas rogné pour
    // les autres.
    const fixedIntakeLoad = await loadHouseholdFixedIntakes(admin, {
      mouths: platedMembers.map((m) => ({
        memberId: m.memberId,
        userId: m.userId,
        displayName: m.displayName,
      })),
    });
    const fixedIntakes = fixedIntakeLoad.intakes;
    issues.push(...fixedIntakeLoad.issues);
    // LE COÛT ET CE QU'ON A RETIRÉ, SUR LA MÊME LIGNE. `demoted` est le seul
    // champ que ce chargeur enlève à une déclaration; sans compteur, « personne
    // n'a rien déclaré » et « on a désarmé trois remplacements » laisseraient
    // la même trace. `reads` passe de 0 à N par génération, et un nombre qu'on
    // ne journalise pas est un nombre que personne ne verra doubler.
    if (
      fixedIntakes.length > 0 || fixedIntakeLoad.discarded > 0 ||
      fixedIntakeLoad.dropped > 0 || fixedIntakeLoad.issues.length > 0
    ) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.fixed_intakes",
        user_id: userId,
        household_id: householdId,
        mouths: platedMembers.length,
        intakes: fixedIntakes.length,
        demoted: fixedIntakeLoad.demoted,
        discarded: fixedIntakeLoad.discarded,
        dropped: fixedIntakeLoad.dropped,
        reads: fixedIntakeLoad.reads,
      }));
    }

    // ── C3 ⑥ · LES REPAS DE LA PERSONNE REPRISE, pour le CONSTAT de forme ──
    //
    // Le dénominateur d'`observeMergeShape`: sans lui, « elle a un plat à elle »
    // et « elle a un plat à elle une fois sur neuf » laissaient la même trace.
    // ⚠️ MÊME RYTHME ET MÊME FENÊTRE que `resolveWindowPresence` juste
    // au-dessus, par la MÊME fonction — un second parcours aurait fini par
    // compter des repas que la casserole ne compte pas.
    const mergedEaterCells = merge === null ? [] : memberMealCells({
      away: composedMembers
        .find((m) => m.memberId === merge.member.member_id)?.away.effective ?? [],
      rhythm: eatingRhythm.length > 0 ? eatingRhythm : DEFAULT_EATING_RHYTHM,
      windowDays: daysToFill,
    });

    // ── D6 · L'ÉCHELLE DE FUSION, DÉCIDÉE ICI ET PAS PAR LE MODÈLE ────────
    //
    // Le critère est VÉRIFIABLE, et c'est tout l'objet de D6: on ne demande pas
    // au modèle si un plat commun conviendrait, on le SAIT — une casserole déjà
    // composée peut toujours en donner moins, jamais plus qu'elle n'en
    // contient. La comparaison porte sur les directions de service, qui sont
    // des constantes du produit (`SERVING_DIRECTION`), lues et non recopiées.
    //
    // LA TABLE, C'EST QUI ? Les bouches qui ont une assiette dans ce plan-là,
    // SANS l'entrant: ce sont elles qui ont dimensionné la casserole. L'y
    // inclure ferait comparer sa demande à elle-même, et le niveau ① tiendrait
    // toujours — une garde qui ne mord jamais.
    //
    // ⚠️ CE N'EST PAS UN REFUS, DONC SA POSITION NE COÛTE RIEN. Le barreau
    // choisi change la CONSIGNE (`CookingShape`), pas le droit de composer.
    //
    // ── POURQUOI CE BLOC EST REMONTÉ AVANT `buildMealPrompt` (2026-08-12) ──
    // Il vivait APRÈS, entre la consigne et les blocs de foyer, et c'était
    // tenable tant que le barreau ne changeait QUE le suffixe du foyer. Il
    // change aussi le PLAFOND DE PLATS du tronc (`dishBudgetFor`): un plafond
    // calculé avant que le barreau soit connu est le plafond d'une table sans
    // la bouche qu'on lui ajoute — c'est le défaut mesuré, où le seizième plat
    // rendu était le dîner du dimanche du foyer. Rien d'autre n'a bougé:
    // `platedMembers` ne dépend que de `presence` et `composedMembers`, tous
    // deux résolus au-dessus.
    const mergedMember = merge === null
      ? null
      : platedMembers.find((m) => m.memberId === merge!.member.member_id) ?? null;
    // LES JETONS DE JOUR DE LA FENÊTRE RECOMPOSÉE. Partagés par la fusion et
    // par la défusion: les deux ramènent la matière d'un plan déjà écrit aux
    // seuls jours qu'on refait.
    const windowDayTokens = new Set<string>(windowDayOrder(startsOn, durationDays));
    const ladder = merge === null || mergedMember === null ? null : mergeLadder({
      table: platedMembers
        .filter((m) => m.memberId !== mergedMember.memberId)
        .map(servingDemandsFor),
      incoming: servingDemandsFor(mergedMember),
      // LES JOURS DE CUISSON, RAMENÉS À LA FENÊTRE FUSIONNÉE. Une session que
      // le plan tenait en dehors de ces jours-là ne dit rien de ce qu'on
      // recompose: la garder ferait croire à un jour partagé qui n'existe pas.
      householdCookingDays: merge.householdPlan.cookingDays.filter((d) =>
        windowDayTokens.has(d)
      ),
      personalCookingDays: merge.personalPlan.cookingDays.filter((d) =>
        windowDayTokens.has(d)
      ),
    });
    if (merge !== null && ladder !== null && mergedMember !== null) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.merge",
        user_id: userId,
        household_id: householdId,
        member_id: merge.member.member_id,
        shape: ladder.shape,
        reason: ladder.reason,
        conflicts: ladder.conflicts,
        window: [startsOn, durationDays],
        // D1 — LES JOURS DE **SON** PLAN, À CÔTÉ DE CE QU'ON RECOMPOSE. Sans
        // cette paire, une ligne de journal ne dit plus si la fenêtre écrite
        // vient de l'intersection ou de la queue du plan du foyer — et c'est
        // très exactement la question qu'on se pose en relisant une fusion.
        merged: [
          merge.window.window.startsOn,
          merge.window.window.durationDays,
        ],
        intersection: [
          merge.window.intersection.startsOn,
          merge.window.intersection.durationDays,
        ],
        pivot: merge.window.pivot,
        days_already_past: merge.window.daysAlreadyPast,
      }));
    }

    // ── LA MATIÈRE DE LA FUSION, CALCULÉE UNE FOIS ────────────────────────
    //
    // Elle sert à DEUX choses qui doivent voir exactement la même liste: le
    // bloc de consigne (`buildMergeBlock`, plus bas) et le BUDGET DE PLATS
    // (`dishBudgetFor`, dans le tronc). La calculer deux fois rouvrirait la
    // porte que ce lot ferme — annoncer un budget pour des plats qu'on ne
    // montre pas, ou montrer des plats hors budget.
    //
    // RAMENÉE À LA FENÊTRE FUSIONNÉE: un plat d'un jour que la fusion ne touche
    // pas ferait recomposer un jour que le plan personnel garde. Puis passée
    // par `mergeMaterialShown`, qui applique `MERGE_MATERIAL_CAP` — le budget
    // compte ce que le modèle VOIT, pas ce qu'on avait sous la main.
    const mergeMaterial = merge === null ? [] : mergeMaterialShown(
      merge.personalPlan.dishes.filter((d) =>
        d.day === null || windowDayTokens.has(d.day)
      ),
    );
    // ── O5 · L'ANCRE DE LA FUSION — LE PLAN DU FOYER ──────────────────────
    //
    // MESURÉ LE 2026-08-12, créneau par créneau: 15 sur 15 du plan fusionné
    // venaient du plan PERSONNEL, et aucun titre du plan du foyer n'a survécu.
    // Un foyer en `fat_loss`, mineur à table, s'est vu servir un plan de prise
    // de masse — deux fusions réelles sur deux. La consigne ne montrait qu'une
    // liste, celle du plan personnel; le modèle a écrit ce menu-là.
    //
    // Les mêmes plats, la même fenêtre et le même plafond que la matière de la
    // DÉFUSION juste en dessous — dont la consigne, elle, obéit 14/14. La seule
    // différence entre les deux blocs est ce que la fusion AJOUTE (le barreau
    // D6), plus ce qu'elle garde.
    //
    // ⚠️ N'ENTRE PAS DANS LE BUDGET DE PLATS. `ownDishesShown` compte ce que la
    // personne reprise apporte, et le budget lui ouvre de la place pour ÇA. Le
    // plan du foyer, lui, est déjà dans le plafond de base: l'y rajouter
    // doublerait la fenêtre du foyer dans son propre plafond.
    const mergeBaseMaterial = merge === null ? [] : mergeMaterialShown(
      merge.householdPlan.dishes.filter((d) =>
        d.day === null || windowDayTokens.has(d.day)
      ),
    );
    // ⚠️ LE BUDGET DE LA FUSION EST CALCULÉ PLUS BAS, APRÈS LE PLAFOND (LOT B).
    // Il vivait ici tant que le barreau de fusion était la forme finale; depuis
    // que le mode de cuisson se DEMANDE, la forme servie n'est connue qu'après
    // `capCookingShape`. Un budget calculé sur le barreau BRUT ouvrirait de la
    // place pour des plats que la consigne, plafonnée, interdit — et
    // `dishCapFor` le dit noir sur blanc: un modèle « déborde poliment » pour
    // remplir un budget qu'on lui ouvre.

    // ═══════════════════════════════════════════════════════════════════════
    // G5 — LE TEMPS PLAFONNE, LA DIVERGENCE DÉCLENCHE (arbitrage B1, 2026-08-14)
    // ═══════════════════════════════════════════════════════════════════════
    //
    // CE QUE CE BLOC REMPLACE. Le plat unique était une CONSTANTE, pas un
    // réglage: `buildHouseholdPromptBlocks` écrivait `merge?.shape ??
    // "one_dish"`, donc toute composition ordinaire était clouée au barreau ①
    // — « Cook ONE set of preparations for everyone. Do NOT propose separate
    // dishes. » — quelles que soient les directions à table.
    //
    // LES DEUX MOITIÉS NE SE REMPLACENT PAS:
    //
    //   · LE TEMPS PLAFONNE. Sous `SEPARATE_DISH_MIN_WEEKLY_MINUTES`,
    //     `one_dish` est forcé. Un second plat qu'on n'a pas le temps de cuire
    //     est une promesse que la semaine ne tient pas; le plan le DIT
    //     (`plan_rationale`, phrase ⑤) plutôt que de le promettre.
    //   · LA DIVERGENCE DÉCLENCHE. Au-dessus, le barreau ② devient ATTEIGNABLE
    //     et rien de plus. Le temps ne fabrique pas de plats inutiles.
    //
    // ⚠️ LE CRITÈRE EST CELUI DE D6, LU ET PAS RÉÉCRIT. `servingConflicts`
    // porte la phrase depuis la fusion: « une casserole déjà composée peut
    // toujours en donner moins, jamais plus qu'elle n'en contient », et une
    // demande à `balanced` ou en dessous est TOUJOURS servable. La seule chose
    // qui change est le paramètre `table`: la fusion y met la tablée SANS
    // l'entrant, une composition y met tout le monde SAUF la personne qu'on
    // examine. C'est la même question posée N fois au lieu d'une.
    //
    // ⚠️ CE N'EST PAS UN REFUS, DONC SA POSITION NE COÛTE RIEN — même note que
    // le barreau de fusion 200 lignes plus haut. Il change la CONSIGNE, pas le
    // droit de composer.
    //
    // ⚠️ ③ RESTE RÉSERVÉ À LA FUSION. Un budget de temps permet un second plat
    // DANS LA MÊME SESSION; il ne permet pas une seconde session, sur un jour
    // propre. C'est le seul barreau que ce lot n'ouvre pas, et c'est écrit
    // dans la spec: ③ n'a été mesuré que sur une fusion.
    const weeklyMinutes = weeklyCookingMinutes({
      cookDays: capacity.cookDays ?? [],
      cookingTimeMin: capacity.cookingTimeMin,
    });
    // LES BOUCHES QUI NE SORTENT PAS DE LA CASSEROLE COMMUNE. Sur `platedMembers`
    // — celles qui ont une assiette dans CE plan-là — parce que ce sont elles
    // qui dimensionnent la casserole. Y compter une absente ferait lever un
    // second plat pour quelqu'un qui ne mange pas ici.
    //
    // ── R4 · LE PLAT COMMUN SUIT LE PLUS RESTRICTIF DE LA TABLE ────────────
    // Sur `platedMembers` pour la même raison que la divergence juste en
    // dessous: ce sont les bouches qui ont une assiette dans CE plan-là. Une
    // bouche absente toute la fenêtre ne dimensionne pas la casserole, et
    // descendre le foyer au végane pour quelqu'un qui ne mange pas ici serait
    // décider à la place de la table sur une donnée de calendrier.
    //
    // ⚠️ C'EST L'EXACTE SYMÉTRIE DE L'UNION DES ALLERGIES, ET C'EST VOULU: un
    // omnivore peut manger un plat végétarien, l'inverse est faux — « une
    // casserole peut toujours en donner moins, jamais plus qu'elle n'en
    // contient » (D6).
    const strictestRegime = strictestRegimeAt(platedMembers.map((m) => m.diet));
    const strictestHeldBy = strictestRegime === null ? [] : platedMembers
      .filter((m) => m.diet === strictestRegime)
      .map((m) => m.displayName);
    // ═══════════════════════════════════════════════════════════════════════
    // ⛔ UN PLAT DÉDIÉ SE DÉCLENCHE SUR UNE IMPOSSIBILITÉ, PLUS SUR UN ÉCART
    //    DE PORTION (2026-08-19)
    // ═══════════════════════════════════════════════════════════════════════
    //
    // ── LE FAIT MESURÉ ───────────────────────────────────────────────────
    // Foyer de deux, aperçu de plan sous les yeux de l'utilisateur: au
    // petit-déjeuner, le MÊME yaourt écrit DEUX fois — 200 g « pour la table »,
    // 250 g « pour iku ». Ses mots: « pourquoi deux boîtes à chaque fois par
    // personne, c'est pas normal ».
    //
    // La chaîne était: `servingConflicts` voit que la part d'iku (prendre du
    // muscle) ne sort pas de la même casserole que celle de Christèle
    // (maintenir) ⇒ il devient porteur de plat ⇒ le prompt lui promet DEUX
    // plats à CHAQUE repas ⇒ le modèle recopie le plat commun avec d'autres
    // grammes. Il a obéi: c'est la consigne qui était fausse.
    //
    // ── CE QUI ÉTAIT CONFONDU ────────────────────────────────────────────
    // « Il lui en faut plus » n'est PAS « il ne peut pas manger ça ». Le
    // premier est une PART, et le moteur a déjà le canal exact pour ça —
    // `member_portions`, « un plat pour la table, une ligne par personne ». Le
    // second est une IMPOSSIBILITÉ, et lui seul demande une seconde assiette.
    //
    // Effet de bord réparé au passage: la divergence se calculait sur les corps
    // et les objectifs, donc éditer un poids entre deux générations faisait
    // apparaître ou disparaître les plats dédiés. « Une fois il séparait les
    // portions, la 2e fois non » — vu par l'utilisateur le même jour. Ce
    // n'était pas de l'aléatoire, c'était cette règle-là.
    //
    // ⛔ ET LA FORME DE CUISINE NE GARDE PLUS LA PORTE. `timeAllowsASecondDish`
    // et `asksForASecondDish` disaient « cette semaine, on ne fait qu'un plat ».
    // C'est une préférence d'EFFORT, et elle ne peut pas primer sur « cette
    // personne ne peut pas manger le plat commun »: un végane à qui la maison
    // répond « pas le temps » ne mange pas. Arbitré le 2026-08-19.
    //
    // Le temps et la forme continuent de gouverner tout le reste — le nombre de
    // sessions, la longueur des recettes, le budget de plats. Ils ne peuvent
    // simplement plus supprimer le repas de quelqu'un.
    const divergingMembers = merge !== null
      ? []
      : platedMembers.filter((m) =>
        // ── R5 · LE RÉGIME, ET DÉSORMAIS LUI SEUL ─────────────────────────
        // Sans lui, un seul végane impose le végane à six personnes en
        // silence — ou mange le plat de viande. C'est la seule impossibilité
        // que ce niveau connaît: une allergie, elle, ne demande pas de second
        // plat, parce que l'union de sécurité a déjà retiré l'allergène de LA
        // CASSEROLE (fail-closed). Le plat commun est donc sûr pour tout le
        // monde; il n'est pas MANGEABLE par qui exclut plus large que lui.
        //
        // ⛔ `servingConflicts` A ÉTÉ RETIRÉ D'ICI — voir le pavé au-dessus.
        // Une part plus grande n'est pas un autre plat, et elle a son canal.
        dietDiverges({
          strictest: strictestRegime,
          own: m.diet,
          demands: servingDemandsFor(m),
        })
      );
    // LE BARREAU DE LA COMPOSITION. `one_session` ou rien: voir la note sur ③.
    const compositionShape: CookingShape = divergingMembers.length > 0
      ? "one_session"
      : "one_dish";
    // LA FORME QUE LE CALCUL A TROUVÉE — la fusion garde la main quand elle est
    // là. Une requête porte UNE opération: `merge` et une composition ordinaire
    // ne sont jamais toutes deux vraies, et ce `??` le dit sans arbitrer.
    const computedShape: CookingShape = ladder?.shape ?? compositionShape;
    // ══════════════════════════════════════════════════════════════════════
    // LOT B — LE CHOIX PLAFONNE, IL NE COMMANDE PAS.
    // ══════════════════════════════════════════════════════════════════════
    //
    // `capCookingShape` est le SEUL endroit qui compare le choix au calcul, et
    // il rend TROIS faits: la forme servie, si le plafond a mordu, et si le
    // choix n'a rien eu à retenir. Les deux derniers ne sont pas l'inverse l'un
    // de l'autre, et ils vont dans `plan_rationale` — un choix silencieusement
    // ignoré est pire que pas de choix.
    //
    // ⚠️ RIEN N'EST RECALCULÉ ICI. `mergeLadder` et la divergence en composition
    // ont fait leur travail juste au-dessus, à l'identique: le plafond
    // s'applique APRÈS, sur leur résultat. Le jour où le calcul change, il n'y a
    // qu'un endroit à relire.
    // ⟳ A2 (2026-09-03) — LE STYLE PLAFONNE LA FORME, ET IL LE FAIT PAR LA
    // PORTE QUI EXISTE.
    //
    // « Le moins possible — je réchauffe » et « chacun le sien » sont deux
    // réponses de la même personne, et elles se contredisent: deux plats par
    // repas ne se réchauffent pas en trente minutes. `capCookingShape` est le
    // SEUL endroit du produit qui compare un choix à un calcul; on lui donne
    // donc le choix DÉJÀ plafonné plutôt que d'ajouter une seconde comparaison
    // à côté.
    //
    // ⛔ IL PLAFONNE, IL NE FORCE PAS. Un style `balanced` ou `keen` ne
    // FABRIQUE aucun second plat: il laisse le calcul décider, exactement comme
    // avant ce lot. Et `null` (jamais demandé) ne plafonne rien du tout — la
    // population qui n'a pas vu la question garde son comportement d'hier.
    //
    // ⚠️ CE N'EST PAS LA MÊME CHOSE QUE LE SEUIL DE TEMPS. `weeklyCookingMinutes`
    // (D2.4) plafonne aussi, plus bas, sur le budget dérivé — et il se réveille
    // avec ce lot puisque `cook_days` cesse d'être `[]`. Les deux disent la même
    // chose par deux chemins, et c'est voulu: l'un vient du MOT (« le moins
    // possible »), l'autre du NOMBRE (30 min × 1 session < 90).
    const styleCappedShape: CookingShape | null =
      declaredCapacity.cookingStyle === "minimal"
        ? "one_dish"
        : askedCookingShape;
    const shapeCap = capCookingShape(computedShape, styleCappedShape);
    const cookingShape: CookingShape = shapeCap.shape;
    // ⛔ LES BOUCHES QUI REÇOIVENT VRAIMENT UN PLAT — et c'est ce que le plafond
    // change. `divergingMembers` reste le CALCUL (il nomme au constat qui ne
    // sort pas de la casserole commune); cette liste-ci est ce que la CONSIGNE
    // promet. Les confondre après un plafond ferait dire au modèle « X reçoit
    // son propre plat » sur la même page que « ne propose pas de plats
    // séparés » — deux ordres contradictoires dans un seul prompt, et c'est
    // toujours celui qu'on ne relit pas qui gagne.
    // ⛔ ET LE PLAFOND DE FORME NE LES COUPE PLUS (2026-08-19). Cette ligne
    // était `asksForASecondDish(cookingShape) ? divergingMembers : []`: un
    // foyer qui répond « un seul plat cette semaine » perdait le plat de sa
    // bouche végane, donc son repas.
    //
    // La contradiction que le commentaire d'origine craignait — « X reçoit son
    // propre plat » sur la même page que « ne propose pas de plats séparés » —
    // n'existe plus, parce que ce n'est plus la même question: la forme dit
    // combien de plats on veut BIEN cuisiner, la divergence dit lesquels on ne
    // PEUT PAS servir depuis la casserole. Une préférence d'effort ne supprime
    // pas un repas.
    //
    // ⚠️ LA LISTE RESTE DISTINCTE de `divergingMembers` malgré l'égalité
    // actuelle: l'une est le CONSTAT, l'autre ce que la CONSIGNE promet. Les
    // fondre rendrait invisible le jour où un plafond devra de nouveau les
    // séparer — et il y en aura un.
    // ══════════════════════════════════════════════════════════════════════
    // ⛔ UN REPAS DÉCLARÉ À SOI REND PORTEUR DE PLAT, LUI AUSSI (2026-08-19)
    // ══════════════════════════════════════════════════════════════════════
    //
    // ── LE DÉFAUT, MESURÉ SUR LE RUN DE 19h03 ────────────────────────────
    // Une bouche déclare « à midi, ma salade froide ». Le brief le DIT au
    // modèle (`— has their own at lunch: …`), et le modèle obéit: SIX salades,
    // une par déjeuner de la fenêtre. Aucune n'atteint l'écran.
    //
    // Parce que la liste ci-dessous ne connaissait qu'un motif — l'écart de
    // RÉGIME. Sans ce motif: pas de bloc `for_member_id` dans le schéma (donc
    // ses salades sortent attribuées à la TABLE), et surtout aucune place dans
    // le budget de plats. 24 plats écrits, plafond à 18, et ce sont les six
    // siennes qui tombent. « Elle est où la salade froide de thon ? »
    //
    // ⚠️ C'EST LA MÊME RÈGLE QUE LE RÉGIME, PAS UNE EXCEPTION. Les deux disent
    // « cette personne ne mange pas la casserole commune à ce moment-là ».
    // L'une parce qu'elle ne PEUT pas, l'autre parce qu'elle a dit qu'elle
    // mangeait autre chose. Dans les deux cas, lui refuser un plat lui retire
    // son repas.
    //
    // ⚠️ LE PRÉDICAT EST CELUI DU BRIEF, APPELÉ. `ownMealSlots` est ce que lit
    // `habitFragment` pour écrire la phrase; deux lectures séparées se
    // seraient contredites, et c'est ce désaccord-là qui a produit le défaut.
    const ownMealBearers = merge !== null ? [] : platedMembers.filter((m) =>
      ownMealSlots(m.habits ?? []).length > 0 &&
      !divergingMembers.some((d) => d.memberId === m.memberId)
    );
    const dishBearingMembers = [...divergingMembers, ...ownMealBearers];
    // Une FUSION reprend UNE personne, jamais deux: `1` rend la ligne de forme
    // byte-identique à celle d'avant ce lot. Voir `cookingShapeLines`.
    const divergingCount = ladder === null
      ? dishBearingMembers.length
      : (cookingShape === "one_dish" ? 0 : 1);

    // ── C6 · COMBIEN DE PLATS DÉDIÉS, CALCULÉ UNE FOIS ────────────────────
    //
    // MESURÉ LE 2026-08-12: barreau ② sur un conflit à DEUX axes
    // (`protein:larger_above_table` + `starch:larger_above_table`), NEUF repas
    // pour la personne reprise, UN seul plat dédié rendu. Elle a mangé la
    // casserole commune 8 fois sur 9. « ADD ONE dish » se lit « un pour la
    // fenêtre », et c'est une lecture raisonnable de ce qu'on avait écrit.
    //
    // LE NOMBRE VIENT DE SES REPAS À ELLE (`mergedEaterCells`, la même liste
    // que le DÉNOMINATEUR du constat de forme, C3 ⑥), et il sert à DEUX
    // choses qui doivent voir le même nombre: la CONSIGNE (`buildMergeBlock`)
    // et le BUDGET DE PLATS (`dishBudgetFor`). Le calculer deux fois rouvrirait
    // la porte que L4 a fermée — une consigne qui réclame neuf plats dans un
    // plafond ouvert pour six, et le parseur qui jette les DERNIERS.
    //
    // ⚠️ LOT B — C'EST `cookingShape` ET PLUS `ladder.shape`: la forme SERVIE,
    // celle que la consigne porte réellement. Le barreau brut ouvrirait un
    // budget pour des plats qu'un plafond vient d'interdire, et `dishCapFor`
    // dit ce qu'un modèle fait d'un budget ouvert — il « déborde poliment »
    // pour le remplir. `dedicatedDishesFor` rend 0 à `one_dish`, donc un
    // plafond qui mord referme le budget du même geste.
    const mergeDedicatedDishes = ladder === null
      ? 0
      : dedicatedDishesFor(cookingShape, mergedEaterCells.length);

    // CE QUE LE TRONC A BESOIN DE SAVOIR DE LA FUSION, et rien de plus: un
    // barreau et deux nombres. Le tronc n'a pas à connaître un foyer.
    const mergeBudget: MergedEater | null = ladder === null ? null : {
      shape: cookingShape,
      ownDishesShown: mergeMaterial.length,
      // C6 — LE PLAFOND SUIT CE QUE LA CONSIGNE RÉCLAME, et pas seulement ce
      // qu'elle montre: une fusion dont la fenêtre recomposée déborde le plan
      // personnel (L10 ①) montre MOINS de plats qu'elle n'a de repas.
      dedicatedDishesAsked: mergeDedicatedDishes,
      // C7 ② — ET OÙ CES PLATS SONT ATTENDUS. Le nombre dit COMBIEN de place
      // ouvrir; cette liste dit QUELLES cases un plat de plus a le droit
      // d'occuper — c'est ce qui permet au plafond de sacrifier le surplus
      // plutôt que le dimanche. LA MÊME liste que le dénominateur du constat
      // (`mergedEaterCells`), jamais une seconde résolution.
      dedicatedCells: mergedEaterCells,
      // LOT C — UNE FUSION REPREND UNE PERSONNE, ET UNE SEULE. C'est le cas où
      // l'attribution est la plus simple, et c'est aussi celui où le trou a été
      // mesuré: le plat dédié de la personne reprise apparaissait dans la
      // semaine de tout le monde. `[]` au barreau ① — rien n'y est attribuable.
      dishBearerIds: asksForASecondDish(cookingShape) && mergedMember !== null
        ? [mergedMember.memberId]
        : [],
    };

    // LES CASES OÙ LES DIVERGENTS MANGENT ICI, et le nombre de plats dédiés qui
    // en découle.
    //
    // ⚠️ SANS CE BUDGET, LA CONSIGNE RÉCLAMERAIT DES PLATS QUE LE PLAFOND
    // N'OUVRE PAS — et ce dépôt sait exactement ce que ça coûte: mesuré le
    // 2026-08-12, le modèle a rendu 16 plats pour un plafond de 15, et le plat
    // jeté par le parseur n'était pas celui en trop, c'était LE DÎNER DU
    // DIMANCHE DU FOYER. Le type est `MergedEater` parce que c'est le canal que
    // le tronc lit; ici il ne porte AUCUNE fusion — `ownDishesShown: 0`, il n'y
    // a aucun plan personnel sous les yeux du modèle.
    //
    // ⚠️ LOT B — SUR `dishBearingMembers`, pas sur le calcul brut. Un foyer qui
    // demande « un seul plat » n'ouvre AUCUNE place de plus, et c'est ce qui
    // rend son choix réel: sans ça, le plafond dirait « un plat » pendant que le
    // budget en promettrait neuf.
    // ⚠️ LES CELLULES SUIVENT LE MOTIF, PAS LA PERSONNE. Une bouche qui
    // diverge sur le RÉGIME ne peut manger la casserole à AUCUN moment: tous
    // ses repas comptent. Une bouche qui a déclaré son propre déjeuner ne sort
    // du commun QU'À CE MOMENT-LÀ — lui ouvrir un budget sur ses trois repas
    // ferait promettre dix-huit plats pour six, et `dishCapFor` dit ce qu'un
    // modèle fait d'un budget trop grand: il « déborde poliment » pour le
    // remplir.
    const compositionEaterCells = dishBearingMembers.flatMap((m) => {
      const houseRhythm = eatingRhythm.length > 0
        ? eatingRhythm
        : DEFAULT_EATING_RHYTHM;
      const own = ownMealSlots(m.habits ?? []);
      const divergesOnDiet = divergingMembers.some((d) =>
        d.memberId === m.memberId
      );
      return memberMealCells({
        away: m.away.effective,
        rhythm: divergesOnDiet
          ? houseRhythm
          : houseRhythm.filter((r) => own.includes(r.slot)),
        windowDays: daysToFill,
      });
    });
    const compositionBudget: MergedEater | null = dishBearingMembers.length === 0
      ? null
      : {
        shape: cookingShape,
        ownDishesShown: 0,
        // ⛔ ET LA FORME DE CUISINE NE REFERME PLUS CE BUDGET (2026-08-19).
        // `dedicatedDishesFor` rend 0 à `one_dish`; la liste des porteurs, elle,
        // a cessé d'écouter la forme hier — « une préférence d'effort ne prime
        // pas sur une impossibilité ». Les deux moitiés étaient donc en
        // désaccord: on nommait des porteurs de plat ET on leur ouvrait zéro
        // place. Le modèle écrivait les plats promis, le plafond les coupait,
        // et personne ne voyait rien. C'est la moitié qui manquait à ce lot.
        //
        // ⚠️ LA FORME GOUVERNE TOUT LE RESTE — sessions, longueur des recettes,
        // budget de plats de la TABLE. Elle ne peut simplement plus supprimer
        // le repas de quelqu'un.
        dedicatedDishesAsked: Math.max(1, compositionEaterCells.length),
        dedicatedCells: compositionEaterCells,
        // LOT C — LES MÊMES BOUCHES QUE LA CONSIGNE NOMME, et pas le calcul
        // brut: `dishBearingMembers` est déjà la liste plafonnée. Attribuer à
        // quelqu'un à qui le prompt ne promet rien retirerait son plat à toute
        // la table dans la vue par personne.
        dishBearerIds: dishBearingMembers.map((m) => m.memberId),
      };
    // LE SEUL NOMBRE QUE LES DEUX BOUTS LISENT — la consigne et le parseur. Un
    // `??` et pas une fusion des deux: une requête porte une opération.
    const eaterBudget: MergedEater | null = mergeBudget ?? compositionBudget;
    console.log(JSON.stringify({
      tag: "keel.household_meal.cooking_shape",
      user_id: userId,
      household_id: householdId,
      weekly_cooking_minutes: weeklyMinutes,
      time_allows_second_dish: timeAllowsASecondDish(weeklyMinutes),
      shape: cookingShape,
      // LOT B — LES TROIS FAITS CÔTE À CÔTE. `shape` seul se lirait comme la
      // décision du moteur alors que c'est parfois celle de la personne, et
      // « pourquoi n'ai-je eu qu'un plat ? » n'aurait pas de réponse trois
      // jours plus tard.
      asked_shape: askedCookingShape,
      computed_shape: computedShape,
      shape_capped: shapeCap.capped,
      shape_unused: shapeCap.unused,
      diverging: divergingMembers.map((m) => m.memberId),
      dish_bearing: dishBearingMembers.map((m) => m.memberId),
      from_merge: ladder !== null,
      // R4 — CE QUE LA CASSEROLE COMMUNE SUIT. `null` = personne n'a rien
      // déclaré, et le prompt est alors byte-identique à celui d'avant ce lot.
      // Journalisé parce qu'un plan végétarien servi à un foyer qui ne l'a pas
      // demandé n'a aucune explication trois jours plus tard sans ce champ.
      strictest_regime: strictestRegime,
      regimes: platedMembers.filter((m) => m.diet !== null).length,
    }));

    // ── L5/D8 · LA MATIÈRE DE LA DÉFUSION — LE PLAN DE BASE ────────────────
    //
    // Les plats du plan du foyer VIVANT, ramenés à la fenêtre recomposée. C'est
    // ce que « rester au plus près du plan de base » désigne, et c'est ce qui
    // préserve les courses déjà faites: sans cette liste, la consigne dirait au
    // modèle de rester près d'un plan qu'il n'a jamais vu.
    //
    // ⚠️ LE BUDGET DE PLATS NE BOUGE PAS (`merge: null` plus bas). Une défusion
    // RETIRE une bouche: elle n'a aucune raison de demander un plat de plus, et
    // lui ouvrir le bonus de fusion ferait cuisiner un plat dédié à une
    // personne qu'on vient de sortir de la table.
    const unmergeMaterial = unmerge === null ? [] : mergeMaterialShown(
      unmerge.basePlan.dishes.filter((d) =>
        d.day === null || windowDayTokens.has(d.day)
      ),
    );

    // ── C2 ④ · LE TROU D'UN PLAN MONTRÉ NE SE TRANSMET PAS ────────────────
    //
    // MESURÉ DEUX FOIS LE 2026-08-12. Un plat dont un ingrédient porte une cible
    // chiffrée est rejeté ENTIER (le verrou numérique, juste et antérieur à ce
    // chantier). Sur une fusion, la matière du plan personnel citait « whey
    // protein 90 g » et LES CINQ PETITS-DÉJEUNERS DU FOYER sont tombés d'un
    // coup. Puis la DÉFUSION a recopié le trou: « reste au plus près du plan de
    // base » est la consigne la mieux honorée de tout ce chantier — 14 titres
    // identiques sur 14 — donc c'est aussi celle qui recopie le mieux une case
    // vide. Deux plans du foyer consécutifs sans petit-déjeuner mercredi.
    //
    // ⚠️ LA MÊME FONCTION QUE LE CONSTAT D'APRÈS-PARSE (`emptySlotsIn`), avec
    // les MÊMES entrées que la consigne (le rythme du maître, les absences de
    // la fenêtre). Un second avis sur « ce que cette journée devait contenir »
    // aurait divergé du prompt au premier ajustement — et un trou annoncé là où
    // il n'y en a pas est la meilleure façon d'en faire fabriquer un.
    //
    // ⚠️ ON NE REBOUCHE RIEN ICI. On nomme la case; le modèle la compose comme
    // il compose toutes les autres. Choisir quoi y mettre est une décision de
    // produit que personne n'a prise.
    const windowDays = windowDayOrder(startsOn, durationDays);
    const gapsOf = (dishes: readonly { day: string | null; slot: string | null }[]) =>
      emptySlotsIn({
        days: windowDays,
        // ⛔ LA MÊME EXCLUSION QUE LE PARSEUR. Sans elle, ce compteur-ci
        // annoncerait une journée entière de cases vides sur le jour où, par
        // construction, on ne mange pas — et les deux lecteurs de trous
        // diraient deux choses différentes du même plan.
        cookOnlyDay,
        rhythm: eatingRhythm,
        dishes,
        awayDays,
        // LA MÊME LISTE QUE LA CONSIGNE (deux appels, plus bas), pour que le
        // constat et la consigne comptent la même grille. Aucun de ces apports
        // ne PREND de moment au foyer, donc cette liste ne creuse aucun trou
        // ici — mais passer `[]` pendant que le prompt en porterait huit ferait
        // diverger les deux au premier apport remplaçant qu'on autoriserait.
        fixedIntakes,
      });
    const mergeBaseGaps = merge === null ? [] : gapsOf(mergeBaseMaterial);
    const unmergeGaps = unmerge === null ? [] : gapsOf(unmergeMaterial);
    if (mergeBaseGaps.length > 0 || unmergeGaps.length > 0) {
      // NOMMÉ DANS LES `issues` DU PLAN NEUF, et pas seulement dans le prompt:
      // sans ça, « le plan de base était déjà troué » et « le modèle a laissé
      // tomber une case » laisseraient la même trace sur la ligne écrite.
      const shown = mergeBaseGaps.length > 0 ? mergeBaseGaps : unmergeGaps;
      issues.push(`shown_plan_gaps: ${emptySlotsLine(shown)}`);
      console.log(JSON.stringify({
        tag: "keel.household_meal.shown_plan_gaps",
        user_id: userId,
        household_id: householdId,
        operation,
        gaps: shown.map((g) => `${g.day}/${g.slot}`),
      }));
    }

    // ── FF-027 · LE SIGNAL DE FAIM DE LA FENÊTRE ──────────────────────────
    //
    // LU SUR LE PROPRIÉTAIRE DU FOYER, comme le rythme, les absences et la
    // capacité de cuisine juste au-dessus: c'est sa ligne `student_goals` qui
    // gouverne la composition. La faim d'un autre membre n'a pas de chemin de
    // collecte aujourd'hui — le tap du soir et le plancher de conversation sont
    // tous deux individuels — et inventer une agrégation ici ferait grossir le
    // dîner de quatre personnes sur le signal d'une seule, sans que personne
    // puisse relire pourquoi.
    //
    // Best-effort: un hoquet compose comme avant cette fiche.
    let hungerSignal: HungerWindowSignal = {
      days: 0,
      recurrent: false,
      windowStart: todayDate,
      windowEnd: todayDate,
    };
    try {
      hungerSignal = countHungerDays(
        await loadHungerDays(admin, { userId, todayLocalDate: todayDate }),
        todayDate,
      );
    } catch (error) {
      console.warn(`[${FN_NAME}] hunger signal unavailable`, error);
    }
    const hungerSuffix = satietyUserSuffix(hungerSignal);
    if (hungerSuffix) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.satiety_priority",
        user_id: userId,
        hunger_days: hungerSignal.days,
        window: [hungerSignal.windowStart, hungerSignal.windowEnd],
      }));
    }

    // ── D4/L6 · CE QUE CHAQUE TITULAIRE A DIT DE SA BOUFFE ────────────────
    //
    // LE TROU QUE ÇA FERME, ET IL SE MESURE EN EUROS. La réconciliation des
    // préférences est paramétrée PAR UTILISATEUR depuis toujours, et cette
    // fonction ne l'appelait que pour le maître (le « troisième chemin » plus
    // haut).
    // Les préférences durables d'un conjoint, d'un colocataire, d'un enfant
    // majeur — tout ce qu'ils avaient CONFIRMÉ sur leur propre écran — ne sont
    // jamais arrivées dans l'assiette. Un siège payé dont le « about you »
    // n'atteint pas la casserole n'achète rien.
    //
    // ⚠️ `platedMembers`, PAS `members` NI `composedMembers`. Les deux filtres du
    // chantier se composent déjà en cascade (L3 puis L2): qui n'est pas à cette
    // table n'a pas à être lu — ni sa mémoire, ni son goût. Lire quelqu'un qui
    // mange son propre plan ferait pencher la casserole du foyer vers une bouche
    // qui n'y mange pas.
    //
    // ⚠️ UNE BOUCHE SANS COMPTE N'A RIEN À LIRE, et ce n'est pas un manque (D3):
    // pas de `student_goals`, pas de mémoire. Le `filter` sur `userId` est donc
    // la règle, pas une précaution.
    //
    // ══ LOT C · LES VOIX NE PORTENT PLUS QUE DU STRUCTURÉ ═══════════════
    //
    // ⛔ `loadHouseholdVoices` A ÉTÉ RETIRÉE, ET CE N'EST PAS UN NETTOYAGE.
    // Elle lisait la ligne `student_goals` de CHAQUE titulaire à table pour en
    // tirer `food_preferences` — le magasin PLAT, alimenté par le bouton
    // « Keep » depuis les souvenirs du chat, et réconcilié contre
    // `memory_items` à chaque composition. Ce magasin est fermé (nomenclature
    // §2.1, §2.6): sans lui, cette fonction n'avait plus rien à lire.
    //
    // ⚠️ CE QUE ÇA REND, MESURABLE: la lecture de préférences repasse de N à 0
    // par génération (elle était passée de 1 à N au lot D4), et `memory_items`
    // disparaît de cette lane. Le compteur ci-dessous le dit.
    //
    // ⚠️ CE QUI RESTE, ET C'EST L'ESSENTIEL: le bloc des voix existe toujours,
    // et il porte les préférences STRUCTURÉES du titulaire qui compose —
    // `food.exclude`, `method.avoid`, avec leur `kind`, leur sujet et leur
    // date. Le plafond par membre et la garde de non-divulgation vivent
    // toujours dans `buildHouseholdVoices`, et rien ne les contourne.
    //
    // ⚠️ ET LE TROU RESTE OUVERT, NOMMÉ: les préférences structurées d'un
    // SECONDAIRE ne sont lues par personne, parce que `routeRetainedItems` est
    // appelée avec le seul `userId` du composeur. C'était déjà vrai avant ce
    // lot; le lot C retire un magasin, il n'en branche pas un second.
    // ⚠️ LE DÉNOMINATEUR RESTE, ET IL EST LE SUJET. `accountsAtTable` compte les
    // bouches à cette table qui ONT un compte — donc celles dont on POURRAIT
    // lire quelque chose. Il ne bouge pas avec ce lot; ce qui passe à zéro est
    // `reads`. Retirer le dénominateur en même temps que le numérateur rendrait
    // la fermeture invisible en production: on verrait « 0 lecture » sans
    // savoir sur combien de bouches.
    const accountsAtTable = platedMembers.filter((m) => m.userId).length;
    // ⚠️ LES ITEMS STRUCTURÉS DU COMPOSEUR, dans l'ordre du magasin: ce qu'il a
    // TAPÉ d'abord (`written`), puis ce que les producteurs ont retenu, daté.
    // Le plafond de `buildHouseholdVoices` coupe par la QUEUE, donc ce qui
    // tombe est la plus vieille récolte — jamais une consigne écrite.
    const retainedVoiceLines = [
      ...retainedComposition.written,
      ...retainedComposition.remembered,
    ];
    const voices: { voices: RawMemberVoice[]; reads: number; issues: string[] } =
      retainedVoiceLines.length > 0 && ownerMemberId
        ? {
          voices: [{
            memberId: ownerMemberId,
            displayName: members.find((m) => m.memberId === ownerMemberId)
              ?.displayName ?? "",
            lines: retainedVoiceLines,
          }],
          reads: 0,
          issues: [],
        }
        : { voices: [], reads: 0, issues: [] };
    if (retainedVoiceLines.length > 0 && !ownerMemberId) {
      // NOMMÉ: sans cette ligne, des consignes écrites par la personne qui
      // compose seraient tombées sans un mot.
      issues.push(`retained_lines_unattached:${retainedVoiceLines.length}`);
    }
    issues.push(...voices.issues);
    // LE COÛT, OBSERVABLE EN PRODUCTION. Même raison que le log des corps juste
    // au-dessus: ce lot fait passer la lecture de préférences de 1 à N par
    // génération, et un nombre qu'on ne journalise pas est un nombre que
    // personne ne verra doubler.
    console.log(JSON.stringify({
      tag: "keel.household_meal.member_voices",
      user_id: userId,
      household_id: householdId,
      accounts_at_table: accountsAtTable,
      with_lines: voices.voices.length,
      // ⚠️ `lines_raw`, ET LE NOM EST LE SUJET. Ce nombre est celui des lignes
      // AVANT les deux gardes — il ne dit PAS ce que le modèle a vu, et il
      // s'appelait `lines`, ce qui laissait croire l'inverse. Ce que le modèle
      // a vu est compté après la construction du prompt
      // (`voiceCounts.linesUsed`), et journalisé juste après elle.
      lines_raw: voices.voices.reduce((n, v) => n + v.lines.length, 0),
      reads: voices.reads,
    }));

    // ── FF-038 · LE RÉFÉRENTIEL DE COMPOSITION ────────────────────────────
    // EN OMBRE: il ne change aucune assiette. Il sert à RECALCULER les grammes
    // que le modèle déclare, pour que la mesure du chantier porte sur des
    // chiffres que le produit a faits lui-même — l'arithmétique du modèle
    // n'est jamais une preuve (garantie 2 de `meal_generation.ts`).
    //
    // FAIL-OPEN NOMMÉ: une lecture en panne rend `null`, le parseur le COMPTE,
    // et la génération continue. L'instrumentation ne doit jamais coûter un
    // dîner à un élève — et l'échec est journalisé pour qu'un référentiel
    // indisponible en boucle ne ressemble pas à un modèle qui n'écrit pas ses
    // quantités.
    let composition: CompositionIndex | null = null;
    try {
      composition = await loadCompositionIndex(admin);
    } catch (error) {
      console.warn(`[${FN_NAME}] composition index unavailable`, error);
    }

    // ⛔ HISSÉ POUR ÊTRE MESURÉ — lot M4, même raison que sur la lane solo:
    // lu en ligne, le mémo ne laissait aucune trace au runtime.
    //
    // ── LOT A · PAR SUJET, ET DEUX CHEMINS ─────────────────────────────────
    // Les notes de LA TABLE (`household`) entrent par le tronc, comme avant.
    // Les notes D'UNE BOUCHE (« Léa a danse le mardi soir ») vont dans le bloc
    // par bouche du foyer (`notes` de `buildHouseholdPromptBlocks`), rendues
    // avec le prénom et le jour: « Tuesday dinner — Léa: … ». Servir la danse
    // de Léa dans le tronc, sans son nom, donnerait une grosse part à Tom.
    //
    // ⚠️ LE RÔLE EST `composedMembers` (L3): une bouche qui a repris la main
    // n'est pas servie ici, et ses notes non plus — comptées `other_subjects`.
    const memoConstraints = goalRow.practical_constraints as
      | Record<string, unknown>
      | null;
    const memoLines = memoLinesForPrompt(memoConstraints, {
      subject: HOUSEHOLD_SUBJECT,
      who: null,
    });
    const memberNoteLines = composedMembers.flatMap((m) => {
      const subject = memberSubject(m.memberId);
      if (!subject) return [];
      return memoLinesForPrompt(memoConstraints, {
        subject,
        who: m.displayName,
      });
    });
    const memoOtherSubjects = memoFrom(memoConstraints).filter((line) =>
      line.subject !== HOUSEHOLD_SUBJECT &&
      !composedMembers.some((m) => memberSubject(m.memberId) === line.subject)
    ).length;
    const built = buildMealPrompt({
      // ── FF-030 · LES CONTRAINTES DURES, ICI AUSSI ──────────────────────
      // Cette lane portait exactement le même trou que `generate-meal-v1`:
      // l'UNION des contraintes de tous les membres était chargée (et son
      // échec est BLOQUANT ici, ce qui est le bon arbitrage pour un foyer),
      // puis passée au seul `parseGeneratedMeal`. Le modèle composait le dîner
      // d'une tablée sans savoir qui y est allergique.
      //
      // C'est le paramètre REQUIS qui a rendu cet appelant visible: le
      // compilateur l'a listé. Optionnel, il aurait gardé son trou.
      // ── FF-051 · CE QUE CHAQUE BOUCHE MANGE DÉJÀ (D1b, 2026-08-18) ─────
      // Ce paramètre valait `[]` EN DUR, et le trou était écrit en toutes
      // lettres dans FF-051 §11 Q1. Il est chargé plus haut, par bouche
      // ATTABLÉE, prénom devant et sans pouvoir prendre un moment de la table
      // — voir le bloc `loadHouseholdFixedIntakes` et son module.
      //
      // ⚠️ LE SHAKER D'UN MEMBRE N'EST TOUJOURS PAS CELUI DE LA TABLE, et
      // c'est justement pour ça que la ligne porte un prénom: « they already
      // eat these » sans nom dirait à la table entière de sauter son goûter.
      fixedIntakes,
      // ── FF-042 · `""` ICI, ET CE N'EST PAS UN TROU ─────────────────────
      // Cette lane a DÉJÀ sa consigne de régime, et elle est plus riche que
      // celle que ce paramètre porte: `householdDietBlock` (plus bas, dans
      // `buildHouseholdPromptBlocks`) écrit la ligne du plus strict de la
      // table — par `dietaryRegimePromptLine`, la même fonction — PUIS la
      // moitié que la lane solo ne peut pas connaître: qui diverge, et dont le
      // plat propre n'est pas tenu par cette phrase.
      //
      // ⚠️ REMPLIR CE CHAMP ICI METTRAIT DEUX PHRASES DE RÉGIME DANS LE MÊME
      // PROMPT. Et pas deux fois la même: ce paramètre ne saurait lire que
      // l'UNION des contraintes des membres, où « le premier régime trouvé »
      // n'est pas « le plus strict de la table ». Un foyer avec une végane et
      // un pescétarien recevrait la consigne pescétarienne au-dessus de la
      // consigne végane, dans le désordre de la base.
      //
      // Le bloc arrive par `household.userSuffix`, concaténé après
      // `built.userMessage`.
      dietBlock: "",
      // ── FF-052 · LES PROPRIÉTÉS DE JOUR NE SONT PAS ENCORE UNE DONNÉE DE
      // FOYER. Le dimanche batch d'un membre n'est pas celui de la table, et
      // la question est la même que pour l'apport fixe juste au-dessus: le
      // canal des deltas ne la porte pas. `[]` est le comportement d'AVANT,
      // assumé et nommé (FF-052 §11 Q3).
      dayProperties: [],
      safetyConstraints: constraints,
      // ── LA BOUCHE DE CHAQUE CONTRAINTE DURE ─────────────────────────────
      //
      // C'est la lane qui a MESURÉ le défaut, donc c'est la seule des trois
      // qui passe autre chose que `null`. `mouths` décide le SINGULIER: un
      // foyer d'une seule bouche (l'entrée du produit, §5) rend le bloc
      // d'avant octet pour octet, parce que « the mouths at this table » y
      // serait faux.
      //
      // ⚠️ `composedMembers`, PAS `members` (L3): ce sont les bouches pour qui
      // ce plan compose. Une bouche qui a pris la main sur sa semaine n'est pas
      // à cette table — son allergie, elle, reste dans l'union: la casserole
      // est commune même quand l'assiette ne l'est pas.
      safetyConstraintTable: {
        nameOf: constraintMouths.nameOf,
        mouths: composedMembers.length,
      },
      // ── TOUJOURS AUCUN CORPS *ICI*, ET C'EST TOUJOURS UNE DÉCISION ─────
      // (FF-030 R7, inchangé par le lot 3B.)
      //
      // Un repas de foyer nourrit plusieurs personnes. Il n'y a pas UN corps à
      // passer à la consigne de COMPOSITION, et prendre celui du titulaire
      // dimensionnerait l'assiette de tout le monde sur lui — un adulte de
      // 1,90 m ferait servir des portions d'adulte de 1,90 m à ses enfants.
      //
      // `null` plutôt qu'un corps moyen: une moyenne serait une personne qui
      // n'existe pas, présentée au modèle comme une mesure. Le nombre de parts
      // (`servings`, ci-dessous) reste la seule chose qu'on sait vraiment de
      // cette tablée.
      //
      // ⚠️ CE `null` NE VEUT PLUS DIRE « le foyer ignore les corps ». Depuis le
      // lot 3B ils entrent PAR MEMBRE, dans le brief de portions
      // (`buildPortionBrief`, greffé par `household.userSuffix` ci-dessous):
      // c'est la seule place où un corps s'adresse à UNE assiette et non au
      // plat commun. Le remplacer par un corps ici recréerait exactement le
      // défaut que ce commentaire décrit.
      body: null,
      // L'axe est une propriété de l'objectif d'UNE personne, pour la même
      // raison. Le foyer n'en a pas.
      focusAxis: null,
      doctrineBlock: doctrineBlockFor(doctrine),
      coachNoteBlock: coachNotePromptBlock(coachNote),
      protocolBlock,
      beliefKeys,
      goal: String(goalRow.goal ?? "health"),
      situation: goalRow.situation ? String(goalRow.situation) : null,
      context: String(body.context ?? "").trim().slice(0, 2000) || null,
      preferences: String(body.preferences ?? "").trim().slice(0, 2000) || null,
      mode: "to_shop",
      scope,
      slot: null,
      // LE NOMBRE DE PARTS EST CELUI DU FOYER, pas une entrée du client. Un
      // client qui enverrait 2 pour un foyer de quatre ferait cuisiner la
      // moitié du dîner, sans erreur.
      //
      // D14 — CE N'EST PLUS `members.length`, C'EST LE MOMENT LE PLUS PEUPLÉ.
      // `servings` est un SCALAIRE dans la consigne (« people at the table »)
      // et il dimensionne les COURSES; le détail par jour est écrit juste en
      // dessous, dans le bloc de présence. Le maximum plutôt qu'une moyenne:
      // une moyenne ferait manquer de quoi manger le jour où tout le monde est
      // là, le maximum fait au pire un reste. Sans absence déclarée, il vaut
      // exactement `members.length` — le comportement d'avant ce lot.
      servings: Math.min(12, Math.max(1, presence.servings)),
      pantry: [],
      todayToken,
      today: todayDate,
      country,
      daysToFill,
      eatingRhythm,
      awayDays,
      ...capacity,
      // ── D4/L6 · LE TRONC N'ENTEND PLUS PERSONNE SUR CETTE LANE ───────────
      //
      // `[]`, et ce n'est PAS une perte: les mots du maître n'ont pas disparu,
      // ils ont changé de bloc. Ils partent désormais dans le bloc DES VOIX
      // (`buildHouseholdPromptBlocks`, juste en dessous), sous son prénom, avec
      // ceux de tous les autres titulaires à cette table.
      //
      // POURQUOI DÉPLACER CE QUI MARCHAIT DÉJÀ. Le plafond par membre et la
      // garde de non-divulgation vivent dans `household_voices.ts`. Laisser le
      // maître passer par le tronc aurait fait DEUX chemins pour la même donnée,
      // dont un seul gardé — et le jour où quelqu'un aurait déplacé la garde,
      // rien n'aurait échoué. Il n'y a donc qu'une porte, et elle garde.
      //
      // ⚠️ CE `[]` NE VAUT QUE POUR LA LANE FOYER. `generate-meal-v1` continue
      // de passer `foodPreferencesForPrompt(pc)` au tronc: son plan n'a qu'un
      // titulaire et n'est lu par personne d'autre, donc ni le plafond par
      // membre ni la garde de table n'ont d'objet là-bas.
      foodPreferences: [],
      // MÊME RAISON, MÊME LANE: les voix du foyer passent par leur propre
      // canal (`household_voices`), avec son plafond par membre. Le tronc n'a
      // donc rien à dire ici — ni les goûts confirmés, ni les consignes
      // écrites. Le jour où le foyer voudra distinguer les deux, ça se fera
      // dans `household_voices`, pas en rouvrant cette porte.
      writtenInstructions: [],
      // ── LOT M4 · LE MÉMO ENTRE PAR LE TRONC, ET C'EST VOULU ─────────────
      //
      // ⚠️ CONTRAIREMENT AUX DEUX LIGNES AU-DESSUS. Les goûts et les consignes
      // écrites passent par les VOIX parce qu'ils appartiennent à une bouche et
      // qu'ils ont un plafond par membre et une garde de non-divulgation. Une
      // ligne de mémo n'est pas de cette nature: c'est un FAIT DE LA SEMAINE du
      // foyer, écrit sur la colonne du titulaire, et déjà visible sur SA carte.
      // La faire passer par les voix demanderait de l'attribuer à une bouche —
      // c'est-à-dire d'inventer une attribution que personne n'a déclarée.
      //
      // Le plafond de cinq vit à la source (`MEMO_MAX_LINES`), donc le tronc ne
      // peut pas gonfler par ici.
      memo: memoLines,
      // ── L4/D6 · LA BOUCHE REPRISE ENTRE DANS LE BUDGET DE PLATS ────────
      //
      // MESURÉ LE 2026-08-12: sans elle, ce prompt annonçait « at most 15
      // dishes » et, quinze lignes plus bas, « give them a SECOND dish ». Deux
      // consignes contradictoires dans le même message. Le modèle a rendu
      // seize plats, le parseur a jeté le dernier — le DÎNER DU DIMANCHE DU
      // FOYER, pas le plat de la personne reprise.
      //
      // `null` sur une composition ordinaire SANS divergence: le plafond est
      // alors celui d'avant ce lot, au plat près, et un test le tient.
      //
      // ⚠️ G5 — CE N'EST PLUS `mergeBudget` MAIS `eaterBudget`, et l'écart est
      // le lot: depuis le 2026-08-14 une COMPOSITION peut elle aussi réclamer
      // un plat dédié (barreau ② hors fusion). Laisser `mergeBudget` ici
      // rejouerait, mot pour mot, le défaut du 2026-08-12 — une consigne qui
      // demande un second plat dans un plafond qui n'en ouvre aucun, et le
      // parseur qui jette le dîner du dimanche du foyer.
      merge: eaterBudget,
      // ── PEUT-ON ENCORE ACHETER PUIS CUISINER AUJOURD'HUI ? ─────────────
      // `true` hors de la fenêtre du jour, et `true` aussi quand l'horloge n'a
      // pas été lue — le comportement d'hier, DIT plutôt qu'hérité.
      firstDayCookable,
      // ⛔ CALCULÉ PAR `hasFreezerDeclared`, jamais à la main: `false` (pas
      // de congélateur) et `null` (jamais demandé) doivent rendre le même
      // `false`, et c'est cette fonction-là qui le garantit. Il NE se déduit
      // pas de `kitchenEquipment` côté prompt — la lane foyer ne le passe
      // délibérément pas, et le déduire nommerait hors de portée des
      // journées que le congélateur rend atteignables.
      hasFreezer: hasFreezerDeclared(kitchenEquipment),
      // ⛔ DÉJÀ TRANCHÉ PAR LA PORTE DU CONGÉLATEUR (voir plus haut). Le tronc
      // ne refait pas la lecture de l'inventaire: il reçoit un booléen.
      oneCookingSession,
      // ⛔ DÉJÀ TRANCHÉ par `withCookDayBefore`. `null` = pas de veille, et le
      // prompt est alors byte-identique à celui d'avant ce lot.
      cookOnlyDay,
      // ⛔ `false`: la lane foyer a SON bloc (`boxSchemaBlock`, avec les
      // `member_ids`) dans son enveloppe. Deux protocoles de boîte dans le même
      // prompt, dont l'un nomme des bouches que l'autre déclare inexistantes,
      // est la pire sortie possible.
      soloBoxes: false,
      // La langue du foyer, résolue une seule fois près du fuseau: le foyer
      // cuisine ensemble, il n'a qu'une table et qu'une langue.
      contentLocale: householdContentLocale,
    });

    // ══════════════════════════════════════════════════════════════════════
    // D6.2 (2026-09-03) — CE QUE CHAQUE BOUCHE FAIT DE SON MIDI DE SEMAINE.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ UNE LECTURE À PART, ET C'EST ASSUMÉ. `work_lunch` ne sort PAS de la
    // RPC du roster: l'y ajouter demanderait une migration de la fonction, et
    // ce lot n'en a pas besoin — la colonne se lit directement, sur les mêmes
    // `member_id` que ceux qu'on compose.
    //
    // ⚠️ FAIL-OPEN NOMMÉ: une lecture en panne rend `[]`, donc aucun bloc,
    // donc le prompt de v22 — le comportement d'hier, jamais un plan faux. Et
    // l'incident est tracé, sinon un câblage débranché serait indiscernable
    // d'un foyer où personne n'emporte de gamelle.
    const workLunchRows: Array<{
      memberId: string;
      mode: string | null;
      microwave: boolean | null;
    }> = [];
    try {
      const wlRes = await admin
        .from("household_members")
        // ⛔ `member_id`, ET PAS `id` — LA TABLE N'A PAS DE COLONNE `id`.
        // Défaut trouvé par le RUN RÉEL du 2026-09-03 21:14: PostgREST refusait
        // la projection, le `catch` en dessous avalait le refus, et D6.2 ne
        // partait JAMAIS au modèle. La ligne écrite portait
        // `issues: ["work_lunch_unreadable"]` et le compteur `{mouths:0,
        // cold:0}` alors que Claire déclare une gamelle en base.
        .select("member_id, work_lunch")
        .eq("household_id", householdId);
      if (wlRes.error) throw wlRes.error;
      for (const row of (wlRes.data ?? []) as Array<Record<string, unknown>>) {
        // ⛔ `parseWorkLunch` ET PAS UNE LECTURE EN LIGNE. Il porte les trois
        // états du formulaire déplié (`at_work` illisible ⇒ `null`, pas
        // `false`; `microwave` seulement sur la gamelle), et une seconde
        // lecture de cette forme divergerait au premier ajustement.
        const parsed = parseWorkLunch(row.work_lunch);
        if (parsed === null || !parsed.atWork) continue;
        workLunchRows.push({
          // ⚠️ LE MÊME IDENTIFIANT QUE CELUI DU PROMPT. `workLunchBlock` cherche
          // la bouche par `memberId` dans `input.members`, qui sont keyés par
          // `member_id`: un autre identifiant ne l'aurait jamais trouvée, et le
          // bloc serait resté vide MÊME avec la bonne projection.
          memberId: String(row.member_id),
          mode: parsed.mode,
          microwave: parsed.microwave,
        });
      }
    } catch (error) {
      console.warn(`[${FN_NAME}] work lunch unreadable`, error);
      issues.push("work_lunch_unreadable");
    }

    const household = buildHouseholdPromptBlocks({
      // D6.2 — la réponse hebdomadaire de chaque bouche, telle qu'elle est
      // écrite. Le bloc ne sort que pour les gamelles; `outside` a déjà son
      // effet par les cinq midis `eating_out` que la porte SQL a posés.
      workLunch: workLunchRows,
      // ── G4 · LA GARDE DE TEXTE DES HABITUDES, EN UN SEUL ENDROIT ───────
      //
      // ⚠️ C'EST ICI ET NULLE PART AILLEURS. Les habitudes sont lues BRUTES
      // avec le roster (la doctrine du coach n'était pas encore chargée), et
      // c'est ce point de composition unique — le seul qui construise le
      // prompt — qui les passe à `readDraftNote` via `gateMemberHabits`. Une
      // seconde porte serait une porte SANS garde, et rien n'échouerait: un
      // prompt n'a pas de compilateur.
      //
      // `restrictionFlag`: celui de LA BOUCHE, pas du compte qui compose —
      // l'écart avec la note de brouillon est délibéré. Une note de reprise est
      // écrite par la personne qui compose, donc c'est SON plancher; une
      // habitude est une déclaration SUR une bouche, donc c'est le sien qui
      // gouverne ce qu'on accepte d'en dire. `?? true` en fail-closed: une
      // lecture de corps qui a échoué protège plutôt que d'exposer.
      members: platedMembers.map((m) => {
        const gated = gateMemberHabits({
          habits: m.habits,
          note: m.habitNote,
          doctrineForbidden,
          restrictionFlag: m.body?.restrictionFlag ?? true,
        });
        if (gated.issues.length > 0) {
          console.log(JSON.stringify({
            tag: "keel.household_meal.habits",
            user_id: userId,
            household_id: householdId,
            member_id: m.memberId,
            issues: gated.issues,
          }));
        }
        return { ...m, habits: gated.kept, habitNote: gated.note };
      }),
      // ③ — LES TRADITIONS, ET LES JOURS QUE LA FENÊTRE COUVRE.
      //
      // ⛔ `daysInWindow` EST `daysToFill`, LA MÊME LISTE QUE TOUT LE RESTE DU
      // FICHIER. En recalculer une seconde ici ferait demander un dimanche à un
      // plan qui ne le couvre pas — et le vérificateur d'en bas, qui lit
      // `daysToFill`, déclarerait alors « manqué » une case qui n'existe pas.
      traditions,
      daysInWindow: daysToFill,
      // G5 — LA FORME DE CUISINE, DÉCIDÉE PLUS HAUT ET PAR UN SEUL ENDROIT.
      cooking: cookingShape,
      divergingCount,
      // COMBIEN DE POIDS DIFFÉRENTS LA TABLE SERT — calculé par le MOTEUR, dit
      // au modèle comme un nombre de BOÎTES et rien d'autre. Sans lui, le
      // modèle écrit une boîte par classe (adultes ensemble, mineurs ensemble)
      // et le dimensionnement par bouche n'a plus rien à quoi s'appliquer.
      weightGroups: promptWeightGroups,
      // ── LOT C · QUI PEUT PORTER UN `for_member_id` ─────────────────────
      // LA MÊME LISTE QUE `divergingCount` ET QUE `divergingNames`, et pas un
      // troisième calcul: la ligne de forme promet un plat de plus à N
      // personnes, le bloc de régime dit lesquelles, celui-ci donne leur id.
      // Trois listes divergentes attribueraient un plat à quelqu'un à qui la
      // consigne n'en promet pas — et la vue par personne le retirerait alors
      // à toute la table.
      //
      // ⚠️ SUR UNE FUSION, C'EST LA PERSONNE REPRISE. `dishBearingMembers` est
      // vide sur ce chemin (`divergingMembers` l'est: voir sa garde
      // `merge !== null`), et le barreau vient de l'échelle.
      dishBearers: ladder !== null && mergedMember !== null &&
          asksForASecondDish(cookingShape)
        ? [{
          memberId: mergedMember.memberId,
          displayName: mergedMember.displayName,
        }]
        : dishBearingMembers.map((m) => ({
          memberId: m.memberId,
          displayName: m.displayName,
        })),
      // ── C1 · LA PREMIÈRE PRÉMISSE DE LA CONTAMINATION CROISÉE ─────────
      // Résolue UNE fois plus haut, avec l'union de sécurité. La seconde
      // (`dishBearers`) est juste au-dessus, et c'est la MÊME liste — le module
      // ne recalcule ni l'une ni l'autre.
      medicalMouths,
      crossContactUnnamedMedical: unnamedMedicalConstraints,
      // ── LOT 3C · COMBIEN, ET C'EST LE MÊME NOMBRE QUE LE BUDGET ────────
      // `eaterBudget` est déjà le seul nombre que la consigne et le plafond
      // lisent (voir le `??` qui le compose plus haut). Le recalculer ici
      // rouvrirait la porte que L4 a fermée: une consigne qui réclame N plats
      // dans un plafond ouvert pour M, et le parseur qui jette les DERNIERS.
      dedicatedDishesAsked: eaterBudget?.dedicatedDishesAsked ?? 0,
      // ── R4/R5 · CE QUE LA CASSEROLE COMMUNE SUIT, ET QUI N'EN MANGE PAS ──
      // `""` quand personne n'a rien déclaré: le bloc tombe du `filter` de
      // `buildHouseholdPromptBlocks` et le prompt est byte-identique à celui
      // d'avant ce lot. La consigne elle-même vient de
      // `dietaryRegimePromptLine`, jamais d'une phrase écrite ici.
      dietBlock: householdDietBlock({
        strictest: strictestRegime,
        heldBy: strictestHeldBy,
        // LES MÊMES BOUCHES QUE `divergingCount`, et pas un second calcul: la
        // ligne de forme promet un plat de plus à N personnes, ce bloc dit
        // lesquelles. Deux listes divergentes feraient promettre un plat à
        // quelqu'un que le bloc ne nomme pas.
        //
        // ⚠️ LOT B — `dishBearingMembers`, PAS `divergingMembers`. Ce bloc écrit
        // « their OWN dish is not bound by the sentence above »: le servir sous
        // un plafond `one_dish` promettrait au modèle un plat que la ligne de
        // forme lui interdit, dans le même prompt.
        divergingNames: dishBearingMembers.map((m) => m.displayName),
      }),
      // ── L7 ① · AVEC QUOI CE FOYER CUISINE ────────────────────────────────
      //
      // Lu sur `practical_constraints`, comme les jours de cuisine, le temps et
      // le budget — c'est un fait de la MAISON, pas d'une bouche, et il ne
      // change pas d'une semaine à l'autre.
      //
      // ⚠️ `null` = LA QUESTION N'A JAMAIS ÉTÉ POSÉE, et c'est le cas de 175
      // comptes sur 175 au 2026-08-18. `buildHouseholdPromptBlocks` n'assemble
      // alors aucun bloc, et le prompt est celui de v15 au caractère près.
      // ⛔ NE PAS convertir ici en « ce qui manque »: `missingKitchenTools()`
      // est appelé une seule fois, dans le module qui écrit le bloc, et c'est
      // ce qui empêche la trace de mentir sur ce que le prompt a dit.
      kitchenEquipment,
      // ══ LOT 1C · LES `craving` RETENUS REJOIGNENT LA LIGNE D'ENVIES ══════
      //
      // C'est leur lecteur nommé par la nomenclature, et il n'y en a pas
      // d'autre sur cette lane. La ligne du maître passe DEVANT: elle a été
      // écrite pour CETTE semaine, en toutes lettres, par la personne qui tient
      // le foyer.
      //
      // ⚠️ LE PLAFOND RESTE CELUI DE `buildEnvyBlock` (`MAX_ENVY_CHARS`, 500).
      // En poser un second ici couperait avant lui, sur une autre règle, et la
      // ligne servie ne serait plus celle qu'aucun des deux annonce.
      envyLine: [
        ...(envyLine ? [envyLine] : []),
        ...retainedCravings.lines,
      ].join(" · ") || null,
      restrictions,
      // ── LOT C ② · QUI PORTE UNE RÈGLE À CETTE TABLE ──────────────────────
      // Calculée UNE fois, plus haut (`ruleHolders`), et lue ici comme à la
      // sortie: la liste que le prompt montre au modèle est EXACTEMENT celle
      // contre laquelle le compteur valide. Deux résolutions feraient refuser
      // un id que le prompt vient d'écrire — un compteur qui ment sur sa propre
      // consigne.
      ruleHolders,
      presence,
      merge: merge === null || ladder === null || mergedMember === null
        ? null
        : {
          displayName: mergedMember.displayName,
          window: { startsOn, durationDays },
          // ⚠️ LOT B — LA FORME SERVIE, pas le barreau brut. `buildMergeBlock`
          // écrit la consigne de reprise à partir d'elle; lui passer le barreau
          // que le plafond vient de retenir ferait deux ordres contradictoires
          // dans un seul prompt.
          shape: cookingShape,
          // LA MÊME LISTE QUE CELLE QUI A OUVERT LE BUDGET, et c'est le point:
          // elle est calculée une seule fois, plus haut (`mergeMaterial`).
          dishes: mergeMaterial,
          // O5 — CE QUI RESTE, ET QUI EST LE PLAN. Sans lui, le modèle ne voit
          // qu'un menu et écrit ce menu-là pour tout le monde.
          baseDishes: mergeBaseMaterial,
          // C2 ④ — LES CASES QUE CETTE ANCRE NE COUVRE PAS. `[]` quand le plan
          // du foyer est complet, et le bloc est alors byte-identique à v7.
          gaps: mergeBaseGaps,
          // C6 — LE MÊME NOMBRE QUE CELUI QUI A OUVERT LE BUDGET, et c'est le
          // point: il est calculé une seule fois, plus haut.
          dedicatedDishes: mergeDedicatedDishes,
          // C6 — CE QUI DOIT ÊTRE DIFFÉRENT DANS SON PLAT. Les axes que
          // `mergeLadder` a nommés, jamais une seconde lecture des directions.
          conflicts: ladder.conflicts,
        },
      // L5/D8 — LA DÉFUSION. `unmergedName` est lu sur le ROSTER et non sur
      // `platedMembers`: la personne vient précisément d'être retirée de cette
      // liste, donc l'y chercher rendrait toujours `undefined` et la consigne
      // dirait « sans undefined ».
      unmerge: unmerge === null ? null : {
        displayName: String(unmerge.member.first_name ?? "").trim() || "Member",
        window: { startsOn, durationDays },
        dishes: unmergeMaterial,
        // C2 ④ — LE TROU DU PLAN DE BASE, DIT PLUTÔT QUE RECOPIÉ. C'est ce
        // chemin-ci qui a été mesuré: 14 titres sur 14 recopiés, case vide
        // comprise, deux plans du foyer d'affilée.
        gaps: unmergeGaps,
      },
      // D4/L6 — LES LIGNES BRUTES. Le plafond par membre et la garde de
      // non-divulgation sont appliqués DANS `buildHouseholdPromptBlocks`, pas
      // ici: filtrer de ce côté-ci ferait une garde qu'un appelant applique,
      // c'est-à-dire une garde que le prochain appelant oublie.
      voices: voices.voices,
      // ── LOT A · « CE QUE SOPHIA SAIT », PAR BOUCHE, DÉJÀ RENDU ────────────
      // Voir le bloc du mémo plus haut: les notes de la table sont dans le
      // tronc, celles d'une bouche entrent ici, avec son prénom et son jour.
      notes: memberNoteLines,
    });
    // CE QUI A ÉTÉ COUPÉ, DANS LES `issues` DU PLAN. Une troncature muette est
    // un mensonge sur ce que le modèle a vu — et « pourquoi ce plan ignore-t-il
    // ce que j'ai dit ? » n'a aucune réponse trois jours plus tard sans ça.
    issues.push(...household.voiceIssues);
    // ── CE QUE LE MODÈLE VA VOIR, EN CLAIR ────────────────────────────────
    // `generated_from` porte les mêmes nombres, mais il n'est écrit QUE si la
    // génération aboutit: un 422 `empty_meal` ou un échec modèle laissait la
    // question sans réponse. Ce log-ci part avant l'appel, donc toujours.
    console.log(JSON.stringify({
      tag: "keel.household_meal.voices_used",
      user_id: userId,
      household_id: householdId,
      heard: household.voicesHeard,
      ...household.voiceCounts,
    }));

    // ══ L7/D11 — LA RÉCLAMATION. LA DERNIÈRE CHOSE AVANT L'ARGENT ═══════════
    //
    // ⚠️ C'EST ICI QU'EST LA GARDE, ET NULLE PART AILLEURS. Le refus rapide
    // posé plus haut est une politesse; celui-ci est le plafond. L'incrément et
    // la condition sont le MÊME énoncé SQL (`insert … on conflict do update …
    // where used < limit`), donc deux fusions lancées en même temps ne peuvent
    // pas passer toutes les deux: la seconde attend le verrou de ligne, relit
    // la version validée, et n'écrit rien. Mesuré à deux connexions le
    // 2026-08-12 — la seconde a bloqué 2,9 s puis refusé.
    //
    // POURQUOI ICI ET PAS DANS LA BRANCHE `merge`, 1 200 LIGNES PLUS HAUT.
    // Entre les deux il y a huit portes qui rendent encore (`no_coach`,
    // `doctrine_unreadable`, `local_day_unresolved`…) et AUCUN appel modèle.
    // Réclamer là-haut ferait payer une unité de quota à un foyer qui n'a même
    // pas de doctrine publiée — un plafond qui se consomme sans rien produire.
    // Ici, il ne reste plus rien entre la réclamation et la dépense.
    //
    // CE QUI EST COMPTÉ, ET CE QUI NE L'EST PAS — la question de D11, tranchée:
    //   · UNE FUSION qui atteint le modèle: comptée. C'est le geste du maître,
    //     et c'est ce qui coûte 20 à 67 secondes de génération.
    //   · LA DÉFUSION (`operation: "unmerge"`): JAMAIS. Elle répare une fusion;
    //     taxer la réparation ferait payer deux fois une erreur, et D8 offre la
    //     défusion précisément comme une SORTIE. C'est structurel: ce bloc vit
    //     sous `merge !== null`.
    //   · LA REPRISE COLLANTE (une composition qui re-reprend d'office
    //     quelqu'un déjà fusionné, L5): JAMAIS. Ce n'est pas un geste du
    //     maître — la compter lui facturerait une décision qu'il n'a pas prise.
    //     Structurel aussi: `compose` ne passe pas ici.
    //   · UN REFUS AVANT LE MODÈLE (les onze de L4, le gel, le plafond
    //     lui-même): rien. Il n'a rien coûté.
    //   · UN ÉCHEC APRÈS LE MODÈLE (`meal_unparseable`, `empty_meal`,
    //     `house_rule_violated`): COMPTÉ, et c'est la décision la moins
    //     confortable du lot. Le plafond borne un COÛT, et le coût est déjà
    //     payé quand ces refus tombent. Une remise demanderait un
    //     décrément à ne jamais oublier sur six sites de retour — un oubli
    //     facture, un doublon offre des fusions, et aucun test honnête ne
    //     distingue les deux. Retour arrière: une RPC de relâche, et ces six
    //     sites.
    //
    // FAIL-OPEN SI LA RÉCLAMATION ÉCHOUE (erreur de transport, pas refus). Même
    // sens que la lecture de facturation: une panne de comptage ne doit pas
    // couper un foyer qui paie. Le fait est journalisé et rendu dans `issues`,
    // parce qu'une garde muette ressemble trait pour trait à une garde qui ne
    // mord jamais.
    let mergeQuota: MergeQuotaState | null = null;
    if (merge !== null) {
      const claim = await admin.rpc("keel_household_claim_merge_quota", {
        p_household: householdId,
        p_local_date: todayDate,
        p_member: merge.member.member_id,
      });
      if (claim.error) {
        await logEdgeFunctionError({
          functionName: FN_NAME,
          requestId,
          error: claim.error,
          metadata: { source: "merge_quota_claim", household: householdId },
        });
        issues.push("merge_quota_unreadable");
      } else {
        const claimed = claim.data as Record<string, unknown> | null;
        if (claimed?.ok === true) {
          // ⚠️ `exhausted` N'EST PAS FORCÉ. La réclamation ne rend pas cette
          // clé, et le parseur la déduit de `used >= limit`: la fusion qui
          // prend la DERNIÈRE place doit se lire comme telle. L'écrire
          // `false` ici serait un mensonge tranquille dans une trace.
          mergeQuota = parseMergeQuota(claimed);
        } else if (claimed?.reason === MERGE_QUOTA_EXHAUSTED) {
          // LA COURSE PERDUE. Le refus rapide plus haut avait vu de la place;
          // une autre fusion l'a prise entre-temps. Le mot est le même, le
          // statut aussi — et le modèle n'a toujours pas été appelé.
          // `ok: true` FORCÉ, et lui seul: le refus porte les mêmes nombres
          // que l'état, mais sous `ok: false`. `exhausted` reste DÉDUIT.
          const state = parseMergeQuota({ ...claimed, ok: true });
          console.log(JSON.stringify({
            tag: "keel.household_meal.merge_quota_exhausted",
            user_id: userId,
            household_id: householdId,
            member_id: merge.member.member_id,
            used: state?.used ?? null,
            limit: state?.limit ?? null,
            week_start: state?.weekStart ?? null,
            stage: "claim",
          }));
          return jsonResponse(req, {
            error: MERGE_QUOTA_EXHAUSTED,
            detail: mergeQuotaRefusalDetail(state),
            merge_quota: state === null ? null : {
              used: state.used,
              limit: state.limit,
              remaining: state.remaining,
              week_start: state.weekStart,
              resets_on: state.resetsOn,
            },
            request_id: requestId,
          }, { status: 429, skipErrorLog: true });
        } else {
          // Un refus NOMMÉ mais inattendu (`local_date_required`,
          // `household_required`) est un défaut de ce fichier, pas du foyer:
          // on le journalise et on laisse passer. Le taire ferait un plafond
          // qui ne compte plus rien sans que personne ne l'apprenne.
          issues.push(`merge_quota_unclaimed:${String(claimed?.reason ?? "unknown")}`);
        }
      }
    }

    // ── LE MESSAGE ENVOYÉ AU MODÈLE, COMPOSÉ À UN SEUL ENDROIT ───────────
    //
    // ⚠️ LE BLOC DE LANGUE DOIT ÊTRE LA DERNIÈRE CHOSE DU MESSAGE, et cette
    // fonction existe parce que TROIS choses se collent après lui ici: le bloc
    // satiété, le suffixe de maison, et — sur le chemin de réparation —
    // l'instruction de reprise. Composé à la main sur chaque site, le bloc se
    // retrouve en avant-dernière position, ce qui revient à ne pas l'avoir:
    // le modèle obéit à la consigne la plus récente.
    //
    // `appendContentLanguageBlock` est idempotent: le remettre le DÉPLACE en
    // queue, il ne l'empile pas.
    //
    // ── OÙ SE PLACE LA PHRASE DE REPRISE ─────────────────────────────────
    // AVANT le bloc satiété ET avant les règles de maison. C'est une DEMANDE,
    // pas une règle: le bloc de `household_meal_generation.ts` doit rester le
    // dernier, parce que c'est lui qui doit survivre à une envie contradictoire
    // — et une phrase de reprise EST une envie. Dans le tronc et pas dans
    // `extra`, pour qu'une relance ne la perde pas.
    // ══════════════════════════════════════════════════════════════════════
    // ⛔ `D3′` (2026-08-22) — L'ARBITRAGE REPASSE EN QUEUE, ET IL Y ARRIVE ICI.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ── CE QUI ÉTAIT MESURÉ, ET QUI N'EST PAS CE QUE LA FICHE DISAIT ──────
    // `buildMealPrompt` pose `PRECEDENCE_BLOCK` en queue de SON message. Cette
    // ligne-ci lui colle ensuite quatre suffixes, dont le suffixe de foyer tout
    // entier: mesuré le 2026-08-22, 2 à 9 blocs de CONTENU se retrouvaient
    // après l'arbitrage (`scripts/keel_d3_position_du_bloc_20260822.ts`); sur
    // 228 prompts archivés, 2 à 7, moyenne 3,3. La lane solo, elle, rendait 0
    // sur 74 — le défaut est celui de CETTE lane, et lui seul.
    //
    // ⛔ ET LE PIRE N'ÉTAIT PAS LA POSITION. Le rang 1 du bloc disait « the
    // hard constraints and the diet at the VERY TOP of this message », alors
    // que `== WHAT THE SHARED DISH MUST RESPECT ==` et `HOUSE RULES` sont 63 à
    // 101 lignes PLUS BAS. Le bloc envoyait le modèle chercher le régime là où
    // il n'est pas. La variante foyer nomme désormais ses blocs de verrou.
    //
    // ── CE QUE ÇA PREND, ET À QUI ────────────────────────────────────────
    // La dernière place appartenait à `crossContact.block`, qui l'avait
    // réclamée avec trois raisons écrites (règle de niveau hospitalier). Elle
    // lui est prise, et l'échange est écrit au §⑨ du plan. Ce qui le rend
    // honnête: ce bloc est le SEUL dont le contenu EST le rang des verrous, et
    // son dernier paragraphe parle encore d'allergie et de liste médicale — un
    // test l'exige (`precedence_tail_test.ts`, épreuve ⑤).
    //
    // ⚠️ `movePrecedenceToTail` EST DÉPLAÇABLE, PAS SEULEMENT IDEMPOTENT —
    // même cicatrice que `appendContentLanguageBlock`: il RETIRE l'occurrence
    // du tronc (variante solo) avant de poser la variante foyer, sinon le
    // message porterait deux hiérarchies.
    //
    // ⚠️ ET L'ORDRE DES DEUX APPELS EST LE SUJET: l'arbitrage d'abord, la
    // langue ensuite. `appendContentLanguageBlock` se replace toujours en
    // queue, donc l'arbitrage finit avant-dernier — exactement la place que ce
    // fichier déclarait déjà pour `crossContact.block`.
    // ── LOT M4 · LE COMPTEUR DU MÉMO — voir la lane solo pour le motif ───
    // `served` lit la chaîne RÉELLEMENT construite, pas le paramètre passé.
    // Dénominateur à chaque génération, `lines: 0` compris.
    // ── LOT A · LE COMPTEUR DES NOTES — sur la chaîne, PAR SUJET ─────────
    // `served` lit le message RÉELLEMENT construit: le tronc pour les notes de
    // la table, le suffixe du foyer pour celles d'une bouche. Dénominateur à
    // chaque génération, `lines: 0` compris. `other_subjects` dit combien de
    // notes visent une bouche absente de cette table — un nombre qui monte
    // est une bouche qui a repris la main avec une note qu'on ne sert plus.
    {
      const servedText = `${built.userMessage}${household.userSuffix}`;
      console.log(JSON.stringify({
        tag: "keel.household_meal.notes",
        user_id: userId,
        household_id: householdId,
        lines: memoLines.length + memberNoteLines.length,
        household_lines: memoLines.length,
        member_lines: memberNoteLines.length,
        served: [...memoLines, ...memberNoteLines].filter((line) =>
          servedText.includes(line)
        ).length,
        block_served: household.notesServed,
        other_subjects: memoOtherSubjects,
      }));
    }
    const householdUserMessage = (extra: string): string =>
      appendContentLanguageBlock(
        movePrecedenceToTail(
          `${built.userMessage}${draftNoteSuffix}${hungerSuffix}${household.userSuffix}${pregnancySuffix}${extra}`,
          "household",
        ),
        built.contentLocale,
        MEAL_TRANSLATABLE_FIELDS,
        MEAL_TOKEN_FIELDS,
      );

    // ── ⛔ LE COMPTEUR DE `D3′` — DEUX POPULATIONS, ET IL EST OBLIGATOIRE ──
    //
    // La fiche l'écrit en toutes lettres: « un lot qui ne vit que dans un
    // prompt n'a aucune preuve d'exécution ». Il n'existe AUCUNE surface de
    // sortie légale pour cet arbitrage — `dishes[].why` et
    // `member_portions[].portion_note` portent tous deux un interdit
    // d'énonciation écrit par des lots antérieurs (porte `G-disclosure`, NON
    // tranchée). Le seul compteur possible est donc un compteur d'ENTRÉE, et
    // il compte des OBJETS, pas des déclarations du modèle.
    //
    // ⛔ `ranks_without_object` EST LE NOMBRE QUI COMPTE. Un bloc qui promet
    // cinq rangs sur un prompt qui n'en porte qu'un demande au modèle
    // d'arbitrer entre des choses absentes. Sans les deux populations, « le
    // rang n'a pas mordu » et « le rang n'avait rien à mordre » rendent le même
    // zéro.
    //
    // ⚠️ RANG 2 = `beliefKeys.length`, ET C'EST UN MINORANT ASSUMÉ: la note du
    // coach et le protocole ne sont pas comptés, parce que les recompter ici
    // serait une SECONDE lecture des mêmes prémisses, et ce fichier a déjà payé
    // deux fois le prix de deux lectures qui divergent. Fiche `D3′-b`.
    const precedenceObjects: PrecedenceObjects = {
      locks: constraints.length + restrictions.length +
        (strictestRegime === null ? 0 : 1),
      coachLines: beliefKeys.length,
      kitchenAndWeek: (capacity.cookDays ?? []).length +
        (capacity.cookingTimeMin === null ? 0 : 1) +
        household.kitchenMissing.length,
      writtenBySelf: household.voiceCounts.linesUsed,
      wantedThisTime: (household.envyLineUsed ? 1 : 0) +
        (hungerSuffix.trim().length > 0 ? 1 : 0),
    };
    const precedenceRanks = countPrecedenceRanks(precedenceObjects);
    // LA POSITION, MESURÉE SUR LE MESSAGE RÉELLEMENT ENVOYÉ — pas sur une
    // intention. C'est le seuil de la `mesure APRÈS`, et il se lit sans
    // aucune génération.
    const precedencePlace = precedenceTailVerdict(householdUserMessage(""));
    // ⛔ JOURNALISÉ EN PLUS D'ÊTRE ÉCRIT (cicatrice `V0-B-bis`): un
    // `intent: "draft"` ne persiste pas `generated_from`, donc la seule trace
    // d'un prompt d'aperçu serait perdue. Aucun `member_id`, aucun terme.
    console.log(JSON.stringify({
      tag: PRECEDENCE_COUNTER_TAG,
      user_id: userId,
      household_id: householdId,
      intent,
      place: precedencePlace.verdict,
      exact: precedencePlace.exact,
      blocks_after: precedencePlace.contentBlocksAfter,
      ranks_with_object: precedenceRanks.withObject,
      ranks_without_object: precedenceRanks.withoutObject,
      by_rank: precedenceRanks.byRank,
    }));

    let result: unknown;
    try {
      result = await generateWithGemini(
        built.systemPrompt + household.systemSuffix,
        // FF-027 AVANT les règles de maison, et l'ordre est le sujet: le bloc de
        // `household_meal_generation.ts` doit rester le DERNIER, parce que c'est
        // lui qui doit survivre à une envie contradictoire. La satiété est une
        // priorité de composition, pas une règle de maison.
        householdUserMessage(""),
        0.6,
        true,
        [],
        "auto",
        // ── LE MODÈLE DE COMPOSITION, ET PAS CELUI DU CHAT (2026-08-19) ────
        // Cette lane passait `GLOBAL_AI_MODEL` (`gpt-5.4-mini`) faute de nommer
        // un modèle: le cas le PLUS complexe du produit — plusieurs bouches, des
        // allergies, des régimes qui se croisent dans une casserole — était
        // composé par le modèle du chat. Or le banc du 2026-08-11 a mesuré que
        // `gpt-5.4-mini` est le SEUL des cinq candidats à servir des aliments
        // interdits (yaourt grec à un intolérant au lactose 3 fois sur 3, poulet
        // et bœuf à un végétarien, sauce soja à un foyer sans gluten).
        {
          source: FN_NAME,
          requestId,
          userId,
          model: keelGenerationModel(),
          httpTimeoutMs: adoptingDraft
            ? DRAFT_ADOPTION_MODEL_TIMEOUT_MS
            : PLAN_HTTP_TIMEOUT_MS,
          reasoningEffort: PLAN_REASONING_EFFORT,
        },
      );
    } catch (error) {
      const message = readableErrorMessage(error);
      const timedOut = /timed\s+out|timeout|aborted|abort/i.test(message) ||
        (error instanceof Error && error.name === "AbortError");
      if (adoptingDraft && timedOut) {
        return jsonResponse(req, {
          error: "plan_adoption_timed_out",
          detail: "The plan was not written. The draft remains available to retry.",
          request_id: requestId,
        }, { status: 504 });
      }
      throw error;
    }
    if (typeof result !== "string") {
      return jsonResponse(req, {
        error: "model_returned_tool_call",
        request_id: requestId,
      }, { status: 502 });
    }

    // Hissés en `const` pour la même raison que sur la lane individuelle: la
    // relance FF-037 doit repasser par EXACTEMENT les mêmes verrous, et deux
    // objets d'arguments écrits à la main divergent au premier paramètre
    // ajouté.
    /**
     * CE QUE CHAQUE BOUCHE ÉVITE — hissé, parce que DEUX lecteurs en ont besoin:
     * le parseur (qui retire la bouche d'un contenant) et la relance (qui
     * réécrit un plat que le modèle n'a ventilé pour PERSONNE).
     *
     * ⚠️ `memberSubject` peut rendre `null` sur un identifiant difforme. `""`
     * fait rendre `[]` — « on ne sait pas pour qui » n'est pas « pour tout le
     * monde ».
     */
    const memberExclusionTerms = members.map((m) => ({
      memberId: m.memberId,
      terms: exclusionTermsFor({
        items: routedRetained.composition,
        subject: memberSubject(m.memberId) ?? "",
      }),
    }));
    const parseArgs = {
      // ⛔ LE PARSEUR EN A BESOIN AUSSI, et pour deux gardes distinctes: un
      // plat écrit sur ce jour-là est REFUSÉ, et ses cases ne comptent pas
      // comme des trous. `null` = pas de veille, comportement d'avant ce lot.
      cookOnlyDay,
      // ⛔ `false`: la lane foyer a SON bloc (`boxSchemaBlock`, avec les
      // `member_ids`) dans son enveloppe. Deux protocoles de boîte dans le même
      // prompt, dont l'un nomme des bouches que l'autre déclare inexistantes,
      // est la pire sortie possible.
      soloBoxes: false,
      doctrine: doctrine.doctrine,
      safetyConstraints: constraints,
      // FF-051 — LA MÊME VALEUR QUE LA CONSIGNE, et c'est la règle du dépôt:
      // « la consigne le dit, le parseur le tient ». Une contrainte qui ne vit
      // que dans le prompt n'est pas une garantie.
      fixedIntakes,
      dayProperties: [],
      mode: "to_shop",
      scope,
      pantry: [],
      beliefKeys,
      eatingRhythm,
      daysToFill,
      awayDays,
      cookingTimeMin: capacity.cookingTimeMin,
      // ── L'INVENTAIRE, ET C'EST LA MÊME VALEUR QUE LA CONSIGNE ─────────
      // « La consigne le dit, le parseur le tient », septième application. Le
      // prompt annonce ce que cette cuisine n'a pas; le parseur décide, avec
      // le MÊME inventaire, si `kept: "freezer"` ouvre la fenêtre de
      // conservation ou retombe sur les trois jours du frigo.
      //
      // ⚠️ RELIRE `practical_constraints` ici en ferait deux, et c'est celui
      // qu'on regarde le moins qui garderait l'ancien.
      kitchenEquipment,
      // FF-038 — LE RÉFÉRENTIEL DE COMPOSITION.
      // Chargé plus haut dans un try/catch: `null` quand la lecture a
      // échoué. L'instrumentation ne doit jamais coûter un dîner, et le
      // parseur compte l'indisponibilité nommément plutôt que de la
      // laisser ressembler à un modèle qui n'écrit pas ses quantités.
      composition,
      // L4/D6 — LA MÊME VALEUR QUE LA CONSIGNE, et les DEUX BOUTS: elle ouvre
      // le budget de plats annoncé plus haut, et elle autorise la préparation
      // d'UNE portion que les barreaux ② et ③ demandent. Passer `null` ici
      // pendant que la consigne dit ② ferait exactement ce que le run réel a
      // mesuré: le plat dédié parsé, puis jeté, et son titre resté nu en base.
      //
      // ⚠️ G5 — `eaterBudget`, PAS `mergeBudget`: les deux bouts doivent lire
      // le MÊME nombre, et une composition divergente en a un désormais.
      merge: eaterBudget,
      // ── LOT 4 · LE ROSTER ENTIER, ET PAS LES PORTEURS DE PLAT ─────────────
      //
      // ⚠️ LES DEUX BOUTS, ET C'EST LA MÊME LISTE QUE LA CONSIGNE. Le brief de
      // portions nomme ces bouches une par une (`boxingOrderLines`) et le bloc
      // de schéma donne leurs ids (`boxSchemaBlock`); ici le parseur valide
      // contre EXACTEMENT la même source — `members`, celle qui a écrit les
      // deux blocs. Un second calcul ferait promettre une boîte à quelqu'un que
      // le parseur refuse, ou l'inverse.
      //
      // ══════════════════════════════════════════════════════════════════════
      // ⛔ LE ROSTER ENTIER À NOUVEAU — v4, 2026-08-20
      // ══════════════════════════════════════════════════════════════════════
      //
      // Entre le 08-19 et le 08-20, cette liste valait
      // `weighedPortionMembers(members)`: v3 ne donnait un contenant qu'aux
      // bouches à objectif et laissait les autres dans un silence
      // (`docs/keel/BOITES-PAR-REPAS.md`). v4 renverse ce silence — « plat
      // commun » ne disait ni combien de bacs remplir dimanche, ni lequel
      // ouvrir jeudi, et devant le frigo il ne décidait rien pour trois
      // personnes sur quatre.
      //
      // Le bac commun NOMME donc les autres, et le parseur doit les accepter
      // sur un couvercle. Ce qui reste réservé aux objectifs est la PORTION
      // MILLIMÉTRÉE, et c'est `weighedMemberIds` juste en dessous qui la porte.
      //
      // ⚠️ CETTE LISTE RESTE UNE GARDE DE PARSEUR, PAS SEULEMENT UNE CONSIGNE.
      // Un nom qui n'est pas du foyer est refusé, avec un motif et un compteur.
      boxMemberIds: members.map((m) => m.memberId),
      // ══════════════════════════════════════════════════════════════════════
      // LES BOUCHES DONT L'OBJECTIF OUVRE UNE PORTION MILLIMÉTRÉE
      // ══════════════════════════════════════════════════════════════════════
      //
      // ⛔ LA MÊME EXPRESSION QUE LA CONSIGNE, ET C'EST LA MOITIÉ « PARSEUR »
      // D'UNE GARDE QUI A DÉJÀ SA MOITIÉ « PROMPT » (`boxSchemaBlock`). Les deux
      // lisent `weighedPortionMembers(members)`; un second calcul ferait
      // promettre un contenant nommé à quelqu'un que le compteur n'attend pas,
      // ou l'inverse.
      //
      // ⚠️ CE N'EST PAS UNE LISTE FERMÉE DE PLUS: c'est le seul moyen de dériver
      // `box_counts.expected` sans le modèle. Sans elle, zéro contenant rendu
      // serait indiscernable d'un foyer où personne n'en demande.
      weighedMemberIds: weighedPortionMembers(members).map((m) => m.memberId),
      // ══════════════════════════════════════════════════════════════════════
      // LA CEINTURE DE RÉGIME — LA MÊME LISTE, AVEC SA LIGNE DÉCLARÉE.
      // ══════════════════════════════════════════════════════════════════════
      //
      // ⛔ `members`, EXACTEMENT LA MÊME SOURCE QUE `boxMemberIds` JUSTE
      // AU-DESSUS, et lue dans la même expression: deux listes construites
      // séparément finiraient par ne plus décrire le même roster, et la seule
      // preuve serait une ceinture qui n'a jamais rien vu (le parseur compte
      // `regime_belt.unknown_mouth` pour ce cas-là, précisément parce qu'il ne
      // doit jamais rester muet).
      //
      // ⚠️ LA LIGNE DE CHACUN, PAS LA PLUS STRICTE DE LA TABLE.
      // `strictestRegime` gouverne le plat COMMUN (R4) — mais dès que le
      // barreau ② ouvre un plat DÉDIÉ, ce plat n'est plus borné par elle, et
      // c'est là que la viande arrive. La question à ce moment-là n'est plus
      // « que peut contenir la casserole ? » mais « cette bouche-ci peut-elle
      // manger CETTE préparation-là ? », et seule sa propre ligne y répond. Un
      // végétarien qui diverge d'une table végane est le cas qui sépare les
      // deux lectures.
      // ⛔ CE QUE CHAQUE BOUCHE A DEMANDÉ D'ÉVITER — lot du 2026-09-01.
      //
      // Mesuré: « Mon fils n'aime pas le poisson » était rangé, attribué,
      // compté (`other_subjects: 1`) — et le plan suivant servait du saumon.
      // La lane ne parle que pour `[household, titulaire]` (`retainedSpeaksFor`),
      // donc l'exclusion d'un enfant n'avait AUCUN chemin pour agir. Elle en a
      // un maintenant, et c'est le MÊME que celui des régimes: le parseur
      // retire la bouche du contenant, jamais le plat.
      //
      // ⚠️ ON PASSE TOUTES LES BOUCHES, y compris celles sans exclusion:
      // `exclusionTermsFor` rend `[]` et la carte les ignore. Filtrer ici
      // ferait une seconde idée de qui est concerné.
      boxMemberExclusions: memberExclusionTerms,
      boxMemberDiets: members.map((m) => ({
        memberId: m.memberId,
        regime: m.diet,
      })),
    } as const;

    // ══════════════════════════════════════════════════════════════════════
    // LOT 4C ① — LE PLAN ET LE TEXTE QUI L'A PRODUIT, DANS UN SEUL OBJET.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ UN SEUL `let`, ET C'EST TOUT LE CORRECTIF. Avant ce lot il y en avait
    // un seul aussi — `meal` — pendant que le TEXTE du modèle était relu plus
    // bas depuis `result`, la constante de la PREMIÈRE réponse. La relance
    // d'ancre protéique (cent lignes plus bas) remplace `meal` par le plan de la
    // SECONDE réponse; les portions, elles, restaient sur la première.
    //
    //   plan réel `45bc8a52`, 2026-08-17, `protein_anchor_retry = true`
    //     preparations écrites : prep_chicken_tray, prep_chicken_stirfry, …
    //     preparation_shares   : prep_chicken_roast, prep_rice_batch, prep_veg_tray
    //     -> DIX-HUIT parts sur dix-huit orphelines, sur les six bouches.
    //
    // La conséquence n'est pas cosmétique: la ligne ne joint rien, l'écran la
    // filtre, et LES GRAMMES PAR BOUCHE — la moitié de P4 — ne s'affichent
    // jamais. Le trou est INTERMITTENT (zéro orpheline sur les trois aperçus
    // sans relance), donc invisible à tout test qui ne rejoue pas la relance.
    //
    // ⚠️ CE N'EST PAS `parseShares` QUI ÉTAIT EN CAUSE. Le modèle n'invente pas
    // d'identifiants (zéro orpheline sur 51 parts sans relance) et le parseur ne
    // renomme aucune préparation. C'était un `current` périmé. La garde de
    // `parseShares` (liste fermée) est ajoutée quand même, et pour la raison
    // INVERSE: sans elle, ce défaut-ci n'aurait laissé AUCUNE trace. C'est
    // `share_counts.unknown` qui criera s'il revient par un autre chemin — le
    // compteur est ici la vraie protection de régression, parce qu'aucun test
    // unitaire ne peut rejouer une relance de modèle.
    //
    // ⚠️ CES DEUX `let` SE METTENT À JOUR ENSEMBLE, ET IL N'Y A QU'UN SEUL SITE
    // (l'acceptation de la relance). C'est le seul endroit du fichier où l'un
    // sans l'autre serait faux, et il porte la consigne en toutes lettres.
    let meal;
    let mealSourceText = result;
    try {
      meal = parseGeneratedMeal(result, parseArgs);
    } catch (error) {
      return jsonResponse(req, {
        error: "meal_unparseable",
        detail: readableErrorMessage(error),
        request_id: requestId,
      }, { status: 502 });
    }

    // ── FF-037 · LA MÊME RELANCE, ET C'EST DÉLIBÉRÉ ───────────────────────
    // L'ancre protéique est une propriété de l'ASSIETTE, pas de la personne:
    // rien en elle ne dépend d'un corps, d'un objectif ni d'un plancher — ce
    // qui est précisément la raison pour laquelle `body` et `focusAxis` sont
    // `null` sur cette lane et que l'ancre, elle, y survit. Ne pas la relancer
    // ici ferait des foyers la seule population à qui le produit livre des
    // dîners sans protéine, sans qu'aucune décision ne l'ait dit.
    //
    // Les règles de maison et les envies (`household.userSuffix`) sont
    // rejouées telles quelles: une relance qui les perdrait rendrait un dîner
    // qui contredit ce que le foyer a écrit.
    //
    // ── C7 ① · CE QUE LA RELANCE N'A PAS LE DROIT DE PERDRE ───────────────
    //
    // ⚠️ MESURÉ LE 2026-08-12, run 1. Le critère d'acceptation était
    // `retried.dishes.length >= meal.dishes.length`, et il est AVEUGLE au seul
    // plat qui distingue une fusion d'une composition:
    //
    //   · réponse 1  — 18 plats, 9 plats dédiés sur 9;
    //   · relance    — 20 plats, écrêtés à 18 par le plafond, 7 plats dédiés;
    //   · le compte TOTAL est identique des deux côtés (le plafond écrête les
    //     deux), donc la relance a été ACCEPTÉE — et la personne reprise a
    //     perdu son déjeuner ET son dîner du dimanche.
    //
    // ⚠️ L'ANCIEN CRITÈRE RESTE, ET IL RESTE UNE DES DEUX MOITIÉS. Il protège
    // du cas inverse — une relance qui rend une belle ancre protéique sur un
    // plan plus court — et le remplacer par le compte de plats dédiés ferait
    // exactement l'erreur qu'on répare, dans l'autre sens.
    //
    // LE COMPTE DE PLATS DÉDIÉS N'EST PAS RECALCULÉ À LA MAIN: c'est
    // `observeMergeShape`, le MÊME constat que celui qui sera archivé quelques
    // lignes plus bas, avec le MÊME dénominateur (`mergedEaterCells`). Deux
    // façons de compter les plats d'une personne finiraient par se contredire,
    // et c'est la relance qui trancherait.
    //
    // `null` hors fusion — et alors le critère se réduit à celui d'avant ce
    // lot, mot pour mot: aucune composition ordinaire ne change de comportement.
    const dedicatedMealsIn = (
      candidate: Pick<GeneratedMeal, "dishes" | "preparations">,
    ): number | null =>
      ladder === null ? null : observeMergeShape({
        shape: ladder.shape,
        dishes: candidate.dishes,
        preparations: candidate.preparations,
        eaterCells: mergedEaterCells,
      }).meals.dedicated;

    let proteinAnchorRetry = false;
    const anchorMissingBefore = meal.protein_anchor_missing.length;
    const dedicatedBefore = dedicatedMealsIn(meal);
    if (anchorMissingBefore > 0 && !adoptingDraft) {
      const retryInstruction = proteinAnchorRetryInstruction(meal.protein_anchor_missing);
      try {
        const retryResult = await generateWithGemini(
          built.systemPrompt + household.systemSuffix,
          householdUserMessage(`\n\n${retryInstruction}`),
          0.6,
          true,
          [],
          "auto",
          // MÊME MODÈLE QUE LA COMPOSITION: une relance servie par un autre
          // modèle ne répare pas le plan qu'elle relit, elle en compose un
          // autre — et le verdict porterait alors sur deux modèles mêlés.
          {
            source: `${FN_NAME}.protein_anchor_retry`,
            requestId,
            userId,
            model: keelGenerationModel(),
            httpTimeoutMs: PLAN_HTTP_TIMEOUT_MS,
            reasoningEffort: PLAN_REASONING_EFFORT,
          },
        );
        if (typeof retryResult === "string") {
          const retried = parseGeneratedMeal(retryResult, parseArgs);
          const dedicatedAfter = dedicatedMealsIn(retried);
          if (
            // ① la moitié d'avant ce lot: la relance ne raccourcit pas le plan;
            retried.dishes.length >= meal.dishes.length &&
            // ② C7 ①: et elle ne retire aucun des repas servis à part.
            (dedicatedBefore === null || dedicatedAfter === null ||
              dedicatedAfter >= dedicatedBefore) &&
            retried.protein_anchor_missing.length < anchorMissingBefore
          ) {
            meal = retried;
            // ⛔ LOT 4C ① — LES DEUX ENSEMBLE, TOUJOURS. Cette ligne et celle du
            // dessus décrivent le MÊME fait: « c'est ce texte-là qui a produit
            // ce plan-là ». Les séparer est très exactement le défaut réparé.
            mealSourceText = retryResult;
            proteinAnchorRetry = true;
          } else if (
            dedicatedBefore !== null && dedicatedAfter !== null &&
            dedicatedAfter < dedicatedBefore
          ) {
            // NOMMÉ, sinon une relance refusée POUR CE MOTIF est indiscernable
            // d'une relance qui n'a rien amélioré — et c'est ce motif-là qu'on
            // veut pouvoir compter en production.
            console.log(JSON.stringify({
              tag: "keel.household_meal.protein_anchor_retry_refused",
              user_id: userId,
              household_id: householdId,
              reason: "dedicated_meals_lost",
              dedicated_before: dedicatedBefore,
              dedicated_after: dedicatedAfter,
              dishes_before: meal.dishes.length,
              dishes_after: retried.dishes.length,
            }));
          }
        }
      } catch (error) {
        console.warn(`[${FN_NAME}] protein anchor retry failed`, error);
      }
      console.log(JSON.stringify({
        tag: "keel.household_meal.protein_anchor",
        user_id: userId,
        missing_before: anchorMissingBefore,
        missing_after: meal.protein_anchor_missing.length,
        retried: proteinAnchorRetry,
      }));
    }

    // ══════════════════════════════════════════════════════════════════════
    // LA CEINTURE DES EXCLUSIONS DU FOYER — vérifier, puis RELANCER
    // ══════════════════════════════════════════════════════════════════════
    //
    // ── LE DÉFAUT MESURÉ ─────────────────────────────────────────────────
    // Banc des 4 cycles, 2026-09-01: « Je n'aime pas le poulet » était rangé
    // en `food.exclude · subject: household` et ATTEIGNAIT le prompt
    // (`composition=2`) — et le plan servait du poulet dans deux plats sur
    // trois. Rien ne le rattrapait: `dietary_regime` ne garde que les RÉGIMES
    // déclarés (`bouches=0` mesuré), et `checkWrittenInstructions` n'est câblé
    // que sur la lane solo. Un `food.exclude` était une consigne de prompt et
    // rien d'autre — et ce dépôt a écrit ce que ça vaut: « une consigne de
    // prompt régresse. Le verrou, lui, se vérifie. »
    //
    // ── POURQUOI RELANCER, ET PAS RETIRER ────────────────────────────────
    // Une exclusion du FOYER concerne tout le monde: il n'y a personne à
    // retirer du contenant, le bac deviendrait vide. Et retirer le PLAT
    // raccourcirait le plan — c'est-à-dire faire payer son goût en journée
    // vide à la personne qu'on essaie de servir. On demande donc au modèle de
    // réécrire LES SEULS plats fautifs, comme `proteinAnchorRetry`.
    //
    // ⚠️ SURFACE `all` ICI, ET C'EST L'INVERSE DE LA CEINTURE PAR BOUCHE.
    // Là-bas un faux positif coûte le repas de quelqu'un, donc on ne lit que
    // les ingrédients déclarés. Ici il coûte un appel modèle — et rater une
    // morsure coûte plus cher que d'en inventer une.
    const householdExclusionTerms = exclusionTermsFor({
      items: routedRetained.composition,
      subject: HOUSEHOLD_SUBJECT,
    });
    /**
     * ⛔ UN PLAT QUE PERSONNE NE SE VOIT ATTRIBUER EST UN PLAT DE LA MAISON.
     *
     * Mesuré le 2026-09-01: le plat « Saumon, courgettes » n'avait AUCUNE boîte
     * (`memberIds` vide), donc la ceinture par bouche n'avait aucune
     * appartenance à retirer — et le saumon partait quand même chez l'enfant
     * qui a écrit « pas de poisson ». Le retrait agit sur une APPARTENANCE; un
     * plat non ventilé n'en a pas.
     *
     * ⇒ On l'escalade vers la relance, avec l'union de ce que TOUTE la table
     * évite. C'est le seul remède possible: on ne peut pas exclure quelqu'un
     * d'un plat qui n'est pas découpé, donc il faut réécrire le plat.
     *
     * ⚠️ L'UNION, PAS UNE MOYENNE. Un plat servi à tous doit passer la ligne de
     * CHACUN — c'est l'inverse de l'axe 3, qui interdit d'appliquer la règle
     * d'une bouche à un plat QU'ELLE NE MANGE PAS.
     */
    const unallocatedTerms = [
      ...householdExclusionTerms,
      ...memberExclusionTerms.flatMap((m) => m.terms),
    ];
    let exclusionRetried = false;
    let exclusionBitesAfter = 0;
    if (unallocatedTerms.length > 0) {
      type ParsedMeal = ReturnType<typeof parseGeneratedMeal>;
      const bitesOf = (m: ParsedMeal) =>
        m.dishes.flatMap((d) => {
          // ⚠️ DEUX JEUX DE MOTS, ET C'EST LA VENTILATION QUI CHOISIT. Un plat
          // ventilé par bouche est déjà tenu par la ceinture du parseur (elle
          // retire la bouche mordue). Un plat que personne ne se voit
          // attribuer est servi à TOUS: il doit passer la ligne de chacun,
          // sinon le seul remède — retirer une bouche — n'existe pas.
          const allocated = (d.boxes ?? []).some((b) =>
            (b?.memberIds ?? []).length > 0
          );
          const terms = allocated ? householdExclusionTerms : unallocatedTerms;
          if (terms.length === 0) return [];
          const bite = dishBitesExclusion({
            dish: { title: d.title, method: d.method, ingredients: d.ingredients },
            uses: (d.uses ?? []).map((u) => ({ preparationId: u.preparationId })),
            preparationById: new Map(m.preparations.map((p) => [p.id, p])) as never,
            terms,
            surface: "all",
          });
          return bite.matched === null
            ? []
            : [{ dish: d.title, matched: bite.matched, because: bite.because }];
        });
      const bitesBefore = bitesOf(meal);
      exclusionBitesAfter = bitesBefore.length;
      const instruction = exclusionRetryInstruction(bitesBefore);
      if (instruction && !adoptingDraft) {
        try {
          const retryResult = await generateWithGemini(
            built.systemPrompt + household.systemSuffix,
            householdUserMessage(`\n\n${instruction}`),
            0.6,
            true,
            [],
            "auto",
            // MÊME MODÈLE QUE LA COMPOSITION, même motif que la relance
            // d'ancre: une relance servie par un autre modèle ne répare pas le
            // plan qu'elle relit, elle en compose un autre.
            {
              source: `${FN_NAME}.exclusion_retry`,
              requestId,
              userId,
              model: keelGenerationModel(),
              httpTimeoutMs: PLAN_HTTP_TIMEOUT_MS,
              reasoningEffort: PLAN_REASONING_EFFORT,
            },
          );
          if (typeof retryResult === "string") {
            const retried = parseGeneratedMeal(retryResult, parseArgs);
            const after = bitesOf(retried);
            // ⛔ TROIS CONDITIONS, ET LA PREMIÈRE EST LA PLUS IMPORTANTE: une
            // relance qui RACCOURCIT le plan a « réparé » l'exclusion en
            // retirant des journées. C'est le même garde-fou que la relance
            // d'ancre protéique, et pour la même raison.
            if (
              retried.dishes.length >= meal.dishes.length &&
              after.length < bitesBefore.length
            ) {
              meal = retried;
              exclusionRetried = true;
              exclusionBitesAfter = after.length;
            }
          }
        } catch (error) {
          console.warn(`[${FN_NAME}] exclusion retry failed`, error);
        }
      }
      // ⛔ UNE MORSURE QUI SURVIT EST DITE, JAMAIS SERVIE EN SILENCE. C'est la
      // dernière ligne de défense: si la relance n'a pas suffi, la violation
      // part dans les `issues` du plan avec le mot qui a mordu et la phrase de
      // la personne. Un plan qui viole une exclusion sans le dire est
      // exactement ce que ce lot existe pour empêcher.
      for (const bite of bitesOf(meal)) {
        issues.push(
          `household asked to avoid ${JSON.stringify(bite.because ?? bite.matched)} ` +
            `and "${bite.dish}" still contains ${bite.matched}`,
        );
      }
      console.log(JSON.stringify({
        tag: "keel.household_meal.exclusion_belt",
        user_id: userId,
        household_id: householdId,
        // ⚠️ LE DÉNOMINATEUR AVANT LE NUMÉRATEUR: `terms` part même à zéro
        // morsure. Sans lui, « aucune violation » ne se distingue pas de
        // « aucune exclusion déclarée ».
        terms: householdExclusionTerms.length,
        terms_unallocated: unallocatedTerms.length,
        bites_before: bitesBefore.length,
        retried: exclusionRetried,
        bites_after: exclusionBitesAfter,
        ...meal.exclusion_belt,
      }));
    }

    // ══════════════════════════════════════════════════════════════════════
    // LOT 18 · L'INGRÉDIENT INCONNU NE CONDAMNE PLUS LA JOURNÉE
    // ══════════════════════════════════════════════════════════════════════
    //
    // ── OÙ C'EST POSÉ, ET C'EST LE CHOIX QUI COMPTE ───────────────────────
    // APRÈS la relance d'ancre protéique — donc sur le plan qu'on va ÉCRIRE, pas
    // sur un intermédiaire que la relance a peut-être remplacé (même arbitrage
    // que `observeMergeShape` juste en dessous) — et AVANT `mouthDayEnergy` +
    // `householdAnchors`.
    //
    // ⛔ C'EST **CETTE** LANE QUE LE LOT VISE, et la raison est mesurée. Les
    // deux lanes portent deux implémentations de « cible ÷ livré » qui ne
    // partagent rien: la lane solo passe par `verdictFor` (une DIRECTION, qui
    // survit à une marge), celle-ci par `anchorFactorFor` — dont la garde
    // `day_incomplete` est BINAIRE et se referme dès qu'UN plat du jour n'a pas
    // rendu son énergie. C'est là que le tout-ou-rien coûte le plus: mesuré sur
    // les 319 journées de foyer en base, 27,9 % seulement sont calculables.
    //
    // Les deux lanes sont câblées quand même, parce que le point de branchement
    // est l'INDEX — le seul objet qu'elles partagent — et qu'en câbler une seule
    // aurait fait deux référentiels différents pour deux plans du même foyer.
    //
    // ⛔ IL NE PEUT PAS FAIRE TOMBER LE PLAN: `repairPlanComposition` n'a aucun
    // chemin qui lève. Le `try` que `fillPlanComposition` pose autour est une
    // TROISIÈME ceinture.
    //
    // ── ⛔ V0-B-bis · « PAS MESURÉ » N'EST PAS « MESURÉ À ZÉRO » ───────────
    // Cette variable valait `{ unknowns: 0, shares: {}, counts: {} }` au départ,
    // et DEUX chemins la laissaient telle quelle: `composition` absent, et le
    // `catch`. Les colonnes du plan recevaient donc `0` et `{}` — « mesuré,
    // aucun inconnu » — sur un plan que le sas n'a jamais regardé. Le défaut
    // était le MÊME, à la virgule près, dans les deux lanes; il est réparé au
    // même endroit pour qu'une troisième lane ne le réintroduise pas.
    const filledComposition = await fillPlanComposition({
      baseIndex: composition,
      attempt: (baseIndex) =>
        repairPlanComposition({
          db: admin,
          baseIndex,
          // LA WORKLIST: plats ET préparations, non pliés, avec le groupe que
          // le modèle a pu déclarer sur la ligne (`DishIngredient.group`).
          inputs: [
            ...meal.dishes.flatMap((d) => d.ingredients),
            ...meal.preparations.flatMap((p) => p.ingredients),
          ].map((i) => ({
            term: i.term,
            amount: i.amount,
            unit: i.unit,
            state: i.state,
            group: i.group,
          })),
          // LES PARTS: préparations PLIÉES et au prorata — 41 % de l'énergie
          // vit dedans, et une casserole faite pour quatre dîners compterait
          // quatre fois sans le pliage.
          energyInputs: foldPreparationsIntoDishes({
            dishes: meal.dishes.map((d) => ({
              slot: d.slot,
              method: d.method,
              ingredients: d.ingredients,
              uses: d.uses,
            })),
            preparations: meal.preparations.map((prep) => ({
              id: prep.id,
              servingsMade: prep.servingsMade,
              ingredients: prep.ingredients,
            })),
          }).flatMap((d) => d.ingredients),
          meta: {
            source: `${FN_NAME}.composition_fill`,
            requestId,
            userId,
          },
        }),
      // ⛔ LE `catch` CESSE D'ÊTRE MUET. Un `console.warn` ne se compte pas: un
      // remplissage qui lève en boucle ressemblait à un remplissage qui marche.
      onMiss: (reason, error) => {
        console.error(JSON.stringify({
          tag: "keel.household_meal.composition_fill_missed",
          user_id: userId,
          household_id: householdId,
          intent,
          reason,
          // ⛔ `readableErrorMessage` ET PAS `String(error)`: une
          // `PostgrestError` est un objet nu, et le raccourci rendait
          // « [object Object] ». Un compteur d'échec qui ne dit pas DE QUOI
          // n'est qu'un compteur de silence. (Cicatrice C5 ⑥, déjà gardée.)
          error: readableErrorMessage(error),
        }));
      },
    });
    composition = filledComposition.index;
    // ══════════════════════════════════════════════════════════════════════
    // ⛔ LE PLAN EST REPESÉ SUR L'INDEX RÉPARÉ — 2026-08-23.
    // ══════════════════════════════════════════════════════════════════════
    //
    // Sans cette ligne, le sas ne réparait que le chiffre qu'on REGARDE.
    // `grams_raw` est figé par le parseur, qui a tourné sur l'index de BASE:
    // le verdict et la couverture profitaient du remplissage, la LIGNE ÉCRITE
    // EN BASE non. Deux lectures du même plan, deux masses, et c'est celle qui
    // survit au plan qui était la mauvaise.
    //
    // ⚠️ ELLE NE TOUCHE QUE LES GRAMMES. `amount`/`unit`/`state` restent la
    // déclaration du modèle — voir `regramMeal`.
    const regrammed = regramMeal(meal, composition);
    if (regrammed > 0) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.regrammed",
        user_id: userId,
        lines: regrammed,
      }));
    }
    const compositionFill = filledComposition.outcome;
    if (compositionFill.measured) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.composition_fill",
        user_id: userId,
        household_id: householdId,
        intent,
        measured: true,
        unknowns: compositionFill.unknowns,
        ...compositionFill.counts,
        shares: compositionFill.shares,
      }));
    }

    // ── D6 · LE BARREAU DEMANDÉ EST-IL DANS LE PLAN RENDU ? ───────────────
    //
    // ⚠️ MESURÉ SUR UNE FUSION SUR DEUX LE 2026-08-12. Barreau ③ demandé, et
    // le modèle a rendu quinze plats, aucun second plat, aucune session dédiée,
    // en servant la personne depuis la casserole commune (« Serve a larger
    // portion of the protein and starch »). L'archive disait
    // `separate_sessions`, le plan disait le contraire, et les deux étaient
    // dans la MÊME ligne — parce que rien ne comparait l'un à l'autre.
    //
    // ON CONSTATE, ON NE CORRIGE PAS. Refuser le plan ou relancer le modèle
    // serait un choix de produit que personne n'a pris; un plan servi depuis la
    // casserole commune reste mangeable, il est seulement moins juste que
    // promis. L'`issue` est nommée, et `generated_from` porte désormais la
    // forme DEMANDÉE à côté de la forme OBTENUE.
    //
    // APRÈS LA RELANCE D'ANCRE, exprès: c'est le plan qu'on va ÉCRIRE qu'on
    // observe, pas un intermédiaire que la relance a peut-être remplacé.
    const mergeShape = ladder === null ? null : observeMergeShape({
      shape: ladder.shape,
      dishes: meal.dishes,
      preparations: meal.preparations,
      // C3 ⑥ — REPAS PAR REPAS. `[]` hors fusion: `ladder` n'est non nul que
      // sur une fusion, donc ce cas n'existe pas — et s'il naissait un jour, le
      // constat se tairait au lieu de mentir.
      eaterCells: mergedEaterCells,
    });
    if (mergeShape !== null && !mergeShape.honoured) {
      issues.push(`${MERGE_SHAPE_NOT_HONOURED}:${mergeShape.requested}`);
      console.log(JSON.stringify({
        tag: "keel.household_meal.merge_shape_not_honoured",
        user_id: userId,
        household_id: householdId,
        member_id: merge?.member.member_id ?? null,
        requested: mergeShape.requested,
        observed: mergeShape.observed,
        // C3 ⑥ — LES COMPTES BRUTS DANS LE JOURNAL, pas seulement l'étiquette.
        // « `common_pot` » et « un plat à elle sur neuf repas » sont deux faits
        // différents, et c'est le second qu'on veut pouvoir compter.
        meals_at_table: mergeShape.meals.atTable,
        meals_dedicated: mergeShape.meals.dedicated,
        meals_from_common_pot: mergeShape.meals.fromCommonPot,
        // C7 ④ — « le même aliment dans un plus petit bol », compté à part.
        meals_cloned: mergeShape.meals.cloned,
        dishes: meal.dishes.length,
        preparations: meal.preparations.length,
      }));
    }

    // ══════════════════════════════════════════════════════════════════════
    // LE JOURNAL DE LA CEINTURE DE RÉGIME — AVANT LE PREMIER REFUS.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ SA POSITION EST LA MOITIÉ DU COMPTEUR, ET ELLE A ÉTÉ MESURÉE FAUSSE.
    // Écrit trente lignes plus bas — à côté de la trace `generated_from` — il
    // ne sortait PAS sur le run réel `7ce40002-…0002` (2026-08-19, `one_dish`):
    // le verrou médical avait vidé le plan, la fonction rendait
    // `422 empty_meal` juste en dessous, et la ceinture de régime restait
    // MUETTE — c'est-à-dire précisément le jour où on la consulte.
    //
    // `generated_from` n'existe que sur une ligne ÉCRITE. Sur un plan refusé,
    // sur un aperçu, sur un `meal_unparseable`, ce journal est la SEULE trace
    // de ce que la ceinture a lu et retiré. Il part donc avant le premier
    // `return`, et rien ne doit s'insérer entre lui et le parseur.
    //
    // ⚠️ SANS `shares_refused` ICI, ET C'EST ASSUMÉ: `reconcilePortions` tourne
    // cent lignes plus bas, et un plan vide n'a de toute façon aucune part.
    // Ce nombre-là vit dans la trace (`boxTrace.shares.regime_refused`), sur
    // les deux chemins qui écrivent quelque chose.
    console.log(JSON.stringify({
      tag: "keel.household_meal.dietary_regime",
      user_id: userId,
      household_id: householdId,
      lock: meal.lock.reason,
      dishes: meal.dishes.length,
      ...meal.regime_belt,
    }));

    // ══════════════════════════════════════════════════════════════════════
    // ⟳ LOT `L0-a` — LA CONSERVATION, EN CINQ NOMBRES
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ TROIS POPULATIONS POUR LA FENÊTRE DU CUIT, ET C'EST LE POINT DU LOT.
    // Sans `within`, on ne distingue pas « la fenêtre a tourné et rien n'a
    // mordu » de « la fenêtre n'a pas tourné »: les deux rendent
    // `violations: 0`, et le second est un lot désarmé qui ressemble à un lot
    // qui marche. Seuils: `violations` 0 sur un plan sain, `within` non nul,
    // `not_evaluated` 0.
    //
    // ⚠️ DEUX DE PLUS POUR LA FENÊTRE CRUE, et pour la même raison: une liste
    // de courses dont aucun article n'a de groupe rend exactement la même
    // chose qu'une liste parfaitement routée. `unknown_group` est ce qui
    // sépare les deux.
    //
    // ⚠️ Il part AVANT le premier `return`, comme la ceinture de régime: un
    // plan vidé par le verrou de sortie doit quand même dire ce que la fenêtre
    // a refusé.
    console.log(JSON.stringify({
      tag: "keel.household_meal.fridge_window",
      user_id: userId,
      household_id: householdId,
      dishes: meal.dishes.length,
      ...meal.fridge_window,
      ...rawWindowCounts(meal.shopping_list),
    }));

    if (meal.dishes.length === 0) {
      // Sur un APERÇU, le mot change: la question de la personne n'est pas
      // « pourquoi zéro plat », c'est « est-ce que ça a cassé mon plan ? ».
      // `draft_not_composed` répond aux deux. Le diagnostic reste identique.
      //
      // ⚠️ DEUX APPELS, ET PAS UN TERNAIRE DANS LA CLÉ: `planRefusals.int.test.ts`
      // SCANNE ce fichier à la recherche d'un LITTÉRAL. Un jeton calculé y
      // devient invisible, et son mot disparaît de l'écran sans rougir.
      const emptyBody = {
        lock: meal.lock.reason,
        issues: [...issues, ...meal.issues],
        request_id: requestId,
      };
      if (isDraft) {
        return jsonResponse(req, {
          error: "draft_not_composed",
          ...emptyBody,
        }, { status: 422 });
      }
      return jsonResponse(req, {
        error: "empty_meal",
        ...emptyBody,
      }, { status: 422 });
    }

    // ── LE VERROU DES RÈGLES DE MAISON ──────────────────────────────────
    //
    // AJOUTÉ APRÈS UN RUN RÉEL, pas par précaution. Le prompt interdit déjà de
    // commenter une règle de maison, en toutes lettres; le premier run réel a
    // produit un plat parfaitement conforme justifié par « …avec une sauce
    // protéinée, SANS NUTELLA », c'est-à-dire une phrase qui annonce à
    // l'enfant que sa demande a été refusée et l'attribue au plan plutôt qu'à
    // son parent. Une consigne de prompt régresse en réel; le verrou est
    // déterministe.
    // LES LIBELLÉS VIENNENT DU SPLIT, pas de `restrictions.map(...)`. La
    // différence n'est pas cosmétique: c'est la seule ligne du fichier qui
    // décide ce que ce verrou a le droit de taire, et la faire passer par
    // `householdHardConstraints` est ce qui rend structurellement impossible
    // qu'une allergie y entre un jour par distraction.
    const lock = applyHouseRuleLock(
      mealDishesPayload(meal),
      householdSplit.houseRuleLabels,
    );
    if (lock.violations.length > 0) {
      // SERVIR l'aliment exclu est autre chose que le nommer: là, le fond est
      // faux. On n'écrit rien.
      return jsonResponse(req, {
        error: "house_rule_violated",
        detail: lock.violations,
        request_id: requestId,
      }, { status: 422 });
    }
    const dishes = lock.dishes;
    for (const s of lock.scrubbed) issues.push(`house_rule_commented:${s}`);

    // ══════════════════════════════════════════════════════════════════════
    // LOT C ② — LE `why` A-T-IL NOMMÉ LA RÈGLE DE QUELQU'UN, ET DE QUI ?
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ `mealSourceText`, JAMAIS `result`. Même raison que `extractMemberPortions`
    // vingt lignes plus bas, et elle est mesurée: une relance d'ancre remplace
    // `meal` et laisserait ce compteur sur la réponse d'AVANT — il compterait
    // des plats que personne ne mange.
    //
    // ⚠️ IL NE JETTE RIEN. Un `why` mal attribué reste un plat qui se cuisine.
    // Ce qu'on corrige est le PROMPT; ici on constate, on nomme, et on compte.
    const whyRule = countWhyRuleAttributions(mealSourceText, ruleHolders);
    issues.push(...whyRule.issues);
    if (whyRule.counts.declared > 0 || ruleHolders.length > 0) {
      console.log(JSON.stringify({
        tag: "keel.household_meal.why_rule",
        user_id: userId,
        household_id: householdId,
        // LE DÉNOMINATEUR DE LA CONSIGNE: à combien de bouches le prompt a
        // ouvert la clé. À zéro, aucun bloc n'a été servi — et « le modèle n'a
        // rien déclaré » cesse alors de ressembler à « on ne lui a rien demandé ».
        holders: ruleHolders.length,
        ...whyRule.counts,
      }));
    }

    // ── LES PORTIONS, RÉCONCILIÉES AVEC LE FOYER RÉEL ───────────────────
    // `platedMembers`, PAS `members`: la boucle de réconciliation réattribue
    // une portion standard à toute bouche que le modèle a omise
    // (`portion_missing:<id>`). Lui passer la liste complète annulerait donc le
    // bon comportement du modèle s'il avait, lui, compris l'absence.
    const {
      portions,
      issues: portionIssues,
      // LOT 4 — LE FLOU DES CONSIGNES, COMPTÉ PAR LE MODULE QUI LES ASSAINIT.
      // Recompté ici, il divergerait de la ceinture au premier terme ajouté, et
      // c'est la copie qu'on regarde le moins qui garderait l'ancienne liste.
      vagueCounts: portionVagueCounts,
      // LOT 4C ① — LES PARTS QUI JOIGNENT, ET CELLES QUI NE JOIGNENT RIEN.
      shareCounts: portionShareCounts,
    } = reconcilePortions(
      platedMembers,
      // ⛔ `mealSourceText`, JAMAIS `result`. Voir le bloc au-dessus du `let`:
      // une relance d'ancre remplace `meal` et laissait les portions sur la
      // réponse d'avant — 18 parts orphelines sur 18, mesurées en base.
      extractMemberPortions(mealSourceText),
      // ⛔ LA LISTE FERMÉE, PRISE SUR LE PLAN QU'ON ÉCRIT. `meal.preparations`
      // est la sortie du parseur — celles qui ont SURVÉCU à ses gardes — et pas
      // ce que le modèle a déclaré. Une part qui cite une préparation refusée ne
      // joindrait rien à l'écran, exactement comme une part orpheline.
      meal.preparations.map((p) => p.id),
      // ⛔ LOT E — LES IDS DE BOÎTE DU PLAN QU'ON ÉCRIT. Même source que
      // ci-dessus, même raison: `meal.preparations` est la sortie du parseur.
      // Le 2026-08-17, le modèle a écrit « Use box_prep_chicken_shared. » dans
      // une note lue à voix haute à table; sans cette liste, la ceinture ne
      // peut pas distinguer un slug d'une phrase.
      meal.dishes.flatMap((d) => d.boxes.map((b) => b.id)),
      // ⛔ LA CEINTURE DE RÉGIME, SUR LA SECONDE SURFACE. Le scan a eu lieu UNE
      // fois, dans le parseur, avec la liste fermée et le désamorçage des
      // analogues végétaux; ici on ne fait que le LIRE. Sans cette ligne, la
      // boîte de bœuf disparaît de la part d'une bouche végane et la ligne
      // « une portion de bœuf » reste accrochée sous le plat — la cicatrice
      // « garde posée sur un seul des deux champs », rejouée.
      meal.regime_refusals,
    );

    // ── L5/D8 · TOUTES LES REPRISES QUE CE PLAN PORTE ─────────────────────
    //
    // La fusion du jour, s'il y en a une, PUIS celles qu'on reporte. L'ordre
    // n'est pas décoratif: la première entrée est le geste qui a produit cette
    // ligne, les suivantes sont l'héritage — et une trace où les deux se
    // mélangeraient ne dirait plus lequel des deux a coûté un appel modèle.
    //
    // ⚠️ CETTE LISTE EST CE QUE LA PROCHAINE COMPOSITION RELIRA. Une entrée
    // oubliée ici, c'est une personne ré-exclue au tour suivant sans que
    // personne n'ait rien demandé — le trou n°2 de L4, décalé d'un tour.
    const mergedFromAll: MergedFromEntry[] = [
      ...(merge === null || ladder === null ? [] : [
        mergedFromEntry({
          memberId: merge.member.member_id,
          userId: merge.member.user_id,
          plan: {
            id: merge.personalPlan.id,
            startsOn: merge.personalPlan.startsOn,
            durationDays: merge.personalPlan.durationDays,
            validatedAt: merge.personalPlan.validatedAt,
          },
          // ⚠️ C5 ③ — `merge.window.window`, PAS `{startsOn, durationDays}`.
          // Ces deux-là portent la fenêtre RECOMPOSÉE, c'est-à-dire ce qu'on
          // ÉCRIT; ce champ demande LES JOURS DE SON PLAN qui reviennent. Les
          // confondre a produit `days: [12,13,14]` sur une entrée dont
          // `plan_duration_days` valait 2 (mesuré le 2026-08-12).
          //
          // `mergedFromEntry` coupe de toute façon à la fenêtre du plan depuis
          // C5 ③ — l'invariant est tenu à la racine. On nomme quand même la
          // bonne fenêtre ici: un appelant qui dit une chose et se fait
          // corriger en silence est un appelant qu'on relira de travers.
          window: merge.window.window,
        }),
      ]),
      ...carryMergedFrom({
        mergedFrom: priorMergedFrom,
        heldMemberIds: stickyReclaimed,
        window: { startsOn, durationDays },
      }),
    ];

    // ══ CE QU'ON A LE DROIT DE DIRE DE CE PLAN ═══════════════════════════
    //
    // Deux blocs, deux questions, et ils ne se remplacent pas:
    //   · `rationale` .. POURQUOI CES JOURS-LÀ. Déterministe, calendrier.
    //   · `report` .... CE QUI A ÉTÉ FAIT DE CE QUI A ÉTÉ DEMANDÉ (FF-061).
    //
    // Calculés AVANT l'écriture pour être rendus aussi sur un aperçu, qui
    // n'écrit rien. Aucun des deux ne peut coûter un dîner: ils JETTENT sur un
    // champ manquant, et l'échec est attrapé, NOMMÉ dans `issues` et journalisé.
    const reportLocale: "fr" | "en" =
      householdContentLocale.slice(0, 2).toLowerCase() === "fr" ? "fr" : "en";

    // ⚠️ `doctrineForbidden` est LU ICI ET DÉFINI PLUS HAUT, juste après le
    // chargement de la doctrine. Il y a été hissé parce que la garde d'entrée de
    // la phrase de reprise en a besoin avant l'appel modèle.

    // ══════════════════════════════════════════════════════════════════════
    // LES COURSES SONT DATÉES, ET LA FENÊTRE CRUE EST CONSTATÉE — 2026-09-01
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE DÉFAUT, RAPPORTÉ SUR UN PLAN RÉEL: « ça me disait de cuisiner le
    // poulet acheté le lundi, le samedi ». Le calcul des vagues existait, il
    // était juste — et il ne tournait QUE dans un panneau d'écran replié, et
    // seulement quand il produisait deux vagues. La ligne de courses, elle, ne
    // portait aucune date. Une liste sans date se lit « achète tout maintenant ».
    //
    // ⚠️ LA DATE EST POSÉE SUR LA LIGNE, pas rendue à part. C'est ce qui la
    // fait voyager: écran, PDF du frigo, liste partageable sans compte, bande
    // du soir. Un champ rendu à côté aurait été un lecteur de plus à câbler
    // dans chaque surface — et la première oubliée serait revenue à la liste
    // sans jour.
    const wavePreps = wavePreparationsFromRows(
      meal.preparations.map((prep) => ({
        id: prep.id,
        cook_on: prep.cookOn,
        ingredients: prep.ingredients.map((ing) => ({ term: ing.term })),
      })),
    );
    const buyDates = buyDatesByIndex({
      startsOn,
      durationDays,
      shoppingList: meal.shopping_list,
      preparations: wavePreps,
    });
    meal.shopping_list = meal.shopping_list.map((line, at) => ({
      ...line,
      buy_on: buyDates[at],
    }));
    const shoppingDays: string[] = [];
    for (const date of buyDates) {
      if (date !== null && !shoppingDays.includes(date)) shoppingDays.push(date);
    }
    shoppingDays.sort();
    // ⚠️ IL SORT MÊME À UNE SEULE VAGUE. « Une course » et « on n'a pas su
    // dater » sont deux états très différents, et sans ce compteur ils rendent
    // le même silence — la cicatrice des deux compteurs du congélateur.
    issues.push(
      `shopping_waves: ${shoppingDays.length} (${shoppingDays.join(", ") || "none"})`,
    );

    // ── CE QUI NE PEUT PAS VENIR DE LA PREMIÈRE COURSE ────────────────────
    //
    // ⛔ LE GROUPE VIENT DE LA LISTE DE COURSES, pas d'une seconde résolution.
    // C'est `resolveIngredient` qui l'a posé, une fois, sur `shopping_list`; le
    // relire depuis le référentiel ici ferait deux idées du groupe d'un même
    // terme. Un terme qu'on ne retrouve pas rend `null`, et `rawKeepingBreaches`
    // le COMPTE au lieu de le ranger d'un côté ou de l'autre.
    const groupOfTerm = new Map<string, string | null>();
    for (const line of meal.shopping_list) {
      groupOfTerm.set(String(line.term ?? "").trim().toLowerCase(), line.food_group);
    }
    const rawKeeping = rawKeepingBreaches({
      window: daysToFill,
      preparations: meal.preparations.map((prep) => ({
        id: prep.id,
        cookOn: prep.cookOn,
        groups: prep.ingredients.map((ing) =>
          groupOfTerm.get(String(ing.term ?? "").trim().toLowerCase()) ?? null
        ),
      })),
    });
    if (rawKeeping.checked > 0) {
      issues.push(
        `raw_keeping_needs_later_shop: ${rawKeeping.breaches.length}/` +
          `${rawKeeping.checked} preparations`,
      );
    }
    const shopLaterDays = daysNeedingTheirOwnShop(daysToFill, rawKeeping.breaches);

    // ══════════════════════════════════════════════════════════════════════
    // L'OPTION A-T-ELLE MORDU ? — LE COMPTEUR, 2026-09-01.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ SANS LUI, UN LOT DÉSARMÉ RESSEMBLE TRAIT POUR TRAIT À UN LOT QUI
    // MARCHE. La consigne réclame UNE entrée dans `cooking_sessions`; savoir si
    // le modèle en a rendu une, trois ou zéro ne se sait qu'APRÈS, et c'est le
    // seul signal qui dira, en production, s'il faut corriger le PROMPT plutôt
    // que le parseur.
    //
    // ⚠️ IL SORT MÊME AU CAS NOMINAL (`1/1`). Se taire quand tout va bien
    // rendrait « le modèle a obéi » indiscernable de « personne n'a mesuré » —
    // la cicatrice exacte des deux compteurs du congélateur, écrite deux lignes
    // plus loin dans ce même fichier.
    if (oneCookingSession) {
      issues.push(
        `one_cooking_session: ${meal.cooking_sessions.length}/1 sessions returned`,
      );
    }
    // ── LES JOURS DE CUISINE QUE LA CONSIGNE A RÉELLEMENT SERVIS ────────
    //
    // ⛔ L'EXPLICATION DOIT LIRE LA MÊME RÉDUCTION QUE LE PROMPT. Avec l'option
    // « tout dans une session », le tronc ne garde qu'un jour
    // (`singleSessionCookDay`); lire ici les trois jours cochés ferait nommer
    // hors de portée d'autres journées que celles servies au modèle — et ce
    // serait l'explication qui aurait tort, pour la quatrième fois.
    const rationaleCookDays = [
      // ⛔ LA VEILLE D'ABORD, ET C'EST UN DÉFAUT MESURÉ LE 2026-09-01. Sans
      // cette ligne, `buildMealPrompt` nommait « ONE session, on wed » pendant
      // que l'explication écrivait « tout est cuisiné en une seule session »
      // sans jour — deux calculs du même fait, et c'est l'explication qui avait
      // tort. Vu sur le run réel `af04fd89-…`, exactement la divergence que
      // `usableCookDays` et `addedCookDays` ont déjà coûtée deux fois.
      ...(cookOnlyDay === null ? [] : [cookOnlyDay]),
      ...usableCookDays({
        // ⚠️ LES JOURS **SERVIS**, DÉRIVÉS COMPRIS — et surtout PAS la
        // version vidée qui part aux faits de rationale. Cette liste-ci
        // nomme le jour de la session unique; la vider ferait nommer une
        // journée que le modèle n'a pas reçue.
        declared: capacity.cookDays ?? [],
        window: daysToFill,
      }),
      ...addedCookDays({
        // ⚠️ LES JOURS **SERVIS**, DÉRIVÉS COMPRIS — et surtout PAS la
        // version vidée qui part aux faits de rationale. Cette liste-ci
        // nomme le jour de la session unique; la vider ferait nommer une
        // journée que le modèle n'a pas reçue.
        declared: capacity.cookDays ?? [],
        window: daysToFill,
        firstDayCookable,
      }),
    ];
    const rationaleSingleSessionDay = oneCookingSession
      ? singleSessionCookDay({ window: daysToFill, cookDays: rationaleCookDays })
      : null;
    let rationaleLines: string[] = [];
    let rationaleRefusal: string | null = null;
    try {
      const explained = explainPlanChoices({
        locale: reportLocale,
        facts: {
          // ⛔ `null` SUR CETTE LANE, ET C'EST UNE AFFIRMATION.
          //
          // La lane foyer ne calcule PAS `verdictFor`: son étage d'énergie est
          // `anchorFactorFor` (`mouth_anchor.ts`), qui travaille PAR BOUCHE et
          // s'abstient sur un bac commun (`common_pot_day`). Mesuré le
          // 2026-08-23 sur trois plans foyer réels: SIX journées-bouche sur neuf
          // n'ont aucun chiffre, et les trois autres appartiennent à une seule
          // personne.
          //
          // ⛔ DIRE « ce plan est plus léger » À UNE TABLE serait donc une
          // phrase sans sujet: plus léger POUR QUI ? La question a une réponse
          // par bouche, aucune pour la casserole. Elle se taira ici tant que le
          // foyer n'aura pas de verdict de table — c'est le lot du bac.
          energyBelowBand: null,
          // ⛔ VIDE QUAND LES JOURS SONT DÉRIVÉS, ET C'EST UN CORRECTIF.
          //
          // Ce fait-là est documenté « les jours que l'élève a COCHÉS », et son
          // gabarit dit « tu cuisines lundi et jeudi, et c'est ce qui a été
          // gardé ». Depuis A2, `capacity.cookDays` peut être une DÉRIVATION du
          // style: l'explication attribuait à la personne un choix qu'elle
          // n'avait pas fait.
          //
          // ⚠️ LES TROIS FAITS DU MÉCANISME SE TAISENT ENSEMBLE. `usableCookDays`
          // et `addedCookDays` le décrivent aussi: n'en vider qu'un ferait dire
          // au plan qu'il a ajouté un jour à une liste vide.
          declaredCookDays: (capacity.plan === null ? capacity.cookDays ?? [] : []) as never,
          // LE MÊME CALCUL QUE LA CONSIGNE, pas un second — et c'est vrai des
          // DEUX: `usableCookDays` et `addedCookDays` sont exportés par
          // `meal_generation.ts` exactement pour ça.
          usableCookDays: usableCookDays({
            declared: capacity.plan === null ? capacity.cookDays ?? [] : [],
            window: daysToFill,
          }) as never,
          addedCookDays: addedCookDays({
            declared: capacity.plan === null ? capacity.cookDays ?? [] : [],
            window: daysToFill,
            firstDayCookable,
          }) as never,
          window: { startsOn, durationDays },
          requestedWindow: requestedWindowFacts,
          today: { localDate: todayDate, dayToken: todayToken as never },
          localMinuteOfDay,
          slotsDroppedToday,
          // LES ABSENCES DÉCLARÉES SEULEMENT — pas l'union avec l'horloge.
          // « la journée est déjà entamée » et « quelqu'un a dit qu'il n'était
          // pas là » sont deux phrases différentes, et les compter ensemble
          // attribuerait une heure à une personne.
          awayInWindow: declaredAway
            .filter((a) => (daysToFill as readonly string[]).includes(a.day))
            .flatMap((a) =>
              a.slots.length === 0
                ? [{ day: a.day as never, slot: "all" }]
                : a.slots.map((s) => ({ day: a.day as never, slot: s as string }))
            ),
          // ── LES CASES QUE LE PLAN NE REMPLIT PAS ────────────────────
          // ⛔ `meal.empty_slots`, RENDU PAR LE PARSEUR — jamais un second
          // calcul. `emptySlotsIn` sait déjà ce qui n'EST PAS un trou (une
          // absence déclarée, un apport fixe, un moment hors rythme), et une
          // seconde lecture déclarerait des trous là où le vide est voulu.
          //
          // Ce compte existait depuis le 2026-08-12 et n'était lu par
          // personne: il partait en base et s'arrêtait là.
          emptySlots: meal.empty_slots as never,
          // ── CE QU'AUCUN LOT N'ATTEINT ────────────────────────────────
          // ⛔ `daysOutOfBatchReach`, LA MÊME FONCTION QUE LA CONSIGNE — et les
          // MÊMES entrées. Un calcul refait ici finirait par nommer d'autres
          // jours que ceux servis au modèle, et ce serait l'explication qui
          // aurait tort. Troisième application de la règle après
          // `usableCookDays` et `addedCookDays`.
          daysOutOfBatchReach: daysOutOfBatchReach({
            window: daysToFill,
            // ⚠️ LA MÊME RÉDUCTION QUE `buildMealPrompt`, hissée juste avant ce
            // bloc pour que les deux lectures partent du même tableau.
            cookDays: oneCookingSession
              ? (rationaleSingleSessionDay === null
                ? []
                : [rationaleSingleSessionDay])
              : rationaleCookDays,
            hasFreezer: hasFreezerDeclared(kitchenEquipment),
            maxFridgeDays: MAX_FRIDGE_DAYS,
            freezerWindowDays: FREEZER_WINDOW_DAYS,
          }) as never,
          // ── « TOUT DANS UNE SESSION » — CE QUE LA DEMANDE EST DEVENUE ─
          // `null` quand la case n'a pas été cochée: aucune ligne ne sort, et
          // l'explication d'un plan ordinaire ne bouge pas d'un caractère.
          //
          // ⚠️ LES DEUX ISSUES SONT PORTÉES ICI, ET PAS DEUX FAITS SÉPARÉS:
          // une demande refusée n'a pas de jour, et un jour n'existe pas sans
          // demande honorée. Les séparer aurait permis d'écrire les deux.
          // ── « JE CUISINE LA VEILLE » — accordée, ou refusée et pourquoi
          // `null` quand la case n'a pas été cochée: aucune ligne ne sort.
          // ── LES COURSES, EN JETONS DE JOUR ───────────────────────────
          // ⛔ LES MÊMES DATES QUE `shopping_list[].buy_on`, converties une
          // fois. Un second calcul ferait dire à l'explication un autre jour
          // que celui écrit sur la ligne qu'on coche au magasin.
          shoppingDays: shoppingDays.map((d) => dayTokenOf(d)) as never,
          // ⛔ `daysNeedingTheirOwnShop`, LA MÊME FONCTION QUE LE CONSTAT.
          shopLaterDays: shopLaterDays as never,
          // ⟳ A1 — LE FAIT EST TOUJOURS LÀ, parce que la veille n'est plus une
          // case: un plan qui commence un jour plus tôt sans un mot est un plan
          // dont la personne croit avoir perdu un jour de repas, et un plan
          // sans veille sans un mot est un plan qu'elle croit pouvoir cuisiner
          // tranquillement le lendemain midi.
          // ⟳ A2 (2026-09-03) — CE QUE LE STYLE A PLAFONNÉ. `null` quand les
          // deux questions de P2 n'ont pas été posées: aucune ligne, et
          // l'explication d'un compte antérieur ne bouge pas d'un caractère.
          cookingPlan: capacity.plan === null ? null : {
            sessions: capacity.plan.sessions,
            // LES JOURS DÉRIVÉS, dits avec les mots de la dérivation.
            cookDays: capacity.plan.cookDays as never,
            unusedRuns: capacity.plan === null || groceryRuns === null
              ? 0
              : unusedGroceryRuns(groceryRuns, capacity.plan),
            notes: capacity.plan.notes,
          },
          cookDayBefore: {
            day: cookOnlyDay as never,
            refused: cookAhead.refused,
            reason: planTiming.reason,
          },
          // ⟳ A2 — `askedOneSession`, pas `askedOneCookingSession`: « une seule
          // course » DEMANDE la session unique, et son refus sans congélateur
          // doit être dit avec les mêmes mots que la case.
          oneCookingSession: askedOneSession
            ? {
              day: (oneCookingSession ? rationaleSingleSessionDay : null) as never,
              refusedNoFreezer: !oneCookingSession,
            }
            : null,
          // ── LA SESSION QUI A DÉBORDÉ, RENDUE PAR LE PARSEUR ──────────
          // ⚠️ MESURÉE SUR LE PLAN QUI PART, pas prévue avant. La consigne
          // AUTORISE le débordement; savoir s'il a eu lieu, et de combien, ne
          // se sait qu'après.
          sessionOverruns: meal.session_overruns as never,
          budgetAmount: capacity.budgetAmount,
          // D14 — LA CASSEROLE, et pas le foyer. C'est le nombre qui a
          // réellement dimensionné les quantités.
          mouthsServed: Math.min(12, Math.max(1, presence.servings)),
          // DES PRÉNOMS, jamais des identifiants: la phrase se lit à voix haute
          // à table. Une bouche dont le nom n'a pas pu être résolu est ÉCARTÉE
          // plutôt que rendue en uuid.
          handTakenBy: [...new Set(handOff.taken.map((t) => t.member_id))]
            .map((id) => nameOf.get(id) ?? "")
            .filter(Boolean),
          mergedIn: [...new Set(mergedFromAll.map((e) => e.member_id))]
            .map((id) => nameOf.get(id) ?? "")
            .filter(Boolean),
          // G5 — LE TEMPS QUI A PLAFONNÉ LA FORME. LA MÊME VALEUR que celle qui
          // a DÉCIDÉ le barreau 900 lignes plus haut, jamais un second calcul:
          // deux lectures du même budget finiraient par faire dire au plan
          // l'inverse de ce qu'il a fait. `null` quand le foyer n'a coché aucun
          // jour ou n'a déclaré aucune durée — la phrase se tait alors.
          weeklyCookingMinutes: weeklyMinutes,
          // R4 — LE MÊME COUPLE QUE CELUI SERVI AU PROMPT, et pas un second
          // calcul: le plan explique EXACTEMENT ce qu'il a demandé au modèle.
          // Deux lectures divergentes feraient dire au plan qu'il est
          // végétarien pendant que la casserole ne l'est pas.
          sharedDishRegime: strictestRegime === null
            ? null
            : { regime: strictestRegime, heldBy: strictestHeldBy },
          // ── LOT B · LE MODE DEMANDÉ, ET CE QU'IL A DONNÉ ─────────────────
          //
          // ⚠️ LES DEUX BOOLÉENS VIENNENT DE `capCookingShape`, JAMAIS D'UNE
          // SECONDE COMPARAISON ÉCRITE ICI. Le plafond est décidé à un seul
          // endroit; deux lectures d'une même règle feraient dire au plan
          // l'inverse de ce qu'il a fait — c'est la forme de défaut que ce
          // dépôt paie en boucle.
          //
          // ⚠️ `null` QUAND RIEN N'A ÉTÉ DEMANDÉ, et la phrase se tait alors:
          // on n'explique pas une décision que personne n'a prise. Toutes les
          // requêtes écrites avant ce lot passent par là.
          //
          // DES PRÉNOMS, jamais des identifiants: la phrase se lit à voix haute
          // à table. Et ce sont ceux du CALCUL (`divergingMembers`), pas ceux de
          // la consigne — c'est très exactement ce que le plafond a retenu, donc
          // ce qu'il faut nommer. Une bouche dont le nom n'a pas pu être résolu
          // est ÉCARTÉE plutôt que rendue en uuid.
          cookingShapeChoice: askedCookingShape === null ? null : {
            capped: shapeCap.capped,
            unused: shapeCap.unused,
            outsideSharedPot: divergingMembers
              .map((m) => String(m.displayName ?? "").trim())
              .filter(Boolean),
          },
        },
      });
      rationaleLines = explained.lines;
      rationaleRefusal = explained.refusal;
    } catch (error) {
      console.error(`[${FN_NAME}] plan rationale unavailable`, error);
      issues.push("rationale_unavailable");
    }

    // ══ L35-a · CE QUE CE PLAN A SACRIFIÉ ═════════════════════════════════
    //
    // Le bloc ci-dessus explique un CALENDRIER. Celui-ci nomme les COMPROMIS,
    // et il vit dans son propre module (`plan_tradeoffs.ts`) pour une raison
    // écrite là-bas: sa quatrième phrase est l'INVERSE d'une prémisse armée,
    // et la poser au milieu de gabarits gouvernés par la règle opposée
    // garantirait qu'un futur lecteur la « répare ».
    //
    // ⚠️ MÊME POSTURE QUE LE BLOC AU-DESSUS: il ne peut pas coûter un dîner. Il
    // JETTE sur un champ manquant, l'échec est attrapé, NOMMÉ dans `issues` et
    // journalisé — et le plan sort quand même, avec ses lignes de calendrier.
    try {
      // ── LES JOURS OÙ IL MANQUE UN REPAS À UNE BOUCHE ─────────────────────
      //
      // ⚠️ PAR `memberMealCells`, LA MÊME PRIMITIVE QUE `absentAllWindow`, et
      // jamais un second parcours: un compte sur `away_days` brut aurait sa
      // propre idée de la fenêtre et du rythme, et finirait par nommer un jour
      // que le plan compose.
      //
      // ⚠️ « IL MANQUE AU MOINS UN REPAS », PAS « LA JOURNÉE ENTIÈRE », ET
      // C'EST UNE MESURE QUI A TRANCHÉ (2026-08-22): sur les 8 bouches du
      // corpus qui portent une absence déclarée, AUCUNE ne manque une journée
      // pleine — ce sont des midis. Une famille armée sur la journée pleine ne
      // mordrait jamais, et une famille qui ne mord jamais est indiscernable
      // d'une famille débranchée.
      const rhythmForPresence = eatingRhythm.length > 0
        ? eatingRhythm
        : DEFAULT_EATING_RHYTHM;
      const awayMouths = composedMembers
        .map((m) => {
          const cells = memberMealCells({
            away: m.away.effective,
            rhythm: rhythmForPresence,
            windowDays: daysToFill,
          });
          const eatenPerDay = new Map<string, number>();
          for (const cell of cells) {
            eatenPerDay.set(cell.day, (eatenPerDay.get(cell.day) ?? 0) + 1);
          }
          return {
            // DES PRÉNOMS, jamais des identifiants: la phrase se lit à voix
            // haute à table. Une bouche sans prénom résolu est écartée par le
            // module lui-même.
            name: String(m.displayName ?? "").trim(),
            // ⚠️ AUCUN `as` ICI, ET C'EST DÉLIBÉRÉ. `daysToFill` est DÉJÀ
            // `DayToken[]` (`windowDayOrder`); un cast ferait exactement ce que
            // ce dépôt a mesuré — « `as` sur un type étranger désarme le
            // typecheck », 200 en log et `null` en silence.
            days: daysToFill.filter((d) =>
              (eatenPerDay.get(d) ?? 0) < rhythmForPresence.length
            ),
            allWindow: presence.absentAllWindow.includes(m.memberId),
          };
        })
        .filter((m) => m.allWindow || m.days.length > 0);

      // ── LES BOUCHES DONT LE PLAN NE SAIT RIEN ────────────────────────────
      //
      // ⛔ « AUCUN POIDS CONNU », ET PAS « ENVELOPPE ABSENTE ». La distinction
      // est une garde, pas un détail: une enveloppe peut être absente ou
      // dégradée PARCE QU'UN PLANCHER EST LEVÉ, et nommer ces bouches-là ferait
      // de cette phrase l'exact contraire de ce qu'elle est — un désignateur.
      // Une bouche sous plancher A des pesées; elle n'entre donc jamais ici.
      //
      // Les deux sources de poids sont lues, comme partout: la SÉRIE d'un
      // compte (`latestWeight`) et la FICHE d'une bouche sans compte
      // (`declaredWeightKg`). N'en lire qu'une nommerait la moitié du foyer.
      const mouthsWithoutBody = platedMembers
        .filter((m) =>
          m.body === null ||
          (m.body.latestWeight === null && m.body.declaredWeightKg === null)
        )
        .map((m) => String(m.displayName ?? "").trim())
        .filter(Boolean);

      const tradeoffs = explainPlanTradeoffs({
        locale: reportLocale,
        facts: {
          // LA MÊME VALEUR que celle passée au module frère, jamais un second
          // calcul: deux comptes de bouches feraient parler deux plans.
          mouthsServed: Math.min(12, Math.max(1, presence.servings)),
          awayMouths,
          mouthsWithoutBody,
          // R4 — LE MÊME COUPLE que celui servi au prompt et au module frère.
          sharedDishRegime: strictestRegime === null
            ? null
            : { regime: strictestRegime },
          // LES DEUX BOOLÉENS VIENNENT DE `capCookingShape`, jamais d'une
          // seconde comparaison écrite ici.
          cookingShapeChoice: askedCookingShape === null ? null : {
            capped: shapeCap.capped,
            unused: shapeCap.unused,
          },
          weeklyCookingMinutes: weeklyMinutes,
          // ⛔ LE VERROU DE LANE, ET C'EST SON PREMIER LECTEUR VISIBLE.
          // `resolution.mode` est la sortie de `householdLaneMode`, qui mélange
          // DEUX populations par construction. Il n'est JAMAIS rendu tel quel:
          // le module s'en sert pour ouvrir UNE des quatre portes d'une phrase
          // FIXE, dont trois autres sont anodines.
          laneMode: resolution.mode,
        },
      });
      rationaleLines = [...rationaleLines, ...tradeoffs.lines];
      // ⛔ LE COMPTEUR, ET IL EST OBLIGATOIRE. « Un champ déclaré sans compteur
      // ressemble trait pour trait à un lot qui marche »: sans cette ligne, une
      // famille qui cesse de mordre est indiscernable d'un foyer sans
      // compromis. Les FAMILLES, jamais les phrases: le texte se lit à voix
      // haute à table, un log n'a pas à le porter.
      console.log(JSON.stringify({
        tag: "keel.household_meal.plan_tradeoffs",
        user_id: userId,
        household_id: householdId,
        families: tradeoffs.families,
        lines: tradeoffs.lines.length,
        refusal: tradeoffs.refusal,
        // LES POPULATIONS, côte à côte avec la sortie: c'est ce qui permet de
        // lire « la famille n'a pas mordu » comme « la prémisse était vide »
        // plutôt que comme « le lot est débranché ».
        away_mouths: awayMouths.length,
        mouths_without_body: mouthsWithoutBody.length,
        shape_capped: shapeCap.capped,
        lane_mode: resolution.mode,
      }));
      if (tradeoffs.refusal !== null) {
        issues.push(`plan_tradeoffs_refused:${tradeoffs.refusal}`);
      }
    } catch (error) {
      console.error(`[${FN_NAME}] plan tradeoffs unavailable`, error);
      issues.push("plan_tradeoffs_unavailable");
    }

    let reportLines: string[] = [];
    let reportRefusal: string | null = null;
    try {
      const gated = gateRequestReport({
        report: reportOnRequest({
          // L'ENVIE TAPÉE AU MOMENT DE COMPOSER. Le champ du formulaire, et
          // rien d'autre: la ligne d'envie du foyer et les voix des membres
          // passent par d'autres portes, avec leurs propres plafonds.
          preferences: String(body.preferences ?? "").trim().slice(0, 2000),
          dishes: dishes.map((d, at) => ({
            id: `dish_${at}`,
            title: String((d as Record<string, unknown>).title ?? ""),
            method: String((d as Record<string, unknown>).method ?? ""),
            day: ((d as Record<string, unknown>).day as string | null) ?? null,
            ingredients: (Array.isArray((d as Record<string, unknown>).ingredients)
              ? (d as Record<string, unknown>).ingredients as unknown[]
              : []).map((i) => ({
                term: String((i as Record<string, unknown>)?.term ?? ""),
              })),
          })),
          // ⚠️ PORTE 2 — LES RÈGLES DE MAISON. Un terme couvert par une règle
          // du foyer ne doit JAMAIS être cité: dire « je n'ai pas mis de
          // Nutella » ferait porter à Sophia une décision parentale. Les
          // libellés viennent du SPLIT, comme le verrou de sortie, pour qu'une
          // allergie ne puisse pas y entrer par distraction.
          //
          // La projection en `ForbiddenTerm` est la même que celle de
          // `household_restriction_lock.ts::termsFrom` (`:68`), qui ne
          // l'exporte pas.
          houseRuleTerms: householdSplit.houseRuleLabels
            .map((l) => String(l ?? "").trim())
            .filter(Boolean)
            .map((label) => ({
              ruleId: `house.${label.toLowerCase().replace(/\s+/g, "_")}`,
              token: label,
            })),
          previouslyReportedAbsent: [],
        }),
        locale: reportLocale,
        // ⚠️ PORTE 1 — LE PLANCHER TCA DU COMPTE QUI COMPOSE, et FAIL-CLOSED.
        // C'est à lui que ce bloc sera rendu. `true` par défaut: un plancher
        // qu'on n'a pas su lire ne doit pas ouvrir une phrase sur la nourriture
        // de quelqu'un qu'on soupçonne de se restreindre. Même arbitrage que la
        // lane individuelle, et que l'enveloppe plus haut dans ce fichier.
        restrictionFlag:
          composedMembers.find((m) => m.userId === userId)?.body?.restrictionFlag ??
            true,
        doctrineForbidden,
      });
      reportLines = gated.lines;
      reportRefusal = gated.refusal;
    } catch (error) {
      console.error(`[${FN_NAME}] request report unavailable`, error);
      issues.push("request_report_unavailable");
    }

    // ── L'APERÇU S'ARRÊTE ICI ────────────────────────────────────────────
    // Le SEUL saut est l'écriture. Aucune `member_portions` n'est écrite, aucun
    // quota de fusion n'est consommé (le chemin `merge` refuse `draft` tout en
    // haut), et aucun état de brouillon ne va en base: la contrainte
    // d'exclusion sur les fenêtres vivantes reste intacte.
    // ══════════════════════════════════════════════════════════════════════
    // LOT 3C — LES QUATRE NOMBRES DE L'ATTRIBUTION, ÉCRITS UNE FOIS.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ ET LISIBLES SUR UN APERÇU. C'est la moitié du compteur qui manquait:
    // `dish_owners` ne vivait que dans `generated_from`, c'est-à-dire sur une
    // ligne ÉCRITE. Un `intent: "draft"` n'écrit rien — donc toute mesure faite
    // par aperçu était aveugle, et le 2026-08-17 trois runs de vérification ont
    // dû conclure sur des plats relus un par un. Un compteur qu'on ne peut lire
    // que sur le chemin qui consomme un plan n'est pas un compteur.
    //
    // ⚠️ UNE SEULE EXPRESSION POUR LES DEUX CHEMINS: l'aperçu et l'écriture
    // lisent le même objet. Deux comptages divergeraient au premier champ
    // ajouté, et la mesure d'un aperçu cesserait de prédire celle d'un plan.
    // ══════════════════════════════════════════════════════════════════════
    // L8 — LA CIBLE DIMENSIONNE LES GRAMMAGES DES BOÎTES.
    //
    // Renversement du 2026-08-18 (`docs/keel/CALORIE_REVERSAL.md` §7): la cible
    // entre dans le générateur, et elle n'y contraint QUE la quantité pesée.
    // Aucune ligne de prompt n'est ajoutée, aucune version n'est bumpée: la
    // population qui voit une consigne différente est VIDE, à l'octet près.
    //
    // ⛔ LA DÉCISION EST DANS LE MODULE PUR. Ce bloc ne fait que trois choses:
    // lire l'état, appeler la porte par bouche, et appliquer des grammes. Il ne
    // porte aucune règle — pas d'âge, pas de plancher, pas de facteur.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ── ① LE RYTHME RÉGLÉ AU CURSEUR, DEUX SOURCES ET UNE PRÉCÉDENCE ──────
    // Même règle que `goal` et que `eating_rhythm`: pour une bouche qui a
    // réclamé son compte, ce qui fait foi est son « about you »
    // (`student_goals`); pour une bouche sans compte, c'est sa ligne de roster.
    // La différence avec `goal` est que le roster ne rend PAS encore ce champ —
    // il est neuf (`20260818190000`) — donc les deux lectures sont faites ici,
    // et dans cet ordre.
    //
    // ⚠️ LA POPULATION EST VIDE AU 2026-08-18: aucun écran n'écrit encore ce
    // curseur (le port d'écriture a été livré le matin même). Tous les facteurs
    // valent donc `1`, et le plan produit est byte-identique à celui d'hier.
    // C'est le cas NOMINAL de ce lot le jour de sa livraison, pas une panne —
    // et c'est très exactement pourquoi les compteurs ci-dessous existent.
    const paceByMember = new Map<string, number>();
    {
      const linePaces = await admin
        .from("household_members")
        .select("member_id, target_pace_kg_per_week")
        .eq("household_id", householdId);
      // Une lecture EN ÉCHEC ne fait pas tomber un dîner: elle laisse la table
      // vide, donc tous les facteurs à 1, donc le plan d'hier. Se fermer rend le
      // produit d'avant; lever ferait perdre la cuisson du samedi soir pour un
      // curseur que personne n'a réglé.
      for (const row of (linePaces.data ?? []) as Array<Record<string, unknown>>) {
        const id = String(row.member_id ?? "").trim();
        const pace = Number(row.target_pace_kg_per_week);
        if (id && Number.isFinite(pace) && pace > 0) paceByMember.set(id, pace);
      }

      const accountIdsForPace = members
        .map((m) => m.userId)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      if (accountIdsForPace.length > 0) {
        const goalPaces = await admin
          .from("student_goals")
          .select("user_id, target_pace_kg_per_week")
          .in("user_id", accountIdsForPace);

      for (const row of (goalPaces.data ?? []) as Array<Record<string, unknown>>) {
          const uid = String(row.user_id ?? "").trim();
          const member = members.find((m) => m.userId === uid);
          if (!member) continue;
          const pace = Number(row.target_pace_kg_per_week);
          // ⚠️ UN `null` CÔTÉ COMPTE N'EFFACE PAS LA LIGNE. « Cette personne n'a
          // rien réglé dans son about you » et « elle a réglé zéro » ne sont pas
          // la même phrase; seule une valeur utilisable prend la main.
          if (Number.isFinite(pace) && pace > 0) paceByMember.set(member.memberId, pace);
        }
      }
    }

      // ══════════════════════════════════════════════════════════════════
    // CE QUE CHAQUE BOUCHE PREND À CÔTÉ DU PLAT, EN KCAL PAR MOMENT
    // ══════════════════════════════════════════════════════════════════
    //
    // ⛔ DEUX SOURCES, ET L'ORDRE EST LA DÉCISION. Ce que la fiche a déclaré
    // MOMENT PAR MOMENT (`household_member_habits.slots[].extras`) gagne
    // toujours; les trois booléens PAR PERSONNE (`takes_bread / cheese /
    // dessert`) ne servent plus que là où personne n'a rien déclaré.
    //
    // ⚠️ ET LE REPORT NE SE FAIT QUE MOMENT PAR MOMENT, jamais en bloc. Une
    // bouche qui a répondu pour le dîner seul garde ses booléens au déjeuner:
    // écraser le déjeuner avec « pas renseigné » retirerait une réponse
    // existante, et le remplir avec les booléens du dîner en inventerait une.
    //
    // ⚠️ LES TROIS BOOLÉENS SONT DONC ENCORE LUS, ET LEUR RETRAIT EST UNE
    // MIGRATION À PART. `extrasSources` compte combien de bouches sont passées
    // par chaque chemin — sans ce compteur, une colonne qu'on croit morte le
    // reste jusqu'au jour où on la supprime sous quelqu'un.
    //
    // ⛔ RÉSOLU UNE FOIS PAR BOUCHE, PAS UNE FOIS PAR JOUR. `extrasOf` lit le
    // référentiel; l'appeler dans la boucle des jours referait la même
    // résolution sept fois pour un résultat identique.
    //
    // ⚠️ `composition === null` ⇒ `null` POUR TOUT LE MONDE. Le référentiel
    // n'a pas pu être lu: on ne sait pas ce que vaut un pain, donc on ne
    // retranche pas un chiffre inventé — on retombe sur le repli des fiches
    // muettes, qui est la convention d'hier.
    const extrasByMember = new Map<string, Record<string, MealExtra[]>>();
    for (const m of members) extrasByMember.set(m.memberId, m.mealExtras ?? {});
    const extrasSources: Record<string, number> = {};
    for (const source of MEAL_EXTRAS_SOURCES) extrasSources[source] = 0;
    const extrasCache = new Map<string, SlotExtraKcal>();
    const extrasFor = (memberId: string): SlotExtraKcal => {
      if (extrasCache.has(memberId)) return extrasCache.get(memberId) ?? null;
      const declared = extrasByMember.get(memberId) ?? {};
      const line = lineStructures.get(memberId);
      // Le report des booléens, calculé UNE fois: ils ne distinguent pas les
      // moments, donc le même panier vaut pour le déjeuner et le dîner.
      const carried: MealExtra[] | null = line
        ? [
          ...(line.bread ? ["bread" as MealExtra] : []),
          ...(line.cheese ? ["cheese" as MealExtra] : []),
          ...(line.dessert ? ["dessert" as MealExtra] : []),
        ]
        : null;

      // ⛔ LA PRÉCÉDENCE N'EST PAS ÉCRITE ICI. `resolveSlotExtras` la tient,
      // avec ses trois règles et les tests qui les mordent; ce qui reste ici
      // est la seule chose que le module pur ne peut pas faire — lire le
      // référentiel.
      const { bySlot, source } = resolveSlotExtras({ declared, carried });
      let out: SlotExtraKcal = null;
      if (composition && source !== "none") {
        const per: Record<string, number> = {};
        for (const [slot, chosen] of Object.entries(bySlot)) {
          const { nutrients, unresolved } = extrasOf(composition, chosen);
          if (unresolved.length > 0) {
            // ⚠️ NOMMÉ: un extra que le référentiel ne résout pas est une
            // PANNE, pas un choix. Sans cette ligne, elle se lirait comme une
            // personne qui ne prend rien à côté.
            issues.push(`meal_extras_unresolved: ${unresolved.join(", ")}`);
          }
          per[slot] = nutrients.energyKcal;
        }
        out = per;
      }
      // ⚠️ LA SOURCE SE COMPTE MÊME QUAND LE RÉFÉRENTIEL EST MUET. Elle dit ce
      // que la FICHE porte, pas ce que le calcul a pu en faire — les confondre
      // ferait lire une panne de référentiel comme une bouche non migrée.
      extrasSources[source] += 1;
      extrasCache.set(memberId, out);
      return out;
    };

    // ── ③ LA POSITION DU COACH ────────────────────────────────────────────
    // `coachCounting` est calculé AVANT le prompt (voir son bloc, juste après
    // le chargement de la doctrine): le brief de portions en descend, et deux
    // lectures d'une même position finiraient par diverger.

    // ── LE FACTEUR DE CHAQUE BOUCHE, ET LE MOTIF DE CHACUNE ───────────────
    // ⚠️ TOUTES LES BOUCHES, MOTIF COMPRIS — y compris celles à `1`. Un compteur
    // qui ne nommerait que les refus ne distingue pas « la porte a laissé
    // passer » de « la porte n'a pas tourné », et c'est la confusion que ce
    // chantier paie en boucle.
    const sizingFactors = new Map<string, number>();
    const sizingReasons: Record<string, number> = {};
    for (const reason of BOX_SIZING_REASONS) sizingReasons[reason] = 0;
    const shareReasons: Record<string, number> = {};
    for (const reason of BODY_SHARE_REASONS) shareReasons[reason] = 0;
    let shareClamped = 0;
    const mouthFactors = householdMouthFactors(
      members.map((m) => ({
        member: m,
        restriction: restrictionOf(m),
        // Le corps de SA fiche. `mouthEnvelope` lit déjà le même objet pour
        // servir une maintenance pédiatrique par bouche; on ne fabrique pas une
        // seconde lecture de corps.
        body: lineBodies.get(m.memberId) ?? null,
        paceKgPerWeek: paceByMember.get(m.memberId) ?? null,
        // L0bis — ses conditions declarees. `[]` pour toute bouche sans compte:
        // `student_safety_constraints` est clee sur `user_id` et il n'existe
        // pas de `household_member_conditions` (fiche `L0bis-a`).
        conditionRefs: conditionRefsOf(m.memberId),
      })),
      coachCounting,
    );
    for (const m of members) {
      const sizing = mouthFactors.get(m.memberId);
      if (!sizing) continue;
      sizingReasons[sizing.target.reason] = (sizingReasons[sizing.target.reason] ?? 0) + 1;
      shareReasons[sizing.share.reason] = (shareReasons[sizing.share.reason] ?? 0) + 1;
      if (sizing.clamped) shareClamped++;
      if (sizing.factor !== 1) sizingFactors.set(m.memberId, sizing.factor);
    }

    // ══════════════════════════════════════════════════════════════════════
    // L'ANCRAGE ABSOLU — `cible / livré`, et il REMPLACE le facteur relatif
    // ══════════════════════════════════════════════════════════════════════
    //
    // ── POURQUOI UNE BASCULE EXCLUSIVE, ET PAS UN RETRAIT ─────────────────
    // Le chantier prescrivait « retire la couche relative, ne l'empile pas ».
    // La mesure inverse la conclusion: l'ancrage s'abstient sur toute journée
    // dont un plat n'a pas rendu son énergie, et la couverture mesurée le
    // 2026-08-20 est de 55,4 % — donc la majorité des journées sont
    // incomplètes. Retirer `bodyShareFactors` maintenant rendrait 450/450 là
    // où le produit rend 612/344 aujourd'hui: une RÉGRESSION livrée sous le
    // nom d'un progrès.
    //
    // ⛔ ET JAMAIS LE PRODUIT DES DEUX. Le double comptage mesuré sur trois
    // runs (le modèle découpait par classe, le moteur multipliait par-dessus,
    // et l'ado dont le corps demande 2,03x la part de l'adulte en recevait
    // 1,02x) vient de la MULTIPLICATION, pas de la coexistence. Une bascule
    // exclusive l'évite entièrement.
    //
    //     ancrage tiré  ->  son facteur REMPLACE le relatif
    //     sinon         ->  le relatif reste, seul
    //
    // ⚠️ PAR JOUR, ET LE PLUS PRUDENT GAGNE. `sizeBoxesFromTarget` prend UN
    // facteur par bouche pour tout le plan, alors que l'ancrage en produit un
    // par jour. On retient le plus PROCHE DE 1: servir à toute la semaine le
    // facteur du jour le plus extrême est le seul geste qui puisse nuire, et
    // c'est celui qu'un `max` ferait. La granularité par jour appartient au
    // lot qui fera descendre `sizeBoxesFromTarget` au niveau du repas.
    const anchorReasons: Record<string, number> = {};
    for (const reason of ANCHOR_REASONS) anchorReasons[reason] = 0;
    let anchorApplied = 0;
    // ⛔ LE PLANCHER DU PLAT, COMPTÉ — dénominateur `anchorReasons` (il se lève
    // sur les mêmes bouches-jours). `COMPOSED_DISH_MIN_MEAL_SHARE` existe pour
    // être RARE: cinq extras sur une petite cible laisseraient au plat une
    // cuillère servie comme un repas. Une borne qui mordrait sur toute la
    // population ne serait plus une borne, ce serait le calcul — et sans ce
    // compte, les deux se ressemblent exactement.
    let extrasFloored = 0;

    // ══════════════════════════════════════════════════════════════════════
    // LES DEUX COMPTEURS DE REPLI DES LOTS ①② (2026-08-20)
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ ILS SE COMPTENT SUR LES BOUCHES, PAS SUR LES BOUCHES-JOURS, et ils se
    // comptent ICI — hors du `if (composition)`. Les deux lots posent des
    // questions sur une FICHE; un compteur qui ne parlerait que sur les
    // journées ancrées rendrait « personne n'a répondu » sur un foyer où tout
    // le monde a répondu et où la composition n'a pas pu être lue. C'est très
    // exactement le zéro ambigu que le voisin `anchor` documente au-dessus.
    //
    // ⛔ ET ILS ONT QUATRE CASES, PAS DEUX. `not_asked` (fiche plus vieille que
    // le lot) et `not_answered` (question posée, refusée) ne se réparent pas du
    // tout de la même façon: la première demande d'aller poser la question, la
    // seconde demande de ne rien faire. Les fondre est la faute que ce chantier
    // paie en boucle.
    //
    // ⛔ AUCUN `member_id`, comme ses trois voisins: ce sont des histogrammes.
    const activityAnswers: Record<string, number> = {};
    for (const state of ACTIVITY_ANSWER_STATES) activityAnswers[state] = 0;
    const activitySources: Record<string, number> = {};
    for (const source of ACTIVITY_FACTOR_SOURCES) activitySources[source] = 0;
    const structureAnswers: Record<string, number> = {};
    for (const state of MEAL_STRUCTURE_STATES) structureAnswers[state] = 0;
    const appetiteAnswers: Record<string, number> = {
      declared: 0,
      not_answered: 0,
      not_asked: 0,
    };
    for (const m of members) {
      const body = lineBodies.get(m.memberId) ?? null;
      const axes = body?.activityAxes ?? { day: null, sport: null, asked: false };
      activityAnswers[activityAnswerState(axes)] += 1;
      // ⚠️ LA SOURCE EST COMPTÉE À PART DE L'ÉTAT, ET LES DEUX NE DISENT PAS LA
      // MÊME CHOSE. `not_asked` dit ce que la FICHE porte; `legacy` dit quel
      // nombre a réellement multiplié un métabolisme de base. Une fiche
      // `not_asked` qui porte un ancien cran sort `legacy` — c'est-à-dire le
      // produit d'hier, à l'identique — et une fiche `not_asked` sans cran sort
      // `assumed`, c'est-à-dire l'hypothèse 1,5. Un seul histogramme
      // confondrait les deux, et la compatibilité ascendante serait invérifiable.
      activitySources[activityFactorOf(axes, body?.activityLevel ?? null).source] += 1;
      // ⟳ 2026-09-01 — LE COMPTEUR LIT LA MÊME SOURCE QUE L'ANCRAGE.
      // Deux lectures de « ce qu'elle prend à côté » finiraient par compter
      // un état que le calcul n'a pas appliqué — et c'est le compteur qu'on
      // relit pour savoir si le lot sert à quelque chose.
      structureAnswers[mealStructureState(extrasFor(m.memberId))] += 1;
      // ── ⑤ L'APPÉTIT — TROIS ÉTATS, ET LE TROISIÈME EST LE SUJET ────────
      // `declared` / `not_answered` / `not_asked`. `average` et « pas
      // répondu » rendent le MÊME facteur (x1,00) et ne sont pas le même état:
      // sans la distinction, on ne peut pas savoir si la question sert à
      // quelque chose. C'est le zéro ambigu, pour la troisième fois de ce
      // chantier.
      appetiteAnswers[
        body?.appetite != null
          ? "declared"
          : (row_appetite_asked.has(m.memberId) ? "not_answered" : "not_asked")
      ] += 1;
    }
    // ⛔ HISSÉES POUR `unmetDemand`, ET POUR RIEN D'AUTRE. Les deux naissaient
    // dans le bloc ci-dessous et mouraient avec lui; le fork aval/amont du LOT 3
    // se mesure APRÈS le dimensionnement, qui est cent lignes plus bas. Les
    // recalculer là-bas ferait deux lectures du même plan — le patron que ce
    // fichier refuse partout ailleurs (« deux relectures d'un même jsonb sont
    // trois occasions de diverger »).
    let dayEnergyRows: readonly MouthDayEnergy[] = [];
    let mouthAnchors: ReadonlyMap<string, AnchorFactor> = new Map();
    if (composition) {
      const dayEnergy = mouthDayEnergy({
        index: composition,
        dishes: meal.dishes.map((dish) => ({
          day: dish.day,
          method: dish.method,
          slot: dish.slot,
          ingredients: dish.ingredients,
          uses: dish.uses,
          boxes: dish.boxes,
        })),
        preparations: meal.preparations.map((prep) => ({
          id: prep.id,
          servingsMade: prep.servingsMade,
          ingredients: prep.ingredients,
        })),
      });
      const anchors = householdAnchors(
        members.map((m) => ({
          memberId: m.memberId,
          ageState: m.ageState,
          restriction: restrictionOf(m),
          body: lineBodies.get(m.memberId) ?? null,
          // La MÊME lecture de direction que `memberTargetFactor`, jamais une
          // seconde: `goalApplies` porte déjà la règle du mineur et de l'âge
          // inconnu, et `scaleDirectionOf` celle des trois directions.
          direction: m.goal === null ? null : scaleDirectionOf(m.goal),
          paceKgPerWeek: paceByMember.get(m.memberId) ?? null,
          // L0bis — la MEME lecture que `householdMouthFactors` ci-dessus, et
          // c'est ce qui garantit que les deux chaines s'abstiennent ensemble.
          conditionRefs: conditionRefsOf(m.memberId),
          // ⛔ LES MOMENTS QU'ELLE A DÉCLARÉS, ET LA RAISON EST MESURÉE. Le
          // 2026-08-20, Christèle déclare `lunch`+`dinner` et le plan ne lui
          // compose que `dinner`: sans cette liste, sa cible de JOURNÉE
          // ENTIÈRE était confrontée à un seul dîner, et son facteur brut
          // sortait à 6,28 — une assiette de deux kilos, ou, une fois rabotée
          // au plafond, la même que celle de tout le monde.
          // Vide = les moments de la maison, c'est-à-dire les trois.
          declaredSlots: (m.eatingSlots ?? []).map((o) => o.slot),
          // ══════════════════════════════════════════════════════════════
          // ① CE QU'ELLE PREND À CÔTÉ DU PLAT, MOMENT PAR MOMENT
          // ══════════════════════════════════════════════════════════════
          //
          // ⟳ 2026-09-01 — LES TROIS BOOLÉENS PAR PERSONNE DEVIENNENT DES KCAL
          // PAR MOMENT, et cette conversion est une MIGRATION DE SENS, pas un
          // changement de type.
          //
          // ⛔ ILS SONT REPORTÉS SUR LE MIDI *ET* LE SOIR, et c'est le seul
          // report honnête: la question d'hier ne disait pas de quel repas elle
          // parlait, et son ratio s'appliquait à tous. Ne les reporter que sur
          // l'un choisirait à la place de la personne; les jeter ferait
          // retomber sur `UNANSWERED_EXTRAS_SHARE` quelqu'un qui a RÉPONDU —
          // et pour qui a répondu « rien à côté », ce serait une baisse de
          // cible sur une réponse qu'il a donnée.
          //
          // ⚠️ CE REPORT EST TRANSITOIRE. Il vit jusqu'à ce que la fiche écrive
          // ses extras par moment (`household_member_habits.slots`); ce jour-là
          // il devient le repli des seules lignes jamais rouvertes.
          //
          // ⚠️ SANS RÉFÉRENTIEL, ON NE SAIT PAS RÉSOUDRE UN EXTRA — et on rend
          // `null`, jamais zéro. Zéro dirait « elle ne prend rien à côté »,
          // c'est-à-dire un plat qui porte tout le repas: la direction qui
          // nourrit trop, sur une ignorance.
          slotExtraKcal: extrasFor(m.memberId),
        })),
        dayEnergy,
        coachCounting,
      );
      const best = new Map<string, number>();
      for (const [key, anchor] of anchors) {
        anchorReasons[anchor.reason] = (anchorReasons[anchor.reason] ?? 0) + 1;
        if (anchor.extrasFloored) extrasFloored++;
        if (anchor.reason !== "anchored" && anchor.reason !== "clamped") continue;
        const memberId = key.slice(0, key.lastIndexOf(" "));
        const current = best.get(memberId);
        if (current === undefined || Math.abs(anchor.factor - 1) < Math.abs(current - 1)) {
          best.set(memberId, anchor.factor);
        }
      }
      for (const [memberId, factor] of best) {
        anchorApplied++;
        // LE REMPLACEMENT, et c'est tout le geste: `set` écrase la valeur que
        // la chaîne relative avait posée, il ne la multiplie pas.
        if (factor === 1) sizingFactors.delete(memberId);
        else sizingFactors.set(memberId, factor);
      }
      dayEnergyRows = dayEnergy;
      mouthAnchors = anchors;
    }

    // ══════════════════════════════════════════════════════════════════════
    // L'APPÉTIT DE LA TABLE — MESURÉ, PAS ENCORE BRANCHÉ (2026-08-19)
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ CE NOMBRE NE PILOTE RIEN AUJOURD'HUI, ET C'EST DÉLIBÉRÉ. La casserole
    // reste dimensionnée par `presence.servings`, le compte de têtes.
    //
    // ── POURQUOI ON MESURE AVANT DE STEERING ─────────────────────────────
    // `REFERENCE_ADULT_MAINTENANCE_KCAL` vaut 2000, et c'est une unité GROSSIÈRE
    // choisie faute de socle chiffré (le vrai est un chantier à part). Mesuré
    // sur le foyer 5600347f: deux adultes rendent un équivalent de **3**. Le
    // brancher tel quel ferait cuire 50 % de plus pour deux personnes —
    // c'est-à-dire exactement le gaspillage que ce champ existe pour éviter.
    //
    // Un foyer d'un adulte et deux jeunes enfants rend **2,5** contre un compte
    // de 3: là, le gain est réel. Le signal est donc bon et son ÉTALON est
    // faux. On journalise les deux nombres côte à côte pour savoir, sur des
    // plans réels, de combien l'étalon doit bouger.
    //
    // ⚠️ LE JOUR OÙ ON BRANCHE, C'EST UNE LIGNE — et ce commentaire dit quoi
    // regarder avant de la changer.
    const appetite = householdAppetite(
      members.map((m) => ({
        ageState: m.ageState,
        body: lineBodies.get(m.memberId) ?? null,
      })),
    );
    console.log(JSON.stringify({
      tag: "keel.household_meal.table_appetite",
      user_id: userId,
      household_id: householdId,
      // LES DEUX NOMBRES CÔTE À CÔTE: sans le compte de têtes, l'équivalent ne
      // dit pas de combien l'étalon se trompe.
      servings_headcount: presence.servings,
      appetite_equivalent: appetite.equivalent,
      bodies_known: appetite.known,
      mouths: appetite.mouths,
      steering: false,
    }));

    // ── LES BOÎTES, REDIMENSIONNÉES ──────────────────────────────────────
    // ⚠️ APRÈS LA RELANCE D'ANCRE PROTÉIQUE, PAS AVANT. `meal` est remplacé par
    // le plan de la SECONDE réponse quand la relance est acceptée; redimensionner
    // plus haut écrirait des grammes sur des boîtes que personne ne garde. C'est
    // la cicatrice du `current` périmé, mesurée sur dix-huit parts orphelines le
    // 2026-08-17, et elle vaut ici mot pour mot.
    const boxSizing = sizeBoxesFromTarget(
      // LES REPAS EN BOÎTE, TELS QUE LE PARSEUR LES A GARDÉS. `uses` descend avec
      // eux parce que le plafond du récipient se pose casserole par casserole, et
      // qu'une boîte de repas mélange les casseroles: c'est la fonction qui fait
      // le prorata, pas cet appelant — un second calcul ici finirait par diverger
      // de celui du parseur.
      meal.dishes.flatMap((dish) =>
        dish.boxes.map((box) => ({
          boxId: box.id,
          memberIds: box.memberIds,
          items: box.items,
          uses: dish.uses,
        }))
      ),
      meal.preparations.map((prep) => ({
        id: prep.id,
        servingsMade: prep.servingsMade,
        // `null` quand un ingrédient n'est pas convertible: on redimensionne
        // sans pouvoir vérifier la somme, et on le compte. C'est le patron des
        // trois cas de `gramsRaw`, un cran plus haut.
        readyGrams: composition
          ? preparationReadyGrams(prep.ingredients, composition)
          : null,
      })),
      sizingFactors,
      BOX_SUM_TOLERANCE_RATIO,
    );
    for (const dish of meal.dishes) {
      for (const box of dish.boxes) {
        const next = boxSizing.items.get(box.id);
        if (!next) continue;
        // ⚠️ PAR INDEX, ET C'EST LE CONTRAT DE `SizableMeal.items`: il n'existe
        // aucune clé stable pour un composant — deux `term` identiques sur un
        // couvercle sont légitimes — et c'est le MÊME tableau qui est descendu.
        for (const [index, item] of box.items.entries()) {
          const grams = next.get(index);
          if (grams !== undefined) item.grams = grams;
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // LOT 3 — CE QUE L'ANCRAGE A DEMANDÉ ET N'A PAS OBTENU. L'INSTRUMENT,
    //         BRANCHÉ POUR LA PREMIÈRE FOIS.
    // ══════════════════════════════════════════════════════════════════════
    //
    // `pot_demand.ts` est écrit et testé depuis le 2026-08-20 et n'avait aucun
    // appelant. Son en-tête dit pourquoi: « 136 plans de foyer en base, 0 avec
    // une boîte. Ce module est donc l'instrument, et le premier run réel est la
    // mesure. Tant qu'elle n'a pas eu lieu, le fork n'est pas tranché, et
    // personne ne doit faire comme s'il l'était. » Les plans à boîtes existent
    // maintenant; ce qui manquait à `unmetDemand` était sa TROISIÈME entrée,
    // que seule `sizeBoxesFromTarget` connaît et qui mourait en local.
    //
    // ⛔ CE BLOC NE DÉPLACE AUCUN GRAMME. Il lit, il compte, il journalise. Le
    // fork aval/amont se tranche sur ce qu'il montre, pas avant.
    //
    // ⚠️ LE RABOT EST PONDÉRÉ PAR LES GRAMMES, PAS PRIS AU MINIMUM. Une bouche
    // dont une seule casserole sur trois a débordé n'a pas vu sa journée entière
    // rabotée; prendre le `min` surdéclarerait l'écart et enverrait réparer
    // l'amont pour un plat. Les grammes lus sont ceux d'APRÈS dimensionnement —
    // c'est un cran d'approximation, dit ici plutôt que caché.
    const potShrink = new Map<string, number>();
    if (boxSizing.shrink.size > 0) {
      const weighted = new Map<string, { num: number; den: number }>();
      for (const dish of meal.dishes) {
        for (const box of dish.boxes) {
          if (box.memberIds.length !== 1) continue;
          const key = `${box.memberIds[0]} ${dish.day ?? ""}`;
          const acc = weighted.get(key) ?? { num: 0, den: 0 };
          for (const item of box.items) {
            const g = Number(item.grams);
            if (!Number.isFinite(g) || g <= 0) continue;
            // Un composant sans casserole est acheté frais: aucun plafond de
            // récipient ne le borne, donc son rabot vaut 1.
            const ratio = item.preparationId === null
              ? 1
              : (boxSizing.shrink.get(item.preparationId) ?? 1);
            acc.num += g * ratio;
            acc.den += g;
          }
          weighted.set(key, acc);
        }
      }
      for (const [key, acc] of weighted) {
        if (acc.den > 0 && acc.num !== acc.den) potShrink.set(key, acc.num / acc.den);
      }
    }
    const unmet = unmetDemand(mouthAnchors, dayEnergyRows, potShrink);
    // ⛔ DES HISTOGRAMMES, JAMAIS LES LIGNES. `UnmetDemand` porte un `memberId`
    // et trois kcal: c'est exactement ce que `residualGaps` a été retiré du
    // journal pour avoir porté. Ce qui sort ici est un compte par cause et une
    // BANDE — de quoi voir le fork bouger, rien de quoi reconstruire une
    // assiette nominative.
    const unmetCauses = Object.fromEntries(
      UNMET_CAUSES.map((c) => [c, 0]),
    ) as Record<UnmetCause, number>;
    const unmetBand = { lt_200: 0, gte_200: 0 };
    for (const row of unmet) {
      unmetCauses[row.cause] += 1;
      if (row.unmetKcal === null || row.unmetKcal <= 0) continue;
      if (row.unmetKcal < 200) unmetBand.lt_200 += 1;
      else unmetBand.gte_200 += 1;
    }

    // ══════════════════════════════════════════════════════════════════════
    // ⛔ LE MÊME OBJET, JOURNALISÉ — PARCE QUE `generated_from` N'EXISTE QUE
    //    SUR UNE LIGNE ÉCRITE
    // ══════════════════════════════════════════════════════════════════════
    //
    // Le voisin `generated_from.box_sizing` porte ces nombres, et il ne sort
    // QUE pour `intent` autre que `draft`. Or toute vérification en situation
    // réelle de ce chantier se fait en `draft` — et le fichier écrit déjà, mot
    // pour mot, ce que ça coûte: « toute mesure faite par `intent: "draft"`
    // était aveugle, et un diagnostic entier s'est trompé dessus le
    // 2026-08-17 ». Un nombre qu'on ne journalise pas est un nombre que
    // personne ne verra bouger.
    //
    // ⛔ AUCUN `member_id`, AUCUN kcal, AUCUN gramme nominatif: ce sont les
    // mêmes histogrammes que `generated_from`, pas une seconde surface. Les
    // deux lisent les MÊMES variables — les recalculer ici en ferait deux
    // mesures qui divergent.
    console.log(JSON.stringify({
      tag: "keel.household_meal.box_sizing",
      user_id: userId,
      household_id: householdId,
      intent,
      ...boxSizing.counts,
      mouths: sizingReasons,
      share: shareReasons,
      share_clamped: shareClamped,
      anchor: anchorReasons,
      anchor_applied: anchorApplied,
      unmet: unmetCauses,
      unmet_band: unmetBand,
      extras_floored: extrasFloored,
      activity: activityAnswers,
      activity_source: activitySources,
      meal_structure: structureAnswers,
      meal_extras_source: extrasSources,
      appetite: appetiteAnswers,
    }));

    // ══════════════════════════════════════════════════════════════════════
    // ③ LE VERROU DÉTERMINISTE DES TRADITIONS — il VÉRIFIE et il COMPTE
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ IL NE RETIRE RIEN, ET C'EST UN ARBITRAGE ÉCRIT, PAS UN RENONCEMENT.
    // Le jumeau négatif de ce verrou (`applyHouseRuleLock`) PEUT retirer: un
    // plat qui sert du nutella part, et le foyer mange autre chose. Un verrou
    // POSITIF ne peut pas la symétrie — on ne fabrique pas un rôti
    // déterministe, il faudrait inventer des ingrédients, des quantités et une
    // méthode, c'est-à-dire composer. Retirer le plat que le modèle a mis là
    // parce qu'un matcher n'y a pas trouvé un mot serait la cicatrice
    // « 12 faux positifs sur 12 » dans sa direction la plus chère: un dîner de
    // moins pour un mot mal lu.
    //
    // Ce qu'il fait donc: il rend le manquement VISIBLE — dans les `issues` et
    // dans `generated_from` — au lieu d'une promesse qu'on croit tenue. Et il
    // rend le CHIFFRE qui permettra de trancher: si le taux d'honneur mesuré
    // est bas, la case devra être RÉSERVÉE (retirée de ce que le modèle
    // compose). C'est une décision qui se prend sur une mesure.
    const traditionResults = traditionOutcomes(
      traditions,
      // LA MÊME FENÊTRE QUE LE PROMPT. Deux listes de jours calculées
      // séparément déclareraient « manqué » une case que le prompt n'a jamais
      // demandée.
      daysToFill,
      meal.dishes,
    );
    const traditionVerdicts = traditionCounts(traditionResults);
    // ⛔ UNE SEULE `issue`, ET LE CHOIX EST UNE MESURE — NE PAS EN RAJOUTER.
    //
    // La version d'il y a une heure remontait aussi `tradition_missed`. Premier
    // run réel avec « vendredi poisson » posé: le modèle a composé
    // « Cabillaud, pommes de terre et haricots verts » — la tradition HONORÉE —
    // et l'écran a reçu `tradition_missed: 1`. Le vérificateur cherche le mot
    // « poisson »; un cabillaud ne le porte pas. On annonçait à un foyer que
    // son vendredi était cassé pendant que son poisson était dans l'assiette.
    //
    // `not_composed` reste, et c'est le SEUL verdict sans matcher: la case est
    // vide ou elle ne l'est pas. `composed_without_label`, lui, ne sort plus
    // qu'en journal et dans `generated_from` — c'est un signal à regarder, pas
    // un fait à afficher.
    //
    // ⚠️ L'`issue` NE NOMME NI LE JOUR NI LE LIBELLÉ. « Le foyer n'a pas eu son
    // rôti dominical » dans une liste lisible par toute la maison serait un
    // reproche adressé à quelqu'un.
    if (traditionVerdicts.not_composed > 0) {
      issues.push(`tradition_not_composed:${traditionVerdicts.not_composed}`);
    }
    // ⛔ JOURNALISÉ MÊME À ZÉRO TRADITION, comme ses voisins. `honoured: 0` et
    // « aucune tradition posée » rendraient le même silence si on ne comptait
    // que les succès — le zéro ambigu que ce chantier paie en boucle. Les
    // quatre verdicts sont toujours là.
    console.log(JSON.stringify({
      tag: "keel.household_meal.traditions",
      user_id: userId,
      household_id: householdId,
      intent,
      declared: traditions.length,
      ...traditionVerdicts,
    }));

    // ══════════════════════════════════════════════════════════════════════
    // ⛔ ET LA CHARGE RENDUE, QUI EST UN AUTRE OBJET — LE DÉFAUT LE PLUS CHER
    //    DE TOUT LE CHANTIER, MESURÉ LE 2026-08-20
    // ══════════════════════════════════════════════════════════════════════
    //
    // `dishes` (la charge servie à l'écran) est un INSTANTANÉ pris ~500 lignes
    // plus haut: `applyHouseRuleLock(mealDishesPayload(meal), …)`. Le
    // dimensionnement, lui, écrit dans `meal.dishes`. Les deux ne partagent
    // aucune référence.
    //
    // Le coût, sur un run réel: le moteur calculait **iku 544 g / Christèle
    // 306 g**, l'écran affichait **400 g / 400 g**. Tout le chantier — la
    // couverture, l'ancrage, les portes, les compteurs — était juste, et le
    // nombre juste n'atteignait pas l'assiette. Le journal `box_sizing`
    // annonçait `sized: 12` en toute bonne foi: il compte ce que le moteur a
    // produit, pas ce que la réponse porte.
    //
    // ⚠️ C'EST LA CICATRICE DU `current` PÉRIMÉ, À L'ENVERS. Là-bas une lecture
    // périmée écrasait une écriture; ici une écriture n'atteint jamais la copie
    // qu'on sert. Même famille, même remède: on ne garde pas deux objets qui
    // décrivent la même chose sans les recoller EXPLICITEMENT.
    //
    // ⛔ ON RECOLLE, ON NE RECONSTRUIT PAS. Refaire `mealDishesPayload(meal)`
    // ici perdrait le travail d'`applyHouseRuleLock` (les `why` nettoyés, les
    // violations retirées), qui n'existe que sur cette copie-là.
    {
      const sizedByBox = new Map<string, number[]>();
      for (const dish of meal.dishes) {
        for (const box of dish.boxes) {
          sizedByBox.set(box.id, box.items.map((it) => it.grams));
        }
      }
      let relinked = 0;
      for (const payload of dishes as Array<Record<string, unknown>>) {
        for (const raw of (Array.isArray(payload.boxes) ? payload.boxes : [])) {
          const box = (raw ?? {}) as Record<string, unknown>;
          if (typeof box.id !== "string") continue;
          const sized = sizedByBox.get(box.id);
          if (!sized || !Array.isArray(box.items)) continue;
          // ⚠️ PAR INDEX, comme le recollage juste au-dessus: la charge est une
          // COPIE de `meal.dishes` prise ~500 lignes plus haut, et les deux
          // tableaux sortent du même parseur dans le même ordre. Une longueur
          // qui diverge ne se rattrape pas en silence — on ne touche que les
          // positions que les deux portent.
          for (const [index, entry] of (box.items as Array<Record<string, unknown>>).entries()) {
            const grams = sized[index];
            if (grams !== undefined && grams !== entry.grams) {
              entry.grams = grams;
              relinked++;
            }
          }
        }
      }
      // COMPTÉ, parce qu'un recollage silencieux qui cesse de fonctionner
      // ressemblerait EXACTEMENT au défaut qu'il répare.
      console.log(JSON.stringify({
        tag: "keel.household_meal.sized_shares_relinked",
        user_id: userId,
        household_id: householdId,
        relinked,
        boxes: sizedByBox.size,
      }));
    }
    issues.push(...boxSizing.issues);

    // ══════════════════════════════════════════════════════════════════════
    // CE QUE LA PHRASE DE TABLE PORTE ENCORE — mesuré, sur TOUS les plans.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LE GRAMME N'EST PLUS RECOLLÉ À LA PHRASE, ET CE N'EST PAS UN RECUL.
    // `attachSizedQuantities` écrivait « Poulet rôti 150 g · Quinoa 80 g » à la
    // fin de la note, parce qu'une boîte pendait à UNE casserole et qu'une bouche
    // y avait exactement une part — un nombre vrai pour toute la semaine. Depuis
    // que la boîte porte un REPAS, la part d'iku sur le poulet du jeudi midi
    // n'est plus celle du vendredi soir: le même geste écrirait un gramme faux,
    // lu à voix haute à table. Le nombre vit désormais sur le couvercle du repas,
    // avec le nom de la personne, et c'est là qu'on l'exécute.
    //
    // ⚠️ ET LA MESURE, ELLE, SE PREND MAINTENANT SUR TOUS LES PLANS. L'ancien
    // compteur ne tournait que dans la branche « une cible a mordu »: un foyer
    // sans corps saisi pouvait écrire n'importe quoi dans sa phrase de table sans
    // qu'aucun nombre ne bouge. Une mesure qui ne se prend que quand tout va bien
    // ne mesure rien.
    const portionQuantityTrace = countPortionNoteDrift(portions);
    const portionsOut = portions;

    const dishOwnersTrace = {
      asked: eaterBudget?.dedicatedDishesAsked ?? 0,
      declared: meal.dish_owner_counts.declared,
      attributed: meal.dish_owner_counts.attributed,
      refused: meal.dish_owner_counts.refused,
    };

    // ══════════════════════════════════════════════════════════════════════
    // LOT 4 — LES COMPTEURS DES GRAMMES, MÊME DISCIPLINE QUE `dish_owners`.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ RENDUS SUR L'APERÇU, et c'est la moitié qui manquait au compteur
    // précédent: `generated_from` n'existe que sur une ligne ÉCRITE, donc toute
    // vérification par `intent: "draft"` était aveugle — c'est de là qu'est
    // venue la conclusion fausse du 2026-08-17. Une seule expression pour les
    // deux chemins, pour que la mesure d'un brouillon prédise celle d'un plan.
    //
    // ⚠️ `boxes.mouths` EST À CÔTÉ DES AUTRES, ET IL VIENT DE LA MÊME LISTE QUE
    // LA CONSIGNE: le brief nomme `members.length` bouches à placer sur chaque
    // repas, `boxMemberIds` valide contre la même liste, et ce nombre-ci est
    // celle-là encore. Trois lectures d'un même roster ne peuvent pas diverger
    // tant qu'elles lisent le même tableau.
    //
    // ⛔ `box_uses` A DISPARU DE CETTE TRACE, ET C'EST LE LOT. Il comptait les
    // reprises qui CITAIENT une boîte (`uses[].box_id`); plus rien ne cite rien
    // depuis que le repas porte la sienne. Ce qu'il mesurait — « la boîte
    // atteint-elle un repas ? » — est désormais `boxes.with_box / boxes.meals`,
    // et c'est un compteur OBLIGATOIRE (`docs/keel/BOITES-PAR-REPAS.md`).
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ LOT `L17-0` — LE GROUPE DÉCLARÉ, ET CE QUI EN ATTEINT LA BASE
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ DEUX POPULATIONS, ET SANS ELLES LE LOT EST INDISCERNABLE D'UN LOT MORT.
    // `declared` dit ce que le MODÈLE a écrit, `persisted` ce que la LIGNE
    // porte. Le 2026-08-22, l'écart valait 100 % — 242 déclarés sur les trois
    // plans v16+, zéro en base — et le seul nombre visible était le premier.
    // Un modèle qui cesserait de déclarer et une écriture réparée rendent le
    // même zéro final: il faut les deux nombres pour les distinguer.
    //
    // ⛔ LU SUR LA CHARGE ÉCRITE, JAMAIS SUR `meal.dishes`. C'est très
    // exactement la recopie qui perdait le champ; un compteur branché sur la
    // structure interne aurait rendu 242 pendant que la base en portait 0.
    // `dishes` est ici la charge d'après `applyHouseRuleLock` et d'après le
    // recollage des grammes — la MÊME variable que celle envoyée à la RPC.
    //
    // ⚠️ `preparationsWritten` EST HISSÉ POUR ÇA: les préparations sont 32 %
    // des lignes d'ingrédient de la base, et le compteur doit lire le tableau
    // que la RPC reçoit, pas un second appel.
    const preparationsWritten = mealPreparationsPayload(meal);
    const foodGroups = foodGroupWriteCounts(meal.regime_belt, {
      dishes,
      preparations: preparationsWritten,
    });
    // ⛔ JOURNALISÉ EN PLUS DE `generated_from`, et c'est la moitié qui manquait
    // au lot: `generated_from` n'existe que sur une ligne ÉCRITE, or l'écart de
    // 100 % a été découvert par une requête SQL sur un plan déjà en base — donc
    // deux jours trop tard. Aucun terme, aucun `member_id`: cinq nombres.
    console.log(JSON.stringify({
      tag: "keel.household_meal.food_groups",
      user_id: userId,
      household_id: householdId,
      intent,
      ...foodGroups,
    }));

    const boxTrace = {
      boxes: { ...meal.box_counts, mouths: members.length },
      unquantified_dish_ingredients: meal.unquantified_dish_ingredients,
      vague_portions: portionVagueCounts,
      // LOT 4C ① — RENDU SUR L'APERÇU COMME SUR LA LIGNE ÉCRITE, par la même
      // expression que les quatre du dessus. Sans ce nombre, « la part de chaque
      // bouche ne s'affiche pas » n'est visible qu'en relisant le `jsonb` à la
      // main — c'est-à-dire pas.
      shares: portionShareCounts,
      // ══════════════════════════════════════════════════════════════════════
      // LA CEINTURE DE RÉGIME — RENDUE, SUR L'APERÇU COMME SUR LA LIGNE ÉCRITE.
      // ══════════════════════════════════════════════════════════════════════
      //
      // ⛔ SANS CE NOMBRE, UN RUN VERT ET UN RUN QUI SERT DE LA VIANDE À UN
      // ENFANT VÉGANE SONT LE MÊME RUN. C'est la phrase exacte du rapport du
      // 2026-08-19, et c'est ce qui rendait la brèche invisible cinq plans sur
      // cinq: aucune `issue`, aucun compteur, aucun journal.
      //
      // ⚠️ `mouths` EST LE NOMBRE QUI DÉSARME L'AMBIGUÏTÉ. `refused: 0` ne dit
      // pas si la ceinture a laissé passer ou si personne n'avait déclaré de
      // ligne; `mouths: 0` le dit. Même discipline que les cinq compteurs
      // au-dessus, et que `dish_owners` avant eux.
      regime_belt: meal.regime_belt,
      // ⛔ LA CEINTURE DES EXCLUSIONS PAR BOUCHE — sans ses nombres, une
      // exclusion inerte et une exclusion honorée se lisent pareil.
      exclusion_belt: meal.exclusion_belt,
      // ══════════════════════════════════════════════════════════════════════
      // L8 — CE QUE LA CIBLE A RÉELLEMENT DIMENSIONNÉ.
      // ══════════════════════════════════════════════════════════════════════
      //
      // ⛔ RENDU SUR L'APERÇU PAR LA MÊME EXPRESSION QUE SUR LA LIGNE ÉCRITE,
      // comme les cinq du dessus. Sans ça, la seule façon de savoir si ce lot
      // est armé serait d'écrire un plan.
      //
      // ⚠️ TROIS NOMBRES SUR LES BOÎTES (`boxes` / `sized` / `unchanged`), et
      // leur somme avec `shared_mixed` est une propriété TESTÉE. Deux nombres
      // rendraient le même zéro pour « aucune cible réglée » et pour « une cible
      // qu'on n'a pas su appliquer » — le zéro ambigu qui a coûté un diagnostic
      // entier le 2026-08-17.
      //
      // ⚠️ `mouths` PORTE LE MOTIF DE CHAQUE BOUCHE, PAS UN COMPTE DE REFUS. Un
      // foyer où trois bouches sortent `no_pace` et une `minor` ne se répare pas
      // du tout de la même façon qu'un foyer où quatre sortent `no_body`.
      // ⛔ ET IL NE PORTE AUCUN `member_id`: c'est un HISTOGRAMME de motifs. Une
      // ligne « membre X: minor » dans `generated_from` désignerait un enfant
      // dans une colonne lisible par tout le foyer.
      // ⚠️ DEUX HISTOGRAMMES, PAS UN. `mouths` est la chaîne d'OBJECTIF (perte
      // ou prise + cran de rythme); `share` est la chaîne de MAINTENANCE (le
      // corps saisi sur la fiche, mineurs et bouches sans compte compris). Les
      // fondre rendrait un seul motif pour deux décisions — et c'est très
      // exactement le défaut d'observabilité corrigé le 2026-08-19, où
      // `restriction_floor: 3` désignait trois personnes sans compte.
      // ⛔ AUCUN `member_id` NI DANS L'UN NI DANS L'AUTRE: ce sont des
      // histogrammes de motifs. « membre X: minor » dans `generated_from`
      // désignerait un enfant dans une colonne lisible par tout le foyer.
      box_sizing: {
        ...boxSizing.counts,
        mouths: sizingReasons,
        share: shareReasons,
        share_clamped: shareClamped,
        // ⚠️ L'ANCRAGE EST COMPTÉ À PART DES DEUX AUTRES CHAÎNES, et il le
        // reste même à zéro: `anchored: 0, day_incomplete: 12` et « l'ancrage
        // n'est pas branché » rendraient le même silence si on ne comptait que
        // les succès. C'est le zéro ambigu que ce dépôt paie en boucle.
        // ⛔ AUCUN `member_id`, AUCUN kcal: un histogramme de motifs, comme ses
        // deux voisins. Une cible en kcal dans `generated_from` serait un
        // chiffre corporel dans une colonne lisible par tout le foyer.
        anchor: anchorReasons,
        anchor_applied: anchorApplied,
        extras_floored: extrasFloored,
        // ── LES DEUX LOTS DU 2026-08-20, COMPTÉS À PART L'UN DE L'AUTRE ───
        // ⚠️ TROIS HISTOGRAMMES ET PAS UN. `activity` dit ce que la fiche
        // PORTE (quatre états, `not_asked` compris); `activity_source` dit quel
        // nombre a réellement multiplié le métabolisme de base; `meal_structure`
        // dit la même chose pour les trois cases du repas. Les fondre rendrait
        // un seul motif pour trois décisions — le défaut d'observabilité que
        // `mouths` / `share` documentent juste au-dessus.
        activity: activityAnswers,
        activity_source: activitySources,
        meal_structure: structureAnswers,
        // ⚠️ TRANSITOIRE ET DATÉ. `legacy_booleans` compte les bouches qui
        // dépendent encore de `takes_bread / cheese / dessert`; le jour où il
        // tombe à zéro sur la population, les trois colonnes peuvent partir.
        // `mixed` est le cas qui interdit de trancher trop tôt.
        meal_extras_source: extrasSources,
        // ⑤ — TRANSITOIRE, et le compteur le sera aussi: le jour où ⑦ tourne
        // pour une bouche, `declared` devra cesser de gouverner pour elle.
        appetite: appetiteAnswers,
      },
      // ── ③ LES JOURS QUE LE FOYER NE DÉPLACE PAS (2026-08-20) ────────────
      // ⛔ UN HISTOGRAMME, AUCUN JOUR, AUCUN LIBELLÉ — comme ses voisins. Un
      // « dimanche: rôti manqué » dans une colonne lisible par tout le foyer
      // serait un reproche nominatif.
      // ⚠️ `declared` EST À CÔTÉ DES QUATRE VERDICTS, et il n'est pas
      // redondant: `honoured: 0` sur un foyer qui n'a rien posé et sur un
      // foyer dont rien n'a été honoré sont deux situations opposées.
      traditions: { declared: traditions.length, ...traditionVerdicts },
      // ⚠️ LA SECONDE SURFACE, COMPTÉE À PART DES BOÎTES. `box_sizing` dit ce
      // que le BAC porte; celui-ci dit ce que la PHRASE porte, et les deux ont
      // divergé trois plans sur trois avant le 2026-08-19. `null` = le moteur
      // n'a rien dimensionné, donc la phrase est celle du modèle, inchangée.
      // ⛔ `model_quantity` EST LE NOMBRE À REGARDER: c'est la désobéissance au
      // brief (« names the food and the change -- never a weight »), et donc le
      // nombre de plans où deux chiffres se contredisent dans la même phrase.
      portion_quantities: portionQuantityTrace,
    } as const;

    // ══════════════════════════════════════════════════════════════════════
    // ⛔ LE MÊME OBJET, JOURNALISÉ — PARCE QUE `generated_from` N'EXISTE QUE
    //    SUR UNE LIGNE ÉCRITE (2026-08-20)
    // ══════════════════════════════════════════════════════════════════════
    //
    // `boxTrace` part dans `generated_from`, qui n'est écrit que pour un
    // `intent` autre que `draft`. Or TOUTE vérification en situation réelle de
    // ce chantier se fait en `draft` — écrire un plan RETIRE celui du persona.
    // Mesuré le 2026-08-20 sur le premier run v4: la sortie était juste, les
    // contenants étaient là, et `boxes / expected` — le compteur que
    // `docs/keel/BOITES-PAR-REPAS.md` rend OBLIGATOIRE — n'apparaissait nulle
    // part. C'est très exactement la cicatrice que son voisin `box_sizing`
    // porte déjà en toutes lettres: « un nombre qu'on ne journalise pas est un
    // nombre que personne ne verra bouger ».
    //
    // ⛔ AUCUN `member_id`, AUCUN kcal, AUCUN gramme nominatif: c'est le MÊME
    // histogramme que `generated_from`, lu sur la MÊME variable — le recalculer
    // ici en ferait deux mesures qui divergent.
    console.log(JSON.stringify({
      tag: "keel.household_meal.box_counts",
      user_id: userId,
      household_id: householdId,
      intent,
      ...boxTrace,
    }));

    // ══════════════════════════════════════════════════════════════════════
    // L7 — CE QUE LES TROIS BLOCS ONT RÉELLEMENT DIT, ET CE QUE ÇA A RENDU.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ LES TROIS SONT RENDUS SUR L'APERÇU, PAR LA MÊME EXPRESSION QUE SUR LA
    // LIGNE ÉCRITE. C'est la moitié du compteur que 3C a dû ajouter après coup:
    // `generated_from` n'existe que sur une ligne ÉCRITE, donc toute mesure
    // faite par `intent: "draft"` était aveugle, et un diagnostic entier s'est
    // trompé dessus le 2026-08-17.
    //
    // ⚠️ DEUX FORMES, ET ELLES NE DISENT PAS LA MÊME CHOSE.
    //   · `names` est un compteur à TROIS nombres (déclaré / gardé / refusé),
    //     parce que `name` est un CHAMP que le modèle remplit. Sans les trois,
    //     « il n'a rien écrit » et « il a écrit quelque chose qu'on a refusé »
    //     rendraient le même zéro — la confusion exacte qui a coûté le
    //     diagnostic de `for_member_id`.
    //   · `kitchen` et `eating_out` sont des TRACES, pas des compteurs, parce
    //     que leurs blocs ne demandent AUCUN champ: rien n'est déclaré, donc
    //     rien n'est validable. Elles disent ce que le prompt a interdit et
    //     nommé. ⛔ Il n'y a délibérément pas de « respecté »: le calculer
    //     demanderait de lire les titres et les méthodes pour décider si un
    //     plat passe au four — c'est-à-dire un matcher, et ce dépôt en a mesuré
    //     12 faux positifs sur 12.
    const promptTrace = {
      kitchen: {
        // `null` = la question n'a jamais été posée. `[]` est impossible ici:
        // `readKitchenEquipment` rend `null` sur une liste vide ou illisible.
        declared: readKitchenEquipment(pc),
        // CE QUE LE BLOC A INTERDIT, rendu par le module qui l'a écrit.
        missing: household.kitchenMissing,
      },
      eating_out: household.eatingOut,
      // ── ⛔ D6.2 · LE COMPTEUR DE LA GAMELLE, ET IL ÉTAIT LE MAILLON QUI
      //    MANQUAIT.
      //
      // `household.workLunch` était CALCULÉ par le constructeur de prompt et
      // jeté ici même: la ligne d'à côté portait `eating_out`, pas celle-ci.
      // Donc `generated_from.household.work_lunch` n'existait sur AUCUNE
      // ligne — et la requête de contrôle écrite dans ma propre réserve de
      // journal aurait rendu `NULL` pour toujours.
      //
      // ⚠️ C'EST LA MOITIÉ QUI COMPTE D'UN CHAMP OPTIONNEL: le marché passé
      // pour garder `workLunch` en `?` était un compteur ET un test de
      // câblage. Le test existait, le compteur n'atteignait rien.
      work_lunch: household.workLunch,
      // ── LOT C ② · LE `why` ET LA RÈGLE DE QUELQU'UN ───────────────────────
      // TROIS NOMBRES ET LEUR DÉNOMINATEUR, et la forme est celle de `names`
      // au-dessus parce que la cause est la même: `why_rule_of` est un CHAMP
      // que le modèle remplit. `{holders: 0}` veut dire que le prompt n'a rien
      // demandé (personne ne porte de règle à cette table); `{holders: 2,
      // declared: 0}` veut dire qu'on a demandé et que rien n'a été déclaré —
      // ce qui est le résultat VOULU, et pas la même chose du tout.
      //
      // ⚠️ `refused` EST LE NOMBRE DU DÉFAUT: une règle épinglée sur une bouche
      // qui n'en porte aucune. C'est la mesure du 2026-08-19, trois `why` sur
      // huit, et c'est elle qui doit rester à zéro.
      why_rule: { holders: household.whyRuleHolders, ...whyRule.counts },
      // ── ⛔ C1 · LE COMPTEUR DE LA CONTAMINATION CROISÉE ───────────────────
      //
      // ⛔ TROIS POPULATIONS, JAMAIS UN BOOLÉEN. Un seul `emitted` rendrait le
      // même « faux » pour « personne n'est à risque médical à cette table »
      // et pour « le bloc est débranché » — et c'est le second état qu'on veut
      // voir. `skipped_no_dedicated` dit « tout le monde mange la même
      // casserole, il n'y a pas de seconde poêle »; `skipped_no_medical` dit
      // « il y a bien deux plats, mais aucune bouche à risque ». Un plan compte
      // pour exactement UN des trois, et la somme des trois fait le corpus.
      //
      // ⛔ ET `emitted` COMPTE UNE PHRASE ENVOYÉE, PAS UNE POÊLE LAVÉE. Il
      // n'existe AUCUNE vérification en sortie pour cette règle: on ne prouve
      // pas depuis un JSON qu'un couteau a été rincé. Un lecteur qui lirait
      // `emitted: 12` comme « douze repas séparés » lirait ce compteur à
      // l'envers — il dit « douze fois, on l'a demandé ». Voir l'en-tête de
      // `_shared/keel/cross_contact.ts`.
      cross_contact_block: {
        emitted: household.crossContact.emitted ? 1 : 0,
        skipped_no_medical: household.crossContact.skipped === "no_medical" ? 1 : 0,
        skipped_no_dedicated: household.crossContact.skipped === "no_dedicated" ? 1 : 0,
      },
      // ── ⛔ `D3′` · OÙ EST L'ARBITRAGE, ET SUR QUOI IL PORTE ──────────────
      //
      // ⛔ `place` EST UNE MESURE, PAS UNE INTENTION: il est lu sur le message
      // RÉELLEMENT composé (`householdUserMessage("")`), jamais déduit du fait
      // qu'on a appelé `movePrecedenceToTail`. Un jour où un lot voisin
      // collerait un bloc après, `place` passerait à `buried` et le dirait —
      // c'est très exactement l'`armé par` de la fiche.
      //
      // ⛔ ET LES DEUX POPULATIONS DE RANGS, JAMAIS UN SEUL NOMBRE. `with` seul
      // rendrait le même 5 pour « ce foyer porte les cinq rangs » et pour « le
      // compteur est cloué »; `without` seul confondrait « rien à arbitrer »
      // et « rien de branché ». Leur somme est 5, et c'est une propriété
      // testée.
      //
      // ⚠️ IL N'Y A AUCUN CHAMP DÉCLARÉ PAR LE MODÈLE ICI, ET C'EST LE POINT
      // DU LOT: il n'existe pas de surface de sortie légale pour cet arbitrage
      // (porte `G-disclosure`). `D3′` est un lot d'ENTRÉE, et ce compteur est
      // la seule preuve d'exécution qu'il peut porter.
      precedence: {
        place: precedencePlace.verdict,
        exact: precedencePlace.exact,
        blocks_after: precedencePlace.contentBlocksAfter,
        ranks_with_object: precedenceRanks.withObject,
        ranks_without_object: precedenceRanks.withoutObject,
        by_rank: precedenceRanks.byRank,
      },
    } as const;

    // ⚠️ JOURNALISÉ EN PLUS D'ÊTRE ÉCRIT, et c'est la cicatrice `V0-B-bis`: un
    // `intent: "draft"` ne persiste pas `generated_from`, donc la seule trace
    // d'un bloc servi sur un aperçu serait perdue. Le log sort sur les TROIS
    // populations — un log qui ne sortirait qu'à l'émission ferait ressembler
    // « jamais servi » à « jamais appelé ».
    console.log(JSON.stringify({
      tag: CROSS_CONTACT_BLOCK_TAG,
      user_id: userId,
      household_id: householdId,
      ...promptTrace.cross_contact_block,
      // LES DEUX PRÉMISSES, RENDUES PAR LE MODULE QUI LES A ÉVALUÉES — pas
      // recomptées ici. Deux lectures divergeraient au premier prénom blanc, et
      // le journal dirait alors autre chose que le prompt.
      medical_mouths: household.crossContact.medicalMouthsSeen,
      unnamed_medical: unnamedMedicalConstraints,
      dish_bearers: household.crossContact.dishBearersSeen,
    }));

    if (isDraft) {
      return jsonResponse(req, {
        ok: true,
        draft: true,
        meal: null,
        window: { starts_on: startsOn, duration_days: durationDays },
        // ── ⟳ A1 · CE QUE L'ÉCRAN DOIT DIRE SUR LE TIMING ────────────────
        // `{kind, reason, lead_day}`. `day_before` = la fenêtre a reculé et
        // `lead_day` porte la date du jour de cuisine; `same_morning` = pas de
        // veille, et l'écran rend « courses et cuisson dès le matin ».
        //
        // ⛔ CALCULÉ ICI ET NULLE PART AILLEURS. Le navigateur ne connaît PAS
        // l'heure (`local_date.ts` refuse tout repli UTC, et un
        // `new Date().getHours()` côté front est interdit): un écran qui
        // referait ce verdict le referait faux, et en silence.
        timing: planTiming,
        suggested_window: suggestedWindow,
        rationale: { lines: rationaleLines, refusal: rationaleRefusal },
        request_report: { lines: reportLines, refusal: reportRefusal },
        // L7 ③ — LE COMPTEUR DU NOM, À LA RACINE ET PAS SOUS `household`, pour
        // la raison exacte de `same_day`: le champ est demandé par le schéma du
        // TRONC et lu par le parseur partagé, donc les deux lanes le comptent
        // de la même façon, au même endroit. Un compteur rangé sous `household`
        // d'un côté et à la racine de l'autre n'est lisible par aucune requête
        // qui regarde toute la population.
        names: meal.name_counts,
        // ⟳ LOT `L17-0` — À LA RACINE, ET POUR LA RAISON ÉCRITE JUSTE AU-DESSUS.
        // `FOOD_GROUP_DECLARATION_BLOCK` est une consigne du TRONC (elle voyage
        // avec `dietaryRegimePromptLine`, partagé par les deux lanes): son
        // compteur se range donc au même endroit des deux côtés, sinon aucune
        // requête ne peut lire toute la population.
        //
        // ⛔ RENDU SUR L'APERÇU AUSSI, par la MÊME expression que sur la ligne
        // écrite: `generated_from` n'existe que sur un plan écrit, et toute
        // vérification en situation réelle de ce chantier se fait en `draft`.
        food_groups: foodGroups,
        household: {
          id: householdId,
          member_count: members.length,
          dish_owners: dishOwnersTrace,
          ...promptTrace,
          ...boxTrace,
        },
        dishes,
        preparations: preparationsWritten,
        cooking_sessions: mealSessionsPayload(meal),
        shopping_list: mealShoppingPayload(meal),
        member_portions: memberPortionsPayload(portionsOut),
        member_deltas: memberDeltasPayload(resolution.deltas),
        merged_members: mergedFromAll.map((e) => e.member_id),
        issues: [...issues, ...meal.issues, ...portionIssues],
        request_id: requestId,
      });
    }

    // ── L'ÉCRITURE: LA MÊME RPC QUE LE CHEMIN INDIVIDUEL ────────────────
    // `intent` et `replaces` sont validés TOUT EN HAUT, avant le modèle — ils
    // ne dépendent que du corps de la requête. Les relire ici en ferait deux
    // sources qui divergeraient au premier ajustement.
    const { data: writtenRows, error: writeErr } = await admin.rpc(
      "write_student_meal_plan",
      {
        p_user_id: userId,
        p_intent: intent,
        p_starts_on: startsOn,
        p_duration_days: durationDays,
        p_replaces: replaces,
        p_payload: {
          // ⟳ A1 (2026-09-03) — LA VEILLE VOYAGE DANS LE PAYLOAD, pas dans un
          // paramètre: ajouter un argument à `write_student_meal_plan` créerait
          // une SURCHARGE côté Postgres, donc un 300 PostgREST sur chaque
          // composition. La RPC en tire ses deux bornes, sa boucle de
          // chevauchement, sa troncature et `scope` (`20260903170000`).
          //
          // ⚠️ DÉRIVÉ DE `cookOnlyDay`, JAMAIS DE `lead.leadDay`:
          // `withCookDayBefore` a le dernier mot — une veille possible au
          // calendrier peut être refusée par la fenêtre, et écrire `1` sur une
          // fenêtre qui n'a pas reculé ferait une ligne dont le premier jour
          // mangé n'existe pas.
          lead_days: cookOnlyDay === null ? 0 : 1,
          mode: "to_shop",
          meal_slot: null,
          // D14 — CE QUI A ÉTÉ CUISINÉ, donc le même nombre que celui donné au
          // modèle. `members.length` décrivait le foyer; ce champ décrit une
          // CASSEROLE, et une casserole ne sait pas qui est parti en camp.
          servings: Math.min(12, Math.max(1, presence.servings)),
          context: String(body.context ?? "").trim().slice(0, 2000) || null,
          preferences: String(body.preferences ?? "").trim().slice(0, 2000) || null,
          pantry: [],
          dishes,
          // ⟳ `L17-0` — LE MÊME TABLEAU QUE CELUI QUE LE COMPTEUR A LU. Un
          // second appel rendrait un tableau égal aujourd'hui et un compteur
          // qui décrit autre chose que la ligne le jour où quelqu'un touche à
          // `meal.preparations` entre les deux.
          preparations: preparationsWritten,
          cooking_sessions: mealSessionsPayload(meal),
          shopping_list: mealShoppingPayload(meal),
          // La MÊME expression que celle qui a écrit le prompt.
          content_locale: built.contentLocale,
          // ── LOT 18 · LES QUATRE COMPTEURS, SUR LA LIGNE DU PLAN ─────────
          // ⛔ PAS DANS `generated_from`: le voisin `box_sizing` écrit déjà
          // pourquoi — ce champ ne sort QUE hors `draft`, et toute vérification
          // en situation réelle se fait en `draft`. Deux colonnes dédiées sont
          // écrites sur CHAQUE plan persisté, quel que soit l'intent.
          //
          // ⛔ V0-B-bis — LES DEUX CLÉS PEUVENT VALOIR `null`, et c'est le
          // point: `null` = « personne n'a mesuré », qui n'est PAS zéro. La
          // RPC `write_student_meal_plan` laisse passer l'absence depuis la
          // migration 20260821231500 — avant elle, un `null` envoyé d'ici
          // ressortait en `0` / `{}` côté base, et le correctif aurait été
          // invisible.
          ...compositionFillColumns(compositionFill),
          household_id: householdId,
          // LA NATURE EST EXIGÉE DÈS QU'IL Y A UN FOYER (lot 3, 2026-08-11).
          // `write_student_meal_plan` refuse `plan_kind_required` sans elle: un
          // plan commun rangé comme personnel écraserait la fenêtre du plan
          // perso du maître au lieu de vivre à côté.
          plan_kind: "household",
          member_portions: memberPortionsPayload(portionsOut),
          // FF-043 — LES ADD-ONS, EN GRAMMES D'ALIMENT.
          //
          // ⚠️ NE SORTENT JAMAIS: la raison d'un delta, l'objectif d'un
          // membre, un différentiel lisible, toute mention de corps ou de
          // flag. Ce payload porte un aliment et des grammes, comme n'importe
          // quelle ligne de recette — et il n'y a AUCUNE prose à assainir.
          // `member_deltas` NE PART PLUS ICI (2026-08-12). La clé était envoyée
          // à `write_student_meal_plan`, qui ne la nomme jamais, vers une
          // colonne qui n'existe pas: un chemin d'écriture structurellement
          // mort, et un appelant qui se croyait écrivain. Les deltas restent
          // dans la RÉPONSE HTTP plus bas — leur seule destination réelle
          // aujourd'hui. Leur persistance appartient à FF-043, dont la
          // conception n'est pas finie: l'y ajouter serait décider à sa place.
          generated_from: {
            // ⟳ A1 — LE TIMING RESTE SUR LA LIGNE. Un journal de runtime
            // s'efface; le plan reste. Sans cette clé, « pourquoi ce plan
            // commence-t-il un jour plus tôt » n'est comptable en SQL nulle
            // part, et un lot débranché serait indiscernable d'un lot qui
            // marche.
            timing: planTiming,
            coach_id: doctrine.coachId,
            doctrine_version: doctrine.doctrine?.version ?? null,
            doctrine_reason: doctrine.reason,
            belief_keys: beliefKeys,
            goal: String(goalRow.goal ?? "health"),
            // DEUX AXES: le tronc partagé, puis la lane foyer. Les lignes
            // écrites avant le 2026-08-12 portent `+household` tout court —
            // c'est la v1 implicite. Voir HOUSEHOLD_PROMPT_VERSION.
            prompt_version:
              `${MEAL_PROMPT_VERSION}+household.${HOUSEHOLD_PROMPT_VERSION}`,
            intent,
            // FF-037 — même trace que sur la lane individuelle. La mesure du
            // §10 se lit sur les deux lanes ou sur aucune: un chiffre calculé
            // sur la moitié de la population est un chiffre faux.
            protein_anchor_retry: proteinAnchorRetry,
            protein_anchor_missing: meal.protein_anchor_missing,
            // ── C2 ④ · LES CASES QUE PERSONNE NE REMPLIT, SUR LA LIGNE ────
            // C'est ICI que le défaut a été mesuré: les cinq petits-déjeuners
            // d'un plan de FUSION tombés d'un coup, parce que la matière du
            // plan personnel citait « whey protein 90 g ». Le verrou numérique
            // est juste; ce qui manquait était de pouvoir le lire autrement
            // qu'en relisant les plats un par un.
            empty_slots: meal.empty_slots,
            // ══════════════════════════════════════════════════════════════
            // LOT 2 — LE COMMENTAIRE DU JOUR J, COMPTÉ.
            // ══════════════════════════════════════════════════════════════
            //
            // ⚠️ SUR LE TRONC ET PAS SOUS `household`, exprès: le champ est
            // demandé par le schéma du tronc et lu par le parseur partagé, donc
            // les deux lanes le comptent de la MÊME façon, au même endroit de
            // la ligne. Un compteur rangé sous `household` d'un côté et à la
            // racine de l'autre est un compteur qu'aucune requête SQL ne lit
            // sur les deux populations à la fois — et « la part de plats qui
            // portent leur geste du jour » est précisément un chiffre qui n'a
            // de sens que sur toute la population.
            //
            // Même arbitrage que `dish_owners` plus bas, qui reste sous
            // `household` parce que `for_member_id`, LUI, n'est demandé que par
            // l'enveloppe foyer.
            same_day: meal.same_day_counts,
            // L7 ③ — MÊME ARBITRAGE, MÊME PLACE QUE `same_day`, ET POUR LA
            // MÊME RAISON: `name` est demandé par le schéma du tronc, donc son
            // taux n'a de sens que lu sur toute la population.
            //
            // ⚠️ CE COMPTEUR ÉTAIT ARCHIVÉ PAR CETTE SEULE LANE, et le
            // commentaire qui le disait a survécu à sa cause: depuis le lot ④
            // du 2026-08-18, `generate-meal-v1` archive `names` au même nom et
            // à la même place (racine du `generated_from`). Une requête qui
            // regarde toute la population lit donc les deux lanes d'un coup —
            // c'était le seul point de la décision de placement.
            names: meal.name_counts,
            // ⟳ LOT `L17-0` — LES DEUX POPULATIONS DU GROUPE DÉCLARÉ, à la
            // racine comme `names`, et pour la même raison: la consigne qui les
            // produit est du TRONC. `declared` / `valid` / `refused` disent si
            // le modèle obéit; `persisted` dit ce que la ligne porte VRAIMENT.
            // L'écart entre `valid` et `persisted` valait 100 % avant ce lot.
            food_groups: foodGroups,
            household: {
              id: householdId,
              member_count: members.length,
              // TROIS COMPTES, PAS UN. « combien de mineurs » ne suffit plus a
              // relire une composition: une bouche dont l'age est INCONNU recoit
              // la meme part standard qu'un mineur, pour une raison toute
              // differente. Sans `unknown_age_count`, « pourquoi Marc a-t-il eu
              // une part standard ? » n'a pas de reponse trois jours plus tard.
              minor_count: members.filter((m) => m.ageState === "minor").length,
              unknown_age_count:
                members.filter((m) => m.ageState === "unknown").length,
              accountless_count: members.filter((m) => !m.userId).length,
              // LA LIGNE D'ENVIES A-T-ELLE ÉTÉ LUE, ET POUR QUELLE SEMAINE.
              // Sans ça, « pourquoi ce plan ignore-t-il ce que j'ai demandé ? »
              // n'a pas de réponse trois jours plus tard: on ne saurait pas
              // distinguer « rien n'a été écrit » de « la demande a été lue et
              // arbitrée ». (`spoken`/`silent` sont partis avec le conseil de
              // famille au lot 5: un décompte de silencieux se lit « il en
              // reste 3 à relancer ».)
              envy_line_used: household.envyLineUsed,
              envy_week: envyWeek,
              restriction_count: restrictions.length,
              // ── D4 · QUI A ÉTÉ ENTENDU, ET CE QUI A ÉTÉ COUPÉ ───────────
              // `accounts_at_table` dit combien de titulaires POUVAIENT parler;
              // `heard` combien ont vraiment eu une ligne dans le prompt;
              // `lines_in`/`lines_used`/`withheld`/`over_cap` où sont passées
              // les LIGNES. Sans ça, « son about-you n'a servi à rien » et « il
              // n'avait rien confirmé » laissent la même trace — et c'est
              // exactement la question que D4 existe pour trancher.
              //
              // ⚠️ CETTE ÉNUMÉRATION N'EST PLUS COMPLÈTE, ET C'EST DIT PLUTÔT
              // QUE TU. Il existe une CINQUIÈME cause de disparition depuis que
              // `buildHouseholdVoices` distingue « le budget est épuisé » de
              // « cette ligne-là ne tient à aucune position »: `linesTooLong`
              // (`voice_line_too_long:<membre>:<n>`). Elle n'est PAS agrégée
              // ici — seul `per_member.too_long` la porte, juste en dessous.
              // Les deux motifs se lisent en sens opposés: `over_cap` dit « le
              // plafond est peut-être trop bas pour ce foyer », `too_long` dit
              // « un producteur écrit trop long ». Une énumération périmée se
              // relit comme une spécification, et celle-ci laissait croire que
              // quatre nombres suffisaient à savoir où sont passées les lignes.
              //
              // ⚠️ LES NOMBRES VIENNENT DU MODULE, PAS DES `issues`, ET C'EST
              // UNE CORRECTION MESURÉE. Ils étaient dérivés en comptant des
              // CHAÎNES: une ligne retenue par la garde sur trois formes de
              // surface rendait `withheld: 3`, et deux lignes tombées au
              // plafond rendaient `over_cap: 1` (une seule `issue`, qui portait
              // `:2` dans son texte). Les deux nombres du même objet étaient
              // gonflé et dégonflé, en sens inverses. Un compteur dérivé d'un
              // format de trace ment dès que le format bouge.
              //
              // ⚠️ `lines_used` EST LE NOMBRE QUI MANQUAIT. `heard` compte des
              // MEMBRES, et le log `member_voices` compte les lignes BRUTES,
              // avant toute garde: aucune trace ne disait combien de lignes le
              // modèle avait réellement vues, qui est pourtant la seule
              // question pour relire une composition.
              //
              // ÉCRIT MÊME À ZÉRO, exprès: une clé absente ne se distingue pas
              // d'un lot débranché, et ce dépôt paie en boucle la garde
              // construite puis silencieusement débranchée.
              voices: {
                accounts_at_table: accountsAtTable,
                heard: household.voicesHeard,
                lines_in: household.voiceCounts.linesIn,
                lines_used: household.voiceCounts.linesUsed,
                withheld: household.voiceCounts.linesWithheld,
                over_cap: household.voiceCounts.linesOverCap,
                // PAR BOUCHE, parce que c'est bon marché (un objet de quatre
                // entiers par titulaire qui a parlé) et parce que c'est la
                // maille de la question: « pourquoi le plan ignore-t-il ce que
                // MOI j'ai dit ? ». Il porte les bouches dont TOUT est tombé —
                // `heard` ne les porte pas.
                per_member: household.voiceCounts.perMember,
              },
              // ══════════════════════════════════════════════════════════
              // LOT B — LE MODE DE CUISSON: DEMANDÉ, CALCULÉ, SERVI.
              // ══════════════════════════════════════════════════════════
              //
              // LES TROIS, ET PAS UN. `served` seul se lirait comme la décision
              // du moteur alors que c'est parfois celle de la personne, et
              // « pourquoi n'ai-je eu qu'un seul plat ? » n'aurait pas de
              // réponse trois jours plus tard. C'est le même arbitrage que
              // `merge.honoured.requested`/`observed` deux blocs plus bas: sans
              // le couple, une archive se lit comme un fait alors que c'est une
              // demande.
              //
              // ÉCRIT MÊME QUAND RIEN N'A ÉTÉ DEMANDÉ (`asked: null`), exprès:
              // une clé absente ne se distingue pas d'un lot débranché, et ce
              // dépôt paie en boucle la garde construite puis silencieusement
              // débranchée.
              //
              // ⛔ ET IL N'A AUCUN LECTEUR, C'EST LE POINT. Le choix se refait à
              // CHAQUE composition; le relire d'un plan précédent le
              // transformerait en réglage de profil, c'est-à-dire très
              // exactement ce que ce lot a refusé d'écrire — « un réglage de
              // profil s'écrit une fois et s'applique en silence à toutes les
              // semaines suivantes, y compris celle où on reçoit du monde ».
              cooking: {
                asked: askedCookingShape,
                computed: computedShape,
                served: cookingShape,
                capped: shapeCap.capped,
                unused: shapeCap.unused,
                // LE CALCUL, puis CE QUE LA CONSIGNE A VRAIMENT PROMIS. Les
                // deux listes diffèrent exactement quand le plafond a mordu, et
                // c'est la seule façon de relire ce qu'un plan a retiré.
                diverging: divergingMembers.map((m) => m.memberId),
                dish_bearing: dishBearingMembers.map((m) => m.memberId),
              },
              // ══════════════════════════════════════════════════════════
              // LOT C — L'ATTRIBUTION, COMPTÉE. C'EST CE QUI EMPÊCHE LE LOT
              // D'ÊTRE DÉSARMÉ EN SILENCE.
              // ══════════════════════════════════════════════════════════
              //
              // ⛔ LE CHAMP `for_member_id` EST DÉCLARÉ PAR LE MODÈLE. On ne
              // peut donc pas SAVOIR d'avance à quelle fréquence il le remplit
              // — seulement le mesurer. Sans ces deux nombres, un modèle qui
              // ignorerait la consigne rendrait `member_id: null` partout, et
              // le lot ressemblerait trait pour trait à un lot qui marche: la
              // vue par personne montrerait les mêmes plats à tout le monde,
              // c'est-à-dire exactement le comportement d'avant.
              //
              // `asked` dit combien de plats dédiés la consigne réclamait;
              // `attributed` combien en sont revenus avec un porteur valide.
              // L'écart est LA question à poser au premier run réel.
              //
              // ⛔ LOT 3C — ET `declared`/`refused`, PARCE QUE `attributed: 0`
              // A ÉTÉ MAL LU UNE FOIS, ET QUE ÇA A COÛTÉ UN DIAGNOSTIC ENTIER.
              // Le 2026-08-17, ce zéro a été rapporté comme « le modèle n'écrit
              // jamais la clé »; l'archive `llm_raw_response_events` disait
              // autre chose — deux réponses sur douze la portaient, dont une sur
              // une bouche hors de la liste fermée, refusée trois lignes plus
              // bas dans le parseur. « Jamais déclaré » et « déclaré puis
              // refusé » rendaient le MÊME zéro et appellent des corrections
              // OPPOSÉES: resserrer la consigne d'un côté, corriger la liste
              // des porteurs de l'autre. Les deux nombres viennent du parseur
              // (`dish_owner_counts`), jamais d'un second comptage ici — deux
              // comptages du même objet finissent gonflé et dégonflé en sens
              // inverses, ce dépôt l'a déjà payé sur les voix.
              //
              // ÉCRIT MÊME À ZÉRO, comme les blocs voisins: une clé absente ne
              // se distingue pas d'un lot débranché.
              dish_owners: dishOwnersTrace,
              // ══════════════════════════════════════════════════════════════
              // L7 ① ET ② — CE QUE LES DEUX BLOCS NEUFS ONT DIT.
              // ══════════════════════════════════════════════════════════════
              //
              // ⚠️ SOUS `household`, comme les boîtes et l'attribution: leurs
              // deux consignes ne sont réclamées que par l'enveloppe foyer
              // (`kitchenBlock`, `eatingOutBlock`). La lane individuelle ne les
              // voit pas — le trou est nommé dans le rapport L7-A.
              //
              // ⚠️ CE SONT DES TRACES, PAS DES COMPTEURS À TROIS NOMBRES: ces
              // blocs ne demandent aucun champ au modèle, donc rien n'est
              // déclaré et rien n'est validable. `kitchen.declared` dit ce que
              // le foyer a répondu (`null` = jamais demandé, le cas de 175
              // comptes sur 175 au 2026-08-18), `kitchen.missing` ce que le
              // prompt a interdit, `eating_out` combien de bouches et de cases
              // il a nommées. Écrits même vides: une clé absente ne se
              // distingue pas d'un lot débranché.
              ...promptTrace,
              // ══════════════════════════════════════════════════════════════
              // LOT 4 — LES GRAMMES, COMPTÉS SOUS `household`.
              // ══════════════════════════════════════════════════════════════
              //
              // ⚠️ ICI ET PAS À LA RACINE, contrairement à `same_day`, et la
              // règle est celle que le LOT 2 a posée: un compteur se range où
              // vit la CONSIGNE qui le produit. `same_day` est demandé par le
              // schéma du TRONC, donc les deux lanes le comptent de la même
              // façon au même endroit de la ligne. Les boîtes, elles, ne sont
              // réclamées que par l'enveloppe foyer (`boxSchemaBlock`,
              // `boxingOrderLines`) — comme `for_member_id`, et elles se rangent
              // au même endroit que lui.
              //
              // ⚠️ `unquantified_dish_ingredients` VOYAGE AVEC ELLES ICI ET
              // EXISTE AUSSI À LA RACINE DE LA LANE INDIVIDUELLE, et c'est
              // assumé: la consigne qui le gouverne est du TRONC, donc une
              // requête qui veut les deux populations lit la racine d'un côté et
              // `household` de l'autre. La MÊME expression (`boxTrace`) écrit les
              // deux, donc aucune divergence de forme n'est possible; ce qui
              // diffère est le CHEMIN, et il est nommé ici pour qu'on ne le
              // cherche pas.
              ...boxTrace,
              // ── D14 · QUI A ÉTÉ COMPTÉ ABSENT, ET PAR QUI ──────────────
              // Sans ce bloc, une absence marquée par erreur est SILENCIEUSE:
              // il manque une assiette, et personne — ni le maître, ni la
              // personne concernée, ni nous — ne peut dire pourquoi. C'est la
              // moitié relisible de l'arbitrage B: puisque DEUX sources
              // peuvent retirer quelqu'un de la table, il faut pouvoir dire
              // laquelle l'a fait.
              //
              // `members` ne porte QUE les bouches qui manquent au moins une
              // fois: une trace où tout le monde figure avec des tableaux
              // vides ne se lit plus, et le cas nominal (personne n'est
              // absent) doit rester un objet vide.
              presence: {
                members: presence.trace,
                deserted: presence.householdAway,
                servings: presence.servings,
              },
              // ── FF-059 · LES ADD-ONS, GELÉS AVEC LE PLAN ────────────────
              //
              // ⚠️ CE N'EST PAS LA PERSISTANCE QUE FF-043 SE DOIT, et il faut
              // le dire clairement. FF-043 décidera d'une COLONNE, avec sa
              // forme, ses index et ses lecteurs; sa conception n'est pas
              // finie, et la trancher ici serait décider à sa place. Ceci est
              // une TRACE, dans le blob que cette fonction écrit déjà, avec un
              // seul lecteur nommé: `meal-energy-v1`.
              //
              // ── POURQUOI IL FALLAIT L'ÉCRIRE QUAND MÊME ─────────────────
              // Les deltas ne vivaient que dans la RÉPONSE HTTP de la
              // composition. Un rechargement de page les perdait — et avec eux
              // la seule divergence NUMÉRIQUE du foyer. `member_portions` ne
              // porte que des PHRASES (« generous vegetables, full protein
              // share »), et `FORBIDDEN_PORTION_TERMS` y bannit « kcal ».
              // Sans cette trace, FF-059 ne pouvait rendre à personne SA part:
              // il ne pouvait qu'abstenir, ou diviser également — ce qui aurait
              // rendu la bifurcation par objectif INVISIBLE, c'est-à-dire
              // l'inverse exact de ce que le chiffre par portion existe pour
              // montrer.
              //
              // ── GELÉ, ET C'EST LE MÊME ARBITRAGE QUE `grams_raw` ────────
              // On écrit ce qui a été calculé LE JOUR DE LA COMPOSITION, avec
              // les corps de ce jour-là. Recalculer à la lecture ferait bouger
              // l'histoire d'un plan à chaque pesée — et afficherait une part
              // qui ne correspond plus à l'assiette que le plan décrit.
              //
              // ⚠️ CE N'EST PAS UN CHIFFRE STOCKÉ au sens de FF-059 R5: c'est
              // un ALIMENT et des GRAMMES, exactement comme une ligne de
              // recette. L'énergie, elle, se recalcule à chaque lecture.
              //
              // ÉCRIT MÊME VIDE, comme `voices` juste au-dessus: une clé
              // absente ne se distingue pas d'un lot débranché — et ici la
              // distinction porte, parce qu'un plan SANS add-ons et un plan
              // d'AVANT ce lot ne se lisent pas pareil (le premier a un chiffre
              // exact, le second doit s'abstenir).
              member_deltas: memberDeltasPayload(resolution.deltas),
              // ── D2 · D7 · QUI A PRIS LA MAIN, ET AVEC QUEL PLAN ────────
              // Sans ce bloc, le maître voit qu'il cuisine pour un de moins et
              // n'a AUCUN moyen de savoir pourquoi: ni l'écran, ni le plan, ni
              // nous ne pourraient dire si quelqu'un a été retiré, par quelle
              // règle, ni sur la foi de quel plan. C'est le pendant exact de la
              // trace de présence juste au-dessus — la même raison, une autre
              // cause.
              //
              // `partial` N'EST PAS DU DÉCOR: il porte ceux dont le plan MORD
              // sur la fenêtre sans la recouvrir, et qui restent donc composés.
              // C'est la seule preuve relisible que l'arbitrage « recouvrement
              // TOTAL » a été appliqué et pas oublié — sans elle, un plan
              // partiel et l'absence de plan laissent la même trace. C'est
              // aussi ce que L4 lira pour savoir qu'il y a une intersection à
              // fusionner (D15).
              //
              // ÉCRIT MÊME VIDE, exprès: une clé absente ne se distingue pas
              // d'un lot débranché, et ce dépôt paie en boucle la garde
              // construite puis silencieusement débranchée.
              hand: {
                taken: handOff.taken,
                partial: handOff.partial,
                // L4 — QUI A ÉTÉ REPRIS. Absent de `taken` comme quelqu'un qui
                // n'a jamais rien validé: sans cette liste, les deux cas
                // laissent la même trace.
                reclaimed: handOff.reclaimed,
                // L5/D8 — QUI A ÉTÉ SORTI DE LA TABLE PAR UNE DÉFUSION, et
                // surtout: son plan à lui couvrait-il tous ces jours-là.
                // « Le maître l'a retiré » et « il n'a rien à manger jeudi »
                // sont deux faits différents, et le second ne se déduit pas du
                // premier.
                unmerged: handOff.unmerged,
              },
              // ── D6 · D15 · D16 — LA FUSION, RELISIBLE ────────────────────
              //
              // ⚠️ SANS CE BLOC, L'AVERTISSEMENT DE D8 EST INCALCULABLE. L5
              // doit pouvoir dire « le plan de X a été fusionné le … ; il vient
              // d'en valider un NOUVEAU » — c'est-à-dire comparer la
              // `validated_at` archivée ici à celle que porte la ligne
              // aujourd'hui. Un id de plan ne suffit pas: c'est une comparaison
              // de DATES.
              //
              // ÉCRIT QUAND CE PLAN PORTE AU MOINS UNE REPRISE, contrairement
              // à `hand` juste au-dessus. La raison de la différence: `hand`
              // décrit une décision prise à CHAQUE composition (« qui a pris la
              // main »), dont l'absence de résultat est un fait; `merge` décrit
              // des GESTES du maître, et l'écrire vide sur une composition
              // ordinaire ferait croire à une fusion jamais demandée.
              //
              // ⚠️ « AU MOINS UNE REPRISE » ET PAS « UNE FUSION AUJOURD'HUI »
              // (L5). Une composition ordinaire qui RE-REPREND quelqu'un doit
              // écrire ce qu'elle a repris, sinon la chaîne casse au tour
              // suivant: le plan neuf remplace le vivant, donc sa provenance
              // aussi, et la composition d'après ré-excluerait tout le monde
              // sans que personne n'ait rien demandé. Le GESTE du jour, lui,
              // reste dans les clés qui suivent `merged_from`, et elles sont
              // absentes quand ce plan ne fait que reporter.
              // ── L5/D8 — LA DÉFUSION, RELISIBLE ───────────────────────────
              //
              // ⚠️ SANS CE BLOC, « pourquoi ce plan ne contient-il plus rien
              // pour Zoé ? » n'a pas de réponse trois jours plus tard. La
              // trace de `hand.unmerged` dit QUI a été sorti; celle-ci dit
              // DEPUIS QUEL PLAN, et sur quels jours — c'est-à-dire ce à quoi
              // la consigne « rester au plus près du plan de base » se
              // référait. Sans `base_plan_id`, l'arbitrage « le plan de base
              // est le plan VIVANT, pas celui d'avant la fusion » n'est pas
              // vérifiable après coup, et les lignes écrites avant et après un
              // changement d'avis seraient indiscernables.
              ...(unmerge === null ? {} : {
                unmerge: {
                  member_id: unmerge.member.member_id,
                  user_id: unmerge.member.user_id,
                  base_plan_id: unmerge.basePlan.id,
                  base_plan_starts_on: unmerge.basePlan.startsOn,
                  base_plan_duration_days: unmerge.basePlan.durationDays,
                  base_dishes_shown: unmergeMaterial.length,
                  pivot: unmerge.window.pivot,
                  days_already_past: unmerge.window.daysAlreadyPast,
                },
              }),
              ...(mergedFromAll.length === 0 ? {} : {
                merge: {
                  merged_from: mergedFromAll,
                  // ── CE QUI SUIT DÉCRIT LE GESTE DU JOUR, ET RIEN D'AUTRE ──
                  // Absent quand ce plan ne fait que REPORTER des reprises
                  // antérieures: il n'a alors ni barreau, ni intersection, ni
                  // pivot — les écrire recopierait la décision d'un autre plan
                  // sur celui-ci, et personne ne saurait plus quel geste a
                  // vraiment eu lieu quel jour.
                  ...(merge === null || ladder === null ? {} : {
                  // LE PLAN DU FOYER DANS LEQUEL ON A REPRIS. C'est l'autre
                  // moitié de « fusionner A avec B »; sans lui, la trace ne dit
                  // que la moitié de ce qui a été mélangé.
                  into_plan_id: merge.householdPlan.id,
                  // D6 — LE BARREAU, ET POURQUOI CELUI-LÀ.
                  shape: ladder.shape,
                  reason: ladder.reason,
                  conflicts: ladder.conflicts,
                  shared_cooking_days: ladder.sharedCookingDays,
                  // ── LA FORME DEMANDÉE ET LA FORME OBTENUE, CÔTE À CÔTE ──
                  //
                  // ⚠️ SANS `observed`, `shape` SE LIT COMME UN FAIT ALORS QUE
                  // C'EST UNE DEMANDE. Le run du 2026-08-12 a écrit
                  // `separate_sessions` sur un plan servi depuis la casserole
                  // commune: l'archive et le plan se contredisaient dans la
                  // même ligne, et rien ne permettait de le voir après coup.
                  //
                  // ÉCRIT MÊME QUAND C'EST HONORÉ: une clé absente ne se
                  // distingue pas d'un lot débranché, et ce dépôt paie en
                  // boucle la garde construite puis silencieusement débranchée.
                  ...(mergeShape === null ? {} : {
                    honoured: {
                      requested: mergeShape.requested,
                      observed: mergeShape.observed,
                      marks: mergeShape.marks,
                      // ── C3 ⑥ · LES TROIS NOMBRES QUI SURVIVRONT À L'ÉTIQUETTE
                      // `observed` est un mot, et un mot se réécrit. Ces trois
                      // comptes disent CE QUI EST — « elle a mangé la casserole
                      // commune 8 fois sur 9 » — et resteront lisibles sur des
                      // plans écrits avant la prochaine rédaction du constat.
                      meals: {
                        at_table: mergeShape.meals.atTable,
                        dedicated: mergeShape.meals.dedicated,
                        from_common_pot: mergeShape.meals.fromCommonPot,
                        // C7 ④ — LA PART DU COMMUN QUI SE DÉGUISAIT EN DÉDIÉ.
                        // Sans ce nombre, « 7 sur 9 » et « 6 vrais + 1 clone »
                        // sont la même ligne d'archive, et la seconde ment.
                        cloned: mergeShape.meals.cloned,
                      },
                      ok: mergeShape.honoured,
                    },
                  }),
                  // D15 — CE QUE LES DEUX FENÊTRES PARTAGEAIENT.
                  intersection: {
                    starts_on: merge.window.intersection.startsOn,
                    duration_days: merge.window.intersection.durationDays,
                  },
                  // D1 — LES JOURS REPRIS DE SON PLAN, quand la fenêtre écrite
                  // les DÉBORDE. La ligne porte déjà `starts_on` et
                  // `duration_days`: sans ce couple-ci, rien ne dirait plus
                  // lesquels de ces jours venaient de son plan.
                  merged: {
                    starts_on: merge.window.window.startsOn,
                    duration_days: merge.window.window.durationDays,
                  },
                  // D16 — OÙ ON A COUPÉ, ET COMBIEN DE JOURS SONT TOMBÉS.
                  pivot: merge.window.pivot,
                  days_already_past: merge.window.daysAlreadyPast,
                  other_overlapping_plan_ids: merge.otherOverlappingPlanIds,
                  // ── L7/D11 — L'UNITÉ DE QUOTA QUE CE PLAN A CONSOMMÉE ──
                  //
                  // Le compteur, lui, n'abrège pas: il dit « 4 sur 5 » et rien
                  // de plus. Cette ligne-ci est la seule qui rattache une
                  // fusion PRÉCISE à l'unité qu'elle a prise — sans elle,
                  // « pourquoi ma semaine est-elle pleine ? » n'a de réponse
                  // qu'en recoupant des horodatages. `null` si la réclamation
                  // a échoué (fail-open, tracé dans `issues`).
                  quota: mergeQuota === null ? null : {
                    used: mergeQuota.used,
                    limit: mergeQuota.limit,
                    week_start: mergeQuota.weekStart,
                  },
                  }),
                },
              }),
            },
            issues: [...issues, ...meal.issues, ...portionIssues],
            // ── POURQUOI CES JOURS-LÀ, SUR LA LIGNE ─────────────────────
            // Renvoyer ces phrases dans la seule RÉPONSE ne suffit pas: au
            // premier rafraîchissement, le plan est relu depuis cette ligne et
            // l'explication disparaîtrait. Même raisonnement que `presence` et
            // `member_deltas` ci-dessus. ⚠️ AUCUNE MIGRATION: `generated_from`
            // est déjà `jsonb`. Écrit MÊME VIDE, avec son motif.
            rationale: { lines: rationaleLines, refusal: rationaleRefusal },
            // FF-061 — ce qui a été fait de ce qui avait été demandé.
            request_report: { lines: reportLines, refusal: reportRefusal },
            // FF-027 — la provenance de l'adaptation, archivée avec la
            // composition (voir `hungerSignalProvenance`). Le décompte est
            // archivé ici; il n'est pas entré dans le prompt.
            ...hungerSignalProvenance(hungerSignal),
          },
        },
      },
    );
    if (writeErr) {
      return jsonResponse(req, {
        error: "plan_not_written",
        detail: writeErr.message,
        request_id: requestId,
      }, { status: 409 });
    }
    const writtenRow = (Array.isArray(writtenRows) ? writtenRows[0] : writtenRows) as
      | { meal_id: string; retired_plan_id: string | null }
      | null;

    // ── C6 ② · LA CORRECTION DE GOÛT DU MAÎTRE S'ÉCRIT MAINTENANT ─────────
    // Le plan du foyer est écrit: le geste a produit quelque chose. Un refus,
    // une panne de modèle ou un 409 de la base laissent sa ligne intacte.
    //
    // ⚠️ CELLE DES AUTRES TITULAIRES N'A JAMAIS RIEN À ÉCRIRE (C4): leur
    // `actor` est `someone_else`, donc `pending` y vaut toujours `null`.
    // ⛔ LOT C — RIEN À PERSISTER: la réconciliation n'a plus lieu.

    // ── LOT 2D · CE QUE LE MAÎTRE A DEMANDÉ SUR SON BROUILLON, RANGÉ ───────
    //
    // ⚠️ ICI, ET PAS DIX LIGNES PLUS HAUT. `intent: "draft"` est sorti bien
    // avant ce point (`if (isDraft) return …`): sur un aperçu il n'y a pas
    // encore de plan, et ranger une envie qui vise un plan que la personne peut
    // encore abandonner écrirait une mémoire pour un geste qui n'a pas eu lieu.
    //
    // ⚠️ L'ANCRE EST `startsOn` — LA SEMAINE VISÉE — ET PAS `todayDate`.
    // Un foyer qui adopte le dimanche un plan qui commence lundi vise la
    // semaine SUIVANTE; ancrer sur le jour de la frappe ferait mourir l'envie
    // le lendemain matin (§7.3: vivant tant que `jour ≤ ancre + 6`). `today`
    // reste le jour de la frappe: c'est le `at` de l'item, pas son ancre.
    //
    // ⚠️ LE RÔLE VIENT DE `composedMembers`, PAS DE `members` (L3). Le modèle
    // ne peut recopier que des `member_id` de bouches RÉELLEMENT à cette table:
    // une bouche qui a repris la main sur son plan personnel n'est pas servie
    // ici, et lui attribuer une envie la rangerait chez quelqu'un d'absent.
    //
    // ⚠️ NE PEUT PAS FAIRE ÉCHOUER LA RÉPONSE, comme la ligne au-dessus: le
    // module rend un résultat, jamais une exception. Le plan est déjà écrit.
    if (draftNoteVerdict !== null) {
      await classifyAndPersistDraftNote({
        admin,
        userId,
        note: draftNoteVerdict,
        today: todayDate,
        targetWeek: startsOn,
        // ⛔ L'ÂGE ET LE SEXE, PARCE QUE LES GENS PARLENT EN PARENTÉ. Sans eux
        // le roster n'était que trois PRÉNOMS, et « mon fils n'aime pas le
        // poisson » partait sur le FOYER ENTIER — mesuré le 2026-09-01. Les
        // deux sont DÉJÀ chargés par cette lane: aucune lecture de plus.
        //
        // ⚠️ `ageState` ET PAS `ageBand`: les bandes d'âge sont adultes, donc
        // `null` pour exactement les bouches qu'il faut identifier.
        // `unknown` devient `null` — « je ne sais pas » n'est pas « adulte ».
        members: composedMembers.map((m) => ({
          memberId: m.memberId,
          label: m.displayName,
          ageState: m.ageState === "adult"
            ? "adult" as const
            : m.ageState === "minor"
            ? "minor" as const
            : null,
          sex: m.body?.gender ?? null,
        })),
        contentLocale: built.contentLocale,
        // ── LES ALIMENTS DU PLAN QU'ELLE VIENT DE LIRE ────────────────────
        //
        // ⛔ SANS EUX, « J'AI PAS AIMÉ LA VIANDE » DEVIENT UNE EXCLUSION DE
        // « viande » POUR TOUTE LA TABLE. Le classifieur ne peut demander
        // « laquelle ? » que s'il sait ce que le plan a servi; le champ est
        // requis pour qu'un appelant ne puisse pas désarmer la question en
        // silence.
        //
        // ⚠️ LES DEUX LISTES, dishes ET preparations: en cuisine par lots, une
        // part de la protéine vit dans les préparations, et un banc de ce dépôt
        // a déjà mesuré 51 % de la protéine hors du verdict pour cette raison.
        planFoods: foodTermsOf(dishes, preparationsWritten),
        source: "draft_note",
        requestId,
      });
    }

    return jsonResponse(req, {
      ok: true,
      meal: writtenRow ? { id: writtenRow.meal_id } : null,
      window: { starts_on: startsOn, duration_days: durationDays },
      // ── ⟳ A1 · CE QUE L'ÉCRAN DOIT DIRE SUR LE TIMING ────────────────
      // `{kind, reason, lead_day}`. `day_before` = la fenêtre a reculé et
      // `lead_day` porte la date du jour de cuisine; `same_morning` = pas de
      // veille, et l'écran rend « courses et cuisson dès le matin ».
      //
      // ⛔ CALCULÉ ICI ET NULLE PART AILLEURS. Le navigateur ne connaît PAS
      // l'heure (`local_date.ts` refuse tout repli UTC, et un
      // `new Date().getHours()` côté front est interdit): un écran qui
      // referait ce verdict le referait faux, et en silence.
      timing: planTiming,
      // Une PROPOSITION d'écran, jamais un refus: valeur par défaut du prochain
      // formulaire. `shifted: null` = « rien à déplacer », pas « on n'a pas
      // regardé ».
      suggested_window: suggestedWindow,
      // Des phrases FINIES, dans la langue du foyer, assemblées par le serveur.
      // ⛔ Aucun miroir de ces gabarits côté écran.
      rationale: { lines: rationaleLines, refusal: rationaleRefusal },
      request_report: { lines: reportLines, refusal: reportRefusal },
      household: {
        id: householdId,
        // `kind` a disparu avec la colocation (lot 2). L'ecran ne le lisait que
        // pour choisir un libelle; le retirer de la reponse evite qu'un client
        // continue de brancher dessus une distinction qui n'existe plus.
        member_count: members.length,
        // `spoken`/`silent` sont partis avec le conseil de famille (lot 5).
        // Rien ne les remplace DANS LA RÉPONSE: l'écran n'a plus rien à rendre
        // sur qui a parlé, et rendre `envy_line_used` inviterait à réafficher
        // « personne n'a rien demandé cette semaine » — c'est-à-dire à
        // remettre le reproche de silence que ce lot retire.
      },
      dishes,
      preparations: mealPreparationsPayload(meal),
      cooking_sessions: mealSessionsPayload(meal),
      shopping_list: mealShoppingPayload(meal),
      member_portions: memberPortionsPayload(portionsOut),
      member_deltas: memberDeltasPayload(resolution.deltas),
      // ── L4 — CE QUE LA FUSION A FAIT, DANS LA RÉPONSE ────────────────────
      // Rendu parce que l'appelant ne peut le déduire de RIEN d'autre: la
      // fenêtre fusionnée n'est pas celle qu'il a demandée (il n'en demande
      // pas), le barreau est une décision du moteur, et « 2 jours déjà passés »
      // est exactement la phrase que D16 met dans la proposition. Le recalculer
      // côté écran ferait un second avis sur des dates.
      ...(merge === null || ladder === null ? {} : {
        merge: {
          member_id: merge.member.member_id,
          plan_id: merge.personalPlan.id,
          into_plan_id: merge.householdPlan.id,
          shape: ladder.shape,
          reason: ladder.reason,
          conflicts: ladder.conflicts,
          window: { starts_on: startsOn, duration_days: durationDays },
          // D1 — CE QUE LA FENÊTRE ÉCRITE DOIT À SON PLAN. `window` est la
          // queue du plan du foyer; `merged` les jours qui viennent d'elle.
          // L'écran a besoin des deux pour dire la vérité en une phrase.
          merged: {
            starts_on: merge.window.window.startsOn,
            duration_days: merge.window.window.durationDays,
          },
          intersection: {
            starts_on: merge.window.intersection.startsOn,
            duration_days: merge.window.intersection.durationDays,
          },
          pivot: merge.window.pivot,
          days_already_past: merge.window.daysAlreadyPast,
        },
      }),
      // ── L5/D8 — CE QUE LA DÉFUSION A FAIT, DANS LA RÉPONSE ───────────────
      // Même raison que pour la fusion: l'appelant ne peut le déduire de rien
      // d'autre. Il n'a pas demandé cette fenêtre — elle est la QUEUE du plan
      // de base — et « le plan de Zoé ne couvrait pas tous ces jours » est
      // exactement ce que l'écran doit pouvoir dire avant de laisser le maître
      // fermer la fenêtre.
      ...(unmerge === null ? {} : {
        unmerge: {
          member_id: unmerge.member.member_id,
          base_plan_id: unmerge.basePlan.id,
          window: { starts_on: startsOn, duration_days: durationDays },
          pivot: unmerge.window.pivot,
          days_already_past: unmerge.window.daysAlreadyPast,
          covers_window:
            handOff.unmerged.find((u) => u.member_id === unmerge!.member.member_id)
              ?.covers_window ?? false,
        },
      }),
      // ── L5 — LES REPRISES QUE CE PLAN PORTE, TOUTES ──────────────────────
      // Rendu sur les TROIS opérations, y compris une composition ordinaire:
      // c'est la seule façon pour l'écran de dire « ce plan cuisine aussi pour
      // Tom, que vous aviez repris » sans relire `generated_from`.
      merged_members: mergedFromAll.map((e) => e.member_id),
      issues: [...issues, ...meal.issues, ...portionIssues],
      request_id: requestId,
    });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: FN_NAME,
      requestId,
      error,
      metadata: { source: "edge" },
    });
    return jsonResponse(req, {
      ok: false,
      error: readableErrorMessage(error),
      request_id: requestId,
    }, { status: 500 });
  }
});
