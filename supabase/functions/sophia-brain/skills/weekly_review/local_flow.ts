import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type {
  WeeklyHumanSignals,
} from "../../../_shared/weekly_review/contract.ts";
import type { ActiveTransformationRuntime } from "../../../_shared/v2-runtime.ts";
import {
  normalizeNoteInformation,
  type NoteInformation,
  type NoteInformationTargetDispatcher,
  sanitizeLocalExitNoteInformation,
  sanitizeLocalExitTargetDispatcher,
} from "../../contracts/note_information.v1.ts";
import {
  RECENT_MESSAGE_LIMITS,
  recentChatMessagesFromHistory,
} from "../../context/recent_messages_policy.ts";
import {
  loadRecentEffectsLedgerSummary,
  serviceRoleLedgerReadClient,
} from "../../context/loader.ts";
import type { OperationRuntimeResult } from "../../router/effect_ledger_adapter.ts";
import {
  type ActiveActionCandidateForDirectEffects,
  buildDirectEffectConfirmationContext,
  type DirectEffectConfirmationContext,
  directEffectLocalDispatcherPromptLines,
  directEffectTimeContextFromTurnFrame,
  withDirectEffectLocalContext,
} from "../../router/direct_effect_local_context.ts";
import {
  localOneShotDirectEffectPromptLines,
  type LocalOneShotDirectEffectRequest,
  normalizeLocalOneShotDirectEffectRequest,
  oneShotDirectEffectFromLocalRequest,
} from "../../router/one_shot_local_direct_effect.ts";
import type {
  TurnFrame,
} from "../../contracts/turn_frame.v1.ts";
import {
  clearWeeklyReviewState,
  readWeeklyReviewState,
  writeWeeklyReviewState,
} from "./state.ts";
import { runWeeklyReviewVisibleAgent } from "./visible_agent.ts";

export const WEEKLY_REVIEW_EXIT_MEMO_KEY =
  "__last_weekly_adaptive_review_exit_memo";

export type WeeklyReviewLocalFlowAction =
  | "answer_weekly_question"
  | "confirm_weekly_diagnostic"
  | "reject_weekly_diagnostic"
  | "clarify_human_signal"
  | "recap_weekly"
  | "explain_weekly_reasoning"
  | "forgotten_progress_correction"
  | "clarify_forgotten_progress"
  | "complete_weekly_no_change"
  | "complete_flow"
  | "exit_to_global_dispatcher"
  | "defer_flow"
  | "safety_preempt";

export type WeeklyReviewFeltProgress =
  | "aligned"
  | "encouraged"
  | "neutral"
  | "frustrated"
  | "disconnected"
  | "worried"
  | "unclear"
  | "unknown";

export type WeeklyReviewVisibleTaskKind =
  | "ask_week_experience"
  | "review_action_gaps"
  | "explore_action_blocker"
  | "qualify_attack_or_defense_fit"
  | "ask_global_progress_feeling"
  | "deepen_global_progress"
  | "qualify_solution_fit"
  | "offer_child_detour"
  | "weekly_adjust_recommendation"
  | "weekly_synthesis"
  | "weekly_closure"
  | "answer_weekly_question"
  | "clarify_human_signal"
  | "weekly_recap"
  | "explain_reasoning"
  | "forgotten_progress_clarify"
  | "forgotten_progress_ack"
  | "forgotten_progress_blocked"
  | "stop_close"
  | "stop_or_cancel"
  | "inline_tool_return"
  | "exit_or_cancel"
  | "safety_transition"
  | "safety";

export type WeeklyReviewGateStatus =
  | "missing"
  | "captured"
  | "needs_deeper"
  | "complete";

export type WeeklySynthesisVisibleStatus = "not_rendered" | "rendered";

export type WeeklyReviewGates = {
  week_experience_status: WeeklyReviewGateStatus;
  action_review_status: WeeklyReviewGateStatus;
  global_progress_status: WeeklyReviewGateStatus;
  felt_progress_status: WeeklyReviewGateStatus;
  solution_fit_status: WeeklyReviewGateStatus;
  synthesis_status: WeeklyReviewGateStatus;
  closure_status: WeeklyReviewGateStatus;
};

export type WeeklyReviewDetourKind = "none";

export type WeeklyReviewDetourReadiness =
  | "none"
  | "explore_fit"
  | "offer"
  | "user_confirmed";

export type WeeklyReviewDetourCandidate = {
  kind: WeeklyReviewDetourKind;
  source_stage: string | null;
  target_action_or_plan: string | null;
  fit_hypothesis: string | null;
  readiness: WeeklyReviewDetourReadiness;
  user_consent: boolean;
  scope: Record<string, unknown>;
  return_focus: string | null;
};

export type WeeklyReviewActionStatusCorrection = {
  plan_item_id: string | null;
  occurrence_id: string | null;
  title: string | null;
  corrected_status: "completed" | "partial" | "missed" | "unknown";
  user_evidence: string | null;
  source_turn_summary: string | null;
};

export type WeeklyReviewDirectEffectRequest = LocalOneShotDirectEffectRequest;

export type WeeklyPlanningContextMode =
  | "next_week_configured"
  | "next_level_required";

export type WeeklyPlanningContext = {
  mode: WeeklyPlanningContextMode;
  current_week: {
    start_date: string | null;
    end_date: string | null;
  };
  transformation_objective: {
    title: string | null;
    user_summary: string | null;
    success_definition: string | null;
    main_constraint: string | null;
  };
  plan_rationale: string | null;
  next_week: {
    available: boolean;
    week_order: number | null;
    title: string | null;
    focus: string | null;
    action_focus: string[];
    progression_note: string | null;
    success_signal: string | null;
    reps_summary: string | null;
  } | null;
  next_level: {
    available: boolean;
    level_order: number | null;
    title: string | null;
    intention: string | null;
    preview_summary: string | null;
    validation_input_destination: string;
  } | null;
  adjustment_destination: {
    // W4.4 (KEEL) — valeur UNIQUE. Les deux modes precedents,
    // `adjust_plan_platform` (« Ajuster mon plan ») et `level_validation`
    // (« Validation du niveau »), designaient des surfaces SUPPRIMEES en W2:
    // `adjust-plan-v1` / `PlanRevisionPanel` et `complete-level-v1` /
    // `LevelCompletionModal` n'existent plus. Le weekly proposait donc chaque
    // dimanche deux portes fermees. L'union est reduite a une seule valeur
    // pour que le compilateur interdise de reconstruire l'une des deux.
    mode: "coach_review";
    label: string;
    instruction: string;
    chat_mutation_allowed: false;
  };
};

/**
 * W4.4 — la sortie KEEL du weekly: une SYNTHESE vers le coach.
 *
 * Doctrine (CONTRACT): « l'IA escalade, le coach decide ». Le weekly n'oriente
 * plus l'eleve vers un ecran ou il reecrirait son plan lui-meme — cet ecran
 * n'existe plus, et le plan appartient au coach.
 *
 * TODO W7 — cablage complet: la synthese doit devenir une ligne
 * `contract_change_requests` (raised_by='sophia', urgency='next_digest') plus
 * la boite de reception coach. Tant que W7 n'est pas la, le weekly ne PROMET
 * rien: il dit que le point remonte au coach, et n'annonce aucune ecriture
 * (verite d'execution — rien n'est annonce qui ne soit une ligne relue).
 */
export const WEEKLY_COACH_DESTINATION = {
  mode: "coach_review",
  label: "Ton coach",
  instruction:
    "Le plan ne se modifie ni par le chat weekly ni par l'eleve: il appartient " +
    "au coach. Ce qui remonte de ce bilan lui est transmis en synthese, et " +
    "c'est lui qui tranche. N'oriente vers aucun ecran d'ajustement de plan ni " +
    "vers une validation de niveau: ces surfaces n'existent plus.",
  chat_mutation_allowed: false,
} as const;

export type WeeklyAdjustRecommendation = {
  status: "none" | "candidate" | "ready" | "surfaced";
  confidence: number;
  mode: WeeklyPlanningContextMode | null;
  what_to_adjust: string[];
  why: string[];
  evidence: string[];
  target_scope: "next_week_plan" | "next_level_inputs" | null;
  destination_instruction: string | null;
  safe_to_surface: boolean;
  surfaced_in_weekly: boolean;
  updated_at: string | null;
};

export type WeeklyReviewConversationContext = {
  state_summary: string;
  week_window: {
    start_date: string | null;
    end_date: string | null;
  };
  field_or_stage: string | null;
  known_values: Record<string, unknown>;
  missing_or_weak_values: string[];
  weekly_strategy: {
    strategy_label_human: string | null;
    reason_human: string | null;
    confidence: "low" | "medium" | "high";
  };
  weekly_planning_context: WeeklyPlanningContext;
  adjust_recommendation: WeeklyAdjustRecommendation;
  plan_contexts: Array<Record<string, unknown>>;
  item_summaries: Array<Record<string, unknown>>;
  handoff_data: Record<string, unknown>;
  forgotten_progress: Record<string, unknown>;
  inline_result: Record<string, unknown>;
  weekly_gates: WeeklyReviewGates;
  detour_candidate: WeeklyReviewDetourCandidate;
  current_action_focus: Record<string, unknown> | null;
  known_action_gaps: Array<Record<string, unknown>>;
  global_objective_signal: Record<string, unknown>;
  felt_progress_signal: Record<string, unknown>;
  child_flow_return_summary: string | null;
  next_required_weekly_step: WeeklyReviewVisibleTaskKind | null;
  tone_constraints: string[];
  do_not_say: string[];
  context_summary: string | null;
  evidence_used: string[];
};

export type WeeklyReviewLocalFlowState = {
  stage:
    | "opening"
    | "week_experience"
    | "action_review"
    | "action_blocker"
    | "global_progress"
    | "solution_fit"
    | "child_detour"
    | "synthesis"
    | "closure"
    | "collecting_human_signal"
    | "strategy_ready"
    | "closing";
  proposal_status:
    | "none"
    | "detour_discussed"
    | "detour_active"
    | "cancelled";
  validation_unlock_status: "locked_until_weekly_complete" | "available";
  human_signals: WeeklyHumanSignals;
  felt_progress: WeeklyReviewFeltProgress;
  weekly_gates: WeeklyReviewGates;
  detour_candidate: WeeklyReviewDetourCandidate;
  synthesis_visible_status: WeeklySynthesisVisibleStatus;
  last_user_signal: string | null;
  last_visible_summary: string | null;
  last_handoff_summary: string | null;
  child_flow: {
    status: "none" | "proposed" | "active" | "completed" | "cancelled";
    flow_id: string | null;
    reason: string | null;
    expected_return_focus: string | null;
    result_summary: string | null;
    result_details?: Record<string, unknown> | null;
  };
  weekly_planning_context: WeeklyPlanningContext;
  adjust_recommendation: WeeklyAdjustRecommendation;
  user_corrected_action_statuses: WeeklyReviewActionStatusCorrection[];
  turn_count: number;
  max_turns: number;
  updated_at: string;
};

export type WeeklyReviewExitMemo = {
  needed: boolean;
  reason:
    | "topic_change"
    | "explicit_tool_request"
    | "product_help"
    | "status_question"
    | "preference_update"
    | "normal_coaching"
    | "safety"
    | "unknown"
    | "none";
  user_intent_summary: string | null;
  local_flow_context: {
    skill_id: "weekly_adaptive_review_v1";
    weekly_stage: string | null;
    week_strategy: string | null;
    last_weekly_question: string | null;
    last_visible_summary: string | null;
    last_handoff_summary: string | null;
    validation_unlock_status: string | null;
    committed_effects: unknown[];
  };
  handoff_hint_for_global_dispatcher: {
    likely_intent:
      | "create_one_shot_reminder"
      | "product_help"
      | "normal_coaching"
      | "unknown";
    why: string | null;
  };
};

export type WeeklyReviewLocalDispatcherOutput = {
  flow_action: WeeklyReviewLocalFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  // true quand le message courant demande d'appliquer/valider/modifier le plan
  // directement depuis le chat ("fais-le pour moi", "valide a ma place"). Ce
  // n'est pas une demande "quoi ajuster": le visible doit refuser sobrement et
  // renvoyer vers la plateforme, sans re-derouler la recommandation.
  chat_plan_mutation_request: boolean;
  modified_fields: string[];
  clear_fields: string[];
  target_dispatcher: NoteInformationTargetDispatcher | "none";
  child_flow: null;
  return_to_parent: null;
  child_flow_context: null;
  weekly_intent: {
    kind:
      | "weekly_answer"
      | "weekly_confirmation"
      | "weekly_rejection"
      | "weekly_recap"
      | "weekly_explain"
      | "detour_request"
      | "detour_revision"
      | "forgotten_progress"
      | "stop"
      | "off_topic"
      | "explicit_tool_request"
      | "safety"
      | "unclear";
    summary: string;
  };
  human_signal_updates: {
    objective_delta: WeeklyHumanSignals["objective_delta"] | null;
    felt_progress: WeeklyReviewFeltProgress | null;
    felt_state: WeeklyHumanSignals["felt_state"] | null;
    dominant_blocker_confirmation: "confirmed" | "rejected" | "unclear" | null;
    user_summary: string | null;
  };
  handoff_updates: {
    status:
      | "none"
      | "requested"
      | "ready"
      | "delivered"
      | "revised"
      | "cancelled";
    requested_adjustment_summary: string | null;
    revision_summary: string | null;
    platform_destination: "Plan" | null;
    scope: {
      kind:
        | "whole_week"
        | "specific_plan"
        | "specific_item"
        | "ambiguous"
        | "none";
      plan_id: string | null;
      plan_title: string | null;
      plan_item_ids: string[];
      scope_summary: string | null;
      needs_scope_clarification: boolean;
    };
  };
  adjust_recommendation: WeeklyAdjustRecommendation;
  forgotten_progress: {
    status:
      | "none"
      | "candidate"
      | "needs_target"
      | "ready_for_progress_tool"
      | "blocked";
    target_hint: string | null;
    outcome_hint: "completed" | "partial" | "unknown" | null;
    evidence: string | null;
  };
  direct_effect_request: WeeklyReviewDirectEffectRequest;
  action_status_updates: WeeklyReviewActionStatusCorrection[];
  weekly_gates: WeeklyReviewGates;
  detour_candidate: WeeklyReviewDetourCandidate;
  state_updates: {
    status:
      | "open"
      | "proposal_discussed"
      | "handoff_ready"
      | "completed"
      | "stopped"
      | "deferred"
      | "exit_to_global"
      | "safety";
    weekly_stage: WeeklyReviewLocalFlowState["stage"];
    validation_unlock_status: "locked_until_weekly_complete" | "available";
    turn_count_increment: number;
    close_after_visible: boolean;
  };
  visible_task: {
    kind: WeeklyReviewVisibleTaskKind;
    instruction: string;
    conversation_context: WeeklyReviewConversationContext | null;
  };
  exit_memo: WeeklyReviewExitMemo;
  note_information: NoteInformation | null;
  evidence: string[];
};

export type WeeklyReviewReducerResult = {
  status:
    | "answered"
    | "handoff"
    | "closed"
    | "exit"
    | "safety"
    | "blocked";
  reason_code: string;
  weekly_state: Record<string, unknown> | null;
  visible_task: WeeklyReviewVisibleTaskKind;
  exit_to_global_dispatcher: boolean;
  tool_execution: OperationRuntimeResult["toolExecution"];
  handoff_summary: string | null;
  answer_summary: string | null;
  target_dispatcher: NoteInformationTargetDispatcher | "none";
  note_information: NoteInformation | null;
  child_flow_handoff: null;
  conversation_context: WeeklyReviewConversationContext | null;
  blocked_effects: Array<{ type: string; reason_code: string }>;
  state_mutation_audit: WeeklyReviewStateMutationAudit;
  evidence: string[];
};

export type WeeklyReviewServerOwnedField =
  | "weekly_flow_state"
  | "stage"
  | "proposal_status"
  | "validation_unlock_status"
  | "human_signals"
  | "felt_progress"
  | "weekly_gates"
  | "daily_derived_evidence"
  | "synthesis_state"
  | "weekly_adaptive_review"
  | "weekly_adaptive_review.plan_patch"
  | "weekly_adaptive_review.plan_patch.requires_confirmation"
  | "weekly_adaptive_review.pending_confirmation"
  | "weekly_planning_context"
  | "adjust_recommendation"
  | "detour_candidate"
  | "synthesis_visible_status"
  | "last_user_signal"
  | "last_visible_summary"
  | "last_handoff_summary"
  | "child_flow"
  | "suspended_weekly_snapshot"
  | "completed_child_result"
  | "user_corrected_action_statuses"
  | "turn_count"
  | "max_turns";

export type WeeklyReviewStateMutationAudit = {
  server_owned_fields: WeeklyReviewServerOwnedField[];
  modified_fields_declared: string[];
  clear_fields_declared: string[];
  applied_fields: string[];
  preserved_fields: string[];
  restored_fields: string[];
  cleared_fields: string[];
  rejected_changes: Array<{
    field: string;
    reason_code: string;
  }>;
};

const WEEKLY_FLOW_SERVER_OWNED_FIELDS: WeeklyReviewServerOwnedField[] = [
  "stage",
  "proposal_status",
  "validation_unlock_status",
  "human_signals",
  "felt_progress",
  "weekly_gates",
  "detour_candidate",
  "synthesis_visible_status",
  "last_user_signal",
  "last_visible_summary",
  "last_handoff_summary",
  "child_flow",
  "weekly_planning_context",
  "adjust_recommendation",
  "user_corrected_action_statuses",
  "turn_count",
  "max_turns",
];

const WEEKLY_SERVER_OWNED_FIELDS: WeeklyReviewServerOwnedField[] = [
  "weekly_flow_state",
  ...WEEKLY_FLOW_SERVER_OWNED_FIELDS,
  "daily_derived_evidence",
  "synthesis_state",
  "weekly_adaptive_review",
  "weekly_adaptive_review.plan_patch",
  "weekly_adaptive_review.plan_patch.requires_confirmation",
  "weekly_adaptive_review.pending_confirmation",
  "weekly_planning_context",
  "adjust_recommendation",
  "suspended_weekly_snapshot",
  "completed_child_result",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function withoutLegacyPayloadFields(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const { constraints: _constraints, user_words: _userWords, ...rest } = value;
  return rest;
}

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function nullableString(value: unknown): string | null {
  const text = cleanText(value);
  return text && text !== "null" ? text : null;
}

function stringArray(value: unknown, max = 12): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean).slice(0, max)
    : [];
}

function addUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw;
  let cleaned = String(raw ?? "").trim();
  if (cleaned.startsWith("```")) {
    const firstLineEnd = cleaned.indexOf("\n");
    cleaned = firstLineEnd >= 0 ? cleaned.slice(firstLineEnd + 1) : "";
  }
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("weekly_review_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!isRecord(parsed)) {
    throw new Error("weekly_review_local_dispatcher_not_object");
  }
  return parsed;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[] | Set<string>,
  fallback: T,
): T {
  const raw = cleanText(value);
  const allowedValues: readonly string[] = Array.isArray(allowed)
    ? allowed
    : [...allowed];
  const has = allowedValues.includes(raw);
  return has ? raw as T : fallback;
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

const FLOW_ACTIONS: WeeklyReviewLocalFlowAction[] = [
  "answer_weekly_question",
  "confirm_weekly_diagnostic",
  "reject_weekly_diagnostic",
  "clarify_human_signal",
  "recap_weekly",
  "explain_weekly_reasoning",
  "forgotten_progress_correction",
  "clarify_forgotten_progress",
  "complete_weekly_no_change",
  "complete_flow",
  "exit_to_global_dispatcher",
  "defer_flow",
  "safety_preempt",
];

function legacyToken(...parts: string[]): string {
  return parts.join("_");
}

function normalizeWeeklyFlowAction(
  value: unknown,
): WeeklyReviewLocalFlowAction {
  const raw = cleanText(value);
  if (
    raw === "safety_preempt" ||
    raw === legacyToken("handoff", "to", "local", "flow") ||
    raw === legacyToken("inline", "tool", "roundtrip")
  ) {
    return "exit_to_global_dispatcher";
  }
  return enumValue<WeeklyReviewLocalFlowAction>(
    raw,
    FLOW_ACTIONS,
    "clarify_human_signal",
  );
}

const VISIBLE_TASKS: WeeklyReviewVisibleTaskKind[] = [
  "ask_week_experience",
  "review_action_gaps",
  "explore_action_blocker",
  "qualify_attack_or_defense_fit",
  "ask_global_progress_feeling",
  "deepen_global_progress",
  "qualify_solution_fit",
  "offer_child_detour",
  "weekly_adjust_recommendation",
  "weekly_synthesis",
  "weekly_closure",
  "answer_weekly_question",
  "clarify_human_signal",
  "weekly_recap",
  "explain_reasoning",
  "forgotten_progress_clarify",
  "forgotten_progress_ack",
  "forgotten_progress_blocked",
  "stop_close",
  "stop_or_cancel",
  "inline_tool_return",
  "exit_or_cancel",
  "safety_transition",
  "safety",
];

const WEEKLY_GATE_STATUSES: WeeklyReviewGateStatus[] = [
  "missing",
  "captured",
  "needs_deeper",
  "complete",
];

const DETOUR_KINDS: WeeklyReviewDetourKind[] = [
  "none",
];

const DETOUR_READINESS_VALUES: WeeklyReviewDetourReadiness[] = [
  "none",
  "explore_fit",
  "offer",
  "user_confirmed",
];

const WEEKLY_INTENTS: WeeklyReviewLocalDispatcherOutput["weekly_intent"][
  "kind"
][] = [
  "weekly_answer",
  "weekly_confirmation",
  "weekly_rejection",
  "weekly_recap",
  "weekly_explain",
  "detour_request",
  "detour_revision",
  "forgotten_progress",
  "stop",
  "off_topic",
  "explicit_tool_request",
  "safety",
  "unclear",
];

const OBJECTIVE_DELTAS: Array<WeeklyHumanSignals["objective_delta"]> = [
  "clear_progress",
  "slight_progress",
  "stable",
  "regression",
  "unclear",
  "unknown",
];

const FELT_STATES: Array<WeeklyHumanSignals["felt_state"]> = [
  "energized",
  "stable",
  "tired_but_ok",
  "frustrated",
  "overloaded",
  "lost",
  "unknown",
];

const FELT_PROGRESS_VALUES: WeeklyReviewFeltProgress[] = [
  "aligned",
  "encouraged",
  "neutral",
  "frustrated",
  "disconnected",
  "worried",
  "unclear",
  "unknown",
];

function humanSignalOrNull<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null {
  const raw = cleanText(value);
  return raw === "null" || !raw ? null : enumValue(raw, allowed, null as never);
}

function dominantBlockerConfirmation(
  value: unknown,
): "confirmed" | "rejected" | "unclear" | null {
  const raw = cleanText(value);
  if (!raw || raw === "null") return null;
  return enumValue<"confirmed" | "rejected" | "unclear">(
    raw,
    ["confirmed", "rejected", "unclear"],
    "unclear",
  );
}

function forgottenOutcomeHint(
  value: unknown,
): "completed" | "partial" | "unknown" | null {
  const raw = cleanText(value);
  if (!raw || raw === "null") return null;
  return enumValue<"completed" | "partial" | "unknown">(
    raw,
    ["completed", "partial", "unknown"],
    "unknown",
  );
}

function actionStatus(value: unknown): WeeklyReviewActionStatusCorrection[
  "corrected_status"
] {
  const raw = cleanText(value);
  if (raw === "done" || raw === "complete" || raw === "completed") {
    return "completed";
  }
  if (raw === "partial" || raw === "partiel") return "partial";
  if (
    raw === "missed" || raw === "not_done" || raw === "not_completed" ||
    raw === "failed"
  ) {
    return "missed";
  }
  return "unknown";
}

function normalizeActionStatusCorrections(
  raw: unknown,
): WeeklyReviewActionStatusCorrection[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const root = isRecord(item) ? item : {};
    const planItemId = nullableString(root.plan_item_id);
    const occurrenceId = nullableString(root.occurrence_id);
    const title = nullableString(root.title);
    const correctedStatus = actionStatus(
      root.corrected_status ?? root.status ?? root.outcome,
    );
    if (!planItemId && !occurrenceId && !title) return [];
    return [{
      plan_item_id: planItemId,
      occurrence_id: occurrenceId,
      title,
      corrected_status: correctedStatus,
      user_evidence: nullableString(root.user_evidence ?? root.evidence),
      source_turn_summary: nullableString(root.source_turn_summary),
    }];
  }).slice(0, 12);
}

function correctionKey(correction: WeeklyReviewActionStatusCorrection): string {
  if (correction.occurrence_id) return `occurrence:${correction.occurrence_id}`;
  if (correction.plan_item_id) return `plan_item:${correction.plan_item_id}`;
  return `title:${cleanText(correction.title).toLowerCase()}`;
}

function mergeActionStatusCorrections(
  previous: WeeklyReviewActionStatusCorrection[],
  incoming: WeeklyReviewActionStatusCorrection[],
): WeeklyReviewActionStatusCorrection[] {
  const byKey = new Map<string, WeeklyReviewActionStatusCorrection>();
  for (const correction of previous) {
    const key = correctionKey(correction);
    if (key !== "title:") byKey.set(key, correction);
  }
  for (const correction of incoming) {
    const key = correctionKey(correction);
    if (key !== "title:") byKey.set(key, correction);
  }
  return [...byKey.values()].slice(-12);
}

function normalizeWeeklyGates(
  raw: unknown,
  fallback: Partial<WeeklyReviewGates> = {},
): WeeklyReviewGates {
  const root = isRecord(raw) ? raw : {};
  return {
    week_experience_status: enumValue(
      root.week_experience_status,
      WEEKLY_GATE_STATUSES,
      fallback.week_experience_status ?? "missing",
    ),
    action_review_status: enumValue(
      root.action_review_status,
      WEEKLY_GATE_STATUSES,
      fallback.action_review_status ?? "missing",
    ),
    global_progress_status: enumValue(
      root.global_progress_status,
      WEEKLY_GATE_STATUSES,
      fallback.global_progress_status ?? "missing",
    ),
    felt_progress_status: enumValue(
      root.felt_progress_status,
      WEEKLY_GATE_STATUSES,
      fallback.felt_progress_status ?? "missing",
    ),
    solution_fit_status: enumValue(
      root.solution_fit_status,
      WEEKLY_GATE_STATUSES,
      fallback.solution_fit_status ?? "missing",
    ),
    synthesis_status: enumValue(
      root.synthesis_status,
      WEEKLY_GATE_STATUSES,
      fallback.synthesis_status ?? "missing",
    ),
    closure_status: enumValue(
      root.closure_status,
      WEEKLY_GATE_STATUSES,
      fallback.closure_status ?? "missing",
    ),
  };
}

function normalizeDetourCandidate(
  raw: unknown,
): WeeklyReviewDetourCandidate {
  const root = isRecord(raw) ? raw : {};
  const scope = isRecord(root.scope) ? root.scope : {};
  return {
    kind: enumValue(root.kind, DETOUR_KINDS, "none"),
    source_stage: nullableString(root.source_stage),
    target_action_or_plan: nullableString(root.target_action_or_plan),
    fit_hypothesis: nullableString(root.fit_hypothesis),
    readiness: enumValue(root.readiness, DETOUR_READINESS_VALUES, "none"),
    user_consent: root.user_consent === true,
    scope,
    return_focus: nullableString(root.return_focus),
  };
}

function isAllowedWeeklyDetourKind(
  value: unknown,
): value is WeeklyReviewDetourKind {
  return typeof value === "string" &&
    DETOUR_KINDS.includes(value as WeeklyReviewDetourKind);
}

function mergeWeeklyGates(
  previous: WeeklyReviewGates,
  next: WeeklyReviewGates,
): WeeklyReviewGates {
  const keepCaptured = (
    previousValue: WeeklyReviewGateStatus,
    nextValue: WeeklyReviewGateStatus,
  ) =>
    nextValue === "missing" && previousValue !== "missing"
      ? previousValue
      : nextValue;
  return {
    week_experience_status: keepCaptured(
      previous.week_experience_status,
      next.week_experience_status,
    ),
    action_review_status: keepCaptured(
      previous.action_review_status,
      next.action_review_status,
    ),
    global_progress_status: keepCaptured(
      previous.global_progress_status,
      next.global_progress_status,
    ),
    felt_progress_status: keepCaptured(
      previous.felt_progress_status,
      next.felt_progress_status,
    ),
    solution_fit_status: keepCaptured(
      previous.solution_fit_status,
      next.solution_fit_status,
    ),
    synthesis_status: keepCaptured(
      previous.synthesis_status,
      next.synthesis_status,
    ),
    closure_status: keepCaptured(
      previous.closure_status,
      next.closure_status,
    ),
  };
}

function solutionFitCapturedByStructuredOutput(
  output: WeeklyReviewLocalDispatcherOutput,
): boolean {
  return output.adjust_recommendation.safe_to_surface ||
    output.weekly_gates.solution_fit_status === "captured" ||
    output.weekly_gates.solution_fit_status === "complete";
}

function applyWeeklyGateInvariants(
  gates: WeeklyReviewGates,
  output: WeeklyReviewLocalDispatcherOutput,
): WeeklyReviewGates {
  if (
    gates.solution_fit_status === "missing" &&
    solutionFitCapturedByStructuredOutput(output)
  ) {
    return { ...gates, solution_fit_status: "captured" };
  }
  return gates;
}

function applyWeeklyVisibleGateInvariants(args: {
  gates: WeeklyReviewGates;
  previousFlow: WeeklyReviewLocalFlowState;
  output: WeeklyReviewLocalDispatcherOutput;
}): WeeklyReviewGates {
  const completionRequested = args.output.flow_action === "complete_flow" ||
    args.output.flow_action === "complete_weekly_no_change";
  const synthesisAlreadyVisible =
    args.previousFlow.synthesis_visible_status === "rendered";
  if (
    args.gates.synthesis_status !== "complete" &&
    synthesisAlreadyVisible &&
    (completionRequested || args.gates.closure_status === "complete")
  ) {
    return { ...args.gates, synthesis_status: "complete" };
  }
  if (
    args.gates.closure_status === "complete" &&
    args.gates.synthesis_status !== "complete"
  ) {
    return { ...args.gates, closure_status: "missing" };
  }
  return args.gates;
}

function synthesisVisibleStatusAfterVisibleTask(
  previous: WeeklySynthesisVisibleStatus,
  visibleTask: WeeklyReviewVisibleTaskKind,
): WeeklySynthesisVisibleStatus {
  return visibleTask === "weekly_synthesis" ? "rendered" : previous;
}

type WeeklyReviewStateMergeConstraints = {
  allowValidationUnlock?: boolean;
  allowDetourChange?: boolean;
  allowDetourClear?: boolean;
  allowChildFlowChange?: boolean;
  allowChildFlowClear?: boolean;
  allowGateRegression?: boolean;
};

function createWeeklyStateMutationAudit(
  output?: Pick<
    WeeklyReviewLocalDispatcherOutput,
    "modified_fields" | "clear_fields"
  >,
): WeeklyReviewStateMutationAudit {
  return {
    server_owned_fields: [...WEEKLY_SERVER_OWNED_FIELDS],
    modified_fields_declared: output?.modified_fields ?? [],
    clear_fields_declared: output?.clear_fields ?? [],
    applied_fields: [],
    preserved_fields: [],
    restored_fields: [],
    cleared_fields: [],
    rejected_changes: [],
  };
}

function weeklyServerOwnedFieldFromText(
  value: string,
): WeeklyReviewServerOwnedField | null {
  const text = cleanText(value);
  const compact = text.split(".").pop() ?? "";
  const field = (WEEKLY_SERVER_OWNED_FIELDS as string[]).includes(text)
    ? text
    : compact;
  return (WEEKLY_SERVER_OWNED_FIELDS as string[]).includes(field)
    ? field as WeeklyReviewServerOwnedField
    : null;
}

function rejectWeeklyStateMutation(
  audit: WeeklyReviewStateMutationAudit,
  field: WeeklyReviewServerOwnedField,
  reasonCode: string,
): void {
  addUnique(audit.restored_fields, field);
  audit.rejected_changes.push({
    field,
    reason_code: reasonCode,
  });
}

function weeklyGateRank(status: WeeklyReviewGateStatus): number {
  switch (status) {
    case "missing":
      return 0;
    case "captured":
      return 1;
    case "needs_deeper":
      return 2;
    case "complete":
      return 3;
  }
}

function preserveNonRegressingWeeklyGates(args: {
  previous: WeeklyReviewGates;
  proposed: WeeklyReviewGates;
  allowGateRegression?: boolean;
  audit: WeeklyReviewStateMutationAudit;
}): WeeklyReviewGates {
  if (args.allowGateRegression) return args.proposed;
  const next: WeeklyReviewGates = { ...args.proposed };
  for (
    const key of Object.keys(args.previous) as Array<keyof WeeklyReviewGates>
  ) {
    if (
      weeklyGateRank(args.proposed[key]) < weeklyGateRank(args.previous[key])
    ) {
      next[key] = args.previous[key];
      rejectWeeklyStateMutation(
        args.audit,
        "weekly_gates",
        "not_stabilized_enough",
      );
    }
  }
  return next;
}

function mergeWeeklyReviewLocalState(args: {
  previous: WeeklyReviewLocalFlowState;
  proposed: WeeklyReviewLocalFlowState;
  output: WeeklyReviewLocalDispatcherOutput;
  transition: string;
  now: string;
  constraints?: WeeklyReviewStateMergeConstraints;
}): {
  state: WeeklyReviewLocalFlowState;
  audit: WeeklyReviewStateMutationAudit;
} {
  void args.transition;
  const audit = createWeeklyStateMutationAudit(args.output);
  const constraints = args.constraints ?? {};
  const next: WeeklyReviewLocalFlowState = {
    ...args.proposed,
    updated_at: args.now,
  };

  next.weekly_gates = preserveNonRegressingWeeklyGates({
    previous: args.previous.weekly_gates,
    proposed: next.weekly_gates,
    allowGateRegression: constraints.allowGateRegression,
    audit,
  });

  if (
    next.validation_unlock_status === "available" &&
    !constraints.allowValidationUnlock
  ) {
    next.validation_unlock_status = args.previous.validation_unlock_status;
    rejectWeeklyStateMutation(
      audit,
      "validation_unlock_status",
      "invalid_status_transition",
    );
  }

  if (next.max_turns !== args.previous.max_turns) {
    next.max_turns = args.previous.max_turns;
    rejectWeeklyStateMutation(audit, "max_turns", "blocked_by_constraint");
  }

  if (
    next.turn_count < args.previous.turn_count ||
    next.turn_count > args.previous.turn_count + 2
  ) {
    next.turn_count = args.previous.turn_count +
      Math.max(0, Math.min(2, args.output.state_updates.turn_count_increment));
    rejectWeeklyStateMutation(audit, "turn_count", "invalid_status_transition");
  }

  if (
    args.previous.detour_candidate.kind !== "none" &&
    next.detour_candidate.kind === "none" &&
    !constraints.allowDetourClear
  ) {
    next.detour_candidate = args.previous.detour_candidate;
    rejectWeeklyStateMutation(
      audit,
      "detour_candidate",
      "selected_option_missing",
    );
  } else if (
    !sameJson(args.previous.detour_candidate, next.detour_candidate) &&
    next.detour_candidate.kind !== "none" &&
    !constraints.allowDetourChange
  ) {
    next.detour_candidate = args.previous.detour_candidate;
    rejectWeeklyStateMutation(
      audit,
      "detour_candidate",
      "direct_handoff_flag_missing",
    );
  }

  if (
    args.previous.child_flow.status !== "none" &&
    next.child_flow.status === "none" &&
    !constraints.allowChildFlowClear
  ) {
    next.child_flow = args.previous.child_flow;
    rejectWeeklyStateMutation(
      audit,
      "child_flow",
      "pending_confirmation_missing",
    );
  } else if (
    !sameJson(args.previous.child_flow, next.child_flow) &&
    !constraints.allowChildFlowChange
  ) {
    next.child_flow = args.previous.child_flow;
    rejectWeeklyStateMutation(audit, "child_flow", "invalid_status_transition");
  }

  if (
    next.user_corrected_action_statuses.length <
      args.previous.user_corrected_action_statuses.length
  ) {
    next.user_corrected_action_statuses =
      args.previous.user_corrected_action_statuses;
    rejectWeeklyStateMutation(
      audit,
      "user_corrected_action_statuses",
      "candidate_missing",
    );
  }

  for (const declaredClear of args.output.clear_fields) {
    const field = weeklyServerOwnedFieldFromText(declaredClear);
    if (!field) continue;
    if (!WEEKLY_FLOW_SERVER_OWNED_FIELDS.includes(field)) {
      rejectWeeklyStateMutation(audit, field, "blocked_by_constraint");
      continue;
    }
    const detourAlreadyClear = field === "detour_candidate" &&
      args.previous.detour_candidate.kind === "none" &&
      next.detour_candidate.kind === "none";
    const clearAllowed = (field === "detour_candidate" &&
      (constraints.allowDetourClear || detourAlreadyClear)) ||
      (field === "child_flow" && constraints.allowChildFlowClear);
    if (clearAllowed) {
      addUnique(audit.cleared_fields, field);
    } else {
      (next as any)[field] = (args.previous as any)[field];
      rejectWeeklyStateMutation(audit, field, "blocked_by_constraint");
    }
  }

  for (const declaredModification of args.output.modified_fields) {
    const field = weeklyServerOwnedFieldFromText(declaredModification);
    if (!field) continue;
    if (!WEEKLY_FLOW_SERVER_OWNED_FIELDS.includes(field)) {
      addUnique(audit.preserved_fields, field);
      continue;
    }
    if (sameJson((args.previous as any)[field], (next as any)[field])) {
      addUnique(audit.preserved_fields, field);
    }
  }

  for (const field of WEEKLY_FLOW_SERVER_OWNED_FIELDS) {
    if (sameJson((args.previous as any)[field], (next as any)[field])) {
      addUnique(audit.preserved_fields, field);
    } else {
      addUnique(audit.applied_fields, field);
    }
  }

  return { state: next, audit };
}

