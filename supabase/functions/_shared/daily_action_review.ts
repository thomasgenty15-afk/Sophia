export const DAILY_ACTION_REVIEW_SOURCE = "daily_action_review_v1";

export const DAY_CODES = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type DayCode = typeof DAY_CODES[number];

import {
  DAILY_REVIEW_DEFAULT_CONSTRAINTS,
  type DailyReviewBlockedEffect,
  type DailyReviewConstraint,
  type DailyReviewEffectPlan,
  type DailyReviewIntent,
  type DailyReviewStateMutationAudit,
} from "./daily_action_review/contract.ts";
import {
  dailyActionReviewFocusTargets as selectFocusTargetsFromSelector,
  selectInitialDailyActionReviewFocus as selectInitialFocusFromSelector,
} from "./daily_action_review/selector.ts";
import { buildDailyReviewEffectPlan } from "./daily_action_review/effects.ts";
import {
  openingHasForbiddenDailyReviewCoaching,
  renderDailyActionReviewOpeningInstruction,
} from "./daily_action_review/opening.ts";

export type {
  DailyReviewBlockedEffect,
  DailyReviewCommittedEffect,
  DailyReviewConstraint,
  DailyReviewDecision,
  DailyReviewEffect,
  DailyReviewEffectPlan,
  DailyReviewEffectsResult,
  DailyReviewFailedEffect,
  DailyReviewIntent,
  DailyReviewItemUpdate,
  DailyReviewStateMutationAudit,
  DailyReviewStatus,
} from "./daily_action_review/contract.ts";

export type DailyActionAppliedOutcome = "completed" | "partial" | "missed";
export type DailyActionOutcome = DailyActionAppliedOutcome | "unclear";
export type DailyActionReasonCategory =
  | "fatigue"
  | "forgot"
  | "external"
  | "too_hard"
  | "not_relevant"
  | "emotional"
  | "no_need"
  | "other"
  | "unclear"
  | "none";

export type DailyActionType = "habit" | "mission" | "clarification";
export type DailyActionStillRelevant = boolean | "unknown";
export type DailyActionSkillStatus =
  | "collecting"
  | "needs_clarification"
  | "complete"
  | "stopped";
export type DailyActionMissingSlot =
  | "not_asked"
  | "outcome"
  | "reason"
  | "still_relevant"
  | "which_action"
  | "completion_level";
export type DailyActionStopReason =
  | "all_required_slots_filled"
  | "user_stopped"
  | "safety"
  | "unclear_after_retries"
  | null;

export type DailyActionReviewTarget = {
  occurrence_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_label?: string | null;
  plan_item_id: string;
  title: string;
  description?: string | null;
  dimension?: string | null;
  kind?: string | null;
  tracking_type?: string | null;
  planned_day?: string | null;
  original_planned_day?: string | null;
  week_start_date?: string | null;
  time_of_day?: string | null;
  reviewed_local_date?: string | null;
};

export type DailyActionReviewItemState = {
  occurrence_id: string;
  plan_item_id: string;
  plan_id: string;
  plan_label: string | null;
  title: string;
  action_type: DailyActionType;
  outcome: DailyActionOutcome | null;
  reason_category: DailyActionReasonCategory | null;
  reason_text: string | null;
  still_relevant: DailyActionStillRelevant;
  evidence_text: string | null;
  matched_user_text: string | null;
  confidence: "high" | "medium" | "low";
  missing_slots: DailyActionMissingSlot[];
};

export type DailyActionReviewActionIntelligence = {
  source_memory_item_ids: string[];
  recent_observations: string[];
  recurring_patterns: string[];
  last_weekly_interpretation: string | null;
  freshness_summary: "recent_data_available" | "limited_data" | "no_data";
  suggested_tone:
    | "encouraging"
    | "gentle"
    | "supportive_investigate"
    | "neutral";
  risk_of_overcoaching: "low" | "medium" | "high";
};

export type DailyActionReviewState = {
  source: typeof DAILY_ACTION_REVIEW_SOURCE;
  skill_id: typeof DAILY_ACTION_REVIEW_SOURCE;
  intent: DailyReviewIntent;
  status: DailyActionSkillStatus;
  current_focus_occurrence_ids: string[];
  remaining_occurrence_ids: string[];
  asked_occurrence_ids_history: string[][];
  items: Record<string, DailyActionReviewItemState>;
  next_question: string | null;
  next_question_targets: string[];
  generated_user_message: string | null;
  should_apply_effects: boolean;
  constraints: DailyReviewConstraint[];
  effect_plan: DailyReviewEffectPlan;
  stop_reason: DailyActionStopReason;
  action_intelligence_by_occurrence_id: Record<
    string,
    DailyActionReviewActionIntelligence
  >;
  last_user_text?: string | null;
  state_mutation_audit?: DailyReviewStateMutationAudit;
  blocked_effects?: DailyReviewBlockedEffect[];
};

