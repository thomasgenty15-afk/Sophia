import type {
  FlowOpportunityDispatcherOutput,
  FlowOpportunityLocalAction,
  FlowOpportunityLocalState,
  FlowOpportunityReducerResult,
  FlowOpportunityStatus,
  FlowOpportunityTargetFlow,
  FlowOpportunityVisibleTaskKind,
} from "./contract.ts";
import {
  createConfirmationAnchor,
  createFlowOpportunityState,
} from "./state.ts";

const LOCAL_ACTIONS = new Set([
  "offer_opportunity",
  "accept_opportunity",
  "decline_opportunity",
  "get_info_product",
  "return_from_get_info_product",
  "get_info_db",
  "repeat_offer",
  "revise_focus",
  "correct_target_flow",
  "launch_target_flow",
  "direct_command_interrupt",
  "unsupported_request_inside_flow",
  "stale_or_already_answered",
  "cancel_flow",
  "exit_to_global_dispatcher",
  "safety_preempt",
]);

const TARGET_FLOWS = new Set([
  "status_recap",
  "update_coach_preferences",
  "emotional_repair",
  "demotivation_repair",
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "one_shot_reminder",
  "create_recurring_reminder",
  "adjust_plan_item",
  "unknown",
]);

const VISIBLE_TASKS = new Set([
  "offer_status_recap",
  "offer_preference_update",
  "offer_emotional_repair",
  "offer_demotivation_repair",
  "offer_target_flow_generic",
  "reanchor_offer_after_product_help",
  "accept_and_launch_status_recap",
  "accept_and_launch_target_flow",
  "decline_ack",
  "repeat_offer",
  "revise_focus_question",
  "correct_target_flow_ack",
  "unsupported_inside_flow",
  "stale_or_already_answered",
  "cancel_or_exit",
  "handoff_to_global",
  "safety",
  "none",
]);

const STATUSES = new Set([
  "offered",
  "explaining",
  "waiting_confirmation",
  "accepted",
  "declined",
  "launched",
  "cancelled",
  "exit",
  "blocked",
]);

const EXIT_REASONS = new Set([
  "topic_change",
  "cancelled",
  "direct_command_other_flow",
  "unsupported",
  "stale",
  "safety",
  "none",
]);

const LAUNCHABLE_TARGET_FLOWS = new Set([
  "status_recap",
  "update_coach_preferences",
  "emotional_repair",
  "demotivation_repair",
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
  "adjust_plan_item",
]);

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

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
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
    throw new Error("flow_opportunity_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!isRecord(parsed)) {
    throw new Error("flow_opportunity_local_dispatcher_not_object");
  }
  return parsed;
}

