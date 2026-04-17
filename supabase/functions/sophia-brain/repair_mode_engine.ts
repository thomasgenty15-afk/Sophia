/**
 * Repair Mode Engine V2.1
 *
 * Source of truth: user_chat_states.temp_memory.__repair_mode_v1
 *
 * Detects entry conditions (proactives without echo, repeated refusals,
 * pulse silence + high proactive risk), activates/deactivates the mode,
 * tracks reopen signals for exit, and builds event payloads for audit.
 *
 * Integration: proactive_windows_engine reads repairMode.active in
 * checkAbsoluteLocks → only skip or downgrade_to_soft_presence allowed.
 */

import type {
  ConversationPulse,
  RepairModeState,
} from "../_shared/v2-types.ts";
import type { StoredMomentumV2 } from "./momentum_state.ts";
import type { ProactiveHistoryEntry } from "./cooldown_engine.ts";
import type {
  RepairModeEnteredPayload,
  RepairModeExitedPayload,
} from "../_shared/v2-events.ts";

// ── Constants ────────────────────────────────────────────────────────────────

export const REPAIR_MODE_KEY = "__repair_mode_v1";

/** Number of consecutive proactives without user reaction to trigger entry. */
export const PROACTIVE_NO_ECHO_THRESHOLD = 3;
/** Number of soft_decline + explicit_stop in signal log to trigger entry. */
export const CONSENT_DECLINE_THRESHOLD = 3;
/** Minimum substantive reopen signals before auto-exit. */
export const REOPEN_SIGNALS_REQUIRED = 2;

// ── Read / Write ─────────────────────────────────────────────────────────────

export function readRepairMode(tempMemory: unknown): RepairModeState {
  const tm = tempMemory as Record<string, unknown> | null | undefined;
  const raw = tm?.[REPAIR_MODE_KEY];
  if (
    raw && typeof raw === "object" &&
    (raw as Record<string, unknown>).version === 1
  ) {
    return validateRepairMode(raw as Record<string, unknown>);
  }
  return defaultRepairMode();
}

export function writeRepairMode(
  tempMemory: unknown,
  state: RepairModeState,
): Record<string, unknown> {
  const next = tempMemory && typeof tempMemory === "object"
    ? { ...(tempMemory as Record<string, unknown>) }
    : {};
  next[REPAIR_MODE_KEY] = state;
  return next;
}

function defaultRepairMode(): RepairModeState {
  return {
    version: 1,
    active: false,
    entered_at: null,
    reason: null,
    source: "system",
    reopen_signals_count: 0,
    last_soft_contact_at: null,
  };
}

function validateRepairMode(raw: Record<string, unknown>): RepairModeState {
  const source = raw.source;
  const validSource = source === "router" || source === "watcher" ||
    source === "process_checkins" || source === "system";
  return {
    version: 1,
    active: raw.active === true,
    entered_at: typeof raw.entered_at === "string" ? raw.entered_at : null,
    reason: typeof raw.reason === "string" ? raw.reason.slice(0, 200) : null,
    source: validSource ? source as RepairModeState["source"] : "system",
    reopen_signals_count: Number.isFinite(Number(raw.reopen_signals_count))
      ? Math.max(0, Math.floor(Number(raw.reopen_signals_count)))
      : 0,
    last_soft_contact_at: typeof raw.last_soft_contact_at === "string"
      ? raw.last_soft_contact_at
      : null,
  };
}

// ── Entry Detection ──────────────────────────────────────────────────────────

export interface RepairModeEntrySignals {
  proactiveHistory: ProactiveHistoryEntry[];
  momentumV2: StoredMomentumV2;
  conversationPulse: ConversationPulse | null;
  nowIso: string;
}

export interface RepairModeEntryResult {
  shouldEnter: boolean;
  reason: string | null;
}

/**
 * Checks whether repair mode should be activated.
 *
 * Entry conditions (any one suffices):
 * 1. N consecutive proactives without user reaction
 * 2. N consent decline/stop events in the signal log
 * 3. ConversationPulse signals silence + high proactive risk
 */
export function evaluateRepairModeEntry(
  current: RepairModeState,
  signals: RepairModeEntrySignals,
): RepairModeEntryResult {
  if (current.active) {
    return { shouldEnter: false, reason: null };
  }

  const consecutiveNoEcho = countConsecutiveNoEcho(signals.proactiveHistory);
  if (consecutiveNoEcho >= PROACTIVE_NO_ECHO_THRESHOLD) {
    return {
      shouldEnter: true,
      reason: `proactives_without_echo:${consecutiveNoEcho}`,
    };
  }

  const declineCount = countConsentDeclines(signals.momentumV2);
  if (declineCount >= CONSENT_DECLINE_THRESHOLD) {
    return {
      shouldEnter: true,
      reason: `repeated_consent_declines:${declineCount}`,
    };
  }

  const pulse = signals.conversationPulse;
  if (
    pulse?.signals?.likely_need === "silence" &&
    pulse?.signals?.proactive_risk === "high"
  ) {
    return {
      shouldEnter: true,
      reason: "pulse_silence_high_risk",
    };
  }

  return { shouldEnter: false, reason: null };
}

