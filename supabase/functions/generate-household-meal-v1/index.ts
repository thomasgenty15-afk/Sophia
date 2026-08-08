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
import { loadPublishedProtocol, protocolBlockFor } from "../_shared/keel/protocol_loader.ts";
import {
  loadStudentSafetyConstraints,
  type StudentSafetyConstraint,
} from "../_shared/keel/safety_constraints.ts";
import { foodPreferencesForPrompt } from "../_shared/keel/food_preference_promotion.ts";
import { reconcileFoodPreferencesFor } from "../_shared/keel/food_preference_promotion_io.ts";
import { dayTokenInZone, localDateInZone } from "../_shared/keel/local_date.ts";
import {
  type MealWindowRequest,
  resolveRequestedWindow,
  windowDayOrder,
} from "../_shared/keel/meal_plan_window.ts";
import {
  buildMealPrompt,
  MEAL_PROMPT_VERSION,
  type MealScope,
  mealDishesPayload,
  mealPreparationsPayload,
  mealSessionsPayload,
  mealShoppingPayload,
  parseAwayDays,
  parseEatingRhythm,
  parseGeneratedMeal,
} from "../_shared/keel/meal_generation.ts";
import { assessBirthDate } from "../_shared/keel/student_age.ts";
import { applyHouseRuleLock } from "../_shared/keel/household_restriction_lock.ts";
import {
  buildHouseholdPromptBlocks,
  extractMemberPortions,
  type HouseholdRestriction,
} from "../_shared/keel/household_meal_generation.ts";
import {
  memberPortionsPayload,
  type MemberGoal,
  MEMBER_GOALS,
  type PortionMember,
  reconcilePortions,
} from "../_shared/keel/household_portions.ts";
import type { EnvySubmission } from "../_shared/keel/household_envies.ts";

/**
 * `generate-household-meal-v1` — UNE cuisson, des portions qui divergent.
 *
 * Autorité produit: docs/keel/PIVOT-FOYER.md §3 (l'unité est la session de
 * cuisine) et §8 (le conseil de famille).
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
 * ── LE MINEUR N'EST PAS UNE CIBLE (§8.4) ────────────────────────────────
 * `student_goals` n'est LU QUE pour les majeurs. Ce n'est pas un `if` de
 * confort: la lecture est filtrée en amont, donc il n'existe aucun chemin par
 * lequel l'objectif d'un enfant pourrait atteindre le prompt — même si
 * quelqu'un en écrivait un en base par un autre chemin.
 */

const FN_NAME = "generate-household-meal-v1";

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
    budgetBand: pick(pc?.budget_band, ["tight", "normal", "comfortable"]),
  };
}

interface LoadedMember extends PortionMember {
  /** Pour l'union des contraintes de sécurité du foyer. */
  isOwner: boolean;
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

    const hhRes = await admin
      .from("households").select("kind").eq("id", householdId).maybeSingle();
    if (hhRes.error) throw hhRes.error;
    const householdKind = String((hhRes.data as { kind?: unknown } | null)?.kind ?? "family");

    // ── LES MEMBRES ─────────────────────────────────────────────────────
    const rosterRes = await admin
      .from("household_members")
      .select("user_id, role")
      .eq("household_id", householdId);
    if (rosterRes.error) throw rosterRes.error;
    const roster = (rosterRes.data ?? []) as Array<{ user_id: string; role: string }>;
    if (roster.length === 0) {
      return jsonResponse(req, { error: "empty_household", request_id: requestId }, { status: 409 });
    }
    const memberIds = roster.map((r) => r.user_id);

    const profilesRes = await admin
      .from("profiles")
      .select("id, full_name, birth_date, timezone, country, locale")
      .in("id", memberIds);
    if (profilesRes.error) throw profilesRes.error;
    const profiles = new Map(
      ((profilesRes.data ?? []) as Array<Record<string, unknown>>).map((p) => [String(p.id), p]),
    );