export function normalizeFlowOpportunityDispatcherOutput(
  raw: unknown,
): FlowOpportunityDispatcherOutput {
  const root = parseJsonObject(raw);
  const opportunityRoot = recordValue(root.opportunity);
  const inputRoot = recordValue(root.target_flow_input);
  const subskillRoot = recordValue(root.subskill_call);
  const visibleRoot = recordValue(root.visible_task);
  const statePatchRoot = recordValue(root.state_patch);
  const exitRoot = recordValue(root.exit_memo);
  const targetFlow = enumValue<FlowOpportunityTargetFlow>(
    opportunityRoot.target_flow ?? statePatchRoot.target_flow,
    TARGET_FLOWS,
    "unknown",
  );
  const targetContext = recordValue(statePatchRoot.target_context);
  const confirmationAnchor = recordValue(statePatchRoot.confirmation_anchor);
  return {
    local_action: enumValue<FlowOpportunityLocalAction>(
      root.local_action,
      LOCAL_ACTIONS,
      "unsupported_request_inside_flow",
    ),
    confidence: confidence(root.confidence),
    risk_score: riskScore(root.risk_score),
    opportunity: {
      opportunity_id: stringValue(opportunityRoot.opportunity_id),
      target_flow: targetFlow,
      target_action: stringValue(opportunityRoot.target_action) ||
        `run_${targetFlow}`,
      confirmation_anchor_still_valid:
        opportunityRoot.confirmation_anchor_still_valid !== false,
      reason: stringValue(opportunityRoot.reason),
    },
    target_flow_input: {
      focus: stringArray(inputRoot.focus),
      surface: stringValue(inputRoot.surface) || null,
      seed_context: recordValue(inputRoot.seed_context),
      origin_evidence: stringArray(inputRoot.origin_evidence),
    },
    subskill_call: {
      needed: subskillRoot.needed === true,
      skill_id: subskillRoot.skill_id === "product_help"
        ? "product_help"
        : subskillRoot.skill_id === "status_recap"
        ? "status_recap"
        : null,
      reason: stringValue(subskillRoot.reason) || null,
      context_for_subskill: recordValue(subskillRoot.context_for_subskill),
    },
    visible_task: {
      kind: enumValue<FlowOpportunityVisibleTaskKind>(
        visibleRoot.kind,
        VISIBLE_TASKS,
        "unsupported_inside_flow",
      ),
      instruction: stringValue(visibleRoot.instruction),
    },
    state_patch: {
      status: enumValue<FlowOpportunityStatus>(
        statePatchRoot.status,
        STATUSES,
        "waiting_confirmation",
      ),
      target_flow: targetFlow,
      target_context: targetContext,
      confirmation_anchor: confirmationAnchor,
      subskill_history_append: isRecord(statePatchRoot.subskill_history_append)
        ? statePatchRoot.subskill_history_append
        : null,
    },
    exit_memo: {
      needed: exitRoot.needed === true,
      reason: enumValue(
        exitRoot.reason,
        EXIT_REASONS,
        "none",
      ),
      flow_summary: stringValue(exitRoot.flow_summary) || null,
      original_opportunity_id: stringValue(exitRoot.original_opportunity_id) ||
        null,
      target_flow: TARGET_FLOWS.has(stringValue(exitRoot.target_flow))
        ? stringValue(exitRoot.target_flow) as FlowOpportunityTargetFlow
        : null,
      target_context: recordValue(exitRoot.target_context),
      handoff_hint_for_global_dispatcher:
        stringValue(exitRoot.handoff_hint_for_global_dispatcher) || null,
      same_user_message_should_be_reprocessed:
        exitRoot.same_user_message_should_be_reprocessed === true,
    },
    evidence: stringArray(root.evidence),
  };
}

function visibleTaskForOffer(targetFlow: FlowOpportunityTargetFlow) {
  switch (targetFlow) {
    case "status_recap":
      return "offer_status_recap";
    case "update_coach_preferences":
      return "offer_preference_update";
    case "emotional_repair":
      return "offer_emotional_repair";
    case "demotivation_repair":
      return "offer_demotivation_repair";
    default:
      return "offer_target_flow_generic";
  }
}

export function buildInitialOfferDispatcherOutput(args: {
  opportunity_id: string;
  target_flow: FlowOpportunityTargetFlow;
  target_action?: string | null;
  target_context: Record<string, unknown>;
  reason: string;
  evidence: string[];
}): FlowOpportunityDispatcherOutput {
  const anchor = createConfirmationAnchor({
    targetFlow: args.target_flow,
    targetContext: args.target_context,
  });
  const focus = stringArray(args.target_context.focus);
  return {
    local_action: "offer_opportunity",
    confidence: "high",
    risk_score: 0,
    opportunity: {
      opportunity_id: args.opportunity_id,
      target_flow: args.target_flow,
      target_action: args.target_action ?? `run_${args.target_flow}`,
      confirmation_anchor_still_valid: true,
      reason: args.reason,
    },
    target_flow_input: {
      focus,
      surface: stringValue(args.target_context.surface) || null,
      seed_context: args.target_context,
      origin_evidence: args.evidence,
    },
    subskill_call: {
      needed: false,
      skill_id: null,
      reason: null,
      context_for_subskill: {},
    },
    visible_task: {
      kind: visibleTaskForOffer(args.target_flow),
      instruction: args.reason,
    },
    state_patch: {
      status: "waiting_confirmation",
      target_flow: args.target_flow,
      target_context: args.target_context,
      confirmation_anchor: anchor,
      subskill_history_append: null,
    },
    exit_memo: {
      needed: false,
      reason: "none",
      flow_summary: null,
      original_opportunity_id: null,
      target_flow: null,
      target_context: {},
      handoff_hint_for_global_dispatcher: null,
      same_user_message_should_be_reprocessed: false,
    },
    evidence: args.evidence,
  };
}

