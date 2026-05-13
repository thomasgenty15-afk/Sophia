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

export type DailyActionReviewState = {
  source: typeof DAILY_ACTION_REVIEW_SOURCE;
  skill_id: typeof DAILY_ACTION_REVIEW_SOURCE;
  status: DailyActionSkillStatus;
  current_focus_occurrence_ids: string[];
  remaining_occurrence_ids: string[];
  asked_occurrence_ids_history: string[][];
  items: Record<string, DailyActionReviewItemState>;
  next_question: string | null;
  next_question_targets: string[];
  should_apply_effects: boolean;
  stop_reason: DailyActionStopReason;
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
  shouldApplyEffects: boolean;
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
  return "unknown";
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

export function buildInitialDailyActionReviewState(
  targets: DailyActionReviewTarget[],
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
    status: "collecting",
    current_focus_occurrence_ids: focusIds,
    remaining_occurrence_ids: remainingIds,
    asked_occurrence_ids_history: focusIds.length ? [focusIds] : [],
    items,
    next_question: null,
    next_question_targets: focusIds,
    should_apply_effects: false,
    stop_reason: null,
  };
}

function selectInitialDailyActionReviewFocus(
  targets: DailyActionReviewTarget[],
): {
  targets: DailyActionReviewTarget[];
  groupingReason: DailyActionReviewOpeningPlan["grouping_reason"];
} {
  if (targets.length <= 1) {
    return { targets: targets.slice(0, 1), groupingReason: "single_action" };
  }
  const sorted = [...targets].sort((a, b) =>
    actionTypeRank(actionTypeForTarget(a)) - actionTypeRank(actionTypeForTarget(b))
  );
  if (targets.length <= 2) {
    return { targets: sorted.slice(0, 2), groupingReason: "priority" };
  }

  const byPlan = new Map<string, DailyActionReviewTarget[]>();
  for (const target of sorted) {
    const key = cleanText(target.plan_id) || "unknown";
    byPlan.set(key, [...(byPlan.get(key) ?? []), target]);
  }
  const planGroup = [...byPlan.values()]
    .filter((group) => group.length >= 2)
    .sort((a, b) => b.length - a.length)[0];
  if (planGroup) {
    return {
      targets: planGroup.slice(0, 2),
      groupingReason: "same_plan",
    };
  }

  const byType = new Map<DailyActionType, DailyActionReviewTarget[]>();
  for (const target of sorted) {
    const key = actionTypeForTarget(target);
    byType.set(key, [...(byType.get(key) ?? []), target]);
  }
  const typeGroup = [...byType.values()]
    .filter((group) => group.length >= 2)
    .sort((a, b) => b.length - a.length)[0];
  if (typeGroup) {
    return {
      targets: typeGroup.slice(0, 2),
      groupingReason: "same_type",
    };
  }

  return { targets: sorted.slice(0, 2), groupingReason: "priority" };
}

