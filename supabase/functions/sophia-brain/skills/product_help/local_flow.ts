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
  buildDirectEffectConfirmationContext,
  directEffectTimeContextFromTurnFrame,
  directEffectLocalDispatcherPromptLines,
  withDirectEffectLocalContext,
} from "../../router/direct_effect_local_context.ts";
import {
  LOCAL_ONE_SHOT_DIRECT_EFFECT_EXPECTED_JSON_SHAPE,
  localOneShotDirectEffectPromptLines,
  normalizeLocalOneShotDirectEffectRequest,
} from "../../router/one_shot_local_direct_effect.ts";
import { noteReconciliationPromptLines } from "../_shared/note_reconciliation.ts";
import {
  flowEntryWindow,
  RECENT_MESSAGE_LIMITS,
} from "../../context/recent_messages_policy.ts";

export const PRODUCT_HELP_EXIT_MEMO_KEY = "__last_product_help_exit_memo";

export type ProductHelpLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** Vrai au tout premier tour possédé par ce flow (aucun état persisté). */
  is_flow_entry?: boolean;
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
    | "exit"
    | "safety"
    | "blocked";
  reason_code: string;
  local_state: ProductHelpLocalFlowState | null;
  visible_task: ProductHelpVisibleTaskKind;
  exit_to_global_dispatcher: boolean;
  return_to_parent_flow: boolean;
  answer_summary: string | null;
  conversation_context: ProductHelpConversationContext;
  note_information: NoteInformation | null;
  blocked_effects: Array<{ type: string; reason_code: string }>;
  state_mutation_audit: ProductHelpStateMutationAudit;
  evidence: string[];
};

export type ProductHelpStateMutationAudit = {
  server_owned_fields: string[];
  modified_fields_declared: string[];
  clear_fields_declared: string[];
  applied_fields: string[];
  preserved_fields: string[];
  restored_fields: string[];
  cleared_fields: string[];
  rejected_changes: Array<{ field: string; reason_code: string }>;
};

type ProductHelpStateTransition =
  | "answer_continue"
  | "answer_close"
  | "exit_to_global_dispatcher"
  | "safety_preempt"
  | "blocked"
  | "inline_return";

const PRODUCT_HELP_SERVER_OWNED_FIELDS = [
  "product_help_local_state",
  "active_product_surface",
  "active_product_topic",
  "source_flow_context",
  "parent_flow_context",
  "product_help_subskill_history",
  "suspended_flow_snapshot",
  "exit_memo",
  "handoff_note",
  "last_answered_product_question",
  "skill_id",
  "mode",
  "status",
  "product_help_state.stage",
  "product_help_state.last_intent",
  "product_help_state.last_target",
  "product_help_state.last_answer_summary",
  "product_help_state.last_catalog_feature_ids",
  "product_help_state.last_locations",
  "product_help_state.parent_flow_context",
  "product_help_state.turn_count",
  "product_help_state.max_turns",
  "product_help_state.updated_at",
] as const;

