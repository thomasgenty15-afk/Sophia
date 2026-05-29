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

import { generateWithGemini } from "./gemini.ts";
import {
  DAILY_REVIEW_DEFAULT_CONSTRAINTS,
  type DailyReviewConstraint,
  type DailyReviewEffectPlan,
  type DailyReviewIntent,
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
  DailyReviewCommittedEffect,
  DailyReviewConstraint,
  DailyReviewDecision,
  DailyReviewEffect,
  DailyReviewEffectPlan,
  DailyReviewEffectsResult,
  DailyReviewFailedEffect,
  DailyReviewIntent,
  DailyReviewItemUpdate,
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
};

export type DailyActionReviewFollowupIntent =
  | "recap"
  | "explain_partial"
  | "continuation"
  | "already_resolved"
  | "correction"
  | "other";

export type DailyActionReviewFollowupResult = {
  shouldHandle: boolean;
  intent: DailyActionReviewFollowupIntent;
  confidence: "low" | "medium" | "high";
  generatedUserMessage: string | null;
  evidence: string[];
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
    lines.push(
      [
        `target_${index + 1}:`,
        `occurrence_id=${cleanText(target.occurrence_id)}`,
        `plan_item_id=${cleanText(target.plan_item_id)}`,
        `title=${cleanText(target.title) || "Action"}`,
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

function parseJsonish(raw: unknown): unknown {
  if (raw && typeof raw === "object") return raw;
  const text = cleanText(raw);
  if (!text) return {};
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    return {};
  }
}

function buildDailyActionReviewSkillSystemPrompt(): string {
  return [
    "Tu es le skill daily_action_review_v1 de Sophia.",
    "Ta mission est uniquement de collecter le statut des actions du jour et les raisons utiles pour le bilan weekly.",
    "Tu remplis un JSON a trous. Le code valide le schema et applique ensuite les effets DB.",
    "",
    "Regles produit:",
    "- Daily review = collecte, pas coaching.",
    "- Ne propose jamais carte d'attaque, carte de defense, potion, reminder ou ajustement de plan.",
    "- Une operation ne peut exister que si le user la demande explicitement; ici tu n'en lances aucune.",
    "- Ne transforme pas une friction en proposition d'outil.",
    "- Ne demande pas au user de choisir entre completed/partial/missed; ces labels sont internes.",
    "- Si le user repond aussi sur une action non demandee mais presente dans targets, remplis-la aussi.",
    "- Ne redemande jamais une action deja suffisamment remplie.",
    "- Habitude faite partiellement: outcome=partial suffit; ne demande pas de report.",
    "- Mission faite partiellement: outcome=partial suffit; le code divisera la suite si les effets DB sont appliques.",
    "- Clarification: pas de partial. Si la reponse n'est pas clairement faite ou pas faite, garde outcome=unclear et demande fait/pas fait.",
    '- Dans tous les messages visibles, dis "partiellement fait" ou "fait en partie", jamais "partiel" seul.',
    "- Pose au maximum une question courte, sur maximum deux actions.",
    "- Ne passe pas au groupe suivant tant que les actions deja demandees ont des missing_slots. Si un outcome, une raison ou still_relevant manque pour le groupe courant, pose d'abord cette question courte.",
    "- S'il y a encore des actions non demandees, choisis le prochain groupe coherent: meme plan d'abord, puis habitudes, missions, clarifications.",
    "- Si 4 actions viennent de 2 plans avec 2 actions par plan, traite les 2 actions du meme plan ensemble.",
    "- Si le user refuse ou dit qu'il ne veut pas en parler, status=stopped et stop_reason=user_stopped.",
    "- Si le user part sur un autre sujet explicite, intent=off_topic, status=stopped, should_apply_effects=false.",
    "- Si le user revele une crise, une auto-attaque forte ou un signal safety, intent=safety, status=stopped, stop_reason=safety, should_apply_effects=false.",
    '- Dans tous les messages visibles, quand tu parles de toi-même, utilise la première personne du singulier ("je", "me", "moi"), jamais "Sophia".',
    "- action_intelligence_by_occurrence_id est un contexte stable injecte par le systeme: utilise-le seulement pour ajuster le ton et eviter de surreagir, pas pour remplacer la collecte du statut du jour.",
    "- Ne recite pas brutalement une vieille raison sensible; si un blocage recent se repete, sois supportive et pose une question courte utile.",
    "- Si la question precedente demandait seulement confirmation de report pour une action missed, et que le user accepte le report, mets still_relevant=true pour cette action, retire missing_slots, puis should_apply_effects=true si rien d'autre ne manque.",
    "- Si la question precedente demandait confirmation de report pour une action missed, et que le user refuse, mets still_relevant=false pour cette action, retire missing_slots, puis should_apply_effects=true si rien d'autre ne manque.",
    "- Ne repete pas une question de confirmation si le user vient d'y repondre clairement.",
    "",
    "Schema de sortie strict:",
    JSON.stringify({
      status: "collecting|needs_clarification|complete|stopped",
      intent:
        "answer_review|clarify_outcome|clarify_reason|clarify_still_relevant|correction|user_stopped|safety|off_topic|unclear",
      current_focus_occurrence_ids: ["occurrence_id"],
      remaining_occurrence_ids: ["occurrence_id"],
      asked_occurrence_ids_history: [["occurrence_id"]],
      items: {
        occurrence_id: {
          occurrence_id: "string",
          plan_item_id: "string",
          plan_id: "string",
          plan_label: "string|null",
          title: "string",
          action_type: "habit|mission|clarification",
          outcome: "completed|partial|missed|unclear|null",
          reason_category:
            "fatigue|forgot|external|too_hard|not_relevant|emotional|no_need|other|unclear|none|null",
          reason_text: "string|null",
          still_relevant: "true|false|unknown",
          evidence_text: "string|null",
          matched_user_text: "string|null",
          confidence: "high|medium|low",
          missing_slots: [
            "not_asked|outcome|reason|still_relevant|which_action|completion_level",
          ],
        },
      },
      next_question: "string|null",
      next_question_targets: ["occurrence_id"],
      generated_user_message: "string|null",
      should_apply_effects: false,
      constraints: [
        "one_question_max|no_solution_first|no_tool_suggestion|no_plan_adjustment|no_potion|no_guilt|respect_user_stopped|do_not_mark_without_evidence|do_not_apply_without_complete_slots",
      ],
      stop_reason:
        "all_required_slots_filled|user_stopped|safety|unclear_after_retries|null",
      effect_plan: {
        allowed: false,
        effects: [{
          type: "log_daily_action_review",
          occurrence_id: "string",
          plan_item_id: "string",
          outcome: "completed|partial|missed",
          reason_category:
            "fatigue|forgot|external|too_hard|not_relevant|emotional|no_need|other|unclear|none",
          reason_text: "string|null",
          still_relevant: "boolean|null",
          source: "daily_action_review_v1",
        }],
      },
      action_intelligence_by_occurrence_id: {
        occurrence_id: {
          source_memory_item_ids: ["memory_item_id"],
          recent_observations: ["string"],
          recurring_patterns: ["string"],
          last_weekly_interpretation: "string|null",
          freshness_summary: "recent_data_available|limited_data|no_data",
          suggested_tone: "encouraging|gentle|supportive_investigate|neutral",
          risk_of_overcoaching: "low|medium|high",
        },
      },
    }),
    "",
    "Regles de completion:",
    "- Une action completed est suffisante avec outcome et evidence_text.",
    "- Aucun effet sans occurrence_id connu, evidence_text, confidence medium/high, et missing_slots vide.",
    "- Une action partial/missed est suffisante avec outcome + reason_text si le user l'a donne; si la raison manque, pose une question courte.",
    "- Pour missed, still_relevant=true/false/unknown. Ne force pas si le user ne le dit pas. Pour completed ou partial, laisse still_relevant=unknown.",
    "- Si outcome=missed et still_relevant=unknown, garde missing_slots avec still_relevant et genere une question courte de confirmation avant tout report.",
    "- generated_user_message est obligatoire: si le skill a besoin d'une info, il contient la prochaine question; si should_apply_effects=true, il contient le recap factuel final a envoyer apres application.",
    '- Tu tutoies toujours l\'utilisateur dans next_question et generated_user_message. N\'utilise "vous", "votre" ou "vos" que si tu parles explicitement du couple ou de plusieurs personnes, jamais pour t\'adresser directement à l\'utilisateur.',
    "- Le recap final doit reprendre les actions traitees, leur statut, et le report seulement si still_relevant=true et que le report sera applique. Ne propose aucune nouvelle operation.",
    "- next_question peut dupliquer generated_user_message quand il s'agit d'une clarification; le handler enverra generated_user_message.",
    "- Si des missing_slots restent, next_question et generated_user_message doivent poser la question manquante; ne dis jamais que quelque chose est note, reporte ou applique dans ce cas.",
    "- Si generated_user_message annonce un report ou une application finale, alors missing_slots doit etre vide et should_apply_effects=true.",
    "- should_apply_effects=true seulement quand toutes les actions ont outcome completed/partial/missed, evidence_text, confidence medium/high et missing_slots vide.",
    "- Si status=stopped ou stop_reason=safety/user_stopped, should_apply_effects=false.",
    "- Si une action reste outcome=null, should_apply_effects=false sauf status=stopped.",
    "Reponds uniquement en JSON valide.",
  ].join("\n");
}

function buildDailyActionReviewSkillUserPrompt(params: {
  userMessage: string;
  targets: DailyActionReviewTarget[];
  previousState: DailyActionReviewState;
  recentMessages?: Array<{ role: string; content: string }>;
}): string {
  return JSON.stringify({
    user_message: params.userMessage,
    targets: params.targets.map((target) => ({
      occurrence_id: target.occurrence_id,
      plan_item_id: target.plan_item_id,
      plan_id: target.plan_id,
      plan_label: target.plan_label ?? null,
      title: target.title,
      action_type: actionTypeForTarget(target),
      dimension: target.dimension ?? null,
      kind: target.kind ?? null,
      planned_day: target.planned_day ?? null,
      time_of_day: target.time_of_day ?? null,
    })),
    previous_state: params.previousState,
    action_intelligence_by_occurrence_id:
      params.previousState.action_intelligence_by_occurrence_id,
    recent_messages: (params.recentMessages ?? []).slice(-8),
  });
}

function sanitizeDailyActionReviewStateFromAi(params: {
  raw: unknown;
  previousState: DailyActionReviewState;
  targets: DailyActionReviewTarget[];
  userMessage: string;
}): DailyActionReviewState {
  const parsed = parseJsonish(params.raw);
  const raw = (parsed && typeof parsed === "object") ? parsed as any : {};
  const targetById = new Map(params.targets.map((target) => [
    target.occurrence_id,
    target,
  ]));
  const previous = params.previousState;
  const items: Record<string, DailyActionReviewItemState> = {};
  const rawItems = raw.items && typeof raw.items === "object"
    ? raw.items as Record<string, any>
    : {};

  const history = sanitizeHistory(
    raw.asked_occurrence_ids_history ?? previous.asked_occurrence_ids_history,
    targetById,
  );
  const currentFocus = uniqueStrings(
    Array.isArray(raw.current_focus_occurrence_ids)
      ? raw.current_focus_occurrence_ids
      : previous.current_focus_occurrence_ids,
  ).filter((id) => targetById.has(id)).slice(0, 2);
  const remaining = uniqueStrings(
    Array.isArray(raw.remaining_occurrence_ids)
      ? raw.remaining_occurrence_ids
      : previous.remaining_occurrence_ids,
  ).filter((id) => targetById.has(id));

  for (const target of params.targets) {
    const previousItem = previous.items[target.occurrence_id] ??
      asStateItem(target);
    const candidate = rawItems[target.occurrence_id] ?? {};
    const outcome = asOutcome(candidate.outcome) ?? previousItem.outcome;
    const reasonText = cleanText(candidate.reason_text) ||
      previousItem.reason_text;
    const stillRelevant = stillRelevantForOutcome(
      outcome,
      candidate.still_relevant === undefined
        ? previousItem.still_relevant
        : candidate.still_relevant,
    );
    const wasAsked = history.some((group) =>
      group.includes(target.occurrence_id)
    ) || currentFocus.includes(target.occurrence_id);
    const aiMissingSlots = Array.isArray(candidate.missing_slots)
      ? uniqueStrings(candidate.missing_slots).flatMap((slot) => {
        const parsedSlot = asMissingSlot(slot);
        return parsedSlot ? [parsedSlot] : [];
      })
      : [];
    const derivedMissingSlots = deriveMissingSlots({
      outcome,
      reasonText,
      stillRelevant,
      wasAsked,
    });
    const missingSlots = uniqueStrings([
      ...aiMissingSlots,
      ...derivedMissingSlots,
      isAppliedDailyOutcome(outcome) && !cleanText(candidate.evidence_text) &&
        !cleanText(previousItem.evidence_text)
        ? "outcome"
        : "",
      isAppliedDailyOutcome(outcome) &&
        asConfidence(candidate.confidence ?? previousItem.confidence) ===
          "low"
        ? "which_action"
        : "",
    ]).flatMap((slot) => {
      const parsedSlot = asMissingSlot(slot);
      return parsedSlot ? [parsedSlot] : [];
    });
    items[target.occurrence_id] = {
      ...asStateItem(target),
      outcome,
      reason_category: asReasonCategory(candidate.reason_category) ??
        previousItem.reason_category,
      reason_text: reasonText,
      still_relevant: stillRelevant,
      evidence_text: cleanText(candidate.evidence_text) ||
        previousItem.evidence_text,
      matched_user_text: cleanText(candidate.matched_user_text) ||
        previousItem.matched_user_text,
      confidence: asConfidence(candidate.confidence ?? previousItem.confidence),
      missing_slots: missingSlots,
    };
  }

  let status = asSkillStatus(raw.status);
  const nextQuestion = cleanText(raw.next_question) || null;
  const generatedUserMessage = cleanText(raw.generated_user_message) ||
    nextQuestion ||
    null;
  const nextQuestionTargets = uniqueStrings(
    Array.isArray(raw.next_question_targets) ? raw.next_question_targets : [],
  ).filter((id) => targetById.has(id)).slice(0, 2);
  const allApplied = Object.values(items).every((item) =>
    isAppliedDailyOutcome(item.outcome)
  );
  const hasMissingSlots = Object.values(items).some((item) =>
    item.missing_slots.length > 0
  );
  const stopped = status === "stopped";
  const provisionalState = {
    status,
    stop_reason: stopped
      ? asStopReason(raw.stop_reason) ?? "user_stopped"
      : null,
    items,
  };
  const effectPlan = buildDailyReviewEffectPlan(
    provisionalState,
    params.targets,
  );
  const shouldApplyEffects = !stopped &&
    Boolean(raw.should_apply_effects) &&
    allApplied &&
    !hasMissingSlots &&
    effectPlan.allowed;
  if (allApplied && !hasMissingSlots && !nextQuestion) status = "complete";
  if (hasMissingSlots && status === "complete") status = "needs_clarification";
  if (!allApplied && status === "complete") status = "needs_clarification";
  const rawStopReason = asStopReason(raw.stop_reason);
  return {
    source: DAILY_ACTION_REVIEW_SOURCE,
    skill_id: DAILY_ACTION_REVIEW_SOURCE,
    intent: stopped
      ? rawStopReason === "safety" ? "safety" : asReviewIntent(raw.intent)
      : asReviewIntent(raw.intent),
    status,
    current_focus_occurrence_ids: currentFocus,
    remaining_occurrence_ids: remaining.filter((id) =>
      !isAppliedDailyOutcome(items[id]?.outcome)
    ),
    asked_occurrence_ids_history: history,
    items,
    next_question: nextQuestion,
    next_question_targets: nextQuestionTargets,
    generated_user_message: generatedUserMessage,
    should_apply_effects: shouldApplyEffects,
    constraints: DAILY_REVIEW_DEFAULT_CONSTRAINTS,
    effect_plan: shouldApplyEffects
      ? effectPlan
      : { allowed: false, effects: [] },
    stop_reason: stopped
      ? rawStopReason ?? "user_stopped"
      : allApplied && !hasMissingSlots
      ? "all_required_slots_filled"
      : rawStopReason === "all_required_slots_filled"
      ? null
      : rawStopReason,
    action_intelligence_by_occurrence_id:
      previous.action_intelligence_by_occurrence_id,
    last_user_text: params.userMessage,
  };
}

function sanitizeHistory(
  raw: unknown,
  targetById: Map<string, DailyActionReviewTarget>,
): string[][] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((group) =>
    Array.isArray(group)
      ? [uniqueStrings(group).filter((id) => targetById.has(id)).slice(0, 2)]
      : []
  ).filter((group) => group.length > 0);
}

function resultFromState(
  state: DailyActionReviewState,
): DailyActionReviewSkillResult {
  const missingOccurrenceIds = Object.values(state.items)
    .filter((item) =>
      !isAppliedDailyOutcome(item.outcome) || item.missing_slots.length > 0
    )
    .map((item) => item.occurrence_id);
  const stillRelevantByOccurrenceId: Record<string, boolean | null> = {};
  for (const item of Object.values(state.items)) {
    stillRelevantByOccurrenceId[item.occurrence_id] =
      item.still_relevant === "unknown" ? null : item.still_relevant;
  }
  return {
    state,
    missingOccurrenceIds,
    stillRelevantByOccurrenceId,
    nextQuestion: state.next_question,
    generatedUserMessage: state.generated_user_message,
    shouldApplyEffects: state.should_apply_effects,
  };
}

function dailyActionReviewStateValidationErrors(
  state: DailyActionReviewState,
): string[] {
  const errors: string[] = [];
  const missing = Object.values(state.items).filter((item) =>
    !isAppliedDailyOutcome(item.outcome) || item.missing_slots.length > 0
  );
  if (missing.length > 0 && !cleanText(state.next_question)) {
    errors.push("missing_slots_require_next_question");
  }
  if (missing.length > 0 && state.should_apply_effects) {
    errors.push("should_apply_effects_true_with_missing_slots");
  }
  if (state.should_apply_effects && !state.effect_plan.allowed) {
    errors.push("should_apply_effects_true_without_allowed_effect_plan");
  }
  if (
    !state.should_apply_effects &&
    /\b(not[eé]|c['’]est not[eé]|j['’]ai not[eé])\b/i.test(
      cleanText(state.generated_user_message),
    )
  ) {
    errors.push("noted_language_without_committable_effect_plan");
  }
  if (!cleanText(state.generated_user_message)) {
    errors.push("generated_user_message_required");
  }
  return errors;
}

export async function runDailyActionReviewSkill(params: {
  text: string;
  targets: DailyActionReviewTarget[];
  previousState?: unknown;
  actionIntelligenceByOccurrenceId?: Record<
    string,
    DailyActionReviewActionIntelligence
  >;
  recentMessages?: Array<{ role: string; content: string }>;
  requestId?: string;
  userId?: string;
  llmRunner?: (input: {
    systemPrompt: string;
    userPrompt: string;
  }) => Promise<unknown>;
}): Promise<DailyActionReviewSkillResult> {
  const previousState = params.previousState
    ? stateFromUnknown(params.previousState, params.targets)
    : buildInitialDailyActionReviewState(params.targets, {
      actionIntelligenceByOccurrenceId: params.actionIntelligenceByOccurrenceId,
    });
  const systemPrompt = buildDailyActionReviewSkillSystemPrompt();
  const userPrompt = buildDailyActionReviewSkillUserPrompt({
    userMessage: params.text,
    targets: params.targets,
    previousState,
    recentMessages: params.recentMessages,
  });
  const runLlm = async (prompt: string) =>
    params.llmRunner
      ? await params.llmRunner({ systemPrompt, userPrompt: prompt })
      : await generateWithGemini(
        systemPrompt,
        prompt,
        0.1,
        true,
        [],
        "auto",
        {
          requestId: params.requestId,
          source: "daily_action_review_skill",
          model: "gemini-3-flash-preview",
          forceRealAi: true,
          userId: params.userId,
        },
      );
  let raw = await runLlm(userPrompt);
  let state = sanitizeDailyActionReviewStateFromAi({
    raw,
    previousState,
    targets: params.targets,
    userMessage: params.text,
  });
  const validationErrors = dailyActionReviewStateValidationErrors(state);
  if (validationErrors.length > 0) {
    raw = await runLlm(JSON.stringify({
      task: "correct_invalid_daily_action_review_json",
      validation_errors: validationErrors,
      instruction:
        "Corrige uniquement le JSON du skill. Si un slot manque encore, generated_user_message doit poser une question et ne doit pas annoncer d'application. Si le user a repondu a la question precedente, mets a jour le slot correspondant. Reponds uniquement en JSON valide.",
      previous_user_prompt: JSON.parse(userPrompt),
      invalid_structured_output: state,
    }));
    state = sanitizeDailyActionReviewStateFromAi({
      raw,
      previousState,
      targets: params.targets,
      userMessage: params.text,
    });
  }
  return resultFromState(state);
}

function asDailyFollowupIntent(
  value: unknown,
): DailyActionReviewFollowupIntent {
  const raw = cleanText(value);
  if (
    raw === "recap" ||
    raw === "explain_partial" ||
    raw === "continuation" ||
    raw === "already_resolved" ||
    raw === "correction"
  ) {
    return raw;
  }
  return "other";
}

function sanitizeDailyActionReviewFollowup(raw: unknown) {
  const parsed = parseJsonish(raw);
  const obj = parsed && typeof parsed === "object" ? parsed as any : {};
  const shouldHandle = obj.should_handle === true;
  const intent = asDailyFollowupIntent(obj.intent);
  const confidence = asConfidence(obj.confidence);
  const generatedUserMessage = cleanText(obj.generated_user_message) || null;
  const evidence = Array.isArray(obj.evidence)
    ? obj.evidence.map((item: unknown) => cleanText(item)).filter(Boolean)
      .slice(0, 5)
    : [];
  return {
    shouldHandle,
    intent,
    confidence,
    generatedUserMessage,
    evidence,
  };
}

export async function runDailyActionReviewFollowupSkill(params: {
  text: string;
  dailyContext: unknown;
  recentMessages?: Array<{ role: string; content: string }>;
  requestId?: string;
  userId?: string;
  llmRunner?: (input: {
    systemPrompt: string;
    userPrompt: string;
  }) => Promise<unknown>;
}): Promise<DailyActionReviewFollowupResult> {
  const systemPrompt = [
    "Tu es le sous-skill post_daily_action_review_v1 de Sophia.",
    "Ta mission est uniquement de répondre aux questions de suivi sur le daily qui vient d'être terminé.",
    "Tu reçois un contexte structuré fiable venant de la DB: actions déjà validées, action(s) vérifiée(s), entries daily, continuation créée, cartes dupliquées.",
    "",
    "Règles:",
    "- Si le user demande ce qui a été noté, ce que signifie fait en partie/partiellement fait, si une action déjà faite a été prise en compte, ou ce qui a été créé pour demain: should_handle=true.",
    "- Si le user pose une question produit générale sur le dashboard, les potions, les cartes, ou démarre un autre sujet sans lien avec ce daily: should_handle=false.",
    "- Si le user corrige le résultat du daily au lieu de demander une explication, intent=correction et explique brièvement qu'il faut une correction explicite; ne modifie rien toi-même.",
    "- Ne propose jamais potion, carte, rappel ou ajustement de plan.",
    "- Ne réponds jamais avec une fiche product_help.",
    "- Ne contredis jamais le contexte DB. Si une continuation existe, dis son titre exact et le jour prévu si demandé.",
    '- Dans les messages visibles, dis "partiellement fait" ou "fait en partie", jamais "partiel" seul.',
    '- Dans generated_user_message, quand tu parles de toi-même, utilise la première personne du singulier ("je", "me", "moi"), jamais "Sophia".',
    "- Réponse courte, naturelle, factuelle, en français, tutoiement.",
    "",
    "Schema de sortie strict:",
    JSON.stringify({
      should_handle: true,
      intent:
        "recap|explain_partial|continuation|already_resolved|correction|other",
      confidence: "low|medium|high",
      evidence: ["string"],
      generated_user_message: "string|null",
    }),
    "Réponds uniquement en JSON valide.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    user_message: params.text,
    daily_context: params.dailyContext,
    recent_messages: (params.recentMessages ?? []).slice(-8),
  });
  const raw = params.llmRunner
    ? await params.llmRunner({ systemPrompt, userPrompt })
    : await generateWithGemini(
      systemPrompt,
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: params.requestId,
        source: "daily_action_review_followup_skill",
        model: "gemini-3-flash-preview",
        forceRealAi: true,
        userId: params.userId,
      },
    );
  const parsed = sanitizeDailyActionReviewFollowup(raw);
  const canAnswer = parsed.shouldHandle &&
    parsed.intent !== "other" &&
    parsed.generatedUserMessage !== null &&
    parsed.confidence !== "low";
  return {
    shouldHandle: canAnswer,
    intent: parsed.intent,
    confidence: parsed.confidence,
    generatedUserMessage: canAnswer ? parsed.generatedUserMessage : null,
    evidence: parsed.evidence,
  };
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
