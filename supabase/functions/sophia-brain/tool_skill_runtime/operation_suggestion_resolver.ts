import type {
  ConversationSkillOperationSuggestion,
  ConversationSkillOutput,
} from "../contracts/skill_output.v1.ts";
import type { ProductSurfaceDefinition } from "../product_surface_registry/registry.ts";
import type { ProductRecommendation } from "../recommendation/recommendation_types.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { evaluateOperationSuggestionAccess } from "./operation_access_policy.ts";

export type OperationSuggestionResolution = {
  recommendation: ProductRecommendation | null;
  accepted_suggestion?: ConversationSkillOperationSuggestion;
  blocked_suggestions: Array<{
    operation_type: string;
    reason_code: string;
  }>;
};

function confidenceValue(band: string): number {
  if (band === "critical") return 0.96;
  if (band === "high") return 0.86;
  if (band === "medium") return 0.72;
  return 0.55;
}

function timingForUrgency(urgency: string): ProductRecommendation["timing"] {
  return urgency === "low" ? "later" : "now";
}

function presentationLevelForUrgency(
  urgency: string,
): ProductRecommendation["presentation_level"] {
  return urgency === "high" ? 3 : urgency === "medium" ? 2 : 1;
}

function buildRecommendation(args: {
  skillOutput: ConversationSkillOutput;
  suggestion: ConversationSkillOperationSuggestion;
  surface: ProductSurfaceDefinition | null;
  requestId?: string | null;
}): ProductRecommendation {
  const surfaceId = args.surface?.id ??
    args.suggestion.operation_type;
  const label = args.surface?.label ?? args.suggestion.operation_type;
  return {
    recommendation_id:
      `skill:${args.skillOutput.skill_id}:${args.suggestion.operation_type}:${
        args.requestId ?? "local"
      }`,
    decision: "recommend_operation",
    surface_id: surfaceId,
    executor_tool_id: args.surface
      ? args.surface.executor_tool_id
      : args.suggestion.operation_type,
    operation_type: args.suggestion.operation_type,
    operation_input: args.suggestion.operation_input_hint ?? null,
    confidence: confidenceValue(args.suggestion.confidence_band),
    timing: timingForUrgency(args.suggestion.urgency),
    presentation_level: presentationLevelForUrgency(args.suggestion.urgency),
    cta_style: args.suggestion.requires_user_consent ? "soft" : "none",
    requires_consent: args.suggestion.requires_user_consent,
    reason: args.suggestion.reason,
    user_facing_offer:
      `Je peux te proposer ${label} si tu veux passer par le flow propre.`,
    alternatives: [],
    do_not_recommend: [],
  };
}

export function resolveSkillOperationSuggestion(args: {
  skill_output: ConversationSkillOutput | null;
  turn_frame: TurnFrame;
  available_surfaces: ProductSurfaceDefinition[];
  request_id?: string | null;
}): OperationSuggestionResolution {
  const skillOutput = args.skill_output;
  const suggestions = skillOutput?.operation_suggestions ?? [];
  const blocked: OperationSuggestionResolution["blocked_suggestions"] = [];
  if (!skillOutput || suggestions.length === 0) {
    return { recommendation: null, blocked_suggestions: blocked };
  }
  for (const suggestion of suggestions) {
    const access = evaluateOperationSuggestionAccess({
      skill_id: skillOutput.skill_id,
      suggestion,
      safety_risk_band: args.turn_frame.safety.risk_band,
    });
    if (!access.allowed) {
      blocked.push({
        operation_type: access.operation_type,
        reason_code: access.reason_code,
      });
      continue;
    }
    if (
      !access.chat_runtime_ready &&
      suggestion.operation_type !== "select_state_potion"
    ) {
      blocked.push({
        operation_type: access.operation_type,
        reason_code: "tool_skill_chat_runtime_not_ready",
      });
      continue;
    }
    const surface = args.available_surfaces.find((candidate) =>
      candidate.id === access.surface_id
    ) ?? null;
    return {
      recommendation: buildRecommendation({
        skillOutput,
        suggestion,
        surface,
        requestId: args.request_id,
      }),
      accepted_suggestion: suggestion,
      blocked_suggestions: blocked,
    };
  }
  return { recommendation: null, blocked_suggestions: blocked };
}