const FLOW_ACTIONS = new Set([
  "answer_product_question",
  "clarify_product_question",
  "answer_destination",
  "compare_features",
  "explain_limit",
  "bridge_explanation_only",
  "repeat_answer",
  "exit_to_global_dispatcher",
  "close_product_help",
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

const VISIBLE_TASKS = new Set([
  "answer_product_question",
  "clarify_product_question",
  "answer_destination",
  "compare_features",
  "explain_limit",
  "bridge_explanation_only",
  "repeat_answer",
  "stop_or_cancel",
  "exit_ack",
  "close_product_help",
  "safety",
  "safety_transition",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function withoutLegacyPayloadFields(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const { constraints: _constraints, user_words: _userWords, ...rest } = value;
  return rest;
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
  exitReason: string | null;
}): NoteInformationTargetDispatcher {
  if (args.flowAction === "safety_preempt" || args.exitReason === "safety") {
    return "safety_crisis";
  }
  return "global";
}

function handoffReasonForOutput(args: {
  flowAction: ProductHelpLocalFlowAction;
  targetDispatcher: NoteInformationTargetDispatcher;
  exitReason: string | null;
}): NoteInformationHandoffReason {
  if (args.targetDispatcher === "safety_crisis") return "safety";
  if (args.flowAction === "exit_to_global_dispatcher") {
    return args.exitReason === "explicit_tool_request" ||
        args.exitReason === "unknown"
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
  return normalizeStoredProductHelpFlowState(local);
}

export function hasActiveProductHelpFlow(activeSkillState: unknown): boolean {
  const state = readProductHelpFlowState(activeSkillState);
  return Boolean(
    state && (state.status === "open" || state.status === "answered"),
  );
}

const PRODUCT_HELP_STATUSES = new Set([
  "open",
  "answered",
  "closing",
  "stopped",
  "exit_to_global",
  "safety",
]);

const PRODUCT_HELP_STAGES = new Set([
  "answering",
  "clarifying",
  "bridge_explained",
  "closing",
]);

function normalizeStoredProductHelpFlowState(
  local: unknown,
): ProductHelpLocalFlowState | null {
  if (!isRecord(local) || local.skill_id !== "product_help") return null;
  if (local.mode && local.mode !== "standalone") return null;
  const productRoot = isRecord(local.product_help_state)
    ? local.product_help_state
    : local;
  const status = enumValue<ProductHelpLocalFlowState["status"]>(
    local.status,
    PRODUCT_HELP_STATUSES,
    "open",
  );
  const fallbackStage = status === "closing" || status === "stopped" ||
      status === "exit_to_global" || status === "safety"
    ? "closing"
    : "answering";
  const maxTurns = Number(productRoot.max_turns ?? local.max_turns ?? 3);
  const turnCount = Number(productRoot.turn_count ?? local.turn_count ?? 0);
  return {
    skill_id: "product_help",
    status,
    mode: "standalone",
    product_help_state: {
      stage: enumValue<
        ProductHelpLocalFlowState["product_help_state"]["stage"]
      >(productRoot.stage, PRODUCT_HELP_STAGES, fallbackStage),
      last_intent: stringValue(productRoot.last_intent ?? local.last_intent) ||
        null,
      last_target: recordValue(productRoot.last_target ?? local.last_target),
      last_answer_summary: stringValue(
        productRoot.last_answer_summary ?? local.last_answer_summary,
      ) || null,
      last_catalog_feature_ids: stringArray(
        productRoot.last_catalog_feature_ids ?? local.last_catalog_feature_ids,
        8,
      ),
      last_locations: stringArray(
        productRoot.last_locations ?? local.last_locations,
        8,
      ),
      parent_flow_context: null,
      turn_count: Number.isFinite(turnCount) ? Math.max(0, turnCount) : 0,
      max_turns: Number.isFinite(maxTurns) && maxTurns > 0 ? maxTurns : 3,
      updated_at: stringValue(productRoot.updated_at ?? local.updated_at) ||
        new Date().toISOString(),
    },
  };
}

function hasUsefulTarget(target: Record<string, unknown>): boolean {
  if (Object.keys(target).length === 0) return false;
  if (stringValue(target.kind) === "unknown") {
    return Boolean(
      stringValue(target.feature_id) ||
        stringValue(target.object_type) && stringValue(target.object_type) !==
            "unknown" ||
        stringValue(target.object_ref),
    );
  }
  return true;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function uniqueStrings(values: string[]): string[] {
  return [
    ...new Set(values.map((value) => stringValue(value)).filter(Boolean)),
  ];
}

function createStateMutationAudit(
  output: ProductHelpLocalDispatcherOutput,
): ProductHelpStateMutationAudit {
  return {
    server_owned_fields: [...PRODUCT_HELP_SERVER_OWNED_FIELDS],
    modified_fields_declared: uniqueStrings(
      output.state_updates.modified_fields ?? [],
    ),
    clear_fields_declared: uniqueStrings(
      output.state_updates.clear_fields ?? [],
    ),
    applied_fields: [],
    preserved_fields: [],
    restored_fields: [],
    cleared_fields: [],
    rejected_changes: [],
  };
}

function recordMutationAuditField(args: {
  audit: ProductHelpStateMutationAudit;
  field: string;
  previousValue: unknown;
  nextValue: unknown;
}) {
  if (sameJson(args.previousValue, args.nextValue)) {
    args.audit.preserved_fields.push(args.field);
  } else {
    args.audit.applied_fields.push(args.field);
  }
}

function finalizeStateMutationAudit(
  audit: ProductHelpStateMutationAudit,
): ProductHelpStateMutationAudit {
  const serverOwned = new Set(audit.server_owned_fields);
  const applied = new Set(audit.applied_fields);
  for (const field of audit.clear_fields_declared) {
    if (!serverOwned.has(field)) continue;
    audit.restored_fields.push(field);
    audit.rejected_changes.push({
      field,
      reason_code: "server_owned_field_clear_not_allowed",
    });
  }
  for (const field of audit.modified_fields_declared) {
    if (!serverOwned.has(field) || applied.has(field)) continue;
    audit.restored_fields.push(field);
    audit.rejected_changes.push({
      field,
      reason_code: "server_owned_field_modify_not_applied",
    });
  }
  audit.applied_fields = uniqueStrings(audit.applied_fields);
  audit.preserved_fields = uniqueStrings(audit.preserved_fields);
  audit.restored_fields = uniqueStrings(audit.restored_fields);
  audit.cleared_fields = uniqueStrings(audit.cleared_fields);
  return audit;
}

export function mergeProductHelpLocalState(args: {
  previous: ProductHelpLocalFlowState | null;
  output: ProductHelpLocalDispatcherOutput;
  transition: ProductHelpStateTransition;
  now?: string;
  status?: ProductHelpLocalFlowState["status"];
  stage?: ProductHelpLocalFlowState["product_help_state"]["stage"];
  lastIntent?: string | null;
  lastTarget?: Record<string, unknown>;
  lastAnswerSummary?: string | null;
  lastCatalogFeatureIds?: string[];
  lastLocations?: string[];
  turnCountIncrement?: number;
}): {
  local_state: ProductHelpLocalFlowState | null;
  audit: ProductHelpStateMutationAudit;
} {
  const audit = createStateMutationAudit(args.output);
  const previous = normalizeStoredProductHelpFlowState(args.previous);
  if (args.output.mode === "inline" || args.transition === "inline_return") {
    audit.cleared_fields.push("product_help_local_state");
    return {
      local_state: null,
      audit: finalizeStateMutationAudit(audit),
    };
  }
  if (args.transition === "blocked") {
    for (const field of PRODUCT_HELP_SERVER_OWNED_FIELDS) {
      audit.preserved_fields.push(field);
    }
    return {
      local_state: previous,
      audit: finalizeStateMutationAudit(audit),
    };
  }
  const previousProduct = previous?.product_help_state;
  const now = args.now ?? new Date().toISOString();
  const increment = Number(args.turnCountIncrement ?? 1);
  const targetCandidate = args.lastTarget ?? {};
  const lastTarget = hasUsefulTarget(targetCandidate)
    ? targetCandidate
    : previousProduct?.last_target ?? {};
  const catalogFeatureIds = args.lastCatalogFeatureIds?.length
    ? args.lastCatalogFeatureIds.slice(0, 8)
    : previousProduct?.last_catalog_feature_ids ?? [];
  const locations = args.lastLocations?.length
    ? args.lastLocations.slice(0, 8)
    : previousProduct?.last_locations ?? [];
  const shouldReplaceAnswerSummary = args.transition !==
      "exit_to_global_dispatcher" && args.transition !== "safety_preempt";
  const lastAnswerSummary = shouldReplaceAnswerSummary &&
      stringValue(args.lastAnswerSummary)
    ? stringValue(args.lastAnswerSummary)
    : previousProduct?.last_answer_summary ?? null;
  const lastIntent = stringValue(args.lastIntent) ||
    previousProduct?.last_intent ||
    null;
  const previousTurns = Number(previousProduct?.turn_count ?? 0);
  const nextState: ProductHelpLocalFlowState = {
    skill_id: "product_help",
    status: args.status ?? previous?.status ?? "answered",
    mode: "standalone",
    product_help_state: {
      stage: args.stage ?? previousProduct?.stage ?? "answering",
      last_intent: lastIntent,
      last_target: lastTarget,
      last_answer_summary: lastAnswerSummary,
      last_catalog_feature_ids: catalogFeatureIds,
      last_locations: locations,
      parent_flow_context: null,
      turn_count: Math.max(
        0,
        previousTurns +
          (Number.isFinite(increment) ? Math.max(0, increment) : 1),
      ),
      max_turns: Number(previousProduct?.max_turns ?? 3) || 3,
      updated_at: now,
    },
  };
  const previousComparable = previous ?? {
    skill_id: "product_help",
    status: null,
    mode: "standalone",
    product_help_state: {
      stage: null,
      last_intent: null,
      last_target: {},
      last_answer_summary: null,
      last_catalog_feature_ids: [],
      last_locations: [],
      parent_flow_context: null,
      turn_count: 0,
      max_turns: 3,
      updated_at: null,
    },
  };
  recordMutationAuditField({
    audit,
    field: "skill_id",
    previousValue: previousComparable.skill_id,
    nextValue: nextState.skill_id,
  });
  recordMutationAuditField({
    audit,
    field: "mode",
    previousValue: previousComparable.mode,
    nextValue: nextState.mode,
  });
  recordMutationAuditField({
    audit,
    field: "status",
    previousValue: previousComparable.status,
    nextValue: nextState.status,
  });
  for (
    const [field, previousValue, nextValue] of [
      [
        "product_help_state.stage",
        previousComparable.product_help_state.stage,
        nextState.product_help_state.stage,
      ],
      [
        "product_help_state.last_intent",
        previousComparable.product_help_state.last_intent,
        nextState.product_help_state.last_intent,
      ],
      [
        "product_help_state.last_target",
        previousComparable.product_help_state.last_target,
        nextState.product_help_state.last_target,
      ],
      [
        "product_help_state.last_answer_summary",
        previousComparable.product_help_state.last_answer_summary,
        nextState.product_help_state.last_answer_summary,
      ],
      [
        "product_help_state.last_catalog_feature_ids",
        previousComparable.product_help_state.last_catalog_feature_ids,
        nextState.product_help_state.last_catalog_feature_ids,
      ],
      [
        "product_help_state.last_locations",
        previousComparable.product_help_state.last_locations,
        nextState.product_help_state.last_locations,
      ],
      [
        "product_help_state.parent_flow_context",
        previousComparable.product_help_state.parent_flow_context,
        nextState.product_help_state.parent_flow_context,
      ],
      [
        "product_help_state.turn_count",
        previousComparable.product_help_state.turn_count,
        nextState.product_help_state.turn_count,
      ],
      [
        "product_help_state.max_turns",
        previousComparable.product_help_state.max_turns,
        nextState.product_help_state.max_turns,
      ],
      [
        "product_help_state.updated_at",
        previousComparable.product_help_state.updated_at,
        nextState.product_help_state.updated_at,
      ],
    ] as Array<[string, unknown, unknown]>
  ) {
    recordMutationAuditField({ audit, field, previousValue, nextValue });
  }
  return {
    local_state: nextState,
    audit: finalizeStateMutationAudit(audit),
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
}): NoteInformation | null {
  const reason = stringValue(args.exitRoot.reason) || null;
  const targetDispatcher = targetDispatcherForOutput({
    flowAction: args.flowAction,
    exitReason: reason,
  });
  const needsNote = args.flowAction === "exit_to_global_dispatcher" ||
    args.flowAction === "safety_preempt" ||
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
        "unknown",
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
  if (isRecord(args.raw)) {
    const normalized = normalizeNoteInformation(
      {
        ...args.raw,
        user_words: fallback.user_words,
        structured_context: withoutLegacyPayloadFields(
          isRecord(args.raw.structured_context)
            ? args.raw.structured_context
            : structuredContext,
        ),
      },
      fallback,
    );
    if (normalized.target_dispatcher === targetDispatcher) return normalized;
    return createNoteInformation({
      ...normalized,
      handoff_reason: handoffReasonForOutput({
        flowAction: args.flowAction,
        targetDispatcher,
        exitReason: reason,
      }),
      target_dispatcher: targetDispatcher,
      structured_context: {
        ...normalized.structured_context,
        target_dispatcher: targetDispatcher,
        recommended_next_focus: targetDispatcher,
        sanitized_from_target_dispatcher: normalized.target_dispatcher,
        product_help_boundary:
          "product_help exits only to global or safety_crisis; global may choose a follow-up skill.",
      },
    });
  }
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
  const rawFlowAction = enumValue<ProductHelpLocalFlowAction>(
    root.flow_action,
    FLOW_ACTIONS,
    "clarify_product_question",
  );
  const flowAction: ProductHelpLocalFlowAction = rawFlowAction;
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
    exitRoot.needed === true;
  const visibleKindFallback: ProductHelpVisibleTaskKind =
    flowAction === "safety_preempt"
      ? "safety_transition"
      : flowAction === "exit_to_global_dispatcher"
      ? "stop_or_cancel"
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
        flowAction === "bridge_explanation_only",
      operation_type: null,
      kind: enumValue(
        bridgeRoot.kind,
        new Set(["explain_only", ""]),
        "explain_only",
      ) || null,
      executable: false,
      why: stringValue(bridgeRoot.why) || null,
    },
    direct_effect_request: normalizeLocalOneShotDirectEffectRequest(
      root.direct_effect_request,
    ),
    state_updates: {
      status: enumValue(
        stateRoot.status,
        new Set([
          "open",
          "answered",
          "closing",
          "stopped",
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
          "closing",
        ]),
        flowAction === "clarify_product_question"
          ? "clarifying"
          : flowAction === "bridge_explanation_only"
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
      modified_fields: stringArray(stateRoot.modified_fields, 20),
      clear_fields: stringArray(stateRoot.clear_fields, 20),
    },
    visible_task: visibleTask,
    return_to_parent: {
      needed: mode === "inline" || returnRoot.needed === true ||
        flowAction === "close_product_help",
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
            "one_shot_reminder",
            "normal_coaching",
            "unknown",
          ]),
          "unknown",
        ),
        why: stringValue(exitHint.why) || null,
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
  directEffectConfirmationContext?: Record<string, unknown> | null;
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
    }));
  return defaultConversationContext({
    ...base,
    state_summary: base.state_summary || answerSummary(args.output),
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
      direct_effect_confirmation_context:
        args.directEffectConfirmationContext ?? null,
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
  directEffectConfirmationContext?: Record<string, unknown> | null;
  userMessage?: string | null;
}): ProductHelpReducerResult {
  const output = args.output;
  const summary = answerSummary(output);
  const catalogLocations = args.catalogCandidates.flatMap((feature) =>
    feature.locations.map((location) => location.surface)
  );
  const mergeState = (
    transition: ProductHelpStateTransition,
    overrides: Partial<Parameters<typeof mergeProductHelpLocalState>[0]> = {},
  ) =>
    mergeProductHelpLocalState({
      previous: args.previous,
      output,
      transition,
      ...overrides,
    });
  if (output.mode === "inline" && !output.state_updates.preserve_parent_flow) {
    const stateMerge = mergeState("blocked");
    return {
      status: "blocked",
      reason_code: "product_help_inline_parent_preservation_required",
      local_state: stateMerge.local_state,
      visible_task: "safety_transition",
      exit_to_global_dispatcher: false,
      return_to_parent_flow: true,
      answer_summary: null,
      conversation_context: defaultConversationContext({
        state_summary: "Inline product_help tried to drop the parent flow.",
        evidence_used: output.evidence,
        do_not_say: ["Ne mentionne pas le blocage technique."],
      }),
      note_information: null,
      blocked_effects: [{
        type: "product_help",
        reason_code: "parent_preservation_required",
      }],
      state_mutation_audit: stateMerge.audit,
      evidence: output.evidence,
    };
  }
  if (output.flow_action === "exit_to_global_dispatcher") {
    if (!output.note_information) {
      const stateMerge = mergeState("blocked");
      return {
        status: "blocked",
        reason_code: "product_help_exit_note_information_missing",
        local_state: stateMerge.local_state,
        visible_task: "stop_or_cancel",
        exit_to_global_dispatcher: false,
        return_to_parent_flow: output.mode === "inline",
        answer_summary: null,
        conversation_context: defaultConversationContext({
          state_summary:
            "Product help attempted to exit without note_information.",
          evidence_used: output.evidence,
          do_not_say: ["Ne mentionne pas le dispatcher global."],
        }),
        note_information: null,
        blocked_effects: [{
          type: "product_help",
          reason_code: "note_information_missing",
        }],
        state_mutation_audit: stateMerge.audit,
        evidence: output.evidence,
      };
    }
    const stateMerge = mergeState("exit_to_global_dispatcher", {
      status: "exit_to_global",
      stage: "closing",
      turnCountIncrement: output.state_updates.turn_count_increment,
    });
    return {
      status: "exit",
      reason_code: "product_help_exit_to_global_dispatcher",
      local_state: stateMerge.local_state,
      visible_task: "exit_ack",
      exit_to_global_dispatcher: true,
      return_to_parent_flow: output.mode === "inline",
      answer_summary: null,
      conversation_context: defaultConversationContext({
        state_summary: noteInformationSummary(output.note_information) ??
          output.note_information.handoff_context_for_next_dispatcher,
        handoff_data: {
          note_information_summary: {
            target_dispatcher: output.note_information.target_dispatcher,
            handoff_reason: output.note_information.handoff_reason,
            summary: noteInformationSummary(output.note_information),
          },
        },
        context_summary: "Ownership exits product_help for global dispatcher.",
        evidence_used: output.evidence,
      }),
      note_information: output.note_information,
      blocked_effects: [],
      state_mutation_audit: stateMerge.audit,
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
    const stateMerge = mergeState("safety_preempt", {
      status: "safety",
      stage: "closing",
      lastIntent: "safety",
      lastTarget: {},
      lastAnswerSummary:
        args.previous?.product_help_state.last_answer_summary ?? null,
      lastCatalogFeatureIds: [],
      lastLocations: [],
      turnCountIncrement: output.state_updates.turn_count_increment,
    });
    return {
      status: "safety",
      reason_code: "product_help_safety_preempt",
      local_state: stateMerge.local_state,
      visible_task: "safety_transition",
      exit_to_global_dispatcher: false,
      return_to_parent_flow: output.mode === "inline",
      answer_summary: null,
      conversation_context: defaultConversationContext({
        state_summary:
          "Safety signal detected during product_help; stop product explanation.",
        handoff_data: {
          note_information_summary: {
            target_dispatcher: safetyNote.target_dispatcher,
            handoff_reason: safetyNote.handoff_reason,
            summary: noteInformationSummary(safetyNote),
          },
        },
        context_summary:
          "Transition minimale; safety_crisis doit reprendre avec la note.",
        evidence_used: output.evidence,
      }),
      note_information: safetyNote,
      blocked_effects: [{
        type: "product_help",
        reason_code: "safety_preempt",
      }],
      state_mutation_audit: stateMerge.audit,
      evidence: output.evidence,
    };
  }
  const objectStatusWithoutGrounding =
    output.product_help_intent.kind === "object_status_question" &&
    output.grounding.db_sources_required &&
    output.grounding.db_sources_used.length === 0 &&
    !output.grounding.active_flow_used;
  if (objectStatusWithoutGrounding) {
    const note = output.note_information ?? createNoteInformation({
      source_flow_id: "product_help",
      handoff_reason: "explicit_user_request",
      target_dispatcher: "global",
      handoff_context_for_next_dispatcher:
        "User asks for real current Sophia status. product_help cannot inspect status or database state, so global must reclassify without any local tool bridge.",
      user_words: args.userMessage ? [args.userMessage] : output.evidence,
      structured_context: {
        user_message_summary: args.userMessage ?? summary,
        active_flow_summary:
          "product_help exited because it cannot provide a real status recap.",
        collected_state: {
          product_help_intent: output.product_help_intent.kind,
          db_sources_required: true,
          db_sources_used: [],
        },
        unresolved_questions: [],
        recommended_next_focus: "global",
      },
      confidence: output.confidence,
    });
    const stateMerge = mergeState("exit_to_global_dispatcher", {
      status: "exit_to_global",
      stage: "closing",
      turnCountIncrement: output.state_updates.turn_count_increment,
    });
    return {
      status: "exit",
      reason_code: "product_help_real_status_question_exit_to_global",
      local_state: stateMerge.local_state,
      visible_task: "exit_ack",
      exit_to_global_dispatcher: true,
      return_to_parent_flow: output.mode === "inline",
      answer_summary: null,
      conversation_context: defaultConversationContext({
        state_summary:
          "Product help cannot answer real current status or consult DB.",
        handoff_data: {
          note_information_summary: {
            target_dispatcher: note.target_dispatcher,
            handoff_reason: note.handoff_reason,
            summary: noteInformationSummary(note),
          },
        },
        context_summary:
          "Ownership exits product_help for global reclassification.",
        evidence_used: output.evidence,
      }),
      note_information: note,
      blocked_effects: [],
      state_mutation_audit: stateMerge.audit,
      evidence: output.evidence,
    };
  }
  const visibleTask = output.visible_task.kind;
  const previousTurns = Number(
    args.previous?.product_help_state.turn_count ?? 0,
  );
  const nextTurns = previousTurns + output.state_updates.turn_count_increment;
  const maxTurns = Number(args.previous?.product_help_state.max_turns ?? 3) ||
    3;
  const resolvedProductAnswer = output.state_updates.status === "answered" &&
    output.flow_action !== "clarify_product_question" &&
    output.flow_action !== "bridge_explanation_only";
  const shouldClose = output.mode === "inline" ||
    resolvedProductAnswer ||
    output.state_updates.close_after_visible ||
    output.flow_action === "close_product_help" ||
    nextTurns >= maxTurns;
  const stateMerge = mergeState(
    shouldClose ? "answer_close" : "answer_continue",
    {
      status: shouldClose
        ? "closing"
        : output.state_updates.status === "open"
        ? "open"
        : "answered",
      stage: shouldClose ? "closing" : output.state_updates.stage,
      lastIntent: output.product_help_intent.kind,
      lastTarget: output.target as unknown as Record<string, unknown>,
      lastAnswerSummary: summary,
      lastCatalogFeatureIds: output.grounding.catalog_feature_ids,
      lastLocations: catalogLocations,
      turnCountIncrement: output.state_updates.turn_count_increment,
    },
  );
  return {
    status: shouldClose ? "closing" : "answered",
    reason_code: `product_help_local_${output.flow_action}`,
    local_state: stateMerge.local_state,
    visible_task: visibleTask,
    exit_to_global_dispatcher: false,
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
      directEffectConfirmationContext: args.directEffectConfirmationContext,
      productSurfaces: args.productSurfaces,
    }),
    note_information: output.note_information,
    blocked_effects: [],
    state_mutation_audit: stateMerge.audit,
    evidence: output.evidence,
  };
}

