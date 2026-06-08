/// <reference path="../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import type { OperationRuntimeResult } from "../../router/effect_ledger_adapter.ts";
import { loadProductSurfaceRegistry } from "../../product_surface_registry/registry.ts";
import { runProductHelpSkill } from "../product_help/skill.ts";
import { maybeRunStatusRecapRuntime } from "../status_recap/runtime.ts";
import type { StatusRecapLocalDispatcher } from "../status_recap/local_flow.ts";
import type { StatusRecapObjectType } from "../status_recap/contract.ts";
import { maybeRunUpdateCoachPreferencesOperation } from "../../tools/operations/update_coach_preferences/router.ts";
import { maybeRunPrepareAttackCardOperation } from "../../tools/operations/prepare_attack_card/router.ts";
import { maybeRunPrepareDefenseCardOperation } from "../../tools/operations/prepare_defense_card/router.ts";
import type { runSafetyPregate } from "../../safety/safety_pregate.ts";
import type {
  FlowOpportunityDispatcherOutput,
  FlowOpportunityLocalState,
  FlowOpportunityPayload,
  FlowOpportunityTargetFlow,
} from "./contract.ts";
import {
  buildInitialOfferDispatcherOutput,
  normalizeFlowOpportunityDispatcherOutput,
  reduceFlowOpportunityDispatcherOutput,
} from "./reducer.ts";
import {
  appendGetInfoHistory,
  FLOW_OPPORTUNITY_EXIT_MEMO_KEY,
  hasActiveFlowOpportunityState,
  readFlowOpportunityState,
  targetContextFromSeed,
  writeFlowOpportunityState,
} from "./state.ts";
import {
  buildFlowOpportunityLocalDispatcherUserPrompt,
  FLOW_OPPORTUNITY_LOCAL_DISPATCHER_PROMPT_VERSION,
  flowOpportunityLocalDispatcherSystemPrompt,
} from "./prompt.ts";
import {
  type FlowOpportunityVisibleAgent,
  runFlowOpportunityVisibleAgent,
} from "./visible_agent.ts";

export type FlowOpportunityLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: FlowOpportunityLocalState;
  initial_payload: FlowOpportunityPayload;
  turn_frame: TurnFrame | null;
  route_decision: RouteDecision | null;
  safety: unknown;
};

export type FlowOpportunityLocalDispatcher = (
  input: FlowOpportunityLocalDispatcherInput,
) => Promise<FlowOpportunityDispatcherOutput | null>;

const SUPPORTED_TARGET_FLOWS = [
  "status_recap",
  "update_coach_preferences",
  "emotional_repair",
  "demotivation_repair",
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
  "adjust_plan_item",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function stringArray(value: unknown, max = 10): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean).slice(0, max)
    : [];
}

function confidenceRank(value: unknown): number {
  return value === "critical"
    ? 4
    : value === "high"
    ? 3
    : value === "medium"
    ? 2
    : value === "low"
    ? 1
    : 0;
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" ? "high" : value === "medium" ? "medium" : "low";
}

function targetFlow(value: unknown): FlowOpportunityTargetFlow {
  const raw = stringValue(value);
  return SUPPORTED_TARGET_FLOWS.includes(raw)
    ? raw as FlowOpportunityTargetFlow
    : "unknown";
}

function recentMessagesFromHistory(history: unknown): Array<{
  role: "user" | "assistant";
  content: string;
}> {
  return Array.isArray(history)
    ? history.flatMap((message) => {
      const role = String((message as any)?.role ?? "");
      const content = String((message as any)?.content ?? "").trim();
      if ((role === "user" || role === "assistant") && content) {
        return [{ role: role as "user" | "assistant", content }];
      }
      return [];
    }).slice(-8)
    : [];
}

function emptyToolOpportunity() {
  return {
    type: "none" as const,
    operation_type: null,
    surface_id: null,
    confidence_band: "low" as const,
    should_offer: false,
    prop_reason: null,
    source_span: null,
    target_hint: null,
    target_status: "none" as const,
    suggested_question_intent: null,
    offer_timing: "never" as const,
    must_not_execute: true as const,
  };
}