export function countConsecutiveNoEcho(
  history: ProactiveHistoryEntry[],
): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].user_reacted) break;
    count++;
  }
  return count;
}

export function countConsentDeclines(
  momentumV2: StoredMomentumV2,
): number {
  const consentEvents = momentumV2._internal.signal_log.consent_events ?? [];
  return consentEvents.filter(
    (e) => e.kind === "soft_decline" || e.kind === "explicit_stop",
  ).length;
}

// ── Exit Detection ───────────────────────────────────────────────────────────

export interface RepairModeExitSignals {
  responseQuality: "substantive" | "brief" | "minimal";
  consentLevel: "open" | "fragile" | "closed";
}

export interface RepairModeExitResult {
  shouldExit: boolean;
  reason: string | null;
  updatedState: RepairModeState;
}

/**
 * Checks whether repair mode should be deactivated.
 *
 * Exit requires REOPEN_SIGNALS_REQUIRED substantive reopen signals:
 * - A substantive message + open consent counts as 1 signal
 * - A non-minimal message + open consent counts as 1 signal
 * Signals are cumulative across turns.
 */
export function evaluateRepairModeExit(
  current: RepairModeState,
  signals: RepairModeExitSignals,
): RepairModeExitResult {
  if (!current.active) {
    return { shouldExit: false, reason: null, updatedState: current };
  }

  let reopenCount = current.reopen_signals_count;

  if (
    signals.responseQuality === "substantive" &&
    signals.consentLevel === "open"
  ) {
    reopenCount++;
  } else if (
    signals.responseQuality === "brief" &&
    signals.consentLevel === "open"
  ) {
    reopenCount++;
  }

  if (reopenCount >= REOPEN_SIGNALS_REQUIRED) {
    return {
      shouldExit: true,
      reason: `reopen_signals_reached:${reopenCount}`,
      updatedState: {
        ...current,
        active: false,
        reopen_signals_count: reopenCount,
      },
    };
  }

  return {
    shouldExit: false,
    reason: null,
    updatedState: {
      ...current,
      reopen_signals_count: reopenCount,
    },
  };
}

// ── Activate / Deactivate ────────────────────────────────────────────────────

export function activateRepairMode(args: {
  reason: string;
  source: RepairModeState["source"];
  nowIso: string;
}): RepairModeState {
  return {
    version: 1,
    active: true,
    entered_at: args.nowIso,
    reason: args.reason.slice(0, 200),
    source: args.source,
    reopen_signals_count: 0,
    last_soft_contact_at: null,
  };
}

export function deactivateRepairMode(
  current: RepairModeState,
): RepairModeState {
  return {
    version: 1,
    active: false,
    entered_at: null,
    reason: null,
    source: current.source,
    reopen_signals_count: 0,
    last_soft_contact_at: null,
  };
}

/**
 * Records a soft contact (downgraded proactive) during repair mode.
 * Used by process_checkins when a soft_presence is delivered.
 */
export function recordSoftContact(
  current: RepairModeState,
  nowIso: string,
): RepairModeState {
  if (!current.active) return current;
  return {
    ...current,
    last_soft_contact_at: nowIso,
  };
}

// ── Event Payload Builders ───────────────────────────────────────────────────

export function buildRepairModeEnteredPayload(args: {
  userId: string;
  cycleId: string | null;
  transformationId: string | null;
  reason: string;
  source: RepairModeState["source"];
  proactiveNoEchoCount: number;
  consentDeclineCount: number;
}): RepairModeEnteredPayload {
  return {
    user_id: args.userId,
    cycle_id: args.cycleId,
    transformation_id: args.transformationId,
    reason: args.reason,
    source: args.source,
    proactive_no_echo_count: args.proactiveNoEchoCount,
    consent_decline_count: args.consentDeclineCount,
  };
}

export function buildRepairModeExitedPayload(args: {
  userId: string;
  cycleId: string | null;
  transformationId: string | null;
  reason: string;
  reopenSignalsCount: number;
  durationMs: number;
}): RepairModeExitedPayload {
  return {
    user_id: args.userId,
    cycle_id: args.cycleId,
    transformation_id: args.transformationId,
    reason: args.reason,
    reopen_signals_count: args.reopenSignalsCount,
    duration_ms: args.durationMs,
  };
}
