import type {
  ConfidenceLevel,
  ConversationPulse,
  DominantNeedKind,
  MomentumStateV2,
  MorningNudgePosture,
  ProactiveBudgetClass,
  ProactiveWindowDecision,
  ProactiveWindowKind,
  RepairModeState,
  UserRelationPreferencesRow,
  WeeklyConversationDigest,
} from "../_shared/v2-types.ts";
import type { ProactiveWindowDecidedPayload } from "../_shared/v2-events.ts";
import type { PlanItemRuntimeRow } from "../_shared/v2-runtime.ts";
import type { MomentumStateLabel, StoredMomentumV2 } from "./momentum_state.ts";
import { getMomentumPolicyDefinition } from "./momentum_policy.ts";
import {
  allowsContactWindow,
  contactWindowFromIso,
  maxBudgetAllowedByRelationPreferences,
} from "./relation_preferences_engine.ts";
import {
  checkPostureCooldown,
  checkReactivationCooldown,
  type CooldownCheckResult,
  POSTURE_ADJACENCY,
  type ProactiveHistoryEntry,
  validatePostureWithCooldown,
} from "./cooldown_engine.ts";

export interface UpcomingEvent {
  title: string;
  scheduled_at: string;
  event_type: string;
  source: string;
}

export interface ProactiveWindowInput {
  userId: string;
  momentumV2: StoredMomentumV2;
  conversationPulse: ConversationPulse | null;
  weeklyDigest?: WeeklyConversationDigest | null;
  repairMode: RepairModeState | null;
  relationPreferences?: UserRelationPreferencesRow | null;
  proactiveHistory: ProactiveHistoryEntry[];
  upcomingEvents: UpcomingEvent[];
  planItems: PlanItemRuntimeRow[];
  recentVictoryTitles: string[];
  planDeepWhy: string | null;
  nowIso: string;
  timezone: string;
  localDayCode: string | null;
  evaluatingWindowKind?: ProactiveWindowKind;
}

export interface ProactiveWindowOutput {
  decision: ProactiveWindowDecision;
  window_kind: ProactiveWindowKind | null;
  posture: MorningNudgePosture | null;
  budget_class: ProactiveBudgetClass;
  confidence: ConfidenceLevel;
  reason: string;
  dominant_need: DominantNeedKind | null;
  target_plan_item_ids: string[];
  target_plan_item_titles: string[];
  scheduled_for: string | null;
  cooldown_checks: CooldownCheckResult[];
}

// ── Budget Configuration (from orchestration-rules §7.1) ────────────────────

const BUDGET_LIMITS = {
  notable: { per_day: 1, per_7d: 3 },
  light: { per_day: 1, per_7d: 7 },
  silent: { per_day: Infinity, per_7d: Infinity },
} as const;

const WINDOW_BUDGET_CLASS: Record<ProactiveWindowKind, ProactiveBudgetClass> = {
  morning_presence: "light",
  pre_event_grounding: "notable",
  midday_rescue: "notable",
  evening_reflection_light: "light",
  reactivation_window: "light",
};

const LIGHT_ONLY_POSTURES = new Set<MorningNudgePosture>([
  "protective_pause",
  "support_softly",
  "open_door",
  "celebration_ping",
]);

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseIsoMs(value: unknown): number {
  if (typeof value !== "string" || !value.trim()) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isSameLocalDay(
  isoA: string,
  isoB: string,
  timezone: string,
): boolean {
  try {
    const dayA = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(isoA));
    const dayB = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(isoB));
    return dayA === dayB;
  } catch {
    return false;
  }
}

function getLocalHour(iso: string, timezone: string): number {
  try {
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(new Date(iso));
    return parseInt(hour, 10);
  } catch {
    return 12;
  }
}

function getLatestHistoryTimestampMs(
  history: ProactiveHistoryEntry[],
): number | null {
  let latestMs = 0;
  for (const entry of history) {
    const ms = parseIsoMs(entry.scheduled_for);
    if (ms > latestMs) latestMs = ms;
  }
  return latestMs > 0 ? latestMs : null;
}