function defaultDetourCandidate(): WeeklyReviewDetourCandidate {
  return {
    kind: "none",
    source_stage: null,
    target_action_or_plan: null,
    fit_hypothesis: null,
    readiness: "none",
    user_consent: false,
    scope: {},
    return_focus: null,
  };
}

const WEEKLY_ADJUST_RECOMMENDATION_CONFIDENCE_THRESHOLD = 0.95;

function emptyWeeklyPlanningContext(
  weekWindow: { start_date: string | null; end_date: string | null },
): WeeklyPlanningContext {
  return {
    mode: "next_level_required",
    current_week: weekWindow,
    transformation_objective: {
      title: null,
      user_summary: null,
      success_definition: null,
      main_constraint: null,
    },
    plan_rationale: null,
    next_week: null,
    next_level: {
      available: false,
      level_order: null,
      title: null,
      intention: null,
      preview_summary: null,
      validation_input_destination: WEEKLY_COACH_DESTINATION.label,
    },
    adjustment_destination: { ...WEEKLY_COACH_DESTINATION },
  };
}

function normalizeWeeklyPlanningContext(
  raw: unknown,
  fallbackWeekWindow: { start_date: string | null; end_date: string | null },
): WeeklyPlanningContext {
  const root = isRecord(raw) ? raw : {};
  const current = isRecord(root.current_week) ? root.current_week : {};
  const objective = isRecord(root.transformation_objective)
    ? root.transformation_objective
    : {};
  const rawNextWeek = isRecord(root.next_week) ? root.next_week : null;
  const rawNextLevel = isRecord(root.next_level) ? root.next_level : null;
  const mode = enumValue<WeeklyPlanningContextMode>(
    root.mode,
    ["next_week_configured", "next_level_required"],
    rawNextWeek?.available === true
      ? "next_week_configured"
      : "next_level_required",
  );
  const base = emptyWeeklyPlanningContext(fallbackWeekWindow);
  const nextWeek = rawNextWeek
    ? {
      available: rawNextWeek.available === true,
      week_order: Number.isFinite(Number(rawNextWeek.week_order))
        ? Number(rawNextWeek.week_order)
        : null,
      title: nullableString(rawNextWeek.title),
      focus: nullableString(rawNextWeek.focus),
      action_focus: stringArray(rawNextWeek.action_focus, 8),
      progression_note: nullableString(rawNextWeek.progression_note),
      success_signal: nullableString(rawNextWeek.success_signal),
      reps_summary: nullableString(rawNextWeek.reps_summary),
    }
    : null;
  const nextLevel = rawNextLevel
    ? {
      available: rawNextLevel.available === true,
      level_order: Number.isFinite(Number(rawNextLevel.level_order))
        ? Number(rawNextLevel.level_order)
        : null,
      title: nullableString(rawNextLevel.title),
      intention: nullableString(rawNextLevel.intention),
      preview_summary: nullableString(rawNextLevel.preview_summary),
      // W4.4: la destination n'est plus lue depuis l'etat persiste. Une
      // session ouverte avant ce lot porte encore « Validation du niveau » en
      // base; la relire ressusciterait la surface supprimee au tour suivant.
      validation_input_destination: WEEKLY_COACH_DESTINATION.label,
    }
    : base.next_level;
  return {
    mode,
    current_week: {
      start_date: nullableString(current.start_date) ??
        fallbackWeekWindow.start_date,
      end_date: nullableString(current.end_date) ?? fallbackWeekWindow.end_date,
    },
    transformation_objective: {
      title: nullableString(objective.title),
      user_summary: nullableString(objective.user_summary),
      success_definition: nullableString(objective.success_definition),
      main_constraint: nullableString(objective.main_constraint),
    },
    plan_rationale: nullableString(root.plan_rationale),
    next_week: mode === "next_week_configured" ? nextWeek : null,
    next_level: mode === "next_level_required" ? nextLevel : null,
    // Constante, jamais reconstruite depuis l'etat persiste (voir ci-dessus).
    adjustment_destination: { ...WEEKLY_COACH_DESTINATION },
  };
}

function planContentFromRuntime(
  runtime: ActiveTransformationRuntime | null | undefined,
): Record<string, unknown> {
  return isRecord(runtime?.plan?.content) ? runtime.plan.content : {};
}

function weekOrderFromWeeklyState(
  weeklyState: Record<string, unknown>,
): number | null {
  const review = isRecord(weeklyState.weekly_progress_review)
    ? weeklyState.weekly_progress_review
    : {};
  const explicit = Number(
    (review as any).week_order ?? (review as any).week_index,
  );
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const weekWindow = weekWindowFromState(weeklyState);
  const start = Date.parse(weekWindow.start_date ?? "");
  const generatedWeeks = Array.isArray((review as any).weeks)
    ? (review as any).weeks
    : [];
  for (const week of generatedWeeks) {
    if (!isRecord(week)) continue;
    const candidateStart = Date.parse(
      String(week.week_start ?? week.start_date ?? ""),
    );
    if (Number.isFinite(start) && candidateStart === start) {
      const order = Number(week.week_order);
      return Number.isFinite(order) && order > 0 ? order : null;
    }
  }
  return null;
}

function buildWeeklyPlanningContext(args: {
  weeklyState: Record<string, unknown>;
  v2Runtime?: ActiveTransformationRuntime | null;
}): WeeklyPlanningContext {
  const weekWindow = weekWindowFromState(args.weeklyState);
  const existing = normalizeWeeklyPlanningContext(
    (args.weeklyState.weekly_flow_state as any)?.weekly_planning_context,
    weekWindow,
  );
  const content = planContentFromRuntime(args.v2Runtime);
  if (!Object.keys(content).length) return existing;
  const currentLevel = isRecord(content.current_level_runtime)
    ? content.current_level_runtime
    : {};
  const strategy = isRecord(content.strategy) ? content.strategy : {};
  const blueprint = isRecord(content.plan_blueprint)
    ? content.plan_blueprint
    : {};
  const currentOrder = Number(currentLevel.level_order);
  const weeks = Array.isArray(currentLevel.weeks) ? currentLevel.weeks : [];
  const currentWeekOrder = weekOrderFromWeeklyState(args.weeklyState);
  const currentWeek = currentWeekOrder
    ? weeks.find((week) =>
      isRecord(week) && Number(week.week_order) === currentWeekOrder
    )
    : weeks.find((week) => isRecord(week) && week.status === "current");
  const currentOrderForNext = isRecord(currentWeek)
    ? Number(currentWeek.week_order)
    : currentWeekOrder;
  const nextWeek = Number.isFinite(Number(currentOrderForNext))
    ? weeks.find((week) =>
      isRecord(week) &&
      Number(week.week_order) === Number(currentOrderForNext) + 1
    )
    : weeks.find((week) => isRecord(week) && week.status === "upcoming");
  const levels: unknown[] = Array.isArray((blueprint as any).levels)
    ? (blueprint as any).levels
    : [];
  const nextLevel = Number.isFinite(currentOrder)
    ? levels.find((level) =>
      isRecord(level) && Number(level.level_order) === currentOrder + 1
    )
    : levels.find((level) => isRecord(level) && level.status === "upcoming");
  const hasNextWeek = isRecord(nextWeek);
  const mode: WeeklyPlanningContextMode = hasNextWeek
    ? "next_week_configured"
    : "next_level_required";
  return normalizeWeeklyPlanningContext({
    mode,
    current_week: weekWindow,
    transformation_objective: {
      title: nullableString((args.v2Runtime?.transformation as any)?.title) ??
        nullableString(content.title),
      user_summary: nullableString(content.user_summary),
      success_definition: nullableString(strategy.success_definition),
      main_constraint: nullableString(strategy.main_constraint),
    },
    plan_rationale: [
      nullableString(currentLevel.rationale),
      nullableString(currentLevel.why_this_now),
      nullableString(currentLevel.how_this_phase_works),
    ].filter(Boolean).join(" ") || nullableString(content.progression_logic),
    next_week: hasNextWeek
      ? {
        available: true,
        week_order: Number((nextWeek as any).week_order) || null,
        title: nullableString((nextWeek as any).title),
        focus: nullableString((nextWeek as any).focus),
        action_focus: stringArray((nextWeek as any).action_focus, 8),
        progression_note: nullableString((nextWeek as any).progression_note),
        success_signal: nullableString((nextWeek as any).success_signal),
        reps_summary: nullableString((nextWeek as any).reps_summary),
      }
      : null,
    next_level: !hasNextWeek
      ? {
        available: isRecord(nextLevel),
        level_order: isRecord(nextLevel)
          ? Number((nextLevel as any).level_order) || null
          : null,
        title: isRecord(nextLevel)
          ? nullableString((nextLevel as any).title)
          : null,
        intention: isRecord(nextLevel)
          ? nullableString((nextLevel as any).intention)
          : null,
        preview_summary: isRecord(nextLevel)
          ? nullableString((nextLevel as any).preview_summary)
          : null,
        validation_input_destination: WEEKLY_COACH_DESTINATION.label,
      }
      : null,
    adjustment_destination: { ...WEEKLY_COACH_DESTINATION },
  }, weekWindow);
}

function emptyAdjustRecommendation(): WeeklyAdjustRecommendation {
  return {
    status: "none",
    confidence: 0,
    mode: null,
    what_to_adjust: [],
    why: [],
    evidence: [],
    target_scope: null,
    destination_instruction: null,
    safe_to_surface: false,
    surfaced_in_weekly: false,
    updated_at: null,
  };
}

function normalizeAdjustRecommendation(
  raw: unknown,
): WeeklyAdjustRecommendation {
  const root = isRecord(raw) ? raw : {};
  const confidence = Math.max(0, Math.min(1, Number(root.confidence) || 0));
  const what = stringArray(root.what_to_adjust ?? root.what, 5);
  const why = stringArray(root.why, 5);
  const evidence = stringArray(root.evidence, 8);
  const targetScope = enumValue(
    root.target_scope,
    ["next_week_plan", "next_level_inputs"],
    "next_week_plan",
  ) as WeeklyAdjustRecommendation["target_scope"];
  const enoughEvidence = what.length > 0 && why.length > 0 &&
    evidence.length >= 2;
  const safe =
    confidence >= WEEKLY_ADJUST_RECOMMENDATION_CONFIDENCE_THRESHOLD &&
    enoughEvidence &&
    root.safe_to_surface !== false;
  const status = safe
    ? enumValue(root.status, ["ready", "surfaced"], "ready")
    : confidence > 0 || enoughEvidence
    ? "candidate"
    : "none";
  const rawMode = cleanText(root.mode);
  const mode: WeeklyPlanningContextMode | null =
    rawMode === "next_week_configured" || rawMode === "next_level_required"
      ? rawMode
      : null;
  return {
    status,
    confidence,
    mode,
    what_to_adjust: what,
    why,
    evidence,
    target_scope: status === "none" ? null : targetScope,
    destination_instruction: nullableString(root.destination_instruction),
    safe_to_surface: safe,
    surfaced_in_weekly: root.surfaced_in_weekly === true ||
      status === "surfaced",
    updated_at: nullableString(root.updated_at),
  };
}

function normalizeExitMemo(
  raw: unknown,
  action: WeeklyReviewLocalFlowAction,
): WeeklyReviewExitMemo {
  const root = isRecord(raw) ? raw : {};
  const local = isRecord(root.local_flow_context)
    ? root.local_flow_context
    : {};
  const hint = isRecord(root.handoff_hint_for_global_dispatcher)
    ? root.handoff_hint_for_global_dispatcher
    : {};
  const needed = action === "exit_to_global_dispatcher" ||
    action === "safety_preempt";
  return {
    needed,
    reason: enumValue(
      root.reason,
      [
        "topic_change",
        "explicit_tool_request",
        "product_help",
        "status_question",
        "preference_update",
        "normal_coaching",
        "safety",
        "unknown",
        "none",
      ],
      action === "safety_preempt" ? "safety" : needed ? "unknown" : "none",
    ),
    user_intent_summary: nullableString(root.user_intent_summary),
    local_flow_context: {
      skill_id: "weekly_adaptive_review_v1",
      weekly_stage: nullableString(local.weekly_stage),
      week_strategy: nullableString(local.week_strategy),
      last_weekly_question: nullableString(local.last_weekly_question),
      last_visible_summary: nullableString(local.last_visible_summary),
      last_handoff_summary: nullableString(local.last_handoff_summary),
      validation_unlock_status: nullableString(
        local.validation_unlock_status,
      ),
      committed_effects: Array.isArray(local.committed_effects)
        ? local.committed_effects.slice(0, 8)
        : [],
    },
    handoff_hint_for_global_dispatcher: {
      likely_intent: enumValue(
        hint.likely_intent,
        [
          "create_one_shot_reminder",
          "product_help",
          "normal_coaching",
          "unknown",
        ],
        "unknown",
      ),
      why: nullableString(hint.why),
    },
  };
}

function normalizeTargetDispatcher(
  value: unknown,
): NoteInformationTargetDispatcher | "none" {
  const raw = cleanText(value);
  const allowed: Array<NoteInformationTargetDispatcher | "none" | string> = [
    "none",
    "global",
    "product_help",
  ];
  return allowed.includes(raw as any)
    ? raw as NoteInformationTargetDispatcher | "none"
    : "none";
}

function noteReasonForWeekly(args: {
  action: WeeklyReviewLocalFlowAction;
  targetDispatcher: NoteInformationTargetDispatcher;
  exitMemo: WeeklyReviewExitMemo;
}):
  | "topic_change"
  | "safety"
  | "inline_tool"
  | "bridge"
  | "explicit_user_request" {
  if (args.exitMemo.reason === "safety") {
    return "safety";
  }
  return args.exitMemo.reason === "explicit_tool_request" ||
      args.exitMemo.reason === "product_help" ||
      args.exitMemo.reason === "status_question" ||
      args.exitMemo.reason === "preference_update"
    ? "explicit_user_request"
    : "topic_change";
}

function buildWeeklySourceStateSummary(args: {
  exitMemo: WeeklyReviewExitMemo;
  intentSummary: string;
}): string {
  const local = args.exitMemo.local_flow_context;
  return [
    args.intentSummary,
    local.weekly_stage ? `stage=${local.weekly_stage}` : null,
    local.week_strategy ? `strategy=${local.week_strategy}` : null,
    local.last_handoff_summary ? `handoff=${local.last_handoff_summary}` : null,
    local.validation_unlock_status
      ? `validation=${local.validation_unlock_status}`
      : null,
  ].filter(Boolean).join(" | ") ||
    "Weekly review active; no detailed summary provided.";
}

function normalizeWeeklyNoteInformation(args: {
  raw: unknown;
  action: WeeklyReviewLocalFlowAction;
  targetDispatcher: NoteInformationTargetDispatcher | "none";
  exitMemo: WeeklyReviewExitMemo;
  userWords: string[];
  intentSummary: string;
  evidence: string[];
}): NoteInformation | null {
  const needsNote = args.action === "exit_to_global_dispatcher" ||
    args.action === "safety_preempt";
  if (!needsNote) return null;
  const rawRecord = isRecord(args.raw) ? args.raw : {};
  const target = args.targetDispatcher === "none"
    ? "global"
    : args.targetDispatcher;
  if (Object.keys(rawRecord).length === 0) return null;
  const structuredContext = {
    weekly_intent_summary: args.intentSummary,
    weekly_exit_memo: args.exitMemo,
    weekly_context: args.exitMemo.local_flow_context,
    handoff_hint: args.exitMemo.handoff_hint_for_global_dispatcher,
    evidence: args.evidence,
  };
  const fallback = {
    source_flow_id: "weekly_adaptive_review_v1",
    handoff_reason: noteReasonForWeekly({
      action: args.action,
      targetDispatcher: target,
      exitMemo: args.exitMemo,
    }),
    target_dispatcher: target,
    handoff_context_for_next_dispatcher: JSON.stringify(structuredContext),
    user_words: args.userWords,
    structured_context: {
      ...structuredContext,
      active_flow_summary: buildWeeklySourceStateSummary({
        exitMemo: args.exitMemo,
        intentSummary: args.intentSummary,
      }),
      recommended_next_focus: target,
    },
    risk_score: args.action === "safety_preempt" ? Math.max(7, 0) : 0,
  };
  const normalized = normalizeNoteInformation(
    {
      ...rawRecord,
      user_words: args.userWords,
      structured_context: withoutLegacyPayloadFields(
        isRecord(rawRecord.structured_context)
          ? rawRecord.structured_context
          : fallback.structured_context,
      ),
    },
    fallback,
  );
  const sanitized = sanitizeLocalExitNoteInformation(
    { ...normalized, target_dispatcher: target },
    target,
  );
  if (args.exitMemo.reason !== "safety") return sanitized;
  return {
    ...sanitized,
    handoff_reason: "safety",
    target_dispatcher: "global",
    structured_context: {
      ...sanitized.structured_context,
      target_dispatcher: "global",
      recommended_next_focus: "global",
      safety_signal_for_global_dispatcher: true,
    },
  };
}

