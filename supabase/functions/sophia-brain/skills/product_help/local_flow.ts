import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import {
  createNoteInformation,
  normalizeNoteInformation,
  type NoteInformation,
  type NoteInformationHandoffReason,
  noteInformationSummary,
  type NoteInformationTargetDispatcher,
} from "../../contracts/note_information.v1.ts";
import type {
  ProductHelpBridgeOperationType,
  ProductHelpConversationContext,
  ProductHelpIntent,
  ProductHelpLocalDispatcherOutput,
  ProductHelpLocalFlowAction,
  ProductHelpLocalFlowState,
  ProductHelpObjectType,
  ProductHelpTargetKind,
  ProductHelpVisibleTaskKind,
} from "./contract.ts";
import type { ProductHelpFeature } from "./knowledge.ts";
import {
  directEffectLocalDispatcherPromptLines,
  withDirectEffectLocalContext,
} from "../../router/direct_effect_local_context.ts";

export const PRODUCT_HELP_EXIT_MEMO_KEY = "__last_product_help_exit_memo";

export type ProductHelpLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  product_help_state: ProductHelpLocalFlowState | null;
  parent_flow_context: Record<string, unknown> | null;
  catalog_candidates: ProductHelpFeature[];
  product_surface_registry: unknown[];
  recent_committed_effects: unknown[];
  db_projection_sources?: unknown[] | null;
  db_context_pack?: Record<string, unknown> | null;
  micro_memory_context?: Record<string, unknown> | null;
  note_information_inbound?: NoteInformation | null;
  platform_context?: Record<string, unknown> | null;
  risk_context?: Record<string, unknown> | null;
  available_inline_tools?: string[];
  active_flow_context?: Record<string, unknown> | null;
  mode: "standalone" | "inline";
  turn_frame: unknown;
};

export type ProductHelpLocalDispatcher = (
  input: ProductHelpLocalDispatcherInput,
) => Promise<ProductHelpLocalDispatcherOutput | null>;

export type ProductHelpReducerResult = {
  status:
    | "answered"
    | "closing"
    | "closed"
    | "handoff"
    | "exit"
    | "safety"
    | "blocked";
  reason_code: string;
  local_state: ProductHelpLocalFlowState | null;
  visible_task: ProductHelpVisibleTaskKind;
  exit_to_global_dispatcher: boolean;
  handoff_to_local_dispatcher: boolean;
  return_to_parent_flow: boolean;
  answer_summary: string | null;
  conversation_context: ProductHelpConversationContext;
  note_information: NoteInformation | null;
  blocked_effects: Array<{ type: string; reason_code: string }>;
  evidence: string[];
};

const FLOW_ACTIONS = new Set([
  "answer_product_question",
  "clarify_product_question",
  "answer_destination",
  "compare_features",
  "explain_limit",
  "bridge_explanation_only",
  "repeat_answer",
  "apply_attempt",
  "inline_status_roundtrip",
  "inline_tool_return",
  "handoff_to_local_dispatcher",
  "exit_to_global_dispatcher",
  "close_product_help",
  "return_to_parent_flow",
  "safety_preempt",
]);

const PRODUCT_HELP_INTENTS = new Set([
  "explain_feature",
  "how_to",
  "where_is_it",
  "benefits",
  "limits",
  "can_i_do_x",
  "modify_or_cancel_where",
  "object_status_question",
  "tool_action_request",
  "compare_features",
  "repeat",
  "close",
  "off_topic",
  "safety",
  "unclear",
]);

const TARGET_KINDS = new Set([
  "feature_catalog",
  "user_object",
  "recent_effect",
  "pending_draft",
  "tool_flow",
  "unknown",
]);

const OBJECT_TYPES = new Set([
  "attack_card",
  "defense_card",
  "one_shot_reminder",
  "recurring_reminder",
  "potion",
  "plan_item",
  "preference",
  "initiative",
  "unknown",
]);

const BRIDGE_OPERATIONS = new Set([
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
  "one_shot_reminder",
  "adjust_plan_item",
  "update_coach_preferences",
]);

