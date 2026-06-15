import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import {
  createNoteInformation,
  type NoteInformation,
  type NoteInformationTargetDispatcher,
} from "../../../contracts/note_information.v1.ts";
import { RECENT_MESSAGE_LIMITS } from "../../../context/recent_messages_policy.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";
import {
  directEffectLocalDispatcherPromptLines,
  withDirectEffectLocalContext,
} from "../../../router/direct_effect_local_context.ts";
import type {
  DefenseCardHandoffDraft,
  DefenseCardHandoffState,
} from "./contract.ts";

export const DEFENSE_CARD_SUPPORT_NEED_LABEL =
  "Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?";

const HANDOFF_TARGET = getHandoffTargetForOperation("prepare_defense_card");
export const DEFENSE_CARD_PLATFORM_DESTINATION =
  HANDOFF_TARGET?.user_facing_destination ??
    "dans Ressources / Défense / Cartes de défense libres";
const DEFENSE_CARD_PLATFORM_STEPS = HANDOFF_TARGET?.platform_steps ?? [
  "ouvre Ressources / Défense",
  "dans Cartes de défense libres, choisis Ajouter une carte",
  "reprends les champs préparés par Sophia",
];

export function defenseCardPlatformDestinationForRoute(
  route: "free_card" | "plan_item_card" | null,
): string {
  return route === "plan_item_card"
    ? "dans l'action concernée du Plan, section Cartes de défense"
    : DEFENSE_CARD_PLATFORM_DESTINATION;
}

export function defenseCardPlatformStepsForRoute(
  route: "free_card" | "plan_item_card" | null,
): string[] {
  return route === "plan_item_card"
    ? [
      "ouvre l'action concernée dans le Plan",
      "va dans sa section Cartes de défense",
      "reprends les champs préparés par Sophia",
    ]
    : DEFENSE_CARD_PLATFORM_STEPS;
}

export type PrepareDefenseCardToolFit =
  | "defense"
  | "attack_better"
  | "ambiguous"
  | "not_applicable";

export type PrepareDefenseCardLocalStage =
  | "tool_fit"
  | "attachment_intake"
  | "risk_intake"
  | "support_need_intake"
  | "handoff_ready"
  | "handoff_delivered"
  | "exit";

export type PrepareDefenseCardLocalFlowAction =
  | "answer_current_field"
  | "confirm_proposed_field"
  | "clarify_attack_vs_defense"
  | "confirm_attachment_candidate"
  | "revise_current_field"
  | "revise_attachment"
  | "revise_risk"
  | "revise_support_need"
  | "get_info_product"
  | "get_info_db"
  | "handoff_ready"
  | "repeat_handoff"
  | "platform_destination_followup"
  | "apply_attempt"
  | "exit_to_global_dispatcher"
  | "cancel_flow"
  | "defer_flow"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type PrepareDefenseCardVisibleTaskKind =
  | "clarify_attack_vs_defense"
  | "redirect_attack_better"
  | "ask_attachment"
  | "confirm_attachment_candidate"
  | "ask_risk_situation"
  | "ask_trigger_or_signal"
  | "ask_defense_goal_or_response"
  | "ask_support_need"
  | "confirm_support_need_proposal"
  | "handoff_ready"
  | "revision_done"
  | "destination_short"
  | "apply_attempt"
  | "repeat_handoff"
  | "inline_tool_return"
  | "stop_or_cancel"
  | "exit_ack"
  | "exit_or_cancel"
  | "safety"
  | "safety_transition"
  | "handoff_transition"
  | "none";

export type PrepareDefenseCardConversationContext = {
  state_summary: string;
  user_words: string[];
  field_or_stage: string | null;
  known_values: {
    tool_fit: PrepareDefenseCardToolFitState;
    attachment: PrepareDefenseCardAttachmentState;
    risk: PrepareDefenseCardRiskState;
    trigger: PrepareDefenseCardTriggerState;
    defense_goal: PrepareDefenseCardGoalState;
    defense_response_hint: PrepareDefenseCardResponseHintState;
    support_need: PrepareDefenseCardSupportNeedState;
  };
  missing_or_weak_values: string[];
  selected_candidate: Record<string, unknown>;
  handoff_data: {
    operation_name: "prepare_defense_card";
    surface_label: "Cartes de défense";
    platform_destination: string;
    platform_steps: string[];
    route_kind: "free_card" | "plan_item_card" | null;
    support_need_label: typeof DEFENSE_CARD_SUPPORT_NEED_LABEL;
    support_need_value: string | null;
    risk_context: string | null;
    defense_action: string | null;
    ritual_phrase: string | null;
    attachment_value: string | null;
    risk_value: string | null;
  };
  previous_values: {
    support_need: string | null;
  };
  revision: PrepareDefenseCardLocalDispatcherOutput["revision"] | null;
  tone_constraints: string[];
  do_not_say: string[];
  context_summary: string | null;
  evidence_used: string[];
};

export type PrepareDefenseCardRiskAssessment = {
  risk_score: number;
  risk_band: "none" | "low" | "medium" | "high" | "critical";
  safety_preempt: boolean;
  reason_codes: string[];
};

type SlotStatus = "missing" | "ambiguous" | "proposed" | "locked";

export type PrepareDefenseCardToolFitState = {
  status: PrepareDefenseCardToolFit;
  reason: string | null;
  needs_user_confirmation: boolean;
  why_status: string | null;
};

export type PrepareDefenseCardAttachmentState = {
  status: SlotStatus;
  kind:
    | "plan_item"
    | "personal_action"
    | "free_risk_context"
    | "recurring_context"
    | "unknown"
    | null;
  plan_item_id: string | null;
  candidate_value: string | null;
  locked_value: string | null;
  candidate_options: Array<{
    kind: "plan_item";
    plan_item_id: string;
    title: string;
    reason: string | null;
  }>;
  needs_user_confirmation: boolean;
  why_status: string | null;
};

export type PrepareDefenseCardRiskState = {
  status: SlotStatus;
  label: string | null;
  description: string | null;
  timing_hint: string | null;
  context_hint: string | null;
  needs_user_confirmation: boolean;
  why_status: string | null;
};

export type PrepareDefenseCardTriggerState = {
  status: SlotStatus;
  type:
    | "temptation"
    | "impulse"
    | "emotional_drop"
    | "social_context"
    | "fatigue"
    | "stress"
    | "habit_loop"
    | "avoidance"
    | null;
  candidate_value: string | null;
  locked_value: string | null;
  needs_user_confirmation: boolean;
  why_status: string | null;
};

export type PrepareDefenseCardGoalState = {
  status: "missing" | "proposed" | "locked";
  value:
    | "avoid_relapse"
    | "interrupt_impulse"
    | "protect_action"
    | "leave_context"
    | "reduce_damage"
    | null;
  candidate_value: string | null;
  locked_value: string | null;
  needs_user_confirmation: boolean;
  why_status: string | null;
};

export type PrepareDefenseCardResponseHintState = {
  status: SlotStatus;
  strategy_hint:
    | "delay"
    | "leave_context"
    | "replace_action"
    | "contact_support"
    | "environment_block"
    | "self_talk"
    | "unknown"
    | null;
  candidate_value: string | null;
  locked_value: string | null;
  needs_user_confirmation: boolean;
  why_status: string | null;
};

export type PrepareDefenseCardSupportNeedState = {
  field_id: "support_need";
  question_label: typeof DEFENSE_CARD_SUPPORT_NEED_LABEL;
  status: "missing" | "proposed" | "locked";
  candidate_value: string | null;
  locked_value: string | null;
  previous_value: string | null;
  needs_user_confirmation: boolean;
  why_status: string | null;
};

export type PrepareDefenseCardLocalState = {
  flow_id: "prepare_defense_card";
  route_kind: "free_card" | "plan_item_card" | null;
  platform_destination: string;
  tool_fit_state: PrepareDefenseCardToolFitState;
  attachment_state: PrepareDefenseCardAttachmentState;
  risk_state: PrepareDefenseCardRiskState;
  trigger_state: PrepareDefenseCardTriggerState;
  defense_goal_state: PrepareDefenseCardGoalState;
  defense_response_hint_state: PrepareDefenseCardResponseHintState;
  support_need_state: PrepareDefenseCardSupportNeedState;
  last_visible_task: PrepareDefenseCardVisibleTaskKind | null;
  last_handoff_delivered: boolean;
  subskill_history: Array<Record<string, unknown>>;
};

export type PrepareDefenseCardServerOwnedField =
  | "route_kind"
  | "platform_destination"
  | "tool_fit_state"
  | "attachment_state"
  | "risk_state"
  | "trigger_state"
  | "defense_goal_state"
  | "defense_response_hint_state"
  | "support_need_state"
  | "last_visible_task"
  | "last_handoff_delivered"
  | "subskill_history";

export type PrepareDefenseCardStateMutationAudit = {
  server_owned_fields: PrepareDefenseCardServerOwnedField[];
  modified_fields_declared: string[];
  clear_fields_declared: string[];
  applied_fields: string[];
  preserved_fields: string[];
  restored_fields: string[];
  cleared_fields: string[];
  rejected_changes: Array<{
    field: string;
    reason_code:
      | "missing_previous_offer"
      | "pending_confirmation_missing"
      | "direct_handoff_flag_missing"
      | "selected_option_missing"
      | "durable_need_missing"
      | "candidate_missing"
      | "blocked_by_constraint"
      | "not_stabilized_enough"
      | "invalid_status_transition";
    attempted_action: PrepareDefenseCardLocalFlowAction;
  }>;
};

export type PrepareDefenseCardLocalDispatcherOutput = {
  flow_action: PrepareDefenseCardLocalFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  tool_fit: PrepareDefenseCardToolFit;
  current_stage: PrepareDefenseCardLocalStage;
  stage: PrepareDefenseCardLocalStage;
  route_kind: "free_card" | "plan_item_card" | null;
  slot_updates: Record<string, unknown>;
  platform_field_updates: Record<string, unknown>;
  tool_fit_state: PrepareDefenseCardToolFitState;
  attachment_state: PrepareDefenseCardAttachmentState;
  risk_state: PrepareDefenseCardRiskState;
  trigger_state: PrepareDefenseCardTriggerState;
  defense_goal_state: PrepareDefenseCardGoalState;
  defense_response_hint_state: PrepareDefenseCardResponseHintState;
  support_need_state: PrepareDefenseCardSupportNeedState;
  revision: {
    is_revision: boolean;
    revision_target:
      | "tool_fit"
      | "attachment"
      | "risk"
      | "trigger"
      | "defense_goal"
      | "defense_response_hint"
      | "support_need"
      | "unknown"
      | null;
    replacement_value: string | null;
    replaces_previous_value: boolean;
  };
  visible_task: {
    kind: PrepareDefenseCardVisibleTaskKind;
    conversation_context?:
      | Partial<PrepareDefenseCardConversationContext>
      | null;
  };
  subskill_call: {
    needed: boolean;
    skill_id: "product_help" | "status_recap" | null;
    reason: string | null;
    context_for_subskill: Record<string, unknown>;
  };
  handoff_state: Record<string, unknown> | null;
  exit_memo: {
    needed: boolean;
    reason:
      | "none"
      | "topic_change"
      | "cancelled"
      | "safety"
      | "handoff_to_attack_card"
      | "exit_to_global_dispatcher";
    flow_summary: string | null;
    handoff_hint_for_global_dispatcher: string | null;
    note_information?: NoteInformation | null;
  };
  note_information: NoteInformation | null;
  risk_assessment: PrepareDefenseCardRiskAssessment;
  evidence: string[];
};

export type PrepareDefenseCardLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: DefenseCardHandoffState | null;
  local_state: PrepareDefenseCardLocalState | null;
  route_decision: RouteDecision | null;
  turn_frame: TurnFrame | null;
  note_information_inbound?: Record<string, unknown> | null;
  db_context_pack?: Record<string, unknown> | null;
  micro_memory_context?: Record<string, unknown> | null;
  platform_context?: Record<string, unknown> | null;
  parent_flow_context?: Record<string, unknown> | null;
  risk_context?: Record<string, unknown> | null;
  available_inline_tools?: string[];
  plan_snapshot?: unknown;
  last_handoff?: DefenseCardHandoffDraft | null;
};

