/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError, readableErrorMessage } from "../_shared/error-log.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import { keelGenerationModel } from "../_shared/keel/generation_model.ts";
import {
  doctrineBeliefsFor,
  doctrineBlockFor,
} from "../_shared/keel/doctrine_loader.ts";
// O7 — LA DOCTRINE D'UN MEMBRE DE FOYER SE RÉSOUT PAR LE FOYER. Le chargeur
// direct n'est plus importé ici: `loadDoctrineForCaller` l'appelle, et le passer
// par une seule porte est ce qui empêche qu'un appelant rouvre un jour le chemin
// sans repli. Voir l'en-tête de `household_doctrine.ts` pour l'arbitrage.
import { loadDoctrineForCaller } from "../_shared/keel/household_doctrine.ts";
import { coachNotePromptBlock, loadCoachNote } from "../_shared/keel/coach_note.ts";
import {
  loadPublishedProtocol,
  protocolBlockFor,
} from "../_shared/keel/protocol_loader.ts";
import { loadStudentSafetyConstraints } from "../_shared/keel/safety_constraints.ts";
import { evaluateRestrictionForStudent } from "../_shared/keel/restriction_runtime.ts";
import {
  loadStudentBody,
  mealBodyContextFrom,
} from "../_shared/keel/student_body_io.ts";
import type { MealBodyContext } from "../_shared/keel/meal_body.ts";
import { type WeeklyAxis, WEEKLY_AXES } from "../_shared/keel/weekly_flow.ts";
import {
  foodPreferencesByOrigin,
  foodPreferencesForPrompt,
  // LOT 1C — `readRetainedItems` et PAS `retainedItemsFrom`: même magasin,
  // même lecture, mais l'enrobage rend en plus le compteur des lignes
  // REFUSÉES. Sans lui, « rien en base » et « rien de lisible » se ressemblent.
  readRetainedItems,
} from "../_shared/keel/food_preference_promotion.ts";
import type { RetainedItem } from "../_shared/keel/retained_item.ts";
import { HOUSEHOLD_SUBJECT } from "../_shared/keel/retained_item.ts";
import { nextPlanItemsFor } from "../_shared/keel/retained_next_plan.ts";
import {
  type CompositionLines,
  compositionLinesFor,
  cravingLinesFor,
  logisticsOverlayFor,
  portionAdjustsFor,
  rhythmOverlayFor,
  routeRetainedItems,
  routingTrace,
} from "../_shared/keel/retained_items_routing.ts";
// ══ LOT 1G · L'ÉTAT D'ÂGE DU TITULAIRE, PROJETÉ PAR LA FONCTION EXISTANTE ═══
// `ageStateFromVerdict` est LE jumeau de `keel_age_state(date)` côté SQL et le
// rond-trip avec `mouthAgeVerdict` est déjà testé. On ne réécrit donc pas la
// réduction « six statuts → trois états » ici: c'est elle qui garantit
// qu'`unknown` ne peut pas dériver vers `adult`, c'est-à-dire vers la porte
// ouverte.
import {
  ageStateFromVerdict,
  type MemberAgeState,
} from "../_shared/keel/household.ts";
import {
  checkWrittenInstructions,
  silentInstructions,
} from "../_shared/keel/written_instruction_check.ts";
import {
  // C6 ② — CALCULER ET PERSISTER SONT DEUX GESTES, ET LE SECOND ATTEND QUE
  //         LA REQUÊTE ABOUTISSE.
  persistReconciledFoodPreferences,
  reconcileFoodPreferencesFor,
} from "../_shared/keel/food_preference_promotion_io.ts";
import {
  dayTokenInZone,
  localDateInZone,
  localMinuteInZone,
} from "../_shared/keel/local_date.ts";
// L'HEURE QU'IL EST, ET CE QU'ELLE INTERDIT. Les trois coupures y sont des
// CONSTANTES NOMMÉES; aucune n'est recopiée ici.
import {
  firstWindowDayIsCookable,
  proposedWindowStart,
  rhythmClockFrom,
  slotsPassedToday,
} from "../_shared/keel/plan_hours.ts";
// POURQUOI CES JOURS-LÀ — l'explication est DÉTERMINISTE et assemblée par le
// serveur. Jamais demandée au modèle: une jolie phrase inventée peut être
// fausse, et une explication fausse est pire que pas d'explication.
import { explainPlanChoices } from "../_shared/keel/plan_rationale.ts";
// FF-061 — CE QUI A ÉTÉ FAIT DE CE QUI AVAIT ÉTÉ DEMANDÉ. Module livré, vert,
// et sans aucun appelant depuis le 2026-08-13; c'est le mode d'échec n°1 du
// dépôt. Les quatre portes vivent DANS le module, pas ici.
import { reportOnRequest } from "../_shared/keel/request_report.ts";
import { gateRequestReport } from "../_shared/keel/request_report_gate.ts";
import {
  findForbiddenMatches,
  type ForbiddenTerm,
} from "../_shared/keel/forbidden_matcher.ts";
// LA PHRASE ÉCRITE SUR UN BROUILLON — gardée À L'ENTRÉE, parce qu'elle part au
// modèle dans le même message que la doctrine du coach et les contraintes de
// sécurité. Les quatre portes vivent DANS le module, pas ici.
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
// C3 ① — LE DROIT D'ACCÈS EST LU, JAMAIS APPLIQUÉ ICI. Voir l'en-tête du
// module: aucune règle de facturation n'existe pour un compte sans foyer, et en
// inventer une couperait des clients qui paient.
import {
  ACCESS_LOG_TAG,
  ACCESS_NONE,
  ACCESS_UNKNOWN,
  describeAccess,
  readAccessFacts,
} from "../_shared/keel/solo_access.ts";
// LOT 3 — le plan personnel d'un membre de foyer doit PORTER son foyer, sinon
// la fusion ne le retrouve jamais. Même résolveur que le chat, pour qu'il n'y
// ait qu'une seule définition de « quel foyer est celui de cette personne ».
// L1/D13 — ce même foyer décide aussi du DROIT de composer (gel à l'impayé),
// donc il est résolu avant le modèle et pas juste avant l'écriture.
import { resolveHouseholdIdFor } from "../_shared/keel/household_turn_context.ts";
import {
  countHungerDays,
  type HungerWindowSignal,
  hungerSignalProvenance,
  satietyUserSuffix,
} from "../_shared/keel/hunger_signal.ts";
import { loadHungerDays } from "../_shared/keel/hunger_signal_io.ts";
import {
  firstBlockingPlan,
  type LivePlanSpan,
  type MealWindowRequest,
  resolveRequestedWindow,
  windowDayOrder,
  windowStartsBeyondDayTokens,
} from "../_shared/keel/meal_plan_window.ts";
import {
  appendContentLanguageBlock,
  resolveArtifactLocale,
} from "../_shared/keel/locale.ts";
import {
  addedCookDays,
  buildMealPrompt,
  MEAL_TOKEN_FIELDS,
  MEAL_TRANSLATABLE_FIELDS,
  type GeneratedMeal,
  MEAL_MODES,
  MEAL_PROMPT_VERSION,
  MEAL_SLOTS,
  type MealMode,
  type MealScope,
  type MealSlot,
  DEFAULT_EATING_RHYTHM,
  type EatingOccasion,
  EATING_OCCASIONS,
  type EatingOccasionSlot,
  mealDishesPayload,
  mealPreparationsPayload,
  mealSessionsPayload,
  mealShoppingPayload,
  type PantryItem,
  parseAwayDays,
  parseEatingRhythm,
  parseGeneratedMeal,
  usableBudget,
} from "../_shared/keel/meal_generation.ts";
import { proteinAnchorRetryInstruction } from "../_shared/keel/protein_anchor.ts";
import type { CompositionIndex } from "../_shared/keel/food_composition.ts";
import { loadCompositionIndex } from "../_shared/keel/food_composition_io.ts";
import { isFriedMethod, resolveIngredients } from "../_shared/keel/food_composition.ts";
import {
  envelopeFor,
  type PortionAdjustFor,
  winningPortionAdjust,
} from "../_shared/keel/meal_envelope.ts";
import {
  type CompositionVerdict,
  foldPreparationsIntoDishes,
  verdictFor,
} from "../_shared/keel/meal_verdict.ts";
import {
  augmentedIndexFor,
  fixedIntakeInputsFor,
  parseFixedIntakes,
} from "../_shared/keel/fixed_intakes.ts";
import { parseDayProperties } from "../_shared/keel/day_properties.ts";
import {
  correctionPlanFor,
  correctionRetryInstruction,
} from "../_shared/keel/meal_correction.ts";
import {
  assessCoverage,
  coverageFlagAfterCorrection,
} from "../_shared/keel/meal_coverage.ts";
import { type ActivityLevel, GOAL_TOKENS, type GoalToken } from "../_shared/keel/tokens.ts";
import {
  dietaryRegimePromptLine,
  excludedSurfaceFormsFor,
  parseDietaryRegime,
  uncoverableSentinelsFor,
} from "../_shared/keel/dietary_regime.ts";
import {
  offAxesFor,
  steeringFor,
} from "../_shared/keel/composition_steering.ts";

/**
 * `generate-meal-v1` — l'élève se fait composer un repas.
 *
 *     LE COACH DONNE UNE MÉTHODE · L'ÉLÈVE DÉCIDE · PERSONNE NE NOTE
 *
 * Appelée avec le JWT de l'ÉLÈVE. Aucun `user_id` n'est accepté du client: on
 * lit celui du jeton, comme `generate-week-plan-v1`.
 *
 * ── CE QUI LA DISTINGUE DU PLAN DE LA SEMAINE ────────────────────────────
 * Le plan hebdo produit des LIGNES DE MÉTHODE, tracées à une conviction, une
 * par semaine, adoptées ou non. Ce chemin-ci produit des PLATS, à la demande,
 * autant de fois que l'élève veut. Il n'y a donc ni `status`, ni adoption, ni
 * unicité par semaine: un repas est un service rendu, pas un engagement.
 *
 * ── CE QU'ELLE N'ÉCRIT JAMAIS ────────────────────────────────────────────
 * `meal_ideas`. Cette table est la bibliothèque du COACH et son CHECK
 * `author_kind` n'accepte pas de modèle, délibérément. Un repas généré vit
 * dans `student_generated_meals`, et les deux ne se mélangent pas.
 */

const FN_NAME = "generate-meal-v1";

/**
 * FF-040 — COMBIEN DE GRANDEURS SONT HORS BANDE.
 *
 * Le critère d'adoption d'une relance. `not_computable` NE COMPTE PAS comme un
 * écart: une relance qui rendrait un plan moins lisible passerait pour une
 * amélioration, et le produit préférerait l'ignorance à l'imperfection.
 */
function offBandCount(v: CompositionVerdict): number {
  let n = 0;
  if (v.energy === "above" || v.energy === "below") n++;
  if (v.protein === "under") n++;
  if (v.density === "above") n++;
  n += v.sentinels.missing.length;
  return n;
}

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

/**
 * Le garde-manger tel que l'élève l'a tapé.
 *
 * Plafonné à 60 entrées et 120 caractères par terme: ce champ part dans un
 * prompt, donc il est une surface d'injection de coût autant que de contenu.
 * Le plafond est SILENCIEUX pour l'élève mais COMPTÉ dans `issues` — un
 * tronquage muet est la façon dont on découvre trois mois plus tard que la
 * moitié des placards n'était jamais lue.
 */
function readPantry(raw: unknown, issues: string[]): PantryItem[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: PantryItem[] = [];
  for (const entry of list) {
    if (out.length >= 60) {
      issues.push(`pantry: more than 60 items, the rest was ignored`);
      break;
    }
    const item = (entry && typeof entry === "object" ? entry : { term: entry }) as
      Record<string, unknown>;
    const term = String(item.term ?? "").trim().slice(0, 120);
    if (!term) continue;
    const quantity = String(item.quantity ?? "").trim().slice(0, 60) || null;
    out.push({ term, quantity });
  }
  return out;
}

/**
 * Les quatre contraintes de cuisine, lues DÉFENSIVEMENT.
 *
 * Une valeur hors liste est ignorée plutôt que transmise: le prompt afficherait
 * « recipe level they want: <n'importe quoi> » et le modèle ferait ce qu'il veut
 * de cette phrase. Absent vaut mieux que faux.
 */
/**
 * Ce que l'élève a dit de sa bouffe, SÉPARÉ PAR PROVENANCE: ce qu'il a tapé
 * lui-même d'un côté, ce que le memorizer a récolté et qu'il a confirmé de
 * l'autre (daté, le plus récent d'abord).
 *
 * La lecture, le tri et le plafond vivent dans `foodPreferencesByOrigin`, avec
 * le générateur de semaine: deux lectures différentes du même jsonb finiraient
 * par diverger, et c'est le genre de divergence qu'on ne voit qu'en relisant
 * deux prompts côte à côte.
 */
function readFlatFoodPreferences(
  pc: Record<string, unknown> | null,
): { written: string[]; remembered: string[] } {
  return foodPreferencesByOrigin(pc);
}

/**
 * LES DEUX MAGASINS, EN UNE SEULE LECTURE — lot 1C.
 *
 * ── POURQUOI LA FUSION EST ICI ET PAS AUX TROIS CALL SITES ────────────────
 * Cette fonction est appelée par la consigne, par la ceinture des consignes
 * écrites et par la correction. Fusionner à chaque endroit aurait fait trois
 * fusions à tenir d'accord — et c'est exactement la phrase qui justifie déjà
 * l'existence de cette fonction: « deux lectures différentes du même jsonb
 * finiraient par diverger ». Il y a maintenant deux jsonb; la raison n'a pas
 * changé, elle a doublé.
 *
 * ── L'ORDRE: LE STRUCTURÉ DEVANT ──────────────────────────────────────────
 * Le §7 de la nomenclature nomme les phrases plates « anciennes notes »: elles
 * n'ont ni `kind`, ni sujet, ni date fiable, et elles ne se reclassent que
 * quand la personne les édite. Le plafond de `foodPreferencesByOrigin` coupe
 * déjà par la queue AVANT d'arriver ici, donc ce qui tombe reste la plus
 * vieille récolte — jamais un item structuré.
 *
 * ⚠️ `retained` EST REQUIS, JAMAIS OPTIONNEL. « Paramètre de garde optionnel =
 * garde désarmée » est une cicatrice de ce dépôt: facultatif, il aurait laissé
 * un call site oublié rendre exactement le produit d'hier, sans qu'un seul
 * test rougisse.
 */
function readFoodPreferences(
  pc: Record<string, unknown> | null,
  retained: CompositionLines,
): { written: string[]; remembered: string[] } {
  const flat = readFlatFoodPreferences(pc);
  return {
    written: [...retained.written, ...flat.written],
    remembered: [...retained.remembered, ...flat.remembered],
  };
}

/**
 * L'INTENTION DE FENÊTRE, lue défensivement.
 *
 * Rend `null` sur tout ce qui n'est pas une des trois formes connues, et
 * l'appelant refuse alors la requête. Pas de repli sur « sept jours »: une
 * fenêtre devinée est une DATE DURABLE devinée, écrite dans une colonne que
 * cinq lecteurs vont croire.
 */
function readWindowRequest(raw: unknown): MealWindowRequest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const w = raw as Record<string, unknown>;
  const kind = String(w.kind ?? "").trim();
  if (kind === "until_sunday") return { kind: "until_sunday" };
  if (kind === "days") {
    const count = Number(w.count);
    if (!Number.isFinite(count)) return null;
    return { kind: "days", count };
  }
  if (kind === "exact") {
    const startsOn = String(w.starts_on ?? "").trim();
    const durationDays = Number(w.duration_days);
    if (!startsOn || !Number.isFinite(durationDays)) return null;
    return { kind: "exact", startsOn, durationDays };
  }
  return null;
}