function syntheticLocalTurnFrame(args: {
  turnFrame: TurnFrame | null;
  userId: string;
  channel: "web" | "whatsapp";
  sourceMessageId?: string | null;
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
}): TurnFrame {
  return {
    turn_id: args.turnFrame?.turn_id ?? args.sourceMessageId ??
      crypto.randomUUID(),
    source_message_id: args.turnFrame?.source_message_id ??
      args.sourceMessageId ?? crypto.randomUUID(),
    user_id: args.userId,
    channel: args.channel,
    safety: {
      risk_band: args.safetyPregateOutput.risk_band,
      reason_codes: args.safetyPregateOutput.reason_codes ?? [],
      evidence: args.safetyPregateOutput.evidence ?? [],
    },
    conversation_risk: {
      score: 0,
      threshold: 8,
      should_exit_flows: false,
      reason_codes: [],
      previous_scores: [],
      matrix: [],
      context_summary: null,
    },
    direct_effects: [],
    tool_skill_intents: [],
    tool_skill_opportunity: emptyToolOpportunity(),
    skill_signals: {},
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "taxonomy_first",
    },
  };
}

function routeIsDirect(routeDecision: RouteDecision | null): boolean {
  if (!routeDecision) return false;
  if (routeDecision.response_owner === "safety") return true;
  if (routeDecision.response_owner === "product_help") return true;
  if (routeDecision.response_owner === "tool_skill") return true;
  if (routeDecision.selected_handler === "status_only_no_mutation_check") {
    return true;
  }
  if (routeDecision.reason_code.includes("status_only")) return true;
  return routeDecision.reason_code.includes("status_recap");
}

function hasExplicitToolIntent(turnFrame: TurnFrame | null): boolean {
  return (turnFrame?.tool_skill_intents ?? []).some((intent) =>
    intent.user_intent !== "explain_only" &&
    intent.explicitness === "explicit" &&
    confidenceRank(intent.confidence_band) >= confidenceRank("medium")
  );
}

function flowOpportunityFromCanonicalField(
  turnFrame: TurnFrame | null,
): FlowOpportunityPayload | null {
  const raw = (turnFrame as any)?.flow_opportunity;
  if (!isRecord(raw)) return null;
  const flow = targetFlow(raw.target_flow);
  if (flow === "unknown") return null;
  return {
    opportunity_id: stringValue(raw.opportunity_id) || `${flow}.opportunity`,
    target_flow: flow,
    target_action: stringValue(raw.target_action) || `run_${flow}`,
    confidence: confidence(raw.confidence),
    priority: Number(raw.priority ?? 0) || 0,
    reason: stringValue(raw.reason),
    evidence: stringArray(raw.evidence),
    seed_context: isRecord(raw.seed_context) ? raw.seed_context : {},
  };
}

function flowOpportunityFromLegacyToolOpportunity(
  turnFrame: TurnFrame | null,
): FlowOpportunityPayload | null {
  const opportunity = turnFrame?.tool_skill_opportunity;
  if (!opportunity?.should_offer || !opportunity.operation_type) return null;
  const flow = targetFlow(opportunity.operation_type);
  if (flow === "unknown") return null;
  return {
    opportunity_id: `${flow}.${opportunity.type}`,
    target_flow: flow,
    target_action: `run_${flow}`,
    confidence: confidence(opportunity.confidence_band),
    priority: opportunity.confidence_band === "high" ? 80 : 60,
    reason: opportunity.prop_reason ?? "structured opportunity",
    evidence: [opportunity.source_span, opportunity.prop_reason].filter((
      value,
    ): value is string => typeof value === "string" && value.trim().length > 0),
    seed_context: {
      focus: opportunity.target_hint ? [opportunity.target_hint] : [],
      surface: opportunity.surface_id,
      target_hint: opportunity.target_hint,
      legacy_tool_skill_opportunity: opportunity,
    },
  };
}