    // --- LE JOUR DU COMPTE MAÎTRE, dans SON fuseau ------------------------
    // Le foyer cuisine ensemble: il n'a qu'un seul calendrier, et c'est celui
    // de la personne qui compose. Faire la moyenne de quatre fuseaux
    // produirait une date que personne n'habite.
    const ownerProfile = profiles.get(userId) ?? {};
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
    const country = String(ownerProfile.country ?? "").trim() || null;

    // ── L'OBJECTIF: LU POUR LES MAJEURS SEULEMENT ───────────────────────
    // La ceinture est ICI, en amont de toute lecture. Un mineur n'a pas
    // d'objectif dans ce produit (§8.4) — et le filtre est sur la REQUÊTE,
    // pas sur son résultat, pour qu'aucune ligne d'objectif écrite par un
    // autre chemin ne puisse atteindre le prompt.
    const adults: string[] = [];
    const minors = new Set<string>();
    for (const id of memberIds) {
      const verdict = assessBirthDate(
        (profiles.get(id)?.birth_date as string | null) ?? null,
        todayDate,
      );
      if (verdict.status === "minor") minors.add(id);
      else adults.push(id);
    }

    const goalsRes = adults.length > 0
      ? await admin
        .from("student_goals")
        .select("user_id, goal, situation, practical_constraints, content_locale")
        .in("user_id", adults)
      : { data: [], error: null };
    if (goalsRes.error) throw goalsRes.error;
    const goals = new Map(
      ((goalsRes.data ?? []) as Array<Record<string, unknown>>)
        .map((g) => [String(g.user_id), g]),
    );

    const ownerGoal = goals.get(userId);
    if (!ownerGoal) {
      return jsonResponse(req, {
        error: "goal_required",
        detail: "Set a goal and situation before we cook for your household.",
        request_id: requestId,
      }, { status: 409 });
    }

    const members: LoadedMember[] = roster.map((r) => {
      const p = profiles.get(r.user_id) ?? {};
      const rawGoal = String(goals.get(r.user_id)?.goal ?? "").trim();
      const goal = (MEMBER_GOALS as readonly string[]).includes(rawGoal)
        ? (rawGoal as MemberGoal)
        : null;
      return {
        userId: r.user_id,
        // Le prénom seul: le nom complet d'un enfant n'a rien à faire dans un
        // prompt, et « Marc » suffit à une consigne de service.
        displayName: String(p.full_name ?? "").trim().split(/\s+/)[0] || "Member",
        goal: minors.has(r.user_id) ? null : goal,
        isMinor: minors.has(r.user_id),
        isOwner: r.role === "owner",
      };
    });

    // ── LES RESTRICTIONS DE MAISON ──────────────────────────────────────
    // Lues telles quelles. Le fait qu'elles soient LÉGITIMES a déjà été
    // tranché à l'écriture (`keel_household_add_restriction`): mode famille,
    // compte maître, mineur ou majeur consentant. Les rejuger ici ferait une
    // seconde définition de la règle, qui divergerait.
    const restrRes = await admin
      .from("household_food_restrictions")
      .select("member_user_id, label")
      .eq("household_id", householdId);
    if (restrRes.error) throw restrRes.error;
    const nameOf = new Map(members.map((m) => [m.userId, m.displayName]));
    const restrictions: HouseholdRestriction[] =
      ((restrRes.data ?? []) as Array<{ member_user_id: string; label: string }>)
        .filter((r) => nameOf.has(r.member_user_id))
        .map((r) => ({
          memberUserId: r.member_user_id,
          memberDisplayName: nameOf.get(r.member_user_id)!,
          label: r.label,
        }));

    // ── LES ENVIES DE LA SEMAINE ────────────────────────────────────────
    const windowRequest = readWindowRequest(body.window);
    if (!windowRequest) {
      return jsonResponse(req, {
        error: "window_required",
        detail: "window must be {kind:'until_sunday'} | {kind:'days',count} | " +
          "{kind:'exact',starts_on,duration_days}",
        request_id: requestId,
      }, { status: 400 });
    }
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