function dispatcherSystemPrompt(coldEntryFraming: string[] = []): string {
  return [
    "Tu es le dispatcher local structure du skill product_help.",
    ...coldEntryFraming,
    ...noteReconciliationPromptLines(
      "corrige la cible dans target et conversation_context, ou quitte vers global avec note_information si le message courant sort du perimetre product_help",
    ),
    "Tu ne reponds jamais directement au user. Tu retournes uniquement un JSON valide.",
    "product_help explique le produit Sophia: utilite, fonctionnement, navigation, limites, comparaison et destinations dans l'app.",
    "product_help ne cree, modifie, annule, programme, active, enregistre ou applique jamais rien.",
    "Modes: standalone si product_help est le flow actif; inline si un flow parent t'appelle puis reprend.",
    "Le dispatcher global normal ne fonctionne pas pendant product_help actif. Tu peux le rendre disponible seulement avec flow_action=exit_to_global_dispatcher et note_information.",
    "Contraintes strictes: aucune operation_suggestions, requested_effects, allowed_effects ou committed_effects; aucun pending confirmation; aucun token de confirmation; aucun flow lance.",
    "En inline, preserve_parent_flow doit rester true et return_to_parent.needed true.",
    "Pour une difficulte personnelle, un blocage, une hesitation entre leviers Sophia, un oubli recurrent, une action mal calibree ou un risque de decrochage, product_help ne lance aucun flow local: utilise exit_to_global_dispatcher avec note_information.target_dispatcher=global, aucun effet durable. Le dispatcher global reprendra l'ownership.",
    "Anti-faux-positif sortie: une question produit de type ou/comment/c'est quoi/a quoi ca sert/quelle difference/ou je retrouve/est-ce que ca existe reste product_help, meme si elle mentionne carte d'attaque, carte de defense, potion, rappel ou Plan. Reponds avec answer_product_question, how_to, answer_destination, compare_features ou explain_limit.",
    "Priorite de decision: affiner une action existante du Plan prime sur Carte d'attaque. Si le user demande comment rendre une action du Plan plus concrete, moins floue, ou adaptee, cible plan.adjustment comme concept produit et explique la destination plateforme. \"Sans toucher au reste du Plan\" veut dire explication sans mutation immediate; ca ne veut pas dire Carte d'attaque. Utilise Carte d'attaque seulement si le user demande explicitement une carte, un premier geste pour demarrer, ou une preparation d'execution.",
    "Si note_information_inbound ou catalog_candidates recommandent Carte d'attaque mais que current_user_message parle d'affiner une action existante du Plan, le message courant gagne: corrige vers plan.adjustment dans target et conversation_context.",
    "Aucun pont local autorise depuis product_help. Les anciennes actions operationnelles ne sont pas des cibles product_help. coaching_recommendation n'est pas une cible directe de product_help.",
    "Pour une question de statut DB, quitte vers global avec note_information; ne rends pas toi-meme un status DB.",
    "Pour un abandon sans nouveau sujet clair, utilise exit_to_global_dispatcher avec note_information; ne pose pas de question finale dans product_help.",
    "Pour un changement de sujet clair, utilise exit_to_global_dispatcher avec note_information.target_dispatcher=global.",
    "Pour safety, utilise safety_preempt avec note_information.target_dispatcher=safety_crisis; ne relance pas global.",
    "Si tu changes de dispatcher, note_information est obligatoire et garde strictement la structure source_flow_id, target_dispatcher, handoff_reason, handoff_context_for_next_dispatcher, structured_context, confidence si utile. Ne fournis pas user_words: le runtime les possede si le contrat legacy les exige. structured_context est succinct, non vide, sans constraints, DB brute, memoire brute, source_flow_presentation, source_flow_state_summary, target_local_dispatcher_hint, risk_score ni committed_effects.",
    "Ne jamais serialiser active_flow_context, parent_flow_context, conversation_context, visible_task, dispatcher_context ou note_information entrante dans note_information; resume-les en 1-2 phrases et champs filtres.",
    "Si une question porte sur l'etat d'un objet reel, n'affirme rien sans source recent_committed_effects, active_flow_context ou db_projection_sources.",
    ...directEffectLocalDispatcherPromptLines(),
    ...localOneShotDirectEffectPromptLines("product_help actif"),
    "Field Completion Rules:",
    "- flow_action: decision principale de ce tour product_help. Choisis-la depuis le message courant et l'etat local, pas seulement depuis le tour precedent. Utilise answer_product_question, answer_destination, compare_features ou explain_limit pour continuer localement, y compris quand le user demande ou retrouver une carte d'attaque, comment ca marche, ce que c'est ou la difference entre deux ressources; repeat_answer si le user demande de redire; exit_to_global_dispatcher si le user veut arreter product_help, change clairement vers un sujet non-produit, demande un statut reel, demande une action produit ou demande quel levier Sophia choisir face a un blocage personnel; close_product_help seulement pour une fermeture locale prevue par le mode inline/parent; safety_preempt si le signal safety est prioritaire. N'invente aucune action absente du schema.",
    "- confidence: high si l'intention produit ou la transition est claire; medium si la cible est probable mais incomplete; low si une clarification ou une prudence est necessaire. Ne mets pas high quand target.confidence ou grounding sont faibles.",
    "- risk_score: score local 0-10 utile a product_help. 0-2 pour aide produit ordinaire; 3-6 pour malaise ou risque ambigu non urgent; 7+ seulement pour safety reelle et alors flow_action doit etre safety_preempt. Ne fabrique pas de safety depuis une simple frustration produit.",
    "- mode: reprends standalone ou inline depuis l'input. En inline, preserve_parent_flow doit rester true et return_to_parent.needed doit etre true sauf safety explicite.",
    "- product_help_intent.kind: classe le besoin produit reel: explain_feature, how_to, where_is_it, benefits, limits, can_i_do_x, modify_or_cancel_where, object_status_question, tool_action_request, compare_features, repeat, close, off_topic, safety ou unclear. Utilise tool_action_request seulement pour une demande operationnelle explicite de lancer/preparer/creer/modifier/activer; n'utilise jamais tool_action_request pour une demande d'explication, de destination, de difference ou de fonctionnement. summary resume l'intention en une phrase; ne l'utilise pas comme reponse visible.",
    "- Un INVENTAIRE d'etat personnel ('dis-moi ce que t'as de programme pour moi', 'liste mes rappels/notifs', 'qu'est-ce qui est prevu') est TOUJOURS object_status_question avec grounding.db_sources_required=true — jamais une explication de surface. product_help ne possede pas la projection reelle des rappels: l'exit vers le global rendra l'inventaire exact (rappels ponctuels ET recurrents). Ne reponds jamais a un inventaire par une description generique des ecrans.",
    "- target: decrit la cible produit ou objet. kind=feature_catalog pour une surface ou concept Sophia; user_object pour une carte/rappel/potion reel utilisateur; recent_effect si la question porte sur un effet du tour recent; pending_draft si elle porte sur un brouillon; unknown si insuffisant. Pour une question sur transformer/rendre concrete/ajuster une action existante du Plan, feature_id=plan.adjustment et object_type=plan_item; pas resources.attack_card sauf demande explicite de carte ou de preparation de demarrage. feature_id reste null si non determine. object_type reste null si non applicable. object_ref reste null sauf reference explicite et sourcee. target.confidence ne doit pas depasser l'evidence.",
    "- grounding: liste uniquement les sources reellement utilisees. catalog_feature_ids pour les fiches produit retenues; surface_ids pour surfaces produit; db_sources_required=true si le user demande un etat reel; db_sources_used seulement si une source DB/effect/active_flow est disponible; active_flow_used=true seulement si tu t'appuies sur le flow parent/actif; missing_grounding_reason explique pourquoi tu ne peux pas affirmer. Ne mets pas de pseudo-preuve.",
    "- bridge: decrit une frontiere produit, jamais une execution. needed=true seulement pour bridge_explanation_only. Toute sortie d'ownership doit viser global via note_information. Pour une question ou/comment/c'est quoi/a quoi ca sert, bridge.needed reste false ou kind=explain_only. executable est toujours false et operation_type reste null.",
    "- direct_effect_request: present seulement pour un rappel ponctuel explicite detecte pendant product_help. Ce n'est pas une mutation product_help et ca ne remplace jamais note_information pour les sorties globales.",
    "- state_updates: etat local minimal. status=open/answered pour continuer, closing pour finir localement, stopped pour exit_to_global_dispatcher, exit_to_global pour exit, safety pour safety. stage doit suivre la tache: answering, clarifying, bridge_explained ou closing. turn_count_increment vaut 1 pour un tour traite, 0 seulement si aucune progression locale. close_after_visible=true quand le flow doit se fermer apres le message visible. Ne cree pas de profil global ni d'hypothese durable.",
    "- visible_task.kind: stage visible exact. Utilise answer_product_question, clarify_product_question, answer_destination, compare_features, explain_limit, bridge_explanation_only, repeat_answer, stop_or_cancel, exit_ack, close_product_help ou safety_transition. Ne choisis pas un stage generique si un stage precis existe. En stop/cancel, utilise stop_or_cancel.",
    "- visible_task.instruction: instruction courte de style/stage pour l'agent visible, pas un message final. Elle ne doit pas contenir de champ a remplir, de route a decider, ni d'effet a appliquer.",
    "- visible_task.conversation_context: seul contexte metier donne au visible agent. Reste sparse: state_summary, field_or_stage, known_values, missing_or_weak_values, selected_candidate, handoff_data, tone_constraints, do_not_say, context_summary, evidence_used seulement si utiles. Ne mets pas user_words ni transcript brut: le visible recoit les messages recents via visible_runtime_context. Filtre tout: pas de DB brute, pas de memoire brute, pas de note_information brute.",
    "- return_to_parent: utilise needed=true en mode inline. parent_skill_id vient du parent connu, sinon null. return_summary resume ce que product_help a apporte. preserve_parent_state reste true.",
    "- exit_memo: needed=true pour exit_to_global_dispatcher, safety_preempt ou tout changement d'ownership. Pour une demande de choix de levier, reason=normal_coaching et handoff_hint_for_global_dispatcher.likely_intent=normal_coaching. needed=false et reason=none pour une continuation locale. local_flow_context resume product_help sans effets durables; committed_effects reste vide sauf source externe deja commitee.",
    "- note_information: obligatoire pour exit_to_global_dispatcher et safety_preempt. target_dispatcher=global pour tout changement de sujet, demande de choix de levier ou demande operationnelle hors product_help; safety_crisis pour safety. handoff_context_for_next_dispatcher et structured_context doivent donner le sens de la sortie, l'etat product_help utile et le prochain focus. Ne mets pas constraints. Elle est consommee par le dispatcher cible et ne va jamais brute au visible prompt. Ne copie jamais active_flow_context, parent_flow_context, conversation_context, visible_task, dispatcher_context ou note_information entrante; resume-les. Mets null pour une continuation locale ou close_product_help sans changement de dispatcher.",
    "- evidence: indices semantiques ou sources vraiment utilises, courts et verifiables: mots du user, feature id, source active_flow/db. Pas de pseudo-preuves et pas de long dump.",
    "Transition Rules:",
    "- exit_to_global_dispatcher: user abandonne product_help, demande une action produit, demande un statut reel ou apporte un nouveau sujet clair. note_information obligatoire vers global, visible_task.kind=exit_ack, state_updates.status=exit_to_global, pas de reponse au sujet cible dans product_help.",
    "- safety_preempt: risque safety prioritaire. note_information obligatoire vers safety_crisis, visible_task.kind=safety_transition, state_updates.status=safety, pas de global normal.",
    'Example JSON 1 - continuation normale sparse: {"flow_action":"answer_destination","confidence":"high","mode":"standalone","product_help_intent":{"kind":"where_is_it","summary":"Question de destination produit pour les cartes d attaque."},"target":{"kind":"feature_catalog","feature_id":"resources.attack_card","object_type":"attack_card","confidence":"high"},"grounding":{"catalog_feature_ids":["resources.attack_card"]},"visible_task":{"kind":"answer_destination","conversation_context":{"state_summary":"Destination produit des cartes d attaque.","known_values":{"feature_id":"resources.attack_card"},"do_not_say":["Ne dis pas qu une carte existe sans source."],"evidence_used":["resources.attack_card"]}},"evidence":["question de destination","resources.attack_card"]}',
    'Example JSON 2 - safety transition sparse: {"flow_action":"safety_preempt","confidence":"high","risk_score":8,"mode":"standalone","product_help_intent":{"kind":"safety","summary":"Risque safety prioritaire pendant product_help."},"state_updates":{"status":"safety","stage":"closing","close_after_visible":true},"visible_task":{"kind":"safety_transition","conversation_context":{"state_summary":"Safety interrompt product_help.","do_not_say":["Ne continue pas l explication produit."],"evidence_used":["signal safety"]}},"note_information":{"source_flow_id":"product_help","handoff_reason":"safety","target_dispatcher":"safety_crisis","handoff_context_for_next_dispatcher":"Signal safety pendant product_help; safety_crisis doit reprendre.","structured_context":{"active_flow_summary":"product_help actif","recommended_next_focus":"safety_crisis"},"confidence":"high"},"exit_memo":{"needed":true,"reason":"safety","user_intent_summary":"Safety interrompt product_help."},"evidence":["signal safety"]}',
    'Example JSON 3 - question produit + rappel ponctuel demande dans le message: {"flow_action":"answer_product_question","confidence":"high","mode":"standalone","product_help_intent":{"kind":"can_i_do_x","summary":"Question produit sur la modification d une carte d attaque avec rappel ponctuel explicite."},"target":{"kind":"feature_catalog","feature_id":"resources.attack_card","object_type":"attack_card","confidence":"high"},"grounding":{"catalog_feature_ids":["resources.attack_card"]},"direct_effect_request":{"requested":true,"effect_type":"create_one_shot_reminder","explicitness":"explicit","target_status":"identified","confidence_band":"high","payload_hint":{"raw_text":"rappelle-moi dans 40 minutes de relire la doc","when_hint":"dans 40 minutes","UTC_time":"2026-06-24T14:40:00.000Z","local_label":"dans 40 minutes","instruction_hint":"relire la doc"},"reason":"rappel ponctuel explicite avec delai exploitable"},"visible_task":{"kind":"answer_product_question","conversation_context":{"state_summary":"Question produit multi-intent; le rappel ponctuel passe par la lane directe.","known_values":{"feature_id":"resources.attack_card","direct_effect_confirmation_context":"copie filtree du direct_effect_confirmation_context ou null"},"do_not_say":["Ne dis pas que le rappel est programme sans commit dans direct_effect_lane."],"evidence_used":["demande produit","rappel ponctuel"]}},"evidence":["question produit","rappel ponctuel explicite"]}',
    JSON.stringify({
      expected_direct_effect_request_shape:
        LOCAL_ONE_SHOT_DIRECT_EFFECT_EXPECTED_JSON_SHAPE,
    }),
    "Retourne uniquement un JSON strict sparse compatible avec ce contrat. Champs utiles: flow_action, confidence, risk_score seulement si >0, mode, product_help_intent, target, grounding, bridge seulement si needed=true, direct_effect_request seulement si rappel ponctuel detecte, state_updates seulement si le reducer ne peut pas deriver, visible_task avec conversation_context sparse si product_help parle, return_to_parent seulement si inline, note_information et exit_memo seulement pour exit_to_global_dispatcher ou safety_preempt, evidence. Omettre null, false, 0, listes vides et objets vides sauf si leur presence change la decision.",
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
  };
}

