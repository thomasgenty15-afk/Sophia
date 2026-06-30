import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import { VISIBLE_OUTPUT_STYLE_RULES } from "../../router/response_style_policy.ts";
import type { DirectEffectConfirmationContext } from "../../router/direct_effect_local_context.ts";
import type {
  WeeklyReviewConversationContext,
  WeeklyReviewVisibleTaskKind,
} from "./local_flow.ts";
import {
  weeklyReviewVisibleAgentSpec,
  weeklyReviewVisibleSystemPrompt,
} from "./visible_agents.ts";

export type WeeklyReviewVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  stage: WeeklyReviewVisibleTaskKind;
  user_message?: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  conversation_context: WeeklyReviewConversationContext;
  direct_effect_confirmation_context?: DirectEffectConfirmationContext | null;
};

export type WeeklyReviewVisibleAgent = (
  input: WeeklyReviewVisibleAgentInput,
) => Promise<string | null>;

function cleanMessage(value: unknown): string | null {
  const text = String(value ?? "").replaceAll("\r\n", "\n").trim();
  return text ? text : null;
}

function parseVisibleMessage(raw: unknown): string | null {
  try {
    const root = typeof raw === "string" ? JSON.parse(raw) : raw as any;
    return cleanMessage(root?.message);
  } catch {
    return cleanMessage(raw);
  }
}

function recentUserMessagesForVisible(
  recentMessages?: Array<
    { role: string; content: string; created_at?: string }
  >,
) {
  return (recentMessages ?? [])
    .filter((message) => cleanMessage(message.role)?.toLowerCase() === "user")
    .map((message) => ({
      role: "user",
      content: cleanMessage(message.content) ?? "",
      ...(cleanMessage(message.created_at)
        ? { created_at: cleanMessage(message.created_at) }
        : {}),
    }))
    .filter((message) => message.content)
    .slice(-5);
}

function adjustDestinationInstruction(
  context: WeeklyReviewConversationContext,
): string {
  if (context.weekly_planning_context.mode === "next_week_configured") {
    return "Tu peux porter cette intention dans Ajuster mon plan, dans la partie Plan de la plateforme.";
  }
  return "Tu peux renseigner cette intention dans la Validation du niveau, au moment de valider le niveau.";
}

function canSurfaceAdjustRecommendation(
  context: WeeklyReviewConversationContext,
  options: { stage?: WeeklyReviewVisibleTaskKind } = {},
): boolean {
  if (
    options.stage === "weekly_closure" &&
    context.adjust_recommendation.surfaced_in_weekly === true
  ) {
    return false;
  }
  return context.adjust_recommendation.safe_to_surface === true &&
    context.adjust_recommendation.confidence >= 0.95 &&
    context.adjust_recommendation.what_to_adjust.length > 0 &&
    context.adjust_recommendation.why.length > 0 &&
    context.adjust_recommendation.evidence.length >= 2;
}

function visibleAdjustRecommendation(
  context: WeeklyReviewConversationContext,
  canSurface: boolean,
  destinationMessage: string,
) {
  const recommendation = context.adjust_recommendation;
  if (canSurface) {
    return {
      ...recommendation,
      destination_instruction: destinationMessage,
    };
  }
  return {
    ...recommendation,
    confidence: 0,
    what_to_adjust: [],
    why: [],
    evidence: [],
    target_scope: null,
    destination_instruction: null,
    safe_to_surface: false,
  };
}

function visibleSafeConversationContext(
  context: WeeklyReviewConversationContext,
  stage?: WeeklyReviewVisibleTaskKind,
): WeeklyReviewConversationContext {
  const destinationMessage = adjustDestinationInstruction(context);
  const canSurface = canSurfaceAdjustRecommendation(context, { stage });
  const adjustRecommendation = visibleAdjustRecommendation(
    context,
    canSurface,
    destinationMessage,
  );
  return {
    ...context,
    known_values: {
      ...context.known_values,
      adjust_recommendation: adjustRecommendation,
    },
    weekly_planning_context: {
      ...context.weekly_planning_context,
      adjustment_destination: {
        ...context.weekly_planning_context.adjustment_destination,
        instruction: destinationMessage,
      },
    },
    adjust_recommendation: adjustRecommendation,
    handoff_data: {
      ...context.handoff_data,
      adjustment_destination: context.handoff_data.adjustment_destination &&
          typeof context.handoff_data.adjustment_destination === "object" &&
          !Array.isArray(context.handoff_data.adjustment_destination)
        ? {
          ...(context.handoff_data.adjustment_destination as Record<
            string,
            unknown
          >),
          instruction: destinationMessage,
        }
        : context.handoff_data.adjustment_destination,
    },
  };
}