function selectConfidenceSafeLightWindow(
  input: ProactiveWindowInput,
): ProactiveWindowKind {
  const localHour = getLocalHour(input.nowIso, input.timezone);
  return localHour >= 17 ? "evening_reflection_light" : "morning_presence";
}

function selectConfidenceSafeLightPosture(
  input: ProactiveWindowInput,
): MorningNudgePosture {
  const m = input.momentumV2;
  if (
    m.current_state === "soutien_emotionnel" &&
    m.dimensions.emotional_load.level === "high"
  ) {
    return "protective_pause";
  }
  if (
    m.dimensions.emotional_load.level === "high" ||
    m.dimensions.emotional_load.level === "medium" ||
    m.dimensions.consent.level === "fragile"
  ) {
    return "support_softly";
  }
  if (input.recentVictoryTitles.length > 0) {
    return "celebration_ping";
  }
  return "open_door";
}

function coerceToLightOnlyPosture(
  posture: MorningNudgePosture,
  input: ProactiveWindowInput,
): MorningNudgePosture {
  return LIGHT_ONLY_POSTURES.has(posture)
    ? posture
    : selectConfidenceSafeLightPosture(input);
}

function skipOutput(
  reason: string,
  confidence: ConfidenceLevel,
): ProactiveWindowOutput {
  return {
    decision: "skip",
    window_kind: null,
    posture: null,
    budget_class: "silent",
    confidence,
    reason,
    dominant_need: null,
    target_plan_item_ids: [],
    target_plan_item_titles: [],
    scheduled_for: null,
    cooldown_checks: [],
  };
}

function downgradeOutput(
  reason: string,
  confidence: ConfidenceLevel,
): ProactiveWindowOutput {
  return {
    decision: "downgrade_to_soft_presence",
    window_kind: null,
    posture: "protective_pause",
    budget_class: "light",
    confidence,
    reason,
    dominant_need: null,
    target_plan_item_ids: [],
    target_plan_item_titles: [],
    scheduled_for: null,
    cooldown_checks: [],
  };
}

// ── Step 1: Absolute Locks ──────────────────────────────────────────────────

export function checkAbsoluteLocks(
  input: ProactiveWindowInput,
): ProactiveWindowOutput | null {
  if (input.momentumV2.current_state === "pause_consentie") {
    return skipOutput(
      "absolute_lock:pause_consentie",
      input.momentumV2.assessment.confidence,
    );
  }

  if (input.repairMode?.active) {
    return downgradeOutput(
      "absolute_lock:repair_mode_active",
      input.momentumV2.assessment.confidence,
    );
  }

  return null;
}

// ── Step 2: Budget Check ────────────────────────────────────────────────────

export interface BudgetStatus {
  notable_today: number;
  notable_7d: number;
  light_today: number;
  light_7d: number;
  any_notable_today: boolean;
}

export function computeBudgetStatus(
  history: ProactiveHistoryEntry[],
  nowIso: string,
  timezone: string,
): BudgetStatus {
  let notableToday = 0;
  let notable7d = 0;
  let lightToday = 0;
  let light7d = 0;
  let anyNotableToday = false;

  for (const entry of history) {
    const ctx = entry.event_context;
    const isNotable = ctx.startsWith("momentum_") ||
      entry.window_kind === "pre_event_grounding" ||
      entry.window_kind === "midday_rescue";
    const isToday = isSameLocalDay(entry.scheduled_for, nowIso, timezone);

    if (isNotable) {
      notable7d++;
      if (isToday) {
        notableToday++;
        anyNotableToday = true;
      }
    } else {
      light7d++;
      if (isToday) lightToday++;
    }
  }

  return {
    notable_today: notableToday,
    notable_7d: notable7d,
    light_today: lightToday,
    light_7d: light7d,
    any_notable_today: anyNotableToday,
  };
}

