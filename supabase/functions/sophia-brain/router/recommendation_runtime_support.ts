import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type {
  ToolSkillOpportunity,
  TurnFrame,
} from "../contracts/turn_frame.v1.ts";
import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";
import type { ProductRecommendation } from "../recommendation/recommendation_types.ts";
import { loadProductSurfaceRegistry } from "../product_surface_registry/registry.ts";
import { runRecommendationTool } from "../recommendation/recommendation_tool.ts";
import { resolveSkillOperationSuggestion } from "../tool_skill_runtime/operation_suggestion_resolver.ts";
import { runDemotivationRepairSkill } from "../skills/demotivation_repair/skill.ts";
import { runEmotionalRepairSkill } from "../skills/emotional_repair/skill.ts";
import { runExecutionBreakdownSkill } from "../skills/execution_breakdown/skill.ts";
import { runProductHelpSkill } from "../skills/product_help/skill.ts";
import { runSafetyCrisisSkill } from "../skills/safety_crisis/skill.ts";
import {
  renderRecommendationToolVisibleReply,
  renderToolSkillOpportunityOfferText,
} from "../tools/operations/_shared/recommendation_renderer.ts";
import {
  buildAttackCardRecommendationOperationInput,
  isAttackCardPostCreationVerificationQuestion,
} from "../tools/operations/prepare_attack_card/run_support.ts";
import { isImmediateModeRequestNotCoachPreference } from "../tools/operations/update_coach_preferences/route_guards.ts";
import { readSurfaceState } from "../surface_state.ts";
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
  turnFrame: TurnFrame | null;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  activeSkillState: unknown;
  planItemSnapshot: unknown[] | null | undefined;
  productSurfaces: unknown[];
}) {
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
  } as any;
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
}): Promise<ConversationSkillOutput | null> {
  const context = buildSkillContextForRecommendation(args);
  const input = { user_message: args.userMessage, context };
  switch (args.skillId) {
    case "demotivation_repair":
      return await runDemotivationRepairSkill(input);
    case "emotional_repair":
      return await runEmotionalRepairSkill(input);
    case "execution_breakdown":
      return await runExecutionBreakdownSkill(input);
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
      : String((args.activeSkillState as any)?.skill_id ?? "").trim();
  const suppressOperationRecommendationForVerification =
    isAttackCardPostCreationVerificationQuestion({
      message: args.userMessage,
      recentMessages: args.recentMessages,
    }) ||
    isImmediateModeRequestNotCoachPreference(args.userMessage);

  if (
    args.turnFrame &&
    (selectedSkillForRecommendation ||
      args.turnFrame.tool_skill_opportunity?.should_offer)
  ) {
    try {
      const registry = await loadProductSurfaceRegistry();
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
        })
        : null;
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
      if (
        !suppressOperationRecommendationForVerification &&
        args.turnFrame?.tool_skill_opportunity?.should_offer &&
        !args.routeDecision?.blocked_paths.some((blocked) =>
          blocked.path === "tool_skill_opportunity" &&
          blocked.reason_code === "active_flow_blocks_tool_opportunity"
        )
      ) {
        const opportunitySurfaceLabel =
          args.turnFrame.tool_skill_opportunity.surface_id
            ? registry.by_id.get(
              args.turnFrame.tool_skill_opportunity.surface_id,
            )
              ?.label ?? null
            : null;
        const opportunityRecommendation =
          buildRecommendationFromToolSkillOpportunity({
            turnFrame: args.turnFrame,
            surfaceLabel: opportunitySurfaceLabel,
            planItemSnapshot: args.planItemSnapshot,
            requestId: args.requestId,
          });
        if (
          operationOpportunityShouldOverrideRecommendation({
            opportunity: args.turnFrame.tool_skill_opportunity,
            recommendation: recommendationToolRun,
            opportunityRecommendation,
          })
        ) {
          recommendationToolRun = opportunityRecommendation;
          recommendationSurfaceLabel = opportunitySurfaceLabel;
          recommendationToolAddon = [
            buildToolSkillOpportunityAddon({
              turnFrame: args.turnFrame,
              recommendation: recommendationToolRun,
              surfaceLabel: recommendationSurfaceLabel,
            }),
            buildRecommendationToolAddon({
              recommendation: recommendationToolRun,
              skillOutput: recommendationSkillOutput,
              selectedSkillId: "tool_skill_opportunity_offer",
              surfaceLabel: recommendationSurfaceLabel,
            }),
          ].filter((value): value is string =>
            typeof value === "string" && value.trim().length > 0
          ).join("\n\n");
        }
        await args.trace("brain:tool_skill_opportunity_resolved", "routing", {
          opportunity: args.turnFrame.tool_skill_opportunity,
          recommendation: recommendationToolRun,
          opportunity_recommendation: opportunityRecommendation,
        }, opportunityRecommendation ? "info" : "debug");
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
  return String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[’‘`´]/g, "'")
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function surfaceLabelSelfQuotePattern(surfaceLabel: string): RegExp {
  const escaped = escapeRegExp(surfaceLabel).replace(/['’]/g, "['’]");
  return new RegExp(`${escaped}\\s*["“”]${escaped}["“”]`, "i");
}

function userExplicitlyAsksForTool(text: string): boolean {
  const normalized = normalizeRecommendationText(text);
  return /\b(outil|outil sophia|truc|methode|aide simple|le plus simple|propose-moi|propose moi|a utiliser|utiliser ce soir|qu[' ]?est-ce que je peux utiliser)\b/
    .test(normalized);
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
  if (
    args.skillOutput?.recommendation_need?.needed &&
    userExplicitlyAsksForTool(args.userMessage)
  ) return true;
  if (args.turnFrame.skill_signals.entry?.product_help?.detected) return true;
  return Boolean(args.skillOutput) &&
    userExplicitlyAsksForTool(args.userMessage);
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

function operationOpportunityLevel(
  opportunity: ToolSkillOpportunity,
): ProductRecommendation["presentation_level"] {
  if (opportunity.confidence_band === "high") return 2;
  if (opportunity.confidence_band === "medium") return 1;
  return 0;
}

function operationOpportunityOfferText(args: {
  opportunity: ToolSkillOpportunity;
  surfaceLabel: string | null;
}): string {
  return renderToolSkillOpportunityOfferText({
    opportunityType: args.opportunity.type,
    targetHint: args.opportunity.target_hint,
    surfaceLabel: args.surfaceLabel,
  });
}

function buildOperationInputFromOpportunity(args: {
  opportunity: ToolSkillOpportunity;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
}): Record<string, unknown> | null {
  const opportunity = args.opportunity;
  const targetHint = String(opportunity.target_hint ?? "").trim();
  const targetItem = targetHint
    ? (args.planItemSnapshot ?? []).find((item) =>
      normalizeRecommendationText(item.title) ===
        normalizeRecommendationText(targetHint) ||
      normalizeRecommendationText(targetHint).includes(
        normalizeRecommendationText(item.title),
      ) ||
      normalizeRecommendationText(item.title).includes(
        normalizeRecommendationText(targetHint),
      )
    ) ?? null
    : null;
  const planTarget = targetItem
    ? {
      kind: "plan_item",
      plan_item_id: targetItem.id,
      title: targetItem.title,
    }
    : targetHint
    ? {
      kind: "personal_action",
      title: targetHint,
    }
    : null;

  if (opportunity.type === "attack_card") {
    return {
      target: planTarget,
      blocker: {
        type: "friction",
        reason: opportunity.prop_reason,
        source_span: opportunity.source_span,
      },
      desired_attack_angle: "preparer_terrain",
    };
  }
  if (opportunity.type === "defense_card") {
    return {
      attachment: planTarget,
      risk_situation: {
        label: opportunity.source_span ?? opportunity.prop_reason ??
          "risque récurrent",
      },
    };
  }
  if (
    opportunity.type === "portion" || opportunity.type === "plan_adjustment"
  ) {
    return {
      target: planTarget,
      scope: planTarget,
      adjustment_type: opportunity.surface_id === "plan_item.clarify"
        ? "clarify"
        : "reduce",
      reason: opportunity.prop_reason,
    };
  }
  if (opportunity.type === "self_reminder") {
    return {
      message_hint: opportunity.source_span ?? targetHint,
      reason: opportunity.prop_reason,
    };
  }
  if (opportunity.type === "state_potion") {
    const source = normalizeRecommendationText(
      `${opportunity.source_span ?? ""} ${opportunity.prop_reason ?? ""}`,
    );
    const state = /honte|culpabil/.test(source)
      ? "shame_guilt"
      : /stress|pression|angoisse|panique/.test(source)
      ? "stress_pressure"
      : /flou|confus|surcharge/.test(source)
      ? "confusion_overload"
      : /peur|evite|evitement/.test(source)
      ? "fear_avoidance"
      : /nul|incapable|dur avec moi/.test(source)
      ? "self_harshness"
      : /decroche|decrochage/.test(source)
      ? "decrochage"
      : null;
    return state
      ? { state, source_span: opportunity.source_span ?? null }
      : { source_span: opportunity.source_span ?? null };
  }
  return null;
}

function recommendationTargetTitle(
  recommendation: ProductRecommendation | null,
): string | null {
  const input = recommendation?.operation_input;
  if (!input || typeof input !== "object") return null;
  return planItemTitleFromOperationInput(input);
}

export function operationOpportunityShouldOverrideRecommendation(args: {
  opportunity: ToolSkillOpportunity | null;
  recommendation: ProductRecommendation | null;
  opportunityRecommendation: ProductRecommendation | null;
}): boolean {
  const opportunity = args.opportunity;
  const recommendation = args.recommendation;
  const opportunityRecommendation = args.opportunityRecommendation;
  if (!opportunity || !opportunityRecommendation) return false;
  if (
    !opportunity.should_offer ||
    opportunity.confidence_band !== "high" ||
    opportunity.offer_timing !== "now" ||
    !opportunity.operation_type
  ) return false;
  if (!recommendation) return true;
  if (opportunity.target_status !== "identified") return false;
  if (recommendation.operation_type !== opportunity.operation_type) {
    return false;
  }
  const opportunityTarget = normalizeRecommendationText(
    recommendationTargetTitle(opportunityRecommendation) ??
      opportunity.target_hint ?? "",
  );
  if (!opportunityTarget) return true;
  const recommendationTarget = normalizeRecommendationText(
    recommendationTargetTitle(recommendation) ?? "",
  );
  return !recommendationTarget || recommendationTarget !== opportunityTarget;
}

export function buildRecommendationFromToolSkillOpportunity(args: {
  turnFrame: TurnFrame | null;
  surfaceLabel: string | null;
  planItemSnapshot?: V2PlanItemSnapshotItem[] | null;
  requestId?: string | null;
}): ProductRecommendation | null {
  const opportunity = args.turnFrame?.tool_skill_opportunity ?? null;
  if (
    !opportunity ||
    opportunity.type === "none" ||
    !opportunity.should_offer ||
    opportunity.confidence_band !== "high" ||
    !opportunity.operation_type ||
    !opportunity.surface_id ||
    opportunity.offer_timing !== "now"
  ) return null;
  const operationInput = buildOperationInputFromOpportunity({
    opportunity,
    planItemSnapshot: args.planItemSnapshot,
  });
  return {
    recommendation_id: `dispatcher_opportunity:${opportunity.type}:${
      args.requestId ?? args.turnFrame?.turn_id ?? "local"
    }`,
    decision: "recommend_operation",
    surface_id: opportunity.surface_id,
    executor_tool_id: opportunity.operation_type,
    operation_type: opportunity.operation_type,
    operation_input: operationInput,
    confidence: opportunity.confidence_band === "high" ? 0.86 : 0.72,
    timing: "now",
    presentation_level: operationOpportunityLevel(opportunity),
    cta_style: "soft",
    requires_consent: true,
    reason: opportunity.prop_reason ??
      `dispatcher_tool_skill_opportunity:${opportunity.type}`,
    user_facing_offer: operationOpportunityOfferText({
      opportunity,
      surfaceLabel: args.surfaceLabel,
    }),
    alternatives: [],
    do_not_recommend: [],
  };
}

export function buildToolSkillOpportunityAddon(args: {
  turnFrame: TurnFrame | null;
  recommendation: ProductRecommendation | null;
  surfaceLabel: string | null;
}): string | null {
  const opportunity = args.turnFrame?.tool_skill_opportunity ?? null;
  const recommendation = args.recommendation;
  if (!opportunity || !recommendation) return null;
  const offer = String(recommendation.user_facing_offer ?? "").trim();
  return [
    "=== ADDON OPERATION OPPORTUNITY OFFER ===",
    `type: ${opportunity.type}`,
    `surface_label: ${args.surfaceLabel ?? "none"}`,
    `operation_type: ${recommendation.operation_type ?? "none"}`,
    `prop_reason: ${opportunity.prop_reason ?? "none"}`,
    `source_span: ${opportunity.source_span ?? "none"}`,
    `target_hint: ${opportunity.target_hint ?? "none"}`,
    offer ? `suggested_offer: ${offer}` : null,
    "",
    "CONSIGNE:",
    "- Reponds d'abord au besoin principal du user; ne remplace pas la reponse par une vente d'outil.",
    "- Si tu proposes l'opportunite, fais-le en une seule question optionnelle et courte.",
    "- Ne lance aucune operation maintenant. Demande l'accord explicite.",
    "- Si le user veut juste que ce soit note, accepte et ne pousse pas l'outil.",
    "- Ne dis jamais les champs techniques type, surface_id, operation_type ou prop_reason.",
    "- Regle produit cartes: ne dis jamais qu'une carte d'attaque peut etre modifiee librement. Une carte Mot de bascule permet seulement de remplacer le mot; si le contexte, la technique ou le contenu ne convient plus, propose d'en preparer une nouvelle version apres confirmation.",
    "=== FIN ADDON OPERATION OPPORTUNITY OFFER ===",
  ].filter(Boolean).join("\n");
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
  const fromDispatcherOpportunity = String(
    recommendation?.recommendation_id ?? "",
  ).startsWith("dispatcher_opportunity:");
  const explicitToolAsk = userExplicitlyAsksForTool(args.userMessage);
  if (
    !recommendation ||
    recommendation.decision !== "recommend_operation" ||
    !surfaceLabel ||
    (!explicitToolAsk && !fromDispatcherOpportunity)
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
  const selfQuotedLabel = surfaceLabelSelfQuotePattern(surfaceLabel);
  const resolvedResponse = resolvedTargetTitle && selfQuotedLabel.test(response)
    ? response.replace(
      selfQuotedLabel,
      `${surfaceLabel} pour "${resolvedTargetTitle}"`,
    )
    : response;

  const normalizedResponse = normalizeRecommendationText(response);
  const normalizedLabel = normalizeRecommendationText(surfaceLabel);
  if (normalizedResponse.includes(normalizedLabel)) return resolvedResponse;

  if (
    fromDispatcherOpportunity && !explicitToolAsk &&
    recommendation.operation_type === "select_state_potion"
  ) {
    return resolvedResponse;
  }

  if (fromDispatcherOpportunity && !explicitToolAsk) {
    return renderRecommendationToolVisibleReply({
      responseContent: resolvedResponse,
      surfaceLabel,
      operationType: recommendation.operation_type,
      fromDispatcherOpportunity,
      explicitToolAsk,
      resolvedTargetTitle,
    });
  }

  const offer = String(recommendation.user_facing_offer ?? "").trim();
  const naturalOffer = offer
    ? offer
      .replace(/\balleger\b/gi, "alléger")
      .replace(/\belan\b/gi, "élan")
      .replace(/[.!?…]+$/u, "")
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
      fromDispatcherOpportunity,
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
    fromDispatcherOpportunity,
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