export function normalizeWeeklyReviewLocalDispatcherOutput(
  raw: unknown,
): WeeklyReviewLocalDispatcherOutput {
  const root = parseJsonObject(raw);
  const originalAction = cleanText(root.flow_action);
  const rawAction = normalizeWeeklyFlowAction(root.flow_action);
  const normalizedRiskScore = riskScore(root.risk_score);
  const intent = isRecord(root.weekly_intent) ? root.weekly_intent : {};
  const human = isRecord(root.human_signal_updates)
    ? root.human_signal_updates
    : {};
  const handoff = isRecord(root.handoff_updates) ? root.handoff_updates : {};
  const scope = isRecord(handoff.scope) ? handoff.scope : {};
  const forgotten = isRecord(root.forgotten_progress)
    ? root.forgotten_progress
    : {};
  const actionStatusUpdates = normalizeActionStatusCorrections(
    root.action_status_updates,
  );
  const weeklyGatesRoot = isRecord(root.weekly_gates) ? root.weekly_gates : {};
  const detourCandidateRoot = isRecord(root.detour_candidate)
    ? root.detour_candidate
    : {};
  const state = isRecord(root.state_updates) ? root.state_updates : {};
  const visible = isRecord(root.visible_task) ? root.visible_task : {};
  const evidence = stringArray(root.evidence, 10);
  const exitMemo = normalizeExitMemo(root.exit_memo, rawAction);
  const noteRoot = isRecord(root.note_information)
    ? root.note_information
    : isRecord((root as any).noteInformation)
    ? (root as any).noteInformation
    : {};
  const explicitTarget = normalizeTargetDispatcher(
    root.target_dispatcher ?? noteRoot.target_dispatcher,
  );
  const safetyExit = normalizedRiskScore >= 7 ||
    originalAction === "safety_preempt" ||
    exitMemo.reason === "safety";
  const action: WeeklyReviewLocalFlowAction = safetyExit
    ? "exit_to_global_dispatcher"
    : rawAction;
  const targetDispatcher = safetyExit
    ? "global"
    : action === "exit_to_global_dispatcher"
    ? sanitizeLocalExitTargetDispatcher(explicitTarget, "global")
    : "none";
  const weeklyIntent = {
    kind: enumValue(intent.kind, WEEKLY_INTENTS, "unclear"),
    summary: cleanText(intent.summary),
  };
  const normalizedScope = {
    kind: enumValue(
      scope.kind,
      [
        "whole_week",
        "specific_plan",
        "specific_item",
        "ambiguous",
        "none",
      ],
      "none",
    ),
    plan_id: nullableString(scope.plan_id),
    plan_title: nullableString(scope.plan_title),
    plan_item_ids: stringArray(scope.plan_item_ids, 20),
    scope_summary: nullableString(scope.scope_summary),
    needs_scope_clarification: scope.needs_scope_clarification === true,
  };
  const noteInformation = normalizeWeeklyNoteInformation({
    raw: noteRoot,
    action,
    targetDispatcher,
    exitMemo,
    userWords: weeklyIntent.summary ? [weeklyIntent.summary] : [],
    intentSummary: weeklyIntent.summary,
    evidence,
  });
  return {
    flow_action: action,
    confidence: confidence(root.confidence),
    risk_score: normalizedRiskScore,
    chat_plan_mutation_request: root.chat_plan_mutation_request === true,
    modified_fields: stringArray(root.modified_fields, 30),
    clear_fields: stringArray(root.clear_fields, 30),
    target_dispatcher: targetDispatcher,
    child_flow: null,
    return_to_parent: null,
    child_flow_context: null,
    weekly_intent: weeklyIntent,
    human_signal_updates: {
      objective_delta: humanSignalOrNull(
        human.objective_delta,
        OBJECTIVE_DELTAS,
      ),
      felt_progress: humanSignalOrNull(
        human.felt_progress,
        FELT_PROGRESS_VALUES,
      ),
      felt_state: humanSignalOrNull(human.felt_state, FELT_STATES),
      dominant_blocker_confirmation: dominantBlockerConfirmation(
        human.dominant_blocker_confirmation,
      ),
      user_summary: nullableString(human.user_summary),
    },
    handoff_updates: {
      status: enumValue(
        handoff.status,
        [
          "none",
          "requested",
          "ready",
          "delivered",
          "revised",
          "cancelled",
        ],
        "none",
      ),
      requested_adjustment_summary: nullableString(
        handoff.requested_adjustment_summary,
      ),
      revision_summary: nullableString(handoff.revision_summary),
      platform_destination: cleanText(handoff.platform_destination) === "Plan"
        ? "Plan"
        : null,
      scope: normalizedScope,
    },
    adjust_recommendation: normalizeAdjustRecommendation(
      root.adjust_recommendation,
    ),
    forgotten_progress: {
      status: enumValue(
        forgotten.status,
        [
          "none",
          "candidate",
          "needs_target",
          "ready_for_progress_tool",
          "blocked",
        ],
        "none",
      ),
      target_hint: nullableString(forgotten.target_hint),
      outcome_hint: forgottenOutcomeHint(forgotten.outcome_hint),
      evidence: nullableString(forgotten.evidence),
    },
    direct_effect_request: normalizeLocalOneShotDirectEffectRequest(
      root.direct_effect_request,
    ),
    action_status_updates: actionStatusUpdates,
    weekly_gates: normalizeWeeklyGates(weeklyGatesRoot),
    detour_candidate: normalizeDetourCandidate(detourCandidateRoot),
    state_updates: {
      status: enumValue(
        state.status,
        [
          "open",
          "proposal_discussed",
          "handoff_ready",
          "completed",
          "stopped",
          "deferred",
          "exit_to_global",
          "safety",
        ],
        action === "exit_to_global_dispatcher" ? "stopped" : "open",
      ),
      weekly_stage: enumValue(
        state.weekly_stage,
        [
          "opening",
          "week_experience",
          "action_review",
          "action_blocker",
          "global_progress",
          "solution_fit",
          "child_detour",
          "synthesis",
          "closure",
          "collecting_human_signal",
          "strategy_ready",
          "closing",
        ],
        "strategy_ready",
      ),
      validation_unlock_status: enumValue(
        state.validation_unlock_status,
        ["locked_until_weekly_complete", "available"],
        action === "complete_weekly_no_change" || action === "complete_flow"
          ? "available"
          : "locked_until_weekly_complete",
      ),
      turn_count_increment: Math.max(
        0,
        Math.min(2, Number(state.turn_count_increment ?? 1) || 1),
      ),
      close_after_visible: state.close_after_visible === true,
    },
    visible_task: {
      kind: enumValue<WeeklyReviewVisibleTaskKind>(
        visible.kind,
        VISIBLE_TASKS,
        action === "exit_to_global_dispatcher"
          ? "exit_or_cancel"
          : action === "defer_flow"
          ? "stop_or_cancel"
          : action === "complete_weekly_no_change"
          ? "weekly_closure"
          : "review_action_gaps",
      ),
      instruction: cleanText(visible.instruction),
      conversation_context: null,
    },
    exit_memo: exitMemo,
    note_information: noteInformation,
    evidence,
  };
}

export function oneShotDirectEffectFromWeeklyReviewLocalDispatcherOutput(
  output: WeeklyReviewLocalDispatcherOutput | null,
  options?: {
    turnFrame?: Pick<TurnFrame, "direct_effects"> | null;
  },
): TurnFrame["direct_effects"][number] | null {
  return oneShotDirectEffectFromLocalRequest(output?.direct_effect_request, {
    turnFrame: options?.turnFrame ?? null,
  });
}

function defaultWeeklyFlowState(
  weeklyState: Record<string, unknown>,
): WeeklyReviewLocalFlowState {
  const now = new Date().toISOString();
  const raw = isRecord(weeklyState.weekly_flow_state)
    ? weeklyState.weekly_flow_state
    : {};
  const human = isRecord(raw.human_signals) ? raw.human_signals : {};
  return {
    stage: enumValue(
      raw.stage ?? raw.phase,
      [
        "opening",
        "week_experience",
        "action_review",
        "action_blocker",
        "global_progress",
        "solution_fit",
        "child_detour",
        "synthesis",
        "closure",
        "collecting_human_signal",
        "strategy_ready",
        "closing",
      ],
      "opening",
    ),
    proposal_status: enumValue(
      raw.proposal_status,
      [
        "none",
        "detour_discussed",
        "detour_active",
        "cancelled",
      ],
      "none",
    ),
    validation_unlock_status: enumValue(
      raw.validation_unlock_status,
      ["locked_until_weekly_complete", "available"],
      "locked_until_weekly_complete",
    ),
    human_signals: {
      objective_delta: enumValue(
        human.objective_delta,
        OBJECTIVE_DELTAS,
        "unknown",
      ),
      felt_state: enumValue(human.felt_state, FELT_STATES, "unknown"),
    },
    felt_progress: enumValue(
      raw.felt_progress ?? human.felt_progress,
      FELT_PROGRESS_VALUES,
      "unknown",
    ),
    weekly_gates: normalizeWeeklyGates(raw.weekly_gates, {
      week_experience_status: nullableString(raw.last_user_signal)
        ? "captured"
        : "missing",
      action_review_status: Array.isArray(
          (weeklyState.weekly_progress_review as any)?.transformations,
        )
        ? "captured"
        : "missing",
      global_progress_status: cleanText(human.objective_delta) &&
          cleanText(human.objective_delta) !== "unknown"
        ? "captured"
        : "missing",
      felt_progress_status:
        cleanText(raw.felt_progress ?? human.felt_progress) &&
          cleanText(raw.felt_progress ?? human.felt_progress) !== "unknown"
          ? "captured"
          : "missing",
      solution_fit_status: raw.proposal_status &&
          cleanText(raw.proposal_status) !== "none"
        ? "captured"
        : "missing",
      synthesis_status: "missing",
      closure_status: "missing",
    }),
    detour_candidate: normalizeDetourCandidate(
      raw.detour_candidate ?? defaultDetourCandidate(),
    ),
    synthesis_visible_status: enumValue(
      raw.synthesis_visible_status,
      ["not_rendered", "rendered"],
      "not_rendered",
    ),
    last_user_signal: nullableString(raw.last_user_signal),
    last_visible_summary: nullableString(raw.last_visible_summary),
    last_handoff_summary: nullableString(
      raw.last_handoff_summary ?? raw.last_proposal_summary,
    ),
    child_flow: {
      status: enumValue(
        (raw.child_flow as any)?.status,
        ["none", "proposed", "active", "completed", "cancelled"],
        "none",
      ),
      flow_id: nullableString((raw.child_flow as any)?.flow_id),
      reason: nullableString((raw.child_flow as any)?.reason),
      expected_return_focus: nullableString(
        (raw.child_flow as any)?.expected_return_focus,
      ),
      result_summary: nullableString((raw.child_flow as any)?.result_summary),
      result_details: isRecord((raw.child_flow as any)?.result_details)
        ? (raw.child_flow as any).result_details
        : null,
    },
    weekly_planning_context: normalizeWeeklyPlanningContext(
      raw.weekly_planning_context,
      weekWindowFromState(weeklyState),
    ),
    adjust_recommendation: normalizeAdjustRecommendation(
      raw.adjust_recommendation,
    ),
    user_corrected_action_statuses: normalizeActionStatusCorrections(
      raw.user_corrected_action_statuses,
    ),
    turn_count: Number(raw.turn_count ?? 0) || 0,
    max_turns: Number(raw.max_turns ?? 6) || 6,
    updated_at: nullableString(raw.updated_at) ?? now,
  };
}

function maybeRecomputeWeeklyReview(args: {
  previousReview: unknown;
  projection: unknown;
  humanSignals: WeeklyHumanSignals;
  actionStatusCorrections: WeeklyReviewActionStatusCorrection[];
  action: WeeklyReviewLocalFlowAction;
}): unknown {
  void args.action;
  const previous = isRecord(args.previousReview) ? args.previousReview : {};
  const evidence = isRecord(previous.evidence) ? previous.evidence : {};
  const previousItemDecisions = Array.isArray(previous.item_decisions)
    ? previous.item_decisions.slice(0, 12)
    : [];
  const itemDecisions = previousItemDecisions.length
    ? previousItemDecisions
    : itemSummariesFromProjection({
      weekly_progress_review: args.projection,
      weekly_flow_state: {
        user_corrected_action_statuses: args.actionStatusCorrections,
      },
    }).map((item) => ({
      title: item.title,
      plan_item_id: item.plan_item_id,
      current_week_status: item.status,
      evidence: item.evidence,
    }));
  const correctionsByKey = new Map(
    args.actionStatusCorrections.map((correction) => [
      correctionKey(correction),
      correction,
    ]),
  );
  const correctedItemDecisions = itemDecisions.map((item) => {
    const record = isRecord(item) ? item : {};
    const key = correctionKey({
      plan_item_id: nullableString(record.plan_item_id),
      occurrence_id: nullableString(record.occurrence_id),
      title: nullableString(record.title),
      corrected_status: "unknown",
      user_evidence: null,
      source_turn_summary: null,
    });
    const correction = correctionsByKey.get(key);
    if (!correction) return item;
    return {
      ...record,
      current_week_status: correction.corrected_status,
      user_corrected_status: correction.corrected_status,
      user_correction_evidence: correction.user_evidence,
    };
  });
  return {
    skill_id: "weekly_review_v1",
    status: "local_dispatcher_summary",
    evidence: {
      source: nullableString((evidence as any).source) ??
        "weekly_progress_review_v2",
      confidence: nullableString((evidence as any).confidence) ?? "medium",
      planned_count: Number(
        (evidence as any).planned_count ?? correctedItemDecisions.length,
      ) ||
        correctedItemDecisions.length,
      done_count: Number((evidence as any).done_count ?? 0) || 0,
      partial_count: Number((evidence as any).partial_count ?? 0) || 0,
      missed_count: Number((evidence as any).missed_count ?? 0) || 0,
      dominant_blockers: stringArray((evidence as any).dominant_blockers, 4),
    },
    human_signals: args.humanSignals,
    item_decisions: correctedItemDecisions,
    user_corrected_action_statuses: args.actionStatusCorrections,
    constraints: [
      "local_dispatcher_owns_weekly",
      "plan_patch_empty_until_platform_handoff",
      "no_plan_patch_from_weekly",
      "synthesis_must_preserve_partial_statuses",
    ],
    reply: null,
  };
}

function addWeeklyAdaptiveReviewMutationAudit(args: {
  audit: WeeklyReviewStateMutationAudit;
  previousReview: unknown;
  nextReview: unknown;
}): void {
  const previous = isRecord(args.previousReview) ? args.previousReview : {};
  const next = isRecord(args.nextReview) ? args.nextReview : {};
  if (sameJson(previous.evidence, next.evidence)) {
    addUnique(args.audit.preserved_fields, "daily_derived_evidence");
  } else {
    addUnique(args.audit.applied_fields, "daily_derived_evidence");
  }
  if (sameJson(previous.plan_patch, next.plan_patch)) {
    addUnique(args.audit.preserved_fields, "weekly_adaptive_review.plan_patch");
  } else if (isRecord(previous.plan_patch) && isRecord(next.plan_patch)) {
    addUnique(args.audit.restored_fields, "weekly_adaptive_review.plan_patch");
    args.audit.rejected_changes.push({
      field: "weekly_adaptive_review.plan_patch",
      reason_code: "pending_confirmation_missing",
    });
  } else if (isRecord(next.plan_patch)) {
    addUnique(args.audit.applied_fields, "weekly_adaptive_review.plan_patch");
  }
  if (isRecord(next.plan_patch)) {
    addUnique(
      args.audit.applied_fields,
      "weekly_adaptive_review.plan_patch.requires_confirmation",
    );
  }
  if (sameJson(previous.pending_confirmation, next.pending_confirmation)) {
    addUnique(
      args.audit.preserved_fields,
      "weekly_adaptive_review.pending_confirmation",
    );
  } else if (isRecord(next.pending_confirmation)) {
    addUnique(
      args.audit.applied_fields,
      "weekly_adaptive_review.pending_confirmation",
    );
  }
}

function summarizeOutput(output: WeeklyReviewLocalDispatcherOutput): string {
  return output.weekly_intent.summary ||
    output.handoff_updates.revision_summary ||
    output.handoff_updates.requested_adjustment_summary ||
    output.visible_task.instruction ||
    `${output.flow_action}:${output.visible_task.kind}`;
}

function weeklyDetourClearAllowed(
  output: WeeklyReviewLocalDispatcherOutput,
  previousDetour?: unknown,
): boolean {
  const previousDetourKind = isRecord(previousDetour)
    ? previousDetour.kind
    : null;
  const previousDetourIsLegacy = previousDetourKind != null &&
    !isAllowedWeeklyDetourKind(previousDetourKind);
  return output.handoff_updates.status === "cancelled" ||
    output.weekly_intent.kind === "weekly_rejection" ||
    (previousDetourIsLegacy &&
      output.clear_fields.includes("detour_candidate"));
}

function buildHandoffSummary(
  output: WeeklyReviewLocalDispatcherOutput,
  previous: WeeklyReviewLocalFlowState,
): string | null {
  return output.handoff_updates.revision_summary ||
    output.handoff_updates.requested_adjustment_summary ||
    output.handoff_updates.scope.scope_summary ||
    previous.last_handoff_summary;
}

function childFlowWithRevision(
  childFlow: WeeklyReviewLocalFlowState["child_flow"],
  revisionSummary: string | null,
): WeeklyReviewLocalFlowState["child_flow"] {
  if (!revisionSummary) return childFlow;
  return {
    ...childFlow,
    result_details: {
      ...(isRecord(childFlow.result_details) ? childFlow.result_details : {}),
      revision_summary: revisionSummary,
    },
  };
}

function shouldMarkAdjustRecommendationSurfaced(
  visibleTask: WeeklyReviewVisibleTaskKind,
): boolean {
  return visibleTask === "weekly_adjust_recommendation" ||
    visibleTask === "weekly_synthesis";
}

function mergeAdjustRecommendation(args: {
  previous: WeeklyAdjustRecommendation;
  proposed: WeeklyAdjustRecommendation;
  planningContext: WeeklyPlanningContext;
  visibleTask: WeeklyReviewVisibleTaskKind;
  now: string;
}): WeeklyAdjustRecommendation {
  const previousReady = args.previous.safe_to_surface &&
    (args.previous.status === "ready" || args.previous.status === "surfaced");
  const proposedReady = args.proposed.safe_to_surface &&
    args.proposed.confidence >=
      WEEKLY_ADJUST_RECOMMENDATION_CONFIDENCE_THRESHOLD;
  const base = proposedReady
    ? args.proposed
    : previousReady
    ? args.previous
    : args.proposed.status === "candidate" && !previousReady
    ? args.proposed
    : args.previous;
  const mode = args.planningContext.mode;
  const targetScope = mode === "next_week_configured"
    ? "next_week_plan"
    : "next_level_inputs";
  const destinationInstruction = args.planningContext.adjustment_destination
    .instruction;
  const normalized: WeeklyAdjustRecommendation = {
    ...base,
    mode: base.status === "none" ? null : mode,
    target_scope: base.status === "none" ? null : targetScope,
    destination_instruction: base.status === "none"
      ? null
      : (base.destination_instruction || destinationInstruction),
    updated_at: base.status === "none" ? base.updated_at : args.now,
  };
  if (
    normalized.safe_to_surface &&
    shouldMarkAdjustRecommendationSurfaced(args.visibleTask)
  ) {
    return {
      ...normalized,
      status: "surfaced",
      surfaced_in_weekly: true,
      updated_at: args.now,
    };
  }
  return normalized;
}

function withWeeklyPlanningContext(args: {
  weeklyState: Record<string, unknown>;
  v2Runtime?: ActiveTransformationRuntime | null;
}): Record<string, unknown> {
  const previousFlow = defaultWeeklyFlowState(args.weeklyState);
  const planningContext = buildWeeklyPlanningContext(args);
  return {
    ...args.weeklyState,
    weekly_flow_state: {
      ...previousFlow,
      weekly_planning_context: planningContext,
      adjust_recommendation: previousFlow.adjust_recommendation,
    },
  };
}