export type PrepareDefenseCardLocalDispatcher = (
  input: PrepareDefenseCardLocalDispatcherInput,
) => Promise<PrepareDefenseCardLocalDispatcherOutput | null>;

export type PrepareDefenseCardReducerResult = {
  status:
    | "collecting"
    | "clarifying"
    | "handoff_delivered"
    | "repeat_handoff"
    | "apply_attempt"
    | "cancelled"
    | "deferred"
    | "topic_change"
    | "blocked";
  reason_code: string;
  local_state: PrepareDefenseCardLocalState | null;
  draft: DefenseCardHandoffDraft | null;
  visible_task: PrepareDefenseCardVisibleTaskKind;
  visible_task_context: PrepareDefenseCardConversationContext;
  note_information: NoteInformation | null;
  exit_to_global_dispatcher: boolean;
  target_dispatcher: NoteInformationTargetDispatcher | null;
  safety_preempt: boolean;
  get_info_product: boolean;
  get_info_db: boolean;
  subskill_context: Record<string, unknown> | null;
  risk_assessment: PrepareDefenseCardRiskAssessment;
  blocked_effects: Array<{ type: string; reason_code: string }>;
  state_mutation_audit: PrepareDefenseCardStateMutationAudit;
};

function stringValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 8)
    : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

const SERVER_OWNED_FIELDS: PrepareDefenseCardServerOwnedField[] = [
  "route_kind",
  "platform_destination",
  "tool_fit_state",
  "attachment_state",
  "risk_state",
  "trigger_state",
  "defense_goal_state",
  "defense_response_hint_state",
  "support_need_state",
  "last_visible_task",
  "last_handoff_delivered",
  "subskill_history",
];

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function createStateMutationAudit(
  output: PrepareDefenseCardLocalDispatcherOutput,
): PrepareDefenseCardStateMutationAudit {
  const slotUpdateKeys = Object.keys(output.slot_updates ?? {});
  const platformUpdateKeys = Object.keys(output.platform_field_updates ?? {})
    .map((key) => key === "support_need" ? "support_need_state" : key);
  const declaredModified = uniqueStrings([
    ...slotUpdateKeys,
    ...platformUpdateKeys,
    output.revision.is_revision && output.revision.revision_target
      ? `${output.revision.revision_target}_state`
      : "",
  ]);
  const root = output as unknown as Record<string, unknown>;
  const declaredClear = uniqueStrings([
    ...stringArray(root.clear_fields),
    ...stringArray(root.clear_fields_declared),
    ...stringArray(objectValue(root.state_updates).clear_fields),
  ]);
  return {
    server_owned_fields: [...SERVER_OWNED_FIELDS],
    modified_fields_declared: declaredModified,
    clear_fields_declared: declaredClear,
    applied_fields: [],
    preserved_fields: [],
    restored_fields: [],
    cleared_fields: [],
    rejected_changes: [],
  };
}

function auditApplied(
  audit: PrepareDefenseCardStateMutationAudit,
  field: string,
) {
  audit.applied_fields = uniqueStrings([...audit.applied_fields, field]);
}

function auditPreserved(
  audit: PrepareDefenseCardStateMutationAudit,
  field: string,
) {
  audit.preserved_fields = uniqueStrings([...audit.preserved_fields, field]);
}

function auditRestored(
  audit: PrepareDefenseCardStateMutationAudit,
  field: string,
  reason_code: PrepareDefenseCardStateMutationAudit["rejected_changes"][number][
    "reason_code"
  ],
  attempted_action: PrepareDefenseCardLocalFlowAction,
) {
  audit.restored_fields = uniqueStrings([...audit.restored_fields, field]);
  audit.rejected_changes = [
    ...audit.rejected_changes,
    { field, reason_code, attempted_action },
  ];
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
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
    throw new Error("prepare_defense_card_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("prepare_defense_card_local_dispatcher_not_object");
  }
  return parsed as Record<string, unknown>;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = String(value ?? "").trim();
  return allowed.includes(raw as T) ? raw as T : fallback;
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return enumValue(value, ["low", "medium", "high"] as const, "medium");
}

function riskAssessment(value: unknown): PrepareDefenseCardRiskAssessment {
  const root = objectValue(value);
  const score = Number(root.risk_score ?? 0);
  const risk_band = enumValue(
    root.risk_band,
    ["none", "low", "medium", "high", "critical"] as const,
    "none",
  );
  return {
    risk_score: Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0,
    risk_band,
    safety_preempt: root.safety_preempt === true,
    reason_codes: stringArray(root.reason_codes),
  };
}

function flowAction(value: unknown): PrepareDefenseCardLocalFlowAction {
  const raw = String(value ?? "").trim();
  if (
    raw === "handoff_to_local_dispatcher" || raw === "handoff_to_local_flow"
  ) {
    return "exit_to_global_dispatcher";
  }
  return enumValue(
    raw,
    [
      "answer_current_field",
      "confirm_proposed_field",
      "clarify_attack_vs_defense",
      "confirm_attachment_candidate",
      "revise_current_field",
      "revise_attachment",
      "revise_risk",
      "revise_support_need",
      "get_info_product",
      "get_info_db",
      "handoff_ready",
      "repeat_handoff",
      "platform_destination_followup",
      "apply_attempt",
      "exit_to_global_dispatcher",
      "cancel_flow",
      "defer_flow",
      "exit_to_global_dispatcher",
      "safety_preempt",
    ] as const,
    "answer_current_field",
  );
}

function visibleTaskKind(value: unknown): PrepareDefenseCardVisibleTaskKind {
  return enumValue(
    value,
    [
      "clarify_attack_vs_defense",
      "redirect_attack_better",
      "ask_attachment",
      "confirm_attachment_candidate",
      "ask_risk_situation",
      "ask_trigger_or_signal",
      "ask_defense_goal_or_response",
      "ask_support_need",
      "confirm_support_need_proposal",
      "handoff_ready",
      "revision_done",
      "destination_short",
      "apply_attempt",
      "repeat_handoff",
      "inline_tool_return",
      "stop_or_cancel",
      "exit_ack",
      "exit_or_cancel",
      "safety",
      "safety_transition",
      "handoff_transition",
      "none",
    ] as const,
    "ask_support_need",
  );
}

function localStage(value: unknown): PrepareDefenseCardLocalStage {
  return enumValue(
    value,
    [
      "tool_fit",
      "attachment_intake",
      "risk_intake",
      "support_need_intake",
      "handoff_ready",
      "handoff_delivered",
      "exit",
    ] as const,
    "support_need_intake",
  );
}

function routeKind(value: unknown): "free_card" | "plan_item_card" | null {
  const raw = String(value ?? "").trim();
  return raw === "free_card" || raw === "plan_item_card" ? raw : null;
}

function normalizeTargetDispatcher(
  value: unknown,
  fallback: NoteInformationTargetDispatcher,
): NoteInformationTargetDispatcher {
  const raw = String(value ?? "").trim();
  return [
      "global",
      "safety_crisis",
      "clarification",
      "create_one_shot_reminder",
      "create_recurring_reminder",
      "prepare_attack_card",
      "prepare_defense_card",
      "adjust_plan_item",
      "select_state_potion",
      "track_progress_plan_item",
      "update_coach_preferences",
      "emotional_repair",
      "demotivation_repair",
      "product_help",
      "status_recap",
      "weekly_adaptive_review_v1",
      "verification_opportunities",
      "other_local",
    ].includes(raw)
    ? raw as NoteInformationTargetDispatcher
    : fallback;
}

function normalizeDispatcherNoteInformation(args: {
  raw: unknown;
  outputRoot: Record<string, unknown>;
  targetDispatcher: NoteInformationTargetDispatcher;
  fallbackStateSummary: string;
  fallbackContext: Record<string, unknown>;
  riskScore: number;
}): NoteInformation | null {
  const raw = objectValue(args.raw);
  const flowAction = String(args.outputRoot.flow_action ?? "");
  const needed = raw.needed === true ||
    flowAction === "exit_to_global_dispatcher" ||
    flowAction === "safety_preempt";
  if (!needed && Object.keys(raw).length === 0) return null;
  const collectedState = objectValue(raw.collected_state);
  const structuredContext = {
    ...args.fallbackContext,
    ...(Object.keys(collectedState).length
      ? { collected_state: collectedState }
      : {}),
    unresolved_questions: stringArray(raw.unresolved_questions),
    confidence: confidence(raw.confidence),
    evidence: stringArray(raw.evidence),
    recommended_next_focus: stringValue(raw.recommended_next_focus),
  };
  const target = flowAction === "exit_to_global_dispatcher"
    ? args.targetDispatcher
    : normalizeTargetDispatcher(raw.target_dispatcher, args.targetDispatcher);
  return createNoteInformation({
    source_flow_id: stringValue(raw.source_flow_id) ||
      stringValue(raw.source_flow) ||
      "prepare_defense_card",
    handoff_reason: target === "safety_crisis"
      ? "safety"
      : target === "global"
      ? "topic_change"
      : target === "product_help" || target === "status_recap"
      ? "inline_tool"
      : "bridge",
    target_dispatcher: target,
    handoff_context_for_next_dispatcher:
      stringValue(raw.handoff_context_for_next_dispatcher) ||
      stringValue(raw.user_message_summary) ||
      JSON.stringify(structuredContext),
    user_words: stringArray(raw.user_words),
    structured_context: structuredContext,
    confidence: confidence(raw.confidence),
  });
}

function toolFitState(raw: unknown): PrepareDefenseCardToolFitState {
  const root = objectValue(raw);
  return {
    status: enumValue(
      root.status,
      ["defense", "attack_better", "ambiguous", "not_applicable"] as const,
      "ambiguous",
    ),
    reason: stringValue(root.reason),
    needs_user_confirmation: root.needs_user_confirmation === true,
    why_status: stringValue(root.why_status),
  };
}

function attachmentState(raw: unknown): PrepareDefenseCardAttachmentState {
  const root = objectValue(raw);
  const status = enumValue(
    root.status,
    ["missing", "ambiguous", "proposed", "locked"] as const,
    "missing",
  );
  return {
    status,
    kind: enumValue(
      root.kind,
      [
        "plan_item",
        "personal_action",
        "free_risk_context",
        "recurring_context",
        "unknown",
      ] as const,
      "unknown",
    ),
    plan_item_id: stringValue(root.plan_item_id),
    candidate_value: stringValue(root.candidate_value),
    locked_value: stringValue(root.locked_value),
    candidate_options: Array.isArray(root.candidate_options)
      ? root.candidate_options.flatMap((item) => {
        const option = objectValue(item);
        const plan_item_id = stringValue(option.plan_item_id);
        const title = stringValue(option.title);
        if (!plan_item_id || !title) return [];
        return [{
          kind: "plan_item" as const,
          plan_item_id,
          title,
          reason: stringValue(option.reason),
        }];
      }).slice(0, 4)
      : [],
    needs_user_confirmation: root.needs_user_confirmation === true ||
      status === "proposed" || status === "ambiguous",
    why_status: stringValue(root.why_status),
  };
}

function riskState(raw: unknown): PrepareDefenseCardRiskState {
  const root = objectValue(raw);
  const status = enumValue(
    root.status,
    ["missing", "ambiguous", "proposed", "locked"] as const,
    "missing",
  );
  return {
    status,
    label: stringValue(root.label),
    description: stringValue(root.description),
    timing_hint: stringValue(root.timing_hint),
    context_hint: stringValue(root.context_hint),
    needs_user_confirmation: root.needs_user_confirmation === true ||
      status === "proposed" || status === "ambiguous",
    why_status: stringValue(root.why_status),
  };
}

