import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";
import type { DefenseCardHandoffDraft, DefenseCardHandoffState } from "./contract.ts";

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
  | "cancel_flow"
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
  | "exit_or_cancel"
  | "safety"
  | "none";

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
    required_data: {
      operation_name: "prepare_defense_card";
      surface_label: "Cartes de défense";
      platform_destination: string;
      route_kind: "free_card" | "plan_item_card" | null;
      support_need_label: typeof DEFENSE_CARD_SUPPORT_NEED_LABEL;
      support_need_value: string | null;
      attachment_value: string | null;
      risk_value: string | null;
    };
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
      | "handoff_to_attack_card";
    flow_summary: string | null;
    handoff_hint_for_global_dispatcher: string | null;
  };
  no_chat_mutation: {
    defense_card_created: false;
    pending_confirmation_created: false;
    confirmation_token_created: false;
    db_write_committed: false;
  };
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
    | "topic_change"
    | "blocked";
  reason_code: string;
  local_state: PrepareDefenseCardLocalState | null;
  draft: DefenseCardHandoffDraft | null;
  visible_task: PrepareDefenseCardVisibleTaskKind;
  exit_to_global_dispatcher: boolean;
  get_info_product: boolean;
  get_info_db: boolean;
  subskill_context: Record<string, unknown> | null;
  risk_assessment: PrepareDefenseCardRiskAssessment;
  blocked_effects: Array<{ type: string; reason_code: string }>;
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
  return enumValue(
    value,
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
      "cancel_flow",
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
      "exit_or_cancel",
      "safety",
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
  ) ?? stringValue(draft?.platform_flow.entry_need?.value);
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
    platform_destination: DEFENSE_CARD_PLATFORM_DESTINATION,
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
        plan_item_id: stringValue((args.operationInput?.target as any)?.plan_item_id) ??
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
    subskill_history: Array.isArray((args.activeState as any)?.local_state
        ?.subskill_history)
      ? (args.activeState as any).local_state.subskill_history.slice(-8)
      : [],
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
  const task = visibleTaskKind((root.visible_task as any)?.kind);
  const route = routeKind(root.route_kind);
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
      required_data: {
        operation_name: "prepare_defense_card",
        surface_label: "Cartes de défense",
        platform_destination: DEFENSE_CARD_PLATFORM_DESTINATION,
        route_kind: route,
        support_need_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        support_need_value: support.locked_value ?? support.candidate_value,
        attachment_value: attachment.locked_value ?? attachment.candidate_value,
      risk_value: riskSlot.label ?? riskSlot.description,
      },
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
        ] as const,
        "none",
      ),
      flow_summary: stringValue((root.exit_memo as any)?.flow_summary),
      handoff_hint_for_global_dispatcher: stringValue(
        (root.exit_memo as any)?.handoff_hint_for_global_dispatcher,
      ),
    },
    no_chat_mutation: {
      defense_card_created: false,
      pending_confirmation_created: false,
      confirmation_token_created: false,
      db_write_committed: false,
    },
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
  return {
    operation_type: "prepare_defense_card",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    target_summary: attachment,
    risk_summary: risk,
    platform_flow: {
      route_kind: route,
      route_label: route === "plan_item_card"
        ? "Carte de défense liée à une mission ou habitude du plan"
        : "Carte de défense libre",
      entry_need: {
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        value: supportNeed,
        status: "locked",
      },
      questionnaire_answers: [],
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
      platform_destination: DEFENSE_CARD_PLATFORM_DESTINATION,
      platform_steps: DEFENSE_CARD_PLATFORM_STEPS,
    },
    missing_decisions: [],
  };
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