function flowOpportunityFromSkillSignal(
  turnFrame: TurnFrame | null,
): FlowOpportunityPayload | null {
  const entries = turnFrame?.skill_signals.entry ?? {};
  const candidates: Array<{
    id: string;
    target_flow: FlowOpportunityTargetFlow;
    priority: number;
  }> = [
    { id: "status_recap", target_flow: "status_recap", priority: 75 },
    {
      id: "demotivation_repair",
      target_flow: "demotivation_repair",
      priority: 70,
    },
    { id: "emotional_repair", target_flow: "emotional_repair", priority: 70 },
  ];
  const candidate = candidates
    .map((item) => ({ ...item, signal: entries[item.id] }))
    .filter((item) =>
      item.signal?.detected === true &&
      confidenceRank(item.signal.confidence_band) >= confidenceRank("medium")
    )
    .sort((left, right) =>
      confidenceRank(right.signal?.confidence_band) -
        confidenceRank(left.signal?.confidence_band) ||
      right.priority - left.priority
    )[0];
  if (!candidate) return null;
  return {
    opportunity_id: `${candidate.target_flow}.implicit_need`,
    target_flow: candidate.target_flow,
    target_action: `run_${candidate.target_flow}`,
    confidence: confidence(candidate.signal?.confidence_band),
    priority: candidate.priority,
    reason: stringValue(candidate.signal?.reason) ||
      "structured conversation skill opportunity",
    evidence: stringValue(candidate.signal?.reason)
      ? [stringValue(candidate.signal?.reason)]
      : [],
    seed_context: {
      focus: candidate.target_flow === "status_recap" ? ["current_state"] : [],
      surface: candidate.target_flow === "status_recap" ? "status" : null,
    },
  };
}

export function selectFlowOpportunityForTurn(args: {
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  tempMemory: unknown;
}): FlowOpportunityPayload | null {
  if (!args.turnFrame) return null;
  if (hasActiveFlowOpportunityState(args.tempMemory)) return null;
  if (routeIsDirect(args.routeDecision)) return null;
  if (hasExplicitToolIntent(args.turnFrame)) return null;
  return flowOpportunityFromCanonicalField(args.turnFrame) ??
    flowOpportunityFromLegacyToolOpportunity(args.turnFrame) ??
    flowOpportunityFromSkillSignal(args.turnFrame);
}