function triggerState(raw: unknown): PrepareDefenseCardTriggerState {
  const root = objectValue(raw);
  const status = enumValue(
    root.status,
    ["missing", "ambiguous", "proposed", "locked"] as const,
    "missing",
  );
  return {
    status,
    type: enumValue(
      root.type,
      [
        "temptation",
        "impulse",
        "emotional_drop",
        "social_context",
        "fatigue",
        "stress",
        "habit_loop",
        "avoidance",
      ] as const,
      null as any,
    ),
    candidate_value: stringValue(root.candidate_value),
    locked_value: stringValue(root.locked_value),
    needs_user_confirmation: root.needs_user_confirmation === true ||
      status === "proposed" || status === "ambiguous",
    why_status: stringValue(root.why_status),
  };
}

function goalState(raw: unknown): PrepareDefenseCardGoalState {
  const root = objectValue(raw);
  const status = enumValue(
    root.status,
    ["missing", "proposed", "locked"] as const,
    "missing",
  );
  return {
    status,
    value: enumValue(
      root.value,
      [
        "avoid_relapse",
        "interrupt_impulse",
        "protect_action",
        "leave_context",
        "reduce_damage",
      ] as const,
      null as any,
    ),
    candidate_value: stringValue(root.candidate_value),
    locked_value: stringValue(root.locked_value),
    needs_user_confirmation: root.needs_user_confirmation === true ||
      status === "proposed",
    why_status: stringValue(root.why_status),
  };
}

function responseHintState(
  raw: unknown,
): PrepareDefenseCardResponseHintState {
  const root = objectValue(raw);
  const status = enumValue(
    root.status,
    ["missing", "ambiguous", "proposed", "locked"] as const,
    "missing",
  );
  return {
    status,
    strategy_hint: enumValue(
      root.strategy_hint,
      [
        "delay",
        "leave_context",
        "replace_action",
        "contact_support",
        "environment_block",
        "self_talk",
        "unknown",
      ] as const,
      null as any,
    ),
    candidate_value: stringValue(root.candidate_value),
    locked_value: stringValue(root.locked_value),
    needs_user_confirmation: root.needs_user_confirmation === true ||
      status === "proposed" || status === "ambiguous",
    why_status: stringValue(root.why_status),
  };
}

function supportNeedState(raw: unknown): PrepareDefenseCardSupportNeedState {
  const root = objectValue(raw);
  const status = enumValue(
    root.status,
    ["missing", "proposed", "locked"] as const,
    "missing",
  );
  const locked = stringValue(root.locked_value);
  const candidate = stringValue(root.candidate_value);
  return {
    field_id: "support_need",
    question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
    status: status === "locked" && locked
      ? "locked"
      : status === "proposed" && candidate
      ? "proposed"
      : "missing",
    candidate_value: candidate,
    locked_value: locked,
    previous_value: stringValue(root.previous_value),
    needs_user_confirmation: root.needs_user_confirmation === true ||
      status === "proposed",
    why_status: stringValue(root.why_status),
  };
}

