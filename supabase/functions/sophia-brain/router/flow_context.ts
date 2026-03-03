import type { FlowContext } from "./dispatcher.ts";
import {
  getActiveSafetySentryFlow,
} from "../supervisor.ts";

function parseIsoMs(raw: unknown): number {
  if (typeof raw !== "string" || !raw.trim()) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Check if a machine type matches a signal type.
 * R2 simplified: only safety and track_progress mappings kept.
 */
export function machineMatchesSignalType(
  machineType: string | null,
  signalType: string,
): boolean {
  if (!machineType || !signalType) return false;
  const mappings: Record<string, string[]> = {
    "track_progress_flow": [
      "track_progress_action",
      "track_progress_vital_sign",
      "track_progress_north_star",
    ],
    "track_progress_consent": [
      "track_progress_action",
      "track_progress_vital_sign",
      "track_progress_north_star",
    ],
    "safety_sentry_flow": [
      "safety",
      "sentry_resolution",
      "vital_danger_resolution",
    ],
  };
  return mappings[machineType]?.includes(signalType) ?? false;
}

/**
 * Get the currently active machine type from temp_memory.
 * R2 simplified: only safety flows are detected.
 */
export function getActiveMachineType(tempMemory: any): string | null {
  // SAFETY FLOWS FIRST
  const sentryFlow = getActiveSafetySentryFlow(tempMemory);
  if (sentryFlow && sentryFlow.phase !== "resolved") {
    return "safety_sentry_flow";
  }

  // All other machine types (tool flows, topic sessions, deep reasons) removed in R2.
  return null;
}

/**
 * Build the flow context for the active machine.
 * R2 simplified: only safety and bilan are populated.
 */
export function buildFlowContext(
  tempMemory: any,
  state?: any,
): FlowContext | undefined {
  // SAFETY FLOWS
  const sentryFlow = getActiveSafetySentryFlow(tempMemory);
  if (sentryFlow && sentryFlow.phase !== "resolved") {
    return {
      isSafetyFlow: true,
      safetyFlowType: "sentry",
      safetyPhase: sentryFlow.phase,
      safetyTurnCount: sentryFlow.turn_count,
      safetyConfirmed: sentryFlow.safety_confirmed,
      externalHelpMentioned: sentryFlow.external_help_mentioned,
    };
  }

  // BILAN (investigation) active
  const invState = state?.investigation_state;
  if (invState && invState.status !== "post_checkup") {
    const currentIndex = invState.current_item_index ?? 0;
    const currentItem = invState.pending_items?.[currentIndex];
    const startedMs = parseIsoMs(invState?.started_at) ||
      parseIsoMs((invState?.temp_memory as any)?.started_at);
    const ageHours = startedMs > 0
      ? Math.max(0, Number(((Date.now() - startedMs) / 3600000).toFixed(2)))
      : 0;
    const staleAfterHours = 4;
    const isStale = ageHours >= staleAfterHours;

    const missedStreaksByAction = (invState.temp_memory as any)
      ?.missed_streaks_by_action as Record<string, number> | undefined;
    const currentId = currentItem?.id;
    const cachedStreak = currentId
      ? missedStreaksByAction?.[String(currentId)]
      : undefined;
    const missedStreak = cachedStreak ?? 0;

    return {
      isBilan: true,
      currentItemTitle: currentItem?.title,
      currentItemId: currentItem?.id,
      missedStreak,
      missedStreaksByAction:
        missedStreaksByAction && Object.keys(missedStreaksByAction).length > 0
          ? missedStreaksByAction
          : undefined,
      bilanStale: isStale,
      bilanAgeHours: ageHours,
      bilanStaleAfterHours: staleAfterHours,
    };
  }

  return undefined;
}
