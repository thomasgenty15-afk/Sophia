/// <reference path="../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import type { ConversationSkillOutput } from "../../contracts/skill_output.v1.ts";
import {
  RECENT_MESSAGE_LIMITS,
  recentChatMessagesFromHistory,
} from "../../context/recent_messages_policy.ts";
import type { OperationRuntimeResult } from "../../router/effect_ledger_adapter.ts";
import {
  createNoteInformation,
  type NoteInformation,
  noteInformationForTrace,
} from "../../contracts/note_information.v1.ts";
import { loadProductSurfaceRegistry } from "../../product_surface_registry/registry.ts";
import { runProductHelpSkill } from "../product_help/skill.ts";
import { runDemotivationRepairSkill } from "../demotivation_repair/skill.ts";
import { runEmotionalRepairSkill } from "../emotional_repair/skill.ts";
import { maybeRunStatusRecapRuntime } from "../status_recap/runtime.ts";
import {
  normalizeStatusRecapLocalDispatcherOutput,
  type StatusRecapLocalDispatcher,
} from "../status_recap/local_flow.ts";
import type { StatusRecapObjectType } from "../status_recap/contract.ts";
import { maybeRunUpdateCoachPreferencesOperation } from "../../tools/operations/update_coach_preferences/router.ts";
import { maybeRunPrepareAttackCardOperation } from "../../tools/operations/prepare_attack_card/router.ts";
import { maybeRunPrepareDefenseCardOperation } from "../../tools/operations/prepare_defense_card/router.ts";
import { maybeRunCreateRecurringReminderOperation } from "../../tools/operations/create_recurring_reminder/router.ts";
import type { SafetySignalContext } from "../../safety/safety_context.ts";
import type {
  FlowOpportunityDispatcherOutput,
  FlowOpportunityLocalState,
  FlowOpportunityPayload,
  FlowOpportunityTargetFlow,
  FlowOpportunityTargetKind,
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
  note_information_inbound?: NoteInformation | null;
  db_context_pack?: Record<string, unknown>;
  micro_memory_context?: Record<string, unknown>;
  platform_context?: Record<string, unknown>;
  turn_frame: TurnFrame | null;
  route_decision: RouteDecision | null;
  safety: unknown;
  channel: "web" | "whatsapp";
  timezone: string;
};

export type FlowOpportunityLocalDispatcher = (
  input: FlowOpportunityLocalDispatcherInput,
) => Promise<FlowOpportunityDispatcherOutput | null>;

const SUPPORTED_TARGET_FLOWS = [
  "status_recap",
  "product_help",
  "update_coach_preferences",
  "emotional_repair",
  "demotivation_repair",
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
  "adjust_plan_item",
];