export function weeklyReviewVisibleSystemPromptForTest(
  stage: WeeklyReviewVisibleTaskKind,
): string | null {
  return weeklyReviewVisibleSystemPrompt(stage);
}

export async function runWeeklyReviewVisibleAgent(
  input: WeeklyReviewVisibleAgentInput,
): Promise<string | null> {
  const spec = weeklyReviewVisibleAgentSpec(input.stage);
  const systemPrompt = weeklyReviewVisibleSystemPrompt(input.stage);
  if (!spec || !systemPrompt) return null;
  const userPrompt = buildWeeklyReviewVisibleAgentUserPrompt(input);
  try {
    const raw = await generateWithGemini(
      systemPrompt,
      userPrompt,
      0.35,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: `${spec.source}.${input.stage}`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const message = parseVisibleMessage(raw);
    return message;
  } catch (error) {
    console.warn("[WeeklyReview] visible agent failed", error);
    return null;
  }
}

export function buildWeeklyReviewVisibleAgentUserPrompt(
  input: WeeklyReviewVisibleAgentInput,
): string {
  const visibleContext = visibleSafeConversationContext(
    input.conversation_context,
    input.stage,
  );
  const adjustRecommendationAlreadySurfaced =
    visibleContext.adjust_recommendation.surfaced_in_weekly === true;
  const canSurfaceAdjust = canSurfaceAdjustRecommendation(visibleContext, {
    stage: input.stage,
  });
  return JSON.stringify({
    task: "write_weekly_adaptive_review_visible_message",
    visible_runtime_context: {
      style_rules: VISIBLE_OUTPUT_STYLE_RULES,
      recent_user_messages: recentUserMessagesForVisible(input.recent_messages),
      direct_effect_confirmation_context:
        input.direct_effect_confirmation_context ?? null,
    },
    visible_task: {
      kind: input.stage,
      conversation_context: visibleContext,
    },
    hard_constraints: {
      plan_patch_empty_until_platform_handoff: true,
      no_chat_plan_mutation: true,
      adjust_recommendation_is_non_mutant: true,
      adjust_recommendation_already_surfaced:
        adjustRecommendationAlreadySurfaced,
      repeat_adjust_recommendation_forbidden:
        input.stage === "weekly_closure" &&
        adjustRecommendationAlreadySurfaced,
      can_surface_adjust_recommendation: canSurfaceAdjust,
      adjust_recommendation_safe_to_surface: canSurfaceAdjust,
      adjustment_destination: visibleContext.weekly_planning_context
        .adjustment_destination,
      adjust_recommendation_destination_user_message:
        adjustDestinationInstruction(visibleContext),
      weekly_closure_claim_allowed:
        visibleContext.weekly_gates.closure_status ===
          "complete" &&
        input.stage === "weekly_closure",
      synthesis_already_rendered:
        visibleContext.known_values.synthesis_already_rendered === true,
      executedTools: [],
      committed_plan_effects: [],
      forbidden_patch_wording: [
        "ce qui bougerait",
        "ce qui resterait",
        "patch en attente",
        "changement de plan pret a appliquer",
      ],
      platform_destination:
        input.conversation_context.handoff_data.platform_destination ?? null,
      no_internal_labels: true,
      one_question_max: true,
      do_not_say: input.conversation_context.do_not_say,
      do_not_claim_uncommitted_tools: true,
      one_shot_reminder:
        input.direct_effect_confirmation_context?.one_shot_reminder ?? null,
    },
    required_json_shape: { message: "string" },
  });
}