export async function runFlowOpportunityLocalDispatcher(
  input: FlowOpportunityLocalDispatcherInput,
): Promise<FlowOpportunityDispatcherOutput | null> {
  try {
    const raw = await generateWithGemini(
      flowOpportunityLocalDispatcherSystemPrompt(),
      buildFlowOpportunityLocalDispatcherUserPrompt({
        user_message: input.user_message,
        active_state: input.active_state,
        initial_payload: input.initial_payload,
        recent_user_messages: input.active_state.recent_user_messages,
        subskill_history: input.active_state.subskill_history,
        supported_target_flows: SUPPORTED_TARGET_FLOWS,
        safety: input.safety,
      }),
      0.2,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "flow_opportunity_verification.local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizeFlowOpportunityDispatcherOutput(raw);
  } catch (error) {
    console.warn("[FlowOpportunityVerification] dispatcher failed", error);
    return null;
  }
}

function initialPayloadFromState(
  state: FlowOpportunityLocalState,
): FlowOpportunityPayload {
  return {
    opportunity_id: state.opportunity_id,
    target_flow: state.target_flow,
    target_action: state.target_action,
    confidence: "high",
    priority: 0,
    reason: state.confirmation_anchor.meaning,
    evidence: state.origin.evidence,
    seed_context: state.target_context,
  };
}

async function renderVisible(args: {
  userId: string;
  requestId?: string | null;
  userMessage: string;
  history?: unknown;
  state: FlowOpportunityLocalState | null;
  visibleTask: FlowOpportunityDispatcherOutput["visible_task"];
  visibleAgent?: FlowOpportunityVisibleAgent;
}): Promise<string> {
  const visibleAgent = args.visibleAgent ?? runFlowOpportunityVisibleAgent;
  return await visibleAgent({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    stage: args.visibleTask.kind,
    user_message: args.userMessage,
    recent_messages: recentMessagesFromHistory(args.history),
    local_state: args.state,
    dispatcher_instruction: args.visibleTask.instruction,
  }) ?? "";
}

async function runInlineGetInfoProduct(args: {
  userId: string;
  userMessage: string;
  history?: unknown;
  turnFrame: TurnFrame | null;
  state: FlowOpportunityLocalState;
  subskillContext: Record<string, unknown> | null;
  tempMemory: any;
}): Promise<OperationRuntimeResult> {
  const registry = await loadProductSurfaceRegistry();
  const context = {
    skill_id: "product_help",
    user_id: args.userId,
    recent_messages: recentMessagesFromHistory(args.history),
    active_skill_working_state: {
      skill_id: "product_help",
      origin_flow: "flow_opportunity_verification",
      opportunity_id: args.state.opportunity_id,
      target_flow: args.state.target_flow,
      target_context: args.state.target_context,
      confirmation_anchor: args.state.confirmation_anchor,
      preserve_active_flow: true,
      ...(args.subskillContext ?? {}),
    },
    turn_frame: args.turnFrame,
    relevant_memory_items: [],
    plan_items: [],
    product_surfaces: registry.surfaces,
    exclusions: [],
  } as any;
  const skillOutput = await runProductHelpSkill({
    user_message: args.userMessage,
    context,
  });
  const content = String(skillOutput.reply ?? "").trim();
  const nextState = appendGetInfoHistory({
    state: args.state,
    skillId: "product_help",
    userMessage: args.userMessage,
    reply: content,
    context: context.active_skill_working_state,
  });
  return {
    content,
    nextTempMemory: writeFlowOpportunityState(args.tempMemory, nextState),
    toolExecution: "none",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "flow_opportunity_verification",
      skill_id: "flow_opportunity_verification",
      mode: "local_verification_flow",
      status: "explaining",
      reason_code: "flow_opportunity_verification_get_info_product",
      flow_action: "get_info_product",
      subskill_run: {
        selected_handler: "product_help",
        skill_output: skillOutput,
      },
      visible_task: { kind: "none" },
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [],
      toolExecution: "none",
      executedTools: [],
      runtime_trace: [{
        component: "flow_opportunity_verification",
        event: "get_info_product_called",
        preserve_active_flow: true,
      }, {
        component: "flow_opportunity_verification",
        event: "get_info_product_returned_to_flow",
        confirmation_anchor_present: Boolean(nextState.confirmation_anchor),
      }],
    },
  };
}

function statusRecapDispatcherForOpportunity(
  state: FlowOpportunityLocalState,
): StatusRecapLocalDispatcher {
  const objectTypes = statusRecapObjectsFromTargetContext(state.target_context);
  return async () => ({
    flow_action: "answer_object_status",
    confidence: "high",
    risk_score: 0,
    status_intent: {
      kind: "object_status",
      summary: `flow opportunity accepted for ${state.target_flow}`,
      requires_db_projection: true,
      requires_effect_history: false,
    },
    target_objects: objectTypes,
    read_scope: {
      requested_categories: ["all"],
      include_cancelled: false,
      include_recent_failed_or_blocked_effects: false,
      format: "compact",
    },
    state_updates: {
      status: "active",
      turn_count_increment: 1,
      close_after_visible: true,
    },
    visible_task: {
      kind: "object_status",
      instruction: "Answer the accepted flow opportunity from DB projection.",
    },
    exit_memo: {
      needed: false,
      reason: "none",
      user_intent_summary: null,
      local_flow_context: {
        skill_id: "status_recap",
        last_intent: "object_status",
        last_target_objects: objectTypes,
        last_answer_summary: null,
        last_projection_summary: null,
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "unknown",
        why: null,
        constraints: [],
      },
    },
    evidence: state.origin.evidence,
  });
}

