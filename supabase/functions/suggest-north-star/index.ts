import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, handleCorsOptions, getCorsHeaders } from "../_shared/cors.ts";
import { generateWithGemini } from "../_shared/gemini.ts";

type Suggestion = {
  title: string;
  metric_type: "number" | "scale_10" | "counter";
  unit: string;
};

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function extractQualitativeText(answersRows: any[]): {
  why: string;
  blockers: string;
  actions_good_for_me: string;
} {
  const candidates: Array<{ why: string; blockers: string; actions_good_for_me: string; score: number }> = [];

  for (const row of answersRows) {
    const c = (row as any)?.content ?? {};
    const assistantInput = c?.assistant_context?.input ?? c?.ui_state?.assistant_context?.input ?? {};
    const fromInputs = c?.inputs ?? {};
    const fromRoot = c ?? {};

    const why = str(fromRoot?.why) || str(fromInputs?.why) || str(assistantInput?.improvement);
    const blockers = str(fromRoot?.blockers) || str(fromInputs?.blockers) || str(assistantInput?.obstacles);
    const actionsGood = str(fromRoot?.actions_good_for_me) || str(fromInputs?.actions_good_for_me) ||
      str(assistantInput?.other);

    const score = (why ? 1 : 0) + (blockers ? 1 : 0) + (actionsGood ? 1 : 0);
    candidates.push({ why, blockers, actions_good_for_me: actionsGood, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] ?? { why: "", blockers: "", actions_good_for_me: "" };
  return best;
}

function buildGoalSummary(goals: any[], structuredDataRows: any[]): string {
  const lines: string[] = [];
  const byAxisId = new Map<string, any>();

  for (const row of structuredDataRows) {
    const arr = Array.isArray(row?.content?.structured_data) ? row.content.structured_data : [];
    for (const item of arr) {
      const axisId = str(item?.selected_axis?.id);
      if (!axisId) continue;
      byAxisId.set(axisId, item);
    }
  }

  goals.forEach((g, idx) => {
    const axisId = str((g as any)?.axis_id);
    const axisTitle = str((g as any)?.axis_title) || `Axe ${idx + 1}`;
    const themeId = str((g as any)?.theme_id);
    const reasoning = str((g as any)?.reasoning);
    const details = byAxisId.get(axisId);
    const problems = Array.isArray(details?.selected_axis?.problems)
      ? details.selected_axis.problems
        .map((p: any) => str(p?.problem_label))
        .filter(Boolean)
        .join(", ")
      : "";
    lines.push(`- ${axisTitle} (theme: ${themeId || "n/a"})${problems ? ` | problèmes: ${problems}` : ""}${reasoning ? `\n  Raisonnement IA: ${reasoning}` : ""}`);
  });

  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({} as any));
    const submissionId = str((body as any)?.submission_id);
    const goalId = str((body as any)?.goal_id);
    
    if (!submissionId) {
      return new Response(JSON.stringify({ error: "Missing submission_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = str(Deno.env.get("SUPABASE_URL"));
    const anonKey = str(Deno.env.get("SUPABASE_ANON_KEY"));
    const serviceKey = str(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const authHeader = req.headers.get("Authorization") ?? "";

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = authData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    const [
      { data: goals },
      { data: answers },
      { data: goalsQual },
      { data: activeGoal },
      { data: activePlan },
    ] = await Promise.all([
      admin
        .from("user_goals")
        .select("id, axis_id, axis_title, theme_id, priority_order, reasoning")
        .eq("user_id", userId)
        .eq("submission_id", submissionId)
        .order("priority_order", { ascending: true }),
      admin
        .from("user_answers")
        .select("questionnaire_type, content, updated_at")
        .eq("user_id", userId)
        .eq("submission_id", submissionId)
        .in("questionnaire_type", ["onboarding", "global_plan"])
        .order("updated_at", { ascending: false }),
      admin
        .from("user_goals")
        .select("actions_good_for_me")
        .eq("user_id", userId)
        .eq("submission_id", submissionId)
        .order("updated_at", { ascending: false }),
      goalId
        ? admin
            .from("user_goals")
            .select("actions_good_for_me, axis_title, reasoning")
            .eq("id", goalId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      goalId
        ? admin
            .from("user_plans")
            .select("inputs_why, inputs_blockers, deep_why, content")
            .eq("goal_id", goalId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const goalsList = Array.isArray(goals) ? goals : [];
    if (goalsList.length === 0) {
      return new Response(JSON.stringify({ suggestions: [] as Suggestion[] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const answersList = Array.isArray(answers) ? answers : [];
    let why = "";
    let blockers = "";
    let actions_good_for_me = "";
    let activeGoalReasoning = "";

    // Priority 1: Specifically use the active goal/plan if available
    if (activePlan) {
      why = str(activePlan.inputs_why) || str(activePlan.deep_why) || str((activePlan as any)?.content?.deepWhy);
      blockers = str(activePlan.inputs_blockers);
    }
    if (activeGoal) {
      actions_good_for_me = str(activeGoal.actions_good_for_me);
      activeGoalReasoning = str(activeGoal.reasoning);
    }

    // Priority 2: Fallback to global user answers
    if (!why || !blockers || !actions_good_for_me) {
      const fallback = extractQualitativeText(answersList);
      if (!why) why = fallback.why;
      if (!blockers) blockers = fallback.blockers;
      if (!actions_good_for_me) actions_good_for_me = fallback.actions_good_for_me;
    }

    const goalsSummary = buildGoalSummary(goalsList, answersList);
    const goalsActionsGood = (Array.isArray(goalsQual) ? goalsQual : [])
      .map((x: any) => str(x?.actions_good_for_me))
      .filter(Boolean)
      .join(" | ");

    const systemPrompt = `
Tu es Sophia. Ta mission: proposer exactement 3 "North Star" (indicateurs de résultat global) pour un cycle de transformation.

Règles STRICTES:
- C'est un indicateur de résultat global, pas un micro-tracking quotidien.
- Même s'il n'y a qu'une transformation, propose une métrique "prise de hauteur" (hebdo/mensuelle).
- Retourne exactement 3 propositions, toutes distinctes.
- Types autorisés: "number" | "scale_10" | "counter".
- Réponse JSON strict:
{
  "suggestions": [
    { "title": "...", "metric_type": "number|scale_10|counter", "unit": "..." }
  ]
}
`;

    const userPrompt = `
Cycle (submission_id): ${submissionId}

Transformations du cycle (et raisonnements de priorisation):
${goalsSummary}

Qualitatif utilisateur (Transformation active):
- why: ${why || "n/a"}
- blockers: ${blockers || "n/a"}
- actions_good_for_me: ${actions_good_for_me || "n/a"}
- actions_good_for_me (goals): ${goalsActionsGood || "n/a"}

Raisonnement stratégique de l'Axe actif (Priorisation):
${activeGoalReasoning || "n/a"}

CRITIQUE: Tu dois accorder exactement la même importance (50/50) aux données qualitatives de l'utilisateur (why, blockers) ET au raisonnement stratégique de l'axe actif pour déduire la North Star parfaite.
`;

    const raw = await generateWithGemini(
      systemPrompt.trim(),
      userPrompt.trim(),
      0.4,
      true,
      [],
      "auto",
      {
        requestId: `${crypto.randomUUID()}:suggest-north-star`,
        source: "suggest-north-star",
        maxRetries: 3,
      } as any,
    );

    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const suggestionsRaw = Array.isArray((parsed as any)?.suggestions) ? (parsed as any).suggestions : [];
    const suggestions: Suggestion[] = suggestionsRaw
      .map((s: any) => ({
        title: str(s?.title),
        metric_type: (str(s?.metric_type) as Suggestion["metric_type"]) || "number",
        unit: str(s?.unit),
      }))
      .filter((s) => s.title && (s.metric_type === "number" || s.metric_type === "scale_10" || s.metric_type === "counter"))
      .slice(0, 3);

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[suggest-north-star] error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