function weekWindowFromState(state: Record<string, unknown>) {
  const projection = isRecord(state.weekly_progress_review)
    ? state.weekly_progress_review
    : {};
  const review = isRecord(state.weekly_adaptive_review)
    ? state.weekly_adaptive_review
    : {};
  return {
    start_date: nullableString(
      projection.week_start_date ?? review.week_start_date,
    ),
    end_date: nullableString(projection.week_end_date ?? review.week_end_date),
  };
}

function planContextsFromProjection(state: Record<string, unknown>) {
  const projection = isRecord(state.weekly_progress_review)
    ? state.weekly_progress_review
    : {};
  const transformations = Array.isArray(projection.transformations)
    ? projection.transformations
    : [];
  return transformations.slice(0, 6).flatMap((entry: any) => {
    if (!entry || typeof entry !== "object") return [];
    return [{
      transformation_id: nullableString(entry.transformation_id),
      plan_id: nullableString(entry.plan_id),
      plan_title: nullableString(entry.plan_title),
      action_count: Array.isArray(entry.actions) ? entry.actions.length : 0,
    }];
  });
}

function itemSummariesFromProjection(state: Record<string, unknown>) {
  const projection = isRecord(state.weekly_progress_review)
    ? state.weekly_progress_review
    : {};
  const flowState = isRecord(state.weekly_flow_state)
    ? state.weekly_flow_state
    : {};
  const corrections = normalizeActionStatusCorrections(
    flowState.user_corrected_action_statuses,
  );
  const transformations = Array.isArray(projection.transformations)
    ? projection.transformations
    : [];
  const baseItems = transformations.flatMap((entry: any) => {
    const actions = Array.isArray(entry?.actions) ? entry.actions : [];
    return actions.slice(0, 8).flatMap((action: any) => {
      if (!action || typeof action !== "object") return [];
      return [{
        plan_id: nullableString(action.plan_id ?? entry?.plan_id),
        plan_title: nullableString(action.plan_title ?? entry?.plan_title),
        plan_item_id: nullableString(action.plan_item_id),
        occurrence_id: nullableString(action.occurrence_id),
        title: nullableString(action.title),
        family: nullableString(action.family),
        status: nullableString(
          action.deviation ?? action.current_week_status ?? action.status,
        ),
        evidence: action.daily_evidence ?? null,
      }];
    });
  }).slice(0, 12);
  if (!corrections.length) return baseItems;
  return baseItems.map((item) => {
    const correction = corrections.find((candidate) => {
      if (
        candidate.occurrence_id &&
        candidate.occurrence_id === nullableString(item.occurrence_id)
      ) return true;
      if (
        candidate.plan_item_id &&
        candidate.plan_item_id === nullableString(item.plan_item_id)
      ) return true;
      if (!candidate.plan_item_id && !candidate.occurrence_id) {
        const title = cleanText(item.title).toLowerCase();
        return Boolean(
          title && title === cleanText(candidate.title).toLowerCase(),
        );
      }
      return false;
    });
    if (!correction) return item;
    return {
      ...item,
      status: correction.corrected_status,
      user_corrected_status: correction.corrected_status,
      user_correction_evidence: correction.user_evidence,
      status_source: "user_weekly_correction",
    };
  });
}

function knownActionGapsFromItems(
  items: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return items.filter((item) => {
    const status = cleanText(item.status).toLowerCase();
    return status && status !== "completed" && status !== "done" &&
      status !== "ok";
  }).slice(0, 6);
}

function currentActionFocus(
  detour: WeeklyReviewDetourCandidate,
  items: Array<Record<string, unknown>>,
): Record<string, unknown> | null {
  const target = cleanText(detour.target_action_or_plan).toLowerCase();
  if (!target) return null;
  return items.find((item) => {
    const title = cleanText(item.title).toLowerCase();
    const id = cleanText(item.plan_item_id).toLowerCase();
    return title && target.includes(title) || id && target.includes(id);
  }) ?? {
    label: detour.target_action_or_plan,
    source: "detour_candidate",
  };
}

function nextRequiredWeeklyStep(
  flow: WeeklyReviewLocalFlowState,
): WeeklyReviewVisibleTaskKind | null {
  const gates = flow.weekly_gates;
  if (gates.week_experience_status === "missing") return "ask_week_experience";
  if (
    gates.action_review_status === "missing" ||
    gates.action_review_status === "needs_deeper"
  ) {
    return "review_action_gaps";
  }
  if (
    gates.action_review_status === "captured" && flow.stage === "action_blocker"
  ) {
    return "explore_action_blocker";
  }
  if (
    gates.global_progress_status === "missing" ||
    gates.felt_progress_status === "missing"
  ) {
    return "ask_global_progress_feeling";
  }
  if (
    gates.global_progress_status === "needs_deeper" ||
    gates.felt_progress_status === "needs_deeper"
  ) {
    return "deepen_global_progress";
  }
  if (
    flow.detour_candidate.kind !== "none" &&
    flow.detour_candidate.readiness !== "user_confirmed"
  ) {
    return "qualify_solution_fit";
  }
  if (gates.synthesis_status !== "complete") return "weekly_synthesis";
  if (gates.closure_status !== "complete") return "weekly_closure";
  return null;
}

function weeklyActiveActionCandidates(
  state: Record<string, unknown>,
): ActiveActionCandidateForDirectEffects[] {
  return itemSummariesFromProjection(state).flatMap((item: any) => {
    const planItemId = nullableString(item.plan_item_id);
    const title = nullableString(item.title);
    if (!planItemId || !title) return [];
    return [{
      plan_item_id: planItemId,
      title,
      status: nullableString(item.status) ?? "active",
      plan_id: nullableString(item.plan_id),
      tracking_type: "weekly_review",
      dimension: nullableString(item.family),
      aliases: [],
      occurrence_id: nullableString(item.occurrence_id),
    }];
  });
}

function humanStrategyLabel(value: unknown): string | null {
  const text = cleanText(value);
  switch (text) {
    case "bridge_week":
      return "semaine plus legere";
    case "repeat_week":
      return "reprendre la meme semaine";
    case "advance":
      return "continuer a avancer";
    case "level_review":
      return "revoir le niveau";
    default:
      return text || null;
  }
}

function buildWeeklyConversationContext(args: {
  weeklyState: Record<string, unknown>;
  output: WeeklyReviewLocalDispatcherOutput;
  reducedState: Record<string, unknown> | null;
  handoffSummary: string | null;
  visibleTask: WeeklyReviewVisibleTaskKind;
}): WeeklyReviewConversationContext {
  const sourceState = args.reducedState ?? args.weeklyState;
  const flow = defaultWeeklyFlowState(sourceState);
  const review = isRecord(sourceState.weekly_adaptive_review)
    ? sourceState.weekly_adaptive_review
    : {};
  const strategy = isRecord(review.week_strategy) ? review.week_strategy : {};
  const evidence = isRecord(review.evidence) ? review.evidence : {};
  const handoffScope = args.output.handoff_updates.scope;
  const itemSummaries = itemSummariesFromProjection(sourceState);
  const actionGaps = knownActionGapsFromItems(itemSummaries);
  const detour = args.output.detour_candidate.kind === "none"
    ? flow.detour_candidate
    : args.output.detour_candidate;
  const childRevisionSummary = nullableString(
    (flow.child_flow.result_details as any)?.revision_summary,
  );
  const gates = mergeWeeklyGates(flow.weekly_gates, args.output.weekly_gates);
  const adjustRecommendation = flow.adjust_recommendation;
  const actionReviewComplete = gates.action_review_status === "complete";
  const nextFlowForStep: WeeklyReviewLocalFlowState = {
    ...flow,
    weekly_gates: gates,
    detour_candidate: detour,
  };
  const missing: string[] = [];
  if (args.output.visible_task.kind === "clarify_human_signal") {
    missing.push("signal_humain_weekly");
  }
  if (gates.week_experience_status === "missing") {
    missing.push("experience_de_la_semaine");
  }
  if (
    gates.action_review_status === "missing" ||
    gates.action_review_status === "needs_deeper"
  ) {
    missing.push("verification_actions_gaps");
  }
  if (gates.global_progress_status === "missing") {
    missing.push("avancee_objectif_global");
  }
  if (gates.felt_progress_status === "missing") {
    missing.push("ressenti_avancee_objectif_global");
  }
  if (handoffScope.needs_scope_clarification) {
    missing.push("scope_plan_ou_action");
  }
  if (args.output.forgotten_progress.status === "needs_target") {
    missing.push("progression_oubliee_cible");
  }
  return {
    state_summary: args.output.weekly_intent.summary ||
      flow.last_visible_summary ||
      "Point weekly actif.",
    week_window: weekWindowFromState(sourceState),
    field_or_stage: args.visibleTask,
    known_values: {
      human_signals: flow.human_signals,
      felt_progress: flow.felt_progress,
      weekly_gates: gates,
      action_review_complete: actionReviewComplete,
      synthesis_visible_status: flow.synthesis_visible_status,
      synthesis_already_rendered: flow.synthesis_visible_status ===
        "rendered",
      action_review_before_global_progress_required:
        gates.action_review_status !== "complete",
      partial_statuses_must_remain_partial: true,
      detour_candidate: detour,
      next_required_weekly_step: nextRequiredWeeklyStep(nextFlowForStep),
      validation_unlock_status: flow.validation_unlock_status,
      proposal_status: flow.proposal_status,
      child_flow: flow.child_flow,
      child_flow_result_details: flow.child_flow.result_details ?? null,
      weekly_planning_context: flow.weekly_planning_context,
      adjust_recommendation: adjustRecommendation,
      user_corrected_action_statuses: flow.user_corrected_action_statuses,
      dominant_blocker_confirmation:
        args.output.human_signal_updates.dominant_blocker_confirmation,
      chat_plan_mutation_request:
        args.output.chat_plan_mutation_request === true,
    },
    missing_or_weak_values: missing,
    weekly_strategy: {
      strategy_label_human: humanStrategyLabel(strategy.decision),
      reason_human: nullableString(strategy.reason),
      confidence: args.output.confidence,
    },
    weekly_planning_context: flow.weekly_planning_context,
    adjust_recommendation: adjustRecommendation,
    plan_contexts: planContextsFromProjection(sourceState),
    item_summaries: itemSummaries,
    handoff_data: {
      summary: args.handoffSummary,
      platform_destination: args.output.handoff_updates.platform_destination,
      scope: args.output.handoff_updates.scope,
      requested_adjustment_summary:
        args.output.handoff_updates.requested_adjustment_summary,
      revision_summary: args.output.handoff_updates.revision_summary ??
        childRevisionSummary,
      executable_from_chat: false,
      requires_platform_confirmation: true,
      adjustment_destination:
        flow.weekly_planning_context.adjustment_destination,
    },
    forgotten_progress: {
      ...args.output.forgotten_progress,
      no_plan_adjustment: true,
    },
    inline_result: {},
    weekly_gates: gates,
    detour_candidate: detour,
    current_action_focus: currentActionFocus(detour, itemSummaries),
    known_action_gaps: actionGaps,
    global_objective_signal: {
      objective_delta: flow.human_signals.objective_delta,
      status: gates.global_progress_status,
    },
    felt_progress_signal: {
      felt_progress: flow.felt_progress,
      felt_state: flow.human_signals.felt_state,
      status: gates.felt_progress_status,
    },
    child_flow_return_summary: flow.child_flow.result_summary,
    next_required_weekly_step: nextRequiredWeeklyStep(nextFlowForStep),
    tone_constraints: [
      "compact",
      "one_question_max_when_asking",
      "human_language",
      "prefer_gender_neutral_wording_when_not_certain",
      "do_not_use_gendered_adjectives_unless_conversation_context_confirms_gender",
    ],
    do_not_say: [
      "bridge_week",
      "carry_over",
      "repeat_week",
      "level_review",
      "item_decision",
      "dominant_blocker",
      "applique",
      "modifie le plan",
      "valide le plan",
      "enregistre le plan",
      "j'ai une carte",
      "carte disponible",
      "carte prete",
      "nouvel outil",
      "j'ai modifie le plan",
      "ce qui bougerait",
      "ce qui resterait",
      "patch en attente",
      "proposition de changement deja prete",
      "changement de plan pret a appliquer",
      "j'ai cree un rappel",
      "j'ai cree une potion",
      "tu as ete rigoureux",
      "tu as ete rigoureuse",
      "reussite pleine pour une action partielle",
    ],
    context_summary: nullableString(evidence.reason) ??
      nullableString(flow.last_visible_summary),
    evidence_used: [
      ...args.output.evidence,
      ...stringArray((evidence as any).dominant_blockers, 4),
    ].slice(0, 10),
  };
}

function dispatcherChangeRequiresNote(action: WeeklyReviewLocalFlowAction) {
  return action === "exit_to_global_dispatcher" ||
    action === "safety_preempt";
}

function weeklyReviewCompleteEnoughForExit(gates: WeeklyReviewGates): boolean {
  return gates.synthesis_status === "complete" &&
    gates.closure_status === "complete";
}

function weeklyExitHaystack(output: WeeklyReviewLocalDispatcherOutput): string {
  const note = output.note_information;
  return [
    output.weekly_intent.summary,
    ...output.evidence,
    note?.handoff_context_for_next_dispatcher,
    note?.structured_context?.user_message_summary,
    note?.structured_context?.active_flow_summary,
    note?.structured_context?.recommended_next_focus,
    note?.user_words,
  ].flat().map((value) => cleanText(value).toLowerCase()).filter(Boolean).join(
    " ",
  );
}

function weeklyExitIsStillWeeklyRelated(
  output: WeeklyReviewLocalDispatcherOutput,
): boolean {
  const haystack = weeklyExitHaystack(output);
  if (!haystack) return false;
  return /bilan|semaine|prochaine|suite|plan|ajust|recommand|objectif|action|synthese|synthèse|cloture|clôture|niveau/
    .test(
      haystack,
    );
}

function weeklyExitAllowedBeforeClosure(
  output: WeeklyReviewLocalDispatcherOutput,
): boolean {
  if (
    output.flow_action === "safety_preempt" ||
    output.risk_score >= 7 ||
    output.weekly_intent.kind === "safety" ||
    output.note_information?.handoff_reason === "safety"
  ) return true;
  if (output.weekly_intent.kind === "stop") return true;
  if (output.weekly_intent.kind === "off_topic") return true;
  if (
    output.weekly_intent.kind === "explicit_tool_request" &&
    !weeklyExitIsStillWeeklyRelated(output)
  ) return true;
  return false;
}

function visibleTaskForBlockedWeeklyExit(args: {
  output: WeeklyReviewLocalDispatcherOutput;
  flow: WeeklyReviewLocalFlowState;
}): WeeklyReviewVisibleTaskKind {
  if (weeklyExitIsStillWeeklyRelated(args.output)) {
    const haystack = weeklyExitHaystack(args.output);
    if (/synthese|synthèse|recap|résum|resume/.test(haystack)) {
      return "weekly_synthesis";
    }
    if (/cloture|clôture|termin/.test(haystack)) {
      return "weekly_closure";
    }
  }
  return nextRequiredWeeklyStep(args.flow) ?? "weekly_synthesis";
}

function completionGuard(args: {
  output: WeeklyReviewLocalDispatcherOutput;
  gates: WeeklyReviewGates;
}): {
  reason_code: string;
  visible_task: WeeklyReviewVisibleTaskKind;
  stage: WeeklyReviewLocalFlowState["stage"];
} | null {
  const output = args.output;
  if (
    output.flow_action !== "complete_flow" &&
    output.flow_action !== "complete_weekly_no_change"
  ) return null;
  const gates = args.gates;
  if (gates.synthesis_status !== "complete") {
    return {
      reason_code: "weekly_review_completion_requires_synthesis",
      visible_task: "weekly_synthesis",
      stage: "synthesis",
    };
  }
  if (gates.closure_status !== "complete") {
    return {
      reason_code: "weekly_review_completion_requires_closure",
      visible_task: "weekly_closure",
      stage: "closure",
    };
  }
  return null;
}

function weeklyStageForVisibleTask(
  task: WeeklyReviewVisibleTaskKind,
): WeeklyReviewLocalFlowState["stage"] {
  switch (task) {
    case "ask_week_experience":
      return "week_experience";
    case "review_action_gaps":
      return "action_review";
    case "explore_action_blocker":
    case "qualify_attack_or_defense_fit":
      return "action_blocker";
    case "ask_global_progress_feeling":
    case "deepen_global_progress":
      return "global_progress";
    case "qualify_solution_fit":
    case "offer_child_detour":
      return "solution_fit";
    case "weekly_adjust_recommendation":
    case "weekly_synthesis":
      return "synthesis";
    case "weekly_closure":
      return "closure";
    default:
      return "strategy_ready";
  }
}

function visibleTaskAfterStructuredReducerGuards(args: {
  output: WeeklyReviewLocalDispatcherOutput;
  nextGates: WeeklyReviewGates;
  previousFlow: WeeklyReviewLocalFlowState;
}): WeeklyReviewVisibleTaskKind {
  if (
    proposedAdjustRecommendationNeedsVisibleSurface(args.output) &&
    args.output.flow_action !== "complete_flow" &&
    args.output.flow_action !== "complete_weekly_no_change"
  ) {
    return "weekly_adjust_recommendation";
  }
  if (
    adjustRecommendationNeedsVisibleSurface({
      previousFlow: args.previousFlow,
      output: args.output,
    }) &&
    args.output.visible_task.kind === "weekly_closure"
  ) {
      return "weekly_adjust_recommendation";
  }
  if (
    args.output.visible_task.kind === "weekly_adjust_recommendation" &&
    !adjustRecommendationReadyForVisibleTask({
      previousFlow: args.previousFlow,
      output: args.output,
    })
  ) {
    return nextRequiredWeeklyStep({
      ...args.previousFlow,
      weekly_gates: args.nextGates,
    }) ?? "weekly_synthesis";
  }
  if (
    (args.output.flow_action === "complete_flow" ||
      args.output.flow_action === "complete_weekly_no_change") &&
    args.nextGates.closure_status === "complete"
  ) {
    return "weekly_closure";
  }
  return args.output.visible_task.kind;
}

function adjustRecommendationReadyForVisibleTask(args: {
  previousFlow: WeeklyReviewLocalFlowState;
  output: WeeklyReviewLocalDispatcherOutput;
}): boolean {
  const proposed = args.output.adjust_recommendation;
  const previous = args.previousFlow.adjust_recommendation;
  return (
    proposed.safe_to_surface &&
    proposed.confidence >= WEEKLY_ADJUST_RECOMMENDATION_CONFIDENCE_THRESHOLD &&
    (proposed.status === "ready" || proposed.status === "surfaced")
  ) || (
    previous.safe_to_surface &&
    previous.confidence >= WEEKLY_ADJUST_RECOMMENDATION_CONFIDENCE_THRESHOLD &&
    (previous.status === "ready" || previous.status === "surfaced")
  );
}