export function reduceFlowOpportunityDispatcherOutput(args: {
  previous: FlowOpportunityLocalState | null;
  output: FlowOpportunityDispatcherOutput;
  userMessage: string;
}): FlowOpportunityReducerResult {
  const output = args.output;
  const targetFlow = output.opportunity.target_flow ||
    args.previous?.target_flow || "unknown";
  const opportunityId = output.opportunity.opportunity_id ||
    args.previous?.opportunity_id || "";
  const seedContext = {
    ...(args.previous?.target_context ?? {}),
    ...output.target_flow_input.seed_context,
    ...output.state_patch.target_context,
  };
  const blocked: Array<{ type: string; reason_code: string }> = [];

  if (!opportunityId || targetFlow === "unknown") {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "missing_opportunity_or_target_flow",
    });
  }
  if (output.risk_score >= 8 || output.local_action === "safety_preempt") {
    return {
      status: "blocked",
      reason_code: "flow_opportunity_safety_preempt",
      local_state: args.previous,
      visible_task: "safety",
      exit_to_global_dispatcher: false,
      launch_target_flow: false,
      get_info_product: false,
      get_info_db: false,
      target_flow: targetFlow,
      target_flow_input: output.target_flow_input,
      subskill_context: null,
      exit_memo: output.exit_memo,
      blocked_effects: [{
        type: "flow_opportunity_verification",
        reason_code: "risk_score_blocks_flow",
      }],
      evidence: output.evidence,
    };
  }
  if (
    output.local_action === "launch_target_flow" &&
    output.confidence === "low"
  ) {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "low_confidence_blocks_launch",
    });
  }
  if (
    output.local_action === "launch_target_flow" &&
    !LAUNCHABLE_TARGET_FLOWS.has(targetFlow)
  ) {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "unsupported_target_flow_blocks_launch",
    });
  }
  if (
    output.local_action === "get_info_product" &&
    (!output.subskill_call.needed ||
      output.subskill_call.skill_id !== "product_help")
  ) {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "product_help_subskill_required",
    });
  }
  if (
    output.local_action === "get_info_db" &&
    (!output.subskill_call.needed ||
      output.subskill_call.skill_id !== "status_recap")
  ) {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "status_recap_subskill_required",
    });
  }
  if (
    output.local_action === "exit_to_global_dispatcher" &&
    !output.exit_memo.needed
  ) {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "exit_memo_required",
    });
  }
  const anchor = args.previous?.confirmation_anchor ??
    (isRecord(output.state_patch.confirmation_anchor)
      ? output.state_patch.confirmation_anchor as any
      : createConfirmationAnchor({ targetFlow, targetContext: seedContext }));
  if (
    (output.local_action === "get_info_product" ||
      output.local_action === "return_from_get_info_product" ||
      output.local_action === "get_info_db") &&
    !isRecord(anchor)
  ) {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "confirmation_anchor_required",
    });
  }
  if (blocked.length > 0) {
    return {
      status: "blocked",
      reason_code: blocked[0].reason_code,
      local_state: args.previous,
      visible_task: output.visible_task.kind === "none"
        ? "unsupported_inside_flow"
        : output.visible_task.kind,
      exit_to_global_dispatcher: false,
      launch_target_flow: false,
      get_info_product: false,
      get_info_db: false,
      target_flow: targetFlow,
      target_flow_input: output.target_flow_input,
      subskill_context: null,
      exit_memo: output.exit_memo,
      blocked_effects: blocked,
      evidence: output.evidence,
    };
  }

  if (output.local_action === "exit_to_global_dispatcher") {
    return {
      status: "exit",
      reason_code: "flow_opportunity_verification_exit_to_global_dispatcher",
      local_state: null,
      visible_task: output.visible_task.kind,
      exit_to_global_dispatcher: true,
      launch_target_flow: false,
      get_info_product: false,
      get_info_db: false,
      target_flow: targetFlow,
      target_flow_input: output.target_flow_input,
      subskill_context: null,
      exit_memo: output.exit_memo,
      blocked_effects: [],
      evidence: output.evidence,
    };
  }

  if (
    output.local_action === "decline_opportunity" ||
    output.local_action === "cancel_flow" ||
    output.local_action === "stale_or_already_answered"
  ) {
    return {
      status: output.local_action === "decline_opportunity"
        ? "declined"
        : "cancelled",
      reason_code: `flow_opportunity_verification_${output.local_action}`,
      local_state: null,
      visible_task: output.visible_task.kind,
      exit_to_global_dispatcher: false,
      launch_target_flow: false,
      get_info_product: false,
      get_info_db: false,
      target_flow: targetFlow,
      target_flow_input: output.target_flow_input,
      subskill_context: null,
      exit_memo: output.exit_memo,
      blocked_effects: [],
      evidence: output.evidence,
    };
  }

  const localState = createFlowOpportunityState({
    previous: args.previous,
    opportunity: {
      opportunity_id: opportunityId,
      target_flow: targetFlow,
      target_action: output.opportunity.target_action,
      confidence: output.confidence,
      priority: 0,
      reason: output.opportunity.reason,
      evidence: output.target_flow_input.origin_evidence.length
        ? output.target_flow_input.origin_evidence
        : output.evidence,
      seed_context: seedContext,
    },
    userMessage: args.userMessage,
    status: output.local_action === "get_info_product" ||
        output.local_action === "get_info_db"
      ? "explaining"
      : output.local_action === "launch_target_flow"
      ? "accepted"
      : output.state_patch.status,
  });
  const anchoredState: FlowOpportunityLocalState = {
    ...localState,
    confirmation_anchor: args.previous?.confirmation_anchor ??
      createConfirmationAnchor({ targetFlow, targetContext: seedContext }),
  };
  if (anchoredState.turn_count > anchoredState.max_turns) {
    return {
      status: "exit",
      reason_code: "flow_opportunity_verification_max_turns_reached",
      local_state: null,
      visible_task: "stale_or_already_answered",
      exit_to_global_dispatcher: true,
      launch_target_flow: false,
      get_info_product: false,
      get_info_db: false,
      target_flow: targetFlow,
      target_flow_input: output.target_flow_input,
      subskill_context: null,
      exit_memo: {
        needed: true,
        reason: "stale",
        flow_summary: "flow opportunity verification expired after max turns",
        original_opportunity_id: opportunityId,
        target_flow: targetFlow,
        target_context: seedContext,
        handoff_hint_for_global_dispatcher: null,
        same_user_message_should_be_reprocessed: false,
      },
      blocked_effects: [],
      evidence: output.evidence,
    };
  }
  return {
    status: anchoredState.status,
    reason_code: `flow_opportunity_verification_${output.local_action}`,
    local_state: output.local_action === "launch_target_flow"
      ? null
      : anchoredState,
    visible_task: output.visible_task.kind,
    exit_to_global_dispatcher: false,
    launch_target_flow: output.local_action === "launch_target_flow",
    get_info_product: output.local_action === "get_info_product",
    get_info_db: output.local_action === "get_info_db",
    target_flow: targetFlow,
    target_flow_input: output.target_flow_input,
    subskill_context: output.local_action === "get_info_product" ||
        output.local_action === "get_info_db"
      ? output.subskill_call.context_for_subskill
      : null,
    exit_memo: output.exit_memo,
    blocked_effects: [],
    evidence: output.evidence,
  };
}
