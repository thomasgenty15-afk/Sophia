import type {
  DailyReviewBlockedEffect,
  DailyReviewDecision,
  DailyReviewEffectPlan,
  DailyReviewReducerReasonCode,
  DailyReviewStateMutationAudit,
} from "./contract.ts";
import { buildDailyReviewEffectPlan } from "./effects.ts";

type ReducerTarget = {
  occurrence_id: string;
  plan_item_id: string;
  plan_id?: string | null;
  plan_label?: string | null;
  title?: string | null;
  kind?: string | null;
  dimension?: string | null;
};

type ReducerState = {
  status: "collecting" | "needs_clarification" | "complete" | "stopped";
  stop_reason:
    | "all_required_slots_filled"
    | "user_stopped"
    | "safety"
    | "unclear_after_retries"
    | null;
  items: Record<string, any>;
  should_apply_effects: boolean;
  effect_plan?: DailyReviewEffectPlan;
  current_focus_occurrence_ids?: string[];
  remaining_occurrence_ids?: string[];
  asked_occurrence_ids_history?: string[][];
  next_question?: string | null;
  next_question_targets?: string[];
  generated_user_message?: string | null;
  state_mutation_audit?: DailyReviewStateMutationAudit;
  blocked_effects?: DailyReviewBlockedEffect[];
};

const DAILY_SERVER_OWNED_FIELDS = [
  "status",
  "stop_reason",
  "current_focus_occurrence_ids",
  "remaining_occurrence_ids",
  "asked_occurrence_ids_history",
  "next_question",
  "next_question_targets",
  "generated_user_message",
  "should_apply_effects",
  "effect_plan",
  "action_intelligence_by_occurrence_id",
  "last_user_text",
  "last_note_information",
  "last_local_exit_memo",
] as const;

function uniqueStrings(values: unknown[]): string[] {
  return [
    ...new Set(
      values.map((value) => String(value ?? "").trim()).filter(
        Boolean,
      ),
    ),
  ];
}