function proposedAdjustRecommendationNeedsVisibleSurface(
  output: WeeklyReviewLocalDispatcherOutput,
): boolean {
  const proposed = output.adjust_recommendation;
  return proposed.safe_to_surface &&
    proposed.confidence >= WEEKLY_ADJUST_RECOMMENDATION_CONFIDENCE_THRESHOLD &&
    !proposed.surfaced_in_weekly &&
    (proposed.status === "ready" || proposed.status === "surfaced");
}

function adjustRecommendationNeedsVisibleSurface(args: {
  previousFlow: WeeklyReviewLocalFlowState;
  output: WeeklyReviewLocalDispatcherOutput;
}): boolean {
  const previous = args.previousFlow.adjust_recommendation;
  const previousReady = previous.safe_to_surface &&
    previous.confidence >= WEEKLY_ADJUST_RECOMMENDATION_CONFIDENCE_THRESHOLD &&
    !previous.surfaced_in_weekly &&
    (previous.status === "ready" || previous.status === "surfaced");
  return previousReady ||
    proposedAdjustRecommendationNeedsVisibleSurface(args.output);
}

function weeklyGateOrderGuard(args: {
  previousFlow: WeeklyReviewLocalFlowState;
  output: WeeklyReviewLocalDispatcherOutput;
  nextGates: WeeklyReviewGates;
  nextDetour: WeeklyReviewDetourCandidate;
}): {
  reason_code: string;
  visible_task: WeeklyReviewVisibleTaskKind;
  stage: WeeklyReviewLocalFlowState["stage"];
} | null {
  const action = args.output.flow_action;
  if (
    action === "defer_flow" ||
    action === "exit_to_global_dispatcher" ||
    action === "safety_preempt"
  ) return null;
  const task = args.output.visible_task.kind;
  const guardedTasks = new Set<WeeklyReviewVisibleTaskKind>([
    "qualify_solution_fit",
    "offer_child_detour",
    "weekly_adjust_recommendation",
    "weekly_synthesis",
    "weekly_closure",
  ]);
  if (!guardedTasks.has(task)) return null;
  const flowForStep: WeeklyReviewLocalFlowState = {
    ...args.previousFlow,
    weekly_gates: args.nextGates,
    detour_candidate: args.nextDetour,
  };
  const required = nextRequiredWeeklyStep(flowForStep);
  if (
    required === "ask_week_experience" ||
    required === "review_action_gaps" ||
    required === "explore_action_blocker" ||
    required === "ask_global_progress_feeling" ||
    required === "deepen_global_progress"
  ) {
    return {
      reason_code: `weekly_review_gate_order_requires_${required}`,
      visible_task: required,
      stage: weeklyStageForVisibleTask(required),
    };
  }
  return null;
}

export function reduceWeeklyReviewLocalDispatcherOutput(args: {
  previousWeeklyState: Record<string, unknown>;
  output: WeeklyReviewLocalDispatcherOutput;
}): WeeklyReviewReducerResult {
  const previousFlow = defaultWeeklyFlowState(args.previousWeeklyState);
  const output = args.output;
  const summary = summarizeOutput(output);
  const now = new Date().toISOString();
  const planningContext = previousFlow.weekly_planning_context;
  const baseAudit = createWeeklyStateMutationAudit(output);
  const nextSignals: WeeklyHumanSignals = {
    objective_delta: output.human_signal_updates.objective_delta ??
      previousFlow.human_signals.objective_delta,
    felt_state: output.human_signal_updates.felt_state ??
      previousFlow.human_signals.felt_state,
  };
  const nextFeltProgress = output.human_signal_updates.felt_progress ??
    previousFlow.felt_progress;
  const nextGatesBase = mergeWeeklyGates(
    previousFlow.weekly_gates,
    output.weekly_gates,
  );
  const adjustSurfaceRequired = adjustRecommendationNeedsVisibleSurface({
    previousFlow,
    output,
  });
  const visibleClosureShouldComplete = !adjustSurfaceRequired &&
    output.visible_task.kind === "weekly_closure" &&
    (
      nextGatesBase.synthesis_status === "complete" ||
      previousFlow.synthesis_visible_status === "rendered"
    );
  const nextGatesWithClosure: WeeklyReviewGates = adjustSurfaceRequired
    ? {
      ...nextGatesBase,
      closure_status: previousFlow.weekly_gates.closure_status === "complete"
        ? "complete"
        : "missing",
    }
    : visibleClosureShouldComplete
    ? { ...nextGatesBase, closure_status: "complete" }
    : nextGatesBase;
  const nextGates = applyWeeklyVisibleGateInvariants({
    gates: applyWeeklyGateInvariants(
      nextGatesWithClosure,
      output,
    ),
    previousFlow,
    output,
  });
  const nextActionStatusCorrections = mergeActionStatusCorrections(
    previousFlow.user_corrected_action_statuses,
    output.action_status_updates,
  );
  const detourClearAllowed = weeklyDetourClearAllowed(
    output,
    previousFlow.detour_candidate,
  );
  const nextDetour = output.detour_candidate.kind === "none"
    ? detourClearAllowed
      ? output.detour_candidate
      : previousFlow.detour_candidate
    : output.detour_candidate;
  const handoffSummary = buildHandoffSummary(output, previousFlow);
  const childFlowForTurn = childFlowWithRevision(
    previousFlow.child_flow,
    output.handoff_updates.revision_summary,
  );
  const turnCount = previousFlow.turn_count +
    output.state_updates.turn_count_increment;
  const maxTurns = previousFlow.max_turns || 6;
  const turnLimitReached = turnCount >= maxTurns &&
    output.flow_action !== "exit_to_global_dispatcher" &&
    output.flow_action !== "safety_preempt";
  const turnLimitCloseAllowed = turnLimitReached &&
    nextGates.synthesis_status === "complete" &&
    nextGates.closure_status === "complete" &&
    output.visible_task.kind === "weekly_closure";
  const weeklySafetyExit = output.flow_action === "safety_preempt" ||
    output.risk_score >= 7 ||
    output.weekly_intent.kind === "safety" ||
    output.note_information?.handoff_reason === "safety";

  if (
    output.flow_action === "exit_to_global_dispatcher" &&
    !weeklySafetyExit &&
    !weeklyReviewCompleteEnoughForExit(nextGates) &&
    !weeklyExitAllowedBeforeClosure(output)
  ) {
    const guardedVisibleTask = visibleTaskForBlockedWeeklyExit({
      output,
      flow: {
        ...previousFlow,
        weekly_gates: nextGates,
        detour_candidate: nextDetour,
      },
    });
    const guardedFlow: WeeklyReviewLocalFlowState = {
      ...previousFlow,
      stage: weeklyStageForVisibleTask(guardedVisibleTask),
      proposal_status: previousFlow.proposal_status,
      validation_unlock_status: "locked_until_weekly_complete",
      human_signals: nextSignals,
      felt_progress: nextFeltProgress,
      weekly_gates: nextGates,
      detour_candidate: nextDetour,
      synthesis_visible_status: synthesisVisibleStatusAfterVisibleTask(
        previousFlow.synthesis_visible_status,
        guardedVisibleTask,
      ),
      child_flow: childFlowForTurn,
      weekly_planning_context: planningContext,
      adjust_recommendation: mergeAdjustRecommendation({
        previous: previousFlow.adjust_recommendation,
        proposed: output.adjust_recommendation,
        planningContext,
        visibleTask: guardedVisibleTask,
        now,
      }),
      user_corrected_action_statuses: nextActionStatusCorrections,
      last_user_signal: output.human_signal_updates.user_summary ??
        previousFlow.last_user_signal,
      last_visible_summary: output.weekly_intent.summary ||
        previousFlow.last_visible_summary,
      last_handoff_summary: handoffSummary,
      turn_count: turnCount,
      max_turns: maxTurns,
      updated_at: now,
    };
    const guardedMerge = mergeWeeklyReviewLocalState({
      previous: previousFlow,
      proposed: guardedFlow,
      output,
      transition: "weekly_review_exit_blocked_until_synthesis_closure",
      now,
      constraints: {
        allowDetourChange: output.detour_candidate.kind !== "none",
        allowDetourClear: detourClearAllowed,
        allowChildFlowChange: Boolean(output.handoff_updates.revision_summary),
      },
    });
    const guardedState = {
      ...args.previousWeeklyState,
      status: "open",
      weekly_flow_state: guardedMerge.state,
      updated_at: now,
    };
    return {
      status: "answered",
      reason_code: "weekly_review_exit_blocked_until_synthesis_closure",
      weekly_state: guardedState,
      visible_task: guardedVisibleTask,
      exit_to_global_dispatcher: false,
      tool_execution: "none",
      handoff_summary: handoffSummary,
      answer_summary: summary,
      target_dispatcher: "none",
      note_information: null,
      child_flow_handoff: null,
      conversation_context: buildWeeklyConversationContext({
        weeklyState: args.previousWeeklyState,
        output,
        reducedState: guardedState,
        handoffSummary,
        visibleTask: guardedVisibleTask,
      }),
      blocked_effects: [{
        type: "weekly_adaptive_review_v1",
        reason_code: "weekly_exit_requires_synthesis_and_closure",
      }],
      state_mutation_audit: guardedMerge.audit,
      evidence: output.evidence,
    };
  }

  if (
    dispatcherChangeRequiresNote(output.flow_action) || output.risk_score >= 7
  ) {
    if (!output.note_information) {
      const blockedFlow = {
        ...previousFlow,
        weekly_planning_context: planningContext,
        adjust_recommendation: mergeAdjustRecommendation({
          previous: previousFlow.adjust_recommendation,
          proposed: output.adjust_recommendation,
          planningContext,
          visibleTask: "exit_or_cancel",
          now,
        }),
        turn_count: turnCount,
        updated_at: now,
      };
      const blockedMerge = mergeWeeklyReviewLocalState({
        previous: previousFlow,
        proposed: blockedFlow,
        output,
        transition: "weekly_review_note_information_required",
        now,
      });
      return {
        status: "blocked",
        reason_code: "weekly_review_note_information_required",
        weekly_state: {
          ...args.previousWeeklyState,
          status: "open",
          weekly_flow_state: blockedMerge.state,
          updated_at: now,
        },
        visible_task: "exit_or_cancel",
        exit_to_global_dispatcher: false,
        tool_execution: "blocked",
        handoff_summary: handoffSummary,
        answer_summary: null,
        target_dispatcher: output.target_dispatcher,
        note_information: null,
        child_flow_handoff: null,
        conversation_context: buildWeeklyConversationContext({
          weeklyState: args.previousWeeklyState,
          output,
          reducedState: args.previousWeeklyState,
          handoffSummary,
          visibleTask: "exit_or_cancel",
        }),
        blocked_effects: [{
          type: "weekly_adaptive_review_v1",
          reason_code: "note_information_required",
        }],
        state_mutation_audit: blockedMerge.audit,
        evidence: output.evidence,
      };
    }
  }

  if (weeklySafetyExit) {
    return {
      status: "exit",
      reason_code: "weekly_review_safety_exit_to_global_dispatcher",
      weekly_state: null,
      visible_task: "exit_or_cancel",
      exit_to_global_dispatcher: true,
      tool_execution: "none",
      handoff_summary: handoffSummary,
      answer_summary: null,
      target_dispatcher: "global",
      note_information: output.note_information,
      child_flow_handoff: null,
      conversation_context: null,
      blocked_effects: [{
        type: "weekly_adaptive_review_v1",
        reason_code: "safety_rerouted_to_global_dispatcher",
      }],
      state_mutation_audit: baseAudit,
      evidence: output.evidence,
    };
  }

  if (output.flow_action === "exit_to_global_dispatcher") {
    return {
      status: "exit",
      reason_code: "weekly_review_local_exit_to_global_dispatcher",
      weekly_state: null,
      visible_task: "exit_or_cancel",
      exit_to_global_dispatcher: true,
      tool_execution: "none",
      handoff_summary: handoffSummary,
      answer_summary: null,
      target_dispatcher: output.target_dispatcher === "none"
        ? "global"
        : output.target_dispatcher,
      note_information: output.note_information,
      child_flow_handoff: null,
      conversation_context: null,
      blocked_effects: [],
      state_mutation_audit: baseAudit,
      evidence: output.evidence,
    };
  }

  const gateOrderGuard = weeklyGateOrderGuard({
    previousFlow: {
      ...previousFlow,
      child_flow: childFlowForTurn,
    },
    output,
    nextGates,
    nextDetour,
  });
  if (gateOrderGuard) {
    const guardedFlow: WeeklyReviewLocalFlowState = {
      ...previousFlow,
      stage: gateOrderGuard.stage,
      proposal_status: previousFlow.proposal_status,
      validation_unlock_status: "locked_until_weekly_complete",
      human_signals: nextSignals,
      felt_progress: nextFeltProgress,
      weekly_gates: nextGates,
      detour_candidate: nextDetour,
      synthesis_visible_status: synthesisVisibleStatusAfterVisibleTask(
        previousFlow.synthesis_visible_status,
        gateOrderGuard.visible_task,
      ),
      child_flow: childFlowForTurn,
      weekly_planning_context: planningContext,
      adjust_recommendation: mergeAdjustRecommendation({
        previous: previousFlow.adjust_recommendation,
        proposed: output.adjust_recommendation,
        planningContext,
        visibleTask: gateOrderGuard.visible_task,
        now,
      }),
      user_corrected_action_statuses: nextActionStatusCorrections,
      last_user_signal: output.human_signal_updates.user_summary ??
        previousFlow.last_user_signal,
      last_visible_summary: output.weekly_intent.summary ||
        previousFlow.last_visible_summary,
      last_handoff_summary: handoffSummary,
      turn_count: turnCount,
      max_turns: maxTurns,
      updated_at: now,
    };
    const guardedMerge = mergeWeeklyReviewLocalState({
      previous: previousFlow,
      proposed: guardedFlow,
      output,
      transition: gateOrderGuard.reason_code,
      now,
      constraints: {
        allowDetourChange: output.detour_candidate.kind !== "none",
        allowDetourClear: detourClearAllowed,
        allowChildFlowChange: Boolean(output.handoff_updates.revision_summary),
      },
    });
    const guardedState = {
      ...args.previousWeeklyState,
      status: "open",
      weekly_flow_state: guardedMerge.state,
      updated_at: now,
    };
    return {
      status: "answered",
      reason_code: gateOrderGuard.reason_code,
      weekly_state: guardedState,
      visible_task: gateOrderGuard.visible_task,
      exit_to_global_dispatcher: false,
      tool_execution: "none",
      handoff_summary: handoffSummary,
      answer_summary: summary,
      target_dispatcher: "none",
      note_information: null,
      child_flow_handoff: null,
      conversation_context: buildWeeklyConversationContext({
        weeklyState: args.previousWeeklyState,
        output,
        reducedState: guardedState,
        handoffSummary,
        visibleTask: gateOrderGuard.visible_task,
      }),
      blocked_effects: [{
        type: "weekly_adaptive_review_v1",
        reason_code: gateOrderGuard.reason_code,
      }],
      state_mutation_audit: guardedMerge.audit,
      evidence: output.evidence,
    };
  }

  const finishGuard = adjustSurfaceRequired
    ? null
    : completionGuard({ output, gates: nextGates });
  const continuationGuard = finishGuard;
  if (continuationGuard) {
    const guardedGates = finishGuard?.visible_task === "weekly_synthesis"
      ? {
        ...nextGates,
        synthesis_status: nextGates.synthesis_status === "complete"
          ? "complete"
          : "captured" as WeeklyReviewGateStatus,
      }
      : nextGates;
    const guardedFlow: WeeklyReviewLocalFlowState = {
      ...previousFlow,
      stage: continuationGuard.stage,
      proposal_status: previousFlow.proposal_status,
      validation_unlock_status: "locked_until_weekly_complete",
      human_signals: nextSignals,
      felt_progress: nextFeltProgress,
      weekly_gates: guardedGates,
      detour_candidate: nextDetour,
      synthesis_visible_status: synthesisVisibleStatusAfterVisibleTask(
        previousFlow.synthesis_visible_status,
        continuationGuard.visible_task,
      ),
      child_flow: childFlowForTurn,
      weekly_planning_context: planningContext,
      adjust_recommendation: mergeAdjustRecommendation({
        previous: previousFlow.adjust_recommendation,
        proposed: output.adjust_recommendation,
        planningContext,
        visibleTask: continuationGuard.visible_task,
        now,
      }),
      user_corrected_action_statuses: nextActionStatusCorrections,
      last_user_signal: output.human_signal_updates.user_summary ??
        previousFlow.last_user_signal,
      last_visible_summary: output.weekly_intent.summary ||
        previousFlow.last_visible_summary,
      last_handoff_summary: handoffSummary,
      turn_count: turnCount,
      max_turns: maxTurns,
      updated_at: now,
    };
    const guardedMerge = mergeWeeklyReviewLocalState({
      previous: previousFlow,
      proposed: guardedFlow,
      output,
      transition: continuationGuard.reason_code,
      now,
      constraints: {
        allowDetourChange: output.detour_candidate.kind !== "none",
        allowDetourClear: detourClearAllowed,
        allowChildFlowChange: Boolean(output.handoff_updates.revision_summary),
      },
    });
    const guardedState = {
      ...args.previousWeeklyState,
      status: "open",
      weekly_flow_state: guardedMerge.state,
      updated_at: now,
    };
    return {
      status: "answered",
      reason_code: continuationGuard.reason_code,
      weekly_state: guardedState,
      visible_task: continuationGuard.visible_task,
      exit_to_global_dispatcher: false,
      tool_execution: "none",
      handoff_summary: handoffSummary,
      answer_summary: summary,
      target_dispatcher: "none",
      note_information: null,
      child_flow_handoff: null,
      conversation_context: buildWeeklyConversationContext({
        weeklyState: args.previousWeeklyState,
        output,
        reducedState: guardedState,
        handoffSummary,
        visibleTask: continuationGuard.visible_task,
      }),
      blocked_effects: [],
      state_mutation_audit: guardedMerge.audit,
      evidence: output.evidence,
    };
  }

  const visibleTask = output.flow_action === "defer_flow"
    ? "stop_or_cancel"
    : visibleTaskAfterStructuredReducerGuards({
      output,
      nextGates,
      previousFlow,
    });
  const closeAfterVisible = output.flow_action === "defer_flow" ||
    (!adjustSurfaceRequired && (
      output.state_updates.close_after_visible ||
      visibleClosureShouldComplete ||
      turnLimitCloseAllowed ||
      output.flow_action === "complete_weekly_no_change" ||
      output.flow_action === "complete_flow"
    ));
  const nextStatus = output.flow_action === "defer_flow"
    ? "stopped"
    : closeAfterVisible
    ? "completed"
    : adjustSurfaceRequired
    ? "open"
    : output.state_updates.status;
  const validationUnlockStatus = nextStatus === "completed"
    ? "available"
    : output.state_updates.validation_unlock_status;
  const nextFlow: WeeklyReviewLocalFlowState = {
    ...previousFlow,
    stage: closeAfterVisible
      ? "closing"
      : visibleTask !== output.visible_task.kind
      ? weeklyStageForVisibleTask(visibleTask)
      : output.state_updates.weekly_stage,
    proposal_status: output.handoff_updates.status === "requested" ||
        output.handoff_updates.status === "ready" ||
        output.handoff_updates.status === "delivered"
      ? "detour_discussed"
      : output.flow_action === "defer_flow"
      ? "cancelled"
      : previousFlow.proposal_status,
    validation_unlock_status: validationUnlockStatus,
    human_signals: nextSignals,
    felt_progress: nextFeltProgress,
    weekly_gates: nextGates,
    detour_candidate: nextDetour,
    synthesis_visible_status: synthesisVisibleStatusAfterVisibleTask(
      previousFlow.synthesis_visible_status,
      visibleTask,
    ),
    child_flow: childFlowForTurn,
    weekly_planning_context: planningContext,
    adjust_recommendation: mergeAdjustRecommendation({
      previous: previousFlow.adjust_recommendation,
      proposed: output.adjust_recommendation,
      planningContext,
      visibleTask,
      now,
    }),
    user_corrected_action_statuses: nextActionStatusCorrections,
    last_user_signal: output.human_signal_updates.user_summary ??
      previousFlow.last_user_signal,
    last_visible_summary: summary || previousFlow.last_visible_summary,
    last_handoff_summary: handoffSummary,
    turn_count: turnCount,
    max_turns: maxTurns,
    updated_at: now,
  };
  const nextMerge = mergeWeeklyReviewLocalState({
    previous: previousFlow,
    proposed: nextFlow,
    output,
    transition: `weekly_review_local_${output.flow_action}`,
    now,
    constraints: {
      allowValidationUnlock: nextStatus === "completed",
      allowDetourChange: output.detour_candidate.kind !== "none",
      allowDetourClear: detourClearAllowed,
      allowChildFlowChange: Boolean(output.handoff_updates.revision_summary),
    },
  });
  const effectiveValidationUnlockStatus =
    nextMerge.state.validation_unlock_status;
  const nextAdaptiveReview = maybeRecomputeWeeklyReview({
    previousReview: args.previousWeeklyState.weekly_adaptive_review,
    projection: args.previousWeeklyState.weekly_progress_review,
    humanSignals: nextSignals,
    actionStatusCorrections: nextActionStatusCorrections,
    action: output.flow_action,
  });
  addWeeklyAdaptiveReviewMutationAudit({
    audit: nextMerge.audit,
    previousReview: args.previousWeeklyState.weekly_adaptive_review,
    nextReview: nextAdaptiveReview,
  });
  const nextWeeklyState: Record<string, unknown> = {
    ...args.previousWeeklyState,
    status: nextStatus === "completed" || nextStatus === "stopped"
      ? nextStatus
      : "open",
    weekly_adaptive_review: nextAdaptiveReview,
    weekly_flow_state: nextMerge.state,
    validation_unlock: effectiveValidationUnlockStatus === "available"
      ? {
        status: "available",
        meaning:
          "La validation de la semaine suivante est disponible apres conclusion du point weekly.",
      }
      : args.previousWeeklyState.validation_unlock,
    updated_at: now,
  };
  const conversationContext = buildWeeklyConversationContext({
    weeklyState: args.previousWeeklyState,
    output,
    reducedState: nextWeeklyState,
    handoffSummary,
    visibleTask,
  });
  return {
    status: closeAfterVisible ? "closed" : "answered",
    reason_code: `weekly_review_local_${output.flow_action}`,
    weekly_state: nextWeeklyState,
    visible_task: visibleTask,
    exit_to_global_dispatcher: false,
    tool_execution: "none",
    handoff_summary: handoffSummary,
    answer_summary: summary,
    target_dispatcher: "none",
    note_information: null,
    child_flow_handoff: null,
    conversation_context: conversationContext,
    blocked_effects: [],
    state_mutation_audit: nextMerge.audit,
    evidence: output.evidence,
  };
}

function dispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local du flow weekly_adaptive_review_v1.",
    "Contexte: Sophia a envoye un point weekly de fin de semaine. Le weekly lit les preuves daily/dashboard, mene un bilan coaching, clarifie les signaux humains, accepte les corrections de progression, produit une synthese et une cloture.",
    "Le weekly ne modifie jamais le plan depuis le chat et ne lance aucun child flow coaching.",
    "Frontiere chat/outils: Sophia n'a jamais deja une carte, une potion, un rappel recurrent, un status detaille ou un ajustement Plan disponible depuis le chat. Ces demandes sortent vers global avec contexte.",
    "Tu n'es pas le dispatcher global. Tu ne reponds jamais directement au user.",
    "Tu retournes uniquement un JSON conforme au contrat.",
    "Sortie sparse obligatoire: fournis seulement les champs utiles a la decision courante. Omet les champs null, false, 0, tableaux vides ou objets par defaut; le reducer/runtime reconstruit les defaults.",
    "weekly_state.weekly_flow_state.weekly_planning_context est deterministe et fait autorite. W4.4: sa seule destination est adjustment_destination.mode=coach_review — le point remonte au COACH, qui tranche. Les deux anciennes sorties (Ajuster mon plan, Validation du niveau) designaient des surfaces supprimees: ne les nomme jamais, ne renvoie l'eleve vers aucun ecran d'ajustement de plan ni vers une validation de niveau.",
    "",
    "Actions possibles: answer_weekly_question, confirm_weekly_diagnostic, reject_weekly_diagnostic, clarify_human_signal, recap_weekly, explain_weekly_reasoning, forgotten_progress_correction, clarify_forgotten_progress, complete_weekly_no_change, complete_flow, exit_to_global_dispatcher, defer_flow.",
    "",
    "Regles:",
    ...directEffectLocalDispatcherPromptLines(),
    "- Ne fais aucune regex metier.",
    "- Ne decide pas par mot-cle isole.",
    "- Interprete le message par rapport au weekly actif.",
    "- Ne recalcule pas la projection factuelle.",
    "- Ne dis jamais qu'un changement de plan est applique.",
    "- Ne construis jamais de patch Plan, de pending confirmation Plan, ni de formulation type ce qui bougerait / ce qui resterait.",
    "- Tant que weekly_synthesis et weekly_closure ne sont pas completes, ne sors pas du weekly pour une demande liee au bilan, a la semaine suivante, a la suite, au plan, a l'ajustement, a une recommandation, a la synthese ou a la cloture. Ces demandes restent dans weekly_adaptive_review_v1.",
    "- Ordre sain obligatoire: ask_week_experience -> review_action_gaps -> explore_action_blocker si necessaire -> ask_global_progress_feeling/deepen_global_progress -> qualify_solution_fit si utile -> weekly_synthesis -> weekly_closure.",
    "- Sophia mene le weekly: ne laisse pas le user conduire directement vers un outil si les gates obligatoires sont manquants.",
    "- Tant que global_progress_status ou felt_progress_status est missing, ne choisis pas qualify_solution_fit, weekly_synthesis ou weekly_closure. Utilise ask_global_progress_feeling ou deepen_global_progress, sauf si le message courant donne deja clairement le ressenti d'avancee vers l'objectif global.",
    "- Ne redemande pas un signal deja donne. Si le user fournit une cause claire, un contexte clair et un impact clair sur les actions, marque solution_fit_status=captured et avance vers weekly_adjust_recommendation ou weekly_synthesis au lieu de reposer une clarification equivalente.",
    "- Le weekly est un flow parent de bilan strategique: il comprend l'objectif global, l'avancee ressentie, l'energie, les actions et les blocages avant de conclure.",
    "- Si le user repond au bilan weekly, reste dans weekly.",
    "- Si le user demande une carte, une potion, un rappel recurrent, une preference, un status, une verification d'opportunite ou une reparation emotionnelle/demotivation comme capacite distincte et hors bilan weekly, ne lance aucun bridge parent-child: retourne exit_to_global_dispatcher avec target_dispatcher=global. Une demande d'ajustement Plan liee a la semaine ou a la suite reste dans weekly.",
    "- Si le user demande un rappel ponctuel one-shot avec payload_hint complet tout en continuant le bilan weekly, ne sors pas vers global: reste dans weekly et laisse la lane directe standard gerer le rappel.",
    "- Si le user quitte vraiment le weekly pour une recommandation Sophia generale hors bilan, retourne exit_to_global_dispatcher avec note_information.target_dispatcher=global. Le dispatcher global decidera la suite. S'il demande quoi utiliser, quoi faire la semaine prochaine, quel ajustement envisager, une synthese ou une cloture dans le cadre du weekly, reste dans weekly.",
    "- Si le user pose une question produit explicite sur Sophia ou une fonctionnalite, retourne exit_to_global_dispatcher avec target_dispatcher=global et handoff_hint_for_global_dispatcher.likely_intent=product_help. Le global decidera product_help; le weekly ne lance aucun sous-flow produit.",
    "- Si le user pose une question factuelle/status pendant le weekly, retourne exit_to_global_dispatcher target_dispatcher=global avec le contexte; ne fais pas de status inline.",
    "- Si plusieurs plans/actions sont dans le weekly, preserve toujours le contexte plan/action.",
    "- Si le scope plan/action est ambigu, clarifie au lieu de melanger les plans.",
    "- chat_plan_mutation_request: mets true seulement quand le message courant demande d'appliquer, valider, activer ou modifier le changement de plan directement dans le chat ('fais-le pour moi', 'valide a ma place', 'applique-le directement', 'change-le maintenant'). C'est une demande d'action, pas une demande 'quoi ajuster': ne choisis pas weekly_adjust_recommendation pour re-derouler la recommandation; garde le stage courant utile et laisse le visible refuser sobrement et renvoyer vers la plateforme. Distingue-la d'une vraie question 'quoi devrais-je ajuster / quoi renseigner', ou chat_plan_mutation_request reste false.",
    "- Si le user corrige une progression oubliee, ne l'assimile pas a un ajustement Plan.",
    "- Si le user mentionne une progression passee, par exemple une action faite jeudi, stocke-la comme correction weekly a clarifier/valider; ne dis pas que c'est corrige sans commit dedie.",
    "- Si le user change de sujet sans dispatcher local cible clair, retourne exit_to_global_dispatcher target_dispatcher=global.",
    "- Si le user veut arreter le weekly, retourne exit_to_global_dispatcher avec note_information.target_dispatcher=global. Le message est ensuite reanalyse par le dispatcher global.",
    "- Si le user veut seulement reporter le weekly sans changer de dispatcher, retourne defer_flow.",
    "- Si le message contient un vrai signal safety, retourne exit_to_global_dispatcher avec target_dispatcher=global et note_information.handoff_reason=safety. Le global dispatcher reprend le message et doit router safety.",
    "- Pour exit_to_global_dispatcher, fournis note_information canonique.",
    "",
    "Field Completion Rules:",
    "- flow_action: decision principale du tour courant. Choisis une action de continuation weekly si le user repond au bilan, parle de son objectif global, de son ressenti d'avancee, d'une action, d'un blocage, d'une hypothese de solution, demande quoi faire la semaine prochaine, demande si le plan peut etre ajuste ici, demande un recap, une synthese, une cloture, corrige une progression ou ajoute un rappel ponctuel one-shot a un besoin weekly restant. Choisis exit_to_global_dispatcher seulement si le user arrete/abandonne clairement le weekly, quitte vraiment le weekly pour une capacite hors weekly, une question status/produit, un rappel recurrent, une preference, un sujet hors bilan ou un vrai signal safety. Choisis defer_flow seulement pour reporter localement. Ne base jamais l'action sur l'etat precedent seul.",
    "- confidence: high si l'intention du message courant est claire et compatible avec le weekly; medium si probable mais incomplete; low si clarification ou prudence necessaire. N'utilise pas high pour masquer un scope Plan ambigu.",
    "- risk_score: score local 0-10 uniquement si non nul ou safety. Reste bas pour fatigue, hesitation ou frustration ordinaire. N'invente pas de safety. Si le message contient un vrai risque safety, augmente le score et choisis exit_to_global_dispatcher avec note_information target_dispatcher=global.",
    "- target_dispatcher: none pour toute continuation weekly, rappel ponctuel one-shot traite par lane directe, demande d'ajustement liee au weekly, synthese, cloture, defer_flow ou completion. global avec exit_to_global_dispatcher pour les sorties globales, questions produit, status, rappel recurrent, coaching hors weekly et safety.",
    "- weekly_intent: resume l'intention weekly du message courant. kind doit suivre flow_action: weekly_answer pour reponse au bilan, weekly_confirmation/rejection pour validation ou rejet, forgotten_progress pour correction retrospective, stop/off_topic/explicit_tool_request/safety/unclear selon le cas. summary doit rester court et ne pas inventer de fait.",
    "- human_signal_updates: remplis seulement les signaux humains explicitement fournis ou fortement confirmes dans ce tour. objective_delta = avancee par rapport a l'objectif global. felt_progress = ressenti subjectif sur cette avancee (aligned, encouraged, neutral, frustrated, disconnected, worried, unclear, unknown). felt_state = energie/charge. Mets null quand le message ne parle pas de progression, energie, blocage ou ressenti weekly. Ne transforme pas une hypothese du bilan en fait confirme.",
    "- handoff_updates: garde status none sauf compatibilite avec un retour deja stocke. Ne prepare pas de handoff Plan depuis ce champ. scope doit rester none ou ambiguous si le plan/action cible n'est pas clair; ne fabrique pas d'id.",
    "- adjust_recommendation: omets sauf si la confiance est au moins 0.95 avec preuves daily solides, coherence semaine passee/semaine suivante ou niveau suivant, cause claire, action concernee claire, et utilite forte. Ce champ est strictement non-mutant: il ne modifie pas le plan, ne cree pas de patch et ne promet aucun changement. Remplis uniquement what_to_adjust, why, evidence, confidence, target_scope, safe_to_surface=true. target_scope reste next_week_plan ou next_level_inputs selon le mode, mais la destination est TOUJOURS le coach (coach_review): destination_instruction dit que le point lui est transmis en synthese et qu'il decidera. N'oriente jamais vers Ajuster mon plan ni vers une validation de niveau (surfaces supprimees). Si le user demande quoi faire la semaine prochaine et que ce champ est deja ready ou peut etre rempli avec ce seuil, choisis visible_task.kind=weekly_adjust_recommendation; sinon continue la collecte ou la synthese.",
    "- forgotten_progress: none par defaut. candidate si le user mentionne une progression oubliee sans cible suffisante. needs_target si la cible manque. ready_for_progress_tool seulement si la cible et l'issue sont assez claires pour le reducer. blocked si la correction est contradictoire ou impossible. Ne confonds pas correction retrospective et ajustement de plan futur.",
    ...localOneShotDirectEffectPromptLines("le weekly"),
    "- action_status_updates: liste les corrections utilisateur action par action quand le user contredit ou precise la projection DB. Utilise plan_item_id/occurrence_id depuis le contexte si disponible, sinon title exact; corrected_status completed/partial/missed/unknown; user_evidence reprend les mots du user. Laisse [] si aucune correction. Ces corrections battent la projection dans item_summaries et la synthese visible. N'en fais pas un ajustement Plan.",
    "- weekly_gates: etat de progression du weekly. week_experience_status capture comment la semaine a ete vecue. action_review_status capture la verification actions/gaps. global_progress_status capture le lien a l'objectif global. felt_progress_status capture le ressenti sur cette avancee. solution_fit_status capture la qualification d'une solution. Si une recommandation d'ajustement safe_to_surface=true est fournie, solution_fit_status doit etre captured ou complete. Ne capture pas solution_fit_status seulement parce que visible_task.kind=weekly_adjust_recommendation si adjust_recommendation n'est pas safe_to_surface. synthesis_status et closure_status doivent etre complete avant completion. Utilise missing si absent, captured si compris, needs_deeper si une precision coaching est necessaire, complete si le gate est suffisamment stable.",
    "- detour_candidate: champ de compatibilite. kind none par defaut. Product_help et one-shot reminder ne sont pas des child flows weekly.",
    "- state_updates: patch d'etat weekly, pas profil global. weekly_stage suit la suite logique du flow: opening, week_experience, action_review, action_blocker, global_progress, solution_fit, synthesis, closure, ou anciennes valeurs de compatibilite. status open/completed/stopped/deferred/exit_to_global doit correspondre a flow_action. validation_unlock_status devient available seulement apres weekly_closure. close_after_visible true seulement pour stop/defer ou completion apres synthesis+closure.",
    "- visible_task.kind: stage visible exact pour le prochain prompt local. Kinds actifs autorises: ask_week_experience, review_action_gaps, explore_action_blocker, ask_global_progress_feeling, deepen_global_progress, qualify_solution_fit, weekly_adjust_recommendation, weekly_synthesis, weekly_closure, clarify_human_signal, forgotten_progress_clarify, forgotten_progress_ack, forgotten_progress_blocked. Ne choisis pas answer_weekly_question, weekly_recap, explain_reasoning, exit_or_cancel, safety, stop_close ou stop_or_cancel comme visible actif. Si le user confirme la cloture apres une synthese complete, utilise weekly_closure avec weekly_intent.kind=weekly_confirmation.",
    "- visible_task.instruction: instruction courte au prompt visible, sans texte final utilisateur. Ne construis jamais la reponse visible ici.",
    "- visible_task.conversation_context: ce champ existe dans le contrat mais le reducer weekly reconstruit la version finale visible-agent-safe. Si tu le fournis, garde-le compact et filtre: contraintes, valeurs connues, incertitudes, ton, limites. Pas de DB brute, memoire brute, note_information brute, ids inventes, ni decision a refaire par l'agent visible.",
    "- note_information: obligatoire pour exit_to_global_dispatcher. Elle est consommee par le dispatcher cible, jamais transmise brute au prompt visible. Garde strictement la structure source_flow_id, target_dispatcher, handoff_reason, handoff_context_for_next_dispatcher, structured_context, confidence si utile. Ne fournis pas user_words. structured_context doit etre succinct et non vide avec etat weekly utile, acquis, incertitudes et recommended_next_focus. Ne mets pas constraints, source_flow_state_summary, target_local_dispatcher_hint, risk_score ou committed_effects dans la note.",
    "- exit_memo: champ secondaire de compatibilite runtime. Ne l'utilise jamais a la place de note_information. Omet-le pour continuation/defer/completion sans transition; le runtime reconstruit needed=false/reason=none. Si transition, garde-le coherent avec note_information mais ne mets pas de decision visible dedans.",
    "- evidence: indices semantiques vraiment utilises depuis le message courant ou le contexte weekly. Pas de pseudo-preuves, pas de mots-cles isoles sans interpretation.",
    "",
    "Transition Rules:",
    "- defer_flow: le user reporte le weekly sans changement de dispatcher; target_dispatcher none; visible_task.kind stop_or_cancel.",
    "- exit_to_global_dispatcher: le user abandonne clairement le weekly, apporte un nouveau sujet hors weekly, demande une recommandation Sophia/coaching hors bilan, status, carte, potion, preference, question produit, rappel recurrent, ou donne un vrai signal safety; target_dispatcher=global; note_information obligatoire. Une demande d'ajustement ou de recommandation pour la semaine suivante ne sort pas du weekly.",
    "- Safety: ne sors jamais directement vers un flow safety depuis weekly. Utilise exit_to_global_dispatcher target_dispatcher=global avec handoff_reason=safety; le global dispatcher reprend et route safety.",
    "- complete_flow ou complete_weekly_no_change: seulement apres weekly_synthesis puis weekly_closure. Le reducer bloque toute completion prematuree.",
    "",
    "Exemple JSON 1 - continuation sparse:",
    '{"flow_action":"confirm_weekly_diagnostic","confidence":"high","weekly_intent":{"kind":"weekly_confirmation","summary":"Le user confirme le diagnostic et se sent fatigue mais d accord."},"human_signal_updates":{"objective_delta":"slight_progress","felt_progress":"encouraged","felt_state":"tired_but_ok","dominant_blocker_confirmation":"confirmed","user_summary":"fatigue mais progression legere"},"action_status_updates":[{"plan_item_id":"item-1","title":"rangement","corrected_status":"partial","user_evidence":"je l ai fait trois jours puis j ai relache","source_turn_summary":"rangement partiel"}],"weekly_gates":{"global_progress_status":"captured","felt_progress_status":"captured"},"state_updates":{"status":"open","weekly_stage":"solution_fit"},"visible_task":{"kind":"qualify_solution_fit","instruction":"Reformuler le diagnostic weekly et qualifier la prochaine piste sans lancer d outil."},"evidence":["confirme le diagnostic","fatigue mais progression"]}',
    "Exemple JSON 2 - sortie globale sparse:",
    '{"flow_action":"exit_to_global_dispatcher","confidence":"high","target_dispatcher":"global","weekly_intent":{"kind":"explicit_tool_request","summary":"Le user demande une carte au lieu de continuer le weekly."},"state_updates":{"status":"exit_to_global","weekly_stage":"solution_fit","close_after_visible":true},"exit_memo":{"needed":true,"reason":"explicit_tool_request","user_intent_summary":"demande de carte hors weekly","handoff_hint_for_global_dispatcher":{"likely_intent":"normal_coaching","why":"demande hors weekly; global reprend"}},"note_information":{"source_flow_id":"weekly_adaptive_review_v1","handoff_reason":"explicit_user_request","target_dispatcher":"global","handoff_context_for_next_dispatcher":"Le user quitte le point weekly pour une demande hors perimetre. Global reprend avec le contexte weekly.","structured_context":{"user_message_summary":"demande de carte hors weekly","active_flow_summary":"weekly parent exits to global","recommended_next_focus":"global"},"confidence":"high"},"evidence":["demande explicite hors weekly"]}',
    "",
    "Schema sparse autorise: flow_action, confidence, chat_plan_mutation_request si true, target_dispatcher si sortie globale, weekly_intent, human_signal_updates, handoff_updates, adjust_recommendation, forgotten_progress, direct_effect_request, action_status_updates, weekly_gates, detour_candidate, state_updates, visible_task, exit_memo, note_information, risk_score si non nul/safety, evidence. Omet tout champ inutile/default. Pour exit_to_global_dispatcher, note_information est obligatoire. Pour continuation weekly, note_information et exit_memo doivent etre omis.",
  ].join("\n");
}