export function dailyActionReviewFocusTargets(
  targets: DailyActionReviewTarget[],
  state: DailyActionReviewState,
): DailyActionReviewTarget[] {
  const ids = new Set(state.current_focus_occurrence_ids);
  const selected = targets.filter((target) => ids.has(target.occurrence_id));
  return selected.length ? selected : targets.slice(0, Math.min(2, targets.length));
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
      still_relevant: asStillRelevant(previous.still_relevant),
      evidence_text: cleanText(previous.evidence_text) || null,
      matched_user_text: cleanText(previous.matched_user_text) || null,
      confidence: asConfidence(previous.confidence),
      missing_slots: missingSlots.length ? missingSlots : deriveMissingSlots({
        outcome,
        reasonText: cleanText(previous.reason_text) || null,
        stillRelevant: asStillRelevant(previous.still_relevant),
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
  return {
    source: DAILY_ACTION_REVIEW_SOURCE,
    skill_id: DAILY_ACTION_REVIEW_SOURCE,
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
    should_apply_effects: Boolean(existing.should_apply_effects),
    stop_reason: asStopReason(existing.stop_reason),
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
  const cleaned = targets
    .map((target, index) => ({
      index: index + 1,
      title: cleanText(target.title) || "Action",
    }))
    .filter((target) => target.title);
  return [
    "Message WhatsApp de bilan daily action review.",
    "Objectif: demander au user, naturellement, ce qui s'est passe pour les actions ciblees par current_focus_occurrence_ids.",
    "Tu dois poser une seule question principale et laisser le user repondre librement.",
    "Ne propose pas de solution, carte, potion, ajustement de plan ou coaching dans ce premier message.",
    "Ne dis pas que tu vas automatiquement reporter; tu peux seulement ouvrir la porte a comprendre si une action non faite reste utile.",
    "Ne force pas les mots fait/pas fait/partiel; la reponse libre sera analysee ensuite.",
    options.allowGreeting
      ? "Comme aucune conversation recente n'a eu lieu, commence par une salutation courte et naturelle, variee, avant la question."
      : "Comme une conversation recente existe deja, ne commence pas par une salutation.",
    "Mentionne explicitement chaque action ciblee, mais sans format questionnaire lourd.",
    "Si une seule action est ciblee, fais une phrase directe et humaine.",
    "Si deux actions sont ciblees, cite les deux titres ou deux formulations sans ambiguite qui permettent de reconnaitre chaque action.",
    "Si plusieurs actions sont ciblees, regroupe proprement et invite a repondre en une seule phrase.",
    "Ne mentionne aucune action qui n'est pas dans current_focus_occurrence_ids.",
    `Nombre d'actions ciblees: ${cleaned.length}.`,
    cleaned.length > 1
      ? `Actions a couvrir dans la question: ${
        cleaned.map((target) => `"${target.title}"`).join(" ; ")
      }.`
      : "",
  ].join("\n");
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
}): DailyActionReviewOpeningPlan {
  const initial = buildInitialDailyActionReviewState(params.targets);
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
    "- Pose au maximum une question courte, sur maximum deux actions.",
    "- S'il y a encore des actions non demandees, choisis le prochain groupe coherent: meme plan d'abord, puis habitudes, missions, clarifications.",
    "- Si 4 actions viennent de 2 plans avec 2 actions par plan, traite les 2 actions du meme plan ensemble.",
    "- Si le user refuse ou dit qu'il ne veut pas en parler, status=stopped et stop_reason=user_stopped.",
    "",
    "Schema de sortie strict:",
    JSON.stringify({
      status: "collecting|needs_clarification|complete|stopped",
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
      should_apply_effects: false,
      stop_reason:
        "all_required_slots_filled|user_stopped|safety|unclear_after_retries|null",
    }),
    "",
    "Regles de completion:",
    "- Une action completed est suffisante avec outcome et evidence_text.",
    "- Une action partial/missed est suffisante avec outcome + reason_text si le user l'a donne; si la raison manque, pose une question courte.",
    "- Pour missed, still_relevant=true/false/unknown. Ne force pas si le user ne le dit pas.",
    "- Si outcome=missed et still_relevant=unknown, garde missing_slots avec still_relevant et pose une question courte de confirmation avant tout report.",
    "- should_apply_effects=true seulement quand toutes les actions ont outcome completed/partial/missed, ou quand status=stopped.",
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
    const stillRelevant = candidate.still_relevant === undefined
      ? previousItem.still_relevant
      : asStillRelevant(candidate.still_relevant);
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
  const shouldApplyEffects = stopped
    ? true
    : Boolean(raw.should_apply_effects) && allApplied && !hasMissingSlots;
  if (allApplied && !hasMissingSlots && !nextQuestion) status = "complete";
  if (hasMissingSlots && status === "complete") status = "needs_clarification";
  if (!allApplied && status === "complete") status = "needs_clarification";
  return {
    source: DAILY_ACTION_REVIEW_SOURCE,
    skill_id: DAILY_ACTION_REVIEW_SOURCE,
    status,
    current_focus_occurrence_ids: currentFocus,
    remaining_occurrence_ids: remaining.filter((id) =>
      !isAppliedDailyOutcome(items[id]?.outcome)
    ),
    asked_occurrence_ids_history: history,
    items,
    next_question: nextQuestion,
    next_question_targets: nextQuestionTargets,
    should_apply_effects: shouldApplyEffects,
    stop_reason: stopped
      ? asStopReason(raw.stop_reason) ?? "user_stopped"
      : allApplied
      ? "all_required_slots_filled"
      : asStopReason(raw.stop_reason),
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

function resultFromState(state: DailyActionReviewState): DailyActionReviewSkillResult {
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
    shouldApplyEffects: state.should_apply_effects,
  };
}

export async function runDailyActionReviewSkill(params: {
  text: string;
  targets: DailyActionReviewTarget[];
  previousState?: unknown;
  recentMessages?: Array<{ role: string; content: string }>;
  requestId?: string;
  userId?: string;
  llmRunner?: (input: {
    systemPrompt: string;
    userPrompt: string;
  }) => Promise<unknown>;
}): Promise<DailyActionReviewSkillResult> {
  const previousState = stateFromUnknown(params.previousState, params.targets);
  const systemPrompt = buildDailyActionReviewSkillSystemPrompt();
  const userPrompt = buildDailyActionReviewSkillUserPrompt({
    userMessage: params.text,
    targets: params.targets,
    previousState,
    recentMessages: params.recentMessages,
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
        source: "daily_action_review_skill",
        model: "gemini-3-flash-preview",
        forceRealAi: true,
        userId: params.userId,
      },
    );
  const state = sanitizeDailyActionReviewStateFromAi({
    raw,
    previousState,
    targets: params.targets,
    userMessage: params.text,
  });
  return resultFromState(state);
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
