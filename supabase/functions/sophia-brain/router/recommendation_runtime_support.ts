import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";
import {
  createNoteInformation,
  normalizeNoteInformation,
} from "../contracts/note_information.v1.ts";
import type { ProductRecommendation } from "../recommendation/recommendation_types.ts";
import { loadProductSurfaceRegistry } from "../product_surface_registry/registry.ts";
import { runRecommendationTool } from "../recommendation/recommendation_tool.ts";
import { resolveSkillOperationSuggestion } from "../tool_skill_runtime/operation_suggestion_resolver.ts";
import { runDemotivationRepairSkill } from "../skills/demotivation_repair/skill.ts";
import { runEmotionalRepairSkill } from "../skills/emotional_repair/skill.ts";
import { runProductHelpSkill } from "../skills/product_help/skill.ts";
import { runSafetyCrisisSkill } from "../skills/safety_crisis/skill.ts";
import {
  renderRecommendationToolVisibleReply,
} from "../tools/operations/_shared/recommendation_renderer.ts";
import {
  buildAttackCardRecommendationOperationInput,
  isAttackCardPostCreationVerificationQuestion,
} from "../tools/operations/prepare_attack_card/run_support.ts";
import { readSurfaceState } from "../surface_state.ts";
import { readActiveFlowState } from "./active_flow_state.ts";
import { isSafetyRoute } from "./safety_crisis_runtime.ts";
import type { V2PlanItemSnapshotItem } from "./plan_snapshot_runtime.ts";
import {
  defaultPlanItemForAdjustment,
  operationInputFromLastPlanItem,
  planItemTitleFromOperationInput,
  writeLastResolvedPlanItem,
} from "./plan_targeting_support.ts";

type TraceFn = (
  event: string,
  phase: "routing",
  payload?: Record<string, unknown>,
  level?: "debug" | "info" | "warn" | "error",
) => Promise<void>;

const DEPRECATED_ACTION_BREAKDOWN_SKILL_ID = "execution" + "_breakdown";

export type RecommendationRuntimeForTurn = {
  selectedSkillForRecommendation: string;
  recommendationSkillOutput: ConversationSkillOutput | null;
  recommendationToolRun: ProductRecommendation | null;
  recommendationToolStats: Record<string, unknown> | null;
  recommendationToolAddon: string | null;
  recommendationSurfaceLabel: string | null;
};

function buildSkillContextForRecommendation(args: {
  skillId: string;
  userId: string;
  userMessage: string;
  routeDecision?: RouteDecision | null;
  turnFrame: TurnFrame | null;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  activeSkillState: unknown;
  planItemSnapshot: unknown[] | null | undefined;
  productSurfaces: unknown[];
}) {
  const inboundNote = initialActivationNoteInformation(args);
  return {
    skill_id: args.skillId,
    user_id: args.userId,
    recent_messages: args.recentMessages.slice(-8),
    active_skill_working_state:
      args.activeSkillState && typeof args.activeSkillState === "object"
        ? args.activeSkillState
        : null,
    turn_frame: args.turnFrame,
    relevant_memory_items: [],
    plan_items: Array.isArray(args.planItemSnapshot)
      ? args.planItemSnapshot as Array<Record<string, unknown>>
      : [],
    product_surfaces: args.productSurfaces as Array<Record<string, unknown>>,
    exclusions: [],
    note_information: inboundNote,
  } as any;
}

