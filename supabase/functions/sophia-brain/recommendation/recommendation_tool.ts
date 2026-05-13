import {
  filterSurfacesByContraindications,
  type ProductSurfaceDefinition,
} from "../product_surface_registry/registry.ts";
import type {
  ProductRecommendation,
  RecommendationToolInput,
} from "./recommendation_types.ts";

export const RECOMMENDATION_TOOL_PROMPT_VERSION =
  "recommendation_tool_v1_2026_05";

const SAFETY_BLOCKING = new Set(["medium", "high", "critical"]);

function recommendationId(input: RecommendationToolInput): string {
  return `rec_${input.turn_frame.turn_id}_${Date.now()}`;
}

function blocked(
  input: RecommendationToolInput,
  reason: string,
): ProductRecommendation {
  return {
    recommendation_id: recommendationId(input),
    decision: "blocked",
    confidence: 1,
    timing: "watch",
    presentation_level: 0,
    cta_style: "none",
    requires_consent: false,
    reason,
    alternatives: [],
    do_not_recommend: [],
    blocked_reason: reason,
  };
}

function defer(
  input: RecommendationToolInput,
  reason: string,
): ProductRecommendation {
  return {
    recommendation_id: recommendationId(input),
    decision: "defer",
    confidence: 0.7,
    timing: "later",
    presentation_level: 0,
    cta_style: "none",
    requires_consent: false,
    reason,
    alternatives: [],
    do_not_recommend: [],
  };
}

function buildPrompt(
  input: RecommendationToolInput,
  surfaces: ProductSurfaceDefinition[],
) {
  return JSON.stringify({
    prompt_version: RECOMMENDATION_TOOL_PROMPT_VERSION,
    user_id: input.user_id,
    channel: input.channel,
    current_skill_id: input.current_skill_id,
    skill_output: input.skill_output,
    product_help_signal: input.turn_frame.skill_signals.entry?.product_help ??
      null,
    available_surfaces: surfaces,
    recent_recommendations: input.recent_recommendations,
    user_preferences: input.user_preferences ?? {},
    safety_pregate_risk_band: input.safety_pregate_risk_band,
  });
}

function parseLlmRecommendation(
  raw: unknown,
  input: RecommendationToolInput,
): ProductRecommendation | null {
  const candidate = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!candidate || typeof candidate !== "object") return null;
  const value = candidate as Partial<ProductRecommendation>;
  if (
    ![
      "recommend",
      "recommend_operation",
      "ask_clarification",
      "defer",
      "blocked",
    ].includes(String(value.decision))
  ) {
    return null;
  }
  return {
    recommendation_id: String(
      value.recommendation_id ?? recommendationId(input),
    ),
    decision: value.decision!,
    surface_id: value.surface_id ?? null,
    executor_tool_id: value.executor_tool_id ?? null,
    operation_type: value.operation_type ?? null,
    operation_input: value.operation_input ?? null,
    confidence: Math.max(0, Math.min(1, Number(value.confidence ?? 0.5))),
    timing: value.timing ?? "now",
    presentation_level: value.presentation_level ?? 1,
    cta_style: value.cta_style ?? "soft",
    requires_consent: Boolean(value.requires_consent),
    reason: String(value.reason ?? "recommendation_tool_llm"),
    user_facing_offer: value.user_facing_offer ?? null,
    alternatives: Array.isArray(value.alternatives) ? value.alternatives : [],
    do_not_recommend: Array.isArray(value.do_not_recommend)
      ? value.do_not_recommend
      : [],
    blocked_reason: value.blocked_reason,
  };
}

function hasRecentDecline(
  input: RecommendationToolInput,
  surfaceId: string,
): boolean {
  return input.recent_recommendations.some((entry) =>
    String(entry.surface_or_operation ?? entry.surface_id ?? "") ===
      surfaceId &&
    entry.user_response === "declined"
  );
}

function hasCooldown(
  input: RecommendationToolInput,
  surfaceId: string,
): boolean {
  return input.recent_recommendations.some((entry) =>
    String(entry.surface_or_operation ?? entry.surface_id ?? "") ===
      surfaceId &&
    Boolean(entry.cooldown_active ?? entry.cooldown)
  );
}

function surfaceById(
  surfaces: ProductSurfaceDefinition[],
  id: string,
): ProductSurfaceDefinition | null {
  return surfaces.find((surface) => surface.id === id) ?? null;
}

function targetIdFromTurnFrame(input: RecommendationToolInput): string | null {
  const frame = input.turn_frame as any;
  const raw = frame?.target_id ?? frame?.routing?.target_id ?? "";
  const value = String(raw ?? "").trim();
  return value || null;
}

