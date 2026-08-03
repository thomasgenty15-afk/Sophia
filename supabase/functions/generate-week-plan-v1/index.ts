/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import { doctrineBlockFor, loadPublishedDoctrine } from "../_shared/keel/doctrine_loader.ts";
import { loadStudentSafetyConstraints } from "../_shared/keel/safety_constraints.ts";
import {
  buildWeekPlanPrompt,
  type CoachPrinciple,
  focusFor,
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
    const weekStart = mondayOf(
      String(body.local_date ?? "").trim() || new Date().toISOString().slice(0, 10),
    );

    // --- l'objectif et la situation de l'élève ----------------------------
    const goalRes = await admin
      .from("student_goals")
      .select("goal, situation, practical_constraints, content_locale")
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

    // --- les RECOMMANDATIONS du coach (son programme, pas une prescription)
    const linkRes = await admin
      .from("coach_clients")
      .select("coach_id")
      .eq("student_user_id", userId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (linkRes.error) throw linkRes.error;
    const coachId = String((linkRes.data as Record<string, unknown> | null)?.coach_id ?? "").trim();
    if (!coachId) {
      return jsonResponse(req, { error: "no_coach", request_id: requestId }, { status: 409 });
    }

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
    const doctrine = await loadPublishedDoctrine(admin, userId);

    const principles: CoachPrinciple[] = (doctrine.doctrine?.beliefs ?? [])
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

    if (principles.length === 0) {
      // Distinct de `no_coach`: l'élève A un coach, ce coach n'a simplement
      // pas encore publié sa méthode. Les deux appellent des gestes très
      // différents côté produit, donc deux codes.
      return jsonResponse(req, {
        error: "coach_has_no_doctrine",
        detail: "The coach has not published any convictions yet.",
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

    const goal = String(goalRow.goal ?? "health") as StudentGoal;
    const { systemPrompt, userMessage, allowedKeys } = buildWeekPlanPrompt({
      principles,
      situation: {
        goal,
        situation: goalRow.situation ? String(goalRow.situation) : null,
        practicalConstraints: (goalRow.practical_constraints ?? {}) as Record<string, unknown>,
      },
      doctrineBlock: doctrineBlockFor(doctrine),
      weekStart,
    });

    const result = await generateWithGemini(
      systemPrompt, userMessage, 0.4, true, [], "auto",
      { source: FN_NAME, requestId, userId },
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
        maxNutrition: focusFor(goal).maxNutrition,
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
          // Les clés effectivement offertes au modèle. Sans elles, on ne peut
          // pas relire un vieux plan et dire de quelle conviction il partait
          // quand le coach a depuis réécrit sa doctrine.
          belief_keys: principles.map((p) => p.belief_key),
          goal,
          prompt_version: WEEK_PLAN_PROMPT_VERSION,
        },
        status: "draft",
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
