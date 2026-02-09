import type { BrainTracePhase } from "../../_shared/brain-trace.ts";
import type { DispatcherSignals } from "./dispatcher.ts";
import {
  deferSignal,
  isToolMachine,
  pruneExpiredDeferredTopics,
} from "./deferred_topics_v2.ts";
import {
  generateAcknowledgmentPrefix,
  generateSubtleUpdateAck,
} from "./deferred_messages.ts";
import { buildDeferredSignalAddon } from "./deferred_signal_addons.ts";
import { isToolMotherSignal } from "./dual_tool_handling.ts";
import {
  getActiveToolFlowActionTarget,
  getAnyActiveMachine,
  getAnyActiveToolFlow,
} from "../supervisor.ts";
import {
  detectMachineTypeFromSignals,
  generateDeferredSignalSummary,
  shouldInterruptForSafety,
} from "./dispatcher.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLE MOTHER SIGNAL FILTER
// Ensures only ONE mother signal is processed per message (except safety)
// ═══════════════════════════════════════════════════════════════════════════════

export type MotherSignalType =
  | "create_action"
  | "update_action"
  | "breakdown_action"
  | "topic_exploration"
  | "deep_reasons"
  | "checkup"
  | "activate_action"
  | "delete_action"
  | "deactivate_action"
  | "track_progress";

/**
 * Priority order for mother signals when multiple are detected.
 * Higher priority = lower index.
 *
 * Rationale:
 * 1. topic_exploration - Direct emotional/conversational need
 * 2. deep_reasons - Important motivational blocker
 * 3. breakdown_action - User struggling with existing action
 * 4. create_action - New action intent
 * 5. update_action - Modification intent
 * 6. activate_action - Activation of dormant action
 * 7. track_progress - Progress logging
 * 8. checkup - Bilan request (can wait)
 */
const MOTHER_SIGNAL_PRIORITY: MotherSignalType[] = [
  "topic_exploration",
  "deep_reasons",
  "breakdown_action",
  "create_action",
  "update_action",
  "delete_action",
  "deactivate_action",
  "activate_action",
  "track_progress",
  "checkup",
];

/**
 * Filter dispatcher signals to keep only ONE mother signal (highest priority).
 * Safety signals (firefighter/sentry) are NEVER filtered - they always pass through.
 *
 * DUAL-TOOL EXCEPTION: If at least 2 tool signals are detected (both from the tool set:
 * create_action, update_action, delete_action, deactivate_action, activate_action, breakdown_action),
 * the highest-priority secondary tool is returned in `secondaryToolSignal` instead of being discarded.
 *
 * @returns primarySignal - The single mother signal to process (or null if none)
 * @returns secondaryToolSignal - Second tool signal if dual-tool case (or null)
 * @returns filtered - Array of signals that were filtered out (for logging)
 */
