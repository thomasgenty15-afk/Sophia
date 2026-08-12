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
} from "../_shared/keel/doctrine_loader.ts";
// O7 — LA DOCTRINE D'UN MEMBRE DE FOYER SE RÉSOUT PAR LE FOYER. Le chargeur
// direct n'est PAS importé ici: le repli serait alors contournable, et un
// secondaire retomberait sur `no_coach` sans que rien n'échoue. Voir l'en-tête
// de `household_doctrine.ts` pour l'arbitrage (aucune ligne `coach_clients`).
import { loadDoctrineForCaller } from "../_shared/keel/household_doctrine.ts";
import { resolveHouseholdIdFor } from "../_shared/keel/household_turn_context.ts";
import { GOAL_TOKENS, type GoalToken } from "../_shared/keel/tokens.ts";
import { coachNotePromptBlock, loadCoachNote } from "../_shared/keel/coach_note.ts";
import { constraintsForPrompt } from "../_shared/keel/food_preference_promotion.ts";
import { reconcileFoodPreferencesFor } from "../_shared/keel/food_preference_promotion_io.ts";
import { loadStudentSafetyConstraints } from "../_shared/keel/safety_constraints.ts";
import { keelGenerationModel } from "../_shared/keel/generation_model.ts";
// C3 ① — LE DROIT D'ACCÈS EST LU, JAMAIS APPLIQUÉ ICI.
import {
  ACCESS_LOG_TAG,
  ACCESS_NONE,
  ACCESS_UNKNOWN,
  describeAccess,
  readAccessFacts,
} from "../_shared/keel/solo_access.ts";
import { ageBandOf, usableAge, weekPlanAgeGate } from "../_shared/keel/student_age.ts";
import {
  trendOf,
  WAIST_NOISE_CM,
  WEIGHT_NOISE_KG,
} from "../_shared/keel/student_body.ts";
import {
  escalateMinorStudent,
  loadStudentBody,
} from "../_shared/keel/student_body_io.ts";
import { localDateFor } from "../_shared/keel/reengagement_io.ts";
import {
  countHungerDays,
  type HungerWindowSignal,
  hungerSignalProvenance,
  satietyPromptBlock,
} from "../_shared/keel/hunger_signal.ts";
import { loadHungerDays } from "../_shared/keel/hunger_signal_io.ts";
import type { WeeklyAxis } from "../_shared/keel/weekly_flow.ts";
import {
  buildWeekPlanPrompt,
  type CoachPrinciple,
  parseWeekPlan,
  type StudentGoal,
  weekPlanItemsPayload,
  WEEK_PLAN_PROMPT_VERSION,
} from "../_shared/keel/week_plan_generation.ts";

/**
 * PIVOT NUTRITION — N1 : l'élève génère SON plan de la semaine.
 *
 *     LE COACH RECOMMANDE · L'ÉLÈVE DÉCIDE · PERSONNE NE NOTE
 *
 * Appelée par l'app élève, avec le JWT de l'ÉLÈVE. Aucun `user_id` n'est
 * accepté du client: on lit celui du jeton. Un élève ne génère que son plan.
 *
 * CE QU'ELLE ÉCRIT: une ligne `student_week_plans` en `draft`. L'élève adopte
 * ensuite depuis l'app — générer n'est pas adopter, et c'est la nuance qui
 * fait que le plan est le sien plutôt que celui de la machine.
 *
 * CE QU'ELLE N'ÉCRIT JAMAIS: `plan_commitments`. Le plan de l'élève n'est pas
 * une prescription; l'évaluateur ne doit pas pouvoir le voir, sinon on
 * fabrique l'oversurveillance que le produit refuse.
 */

const FN_NAME = "generate-week-plan-v1";

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