export function checkBudget(
  budgetClass: ProactiveBudgetClass,
  budgetStatus: BudgetStatus,
): string | null {
  if (budgetClass === "silent") return null;

  const limits = BUDGET_LIMITS[budgetClass];

  if (budgetClass === "notable") {
    if (budgetStatus.notable_today >= limits.per_day) {
      return `budget_exhausted:notable_daily:${budgetStatus.notable_today}/${limits.per_day}`;
    }
    if (budgetStatus.notable_7d >= limits.per_7d) {
      return `budget_exhausted:notable_weekly:${budgetStatus.notable_7d}/${limits.per_7d}`;
    }
  }

  if (budgetClass === "light") {
    if (budgetStatus.light_today >= limits.per_day) {
      return `budget_exhausted:light_daily:${budgetStatus.light_today}/${limits.per_day}`;
    }
    if (budgetStatus.any_notable_today) {
      return "budget_blocked:light_suppressed_by_notable_same_day";
    }
  }

  return null;
}

// ── Step 3: Confidence Gate ─────────────────────────────────────────────────

export function checkConfidence(
  confidence: ConfidenceLevel,
): { allowed: boolean; max_budget: ProactiveBudgetClass } {
  switch (confidence) {
    case "low":
      return { allowed: false, max_budget: "silent" };
    case "medium":
      return { allowed: true, max_budget: "light" };
    case "high":
      return { allowed: true, max_budget: "notable" };
    default:
      return { allowed: false, max_budget: "silent" };
  }
}

// ── Step 4: Identify Dominant Need ──────────────────────────────────────────

export function identifyDominantNeed(
  input: ProactiveWindowInput,
): DominantNeedKind {
  const m = input.momentumV2;
  const pulse = input.conversationPulse;

  if (input.upcomingEvents.length > 0) {
    const soonestEvent = input.upcomingEvents[0];
    const eventMs = parseIsoMs(soonestEvent.scheduled_at);
    const nowMs = parseIsoMs(input.nowIso);
    if (eventMs > 0 && eventMs - nowMs < 24 * 60 * 60 * 1000) {
      return "pre_event";
    }
  }
  if (pulse?.signals?.upcoming_event) {
    return "pre_event";
  }

  if (
    m.dimensions.emotional_load.level === "high" ||
    (m.dimensions.emotional_load.level === "medium" &&
      m.dimensions.consent.level === "fragile")
  ) {
    return "emotional_protection";
  }

  if (
    m.dimensions.load_balance.level === "overloaded" ||
    (m.active_load?.needs_reduce === true)
  ) {
    return "load_relief";
  }

  if (
    m.dimensions.execution_traction.level === "down" ||
    m.dimensions.plan_fit.level === "poor"
  ) {
    return "traction_rescue";
  }

  if (
    input.weeklyDigest &&
    input.weeklyDigest.message_count < 3 &&
    input.weeklyDigest.active_days < 2 &&
    input.upcomingEvents.length === 0 &&
    !pulse?.signals?.upcoming_event
  ) {
    return "reactivation";
  }

  if (m.current_state === "reactivation") {
    return "reactivation";
  }

  return "general_presence";
}

// ── Step 5: Select Window Kind ──────────────────────────────────────────────

export function selectWindowKind(
  need: DominantNeedKind,
  input: ProactiveWindowInput,
): ProactiveWindowKind {
  if (input.evaluatingWindowKind) return input.evaluatingWindowKind;

  const localHour = getLocalHour(input.nowIso, input.timezone);

  switch (need) {
    case "pre_event":
      return "pre_event_grounding";

    case "emotional_protection":
    case "load_relief":
    case "traction_rescue":
      if (localHour >= 11 && localHour < 17) return "midday_rescue";
      if (localHour >= 17) return "evening_reflection_light";
      return "morning_presence";

    case "reactivation":
      return "reactivation_window";

    case "general_presence":
      if (localHour >= 17) return "evening_reflection_light";
      return "morning_presence";

    default:
      return "morning_presence";
  }
}

// ── Step 6: Select Posture ──────────────────────────────────────────────────