export function reducePrepareDefenseCardLocalDispatcherOutput(args: {
  previous: PrepareDefenseCardLocalState | null;
  output: PrepareDefenseCardLocalDispatcherOutput;
}): PrepareDefenseCardReducerResult {
  const previous = args.previous ?? createInitialPrepareDefenseCardLocalState();
  const output = args.output;
  const toolFlags = {
    get_info_product: false,
    get_info_db: false,
    subskill_context: null as Record<string, unknown> | null,
  };
  if (output.flow_action === "exit_to_global_dispatcher") {
    return {
      status: "topic_change",
      reason_code: "prepare_defense_card_local_exit_to_global_dispatcher",
      local_state: null,
      draft: null,
      visible_task: "exit_or_cancel",
      exit_to_global_dispatcher: true,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
    };
  }
  if (output.flow_action === "cancel_flow") {
    return {
      status: "cancelled",
      reason_code: "prepare_defense_card_local_cancelled",
      local_state: null,
      draft: null,
      visible_task: "exit_or_cancel",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
    };
  }
  const reduced: PrepareDefenseCardLocalState = {
    ...previous,
    route_kind: output.route_kind ?? previous.route_kind ?? "free_card",
    tool_fit_state: output.tool_fit_state.status === "ambiguous" &&
        previous.tool_fit_state.status !== "ambiguous"
      ? previous.tool_fit_state
      : { ...previous.tool_fit_state, ...output.tool_fit_state },
    attachment_state: mergeStatusSlot(
      previous.attachment_state,
      output.attachment_state,
    ),
    risk_state: mergeStatusSlot(previous.risk_state, output.risk_state),
    trigger_state: mergeStatusSlot(previous.trigger_state, output.trigger_state),
    defense_goal_state: mergeStatusSlot(
      previous.defense_goal_state,
      output.defense_goal_state,
    ),
    defense_response_hint_state: mergeStatusSlot(
      previous.defense_response_hint_state,
      output.defense_response_hint_state,
    ),
    support_need_state: mergeSupportNeed(
      previous.support_need_state,
      output.support_need_state,
    ),
  };
  const ready = supportNeedReady(reduced);
  const visibleTask = ready
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
      exit_to_global_dispatcher: false,
      get_info_product: true,
      get_info_db: false,
      subskill_context: output.subskill_call.context_for_subskill,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
    };
  }
  if (output.flow_action === "get_info_db") {
    return {
      status: "collecting",
      reason_code: "prepare_defense_card_get_info_db",
      local_state: withVisibleTask(state, "none"),
      draft,
      visible_task: "none",
      exit_to_global_dispatcher: false,
      get_info_product: false,
      get_info_db: true,
      subskill_context: output.subskill_call.context_for_subskill,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
    };
  }
  if (output.flow_action === "safety_preempt") {
    return {
      status: "blocked",
      reason_code: "prepare_defense_card_local_safety_preempt",
      local_state: state,
      draft: null,
      visible_task: "safety",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
    };
  }
  if (output.flow_action === "apply_attempt") {
    return {
      status: "apply_attempt",
      reason_code: "apply_attempt_no_chat_mutation",
      local_state: state,
      draft,
      visible_task: "apply_attempt",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [{
        type: "create_defense_card",
        reason_code: "chat_creation_disabled_platform_handoff",
      }],
    };
  }
  if (output.flow_action === "repeat_handoff") {
    return {
      status: "repeat_handoff",
      reason_code: "repeat_platform_handoff",
      local_state: state,
      draft,
      visible_task: "repeat_handoff",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
    };
  }
  if (output.flow_action === "platform_destination_followup") {
    return {
      status: "handoff_delivered",
      reason_code: "destination_short",
      local_state: state,
      draft,
      visible_task: "destination_short",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
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
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: output.risk_assessment,
      blocked_effects: [],
    };
  }
  return {
    status: visibleTask === "clarify_attack_vs_defense"
      ? "clarifying"
      : "collecting",
    reason_code: "prepare_defense_card_local_collecting",
    local_state: state,
    draft: null,
    visible_task: visibleTask,
    exit_to_global_dispatcher: false,
    ...toolFlags,
    risk_assessment: output.risk_assessment,
    blocked_effects: [],
  };
}

function localDispatcherSystemPrompt(): string {
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
    "Actions possibles: answer_current_field, confirm_proposed_field, clarify_attack_vs_defense, confirm_attachment_candidate, revise_current_field, revise_attachment, revise_risk, revise_support_need, get_info_product, get_info_db, handoff_ready, repeat_handoff, platform_destination_followup, apply_attempt, cancel_flow, exit_to_global_dispatcher, safety_preempt.",
    "Priorité des actions: safety_preempt, apply_attempt, cancel_flow, exit_to_global_dispatcher, get_info_product, get_info_db, revise_attachment, revise_risk, revise_support_need, revise_current_field, platform_destination_followup, repeat_handoff, confirm_attachment_candidate, confirm_proposed_field, clarify_attack_vs_defense, answer_current_field, handoff_ready.",
    "Règles tool_fit: defense si le user protège un moment où il risque de craquer; attack_better si le besoin est principalement démarrer/enlever une friction; ambiguous si la demande de défense décrit surtout un démarrage; not_applicable si hors sujet.",
    "Si le user corrige explicitement vers une carte d'attaque, retourne exit_to_global_dispatcher avec handoff_hint_for_global_dispatcher vers prepare_attack_card.",
    "Ne verrouille jamais support_need si la phrase ne décrit pas clairement une situation, un contexte, un environnement ou une pulsion.",
    "Une valeur utile mais déduite doit rester proposed et demander confirmation. Une correction exacte remplace l'ancienne valeur principale.",
    "Si support_need est locked et tool_fit=defense, visible_task.kind=handoff_ready.",
    "Si le user demande de créer, ajouter, lancer ou activer la carte, retourne apply_attempt, jamais une confirmation exécutable.",
    "Si le user demande où la mettre, retourne platform_destination_followup.",
    "Si le user pose une question produit pendant ce flow (c'est quoi, comment ça marche, différence attaque/défense, où est-ce), retourne flow_action=get_info_product, visible_task.kind=none, subskill_call.skill_id=product_help.",
    "Si le user pose une question sur ses objets existants ou l'état DB pendant ce flow (cartes de défense actives/libres déjà créées, ce qui existe déjà), retourne flow_action=get_info_db, visible_task.kind=none, subskill_call.skill_id=status_recap.",
    "Pour get_info_product/get_info_db, remplis subskill_call.context_for_subskill avec active_flow='prepare_defense_card', question_to_answer reformulée, active_flow_context utile (tool_fit_state, attachment_state, risk_state, support_need_state, route_kind).",
    "Sortie JSON stricte avec les clés: flow_action, confidence, risk_score, tool_fit, current_stage, slot_updates, platform_field_updates, visible_task, subskill_call, handoff_state, exit_memo, evidence, et les états structurés tool_fit_state, attachment_state, risk_state, trigger_state, defense_goal_state, defense_response_hint_state, support_need_state, revision, no_chat_mutation, risk_assessment.",
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
      "exit_or_cancel",
      "safety",
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
