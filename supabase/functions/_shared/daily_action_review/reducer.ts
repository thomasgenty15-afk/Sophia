import type {
  DailyReviewBlockedEffect,
  DailyReviewDecision,
  DailyReviewEffectPlan,
  DailyReviewReducerReasonCode,
  DailyReviewStateMutationAudit,
} from "./contract.ts";
import { buildDailyReviewEffectPlan } from "./effects.ts";

type ReducerTarget = {
  occurrence_id: string;
  plan_item_id: string;
};

type ReducerState = {
  status: "collecting" | "needs_clarification" | "complete" | "stopped";
  stop_reason:
    | "all_required_slots_filled"
    | "user_stopped"
    | "safety"
    | "unclear_after_retries"
    | null;
  items: Record<string, any>;
  should_apply_effects: boolean;
  effect_plan?: DailyReviewEffectPlan;
  current_focus_occurrence_ids?: string[];
  remaining_occurrence_ids?: string[];
  asked_occurrence_ids_history?: string[][];
  next_question?: string | null;
  next_question_targets?: string[];
  generated_user_message?: string | null;
  constraints?: unknown[];
  state_mutation_audit?: DailyReviewStateMutationAudit;
  blocked_effects?: DailyReviewBlockedEffect[];
};

const DAILY_SERVER_OWNED_FIELDS = [
  "status",
  "stop_reason",
  "current_focus_occurrence_ids",
  "remaining_occurrence_ids",
  "asked_occurrence_ids_history",
  "next_question",
  "next_question_targets",
  "generated_user_message",
  "should_apply_effects",
  "effect_plan",
  "constraints",
  "action_intelligence_by_occurrence_id",
  "last_user_text",
  "last_note_information",
  "last_local_exit_memo",
] as const;

function uniqueStrings(values: unknown[]): string[] {
  return [
    ...new Set(
      values.map((value) => String(value ?? "").trim()).filter(
        Boolean,
      ),
    ),
  ];
}

function pushUnique(target: string[], field: string) {
  if (!target.includes(field)) target.push(field);
}

function createStateMutationAudit(
  decision: DailyReviewDecision,
): DailyReviewStateMutationAudit {
  return {
    server_owned_fields: [...DAILY_SERVER_OWNED_FIELDS],
    modified_fields_declared: uniqueStrings(
      decision.state_change_intent?.modified_fields ?? [],
    ),
    clear_fields_declared: uniqueStrings(
      decision.state_change_intent?.clear_fields ?? [],
    ),
    applied_fields: [],
    preserved_fields: [],
    restored_fields: [],
    cleared_fields: [],
    rejected_changes: [],
  };
}

function rejectChange(
  audit: DailyReviewStateMutationAudit,
  blocked: DailyReviewBlockedEffect[],
  field: string,
  reason_code: DailyReviewReducerReasonCode,
) {
  pushUnique(audit.restored_fields, field);
  audit.rejected_changes.push({ field, reason_code });
  blocked.push({
    type: "daily_action_review_state_mutation",
    field,
    reason_code,
  });
}

function fieldIsServerOwned(field: string): boolean {
  return (DAILY_SERVER_OWNED_FIELDS as readonly string[]).includes(field);
}

function arraysEqual(a: unknown[] | undefined, b: unknown[] | undefined) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function validStatusFromDecision<TState extends ReducerState>(
  previous: TState,
  decision: DailyReviewDecision,
  audit: DailyReviewStateMutationAudit,
  blocked: DailyReviewBlockedEffect[],
): TState["status"] {
  if (previous.status === "complete" || previous.status === "stopped") {
    if (decision.status !== previous.status) {
      rejectChange(audit, blocked, "status", "invalid_status_transition");
    } else {
      pushUnique(audit.preserved_fields, "status");
    }
    return previous.status;
  }
  if (decision.status === "opening" || decision.status === "blocked") {
    rejectChange(audit, blocked, "status", "invalid_status_transition");
    return previous.status;
  }
  if (decision.status === "complete") {
    return previous.status;
  }
  if (decision.status === "stopped") return "stopped";
  return decision.status;
}

function stopReasonFromDecision<TState extends ReducerState>(
  previous: TState,
  decision: DailyReviewDecision,
  status: TState["status"],
  audit: DailyReviewStateMutationAudit,
  blocked: DailyReviewBlockedEffect[],
): TState["stop_reason"] {
  if (previous.status === "complete" || previous.status === "stopped") {
    if (decision.stop_reason !== previous.stop_reason) {
      rejectChange(audit, blocked, "stop_reason", "invalid_status_transition");
    } else {
      pushUnique(audit.preserved_fields, "stop_reason");
    }
    return previous.stop_reason;
  }
  if (status === "stopped") return decision.stop_reason ?? "user_stopped";
  return null;
}

export function mergeDailyActionReviewLocalState<
  TState extends ReducerState,
  TTarget extends ReducerTarget,