function initialActivationNoteInformation(args: {
  skillId: string;
  userMessage: string;
  routeDecision?: RouteDecision | null;
  turnFrame: TurnFrame | null;
  activeSkillState: unknown;
}) {
  if (args.activeSkillState) return null;
  if (
    args.routeDecision?.response_owner !== "conversation_handler" ||
    args.routeDecision.selected_handler !== args.skillId
  ) return null;
  const raw = args.turnFrame?.note_information ?? null;
  if (raw) {
    return normalizeNoteInformation(raw, {
      source_flow_id: "global_dispatcher",
      source_flow_state_summary: `Premiere activation de ${args.skillId}.`,
      handoff_reason: "explicit_user_request",
      target_dispatcher: args.skillId as any,
      handoff_context_for_next_dispatcher: args.userMessage,
      structured_context: {
        user_message_summary: args.userMessage.slice(0, 240),
        route_reason: args.routeDecision.reason_code,
      },
      risk_score: 0,
    });
  }
  return createNoteInformation({
    source_flow_id: "global_dispatcher",
    source_flow_state_summary: `Premiere activation de ${args.skillId}.`,
    handoff_reason: "explicit_user_request",
    target_dispatcher: args.skillId as any,
    handoff_context_for_next_dispatcher: JSON.stringify({
      user_message_summary: args.userMessage.slice(0, 240),
      route_reason: args.routeDecision.reason_code,
      selected_handler: args.routeDecision.selected_handler,
    }),
    target_local_dispatcher_hint:
      "Treat this as initial ownership context, not as a visible message.",
    user_words: [args.userMessage.slice(0, 240)],
    structured_context: {
      user_message_summary: args.userMessage.slice(0, 240),
      route_reason: args.routeDecision.reason_code,
      selected_handler: args.routeDecision.selected_handler,
    },
    risk_score: 0,
  });
}

