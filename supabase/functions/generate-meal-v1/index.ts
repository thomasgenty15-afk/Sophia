/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import { keelGenerationModel } from "../_shared/keel/generation_model.ts";
import {
  doctrineBeliefsFor,
  doctrineBlockFor,
  loadPublishedDoctrine,
} from "../_shared/keel/doctrine_loader.ts";
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
import { foodPreferencesForPrompt } from "../_shared/keel/food_preference_promotion.ts";
import { reconcileFoodPreferencesFor } from "../_shared/keel/food_preference_promotion_io.ts";
import { dayTokenInZone, localDateInZone } from "../_shared/keel/local_date.ts";
import {
  countHungerDays,
  type HungerWindowSignal,
  hungerSignalProvenance,
  satietyUserSuffix,
} from "../_shared/keel/hunger_signal.ts";
import { loadHungerDays } from "../_shared/keel/hunger_signal_io.ts";
import {
  type MealWindowRequest,
  resolveRequestedWindow,
  windowDayOrder,
} from "../_shared/keel/meal_plan_window.ts";
import {
  buildMealPrompt,
  type GeneratedMeal,
  MEAL_MODES,
  MEAL_PROMPT_VERSION,
  MEAL_SLOTS,
  type MealMode,
  type MealScope,
  type MealSlot,
  mealDishesPayload,
  mealPreparationsPayload,
  mealSessionsPayload,
  mealShoppingPayload,
  type PantryItem,
  parseAwayDays,
  parseEatingRhythm,
  parseGeneratedMeal,
} from "../_shared/keel/meal_generation.ts";
import { proteinAnchorRetryInstruction } from "../_shared/keel/protein_anchor.ts";
import type { CompositionIndex } from "../_shared/keel/food_composition.ts";
import { loadCompositionIndex } from "../_shared/keel/food_composition_io.ts";
import { isFriedMethod, resolveIngredients } from "../_shared/keel/food_composition.ts";
import { envelopeFor } from "../_shared/keel/meal_envelope.ts";
import { type CompositionVerdict, verdictFor } from "../_shared/keel/meal_verdict.ts";
import {
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
import { GOAL_TOKENS, type GoalToken } from "../_shared/keel/tokens.ts";
import {
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
 * Les préférences alimentaires CONFIRMÉES par l'élève, DATÉES et la plus
 * récente d'abord.
 *
 * La lecture, le tri et le plafond vivent dans `foodPreferencesForPrompt`, avec
 * le générateur de semaine: deux lectures différentes du même jsonb finiraient
 * par diverger, et c'est le genre de divergence qu'on ne voit qu'en relisant
 * deux prompts côte à côte.
 */
function readFoodPreferences(pc: Record<string, unknown> | null): string[] {
  return foodPreferencesForPrompt(pc);
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
  budgetBand: string | null;
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
    budgetBand: pick(pc?.budget_band, ["tight", "normal", "comfortable"]),
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
    const intent = String(body.intent ?? "replace_current").trim();
    if (intent !== "replace_current" && intent !== "prepare_next") {
      return jsonResponse(req, {
        error: "unknown_intent",
        detail: "intent must be replace_current or prepare_next",
        request_id: requestId,
      }, { status: 400 });
    }
    const replaces = String(body.replaces ?? "").trim() || null;

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
    goalRow.practical_constraints = await reconcileFoodPreferencesFor({
      admin,
      userId,
      constraints: (goalRow.practical_constraints ?? {}) as Record<string, unknown>,
      source: FN_NAME,
    });

    // --- LA MÉTHODE DU COACH ----------------------------------------------
    const doctrine = await loadPublishedDoctrine(admin, userId);
    if (!doctrine.coachId) {
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

    // --- LE MAPPING ALIMENTAIRE DU COACH ----------------------------------
    //
    // `coach_food_rules` existait, avec son écran, ses gardes et un compilateur
    // couvert par trente tests — et aucun lecteur au runtime. Un coach cochait
    // ses pastilles et le générateur composait sans rien en savoir.
    //
    // Ne bloque JAMAIS: un coach peut n'avoir jamais ouvert `/coach/protocol`
    // et avoir une méthode complète dans sa doctrine. Pas de mapping = pas de
    // bloc, et le reste du prompt est inchangé.
    let protocolBlock = "";
    try {
      const protocol = await loadPublishedProtocol(admin, userId);
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
        .select("timezone, country")
        .eq("id", userId)
        .maybeSingle();
      const timezone = String(
        (tzRes.data as { timezone?: unknown } | null)?.timezone ??
          (profileRes?.data as { timezone?: unknown } | null)?.timezone ?? "",
      ).trim();
      country = String(
        (profileRes?.data as { country?: unknown } | null)?.country ?? "",
      ).trim() || null;
      if (!timezone) throw new Error("no timezone on the plan or the profile");
      todayToken = dayTokenInZone(timezone, new Date());
      // LA DATE, et pas seulement le jour de la semaine. « mercredi » ne dit
      // pas si on est en février ou en août — donc rien ne permettrait au
      // modèle de savoir ce qui est de saison.
      todayDate = localDateInZone(timezone, new Date());
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
        detail: error instanceof Error ? error.message : String(error),
        request_id: requestId,
      }, { status: 400 });
    }

    // `scope` est DÉRIVÉ de la durée et n'est plus reçu: une ligne `scope='day'`
    // portant une fenêtre de sept jours n'est plus exprimable.
    const scope: MealScope = durationDays === 1 ? "day" : "several_days";
    const daysToFill: string[] = windowDayOrder(startsOn, durationDays);

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
    const eatingRhythm = parseEatingRhythm(
      (goalRow.practical_constraints as Record<string, unknown> | null)
        ?.eating_rhythm,
    );
    // LES MOMENTS OÙ IL NE MANGE PAS ICI. Même `const` hissé que le rythme, et
    // pour la même raison: la valeur passée au prompt et celle passée au
    // parseur doivent être LA MÊME lecture, pas deux relectures à tenir
    // d'accord.
    const awayDays = parseAwayDays(
      (goalRow.practical_constraints as Record<string, unknown> | null)
        ?.away_days,
    );

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
        error: error instanceof Error ? error.message : String(error),
        // Journalisé nommément: sans cette ligne, un plancher qui échoue en
        // boucle est indiscernable d'un élève qui n'a jamais saisi de mesure —
        // les deux produisent une consigne sans corps.
        effect: "fail-closed: ni taille ni poids dans la consigne",
      }));
    }

    // LE CORPS. Best-effort, contrairement au plancher: une portion moins bien
    // dimensionnée est le produit d'hier, et refuser le dîner de quelqu'un
    // parce qu'on n'a pas su lire sa balance serait la mauvaise moitié de
    // l'arbitrage. `loadStudentBody` ne rattrape RIEN de son côté (son en-tête
    // le dit), donc l'arbitrage se prend ici, en le nommant.
    // `studentBody` et pas `body`: dans cette fonction, `body` est déjà le
    // corps de la REQUÊTE HTTP.
    let studentBody: MealBodyContext | null = null;
    try {
      studentBody = mealBodyContextFrom(
        await loadStudentBody(admin, userId, todayDate),
        restrictionFlag,
      );
    } catch (error) {
      console.warn(JSON.stringify({
        tag: "keel.meal.student_body_unreadable",
        user_id: userId,
        error: error instanceof Error ? error.message : String(error),
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
    } catch (error) {
      console.warn(`[${FN_NAME}] composition index unavailable`, error);
    }

    const { systemPrompt, userMessage } = buildMealPrompt({
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
      preferences,
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
      foodPreferences: readFoodPreferences(
        goalRow.practical_constraints as Record<string, unknown> | null,
      ),
    });

    const result = await generateWithGemini(
      // FF-027 — le bloc satiété EN QUEUE du message, donc au plus près de la
      // demande: un modèle lit la contrainte la plus proche de la fin comme la
      // plus contraignante (la raison est écrite dans
      // `household_meal_generation.ts`, qui applique la même règle à ses
      // règles de maison).
      systemPrompt, userMessage + hungerSuffix, 0.6, true, [], "auto",
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
    } as const;

    let meal: GeneratedMeal;
    try {
      meal = parseGeneratedMeal(result, parseArgs);
    } catch (error) {
      return jsonResponse(req, {
        error: "meal_unparseable",
        detail: error instanceof Error ? error.message : String(error),
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
          systemPrompt,
          `${userMessage}${hungerSuffix}\n\n${retryInstruction}`,
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
        : "health";
    // FAIL-CLOSED: une lecture du plancher en panne a déjà rendu
    // `restrictionFlag = true` en amont (FF-030 R6), et `studentBody` absent
    // dégrade de toute façon par la MÊME branche de `envelopeFor`.
    // ── FF-042 R6 · LE RÉGIME DÉCLARÉ, ET CE QU'IL REND INCOUVRABLE ───────
    // Lu depuis les contraintes déjà chargées, jamais par une seconde requête:
    // deux lectures de la même table divergent, et c'est celle qu'on regarde le
    // moins qui garde l'ancien comportement.
    //
    // ⚠️ `dietRef` n'entre PAS dans la liste d'évitement — la ceinture reçoit
    // l'expansion (viande, poisson, œuf…), jamais le nom du régime. Ce dépôt a
    // payé le contraire en run réel avec `allergen_ref='diabetes'`.
    const declaredRegime = (constraints ?? [])
      .map((c) => parseDietaryRegime(c.dietRef))
      .find((r): r is NonNullable<typeof r> => r !== null) ?? null;
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
    const envelope = envelopeFor(
      goalToken,
      studentBody,
      studentBody?.ageBand ?? null,
      studentBody?.restrictionFlag ?? true,
      steering,
    );
    const verdictDishesOf = (m: GeneratedMeal) =>
      m.dishes.map((d) => ({
        slot: d.slot,
        method: d.method,
        ingredients: d.ingredients.map((i) => ({
          term: i.term,
          amount: i.amount,
          unit: i.unit,
          state: i.state,
        })),
      }));
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
      const resolution = resolveIngredients(
        composition,
        m.dishes.flatMap((d) =>
          d.ingredients.map((i) => ({
            term: i.term,
            amount: i.amount,
            unit: i.unit,
            state: i.state,
          }))
        ),
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
          foodPreferences: readFoodPreferences(
            goalRow.practical_constraints as Record<string, unknown> | null,
          ),
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
            systemPrompt,
            `${userMessage}${hungerSuffix}\n\n${instruction}`,
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

    if (meal.dishes.length === 0) {
      // Rien n'est écrit. Même arbitrage que le plan vide: un brouillon sans
      // plat donnerait à l'élève l'impression d'un repas.
      return jsonResponse(req, {
        error: "empty_meal",
        lock: meal.lock.reason,
        rejected_numeric: meal.rejected_numeric,
        rejected_aisles: meal.rejected_aisles,
        issues: [...issues, ...meal.issues],
        request_id: requestId,
      }, { status: 422 });
    }

    // ── L'ÉCRITURE PASSE PAR LA RPC, ET C'EST UNE TRANSACTION ────────────
    // Préparer un plan qui démarre avant la fin du courant RACCOURCIT le
    // courant. Deux appels ne peuvent pas garantir l'atomicité de ça, et le
    // seul entrelacement vraiment nuisible est « troncature commitée, insert
    // échoué »: l'élève perd des jours pour un plan qui n'est jamais arrivé.
    //
    // La RPC porte aussi la contrainte d'exclusion en filet: elle refuse
    // nommément un plan qui chevauche un autre sans pouvoir le raccourcir.
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
          context,
          preferences,
          pantry,
          dishes: mealDishesPayload(meal),
          preparations: mealPreparationsPayload(meal),
          cooking_sessions: mealSessionsPayload(meal),
          shopping_list: mealShoppingPayload(meal),
          content_locale: String(goalRow.content_locale ?? "en"),
          generated_from: {
            coach_id: doctrine.coachId,
            doctrine_version: doctrine.doctrine?.version ?? null,
            doctrine_reason: doctrine.reason,
            belief_keys: beliefKeys,
            goal: String(goalRow.goal ?? "health"),
            prompt_version: MEAL_PROMPT_VERSION,
            intent,
            // ── CE QUI A MORDU, ÉCRIT SUR LA LIGNE ────────────────────────
            // Les `issues` ne partaient que dans la RÉPONSE HTTP, donc elles
            // mouraient avec elle: un plan qui garde un lot six jours, ou dont
            // la session déborde le temps déclaré, était écrit en base sans
            // aucune trace du motif. Le contrôle existait et personne ne
            // pouvait le lire — c'est-à-dire qu'il n'existait pas.
            issues: [...issues, ...meal.issues],
            // FF-037 — CE QUE L'ANCRE A COÛTÉ ET RAPPORTÉ, SUR LA LIGNE.
            // Le §10 de la fiche demande deux chiffres: la part de repas
            // principaux sans ancre, et la part de relances qui règlent
            // vraiment le problème. Le second n'est lisible qu'ici: une
            // relance dont on ne garde pas la trace est une relance qu'on
            // paiera sans jamais savoir si elle sert.
            protein_anchor_retry: proteinAnchorRetry,
            protein_anchor_missing: meal.protein_anchor_missing,
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
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500 });
  }
});