function pushUnique(target: string[], field: string) {
  if (!target.includes(field)) target.push(field);
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function validConfidence(value: unknown): "high" | "medium" | "low" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function validStillRelevant(value: unknown): boolean | "unknown" {
  return value === true || value === false ? value : "unknown";
}

function validOutcome(value: unknown): string | null {
  return value === "completed" || value === "partial" ||
      value === "missed" || value === "unclear"
    ? value
    : null;
}

function stringOrNull(value: unknown): string | null {
  const text = cleanText(value);
  return text || null;
}

function normalizeForReasonInference(value: unknown): string {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function normalizeForTargetMatching(value: unknown): string {
  return normalizeForReasonInference(value).replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textForUpdateScope(update: Record<string, unknown>): string {
  return normalizeForTargetMatching([
    update.evidence_text,
    update.matched_user_text,
    update.reason_text,
  ].map(cleanText).filter(Boolean).join(" "));
}

function textHasGlobalTargetCoverage(value: string): boolean {
  return /\b(tous|toutes|les deux|les 2|les trois|les 3|les quatre|les 4|les dernieres|les derniers|les restantes|les restants|les autres|toutes les actions|tous les items|les actions restantes|les deux dernieres|les deux derniers|same for both|both|all of them)\b/
    .test(value);
}

const TARGET_MATCH_STOPWORDS = new Set([
  "faire",
  "preparer",
  "prendre",
  "mettre",
  "tenir",
  "une",
  "des",
  "les",
  "deux",
  "cinq",
  "minutes",
  "action",
  "actions",
  "journee",
  "aujourd",
  "hui",
]);

function targetTitleMentionedInUpdate(
  target: ReducerTarget | undefined,
  updateText: string,
): boolean {
  const title = normalizeForTargetMatching(target?.title);
  if (!title || !updateText) return false;
  if (updateText.includes(title)) return true;
  const tokens = title.split(" ")
    .filter((token) => token.length >= 4 && !TARGET_MATCH_STOPWORDS.has(token));
  if (tokens.length === 0) return false;
  const matches = tokens.filter((token) => updateText.includes(token)).length;
  return tokens.length === 1 ? matches === 1 : matches >= 2;
}

function inferReasonCategoryFromText(value: unknown): string | null {
  const text = normalizeForReasonInference(value);
  if (!text) return null;
  if (
    /\b(fatigue|fatiguee|fatiguer|epuise|epuisee|epuisement|creve|crevee|hs|plus d'?energie|sans energie)\b/
      .test(text)
  ) return "fatigue";
  if (
    /\b(oublie|oubliee|oubli|pas pense|pas pensee|sorti de la tete|zappe|zappee)\b/
      .test(text)
  ) return "forgot";
  if (
    /\b(imprevu|urgence|reunion|rendez[- ]?vous|rdv|bloque au travail|quelqu'un est passe|pas eu le temps|manque de temps)\b/
      .test(text)
  ) return "external";
  if (
    /\b(trop dur|trop dure|trop difficile|trop complique|trop compliquee|trop lourd|trop lourde|impossible)\b/
      .test(text)
  ) return "too_hard";
  if (
    /\b(plus pertinent|pas pertinent|inutile|plus utile|pas utile|plus besoin|pas besoin)\b/
      .test(text)
  ) return "not_relevant";
  if (
    /\b(stress|angoisse|anxiete|anxieuse|triste|honte|peur|panique|submerge|submergee)\b/
      .test(text)
  ) return "emotional";
  if (
    /\b(craqu\w*|rechut\w*|envie trop forte|tentation trop forte|pulsion|automatique|fume|fumer|joint)\b/
      .test(text)
  ) return "emotional";
  return null;
}

function repairItemForTarget<TTarget extends ReducerTarget>(
  item: unknown,
  target: TTarget,
  audit: DailyReviewStateMutationAudit,
): Record<string, unknown> {
  const raw = item && typeof item === "object" && !Array.isArray(item)
    ? item as Record<string, unknown>
    : {};
  const rawReasonCategory = stringOrNull(raw.reason_category);
  const rawReasonText = stringOrNull(raw.reason_text);
  const inferredReasonCategory =
    !rawReasonCategory || rawReasonCategory === "unclear"
      ? inferReasonCategoryFromText(rawReasonText)
      : null;
  const repaired: Record<string, unknown> = {
    ...raw,
    occurrence_id: cleanText(raw.occurrence_id) || target.occurrence_id,
    plan_item_id: cleanText(raw.plan_item_id) || target.plan_item_id,
    plan_id: cleanText(raw.plan_id) || cleanText(target.plan_id) || null,
    plan_label: cleanText(raw.plan_label) || cleanText(target.plan_label) ||
      null,
    title: cleanText(raw.title) || cleanText(target.title) || null,
    action_type: cleanText(raw.action_type) || cleanText(target.kind) ||
      cleanText(target.dimension) || "unknown",
    outcome: validOutcome(raw.outcome),
    reason_category: inferredReasonCategory ?? rawReasonCategory,
    reason_text: rawReasonText,
    still_relevant: validStillRelevant(raw.still_relevant),
    evidence_text: stringOrNull(raw.evidence_text),
    matched_user_text: stringOrNull(raw.matched_user_text),
    confidence: validConfidence(raw.confidence),
    missing_slots: [],
  };
  repaired.missing_slots = deriveCanonicalMissingSlots(repaired);
  for (
    const field of [
      "occurrence_id",
      "plan_item_id",
      "plan_id",
      "plan_label",
      "title",
      "action_type",
      "outcome",
      "reason_category",
      "reason_text",
      "still_relevant",
      "evidence_text",
      "matched_user_text",
      "confidence",
      "missing_slots",
    ]
  ) {
    const before = JSON.stringify(raw[field] ?? null);
    const after = JSON.stringify(repaired[field] ?? null);
    if (before !== after) {
      pushUnique(
        audit.restored_fields,
        `items.${target.occurrence_id}.${field}`,
      );
    }
  }
  return repaired;
}

function repairCanonicalItems<
  TState extends ReducerState,
  TTarget extends ReducerTarget,
>(params: {
  state: TState;
  targets: TTarget[];
  audit: DailyReviewStateMutationAudit;
}): TState {
  const raw = (params.state && typeof params.state === "object")
    ? params.state as Record<string, unknown>
    : {};
  const next = { ...(params.state as any) } as TState;

  const repairedItems: Record<string, unknown> = {};
  const rawItems = raw.items && typeof raw.items === "object" &&
      !Array.isArray(raw.items)
    ? raw.items as Record<string, unknown>
    : {};
  if (raw.items !== rawItems) pushUnique(params.audit.restored_fields, "items");
  for (const target of params.targets) {
    const existing = rawItems[target.occurrence_id];
    if (!existing) {
      pushUnique(params.audit.restored_fields, `items.${target.occurrence_id}`);
    }
    repairedItems[target.occurrence_id] = repairItemForTarget(
      existing,
      target,
      params.audit,
    );
  }
  next.items = repairedItems as TState["items"];
  return next;
}

function createStateMutationAudit(
  decision: DailyReviewDecision,
): DailyReviewStateMutationAudit {
  return {
    server_owned_fields: [...DAILY_SERVER_OWNED_FIELDS],
    modified_fields_declared: uniqueStrings(
      decision.state_change_intent?.modified_fields ?? [],
    ),
    clear_fields_declared: uniqueStrings(
      decision.state_change_intent?.clear_fields ?? [],
    ),
    applied_fields: [],
    preserved_fields: [],
    restored_fields: [],
    cleared_fields: [],
    rejected_changes: [],
  };
}

function rejectChange(
  audit: DailyReviewStateMutationAudit,
  blocked: DailyReviewBlockedEffect[],
  field: string,
  reason_code: DailyReviewReducerReasonCode,
) {
  pushUnique(audit.restored_fields, field);
  audit.rejected_changes.push({ field, reason_code });
  blocked.push({
    type: "daily_action_review_state_mutation",
    field,
    reason_code,
  });
}

function fieldIsServerOwned(field: string): boolean {
  return (DAILY_SERVER_OWNED_FIELDS as readonly string[]).includes(field);
}

function arraysEqual(a: unknown[] | undefined, b: unknown[] | undefined) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  return left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function isAppliedOutcome(value: unknown): boolean {
  return value === "completed" || value === "partial" || value === "missed";
}

function hasUsefulReason(item: Record<string, unknown>): boolean {
  if (cleanText(item.reason_text)) return true;
  const category = cleanText(item.reason_category);
  return Boolean(category && category !== "none" && category !== "unclear");
}

function deriveCanonicalMissingSlots(
  item: Record<string, unknown>,
): string[] {
  const slots: string[] = [];
  if (!isAppliedOutcome(item.outcome)) {
    slots.push("outcome");
    return slots;
  }
  if (
    (item.outcome === "missed" || item.outcome === "partial") &&
    !hasUsefulReason(item)
  ) {
    slots.push("reason");
  }
  if (item.outcome === "missed" && item.still_relevant === "unknown") {
    slots.push("still_relevant");
  }
  return slots;
}

function hasUsableEvidence(item: Record<string, unknown> | undefined): boolean {
  return Boolean(cleanText(item?.evidence_text));
}

function hasUsableConfidence(
  item: Record<string, unknown> | undefined,
): boolean {
  return item?.confidence === "high" || item?.confidence === "medium";
}

function itemReadyForDailyCommit(
  item: Record<string, unknown> | undefined,
): boolean {
  return Boolean(
    item &&
      isAppliedOutcome(item.outcome) &&
      Array.isArray(item.missing_slots) &&
      item.missing_slots.length === 0 &&
      hasUsableConfidence(item) &&
      hasUsableEvidence(item),
  );
}

function itemHasMissingSlots(
  item: Record<string, unknown> | undefined,
): boolean {
  return !itemReadyForDailyCommit(item);
}

function normalizeAskedSlots(item: Record<string, unknown>): string[] {
  return deriveCanonicalMissingSlots(item);
}

function mergeItemUpdate(
  existing: Record<string, unknown>,
  update: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...existing };
  if (validOutcome(update.outcome)) {
    merged.outcome = update.outcome;
  }
  const reasonCategory = stringOrNull(update.reason_category);
  if (reasonCategory) merged.reason_category = reasonCategory;
  const reasonText = stringOrNull(update.reason_text);
  if (reasonText) merged.reason_text = reasonText;
  if (update.still_relevant === true || update.still_relevant === false) {
    merged.still_relevant = update.still_relevant;
  }
  const evidenceText = stringOrNull(update.evidence_text);
  const updateCarriesNewOutcome = validOutcome(update.outcome) &&
    !validOutcome(existing.outcome);
  const updateCarriesOutcomeOrReason = updateCarriesNewOutcome ||
    reasonText || reasonCategory;
  if (
    evidenceText &&
    (!stringOrNull(existing.evidence_text) || updateCarriesOutcomeOrReason)
  ) {
    merged.evidence_text = evidenceText;
  }
  const matchedUserText = stringOrNull(update.matched_user_text);
  if (
    matchedUserText &&
    (!stringOrNull(existing.matched_user_text) || updateCarriesOutcomeOrReason)
  ) {
    merged.matched_user_text = matchedUserText;
  }
  if (hasUsableConfidence(update)) {
    merged.confidence = update.confidence;
  }
  if (Array.isArray(update.missing_slots)) {
    merged.missing_slots = update.missing_slots;
  }
  return merged;
}

function itemUpdateAllowedForCurrentTurn<TState extends ReducerState>(params: {
  previous: TState;
  decision: DailyReviewDecision;
  targetsById: Map<string, ReducerTarget>;
  occurrenceId: string;
  update: Record<string, unknown>;
}): boolean {
  const target = params.targetsById.get(params.occurrenceId);
  const targetIds = new Set(params.targetsById.keys());
  const stageTargetIds = uniqueStrings(
    (params.previous.next_question_targets?.length
      ? params.previous.next_question_targets
      : params.previous.current_focus_occurrence_ids) ?? [],
  ).filter((id) => targetIds.has(id));
  const selectedTargetIds = uniqueStrings(params.decision.target_occurrence_ids)
    .filter((id) => targetIds.has(id));
  const updateText = textForUpdateScope(params.update);
  const titleMentioned = targetTitleMentionedInUpdate(target, updateText);
  const globalCoverage = textHasGlobalTargetCoverage(updateText);
  const selected = selectedTargetIds.includes(params.occurrenceId);
  const inStage = stageTargetIds.includes(params.occurrenceId);

  if (params.decision.intent === "correction" && selected) return true;
  if (titleMentioned) return true;
  if (globalCoverage && selected) return true;
  if (selectedTargetIds.length === 1 && selected) return true;
  if (stageTargetIds.length === 1 && inStage) return true;
  if (stageTargetIds.length > 1 && inStage && selectedTargetIds.length <= 1) {
    return true;
  }
  return false;
}

function focusTargetsToPreserve<
  TState extends ReducerState,
>(params: {
  previous: TState;
  selectedTargetIds: string[];
  targetIds: Set<string>;
}): string[] {
  const currentFocus = uniqueStrings(
    params.previous.current_focus_occurrence_ids ?? [],
  ).filter((id) => params.targetIds.has(id));
  const currentFocusHasOpenItems = currentFocus.some((id) =>
    itemHasMissingSlots(params.previous.items[id])
  );
  if (currentFocus.length > 0 && currentFocusHasOpenItems) {
    return currentFocus;
  }
  return params.selectedTargetIds;
}

function setAskedHistoryForFocus<TState extends ReducerState>(params: {
  state: TState;
  focusIds: string[];
  audit: DailyReviewStateMutationAudit;
}) {
  const history = Array.isArray(params.state.asked_occurrence_ids_history)
    ? [...params.state.asked_occurrence_ids_history]
    : [];
  const alreadyAsked = history.some((group) =>
    Array.isArray(group) && arraysEqual(group, params.focusIds)
  );
  if (!alreadyAsked) {
    params.state.asked_occurrence_ids_history = [
      ...history,
      params.focusIds,
    ];
    pushUnique(params.audit.applied_fields, "asked_occurrence_ids_history");
  } else {
    pushUnique(params.audit.preserved_fields, "asked_occurrence_ids_history");
  }
}

function refreshQuestionTargetsInsideCurrentFocus<TState extends ReducerState>(
  params: {
    state: TState;
    selectedTargetIds: string[];
    audit: DailyReviewStateMutationAudit;
  },
) {
  const currentFocus = uniqueStrings(
    params.state.current_focus_occurrence_ids ?? [],
  );
  if (currentFocus.length === 0) return;
  const unresolvedInFocus = currentFocus.filter((id) =>
    itemHasMissingSlots(params.state.items[id])
  );
  if (unresolvedInFocus.length === 0) return;

  const selectedStillOpen = params.selectedTargetIds.filter((id) =>
    unresolvedInFocus.includes(id)
  );
  const nextTargets = selectedStillOpen.length
    ? selectedStillOpen
    : [unresolvedInFocus[0]];
  if (!arraysEqual(params.state.next_question_targets, nextTargets)) {
    params.state.next_question_targets = nextTargets;
    pushUnique(params.audit.applied_fields, "next_question_targets");
  } else {
    pushUnique(params.audit.preserved_fields, "next_question_targets");
  }
  params.state.next_question = null;
  params.state.generated_user_message = null;
  params.state.status = "needs_clarification";
  pushUnique(params.audit.cleared_fields, "next_question");
  pushUnique(params.audit.cleared_fields, "generated_user_message");
  pushUnique(params.audit.applied_fields, "status");
}

function advanceRemainingQueueIfCurrentBatchReady<
  TState extends ReducerState,
  TTarget extends ReducerTarget,
>(params: {
  state: TState;
  targets: TTarget[];
  audit: DailyReviewStateMutationAudit;
}) {
  const currentFocus = uniqueStrings(
    params.state.current_focus_occurrence_ids ?? [],
  );
  if (currentFocus.length === 0) return;
  const currentFocusReady = currentFocus.every((id) =>
    itemReadyForDailyCommit(params.state.items[id])
  );
  if (!currentFocusReady) return;

  const targetIds = new Set(
    params.targets.map((target) => target.occurrence_id),
  );
  const remaining = uniqueStrings(params.state.remaining_occurrence_ids ?? [])
    .filter((id) => targetIds.has(id))
    .filter((id) => !itemReadyForDailyCommit(params.state.items[id]));
  if (remaining.length === 0) return;

  const nextBatch = remaining.slice(0, 2);
  const nextBatchSet = new Set(nextBatch);
  params.state.current_focus_occurrence_ids = nextBatch;
  pushUnique(params.audit.applied_fields, "current_focus_occurrence_ids");

  params.state.remaining_occurrence_ids = remaining.filter((id) =>
    !nextBatchSet.has(id)
  );
  pushUnique(params.audit.applied_fields, "remaining_occurrence_ids");

  const history = Array.isArray(params.state.asked_occurrence_ids_history)
    ? [...params.state.asked_occurrence_ids_history]
    : [];
  const alreadyAsked = history.some((group) =>
    Array.isArray(group) && arraysEqual(group, nextBatch)
  );
  params.state.asked_occurrence_ids_history = alreadyAsked
    ? history
    : [...history, nextBatch];
  pushUnique(params.audit.applied_fields, "asked_occurrence_ids_history");

  for (const occurrenceId of nextBatch) {
    const item = params.state.items[occurrenceId];
    if (item && typeof item === "object") {
      item.missing_slots = normalizeAskedSlots(item);
      pushUnique(
        params.audit.applied_fields,
        `items.${occurrenceId}.missing_slots`,
      );
    }
  }

  params.state.next_question = null;
  params.state.generated_user_message = null;
  params.state.next_question_targets = nextBatch;
  params.state.status = "needs_clarification";
  pushUnique(params.audit.applied_fields, "next_question_targets");
  pushUnique(params.audit.cleared_fields, "next_question");
  pushUnique(params.audit.cleared_fields, "generated_user_message");
  pushUnique(params.audit.applied_fields, "status");
}

function validStatusFromDecision<TState extends ReducerState>(
  previous: TState,
  decision: DailyReviewDecision,
  audit: DailyReviewStateMutationAudit,
  blocked: DailyReviewBlockedEffect[],
): TState["status"] {
  if (previous.status === "complete" || previous.status === "stopped") {
    if (decision.status !== previous.status) {
      rejectChange(audit, blocked, "status", "invalid_status_transition");
    } else {
      pushUnique(audit.preserved_fields, "status");
    }
    return previous.status;
  }
  if (decision.status === "opening" || decision.status === "blocked") {
    rejectChange(audit, blocked, "status", "invalid_status_transition");
    return previous.status;
  }
  if (decision.status === "complete") {
    return previous.status;
  }
  if (decision.status === "stopped") return "stopped";
  return decision.status;
}

function stopReasonFromDecision<TState extends ReducerState>(
  previous: TState,
  decision: DailyReviewDecision,
  status: TState["status"],
  audit: DailyReviewStateMutationAudit,
  blocked: DailyReviewBlockedEffect[],
): TState["stop_reason"] {
  if (previous.status === "complete" || previous.status === "stopped") {
    if (decision.stop_reason !== previous.stop_reason) {
      rejectChange(audit, blocked, "stop_reason", "invalid_status_transition");
    } else {
      pushUnique(audit.preserved_fields, "stop_reason");
    }
    return previous.stop_reason;
  }
  if (status === "stopped") return decision.stop_reason ?? "user_stopped";
  return null;
}

export function mergeDailyActionReviewLocalState<
  TState extends ReducerState,
  TTarget extends ReducerTarget,
>(args: {
  previous: TState;
  decision: DailyReviewDecision;
  targets: TTarget[];
  now?: string;
}): {
  state: TState;
  state_mutation_audit: DailyReviewStateMutationAudit;
  blocked_effects: DailyReviewBlockedEffect[];
} {
  const { previous, decision, targets } = args;
  const targetIds = new Set(targets.map((target) => target.occurrence_id));
  const targetsById = new Map(
    targets.map((target) => [target.occurrence_id, target as ReducerTarget]),
  );
  const audit = createStateMutationAudit(decision);
  const blocked: DailyReviewBlockedEffect[] = [];
  const repairedPrevious = repairCanonicalItems({
    state: previous,
    targets,
    audit,
  });
  const status = validStatusFromDecision(
    repairedPrevious,
    decision,
    audit,
    blocked,
  );
  const next: TState = {
    ...repairedPrevious,
    status,
    stop_reason: stopReasonFromDecision(
      repairedPrevious,
      decision,
      status,
      audit,
      blocked,
    ),
    items: { ...repairedPrevious.items },
    should_apply_effects: false,
    effect_plan: { allowed: false, effects: [] },
    blocked_effects: [],
  };

  for (const field of audit.modified_fields_declared) {
    if (fieldIsServerOwned(field)) {
      rejectChange(audit, blocked, field, "blocked_by_constraint");
    }
  }
  for (const field of audit.clear_fields_declared) {
    if (fieldIsServerOwned(field)) {
      rejectChange(audit, blocked, field, "blocked_by_constraint");
    }
  }

  const selectedTargetIds = uniqueStrings(decision.target_occurrence_ids)
    .filter((id) => targetIds.has(id));
  if (selectedTargetIds.length > 0) {
    const focusIds = focusTargetsToPreserve({
      previous: repairedPrevious,
      selectedTargetIds,
      targetIds,
    });
    if (!arraysEqual(next.current_focus_occurrence_ids, focusIds)) {
      next.current_focus_occurrence_ids = focusIds;
      pushUnique(audit.applied_fields, "current_focus_occurrence_ids");
    } else {
      pushUnique(audit.preserved_fields, "current_focus_occurrence_ids");
    }
    setAskedHistoryForFocus({ state: next, focusIds, audit });
  } else {
    rejectChange(
      audit,
      blocked,
      "current_focus_occurrence_ids",
      "selected_option_missing",
    );
  }

  for (const [occurrenceId, update] of Object.entries(decision.item_updates)) {
    if (!targetIds.has(occurrenceId)) {
      rejectChange(
        audit,
        blocked,
        `items.${occurrenceId}`,
        "candidate_missing",
      );
      continue;
    }
    const mode = decision.item_update_modes?.[occurrenceId] ?? "set";
    if (mode === "none") {
      pushUnique(audit.preserved_fields, `items.${occurrenceId}`);
      continue;
    }
    if (mode === "clear" && decision.intent !== "correction") {
      rejectChange(
        audit,
        blocked,
        `items.${occurrenceId}`,
        "blocked_by_constraint",
      );
      continue;
    }
    if (
      !itemUpdateAllowedForCurrentTurn({
        previous: repairedPrevious,
        decision,
        targetsById,
        occurrenceId,
        update,
      })
    ) {
      rejectChange(
        audit,
        blocked,
        `items.${occurrenceId}`,
        "selected_option_missing",
      );
      continue;
    }
    next.items[occurrenceId] = mode === "clear" ? update : mergeItemUpdate(
      next.items[occurrenceId] ?? {},
      update,
    );
    pushUnique(audit.applied_fields, `items.${occurrenceId}`);
    if (mode === "clear") {
      pushUnique(audit.cleared_fields, `items.${occurrenceId}`);
    }
  }

  const repairedBeforeEffects = repairCanonicalItems({
    state: next,
    targets,
    audit,
  });

  const effectPlan = buildDailyReviewEffectPlan(repairedBeforeEffects, targets);
  Object.assign(next, repairedBeforeEffects);
  next.effect_plan = effectPlan;
  pushUnique(audit.applied_fields, "effect_plan");
  next.should_apply_effects = effectPlan.allowed;
  pushUnique(audit.applied_fields, "should_apply_effects");
  if (effectPlan.allowed) {
    next.status = "complete";
    next.stop_reason = "all_required_slots_filled";
    pushUnique(audit.applied_fields, "status");
    pushUnique(audit.applied_fields, "stop_reason");
  } else if (decision.status === "complete" || decision.should_apply_effects) {
    blocked.push({
      type: "daily_action_review_commit",
      reason_code: "not_stabilized_enough",
    });
    audit.rejected_changes.push({
      field: "effect_plan",
      reason_code: "not_stabilized_enough",
    });
    pushUnique(audit.restored_fields, "effect_plan");
  }

  if (!effectPlan.allowed && next.status !== "stopped") {
    refreshQuestionTargetsInsideCurrentFocus({
      state: next,
      selectedTargetIds,
      audit,
    });
    advanceRemainingQueueIfCurrentBatchReady({
      state: next,
      targets,
      audit,
    });
  }

  if (blocked.length === 0) {
    pushUnique(audit.preserved_fields, "remaining_occurrence_ids");
  }
  next.blocked_effects = blocked;
  next.state_mutation_audit = audit;
  return {
    state: next,
    state_mutation_audit: audit,
    blocked_effects: blocked,
  };
}

export function reduceDailyReviewState<
  TState extends ReducerState,
  TTarget extends ReducerTarget,
>(
  previousState: TState,
  decision: DailyReviewDecision,
  targets: TTarget[],
): TState {
  return mergeDailyActionReviewLocalState({
    previous: previousState,
    decision,
    targets,
  }).state;
}
