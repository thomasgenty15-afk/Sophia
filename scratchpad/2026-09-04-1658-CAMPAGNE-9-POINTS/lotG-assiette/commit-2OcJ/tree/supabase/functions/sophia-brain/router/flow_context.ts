import {
  getActiveSafetySentryFlow,
} from "../supervisor.ts";

/**
 * W2.D-2 — this module used to do `import type { FlowContext } from "./dispatcher.ts"`, but
 * `dispatcher.ts` stopped exporting that type (commit 75570f7b, "clean v2 redesign
 * foundation"). The import is erased at runtime, so nothing broke — it only made
 * `deno check` fail on every graph that reaches this file, which is how it survived.
 *
 * The type is declared here instead, mirroring exactly what `buildFlowContext` returns below.
 * Note for a later wave: this module is ORPHANED — `flow_context_test.ts` is its only
 * importer. When it goes, this declaration goes with it.
 */
export type FlowContext = {
  isSafetyFlow?: boolean;
  safetyFlowType?: string;
  safetyPhase?: string;
  safetyTurnCount?: number;
  isBilan?: boolean;
  currentItemTitle?: string;
  missedStreak?: number;
  bilanStale?: boolean;
  bilanAgeHours?: number;
  bilanStaleAfterHours?: number;
};

function parseIsoMs(raw: unknown): number {
  if (typeof raw !== "string" || !raw.trim()) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Check if a machine type matches a signal type.
 * R2 simplified: only safety mappings remain.
 */
export function machineMatchesSignalType(
  machineType: string | null,
  signalType: string,
): boolean {
  if (!machineType || !signalType) return false;
  if (machineType !== "safety_sentry_flow") return false;
  return signalType === "safety" ||
    signalType === "sentry_resolution" ||
    signalType === "vital_danger_resolution";
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
      missedStreak,
      bilanStale: isStale,
      bilanAgeHours: ageHours,
      bilanStaleAfterHours: staleAfterHours,
    };
  }

  return undefined;
}
