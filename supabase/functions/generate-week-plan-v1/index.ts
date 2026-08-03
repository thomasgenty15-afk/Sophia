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
  type CoachRecommendation,
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

    // Le programme actif du coach. On lit `plan_templates` — ce que le coach
    // ÉDITE — et pas `plan_commitments`, qui n'existe pas dans le modèle 1:N.
    const tplRes = await admin
      .from("plan_templates")
      .select("id, version, commitments")
      .eq("coach_id", coachId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (tplRes.error) throw tplRes.error;
    const tpl = (tplRes.data ?? null) as Record<string, unknown> | null;
    const rawCommitments = Array.isArray(tpl?.commitments) ? tpl!.commitments as unknown[] : [];
    if (rawCommitments.length === 0) {
      return jsonResponse(req, {
        error: "coach_has_no_program",
        request_id: requestId,
      }, { status: 409 });
    }

    const recommendations: CoachRecommendation[] = [];
    for (const raw of rawCommitments) {
      const c = (raw ?? {}) as Record<string, unknown>;
      const key = String(c.template_commitment_key ?? "").trim();
      // Une recommandation SANS clé est inutilisable: on ne pourrait pas
      // tracer la ligne générée jusqu'à elle, donc le CHECK de la base la
      // refuserait à l'écriture. Mieux vaut l'écarter ici, nommément.
      if (!key) continue;
      recommendations.push({
        template_commitment_key: key,
        title: String(c.title ?? ""),
        student_instruction: c.student_instruction ? String(c.student_instruction) : null,
        activity_class: String(c.activity_class ?? "other"),
        polarity: String(c.polarity ?? "do"),
        slot_key: c.slot_key ? String(c.slot_key) : null,
        scheduled_days: Array.isArray(c.scheduled_days) ? c.scheduled_days as string[] : null,
        priority: String(c.priority ?? "core"),
      });
    }
    if (recommendations.length === 0) {
      return jsonResponse(req, {
        error: "program_has_no_traceable_lines",
        request_id: requestId,
      }, { status: 409 });
    }

    // --- doctrine + contraintes dures : les deux verrous -------------------
    const doctrine = await loadPublishedDoctrine(admin, userId);
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
      recommendations,
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
      plan = parseWeekPlan(result, allowedKeys, {
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
          template_id: tpl?.id ?? null,
          template_version: tpl?.version ?? null,
          doctrine_version: doctrine.doctrine?.version ?? null,
          doctrine_reason: doctrine.reason,
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