function readCookingCapacity(pc: Record<string, unknown> | null): {
  cookDays: string[];
  cookingTimeMin: number | null;
  recipeDifficulty: string | null;
  variety: string | null;
  budgetAmount: number | null;
} {
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const pick = (value: unknown, allowed: readonly string[]): string | null => {
    const raw = String(value ?? "").trim();
    return allowed.includes(raw) ? raw : null;
  };
  const time = Number(pc?.cooking_time_min);
  return {
    cookDays: Array.isArray(pc?.cook_days)
      ? (pc!.cook_days as unknown[]).map((d) => String(d)).filter((d) =>
        DAYS.includes(d)
      )
      : [],
    cookingTimeMin: Number.isFinite(time) && time > 0
      ? Math.min(240, Math.round(time))
      : null,
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
  };
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  try {
    const admin = adminClient();

    // --- identité: le JWT de l'élève, jamais un user_id du client ----------
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

    // --- ce qui est demandé, dans des vocabulaires FERMÉS ------------------
    // Une valeur hors liste est REFUSÉE et pas dégradée en défaut: un élève qui
    // demande `from_pantry` et reçoit silencieusement `to_shop` se retrouve
    // avec une liste de courses pour des ingrédients qu'il a déjà.
    const mode = String(body.mode ?? "").trim() as MealMode;
    if (!(MEAL_MODES as readonly string[]).includes(mode)) {
      return jsonResponse(req, {
        error: "mode_required",
        detail: `mode must be one of ${MEAL_MODES.join(", ")}`,
        request_id: requestId,
      }, { status: 400 });
    }
    // ── L'INTENTION DE FENÊTRE REMPLACE `scope` ──────────────────────────
    // `scope` était une entrée du client, et une ligne `scope='day'` portant
    // une fenêtre de sept jours était donc possible. Il est maintenant DÉRIVÉ
    // de la durée, dans la RPC, et le client envoie ce qu'il veut vraiment
    // dire: « jusqu'à dimanche », « sept jours », ou des dates exactes.
    //
    // LA RÉSOLUTION VIT ICI, PAS DANS LE NAVIGATEUR. La fenêtre est une DATE
    // DURABLE que cinq lecteurs vont croire; la résoudre côté client la
    // laisserait dépendre d'une horloge qu'on ne contrôle pas.
    const windowRequest = readWindowRequest(body.window);
    if (!windowRequest) {
      return jsonResponse(req, {
        error: "window_required",
        detail: "window must be {kind:'until_sunday'} | {kind:'days',count} | " +
          "{kind:'exact',starts_on,duration_days}",
        request_id: requestId,
      }, { status: 400 });
    }
    // Deux branches nommées, comme la RPC (R6). `replace_current` doit nommer
    // la ligne qu'il remplace: avec deux onglets, « le courant » n'est plus
    // une notion univoque, et c'est l'écran qui sait lequel on regarde.
    //
    // ── `draft` — LE TROISIÈME MOT, ET IL N'ÉCRIT RIEN ────────────────────
    // Il compose exactement comme les deux autres et SAUTE LA SEULE ÉCRITURE
    // (`write_student_meal_plan`). Toutes les gardes amont s'appliquent à
    // l'identique — gel, `goal_required`, `no_coach`, fenêtre, chevauchement,
    // plancher TCA, doctrine, règles de maison: un aperçu qui contournerait une
    // garde montrerait un plan que la personne ne pourra jamais obtenir.
    //
    // `replaces` est REFUSÉ avec lui: nommer la ligne qu'on remplace n'a aucun
    // sens quand on n'écrit pas, et l'accepter laisserait croire à un
    // remplacement qui n'a pas lieu.
    const intent = String(body.intent ?? "replace_current").trim();
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
    const replaces = String(body.replaces ?? "").trim() || null;
    if (intent === "draft" && replaces !== null) {
      return jsonResponse(req, {
        error: "unknown_intent",
        detail: "intent=draft writes nothing, so it cannot name a `replaces`.",
        request_id: requestId,
      }, { status: 400 });
    }
    /** Un aperçu: tout se calcule, rien ne s'écrit. */
    const isDraft = intent === "draft";
    //
    // ── LA REPRISE D'UN APERÇU EST CÂBLÉE, ET PAS ICI ─────────────────────
    // « Refaire avec ça » envoie une phrase libre (`body.draft_note`) qui part
    // au modèle DANS LE MÊME MESSAGE que la doctrine du coach et les
    // contraintes de sécurité. Elle passe donc par une garde d'ENTRÉE,
    // `plan_draft_note.ts::readDraftNote`, qui a besoin de TROIS choses: le
    // texte, les interdits du coach et le plancher TCA. Les deux dernières ne
    // sont lisibles que plus bas — le câblage vit donc juste avant
    // `buildMealPrompt`, et il refuse `note_unusable` avant tout appel modèle.
    //
    // ⚠️ IL N'EST PAS RÉSERVÉ À `intent: "draft"`. Adopter un brouillon
    // recompose, et une adoption qui perdrait la phrase écrirait un plan qui
    // n'est pas celui qu'on a montré.

    // ── CE QUI EST DÉCIDABLE ICI NE SE PAIE PAS AU PRIX D'UN APPEL MODÈLE ──
    // Mesuré le 2026-08-11, en conditions réelles: 225 s et DEUX appels modèle
    // réussis, jetés à l'arrivée parce que `write_student_meal_plan` refuse
    // `replaces_required`. Or la condition ne dépend que du corps de la requête
    // — aucune lecture, aucun état. Elle était vérifiable 430 lignes et un
    // appel modèle plus tôt.
    //
    // Aggravant: `replace_current` est le DÉFAUT ci-dessus, c'est-à-dire la
    // seule branche qui ne peut jamais aboutir sans `replaces`. Le défaut n'est
    // pas changé ici — le changer modifierait le comportement d'un appelant qui
    // omet `intent` mais fournit `replaces` — mais il échoue désormais tout de
    // suite, et en le disant.
    if (intent === "replace_current" && replaces === null) {
      return jsonResponse(req, {
        error: "replaces_required",
        detail:
          "intent=replace_current must name the plan it replaces (`replaces`).",
        request_id: requestId,
      }, { status: 400 });
    }

    // ── LE FOYER, RÉSOLU ICI ET UNE SEULE FOIS (L1, D13) ─────────────────
    // Cette résolution vivait 740 lignes plus bas, juste avant l'écriture, et
    // ne servait qu'à ESTAMPER le plan. Elle remonte parce qu'elle porte
    // maintenant une garde, et une garde qui coûte un appel modèle n'est pas
    // une garde: c'est une facture. La valeur est CONSOMMÉE plus bas — il n'y
    // a toujours qu'une seule lecture du foyer dans cette fonction.
    //
    // Best-effort ASSUMÉ: une personne sans foyer rend `null`, et c'est le cas
    // nominal du produit individuel. Ce qui ne doit PAS arriver, c'est qu'une
    // panne de lecture fasse silencieusement un plan orphelin — un plan qui
    // n'entrera dans aucune fusion sans que personne ne le remarque. C'est
    // pour ça que l'échec est tracé dans `generated_from`, à l'écriture.
    //
    // ⚠️ C5 ⑦ — LE MÊME TROU QUE `generate-week-plan-v1`, ET IL Y EST AUSSI.
    // `generated_from.household_lookup_failed` trace bien l'échec SUR LA LIGNE
    // ÉCRITE — mais seulement si un plan finit par s'écrire. Quand la panne
    // fait retomber le repli de doctrine et que la fonction rend `409 no_coach`
    // 200 lignes plus bas, AUCUNE ligne n'est écrite, donc l'échec ne laisse
    // aucune trace. Le journal d'incidents est le seul endroit où les deux
    // issues se rejoignent.
    let householdId: string | null = null;
    let householdLookupFailed = false;
    try {
      householdId = await resolveHouseholdIdFor(admin, userId);
    } catch (error) {
      householdLookupFailed = true;
      console.warn(JSON.stringify({
        tag: "keel.meal.household_lookup_failed",
        user_id: userId,
      }));
      await logEdgeFunctionError({
        functionName: FN_NAME,
        requestId,
        error,
        userId,
        metadata: { source: "household_lookup", no_coach_risk: true },
      });
    }

    // ── LE GEL À L'IMPAYÉ, PAR CETTE PORTE AUSSI (L1, D13) ───────────────
    //
    // MESURÉ LE 2026-08-11: cette fonction n'avait AUCUNE garde de droit
    // d'accès. Un foyer gelé se voyait refuser `generate-household-meal-v1`,
    // puis obtenait 200 ici — et le plan écrit portait quand même le
    // `household_id` de ce foyer. Le 402 du foyer se contournait donc par une
    // porte voisine, pour 19 805 jetons.
    //
    // UN APPELANT SANS FOYER PASSE, et ce n'est pas un oubli: il existe des
    // comptes individuels qui n'auront jamais de foyer (arbitrage D13). Sans
    // `householdId`, il n'y a rien à interroger — on ne descend même pas dans
    // la RPC.
    //
    // ⚠️ AUCUNE RÈGLE N'EST ÉCRITE ICI. `keel_household_is_covered` est LA
    // définition unique du dépôt (migration 20260811050000): abonnement du
    // maître vivant, ou essai qui couvre encore. La réécrire en TypeScript —
    // « si free_until < aujourd'hui » — ferait deux définitions qui
    // divergeraient au premier ajustement, et personne ne saurait laquelle
    // ment.
    //
    // LE MOTIF EST LE MÊME MOT QUE L'AUTRE PORTE. `household_frozen`, déjà
    // mappé par l'écran du foyer: deux vocabulaires pour un même refus est une
    // dette que le front paie deux fois.
    //
    // FAIL-OPEN, ET C'EST L'ARBITRAGE INVERSE DE CELUI DES ALLERGIES.
    // Une lecture de sécurité en panne doit REFUSER de cuisiner. Une lecture de
    // FACTURATION en panne doit laisser passer: se tromper de sens ici coupe un
    // client qui paie, ce qu'aucun nouvel essai ne répare. Même raison pour
    // `householdLookupFailed`: on ne peut pas geler quelqu'un dont on n'a pas
    // su lire le foyer. L'échec est journalisé BRUYAMMENT pour qu'une garde
    // muette ne passe pas pour une garde qui ne mord jamais.
    if (householdId && !householdLookupFailed) {
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
          tag: "keel.meal.frozen",
          user_id: userId,
          household_id: householdId,
        }));
        // `skipErrorLog`: UN IMPAYÉ N'EST PAS UN INCIDENT. `jsonResponse`
        // écrit dans `system_error_logs` tout statut >= 400, au niveau
        // `error`. Mesuré le 2026-08-12: 15 lignes pour une seule session de
        // test, et un foyer gelé qui retape « Composer » en écrit une par
        // appui. Un journal d'incidents où l'état produit le plus banal est
        // majoritaire est un journal qu'on cesse de lire. La trace reste
        // entière juste au-dessus (`keel.meal.frozen`, avec le foyer et la
        // personne), et le 402 rendu à l'appelant ne change pas.
        return jsonResponse(req, {
          error: "household_frozen",
          detail: "This household is paused. Nothing has been deleted - the " +
            "current plan stays readable, and composing resumes as soon as the " +
            "subscription does.",
          request_id: requestId,
        }, { status: 402, skipErrorLog: true });
      }
    }

    const slotRaw = String(body.meal_slot ?? "").trim();
    const slot = (MEAL_SLOTS as readonly string[]).includes(slotRaw)
      ? (slotRaw as MealSlot)
      : null;
    if (slotRaw && !slot) issues.push(`meal_slot ${JSON.stringify(slotRaw)} is unknown, ignored`);

    const servings = Math.min(12, Math.max(1, Number(body.servings) || 1));
    const context = String(body.context ?? "").trim().slice(0, 2000) || null;
    // CE DONT ILS ONT ENVIE POUR CETTE COMPOSITION. Même plafond que `context`
    // et pour la même raison: ce champ part dans un prompt. Daté, donc écrit sur
    // la LIGNE et jamais dans `practical_constraints`, qui est durable.
    const preferences = String(body.preferences ?? "").trim().slice(0, 2000) || null;
    const pantry = readPantry(body.pantry, issues);

    if (mode === "from_pantry" && pantry.length === 0) {
      // Refus explicite plutôt que génération à vide: « cuisine avec ce que tu
      // as » sans rien savoir de ce qu'il a produirait une recette inventée
      // présentée comme faite pour ses placards.
      return jsonResponse(req, {
        error: "pantry_required",
        detail: "Tell us what you have before we cook from it.",
        request_id: requestId,
      }, { status: 409 });
    }

    // --- l'objectif, la situation et le RYTHME ----------------------------
    // `practical_constraints` existait depuis le premier jour du pivot, avec
    // son propre commentaire: « Séparées de la prose parce que le générateur
    // BRANCHE dessus ». Ce générateur-ci ne la lisait pas. Il composait donc
    // pour une journée de trois repas qu'il inventait lui-même, quelles que
    // soient les heures auxquelles l'élève a réellement faim.
    const goalRes = await admin
      .from("student_goals")
      // FF-030 — `focus_axis` entre dans le `select`, et il n'y était pas.
      // La colonne est collectée depuis le 2026-08-05 sur `/app/plan`, elle a
      // son CHECK, et cette lane ne la nommait nulle part: pour un élève en
      // `health` ou en `performance`, le jeton `goal` est le SEUL indicateur de
      // direction, et il ne dit rien de plus que « santé ».
      .select("goal, situation, focus_axis, practical_constraints, content_locale")
      .eq("user_id", userId)
      .maybeSingle();
    if (goalRes.error) throw goalRes.error;
    if (!goalRes.data) {
      return jsonResponse(req, {
        error: "goal_required",
        detail: "Set a goal and situation before we cook for you.",
        request_id: requestId,
      }, { status: 409 });
    }
    const goalRow = goalRes.data as Record<string, unknown>;

    // --- CE QUE L'ÉLÈVE A DÉMENTI DEPUIS ----------------------------------
    // Même raccord que dans `generate-week-plan-v1`, et il doit être ici AUSSI
    // plutôt qu'à un seul endroit: rien ne garantit qu'un élève génère une
    // semaine avant de générer un repas. Une garde qui ne couvre qu'un des
    // deux chemins d'un même jsonb est une garde qu'on croit posée.
    //
    // ⚠️ C6 ② — CE CALCUL PRÉCÈDE LES GARDES DE FENÊTRE; SON ÉCRITURE NON.
    //
    // MESURÉ LE 2026-08-12: une ligne `student_goals` a été corrigée à
    // `17:30:59` par un appel qui a rendu `400 window_beyond_this_week` (garde
    // posée ~250 lignes plus bas, avec `409 plan_overlaps_existing`).
    // `student_goals` bougeait donc — et son `updated_at` avec — sur une requête
    // que l'utilisateur voit comme ÉCHOUÉE, et rien à l'écran ne le lui disait.
    //
    // Ce n'était PAS une violation de C4: la personne a bien agi, c'est sa
    // propre ligne, `actor: "row_owner"` est juste. Ce qui était faux, c'est la
    // DATE.
    //
    // POURQUOI L'APPEL NE BOUGE PAS D'UNE LIGNE. Il alimente
    // `constraintsForPrompt`, donc il doit précéder la construction du prompt;
    // et les deux gardes sont volontairement posées JUSTE AVANT LE MODÈLE (C2:
    // « ce qui est décidable sans le modèle se refuse avant le modèle », 28,6 s
    // et 225 s brûlées pour l'avoir oublié). Cet ordre-là est le seul qui garde
    // les deux propriétés, et il est conservé.
    //
    // CE QUI A CHANGÉ: la fonction CALCULE et PRÉPARE, elle n'écrit plus. La
    // persistance part plus bas, une fois le plan écrit
    // (`persistReconciledFoodPreferences`). Un refus, une panne de modèle ou un
    // 409 de la base laissent désormais la ligne intacte.
    const foodPreferences = await reconcileFoodPreferencesFor({
      admin,
      userId,
      constraints: (goalRow.practical_constraints ?? {}) as Record<string, unknown>,
      source: FN_NAME,
      // C4 — la lane individuelle: `userId` est le compte authentifié et cette
      // ligne est la sienne. Sa propre correction s'écrit, comme avant — plus
      // tard, mais elle s'écrit.
      actor: "row_owner",
    });
    goalRow.practical_constraints = foodPreferences.constraints;

    // --- LA MÉTHODE DU COACH ----------------------------------------------
    //
    // ── O7 · UN MEMBRE DE FOYER COMPOSE SOUS LA DOCTRINE DE SON FOYER ──────
    //
    // MESURÉ EN HTTP RÉEL LE 2026-08-12: un compte secondaire recevait
    // `409 no_coach` en 373 ms, avec ZÉRO ligne `coach_clients` quand le maître
    // en avait une. `keel_household_join` n'attache personne à un coach — donc
    // personne ne pouvait prendre la main (D2), donc rien n'était jamais proposé
    // au maître, donc ni fusion, ni défusion, ni avertissement. Sept lots
    // serveur justes et prouvés, qu'aucun utilisateur ne pouvait déclencher.
    //
    // LE REPLI NE REMPLACE RIEN: `loadDoctrineForCaller` charge d'abord la
    // doctrine de l'appelant, et un titulaire qui a SON coach garde le sien sans
    // qu'une seule requête de plus ne parte. Le foyer n'est lu que sur la
    // branche où cette fonction rendait déjà `no_coach`.
    //
    // ⚠️ LE FOYER N'EST PAS RE-RÉSOLU: on passe `householdId`, résolu une seule
    // fois pour tout ce fichier (L1, ~140 lignes plus haut, pour la garde de
    // gel). Deux définitions de « quel foyer est celui de cette personne » est
    // une dette que ce dépôt a déjà payée.
    //
    // ⚠️ AUCUNE ÉCRITURE. Pas de ligne `coach_clients`, pas de `keel_role`: le
    // repli ne crée aucun siège, donc il ne touche pas la facturation. Voir
    // l'en-tête de `household_doctrine.ts` pour les deux sorties écartées.
    //
    // ⚠️ `doctrineGoal` EST NULLABLE, ET CE N'EST PAS LE `goalToken` DU VERDICT
    // (plus bas, qui retombe sur `"health"`). Ici, `null` veut dire « pas
    // d'objectif déclaré » et sert la variante `default` de la doctrine —
    // exactement ce que `loadPublishedDoctrine` fait quand il lit lui-même. Le
    // faire retomber sur `health` servirait à un élève sans objectif les
    // convictions écrites pour la santé, ce que le coach n'a pas dit.
    const doctrineGoal: GoalToken | null =
      (GOAL_TOKENS as readonly string[]).includes(
          String(goalRow.goal ?? "").trim(),
        )
        ? (String(goalRow.goal ?? "").trim() as GoalToken)
        : null;
    const resolvedDoctrine = await loadDoctrineForCaller(admin, {
      userId,
      householdId,
      goal: doctrineGoal,
    });
    const doctrine = resolvedDoctrine.doctrine;
    if (!doctrine.coachId) {
      // LE REFUS SURVIT, ET IL LE DOIT. Un compte sans foyer ET sans coach, un
      // foyer dont le maître n'a pas de coach non plus, un maître lui-même sans
      // coach: les trois retombent ici. Une garde sans cas qui refuse n'est pas
      // une garde.
      return jsonResponse(req, { error: "no_coach", request_id: requestId }, { status: 409 });
    }
    // Contrairement au plan hebdo, une doctrine vide n'est PAS bloquante ici:
    // un plat est une application libre, et `doctrineBlockFor` injecte le bloc
    // de prudence quand il n'y a pas de méthode. On refuse de composer une
    // LIGNE DE MÉTHODE sans conviction; on sait très bien faire à dîner sans.
    // Filtré par l'objectif de l'élève, comme le bloc. Une ligne de méthode
    // d'un plat se réclame d'une conviction; se réclamer d'une conviction que
    // le coach a écrite pour un autre objectif, c'est faire dire au coach ce
    // qu'il n'a pas dit à CET élève.
    const beliefKeys = doctrineBeliefsFor(doctrine)
      .map((b) => String(b.key ?? "").trim())
      .filter(Boolean);

    // --- LA NOTE 1:1 DU COACH SUR CET ÉLÈVE --------------------------------
    //
    // Chargée ici pour être injectée AU MÊME RANG que la doctrine, et jamais
    // au-dessus: elle ne rend aucune clé de conviction, donc `beliefKeys`
    // reste ce que `doctrineBeliefsFor` a filtré. Ne throw jamais.
    const coachNote = await loadCoachNote(admin, userId);

    // ── C3 ① · À QUEL TITRE CE COMPTE PRODUIT-IL — ON MESURE, ON NE FERME PAS
    //
    // Question ouverte n°1 du registre, mesurée: 19 805 jetons consommés par un
    // compte SANS FOYER, sans abonnement, essai expiré, coach insolvable. L1 a
    // fermé la porte du foyer; D13 laisse passer un compte sans foyer, exprès.
    //
    // ⚠️ AUCUN REFUS ICI, ET C'EST LA DÉCISION. Il n'existe aucune règle de
    // facturation décidée pour ce cas: brancher `has_app_write_access` — le
    // piège nommé — couperait dès le premier déploiement les membres de foyer
    // et les élèves dont le siège est payé par leur coach. On lit les droits qui
    // EXISTENT, on écrit ce qu'on a lu, et le trou devient une requête SQL au
    // lieu d'une hypothèse. Voir l'en-tête de `solo_access.ts`.
    //
    // PLACÉ ICI, après la résolution de doctrine: c'est le premier point où
    // `coachId` est connu, et c'est encore AVANT tout appel modèle.
    const access = describeAccess(
      await readAccessFacts(admin, {
        userId,
        householdId,
        coachId: doctrine.coachId,
      }),
    );
    if (access.state === ACCESS_NONE || access.state === ACCESS_UNKNOWN) {
      // ⚠️ SEULS CES DEUX ÉTATS SONT JOURNALISÉS, et pas les trois autres: un
      // journal où l'état le plus banal est majoritaire est un journal qu'on
      // cesse de lire (L1 l'a mesuré sur `system_error_logs`). La trace
      // EXHAUSTIVE, elle, est sur la ligne du plan — voir `generated_from`.
      console.log(JSON.stringify({
        tag: ACCESS_LOG_TAG,
        fn: FN_NAME,
        user_id: userId,
        ...access,
      }));
    }

    // --- LE MAPPING ALIMENTAIRE DU COACH ----------------------------------
    //
    // `coach_food_rules` existait, avec son écran, ses gardes et un compilateur
    // couvert par trente tests — et aucun lecteur au runtime. Un coach cochait
    // ses pastilles et le générateur composait sans rien en savoir.
    //
    // Ne bloque JAMAIS: un coach peut n'avoir jamais ouvert `/coach/protocol`
    // et avoir une méthode complète dans sa doctrine. Pas de mapping = pas de
    // bloc, et le reste du prompt est inchangé.
    //
    // ⚠️ O7 — LU SUR LE MÊME COMPTE QUE LA DOCTRINE, et c'est la moitié qui
    // compte. Le mapping alimentaire appartient au coach dont on sert la
    // méthode: lire celui de l'appelant sur un repli par le foyer rendrait un
    // HYBRIDE que personne n'a écrit — les convictions d'un coach, les aliments
    // d'aucun. C'est le mot du chargeur de doctrine sur la délégation, et il
    // vaut ici pour la même raison. `subjectUserId` est non nul dès que
    // `coachId` l'est (garde juste au-dessus).
    let protocolBlock = "";
    try {
      const protocol = await loadPublishedProtocol(
        admin,
        resolvedDoctrine.subjectUserId ?? userId,
        // LA VARIANTE SUIT LA PERSONNE QU'ON NOURRIT. Sur le chemin nominal,
        // AUCUNE option n'est passée — le protocole lit alors `student_goals` de
        // l'appelant exactement comme avant ce lot, et le comportement est
        // byte-identique.
        resolvedDoctrine.viaHousehold ? { goalOverride: doctrineGoal } : {},
      );
      // Le nom du coach vient de la doctrine déjà chargée: le mapping ouvre
      // sur « MARLOW'S FOOD MAPPING », pas sur « THE COACH'S ». Le produit
      // qu'on vend est que l'élève parle à l'agent DE SON COACH — la même
      // raison qui a fait ajouter cette lecture au chargeur de doctrine.
      protocolBlock = protocolBlockFor(protocol, doctrine.doctrine?.coachDisplayName ?? null);
    } catch (error) {
      console.warn(`[${FN_NAME}] coach food mapping unavailable`, error);
    }

    // --- contraintes dures de l'élève : le verrou qui ne dépend de personne
    let constraints = null;
    try {
      constraints = await loadStudentSafetyConstraints(admin as never, userId);
    } catch (error) {
      console.warn(`[${FN_NAME}] safety constraints unavailable`, error);
    }

    // ── FF-042 · LE RÉGIME DÉCLARÉ, LU UNE SEULE FOIS ET ASSEZ TÔT ─────────
    //
    // ⚠️ CE `const` EST HISSÉ ICI EXPRÈS, et le défaut qu'il corrige tenait
    // entièrement dans son ancienne POSITION. Il était calculé ~300 lignes
    // plus bas, juste au-dessus du verdict — c'est-à-dire APRÈS
    // `buildMealPrompt`. Le régime ne pouvait donc pas entrer dans la
    // consigne, même si quelqu'un avait voulu l'y mettre: à l'endroit où on
    // le lisait, le prompt était déjà parti. Il n'a jamais servi qu'à
    // `uncoverableSentinelsFor` (« il va lui manquer de la B12 »), pendant
    // qu'on lui composait du poulet.
    //
    // LU DEPUIS LES CONTRAINTES DÉJÀ CHARGÉES, jamais par une seconde
    // requête: deux lectures de la même table divergent, et c'est celle qu'on
    // regarde le moins qui garde l'ancien comportement.
    const declaredRegime = (constraints ?? [])
      .map((c) => parseDietaryRegime(c.dietRef))
      .find((r): r is NonNullable<typeof r> => r !== null) ?? null;

    // ── LE JOUR OÙ L'ÉLÈVE EST, ET LA FENÊTRE QU'IL A DEMANDÉE ───────────
    //
    // ── LE REPLI SUR « LE MODÈLE CHOISIT SES JOURS » A DISPARU ───────────
    // Un fuseau illisible dégradait en silence: `daysToFill = []`, et le modèle
    // repartait du lundi par habitude. C'était tolérable tant que la fenêtre
    // n'existait que dans le prompt. Elle est maintenant une DATE DURABLE
    // écrite en base et lue par cinq lecteurs — la deviner écrirait une date
    // fabriquée qu'aucun d'eux ne saurait mettre en doute. R7: on refuse.
    let todayToken: string;
    let todayDate: string;
    let country: string | null = null;
    // LA LANGUE DE L'ARTEFACT, déclarée ici parce qu'elle se lit dans le MÊME
    // `select` que le pays — zéro aller-retour de plus. Elle est initialisée au
    // repli de `resolveArtifactLocale` pour que le `catch` de fuseau ci-dessous
    // ne laisse jamais une locale vide traverser.
    let profileLocale: string | null = null;
    // ── L'HEURE QU'IL EST CHEZ L'ÉLÈVE ──────────────────────────────────
    //
    // Le backend ne connaissait QUE la date. Quelqu'un qui compose à 20 h se
    // voyait remplir la journée: un petit-déjeuner déjà pris, un déjeuner déjà
    // pris, des courses à faire dans un magasin fermé.
    //
    // ⚠️ `null` EST UNE VALEUR, PAS UN DÉFAUT. Il dit « je n'ai pas su lire
    // l'horloge », et chaque règle de `plan_hours.ts` rend alors le produit
    // d'hier. Il ne peut pas rester `undefined`: les fonctions de règle jettent
    // dessus, exprès.
    //
    // ⚠️ ET IL NE FAIT ÉCHOUER AUCUNE COMPOSITION. Le fuseau est déjà exigé
    // dix lignes plus bas (`local_day_unresolved`); si `localMinuteInZone`
    // échoue là où `localDateInZone` a réussi, c'est un défaut de notre côté et
    // pas une raison de refuser un dîner.
    let localMinuteOfDay: number | null = null;
    try {
      const tzRes = await admin
        .from("plan_versions")
        .select("timezone")
        .eq("student_id", userId)
        .eq("status", "published")
        .maybeSingle();
      // `profiles` est lu DANS TOUS LES CAS: c'est lui qui porte le PAYS, et le
      // pays décide de ce qui pousse en ce moment là où l'élève fait ses courses.
      const profileRes = await admin
        .from("profiles")
        .select("timezone, country, locale")
        .eq("id", userId)
        .maybeSingle();
      const timezone = String(
        (tzRes.data as { timezone?: unknown } | null)?.timezone ??
          (profileRes?.data as { timezone?: unknown } | null)?.timezone ?? "",
      ).trim();
      country = String(
        (profileRes?.data as { country?: unknown } | null)?.country ?? "",
      ).trim() || null;
      profileLocale = String(
        (profileRes?.data as { locale?: unknown } | null)?.locale ?? "",
      ).trim() || null;
      if (!timezone) throw new Error("no timezone on the plan or the profile");
      todayToken = dayTokenInZone(timezone, new Date());
      // LA DATE, et pas seulement le jour de la semaine. « mercredi » ne dit
      // pas si on est en février ou en août — donc rien ne permettrait au
      // modèle de savoir ce qui est de saison.
      todayDate = localDateInZone(timezone, new Date());
      try {
        localMinuteOfDay = localMinuteInZone(timezone, new Date());
      } catch (error) {
        // NOMMÉ: sans ce log, une horloge illisible en boucle est
        // indiscernable d'un lot débranché — et les deux rendent le produit
        // d'hier, en silence.
        console.warn(`[${FN_NAME}] local clock unreadable`, error);
        issues.push("local_clock_unreadable");
      }
    } catch (error) {
      return jsonResponse(req, {
        error: "local_day_unresolved",
        detail: "We could not tell what day it is where you are, and a meal " +
          "plan has to carry real dates.",
        request_id: requestId,
      }, { status: 409 });
    }

    // L'INTENTION DEVIENT UNE FENÊTRE, avec le fuseau de l'élève. Les erreurs
    // sont NOMMÉES (durée hors bornes, départ dans le passé): les traduire en
    // « une erreur est survenue » perdrait la seule information utile.
    let startsOn: string;
    let durationDays: number;
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

    // ══ C2 ② — UNE FENÊTRE QUE LES JETONS DE JOUR NE SAVENT PAS NOMMER ══════
    //
    // MESURÉ EN HTTP RÉEL LE 2026-08-12: `starts_on = 2026-08-26` (un mardi),
    // demandé un mercredi. Le message envoyé au modèle portait, à trois lignes
    // d'écart, « today is: wed », « days to fill, in this order: tue, wed » et
    // « Do not start earlier than today ». Le modèle a refusé EN TOUTES LETTRES
    // — `422 empty_meal`, `lock: disarmed_empty_text` — **après 6,2 s
    // facturées**.
    //
    // ⚠️ CE N'EST PAS UNE DÉSOBÉISSANCE, C'EST UNE CONSIGNE CONTRADICTOIRE. Les
    // jetons de jour n'ont pas de date; au-delà du dimanche, celui d'une fenêtre
    // est déjà pris par une date plus proche. Il n'existait aucune réponse
    // juste, et le refus du modèle était la seule honnête.
    //
    // ⚠️ CE QUI EST DÉCIDABLE SANS LE MODÈLE SE REFUSE AVANT LE MODÈLE. C'est
    // la règle que L1 a établie (28,6 s et 225 s brûlées sur des refus qui ne
    // dépendaient que du corps de la requête), et ce refus-ci ne dépend que de
    // deux dates.
    //
    // ── POURQUOI REFUSER PLUTÔT QUE RENDRE LA CONSIGNE NON CONTRADICTOIRE ──
    // Dater les jetons dans le prompt aurait marché aussi, et c'est l'option
    // qu'on écarte: elle change le TRONC (`buildMealPrompt`), donc elle fait
    // bouger `MEAL_PROMPT_VERSION` pour TOUTE la population — la lane
    // individuelle, la composition de foyer, la fusion et la défusion — pour
    // servir une forme de fenêtre que l'écran n'a jamais proposée. Le refus est
    // plus étroit (une porte, deux dates), et son retour arrière est ce bloc.
    if (windowStartsBeyondDayTokens(startsOn, todayDate)) {
      return jsonResponse(req, {
        error: "window_beyond_this_week",
        detail: "A plan is written in day names (mon, tue...), and those only " +
          "reach as far as this Sunday. Start your window this week, or " +
          "compose next week's plan once it has started.",
        request_id: requestId,
        // C5 ④ — `skipErrorLog`: UNE DATE CHOISIE PAR L'ÉLÈVE N'EST PAS UN
        // INCIDENT. Même arbitrage, et même mot, que le 402 du gel et le 429 du
        // plafond juste à côté: « un impayé n'est pas un incident ».
        //
        // MESURÉ: 5 lignes `window_beyond_this_week` au niveau `error` en UNE
        // seule session. Ce refus ne dépend que de deux dates que l'écran laisse
        // saisir — il est atteignable en trois clics, donc il serait
        // MAJORITAIRE dans le journal, et un journal où l'état produit banal
        // domine est un journal qu'on cesse de lire. La doctrine de ce chantier,
        // violée deux lots après avoir été écrite.
        //
        // ⚠️ LE CRITÈRE, ET IL EST ÉTROIT: se tait un refus causé par LA SAISIE
        // DE L'UTILISATEUR. Un refus causé par une PANNE parle toujours —
        // `live_plan_windows_unreadable` reste journalisé, les 502 du modèle et
        // les 500 aussi.
      }, { status: 400, skipErrorLog: true });
    }

    // ══ C2 ③ — LE JUMEAU DU P0 DE LA FUSION, SUR LA PORTE `compose` ═════════
    //
    // Le 2026-08-12, une FUSION sur une fenêtre englobée se payait
    // `409 plan_overlaps_existing` **après** 16,1 s de modèle, 7 335 jetons et
    // une unité du plafond de L7. `resolveMergeWindow` produit désormais une
    // fenêtre écrivable par construction — et cette porte-ci, qui porte la même
    // famille de défaut, n'avait pas été touchée.
    //
    // ⚠️ ELLE EST ATTEIGNABLE, ET PAR L'ÉCRAN. `MealBuilder` envoie
    // `{kind:"exact", starts_on, duration_days}` avec DEUX DATES QUE L'ÉLÈVE
    // CHOISIT: une fenêtre strictement intérieure à son plan vivant (mercredi →
    // vendredi dans un plan lundi → dimanche) est un geste de trois clics.
    // `write_student_meal_plan` la refuse exprès — correctif du 2026-08-11,
    // « une fenêtre englobée perdait des jours en silence » — et le refus
    // tombait après la dépense.
    //
    // ⚠️ LA RÈGLE N'EST PAS RÉÉCRITE ICI. `firstBlockingPlan` rejoue la boucle
    // de chevauchement de la RPC, celle-là même que la fusion utilise depuis
    // L10 (`mergeWindowWritable` en est l'autre appelant), avec son banc de
    // propriété de 400 formes et son test de fil vers la migration. Une seconde
    // écriture de cette règle aurait divergé au premier ajustement.
    //
    // ⚠️ CE N'EST PAS L'AUTORITÉ: la base tranche toujours. Ce refus-ci évite de
    // la payer au prix d'une génération. Une lecture en panne ne bloque donc
    // RIEN — le pire cas est celui d'avant ce lot, un 409 après le modèle — et
    // c'est le bon sens du fail-open ici, contrairement aux allergies.
    //
    // LE MÊME MOT QUE LA BASE (`plan_overlaps_existing`): deux vocabulaires
    // pour un même refus est une dette que le front paie deux fois.
    try {
      const liveRes = await admin
        .from("student_generated_meals")
        // LE PRÉDICAT DE LA RPC, MOT POUR MOT (20260811140000): même compte,
        // même NATURE, non retirée. `plan_kind = 'personal'` est ce que cette
        // fonction écrit toujours — un plan de foyer vit sur le compte du
        // maître avec l'autre nature, et les deux fenêtres ne se disputent
        // rien.
        .select("id, starts_on, duration_days")
        .eq("user_id", userId)
        .eq("plan_kind", "personal")
        .is("retired_at", null);
      if (liveRes.error) throw liveRes.error;
      const liveRows = (liveRes.data ?? []) as Array<Record<string, unknown>>;
      const live: LivePlanSpan[] = liveRows.map((r) => ({
        id: String(r.id),
        startsOn: String(r.starts_on ?? ""),
        durationDays: Number(r.duration_days ?? 0),
      }));
      const blocking = firstBlockingPlan({
        live,
        window: { startsOn, durationDays },
        // LA LIGNE QUE LA RPC RETIRE AVANT SA BOUCLE. Sans elle, la
        // composition la plus banale du produit — « remplace le plan courant »,
        // qui démarre le même jour que lui — serait refusée ici alors que la
        // base l'accepte. `prepare_next` ne retire rien, donc `null`.
        replacesId: intent === "replace_current" ? replaces : null,
      });
      if (blocking) {
        console.log(JSON.stringify({
          tag: "keel.meal.window_overlaps",
          user_id: userId,
          window: [startsOn, durationDays],
          clash: [blocking.plan.id, blocking.plan.startsOn, blocking.plan.durationDays],
          verdict: blocking.verdict,
        }));
        return jsonResponse(req, {
          error: "plan_overlaps_existing",
          detail: blocking.verdict === "encloses"
            ? "That window sits inside a plan you already have, and writing it " +
              "would leave the end of that plan with nothing. Cover it to its " +
              "last day, or replace it."
            : "You already have a plan that starts on that day or later. " +
              "Replace it, or start your window before it.",
          request_id: requestId,
          // C5 ④ — `skipErrorLog`, MÊME CRITÈRE QUE CI-DESSUS, et ce refus-ci
          // est le plus atteignable des deux: `MealBuilder` envoie deux dates
          // que l'élève choisit, et « une fenêtre intérieure à mon plan vivant »
          // est un geste de trois clics. Chaque élève qui compose une fenêtre
          // intérieure produisait une ligne d'incident de niveau `error`.
          // Mesuré: 2 lignes en une seule session de QA.
        }, { status: 409, skipErrorLog: true });
      }
    } catch (error) {
      // FAIL-OPEN NOMMÉ. On ne peut pas refuser une composition sur une lecture
      // ratée: le pire cas est le comportement d'avant ce lot.
      console.warn(`[${FN_NAME}] live plan windows unreadable`, error);
      issues.push("live_plan_windows_unreadable");
    }

    // `scope` est DÉRIVÉ de la durée et n'est plus reçu: une ligne `scope='day'`
    // portant une fenêtre de sept jours n'est plus exprimable.
    const scope: MealScope = durationDays === 1 ? "day" : "several_days";
    const daysToFill: string[] = windowDayOrder(startsOn, durationDays);

    // ══ LOT 1C · LA MÉMOIRE STRUCTURÉE ENTRE ICI ═══════════════════════════
    //
    // ⚠️ AVANT TOUT LECTEUR DE `practical_constraints`, et c'est la seule place
    // possible: `logistics.set` CORRIGE cette colonne, et les six lectures qui
    // suivent (`parseEatingRhythm`, `parseAwayDays`, `parseFixedIntakes`,
    // `parseDayProperties`, `readCookingCapacity`, `readFoodPreferences`) la
    // relisent chacune. Poser le correctif après l'une d'elles composerait le
    // plan sur l'ancienne cuisine et n'en changerait que la trace.
    //
    // Chaque famille va où son lecteur l'attend (nomenclature §2 axe 1):
    //   `food.*` / `method.*` → `foodPreferences` / `writtenInstructions`
    //                           de `buildMealPrompt`, et la correction;
    //   `rhythm.set`          → `eatingRhythm`, juste en dessous;
    //   `logistics.set`       → `practical_constraints`, ici;
    //   `craving`             → `preferences` — « ce dont ils ont envie CETTE
    //                           fois », le seul bloc d'envies de cette lane;
    //   `portion.adjust`      → voir le bloc dédié plus bas.
    const retainedDurable = readRetainedItems(
      goalRow.practical_constraints as Record<string, unknown> | null,
    );
    // ⚠️ CE BLOC DÉCRIVAIT L'ANCIEN MAGASIN, MOT POUR MOT, JUSQU'AU LOT 1J. Il
    // annonçait que les `next_plan` vivaient sur `household_envy_submissions`
    // (dont `household_id` est `not null`) et qu'un compte sans foyer n'aurait
    // donc « rien pour toujours ». C'est faux depuis le déménagement (§7.2).
    //
    // CE QUI EST VRAI: `nextPlanItemsFor({admin, userId, today})` lit
    // `student_goals.practical_constraints.retained_next_plan`, PAR `user_id`
    // SEUL — aucun foyer dans la clé. **Le solo est servi comme tout le monde**,
    // et c'était le motif même du déménagement: l'entrée du produit est à UNE
    // bouche. L'expiration est calculée à la LECTURE (vivant tant que
    // `jour ≤ ancre + 6`), sans colonne d'état ni suppression de ligne.
    //
    // Un `[]` ici ne dit donc plus qu'UNE chose: rien n'a été déposé pour la
    // semaine visée. Il n'y a plus deux vides à distinguer, d'où le retrait de
    // `next_plan_channel` de la trace ci-dessous.
    let retainedNextPlan: RetainedItem[] = [];
    try {
      retainedNextPlan = await nextPlanItemsFor({
        admin,
        userId,
        today: todayDate,
      });
    } catch (error) {
      // BEST-EFFORT: un hoquet sur les envies ne doit pas coûter la semaine.
      console.warn(`[${FN_NAME}] next_plan retained items unreadable`, error);
      issues.push("retained_next_plan_unreadable");
    }
    const routedRetained = routeRetainedItems([
      ...retainedDurable.items,
      ...retainedNextPlan,
    ]);
    // ⚠️ `household` SEUL. Cette lane lit la ligne d'UN compte et ne charge
    // aucun roster: elle ne connaît aucun `member_id`. Un item écrit pour une
    // bouche nommée est donc COMPTÉ (`otherSubjects`) et non appliqué —
    // l'appliquer reviendrait à décider que le titulaire EST cette bouche-là,
    // ce que rien ici ne prouve, et « Poulet pour Zoé » ne se résout pas par un
    // prénom.
    const retainedSpeaksFor = [HOUSEHOLD_SUBJECT];
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
    // ── LE BLOC D'ENVIES DE CETTE LANE ────────────────────────────────────
    //
    // `preferences` est déjà « ce dont ils ont envie CETTE fois » — le seul
    // endroit du prompt individuel qui porte une envie datée. Les `craving`
    // retenus y rejoignent ce que la personne vient de taper, DERRIÈRE lui:
    // une phrase écrite il y a dix secondes vaut plus qu'une envie déposée
    // lundi, et la récence est le seul arbitrage qu'on sache défendre ici.
    //
    // `null` quand il n'y a ni l'un ni l'autre: `buildMealPrompt` ne pose
    // alors AUCUNE ligne, et un en-tête d'envie suivi de rien ferait composer
    // le modèle contre une demande imaginaire.
    const preferencesForPrompt = [
      ...(preferences ? [preferences] : []),
      ...retainedCravings.lines,
    ].join(" · ") || null;
    // ── `portion.adjust` · CE QUI EN EST FAIT, ET OÙ ───────────────────────
    //
    // ⛔ RIEN N'EST TRADUIT ICI, ET ÇA NE CHANGE PAS. Écrire « slight = −80 g »
    // à cet endroit fabriquerait, au mauvais endroit, la précision que le socle
    // interdit des deux côtés — et le ferait AVANT le plancher TCA, qui vit
    // dans l'enveloppe. La traduction est et reste dans `applyPortionAdjust`.
    //
    // ⚠️ CE QUI A CHANGÉ (lot 1G): l'ajustement N'EST PLUS SEULEMENT COMPTÉ.
    // La bouche de cette lane est la personne authentifiée, son état d'âge
    // vient de `profiles.birth_date`, et le couple {bouche, items} part à
    // `envelopeFor` ~750 lignes plus bas. Le compteur et le constat d'audience
    // vivent LÀ-BAS (`keel.meal.portion_adjust`), parce que l'état d'âge est
    // chargé après ce point — pas ici. Cette trace-ci ne dit plus que ce
    // qu'elle sait: combien d'ajustements sont sortis du magasin.
    console.log(JSON.stringify({
      tag: "keel.meal.retained_items",
      user_id: userId,
      ...routingTrace({ routed: routedRetained, adjustments: [] }),
      refused: retainedDurable.refused.total,
      legacy_notes: retainedDurable.legacyNotes.length,
      other_subjects: retainedComposition.otherSubjects.length +
        retainedLogistics.otherSubjects.length +
        retainedRhythm.otherSubjects.length +
        retainedCravings.otherSubjects.length,
      // ⛔ `next_plan_channel` A ÉTÉ RETIRÉ ICI, PAS CORRIGÉ (lot 1J). Il valait
      // `householdId ? "household" : "none"` et séparait « aucun canal » de
      // « canal vide ». Le déménagement (§7.2) a supprimé le premier cas: un
      // compte solo possède un canal. Le champ rendait `"none"` à quelqu'un qui
      // en a un — la distinction était exactement INVERSÉE, et elle faisait lire
      // « `craving: 0` est structurel » sur une personne qui n'avait rien
      // demandé. Il n'y a plus qu'un vide, et `craving: 0` le dit déjà.
    }));

    // LES MOMENTS D'UNE JOURNÉE NORMALE POUR CET ÉLÈVE — lus UNE fois, et
    // partagés par le prompt et le parseur.
    //
    // Hissé hors de l'appel exprès: le plafond de plats est dérivé de ce rythme
    // des DEUX côtés (`buildMealPrompt` demande N plats, `parseGeneratedMeal`
    // en accepte N). Tant que le parseur ne le recevait pas, il retombait sur
    // trois et rognait en silence la journée d'un élève qui mange cinq fois.
    //
    // Un rythme illisible rend `[]`, et les deux côtés retombent alors sur les
    // trois repas d'avant — ensemble. Une contrainte qu'on ne sait pas lire ne
    // doit pas produire une journée vide.
    const eatingRhythm = ((): EatingOccasionSlot[] => {
      const declared = parseEatingRhythm(
        (goalRow.practical_constraints as Record<string, unknown> | null)
          ?.eating_rhythm,
      );
      // LOT 1C — `rhythm.set` CORRIGE les six moments. Rien à corriger ⇒ la
      // valeur d'avant ce lot, au slot près: c'est ce qui rend l'ajout additif
      // et non régressif pour toute la base d'aujourd'hui.
      if (
        retainedRhythm.present.length === 0 && retainedRhythm.absent.length === 0
      ) {
        return declared;
      }
      const bySlot = new Map<EatingOccasion, EatingOccasionSlot>();
      for (const entry of declared) bySlot.set(entry.slot, entry);
      for (const occasion of retainedRhythm.absent) bySlot.delete(occasion);
      for (const occasion of retainedRhythm.present) {
        // ⚠️ LA TAILLE DÉJÀ DÉCLARÉE EST CONSERVÉE, et on n'en invente aucune:
        // un `rhythm.set` dit qu'un moment EXISTE, il ne dit rien de sa
        // taille. `size: null` est exactement ce que `parseEatingRhythm` rend
        // d'un moment déclaré sans taille.
        if (!bySlot.has(occasion)) bySlot.set(occasion, { slot: occasion, size: null });
      }
      // L'ORDRE DE LA JOURNÉE, jamais l'ordre d'arrivée — même geste que la
      // fusion des absences plus bas (`EATING_OCCASIONS.filter`).
      return EATING_OCCASIONS.filter((s) => bySlot.has(s)).map((s) => bySlot.get(s)!);
    })();
    // LES MOMENTS OÙ IL NE MANGE PAS ICI. Même `const` hissé que le rythme, et
    // pour la même raison: la valeur passée au prompt et celle passée au
    // parseur doivent être LA MÊME lecture, pas deux relectures à tenir
    // d'accord.
    const declaredAway = parseAwayDays(
      (goalRow.practical_constraints as Record<string, unknown> | null)
        ?.away_days,
    );

    // ── LA JOURNÉE DÉJÀ ENTAMÉE ────────────────────────────────────────────
    //
    // Quand la fenêtre démarre AUJOURD'HUI, les moments déjà passés sortent de
    // la composition. « il est 20 h » ne se dit pas au modèle en prose: on
    // réutilise le SEUL mécanisme qui retire un moment d'une journée
    // (`AwayDay`), celui qui est déjà armé des deux côtés — la consigne ET le
    // parseur. Un second mécanisme divergerait, et c'est celui qu'on regarde le
    // moins qui garderait l'ancien état.
    //
    // ⚠️ POUR LE PREMIER JOUR SEULEMENT. Appliquer la coupure à chaque jour
    // effacerait tous les petits-déjeuners de la semaine.
    //
    // ⚠️ CE N'EST PAS UNE ABSENCE DÉCLARÉE, et les deux ne se fondent pas dans
    // la même liste avant d'avoir été comptées: `plan_rationale` doit pouvoir
    // dire « la journée est déjà entamée » sans jamais dire « tu avais marqué
    // que tu n'étais pas là » à quelqu'un qui n'a rien marqué.
    const slotsDroppedToday = startsOn === todayDate
      ? slotsPassedToday({
        hourNow: localMinuteOfDay === null ? null : Math.floor(localMinuteOfDay / 60),
        rhythm: eatingRhythm.length > 0 ? eatingRhythm : DEFAULT_EATING_RHYTHM,
        declaredHours: rhythmClockFrom(
          (goalRow.practical_constraints as Record<string, unknown> | null)
            ?.eating_rhythm,
        ),
      })
      : [];
    // LA FUSION DES DEUX SOURCES, une seule fois, ici. Le jour d'aujourd'hui
    // porte l'union; les autres jours ne bougent pas. Une entrée `slots: []`
    // (journée entière) l'emporte et n'est pas rouverte.
    const awayDays = slotsDroppedToday.length === 0 ? declaredAway : (() => {
      const row = declaredAway.find((a) => a.day === todayToken);
      if (row && row.slots.length === 0) return declaredAway;
      const merged = new Set<string>([...(row?.slots ?? []), ...slotsDroppedToday]);
      return [
        ...declaredAway.filter((a) => a.day !== todayToken),
        {
          day: todayToken,
          slots: EATING_OCCASIONS.filter((s) => merged.has(s)),
        },
      ];
    })();

    // ── LE PREMIER JOUR EST-IL ENCORE CUISINABLE ? ─────────────────────────
    // Passé la coupure courses, la session que `buildMealPrompt` ajoute
    // d'office (branche `tooLate`) vise le jour SUIVANT. La coupure vit dans
    // `plan_hours.ts`, jamais recopiée ici.
    const firstDayCookable = firstWindowDayIsCookable({
      windowStartsOn: startsOn,
      todayLocalDate: todayDate,
      hourNow: localMinuteOfDay === null ? null : Math.floor(localMinuteOfDay / 60),
    });

    // ── LA FENÊTRE QU'ON PROPOSERAIT, RENDUE À L'ÉCRAN ────────────────────
    //
    // ⚠️ CE N'EST PAS UN REFUS, ET ÇA NE LE DEVIENDRA PAS. La requête qui vient
    // d'arriver est déjà acceptée: quelqu'un qui demande aujourd'hui à 22 h a
    // peut-être ses courses dans le coffre, et il a raison contre cette règle.
    // On rend ce qu'on AURAIT proposé, l'écran le pose comme valeur par défaut
    // du prochain formulaire, et l'humain garde la main.
    const proposed = proposedWindowStart({
      todayLocalDate: todayDate,
      hourNow: localMinuteOfDay === null ? null : Math.floor(localMinuteOfDay / 60),
    });
    const suggestedWindow = {
      starts_on: proposed.startsOn,
      shifted: proposed.shifted,
    };

    // CE QUI A ÉTÉ DEMANDÉ AVANT RÉSOLUTION — sert à dire ce qui a été coupé.
    // `until_sunday` rend `null`: cette forme ne demande pas une durée, elle
    // demande « ce qu'il reste », donc rien n'y est coupé et le dire serait
    // faux.
    const requestedWindowFacts = windowRequest.kind === "days"
      ? { startsOn: todayDate, durationDays: Math.round(windowRequest.count) }
      : windowRequest.kind === "exact"
      ? {
        startsOn: windowRequest.startsOn,
        durationDays: Math.round(windowRequest.durationDays),
      }
      : null;

    // FF-051 · CE QU'IL MANGE DÉJÀ. Troisième `const` hissé de la même
    // colonne, et pour la même raison que les deux au-dessus: cette lecture
    // sert à TROIS endroits — la consigne, le parseur, le verdict — et trois
    // relectures d'un même jsonb sont trois occasions de diverger.
    //
    // `discarded` est LOGUÉ, jamais rendu à l'élève: c'est le compteur qui
    // distingue « il n'a rien déclaré » de « on n'a pas su lire ce qu'il a
    // déclaré », et il n'a de sens que pour qui peut corriger la forme.
    const fixedIntakeParse = parseFixedIntakes(
      (goalRow.practical_constraints as Record<string, unknown> | null)
        ?.fixed_intakes,
    );
    const fixedIntakes = fixedIntakeParse.intakes;
    if (fixedIntakeParse.discarded > 0) {
      console.log(
        `[keel/meal] fixed_intakes: ${fixedIntakeParse.discarded} malformed entries discarded`,
      );
    }

    // FF-052 · CE QUE CERTAINS JOURS SONT. Même `const` hissé, même raison:
    // la consigne les annonce, le parseur les tient, et deux relectures du même
    // jsonb sont deux occasions de diverger.
    const dayProperties = parseDayProperties(
      (goalRow.practical_constraints as Record<string, unknown> | null)
        ?.day_properties,
    );

    // LUE UNE FOIS, servie deux fois: le prompt ANNONCE le plafond de temps,
    // le parseur le VÉRIFIE. Deux lectures du même jsonb finiraient par
    // diverger, et la divergence se paierait sur le seul contrôle qui dit à
    // l'élève que sa session ne tient pas.
    const capacity = readCookingCapacity(
      goalRow.practical_constraints as Record<string, unknown> | null,
    );

    // ── FF-030 · LE PLANCHER TCA, PUIS LE CORPS ───────────────────────────
    //
    // L'ORDRE COMPTE: on ne construit pas un contexte de corps avant de savoir
    // si on a le droit d'en envoyer les chiffres. `MealBodyContext` exige
    // `restrictionFlag`, donc l'inversion ne compile pas — c'est la moitié
    // « type » de la garde décrite dans `meal_body.ts`.
    //
    // FAIL-CLOSED, et c'est l'inverse de l'arbitrage de
    // `meal-photo-upload-v1`, exprès. Là-bas, se fermer ferait taire un accusé
    // de réception pour un élève qui va bien; ici, se fermer rend EXACTEMENT le
    // produit d'hier — une portion dimensionnée sans le corps — pendant que
    // s'ouvrir met un poids sous les yeux du modèle pour un élève qu'on n'a pas
    // su évaluer. Les deux coûts ne sont pas du même ordre (FF-030 R6).
    let restrictionFlag = true;
    try {
      const floor = await evaluateRestrictionForStudent(admin as never, {
        userId,
        asOfLocalDate: todayDate,
      });
      restrictionFlag = floor.restriction_flag === true;
    } catch (error) {
      console.warn(JSON.stringify({
        tag: "keel.meal.restriction_floor_unreadable",
        user_id: userId,
        error: readableErrorMessage(error),
        // Journalisé nommément: sans cette ligne, un plancher qui échoue en
        // boucle est indiscernable d'un élève qui n'a jamais saisi de mesure —
        // les deux produisent une consigne sans corps.
        effect: "fail-closed: ni taille ni poids dans la consigne",
      }));
    }

    // ── LES INTERDITS DU COACH, DANS LA FORME DU MATCHER ─────────────────
    // Miroir exact de `findDoctrineViolations` (`doctrine.ts:1088-1099`), qui
    // n'exporte pas cette projection.
    //
    // ⚠️ HISSÉ ICI PAR LE SEAM DU BROUILLON. Il vivait 600 lignes plus bas,
    // avec FF-061, c'est-à-dire APRÈS l'appel modèle. La garde d'entrée de la
    // phrase de reprise en a besoin AVANT, et une seconde projection écrite
    // là-haut aurait fait une TROISIÈME copie de la même liste — exactement ce
    // que l'en-tête de `forbidden_matcher.ts` décrit comme le défaut qui finit
    // par contredire un coach en public. Un seul `const`, deux lecteurs.
    const doctrineForbidden: ForbiddenTerm[] = (doctrine.doctrine?.forbidden ?? [])
      .map((f) => ({
        ruleId: String(f.token ?? "").trim(),
        token: String(f.token ?? "").trim(),
        surfaceForms: f.surfaceForms,
      }))
      .filter((t) => t.token.length > 0);

    // ── LA PHRASE ÉCRITE SUR UN BROUILLON (§4.3.2) ───────────────────────
    //
    // Elle ne remplace RIEN: elle s'ajoute en queue du message, par le MÊME
    // point de composition que la relance de correction (FF-040). Les blocs
    // corps / objectif / doctrine / allergies / budget / rythme / présence sont
    // donc byte-identiques à ceux du tour 1 — c'est ce qui fait que « je veux
    // des pizzas tous les midis » SE HEURTE à l'objectif au lieu de le
    // remplacer, et un test pur l'épingle (`plan_draft_note_test.ts`).
    //
    // ⚠️ AVANT TOUT APPEL MODÈLE. Un refus qui se paierait 200 s de composition
    // est un refus qui coûte un dîner pour rien (même leçon que
    // `replaces_required`, plus haut).
    let draftNoteSuffix = "";
    // ── LOT 2D · LE VERDICT SURVIT À CE BLOC, ET LUI SEUL ──────────────────
    // Il est relu ~1300 lignes plus bas, APRÈS l'écriture du plan, pour ranger
    // ce que la personne a demandé (`classifyAndPersistDraftNote`).
    //
    // ⛔ C'EST LE VERDICT QU'ON GARDE, PAS `body.draft_note` NI `note.usable`.
    // Le classifieur exige un `DraftNoteVerdict` — seul `readDraftNote` en
    // produit — parce que sa charge repart au modèle: une `string` rouvrirait
    // la garde d'entrée dans un second appel. Le type ferme la porte, et
    // remplacer cette variable par une chaîne ne compilerait pas.
    let draftNoteVerdict: DraftNoteVerdict | null = null;
    if (hasDraftNote(body.draft_note)) {
      const note = readDraftNote({
        raw: body.draft_note,
        doctrineForbidden,
        // REQUIS des deux côtés: `false` dit « cette personne n'est pas
        // protégée », et c'est une affirmation. Le module JETTE s'il manque.
        restrictionFlag,
      });
      console.log(JSON.stringify({
        tag: "keel.meal.draft_note",
        user_id: userId,
        intent,
        refusal: note.refusal,
        // Les motifs des clauses tombées. Ils se COMPTENT, ils ne se disent
        // jamais: une phrase de refus par motif dirait qui est sous plancher.
        dropped: note.dropped,
      }));
      // `usable === null` est testé AVEC le refus, et pas rattrapé par un `??
      // ""`: un repli silencieux composerait une consigne de reprise à puce
      // vide, c'est-à-dire une phrase que personne n'a écrite, présentée au
      // modèle comme la demande de l'élève.
      if (note.refusal !== null || note.usable === null) {
        // ⚠️ LITTÉRAL, JAMAIS UN TERNAIRE. `planRefusals.int.test.ts` scanne ce
        // fichier à la recherche de `jsonResponse(req, { error: "…" })` avec une
        // chaîne littérale: un jeton calculé y devient invisible, et le mot
        // correspondant disparaît de l'écran sans qu'aucun test ne rougisse
        // (mesuré par Lot A sur `empty_meal`).
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

    // LE CORPS. Best-effort, contrairement au plancher: une portion moins bien
    // dimensionnée est le produit d'hier, et refuser le dîner de quelqu'un
    // parce qu'on n'a pas su lire sa balance serait la mauvaise moitié de
    // l'arbitrage. `loadStudentBody` ne rattrape RIEN de son côté (son en-tête
    // le dit), donc l'arbitrage se prend ici, en le nommant.
    // `studentBody` et pas `body`: dans cette fonction, `body` est déjà le
    // corps de la REQUÊTE HTTP.
    let studentBody: MealBodyContext | null = null;
    // ⚠️ À CÔTÉ DE `studentBody`, PAS DEDANS. `MealBodyContext` porte des
    // MESURES du corps (série de pesées datées, bande d'âge); le niveau
    // d'activité est une déclaration sur la vie, pas une mesure — et la lane
    // foyer, qui n'a pas de `MealBodyContext`, doit pouvoir le passer quand
    // même. Voir le paramètre séparé d'`envelopeFor`.
    let studentActivityLevel: ActivityLevel | null = null;
    /**
     * ── LOT 1G · L'ÉTAT D'ÂGE DU TITULAIRE — LA MÊME SOURCE QUE `ageBand` ───
     *
     * Il vient de `snapshot.verdict`, c'est-à-dire de `profiles.birth_date` via
     * `assessBirthDate`: EXACTEMENT le verdict d'où cette lane tire déjà sa
     * bande d'âge (`mealBodyContextFrom` → `ageBandOf(usableAge(verdict))`).
     * Ce n'est donc pas une source nouvelle, c'est la même lue avec la
     * projection canonique du dépôt.
     *
     * ⚠️ `"unknown"` EN VALEUR INITIALE, ET C'EST LA DIRECTION SÛRE. Un corps
     * illisible (le `catch` ci-dessous) ne doit pas rendre un ajustement à la
     * baisse applicable: « on n'a pas su lire » et « c'est un adulte » sont
     * précisément les deux choses que ce dépôt a retiré son booléen pour ne
     * plus confondre.
     */
    let studentAgeState: MemberAgeState = "unknown";
    try {
      const snapshot = await loadStudentBody(admin, userId, todayDate);
      studentActivityLevel = snapshot.activityLevel;
      studentAgeState = ageStateFromVerdict(snapshot.verdict);
      studentBody = mealBodyContextFrom(snapshot, restrictionFlag);
    } catch (error) {
      console.warn(JSON.stringify({
        tag: "keel.meal.student_body_unreadable",
        user_id: userId,
        error: readableErrorMessage(error),
        effect: "composition sans corps (comportement d'avant FF-030)",
      }));
    }

    // ── FF-027 · LE SIGNAL DE FAIM DE LA FENÊTRE ──────────────────────────
    //
    // Le tap du soir « Rough → Hunger » et la faim déclarée en conversation
    // font UN signal. Décompte DÉRIVÉ à la lecture, sur une fenêtre glissante:
    // aucun compteur n'est entretenu, aucun trait n'est écrit (R4).
    //
    // Best-effort: un hoquet de lecture compose le repas sans le bloc, donc
    // exactement comme avant cette fiche. Priver quelqu'un de son dîner parce
    // qu'on n'a pas su lire sa faim serait la mauvaise moitié de l'arbitrage.
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
    // ⚠️ GREFFÉ EN SUFFIXE, ET PAS EN PARAMÈTRE NOMMÉ DE `buildMealPrompt`.
    // Même mécanique que `buildHouseholdPromptBlocks().userSuffix`, qui existe
    // déjà pour la même raison. Le suffixe est `""` sans signal: l'appelant n'a
    // aucune condition à écrire, donc aucune condition à se tromper.
    const hungerSuffix = satietyUserSuffix(hungerSignal);
    if (hungerSuffix) {
      console.log(JSON.stringify({
        tag: "keel.meal.satiety_priority",
        user_id: userId,
        // Journalisé ici, JAMAIS dans le prompt: ce qui entre dans un prompt
        // finit par sortir dans un texte (fiche §9).
        hunger_days: hungerSignal.days,
        window: [hungerSignal.windowStart, hungerSignal.windowEnd],
      }));
    }

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
      // ── LES APPORTS DÉCLARÉS ENTRENT DANS L'INDEX, PAS DANS LE CALCUL ──
      //
      // Mesuré le 2026-08-13: le référentiel n'a AUCUNE protéine en poudre
      // (911 références, 2508 alias). Un shaker déclaré en `foodRef` seul ne
      // se résout donc contre rien, et sa protéine — la raison pour laquelle
      // on le déclare — sort du verdict sans un mot.
      //
      // On synthétise une entrée par apport déclaré, ancrée sur le poids de
      // portion lu sur le pot. Tout le reste de la chaîne
      // (`resolveIngredients`, `verdictFor`) ne connaît pas ce cas et n'a pas
      // à le connaître: elle voit une référence ordinaire.
      composition = augmentedIndexFor(composition, fixedIntakes);
    } catch (error) {
      console.warn(`[${FN_NAME}] composition index unavailable`, error);
    }

    const built = buildMealPrompt({
      // ── FF-030 · LES CONTRAINTES DURES ENTRENT DANS LA CONSIGNE ────────
      // Elles étaient chargées vingt lignes plus haut et ne partaient QU'au
      // parseur — c'est-à-dire au verrou de sortie. Le modèle composait à
      // l'aveugle, et le verrou est binaire: un seul plat qui touche
      // l'allergène vidait la semaine entière (`empty_meal`, 422).
      //
      // Le même tableau part maintenant aux DEUX endroits, et c'est bien le
      // double verrou du §3.3 du pivot: la consigne informe, la ceinture
      // garantit. `null` (lecture en panne) reste `null` des deux côtés.
      safetyConstraints: constraints,
      // ── FF-042 · LE RÉGIME ENTRE DANS LA CONSIGNE ──────────────────────
      // La MOITIÉ AMONT du double verrou, et elle manquait entièrement sur
      // cette lane: `dietary_regime.ts` était importé ici pour son seul
      // drapeau de carence. On déclarait donc à un végane qu'il manquerait de
      // B12, dans un plan qui lui servait du poulet.
      //
      // La phrase vient de `dietaryRegimePromptLine`, JAMAIS d'une phrase
      // écrite ici — même règle qu'au call site du foyer. Une seconde
      // formulation divergerait de la première le jour où un quatrième régime
      // arrive, et c'est la lane la moins relue qui garderait l'ancienne.
      dietBlock: declaredRegime ? dietaryRegimePromptLine(declaredRegime) : "",
      body: studentBody,
      // L'AXE. La lecture est défensive contre la liste FERMÉE plutôt que
      // recopiée: le CHECK SQL tient la base, mais une valeur écrite avant lui
      // partirait telle quelle dans la consigne, et `WEEKLY_AXIS_LABELS_EN`
      // rendrait `undefined` sur elle.
      focusAxis: (WEEKLY_AXES as readonly string[]).includes(
          String(goalRow.focus_axis ?? "").trim(),
        )
        ? (String(goalRow.focus_axis).trim() as WeeklyAxis)
        : null,
      doctrineBlock: doctrineBlockFor(doctrine),
      coachNoteBlock: coachNotePromptBlock(coachNote),
      protocolBlock,
      beliefKeys,
      goal: String(goalRow.goal ?? "health"),
      situation: goalRow.situation ? String(goalRow.situation) : null,
      context,
      // L'ENVIE DU MOMENT, distincte des goûts durables lus plus bas dans
      // `foodPreferences`: l'une a été tapée il y a dix secondes, les autres
      // viennent de la conversation et valent pour toutes ses semaines.
      //
      // LOT 1C — la ligne porte aussi les `craving` retenus, hissée plus haut
      // pour n'être calculée qu'une fois.
      preferences: preferencesForPrompt,
      mode,
      scope,
      slot,
      servings,
      pantry,
      todayToken,
      // LA DATE ET LE PAYS — de quoi savoir ce qui est de saison là où l'élève
      // fait ses courses. Nuls quand on n'a pas su les résoudre: le bloc le dit
      // au modèle plutôt que de laisser croire à une localisation qu'on n'a pas.
      today: todayDate,
      country,
      daysToFill,
      eatingRhythm,
      awayDays,
      // FF-051 — CE QU'IL MANGE DÉJÀ, en négatif explicite juste après les
      // moments où il n'est pas là. Les deux façons dont une case de la grille
      // peut être prise avant que le modèle n'y touche.
      fixedIntakes,
      // FF-052 — le pendant POSITIF de l'absence: batch le dimanche, restes le
      // lundi. Deux propriétés, chacune avec sa branche.
      dayProperties,
      // CE QUE L'ÉLÈVE PEUT VRAIMENT FAIRE. Quatre entrées qui décidaient de
      // tout et que le moteur devinait: le jour de cuisine, le temps, le niveau
      // de recette, le budget. `cooking_time_min` et `budget_band` existaient
      // dans cette colonne depuis le premier jour du pivot, lues ici, remplies
      // par personne — jusqu'à `CookingCapacityCard`.
      //
      // Chacune est OPTIONNELLE et absente par défaut: un élève qui n'a rien
      // rempli reçoit exactement la semaine d'hier. C'est ce qui rend l'ajout
      // additif plutôt que régressif.
      ...capacity,
      // CE QUE L'ÉLÈVE A CONFIRMÉ sur sa bouffe, promu depuis la conversation.
      // Passé NOMMÉMENT parce que ce générateur lit des clés nommées: une clé
      // de plus dans le jsonb y serait invisible (contrairement au plan hebdo,
      // qui sérialise tout).
      //
      // LOT 1C — la lecture porte désormais LES DEUX MAGASINS: les phrases
      // plates de la colonne, et les `food.*` / `method.*` retenus. Voir
      // `readFoodPreferences` pour l'ordre et pour le motif.
      foodPreferences: readFoodPreferences(
        goalRow.practical_constraints as Record<string, unknown> | null,
        retainedComposition,
      ).remembered,
      // CE QU'IL A TAPÉ LUI-MÊME. Séparé, parce que le rang est la moitié du
      // message: une consigne écrite ne s'arbitre pas comme un goût confirmé
      // d'un bouton. Voir le bloc `-- WHAT THEY HAVE TOLD ME --`.
      //
      // LOT 1C — même lecture, même ordre: ce que la personne a tapé DANS SA
      // CARTE (`source: "written"`) est une consigne, exactement comme les
      // lignes tapées dans l'ancien champ.
      writtenInstructions: readFoodPreferences(
        goalRow.practical_constraints as Record<string, unknown> | null,
        retainedComposition,
      ).written,
      // ── L4/D6 · IL N'Y A PERSONNE À REPRENDRE SUR CETTE LANE ────────────
      // `null`, et ce n'est pas un remplissage de signature. La fusion est une
      // opération du FOYER: elle exige une table qui a dimensionné une
      // casserole, et un plan personnel à reprendre dedans. Ici il y a UNE
      // bouche, et son plan EST celui qu'on compose.
      //
      // CE QUE `null` GARANTIT, ET C'EST LA MOITIÉ QUI COMPTE: le plafond de
      // plats reste `créneaux × jours` au plat près, et une préparation d'UNE
      // portion reste jetée. Cette lane ne bouge pas — c'est le paramètre
      // REQUIS qui l'a fait dire, plutôt que de la laisser hériter en silence
      // d'un budget pensé pour une table.
      merge: null,
      // ── PEUT-ON ENCORE ACHETER PUIS CUISINER AUJOURD'HUI ? ─────────────
      // `true` hors de la fenêtre du jour, et `true` aussi quand l'horloge n'a
      // pas été lue — le comportement d'hier, DIT plutôt qu'hérité.
      firstDayCookable,
      // ── LA LANGUE DE CES PLATS ────────────────────────────────────────
      //
      // ⚠️ PAS `goalRow.content_locale`. Cette colonne-là dit dans quelle
      // langue l'élève a écrit SA SITUATION (R3, troisième axe), et tous ses
      // écrivains la sèment `'en-GB'`. `profiles.locale` est la langue qu'il a
      // CHOISIE, et celle que l'agent lui parle — un plan de repas dans une
      // autre langue que la conversation est le défaut le plus visible que ce
      // chantier pouvait produire.
      contentLocale: resolveArtifactLocale({
        studentProfile: profileLocale,
        // Attend sa source (`coaches.default_student_locale`, inexistante).
        tenantDefault: null,
      }),
    });

    // ── LE MESSAGE ENVOYÉ AU MODÈLE, COMPOSÉ À UN SEUL ENDROIT ───────────
    //
    // ⚠️ LE BLOC DE LANGUE DOIT ÊTRE LA DERNIÈRE CHOSE DU MESSAGE, et cette
    // fonction existe parce que DEUX choses se collent après lui: le bloc
    // satiété (`hungerSuffix`) et, sur les deux chemins de RÉPARATION,
    // l'instruction de reprise. Composé à la main sur chaque site, le bloc se
    // retrouvait en avant-dernière position sur les réparations — c'est-à-dire
    // que la relance qui répare une ancre protéique ou une composition
    // repartait sans consigne de langue en queue, et pouvait rendre un plat
    // anglais au milieu d'une semaine française. Trois appels, trois occasions
    // de l'oublier; ici il y en a une.
    //
    // `appendContentLanguageBlock` est idempotent, donc le remettre déplace le
    // bloc en queue sans jamais l'empiler.
    //
    // ── OÙ SE PLACE LA PHRASE DE REPRISE, ET POURQUOI PAS EN DERNIER ──────
    // AVANT le bloc satiété, jamais après. Un modèle lit la contrainte la plus
    // proche de la fin comme la plus contraignante — c'est la raison d'être de
    // l'ordre actuel — et la note est une DEMANDE, pas une règle: la mettre en
    // queue la ferait gagner contre les gardes de composition, c'est-à-dire
    // exactement ce que « le commentaire ne remplace jamais le reste » interdit.
    //
    // Elle est DANS le tronc et pas dans `extra`: une relance de correction qui
    // perdrait la phrase rendrait un plan qui ignore ce que la personne vient
    // d'écrire, et c'est la relance qui aurait le dernier mot.
    const mealUserMessage = (extra: string): string =>
      appendContentLanguageBlock(
        `${built.userMessage}${draftNoteSuffix}${hungerSuffix}${extra}`,
        built.contentLocale,
        MEAL_TRANSLATABLE_FIELDS,
        MEAL_TOKEN_FIELDS,
      );

    const result = await generateWithGemini(
      // FF-027 — le bloc satiété EN QUEUE du message, donc au plus près de la
      // demande: un modèle lit la contrainte la plus proche de la fin comme la
      // plus contraignante (la raison est écrite dans
      // `household_meal_generation.ts`, qui applique la même règle à ses
      // règles de maison).
      built.systemPrompt,
      mealUserMessage(""),
      0.6, true, [], "auto",
      // LE MODÈLE DE COMPOSITION, pas celui du chat. Voir `generation_model.ts`:
      // cette fonction tient des dizaines de contraintes simultanées, dont des
      // négatives, et c'est le seul endroit où la capacité du modèle se paie en
      // assiettes fausses. `KEEL_GENERATION_MODEL` est la soupape de retour
      // arrière — nécessaire parce que ce chemin n'a PAS de repli automatique.
      { source: FN_NAME, requestId, userId, model: keelGenerationModel() },
    );
    if (typeof result !== "string") {
      return jsonResponse(req, { error: "model_returned_tool_call", request_id: requestId }, { status: 502 });
    }

    // Hissés en `const`: la relance FF-037 doit repasser par EXACTEMENT les
    // mêmes verrous et les mêmes plafonds que le premier passage. Deux objets
    // d'arguments écrits à la main divergeraient au premier paramètre ajouté,
    // et la sortie de relance serait vérifiée moins fort que celle qu'elle
    // remplace — c'est-à-dire une porte de sortie pour tout ce que le premier
    // passage refuse.
    const parseArgs = {
      doctrine: doctrine.doctrine,
      safetyConstraints: constraints,
      mode,
      scope,
      pantry,
      beliefKeys,
      // LA MÊME VALEUR que celle passée au prompt, et c'est tout l'objet du
      // `const` hissé au-dessus: relire `practical_constraints` ici rendrait
      // deux rythmes à tenir d'accord au lieu d'un seul à lire.
      eatingRhythm,
      // MÊME RAISON: le plafond du parseur doit être celui du prompt, et il
      // dérive du nombre de jours réellement demandés.
      daysToFill,
      // ET LA MÊME ENCORE pour les absences: la consigne les interdit, le
      // parseur les rejette. Une contrainte qui ne vit que dans le prompt
      // n'est pas une garantie.
      awayDays,
      // ET LA MÊME ENCORE pour les apports fixes: la consigne dit « ne compose
      // rien là », le parseur drop le plat s'il arrive quand même.
      fixedIntakes,
      // ET LES MÊMES propriétés de jour: la consigne dit « rien de neuf ce
      // jour-là », le parseur retire le plat neuf s'il arrive quand même.
      dayProperties,
      // Le temps par session est un PLAFOND. Le prompt l'annonce, le parseur
      // le vérifie: mesuré 30 déclarées contre 55 produites.
      cookingTimeMin: capacity.cookingTimeMin,
      // FF-038 — LE RÉFÉRENTIEL DE COMPOSITION.
      // Chargé plus haut dans un try/catch: `null` quand la lecture a
      // échoué. L'instrumentation ne doit jamais coûter un dîner, et le
      // parseur compte l'indisponibilité nommément plutôt que de la
      // laisser ressembler à un modèle qui n'écrit pas ses quantités.
      composition,
      // L4/D6 — LA MÊME VALEUR QUE LA CONSIGNE, et pour la raison écrite
      // là-haut: `null` des deux côtés, donc plafond inchangé et garde de
      // préparation entière. Les deux bouts, comme tout le reste de cet objet.
      merge: null,
      // ── LOT 4 · AUCUNE BOÎTE ATTRIBUABLE SUR CETTE LANE ───────────────────
      //
      // ⚠️ `[]` EST UNE AFFIRMATION, PAS UN OUBLI, et c'est LES DEUX BOUTS comme
      // le reste de cet objet: le prompt de cette lane ne porte AUCUN id de
      // bouche — `boxSchemaBlock` et `boxingOrderLines` vivent dans l'enveloppe
      // foyer et n'y sont jamais assemblés — donc le modèle n'a rien à écrire, et
      // le parseur n'a rien à valider. Exactement la posture de `memberId`, qui
      // est toujours `null` ici pour la même raison.
      //
      // Une personne seule a bien des boîtes dans sa vraie cuisine; ce qu'elle
      // n'a pas, c'est deux bouches à départager — et le protocole des boîtes
      // n'existe que pour ça. Lui servir un bloc qui nomme des bouches lui
      // apprendrait qu'un marquage par personne existe et l'inviterait à en
      // inventer un (raisonnement `dishOwnerSchemaBlock`), sur une lane où le
      // champ n'apporte rien.
      boxMemberIds: [],
    } as const;

    let meal: GeneratedMeal;
    try {
      meal = parseGeneratedMeal(result, parseArgs);
    } catch (error) {
      return jsonResponse(req, {
        error: "meal_unparseable",
        detail: readableErrorMessage(error),
        request_id: requestId,
      }, { status: 502 });
    }

    // ── FF-037 · UNE SEULE RELANCE POUR L'ANCRE PROTÉIQUE ─────────────────
    // Patron `doctrineRetryInstruction`: la relance NOMME ce qui a manqué. Une
    // relance aveugle rejoue le même dé — c'est écrit sur
    // `assertNoDoctrineViolation` et c'est mesuré.
    //
    // UNE SEULE, et la borne est un arbitrage écrit (FF-037 R7): la deuxième
    // coûte une génération complète pour un gain non mesuré, et le plan sort de
    // toute façon avec ses issues.
    //
    // LA RELANCE NE PEUT PAS COÛTER LE PLAN. Elle n'est adoptée que si elle
    // parse, rend au moins autant de plats, et laisse STRICTEMENT moins de
    // repas sans ancre. Tout le reste — modèle en erreur, sortie illisible,
    // plan appauvri — garde silencieusement la première sortie: un élève ne
    // perd pas son dîner parce qu'une amélioration a raté.
    let proteinAnchorRetry = false;
    // Capturé AVANT la relance: `meal` est réassigné quand elle est adoptée, et
    // journaliser `meal.protein_anchor_missing.length` après coup rendrait le
    // chiffre d'APRÈS sous le nom de celui d'AVANT — un compteur qui ment est
    // pire qu'un compteur absent, et celui-ci arme la mesure du §10.
    const anchorMissingBefore = meal.protein_anchor_missing.length;
    if (anchorMissingBefore > 0) {
      const retryInstruction = proteinAnchorRetryInstruction(meal.protein_anchor_missing);
      try {
        const retryResult = await generateWithGemini(
          built.systemPrompt,
          mealUserMessage(`\n\n${retryInstruction}`),
          0.6,
          true,
          [],
          "auto",
          { source: `${FN_NAME}.protein_anchor_retry`, requestId, userId, model: keelGenerationModel() },
        );
        if (typeof retryResult === "string") {
          const retried = parseGeneratedMeal(retryResult, parseArgs);
          if (
            retried.dishes.length >= meal.dishes.length &&
            retried.protein_anchor_missing.length < anchorMissingBefore
          ) {
            meal = retried;
            proteinAnchorRetry = true;
          }
        }
      } catch (error) {
        // Journalisé, jamais remonté: la relance est une amélioration, pas une
        // dépendance. Sans le nom, une relance qui échoue en boucle
        // ressemblerait à des plans que le modèle compose mal.
        console.warn(`[${FN_NAME}] protein anchor retry failed`, error);
      }
      console.log(JSON.stringify({
        tag: "keel.meal.protein_anchor",
        user_id: userId,
        missing_before: anchorMissingBefore,
        missing_after: meal.protein_anchor_missing.length,
        retried: proteinAnchorRetry,
      }));
    }

    // ── FF-039 + FF-040 · MESURER, PUIS CORRIGER UNE FOIS ─────────────────
    // L'enveloppe et le verdict remontent AVANT l'écriture du plan: en
    // observation (FF-039) ils n'avaient pas besoin d'être là, mais une boucle
    // de correction qui tournerait après l'écriture corrigerait un plan déjà
    // servi. C'est le seul changement d'ordre du lot.
    const goalToken: GoalToken =
      (GOAL_TOKENS as readonly string[]).includes(String(goalRow.goal ?? ""))
        ? (String(goalRow.goal) as GoalToken)
        // ── LE REPLI DU 2026-08-18 ────────────────────────────────────────
        // Valait `"health"`, qui n'existe plus. `maintenance` est la valeur
        // sur laquelle `health` se replie, et c'est aussi la seule lecture
        // sûre d'un jeton illisible: elle ne creuse aucun déficit et n'ouvre
        // aucun surplus. Un repli sur `fat_loss` ferait exécuter une
        // restriction à quelqu'un dont on n'a pas su lire l'objectif.
        : "maintenance";
    // FAIL-CLOSED: une lecture du plancher en panne a déjà rendu
    // `restrictionFlag = true` en amont (FF-030 R6), et `studentBody` absent
    // dégrade de toute façon par la MÊME branche de `envelopeFor`.
    // ── FF-042 R6 · CE QUE LE RÉGIME REND INCOUVRABLE ─────────────────────
    // `declaredRegime` est HISSÉ au chargement des contraintes, et c'est ce
    // déplacement qui a branché la consigne: ici, le prompt est déjà parti.
    const uncoverableForStudent = declaredRegime
      ? uncoverableSentinelsFor(declaredRegime)
      : [];

    // FF-041 — LE PILOTAGE DU COACH, s'il en a publié un. `null` = personne ne
    // pilote, ce qui est l'état de toute la base aujourd'hui et doit rendre
    // exactement le produit d'avant.
    const steering = steeringFor(
      doctrine.doctrine?.compositionSteering ?? [],
      goalToken,
    );
    /**
     * ── LOT 1G · LA BOUCHE DE CETTE LANE — L'ARBITRAGE, ÉCRIT ICI ──────────
     *
     * ⚠️ CE QUI A ÉTÉ TRANCHÉ, ET CONTRE QUOI. Le lot 1C avait laissé ce
     * paramètre à `null` avec ce motif: « cette lane N'A PAS DE ROSTER ». Le
     * motif était vrai au sens littéral — aucune LISTE de bouches n'est
     * chargée — et faux au sens qui compte: cette lane a UNE bouche, la
     * personne authentifiée, et son état d'âge est CONNAISSABLE.
     *
     * Il vient de `snapshot.verdict` (`profiles.birth_date` →
     * `assessBirthDate`), lu 450 lignes plus haut, et projeté par
     * `ageStateFromVerdict` — la même fonction que la lane foyer, dont le
     * rond-trip avec `mouthAgeVerdict` est déjà testé. Ce n'est donc PAS une
     * bouche fabriquée: c'est la même source d'âge que `ageBand` juste
     * au-dessus, lue avec la projection canonique du dépôt.
     *
     * L'écran « about you » (`/app/plan`) demande cette date depuis toujours et
     * l'écrit dans `profiles.birth_date` (migration 20260812180000) — la garde
     * a donc un CAS QUI PASSE, et ce n'est pas une ceinture armée sur un coffre
     * vide.
     *
     * ── L'OPTION ÉCARTÉE, ET POURQUOI ─────────────────────────────────────
     * Passer `ageState: "adult"` par défaut « pour que le cas marche ». C'est
     * le booléen que ce dépôt a retiré exprès, remis à l'endroit le plus cher:
     * « je ne sais pas » et « majeur » doivent produire des résultats OPPOSÉS,
     * et un compte de mineur atteint CETTE lane (contrairement à
     * `generate-week-plan-v1`, qui rend `409 minor_student`). Un défaut
     * `adult` retirerait donc de la nourriture à un enfant, en silence.
     *
     * ── LE PRIX ASSUMÉ, ET IL EST RÉEL ────────────────────────────────────
     * Sans date de naissance au dossier, l'état vaut `unknown`, et le socle
     * exclut `unknown` d'un ajustement À LA BAISSE sans sujet explicite
     * (contrat §3). Une personne seule qui n'a jamais rempli « about you » ne
     * peut donc pas réduire sa propre part. Ce n'est PAS silencieux: le log
     * `keel.meal.portion_adjust` ci-dessous rend l'exclusion et son motif
     * (`age_unknown`), bouche par bouche. À la HAUSSE, le socle n'exclut
     * personne — cette moitié-là marche pour tout le monde, tout de suite.
     *
     * ── `memberId: userId`, ET CE QUE ÇA LAISSE OUVERT ────────────────────
     * Cette lane ne résout pas de `household_members.id` (elle ne lit que
     * `household_id`, plus haut). Un item dont le `subject` est
     * `member:<member_id>` revient donc `not_in_household` et n'est appliqué à
     * PERSONNE — la direction sûre du socle, jamais un repli sur « tout le
     * monde ». TROU NOMMÉ: un ajustement que la personne s'est attribué
     * nommément depuis sa fiche de foyer n'atteint pas son plan individuel; il
     * atteint son plan de foyer. Le fermer demande une résolution
     * `user_id → member_id` sur cette lane, qui n'est pas de ce lot.
     */
    const studentPortionAdjust: PortionAdjustFor = {
      mouth: { memberId: userId, ageState: studentAgeState },
      items: routedRetained.portion,
    };
    // ⚠️ LE CONSTAT SORT AVEC L'EFFET, ET C'EST LA NOMENCLATURE QUI L'EXIGE:
    // « le mineur est simplement exclu de l'ajustement; rien n'échoue, ET LE
    // CONSTAT LE DIT ». Sans ces trois nombres, un lot désarmé ressemblerait
    // trait pour trait à un lot qui marche.
    const studentPortionAudience = portionAdjustsFor(
      routedRetained.portion,
      [studentPortionAdjust.mouth],
    );
    console.log(JSON.stringify({
      tag: "keel.meal.portion_adjust",
      user_id: userId,
      age_state: studentAgeState,
      retained: routedRetained.portion.length,
      // 0 ou 1: le gagnant, quand il y en a un. `winningPortionAdjust` est LE
      // même arbitre que celui qu'`envelopeFor` applique une ligne plus bas —
      // on ne recompte pas à la main ce que le module décide.
      applied: winningPortionAdjust(studentPortionAdjust) === null ? 0 : 1,
      ...routingTrace({
        routed: routedRetained,
        adjustments: studentPortionAudience,
      }),
    }));
    const envelope = envelopeFor(
      goalToken,
      studentBody,
      studentBody?.ageBand ?? null,
      studentBody?.restrictionFlag ?? true,
      steering,
      studentActivityLevel,
      // ── `portion.adjust` · BRANCHÉ (lot 1G) ──────────────────────────────
      // ⛔ L'AUDIENCE N'EST PAS CALCULÉE ICI, et elle ne l'est nulle part dans
      // ce fichier: `winningPortionAdjust` appelle `subjectsForPortionAdjust`
      // avec le roster réduit à cette bouche. La règle du §2 axe 3 mord donc
      // là où elle est écrite, une seule fois.
      studentPortionAdjust,
    );
    /**
     * ── LE PLAT, PRÉPARATIONS COMPRISES ────────────────────────────────────
     *
     * ⚠️ NE PAS REVENIR À `m.dishes` SEUL. C'était le défaut, et il coûtait la
     * moitié du plan.
     *
     * En batch cooking, les ingrédients ne sont PAS dans le plat: le plat dit
     * « une portion du poulet rôti de mercredi », et le kilo de cuisses vit
     * dans `m.preparations`. Mapper les seuls `d.ingredients` rendait donc au
     * verdict une assiette amputée de tout ce qui avait été cuisiné d'avance —
     * c'est-à-dire, très exactement, de la protéine.
     *
     * MESURÉ le 2026-08-12 sur 80 générations réelles:
     *
     *     énergie invisible au verdict : 41 %  (médiane par plan: 39 %, max 93 %)
     *     protéine invisible au verdict: 51 %
     *
     * Le verdict rendait donc `below` / `under` sur des plans à 99 % de leur
     * cible, et la boucle de correction dépensait son unique relance à ajouter
     * de la protéine à un plan qui touchait déjà son plancher. C'est la cause
     * qu'on a longtemps lue comme « les plans servent une fraction de leur
     * enveloppe ».
     *
     * ── LE PRORATA EST OBLIGATOIRE ────────────────────────────────────────
     * Une préparation fait `servingsMade` portions; un plat n'en consomme que
     * `servings`. Compter le lot entier à chaque plat qui y touche ferait
     * l'erreur inverse, et plus grosse: quatre dîners tirés d'un lot de quatre
     * porteraient quatre kilos de poulet.
     */
    const verdictDishesOf = (m: GeneratedMeal) =>
      foldPreparationsIntoDishes({
        dishes: m.dishes.map((d) => ({
          slot: d.slot,
          method: d.method,
          ingredients: d.ingredients.map((i) => ({
            term: i.term,
            amount: i.amount,
            unit: i.unit,
            state: i.state,
          })),
          uses: d.uses,
        })),
        preparations: m.preparations.map((p) => ({
          id: p.id,
          servingsMade: p.servingsMade,
          ingredients: p.ingredients.map((i) => ({
            term: i.term,
            amount: i.amount,
            unit: i.unit,
            state: i.state,
          })),
        })),
      });
    const measure = (m: GeneratedMeal) => {
      if (!composition) return null;
      const verdict = verdictFor({
        dishes: verdictDishesOf(m),
        envelope,
        index: composition,
        daysCovered: durationDays,
        friedMethod: isFriedMethod,
        // FF-042 R6 — CE QU'AUCUN ALIMENT NE PEUT APPORTER À CET ÉLÈVE.
        // Retiré des trous RÉPARABLES avant que la boucle de correction ne les
        // voie: sans ça, un plan végan serait repris à chaque génération pour
        // une B12 qu'aucune recette ne place.
        uncoverableSentinels: uncoverableForStudent,
        // FF-051 — CE QUI EST DÉJÀ MANGÉ COMPTE. Une entrée par occurrence sur
        // la fenêtre: sans elles, le plan empile sa protéine et son énergie
        // par-dessus un moment déjà pris, et le verdict dit « within » sur une
        // journée qui déborde.
        fixedIntakeInputs: fixedIntakeInputsFor(fixedIntakes, daysToFill),
      });
      const coverage = assessCoverage({
        dishes: verdictDishesOf(m),
        index: composition,
        daysCovered: durationDays,
        // On ne prétend rien sur la couverture d'un plan qu'on n'a pas su
        // mesurer: `unverified`, jamais `ok` (FF-040 R10).
        verdictComputable: verdict.energy !== "not_computable",
      });
      // ⚠️ LA MÊME ASSIETTE QUE LE VERDICT, préparations pliées comprises.
      // Cette résolution alimente la WORKLIST d'alias: la calculer sur les
      // seuls plats ferait manquer les termes qui n'existent que dans les
      // préparations — c'est-à-dire les aliments du batch cooking, donc les
      // pièces de viande et de poisson, donc précisément ceux qu'on veut
      // curer en premier.
      const resolution = resolveIngredients(
        composition,
        verdictDishesOf(m).flatMap((d) => d.ingredients),
      );
      return { verdict, coverage, resolution };
    };

    let measured = measure(meal);
    let correctionTokens: string[] = [];
    let correctionRetried = false;
    if (measured) {
      const plan = correctionPlanFor({
        verdict: measured.verdict,
        envelope,
        declarations: {
          // LA CORRECTION VOIT LES DEUX SEAUX, à plat. Elle cherche ce que
          // l'élève a déclaré, pas qui l'a saisi: une correction qui ignorerait
          // les consignes écrites corrigerait CONTRE elles.
          //
          // LOT 1C — LES ITEMS RETENUS EN FONT PARTIE. Sans eux, la correction
          // corrigerait CONTRE une exclusion que le prompt vient d'annoncer:
          // c'est exactement le défaut que la ligne au-dessus décrit, sur le
          // second magasin.
          foodPreferences: [
            ...retainedComposition.written,
            ...retainedComposition.remembered,
            ...foodPreferencesForPrompt(
              goalRow.practical_constraints as Record<string, unknown> | null,
            ),
          ],
        },
        coverageFloorHit: measured.coverage.floorHit,
        // FF-041 — LES AXES QUE LA DOCTRINE GOUVERNANTE A ÉTEINTS.
        // `off` retire l'ARBITRE, jamais l'instrument: le verdict a été
        // calculé et sera écrit, il ne sert simplement pas de correction.
        offAxes: offAxesFor(steering),
      });
      correctionTokens = [...plan.tokens];
      const instruction = correctionRetryInstruction(plan);
      // ── UNE SEULE RELANCE, ET ELLE NE PEUT PAS COÛTER LE PLAN ──────────
      // Adoptée seulement si elle rend au moins autant de plats ET qu'elle
      // améliore réellement le verdict. Tout le reste — modèle en erreur,
      // sortie illisible, plan appauvri — garde silencieusement la première.
      if (instruction) {
        try {
          const retryResult = await generateWithGemini(
            built.systemPrompt,
            mealUserMessage(`\n\n${instruction}`),
            0.6,
            true,
            [],
            "auto",
            {
              source: `${FN_NAME}.composition_retry`,
              requestId,
              userId,
              model: keelGenerationModel(),
            },
          );
          if (typeof retryResult === "string") {
            const retried = parseGeneratedMeal(retryResult, parseArgs);
            const after = measure(retried);
            if (
              retried.dishes.length >= meal.dishes.length && after !== null &&
              offBandCount(after.verdict) < offBandCount(measured.verdict)
            ) {
              meal = retried;
              measured = after;
              correctionRetried = true;
            }
          }
        } catch (error) {
          console.warn(`[${FN_NAME}] composition correction retry failed`, error);
        }
      }
      console.log(JSON.stringify({
        tag: "keel.meal.composition_correction",
        user_id: userId,
        tokens: correctionTokens,
        suppressed: plan.suppressed,
        retried: correctionRetried,
        coverage_flag: measured.coverage.flag,
      }));
    }

    // ══ LE SECOND TOUR DU DOUBLE VERROU, SUR LES CONSIGNES ÉCRITES ═══════
    //
    // Le prompt DEMANDE au modèle de nommer ce qu'il n'a pas pu honorer d'une
    // consigne que l'élève a tapée. Une demande de prompt régresse en réel —
    // `household_restriction_lock.ts` existe pour cette raison exacte. Ici on
    // le VÉRIFIE, sur le plan qui part vraiment (donc APRÈS la relance de
    // correction, qui a pu changer les plats).
    //
    // ⚠️ ON NE JETTE RIEN, et c'est délibéré. Un plan par ailleurs correct ne
    // se refuse pas parce qu'une phrase manque à un « why »: l'élève perdrait
    // sa semaine pour un défaut de rédaction. Le silence se COMPTE et se DIT
    // (`issues`), ce qui est la condition pour savoir un jour s'il est rare ou
    // s'il est la règle. Décider d'en faire un motif de relance demande cette
    // mesure d'abord.
    // LOT 1C — LA CEINTURE VOIT LES DEUX MAGASINS. Une consigne retenue que le
    // plan avale en silence doit se compter comme n'importe quelle autre: la
    // servir au modèle sans la vérifier ferait deux régimes de contrôle pour
    // une seule promesse.
    const writtenForCheck = readFoodPreferences(
      goalRow.practical_constraints as Record<string, unknown> | null,
      retainedComposition,
    ).written;
    if (writtenForCheck.length > 0) {
      const swallowed = silentInstructions(
        checkWrittenInstructions({
          instructions: writtenForCheck,
          dishes: meal.dishes,
        }),
      );
      console.log(JSON.stringify({
        tag: "keel.meal.written_instructions",
        user_id: userId,
        declared: writtenForCheck.length,
        silent: swallowed.length,
      }));
      for (const instruction of swallowed) {
        issues.push(`written_instruction_unanswered: ${instruction}`);
      }
    }

    // ══ FF-042 · LE SECOND TOUR DU DOUBLE VERROU, SUR LE RÉGIME ══════════
    //
    // La consigne est partie dans le prompt (`dietBlock`, plus haut). Une
    // consigne de prompt régresse en réel — c'est la phrase fondatrice de
    // `household_restriction_lock.ts`, et le régime n'y échappe pas: c'est
    // exactement dans les fonds, les sauces et les garnitures que la règle se
    // perd, ce que `dietaryRegimePromptLine` dit au modèle sans pouvoir le
    // vérifier.
    //
    // ⚠️ ON MESURE L'EXPANSION, JAMAIS LE JETON. Les aiguilles sont les formes
    // de surface (`excludedSurfaceFormsFor`: viande, lardons, nuoc-mâm,
    // gélatine…), en FR ET EN EN. Armer la ceinture sur « vegan » ferait
    // rejeter toute réponse qui décrit un plat comme végane — le défaut exact
    // qu'`allergen_ref='diabetes'` a produit en run réel le 2026-08-06, où un
    // message d'urgence a été remplacé par un refus poli.
    //
    // ⚠️ ON NE JETTE RIEN, même arbitrage et même raison que le bloc au-dessus.
    // Le verrou de sortie est BINAIRE et calculé sur la concaténation de tous
    // les plats: refuser ici viderait la semaine entière pour un lardon dans
    // un seul plat, et l'élève paierait son régime en semaines vides — le
    // défaut que FF-030 a déjà corrigé pour l'allergène. Le silence se COMPTE
    // et se DIT, ce qui est la condition pour décider un jour d'en faire un
    // motif de relance. Décider avant de mesurer, c'est ce qui a produit le
    // refus poli ci-dessus.
    if (declaredRegime) {
      const excludedForms = excludedSurfaceFormsFor(declaredRegime);
      const regimeTerms = excludedForms.map((form) => ({
        ruleId: `diet:${declaredRegime}`,
        token: form,
      }));
      // LE PLAT ENTIER, ingrédients COMPRIS. Le titre seul laisserait passer
      // « risotto crémeux » dont la liste porte du parmesan et du bouillon de
      // volaille — c'est-à-dire le cas que la consigne nomme en toutes lettres.
      const breaches: string[] = [];
      for (const dish of meal.dishes) {
        const haystack = [
          dish.title,
          dish.why,
          ...(dish.ingredients ?? []).map((i) =>
            typeof i === "string" ? i : String((i as { term?: string })?.term ?? "")
          ),
        ].filter((s) => typeof s === "string" && s.trim() !== "").join(" · ");
        for (const hit of findForbiddenMatches(haystack, regimeTerms)) {
          breaches.push(`${dish.title}: ${hit.matchedText}`);
        }
      }
      // TROIS NOMBRES, pas un booléen: un lot désarmé et un lot qui marche
      // rendent le même `false`. `dishes` dit que la garde a eu de la matière,
      // `forms` qu'elle avait des aiguilles, `breaches` ce qu'elle a trouvé.
      console.log(JSON.stringify({
        tag: "keel.meal.dietary_regime",
        user_id: userId,
        regime: declaredRegime,
        dishes: meal.dishes.length,
        forms: excludedForms.length,
        breaches: breaches.length,
      }));
      for (const breach of breaches) {
        issues.push(`dietary_regime_breach: ${breach}`);
      }
    }

    if (meal.dishes.length === 0) {
      // Rien n'est écrit. Même arbitrage que le plan vide: un brouillon sans
      // plat donnerait à l'élève l'impression d'un repas.
      //
      // ── LE MOT CHANGE SUR UN APERÇU, ET LA MOITIÉ QUI COMPTE EST LA
      //    SECONDE ────────────────────────────────────────────────────────
      // `empty_meal` dit « la composition n'a rien donné ». Sur un aperçu, la
      // question de la personne est autre: « est-ce que ça a cassé mon plan ? ».
      // `draft_not_composed` répond aux deux — rien n'a été enregistré, et le
      // plan vivant n'a pas bougé. Le diagnostic (`lock`, `issues`) reste dans
      // le corps, identique.
      //
      // ⚠️ DEUX APPELS, ET PAS UN TERNAIRE DANS LA CLÉ. `planRefusals.int.test.ts`
      // SCANNE ce fichier à la recherche de `jsonResponse(req, { error: "…" })`
      // avec un littéral: un jeton calculé y devient invisible, et le mot
      // correspondant disparaît de l'écran sans qu'aucun test ne rougisse.
      const emptyBody = {
        lock: meal.lock.reason,
        rejected_numeric: meal.rejected_numeric,
        rejected_aisles: meal.rejected_aisles,
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

    // ══ CE QU'ON A LE DROIT DE DIRE DE CE PLAN ═══════════════════════════
    //
    // Deux blocs, deux questions différentes, et ils ne se remplacent pas:
    //   · `rationale` .. POURQUOI CES JOURS-LÀ. Déterministe, calendrier.
    //   · `report` .... CE QUI A ÉTÉ FAIT DE CE QUI A ÉTÉ DEMANDÉ (FF-061),
    //                   avec ses quatre portes DANS le module.
    //
    // Les deux sont calculés AVANT l'écriture pour être renvoyés même sur un
    // aperçu (`intent: "draft"`), qui n'écrit rien.
    //
    // ⚠️ AUCUN DES DEUX NE PEUT COÛTER UN DÎNER. Ils JETTENT sur un champ
    // manquant — c'est leur garde, et elle est juste — mais un plan déjà
    // composé ne doit pas mourir d'une explication. L'échec est donc attrapé,
    // NOMMÉ dans `issues` (donc comptable en SQL sur la ligne) et journalisé.
    // Ce n'est pas une garde désarmée: la garde est armée dans le module, et
    // son déclenchement est visible à deux endroits.
    const contentLocaleTag = built.contentLocale.slice(0, 2).toLowerCase();
    const reportLocale: "fr" | "en" = contentLocaleTag === "fr" ? "fr" : "en";

    // ⚠️ `doctrineForbidden` est LU ICI ET DÉFINI PLUS HAUT, juste après le
    // plancher TCA. Il y a été hissé parce que la garde d'entrée de la phrase de
    // reprise en a besoin avant l'appel modèle; le recopier ici en ferait une
    // troisième copie de la même liste.

    let rationaleLines: string[] = [];
    let rationaleRefusal: string | null = null;
    try {
      const explained = explainPlanChoices({
        locale: reportLocale,
        facts: {
          declaredCookDays: (capacity.cookDays ?? []) as never,
          // CE QUE LE MOTEUR A AJOUTÉ. Recalculé de la MÊME façon que
          // `buildMealPrompt`: les jours déclarés qui restent dans la fenêtre,
          // et le premier jour cuisinable quand tous tombent après lui.
          addedCookDays: addedCookDays({
            declared: capacity.cookDays ?? [],
            window: daysToFill,
            firstDayCookable,
          }) as never,
          window: { startsOn, durationDays },
          requestedWindow: requestedWindowFacts,
          today: { localDate: todayDate, dayToken: todayToken as never },
          localMinuteOfDay,
          slotsDroppedToday,
          // ⚠️ `declaredAway` ET PAS `awayDays`: le second porte l'UNION avec
          // les créneaux tombés par l'horloge, et les compter ici les dirait
          // DEUX FOIS — une fois « la journée est déjà entamée », une fois
          // « tu les avais marqués hors de la maison ». La seconde phrase
          // attribuerait à l'élève une déclaration qu'il n'a pas faite.
          awayInWindow: declaredAway
            .filter((a) => daysToFill.includes(a.day))
            .flatMap((a) =>
              a.slots.length === 0
                ? [{ day: a.day as never, slot: "all" }]
                : a.slots.map((s) => ({ day: a.day as never, slot: s as string }))
            ),
          budgetAmount: capacity.budgetAmount,
          // `null` ET PAS `servings`: cette lane a UNE bouche, et elle n'a
          // jamais posé la question. « pour 1 personne » serait une réponse à
          // une question que personne n'a posée.
          mouthsServed: null,
          handTakenBy: [],
          mergedIn: [],
          // G5 — `null`, ET C'EST DÉFINITIF SUR CETTE LANE. Le seuil hebdomadaire
          // décide si un FOYER peut cuire deux plats; une personne seule n'a
          // jamais eu cette question, et la phrase ne sort de toute façon
          // qu'au-dessus d'une bouche. Passer le vrai budget d'ici ferait porter
          // au module une prémisse qu'il ne peut pas honorer.
          weeklyCookingMinutes: null,
          // R4 — `null` DÉFINITIF SUR CETTE LANE. « Le plat commun est
          // végétarien » n'apprend rien à quelqu'un qui mange seul: il n'y a
          // pas de commun. Le régime de l'élève gouverne DÉJÀ tout son plan
          // ici (`declaredRegime`, plus haut), et l'expliquer reviendrait à lui
          // relire sa propre réponse.
          sharedDishRegime: null,
          // LE MODE DE CUISSON — `null` DÉFINITIF SUR CETTE LANE. Le choix
          // « un seul plat / une cuisson / chacun le sien » n'a de sujet qu'à
          // plusieurs bouches: cette lane en a UNE, et elle n'accepte pas le
          // champ. La phrase ne sort de toute façon qu'au-dessus d'une bouche.
          cookingShapeChoice: null,
        },
      });
      rationaleLines = explained.lines;
      rationaleRefusal = explained.refusal;
    } catch (error) {
      console.error(`[${FN_NAME}] plan rationale unavailable`, error);
      issues.push("rationale_unavailable");
    }

    // FF-061 — LE COMPTE-RENDU DE LA DEMANDE. Il lit `preferences`, c'est-à-dire
    // l'envie tapée au moment de composer, et RIEN d'autre.
    let reportLines: string[] = [];
    let reportRefusal: string | null = null;
    try {
      const gated = gateRequestReport({
        report: reportOnRequest({
          preferences: preferences ?? "",
          // ⚠️ `GeneratedDish` N'A PAS D'IDENTIFIANT — les plats n'en portent
          // qu'une fois en base. L'index du plan fait l'affaire ici: `dishIds`
          // ne sert qu'à REGROUPER des faits à l'intérieur d'un même rapport,
          // et il n'est jamais rendu à l'élève ni écrit ailleurs.
          dishes: meal.dishes.map((d, at) => ({
            id: `dish_${at}`,
            title: String(d.title ?? ""),
            method: String(d.method ?? ""),
            day: d.day ?? null,
            ingredients: (d.ingredients ?? []).map((i) => ({ term: String(i.term ?? "") })),
          })),
          // ⚠️ PAS DE RÈGLES DE MAISON SUR CETTE LANE: elles vivent sur le
          // foyer. `[]` dit « aucune », et c'est vrai ici — pas « je n'ai pas
          // su lire ».
          houseRuleTerms: [],
          // Pas encore de rappel d'un plan à l'autre. `[]` est la valeur, et le
          // trou est nommé dans le rapport de lot.
          previouslyReportedAbsent: [],
        }),
        locale: reportLocale,
        restrictionFlag,
        doctrineForbidden,
      });
      reportLines = gated.lines;
      reportRefusal = gated.refusal;
    } catch (error) {
      console.error(`[${FN_NAME}] request report unavailable`, error);
      issues.push("request_report_unavailable");
    }

    // ── L'APERÇU S'ARRÊTE ICI ────────────────────────────────────────────
    //
    // Le SEUL saut est l'écriture. Tout ce qui précède — gel, doctrine, règles
    // de maison, plancher TCA, fenêtre, chevauchement, verrous de sortie — a
    // déjà mordu à l'identique. Aucun état de brouillon n'est posé en base: la
    // contrainte d'exclusion sur les fenêtres vivantes reste intacte, et rien
    // ne peut rester coincé.
    // ══════════════════════════════════════════════════════════════════════
    // LOT 4 — LES COMPTEURS DES GRAMMES, ÉCRITS UNE FOIS, LISIBLES SUR LES DEUX
    // CHEMINS.
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ ET RENDUS SUR L'APERÇU, PARCE QU'UN COMPTEUR QU'ON NE PEUT LIRE QUE SUR
    // LE CHEMIN QUI CONSOMME UN PLAN N'EST PAS UN COMPTEUR. C'est la moitié qui
    // manquait à `dish_owners` et qui a coûté un diagnostic entier le
    // 2026-08-17: `generated_from` n'existe que sur une ligne ÉCRITE, donc toute
    // vérification faite par `intent: "draft"` était AVEUGLE, et il fallait
    // relire les plats un par un. Le LOT 3C l'a réparé côté foyer; ce lot-ci le
    // fait aussi ici, sur la lane individuelle, qui ne rendait aucun compteur du
    // tout.
    //
    // ⚠️ UNE SEULE EXPRESSION POUR LES DEUX CHEMINS, étalée par `...`: deux
    // objets écrits séparément divergeraient au premier champ ajouté.
    const boxTrace = {
      boxes: meal.box_counts,
      box_uses: meal.box_use_counts,
      unquantified_dish_ingredients: meal.unquantified_dish_ingredients,
    } as const;

    if (isDraft) {
      return jsonResponse(req, {
        ok: true,
        draft: true,
        // ── ④ · LE COMPTEUR DU NOM, SUR CETTE LANE AUSSI ────────────────
        // Même place et même nom que sur la lane foyer (racine, `names`): un
        // compteur rangé à la racine d'un côté et sous une enveloppe de
        // l'autre n'est lisible par aucune requête qui regarde toute la
        // population. Voir le commentaire de l'archive, plus bas.
        names: meal.name_counts,
        ...boxTrace,
        // `null` ET PAS UN IDENTIFIANT FABRIQUÉ: l'écran doit pouvoir
        // distinguer un aperçu d'un plan, et un id inventé serait la première
        // chose qu'un lecteur prendrait pour une ligne réelle.
        meal: null,
        window: { starts_on: startsOn, duration_days: durationDays },
        suggested_window: suggestedWindow,
        rationale: { lines: rationaleLines, refusal: rationaleRefusal },
        request_report: { lines: reportLines, refusal: reportRefusal },
        dishes: mealDishesPayload(meal),
        preparations: mealPreparationsPayload(meal),
        cooking_sessions: mealSessionsPayload(meal),
        shopping_list: mealShoppingPayload(meal),
        fixed_intakes: fixedIntakes.map((i) => ({
          food_ref: i.foodRef,
          label: i.label,
          amount: i.amount,
          unit: i.unit,
          slot: i.placement === "at_slot" ? i.slot : null,
          replaces_meal: i.placement === "at_slot" ? i.replacesMeal : false,
          days: i.days,
        })),
        day_properties: dayProperties.map((d) => ({
          day: d.day,
          properties: d.properties,
        })),
        rejected_numeric: meal.rejected_numeric,
        rejected_aisles: meal.rejected_aisles,
        issues: [...issues, ...meal.issues],
        request_id: requestId,
      });
    }

    // ── L'ÉCRITURE PASSE PAR LA RPC, ET C'EST UNE TRANSACTION ────────────
    // Préparer un plan qui démarre avant la fin du courant RACCOURCIT le
    // courant. Deux appels ne peuvent pas garantir l'atomicité de ça, et le
    // seul entrelacement vraiment nuisible est « troncature commitée, insert
    // échoué »: l'élève perd des jours pour un plan qui n'est jamais arrivé.
    //
    // La RPC porte aussi la contrainte d'exclusion en filet: elle refuse
    // nommément un plan qui chevauche un autre sans pouvoir le raccourcir.
    //
    // LOT 3 — LE FOYER SUR LE PLAN PERSONNEL. `householdId` et
    // `householdLookupFailed` viennent du HAUT de la fonction (L1, D13): ils y
    // sont résolus avant le modèle parce que le gel s'y adosse. Ne PAS
    // re-résoudre ici — deux lectures du même foyer dans un même tour, c'est
    // deux réponses possibles pour une seule ligne écrite.
    const { data: writtenRows, error: writeErr } = await admin.rpc(
      "write_student_meal_plan",
      {
        p_user_id: userId,
        p_intent: intent,
        p_starts_on: startsOn,
        p_duration_days: durationDays,
        p_replaces: replaces,
        p_payload: {
          mode,
          meal_slot: slot,
          servings,
          household_id: householdId,
          // Toujours explicite, même hors foyer: ce générateur ne produit QUE
          // des plans personnels, et le dire ici évite qu'un défaut silencieux
          // le range un jour ailleurs.
          plan_kind: "personal",
          context,
          preferences,
          pantry,
          dishes: mealDishesPayload(meal),
          preparations: mealPreparationsPayload(meal),
          cooking_sessions: mealSessionsPayload(meal),
          shopping_list: mealShoppingPayload(meal),
          // LA MÊME EXPRESSION QUE CELLE QUI A ÉCRIT LE PROMPT. Elle valait
          // `String(goalRow.content_locale ?? "en")`: une SECONDE expression,
          // sur une AUTRE colonne, qui écrivait « en » d'un texte français —
          // et un tag de 2 lettres là où R2 demande du BCP-47.
          content_locale: built.contentLocale,
          generated_from: {
            coach_id: doctrine.coachId,
            doctrine_version: doctrine.doctrine?.version ?? null,
            doctrine_reason: doctrine.reason,
            // ── O7 · D'OÙ VIENT CE COACH ─────────────────────────────────
            // Écrit SEULEMENT sur un repli, pour que le plan d'un titulaire qui
            // a son propre coach reste byte-identique à ce qu'il était. Sans
            // cette clé, « ce plan suit la méthode d'un coach que cette personne
            // n'a jamais rencontré » n'est lisible nulle part — et c'est
            // exactement la question qu'on se pose en relisant le plan d'un
            // secondaire.
            ...(resolvedDoctrine.viaHousehold
              ? {
                doctrine_via_household: true,
                doctrine_owner_user_id: resolvedDoctrine.ownerUserId,
              }
              : {}),
            belief_keys: beliefKeys,
            goal: String(goalRow.goal ?? "health"),
            prompt_version: MEAL_PROMPT_VERSION,
            intent,
            // ── C3 ① · À QUEL TITRE CE PLAN A ÉTÉ PRODUIT ────────────────
            // ÉCRIT TOUJOURS, y compris sur le cas nominal: une clé qui
            // n'apparaîtrait qu'au moment du trou ne se distinguerait pas d'un
            // lot débranché. C'est ce qui rend la question ouverte n°1
            // comptable en SQL au lieu de rester une hypothèse — et elle est
            // écrite ICI, sur la ligne, parce qu'un journal de runtime
            // s'efface alors que le plan reste.
            access,
            // La panne de résolution du foyer, TRACÉE. Sans elle, un plan
            // orphelin est indiscernable du plan d'une personne qui n'a
            // simplement pas de foyer.
            ...(householdLookupFailed ? { household_lookup_failed: true } : {}),
            // ── FF-053 · CE SOUS QUOI CE PLAN A ÉTÉ COMPOSÉ ───────────────
            // La grille de l'écran doit expliquer chaque case vide. Renvoyer
            // ces deux lectures dans la RÉPONSE ne suffit pas: au premier
            // rafraîchissement, le plan est relu depuis cette ligne et les
            // explications disparaîtraient — la grille expliquerait les cases
            // pendant une minute, puis se tairait.
            //
            // Écrites ICI, elles disent ce qui était vrai AU MOMENT DE LA
            // COMPOSITION, et c'est la bonne sémantique: un plan montre les
            // contraintes sous lesquelles il a été fait, pas celles
            // d'aujourd'hui. Un élève qui retire son shaker demain doit
            // toujours comprendre pourquoi son plan de la semaine n'a pas de
            // petit-déjeuner.
            fixed_intakes: fixedIntakes.map((i) => ({
              food_ref: i.foodRef,
              label: i.label,
              amount: i.amount,
              unit: i.unit,
              slot: i.placement === "at_slot" ? i.slot : null,
              replaces_meal: i.placement === "at_slot" ? i.replacesMeal : false,
              days: i.days,
            })),
            day_properties: dayProperties.map((d) => ({
              day: d.day,
              properties: d.properties,
            })),
            // ── CE QUI A MORDU, ÉCRIT SUR LA LIGNE ────────────────────────
            // Les `issues` ne partaient que dans la RÉPONSE HTTP, donc elles
            // mouraient avec elle: un plan qui garde un lot six jours, ou dont
            // la session déborde le temps déclaré, était écrit en base sans
            // aucune trace du motif. Le contrôle existait et personne ne
            // pouvait le lire — c'est-à-dire qu'il n'existait pas.
            issues: [...issues, ...meal.issues],
            // ── POURQUOI CES JOURS-LÀ, SUR LA LIGNE ─────────────────────
            //
            // Renvoyer ces phrases dans la RÉPONSE ne suffit pas: au premier
            // rafraîchissement, le plan est relu depuis cette ligne et
            // l'explication disparaîtrait — l'écran expliquerait le calendrier
            // pendant une minute, puis se tairait. Même raisonnement mot pour
            // mot que `fixed_intakes` et `day_properties` ci-dessus.
            //
            // ⚠️ AUCUNE MIGRATION: `generated_from` est déjà `jsonb`.
            //
            // ÉCRIT MÊME VIDE, avec son motif: une clé absente ne se distingue
            // pas d'un lot débranché, et ce dépôt paie en boucle la garde
            // construite puis silencieusement débranchée.
            rationale: { lines: rationaleLines, refusal: rationaleRefusal },
            // FF-061 — CE QUI A ÉTÉ FAIT DE CE QUI AVAIT ÉTÉ DEMANDÉ. Même
            // arbitrage: sans la trace, « je t'avais demandé des burgers » n'a
            // plus de réponse trois jours plus tard.
            request_report: { lines: reportLines, refusal: reportRefusal },
            // FF-037 — CE QUE L'ANCRE A COÛTÉ ET RAPPORTÉ, SUR LA LIGNE.
            // Le §10 de la fiche demande deux chiffres: la part de repas
            // principaux sans ancre, et la part de relances qui règlent
            // vraiment le problème. Le second n'est lisible qu'ici: une
            // relance dont on ne garde pas la trace est une relance qu'on
            // paiera sans jamais savoir si elle sert.
            protein_anchor_retry: proteinAnchorRetry,
            protein_anchor_missing: meal.protein_anchor_missing,
            // ── C2 ④ · LES CASES QUE PERSONNE NE REMPLIT, SUR LA LIGNE ────
            // À côté des `issues` et pas à leur place: une case vide se
            // COMPTE (« combien de plans sortent troués, et sur quel
            // moment »), et une chaîne de prose ne se compte pas. Mesuré le
            // 2026-08-12: les cinq petits-déjeuners d'un plan de foyer tombés
            // d'un coup, et rien en base pour le dire autrement qu'en relisant
            // les plats un par un.
            empty_slots: meal.empty_slots,
            // ══════════════════════════════════════════════════════════════
            // LOT 2 — LE COMMENTAIRE DU JOUR J, COMPTÉ. C'EST CE QUI EMPÊCHE
            // LE LOT D'ÊTRE DÉSARMÉ EN SILENCE.
            // ══════════════════════════════════════════════════════════════
            //
            // ⛔ `same_day` EST DÉCLARÉ PAR LE MODÈLE. On ne peut donc pas
            // SAVOIR d'avance à quelle fréquence il le remplit — seulement le
            // mesurer. Sans ces quatre nombres, un modèle qui ignorerait la
            // consigne rendrait `same_day: null` partout, aucun bandeau ne
            // s'afficherait, et le lot ressemblerait trait pour trait à un lot
            // qui marche: la carte d'un plat dirait exactement ce qu'elle
            // disait avant.
            //
            // `declared/dishes` est le taux de service; `invalid` dit que le
            // modèle a essayé un jeton hors liste (à resserrer dans le prompt);
            // `minutes_missing` que le geste est nommé sans sa durée.
            //
            // ÉCRIT MÊME À ZÉRO, comme `dish_owners` sur la lane foyer: une clé
            // absente ne se distingue pas d'un lot débranché.
            same_day: meal.same_day_counts,
            // ══════════════════════════════════════════════════════════════
            // ④ — LE COMPTEUR DU NOM, ET IL FERME UN ZÉRO AMBIGU.
            // ══════════════════════════════════════════════════════════════
            //
            // ⛔ CE QU'IL CORRIGE, ET C'EST EXACTEMENT LE PIÈGE DU VOISIN
            // `same_day`. `dishes[].name` est DÉCLARÉ PAR LE MODÈLE, et le
            // parseur partagé le REFUSE dans trois cas (trop long, vide,
            // recopie du titre) — voir `DISH_NAME_MAX_CHARS`. Un nom refusé
            // s'écrit `null` en base, c'est-à-dire la MÊME valeur qu'un nom
            // jamais déclaré. Sans ces trois nombres, « 40 % des plats n'ont
            // pas de nom » ne dit pas s'il faut resserrer le prompt ou
            // desserrer la garde: le zéro est ambigu, et un lot désarmé
            // ressemble trait pour trait à un lot qui marche.
            //
            // ⚠️ LE COMPTEUR EXISTAIT DÉJÀ — `parseGeneratedMeal` le calcule
            // pour LES DEUX lanes depuis L7 ③ — et seule la lane FOYER
            // l'archivait. Ce n'est donc pas un calcul neuf, c'est un lecteur
            // qui manquait: la moitié débranchée que ce dépôt paie en boucle.
            // Le commentaire de `generate-household-meal-v1` qui disait « son
            // fichier n'appartient pas à ce lot » est désormais périmé.
            //
            // `declared === kept + refused` est vérifiable de l'extérieur, sur
            // la ligne, sans relire un seul plat.
            //
            // ÉCRIT MÊME À ZÉRO, comme `same_day` juste au-dessus: une clé
            // absente ne se distingue pas d'un lot débranché.
            names: meal.name_counts,
            // ── LOT 4 · LES GRAMMES, COMPTÉS SUR CETTE LANE AUSSI ──────────
            // La MÊME expression que celle rendue sur l'aperçu, quinze lignes
            // plus haut: deux comptages divergeraient au premier champ ajouté,
            // et la mesure d'un brouillon cesserait de prédire celle d'un plan.
            ...boxTrace,
            // FF-027 — la provenance de l'adaptation, archivée avec la
            // composition. C'est ce qui rend « la faim persiste malgré deux
            // adaptations » (§10) lisible sans qu'aucun compteur ne vive sur
            // l'élève. Le décompte est archivé ici; il n'est pas entré dans le
            // prompt.
            ...hungerSignalProvenance(hungerSignal),
          },
        },
      },
    );
    const writtenRow = (Array.isArray(writtenRows) ? writtenRows[0] : writtenRows) as
      | {
        meal_id: string;
        retired_plan_id: string | null;
        truncated_plan_id: string | null;
        truncated_from: number | null;
        truncated_to: number | null;
      }
      | null;
    // Les motifs de la RPC sont NOMMÉS (`plan_overlaps_existing`,
    // `plan_not_replaceable`, `replaces_required`) et remontent tels quels:
    // l'écran sait quoi en faire, « une erreur est survenue » non.
    if (writeErr) {
      return jsonResponse(req, {
        error: "plan_not_written",
        detail: writeErr.message,
        request_id: requestId,
      }, { status: 409 });
    }
    const written = writtenRow
      ? { id: writtenRow.meal_id, starts_on: startsOn, duration_days: durationDays }
      : null;

    // ── C6 ② · LA CORRECTION DE GOÛT S'ÉCRIT MAINTENANT, ET PAS AVANT ─────
    //
    // LE PLAN EST ÉCRIT: la requête a abouti, donc le geste de la personne a
    // produit quelque chose, donc sa ligne peut bouger. Tous les refus posés
    // au-dessus — les deux gardes de fenêtre, le 409 de la base, une panne du
    // modèle — sortent AVANT ce point et laissent `student_goals` intacte.
    //
    // ⚠️ ELLE NE PEUT PAS FAIRE ÉCHOUER LA RÉPONSE: la fonction avale ses
    // erreurs et journalise. Le plan est déjà écrit; personne ne perd son dîner
    // parce qu'une préférence rétractée n'a pas pu être effacée.
    await persistReconciledFoodPreferences(foodPreferences.pending);

    // ── LOT 2D · CE QUE LA PERSONNE A DEMANDÉ SUR SON BROUILLON, RANGÉ ─────
    //
    // ⚠️ ICI, ET PAS DIX LIGNES PLUS HAUT. `intent: "draft"` est sorti bien
    // avant ce point (`if (isDraft) return …`): sur un aperçu il n'y a pas
    // encore de plan, et ranger une envie qui vise un plan que la personne peut
    // encore abandonner écrirait une mémoire pour un geste qui n'a pas eu lieu.
    //
    // ⚠️ L'ANCRE EST `startsOn` — LA SEMAINE VISÉE — ET PAS `todayDate`.
    // Quelqu'un qui adopte le dimanche un plan qui commence lundi vise la
    // semaine SUIVANTE; ancrer sur le jour de la frappe ferait mourir son envie
    // le lendemain matin (§7.3: vivant tant que `jour ≤ ancre + 6`). `today`
    // reste le jour de la frappe: c'est le `at` de l'item, pas son ancre.
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
        // `[]` DIT « personne d'autre à table », et c'est vrai de cette lane:
        // elle compose pour UNE bouche. `undefined` dirait « je n'ai pas su
        // lire le foyer » — la cicatrice « paramètre de garde optionnel =
        // garde désarmée » — et le type l'interdit déjà.
        members: [],
        contentLocale: built.contentLocale,
        requestId,
      });
    }

    // ── FF-039 + FF-040 · LE VERDICT, ÉCRIT ────────────────────────────────
    // APRÈS l'écriture du plan, et dans un try/catch qui n'échoue jamais vers
    // l'élève: personne ne perd son dîner parce qu'une table d'instrumentation
    // était indisponible.
    //
    // C'est la mesure FINALE qui est écrite — celle d'après la correction. La
    // mesure d'avant a servi à décider; l'écrire à sa place ferait croire à un
    // lecteur que le plan servi était celui-là.
    if (written && measured) {
      try {
        const { error: verdictErr } = await admin
          .from("meal_composition_verdicts")
          .insert({
            user_id: userId,
            meal_id: written.id,
            verdict: measured.verdict,
            // SANS LA RAISON. Le plancher TCA et le corps inconnu produisent
            // la même valeur, par la même branche: la déduction est fausse par
            // construction, pas seulement interdite.
            envelope_mode: envelope.mode,
            resolution_coverage: measured.resolution.coverage,
            unresolved_terms: measured.resolution.unresolvedTerms,
            tokens_served: correctionTokens,
            coverage_flag: coverageFlagAfterCorrection(
              measured.coverage,
              measured.verdict.sentinels.missing.length > 0,
            ),
            prompt_version: MEAL_PROMPT_VERSION,
            doctrine_version: doctrine.doctrine?.version ?? null,
          });
        if (verdictErr) throw new Error(verdictErr.message);
      } catch (error) {
        // NOMMÉ: sans le nom, une table indisponible en boucle ressemblerait à
        // des élèves qui n'ont pas de verdicts.
        console.warn(`[${FN_NAME}] composition verdict not written`, error);
      }
    }

    return jsonResponse(req, {
      ok: true,
      meal: written,
      // CE QUE CETTE GÉNÉRATION A DÉPLACÉ. L'écran en a besoin pour dire « 2 de
      // ces jours sont passés dans ton prochain plan » — sans ça, la liste de
      // courses du plan raccourci resterait muette sur ce qu'elle couvre encore.
      window: { starts_on: startsOn, duration_days: durationDays },
      // ── CE QU'ON AURAIT PROPOSÉ, ET POURQUOI ──────────────────────────────
      // Une PROPOSITION, jamais un refus: l'écran s'en sert comme valeur par
      // défaut du prochain formulaire. `shifted: null` veut dire « rien à
      // déplacer », pas « on n'a pas regardé ».
      suggested_window: suggestedWindow,
      // ── POURQUOI CES JOURS-LÀ ─────────────────────────────────────────────
      // Des phrases FINIES, dans la langue du plan, assemblées par le serveur.
      // ⛔ Aucun miroir de ces gabarits n'existera côté écran: une garde en
      // double diverge.
      rationale: { lines: rationaleLines, refusal: rationaleRefusal },
      // FF-061 — ce qui a été fait de ce qui avait été demandé.
      request_report: { lines: reportLines, refusal: reportRefusal },
      retired_plan_id: writtenRow?.retired_plan_id ?? null,
      truncated: writtenRow?.truncated_plan_id
        ? {
          plan_id: writtenRow.truncated_plan_id,
          from_duration_days: writtenRow.truncated_from,
          to_duration_days: writtenRow.truncated_to,
        }
        : null,
      // LA MÊME FORME QUE CE QUI EST STOCKÉ, et c'est un correctif.
      //
      // La réponse rendait `meal.dishes`, la forme INTERNE du parseur
      // (`servingsMade`, camelCase), pendant que la ligne écrite juste au-dessus
      // passe par `mealDishesPayload` (`servings_made`, snake_case). Le client
      // lisait donc `undefined` sur le lot et n'affichait jamais « cuisiné une
      // fois pour trois jours » — l'élève voyait « 500 g de pommes de terre »
      // sans l'explication qui la rend juste.
      //
      // Deux formes pour une donnée, c'est la divergence silencieuse habituelle:
      // aucune erreur, aucun log, juste un champ vide chez le lecteur. Une seule
      // forme désormais, celle de la base.
      dishes: mealDishesPayload(meal),
      preparations: mealPreparationsPayload(meal),
      cooking_sessions: mealSessionsPayload(meal),
      shopping_list: mealShoppingPayload(meal),
      // ── FF-053 · CE QUI EXPLIQUE UNE CASE VIDE ────────────────────────────
      // La grille de l'écran doit distinguer QUATRE silences: « je déjeune à la
      // cantine » (FF-002), « mon shaker remplace ce moment » (FF-051), « c'est
      // mon jour de restes » (FF-052), et « le modèle n'a rien composé » — le
      // seul des quatre qui soit un défaut. Les rendre identiques rend le défaut
      // invisible et les trois autres inquiétants.
      //
      // ⚠️ C'EST LA FONCTION QUI LES RENVOIE, PAS LE FRONT QUI LES RELIT.
      // Elle seule sait ce qu'elle a RÉELLEMENT lu: elle écarte les entrées
      // malformées et les jetons inconnus (FF-051 R4, FF-052 R2). Un front qui
      // relirait `practical_constraints` dessinerait des marqueurs pour des
      // déclarations que la composition a ignorées — un écran qui affiche une
      // contrainte non respectée est pire qu'un écran qui n'affiche rien.
      //
      // Les APPORTS sont renvoyés dans la forme LUE, pas dans la forme stockée:
      // c'est l'union à deux branches de FF-051, aplatie pour le transport.
      fixed_intakes: fixedIntakes.map((i) => ({
        food_ref: i.foodRef,
        label: i.label,
        amount: i.amount,
        unit: i.unit,
        slot: i.placement === "at_slot" ? i.slot : null,
        replaces_meal: i.placement === "at_slot" ? i.replacesMeal : false,
        days: i.days,
      })),
      day_properties: dayProperties.map((d) => ({
        day: d.day,
        properties: d.properties,
      })),
      rejected_numeric: meal.rejected_numeric,
      rejected_aisles: meal.rejected_aisles,
      issues: [...issues, ...meal.issues],
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