>(args: {
  previous: TState;
  decision: DailyReviewDecision;
  targets: TTarget[];
  now?: string;
  constraints?: string[];
}): {
  state: TState;
  state_mutation_audit: DailyReviewStateMutationAudit;
  blocked_effects: DailyReviewBlockedEffect[];
} {
  const { previous, decision, targets } = args;
  const targetIds = new Set(targets.map((target) => target.occurrence_id));
  const audit = createStateMutationAudit(decision);
  const blocked: DailyReviewBlockedEffect[] = [];
  const status = validStatusFromDecision(previous, decision, audit, blocked);
  const next: TState = {
    ...previous,
    status,
    stop_reason: stopReasonFromDecision(
      previous,
      decision,
      status,
      audit,
      blocked,
    ),
    items: { ...previous.items },
    should_apply_effects: false,
    effect_plan: { allowed: false, effects: [] },
    blocked_effects: [],
  };

  for (const field of audit.modified_fields_declared) {
    if (fieldIsServerOwned(field)) {
      rejectChange(audit, blocked, field, "blocked_by_constraint");
    }
  }
  for (const field of audit.clear_fields_declared) {
    if (fieldIsServerOwned(field)) {
      rejectChange(audit, blocked, field, "blocked_by_constraint");
    }
  }

  const selectedTargetIds = uniqueStrings(decision.target_occurrence_ids)
    .filter((id) => targetIds.has(id));
  if (selectedTargetIds.length > 0) {
    if (!arraysEqual(next.current_focus_occurrence_ids, selectedTargetIds)) {
      next.current_focus_occurrence_ids = selectedTargetIds;
      pushUnique(audit.applied_fields, "current_focus_occurrence_ids");
    } else {
      pushUnique(audit.preserved_fields, "current_focus_occurrence_ids");
    }
    const history = Array.isArray(next.asked_occurrence_ids_history)
      ? [...next.asked_occurrence_ids_history]
      : [];
    const alreadyAsked = history.some((group) =>
      Array.isArray(group) && arraysEqual(group, selectedTargetIds)
    );
    if (!alreadyAsked) {
      next.asked_occurrence_ids_history = [...history, selectedTargetIds];
      pushUnique(audit.applied_fields, "asked_occurrence_ids_history");
    } else {
      pushUnique(audit.preserved_fields, "asked_occurrence_ids_history");
    }
  } else {
    rejectChange(
      audit,
      blocked,
      "current_focus_occurrence_ids",
      "selected_option_missing",
    );
  }

  for (const [occurrenceId, update] of Object.entries(decision.item_updates)) {
    if (!targetIds.has(occurrenceId)) {
      rejectChange(
        audit,
        blocked,
        `items.${occurrenceId}`,
        "candidate_missing",
      );
      continue;
    }
    const mode = decision.item_update_modes?.[occurrenceId] ?? "set";
    if (mode === "none") {
      pushUnique(audit.preserved_fields, `items.${occurrenceId}`);
      continue;
    }
    if (mode === "clear" && decision.intent !== "correction") {
      rejectChange(
        audit,
        blocked,
        `items.${occurrenceId}`,
        "blocked_by_constraint",
      );
      continue;
    }
    next.items[occurrenceId] = {
      ...(next.items[occurrenceId] ?? {}),
      ...update,
    };
    pushUnique(audit.applied_fields, `items.${occurrenceId}`);
    if (mode === "clear") {
      pushUnique(audit.cleared_fields, `items.${occurrenceId}`);
    }
  }

  const effectPlan = buildDailyReviewEffectPlan(next, targets);
  next.effect_plan = effectPlan;
  pushUnique(audit.applied_fields, "effect_plan");
  next.should_apply_effects = effectPlan.allowed;
  pushUnique(audit.applied_fields, "should_apply_effects");
  if (effectPlan.allowed) {
    next.status = "complete";
    next.stop_reason = "all_required_slots_filled";
    pushUnique(audit.applied_fields, "status");
    pushUnique(audit.applied_fields, "stop_reason");
  } else if (decision.status === "complete" || decision.should_apply_effects) {
    blocked.push({
      type: "daily_action_review_commit",
      reason_code: "not_stabilized_enough",
    });
    audit.rejected_changes.push({
      field: "effect_plan",
      reason_code: "not_stabilized_enough",
    });
    pushUnique(audit.restored_fields, "effect_plan");
  }

  if (blocked.length === 0) {
    pushUnique(audit.preserved_fields, "remaining_occurrence_ids");
    pushUnique(audit.preserved_fields, "constraints");
  }
  next.blocked_effects = blocked;
  next.state_mutation_audit = audit;
  return {
    state: next,
    state_mutation_audit: audit,
    blocked_effects: blocked,
  };
}

export function reduceDailyReviewState<
  TState extends ReducerState,
  TTarget extends ReducerTarget,
>(
  previousState: TState,
  decision: DailyReviewDecision,
  targets: TTarget[],
): TState {
  return mergeDailyActionReviewLocalState({
    previous: previousState,
    decision,
    targets,
  }).state;
}