export function filterToSingleMotherSignal(
  signals: DispatcherSignals,
): {
  primarySignal: MotherSignalType | null;
  secondaryToolSignal: MotherSignalType | null;
  filtered: MotherSignalType[];
} {
  const detected: MotherSignalType[] = [];

  // Collect all detected mother signals (excluding safety)
  if (
    signals.create_action?.intent_strength !== "none" &&
    signals.create_action?.intent_strength !== undefined
  ) {
    detected.push("create_action");
  }
  if (signals.update_action?.detected) {
    detected.push("update_action");
  }
  if (signals.breakdown_action?.detected) {
    detected.push("breakdown_action");
  }
  if (
    signals.topic_depth?.value !== "NONE" &&
    signals.topic_depth?.value !== undefined
  ) {
    detected.push("topic_exploration");
  }
  if (signals.deep_reasons?.opportunity) {
    detected.push("deep_reasons");
  }
  if (signals.track_progress?.detected) {
    detected.push("track_progress");
  }
  if (signals.activate_action?.detected) {
    detected.push("activate_action");
  }
  if (signals.delete_action?.detected) {
    detected.push("delete_action");
  }
  if (signals.deactivate_action?.detected) {
    detected.push("deactivate_action");
  }
  // Note: checkup_intent is in machine_signals, handled separately

  // If 0 or 1 signal, no filtering needed
  if (detected.length <= 1) {
    return {
      primarySignal: detected[0] ?? null,
      secondaryToolSignal: null,
      filtered: [],
    };
  }

  // Sort by priority (lower index = higher priority)
  const sorted = [...detected].sort((a, b) => {
    const aIndex = MOTHER_SIGNAL_PRIORITY.indexOf(a);
    const bIndex = MOTHER_SIGNAL_PRIORITY.indexOf(b);
    // If not in priority list, put at end
    const aFinal = aIndex === -1 ? 999 : aIndex;
    const bFinal = bIndex === -1 ? 999 : bIndex;
    return aFinal - bFinal;
  });

  const primary = sorted[0] ?? null;
  const rest = sorted.slice(1);

  // DUAL-TOOL DETECTION: if primary is a tool signal and at least one additional
  // tool signal exists, keep the highest-priority one as secondaryToolSignal.
  let secondaryToolSignal: MotherSignalType | null = null;
  if (primary && isToolMotherSignal(primary)) {
    const toolsInRest = rest.filter((s) => isToolMotherSignal(s));
    if (toolsInRest.length >= 1) {
      // Take the highest-priority tool from rest
      secondaryToolSignal = toolsInRest[0]!;
    }
  }

  // filtered = everything except primary AND secondaryToolSignal
  const filtered = secondaryToolSignal
    ? rest.filter((s) => s !== secondaryToolSignal)
    : rest;

  return {
    primarySignal: primary,
    secondaryToolSignal,
    filtered,
  };
}

/**
 * Check if multiple mother signals were detected (for logging/tracing).
 */
export function hasMultipleMotherSignals(signals: DispatcherSignals): boolean {
  const { primarySignal, filtered } = filterToSingleMotherSignal(signals);
  return primarySignal !== null && filtered.length > 0;
}

export async function handleSignalDeferral(opts: {
  tempMemory: any;
  dispatcherSignals: DispatcherSignals;
  userMessage: string;
  profileConfirmDeferredKey: string;
  trace: (
    event: string,
    phase: BrainTracePhase,
    payload?: Record<string, unknown>,
    level?: "debug" | "info" | "warn" | "error",
  ) => Promise<void>;
}): Promise<
  { tempMemory: any; deferredAckPrefix: string; deferredSignalAddon: string }
