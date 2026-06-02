import type { UserTurnSnapshot } from "./user_turn_snapshot.ts";
import type { AgendaTask, TurnAgenda } from "./turn_agenda.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function operationType(value: unknown): string | null {
  const record = asRecord(value);
  const operation = String(
    record.operation_type ?? record.type ??
      (record.mode === "platform_handoff" ? record.skill_id : "") ?? "",
  ).trim();
  return operation || null;
}

function isExplicitNewRuntimeTask(task: AgendaTask): boolean {
  return (task.kind === "effect" || task.kind === "platform_handoff") &&
    task.source === "dispatcher" &&
    task.status !== "blocked" &&
    (task.intent === "create" || task.intent === "update" ||
      task.intent === "cancel");
}

function blockTask(task: AgendaTask, reasonCode: string): AgendaTask {
  return {
    ...task,
    status: "blocked",
    requires_confirmation: false,
    reason_code: task.reason_code ?? reasonCode,
  };
}

function confirmationCompatible(args: {
  snapshot: UserTurnSnapshot;
  agenda: TurnAgenda;
}): boolean {
  const confirmationKind = args.snapshot.turn_frame?.confirmation_response
    ?.kind;
  if (
    confirmationKind !== "yes" && confirmationKind !== "no" &&
    confirmationKind !== "correction_to_pending"
  ) {
    return true;
  }
  const pendingOperation = operationType(
    args.snapshot.active_flows.pending_tool_confirmation,
  );
  if (!pendingOperation) return false;
  const explicitEffectTasks = args.agenda.tasks.filter(
    isExplicitNewRuntimeTask,
  );
  if (explicitEffectTasks.length === 0) return true;
  return explicitEffectTasks.some((task) =>
    task.operation_type === pendingOperation
  );
}

export function resolveFlowInterruptions(args: {
  snapshot: UserTurnSnapshot;
  agenda: TurnAgenda;
}): {
  agenda: TurnAgenda;
  clear_active_tool_flow?: boolean;
  clear_pending_confirmation?: boolean;
  reason_codes: string[];
} {
  const reasonCodes: string[] = [];
  const activeOperation = operationType(
    args.snapshot.active_flows.active_operation_intake,
  );
  const pendingOperation = operationType(
    args.snapshot.active_flows.pending_tool_confirmation,
  );
  let clearActiveToolFlow = false;
  let clearPendingConfirmation = false;

  const explicitEffectTasks = args.agenda.tasks.filter(
    isExplicitNewRuntimeTask,
  );
  if (
    activeOperation &&
    explicitEffectTasks.some((task) => task.operation_type !== activeOperation)
  ) {
    clearActiveToolFlow = true;
    reasonCodes.push("explicit_tool_intent_interrupts_active_flow");
  }

  if (pendingOperation && !confirmationCompatible(args)) {
    clearPendingConfirmation = true;
    reasonCodes.push("confirmation_incompatible_with_pending");
  }

  const constraints = args.snapshot.explicit_constraints;
  const nextTasks = args.agenda.tasks.map((task) => {
    if (task.kind !== "effect" && task.kind !== "platform_handoff") {
      return task;
    }
    const taskLabel = task.kind === "platform_handoff"
      ? "platform_handoff"
      : "effect";
    if (constraints.status_only || constraints.no_mutation) {
      reasonCodes.push(
        constraints.status_only
          ? `status_only_blocks_${taskLabel}s`
          : `no_mutation_blocks_${taskLabel}s`,
      );
      return blockTask(
        task,
        constraints.status_only
          ? task.kind === "platform_handoff"
            ? "status_only_blocks_platform_handoff"
            : "status_only_blocks_effect"
          : task.kind === "platform_handoff"
          ? "no_mutation_blocks_platform_handoff"
          : "no_mutation_blocks_effect",
      );
    }
    if (constraints.preview_only || constraints.draft_only) {
      if (task.kind === "platform_handoff") return task;
      reasonCodes.push(
        constraints.preview_only
          ? "preview_only_blocks_pending_write"
          : "draft_only_blocks_pending_write",
      );
      return blockTask(
        task,
        constraints.preview_only
          ? "preview_only_blocks_commit"
          : "draft_only_blocks_commit",
      );
    }
    if (
      constraints.no_potion && task.operation_type === "select_state_potion"
    ) {
      reasonCodes.push("no_potion_blocks_select_state_potion");
      return blockTask(task, "no_potion_blocks_select_state_potion");
    }
    if (
      constraints.no_tool &&
      task.source !== "pending_confirmation" &&
      task.operation_type !== pendingOperation
    ) {
      reasonCodes.push(
        task.kind === "platform_handoff"
          ? "no_tool_blocks_new_platform_handoff"
          : "no_tool_blocks_new_effect",
      );
      return blockTask(
        task,
        task.kind === "platform_handoff"
          ? "no_tool_blocks_platform_handoff"
          : "no_tool_blocks_new_effect",
      );
    }
    return task;
  });

  if (
    constraints.no_potion &&
    nextTasks.some((task) =>
      task.operation_type === "select_state_potion" &&
      task.status === "blocked"
    ) &&
    !nextTasks.some((task) => task.kind === "reply")
  ) {
    nextTasks.push({
      task_id: "reply:no_potion",
      kind: "reply",
      owner: "normal_reply",
      operation_type: null,
      intent: "reply",
      priority: 20,
      requires_confirmation: false,
      source: "guard",
      status: "pending",
      reason_code: "no_potion_reply_required",
      evidence: [],
    });
  }

  return {
    agenda: {
      ...args.agenda,
      tasks: nextTasks,
    },
    clear_active_tool_flow: clearActiveToolFlow || undefined,
    clear_pending_confirmation: clearPendingConfirmation || undefined,
    reason_codes: [...new Set(reasonCodes)],
  };
}