const SUPPORTED_TARGET_KINDS = [
  "skill",
  "tool_skill",
  "direct_effect",
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

function targetKind(value: unknown): FlowOpportunityTargetKind {
  const raw = stringValue(value);
  return SUPPORTED_TARGET_KINDS.includes(raw)
    ? raw as FlowOpportunityTargetKind
    : "unknown";
}

function targetKindForFlow(
  flow: FlowOpportunityTargetFlow,
): FlowOpportunityTargetKind {
  switch (flow) {
    case "status_recap":
    case "product_help":
    case "emotional_repair":
    case "demotivation_repair":
      return "skill";
    case "update_coach_preferences":
    case "prepare_attack_card":
    case "prepare_defense_card":
    case "select_state_potion":
    case "create_recurring_reminder":
    case "adjust_plan_item":
      return "tool_skill";
    case "one_shot_reminder":
      return "direct_effect";
    default:
      return "unknown";
  }
}

function targetKindMatchesFlow(
  kind: FlowOpportunityTargetKind,
  flow: FlowOpportunityTargetFlow,
): boolean {
  return kind !== "unknown" && kind === targetKindForFlow(flow);
}

function recentMessagesFromHistory(history: unknown) {
  return recentChatMessagesFromHistory(history, RECENT_MESSAGE_LIMITS.toolFlow);
}

function directEffectLaneContext(turnFrame: TurnFrame | null):
  | Record<
    string,
    unknown
  >
  | null {
  const lane = (turnFrame as any)?.direct_effect_lane;
  if (!lane || typeof lane !== "object" || Array.isArray(lane)) return null;
  const committed = Array.isArray(lane.committed_effects)
    ? lane.committed_effects
    : [];
  const blocked = Array.isArray(lane.blocked_effects)
    ? lane.blocked_effects
    : [];
  if (committed.length === 0 && blocked.length === 0) return null;
  return {
    committed_effects: committed,
    blocked_effects: blocked,
    executedTools: Array.isArray(lane.executedTools) ? lane.executedTools : [],
    toolExecution: stringValue(lane.toolExecution) || "none",
    visible_confirmation_hint: stringValue(lane.visible_confirmation_hint) ||
      null,
    confirmation_contract:
      "Confirm only committed_effects. If blocked_effects exist, ask for the missing precision without saying the effect was created. Keep the current visible flow style.",
  };
}

function visibleTaskWithDirectEffectLane(args: {
  visibleTask: FlowOpportunityDispatcherOutput["visible_task"];
  turnFrame: TurnFrame | null;
}): FlowOpportunityDispatcherOutput["visible_task"] {
  const directEffectResults = directEffectLaneContext(args.turnFrame);
  if (!directEffectResults) return args.visibleTask;
  return {
    ...args.visibleTask,
    conversation_context: {
      ...(args.visibleTask.conversation_context ?? {}),
      direct_effect_results: directEffectResults,
      tone_constraints: [
        ...stringArray(
          (args.visibleTask.conversation_context as any)?.tone_constraints,
          8,
        ),
        "Si tu confirmes un rappel ponctuel committé, adresse-toi au user au tutoiement.",
      ],
      do_not_say: [
        ...stringArray(
          (args.visibleTask.conversation_context as any)?.do_not_say,
          12,
        ),
        "je vous rappellerai",
        "souhaitez-vous",
        "votre rappel",
      ],
    } as FlowOpportunityDispatcherOutput["visible_task"][
      "conversation_context"
    ],
  };
}

type ConversationOpportunityTarget =
  | "product_help"
  | "emotional_repair"
  | "demotivation_repair";

type ConversationTargetFlowRunner = typeof runConversationTargetFlow;

function conversationSkillReply(
  output: ConversationSkillOutput | null,
): string {
  return String(output?.reply ?? output?.generated_user_message ?? "").trim();
}

function writeConversationSkillState(args: {
  tempMemory: any;
  skillId: ConversationOpportunityTarget;
  output: ConversationSkillOutput | null;
}): any {
  const next = { ...(args.tempMemory ?? {}) };
  const patch = args.output?.skill_id === args.skillId &&
      args.output.state_patch &&
      typeof args.output.state_patch === "object"
    ? args.output.state_patch as Record<string, unknown>
    : {};

  if (
    args.skillId === "product_help" &&
    (!patch.product_help_local_state ||
      ["closing", "exit_to_global", "safety"].includes(
        String((patch.product_help_local_state as any)?.status ?? ""),
      ))
  ) {
    delete next.__active_skill_state;
    delete next.active_skill_state;
    return next;
  }

  if (
    !args.output || args.output.status === "complete" ||
    args.output.status === "exit"
  ) {
    delete next.__active_skill_state;
    delete next.active_skill_state;
    return next;
  }

  const previous =
    next.__active_skill_state && typeof next.__active_skill_state === "object"
      ? next.__active_skill_state as Record<string, unknown>
      : {};
  const previousWorking =
    previous.working_state && typeof previous.working_state === "object"
      ? previous.working_state as Record<string, unknown>
      : {};
  const now = new Date().toISOString();
  next.__active_skill_state = {
    ...previous,
    version: Number(previous.version ?? 1),
    skill_id: args.skillId,
    status: args.output.status === "handoff" ? "handoff" : "active",
    turn_count: Number(previous.turn_count ?? 0) + 1,
    started_at: typeof previous.started_at === "string"
      ? previous.started_at
      : now,
    updated_at: now,
    working_state: {
      ...previousWorking,
      ...patch,
    },
  };
  delete next.active_skill_state;
  return next;
}

async function runConversationTargetFlow(args: {
  skillId: ConversationOpportunityTarget;
  userId: string;
  userMessage: string;
  history?: unknown;
  tempMemory: any;
  turnFrame: TurnFrame;
  targetContext: Record<string, unknown>;
  noteInformation?: NoteInformation | null;
}): Promise<OperationRuntimeResult | null> {
  const registry = await loadProductSurfaceRegistry();
  const input = {
    user_message: args.userMessage,
    context: {
      skill_id: args.skillId,
      user_id: args.userId,
      recent_messages: recentMessagesFromHistory(args.history),
      active_skill_working_state: null,
      turn_frame: args.turnFrame,
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: registry.surfaces,
      exclusions: [],
      flow_opportunity_context: args.targetContext,
      note_information: args.noteInformation ?? null,
    } as any,
    explicit_constraints: [],
  };
  const output = args.skillId === "product_help"
    ? await runProductHelpSkill(input)
    : args.skillId === "emotional_repair"
    ? await runEmotionalRepairSkill(input)
    : await runDemotivationRepairSkill(input);
  const content = conversationSkillReply(output);
  if (!content) return null;
  return {
    content,
    nextTempMemory: writeConversationSkillState({
      tempMemory: args.tempMemory,
      skillId: args.skillId,
      output,
    }),
    toolExecution: "none",
    executedTools: [],
    toolSkillRun: {
      selected_handler: args.skillId,
      skill_id: args.skillId,
      mode: "conversation_skill",
      status: output.status,
      response_intent: output.response_intent,
      diagnosis: output.diagnosis ?? {},
      requested_effects: output.effects?.requested ?? [],
      allowed_effects: output.effects?.allowed ?? [],
      committed_effects: output.effects?.committed ?? [],
      blocked_effects: output.effects?.blocked ?? [],
      note_information: args.noteInformation ?? null,
      toolExecution: "none",
      executedTools: [],
    },
  };
}

function syntheticLocalTurnFrame(args: {
  turnFrame: TurnFrame | null;
  userId: string;
  channel: "web" | "whatsapp";
  sourceMessageId?: string | null;
  safetyContextOutput: SafetySignalContext;
}): TurnFrame {
  return {
    turn_id: args.turnFrame?.turn_id ?? args.sourceMessageId ??
      crypto.randomUUID(),
    source_message_id: args.turnFrame?.source_message_id ??
      args.sourceMessageId ?? crypto.randomUUID(),
    user_id: args.userId,
    channel: args.channel,
    safety: {
      risk_band: args.safetyContextOutput.risk_band,
      reason_codes: args.safetyContextOutput.reason_codes ?? [],
      evidence: args.safetyContextOutput.evidence ?? [],
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
    flow_opportunity: null,
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
  if (routeDecision.response_owner === "normal_reply") return true;
  if (routeDecision.response_owner === "safety") return true;
  if (routeDecision.response_owner === "product_help") return true;
  if (routeDecision.response_owner === "tool_skill") return true;
  if (routeDecision.response_owner === "conversation_handler") return true;
  if (routeDecision.selected_handler === "status_recap") {
    return true;
  }
  return false;
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
  const kind = targetKind(raw.target_kind);
  if (!targetKindMatchesFlow(kind, flow)) return null;
  return {
    opportunity_id: stringValue(raw.opportunity_id) || `${flow}.opportunity`,
    target_kind: kind,
    target_flow: flow,
    target_action: stringValue(raw.target_action) || `run_${flow}`,
    confidence: confidence(raw.confidence),
    priority: Number(raw.priority ?? 0) || 0,
    reason: stringValue(raw.reason),
    evidence: stringArray(raw.evidence),
    seed_context: isRecord(raw.seed_context) ? raw.seed_context : {},
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
    target_kind: "skill",
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
        note_information_inbound: input.note_information_inbound ?? null,
        db_context_pack: input.db_context_pack ?? {},
        micro_memory_context: input.micro_memory_context ?? {
          items: [],
          exclusions: ["not_loaded_by_default_for_verification_opportunities"],
          budget: { max_items: 0, reason: "not useful by default" },
        },
        platform_context: input.platform_context ?? {},
        risk_context: input.safety,
        channel: input.channel,
        timezone: input.timezone,
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
    target_kind: state.target_kind,
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
  visibleTask: FlowOpportunityDispatcherOutput["visible_task"];
  visibleAgent?: FlowOpportunityVisibleAgent;
}): Promise<string> {
  const visibleAgent = args.visibleAgent ?? runFlowOpportunityVisibleAgent;
  return await visibleAgent({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    stage: args.visibleTask.kind,
    conversation_context: args.visibleTask.conversation_context,
  }) ?? "";
}

async function runInlineGetInfoProduct(args: {
  userId: string;
  userMessage: string;
  history?: unknown;
  turnFrame: TurnFrame | null;
  state: FlowOpportunityLocalState;
  subskillContext: Record<string, unknown> | null;
  noteInformation: NoteInformation | null;
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
      note_information: args.noteInformation,
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
      note_information: args.noteInformation,
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
        note_information: noteInformationForTrace(args.noteInformation),
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
  return async () =>
    normalizeStatusRecapLocalDispatcherOutput({
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
  noteInformation: NoteInformation | null;
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
      note_information: args.noteInformation,
      preserve_active_flow: true,
      ...(args.subskillContext ?? {}),
    },
  });
  return {
    content,
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
      note_information: args.noteInformation,
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
        note_information: noteInformationForTrace(args.noteInformation),
      }, {
        component: "flow_opportunity_verification",
        event: "get_info_db_returned_to_flow",
        confirmation_anchor_present: Boolean(nextState.confirmation_anchor),
      }],
    },
  };
}

