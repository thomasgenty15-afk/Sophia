import type {
  OneShotReminderBlockedEffect,
  OneShotReminderEffect,
  OneShotReminderEffectPlan,
  OneShotReminderState,
} from "./contract.ts";
import type { OneShotReminderStructuredIntake } from "./intake.ts";
import { isDegenerateReminderInstruction } from "./instruction_parser.ts";

function blockAll(
  effects: OneShotReminderEffect[],
  reason_code: string,
): OneShotReminderBlockedEffect[] {
  return effects.map((effect) => ({ type: effect.type, reason_code }));
}

function requestedForIntent(
  intake: OneShotReminderStructuredIntake,
): OneShotReminderEffect[] {
  if (intake.intent === "create") {
    return [{
      type: "create_one_shot_reminder",
      reason_code: intake.reason_code,
      scheduled_for: intake.scheduled_for ?? undefined,
      local_label: intake.local_label ?? undefined,
      reminder_instruction: intake.instruction ?? undefined,
    }];
  }
  if (intake.intent === "cancel") {
    return [{
      type: "cancel_one_shot_reminder",
      reason_code: intake.reason_code,
      target_reminder_ids: intake.target_reminder_ids,
      target_local_labels: intake.target_local_labels,
    }];
  }
  if (intake.intent === "replace") {
    return [
      {
        type: "cancel_one_shot_reminder",
        reason_code: intake.reason_code,
        target_reminder_ids: intake.target_reminder_ids,
        target_local_labels: intake.target_local_labels,
      },
      {
        type: "create_one_shot_reminder",
        reason_code: intake.reason_code,
        scheduled_for: intake.scheduled_for ?? undefined,
        local_label: intake.local_label ?? undefined,
        reminder_instruction: intake.instruction ?? undefined,
      },
    ];
  }
  return [];
}

export function reduceOneShotReminderIntake(args: {
  intake: OneShotReminderStructuredIntake;
  noMutationRequested?: boolean;
  safetyBlocks?: boolean;
  globalBlockedReason?: string | null;
}): OneShotReminderState {
  const requested_effects = requestedForIntent(args.intake);
  let allowed_effects: OneShotReminderEffect[] = [];
  let blocked_effects: OneShotReminderBlockedEffect[] = [];
  const missing_slots: OneShotReminderState["missing_slots"] = [];
  let status: OneShotReminderState["status"] = args.intake.detected
    ? "collecting"
    : "blocked";
  let reason_code = args.intake.reason_code;
  const constraints = args.intake.constraints
    .map((constraint) =>
      typeof constraint === "string" ? constraint : constraint.kind
    )
    .filter((
      constraint,
    ): constraint is OneShotReminderState["constraints"][number] =>
      [
        "requires_explicit_time",
        "requires_instruction",
        "do_not_mutate",
        "no_tool",
        "status_only",
        "product_help",
        "safety_blocks",
        "no_done_language_without_commit",
      ].includes(constraint)
    );

  if (!args.intake.detected || args.intake.intent === "off_topic") {
    status = "blocked";
  } else if (
    args.intake.intent === "status" ||
    args.intake.intent === "status_question" ||
    args.intake.intent === "answer_product_question" ||
    args.intake.intent === "product_help" ||
    args.intake.intent === "ignore"
  ) {
    status = "blocked";
    reason_code = args.intake.intent === "status" ||
        args.intake.intent === "status_question"
      ? "status_only"
      : args.intake.intent === "ignore"
      ? args.intake.reason_code
      : "product_help";
    if (!constraints.includes("do_not_mutate")) {
      constraints.push("do_not_mutate");
    }
    blocked_effects = blockAll(requested_effects, reason_code);
  } else if (args.noMutationRequested) {
    status = "blocked";
    reason_code = "no_tool";
    constraints.push("no_tool", "do_not_mutate");
    blocked_effects = blockAll(requested_effects, "no_tool");
  } else if (args.safetyBlocks) {
    status = "blocked";
    reason_code = "safety_blocks";
    constraints.push("safety_blocks", "do_not_mutate");
    blocked_effects = blockAll(requested_effects, "safety_blocks");
  } else if (args.globalBlockedReason) {
    status = "blocked";
    reason_code = args.globalBlockedReason;
    constraints.push("do_not_mutate");
    blocked_effects = blockAll(requested_effects, args.globalBlockedReason);
  } else if (
    args.intake.intent === "cancel" || args.intake.intent === "replace"
  ) {
    status = "blocked";
    reason_code = "one_shot_reminder_cancel_unsupported";
    constraints.push("do_not_mutate");
    blocked_effects = blockAll(requested_effects, reason_code);
  } else if (args.intake.intent === "modify_request") {
    status = "blocked";
    reason_code = "modify_requires_replace";
    blocked_effects = blockAll(requested_effects, reason_code);
  } else {
    if (args.intake.intent === "create" && !args.intake.scheduled_for) {
      missing_slots.push("scheduled_for");
      constraints.push("requires_explicit_time");
    }
    if (
      args.intake.intent === "create" &&
      (!args.intake.instruction ||
        isDegenerateReminderInstruction(args.intake.instruction))
    ) {
      missing_slots.push("reminder_instruction");
      constraints.push("requires_instruction");
    }

    if (missing_slots.length > 0) {
      status = "collecting";
      reason_code = missing_slots[0] === "scheduled_for"
        ? "missing_time"
        : "missing_instruction";
      blocked_effects = blockAll(requested_effects, reason_code);
    } else {
      status = "ready_to_execute";
      allowed_effects = requested_effects;
      reason_code = "ready_to_execute";
    }
  }

  const effect_plan: OneShotReminderEffectPlan = {
    requested_effects,
    allowed_effects,
    blocked_effects,
    reason_code,
  };

  return {
    intent: args.intake.intent,
    status,
    scheduled_for: args.intake.scheduled_for,
    local_label: args.intake.local_label,
    reminder_instruction: args.intake.instruction,
    target_reminder_ids: args.intake.target_reminder_ids,
    target_local_labels: args.intake.target_local_labels,
    missing_slots,
    constraints: [...new Set(constraints)],
    effect_plan,
    committed_effects: [],
    blocked_effects,
    reply: null,
  };
}