const VISIBLE_TASKS = new Set([
  "answer_product_question",
  "clarify_product_question",
  "answer_destination",
  "compare_features",
  "explain_limit",
  "bridge_explanation_only",
  "repeat_answer",
  "apply_attempt",
  "inline_tool_return",
  "stop_or_cancel",
  "exit_ack",
  "close_product_help",
  "safety",
  "safety_transition",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function stringArray(value: unknown, max = 12): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean).slice(0, max)
    : [];
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw;
  const text = String(raw ?? "").trim();
  let cleaned = text;
  if (cleaned.startsWith("```")) {
    const firstLineEnd = cleaned.indexOf("\n");
    cleaned = firstLineEnd >= 0 ? cleaned.slice(firstLineEnd + 1) : "";
  }
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("product_help_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!isRecord(parsed)) {
    throw new Error("product_help_local_dispatcher_not_object");
  }
  return parsed;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: Set<string>,
  fallback: T,
): T {
  const raw = stringValue(value);
  return allowed.has(raw) ? raw as T : fallback;
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function riskScore(value: unknown): number {
  const score = Number(value ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function defaultConversationContext(
  patch: Record<string, unknown> = {},
): ProductHelpConversationContext {
  return {
    state_summary: stringValue(patch.state_summary),
    user_words: stringArray(patch.user_words, 6),
    field_or_stage: stringValue(patch.field_or_stage) || null,
    known_values: recordValue(patch.known_values),
    missing_or_weak_values: stringArray(patch.missing_or_weak_values, 8),
    selected_candidate: recordValue(patch.selected_candidate),
    handoff_data: recordValue(patch.handoff_data),
    tone_constraints: stringArray(patch.tone_constraints, 8),
    do_not_say: stringArray(patch.do_not_say, 8),
    context_summary: stringValue(patch.context_summary) || null,
    evidence_used: stringArray(patch.evidence_used, 8),
  };
}

function normalizeConversationContext(
  value: unknown,
): ProductHelpConversationContext {
  const root = recordValue(value);
  return defaultConversationContext({
    state_summary: root.state_summary,
    user_words: root.user_words,
    field_or_stage: root.field_or_stage,
    known_values: root.known_values,
    missing_or_weak_values: root.missing_or_weak_values,
    selected_candidate: root.selected_candidate,
    handoff_data: root.handoff_data,
    tone_constraints: root.tone_constraints,
    do_not_say: root.do_not_say,
    context_summary: root.context_summary,
    evidence_used: root.evidence_used,
  });
}

function targetDispatcherForOutput(args: {
  flowAction: ProductHelpLocalFlowAction;
  bridgeOperation: ProductHelpBridgeOperationType | null;
  exitReason: string | null;
}): NoteInformationTargetDispatcher {
  if (args.flowAction === "safety_preempt" || args.exitReason === "safety") {
    return "safety_crisis";
  }
  if (
    args.flowAction === "inline_status_roundtrip" ||
    args.exitReason === "status_question"
  ) return "status_recap";
  if (args.flowAction === "handoff_to_local_dispatcher") {
    if (args.bridgeOperation === "one_shot_reminder") return "global";
    if (args.bridgeOperation) return args.bridgeOperation;
  }
  return "global";
}

function handoffReasonForOutput(args: {
  flowAction: ProductHelpLocalFlowAction;
  targetDispatcher: NoteInformationTargetDispatcher;
  exitReason: string | null;
  bridgeOperation: ProductHelpBridgeOperationType | null;
}): NoteInformationHandoffReason {
  if (args.targetDispatcher === "safety_crisis") return "safety";
  if (args.flowAction === "inline_status_roundtrip") return "inline_tool";
  if (args.flowAction === "handoff_to_local_dispatcher") return "bridge";
  if (args.flowAction === "exit_to_global_dispatcher") {
    return args.exitReason === "explicit_tool_request" ||
        args.exitReason === "unknown" ||
        Boolean(args.bridgeOperation)
      ? "explicit_user_request"
      : "topic_change";
  }
  return "explicit_user_request";
}

function rejectMutationFields(root: Record<string, unknown>) {
  for (
    const key of [
      "operation_suggestions",
      "requested_effects",
      "allowed_effects",
      "committed_effects",
    ]
  ) {
    const value = root[key];
    if (Array.isArray(value) && value.length > 0) {
      throw new Error(`product_help_local_dispatcher_forbidden_${key}`);
    }
  }
  if (isRecord(root.pending_confirmation)) {
    throw new Error("product_help_local_dispatcher_forbidden_confirmation");
  }
}

export function readProductHelpFlowState(
  activeSkillState: unknown,
): ProductHelpLocalFlowState | null {
  if (
    !isRecord(activeSkillState) || activeSkillState.skill_id !== "product_help"
  ) {
    return null;
  }
  const working = isRecord(activeSkillState.working_state)
    ? activeSkillState.working_state
    : activeSkillState;
  const local = isRecord(working.product_help_local_state)
    ? working.product_help_local_state
    : working;
  if (!isRecord(local) || local.skill_id !== "product_help") return null;
  if (local.mode !== "standalone") return null;
  const status = stringValue(local.status);
  if (
    ![
      "open",
      "answered",
      "closing",
      "stopped",
      "handoff",
      "exit_to_global",
      "safety",
    ].includes(status)
  ) {
    return null;
  }
  return local as ProductHelpLocalFlowState;
}

export function hasActiveProductHelpFlow(activeSkillState: unknown): boolean {
  const state = readProductHelpFlowState(activeSkillState);
  return Boolean(
    state && (state.status === "open" || state.status === "answered"),
  );
}

function createProductHelpFlowState(args: {
  previous?: ProductHelpLocalFlowState | null;
  status: ProductHelpLocalFlowState["status"];
  stage: ProductHelpLocalFlowState["product_help_state"]["stage"];
  lastIntent: string | null;
  lastTarget: Record<string, unknown>;
  lastAnswerSummary: string | null;
  lastCatalogFeatureIds: string[];
  lastLocations: string[];
  turnCountIncrement?: number;
}): ProductHelpLocalFlowState {
  const now = new Date().toISOString();
  const previousTurns = Number(
    args.previous?.product_help_state.turn_count ?? 0,
  );
  const increment = Number(args.turnCountIncrement ?? 1);
  return {
    skill_id: "product_help",
    status: args.status,
    mode: "standalone",
    product_help_state: {
      stage: args.stage,
      last_intent: args.lastIntent,
      last_target: args.lastTarget,
      last_answer_summary: args.lastAnswerSummary,
      last_catalog_feature_ids: args.lastCatalogFeatureIds.slice(0, 8),
      last_locations: args.lastLocations.slice(0, 8),
      parent_flow_context: null,
      turn_count: Math.max(0, previousTurns + increment),
      max_turns: Number(args.previous?.product_help_state.max_turns ?? 3) || 3,
      updated_at: now,
    },
  };
}

function noteInformationFromDispatcher(args: {
  raw: unknown;
  flowAction: ProductHelpLocalFlowAction;
  mode: "standalone" | "inline";
  riskScore: number;
  intentSummary: string;
  evidence: string[];
  exitRoot: Record<string, unknown>;
  exitContext: Record<string, unknown>;
  exitHint: Record<string, unknown>;
  bridgeOperation: ProductHelpBridgeOperationType | null;
}): NoteInformation | null {
  const reason = stringValue(args.exitRoot.reason) || null;
  const targetDispatcher = targetDispatcherForOutput({
    flowAction: args.flowAction,
    bridgeOperation: args.bridgeOperation,
    exitReason: reason,
  });
  const needsNote = args.flowAction === "exit_to_global_dispatcher" ||
    args.flowAction === "safety_preempt" ||
    args.flowAction === "inline_status_roundtrip" ||
    args.flowAction === "handoff_to_local_dispatcher" ||
    args.exitRoot.needed === true;
  if (!needsNote) return null;

  const structuredContext = {
    user_intent_summary: stringValue(args.exitRoot.user_intent_summary) ||
      args.intentSummary ||
      null,
    active_flow_summary: {
      skill_id: "product_help",
      mode: args.mode,
      stage: stringValue(args.exitContext.stage) || null,
      last_answer_summary: stringValue(args.exitContext.last_answer_summary) ||
        null,
      parent_skill_id: stringValue(args.exitContext.parent_skill_id) || null,
    },
    collected_state: {
      likely_intent: stringValue(args.exitHint.likely_intent) ||
        args.bridgeOperation ||
        "unknown",
      bridge_operation: args.bridgeOperation,
      constraints: stringArray(args.exitHint.constraints, 6),
    },
    unresolved_questions: [],
    confidence: "medium",
    evidence: args.evidence,
    recommended_next_focus: stringValue(args.exitHint.why) ||
      stringValue(args.exitRoot.user_intent_summary) ||
      args.intentSummary ||
      "Reclassify the current user message from product_help handoff context.",
  };
  const fallback = {
    source_flow_id: "product_help",
    handoff_reason: handoffReasonForOutput({
      flowAction: args.flowAction,
      targetDispatcher,
      exitReason: reason,
      bridgeOperation: args.bridgeOperation,
    }),
    target_dispatcher: targetDispatcher,
    handoff_context_for_next_dispatcher: JSON.stringify(structuredContext),
    user_words: [
      stringValue(args.exitRoot.user_intent_summary) || args.intentSummary,
      ...args.evidence,
    ].filter(Boolean).slice(0, 3),
    structured_context: structuredContext,
    confidence: "medium" as const,
  };
  if (isRecord(args.raw)) return normalizeNoteInformation(args.raw, fallback);
  if (
    args.flowAction === "exit_to_global_dispatcher" ||
    args.exitRoot.needed === true ||
    reason && reason !== "none"
  ) {
    return createNoteInformation(fallback);
  }
  return null;
}

export function normalizeProductHelpLocalDispatcherOutput(
  raw: unknown,
): ProductHelpLocalDispatcherOutput {
  const root = parseJsonObject(raw);
  rejectMutationFields(root);
  const flowAction = enumValue<ProductHelpLocalFlowAction>(
    root.flow_action,
    FLOW_ACTIONS,
    "clarify_product_question",
  );
  const intentRoot = isRecord(root.product_help_intent)
    ? root.product_help_intent
    : {};
  const targetRoot = isRecord(root.target) ? root.target : {};
  const groundingRoot = isRecord(root.grounding) ? root.grounding : {};
  const bridgeRoot = isRecord(root.bridge) ? root.bridge : {};
  const stateRoot = isRecord(root.state_updates) ? root.state_updates : {};
  const visibleRoot = isRecord(root.visible_task) ? root.visible_task : {};
  const returnRoot = isRecord(root.return_to_parent)
    ? root.return_to_parent
    : {};
  const exitRoot = isRecord(root.exit_memo) ? root.exit_memo : {};
  const exitContext = isRecord(exitRoot.local_flow_context)
    ? exitRoot.local_flow_context
    : {};
  const exitHint = isRecord(exitRoot.handoff_hint_for_global_dispatcher)
    ? exitRoot.handoff_hint_for_global_dispatcher
    : {};
  const mode = root.mode === "inline" ? "inline" : "standalone";
  const exitNeeded = flowAction === "exit_to_global_dispatcher" ||
    flowAction === "safety_preempt" ||
    flowAction === "inline_status_roundtrip" ||
    flowAction === "handoff_to_local_dispatcher" ||
    exitRoot.needed === true;
  const visibleKindFallback: ProductHelpVisibleTaskKind =
    flowAction === "safety_preempt"
      ? "safety_transition"
      : flowAction === "exit_to_global_dispatcher"
      ? "stop_or_cancel"
      : flowAction === "handoff_to_local_dispatcher"
      ? "exit_ack"
      : flowAction === "inline_status_roundtrip" ||
          flowAction === "inline_tool_return"
      ? "inline_tool_return"
      : flowAction === "return_to_parent_flow"
      ? "answer_product_question"
      : VISIBLE_TASKS.has(flowAction)
      ? flowAction as ProductHelpVisibleTaskKind
      : "answer_product_question";
  const intent = {
    kind: enumValue<ProductHelpIntent>(
      intentRoot.kind,
      PRODUCT_HELP_INTENTS,
      "unclear",
    ),
    summary: stringValue(intentRoot.summary),
  };
  const risk = riskScore(root.risk_score);
  const bridgeOperation =
    BRIDGE_OPERATIONS.has(stringValue(bridgeRoot.operation_type))
      ? stringValue(
        bridgeRoot.operation_type,
      ) as ProductHelpBridgeOperationType
      : null;
  const evidence = stringArray(root.evidence);
  const visibleTask = {
    kind: enumValue<ProductHelpVisibleTaskKind>(
      visibleRoot.kind,
      VISIBLE_TASKS,
      visibleKindFallback,
    ),
    instruction: stringValue(visibleRoot.instruction),
    conversation_context: normalizeConversationContext(
      visibleRoot.conversation_context,
    ),
  };
  const noteInformation = noteInformationFromDispatcher({
    raw: root.note_information,
    flowAction,
    mode,
    riskScore: risk,
    intentSummary: intent.summary,
    evidence,
    exitRoot,
    exitContext,
    exitHint,
    bridgeOperation,
  });
  return {
    flow_action: flowAction,
    confidence: confidence(root.confidence),
    risk_score: risk,
    mode,
    product_help_intent: intent,
    target: {
      kind: enumValue<ProductHelpTargetKind>(
        targetRoot.kind,
        TARGET_KINDS,
        "unknown",
      ),
      feature_id: stringValue(targetRoot.feature_id) || null,
      object_type: stringValue(targetRoot.object_type)
        ? enumValue<ProductHelpObjectType>(
          targetRoot.object_type,
          OBJECT_TYPES,
          "unknown",
        )
        : null,
      object_ref: stringValue(targetRoot.object_ref) || null,
      confidence: confidence(targetRoot.confidence),
    },
    grounding: {
      catalog_feature_ids: stringArray(groundingRoot.catalog_feature_ids, 10),
      surface_ids: stringArray(groundingRoot.surface_ids, 10),
      db_sources_required: groundingRoot.db_sources_required === true,
      db_sources_used: stringArray(groundingRoot.db_sources_used, 10),
      active_flow_used: groundingRoot.active_flow_used === true,
      missing_grounding_reason:
        stringValue(groundingRoot.missing_grounding_reason) || null,
    },
    bridge: {
      needed: bridgeRoot.needed === true ||
        flowAction === "bridge_explanation_only" ||
        flowAction === "apply_attempt",
      operation_type: bridgeOperation,
      kind: enumValue(
        bridgeRoot.kind,
        new Set(["explain_only", "offer_with_consent", "handoff_needed", ""]),
        flowAction === "apply_attempt" ? "handoff_needed" : "explain_only",
      ) || null,
      executable: false,
      why: stringValue(bridgeRoot.why) || null,
    },
    state_updates: {
      status: enumValue(
        stateRoot.status,
        new Set([
          "open",
          "answered",
          "closing",
          "stopped",
          "handoff",
          "exit_to_global",
          "safety",
        ]),
        flowAction === "exit_to_global_dispatcher"
          ? "stopped"
          : flowAction === "close_product_help"
          ? "closing"
          : "answered",
      ),
      stage: enumValue(
        stateRoot.stage,
        new Set([
          "answering",
          "clarifying",
          "bridge_explained",
          "status_inline",
          "handoff",
          "closing",
        ]),
        flowAction === "clarify_product_question"
          ? "clarifying"
          : flowAction === "inline_status_roundtrip" ||
              flowAction === "inline_tool_return"
          ? "status_inline"
          : flowAction === "bridge_explanation_only" ||
              flowAction === "apply_attempt"
          ? "bridge_explained"
          : flowAction === "close_product_help" ||
              flowAction === "exit_to_global_dispatcher"
          ? "closing"
          : "answering",
      ),
      turn_count_increment: Math.max(
        0,
        Math.min(1, Number(stateRoot.turn_count_increment ?? 1) || 1),
      ),
      close_after_visible: stateRoot.close_after_visible === true ||
        flowAction === "close_product_help" ||
        flowAction === "exit_to_global_dispatcher",
      preserve_parent_flow: stateRoot.preserve_parent_flow !== false,
    },
    visible_task: visibleTask,
    return_to_parent: {
      needed: mode === "inline" || returnRoot.needed === true ||
        flowAction === "return_to_parent_flow" ||
        flowAction === "inline_tool_return",
      parent_skill_id: stringValue(returnRoot.parent_skill_id) || null,
      return_summary: stringValue(returnRoot.return_summary) || null,
      preserve_parent_state: true,
    },
    exit_memo: {
      needed: exitNeeded,
      reason: enumValue(
        exitRoot.reason,
        new Set([
          "topic_change",
          "explicit_tool_request",
          "status_question",
          "normal_coaching",
          "safety",
          "unknown",
          "none",
        ]),
        exitNeeded ? "unknown" : "none",
      ),
      user_intent_summary: stringValue(exitRoot.user_intent_summary) || null,
      local_flow_context: {
        skill_id: "product_help",
        mode,
        stage: stringValue(exitContext.stage) || null,
        last_answer_summary: stringValue(exitContext.last_answer_summary) ||
          null,
        parent_skill_id: stringValue(exitContext.parent_skill_id) || null,
        committed_effects: Array.isArray(exitContext.committed_effects)
          ? exitContext.committed_effects.slice(0, 5)
          : [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: enumValue(
          exitHint.likely_intent,
          new Set([
            "prepare_attack_card",
            "prepare_defense_card",
            "select_state_potion",
            "update_coach_preferences",
            "status_recap",
            "adjust_plan_item",
            "one_shot_reminder",
            "create_recurring_reminder",
            "normal_coaching",
            "unknown",
          ]),
          flowAction === "handoff_to_local_dispatcher" && bridgeOperation
            ? (bridgeOperation === "one_shot_reminder"
              ? "one_shot_reminder"
              : bridgeOperation)
            : "unknown",
        ),
        why: stringValue(exitHint.why) || null,
        constraints: stringArray(exitHint.constraints, 6),
      },
    },
    note_information: noteInformation,
    evidence,
  };
}

function answerSummary(output: ProductHelpLocalDispatcherOutput): string {
  return output.product_help_intent.summary ||
    `${output.flow_action}:${output.visible_task.kind}`;
}

function compactEffectSource(
  effect: unknown,
  index: number,
): Record<string, unknown> {
  const root = recordValue(effect);
  return {
    id: stringValue(root.id) || stringValue(root.effect_id) ||
      `effect_${index}`,
    type: stringValue(root.type) || stringValue(root.effect_type) || "effect",
    label: stringValue(root.label) || stringValue(root.summary) ||
      stringValue(root.operation_type) || null,
    target_status: stringValue(root.target_status) || null,
  };
}

function conversationContext(args: {
  userMessage?: string | null;
  output: ProductHelpLocalDispatcherOutput;
  catalogCandidates: ProductHelpFeature[];
  previous: ProductHelpLocalFlowState | null;
  parentFlowContext: Record<string, unknown> | null;
  recentCommittedEffects: unknown[];
  productSurfaces: unknown[];
}): ProductHelpConversationContext {
  const base = args.output.visible_task.conversation_context;
  const selectedIds = new Set(args.output.grounding.catalog_feature_ids);
  const features = args.catalogCandidates
    .filter((feature) => selectedIds.size === 0 || selectedIds.has(feature.id))
    .map((feature) => ({
      id: feature.id,
      label: feature.label,
      explain: feature.explain,
      how_to: feature.how_to,
      benefits: feature.benefits,
      locations: feature.locations,
      limits: feature.limits,
      operation_bridge: feature.operation_bridge ?? null,
    }));
  const userWords = base.user_words.length > 0
    ? base.user_words
    : stringValue(args.userMessage)
    ? [stringValue(args.userMessage).slice(0, 500)]
    : [];
  return defaultConversationContext({
    ...base,
    state_summary: base.state_summary || answerSummary(args.output),
    user_words: userWords,
    field_or_stage: base.field_or_stage ||
      args.output.state_updates.stage ||
      args.output.visible_task.kind,
    known_values: {
      ...base.known_values,
      product_help_intent: args.output.product_help_intent,
      mode: args.output.mode,
      target: args.output.target,
      grounding: args.output.grounding,
      bridge: args.output.bridge,
      catalog_answer_material: features,
      catalog_candidates: args.catalogCandidates.map((feature) => ({
        id: feature.id,
        label: feature.label,
        locations: feature.locations,
        limits: feature.limits,
      })),
      product_surfaces: args.productSurfaces,
      grounded_sources: args.recentCommittedEffects
        .slice(0, 5)
        .map(compactEffectSource),
      active_flow_used: args.output.grounding.active_flow_used,
      previous_answer_summary:
        args.previous?.product_help_state.last_answer_summary ?? null,
      parent_flow_summary: args.parentFlowContext
        ? {
          skill_id: args.parentFlowContext.skill_id ?? null,
          status: args.parentFlowContext.status ?? null,
          turn_count: args.parentFlowContext.turn_count ?? null,
        }
        : null,
    },
    selected_candidate: {
      ...base.selected_candidate,
      target: args.output.target,
      selected_catalog_feature_ids: args.output.grounding.catalog_feature_ids,
    },
    handoff_data: {
      ...base.handoff_data,
      bridge: args.output.bridge,
      mode: args.output.mode,
      note_information_summary: args.output.note_information
        ? {
          target_dispatcher: args.output.note_information.target_dispatcher,
          handoff_reason: args.output.note_information.handoff_reason,
          source_flow_summary: noteInformationSummary(
            args.output.note_information,
          ),
        }
        : null,
      return_to_parent: args.output.return_to_parent,
    },
    tone_constraints: [
      ...new Set([
        ...base.tone_constraints,
        "short",
        "natural",
        "non_mutating",
      ]),
    ],
    do_not_say: [
      ...new Set([
        ...base.do_not_say,
        "Ne dis pas que Sophia a cree, modifie, annule, active, programme ou enregistre quelque chose.",
        "Ne mentionne pas JSON, dispatcher, reducer, prompt, DB, table ou outil interne.",
      ]),
    ],
    context_summary: base.context_summary ||
      (args.parentFlowContext
        ? "Question produit traitee en inline; le flow parent doit reprendre."
        : "Question produit traitee par product_help local."),
    evidence_used: base.evidence_used.length > 0
      ? base.evidence_used
      : args.output.evidence,
  });
}

export function reduceProductHelpLocalDispatcherOutput(args: {
  previous: ProductHelpLocalFlowState | null;
  output: ProductHelpLocalDispatcherOutput;
  catalogCandidates: ProductHelpFeature[];
  parentFlowContext: Record<string, unknown> | null;
  productSurfaces: unknown[];
  recentCommittedEffects: unknown[];
  userMessage?: string | null;
}): ProductHelpReducerResult {
  const output = args.output;
  const summary = answerSummary(output);
  if (output.mode === "inline" && !output.state_updates.preserve_parent_flow) {
    return {
      status: "blocked",
      reason_code: "product_help_inline_parent_preservation_required",
      local_state: null,
      visible_task: "safety_transition",
      exit_to_global_dispatcher: false,
      handoff_to_local_dispatcher: false,
      return_to_parent_flow: true,
      answer_summary: null,
      conversation_context: defaultConversationContext({
        state_summary: "Inline product_help tried to drop the parent flow.",
        user_words: args.userMessage ? [args.userMessage] : [],
        do_not_say: ["Ne mentionne pas le blocage technique."],
      }),
      note_information: null,
      blocked_effects: [{
        type: "product_help",
        reason_code: "parent_preservation_required",
      }],
      evidence: output.evidence,
    };
  }
  if (output.flow_action === "exit_to_global_dispatcher") {
    if (!output.note_information) {
      return {
        status: "blocked",
        reason_code: "product_help_note_information_required",
        local_state: args.previous,
        visible_task: "stop_or_cancel",
        exit_to_global_dispatcher: false,
        handoff_to_local_dispatcher: false,
        return_to_parent_flow: output.mode === "inline",
        answer_summary: null,
        conversation_context: defaultConversationContext({
          state_summary:
            "Product help attempted to exit without note_information.",
          user_words: args.userMessage ? [args.userMessage] : [],
          do_not_say: ["Ne mentionne pas le dispatcher global."],
        }),
        note_information: null,
        blocked_effects: [{
          type: "product_help",
          reason_code: "note_information_required",
        }],
        evidence: output.evidence,
      };
    }
    return {
      status: "exit",
      reason_code: "product_help_exit_to_global_dispatcher",
      local_state: output.mode === "standalone"
        ? createProductHelpFlowState({
          previous: args.previous,
          status: "exit_to_global",
          stage: args.previous?.product_help_state.stage ?? "closing",
          lastIntent: args.previous?.product_help_state.last_intent ?? null,
          lastTarget: args.previous?.product_help_state.last_target ?? {},
          lastAnswerSummary:
            args.previous?.product_help_state.last_answer_summary ?? null,
          lastCatalogFeatureIds:
            args.previous?.product_help_state.last_catalog_feature_ids ?? [],
          lastLocations: args.previous?.product_help_state.last_locations ?? [],
          turnCountIncrement: output.state_updates.turn_count_increment,
        })
        : null,
      visible_task: "exit_ack",
      exit_to_global_dispatcher: true,
      handoff_to_local_dispatcher: false,
      return_to_parent_flow: output.mode === "inline",
      answer_summary: null,
      conversation_context: defaultConversationContext({
        state_summary: noteInformationSummary(output.note_information) ??
          output.note_information.handoff_context_for_next_dispatcher,
        user_words: args.userMessage ? [args.userMessage] : [],
        handoff_data: { note_information: output.note_information },
        context_summary: "Ownership exits product_help for global dispatcher.",
        evidence_used: output.evidence,
      }),
      note_information: output.note_information,
      blocked_effects: [],
      evidence: output.evidence,
    };
  }
  if (output.flow_action === "handoff_to_local_dispatcher") {
    if (!output.note_information) {
      return {
        status: "blocked",
        reason_code: "product_help_handoff_note_information_required",
        local_state: args.previous,
        visible_task: "stop_or_cancel",
        exit_to_global_dispatcher: false,
        handoff_to_local_dispatcher: false,
        return_to_parent_flow: output.mode === "inline",
        answer_summary: null,
        conversation_context: defaultConversationContext({
          state_summary:
            "Product help attempted a local handoff without note_information.",
          user_words: args.userMessage ? [args.userMessage] : [],
          do_not_say: ["Ne mentionne pas le handoff technique."],
        }),
        note_information: null,
        blocked_effects: [{
          type: "product_help",
          reason_code: "note_information_required",
        }],
        evidence: output.evidence,
      };
    }
    if (
      output.note_information.target_dispatcher === "global" ||
      output.note_information.target_dispatcher === "product_help"
    ) {
      return {
        status: "blocked",
        reason_code: "product_help_handoff_target_invalid",
        local_state: args.previous,
        visible_task: "stop_or_cancel",
        exit_to_global_dispatcher: false,
        handoff_to_local_dispatcher: false,
        return_to_parent_flow: output.mode === "inline",
        answer_summary: null,
        conversation_context: defaultConversationContext({
          state_summary:
            "Product help attempted a local handoff to a non-local target.",
          user_words: args.userMessage ? [args.userMessage] : [],
          do_not_say: ["Ne mentionne pas le handoff technique."],
        }),
        note_information: output.note_information,
        blocked_effects: [{
          type: "product_help",
          reason_code: "handoff_target_invalid",
        }],
        evidence: output.evidence,
      };
    }
    return {
      status: "handoff",
      reason_code: "product_help_handoff_to_local_dispatcher",
      local_state: output.mode === "standalone"
        ? createProductHelpFlowState({
          previous: args.previous,
          status: "handoff",
          stage: "handoff",
          lastIntent: output.product_help_intent.kind,
          lastTarget: output.target as unknown as Record<string, unknown>,
          lastAnswerSummary: summary,
          lastCatalogFeatureIds: output.grounding.catalog_feature_ids,
          lastLocations: args.catalogCandidates.flatMap((feature) =>
            feature.locations.map((location) => location.surface)
          ),
          turnCountIncrement: output.state_updates.turn_count_increment,
        })
        : null,
      visible_task: "exit_ack",
      exit_to_global_dispatcher: false,
      handoff_to_local_dispatcher: true,
      return_to_parent_flow: output.mode === "inline",
      answer_summary: summary,
      conversation_context: defaultConversationContext({
        state_summary: noteInformationSummary(output.note_information) ??
          summary,
        user_words: args.userMessage ? [args.userMessage] : [],
        handoff_data: { note_information: output.note_information },
        context_summary:
          "Ownership changes from product_help to the target local dispatcher.",
        evidence_used: output.evidence,
      }),
      note_information: output.note_information,
      blocked_effects: [],
      evidence: output.evidence,
    };
  }
  if (output.flow_action === "safety_preempt" || output.risk_score >= 7) {
    const safetyNote = output.note_information ?? createNoteInformation({
      source_flow_id: "product_help",
      handoff_reason: "safety",
      target_dispatcher: "safety_crisis",
      handoff_context_for_next_dispatcher: JSON.stringify({
        user_message: args.userMessage ?? null,
        product_help_summary: summary,
        evidence: output.evidence,
      }),
      user_words: args.userMessage ? [args.userMessage] : output.evidence,
      structured_context: {
        user_message: args.userMessage ?? null,
        product_help_summary: summary,
        evidence: output.evidence,
        unresolved_questions: [],
        recommended_next_focus: "safety_crisis",
      },
      confidence: output.confidence,
    });
    return {
      status: "safety",
      reason_code: "product_help_safety_preempt",
      local_state: output.mode === "standalone"
        ? createProductHelpFlowState({
          previous: args.previous,
          status: "safety",
          stage: "closing",
          lastIntent: "safety",
          lastTarget: {},
          lastAnswerSummary:
            args.previous?.product_help_state.last_answer_summary ?? null,
          lastCatalogFeatureIds: [],
          lastLocations: [],
          turnCountIncrement: output.state_updates.turn_count_increment,
        })
        : null,
      visible_task: "safety_transition",
      exit_to_global_dispatcher: false,
      handoff_to_local_dispatcher: true,
      return_to_parent_flow: output.mode === "inline",
      answer_summary: null,
      conversation_context: defaultConversationContext({
        state_summary:
          "Safety signal detected during product_help; stop product explanation.",
        user_words: args.userMessage ? [args.userMessage] : [],
        handoff_data: { note_information: safetyNote },
        context_summary:
          "Transition minimale; safety_crisis doit reprendre avec la note.",
        evidence_used: output.evidence,
      }),
      note_information: safetyNote,
      blocked_effects: [{
        type: "product_help",
        reason_code: "safety_preempt",
      }],
      evidence: output.evidence,
    };
  }
  if (output.flow_action === "inline_status_roundtrip") {
    if (!output.note_information) {
      return {
        status: "blocked",
        reason_code: "product_help_handoff_note_information_required",
        local_state: args.previous,
        visible_task: "stop_or_cancel",
        exit_to_global_dispatcher: false,
        handoff_to_local_dispatcher: false,
        return_to_parent_flow: output.mode === "inline",
        answer_summary: null,
        conversation_context: defaultConversationContext({
          state_summary:
            "Product help attempted a local handoff without note_information.",
          user_words: args.userMessage ? [args.userMessage] : [],
          do_not_say: ["Ne mentionne pas le handoff technique."],
        }),
        note_information: null,
        blocked_effects: [{
          type: "product_help",
          reason_code: "note_information_required",
        }],
        evidence: output.evidence,
      };
    }
    return {
      status: "handoff",
      reason_code: "product_help_inline_status_roundtrip",
      local_state: output.mode === "standalone"
        ? createProductHelpFlowState({
          previous: args.previous,
          status: "handoff",
          stage: "status_inline",
          lastIntent: output.product_help_intent.kind,
          lastTarget: output.target as unknown as Record<string, unknown>,
          lastAnswerSummary: summary,
          lastCatalogFeatureIds: output.grounding.catalog_feature_ids,
          lastLocations: args.catalogCandidates.flatMap((feature) =>
            feature.locations.map((location) => location.surface)
          ),
          turnCountIncrement: output.state_updates.turn_count_increment,
        })
        : null,
      visible_task: "exit_ack",
      exit_to_global_dispatcher: false,
      handoff_to_local_dispatcher: true,
      return_to_parent_flow: output.mode === "inline",
      answer_summary: summary,
      conversation_context: defaultConversationContext({
        state_summary: summary,
        user_words: args.userMessage ? [args.userMessage] : [],
        handoff_data: { note_information: output.note_information },
        context_summary:
          "Ownership changes from product_help to another local dispatcher.",
        evidence_used: output.evidence,
      }),
      note_information: output.note_information,
      blocked_effects: [],
      evidence: output.evidence,
    };
  }
  const objectStatusWithoutGrounding =
    output.product_help_intent.kind === "object_status_question" &&
    output.grounding.db_sources_required &&
    output.grounding.db_sources_used.length === 0 &&
    !output.grounding.active_flow_used;
  const visibleTask = objectStatusWithoutGrounding
    ? "explain_limit"
    : output.visible_task.kind;
  const previousTurns = Number(
    args.previous?.product_help_state.turn_count ?? 0,
  );
  const nextTurns = previousTurns + output.state_updates.turn_count_increment;
  const maxTurns = Number(args.previous?.product_help_state.max_turns ?? 3) ||
    3;
  const shouldClose = output.mode === "inline" ||
    output.state_updates.close_after_visible ||
    output.flow_action === "close_product_help" ||
    nextTurns >= maxTurns;
  const localState = output.mode === "standalone" && !shouldClose
    ? createProductHelpFlowState({
      previous: args.previous,
      status: output.state_updates.status === "open" ? "open" : "answered",
      stage: output.state_updates.stage,
      lastIntent: output.product_help_intent.kind,
      lastTarget: output.target as unknown as Record<string, unknown>,
      lastAnswerSummary: summary,
      lastCatalogFeatureIds: output.grounding.catalog_feature_ids,
      lastLocations: args.catalogCandidates.flatMap((feature) =>
        feature.locations.map((location) => location.surface)
      ),
      turnCountIncrement: output.state_updates.turn_count_increment,
    })
    : output.mode === "standalone" && shouldClose
    ? createProductHelpFlowState({
      previous: args.previous,
      status: "closing",
      stage: "closing",
      lastIntent: output.product_help_intent.kind,
      lastTarget: output.target as unknown as Record<string, unknown>,
      lastAnswerSummary: summary,
      lastCatalogFeatureIds: output.grounding.catalog_feature_ids,
      lastLocations: args.catalogCandidates.flatMap((feature) =>
        feature.locations.map((location) => location.surface)
      ),
      turnCountIncrement: output.state_updates.turn_count_increment,
    })
    : null;
  return {
    status: shouldClose ? "closing" : "answered",
    reason_code: output.flow_action === "apply_attempt"
      ? "product_help_apply_attempt_no_mutation"
      : `product_help_local_${output.flow_action}`,
    local_state: localState,
    visible_task: visibleTask,
    exit_to_global_dispatcher: false,
    handoff_to_local_dispatcher: false,
    return_to_parent_flow: output.mode === "inline" ||
      output.return_to_parent.needed,
    answer_summary: summary,
    conversation_context: conversationContext({
      userMessage: args.userMessage,
      output,
      catalogCandidates: args.catalogCandidates,
      previous: args.previous,
      parentFlowContext: args.parentFlowContext,
      recentCommittedEffects: args.recentCommittedEffects,
      productSurfaces: args.productSurfaces,
    }),
    note_information: output.note_information,
    blocked_effects: [],
    evidence: output.evidence,
  };
}

function dispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local structure du skill product_help.",
    "Tu ne reponds jamais directement au user. Tu retournes uniquement un JSON valide.",
    "product_help explique le produit Sophia: utilite, fonctionnement, navigation, limites, comparaison et destinations dans l'app.",
    "product_help ne cree, modifie, annule, programme, active, enregistre ou applique jamais rien.",
    "Modes: standalone si product_help est le flow actif; inline si un flow parent t'appelle puis reprend.",
    "Le dispatcher global normal ne fonctionne pas pendant product_help actif. Tu peux le rendre disponible seulement avec flow_action=exit_to_global_dispatcher et note_information.",
    "Contraintes strictes: aucune operation_suggestions, requested_effects, allowed_effects ou committed_effects; aucun pending confirmation; aucun token de confirmation; aucun flow lance.",
    "En inline, preserve_parent_flow doit rester true et return_to_parent.needed true.",
    "Pour une demande claire de faire/creer/modifier/activer qui correspond a un tool flow Sophia, product_help doit faire un pont structure avec flow_action=handoff_to_local_dispatcher, bridge.kind=handoff_needed, bridge.operation_type cible, note_information.target_dispatcher cible et aucun effet durable. Product_help ne repond pas au sujet cible et ne cree rien.",
    "Anti-faux-positif handoff: une question produit de type ou/comment/c'est quoi/a quoi ca sert/quelle difference/ou je retrouve/est-ce que ca existe reste product_help, meme si elle mentionne carte d'attaque, carte de defense, potion, rappel ou Plan. Reponds avec answer_product_question, how_to, answer_destination, compare_features ou explain_limit. Ne choisis handoff_to_local_dispatcher que si le user demande explicitement de lancer/preparer/creer/modifier/activer maintenant le flow cible.",
    "Priorite de decision: affiner une action existante du Plan prime sur Carte d'attaque. Si le user demande comment rendre une action du Plan plus concrete, moins floue, ou adaptee, cible plan.adjustment / adjust_plan_item. \"Sans toucher au reste du Plan\" veut dire ajustement cible, explication sans mutation immediate, ou modification locale seulement; ca ne veut pas dire Carte d'attaque. Utilise Carte d'attaque seulement si le user demande explicitement une carte, un premier geste pour demarrer, ou une preparation d'execution.",
    "Si note_information_inbound ou catalog_candidates recommandent Carte d'attaque mais que current_user_message parle d'affiner une action existante du Plan, le message courant gagne: corrige vers plan.adjustment / adjust_plan_item dans target et conversation_context.",
    "Ponts locaux autorises depuis product_help: prepare_attack_card, prepare_defense_card, select_state_potion, create_recurring_reminder, adjust_plan_item, update_coach_preferences. one_shot_reminder n'est pas un handoff local product_help: pour un rappel ponctuel, utilise exit_to_global_dispatcher avec note_information.target_dispatcher=global.",
    "Pour une question de statut DB, utilise inline_status_roundtrip vers status_recap avec note_information; ne rends pas toi-meme un status DB.",
    "Pour un abandon sans nouveau sujet clair, utilise exit_to_global_dispatcher avec note_information; ne pose pas de question finale dans product_help.",
    "Pour un changement de sujet clair, utilise exit_to_global_dispatcher avec note_information.target_dispatcher=global.",
    "Pour safety, utilise safety_preempt avec note_information.target_dispatcher=safety_crisis; ne relance pas global.",
    "Si tu changes de dispatcher, note_information est obligatoire et garde strictement la structure source_flow_id, target_dispatcher, handoff_reason, handoff_context_for_next_dispatcher, user_words, structured_context, confidence si utile. user_words contient 1 a 3 fragments du message courant. structured_context est succinct, non vide, sans DB brute, memoire brute, source_flow_presentation, source_flow_state_summary, target_local_dispatcher_hint, risk_score ni no_chat_mutation.",
    "Si une question porte sur l'etat d'un objet reel, n'affirme rien sans source recent_committed_effects, active_flow_context ou db_projection_sources.",
    ...directEffectLocalDispatcherPromptLines(),
    "Field Completion Rules:",
    "- flow_action: decision principale de ce tour product_help. Choisis-la depuis le message courant et l'etat local, pas seulement depuis le tour precedent. Utilise answer_product_question/how_to/answer_destination/compare_features/explain_limit pour continuer localement, y compris quand le user demande ou retrouver une carte d'attaque, comment ca marche, ce que c'est ou la difference entre deux ressources; repeat_answer si le user demande de redire; apply_attempt seulement si tu restes en aide produit non-mutante; inline_status_roundtrip si une question de statut DB doit etre lue par status_recap; handoff_to_local_dispatcher si le user demande clairement un tool flow autorise a lancer maintenant; exit_to_global_dispatcher si le user veut arreter product_help ou change clairement vers un sujet non-tool; close_product_help seulement pour une fermeture locale prevue par le mode inline/parent; safety_preempt si le signal safety est prioritaire. N'invente aucune action absente du schema.",
    "- confidence: high si l'intention produit ou la transition est claire; medium si la cible est probable mais incomplete; low si une clarification ou une prudence est necessaire. Ne mets pas high quand target.confidence ou grounding sont faibles.",
    "- risk_score: score local 0-10 utile a product_help. 0-2 pour aide produit ordinaire; 3-6 pour malaise ou risque ambigu non urgent; 7+ seulement pour safety reelle et alors flow_action doit etre safety_preempt. Ne fabrique pas de safety depuis une simple frustration produit.",
    "- mode: reprends standalone ou inline depuis l'input. En inline, preserve_parent_flow doit rester true et return_to_parent.needed doit etre true sauf safety/handoff explicite.",
    "- product_help_intent.kind: classe le besoin produit reel: explain_feature, how_to, where_is_it, benefits, limits, can_i_do_x, modify_or_cancel_where, object_status_question, tool_action_request, compare_features, repeat, close, off_topic, safety ou unclear. Utilise tool_action_request seulement pour une demande operationnelle explicite de lancer/preparer/creer/modifier/activer; n'utilise jamais tool_action_request pour une demande d'explication, de destination, de difference ou de fonctionnement. summary resume l'intention en une phrase; ne l'utilise pas comme reponse visible.",
    "- target: decrit la cible produit ou objet. kind=feature_catalog pour une surface ou concept Sophia; user_object pour une carte/rappel/potion reel utilisateur; recent_effect si la question porte sur un effet du tour recent; pending_draft si elle porte sur un brouillon; tool_flow si elle vise un flow operationnel; unknown si insuffisant. Pour une question sur transformer/rendre concrete/ajuster une action existante du Plan, feature_id=plan.adjustment et object_type=plan_item; pas resources.attack_card sauf demande explicite de carte ou de preparation de demarrage. feature_id reste null si non determine. object_type reste null si non applicable. object_ref reste null sauf reference explicite et sourcee. target.confidence ne doit pas depasser l'evidence.",
    "- grounding: liste uniquement les sources reellement utilisees. catalog_feature_ids pour les fiches produit retenues; surface_ids pour surfaces produit; db_sources_required=true si le user demande un etat reel; db_sources_used seulement si une source DB/effect/active_flow est disponible; active_flow_used=true seulement si tu t'appuies sur le flow parent/actif; missing_grounding_reason explique pourquoi tu ne peux pas affirmer. Ne mets pas de pseudo-preuve.",
    "- bridge: decrit une frontiere produit, jamais une execution. needed=true pour apply_attempt, bridge_explanation_only ou handoff_to_local_dispatcher. operation_type seulement parmi prepare_attack_card, prepare_defense_card, select_state_potion, create_recurring_reminder, one_shot_reminder, adjust_plan_item, update_coach_preferences. kind=explain_only pour expliquer une destination ou une possibilite sans transferer le tour, offer_with_consent si tu proposes sans lancer, handoff_needed seulement pour un pont local explicite demande maintenant. Pour une question ou/comment/c'est quoi/a quoi ca sert, bridge.needed reste false ou kind=explain_only, jamais handoff_needed. executable est toujours false.",
    "- state_updates: etat local minimal. status=open/answered pour continuer, closing pour finir localement, stopped pour exit_to_global_dispatcher, exit_to_global pour exit, safety pour safety. stage doit suivre la tache: answering, clarifying, bridge_explained, status_inline ou closing. turn_count_increment vaut 1 pour un tour traite, 0 seulement si aucune progression locale. close_after_visible=true quand le flow doit se fermer apres le message visible. Ne cree pas de profil global ni d'hypothese durable.",
    "- visible_task.kind: stage visible exact. Utilise answer_product_question, clarify_product_question, answer_destination, compare_features, explain_limit, bridge_explanation_only, repeat_answer, apply_attempt, inline_tool_return, stop_or_cancel, exit_ack, close_product_help ou safety_transition. Ne choisis pas un stage generique si un stage precis existe. En stop/cancel, utilise stop_or_cancel.",
    "- visible_task.instruction: instruction courte de style/stage pour l'agent visible, pas un message final. Elle ne doit pas contenir de champ a remplir, de route a decider, ni d'effet a appliquer.",
    "- visible_task.conversation_context: seul contexte donne au visible agent. Remplis state_summary, user_words, field_or_stage, known_values, missing_or_weak_values, selected_candidate, handoff_data, tone_constraints, do_not_say, context_summary, evidence_used. Filtre tout: pas de DB brute, pas de memoire brute, pas de note_information brute. Inclure les contraintes utilisateur utiles, les valeurs connues, les incertitudes, le ton et les limites d'affirmation.",
    "- return_to_parent: utilise needed=true en mode inline ou return_to_parent_flow/inline_tool_return. parent_skill_id vient du parent connu, sinon null. return_summary resume ce que product_help a apporte. preserve_parent_state reste true.",
    "- exit_memo: needed=true pour exit_to_global_dispatcher, safety_preempt, inline_status_roundtrip ou tout changement d'ownership. Pour une demande operationnelle, reason=explicit_tool_request et handoff_hint_for_global_dispatcher.likely_intent porte le flow probable comme prepare_attack_card. needed=false et reason=none pour une continuation locale. local_flow_context resume product_help sans effets durables; committed_effects reste vide sauf source externe deja commitee.",
    "- note_information: obligatoire pour handoff_to_local_dispatcher, exit_to_global_dispatcher, inline_status_roundtrip et safety_preempt. target_dispatcher=prepare_attack_card, prepare_defense_card, select_state_potion, create_recurring_reminder, adjust_plan_item ou update_coach_preferences pour un pont tool local clair; global seulement pour un vrai changement de sujet non-tool ou un rappel ponctuel one_shot_reminder; safety_crisis pour safety; status_recap pour statut DB. handoff_context_for_next_dispatcher et structured_context doivent donner le sens de la sortie, l'etat product_help utile, les contraintes et le prochain focus. Elle est consommee par le dispatcher cible et ne va jamais brute au visible prompt. Mets null pour une continuation locale ou close_product_help sans changement de dispatcher.",
    "- evidence: indices semantiques ou sources vraiment utilises, courts et verifiables: mots du user, feature id, source active_flow/db. Pas de pseudo-preuves et pas de long dump.",
    "Transition Rules:",
    "- handoff_to_local_dispatcher: user demande clairement un tool flow autorise comme preparer une carte d'attaque, ajuster un plan, creer un rappel recurrent, changer une preference ou choisir une potion, avec intention d'action maintenant. Ne l'utilise pas pour expliquer une surface, dire ou retrouver une carte, comparer attaque/defense, ou repondre a comment ca marche. note_information obligatoire vers le dispatcher cible, visible_task.kind=exit_ack, state_updates.status=handoff, pas de reponse au sujet cible dans product_help, aucun effet durable.",
    "- exit_to_global_dispatcher: user abandonne product_help ou apporte un nouveau sujet clair qui n'est pas un tool flow autorise. note_information obligatoire vers global, visible_task.kind=exit_ack, state_updates.status=exit_to_global, pas de reponse au sujet cible dans product_help.",
    "- safety_preempt: risque safety prioritaire. note_information obligatoire vers safety_crisis, visible_task.kind=safety_transition, state_updates.status=safety, pas de global normal.",
    "- inline_status_roundtrip: seulement pour statut DB; note_information vers status_recap; preserve_parent_flow=true si product_help est inline.",
    'Example JSON 1 - continuation normale: {"flow_action":"answer_destination","confidence":"high","risk_score":0,"mode":"standalone","product_help_intent":{"kind":"where_is_it","summary":"User asks where attack cards are found."},"target":{"kind":"feature_catalog","feature_id":"resources.attack_card","object_type":"attack_card","object_ref":null,"confidence":"high"},"grounding":{"catalog_feature_ids":["resources.attack_card"],"surface_ids":[],"db_sources_required":false,"db_sources_used":[],"active_flow_used":false,"missing_grounding_reason":null},"bridge":{"needed":false,"operation_type":null,"kind":null,"executable":false,"why":null},"state_updates":{"status":"answered","stage":"answering","turn_count_increment":1,"close_after_visible":false,"preserve_parent_flow":true},"visible_task":{"kind":"answer_destination","instruction":"Answer the product location only.","conversation_context":{"state_summary":"Location question about attack cards.","user_words":["where do I find attack cards"],"field_or_stage":"answering","known_values":{"feature_id":"resources.attack_card"},"missing_or_weak_values":[],"selected_candidate":{"feature_id":"resources.attack_card"},"handoff_data":{},"tone_constraints":["short"],"do_not_say":["do not claim a real card exists"],"context_summary":"Use catalog location, not user object status.","evidence_used":["resources.attack_card"]}},"return_to_parent":{"needed":false,"parent_skill_id":null,"return_summary":null,"preserve_parent_state":true},"note_information":null,"exit_memo":{"needed":false,"reason":"none","user_intent_summary":null,"local_flow_context":{"skill_id":"product_help","mode":"standalone","stage":"answering","last_answer_summary":null,"parent_skill_id":null,"committed_effects":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"unknown","why":null,"constraints":[]}},"evidence":["user asks product location","resources.attack_card"]}',
    'Example JSON 2 - safety transition: {"flow_action":"safety_preempt","confidence":"high","risk_score":8,"mode":"standalone","product_help_intent":{"kind":"safety","summary":"User expresses acute self-harm risk while in product_help."},"target":{"kind":"unknown","feature_id":null,"object_type":null,"object_ref":null,"confidence":"low"},"grounding":{"catalog_feature_ids":[],"surface_ids":[],"db_sources_required":false,"db_sources_used":[],"active_flow_used":false,"missing_grounding_reason":null},"bridge":{"needed":false,"operation_type":null,"kind":null,"executable":false,"why":null},"state_updates":{"status":"safety","stage":"closing","turn_count_increment":1,"close_after_visible":true,"preserve_parent_flow":true},"visible_task":{"kind":"safety_transition","instruction":"Stop product explanation and transition minimally to safety.","conversation_context":{"state_summary":"Safety signal interrupts product_help.","user_words":["I might hurt myself"],"field_or_stage":"closing","known_values":{},"missing_or_weak_values":[],"selected_candidate":{},"handoff_data":{},"tone_constraints":["brief","non-product"],"do_not_say":["do not continue product help"],"context_summary":"Safety dispatcher must take over.","evidence_used":["self-harm wording"]}},"return_to_parent":{"needed":false,"parent_skill_id":null,"return_summary":null,"preserve_parent_state":true},"note_information":{"source_flow_id":"product_help","handoff_reason":"safety","target_dispatcher":"safety_crisis","handoff_context_for_next_dispatcher":"Safety signal in current user message while product_help was active.","user_words":["I might hurt myself"],"structured_context":{"user_message_summary":"User expresses acute self-harm risk.","active_flow_summary":"product_help was active","collected_state":{"skill_id":"product_help"},"unresolved_questions":[],"recommended_next_focus":"safety_crisis"},"confidence":"high"},"exit_memo":{"needed":true,"reason":"safety","user_intent_summary":"Safety signal interrupts product help.","local_flow_context":{"skill_id":"product_help","mode":"standalone","stage":"closing","last_answer_summary":null,"parent_skill_id":null,"committed_effects":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"unknown","why":"safety preemption","constraints":[]}},"evidence":["self-harm wording"]}',
    'Retourne exactement ce JSON: {"flow_action":"answer_product_question|clarify_product_question|answer_destination|compare_features|explain_limit|bridge_explanation_only|repeat_answer|apply_attempt|inline_status_roundtrip|inline_tool_return|handoff_to_local_dispatcher|exit_to_global_dispatcher|close_product_help|return_to_parent_flow|safety_preempt","confidence":"low|medium|high","risk_score":0,"mode":"standalone|inline","product_help_intent":{"kind":"explain_feature|how_to|where_is_it|benefits|limits|can_i_do_x|modify_or_cancel_where|object_status_question|tool_action_request|compare_features|repeat|close|off_topic|safety|unclear","summary":"string"},"target":{"kind":"feature_catalog|user_object|recent_effect|pending_draft|tool_flow|unknown","feature_id":"string|null","object_type":"attack_card|defense_card|one_shot_reminder|recurring_reminder|potion|plan_item|preference|initiative|unknown|null","object_ref":"string|null","confidence":"low|medium|high"},"grounding":{"catalog_feature_ids":[],"surface_ids":[],"db_sources_required":false,"db_sources_used":[],"active_flow_used":false,"missing_grounding_reason":"string|null"},"bridge":{"needed":false,"operation_type":"prepare_attack_card|prepare_defense_card|select_state_potion|create_recurring_reminder|one_shot_reminder|adjust_plan_item|update_coach_preferences|null","kind":"explain_only|offer_with_consent|handoff_needed|null","executable":false,"why":"string|null"},"state_updates":{"status":"open|answered|closing|stopped|handoff|exit_to_global|safety","stage":"answering|clarifying|bridge_explained|status_inline|handoff|closing","turn_count_increment":1,"close_after_visible":false,"preserve_parent_flow":true},"visible_task":{"kind":"answer_product_question|clarify_product_question|answer_destination|compare_features|explain_limit|bridge_explanation_only|repeat_answer|apply_attempt|inline_tool_return|stop_or_cancel|exit_ack|close_product_help|safety_transition","instruction":"string","conversation_context":{"state_summary":"string","user_words":["string"],"field_or_stage":"string|null","known_values":{},"missing_or_weak_values":[],"selected_candidate":{},"handoff_data":{},"tone_constraints":[],"do_not_say":[],"context_summary":"string|null","evidence_used":["string"]}},"return_to_parent":{"needed":false,"parent_skill_id":"string|null","return_summary":"string|null","preserve_parent_state":true},"note_information":{"source_flow_id":"product_help","handoff_reason":"topic_change|safety|inline_tool|bridge|flow_interruption|explicit_user_request","target_dispatcher":"global|safety_crisis|status_recap|prepare_attack_card|prepare_defense_card|select_state_potion|create_recurring_reminder|adjust_plan_item|update_coach_preferences","handoff_context_for_next_dispatcher":"string","user_words":["string"],"structured_context":{},"confidence":"low|medium|high"},"exit_memo":{"needed":false,"reason":"topic_change|explicit_tool_request|status_question|normal_coaching|safety|unknown|none","user_intent_summary":"string|null","local_flow_context":{"skill_id":"product_help","mode":"standalone|inline","stage":"string|null","last_answer_summary":"string|null","parent_skill_id":"string|null","committed_effects":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"prepare_attack_card|prepare_defense_card|select_state_potion|update_coach_preferences|status_recap|adjust_plan_item|one_shot_reminder|create_recurring_reminder|normal_coaching|unknown","why":"string|null","constraints":[]}},"evidence":["string"]}',
  ].join("\n");
}

function compactFeature(feature: ProductHelpFeature): Record<string, unknown> {
  return {
    id: feature.id,
    label: feature.label,
    aliases: feature.aliases.slice(0, 8),
    explain: feature.explain,
    how_to: feature.how_to,
    benefits: feature.benefits.slice(0, 4),
    locations: feature.locations,
    limits: feature.limits,
    operation_bridge: feature.operation_bridge ?? null,
  };
}

export async function runProductHelpLocalDispatcher(
  input: ProductHelpLocalDispatcherInput,
): Promise<ProductHelpLocalDispatcherOutput | null> {
  const userPrompt = JSON.stringify({
    task: "dispatch_product_help_local_flow",
    current_user_message: input.user_message,
    mode: input.mode,
    conversation_excerpt: input.recent_messages,
    product_help_state: input.product_help_state,
    parent_flow_context: input.parent_flow_context,
    active_flow_context: input.active_flow_context,
    note_information_inbound: input.note_information_inbound ?? null,
    db_context_pack: input.db_context_pack ?? {},
    micro_memory_context: input.micro_memory_context ?? {
      items: [],
      exclusions: ["product_help_no_micro_memory_by_default"],
      budget: {
        max_items: 0,
        reason: "product_help uses product/db context and parent context only",
      },
    },
    platform_context: withDirectEffectLocalContext(
      input.platform_context ?? {},
      (input.turn_frame as any)?.plan_snapshot ??
        (input.platform_context as any)?.plan_snapshot ??
        (input.db_context_pack as any)?.plan_snapshot ??
        null,
    ),
    risk_context: input.risk_context ?? {},
    available_inline_tools: input.available_inline_tools ?? [
      "status_recap",
    ],
    catalog_candidates: input.catalog_candidates.map(compactFeature),
    product_surface_registry: input.product_surface_registry,
    recent_committed_effects: input.recent_committed_effects,
    db_projection_sources: input.db_projection_sources ?? [],
    turn_frame: input.turn_frame,
  });
  try {
    const raw = await generateWithGemini(
      dispatcherSystemPrompt(),
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "product_help.local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizeProductHelpLocalDispatcherOutput(raw);
  } catch (error) {
    console.warn("[ProductHelp] local dispatcher failed", error);
    return null;
  }
}