> {
  let { tempMemory } = opts;
  let deferredAckPrefix = "";
  let deferredSignalAddon = "";
  const traceDeferralDecision = async (
    payload: Record<string, unknown>,
    level: "debug" | "info" | "warn" | "error" = "debug",
  ) => {
    await opts.trace("deferral_decision", "routing", payload, level);
  };

  // Prune expired deferred topics first
  {
    const pruneResult = pruneExpiredDeferredTopics({ tempMemory });
    if (pruneResult.pruned.length > 0) {
      tempMemory = pruneResult.tempMemory;
      for (const expired of pruneResult.pruned) {
        await opts.trace("brain:deferred_expired", "routing", {
          topic_id: expired.id,
          machine_type: expired.machine_type,
          action_target: expired.action_target,
          age_hours: Math.round(
            (Date.now() - new Date(expired.created_at).getTime()) /
              (60 * 60 * 1000),
          ),
        });
      }
      if (
        pruneResult.pruned.some((t) =>
          t.machine_type === "user_profile_confirmation"
        )
      ) {
        const next = { ...(tempMemory ?? {}) };
        delete next[opts.profileConfirmDeferredKey];
        tempMemory = next;
      }
    }
  }

  // Check if any state machine is currently active
  const anyActiveMachine = getAnyActiveMachine(tempMemory);
  const anyActiveToolFlow = getAnyActiveToolFlow(tempMemory);
  const activeToolFlowTarget = anyActiveToolFlow
    ? getActiveToolFlowActionTarget(tempMemory)
    : null;

  // Detect if dispatcher signals would trigger a NEW machine
  const newMachineSignal = detectMachineTypeFromSignals(opts.dispatcherSignals);

  // SIGNAL DEFERRAL LOGIC
  if (anyActiveMachine && newMachineSignal) {
    // Check if it's the SAME machine type and SAME action (not a deferral case)
    const isSameMachineType = (() => {
      const activeType = anyActiveMachine.type;
      // Map session types to deferred machine types for comparison
      const activeAsMachineType = activeType === "create_action_flow"
        ? "create_action"
        : activeType === "update_action_flow"
        ? "update_action"
        : activeType === "breakdown_action_flow"
        ? "breakdown_action"
        : activeType === "activate_action_flow"
        ? "activate_action"
        : activeType === "delete_action_flow"
        ? "delete_action"
        : activeType === "deactivate_action_flow"
        ? "deactivate_action"
        : activeType === "deep_reasons_exploration"
        ? "deep_reasons"
        : activeType;
      return activeAsMachineType === newMachineSignal.machine_type;
    })();

    const isSameAction = (() => {
      if (!isSameMachineType) return false;
      // For non-tool machines (topics, deep_reasons), same machine type is enough
      if (!isToolMachine(newMachineSignal.machine_type)) return true;
      // For tool machines, if dispatcher has no specific target hint, treat as
      // continuation of current flow rather than creating a deferred duplicate.
      if (!newMachineSignal.action_target) return true;
      // For tool machines, require matching action targets
      return Boolean(
        activeToolFlowTarget &&
          newMachineSignal.action_target &&
          activeToolFlowTarget.toLowerCase().includes(
            newMachineSignal.action_target.toLowerCase(),
          ),
      );
    })();

    // If it's NOT sentry/firefighter AND (different machine OR different action), DEFER
    const interruptedForSafety = shouldInterruptForSafety(
      opts.dispatcherSignals,
    );
    if (!interruptedForSafety && (!isSameMachineType || !isSameAction)) {
      // Generate summary for the deferred signal
      const summary = generateDeferredSignalSummary({
        signals: opts.dispatcherSignals,
        userMessage: opts.userMessage,
        machine_type: newMachineSignal.machine_type,
        action_target: newMachineSignal.action_target,
      });

      // Check if matching deferred exists (for UPDATE logic)
      // Defer the signal
      const deferResult = deferSignal({
        tempMemory,
        machine_type: newMachineSignal.machine_type,
        action_target: newMachineSignal.action_target,
        summary,
      });
      tempMemory = deferResult.tempMemory;

      // Generate acknowledgment prefix (legacy - kept for fallback)
      if (deferResult.action === "created") {
        deferredAckPrefix = generateAcknowledgmentPrefix({
          machine_type: newMachineSignal.machine_type,
          action_target: newMachineSignal.action_target,
          isUpdate: false,
        });
      } else {
        // UPDATE case - subtle or silent acknowledgment
        const subtleAck = generateSubtleUpdateAck({
          machine_type: newMachineSignal.machine_type,
          action_target: newMachineSignal.action_target,
          triggerCount: deferResult.topic.trigger_count,
        });
        deferredAckPrefix = subtleAck;
      }

      // Generate intelligent add-on for the conversational agent
      deferredSignalAddon = buildDeferredSignalAddon({
        machine_type: newMachineSignal.machine_type,
        action_target: newMachineSignal.action_target,
        userMessage: opts.userMessage,
        currentMachineType: anyActiveMachine.type,
        currentMachineTarget: activeToolFlowTarget ?? undefined,
        isUpdate: deferResult.action === "updated",
        triggerCount: deferResult.topic.trigger_count,
      });

      // Log the deferral with specific event type
      if (deferResult.action === "created") {
        await opts.trace("brain:deferred_created", "routing", {
          topic_id: deferResult.topic.id,
          machine_type: newMachineSignal.machine_type,
          action_target: newMachineSignal.action_target,
          summary,
          active_machine: anyActiveMachine.type,
          active_machine_target: activeToolFlowTarget,
        });
      } else {
        await opts.trace("brain:deferred_updated", "routing", {
          topic_id: deferResult.topic.id,
          machine_type: newMachineSignal.machine_type,
          action_target: newMachineSignal.action_target,
          trigger_count: deferResult.topic.trigger_count,
          new_summary: summary,
        });
      }

      // Also log the generic signal_deferred event
      await opts.trace("brain:signal_deferred", "routing", {
        machine_type: newMachineSignal.machine_type,
        action_target: newMachineSignal.action_target,
        deferred_action: deferResult.action,
        summary,
        active_machine: anyActiveMachine.type,
        active_machine_target: activeToolFlowTarget,
      });

      // Log if cancelled an old topic due to limit
      if (deferResult.cancelled) {
        await opts.trace("brain:deferred_cancelled_limit", "routing", {
          cancelled_id: deferResult.cancelled.id,
          cancelled_type: deferResult.cancelled.machine_type,
          cancelled_target: deferResult.cancelled.action_target,
        });
      }

      // Clear any signals that would have triggered the new machine
      // (so the current machine continues uninterrupted)
      if (newMachineSignal.machine_type === "breakdown_action") {
        delete (tempMemory as any).__breakdown_action_signal;
      } else if (newMachineSignal.machine_type === "create_action") {
        delete (tempMemory as any).__create_action_signal;
      } else if (newMachineSignal.machine_type === "update_action") {
        delete (tempMemory as any).__update_action_signal;
      } else if (newMachineSignal.machine_type === "activate_action") {
        delete (tempMemory as any).__activate_action_signal;
      } else if (newMachineSignal.machine_type === "delete_action") {
        delete (tempMemory as any).__delete_action_signal;
      } else if (newMachineSignal.machine_type === "deactivate_action") {
        delete (tempMemory as any).__deactivate_action_signal;
      } else if (newMachineSignal.machine_type === "deep_reasons") {
        delete (tempMemory as any).__deep_reasons_opportunity;
      }
      await traceDeferralDecision(
        {
          deferred: true,
          reason_code: "deferred_different_machine_or_action",
          machine_type: newMachineSignal.machine_type,
          action_target: newMachineSignal.action_target ?? null,
          active_machine: anyActiveMachine.type,
          active_machine_target: activeToolFlowTarget ?? null,
          is_same_machine_type: isSameMachineType,
          is_same_action: isSameAction,
          interrupted_for_safety: false,
        },
        "info",
      );
    } else {
      await traceDeferralDecision({
        deferred: false,
        reason_code: interruptedForSafety
          ? "safety_interrupt"
          : "same_machine_same_action",
        machine_type: newMachineSignal.machine_type,
        action_target: newMachineSignal.action_target ?? null,
        active_machine: anyActiveMachine.type,
        active_machine_target: activeToolFlowTarget ?? null,
        is_same_machine_type: isSameMachineType,
        is_same_action: isSameAction,
        interrupted_for_safety: interruptedForSafety,
      });
    }
  } else {
    await traceDeferralDecision({
      deferred: false,
      reason_code: anyActiveMachine
        ? "no_new_machine_signal"
        : "no_active_machine",
      machine_type: newMachineSignal?.machine_type ?? null,
      action_target: newMachineSignal?.action_target ?? null,
      active_machine: anyActiveMachine?.type ?? null,
      active_machine_target: activeToolFlowTarget ?? null,
      interrupted_for_safety: shouldInterruptForSafety(opts.dispatcherSignals),
    });
  }

  return { tempMemory, deferredAckPrefix, deferredSignalAddon };
}