    const envyRes = await admin
      .from("household_envy_submissions")
      .select("user_id, body")
      .eq("household_id", householdId)
      .eq("week_start", startsOn);
    if (envyRes.error) throw envyRes.error;
    const envies = ((envyRes.data ?? []) as Array<{ user_id: string; body: string }>)
      .map((e): EnvySubmission => ({ userId: e.user_id, body: e.body }));

    // ── LA MÉTHODE: CELLE DU COMPTE MAÎTRE ──────────────────────────────
    // Un foyer suit UNE méthode. Mélanger celles de deux coachs produirait un
    // plan qu'aucun des deux n'a écrit, signé des deux — exactement ce que le
    // verrou existe pour empêcher.
    const doctrine = await loadPublishedDoctrine(admin, userId);
    if (!doctrine.coachId) {
      return jsonResponse(req, { error: "no_coach", request_id: requestId }, { status: 409 });
    }
    const beliefKeys = doctrineBeliefsFor(doctrine)
      .map((b) => String(b.key ?? "").trim())
      .filter(Boolean);
    const coachNote = await loadCoachNote(admin, userId);

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
    for (const id of memberIds) {
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

    // ── LE PROMPT ───────────────────────────────────────────────────────
    const goalRow = ownerGoal as Record<string, unknown>;

    // ── CE QUE L'ÉLÈVE A DÉMENTI DEPUIS — LE TROISIÈME CHEMIN ─────────────
    // `generate-meal-v1` porte ce raccord avec cette raison écrite: « Une garde
    // qui ne couvre qu'un des deux chemins d'un même jsonb est une garde qu'on
    // croit posée. » Il y a TROIS chemins, et celui-ci était le découvert:
    // vérifié le 2026-08-08, ce fichier n'importait que le module PUR
    // (`food_preference_promotion.ts`) et jamais son module d'I/O, donc il
    // servait `practical_constraints` tel quel.
    //
    // Ce que ça coûtait, et c'est exactement FF-026 R3 (« la rétractation est
    // honorée »): un foyer qui ne compose QUE des repas de foyer ne
    // réconciliait jamais. La préférence que l'élève a rétractée dans la
    // conversation — proprement enregistrée par le memorizer en `superseded` —
    // continuait d'être servie au modèle, sans limite de temps, puisque rien
    // sur ce chemin ne relit la mémoire. La réconciliation PERSISTE en plus de
    // corriger, donc poser le raccord ici répare aussi les deux autres.
    goalRow.practical_constraints = await reconcileFoodPreferencesFor({
      admin,
      userId,
      constraints: (goalRow.practical_constraints ?? {}) as Record<string, unknown>,
      source: FN_NAME,
    });

    const pc = goalRow.practical_constraints as Record<string, unknown> | null;
    const eatingRhythm = parseEatingRhythm(pc?.eating_rhythm);
    // LES ABSENCES DU FOYER, lues sur la ligne du PROPRIÉTAIRE — comme le
    // rythme et la capacité juste au-dessus. Une absence individuelle d'un
    // membre est une autre question (voir FF-002 §9): elle ne supprime pas la
    // session de cuisson, elle change les portions.
    const awayDays = parseAwayDays(pc?.away_days);
    const capacity = readCookingCapacity(pc);
    const scope: MealScope = durationDays === 1 ? "day" : "several_days";
    const daysToFill = windowDayOrder(startsOn, durationDays);

    const { systemPrompt, userMessage } = buildMealPrompt({
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
      servings: Math.min(12, Math.max(1, members.length)),
      pantry: [],
      todayToken,
      today: todayDate,
      country,
      daysToFill,
      eatingRhythm,
      awayDays,
      ...capacity,
      foodPreferences: foodPreferencesForPrompt(pc),
    });

    const household = buildHouseholdPromptBlocks({
      members,
      envies,
      restrictions,
    });

    const result = await generateWithGemini(
      systemPrompt + household.systemSuffix,
      userMessage + household.userSuffix,
      0.6,
      true,
      [],
      "auto",
      { source: FN_NAME, requestId, userId },
    );
    if (typeof result !== "string") {
      return jsonResponse(req, {
        error: "model_returned_tool_call",
        request_id: requestId,
      }, { status: 502 });
    }

    let meal;
    try {
      meal = parseGeneratedMeal(result, {
        doctrine: doctrine.doctrine,
        safetyConstraints: constraints,
        mode: "to_shop",
        scope,
        pantry: [],
        beliefKeys,
        eatingRhythm,
        daysToFill,
        awayDays,
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
      return jsonResponse(req, {
        error: "empty_meal",
        lock: meal.lock.reason,
        issues: [...issues, ...meal.issues],
        request_id: requestId,
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
    const lock = applyHouseRuleLock(
      mealDishesPayload(meal),
      restrictions.map((r) => r.label),
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

    // ── LES PORTIONS, RÉCONCILIÉES AVEC LE FOYER RÉEL ───────────────────
    const { portions, issues: portionIssues } = reconcilePortions(
      members,
      extractMemberPortions(result),
    );

    // ── L'ÉCRITURE: LA MÊME RPC QUE LE CHEMIN INDIVIDUEL ────────────────
    const intent = String(body.intent ?? "replace_current").trim();
    if (intent !== "replace_current" && intent !== "prepare_next") {
      return jsonResponse(req, {
        error: "unknown_intent",
        detail: "intent must be replace_current or prepare_next",
        request_id: requestId,
      }, { status: 400 });
    }
    const replaces = String(body.replaces ?? "").trim() || null;

    const { data: writtenRows, error: writeErr } = await admin.rpc(
      "write_student_meal_plan",
      {
        p_user_id: userId,
        p_intent: intent,
        p_starts_on: startsOn,
        p_duration_days: durationDays,
        p_replaces: replaces,
        p_payload: {
          mode: "to_shop",
          meal_slot: null,
          servings: members.length,
          context: String(body.context ?? "").trim().slice(0, 2000) || null,
          preferences: String(body.preferences ?? "").trim().slice(0, 2000) || null,
          pantry: [],
          dishes,
          preparations: mealPreparationsPayload(meal),
          cooking_sessions: mealSessionsPayload(meal),
          shopping_list: mealShoppingPayload(meal),
          content_locale: String(goalRow.content_locale ?? "en"),
          household_id: householdId,
          member_portions: memberPortionsPayload(portions),
          generated_from: {
            coach_id: doctrine.coachId,
            doctrine_version: doctrine.doctrine?.version ?? null,
            doctrine_reason: doctrine.reason,
            belief_keys: beliefKeys,
            goal: String(goalRow.goal ?? "health"),
            prompt_version: `${MEAL_PROMPT_VERSION}+household`,
            intent,
            household: {
              id: householdId,
              kind: householdKind,
              member_count: members.length,
              minor_count: minors.size,
              // QUI A PARLÉ ET QUI S'EST TU, écrit sur la ligne. Sans ça,
              // « pourquoi Léa a-t-elle eu ça ? » n'a pas de réponse trois
              // jours plus tard — et c'est exactement la question qu'un foyer
              // pose.
              spoken: household.spoken,
              silent: household.silent,
              restriction_count: restrictions.length,
            },
            issues: [...issues, ...meal.issues, ...portionIssues],
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

    return jsonResponse(req, {
      ok: true,
      meal: writtenRow ? { id: writtenRow.meal_id } : null,
      window: { starts_on: startsOn, duration_days: durationDays },
      household: {
        id: householdId,
        kind: householdKind,
        spoken: household.spoken,
        silent: household.silent,
      },
      dishes,
      preparations: mealPreparationsPayload(meal),
      cooking_sessions: mealSessionsPayload(meal),
      shopping_list: mealShoppingPayload(meal),
      member_portions: memberPortionsPayload(portions),
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
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500 });
  }
});
