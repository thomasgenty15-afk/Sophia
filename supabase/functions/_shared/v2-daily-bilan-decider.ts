import type {
  ConversationPulse,
  DailyBilanMode,
  DailyBilanOutput,
  MomentumStateLabel,
  MomentumStateV2,
} from "./v2-types.ts";

import type { PlanItemRuntimeRow } from "./v2-runtime.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DailyBilanDeciderInput = {
  planItemsRuntime: PlanItemRuntimeRow[];
  momentum: MomentumStateV2;
  conversationPulse?: ConversationPulse | null;
  /** User-local day of week code: "mon" | "tue" | … | "sun" */
  localDayOfWeek?: string | null;
  nowIso?: string;
};

export type DailyBilanDeciderSignals = {
  emotional_distress: boolean;
  repeated_blocker: boolean;
  declining_traction: boolean;
  strong_progress: boolean;
  reactivation_needed: boolean;
  overloaded: boolean;
  has_stalled_items: boolean;
  has_pulse: boolean;
};

export type DailyBilanDecision = {
  output: DailyBilanOutput;
  deterministic: boolean;
  reason: string;
  signals: DailyBilanDeciderSignals;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLOCKER_ENTRY_KINDS = new Set(["blocker", "skip"]);
const PROGRESS_ENTRY_KINDS = new Set(["checkin", "progress", "partial"]);
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;

const EMOTIONAL_STATES: ReadonlySet<MomentumStateLabel> = new Set([
  "soutien_emotionnel",
  "pause_consentie",
]);

const HABIT_STATE_PRIORITY = {
  in_maintenance: 0,
  active_building: 1,
  stalled: 2,
} as const;

// ---------------------------------------------------------------------------
// Signal detection
// ---------------------------------------------------------------------------

function detectSignals(
  input: DailyBilanDeciderInput,
): DailyBilanDeciderSignals {
  const { momentum, planItemsRuntime, conversationPulse } = input;
  const nowMs = input.nowIso ? new Date(input.nowIso).getTime() : Date.now();

  const emotionalDistress =
    momentum.dimensions.emotional_load.level === "high" ||
    momentum.dimensions.consent.level === "closed" ||
    EMOTIONAL_STATES.has(momentum.current_state) ||
    conversationPulse?.tone?.emotional_load === "high" ||
    conversationPulse?.signals?.likely_need === "repair";

  const repeatedBlocker = momentum.blockers.blocker_repeat_score >= 2 ||
    planItemsRuntime.some((item) => {
      if (item.status !== "active") return false;
      const blockerCount = item.recent_entries.filter((e) =>
        BLOCKER_ENTRY_KINDS.has(e.entry_kind)
      ).length;
      return blockerCount >= 2;
    });

  const decliningTraction =
    momentum.dimensions.execution_traction.level === "down";

  const strongProgress =
    momentum.dimensions.execution_traction.level === "up" &&
    momentum.current_state === "momentum";

  const reactivationNeeded = momentum.current_state === "reactivation" ||
    momentum.dimensions.engagement.level === "low" ||
    conversationPulse?.signals?.likely_need === "silence";

  const overloaded = momentum.active_load.needs_reduce;

  const activeItems = planItemsRuntime.filter((i) => i.status === "active");
  const hasStalled = activeItems.some((item) => {
    if (item.last_entry_at) {
      return nowMs - new Date(item.last_entry_at).getTime() > SEVEN_DAYS_MS;
    }
    const refIso = item.activated_at ?? item.created_at;
    const refMs = new Date(refIso).getTime();
    return refMs > 0 && nowMs - refMs > SEVEN_DAYS_MS;
  });

  return {
    emotional_distress: emotionalDistress,
    repeated_blocker: repeatedBlocker,
    declining_traction: decliningTraction,
    strong_progress: strongProgress,
    reactivation_needed: reactivationNeeded,
    overloaded: overloaded,
    has_stalled_items: hasStalled,
    has_pulse: Boolean(conversationPulse),
  };
}

// ---------------------------------------------------------------------------
// Mode selection (priority cascade)
// ---------------------------------------------------------------------------

function selectMode(
  signals: DailyBilanDeciderSignals,
): { mode: DailyBilanMode; reason: string } {
  if (signals.emotional_distress) {
    return { mode: "check_supportive", reason: "emotional_distress_detected" };
  }

  if (signals.reactivation_needed) {
    return {
      mode: "check_supportive",
      reason: "reactivation_support_needed",
    };
  }

  if (signals.repeated_blocker || signals.declining_traction) {
    return {
      mode: "check_blocker",
      reason: signals.repeated_blocker
        ? "repeated_blocker_pattern"
        : "declining_traction",
    };
  }

  if (
    signals.strong_progress && !signals.overloaded && !signals.has_stalled_items
  ) {
    return { mode: "check_progress", reason: "strong_execution_traction" };
  }

  return { mode: "check_light", reason: "default_light_check" };
}

// ---------------------------------------------------------------------------
// Target item selection
// ---------------------------------------------------------------------------

function selectTargetItems(
  mode: DailyBilanMode,
  items: PlanItemRuntimeRow[],
  localDow: string | null,
  nowMs: number,
): string[] {
  const active = items.filter((i) => i.status === "active");
  if (active.length === 0) return [];

  switch (mode) {
    case "check_blocker":
      return selectBlockerTargets(active);
    case "check_supportive":
      return selectSupportiveTarget(active);
    case "check_progress":
      return selectProgressTarget(active);
    case "check_light":
    default:
      return selectLightTargets(active, localDow, nowMs);
  }
}

function selectBlockerTargets(items: PlanItemRuntimeRow[]): string[] {
  const scored = items
    .map((item) => ({
      id: item.id,
      blockerCount:
        item.recent_entries.filter((e) => BLOCKER_ENTRY_KINDS.has(e.entry_kind))
          .length,
    }))
    .filter((s) => s.blockerCount > 0);

  scored.sort((a, b) => b.blockerCount - a.blockerCount);

  if (scored.length > 0) {
    return scored.slice(0, 2).map((s) => s.id);
  }

  const fallback = pickMostRecentlyActive(items);
  return fallback ? [fallback] : [];
}

function selectSupportiveTarget(items: PlanItemRuntimeRow[]): string[] {
  const scored = items
    .map((item) => ({
      id: item.id,
      burdenRank: supportiveBurdenRank(item),
      recencyMs: item.last_entry_at
        ? new Date(item.last_entry_at).getTime()
        : 0,
    }))
    .sort((a, b) => {
      if (a.burdenRank !== b.burdenRank) {
        return a.burdenRank - b.burdenRank;
      }
      return b.recencyMs - a.recencyMs;
    });

  return scored.length > 0 ? [scored[0].id] : [];
}

function selectProgressTarget(items: PlanItemRuntimeRow[]): string[] {
  const scored = items.map((item) => ({
    id: item.id,
    positive:
      item.recent_entries.filter((e) => PROGRESS_ENTRY_KINDS.has(e.entry_kind))
        .length,
  }));

  scored.sort((a, b) => b.positive - a.positive);
  return scored.length > 0 ? [scored[0].id] : [];
}

function selectLightTargets(
  items: PlanItemRuntimeRow[],
  localDow: string | null,
  nowMs: number,
): string[] {
  if (localDow) {
    const todayHabits = items.filter((i) => {
      if (i.dimension !== "habits") return false;
      if (!i.scheduled_days?.includes(localDow)) return false;
      if (i.last_entry_at) {
        return nowMs - new Date(i.last_entry_at).getTime() > HALF_DAY_MS;
      }
      return true;
    });

    if (todayHabits.length > 0) {
      return [todayHabits[0].id];
    }
  }

  const oldest = pickLongestWithoutEntry(items, nowMs);
  return oldest ? [oldest] : [items[0].id];
}

// ---------------------------------------------------------------------------
// Item scoring helpers
// ---------------------------------------------------------------------------

function pickMostRecentlyActive(items: PlanItemRuntimeRow[]): string | null {
  if (items.length === 0) return null;

  const sorted = [...items].sort((a, b) => {
    if (a.last_entry_at && b.last_entry_at) {
      return new Date(b.last_entry_at).getTime() -
        new Date(a.last_entry_at).getTime();
    }
    if (a.last_entry_at) return -1;
    if (b.last_entry_at) return 1;
    return 0;
  });

  return sorted[0].id;
}

function pickLongestWithoutEntry(
  items: PlanItemRuntimeRow[],
  nowMs: number,
): string | null {
  if (items.length === 0) return null;

  const scored = items.map((item) => {
    const lastMs = item.last_entry_at
      ? new Date(item.last_entry_at).getTime()
      : 0;
    const gap = lastMs > 0 ? nowMs - lastMs : Infinity;
    return { id: item.id, gap };
  });

  scored.sort((a, b) => b.gap - a.gap);
  return scored[0].id;
}

function supportiveBurdenRank(item: PlanItemRuntimeRow): number {
  if (item.dimension === "clarifications" || item.dimension === "support") {
    return 15;
  }

  if (item.dimension === "habits") {
    const habitStateRank = item.current_habit_state == null
      ? 3
      : HABIT_STATE_PRIORITY[item.current_habit_state];
    return 100 + habitStateRank;
  }

  const blockerCount =
    item.recent_entries.filter((entry) =>
      BLOCKER_ENTRY_KINDS.has(entry.entry_kind)
    ).length;

  return 200 + blockerCount;
}

// ---------------------------------------------------------------------------
// Tone + expected capture + next actions
// ---------------------------------------------------------------------------

function toneForMode(mode: DailyBilanMode): "light" | "supportive" | "direct" {
  switch (mode) {
    case "check_supportive":
      return "supportive";
    case "check_blocker":
      return "direct";
    case "check_progress":
    case "check_light":
    default:
      return "light";
  }
}

function expectedCaptureForMode(
  mode: DailyBilanMode,
): DailyBilanOutput["expected_capture"] {
  switch (mode) {
    case "check_supportive":
      return {
        progress_evidence: false,
        difficulty: false,
        blocker_hint: false,
        support_usefulness: true,
        consent_signal: true,
      };
    case "check_blocker":
      return {
        progress_evidence: false,
        difficulty: true,
        blocker_hint: true,
        support_usefulness: false,
        consent_signal: false,
      };
    case "check_progress":
      return {
        progress_evidence: true,
        difficulty: false,
        blocker_hint: false,
        support_usefulness: false,
        consent_signal: false,
      };
    case "check_light":
    default:
      return {
        progress_evidence: true,
        difficulty: false,
        blocker_hint: false,
        support_usefulness: false,
        consent_signal: false,
      };
  }
}

function nextActionsForDecision(
  mode: DailyBilanMode,
  signals: DailyBilanDeciderSignals,
  items: PlanItemRuntimeRow[],
): DailyBilanOutput["next_actions"] {
  const hasPendingUnlock = items.some(
    (i) => i.status === "pending" && i.activation_condition != null,
  );

  return {
    update_momentum: true,
    trigger_coaching_review: mode === "check_blocker" ||
      signals.repeated_blocker,
    mark_unlock_candidate: hasPendingUnlock &&
      (signals.strong_progress || mode === "check_progress"),
  };
}

// ---------------------------------------------------------------------------
// Main decider — pure, deterministic, no DB, no LLM
// ---------------------------------------------------------------------------

export function decideDailyBilan(
  input: DailyBilanDeciderInput,
): DailyBilanDecision {
  const nowMs = input.nowIso ? new Date(input.nowIso).getTime() : Date.now();

  const signals = detectSignals(input);
  const { mode, reason } = selectMode(signals);
  const targetItems = selectTargetItems(
    mode,
    input.planItemsRuntime,
    input.localDayOfWeek ?? null,
    nowMs,
  );

  const output: DailyBilanOutput = {
    mode,
    target_items: targetItems,
    prompt_shape: {
      max_questions: 3,
      tone: toneForMode(mode),
    },
    expected_capture: expectedCaptureForMode(mode),
    next_actions: nextActionsForDecision(
      mode,
      signals,
      input.planItemsRuntime,
    ),
  };

  return {
    output,
    deterministic: true,
    reason,
    signals,
  };
}