export function createInitialPrepareDefenseCardLocalState(
  args: {
    activeState?: DefenseCardHandoffState | null;
    operationInput?: Record<string, unknown> | null;
  } = {},
): PrepareDefenseCardLocalState {
  const draft = args.activeState?.draft ?? null;
  const supportNeed = stringValue(
    draft?.platform_fields?.fields?.find((field) =>
      field.field_id === "support_need"
    )?.locked_value,
  );
  const target = stringValue(draft?.target_summary) ??
    stringValue((args.operationInput?.attachment as any)?.title) ??
    stringValue((args.operationInput?.target as any)?.title) ??
    stringValue(args.operationInput?.target_hint);
  const risk = stringValue(draft?.risk_summary) ??
    stringValue((args.operationInput?.risk_situation as any)?.label) ??
    stringValue(args.operationInput?.risk_behavior);
  const route = routeKind(draft?.platform_flow.route_kind) ??
    ((args.operationInput?.target as any)?.kind === "plan_item" ||
        (args.operationInput?.attachment as any)?.kind === "plan_item"
      ? "plan_item_card"
      : "free_card");
  return {
    flow_id: "prepare_defense_card",
    route_kind: route,
    platform_destination: defenseCardPlatformDestinationForRoute(route),
    tool_fit_state: {
      status: "ambiguous",
      reason: null,
      needs_user_confirmation: true,
      why_status: "Tool fit à confirmer par le dispatcher local.",
    },
    attachment_state: target
      ? {
        status: "proposed",
        kind: route === "plan_item_card" ? "plan_item" : "free_risk_context",
        plan_item_id:
          stringValue((args.operationInput?.target as any)?.plan_item_id) ??
            stringValue((args.operationInput?.attachment as any)?.plan_item_id),
        candidate_value: target,
        locked_value: null,
        candidate_options: [],
        needs_user_confirmation: true,
        why_status: "Attache proposée depuis le contexte structuré.",
      }
      : {
        status: "missing",
        kind: null,
        plan_item_id: null,
        candidate_value: null,
        locked_value: null,
        candidate_options: [],
        needs_user_confirmation: false,
        why_status: "Attache manquante.",
      },
    risk_state: risk
      ? {
        status: "proposed",
        label: risk,
        description: risk,
        timing_hint: null,
        context_hint: target,
        needs_user_confirmation: true,
        why_status: "Risque proposé depuis le contexte structuré.",
      }
      : {
        status: "missing",
        label: null,
        description: null,
        timing_hint: null,
        context_hint: null,
        needs_user_confirmation: false,
        why_status: "Risque manquant.",
      },
    trigger_state: {
      status: "missing",
      type: null,
      candidate_value: null,
      locked_value: null,
      needs_user_confirmation: false,
      why_status: "Signal non fourni.",
    },
    defense_goal_state: {
      status: "missing",
      value: null,
      candidate_value: null,
      locked_value: null,
      needs_user_confirmation: false,
      why_status: "Objectif de défense non fourni.",
    },
    defense_response_hint_state: {
      status: "missing",
      strategy_hint: null,
      candidate_value: null,
      locked_value: null,
      needs_user_confirmation: false,
      why_status: "Réponse défensive non fournie.",
    },
    support_need_state: supportNeed
      ? {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "locked",
        candidate_value: null,
        locked_value: supportNeed,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "Valeur reprise du dernier handoff.",
      }
      : {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "missing",
        candidate_value: null,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "Champ support_need manquant.",
      },
    last_visible_task: null,
    last_handoff_delivered: Boolean(draft),
    subskill_history: Array.isArray(
        (args.activeState as any)?.local_state
          ?.subskill_history,
      )
      ? (args.activeState as any).local_state.subskill_history.slice(
        -RECENT_MESSAGE_LIMITS.subskillHistory,
      )
      : [],
  };
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function normalizePrepareDefenseCardLocalState(
  raw: unknown,
  fallback: PrepareDefenseCardLocalState =
    createInitialPrepareDefenseCardLocalState(),
): PrepareDefenseCardLocalState {
  const root = objectValue(raw);
  if (!Object.keys(root).length) return fallback;
  const route = routeKind(root.route_kind) ?? fallback.route_kind ??
    "free_card";
  const subskillHistory = Array.isArray(root.subskill_history)
    ? root.subskill_history.filter((item) =>
      item && typeof item === "object" && !Array.isArray(item)
    ).map((item) => item as Record<string, unknown>).slice(
      -RECENT_MESSAGE_LIMITS.subskillHistory,
    )
    : fallback.subskill_history;
  return {
    flow_id: "prepare_defense_card",
    route_kind: route,
    platform_destination: stringValue(root.platform_destination) ??
      defenseCardPlatformDestinationForRoute(route),
    tool_fit_state: hasOwn(root, "tool_fit_state")
      ? { ...fallback.tool_fit_state, ...toolFitState(root.tool_fit_state) }
      : fallback.tool_fit_state,
    attachment_state: hasOwn(root, "attachment_state")
      ? mergeStatusSlot(
        fallback.attachment_state,
        attachmentState(root.attachment_state),
      )
      : fallback.attachment_state,
    risk_state: hasOwn(root, "risk_state")
      ? mergeStatusSlot(fallback.risk_state, riskState(root.risk_state))
      : fallback.risk_state,
    trigger_state: hasOwn(root, "trigger_state")
      ? mergeStatusSlot(
        fallback.trigger_state,
        triggerState(root.trigger_state),
      )
      : fallback.trigger_state,
    defense_goal_state: hasOwn(root, "defense_goal_state")
      ? mergeStatusSlot(
        fallback.defense_goal_state,
        goalState(root.defense_goal_state),
      )
      : fallback.defense_goal_state,
    defense_response_hint_state: hasOwn(root, "defense_response_hint_state")
      ? mergeStatusSlot(
        fallback.defense_response_hint_state,
        responseHintState(root.defense_response_hint_state),
      )
      : fallback.defense_response_hint_state,
    support_need_state: hasOwn(root, "support_need_state")
      ? mergeSupportNeed(
        fallback.support_need_state,
        supportNeedState(root.support_need_state),
      )
      : fallback.support_need_state,
    last_visible_task: stringValue(root.last_visible_task)
      ? visibleTaskKind(root.last_visible_task)
      : fallback.last_visible_task,
    last_handoff_delivered: typeof root.last_handoff_delivered === "boolean"
      ? root.last_handoff_delivered
      : fallback.last_handoff_delivered,
    subskill_history: subskillHistory,
  };
}

export function normalizePrepareDefenseCardLocalDispatcherOutput(
  raw: unknown,
): PrepareDefenseCardLocalDispatcherOutput {
  const root = parseJsonObject(raw);
  const action = flowAction(root.flow_action);
  const risk = riskAssessment(root.risk_assessment);
  const support = supportNeedState(
    root.support_need_state ??
      objectValue(root.platform_field_updates).support_need,
  );
  const toolFit = toolFitState(
    root.tool_fit_state ?? objectValue(root.slot_updates).tool_fit,
  );
  const attachment = attachmentState(
    root.attachment_state ?? objectValue(root.slot_updates).attachment,
  );
  const riskSlot = riskState(
    root.risk_state ?? objectValue(root.slot_updates).risk_situation,
  );
  const trigger = triggerState(
    root.trigger_state ?? objectValue(root.slot_updates).trigger,
  );
  const goal = goalState(
    root.defense_goal_state ?? objectValue(root.slot_updates).defense_goal,
  );
  const responseHint = responseHintState(
    root.defense_response_hint_state ??
      objectValue(root.slot_updates).defense_response_hint,
  );
  const rootVisibleTask = objectValue(root.visible_task);
  const task = visibleTaskKind(rootVisibleTask.kind);
  const route = routeKind(root.route_kind);
  const fallbackStateSummary = [
    `tool_fit=${toolFit.status}`,
    `attachment=${
      attachment.locked_value ?? attachment.candidate_value ?? "missing"
    }`,
    `risk=${riskSlot.label ?? riskSlot.description ?? "missing"}`,
    `support_need=${
      support.locked_value ?? support.candidate_value ?? "missing"
    }`,
  ].join("; ");
  const fallbackNoteContext = {
    source_flow: "prepare_defense_card",
    flow_action: action,
    current_stage: localStage(root.current_stage ?? root.stage),
    tool_fit: toolFit.status,
    collected_state: {
      attachment_state: attachment,
      risk_state: riskSlot,
      trigger_state: trigger,
      defense_goal_state: goal,
      defense_response_hint_state: responseHint,
      support_need_state: support,
    },
    visible_task_kind: task,
  };
  const targetDispatcher = action === "safety_preempt"
    ? "safety_crisis"
    : "global";
  const noteInformation = normalizeDispatcherNoteInformation({
    raw: root.note_information,
    outputRoot: root,
    targetDispatcher,
    fallbackStateSummary,
    fallbackContext: fallbackNoteContext,
    riskScore: risk.risk_score,
  });
  return {
    flow_action: action,
    confidence: confidence(root.confidence),
    risk_score: Number.isFinite(Number(root.risk_score))
      ? Math.max(0, Math.min(10, Number(root.risk_score)))
      : risk.risk_score,
    tool_fit: enumValue(
      root.tool_fit,
      ["defense", "attack_better", "ambiguous", "not_applicable"] as const,
      toolFit.status,
    ),
    current_stage: localStage(root.current_stage ?? root.stage),
    stage: localStage(root.stage ?? root.current_stage),
    route_kind: route,
    slot_updates: objectValue(root.slot_updates),
    platform_field_updates: objectValue(root.platform_field_updates),
    tool_fit_state: toolFit,
    attachment_state: attachment,
    risk_state: riskSlot,
    trigger_state: trigger,
    defense_goal_state: goal,
    defense_response_hint_state: responseHint,
    support_need_state: support,
    revision: {
      is_revision: (root.revision as any)?.is_revision === true,
      revision_target: enumValue(
        (root.revision as any)?.revision_target,
        [
          "tool_fit",
          "attachment",
          "risk",
          "trigger",
          "defense_goal",
          "defense_response_hint",
          "support_need",
          "unknown",
        ] as const,
        null as any,
      ),
      replacement_value: stringValue((root.revision as any)?.replacement_value),
      replaces_previous_value:
        (root.revision as any)?.replaces_previous_value === true,
    },
    visible_task: {
      kind: task,
      conversation_context: objectValue(rootVisibleTask.conversation_context),
    },
    subskill_call: {
      needed: (root.subskill_call as any)?.needed === true,
      skill_id: ["product_help", "status_recap"].includes(
          String((root.subskill_call as any)?.skill_id ?? ""),
        )
        ? (root.subskill_call as any).skill_id
        : null,
      reason: stringValue((root.subskill_call as any)?.reason),
      context_for_subskill: objectValue(
        (root.subskill_call as any)?.context_for_subskill,
      ),
    },
    handoff_state: objectValue(root.handoff_state),
    exit_memo: {
      needed: (root.exit_memo as any)?.needed === true,
      reason: enumValue(
        (root.exit_memo as any)?.reason,
        [
          "none",
          "topic_change",
          "cancelled",
          "safety",
          "handoff_to_attack_card",
          "exit_to_global_dispatcher",
        ] as const,
        "none",
      ),
      flow_summary: stringValue((root.exit_memo as any)?.flow_summary),
      handoff_hint_for_global_dispatcher: stringValue(
        (root.exit_memo as any)?.handoff_hint_for_global_dispatcher,
      ),
      note_information: noteInformation,
    },
    note_information: noteInformation,
    risk_assessment: action === "safety_preempt" && risk.safety_preempt !== true
      ? {
        risk_score: Math.max(risk.risk_score, 8),
        risk_band: risk.risk_band === "none" ? "high" : risk.risk_band,
        safety_preempt: true,
        reason_codes: risk.reason_codes.length
          ? risk.reason_codes
          : ["prepare_defense_card_local_safety_preempt"],
      }
      : risk,
    evidence: stringArray(root.evidence),
  };
}

function mergeStatusSlot<T extends { status: string }>(
  previous: T,
  incoming: T,
): T {
  if (incoming.status === "missing" && previous.status !== "missing") {
    return previous;
  }
  return { ...previous, ...incoming };
}

function mergeSupportNeed(
  previous: PrepareDefenseCardSupportNeedState,
  incoming: PrepareDefenseCardSupportNeedState,
): PrepareDefenseCardSupportNeedState {
  if (incoming.status === "missing" && previous.status !== "missing") {
    return previous;
  }
  if (incoming.status === "locked" && incoming.locked_value) {
    return {
      ...previous,
      ...incoming,
      previous_value: incoming.previous_value ?? previous.locked_value ??
        previous.candidate_value,
      candidate_value: null,
      needs_user_confirmation: false,
    };
  }
  if (incoming.status === "proposed" && incoming.candidate_value) {
    return {
      ...previous,
      ...incoming,
      previous_value: incoming.previous_value ?? previous.locked_value ??
        previous.candidate_value,
      locked_value: previous.locked_value,
      needs_user_confirmation: true,
    };
  }
  return previous;
}

function supportNeedReady(state: PrepareDefenseCardLocalState): boolean {
  return state.tool_fit_state.status === "defense" &&
    state.support_need_state.status === "locked" &&
    Boolean(state.support_need_state.locked_value);
}

function preparedDefenseFieldsFromState(
  state: PrepareDefenseCardLocalState,
): NonNullable<DefenseCardHandoffDraft["prepared_fields"]> {
  const riskContext = state.risk_state.description ?? state.risk_state.label ??
    state.risk_state.timing_hint ?? state.risk_state.context_hint ??
    state.support_need_state.locked_value;
  const defenseAction = state.defense_response_hint_state.locked_value ??
    state.defense_response_hint_state.candidate_value ??
    state.defense_goal_state.locked_value ??
    state.defense_goal_state.candidate_value;
  return {
    risk_context: riskContext,
    defense_action: defenseAction,
    ritual_phrase: null,
  };
}

function draftFromState(
  state: PrepareDefenseCardLocalState,
): DefenseCardHandoffDraft | null {
  const supportNeed = state.support_need_state.locked_value;
  if (!supportNeedReady(state) || !supportNeed) return null;
  const attachment = state.attachment_state.locked_value ??
    state.attachment_state.candidate_value ?? supportNeed;
  const risk = state.risk_state.label ?? state.risk_state.description ??
    supportNeed;
  const route = state.route_kind ?? "free_card";
  const preparedFields = preparedDefenseFieldsFromState(state);
  const cardDraftSummary = [
    preparedFields.risk_context
      ? `Contexte de risque: ${preparedFields.risk_context}`
      : null,
    preparedFields.defense_action
      ? `Réponse prévue: ${preparedFields.defense_action}`
      : null,
    preparedFields.ritual_phrase
      ? `Phrase rituelle: ${preparedFields.ritual_phrase}`
      : null,
  ].filter(Boolean).join(" | ");
  return {
    operation_type: "prepare_defense_card",
    mode: "platform_handoff",
    executable_from_chat: false,
    target_summary: attachment,
    risk_summary: risk,
    prepared_fields: preparedFields,
    platform_flow: {
      route_kind: route,
      route_label: route === "plan_item_card"
        ? "Carte de défense liée à une mission ou habitude du plan"
        : "Carte de défense libre",
      questionnaire_answers: [{
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        value: supportNeed,
        status: "locked",
      }],
    },
    platform_fields: {
      route_kind: route,
      status: "complete",
      missing_field_ids: [],
      fields: [{
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        required: true,
        status: "locked",
        proposed_value: null,
        locked_value: supportNeed,
        user_evidence: [supportNeed],
        needs_user_confirmation: false,
        evidence: ["prepare_defense_card_local_reducer"],
      }],
    },
    recommendation: {
      platform_destination: defenseCardPlatformDestinationForRoute(route),
      platform_steps: defenseCardPlatformStepsForRoute(route),
      card_draft_summary: cardDraftSummary || undefined,
    },
    missing_decisions: [],
  };
}

function missingOrWeakValues(
  state: PrepareDefenseCardLocalState,
): string[] {
  const missing: string[] = [];
  if (state.tool_fit_state.status !== "defense") missing.push("tool_fit");
  if (state.attachment_state.status !== "locked") missing.push("attachment");
  if (state.risk_state.status !== "locked") missing.push("risk_situation");
  if (state.trigger_state.status !== "locked") missing.push("trigger");
  if (state.defense_goal_state.status !== "locked") {
    missing.push("defense_goal");
  }
  if (state.support_need_state.status !== "locked") {
    missing.push("support_need");
  }
  return missing;
}

function buildPrepareDefenseCardConversationContext(args: {
  state: PrepareDefenseCardLocalState;
  draft: DefenseCardHandoffDraft | null;
  output: PrepareDefenseCardLocalDispatcherOutput;
  visibleTask: PrepareDefenseCardVisibleTaskKind;
  suppressPlatformRestitution?: boolean;
}): PrepareDefenseCardConversationContext {
  const state = args.state;
  const suppressPlatformRestitution = args.suppressPlatformRestitution === true;
  const supportNeed = suppressPlatformRestitution
    ? null
    : state.support_need_state.locked_value ??
      state.support_need_state.candidate_value;
  const attachment = state.attachment_state.locked_value ??
    state.attachment_state.candidate_value;
  const risk = state.risk_state.label ?? state.risk_state.description;
  const preparedFields = args.draft?.prepared_fields ??
    preparedDefenseFieldsFromState(state);
  const dispatcherContext = objectValue(
    args.output.visible_task.conversation_context,
  );
  const contextSummary = stringValue(dispatcherContext.context_summary);
  const supportNeedForVisible: PrepareDefenseCardSupportNeedState =
    suppressPlatformRestitution
      ? {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "missing",
        candidate_value: null,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: false,
        why_status:
          "Masqué au premier tour: aucune restitution plateforme avant une passe d'enrichissement.",
      }
      : state.support_need_state;
  const toneConstraints = stringArray(dispatcherContext.tone_constraints)
      .length
    ? stringArray(dispatcherContext.tone_constraints)
    : [
      "une seule question quand le stage collecte une information",
      "formulation naturelle, non formulaire",
      "message court pour destination_short et apply_attempt",
    ];
  const doNotSay = stringArray(dispatcherContext.do_not_say).length
    ? stringArray(dispatcherContext.do_not_say)
    : [
      "ne dis jamais que la carte est créée, ajoutée, activée ou enregistrée",
      "ne promets aucun effet durable depuis le chat",
      "n'expose jamais entry_need, risk_moment, first_signal, defense_response ou fallback_plan comme champs plateforme",
    ];
  return {
    state_summary: stringValue(dispatcherContext.state_summary) ??
      [
        `stage=${args.output.current_stage}`,
        `visible_task=${args.visibleTask}`,
        `tool_fit=${state.tool_fit_state.status}`,
        `support_need=${state.support_need_state.status}`,
      ].join("; "),
    user_words: stringArray(dispatcherContext.user_words).length
      ? stringArray(dispatcherContext.user_words)
      : args.output.evidence,
    field_or_stage: stringValue(dispatcherContext.field_or_stage) ??
      args.output.current_stage,
    known_values: {
      tool_fit: state.tool_fit_state,
      attachment: state.attachment_state,
      risk: state.risk_state,
      trigger: state.trigger_state,
      defense_goal: state.defense_goal_state,
      defense_response_hint: state.defense_response_hint_state,
      support_need: supportNeedForVisible,
    },
    missing_or_weak_values:
      stringArray(dispatcherContext.missing_or_weak_values)
          .length
        ? stringArray(dispatcherContext.missing_or_weak_values)
        : missingOrWeakValues(state),
    selected_candidate: objectValue(dispatcherContext.selected_candidate),
    handoff_data: {
      operation_name: "prepare_defense_card",
      surface_label: "Cartes de défense",
      platform_destination: suppressPlatformRestitution
        ? ""
        : defenseCardPlatformDestinationForRoute(state.route_kind),
      platform_steps: suppressPlatformRestitution
        ? []
        : defenseCardPlatformStepsForRoute(state.route_kind),
      route_kind: state.route_kind,
      support_need_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
      support_need_value: supportNeed,
      risk_context: suppressPlatformRestitution
        ? null
        : preparedFields.risk_context,
      defense_action: suppressPlatformRestitution
        ? null
        : preparedFields.defense_action,
      ritual_phrase: suppressPlatformRestitution
        ? null
        : preparedFields.ritual_phrase,
      attachment_value: attachment,
      risk_value: risk,
    },
    previous_values: {
      support_need: suppressPlatformRestitution
        ? null
        : state.support_need_state.previous_value,
    },
    revision: args.output.revision,
    tone_constraints: suppressPlatformRestitution
      ? [
        ...toneConstraints,
        "premier tour: aucune restitution; poser seulement une question d'enrichissement",
      ]
      : toneConstraints,
    do_not_say: suppressPlatformRestitution
      ? [
        ...doNotSay,
        DEFENSE_CARD_SUPPORT_NEED_LABEL,
        defenseCardPlatformDestinationForRoute(state.route_kind),
        "champ",
        "formulation",
        "recopier",
        "Cartes de défense",
        "carte de défense libre",
        "Ajouter une carte",
      ]
      : doNotSay,
    context_summary: contextSummary,
    evidence_used: stringArray(dispatcherContext.evidence_used).length
      ? stringArray(dispatcherContext.evidence_used)
      : args.output.evidence,
  };
}

function fallbackNoteInformationForTransition(args: {
  output: PrepareDefenseCardLocalDispatcherOutput;
  state: PrepareDefenseCardLocalState;
  targetDispatcher: NoteInformationTargetDispatcher;
}): NoteInformation | null {
  if (
    args.output.flow_action !== "exit_to_global_dispatcher" &&
    args.output.flow_action !== "safety_preempt"
  ) return null;
  const collectedState = {
    tool_fit_state: args.state.tool_fit_state,
    attachment_state: args.state.attachment_state,
    risk_state: args.state.risk_state,
    trigger_state: args.state.trigger_state,
    defense_goal_state: args.state.defense_goal_state,
    defense_response_hint_state: args.state.defense_response_hint_state,
    support_need_state: args.state.support_need_state,
  };
  const summary = args.output.exit_memo.flow_summary ||
    [
      `tool_fit=${args.state.tool_fit_state.status}`,
      `support_need=${args.state.support_need_state.status}`,
      `stage=${args.output.current_stage}`,
    ].join("; ");
  return createNoteInformation({
    source_flow_id: "prepare_defense_card",
    handoff_reason: args.targetDispatcher === "safety_crisis"
      ? "safety"
      : args.targetDispatcher === "global"
      ? "topic_change"
      : "bridge",
    target_dispatcher: args.targetDispatcher,
    handoff_context_for_next_dispatcher:
      args.output.exit_memo.handoff_hint_for_global_dispatcher ||
      JSON.stringify({
        source_flow: "prepare_defense_card",
        target_dispatcher: args.targetDispatcher,
        active_flow_summary: summary,
        flow_action: args.output.flow_action,
        collected_state: collectedState,
        evidence: args.output.evidence,
      }),
    user_words: args.output.evidence,
    structured_context: {
      source_flow: "prepare_defense_card",
      target_dispatcher: args.targetDispatcher,
      active_flow_summary: summary,
      handoff_reason: args.targetDispatcher === "safety_crisis"
        ? "safety"
        : args.targetDispatcher === "global"
        ? "topic_change"
        : "bridge",
      collected_state: collectedState,
      unresolved_questions: missingOrWeakValues(args.state),
      confidence: args.output.confidence,
      evidence: args.output.evidence,
      recommended_next_focus:
        args.output.exit_memo.handoff_hint_for_global_dispatcher,
    },
    confidence: args.output.confidence,
  });
}

function withVisibleTask(
  state: PrepareDefenseCardLocalState,
  visibleTask: PrepareDefenseCardVisibleTaskKind,
): PrepareDefenseCardLocalState {
  return {
    ...state,
    last_visible_task: visibleTask,
    last_handoff_delivered: state.last_handoff_delivered ||
      [
        "handoff_ready",
        "revision_done",
        "destination_short",
        "apply_attempt",
        "repeat_handoff",
      ].includes(visibleTask),
  };
}

function isFirstDefenseCollectionTurn(
  previous: PrepareDefenseCardLocalState,
): boolean {
  return previous.last_visible_task === null &&
    previous.last_handoff_delivered !== true &&
    previous.support_need_state.status === "missing";
}

function firstTurnEnrichmentTask(
  state: PrepareDefenseCardLocalState,
): PrepareDefenseCardVisibleTaskKind {
  if (state.trigger_state.status === "missing") return "ask_trigger_or_signal";
  return "ask_defense_goal_or_response";
}

function shouldForceFirstTurnEnrichment(args: {
  previous: PrepareDefenseCardLocalState;
  output: PrepareDefenseCardLocalDispatcherOutput;
  reduced: PrepareDefenseCardLocalState;
}): boolean {
  if (!isFirstDefenseCollectionTurn(args.previous)) return false;
  if (
    args.output.flow_action === "exit_to_global_dispatcher" ||
    args.output.flow_action === "safety_preempt" ||
    args.output.flow_action === "cancel_flow" ||
    args.output.flow_action === "defer_flow" ||
    args.output.flow_action === "get_info_product" ||
    args.output.flow_action === "get_info_db"
  ) {
    return false;
  }
  return args.reduced.tool_fit_state.status === "defense" &&
    (args.reduced.support_need_state.status === "proposed" ||
      args.reduced.support_need_state.status === "locked" ||
      args.output.visible_task.kind === "confirm_support_need_proposal" ||
      args.output.visible_task.kind === "handoff_ready");
}

function actionAllowsSlotMutation(
  action: PrepareDefenseCardLocalFlowAction,
  field: PrepareDefenseCardServerOwnedField,
): boolean {
  if (
    action === "get_info_product" ||
    action === "get_info_db" ||
    action === "apply_attempt" ||
    action === "repeat_handoff" ||
    action === "platform_destination_followup"
  ) return false;
  if (
    action === "exit_to_global_dispatcher" ||
    action === "cancel_flow" ||
    action === "defer_flow" ||
    action === "safety_preempt"
  ) return false;
  if (field === "route_kind" || field === "platform_destination") {
    return action === "answer_current_field" ||
      action === "confirm_attachment_candidate" ||
      action === "revise_attachment" ||
      action === "revise_current_field" ||
      action === "handoff_ready";
  }
  if (field === "tool_fit_state") {
    return action === "answer_current_field" ||
      action === "clarify_attack_vs_defense" ||
      action === "confirm_proposed_field" ||
      action === "handoff_ready";
  }
  if (field === "attachment_state") {
    return action === "answer_current_field" ||
      action === "confirm_attachment_candidate" ||
      action === "revise_attachment" ||
      action === "revise_current_field" ||
      action === "handoff_ready";
  }
  if (field === "risk_state") {
    return action === "answer_current_field" ||
      action === "revise_risk" ||
      action === "revise_current_field" ||
      action === "handoff_ready";
  }
  if (
    field === "trigger_state" ||
    field === "defense_goal_state" ||
    field === "defense_response_hint_state"
  ) {
    return action === "answer_current_field" ||
      action === "confirm_proposed_field" ||
      action === "revise_current_field" ||
      action === "handoff_ready";
  }
  if (field === "support_need_state") {
    return action === "answer_current_field" ||
      action === "confirm_proposed_field" ||
      action === "revise_support_need" ||
      action === "revise_current_field" ||
      action === "handoff_ready";
  }
  return false;
}

function slotHasUsableValue(slot: { status: string }): boolean {
  const raw = slot as Record<string, unknown>;
  if (slot.status === "missing" || slot.status === "ambiguous") return false;
  return Boolean(
    stringValue(raw.locked_value) ||
      stringValue(raw.candidate_value) ||
      stringValue(raw.label) ||
      stringValue(raw.description) ||
      stringValue(raw.value) ||
      stringValue(raw.timing_hint) ||
      stringValue(raw.context_hint) ||
      stringValue(raw.reason),
  );
}

function mergeServerOwnedStatusSlot<T extends { status: string }>(args: {
  previous: T;
  incoming: T;
  field: PrepareDefenseCardServerOwnedField;
  action: PrepareDefenseCardLocalFlowAction;
  audit: PrepareDefenseCardStateMutationAudit;
  allowLockedDowngrade?: boolean;
}): T {
  if (!slotHasUsableValue(args.incoming)) {
    if (
      args.previous.status !== "missing" && args.incoming.status === "missing"
    ) {
      auditPreserved(args.audit, args.field);
    }
    return args.previous;
  }
  if (!actionAllowsSlotMutation(args.action, args.field)) {
    if (!sameJson(args.previous, args.incoming)) {
      auditRestored(
        args.audit,
        args.field,
        "blocked_by_constraint",
        args.action,
      );
    }
    return args.previous;
  }
  if (
    args.previous.status === "locked" &&
    args.incoming.status !== "locked" &&
    args.allowLockedDowngrade !== true
  ) {
    auditRestored(
      args.audit,
      args.field,
      "invalid_status_transition",
      args.action,
    );
    return args.previous;
  }
  const next = mergeStatusSlot(args.previous, args.incoming);
  if (!sameJson(args.previous, next)) auditApplied(args.audit, args.field);
  else auditPreserved(args.audit, args.field);
  return next;
}

function mergeServerOwnedSupportNeed(args: {
  previous: PrepareDefenseCardSupportNeedState;
  incoming: PrepareDefenseCardSupportNeedState;
  action: PrepareDefenseCardLocalFlowAction;
  audit: PrepareDefenseCardStateMutationAudit;
}): PrepareDefenseCardSupportNeedState {
  const previous = args.previous;
  const incoming = args.incoming;
  if (
    args.action === "confirm_proposed_field" &&
    previous.status === "proposed" &&
    Boolean(previous.candidate_value) &&
    incoming.status !== "locked"
  ) {
    auditApplied(args.audit, "support_need_state");
    return {
      ...previous,
      status: "locked",
      candidate_value: null,
      locked_value: previous.candidate_value,
      previous_value: previous.locked_value ?? previous.previous_value,
      needs_user_confirmation: false,
      why_status: previous.why_status ??
        "Verrouillé par confirmation de la candidate précédente.",
    };
  }
  if (
    args.action === "confirm_proposed_field" &&
    previous.status !== "proposed" &&
    !incoming.locked_value &&
    !incoming.candidate_value
  ) {
    auditRestored(
      args.audit,
      "support_need_state",
      "missing_previous_offer",
      args.action,
    );
    return previous;
  }
  if (incoming.status === "missing") {
    if (previous.status !== "missing") {
      auditPreserved(args.audit, "support_need_state");
    }
    return previous;
  }
  if (!actionAllowsSlotMutation(args.action, "support_need_state")) {
    if (!sameJson(previous, incoming)) {
      auditRestored(
        args.audit,
        "support_need_state",
        "blocked_by_constraint",
        args.action,
      );
    }
    return previous;
  }
  if (incoming.status === "locked" && !incoming.locked_value) {
    auditRestored(
      args.audit,
      "support_need_state",
      "durable_need_missing",
      args.action,
    );
    return previous;
  }
  if (incoming.status === "proposed" && !incoming.candidate_value) {
    auditRestored(
      args.audit,
      "support_need_state",
      "candidate_missing",
      args.action,
    );
    return previous;
  }
  if (previous.status === "locked" && incoming.status !== "locked") {
    auditRestored(
      args.audit,
      "support_need_state",
      "invalid_status_transition",
      args.action,
    );
    return previous;
  }
  const next = mergeSupportNeed(previous, incoming);
  if (!sameJson(previous, next)) auditApplied(args.audit, "support_need_state");
  else auditPreserved(args.audit, "support_need_state");
  return next;
}

export function mergePrepareDefenseCardLocalState(args: {
  previous: PrepareDefenseCardLocalState;
  output: PrepareDefenseCardLocalDispatcherOutput;
  transition?: PrepareDefenseCardLocalFlowAction;
  now?: string;
  constraints?: Record<string, unknown>;
}): {
  state: PrepareDefenseCardLocalState;
  audit: PrepareDefenseCardStateMutationAudit;
} {
  void args.now;
  void args.constraints;
  const action = args.transition ?? args.output.flow_action;
  const audit = createStateMutationAudit(args.output);
  const previous = normalizePrepareDefenseCardLocalState(
    args.previous,
    createInitialPrepareDefenseCardLocalState(),
  );
  let route = previous.route_kind ?? "free_card";
  if (args.output.route_kind && args.output.route_kind !== route) {
    if (
      actionAllowsSlotMutation(action, "route_kind") &&
      previous.last_handoff_delivered !== true
    ) {
      route = args.output.route_kind;
      auditApplied(audit, "route_kind");
      auditApplied(audit, "platform_destination");
    } else {
      auditRestored(audit, "route_kind", "invalid_status_transition", action);
      auditRestored(
        audit,
        "platform_destination",
        "invalid_status_transition",
        action,
      );
    }
  } else {
    auditPreserved(audit, "route_kind");
    auditPreserved(audit, "platform_destination");
  }
  const toolFit = args.output.tool_fit_state.status === "ambiguous" &&
      previous.tool_fit_state.status !== "ambiguous"
    ? previous.tool_fit_state
    : {
      ...previous.tool_fit_state,
      ...args.output.tool_fit_state,
    };
  if (!sameJson(previous.tool_fit_state, toolFit)) {
    if (actionAllowsSlotMutation(action, "tool_fit_state")) {
      auditApplied(audit, "tool_fit_state");
    } else {
      auditRestored(audit, "tool_fit_state", "blocked_by_constraint", action);
    }
  } else {
    auditPreserved(audit, "tool_fit_state");
  }
  const safeToolFit = actionAllowsSlotMutation(action, "tool_fit_state")
    ? toolFit
    : previous.tool_fit_state;
  return {
    state: {
      ...previous,
      route_kind: route,
      platform_destination: defenseCardPlatformDestinationForRoute(route),
      tool_fit_state: safeToolFit,
      attachment_state: mergeServerOwnedStatusSlot({
        previous: previous.attachment_state,
        incoming: args.output.attachment_state,
        field: "attachment_state",
        action,
        audit,
        allowLockedDowngrade: action === "revise_attachment" ||
          action === "revise_current_field",
      }),
      risk_state: mergeServerOwnedStatusSlot({
        previous: previous.risk_state,
        incoming: args.output.risk_state,
        field: "risk_state",
        action,
        audit,
        allowLockedDowngrade: action === "revise_risk" ||
          action === "revise_current_field",
      }),
      trigger_state: mergeServerOwnedStatusSlot({
        previous: previous.trigger_state,
        incoming: args.output.trigger_state,
        field: "trigger_state",
        action,
        audit,
        allowLockedDowngrade: action === "revise_current_field",
      }),
      defense_goal_state: mergeServerOwnedStatusSlot({
        previous: previous.defense_goal_state,
        incoming: args.output.defense_goal_state,
        field: "defense_goal_state",
        action,
        audit,
        allowLockedDowngrade: action === "revise_current_field",
      }),
      defense_response_hint_state: mergeServerOwnedStatusSlot({
        previous: previous.defense_response_hint_state,
        incoming: args.output.defense_response_hint_state,
        field: "defense_response_hint_state",
        action,
        audit,
        allowLockedDowngrade: action === "revise_current_field",
      }),
      support_need_state: mergeServerOwnedSupportNeed({
        previous: previous.support_need_state,
        incoming: args.output.support_need_state,
        action,
        audit,
      }),
      last_visible_task: previous.last_visible_task,
      last_handoff_delivered: previous.last_handoff_delivered,
      subskill_history: previous.subskill_history,
    },
    audit,
  };
}

export function reducePrepareDefenseCardLocalDispatcherOutput(args: {
  previous: PrepareDefenseCardLocalState | null;
  output: PrepareDefenseCardLocalDispatcherOutput;
}): PrepareDefenseCardReducerResult {
  const previous = normalizePrepareDefenseCardLocalState(
    args.previous,
    createInitialPrepareDefenseCardLocalState(),
  );
  const rawFlowAction = String((args.output as any)?.flow_action ?? "");
  const output: PrepareDefenseCardLocalDispatcherOutput =
    rawFlowAction === "handoff_to_local_dispatcher" ||
      rawFlowAction === "handoff_to_local_flow"
      ? {
        ...args.output,
        flow_action: "exit_to_global_dispatcher",
        note_information: null,
        exit_memo: {
          ...args.output.exit_memo,
          needed: true,
          reason: "topic_change",
          handoff_hint_for_global_dispatcher:
            args.output.exit_memo?.handoff_hint_for_global_dispatcher ??
              "prepare_attack_card",
        },
      }
      : args.output;
  const merged = mergePrepareDefenseCardLocalState({
    previous,
    output,
    transition: output.flow_action,
  });
  const mutationAudit = merged.audit;
  const toolFlags = {
    get_info_product: false,
    get_info_db: false,
    subskill_context: null as Record<string, unknown> | null,
  };
  const shared = (
    state: PrepareDefenseCardLocalState,
    draft: DefenseCardHandoffDraft | null,
    visibleTask: PrepareDefenseCardVisibleTaskKind,
    opts?: { suppressPlatformRestitution?: boolean },
  ) => {
    const transitionTarget = output.note_information?.target_dispatcher ??
      output.exit_memo.note_information?.target_dispatcher ?? null;
    return {
      visible_task_context: buildPrepareDefenseCardConversationContext({
        state,
        draft,
        output,
        visibleTask,
        suppressPlatformRestitution: opts?.suppressPlatformRestitution === true,
      }),
      note_information: output.note_information ??
        output.exit_memo.note_information ??
        fallbackNoteInformationForTransition({
          output,
          state,
          targetDispatcher: output.flow_action === "safety_preempt"
            ? "safety_crisis"
            : "global",
        }),
      exit_to_global_dispatcher: false,
      target_dispatcher: transitionTarget,
      safety_preempt: false,
    };
  };
  if (output.flow_action === "exit_to_global_dispatcher") {
    return {
      status: "topic_change",
      reason_code: "prepare_defense_card_local_exit_to_global_dispatcher",
      local_state: null,
      draft: null,
      visible_task: "exit_or_cancel",
      ...shared(previous, null, "exit_or_cancel"),
      exit_to_global_dispatcher: true,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
      state_mutation_audit: mutationAudit,
    };
  }
  if (
    output.flow_action === "defer_flow"
  ) {
    return {
      status: output.flow_action === "defer_flow" ? "deferred" : "cancelled",
      reason_code: output.flow_action === "defer_flow"
        ? "prepare_defense_card_local_deferred"
        : "prepare_defense_card_local_cancelled",
      local_state: null,
      draft: null,
      visible_task: "stop_or_cancel",
      ...shared(previous, null, "stop_or_cancel"),
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
      state_mutation_audit: mutationAudit,
    };
  }
  if (output.flow_action === "cancel_flow") {
    return {
      status: "cancelled",
      reason_code: "prepare_defense_card_local_cancelled",
      local_state: null,
      draft: null,
      visible_task: "exit_or_cancel",
      ...shared(previous, null, "exit_or_cancel"),
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
      state_mutation_audit: mutationAudit,
    };
  }
  let reduced: PrepareDefenseCardLocalState = merged.state;
  const forceFirstTurnEnrichment = shouldForceFirstTurnEnrichment({
    previous,
    output,
    reduced,
  });
  if (
    forceFirstTurnEnrichment && reduced.support_need_state.status === "locked"
  ) {
    const value = reduced.support_need_state.locked_value ??
      reduced.support_need_state.candidate_value;
    reduced = {
      ...reduced,
      support_need_state: {
        ...reduced.support_need_state,
        status: value ? "proposed" : "missing",
        candidate_value: value,
        locked_value: null,
        needs_user_confirmation: Boolean(value),
        why_status: reduced.support_need_state.why_status ??
          "Proposition conservée; première passe d'enrichissement requise avant verrouillage.",
      },
    };
    auditRestored(
      mutationAudit,
      "support_need_state",
      "not_stabilized_enough",
      output.flow_action,
    );
  }
  if (
    [
      "confirm_proposed_field",
      "handoff_ready",
    ].includes(output.flow_action) &&
    reduced.tool_fit_state.status === "defense" &&
    reduced.support_need_state.status !== "locked" &&
    previous.support_need_state.status === "proposed" &&
    Boolean(previous.support_need_state.candidate_value)
  ) {
    reduced = {
      ...reduced,
      support_need_state: {
        ...reduced.support_need_state,
        status: "locked",
        candidate_value: null,
        locked_value: previous.support_need_state.candidate_value,
        previous_value: previous.support_need_state.locked_value ??
          previous.support_need_state.previous_value,
        needs_user_confirmation: false,
        why_status: reduced.support_need_state.why_status ??
          "Verrouillé par confirmation de la candidate précédente.",
      },
    };
  }
  const ready = supportNeedReady(reduced);
  const visibleTask = forceFirstTurnEnrichment
    ? firstTurnEnrichmentTask(reduced)
    : ready
    ? (
      output.visible_task.kind === "apply_attempt" ||
        output.visible_task.kind === "repeat_handoff" ||
        output.visible_task.kind === "destination_short" ||
        output.visible_task.kind === "revision_done"
        ? output.visible_task.kind
        : "handoff_ready"
    )
    : output.visible_task.kind;
  const state = withVisibleTask(reduced, visibleTask);
  const draft = draftFromState(state);
  if (output.flow_action === "get_info_product") {
    return {
      status: "collecting",
      reason_code: "prepare_defense_card_get_info_product",
      local_state: withVisibleTask(state, "none"),
      draft,
      visible_task: "none",
      ...shared(state, draft, "none"),
      exit_to_global_dispatcher: false,
      get_info_product: true,
      get_info_db: false,
      subskill_context: output.subskill_call.context_for_subskill,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
      state_mutation_audit: mutationAudit,
    };
  }
  if (output.flow_action === "get_info_db") {
    return {
      status: "collecting",
      reason_code: "prepare_defense_card_get_info_db",
      local_state: withVisibleTask(state, "none"),
      draft,
      visible_task: "none",
      ...shared(state, draft, "none"),
      exit_to_global_dispatcher: false,
      get_info_product: false,
      get_info_db: true,
      subskill_context: output.subskill_call.context_for_subskill,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
      state_mutation_audit: mutationAudit,
    };
  }
  if (output.flow_action === "safety_preempt") {
    return {
      status: "blocked",
      reason_code: "prepare_defense_card_local_safety_preempt",
      local_state: state,
      draft: null,
      visible_task: "safety",
      ...shared(state, null, "safety"),
      exit_to_global_dispatcher: false,
      safety_preempt: true,
      target_dispatcher: "safety_crisis",
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
      state_mutation_audit: mutationAudit,
    };
  }
  if (output.flow_action === "apply_attempt") {
    return {
      status: "apply_attempt",
      reason_code: "apply_attempt_not_executable_from_chat",
      local_state: state,
      draft,
      visible_task: "apply_attempt",
      ...shared(state, draft, "apply_attempt"),
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [{
        type: "create_defense_card",
        reason_code: "chat_creation_disabled_platform_handoff",
      }],
      state_mutation_audit: mutationAudit,
    };
  }
  if (output.flow_action === "repeat_handoff") {
    return {
      status: "repeat_handoff",
      reason_code: "repeat_platform_handoff",
      local_state: state,
      draft,
      visible_task: "repeat_handoff",
      ...shared(state, draft, "repeat_handoff"),
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
      state_mutation_audit: mutationAudit,
    };
  }
  if (output.flow_action === "platform_destination_followup") {
    return {
      status: "handoff_delivered",
      reason_code: "destination_short",
      local_state: state,
      draft,
      visible_task: "destination_short",
      ...shared(state, draft, "destination_short"),
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
      state_mutation_audit: mutationAudit,
    };
  }
  if (draft && ready) {
    return {
      status: "handoff_delivered",
      reason_code: output.flow_action === "revise_support_need" ||
          output.flow_action === "revise_current_field"
        ? "revised_platform_handoff"
        : "platform_handoff_delivered",
      local_state: state,
      draft,
      visible_task: visibleTask,
      ...shared(state, draft, visibleTask, {
        suppressPlatformRestitution: forceFirstTurnEnrichment,
      }),
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
      state_mutation_audit: mutationAudit,
    };
  }
  const blockedReason = output.flow_action === "handoff_ready"
    ? reduced.tool_fit_state.status !== "defense"
      ? "not_stabilized_enough"
      : !reduced.support_need_state.locked_value
      ? "durable_need_missing"
      : "direct_handoff_flag_missing"
    : "prepare_defense_card_local_collecting";
  return {
    status: visibleTask === "clarify_attack_vs_defense"
      ? "clarifying"
      : "collecting",
    reason_code: blockedReason,
    local_state: state,
    draft: null,
    visible_task: visibleTask,
    ...shared(state, null, visibleTask, {
      suppressPlatformRestitution: forceFirstTurnEnrichment,
    }),
    exit_to_global_dispatcher: false,
    ...toolFlags,
    risk_assessment: output.risk_assessment,
    blocked_effects: [],
    state_mutation_audit: mutationAudit,
  };
}

export function localDispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local structure du flow prepare_defense_card.",
    "Tu ne réponds jamais directement au user. Tu retournes uniquement un JSON valide.",
    "Le flow prepare_defense_card est déjà actif. Tu ne dois pas appeler le dispatcher global.",
    "Tu ne sors vers le dispatcher global que si le message quitte clairement ce flow, corrige explicitement vers un autre owner, ou demande une action appartenant à un autre flow.",
    "Mission: aider le user à préparer une carte de défense à reprendre dans la plateforme. Une carte de défense protège un moment de risque, craquage, impulsion, rechute, évitement, scroll, abandon ou réaction automatique.",
    "Une carte d'attaque sert plutôt à démarrer une action, franchir une résistance, enlever une friction avant l'action ou contrer une négociation intérieure.",
    "Le chat ne crée jamais la carte. Il prépare uniquement les données à saisir dans la plateforme.",
    "Contraintes strictes: aucune regex métier, aucun mot-clé isolé, aucune décision par template, aucune création DB, aucun pending confirmation executable, aucun token de confirmation, aucun effet durable.",
    `Champ plateforme unique: field_id=support_need, question_label=${DEFENSE_CARD_SUPPORT_NEED_LABEL}.`,
    "N'expose jamais entry_need, risk_moment, first_signal, defense_response ou fallback_plan comme champs plateforme.",
    "Les champs internes risk_context, defense_action et ritual_phrase ne sont pas des champs plateforme separes: ils servent a ne pas perdre la parade concrete du user dans le handoff.",
    "Actions possibles: answer_current_field, confirm_proposed_field, clarify_attack_vs_defense, confirm_attachment_candidate, revise_current_field, revise_attachment, revise_risk, revise_support_need, get_info_product, get_info_db, handoff_ready, repeat_handoff, platform_destination_followup, apply_attempt, exit_to_global_dispatcher, cancel_flow, defer_flow, safety_preempt.",
    "Priorité des actions: safety_preempt, apply_attempt, exit_to_global_dispatcher, cancel_flow, defer_flow, exit_to_global_dispatcher, get_info_product, get_info_db, revise_attachment, revise_risk, revise_support_need, revise_current_field, platform_destination_followup, repeat_handoff, confirm_attachment_candidate, confirm_proposed_field, clarify_attack_vs_defense, answer_current_field, handoff_ready.",
    "Rythme conversationnel V1: au premier tour d'entrée dans prepare_defense_card, ne propose pas encore le champ plateforme support_need et ne fais pas handoff_ready, même si le message est riche. Fais d'abord une passe courte d'enrichissement/éclaircissement avec ask_trigger_or_signal, ask_defense_goal_or_response ou ask_risk_situation.",
    "Interdiction premier tour: aucune restitution plateforme au premier message visible. Ne demande pas confirmation d'une formulation, ne donne pas de phrase à recopier, ne cite pas le label du champ, ne cite pas Cartes de défense ni la destination. La restitution du support_need peut arriver au plus tôt au tour suivant, après une vraie passe d'échange.",
    "Exception de rythme: safety_preempt, exit_to_global_dispatcher, get_info_product et get_info_db restent prioritaires; ne bloque pas une sortie claire ou une question inline pour poser une question d'enrichissement.",
    "Règles tool_fit: defense si le user protège un moment où il risque de craquer; attack_better si le besoin est principalement démarrer/enlever une friction; ambiguous si la demande de défense décrit surtout un démarrage; not_applicable si hors sujet.",
    "Il ne peut jamais y avoir de handoff vers un dispatcher local depuis prepare_defense_card.",
    "Demandes explicites d'autres tools: si le user demande explicitement prepare_attack_card, select_state_potion, create_recurring_reminder, adjust_plan_item, update_coach_preferences ou create_one_shot_reminder, retourne exit_to_global_dispatcher avec note_information.target_dispatcher=global. Ne lance jamais ces tools depuis prepare_defense_card. Le même message sera réanalysé par le dispatcher global.",
    "Si le user corrige explicitement vers une carte d'attaque ou si le besoin relève clairement d'une carte d'attaque pendant le flow actif, retourne exit_to_global_dispatcher avec note_information.target_dispatcher=global et recommended_next_focus='prepare_attack_card'. Le même message sera réanalysé par le dispatcher global.",
    "Si le user arrête ce flow ou change de sujet, retourne exit_to_global_dispatcher avec note_information vers global.",
    "Si le user change clairement de sujet hors flows locaux connus, retourne exit_to_global_dispatcher avec note_information.target_dispatcher=global.",
    "Si le message devient safety, retourne safety_preempt avec note_information.target_dispatcher=safety_crisis. Ne repasse pas par le dispatcher global normal.",
    "Ne verrouille jamais support_need si la phrase ne décrit pas clairement une situation, un contexte, un environnement ou une pulsion.",
    "Une valeur utile mais déduite doit rester proposed et demander confirmation. Une correction exacte remplace l'ancienne valeur principale.",
    "Si support_need est locked et tool_fit=defense, visible_task.kind=handoff_ready.",
    "Si le user demande de créer, ajouter, lancer ou activer la carte, retourne apply_attempt, jamais une confirmation exécutable.",
    "Si le user demande où la mettre, retourne platform_destination_followup.",
    "Si le user pose une question produit pendant ce flow (c'est quoi, comment ça marche, différence attaque/défense, où est-ce), retourne flow_action=get_info_product, visible_task.kind=none, subskill_call.skill_id=product_help.",
    "Si le user pose une question sur ses objets existants ou l'état DB pendant ce flow (cartes de défense actives/libres déjà créées, ce qui existe déjà), retourne flow_action=get_info_db, visible_task.kind=none, subskill_call.skill_id=status_recap.",
    ...directEffectLocalDispatcherPromptLines(),
    "Pour get_info_product/get_info_db, remplis subskill_call.context_for_subskill avec active_flow='prepare_defense_card', question_to_answer reformulée, active_flow_context utile (tool_fit_state, attachment_state, risk_state, support_need_state, route_kind).",
    "visible_task.conversation_context doit être compact et filtré pour l'agent visible: pas de DB brute, pas de mémoire brute, pas d'état local complet inutile.",
    "Pour tout changement de dispatcher (exit_to_global_dispatcher, safety_preempt), fournis note_information canonique avec source_flow_id, target_dispatcher, handoff_reason, handoff_context_for_next_dispatcher, user_words, structured_context non vide et confidence si utile.",
    "Sortie JSON stricte avec les clés: flow_action, confidence, risk_score, tool_fit, current_stage, slot_updates, platform_field_updates, visible_task, subskill_call, handoff_state, exit_memo, note_information, evidence, et les états structurés tool_fit_state, attachment_state, risk_state, trigger_state, defense_goal_state, defense_response_hint_state, support_need_state, revision, risk_assessment.",
    "",
    "Field Completion Rules:",
    "- flow_action: décision principale du tour courant. Utilise answer_current_field pour avancer dans la collecte, confirm_proposed_field pour confirmer une valeur proposed, clarify_attack_vs_defense si le besoin attaque/défense reste ambigu, handoff_ready quand support_need est locked et tool_fit=defense, platform_destination_followup pour 'où je la mets ?', apply_attempt pour créer/ajouter/activer/lancer, exit_to_global_dispatcher si le user arrête ce flow ou change clairement d'owner, safety_preempt pour safety réelle. Ne choisis jamais une action seulement parce qu'elle était le dernier état.",
    "- confidence: high si l'intention et la prochaine action sont claires; medium si le sens est probable mais incomplet ou proposé; low si tu dois clarifier ou rester prudent. N'utilise pas high pour une hypothèse.",
    "- risk_score: score local 0-10 utile à ce flow. 0-2 hors safety, 3-6 tension ou risque non imminent, 7+ seulement si le message porte un risque sérieux. N'invente pas de safety; si safety réelle, flow_action=safety_preempt et risk_assessment.safety_preempt=true.",
    "- tool_fit et tool_fit_state: tool_fit résume le statut métier; tool_fit_state détaille reason, needs_user_confirmation et why_status. defense si le besoin protège un moment de craquage; attack_better si le besoin est démarrer une action; ambiguous si les deux lectures restent possibles; not_applicable si hors sujet. Ne force pas defense pour une action à démarrer.",
    "- current_stage et stage: indique le stade métier actuel parmi tool_fit, attachment_intake, risk_intake, support_need_intake, handoff_ready, handoff_delivered, exit. current_stage doit refléter la décision de ce tour; stage peut rester aligné pour compatibilité. Ne mets pas handoff_delivered si support_need n'est pas prêt.",
    "- route_kind: free_card par défaut; plan_item_card uniquement si le contexte fourni identifie réellement un plan_item. Null seulement si impossible à déterminer.",
    "- slot_updates et platform_field_updates: objets de trace compacte pour les champs changés par ce tour. Laisse {} si aucun patch explicite. Ne les utilise pas comme second état contradictoire; les états structurés ci-dessous sont la source canonique.",
    "- attachment_state: ce que la défense protège. Remplis candidate_value si utile mais incertain; locked_value seulement si le user l'a donné clairement ou confirmé. plan_item_id uniquement depuis contexte fourni, jamais inventé.",
    "- risk_state: moment ou situation précise où le user risque de déraper. Verrouille seulement si le moment est clair; sinon propose ou laisse missing. Ne transforme pas une humeur vague en risque verrouillé.",
    "- trigger_state: signal, pulsion, piège ou premier indice. Utile mais non obligatoire pour le champ plateforme; ne l'expose jamais comme champ à remplir.",
    "- defense_goal_state: ce que la carte aide à empêcher ou préserver. Utilise une valeur canonique seulement si elle découle clairement du message; sinon candidate/missing.",
    "- defense_response_hint_state: réponse défensive possible uniquement si le user l'a donnée ou si elle aide à formuler support_need. Ne fabrique pas un plan rigide.",
    "- defense_response_hint_state doit conserver les parades concretes donnees par le user: action a faire, rituel, phrase courte, geste de rupture. Si le user dit 'cles dans la salle de bain, douche cinq minutes, phrase X', cette information doit rester dans locked_value ou candidate_value et etre reprise dans le handoff.",
    `- support_need_state: seul champ plateforme canonique. field_id doit toujours être support_need et question_label exactement '${DEFENSE_CARD_SUPPORT_NEED_LABEL}'. missing si la situation n'est pas formulable; proposed si tu proposes une phrase déduite; locked uniquement si le user confirme ou donne une formulation claire. candidate_value et locked_value ne doivent pas diverger du message utile.`,
    "- revision: is_revision=true seulement si le user corrige/remplace une valeur. revision_target indique le slot remplacé, replacement_value la nouvelle formulation, replaces_previous_value=true si l'ancienne valeur principale doit être remplacée. Laisse false/null hors révision.",
    "- visible_task.kind: choisis le prompt stage-specific exact. Au premier tour, utilise uniquement ask_trigger_or_signal, ask_defense_goal_or_response ou ask_risk_situation pour enrichir; n'utilise pas confirm_support_need_proposal ni handoff_ready. Utilise confirm_support_need_proposal pour une proposition à valider après au moins une passe d'échange, ask_support_need pour une situation manquante, handoff_ready quand le handoff est prêt, destination_short pour la destination courte, apply_attempt pour refus de création, stop_or_cancel pour sortie/annulation, exit_or_cancel pour exit global, safety pour safety_preempt, none pour get_info_product/get_info_db.",
    "- visible_task.conversation_context: contexte filtré pour l'agent visible seulement. Inclure valeurs connues, incertitudes, contraintes de ton, destination et label support_need si utile. Ne jamais inclure DB brute, mémoire brute, note_information brute, historique brut ou état local complet.",
    "- subskill_call: needed=true seulement pour get_info_product ou get_info_db. skill_id doit être product_help ou status_recap. context_for_subskill doit contenir active_flow='prepare_defense_card', question_to_answer et un active_flow_context compact. Laisse needed=false, skill_id=null, context_for_subskill={} sinon.",
    "- handoff_state: ce dispatcher ne crée pas d'état de handoff dans sa sortie JSON; laisse null. Le reducer construit le handoff plateforme quand support_need est locked.",
    "- exit_memo: needed=true pour exit_to_global_dispatcher, safety_preempt, cancel_flow ou exit_to_global_dispatcher si un résumé aide. reason doit rester dans le contrat. handoff_hint_for_global_dispatcher peut valoir prepare_attack_card si le user demande explicitement une carte d'attaque; ce n'est pas un handoff local.",
    "- note_information: obligatoire pour exit_to_global_dispatcher et safety_preempt. target_dispatcher=global pour changement de sujet ou carte d'attaque; target_dispatcher=safety_crisis pour safety. Structure canonique: source_flow_id='prepare_defense_card', target_dispatcher, handoff_reason, handoff_context_for_next_dispatcher, user_words, structured_context non vide, confidence si utile. Mets user_message_summary, active_flow_summary, collected_state, unresolved_questions, evidence et recommended_next_focus dans structured_context. Ne mets jamais source_flow_presentation, source_flow_state_summary, target_local_dispatcher_hint, risk_score ou committed_effects dans la note. La note est consommée par le dispatcher cible et ne va jamais brute au prompt visible.",
    "- committed_effects: toujours defense_card_created=false, pending_confirmation_created=false, confirmation_token_created=false, db_write_committed=false. Si le user demande 'crée-la', utilise apply_attempt et blocked_effects seront ajoutés par le reducer.",
    "- risk_assessment: doit être cohérent avec risk_score. safety_preempt=true seulement avec flow_action=safety_preempt; reason_codes contient des raisons utiles, pas de pseudo-preuves.",
    "- evidence: fragments sémantiques réellement utilisés pour décider. 0 à 5 items courts. Pas de pseudo-preuves ni de paraphrases inventées.",
    "",
    "Transition Rules:",
    "- exit_to_global_dispatcher: user arrête ce flow ou change de sujet; visible_task.kind=stop_or_cancel ou exit_or_cancel; note_information obligatoire vers global.",
    "- exit_to_global_dispatcher: user change clairement de sujet ou demande un autre owner, y compris prepare_attack_card; note_information.target_dispatcher=global; le même message sera réanalysé par le dispatcher global.",
    "- safety_preempt: safety réelle; note_information.target_dispatcher=safety_crisis; ne passe pas par le dispatcher global normal.",
    "- get_info_product/get_info_db: inline subskill seulement; le flow parent conserve son état.",
    "- Les handoffs directs vers un autre dispatcher local sont interdits dans prepare_defense_card.",
    "",
    "Example JSON 1 - continuation normale non visible:",
    `{"flow_action":"confirm_proposed_field","confidence":"medium","risk_score":0,"tool_fit":"defense","current_stage":"support_need_intake","stage":"support_need_intake","route_kind":"free_card","slot_updates":{},"platform_field_updates":{},"tool_fit_state":{"status":"defense","reason":"moment de risque décrit","needs_user_confirmation":false,"why_status":"défense adaptée"},"attachment_state":{"status":"proposed","kind":"free_risk_context","plan_item_id":null,"candidate_value":"retour à la maison le soir","locked_value":null,"candidate_options":[],"needs_user_confirmation":true,"why_status":"déduit du message"},"risk_state":{"status":"proposed","label":"retour fatigué le soir","description":"risque de commander automatiquement","timing_hint":"soir","context_hint":"retour maison","needs_user_confirmation":true,"why_status":"formulation proposée"},"trigger_state":{"status":"proposed","type":"fatigue","candidate_value":"fatigue au retour","locked_value":null,"needs_user_confirmation":true,"why_status":"signal probable"},"defense_goal_state":{"status":"proposed","value":"interrupt_impulse","candidate_value":"ne pas commander par automatisme","locked_value":null,"needs_user_confirmation":true,"why_status":"objectif probable"},"defense_response_hint_state":{"status":"missing","strategy_hint":null,"candidate_value":null,"locked_value":null,"needs_user_confirmation":false,"why_status":"non nécessaire"},"support_need_state":{"field_id":"support_need","question_label":"${DEFENSE_CARD_SUPPORT_NEED_LABEL}","status":"proposed","candidate_value":"les soirs où je rentre rincé et que j'ouvre les applis de livraison automatiquement","locked_value":null,"previous_value":null,"needs_user_confirmation":true,"why_status":"phrase utile mais à confirmer"},"revision":{"is_revision":false,"revision_target":null,"replacement_value":null,"replaces_previous_value":false},"visible_task":{"kind":"confirm_support_need_proposal","conversation_context":{"field_or_stage":"support_need_intake","known_values":{},"tone_constraints":["une seule question"],"do_not_say":["ne dis pas que la carte est créée"]}},"subskill_call":{"needed":false,"skill_id":null,"reason":null,"context_for_subskill":{}},"handoff_state":null,"exit_memo":{"needed":false,"reason":"none","flow_summary":null,"handoff_hint_for_global_dispatcher":null},"note_information":null,"risk_assessment":{"risk_score":0,"risk_band":"none","safety_preempt":false,"reason_codes":[]},"evidence":["rentre rincé","ouvre les applis de livraison"]}`,
    "Example JSON 2 - transition critique non visible:",
    `{"flow_action":"exit_to_global_dispatcher","confidence":"high","risk_score":0,"tool_fit":"attack_better","current_stage":"exit","stage":"exit","route_kind":"free_card","slot_updates":{},"platform_field_updates":{},"tool_fit_state":{"status":"attack_better","reason":"le user demande explicitement une carte d'attaque","needs_user_confirmation":false,"why_status":"nouvel owner demandé"},"attachment_state":{"status":"missing","kind":null,"plan_item_id":null,"candidate_value":null,"locked_value":null,"candidate_options":[],"needs_user_confirmation":false,"why_status":"hors flow défense"},"risk_state":{"status":"missing","label":null,"description":null,"timing_hint":null,"context_hint":null,"needs_user_confirmation":false,"why_status":"hors flow défense"},"trigger_state":{"status":"missing","type":null,"candidate_value":null,"locked_value":null,"needs_user_confirmation":false,"why_status":"hors flow défense"},"defense_goal_state":{"status":"missing","value":null,"candidate_value":null,"locked_value":null,"needs_user_confirmation":false,"why_status":"hors flow défense"},"defense_response_hint_state":{"status":"missing","strategy_hint":null,"candidate_value":null,"locked_value":null,"needs_user_confirmation":false,"why_status":"hors flow défense"},"support_need_state":{"field_id":"support_need","question_label":"${DEFENSE_CARD_SUPPORT_NEED_LABEL}","status":"missing","candidate_value":null,"locked_value":null,"previous_value":null,"needs_user_confirmation":false,"why_status":"pas de nouveau champ défense"},"revision":{"is_revision":false,"revision_target":null,"replacement_value":null,"replaces_previous_value":false},"visible_task":{"kind":"exit_or_cancel","conversation_context":{"field_or_stage":"exit","known_values":{},"tone_constraints":["pas de réponse visible source"],"do_not_say":["ne fais pas de handoff local"]}},"subskill_call":{"needed":false,"skill_id":null,"reason":null,"context_for_subskill":{}},"handoff_state":null,"exit_memo":{"needed":true,"reason":"handoff_to_attack_card","flow_summary":"le user quitte la carte de défense pour une carte d'attaque","handoff_hint_for_global_dispatcher":"prepare_attack_card"},"note_information":{"source_flow_id":"prepare_defense_card","target_dispatcher":"global","handoff_reason":"topic_change","handoff_context_for_next_dispatcher":"demande explicite de carte d'attaque","user_words":["carte d'attaque"],"structured_context":{"user_message_summary":"demande explicite de carte d'attaque","active_flow_summary":"flow défense arrêté","collected_state":{},"unresolved_questions":[],"evidence":["carte d'attaque"],"recommended_next_focus":"prepare_attack_card"},"confidence":"high"},"risk_assessment":{"risk_score":0,"risk_band":"none","safety_preempt":false,"reason_codes":[]},"evidence":["carte d'attaque"]}`,
  ].join("\n");
}