export type DailyActionReviewOpeningPlan = {
  opening_message: string;
  asked_occurrence_ids: string[];
  not_yet_asked_occurrence_ids: string[];
  grouping_reason: "single_action" | "same_plan" | "same_type" | "priority";
  initial_skill_state: DailyActionReviewState;
};

export type DailyActionReviewSkillResult = {
  state: DailyActionReviewState;
  missingOccurrenceIds: string[];
  stillRelevantByOccurrenceId: Record<string, boolean | null>;
  nextQuestion: string | null;
  generatedUserMessage: string | null;
  shouldApplyEffects: boolean;
  stateMutationAudit?: DailyReviewStateMutationAudit;
  diagnosis?: Record<string, unknown>;
};

const FRENCH_DAY_LABELS: Record<DayCode, string> = {
  mon: "lundi",
  tue: "mardi",
  wed: "mercredi",
  thu: "jeudi",
  fri: "vendredi",
  sat: "samedi",
  sun: "dimanche",
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function asReasonCategory(value: unknown): DailyActionReasonCategory | null {
  const raw = cleanText(value);
  if (
    raw === "fatigue" || raw === "forgot" || raw === "external" ||
    raw === "too_hard" || raw === "not_relevant" || raw === "emotional" ||
    raw === "no_need" || raw === "other" || raw === "unclear" ||
    raw === "none"
  ) {
    return raw;
  }
  return null;
}

function actionTypeForTarget(target: DailyActionReviewTarget): DailyActionType {
  const dimension = cleanText(target.dimension);
  const kind = cleanText(target.kind);
  if (dimension === "habits" || kind === "habit") return "habit";
  if (dimension === "missions" || kind === "mission" || kind === "task") {
    return "mission";
  }
  if (dimension === "clarifications" || kind === "clarification") {
    return "clarification";
  }
  return "mission";
}

function actionTypeRank(type: DailyActionType): number {
  if (type === "habit") return 0;
  if (type === "mission") return 1;
  return 2;
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function asOutcome(value: unknown): DailyActionOutcome | null {
  const raw = cleanText(value);
  if (
    raw === "completed" || raw === "partial" || raw === "missed" ||
    raw === "unclear"
  ) return raw;
  return null;
}

export function isAppliedDailyOutcome(
  value: unknown,
): value is DailyActionAppliedOutcome {
  return value === "completed" || value === "partial" || value === "missed";
}

function asStillRelevant(value: unknown): DailyActionStillRelevant {
  if (value === true || value === false) return value;
  const raw = cleanText(value).toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return "unknown";
}

function stillRelevantForOutcome(
  outcome: DailyActionOutcome | null,
  value: unknown,
): DailyActionStillRelevant {
  return outcome === "missed" ? asStillRelevant(value) : "unknown";
}

function asConfidence(value: unknown): "high" | "medium" | "low" {
  const raw = cleanText(value);
  return raw === "high" || raw === "medium" ? raw : "low";
}

function asMissingSlot(value: unknown): DailyActionMissingSlot | null {
  const raw = cleanText(value);
  if (
    raw === "not_asked" || raw === "outcome" || raw === "reason" ||
    raw === "still_relevant" || raw === "which_action" ||
    raw === "completion_level"
  ) return raw;
  return null;
}

function asSkillStatus(value: unknown): DailyActionSkillStatus {
  const raw = cleanText(value);
  if (
    raw === "collecting" || raw === "needs_clarification" ||
    raw === "complete" || raw === "stopped"
  ) return raw;
  return "collecting";
}

function asStopReason(value: unknown): DailyActionStopReason {
  const raw = cleanText(value);
  if (
    raw === "all_required_slots_filled" || raw === "user_stopped" ||
    raw === "safety" || raw === "unclear_after_retries"
  ) return raw;
  return null;
}

function asReviewIntent(value: unknown): DailyReviewIntent {
  const raw = cleanText(value);
  if (
    raw === "open_review" || raw === "answer_review" ||
    raw === "clarify_outcome" || raw === "clarify_reason" ||
    raw === "clarify_still_relevant" || raw === "recap" ||
    raw === "correction" || raw === "user_stopped" || raw === "safety" ||
    raw === "off_topic" || raw === "unclear"
  ) return raw;
  return "answer_review";
}

function asStateItem(
  target: DailyActionReviewTarget,
): DailyActionReviewItemState {
  return {
    occurrence_id: target.occurrence_id,
    plan_item_id: target.plan_item_id,
    plan_id: target.plan_id,
    plan_label: cleanText(target.plan_label) || null,
    title: target.title,
    action_type: actionTypeForTarget(target),
    outcome: null,
    reason_category: null,
    reason_text: null,
    still_relevant: "unknown",
    evidence_text: null,
    matched_user_text: null,
    confidence: "low",
    missing_slots: ["not_asked", "outcome"],
  };
}

function sanitizeActionIntelligence(
  value: unknown,
): DailyActionReviewActionIntelligence {
  const raw = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const recent = Array.isArray(raw.recent_observations)
    ? uniqueStrings(raw.recent_observations).slice(0, 3)
    : [];
  const patterns = Array.isArray(raw.recurring_patterns)
    ? uniqueStrings(raw.recurring_patterns).slice(0, 2)
    : [];
  const ids = Array.isArray(raw.source_memory_item_ids)
    ? uniqueStrings(raw.source_memory_item_ids).slice(0, 8)
    : [];
  const freshnessRaw = cleanText(raw.freshness_summary);
  const toneRaw = cleanText(raw.suggested_tone);
  const riskRaw = cleanText(raw.risk_of_overcoaching);
  return {
    source_memory_item_ids: ids,
    recent_observations: recent,
    recurring_patterns: patterns,
    last_weekly_interpretation: cleanText(raw.last_weekly_interpretation) ||
      null,
    freshness_summary: freshnessRaw === "recent_data_available" ||
        freshnessRaw === "limited_data"
      ? freshnessRaw
      : ids.length || recent.length || patterns.length
      ? "limited_data"
      : "no_data",
    suggested_tone: toneRaw === "encouraging" || toneRaw === "gentle" ||
        toneRaw === "supportive_investigate"
      ? toneRaw
      : "neutral",
    risk_of_overcoaching: riskRaw === "medium" || riskRaw === "high"
      ? riskRaw
      : "low",
  };
}

function sanitizeActionIntelligenceByOccurrenceId(
  value: unknown,
  items: Record<string, DailyActionReviewItemState>,
): Record<string, DailyActionReviewActionIntelligence> {
  const raw = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const out: Record<string, DailyActionReviewActionIntelligence> = {};
  for (const occurrenceId of Object.keys(items)) {
    const intelligence = sanitizeActionIntelligence(raw[occurrenceId]);
    if (
      intelligence.source_memory_item_ids.length ||
      intelligence.recent_observations.length ||
      intelligence.recurring_patterns.length ||
      intelligence.last_weekly_interpretation
    ) {
      out[occurrenceId] = intelligence;
    }
  }
  return out;
}

export function buildInitialDailyActionReviewState(
  targets: DailyActionReviewTarget[],
  options: {
    actionIntelligenceByOccurrenceId?: Record<
      string,
      DailyActionReviewActionIntelligence
    >;
  } = {},
): DailyActionReviewState {
  const focus = selectInitialDailyActionReviewFocus(targets);
  const focusIds = focus.targets.map((target) => target.occurrence_id);
  const remainingIds = targets
    .map((target) => target.occurrence_id)
    .filter((id) => !focusIds.includes(id));
  const items: Record<string, DailyActionReviewItemState> = {};
  for (const target of targets) {
    const item = asStateItem(target);
    if (focusIds.includes(target.occurrence_id)) {
      item.missing_slots = ["outcome"];
    }
    items[target.occurrence_id] = item;
  }
  return {
    source: DAILY_ACTION_REVIEW_SOURCE,
    skill_id: DAILY_ACTION_REVIEW_SOURCE,
    intent: "open_review",
    status: "collecting",
    current_focus_occurrence_ids: focusIds,
    remaining_occurrence_ids: remainingIds,
    asked_occurrence_ids_history: focusIds.length ? [focusIds] : [],
    items,
    next_question: null,
    next_question_targets: focusIds,
    generated_user_message: null,
    should_apply_effects: false,
    constraints: DAILY_REVIEW_DEFAULT_CONSTRAINTS,
    effect_plan: { allowed: false, effects: [] },
    stop_reason: null,
    action_intelligence_by_occurrence_id:
      sanitizeActionIntelligenceByOccurrenceId(
        options.actionIntelligenceByOccurrenceId,
        items,
      ),
  };
}

function selectInitialDailyActionReviewFocus(
  targets: DailyActionReviewTarget[],
): {
  targets: DailyActionReviewTarget[];
  groupingReason: DailyActionReviewOpeningPlan["grouping_reason"];
} {
  return selectInitialFocusFromSelector(targets);
}

export function dailyActionReviewFocusTargets(
  targets: DailyActionReviewTarget[],
  state: DailyActionReviewState,
): DailyActionReviewTarget[] {
  return selectFocusTargetsFromSelector(targets, state);
}

export function stateFromUnknown(
  value: unknown,
  targets: DailyActionReviewTarget[],
): DailyActionReviewState {
  const existing = (value && typeof value === "object") ? value as any : {};
  const existingItems = (existing.items && typeof existing.items === "object")
    ? existing.items as Record<string, any>
    : {};
  const items: Record<string, DailyActionReviewItemState> = {};
  for (const target of targets) {
    const previous = existingItems[target.occurrence_id] ?? {};
    const outcome = asOutcome(previous.outcome);
    const missingSlots = Array.isArray(previous.missing_slots)
      ? uniqueStrings(previous.missing_slots).flatMap((slot) => {
        const parsed = asMissingSlot(slot);
        return parsed ? [parsed] : [];
      })
      : [];
    items[target.occurrence_id] = {
      ...asStateItem(target),
      outcome,
      reason_category: asReasonCategory(previous.reason_category),
      reason_text: cleanText(previous.reason_text) || null,
      still_relevant: stillRelevantForOutcome(outcome, previous.still_relevant),
      evidence_text: cleanText(previous.evidence_text) || null,
      matched_user_text: cleanText(previous.matched_user_text) || null,
      confidence: asConfidence(previous.confidence),
      missing_slots: missingSlots.length ? missingSlots : deriveMissingSlots({
        outcome,
        reasonText: cleanText(previous.reason_text) || null,
        stillRelevant: stillRelevantForOutcome(
          outcome,
          previous.still_relevant,
        ),
        wasAsked: Array.isArray(existing.asked_occurrence_ids_history) &&
          existing.asked_occurrence_ids_history.some((group: unknown) =>
            Array.isArray(group) && group.includes(target.occurrence_id)
          ),
      }),
    };
  }
  const currentFocus = uniqueStrings(
    Array.isArray(existing.current_focus_occurrence_ids)
      ? existing.current_focus_occurrence_ids
      : [],
  ).filter((id) => items[id]);
  const remaining = uniqueStrings(
    Array.isArray(existing.remaining_occurrence_ids)
      ? existing.remaining_occurrence_ids
      : [],
  ).filter((id) => items[id]);
  const history = Array.isArray(existing.asked_occurrence_ids_history)
    ? existing.asked_occurrence_ids_history.flatMap((group: unknown) =>
      Array.isArray(group)
        ? [uniqueStrings(group).filter((id) => items[id])]
        : []
    ).filter((group: string[]) => group.length > 0)
    : [];
  const fallback = buildInitialDailyActionReviewState(targets);
  const hasMissingSlots = Object.values(items).some((item) =>
    item.missing_slots.length > 0
  );
  const allApplied = Object.values(items).every((item) =>
    isAppliedDailyOutcome(item.outcome)
  );
  const existingStopReason = asStopReason(existing.stop_reason);
  return {
    source: DAILY_ACTION_REVIEW_SOURCE,
    skill_id: DAILY_ACTION_REVIEW_SOURCE,
    intent: asReviewIntent(existing.intent),
    status: asSkillStatus(existing.status),
    current_focus_occurrence_ids: currentFocus.length
      ? currentFocus
      : fallback.current_focus_occurrence_ids,
    remaining_occurrence_ids: remaining.length
      ? remaining
      : fallback.remaining_occurrence_ids,
    asked_occurrence_ids_history: history.length
      ? history
      : fallback.asked_occurrence_ids_history,
    items,
    next_question: cleanText(existing.next_question) || null,
    next_question_targets: uniqueStrings(
      Array.isArray(existing.next_question_targets)
        ? existing.next_question_targets
        : [],
    ).filter((id) => items[id]),
    generated_user_message: cleanText(existing.generated_user_message) || null,
    should_apply_effects: Boolean(existing.should_apply_effects),
    constraints: DAILY_REVIEW_DEFAULT_CONSTRAINTS,
    effect_plan: existing.effect_plan &&
        typeof existing.effect_plan === "object" &&
        (existing.effect_plan as any).allowed === true &&
        Array.isArray((existing.effect_plan as any).effects)
      ? existing.effect_plan as DailyReviewEffectPlan
      : { allowed: false, effects: [] },
    stop_reason: existingStopReason === "all_required_slots_filled" &&
        (!allApplied || hasMissingSlots)
      ? null
      : existingStopReason,
    action_intelligence_by_occurrence_id:
      sanitizeActionIntelligenceByOccurrenceId(
        existing.action_intelligence_by_occurrence_id,
        items,
      ),
    last_user_text: cleanText(existing.last_user_text) || null,
    blocked_effects: [],
  };
}

function deriveMissingSlots(args: {
  outcome: DailyActionOutcome | null;
  reasonText: string | null;
  stillRelevant: DailyActionStillRelevant;
  wasAsked: boolean;
}): DailyActionMissingSlot[] {
  const slots: DailyActionMissingSlot[] = [];
  if (!args.wasAsked) slots.push("not_asked");
  if (!args.outcome) slots.push("outcome");
  if (
    (args.outcome === "missed" || args.outcome === "partial") &&
    !cleanText(args.reasonText)
  ) {
    slots.push("reason");
  }
  if (args.outcome === "missed" && args.stillRelevant === "unknown") {
    slots.push("still_relevant");
  }
  return slots;
}

export function buildDailyActionReviewInstruction(
  targets: DailyActionReviewTarget[],
  options: { allowGreeting?: boolean } = {},
): string {
  return renderDailyActionReviewOpeningInstruction(targets, options);
}

export function dailyActionReviewOpeningHasForbiddenCoaching(
  message: string,
): boolean {
  return openingHasForbiddenDailyReviewCoaching(message);
}

export function buildDailyActionReviewGrounding(
  targets: DailyActionReviewTarget[],
): string {
  const lines = ["event=daily_action_review_v1"];
  targets.forEach((target, index) => {
    const description = cleanText(target.description);
    lines.push(
      [
        `target_${index + 1}:`,
        `occurrence_id=${cleanText(target.occurrence_id)}`,
        `plan_item_id=${cleanText(target.plan_item_id)}`,
        `title=${cleanText(target.title) || "Action"}`,
        `description=${description ? description.slice(0, 500) : "unknown"}`,
        `dimension=${cleanText(target.dimension) || "unknown"}`,
        `kind=${cleanText(target.kind) || "unknown"}`,
        `time_of_day=${cleanText(target.time_of_day) || "unknown"}`,
        `planned_day=${cleanText(target.planned_day) || "unknown"}`,
        `reviewed_local_date=${
          cleanText(target.reviewed_local_date) || "unknown"
        }`,
      ].join(" "),
    );
  });
  return lines.join("\n");
}

export function buildDailyActionReviewOpeningPlan(params: {
  targets: DailyActionReviewTarget[];
  openingMessage: string;
  actionIntelligenceByOccurrenceId?: Record<
    string,
    DailyActionReviewActionIntelligence
  >;
}): DailyActionReviewOpeningPlan {
  const initial = buildInitialDailyActionReviewState(params.targets, {
    actionIntelligenceByOccurrenceId: params.actionIntelligenceByOccurrenceId,
  });
  const focused = new Set(initial.current_focus_occurrence_ids);
  const focusTargets = params.targets.filter((target) =>
    focused.has(target.occurrence_id)
  );
  const selected = selectInitialDailyActionReviewFocus(params.targets);
  return {
    opening_message: cleanText(params.openingMessage),
    asked_occurrence_ids: focusTargets.map((target) => target.occurrence_id),
    not_yet_asked_occurrence_ids: initial.remaining_occurrence_ids,
    grouping_reason: selected.groupingReason,
    initial_skill_state: initial,
  };
}

function memoryItemText(item: any): string {
  return cleanText(item?.content_text ?? item?.normalized_summary).replace(
    /\s+/g,
    " ",
  ).slice(0, 220);
}

function memoryItemPlanItemId(item: any): string {
  return cleanText(
    item?.action_link?.plan_item_id ??
      item?.metadata?.plan_item_id ??
      item?.plan_item_id,
  );
}

function memoryItemAggregationKind(item: any): string {
  return cleanText(
    item?.action_link?.aggregation_kind ??
      item?.metadata?.observation_role ??
      item?.aggregation_kind,
  );
}

function memoryItemIsInjectableInDaily(item: any): boolean {
  const sensitivity = cleanText(item?.sensitivity_level) || "normal";
  if (sensitivity !== "normal") return false;
  if (item?.requires_user_initiated === true) return false;
  return true;
}

export function buildDailyActionReviewActionIntelligence(params: {
  targets: DailyActionReviewTarget[];
  memoryItems: any[];
}): Record<string, DailyActionReviewActionIntelligence> {
  const out: Record<string, DailyActionReviewActionIntelligence> = {};
  for (const target of params.targets) {
    const related = (params.memoryItems ?? [])
      .filter(memoryItemIsInjectableInDaily)
      .filter((item) => memoryItemPlanItemId(item) === target.plan_item_id);
    const recent: string[] = [];
    const patterns: string[] = [];
    const weekly: string[] = [];
    const ids: string[] = [];
    for (const item of related) {
      const text = memoryItemText(item);
      if (!text) continue;
      ids.push(cleanText(item?.id));
      const aggregation = memoryItemAggregationKind(item);
      const metadata = item?.metadata && typeof item.metadata === "object"
        ? item.metadata as Record<string, unknown>
        : {};
      const source = cleanText(
        metadata.source ?? metadata.structured_extraction_source,
      );
      if (
        source === "weekly_adaptive_review_v1" ||
        aggregation === "week_summary"
      ) {
        weekly.push(text);
      } else if (
        aggregation === "possible_pattern" ||
        aggregation === "streak_summary"
      ) {
        patterns.push(text);
      } else {
        recent.push(text);
      }
    }
    const intelligence = sanitizeActionIntelligence({
      source_memory_item_ids: uniqueStrings(ids),
      recent_observations: uniqueStrings(recent).slice(0, 3),
      recurring_patterns: uniqueStrings(patterns).slice(0, 2),
      last_weekly_interpretation: uniqueStrings(weekly)[0] ?? null,
      freshness_summary: related.length ? "recent_data_available" : "no_data",
      suggested_tone: patterns.length || recent.length > 1
        ? "supportive_investigate"
        : recent.length
        ? "gentle"
        : "neutral",
      risk_of_overcoaching: patterns.length > 1 ? "medium" : "low",
    });
    if (
      intelligence.source_memory_item_ids.length ||
      intelligence.recent_observations.length ||
      intelligence.recurring_patterns.length ||
      intelligence.last_weekly_interpretation
    ) {
      out[target.occurrence_id] = intelligence;
    }
  }
  return out;
}

export function formatDailyActionReviewActionIntelligenceForPrompt(
  intelligenceByOccurrenceId: Record<
    string,
    DailyActionReviewActionIntelligence
  >,
): string {
  const lines = Object.entries(intelligenceByOccurrenceId).flatMap((
    [occurrenceId, intelligence],
  ) => {
    const body = [
      ...intelligence.recent_observations.map((text) => `recent=${text}`),
      ...intelligence.recurring_patterns.map((text) => `pattern=${text}`),
      intelligence.last_weekly_interpretation
        ? `weekly=${intelligence.last_weekly_interpretation}`
        : "",
      `tone=${intelligence.suggested_tone}`,
      `overcoaching=${intelligence.risk_of_overcoaching}`,
    ].filter(Boolean).join(" | ");
    return body ? [`${occurrenceId}: ${body}`] : [];
  });
  return lines.length
    ? `Action intelligence stable pour ce daily:\n${lines.join("\n")}`
    : "";
}

export function occurrenceStatusForDailyOutcome(
  outcome: DailyActionAppliedOutcome,
): "done" | "partial" | "missed" {
  if (outcome === "completed") return "done";
  if (outcome === "partial") return "partial";
  return "missed";
}

export function nextDayAfter(day: unknown): DayCode | null {
  const current = cleanText(day) as DayCode;
  const index = DAY_CODES.indexOf(current);
  if (index < 0 || index >= DAY_CODES.length - 1) return null;
  return DAY_CODES[index + 1] ?? null;
}

export function dayLabel(day: unknown): string {
  const code = cleanText(day) as DayCode;
  return FRENCH_DAY_LABELS[code] ?? cleanText(day);
}

export function isHabitDimension(value: unknown): boolean {
  return cleanText(value) === "habits";
}