export function selectPosture(
  windowKind: ProactiveWindowKind,
  input: ProactiveWindowInput,
): MorningNudgePosture {
  const m = input.momentumV2;
  const state = m.current_state;

  switch (windowKind) {
    case "morning_presence":
      return selectMorningPosture(m, state, input);

    case "pre_event_grounding":
      return "pre_event_grounding";

    case "midday_rescue":
      if (m.dimensions.emotional_load.level === "high") return "support_softly";
      if (
        m.dimensions.load_balance.level === "overloaded" ||
        m.dimensions.load_balance.level === "slightly_heavy"
      ) {
        return "simplify_today";
      }
      return "focus_today";

    case "evening_reflection_light":
      if (input.recentVictoryTitles.length > 0) return "celebration_ping";
      if (state === "soutien_emotionnel") return "support_softly";
      return "open_door";

    case "reactivation_window":
      return "open_door";

    default:
      return "focus_today";
  }
}

function selectMorningPosture(
  m: StoredMomentumV2,
  state: MomentumStateLabel,
  input: ProactiveWindowInput,
): MorningNudgePosture {
  if (
    state === "soutien_emotionnel" &&
    m.dimensions.emotional_load.level === "high"
  ) {
    return "protective_pause";
  }

  if (
    m.dimensions.emotional_load.level === "high" ||
    m.dimensions.emotional_load.level === "medium"
  ) {
    return "support_softly";
  }

  if (input.conversationPulse?.signals?.upcoming_event) {
    return "pre_event_grounding";
  }

  if (state === "reactivation") {
    return "open_door";
  }

  if (
    state === "friction_legere" ||
    state === "evitement" ||
    m.dimensions.load_balance.level === "overloaded" ||
    m.dimensions.load_balance.level === "slightly_heavy"
  ) {
    return "simplify_today";
  }

  if (input.recentVictoryTitles.length > 0) {
    return "celebration_ping";
  }

  return "focus_today";
}

// ── Step 7: Momentum policy gate ────────────────────────────────────────────

function checkMomentumPolicy(
  state: MomentumStateLabel,
  history: ProactiveHistoryEntry[],
  nowMs: number,
): string | null {
  const policy = getMomentumPolicyDefinition(state);
  if (policy.proactive_policy === "none" || policy.max_proactive_per_7d <= 0) {
    return `policy_blocked:${state}`;
  }
  if (history.length >= policy.max_proactive_per_7d) {
    return `policy_weekly_cap:${state}:${history.length}/${policy.max_proactive_per_7d}`;
  }
  const latestHistoryMs = getLatestHistoryTimestampMs(history);
  const minGapMs = policy.min_gap_hours * 60 * 60 * 1000;
  if (latestHistoryMs !== null && nowMs - latestHistoryMs < minGapMs) {
    return `policy_min_gap:${state}:${policy.min_gap_hours}h`;
  }
  return null;
}

// ── Resolve target plan items ───────────────────────────────────────────────

function resolveTargetItems(
  input: ProactiveWindowInput,
): PlanItemRuntimeRow[] {
  const activeItems = input.planItems.filter((item) =>
    item.status === "active" || item.status === "in_maintenance" ||
    item.status === "stalled"
  );

  const todayItems = activeItems.filter((item) => {
    if (
      !Array.isArray(item.scheduled_days) || item.scheduled_days.length === 0
    ) {
      return true;
    }
    return input.localDayCode
      ? item.scheduled_days.includes(input.localDayCode)
      : false;
  });

  return todayItems.length > 0 ? todayItems : activeItems;
}

// ── Main Entry: evaluateProactiveWindow ─────────────────────────────────────

