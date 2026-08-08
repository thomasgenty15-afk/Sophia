/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
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
      .select("goal, situation, practical_constraints, content_locale")
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

    // LUE UNE FOIS, servie deux fois: le prompt ANNONCE le plafond de temps,
    // le parseur le VÉRIFIE. Deux lectures du même jsonb finiraient par
    // diverger, et la divergence se paierait sur le seul contrôle qui dit à
    // l'élève que sa session ne tient pas.
    const capacity = readCookingCapacity(
      goalRow.practical_constraints as Record<string, unknown> | null,
    );

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

    const { systemPrompt, userMessage } = buildMealPrompt({
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
      { source: FN_NAME, requestId, userId },
    );
    if (typeof result !== "string") {
      return jsonResponse(req, { error: "model_returned_tool_call", request_id: requestId }, { status: 502 });
    }

    let meal;
    try {
      meal = parseGeneratedMeal(result, {
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
        // Le temps par session est un PLAFOND. Le prompt l'annonce, le parseur
        // le vérifie: mesuré 30 déclarées contre 55 produites.
        cookingTimeMin: capacity.cookingTimeMin,
      });
    } catch (error) {
      return jsonResponse(req, {
        error: "meal_unparseable",
        detail: error instanceof Error ? error.message : String(error),
        request_id: requestId,
      }, { status: 502 });
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