function planItemById(
  input: RecommendationToolInput,
  id?: string | null,
): { id: string; title: string; status?: string } | null {
  const targetId = String(id ?? "").trim();
  if (!targetId) return null;
  const item = (input.plan_items ?? []).find((candidate) =>
    candidate.id === targetId
  );
  return item?.id && item?.title
    ? { id: item.id, title: item.title, status: item.status }
    : null;
}

function resolveRecommendationPlanTarget(
  input: RecommendationToolInput,
): { kind: "plan_item"; plan_item_id: string; title: string } | null {
  const fromDiagnosis = planItemById(
    input,
    String((input.skill_output?.diagnosis as any)?.plan_item_id ?? "").trim(),
  );
  const fromFrame = planItemById(input, targetIdFromTurnFrame(input));
  const item = fromDiagnosis ?? fromFrame;
  if (!item) return null;
  return {
    kind: "plan_item",
    plan_item_id: item.id,
    title: item.title,
  };
}

function hasProductHelpSignal(input: RecommendationToolInput): boolean {
  return input.current_skill_id === "product_help" ||
    input.turn_frame.skill_signals.entry?.product_help?.detected === true;
}

function heuristicRecommendation(
  input: RecommendationToolInput,
  surfaces: ProductSurfaceDefinition[],
): ProductRecommendation {
  const need = input.skill_output?.recommendation_need;
  const diagnosis = input.skill_output?.diagnosis ?? {};
  if (!need?.needed && !hasProductHelpSignal(input)) {
    return defer(input, "no_recommendation_opportunity");
  }
  const constraints = new Set(need?.constraints ?? []);
  const text = JSON.stringify({ diagnosis, need }).toLowerCase();
  if (
    need?.urgency === "high" ||
    constraints.has("high_emotion") ||
    /emotion.*high|honte.*high|panic|panique/.test(text)
  ) {
    const potion = surfaceById(surfaces, "potion.state");
    if (!potion) return defer(input, "state_surface_unavailable");
    return {
      recommendation_id: recommendationId(input),
      decision: "recommend_operation",
      surface_id: potion.id,
      executor_tool_id: potion.executor_tool_id,
      operation_type: "select_state_potion",
      operation_input: {
        state: /honte|shame/.test(text) ? "shame_guilt" : "activation",
        potion_type: "regulation",
        evidence: [input.skill_output?.reply ?? "state_regulation"],
      },
      confidence: 0.82,
      timing: "now",
      presentation_level: 2,
      cta_style: "soft",
      requires_consent: true,
      reason: "state_regulation_before_action",
      user_facing_offer:
        "On peut faire une potion courte pour faire redescendre l'etat avant de revenir a l'action.",
      alternatives: [],
      do_not_recommend: [{ surface_id: "attack_card", reason: "emotion_high" }],
    };
  }
  if (need?.type === "state_regulation") {
    const potion = surfaceById(surfaces, "potion.state");
    if (!potion) return defer(input, "state_surface_unavailable");
    return {
      recommendation_id: recommendationId(input),
      decision: "recommend_operation",
      surface_id: potion.id,
      executor_tool_id: potion.executor_tool_id,
      operation_type: "select_state_potion",
      operation_input: { state: "shame_guilt", potion_type: "regulation" },
      confidence: 0.8,
      timing: "now",
      presentation_level: 2,
      cta_style: "soft",
      requires_consent: true,
      reason: "skill_requested_state_regulation",
      user_facing_offer: "On peut faire une potion d'etat tres courte.",
      alternatives: [],
      do_not_recommend: [],
    };
  }
  if (need?.type === "execution_repair") {
    const target = resolveRecommendationPlanTarget(input);
    if (!target) {
      return {
        recommendation_id: recommendationId(input),
        decision: "ask_clarification",
        confidence: 0.74,
        timing: "now",
        presentation_level: 1,
        cta_style: "soft",
        requires_consent: false,
        reason: "execution_repair_target_missing",
        user_facing_offer:
          "Je peux preparer une carte d'attaque, mais il faut d'abord choisir l'action exacte.",
        alternatives: [],
        do_not_recommend: [],
      };
    }
    const attack = surfaceById(surfaces, "attack_card");
    if (!attack) return defer(input, "attack_card_unavailable");
    return {
      recommendation_id: recommendationId(input),
      decision: "recommend_operation",
      surface_id: attack.id,
      executor_tool_id: attack.executor_tool_id,
      operation_type: "prepare_attack_card",
      operation_input: {
        target,
        blocker: {
          type: (diagnosis as any).blocker_type ?? "execution_block",
        },
        constraints: need.constraints,
      },
      confidence: 0.78,
      timing: "now",
      presentation_level: 2,
      cta_style: "soft",
      requires_consent: true,
      reason: "clear_execution_block",
      user_facing_offer:
        `On peut preparer une carte d'attaque courte pour faire une version demarrable de "${target.title}", sans modifier le plan.`,
      alternatives: [],
      do_not_recommend: [],
    };
  }
  if (need?.type === "motivation_repair") {
    const target = resolveRecommendationPlanTarget(input);
    if (!target) {
      return {
        recommendation_id: recommendationId(input),
        decision: "ask_clarification",
        confidence: 0.7,
        timing: "now",
        presentation_level: 1,
        cta_style: "soft",
        requires_consent: false,
        reason: "motivation_repair_target_missing",
        user_facing_offer:
          "Je peux t'aider avec une carte d'attaque, mais je veux la rattacher a la bonne action.",
        alternatives: [],
        do_not_recommend: [],
      };
    }
    const attack = surfaceById(surfaces, "attack_card");
    if (!attack) return defer(input, "attack_card_unavailable");
    return {
      recommendation_id: recommendationId(input),
      decision: "recommend_operation",
      surface_id: attack.id,
      executor_tool_id: attack.executor_tool_id,
      operation_type: "prepare_attack_card",
      operation_input: {
        target,
        blocker: { type: "low_energy" },
        desired_attack_angle: "preparer_terrain",
        constraints: [...need.constraints, "do_not_modify_plan"],
      },
      confidence: 0.76,
      timing: "now",
      presentation_level: 2,
      cta_style: "soft",
      requires_consent: true,
      reason: "motivation_repair_needs_attack_card_not_plan_edit",
      user_facing_offer:
        `On peut creer une carte d'attaque courte pour faire une version minimale de "${target.title}", sans changer ton plan.`,
      alternatives: [],
      do_not_recommend: [{
        surface_id: "plan_item.reduce",
        reason: "plan_edit_requires_explicit_structural_change",
      }],
    };
  }
  if (hasProductHelpSignal(input)) {
    return {
      recommendation_id: recommendationId(input),
      decision: "recommend",
      surface_id: "dashboard.personal_actions",
      confidence: 0.62,
      timing: "now",
      presentation_level: 1,
      cta_style: "soft",
      requires_consent: false,
      reason: "product_help_skill_signal",
      user_facing_offer: "Je peux te guider vers cette fonctionnalite.",
      alternatives: [],
      do_not_recommend: [],
    };
  }
  return defer(input, "diagnostic_too_unclear");
}