export async function runPrepareDefenseCardLocalDispatcher(
  input: PrepareDefenseCardLocalDispatcherInput,
): Promise<PrepareDefenseCardLocalDispatcherOutput | null> {
  const userPrompt = JSON.stringify({
    task: "dispatch_prepare_defense_card_local_flow",
    current_user_message: input.user_message,
    recent_messages: input.recent_messages,
    active_state: input.active_state,
    local_state: input.local_state,
    route_decision_context_only: input.route_decision,
    turn_frame_context_only: input.turn_frame,
    note_information_inbound: input.note_information_inbound ?? null,
    db_context_pack: input.db_context_pack ?? {
      product_surface: DEFENSE_CARD_PLATFORM_DESTINATION,
      available_platform_field_ids: ["support_need"],
      exclusions: [
        "No raw DB dump is loaded for prepare_defense_card V1.",
        "Existing defense card records must not be mutated from chat.",
      ],
    },
    micro_memory_context: input.micro_memory_context ?? {
      items: [],
      exclusions: [
        "No micro-memory is loaded by default for prepare_defense_card clarification.",
        "Memory alone must not lock support_need.",
        "Safety memory is excluded unless safety_crisis owns the turn.",
      ],
      budget: { max_items: 0 },
    },
    platform_context: withDirectEffectLocalContext(
      input.platform_context ?? {
        destination: DEFENSE_CARD_PLATFORM_DESTINATION,
        support_need_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
      },
      input.plan_snapshot ?? null,
    ),
    parent_flow_context: input.parent_flow_context ?? null,
    risk_context: input.risk_context ?? null,
    available_inline_tools: input.available_inline_tools ?? [
      "product_help",
      "status_recap",
    ],
    plan_snapshot: input.plan_snapshot ?? null,
    last_handoff: input.last_handoff ?? null,
    canonical_platform_field: {
      field_id: "support_need",
      question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
      destination: DEFENSE_CARD_PLATFORM_DESTINATION,
    },
    required_visible_task_kinds: [
      "clarify_attack_vs_defense",
      "redirect_attack_better",
      "ask_attachment",
      "confirm_attachment_candidate",
      "ask_risk_situation",
      "ask_trigger_or_signal",
      "ask_defense_goal_or_response",
      "ask_support_need",
      "confirm_support_need_proposal",
      "handoff_ready",
      "revision_done",
      "destination_short",
      "apply_attempt",
      "repeat_handoff",
      "inline_tool_return",
      "stop_or_cancel",
      "exit_ack",
      "exit_or_cancel",
      "safety",
      "safety_transition",
      "handoff_transition",
      "none",
    ],
    subskill_call: {
      needed: "boolean",
      skill_id: "product_help|status_recap|null",
      reason: "string|null",
      context_for_subskill: "object",
    },
  });
  try {
    const raw = await generateWithGemini(
      localDispatcherSystemPrompt(),
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "prepare_defense_card.local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizePrepareDefenseCardLocalDispatcherOutput(raw);
  } catch (error) {
    console.warn("[PrepareDefenseCard] local dispatcher failed", error);
    return null;
  }
}