function statusRecapObjectsFromTargetContext(
  targetContext: Record<string, unknown>,
): StatusRecapObjectType[] {
  const allowed = new Set<StatusRecapObjectType>([
    "attack_card",
    "defense_card",
    "one_shot_reminder",
    "recurring_reminder",
    "potion",
    "coach_preference",
    "plan_item",
    "memory",
    "unknown",
  ]);
  const values = [
    ...stringArray(targetContext.focus),
    stringValue(targetContext.surface),
  ].filter(Boolean);
  const normalized = values
    .map((value) => value === "active_potions" ? "potion" : value)
    .map((value) => value === "coach_preferences" ? "coach_preference" : value)
    .filter((value): value is StatusRecapObjectType =>
      allowed.has(value as StatusRecapObjectType)
    );
  return normalized.length ? [...new Set(normalized)].slice(0, 4) : ["unknown"];
}

async function runInlineGetInfoDb(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  userTimezone: string;
  history?: unknown;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  state: FlowOpportunityLocalState;
  subskillContext: Record<string, unknown> | null;
  tempMemory: any;
  requestId?: string | null;
}): Promise<OperationRuntimeResult> {
  const statusRuntime = await maybeRunStatusRecapRuntime({
    supabase: args.supabase,
    userId: args.userId,
    userMessage: args.userMessage,
    userTimezone: args.userTimezone,
    tempMemory: {},
    turnFrame: args.turnFrame,
    routeDecision: args.routeDecision,
    activeOperationIntake: null,
    history: args.history,
    requestId: args.requestId ?? null,
    runLocalDispatcher: statusRecapDispatcherForOpportunity(args.state),
  });
  const content = String(statusRuntime?.content ?? "").trim();
  const nextState = appendGetInfoHistory({
    state: args.state,
    skillId: "status_recap",
    userMessage: args.userMessage,
    reply: content,
    context: {
      origin_flow: "flow_opportunity_verification",
      opportunity_id: args.state.opportunity_id,
      target_flow: args.state.target_flow,
      target_context: args.state.target_context,
      confirmation_anchor: args.state.confirmation_anchor,
      preserve_active_flow: true,
      ...(args.subskillContext ?? {}),
    },
  });
  return {
    content: content ||
      "Je n'arrive pas à lire cet état maintenant, donc je garde la proposition en cours.",
    additionalContents: statusRuntime?.additionalContents,
    nextTempMemory: writeFlowOpportunityState(args.tempMemory, nextState),
    toolExecution: "none",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "flow_opportunity_verification",
      skill_id: "flow_opportunity_verification",
      mode: "local_verification_flow",
      status: "explaining",
      reason_code: "flow_opportunity_verification_get_info_db",
      flow_action: "get_info_db",
      subskill_run: {
        selected_handler: statusRuntime?.toolSkillRun?.selected_handler ??
          "status_recap",
        skill_output: statusRuntime?.toolSkillRun ?? null,
      },
      visible_task: { kind: "none" },
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [],
      toolExecution: "none",
      executedTools: [],
      runtime_trace: [{
        component: "flow_opportunity_verification",
        event: "get_info_db_called",
        preserve_active_flow: true,
      }, {
        component: "flow_opportunity_verification",
        event: "get_info_db_returned_to_flow",
        confirmation_anchor_present: Boolean(nextState.confirmation_anchor),
      }],
    },
  };
}