export async function runProductHelpLocalDispatcher(
  input: ProductHelpLocalDispatcherInput,
): Promise<ProductHelpLocalDispatcherOutput | null> {
  const conversationWindow = flowEntryWindow({
    recent_messages: input.recent_messages,
    user_message: input.user_message,
    is_cold_entry: input.is_flow_entry === true,
    // product_help sert historiquement toolFlow (10) en continuation.
    continuation_limit: RECENT_MESSAGE_LIMITS.toolFlow,
  });
  const userPrompt = JSON.stringify({
    task: "dispatch_product_help_local_flow",
    current_user_message: input.user_message,
    mode: input.mode,
    conversation_excerpt: conversationWindow.messages,
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
      undefined,
      directEffectTimeContextFromTurnFrame(input.turn_frame),
    ),
    direct_effect_confirmation_context: buildDirectEffectConfirmationContext(
      input.turn_frame,
    ),
    risk_context: input.risk_context ?? {},
    catalog_candidates: input.catalog_candidates.map(compactFeature),
    product_surface_registry: input.product_surface_registry,
    recent_committed_effects: input.recent_committed_effects,
    db_projection_sources: input.db_projection_sources ?? [],
    turn_frame: input.turn_frame,
  });
  try {
    const raw = await generateWithGemini(
      dispatcherSystemPrompt(conversationWindow.framing),
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel(),
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