async function handoffToTargetFlow(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  history?: unknown;
  tempMemory: any;
  state: FlowOpportunityLocalState;
  noteInformation: NoteInformation | null;
  turnFrame: TurnFrame | null;
  safetyContextOutput: SafetySignalContext;
  sourceMessageId?: string | null;
  requestId?: string | null;
  runPrepareAttackCardOperation?: typeof maybeRunPrepareAttackCardOperation;
  runPrepareDefenseCardOperation?: typeof maybeRunPrepareDefenseCardOperation;
  runCreateRecurringReminderOperation?:
    typeof maybeRunCreateRecurringReminderOperation;
  runConversationTargetFlow?: ConversationTargetFlowRunner;
}): Promise<OperationRuntimeResult> {
  const clearedTempMemory = writeFlowOpportunityState(args.tempMemory, null);
  const localTurnFrame = syntheticLocalTurnFrame({
    turnFrame: args.turnFrame,
    userId: args.userId,
    channel: args.channel,
    sourceMessageId: args.sourceMessageId ?? null,
    safetyContextOutput: args.safetyContextOutput,
  });
  localTurnFrame.note_information = args.noteInformation ?? undefined;
  const targetRoute: RouteDecision = {
    route_version: "v1",
    response_owner: args.state.target_flow === "status_recap"
      ? "conversation_handler"
      : "tool_skill",
    selected_handler: args.state.target_flow === "status_recap"
      ? "status_recap"
      : args.state.target_flow,
    direct_effects_to_run: [],
    blocked_paths: [],
    reason_code: "flow_opportunity_verification_handoff_to_local_flow",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
  };
  const handoffResult = args.state.target_flow === "status_recap"
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
        note_information: args.noteInformation ?? undefined,
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
      safetyContextOutput: args.safetyContextOutput,
      sourceMessageId: args.sourceMessageId ?? null,
      requestId: args.requestId ?? null,
      history: args.history,
    })
    : args.state.target_flow === "product_help" ||
        args.state.target_flow === "emotional_repair" ||
        args.state.target_flow === "demotivation_repair"
    ? await (args.runConversationTargetFlow ?? runConversationTargetFlow)({
      skillId: args.state.target_flow,
      userId: args.userId,
      userMessage: args.userMessage,
      history: args.history,
      tempMemory: clearedTempMemory,
      turnFrame: localTurnFrame,
      targetContext: args.state.target_context,
      noteInformation: args.noteInformation,
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
          note_information: args.noteInformation ?? undefined,
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
        safetyContextOutput: args.safetyContextOutput,
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
          note_information: args.noteInformation ?? undefined,
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
        safetyContextOutput: args.safetyContextOutput,
        sourceMessageId: args.sourceMessageId ?? null,
        requestId: args.requestId ?? null,
        history: args.history,
      })
    : args.state.target_flow === "create_recurring_reminder"
    ? await (args.runCreateRecurringReminderOperation ??
      maybeRunCreateRecurringReminderOperation)({
        supabase: args.supabase,
        userId: args.userId,
        userMessage: args.userMessage,
        channel: args.channel,
        userTimezone: args.userTimezone,
        tempMemory: clearedTempMemory,
        turnFrame: {
          ...localTurnFrame,
          note_information: args.noteInformation ?? undefined,
          tool_skill_intents: [{
            operation_type: "create_recurring_reminder",
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
        safetyContextOutput: args.safetyContextOutput,
        sourceMessageId: args.sourceMessageId ?? null,
        requestId: args.requestId ?? null,
        history: args.history,
      })
    : null;
  if (handoffResult) {
    return {
      ...handoffResult,
      nextTempMemory: writeFlowOpportunityState(
        handoffResult.nextTempMemory ?? clearedTempMemory,
        null,
      ),
      toolSkillRun: {
        ...handoffResult.toolSkillRun,
        handoff_source_flow: "flow_opportunity_verification",
        original_opportunity_id: args.state.opportunity_id,
        note_information: args.noteInformation,
      },
    };
  }
  return {
    content: "",
    nextTempMemory: clearedTempMemory,
    toolExecution: "blocked",
    executedTools: [],
    toolSkillRun: {
      selected_handler: "flow_opportunity_verification",
      skill_id: "flow_opportunity_verification",
      status: "blocked",
      reason_code: "flow_opportunity_verification_target_flow_handoff_failed",
      target_flow: args.state.target_flow,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [{
        type: "target_flow",
        reason_code: "target_flow_handoff_failed",
      }],
      toolExecution: "blocked",
      executedTools: [],
    },
  };
}

function dbContextPackForFlowOpportunity(args: {
  opportunity: FlowOpportunityPayload;
  previous: FlowOpportunityLocalState | null;
  supportedTargetFlows: string[];
}): Record<string, unknown> {
  return {
    source: "flow_opportunity_verification.runtime",
    freshness: "same_turn",
    confidence: args.opportunity.confidence,
    status: "dispatcher_selected",
    opportunity: args.opportunity,
    active_flow_state: args.previous
      ? {
        status: args.previous.status,
        opportunity_id: args.previous.opportunity_id,
        target_kind: args.previous.target_kind,
        target_flow: args.previous.target_flow,
        target_context: args.previous.target_context,
        confirmation_anchor: args.previous.confirmation_anchor,
        subskill_history: args.previous.subskill_history,
        turn_count: args.previous.turn_count,
        max_turns: args.previous.max_turns,
      }
      : null,
    supported_target_flows: args.supportedTargetFlows,
    available_inline_tools: ["product_help", "status_recap"],
    micro_memory_policy: {
      loaded: false,
      reason:
        "verification_opportunities does not load micro_memory_context by default",
      max_items: 0,
    },
  };
}

function initialActivationNote(args: {
  opportunity: FlowOpportunityPayload;
  userMessage: string;
}): NoteInformation {
  return createNoteInformation({
    source_flow_id: "global_dispatcher",
    handoff_reason: "bridge",
    target_dispatcher: "verification_opportunities",
    handoff_context_for_next_dispatcher: args.opportunity.reason ||
      "Verify an implicit opportunity before handoff to the target dispatcher.",
    user_words: [args.userMessage, ...args.opportunity.evidence].filter(
      Boolean,
    ),
    structured_context: {
      source_flow: "global_dispatcher",
      user_message_summary: args.userMessage,
      active_flow_summary:
        `Opportunity ${args.opportunity.opportunity_id}; target=${args.opportunity.target_flow}; confidence=${args.opportunity.confidence}.`,
      opportunity_id: args.opportunity.opportunity_id,
      target_kind: args.opportunity.target_kind,
      target_flow: args.opportunity.target_flow,
      target_action: args.opportunity.target_action,
      target_context: args.opportunity.seed_context,
      confidence: args.opportunity.confidence,
      priority: args.opportunity.priority,
      evidence: args.opportunity.evidence,
      recommended_next_focus:
        stringValue(args.opportunity.seed_context.user_need) ||
        stringValue(args.opportunity.seed_context.target_hint) ||
        args.opportunity.target_flow,
    },
    confidence: args.opportunity.confidence,
  });
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
  safetyContextOutput: SafetySignalContext;
  sourceMessageId?: string | null;
  requestId?: string | null;
  runLocalDispatcher?: FlowOpportunityLocalDispatcher;
  runVisibleAgent?: FlowOpportunityVisibleAgent;
  runPrepareAttackCardOperation?: typeof maybeRunPrepareAttackCardOperation;
  runPrepareDefenseCardOperation?: typeof maybeRunPrepareDefenseCardOperation;
  runCreateRecurringReminderOperation?:
    typeof maybeRunCreateRecurringReminderOperation;
  runConversationTargetFlow?: ConversationTargetFlowRunner;
}): Promise<OperationRuntimeResult | null> {
  if (String(args.safetyContextOutput.risk_band ?? "none") === "critical") {
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
    target_kind: selectedOpportunity.target_kind,
    target_flow: selectedOpportunity.target_flow,
  });

  const inboundNote = (args.turnFrame as any)?.note_information ??
    (previous ? null : initialActivationNote({
      opportunity: selectedOpportunity,
      userMessage: args.userMessage,
    }));
  const dbContextPack = dbContextPackForFlowOpportunity({
    opportunity: selectedOpportunity,
    previous,
    supportedTargetFlows: SUPPORTED_TARGET_FLOWS,
  });

  const decision = previous
    ? await (args.runLocalDispatcher ?? runFlowOpportunityLocalDispatcher)({
      user_id: args.userId,
      request_id: args.requestId ?? null,
      user_message: args.userMessage,
      recent_messages: recentMessagesFromHistory(args.history),
      active_state: previous,
      initial_payload: selectedOpportunity,
      note_information_inbound: inboundNote,
      db_context_pack: dbContextPack,
      micro_memory_context: {
        items: [],
        exclusions: [
          "micro_memory_context_not_loaded_by_default_for_verification_opportunities",
        ],
        budget: {
          max_items: 0,
          reason:
            "verification_opportunities should not load micro memory by default",
        },
      },
      platform_context: { channel: args.channel, timezone: args.userTimezone },
      turn_frame: args.turnFrame,
      route_decision: args.routeDecision,
      safety: args.safetyContextOutput,
      channel: args.channel,
      timezone: args.userTimezone,
    })
    : buildInitialOfferDispatcherOutput({
      opportunity_id: selectedOpportunity.opportunity_id,
      target_kind: selectedOpportunity.target_kind,
      target_flow: selectedOpportunity.target_flow,
      target_action: selectedOpportunity.target_action,
      target_context: targetContextFromSeed(selectedOpportunity.seed_context),
      reason: selectedOpportunity.reason,
      evidence: selectedOpportunity.evidence,
    });
  if (!decision) {
    return {
      content: "",
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

  console.info("[FlowOpportunityVerification] local_dispatcher_result", {
    flow_action: decision.flow_action,
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
      note_information: reduced.note_information,
      at: new Date().toISOString(),
      reducer_reason_code: reduced.reason_code,
    };
    console.info("[FlowOpportunityVerification] exit_to_global_dispatcher", {
      exit_memo: exitMemo,
      note_information: noteInformationForTrace(reduced.note_information),
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
        flow_action: "exit_to_global_dispatcher",
        exit_memo: exitMemo,
        note_information: reduced.note_information,
        state_mutation_audit: reduced.state_mutation_audit,
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        toolExecution: "none",
        executedTools: [],
      },
    };
  }
  if (reduced.safety_preempt) {
    const safetyMemo = {
      ...reduced.exit_memo,
      needed: true,
      reason: "safety",
      note_information: reduced.note_information,
      at: new Date().toISOString(),
      reducer_reason_code: reduced.reason_code,
    };
    console.info("[FlowOpportunityVerification] safety_preempt", {
      note_information: noteInformationForTrace(reduced.note_information),
    });
    return {
      content: "",
      nextTempMemory: {
        ...writeFlowOpportunityState(args.tempMemory, null),
        [FLOW_OPPORTUNITY_EXIT_MEMO_KEY]: safetyMemo,
      },
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "flow_opportunity_verification",
        skill_id: "flow_opportunity_verification",
        status: "exit",
        reason_code: "flow_opportunity_verification_safety_preempt",
        flow_action: "safety_preempt",
        exit_memo: safetyMemo,
        note_information: reduced.note_information,
        visible_task: reduced.visible_task,
        state_mutation_audit: reduced.state_mutation_audit,
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: reduced.blocked_effects,
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
    const inlineResult = await runInlineGetInfoProduct({
      userId: args.userId,
      userMessage: args.userMessage,
      history: args.history,
      turnFrame: args.turnFrame,
      state: reduced.local_state,
      subskillContext: reduced.subskill_context,
      noteInformation: reduced.note_information,
      tempMemory: args.tempMemory,
    });
    return {
      ...inlineResult,
      toolSkillRun: {
        ...inlineResult.toolSkillRun,
        state_mutation_audit: reduced.state_mutation_audit,
      },
    };
  }
  if (reduced.get_info_db && reduced.local_state) {
    console.info("[FlowOpportunityVerification] get_info_db_called", {
      opportunity_id: reduced.local_state.opportunity_id,
      target_flow: reduced.local_state.target_flow,
    });
    const inlineResult = await runInlineGetInfoDb({
      supabase: args.supabase,
      userId: args.userId,
      userMessage: args.userMessage,
      userTimezone: args.userTimezone,
      history: args.history,
      turnFrame: args.turnFrame,
      routeDecision: args.routeDecision,
      state: reduced.local_state,
      subskillContext: reduced.subskill_context,
      noteInformation: reduced.note_information,
      tempMemory: args.tempMemory,
      requestId: args.requestId ?? null,
    });
    return {
      ...inlineResult,
      toolSkillRun: {
        ...inlineResult.toolSkillRun,
        state_mutation_audit: reduced.state_mutation_audit,
      },
    };
  }
  if (reduced.handoff_to_local_flow && previous) {
    console.info("[FlowOpportunityVerification] handoff_to_local_flow", {
      opportunity_id: previous.opportunity_id,
      target_flow: previous.target_flow,
    });
    const handoffResult = await handoffToTargetFlow({
      supabase: args.supabase,
      userId: args.userId,
      userMessage: args.userMessage,
      channel: args.channel,
      userTimezone: args.userTimezone,
      history: args.history,
      tempMemory: args.tempMemory,
      state: previous,
      noteInformation: reduced.note_information,
      turnFrame: args.turnFrame,
      safetyContextOutput: args.safetyContextOutput,
      sourceMessageId: args.sourceMessageId ?? null,
      requestId: args.requestId ?? null,
      runPrepareAttackCardOperation: args.runPrepareAttackCardOperation,
      runPrepareDefenseCardOperation: args.runPrepareDefenseCardOperation,
      runCreateRecurringReminderOperation:
        args.runCreateRecurringReminderOperation,
      runConversationTargetFlow: args.runConversationTargetFlow,
    });
    return {
      ...handoffResult,
      toolSkillRun: {
        ...handoffResult.toolSkillRun,
        state_mutation_audit: reduced.state_mutation_audit,
      },
    };
  }

  const content = await renderVisible({
    userId: args.userId,
    requestId: args.requestId ?? null,
    visibleTask: visibleTaskWithDirectEffectLane({
      visibleTask: reduced.visible_task,
      turnFrame: args.turnFrame,
    }),
    visibleAgent: args.runVisibleAgent,
  });
  const nextTempMemory = writeFlowOpportunityState(
    args.tempMemory,
    reduced.local_state,
  );
  console.info("[FlowOpportunityVerification] visible_task.kind", {
    kind: reduced.visible_task.kind,
    confirmation_anchor_present: Boolean(
      reduced.local_state?.confirmation_anchor,
    ),
    note_information: noteInformationForTrace(reduced.note_information),
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
      flow_action: reduced.flow_action,
      visible_task: reduced.visible_task,
      note_information: reduced.note_information,
      note_information_inbound: inboundNote,
      db_context_pack_loaded: true,
      micro_memory_context_loaded: false,
      target_flow: reduced.target_flow,
      target_flow_input: reduced.target_flow_input,
      local_flow_state: reduced.local_state,
      state_mutation_audit: reduced.state_mutation_audit,
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
        db_context_pack_loaded: true,
        micro_memory_context_loaded: false,
        note_information_consumed: noteInformationForTrace(inboundNote),
      }, {
        component: "flow_opportunity_verification",
        event: "local_dispatcher_result",
        flow_action: reduced.flow_action,
        visible_task_kind: reduced.visible_task.kind,
        risk_score: decision.risk_score,
        note_information_created: noteInformationForTrace(
          reduced.note_information,
        ),
        state_mutation_audit: reduced.state_mutation_audit,
      }, {
        component: "flow_opportunity_verification",
        event: "write_blocked_no_mutation_owner",
        no_db_write: true,
      }],
    },
  };
}