export async function runRecommendationTool(
  input: RecommendationToolInput,
): Promise<ProductRecommendation> {
  const started = Date.now();
  const modelName = input.model_name ?? "gemini-3-flash-preview";
  if (SAFETY_BLOCKING.has(input.safety_pregate_risk_band)) {
    input.on_stats?.({
      latency_ms: Date.now() - started,
      prompt_version: RECOMMENDATION_TOOL_PROMPT_VERSION,
      model_name: modelName,
      used_llm: false,
    });
    return blocked(input, "safety_pregate_blocks_recommendation");
  }

  const contraindications = [
    input.safety_pregate_risk_band !== "none" ? "safety_active" : "",
    input.skill_output?.recommendation_need?.urgency === "high"
      ? "high_emotion"
      : "",
    hasProductHelpSignal(input) ? "user_asked_explanation_only" : "",
  ].filter(Boolean);
  let surfaces = filterSurfacesByContraindications(
    input.available_surfaces,
    contraindications,
  ).filter((surface) =>
    !hasCooldown(input, surface.id) && !hasRecentDecline(input, surface.id)
  );
  if (surfaces.length === 0) {
    return defer(input, "cooldown_or_contraindications_exhausted_surfaces");
  }

  let recommendation: ProductRecommendation;
  let usedLlm = false;
  if (input.llm_runner) {
    usedLlm = true;
    const raw = await input.llm_runner({
      system_prompt:
        "Tu es recommendation_tool. Retourne uniquement un ProductRecommendation JSON valide. Ne genere pas de draft et n'execute rien.",
      user_prompt: buildPrompt(input, surfaces),
      json_mode: true,
      model_name: modelName,
    });
    recommendation = parseLlmRecommendation(raw, input) ??
      heuristicRecommendation(input, surfaces);
  } else {
    recommendation = heuristicRecommendation(input, surfaces);
  }

  if (
    recommendation.surface_id &&
    (hasCooldown(input, recommendation.surface_id) ||
      hasRecentDecline(input, recommendation.surface_id))
  ) {
    surfaces = surfaces.filter((surface) =>
      surface.id !== recommendation.surface_id
    );
    recommendation = surfaces.length === 0
      ? defer(input, "recommended_surface_in_cooldown_or_declined")
      : heuristicRecommendation(input, surfaces);
  }
  input.on_stats?.({
    latency_ms: Date.now() - started,
    prompt_version: RECOMMENDATION_TOOL_PROMPT_VERSION,
    model_name: modelName,
    used_llm: usedLlm,
  });
  return recommendation;
}