const CONVERSATION_EXPLICIT_CONSTRAINTS = [
  "no_tool",
  "no_potion",
  "no_plan",
  "no_protocol",
  "no_technique",
  "no_questions",
  "soft_support_only",
  "short_reply",
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function conversationExplicitConstraints(tempMemory: unknown): string[] {
  const temp = asRecord(tempMemory);
  const constraints = {
    ...asRecord(temp.__explicit_turn_constraints),
    ...asRecord(temp.__turn_constraints),
  };
  return CONVERSATION_EXPLICIT_CONSTRAINTS.filter((key) =>
    constraints[key] === true
  );
}

function activeRecommendationSkillId(activeSkillState: unknown): string {
  const skillId = String((activeSkillState as any)?.skill_id ?? "").trim();
  return skillId === DEPRECATED_ACTION_BREAKDOWN_SKILL_ID ? "" : skillId;
}

export async function runConversationSkillForRecommendation(args: {
  skillId: string;
  userId: string;
  userMessage: string;
  turnFrame: TurnFrame | null;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  activeSkillState: unknown;
  planItemSnapshot: unknown[] | null | undefined;
  productSurfaces: unknown[];
  explicitConstraints?: string[];
  activeSkillStateOverride?: unknown;
  routeDecision?: RouteDecision | null;
}): Promise<ConversationSkillOutput | null> {
  const context = buildSkillContextForRecommendation({
    ...args,
    activeSkillState: args.activeSkillStateOverride ?? args.activeSkillState,
  });
  const input = {
    user_message: args.userMessage,
    context,
    explicit_constraints: args.explicitConstraints ?? [],
  };
  switch (args.skillId) {
    case "demotivation_repair":
      return await runDemotivationRepairSkill(input);
    case "emotional_repair":
      return await runEmotionalRepairSkill(input);
    case "product_help":
      return await runProductHelpSkill(input);
    case "safety_crisis":
      return await runSafetyCrisisSkill(input);
    default:
      return null;
  }
}

export async function prepareRecommendationRuntimeForTurn(args: {
  userId: string;
  channel: "web" | "whatsapp";
  userMessage: string;
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  activeSkillState: unknown;
  planItemSnapshot: V2PlanItemSnapshotItem[] | null | undefined;
  tempMemory: any;
  requestId: string | null;
  trace: TraceFn;
}): Promise<RecommendationRuntimeForTurn> {
  let recommendationSkillOutput: ConversationSkillOutput | null = null;
  let recommendationToolRun: ProductRecommendation | null = null;
  let recommendationToolStats: Record<string, unknown> | null = null;
  let recommendationToolAddon: string | null = null;
  let recommendationSurfaceLabel: string | null = null;

  const selectedSkillForRecommendation =
    args.routeDecision?.response_owner === "conversation_handler"
      ? String(args.routeDecision.selected_handler ?? "").trim()
      : isSafetyRoute(args.routeDecision)
      ? "safety_crisis"
      : args.routeDecision?.response_owner === "product_help"
      ? "product_help"
      : activeRecommendationSkillId(args.activeSkillState);
  const suppressOperationRecommendationForVerification =
    isAttackCardPostCreationVerificationQuestion({
      message: args.userMessage,
      recentMessages: args.recentMessages,
    });

  if (
    args.turnFrame &&
    selectedSkillForRecommendation
  ) {
    try {
      const registry = await loadProductSurfaceRegistry();
      const inlineActiveFlow =
        selectedSkillForRecommendation === "product_help" &&
          args.routeDecision?.active_flow_arbitration?.decision ===
            "inline_answer_then_resume"
          ? readActiveFlowState(args.tempMemory)
          : null;
      const inlineParentState = inlineActiveFlow
        ? inlineActiveFlow.activeSkillState ??
          inlineActiveFlow.activeToolSkillIntake ??
          inlineActiveFlow.pendingToolSkillConfirmation ??
          null
        : null;
      recommendationSkillOutput = selectedSkillForRecommendation
        ? await runConversationSkillForRecommendation({
          skillId: selectedSkillForRecommendation,
          userId: args.userId,
          userMessage: args.userMessage,
          turnFrame: args.turnFrame,
          recentMessages: args.recentMessages,
          activeSkillState: args.activeSkillState,
          planItemSnapshot: args.planItemSnapshot,
          productSurfaces: registry.surfaces,
          explicitConstraints: conversationExplicitConstraints(args.tempMemory),
          activeSkillStateOverride: inlineParentState,
          routeDecision: args.routeDecision,
        })
        : null;
      if (selectedSkillForRecommendation === "safety_crisis") {
        const diagnosis = recommendationSkillOutput?.diagnosis ?? {};
        const visibleTask = (diagnosis as any).visible_task;
        await args.trace("brain:safety_crisis.local_flow_result", "routing", {
          source_risk_band: (diagnosis as any).source_risk_band ?? null,
          computed_risk_band: (diagnosis as any).risk_band ?? null,
          phase: (diagnosis as any).phase ?? null,
          "visible_task.kind": visibleTask?.kind ?? null,
          no_tooling: true,
          exit_memo: (diagnosis as any).exit_memo ?? null,
        }, "info");
      }
      if (
        !suppressOperationRecommendationForVerification &&
        selectedSkillForRecommendation !== "product_help" &&
        shouldRunRecommendationTool({
          skillOutput: recommendationSkillOutput,
          userMessage: args.userMessage,
          turnFrame: args.turnFrame,
        })
      ) {
        recommendationToolRun = await runRecommendationTool({
          user_id: args.userId,
          channel: args.channel,
          current_skill_id: selectedSkillForRecommendation,
          skill_output: recommendationSkillOutput ?? undefined,
          turn_frame: args.turnFrame,
          memory_payload: args.turnFrame?.memory_plan ?? {},
          active_topic_state: (args.tempMemory as any)
            ?.memory_v2_active_topic ?? null,
          presentation_state: readSurfaceState(args.tempMemory),
          plan_items: (args.planItemSnapshot ?? []).map((item) => ({
            id: item.id,
            title: item.title,
            status: item.status,
            item_type: item.item_type,
            dimension: item.dimension,
            cadence_label: item.cadence_label ?? null,
            target_reps: item.target_reps ?? null,
            current_reps: item.current_reps ?? null,
            item_nature: item.item_nature ?? null,
            available_this_week: item.available_this_week ?? false,
            availability_status: item.availability_status ?? null,
            week_scope: item.week_scope ?? null,
            source_kind: item.source_kind ?? null,
          })),
          available_surfaces: registry.surfaces,
          recent_recommendations: [],
          user_preferences: {},
          safety_pregate_risk_band: args.turnFrame.safety.risk_band,
          model_name: String(
            Deno.env.get("SOPHIA_RECOMMENDATION_TOOL_MODEL") ??
              "gemini-3-flash-preview",
          ).trim(),
          on_stats: (stats) => {
            recommendationToolStats = stats as Record<string, unknown>;
          },
        });
        recommendationSurfaceLabel = recommendationToolRun.surface_id
          ? registry.by_id.get(recommendationToolRun.surface_id)?.label ?? null
          : null;
        recommendationToolAddon = buildRecommendationToolAddon({
          recommendation: recommendationToolRun,
          skillOutput: recommendationSkillOutput,
          selectedSkillId: selectedSkillForRecommendation,
          surfaceLabel: recommendationSurfaceLabel,
        });
        await args.trace("brain:recommendation_tool_run", "routing", {
          selected_skill_id: selectedSkillForRecommendation,
          skill_recommendation_need:
            recommendationSkillOutput?.recommendation_need ?? null,
          recommendation: recommendationToolRun,
          stats: recommendationToolStats,
        }, "info");
      }
      if (
        !suppressOperationRecommendationForVerification &&
        !recommendationToolRun && recommendationSkillOutput
      ) {
        const suggestionResolution = resolveSkillOperationSuggestion({
          skill_output: recommendationSkillOutput,
          turn_frame: args.turnFrame,
          available_surfaces: registry.surfaces,
          request_id: args.requestId,
        });
        if (suggestionResolution.recommendation) {
          recommendationToolRun = suggestionResolution.recommendation;
          recommendationSurfaceLabel = recommendationToolRun.surface_id
            ? registry.by_id.get(recommendationToolRun.surface_id)?.label ??
              null
            : null;
          recommendationToolAddon = buildRecommendationToolAddon({
            recommendation: recommendationToolRun,
            skillOutput: recommendationSkillOutput,
            selectedSkillId: selectedSkillForRecommendation,
            surfaceLabel: recommendationSurfaceLabel,
          });
        }
        await args.trace(
          "brain:skill_operation_suggestion_resolved",
          "routing",
          {
            selected_skill_id: selectedSkillForRecommendation,
            accepted_operation_type:
              suggestionResolution.accepted_suggestion?.operation_type ?? null,
            recommendation: suggestionResolution.recommendation,
            blocked_suggestions: suggestionResolution.blocked_suggestions,
          },
          suggestionResolution.recommendation ? "info" : "debug",
        );
      }
    } catch (error) {
      recommendationToolStats = {
        error: error instanceof Error ? error.message : String(error),
      };
      await args.trace("brain:recommendation_tool_failed", "routing", {
        selected_skill_id: selectedSkillForRecommendation,
        error: recommendationToolStats.error,
      }, "warn");
    }
  }

  return {
    selectedSkillForRecommendation,
    recommendationSkillOutput,
    recommendationToolRun,
    recommendationToolStats,
    recommendationToolAddon,
    recommendationSurfaceLabel,
  };
}

export function normalizeRecommendationText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .split("’").join("'")
    .split("‘").join("'")
    .split("`").join("'")
    .split("´").join("'");
}