async function launchTargetFlow(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  history?: unknown;
  tempMemory: any;
  state: FlowOpportunityLocalState;
  turnFrame: TurnFrame | null;
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  sourceMessageId?: string | null;
  requestId?: string | null;
  runPrepareAttackCardOperation?: typeof maybeRunPrepareAttackCardOperation;
  runPrepareDefenseCardOperation?: typeof maybeRunPrepareDefenseCardOperation;
}): Promise<OperationRuntimeResult> {
  const clearedTempMemory = writeFlowOpportunityState(args.tempMemory, null);
  const localTurnFrame = syntheticLocalTurnFrame({
    turnFrame: args.turnFrame,
    userId: args.userId,
    channel: args.channel,
    sourceMessageId: args.sourceMessageId ?? null,
    safetyPregateOutput: args.safetyPregateOutput,
  });
  const targetRoute: RouteDecision = {
    route_version: "v1",
    response_owner: args.state.target_flow === "status_recap"
      ? "normal_reply"
      : "tool_skill",
    selected_handler: args.state.target_flow === "status_recap"
      ? "status_only_no_mutation_check"
      : args.state.target_flow,
    direct_effects_to_run: [],
    blocked_paths: [],
    reason_code: "flow_opportunity_verification_target_flow_launched",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
  };
  const launched = args.state.target_flow === "status_recap"
    ? await maybeRunStatusRecapRuntime({
      supabase: args.supabase,
      userId: args.userId,
      userMessage: args.userMessage,
      userTimezone: args.userTimezone,
      tempMemory: clearedTempMemory,
      turnFrame: localTurnFrame,
      routeDecision: targetRoute,
      activeOperationIntake: null,
      history: args.history,
      requestId: args.requestId ?? null,
      runLocalDispatcher: statusRecapDispatcherForOpportunity(args.state),
    })
    : args.state.target_flow === "update_coach_preferences"
    ? await maybeRunUpdateCoachPreferencesOperation({
      supabase: args.supabase,
      userId: args.userId,
      userMessage: args.userMessage,
      channel: args.channel,
      userTimezone: args.userTimezone,
      tempMemory: clearedTempMemory,
      turnFrame: {
        ...localTurnFrame,
        tool_skill_intents: [{
          operation_type: "update_coach_preferences",
          explicitness: "explicit",
          target_hint: stringValue(args.state.target_context.user_need) ||
            stringValue(args.state.target_context.target_hint),
          operation_input: args.state.target_context,
          confidence_band: "high",
          ambiguity: "none",
          user_intent: "update",
        }],
      },
      routeDecision: targetRoute,
      safetyPregateOutput: args.safetyPregateOutput,
      sourceMessageId: args.sourceMessageId ?? null,
      requestId: args.requestId ?? null,
      history: args.history,
    })
    : args.state.target_flow === "prepare_attack_card"
    ? await (args.runPrepareAttackCardOperation ??
      maybeRunPrepareAttackCardOperation)({
        supabase: args.supabase,
        userId: args.userId,
        userMessage: args.userMessage,
        channel: args.channel,
        userTimezone: args.userTimezone,
        tempMemory: clearedTempMemory,
        turnFrame: {
          ...localTurnFrame,
          tool_skill_intents: [{
            operation_type: "prepare_attack_card",
            explicitness: "explicit",
            target_hint: stringValue(args.state.target_context.target_hint) ||
              args.state.target_action,
            operation_input: args.state.target_context,
            confidence_band: "high",
            ambiguity: "none",
            user_intent: "create",
          }],
        },
        routeDecision: targetRoute,
        safetyPregateOutput: args.safetyPregateOutput,
        sourceMessageId: args.sourceMessageId ?? null,
        requestId: args.requestId ?? null,
        history: args.history,
      })
    : args.state.target_flow === "prepare_defense_card"
    ? await (args.runPrepareDefenseCardOperation ??
      maybeRunPrepareDefenseCardOperation)({
        supabase: args.supabase,
        userId: args.userId,
        userMessage: args.userMessage,
        channel: args.channel,
        userTimezone: args.userTimezone,
        tempMemory: clearedTempMemory,
        turnFrame: {
          ...localTurnFrame,
          tool_skill_intents: [{
            operation_type: "prepare_defense_card",
            explicitness: "explicit",
            target_hint: stringValue(args.state.target_context.target_hint) ||
              args.state.target_action,
            operation_input: args.state.target_context,
            confidence_band: "high",
            ambiguity: "none",
            user_intent: "create",
          }],
        },
        routeDecision: targetRoute,
        safetyPregateOutput: args.safetyPregateOutput,
        sourceMessageId: args.sourceMessageId ?? null,
        requestId: args.requestId ?? null,
        history: args.history,
      })
    : null;
  if (launched) {
    return {
      ...launched,
      nextTempMemory: writeFlowOpportunityState(
        launched.nextTempMemory ?? clearedTempMemory,
        null,
      ),
      toolSkillRun: {
        ...launched.toolSkillRun,
        launched_by: "flow_opportunity_verification",
        original_opportunity_id: args.state.opportunity_id,
      },
    };
  }
  return {
    content:
      "Je garde l'idée, mais je n'arrive pas à lancer le flow cible correctement sur ce tour.",
    nextTempMemory: clearedTempMemory,
    toolExecution: "blocked",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "flow_opportunity_verification",
      skill_id: "flow_opportunity_verification",
      status: "blocked",
      reason_code: "flow_opportunity_verification_target_flow_launch_failed",
      target_flow: args.state.target_flow,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [{
        type: "target_flow",
        reason_code: "target_flow_launch_failed",
      }],
      toolExecution: "blocked",
      executedTools: [],
    },
  };
}

export async function maybeRunFlowOpportunityVerificationRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  history?: unknown;
  tempMemory: any;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  sourceMessageId?: string | null;
  requestId?: string | null;
  runLocalDispatcher?: FlowOpportunityLocalDispatcher;
  runVisibleAgent?: FlowOpportunityVisibleAgent;
  runPrepareAttackCardOperation?: typeof maybeRunPrepareAttackCardOperation;
  runPrepareDefenseCardOperation?: typeof maybeRunPrepareDefenseCardOperation;
}): Promise<OperationRuntimeResult | null> {
  if (String(args.safetyPregateOutput.risk_band ?? "none") === "critical") {
    return null;
  }
  const previous = readFlowOpportunityState(args.tempMemory);
  const selectedOpportunity = previous
    ? initialPayloadFromState(previous)
    : selectFlowOpportunityForTurn({
      turnFrame: args.turnFrame,
      routeDecision: args.routeDecision,
      tempMemory: args.tempMemory,
    });
  if (!selectedOpportunity) return null;

  console.info("[FlowOpportunityVerification] global_opportunity_selected", {
    active_flow: Boolean(previous),
    opportunity_id: selectedOpportunity.opportunity_id,
    target_flow: selectedOpportunity.target_flow,
  });

  const decision = previous
    ? await (args.runLocalDispatcher ?? runFlowOpportunityLocalDispatcher)({
      user_id: args.userId,
      request_id: args.requestId ?? null,
      user_message: args.userMessage,
      recent_messages: recentMessagesFromHistory(args.history),
      active_state: previous,
      initial_payload: selectedOpportunity,
      turn_frame: args.turnFrame,
      route_decision: args.routeDecision,
      safety: args.safetyPregateOutput,
    })
    : buildInitialOfferDispatcherOutput({
      opportunity_id: selectedOpportunity.opportunity_id,
      target_flow: selectedOpportunity.target_flow,
      target_action: selectedOpportunity.target_action,
      target_context: targetContextFromSeed(selectedOpportunity.seed_context),
      reason: selectedOpportunity.reason,
      evidence: selectedOpportunity.evidence,
    });
  if (!decision) {
    return {
      content:
        "Je n'arrive pas à vérifier cette proposition correctement, donc je ne la lance pas.",
      nextTempMemory: args.tempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "flow_opportunity_verification",
        skill_id: "flow_opportunity_verification",
        status: "blocked",
        reason_code: "flow_opportunity_verification_local_dispatcher_failed",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [{
          type: "local_dispatcher",
          reason_code: "local_dispatcher_failed",
        }],
        toolExecution: "blocked",
        executedTools: [],
      },
    };
  }

  console.info("[FlowOpportunityVerification] local_action", {
    local_action: decision.local_action,
    visible_task: decision.visible_task.kind,
    target_flow: decision.opportunity.target_flow,
  });

  const reduced = reduceFlowOpportunityDispatcherOutput({
    previous,
    output: decision,
    userMessage: args.userMessage,
  });
  if (reduced.exit_to_global_dispatcher) {
    const exitMemo = {
      ...reduced.exit_memo,
      at: new Date().toISOString(),
      reducer_reason_code: reduced.reason_code,
    };
    console.info("[FlowOpportunityVerification] exit_to_global_dispatcher", {
      exit_memo: exitMemo,
    });
    return {
      content: "",
      nextTempMemory: {
        ...writeFlowOpportunityState(args.tempMemory, null),
        [FLOW_OPPORTUNITY_EXIT_MEMO_KEY]: exitMemo,
      },
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "flow_opportunity_verification",
        skill_id: "flow_opportunity_verification",
        status: "exit",
        reason_code: "flow_opportunity_verification_exit_to_global_dispatcher",
        exit_memo: exitMemo,
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        toolExecution: "none",
        executedTools: [],
      },
    };
  }
  if (reduced.get_info_product && reduced.local_state) {
    console.info("[FlowOpportunityVerification] get_info_product_called", {
      opportunity_id: reduced.local_state.opportunity_id,
      target_flow: reduced.local_state.target_flow,
    });
    return await runInlineGetInfoProduct({
      userId: args.userId,
      userMessage: args.userMessage,
      history: args.history,
      turnFrame: args.turnFrame,
      state: reduced.local_state,
      subskillContext: reduced.subskill_context,
      tempMemory: args.tempMemory,
    });
  }
  if (reduced.get_info_db && reduced.local_state) {
    console.info("[FlowOpportunityVerification] get_info_db_called", {
      opportunity_id: reduced.local_state.opportunity_id,
      target_flow: reduced.local_state.target_flow,
    });
    return await runInlineGetInfoDb({
      supabase: args.supabase,
      userId: args.userId,
      userMessage: args.userMessage,
      userTimezone: args.userTimezone,
      history: args.history,
      turnFrame: args.turnFrame,
      routeDecision: args.routeDecision,
      state: reduced.local_state,
      subskillContext: reduced.subskill_context,
      tempMemory: args.tempMemory,
      requestId: args.requestId ?? null,
    });
  }
  if (reduced.launch_target_flow && previous) {
    console.info("[FlowOpportunityVerification] target_flow_launched", {
      opportunity_id: previous.opportunity_id,
      target_flow: previous.target_flow,
    });
    return await launchTargetFlow({
      supabase: args.supabase,
      userId: args.userId,
      userMessage: args.userMessage,
      channel: args.channel,
      userTimezone: args.userTimezone,
      history: args.history,
      tempMemory: args.tempMemory,
      state: previous,
      turnFrame: args.turnFrame,
      safetyPregateOutput: args.safetyPregateOutput,
      sourceMessageId: args.sourceMessageId ?? null,
      requestId: args.requestId ?? null,
      runPrepareAttackCardOperation: args.runPrepareAttackCardOperation,
      runPrepareDefenseCardOperation: args.runPrepareDefenseCardOperation,
    });
  }

  const content = await renderVisible({
    userId: args.userId,
    requestId: args.requestId ?? null,
    userMessage: args.userMessage,
    history: args.history,
    state: reduced.local_state,
    visibleTask: decision.visible_task,
    visibleAgent: args.runVisibleAgent,
  });
  const nextTempMemory = writeFlowOpportunityState(
    args.tempMemory,
    reduced.local_state,
  );
  console.info("[FlowOpportunityVerification] visible_task.kind", {
    kind: decision.visible_task.kind,
    confirmation_anchor_present: Boolean(
      reduced.local_state?.confirmation_anchor,
    ),
  });
  return {
    content,
    nextTempMemory,
    toolExecution: "none",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "flow_opportunity_verification",
      skill_id: "flow_opportunity_verification",
      mode: "local_verification_flow",
      status: reduced.status,
      reason_code: reduced.reason_code,
      flow_action: decision.local_action,
      visible_task: decision.visible_task,
      target_flow: reduced.target_flow,
      target_flow_input: reduced.target_flow_input,
      local_flow_state: reduced.local_state,
      operation_suggestions: [],
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: reduced.blocked_effects,
      toolExecution: "none",
      executedTools: [],
      prompt_version: FLOW_OPPORTUNITY_LOCAL_DISPATCHER_PROMPT_VERSION,
      runtime_trace: [{
        component: "flow_opportunity_verification",
        event: previous ? "local_dispatcher_called" : "local_state_created",
        global_dispatcher_skipped_due_active_flow: Boolean(previous),
      }, {
        component: "flow_opportunity_verification",
        event: "write_blocked_no_mutation_owner",
        no_db_write: true,
      }],
    },
  };
}