/** Le lundi de la semaine d'une date locale. */
function mondayOf(localDate: string): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const dow = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - ((dow + 6) % 7));
  return dt.toISOString().slice(0, 10);
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
    // Le contexte qualitatif de CETTE semaine, en prose libre.
    const weekContext = String(body.context ?? "").trim().slice(0, 2000) || null;
    const weekStart = mondayOf(
      String(body.local_date ?? "").trim() || new Date().toISOString().slice(0, 10),
    );

    // ── LE FOYER, RÉSOLU ICI ET UNE SEULE FOIS (L1/D13, C2) ───────────────
    //
    // La MÊME lecture que `generate-meal-v1`, au même endroit relatif: avant
    // tout ce qui coûte, et CONSOMMÉE deux fois plus bas — par la garde de gel
    // et par le repli de doctrine. Deux définitions de « quel foyer est celui
    // de cette personne » est la dette que ce dépôt a payée le plus souvent.
    //
    // Best-effort ASSUMÉ: une personne sans foyer rend `null`, et c'est le cas
    // nominal du produit individuel.
    let householdId: string | null = null;
    let householdLookupFailed = false;
    try {
      householdId = await resolveHouseholdIdFor(admin, userId);
    } catch (_error) {
      householdLookupFailed = true;
    }

    // ── LE GEL À L'IMPAYÉ, PAR CETTE PORTE AUSSI (L1, D13) ───────────────
    //
    // ⚠️ IL ARRIVE AVEC LE REPLI DE DOCTRINE, ET IL DOIT. Sans lui, C2 ouvrait
    // une porte de génération GRATUITE: un membre de foyer gelé se voyait
    // refuser `generate-meal-v1` (402) et obtenait ici, sous la doctrine
    // empruntée à son maître, une semaine entière — c'est-à-dire exactement le
    // contournement que L1 a mesuré et fermé le 2026-08-11, par une porte
    // voisine. D13 est écrit sans nuance: « foyer impayé ⇒ plus personne ne
    // génère, ni maître ni secondaire ».
    //
    // ⚠️ AUCUNE RÈGLE N'EST ÉCRITE ICI. `keel_household_is_covered` est LA
    // définition unique du dépôt (20260811050000). La réécrire en TypeScript
    // ferait deux définitions qui divergeraient au premier ajustement.
    //
    // FAIL-OPEN, comme les deux autres portes: une lecture de FACTURATION en
    // panne laisse passer — se tromper de sens coupe un client qui paie, ce
    // qu'aucun nouvel essai ne répare. L'échec est journalisé bruyamment.
    //
    // ⚠️ EFFET DE BORD ASSUMÉ, ET IL EST NEUF: le MAÎTRE d'un foyer gelé ne
    // génère plus sa semaine non plus. C'est D13 mot pour mot, et c'est déjà
    // vrai de sa lane repas depuis L1. Retour arrière: retirer ce bloc.
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
      } else if (coverRes.data === false) {
        console.log(JSON.stringify({
          tag: "keel.week_plan.frozen",
          user_id: userId,
          household_id: householdId,
        }));
        // `skipErrorLog`: UN IMPAYÉ N'EST PAS UN INCIDENT. Même arbitrage,
        // mesuré, que les deux autres portes — 15 lignes de `system_error_logs`
        // au niveau `error` pour une seule session de test.
        return jsonResponse(req, {
          error: "household_frozen",
          detail: "This household is paused. Nothing has been deleted - the " +
            "current plan stays readable, and composing resumes as soon as the " +
            "subscription does.",
          request_id: requestId,
        }, { status: 402, skipErrorLog: true });
      }
    }

    // --- l'objectif et la situation de l'élève ----------------------------
    const goalRes = await admin
      .from("student_goals")
      .select("goal, situation, aspiration, focus_axis, practical_constraints, content_locale")
      .eq("user_id", userId)
      .maybeSingle();
    if (goalRes.error) throw goalRes.error;
    if (!goalRes.data) {
      // Fail loud plutôt que générer une semaine générique: sans objectif ni
      // situation, le plan produit serait celui de n'importe qui, et c'est
      // exactement ce que le produit ne vend pas.
      return jsonResponse(req, {
        error: "goal_required",
        detail: "Set a goal and situation before generating a week.",
        request_id: requestId,
      }, { status: 409 });
    }
    const goalRow = goalRes.data as Record<string, unknown>;

    // --- CE QUE L'ÉLÈVE A DÉMENTI DEPUIS ----------------------------------
    // Une préférence gardée est une chaîne dans un jsonb; le souvenir dont
    // elle vient continue de vivre dans `memory_items` et peut y être
    // `superseded` (l'élève est revenu dessus) ou `invalidated` (il a
    // rétracté). Sans ce raccord, mesuré sur un run réel de 3 semaines, le
    // prompt recevait « aime le brocoli rôti » ET « n'aime pas le brocoli ».
    //
    // ICI, avant tout lecteur de `practical_constraints`: la correction est
    // persistée, donc elle vaut aussi pour la carte, l'export et le
    // générateur de repas.
    goalRow.practical_constraints = await reconcileFoodPreferencesFor({
      admin,
      userId,
      constraints: (goalRow.practical_constraints ?? {}) as Record<string, unknown>,
      source: FN_NAME,
    });

    // --- LA MÉTHODE DU COACH, qui est une DOCTRINE et pas un programme -----
    //
    // Cette fonction lisait `plan_templates.commitments`, c'est-à-dire un
    // programme ligne à ligne. Un coach de masterclass n'en a pas: il a des
    // convictions. La lecture précédente renvoyait donc `coach_has_no_program`
    // à tous les coups — la génération était morte à l'allumage pour le seul
    // modèle que le produit vend.
    //
    // L'ancre est désormais `coach_doctrines.beliefs`, et la clé de traçabilité
    // est la clé de conviction.
    //
    // ── O7 · UN MEMBRE DE FOYER COMPOSE SOUS LA DOCTRINE DE SON FOYER ──────
    //
    // MESURÉ EN HTTP RÉEL LE 2026-08-12, sur le MÊME compte secondaire qui
    // venait de composer un repas complet par le repli de C1: cette porte-ci
    // rendait `409 no_coach` en 0,34 s. Et c'est LE chemin du modèle produit —
    // `CLAUDE.md` le nomme en toutes lettres: `student_goals` →
    // `generate-week-plan-v1` → `student_week_plans`. Un secondaire pouvait
    // donc composer son dîner et toujours pas sa semaine.
    //
    // ⚠️ LE MÊME MODULE, PAS UNE SECONDE RÉSOLUTION. `loadDoctrineForCaller`
    // est la fonction que `generate-meal-v1` appelle, avec la même entrée et le
    // même ordre: la doctrine de l'appelant d'abord (le foyer n'est alors même
    // pas lu), et le repli UNIQUEMENT sur la branche qui rendait `no_coach`.
    // Une seconde résolution ici aurait divergé au premier ajustement — c'est
    // la dette la plus chère de ce dépôt.
    //
    // ⚠️ LA LECTURE DIRECTE DE `coach_clients` A DISPARU, et ce n'est pas un
    // nettoyage: elle DOUBLAIT celle du chargeur (même prédicat, `status =
    // 'active'`), donc elle refusait `no_coach` AVANT que le repli n'ait la
    // parole. Le `coachId` archivé plus bas vient maintenant de la doctrine
    // servie — c'est-à-dire du coach dont les convictions ont produit la
    // semaine, ce qui est la seule lecture juste sur un repli.
    //
    // ⚠️ `doctrineGoal` EST NULLABLE, et ce n'est pas le `goal` du prompt (plus
    // bas, qui retombe sur `"health"`). Ici `null` veut dire « pas d'objectif
    // déclaré » et sert la variante `default` — exactement ce que
    // `loadPublishedDoctrine` fait quand il lit lui-même.
    const doctrineGoal: GoalToken | null =
      (GOAL_TOKENS as readonly string[]).includes(String(goalRow.goal ?? "").trim())
        ? (String(goalRow.goal ?? "").trim() as GoalToken)
        : null;
    const resolvedDoctrine = await loadDoctrineForCaller(admin, {
      userId,
      householdId,
      goal: doctrineGoal,
    });
    const doctrine = resolvedDoctrine.doctrine;
    const coachId = doctrine.coachId ?? "";
    if (!coachId) {
      // LE REFUS SURVIT, ET IL LE DOIT. Un compte sans foyer et sans coach, un
      // foyer dont le maître n'a pas de coach non plus, un maître lui-même sans
      // coach: les trois retombent ici. Une garde sans cas qui refuse n'est pas
      // une garde.
      return jsonResponse(req, { error: "no_coach", request_id: requestId }, { status: 409 });
    }

    // ── C3 ① · À QUEL TITRE CE COMPTE PRODUIT-IL — ON MESURE, ON NE FERME PAS
    //
    // La MÊME lecture que `generate-meal-v1`, par le même module: la question
    // ouverte n°1 porte sur un COMPTE, pas sur une porte, et deux mesures avec
    // deux définitions ne se totalisent pas. Aucun refus — voir l'en-tête de
    // `solo_access.ts` pour le piège nommé (`has_app_write_access` couperait
    // des membres de foyer et des sièges de coach qui paient).
    const access = describeAccess(
      await readAccessFacts(admin, { userId, householdId, coachId }),
    );
    if (access.state === ACCESS_NONE || access.state === ACCESS_UNKNOWN) {
      console.log(JSON.stringify({
        tag: ACCESS_LOG_TAG,
        fn: FN_NAME,
        user_id: userId,
        ...access,
      }));
    }

    // LA PORTÉE PAR OBJECTIF PASSE PAR ICI AUSSI, et pas seulement par le bloc.
    //
    // Chaque ligne de semaine est tracée à la clé de la conviction qui la
    // produit. Lire `doctrine.doctrine.beliefs` en direct construirait le plan
    // d'un élève `health` sur une conviction que son coach a écrite pour
    // `fat_loss` — la portée tiendrait dans la conversation et fuirait dans le
    // plan. `doctrineBeliefsFor` rend exactement ce que le bloc injecté
    // contient, ni plus ni moins.
    const principles: CoachPrinciple[] = doctrineBeliefsFor(doctrine)
      // Une conviction SANS clé serait intraçable: le CHECK de la base
      // refuserait toute ligne qui s'en réclame. `parseCoachDoctrine` en
      // dérive une systématiquement, donc ce filtre ne devrait jamais mordre —
      // il est là pour que l'invariant soit vrai par construction et pas par
      // confiance dans un appelant.
      .filter((b) => String(b.key ?? "").trim().length > 0)
      .map((b) => ({
        belief_key: b.key,
        claim: b.claim,
        rationale: b.rationale ?? null,
      }));

    // LA NOTE 1:1 DU COACH SUR CET ÉLÈVE — chargée à côté de la doctrine, et
    // délibérément SANS effet sur `principles`. Une ligne de semaine trace à
    // une clé de conviction (CHECK `..._doctrine_traceable_check`); la note
    // n'en est pas une, et un plan ne peut donc pas se réclamer d'elle.
    const coachNote = await loadCoachNote(admin, userId);

    if (principles.length === 0) {
      // TROIS SITUATIONS, ET PAS UN SEUL CODE POUR LES TROIS.
      //
      // `no_coach` (plus haut) — l'élève n'a pas de coach.
      // `coach_has_no_doctrine` — le coach n'a rien publié.
      // `coach_doctrine_excludes_goal` — le coach a publié, et TOUT ce qu'il a
      //    écrit vise d'autres objectifs que celui de cet élève. Le geste
      //    produit est le sien: changer d'objectif, ou demander au coach
      //    d'élargir. Servir « ton coach n'a pas publié de méthode » lui
      //    ferait attendre quelque chose qui existe déjà.
      const hasSomeBeliefs = (doctrine.doctrine?.beliefs.length ?? 0) > 0;
      return jsonResponse(req, {
        error: hasSomeBeliefs ? "coach_doctrine_excludes_goal" : "coach_has_no_doctrine",
        detail: hasSomeBeliefs
          ? "This coach's published convictions are all written for other goals."
          : "The coach has not published any convictions yet.",
        goal: doctrine.goal,
        request_id: requestId,
      }, { status: 409 });
    }

    // --- LE PLAN ADOPTÉ NE S'ÉCRASE PAS TOUT SEUL --------------------------
    //
    // « Regenerate » sur un plan ADOPTÉ remettait `status='draft'` en silence,
    // parce que l'upsert plus bas écrit toujours `draft`. Mesuré le 2026-08-03
    // (QA agent 5): adopted -> draft, items remplacés, et `adopted_at` CONSERVÉ
    // — une ligne qui porte l'horodatage d'une adoption qu'elle ne revendique
    // plus.
    //
    // Ce n'est pas cosmétique. `keel-daily-pulse-v1` et `keel-weekly-flow-v1`
    // filtrent tous les deux sur `status='adopted'`: une désadoption silencieuse
    // coupe le tap du soir ET le point hebdomadaire de l'élève, sans que rien
    // ne le lui dise.
    //
    // La garde est ICI et pas seulement dans l'app: une confirmation d'UI ne
    // protège que le client qui l'implémente, et ce chemin a vocation à être
    // appelé aussi depuis WhatsApp. L'élève reste maître de son plan — il
    // repasse en renvoyant `replace_adopted: true`, ce que le bouton fait après
    // avoir demandé confirmation.
    //
    // DÉSARMEMENT (P9): pas de plan, ou plan en `draft`/`archived` -> la garde
    // ne mord pas. Testé par le cas prémisse-fausse dans le rapport agent 5.
    const existingRes = await admin
      .from("student_week_plans")
      .select("id, status")
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .maybeSingle();
    if (existingRes.error) throw existingRes.error;
    const existing = existingRes.data as Record<string, unknown> | null;
    if (existing?.status === "adopted" && body.replace_adopted !== true) {
      return jsonResponse(req, {
        error: "plan_already_adopted",
        detail:
          "This week is already adopted. Regenerating replaces it and un-adopts it; " +
          "send replace_adopted to confirm.",
        request_id: requestId,
      }, { status: 409 });
    }

    // --- contraintes dures de l'élève : le second verrou --------------------
    let constraints = null;
    try {
      constraints = await loadStudentSafetyConstraints(admin as never, userId);
    } catch (error) {
      // Même arbitrage que la ceinture de sortie: on ne bloque pas le produit
      // sur un hoquet de lecture, mais l'incident est bruyant.
      console.warn(`[${FN_NAME}] safety constraints unavailable`, error);
    }

    // --- LE CORPS AUQUEL CETTE SEMAINE S'ADRESSE ---------------------------
    //
    // Cette fonction ne lisait QUE `student_goals`. Le produit collecte pourtant
    // le poids et le tour de taille chaque dimanche, et l'âge dort dans
    // `profiles.birth_date` — on construisait une semaine à l'aveugle pour un
    // corps dont on savait des choses.
    //
    // La lecture N'EST PAS best-effort, contrairement aux contraintes de
    // sécurité juste au-dessus: là, un hoquet dégrade une ceinture et on
    // préfère un produit vivant; ici, un hoquet avalé ferait générer la semaine
    // d'un mineur comme s'il était adulte. Les deux erreurs n'ont pas le même
    // prix, donc pas le même traitement. L'exception remonte au catch général,
    // qui rend un 500 honnête.
    const todayLocal = localDateFor(new Date(), null);
    const studentBody = await loadStudentBody(admin, userId, todayLocal);

    // --- LA CEINTURE « MINEUR » --------------------------------------------
    //
    // Décision et alternative écrites dans `_shared/keel/student_age.ts`, et
    // reprises en clair dans STATUS-PLAN-INPUTS.md: on bloque la génération et
    // on prévient le coach, parce qu'un accompagnement nutritionnel de mineur
    // relève de son cadre professionnel et pas du nôtre.
    //
    // DÉSARMEMENT: la ceinture ne mord que sur un mineur AVÉRÉ. Une date
    // absente — le cas de tous les élèves d'avant ce chantier — ne bloque rien.
    const ageGate = weekPlanAgeGate(studentBody.verdict);
    if (!ageGate.allowed) {
      // L'escalade AVANT la réponse: si l'insert échoue, l'élève reçoit un 500
      // et réessaie, plutôt qu'un refus poli dont le coach n'entendrait jamais
      // parler. Un blocage silencieux serait le pire des deux mondes.
      const escalation = await escalateMinorStudent(admin, {
        userId,
        age: ageGate.age ?? 0,
      });
      console.warn(JSON.stringify({
        tag: "keel.week_plan.minor_blocked",
        user_id: userId,
        age: ageGate.age,
        escalated: escalation.escalated,
        reason: escalation.reason,
        contract_change_request_id: escalation.contractChangeRequestId,
      }));
      return jsonResponse(req, {
        error: "minor_student",
        detail:
          "Plan generation is held for students under 18. Your coach has been told.",
        request_id: requestId,
      }, { status: 409 });
    }

    // ── FF-027 · LE SIGNAL DE FAIM DE LA FENÊTRE ──────────────────────────
    //
    // C'EST LA RAISON D'ÊTRE DE LA FICHE: le tap du soir « Rough → Hunger »
    // écrivait une ligne que personne ne lisait, et la semaine suivante était
    // identique à celle qui affamait. Voici le lecteur.
    //
    // DEUX SOURCES, UN SIGNAL: l'axe du tap et la faim déclarée en
    // conversation. Le décompte est DÉRIVÉ ici, à la lecture, sur une fenêtre
    // glissante — jamais entretenu comme un compteur, jamais promu en trait
    // (R4: « a souvent faim » serait faux le mois suivant).
    //
    // LA LECTURE EST BEST-EFFORT, comme les contraintes de sécurité plus haut
    // et contrairement au corps: un hoquet compose la semaine sans le bloc,
    // c'est-à-dire exactement comme avant cette fiche. Refuser de générer
    // parce qu'on n'a pas pu lire la faim priverait l'élève de son plan pour
    // une amélioration.
    let hungerSignal: HungerWindowSignal = {
      days: 0,
      recurrent: false,
      windowStart: todayLocal,
      windowEnd: todayLocal,
    };
    try {
      hungerSignal = countHungerDays(
        await loadHungerDays(admin, { userId, todayLocalDate: todayLocal }),
        todayLocal,
      );
    } catch (error) {
      console.warn(`[${FN_NAME}] hunger signal unavailable`, error);
    }
    // Le bloc, ou `null`. Il n'existe aucune troisième valeur — voir
    // `hunger_signal.ts` (R2: le chemin « moins de nourriture » n'existe pas).
    const hungerSignalBlock = satietyPromptBlock(hungerSignal);
    if (hungerSignalBlock) {
      console.log(JSON.stringify({
        tag: "keel.week_plan.satiety_priority",
        user_id: userId,
        // Le décompte est journalisé ICI et n'entre PAS dans le prompt: ce qui
        // entre dans un prompt finit par sortir dans un texte (fiche §9).
        hunger_days: hungerSignal.days,
        window: [hungerSignal.windowStart, hungerSignal.windowEnd],
      }));
    }

    const goal = String(goalRow.goal ?? "health") as StudentGoal;
    const { systemPrompt, userMessage, allowedKeys, maxNutrition } = buildWeekPlanPrompt({
      principles,
      situation: {
        goal,
        situation: goalRow.situation ? String(goalRow.situation) : null,
        // Le contexte du moment vient du CORPS de la requête, pas du profil:
        // « mariage mardi » ne doit pas survivre au mariage. Il est archivé
        // dans `generated_from` pour qu'on puisse relire, trois semaines plus
        // tard, pourquoi cette semaine-là avait cette forme.
        context: weekContext,
        // Ce que l'élève VEUT, et l'axe qu'il a désigné. Les deux sont lus par
        // `buildWeekPlanPrompt` — sans ça ce seraient deux colonnes qu'on
        // demande à l'élève de remplir sans que rien ne s'en serve, ce que ce
        // module appelle une entrée décorative.
        aspiration: goalRow.aspiration ? String(goalRow.aspiration) : null,
        focusAxis: (goalRow.focus_axis ?? null) as WeeklyAxis | null,
        // `constraintsForPrompt` et pas le jsonb brut: `buildWeekPlanPrompt` le
        // sérialise EN ENTIER, donc toute clé ajoutée part au modèle. La
        // comptabilité de la carte de préférences (les ids écartés) n'a rien à
        // y faire — elle occuperait du budget pour du bruit, et un modèle qui
        // lit « dismissed » à côté de préférences peut les appliquer à l'envers.
        practicalConstraints: constraintsForPrompt(
          (goalRow.practical_constraints ?? {}) as Record<string, unknown>,
        ),
        // Ce que chaque entrée ALTÈRE est documenté dans `student_body.ts`. Une
        // bande d'âge (pas un nombre) et des TENDANCES (pas des valeurs): le
        // modèle n'a aucun usage légitime de « 78,4 kg » qu'il n'ait de
        // « le poids descend », et un chiffre exact finit toujours par
        // ressortir dans une ligne du plan.
        body: {
          ageBand: ageBandOf(usableAge(studentBody.verdict)),
          weightTrend: trendOf(studentBody.weights, WEIGHT_NOISE_KG),
          waistTrend: trendOf(studentBody.waists, WAIST_NOISE_CM),
        },
      },
      doctrineBlock: doctrineBlockFor(doctrine),
      coachNoteBlock: coachNotePromptBlock(coachNote),
      weekStart,
      // VERROU 4, moitié « avant génération ». Le même objet qui alimente
      // `parseWeekPlan` plus bas: une seule lecture, deux moitiés de verrou.
      // `null` ici (lecture en panne) est explicite et voulu — voir le catch
      // ci-dessus, qui log et n'interrompt pas.
      safetyConstraints: constraints,
      // FF-027. `null` quand la fenêtre ne porte pas de faim récurrente, et le
      // prompt est alors mot pour mot celui d'avant cette fiche.
      hungerSignalBlock,
    });

    const result = await generateWithGemini(
      systemPrompt, userMessage, 0.4, true, [], "auto",
      // Même modèle de composition que `generate-meal-v1` — voir
      // `generation_model.ts`. Un plan de semaine porte encore plus de
      // contraintes simultanées qu'un repas.
      { source: FN_NAME, requestId, userId, model: keelGenerationModel() },
    );
    // `generateWithGemini` rend `string | {tool, args}`. Le vérifier plutôt que
    // de caster: un cast rend "" en silence et produit un plan vide.
    if (typeof result !== "string") {
      return jsonResponse(req, { error: "model_returned_tool_call", request_id: requestId }, { status: 502 });
    }

    let plan;
    try {
      plan = parseWeekPlan(result, principles, {
        doctrine: doctrine.doctrine,
        safetyConstraints: constraints,
        // Le plafond EFFECTIF rendu par le prompt, jamais un second calcul —
        // voir le commentaire sur `maxNutrition` dans `buildWeekPlanPrompt`.
        maxNutrition,
      });
    } catch (error) {
      return jsonResponse(req, {
        error: "plan_unparseable",
        detail: error instanceof Error ? error.message : String(error),
        request_id: requestId,
      }, { status: 502 });
    }

    if (plan.items.length === 0) {
      // Un plan vide n'est jamais écrit: soit les verrous ont mordu, soit le
      // modèle n'a rien produit d'utilisable. Dans les deux cas, écrire un
      // brouillon vide donnerait à l'élève l'impression d'un plan.
      return jsonResponse(req, {
        error: "empty_plan",
        lock: plan.lock.reason,
        rejected_keys: plan.rejected_keys,
        rejected_actions: plan.rejected_actions,
        rejected_numeric: plan.rejected_numeric,
        issues: plan.issues,
        request_id: requestId,
      }, { status: 422 });
    }

    const { data: written, error: writeErr } = await admin
      .from("student_week_plans")
      .upsert({
        user_id: userId,
        week_start: weekStart,
        items: weekPlanItemsPayload(plan),
        generated_from: {
          coach_id: coachId,
          doctrine_version: doctrine.doctrine?.version ?? null,
          doctrine_reason: doctrine.reason,
          // ── O7 · PAR QUEL CHEMIN CE COACH A RÉPONDU ────────────────────
          // Écrites SEULEMENT sur un repli, exactement comme sur la lane
          // repas: sur le chemin nominal, `generated_from` est byte-identique
          // à celui d'avant ce lot, et un plan qui ne les porte pas est un
          // plan composé sous le coach de son propre titulaire. Sans elles,
          // « ce coach est le sien » et « ce coach est celui de son foyer »
          // laisseraient la même trace, et les deux se relisent
          // différemment.
          ...(resolvedDoctrine.viaHousehold
            ? {
              doctrine_via_household: true,
              doctrine_owner_user_id: resolvedDoctrine.ownerUserId,
            }
            : {}),
          // Les clés effectivement offertes au modèle. Sans elles, on ne peut
          // pas relire un vieux plan et dire de quelle conviction il partait
          // quand le coach a depuis réécrit sa doctrine.
          belief_keys: principles.map((p) => p.belief_key),
          goal,
          context: weekContext,
          prompt_version: WEEK_PLAN_PROMPT_VERSION,
          // C3 ① — À QUEL TITRE CETTE SEMAINE A ÉTÉ PRODUITE. Écrit toujours,
          // même sur le cas nominal: une clé qui n'apparaît qu'au moment du
          // trou ne se distingue pas d'un lot débranché.
          access,
          // LE CORPS QUI A PRODUIT CETTE SEMAINE, archivé avec elle.
          //
          // Des BANDES et des TENDANCES, pas des valeurs: `generated_from` est
          // relu des semaines plus tard pour comprendre pourquoi la semaine
          // avait cette forme, et il n'a pas à devenir un historique de poids
          // parallèle à `weekly_reviews` — qui, lui, s'efface avec le compte.
          //
          // Sans ça, la baisse d'une ligne (« ça marche déjà ») serait
          // indistinguable d'un modèle qui a été avare ce jour-là.
          body_inputs: {
            age_band: ageBandOf(usableAge(studentBody.verdict)),
            age_known: usableAge(studentBody.verdict) !== null,
            weight_trend: trendOf(studentBody.weights, WEIGHT_NOISE_KG),
            waist_trend: trendOf(studentBody.waists, WAIST_NOISE_CM),
            max_nutrition: maxNutrition,
          },
          // FF-027 — LA PROVENANCE DE L'ADAPTATION, archivée avec le plan.
          //
          // C'est ce qui permet à FF-028 de répondre à « la faim persiste-t-elle
          // MALGRÉ deux adaptations ? » (§10) sans qu'aucun compteur ne vive sur
          // l'élève. Un compteur aurait été le trait durable que R4 interdit;
          // ici on compte des lignes de plan, qui s'effacent avec les plans.
          //
          // Le décompte est archivé, il n'est PAS entré dans le prompt.
          ...hungerSignalProvenance(hungerSignal),
        },
        status: "draft",
        // `adopted_at` remis à NULL avec le statut, et pas laissé tel quel.
        // L'upsert ne touchant que les colonnes citées, un plan régénéré
        // gardait sinon l'horodatage de son adoption précédente: une ligne
        // `draft` datée d'une adoption est une ligne qui ment sur elle-même, et
        // c'est exactement le genre d'incohérence dont on se sert plus tard
        // pour affirmer qu'un élève avait adopté sa semaine.
        adopted_at: null,
        content_locale: String(goalRow.content_locale ?? "en"),
      }, { onConflict: "user_id,week_start" })
      .select("id, week_start, status")
      .single();
    if (writeErr) throw writeErr;

    return jsonResponse(req, {
      ok: true,
      plan: written,
      items: plan.items,
      // Les contrôles voyagent avec la réponse: une clé rejetée est un défaut
      // du modèle que l'app doit pouvoir remonter, pas un silence.
      rejected_keys: plan.rejected_keys,
      rejected_actions: plan.rejected_actions,
      rejected_numeric: plan.rejected_numeric,
      issues: plan.issues,
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