function userExplicitlyAsksForTool(text: string): boolean {
  void text;
  return false;
}

export function shouldRunRecommendationTool(args: {
  skillOutput: ConversationSkillOutput | null;
  userMessage: string;
  turnFrame: TurnFrame;
}): boolean {
  if (args.skillOutput?.skill_id === "demotivation_repair") return false;
  if ((args.skillOutput?.operation_suggestions ?? []).length > 0) {
    return false;
  }
  if (args.skillOutput?.recommendation_need?.needed) return true;
  if (args.turnFrame.skill_signals.entry?.product_help?.detected) return true;
  void args.userMessage;
  return false;
}

export function buildRecommendationToolAddon(args: {
  recommendation: ProductRecommendation | null;
  skillOutput: ConversationSkillOutput | null;
  selectedSkillId: string | null;
  surfaceLabel?: string | null;
}): string | null {
  const recommendation = args.recommendation;
  if (!recommendation) return null;
  const offer = String(recommendation.user_facing_offer ?? "").trim();
  const surfaceId = String(recommendation.surface_id ?? "").trim();
  const surfaceLabel = String(args.surfaceLabel ?? "").trim();
  const operationType = String(recommendation.operation_type ?? "").trim();
  return [
    "=== ADDON RECOMMENDATION TOOL ===",
    `selected_skill_id: ${args.selectedSkillId ?? "unknown"}`,
    `skill_recommendation_need: ${
      JSON.stringify(args.skillOutput?.recommendation_need ?? null)
    }`,
    `decision: ${recommendation.decision}`,
    `surface_id: ${surfaceId || "none"}`,
    `surface_label: ${surfaceLabel || "none"}`,
    `operation_type: ${operationType || "none"}`,
    `requires_consent: ${recommendation.requires_consent}`,
    `presentation_level: ${recommendation.presentation_level}`,
    `reason: ${recommendation.reason}`,
    offer ? `user_facing_offer: ${offer}` : null,
    "",
    "CONSIGNE:",
    "- Si l'utilisateur demande un outil, ne fabrique jamais un faux nom d'outil.",
    "- Recommande uniquement la surface produit ci-dessus, avec son nom reel si surface_id existe.",
    "- Si decision=recommend_operation et surface_label existe, la reponse visible doit nommer explicitement cet outil/surface_label.",
    "- N'affiche jamais les champs techniques surface_id, surface, operation_type, executor_tool_id ou decision dans la reponse visible.",
    '- Formule en francais naturel: dis par exemple "tu veux qu\'on l\'utilise pour alleger... ?", jamais "reduce".',
    "- Si decision=recommend_operation et requires_consent=true, propose l'outil en demandant l'accord avant execution.",
    "- Si decision=defer/blocked, ne presente pas d'outil produit; propose seulement une mini-etape conversationnelle sans l'appeler outil.",
    "- Tu peux expliquer en une phrase pourquoi cet outil est pertinent maintenant.",
    "- Regle produit cartes: ne dis jamais qu'une carte d'attaque peut etre modifiee librement. Une carte Mot de bascule permet seulement de remplacer le mot; si le contexte, la technique ou le contenu ne convient plus, propose d'en preparer une nouvelle version apres confirmation.",
    "=== FIN ADDON RECOMMENDATION TOOL ===",
  ].filter(Boolean).join("\n");
}