export function weeklyReviewLocalDispatcherSystemPromptForTest(): string {
  return dispatcherSystemPrompt();
}

type WeeklyReviewDispatcherFailureKind =
  | "timeout"
  | "invalid_json"
  | "provider_error"
  | "null_output"
  | "unknown";

function weeklyReviewDispatcherFailure(error: unknown): {
  kind: WeeklyReviewDispatcherFailureKind;
  error_name: string | null;
  error_message: string | null;
} {
  const name = nullableString((error as any)?.name);
  const message = nullableString((error as any)?.message ?? error);
  const haystack = `${name ?? ""} ${message ?? ""}`.toLowerCase();
  let kind: WeeklyReviewDispatcherFailureKind = "unknown";
  if (/timeout|timed out|abort|aborted/.test(haystack)) {
    kind = "timeout";
  } else if (
    /not_json|not_object|json|unexpected token|unexpected non-whitespace/.test(
      haystack,
    )
  ) {
    kind = "invalid_json";
  } else if (message) {
    kind = "provider_error";
  }
  return { kind, error_name: name, error_message: message };
}

export async function runWeeklyReviewLocalDispatcher(input: {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  weekly_state: Record<string, unknown>;
  turn_frame?: unknown;
}): Promise<WeeklyReviewLocalDispatcherOutput | null> {
  const directEffectConfirmationContext = buildDirectEffectConfirmationContext(
    input.turn_frame,
  );
  const userPrompt = JSON.stringify({
    task: "dispatch_weekly_adaptive_review_local_flow",
    weekly_state_json: input.weekly_state,
    weekly_progress_review_summary_json:
      input.weekly_state.weekly_progress_review ?? null,
    weekly_adaptive_review_json: input.weekly_state.weekly_adaptive_review ??
      null,
    user_message: input.user_message,
    conversation_excerpt: input.recent_messages,
    platform_context: withDirectEffectLocalContext(
      {
        direct_effect_confirmation_context: directEffectConfirmationContext,
      },
      null,
      weeklyActiveActionCandidates(input.weekly_state),
      directEffectTimeContextFromTurnFrame(input.turn_frame),
    ),
    turn_frame_direct_effect_context: directEffectConfirmationContext,
  });
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
      model: getGlobalAiModel(),
      source: "weekly_adaptive_review.local_dispatcher",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
  return normalizeWeeklyReviewLocalDispatcherOutput(raw);
}

export function recentMessagesFromHistory(history: unknown) {
  return recentChatMessagesFromHistory(history, RECENT_MESSAGE_LIMITS.toolFlow);
}

function exitMemoForTempMemory(args: {
  reduced: WeeklyReviewReducerResult;
  output: WeeklyReviewLocalDispatcherOutput;
  previousWeeklyState: Record<string, unknown>;
}): Record<string, unknown> {
  const flow = defaultWeeklyFlowState(args.previousWeeklyState);
  return {
    ...args.output.exit_memo,
    at: new Date().toISOString(),
    reducer_reason_code: args.reduced.reason_code,
    flow_summary: args.output.weekly_intent.summary || null,
    note_information: args.reduced.note_information,
    local_flow_context: {
      ...args.output.exit_memo.local_flow_context,
      weekly_stage: args.output.exit_memo.local_flow_context.weekly_stage ??
        flow.stage,
      week_strategy: args.output.exit_memo.local_flow_context.week_strategy ??
        (cleanText(
          (args.previousWeeklyState.weekly_adaptive_review as any)
            ?.week_strategy?.decision,
        ) || null),
      last_visible_summary:
        args.output.exit_memo.local_flow_context.last_visible_summary ??
          flow.last_visible_summary,
      last_handoff_summary:
        args.output.exit_memo.local_flow_context.last_handoff_summary ??
          flow.last_handoff_summary,
      validation_unlock_status:
        args.output.exit_memo.local_flow_context.validation_unlock_status ??
          flow.validation_unlock_status,
    },
  };
}

function nextMemoryAfterWeeklyReduction(args: {
  tempMemory: unknown;
  reduced: WeeklyReviewReducerResult;
  output: WeeklyReviewLocalDispatcherOutput;
}): Record<string, unknown> {
  let next = args.reduced.weekly_state
    ? writeWeeklyReviewState(args.tempMemory, args.reduced.weekly_state)
    : clearWeeklyReviewState(args.tempMemory);
  if (args.reduced.weekly_state?.status === "completed") {
    next.__last_weekly_adaptive_review_summary = {
      source: "weekly_adaptive_review_v1",
      created_at: new Date().toISOString(),
      internal_summary: args.reduced.answer_summary,
      handoff_summary: args.reduced.handoff_summary,
      user_visible: false,
    };
  }
  return next;
}

function weeklyReviewShortTrace(args: {
  reduced: WeeklyReviewReducerResult;
  output: WeeklyReviewLocalDispatcherOutput;
}): Record<string, unknown> {
  const flow = isRecord(args.reduced.weekly_state?.weekly_flow_state)
    ? args.reduced.weekly_state.weekly_flow_state
    : {};
  const childFlow = isRecord(flow.child_flow) ? flow.child_flow : {};
  const detour = isRecord(flow.detour_candidate) ? flow.detour_candidate : {};
  const pendingStatePresent = cleanText(detour.kind) !== "" &&
      cleanText(detour.kind) !== "none" ||
    cleanText(childFlow.status) !== "" &&
      cleanText(childFlow.status) !== "none";
  const candidateSummary = args.output.detour_candidate.kind === "none"
    ? []
    : [{
      kind: args.output.detour_candidate.kind,
      target: args.output.detour_candidate.target_action_or_plan,
      readiness: args.output.detour_candidate.readiness,
      user_consent: args.output.detour_candidate.user_consent,
    }];
  return {
    flow_action: args.output.flow_action,
    visible_task: args.reduced.visible_task,
    selected_target: args.output.detour_candidate.target_action_or_plan ??
      args.output.handoff_updates.scope.scope_summary,
    pending_state_present: pendingStatePresent,
    direct_handoff_flag: false,
    candidate_summary: candidateSummary,
    constraint_list: [
      "plan_patch_empty_until_platform_handoff",
      "weekly_parent_returns_after_child_flow",
    ],
    readiness: args.output.detour_candidate.readiness,
    blocked_effects: args.reduced.blocked_effects,
    state_mutation_audit: args.reduced.state_mutation_audit,
  };
}

function fallbackWeeklyVisibleMessage(args: {
  visibleTask: WeeklyReviewVisibleTaskKind;
  handoffSummary: string | null;
}): string {
  void args;
  return "Je garde le point weekly, mais je n'arrive pas a formuler correctement ce tour. Reessaie dans un instant.";
}

function directEffectRequestedEffects(
  context: DirectEffectConfirmationContext | null,
): unknown[] {
  return context?.requested_effects ?? [];
}

function directEffectCommittedEffects(
  context: DirectEffectConfirmationContext | null,
): unknown[] {
  return context?.committed_effects ?? [];
}

function directEffectBlockedEffects(
  context: DirectEffectConfirmationContext | null,
): unknown[] {
  return context?.blocked_effects ?? [];
}

export async function runWeeklyReviewLocalRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  tempMemory: unknown;
  activeSkillState?: unknown;
  userMessage: string;
  history?: unknown;
  requestId?: string | null;
  v2Runtime?: ActiveTransformationRuntime | null;
  loggedMessageId?: string | null;
  turnFrame?: unknown;
  dispatcher?: typeof runWeeklyReviewLocalDispatcher;
  precomputedDispatcherOutput?: WeeklyReviewLocalDispatcherOutput | null;
  visibleAgent?: typeof runWeeklyReviewVisibleAgent;
}): Promise<OperationRuntimeResult | null> {
  const rawWeeklyState = readWeeklyReviewState({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
  if (!isRecord(rawWeeklyState)) return null;
  const weeklyState = withWeeklyPlanningContext({
    weeklyState: rawWeeklyState,
    v2Runtime: args.v2Runtime,
  });
  const directEffectConfirmationContext = buildDirectEffectConfirmationContext(
    args.turnFrame,
  );
  const dispatcher = args.dispatcher ?? runWeeklyReviewLocalDispatcher;
  let dispatcherFailure: {
    kind: WeeklyReviewDispatcherFailureKind;
    error_name: string | null;
    error_message: string | null;
  } | null = null;
  let output: WeeklyReviewLocalDispatcherOutput | null = null;
  try {
    output = args.precomputedDispatcherOutput ?? await dispatcher({
      user_id: args.userId,
      request_id: args.requestId ?? null,
      user_message: args.userMessage,
      recent_messages: recentMessagesFromHistory(args.history),
      weekly_state: weeklyState,
      turn_frame: args.turnFrame,
    });
    if (!output) {
      dispatcherFailure = {
        kind: "null_output",
        error_name: null,
        error_message: null,
      };
    }
  } catch (error) {
    dispatcherFailure = weeklyReviewDispatcherFailure(error);
    console.warn("[WeeklyReview] local dispatcher failed", {
      kind: dispatcherFailure.kind,
      error_name: dispatcherFailure.error_name,
      error_message: dispatcherFailure.error_message,
    });
  }
  if (!output) {
    const blockedReason = dispatcherFailure?.kind === "timeout"
      ? "local_dispatcher_timeout"
      : dispatcherFailure?.kind === "invalid_json"
      ? "local_dispatcher_invalid_json"
      : "local_dispatcher_failed";
    console.warn("weekly_review.visible_fallback_used", {
      reason_code: "weekly_review_local_dispatcher_failed",
      dispatcher_failure_kind: dispatcherFailure?.kind ?? "unknown",
      visible_fallback_used: true,
      qa_green_eligible: false,
    });
    return {
      content:
        "Je garde le point weekly, mais je n'arrive pas a traiter correctement ce tour. Reessaie dans un instant.",
      nextTempMemory: args.tempMemory,
      toolExecution: "blocked",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "weekly_adaptive_review_v1",
        status: "blocked",
        reason_code: "weekly_review_local_dispatcher_failed",
        dispatcher_failure_kind: dispatcherFailure?.kind ?? "unknown",
        dispatcher_error_name: dispatcherFailure?.error_name ?? null,
        dispatcher_error_message: dispatcherFailure?.error_message ?? null,
        requested_effects: directEffectRequestedEffects(
          directEffectConfirmationContext,
        ),
        allowed_effects: [],
        committed_effects: directEffectCommittedEffects(
          directEffectConfirmationContext,
        ),
        direct_effect_confirmation_context: directEffectConfirmationContext,
        visible_fallback_used: true,
        qa_green_eligible: false,
        blocked_effects: [{
          type: "weekly_adaptive_review_v1",
          reason_code: blockedReason,
        }, ...directEffectBlockedEffects(directEffectConfirmationContext)],
      },
    };
  }
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState,
    output,
  });
  if (
    reduced.exit_to_global_dispatcher ||
    reduced.status === "safety"
  ) {
    const memoryWithWeeklyState = clearWeeklyReviewState(args.tempMemory);
    const nextTempMemory: Record<string, unknown> = {
      ...memoryWithWeeklyState,
      [WEEKLY_REVIEW_EXIT_MEMO_KEY]: exitMemoForTempMemory({
        reduced,
        output,
        previousWeeklyState: weeklyState,
      }),
    };
    return {
      content: "",
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "weekly_adaptive_review_v1",
        status: reduced.status === "safety" ? "safety" : "exit_to_global",
        reason_code: reduced.reason_code,
        flow_action: output.flow_action,
        visible_task: reduced.visible_task,
        target_dispatcher: reduced.target_dispatcher,
        note_information: reduced.note_information,
        exit_memo: nextTempMemory[WEEKLY_REVIEW_EXIT_MEMO_KEY],
        short_trace: weeklyReviewShortTrace({ reduced, output }),
        state_mutation_audit: reduced.state_mutation_audit,
        requested_effects: directEffectRequestedEffects(
          directEffectConfirmationContext,
        ),
        allowed_effects: [],
        committed_effects: directEffectCommittedEffects(
          directEffectConfirmationContext,
        ),
        direct_effect_confirmation_context: directEffectConfirmationContext,
        blocked_effects: [
          ...reduced.blocked_effects,
          ...directEffectBlockedEffects(directEffectConfirmationContext),
        ],
      },
    };
  }

  let nextTempMemory = nextMemoryAfterWeeklyReduction({
    tempMemory: args.tempMemory,
    reduced,
    output,
  });
  const visibleTask = reduced.visible_task;
  const conversationContext = reduced.conversation_context ??
    buildWeeklyConversationContext({
      weeklyState,
      output,
      reducedState: reduced.weekly_state ?? weeklyState,
      handoffSummary: reduced.handoff_summary,
      visibleTask,
    });
  const recentEffectsSummary = await loadRecentEffectsLedgerSummary({
    supabase: args.supabase,
    userId: args.userId,
    ledgerReadClient: serviceRoleLedgerReadClient(),
  });
  const visibleAgent = args.visibleAgent ?? runWeeklyReviewVisibleAgent;
  const visible = await visibleAgent({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    stage: visibleTask,
    user_message: args.userMessage,
    recent_messages: recentMessagesFromHistory(args.history),
    conversation_context: conversationContext,
    direct_effect_confirmation_context: directEffectConfirmationContext,
    recent_effects_summary: recentEffectsSummary,
  });
  const visibleText = cleanText(visible);
  const visibleFallbackUsed = !visibleText;
  if (visibleFallbackUsed) {
    console.warn("weekly_review.visible_fallback_used", {
      reason_code: reduced.reason_code,
      visible_task: visibleTask,
      visible_fallback_used: true,
      qa_green_eligible: false,
    });
  }
  const content = visibleText ||
    fallbackWeeklyVisibleMessage({
      visibleTask,
      handoffSummary: reduced.handoff_summary,
    });
  const toolExecution = reduced.tool_execution;
  const selectedHandler = "weekly_adaptive_review_v1";
  return {
    content,
    nextTempMemory,
    toolExecution,
    executedTools: [],
    toolSkillRun: {
      selected_handler: selectedHandler,
      operation_type: selectedHandler,
      status: reduced.status,
      reason_code: reduced.reason_code,
      flow_action: output.flow_action,
      visible_task: visibleTask,
      confidence: output.confidence,
      risk_score: output.risk_score,
      weekly_intent: output.weekly_intent,
      handoff_updates: output.handoff_updates,
      forgotten_progress: output.forgotten_progress,
      local_flow_state: reduced.weekly_state?.weekly_flow_state ?? null,
      target_dispatcher: reduced.target_dispatcher,
      note_information: reduced.note_information,
      conversation_context: conversationContext,
      short_trace: weeklyReviewShortTrace({ reduced, output }),
      state_mutation_audit: reduced.state_mutation_audit,
      requested_effects: directEffectRequestedEffects(
        directEffectConfirmationContext,
      ),
      allowed_effects: [],
      committed_effects: directEffectCommittedEffects(
        directEffectConfirmationContext,
      ),
      direct_effect_confirmation_context: directEffectConfirmationContext,
      blocked_effects: [
        ...reduced.blocked_effects,
        ...directEffectBlockedEffects(directEffectConfirmationContext),
      ],
      visible_fallback_used: visibleFallbackUsed,
      qa_green_eligible: !visibleFallbackUsed,
      no_durable_plan_mutation: true,
      evidence: reduced.evidence,
      toolExecution,
      executedTools: [],
    },
  };
}
