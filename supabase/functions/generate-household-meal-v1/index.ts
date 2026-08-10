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
import { proteinAnchorRetryInstruction } from "../_shared/keel/protein_anchor.ts";
import type { CompositionIndex } from "../_shared/keel/food_composition.ts";
import { loadCompositionIndex } from "../_shared/keel/food_composition_io.ts";
import {
  MEMBER_AGE_STATES,
  type MemberAgeState,
} from "../_shared/keel/household.ts";
import { applyHouseRuleLock } from "../_shared/keel/household_restriction_lock.ts";
import {
  type HouseholdAllergyRow,
  householdHardConstraints,
  loadHouseholdAllergies,
} from "../_shared/keel/household_safety.ts";
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
import { loadHouseholdMemberBodies } from "../_shared/keel/household_bodies.ts";
import {
  memberDeltasPayload,
  resolveHousehold,
  toHouseholdMember,
} from "../_shared/keel/household_composition.ts";
import { envelopeFor } from "../_shared/keel/meal_envelope.ts";
import { GOAL_TOKENS, type GoalToken } from "../_shared/keel/tokens.ts";
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
 * ── LE MINEUR N'EST PAS UNE CIBLE (§8.4), ET « JE NE SAIS PAS » NON PLUS ─
 * L'objectif d'une bouche vit sur SA LIGNE DE FOYER depuis le 2026-08-10, plus
 * dans `student_goals` — sans quoi une personne sans compte n'en aurait aucun,
 * et la bifurcation des portions serait muette pour exactement les gens que le
 * produit veut servir.
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
  /**
   * `null` pour une bouche sans compte. Sert UNIQUEMENT à savoir où chercher
   * ses contraintes de sécurité et son corps, qui restent clés sur
   * `auth.users`. Ce n'est PAS son identité: `memberId` l'est.
   */
  userId: string | null;
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
    const roster = (rosterRes.data ?? []) as Array<{
      member_id: string;
      user_id: string | null;
      first_name: string;
      age_state: string;
      role: string;
      goal: string | null;
    }>;
    if (roster.length === 0) {
      return jsonResponse(req, { error: "empty_household", request_id: requestId }, { status: 409 });
    }
    // LES COMPTES DU FOYER — un sous-ensemble, désormais. Sert l'union des
    // contraintes de sécurité, qui reste clée sur `auth.users`.
    const accountIds = roster
      .map((r) => r.user_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

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
    const country = String(ownerProfile.country ?? "").trim() || null;

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
    // L'objectif vient de la LIGNE MEMBRE, plus jamais de `student_goals`. La
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
      };
    });

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
    const composerMemberId =
      members.find((m) => m.userId === userId)?.memberId ?? null;
    const resolution = resolveHousehold({
      members: members.map((m) =>
        toHouseholdMember(
          m,
          // L'enveloppe PAR MEMBRE. `goalApplies` a déjà mis `goal` à `null`
          // pour un mineur et pour une bouche d'âge inconnu, donc aucune
          // enveloppe n'en dérive — la garde vit là-bas, pas ici.
          m.goal === null || m.body === null ? null : envelopeFor(
            (GOAL_TOKENS as readonly string[]).includes(m.goal)
              ? (m.goal as GoalToken)
              : "health",
            m.body,
            m.body.ageBand,
            // FAIL-CLOSED, comme sur la lane individuelle.
            m.body.restrictionFlag ?? true,
            // Le pilotage du coach du foyer n'entre pas ici: le tronc est
            // commun, et la doctrine qui le gouverne est celle du RÉFÉRENT,
            // pas celle de chaque membre. À instruire avec FF-043 §11.
            null,
          ),
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
      // L'INSTRUMENTATION D'A3: sans elle, la décision d'armer le slot de
      // dressage se prendrait à l'aveugle.
      residual_gaps: resolution.residualGaps.map((g) => g.gapKcalPerDay),
    }));

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
      // La langue du foyer est celle de la ligne du compte maître, comme le
      // reste de ce qui gouverne la composition.
      contentLocale: String(goalRow.content_locale ?? "").trim() || "en-GB",
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
      // ── FF-030 · LES CONTRAINTES DURES, ICI AUSSI ──────────────────────
      // Cette lane portait exactement le même trou que `generate-meal-v1`:
      // l'UNION des contraintes de tous les membres était chargée (et son
      // échec est BLOQUANT ici, ce qui est le bon arbitrage pour un foyer),
      // puis passée au seul `parseGeneratedMeal`. Le modèle composait le dîner
      // d'une tablée sans savoir qui y est allergique.
      //
      // C'est le paramètre REQUIS qui a rendu cet appelant visible: le
      // compilateur l'a listé. Optionnel, il aurait gardé son trou.
      // ── FF-051 · LES APPORTS FIXES NE SONT PAS ENCORE UNE DONNÉE DE FOYER
      // Le shaker d'un membre n'est pas celui de la table: il appartient au
      // canal des DELTAS (FF-043), que `DELTA_CHANNELS` ne porte pas encore.
      // Lire ici `practical_constraints` du seul titulaire ferait sauter le
      // petit-déjeuner de TOUTE la tablée parce qu'UNE personne prend un
      // shaker — un substitut à une dépendance manquante, exactement ce que
      // ce paramètre requis existe pour rendre visible.
      //
      // `[]` est donc le comportement d'AVANT, assumé et nommé. Le trou est
      // écrit en toutes lettres dans FF-051 §11 Q1.
      fixedIntakes: [],
      // ── FF-052 · LES PROPRIÉTÉS DE JOUR NE SONT PAS ENCORE UNE DONNÉE DE
      // FOYER. Le dimanche batch d'un membre n'est pas celui de la table, et
      // la question est la même que pour l'apport fixe juste au-dessus: le
      // canal des deltas ne la porte pas. `[]` est le comportement d'AVANT,
      // assumé et nommé (FF-052 §11 Q3).
      dayProperties: [],
      safetyConstraints: constraints,
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
      envyLine,
      restrictions,
    });

    const result = await generateWithGemini(
      systemPrompt + household.systemSuffix,
      // FF-027 AVANT les règles de maison, et l'ordre est le sujet: le bloc de
      // `household_meal_generation.ts` doit rester le DERNIER, parce que c'est
      // lui qui doit survivre à une envie contradictoire. La satiété est une
      // priorité de composition, pas une règle de maison.
      userMessage + hungerSuffix + household.userSuffix,
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

    // Hissés en `const` pour la même raison que sur la lane individuelle: la
    // relance FF-037 doit repasser par EXACTEMENT les mêmes verrous, et deux
    // objets d'arguments écrits à la main divergent au premier paramètre
    // ajouté.
    const parseArgs = {
      doctrine: doctrine.doctrine,
      safetyConstraints: constraints,
      // FF-051 — la MÊME valeur que la consigne, et pour la même raison
      // qu'elle est vide: voir le bloc au-dessus de `buildMealPrompt`.
      fixedIntakes: [],
      dayProperties: [],
      mode: "to_shop",
      scope,
      pantry: [],
      beliefKeys,
      eatingRhythm,
      daysToFill,
      awayDays,
      cookingTimeMin: capacity.cookingTimeMin,
      // FF-038 — LE RÉFÉRENTIEL DE COMPOSITION.
      // Chargé plus haut dans un try/catch: `null` quand la lecture a
      // échoué. L'instrumentation ne doit jamais coûter un dîner, et le
      // parseur compte l'indisponibilité nommément plutôt que de la
      // laisser ressembler à un modèle qui n'écrit pas ses quantités.
      composition,
    } as const;

    let meal;
    try {
      meal = parseGeneratedMeal(result, parseArgs);
    } catch (error) {
      return jsonResponse(req, {
        error: "meal_unparseable",
        detail: error instanceof Error ? error.message : String(error),
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
    let proteinAnchorRetry = false;
    const anchorMissingBefore = meal.protein_anchor_missing.length;
    if (anchorMissingBefore > 0) {
      const retryInstruction = proteinAnchorRetryInstruction(meal.protein_anchor_missing);
      try {
        const retryResult = await generateWithGemini(
          systemPrompt + household.systemSuffix,
          `${userMessage}${hungerSuffix}${household.userSuffix}\n\n${retryInstruction}`,
          0.6,
          true,
          [],
          "auto",
          { source: `${FN_NAME}.protein_anchor_retry`, requestId, userId },
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
          // FF-043 — LES ADD-ONS, EN GRAMMES D'ALIMENT.
          //
          // ⚠️ NE SORTENT JAMAIS: la raison d'un delta, l'objectif d'un
          // membre, un différentiel lisible, toute mention de corps ou de
          // flag. Ce payload porte un aliment et des grammes, comme n'importe
          // quelle ligne de recette — et il n'y a AUCUNE prose à assainir.
          member_deltas: memberDeltasPayload(resolution.deltas),
          generated_from: {
            coach_id: doctrine.coachId,
            doctrine_version: doctrine.doctrine?.version ?? null,
            doctrine_reason: doctrine.reason,
            belief_keys: beliefKeys,
            goal: String(goalRow.goal ?? "health"),
            prompt_version: `${MEAL_PROMPT_VERSION}+household`,
            intent,
            // FF-037 — même trace que sur la lane individuelle. La mesure du
            // §10 se lit sur les deux lanes ou sur aucune: un chiffre calculé
            // sur la moitié de la population est un chiffre faux.
            protein_anchor_retry: proteinAnchorRetry,
            protein_anchor_missing: meal.protein_anchor_missing,
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
            },
            issues: [...issues, ...meal.issues, ...portionIssues],
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

    return jsonResponse(req, {
      ok: true,
      meal: writtenRow ? { id: writtenRow.meal_id } : null,
      window: { starts_on: startsOn, duration_days: durationDays },
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
      member_portions: memberPortionsPayload(portions),
      member_deltas: memberDeltasPayload(resolution.deltas),
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