function recommendationTargetTitle(
  recommendation: ProductRecommendation | null,
): string | null {
  const input = recommendation?.operation_input;
  if (!input || typeof input !== "object") return null;
  return planItemTitleFromOperationInput(input);
}

export function directConversationSkillReplyOverride(args: {
  routeDecision: RouteDecision | null;
  skillOutput: ConversationSkillOutput | null;
}): string | null {
  const skillOutput = args.skillOutput;
  if (!skillOutput) return null;
  const skillId = String(skillOutput.skill_id ?? "").trim();
  if (!skillId) return null;
  const routeMatchesSkill = args.routeDecision?.response_owner === skillId ||
    args.routeDecision?.selected_handler === skillId ||
    (args.routeDecision?.response_owner === "conversation_handler" &&
      args.routeDecision?.selected_handler === skillId);
  if (!routeMatchesSkill) return null;
  const reply = String(skillOutput.reply ?? "").trim();
  return reply || null;
}

export function enforceRecommendationToolVisibleReply(args: {
  responseContent: string;
  userMessage: string;
  recommendation: ProductRecommendation | null;
  surfaceLabel: string | null;
  tempMemory?: any;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): string {
  const response = String(args.responseContent ?? "").trim();
  const recommendation = args.recommendation;
  const surfaceLabel = String(args.surfaceLabel ?? "").trim();
  const explicitToolAsk = userExplicitlyAsksForTool(args.userMessage);
  if (
    !recommendation ||
    recommendation.decision !== "recommend_operation" ||
    !surfaceLabel ||
    !explicitToolAsk
  ) {
    return response;
  }

  const attackOperationInput = recommendation.operation_type ===
      "prepare_attack_card"
    ? buildAttackCardRecommendationOperationInput({
      recommendation,
      tempMemory: args.tempMemory ?? {},
      planItemSnapshot: args.planItemSnapshot ?? null,
    })
    : null;
  const resolvedOperationInput = attackOperationInput ??
    buildRecommendationOperationInput({
      recommendation,
      tempMemory: args.tempMemory ?? {},
      planItemSnapshot: args.planItemSnapshot ?? null,
    });
  const resolvedTargetTitle = planItemTitleFromOperationInput(
    resolvedOperationInput,
  );
  const resolvedResponse = response;

  const normalizedResponse = normalizeRecommendationText(response);
  const normalizedLabel = normalizeRecommendationText(surfaceLabel);
  if (normalizedResponse.includes(normalizedLabel)) return resolvedResponse;

  const offer = String(recommendation.user_facing_offer ?? "").trim();
  const naturalOffer = offer
    ? offer
      .trim()
    : null;
  if (recommendation.operation_type === "prepare_attack_card") {
    const attackOperationInput = buildAttackCardRecommendationOperationInput({
      recommendation,
      tempMemory: args.tempMemory ?? {},
      planItemSnapshot: args.planItemSnapshot ?? null,
    });
    const targetTitle = planItemTitleFromOperationInput(attackOperationInput);
    return renderRecommendationToolVisibleReply({
      responseContent: resolvedResponse,
      surfaceLabel,
      operationType: recommendation.operation_type,
      explicitToolAsk,
      resolvedTargetTitle: targetTitle,
      naturalOffer,
    });
  }
  const inferredOperationInput = buildRecommendationOperationInput({
    recommendation,
    tempMemory: args.tempMemory ?? {},
    planItemSnapshot: args.planItemSnapshot ?? null,
  });
  const targetTitle = planItemTitleFromOperationInput(
    (recommendation.operation_input as Record<string, unknown> | null) ??
      null,
  ) ?? planItemTitleFromOperationInput(inferredOperationInput);
  return renderRecommendationToolVisibleReply({
    responseContent: resolvedResponse,
    surfaceLabel,
    operationType: recommendation.operation_type,
    explicitToolAsk,
    resolvedTargetTitle: targetTitle,
    naturalOffer,
  });
}

function normalizeAdjustmentTypeFromRecommendation(
  recommendation: ProductRecommendation | null,
): "reduce" | "clarify" | "pause" | "simplify" | null {
  const raw = String(
    (recommendation?.operation_input as any)?.adjustment_type ??
      (recommendation?.operation_input as any)?.adjustment ??
      "",
  ).trim().toLowerCase();
  if (
    raw === "reduce" || raw === "clarify" || raw === "pause" ||
    raw === "simplify"
  ) {
    return raw;
  }
  return recommendation?.surface_id === "plan_item.reduce" ? "reduce" : null;
}

function buildRecommendationOperationInput(args: {
  recommendation: ProductRecommendation | null;
  tempMemory: any;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): Record<string, unknown> | null {
  const recommendation = args.recommendation;
  if (
    !recommendation ||
    recommendation.decision !== "recommend_operation" ||
    recommendation.operation_type !== "adjust_plan_item"
  ) {
    return null;
  }

  const adjustmentType = normalizeAdjustmentTypeFromRecommendation(
    recommendation,
  );
  if (!adjustmentType) return null;
  let operationInput = operationInputFromLastPlanItem(args.tempMemory);
  if (!operationInput) {
    const defaultItem = defaultPlanItemForAdjustment(args.planItemSnapshot);
    if (defaultItem) {
      operationInput = operationInputFromLastPlanItem(
        writeLastResolvedPlanItem(
          args.tempMemory,
          defaultItem,
          "recommendation_default_active_item",
        ),
      );
    }
  }
  if (!operationInput) {
    return { adjustment_type: adjustmentType };
  }
  return {
    ...operationInput,
    adjustment_type: adjustmentType,
  };
}

export function attachPendingRecommendationOperation(args: {
  tempMemory: any;
  recommendation: ProductRecommendation | null;
  surfaceLabel: string | null;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
  requestId?: string | null;
}): any {
  const recommendation = args.recommendation;
  const passthroughOperationInput = [
    "create_recurring_reminder",
    "prepare_defense_card",
    "select_state_potion",
  ].includes(String(recommendation?.operation_type ?? ""));
  const operationInput = recommendation?.operation_type ===
      "prepare_attack_card"
    ? buildAttackCardRecommendationOperationInput({
      recommendation,
      tempMemory: args.tempMemory,
      planItemSnapshot: args.planItemSnapshot,
    })
    : recommendation?.operation_type === "adjust_plan_item"
    ? buildRecommendationOperationInput({
      recommendation,
      tempMemory: args.tempMemory,
      planItemSnapshot: args.planItemSnapshot,
    })
    : passthroughOperationInput && recommendation
    ? (recommendation.operation_input ?? null)
    : buildRecommendationOperationInput({
      recommendation,
      tempMemory: args.tempMemory,
      planItemSnapshot: args.planItemSnapshot,
    });
  if (!operationInput || !recommendation?.requires_consent) {
    return args.tempMemory;
  }
  return {
    ...(args.tempMemory ?? {}),
    __pending_recommendation_operation: {
      operation_type: recommendation.operation_type,
      surface_id: recommendation.surface_id ?? null,
      surface_label: args.surfaceLabel ?? null,
      recommendation_id: recommendation.recommendation_id ?? null,
      operation_input: operationInput,
      created_at: new Date().toISOString(),
      request_id: args.requestId ?? null,
    },
  };
}