export function evaluateProactiveWindow(
  input: ProactiveWindowInput,
): ProactiveWindowOutput {
  const nowMs = parseIsoMs(input.nowIso);
  const confidence = input.momentumV2.assessment.confidence;

  // Step 1: Absolute locks
  const lockResult = checkAbsoluteLocks(input);
  if (lockResult) return lockResult;

  // No plan items at all → skip
  if (input.planItems.length === 0) {
    return skipOutput("no_plan_items", confidence);
  }

  // Step 2: Momentum policy gate
  const policyBlock = checkMomentumPolicy(
    input.momentumV2.current_state,
    input.proactiveHistory,
    nowMs,
  );
  if (policyBlock) {
    return skipOutput(policyBlock, confidence);
  }

  // Step 3: Confidence gate
  const confidenceGate = checkConfidence(confidence);
  if (!confidenceGate.allowed) {
    return skipOutput(`confidence_too_low:${confidence}`, confidence);
  }

  // Step 4: Identify dominant need
  const dominantNeed = identifyDominantNeed(input);

  // Step 5: Select window kind
  const selectedWindowKind = selectWindowKind(dominantNeed, input);
  const selectedBudgetClass = WINDOW_BUDGET_CLASS[selectedWindowKind];
  const confidenceCappedWindowKind =
    selectedBudgetClass === "notable" && confidenceGate.max_budget === "light"
      ? selectConfidenceSafeLightWindow(input)
      : selectedWindowKind;
  const relationBudgetCap = maxBudgetAllowedByRelationPreferences(
    input.relationPreferences,
  );
  const effectiveWindowKind = relationBudgetCap === "light" &&
      WINDOW_BUDGET_CLASS[confidenceCappedWindowKind] === "notable"
    ? selectConfidenceSafeLightWindow(input)
    : confidenceCappedWindowKind;
  const effectiveBudget = WINDOW_BUDGET_CLASS[effectiveWindowKind];
  const contactWindow = contactWindowFromIso(input.nowIso, input.timezone);
  if (!allowsContactWindow(input.relationPreferences, contactWindow)) {
    return skipOutput(
      `relation_preferences_blocked:contact_window:${contactWindow}`,
      confidence,
    );
  }

  // Step 6: Budget check
  const budgetStatus = computeBudgetStatus(
    input.proactiveHistory,
    input.nowIso,
    input.timezone,
  );
  const budgetBlock = checkBudget(effectiveBudget, budgetStatus);
  if (budgetBlock) {
    return skipOutput(budgetBlock, confidence);
  }

  // Step 7: Select posture
  let idealPosture = selectPosture(effectiveWindowKind, input);
  if (confidenceGate.max_budget === "light") {
    idealPosture = coerceToLightOnlyPosture(idealPosture, input);
  }

  // Step 8: Cooldown check with fallback
  const targetItems = resolveTargetItems(input);
  const targetTitles = [...new Set(targetItems.map((i) => i.title))];

  // Special reactivation cooldown
  if (effectiveWindowKind === "reactivation_window") {
    const reactivationCheck = checkReactivationCooldown(
      input.proactiveHistory,
      nowMs,
    );
    if (reactivationCheck.is_cooled_down) {
      return {
        ...skipOutput(
          `cooldown_blocked:reactivation_after_silence`,
          confidence,
        ),
        window_kind: effectiveWindowKind,
        dominant_need: dominantNeed,
        cooldown_checks: [reactivationCheck],
      };
    }
  }

  const { posture: validatedPosture, checks } = validatePostureWithCooldown(
    idealPosture,
    targetTitles,
    input.proactiveHistory,
    nowMs,
  );

  if (!validatedPosture) {
    return {
      ...skipOutput(`cooldown_blocked:${idealPosture}`, confidence),
      window_kind: effectiveWindowKind,
      dominant_need: dominantNeed,
      cooldown_checks: checks,
    };
  }

  // Success: create window
  return {
    decision: "create_window",
    window_kind: effectiveWindowKind,
    posture: validatedPosture,
    budget_class: effectiveBudget,
    confidence,
    reason:
      `proactive_window:${effectiveWindowKind}:${validatedPosture}:${dominantNeed}`,
    dominant_need: dominantNeed,
    target_plan_item_ids: targetItems.map((i) => i.id),
    target_plan_item_titles: targetTitles,
    scheduled_for: null,
    cooldown_checks: checks,
  };
}

// ── Event Payload Builder ───────────────────────────────────────────────────

export function buildProactiveWindowDecidedPayload(
  userId: string,
  output: ProactiveWindowOutput,
  cycleId: string | null,
  transformationId: string | null,
): ProactiveWindowDecidedPayload {
  if (!output.window_kind) {
    throw new Error("proactive window payload requires a concrete window_kind");
  }
  return {
    user_id: userId,
    cycle_id: cycleId,
    transformation_id: transformationId,
    window_kind: output.window_kind,
    decision: output.decision,
    budget_class: output.budget_class,
    posture: output.posture,
    confidence: output.confidence,
    reason: output.reason,
  };
}
