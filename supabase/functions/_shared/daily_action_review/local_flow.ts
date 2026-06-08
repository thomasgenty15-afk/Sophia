import { generateWithGemini } from "../gemini.ts";
import {
  DAILY_ACTION_REVIEW_SOURCE,
  dailyActionReviewFocusTargets,
  type DailyActionMissingSlot,
  type DailyActionReviewActionIntelligence,
  type DailyActionReviewSkillResult,
  type DailyActionReviewState,
  type DailyActionReviewTarget,
  isAppliedDailyOutcome,
  stateFromUnknown,
} from "../daily_action_review.ts";
import type {
  DailyReviewDecision,
  DailyReviewEffectsResult,
  DailyReviewIntent,
  DailyReviewItemUpdate,
  DailyReviewMissingSlot,
  DailyReviewStatus,
} from "./contract.ts";
import { DAILY_REVIEW_DEFAULT_CONSTRAINTS } from "./contract.ts";
import { reduceDailyReviewState } from "./reducer.ts";

export type DailyActionReviewLocalFlowAction =
  | "answer_review"
  | "clarify_which_action"
  | "clarify_outcome"
  | "clarify_completion_level"
  | "clarify_reason"
  | "clarify_still_relevant"
  | "correction"
  | "recap_daily_state"
  | "repeat_current_question"
  | "user_stopped"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type DailyActionReviewVisibleTaskKind =
  | "clarify_which_action"
  | "clarify_outcome"
  | "clarify_completion_level"
  | "clarify_reason"
  | "clarify_still_relevant"
  | "recap_daily_state"
  | "repeat_question"
  | "stop_close"
  | "commit_success"
  | "commit_failed"
  | "exit_or_cancel"
  | "safety";

export type DailyActionReviewExitMemo = {
  needed: boolean;
  reason:
    | "topic_change"
    | "explicit_tool_request"
    | "product_help"
    | "status_question"
    | "preference_update"
    | "normal_coaching"
    | "safety"
    | "unknown"
    | "none";
  user_intent_summary: string | null;
  local_flow_context: {
    skill_id: "daily_action_review_v1";
    targets: unknown[];
    current_daily_state: string | null;
    collected_updates_summary: string | null;
    missing_slots: string[];
    committed_effects: unknown[];
  };
  handoff_hint_for_global_dispatcher: {
    likely_intent:
      | "prepare_attack_card"
      | "prepare_defense_card"
      | "select_state_potion"
      | "update_coach_preferences"
      | "status_recap"
      | "product_help"
      | "normal_coaching"
      | "unknown";
    why: string | null;
    constraints: string[];
  };
};

export type DailyActionReviewLocalDispatcherOutput = {
  flow_action: DailyActionReviewLocalFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  target_resolution: {
    resolved_occurrence_ids: string[];
    ambiguous: boolean;
    why: string;
  };
  item_updates: Record<string, {
    update_mode: "set" | "revise" | "clear" | "none";
    outcome: "completed" | "partial" | "missed" | "unclear" | null;
    reason_category:
      | "fatigue"
      | "forgot"
      | "external"
      | "too_hard"
      | "not_relevant"
      | "emotional"
      | "no_need"
      | "other"
      | "unclear"
      | "none"
      | null;
    reason_text: string | null;
    still_relevant: boolean | "unknown";
    evidence_text: string | null;
    matched_user_text: string | null;
    confidence: "high" | "medium" | "low";
    missing_slots: DailyReviewMissingSlot[];
  }>;
  daily_intent: {
    kind:
      | "daily_answer"
      | "daily_clarification"
      | "daily_correction"
      | "daily_recap"
      | "stop"
      | "off_topic"
      | "explicit_tool_request"
      | "safety"
      | "unclear";
    summary: string;
  };
  state_updates: {
    status_hint:
      | "collecting"
      | "needs_clarification"
      | "complete"
      | "stopped"
      | "blocked";
    turn_count_increment: number;
    close_after_visible: boolean;
  };
  visible_task: {
    kind: DailyActionReviewVisibleTaskKind;
    instruction: string;
  };
  exit_memo: DailyActionReviewExitMemo;
  evidence: string[];
};

export type DailyActionReviewLocalFlowResult = DailyActionReviewSkillResult & {
  dispatcherOutput: DailyActionReviewLocalDispatcherOutput;
  exitToGlobalDispatcher: boolean;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  let cleaned = cleanText(raw);
  if (cleaned.startsWith("```")) {
    const firstLineEnd = cleaned.indexOf("\n");
    cleaned = firstLineEnd >= 0 ? cleaned.slice(firstLineEnd + 1) : "";
  }
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("daily_action_review_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("daily_action_review_local_dispatcher_not_object");
  }
  return parsed as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean)
    : [];
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "low" || value === "medium"
    ? value
    : "medium";
}

function boundedRiskScore(value: unknown): number {
  const score = Number(value ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
}

function nullableString(value: unknown): string | null {
  const text = cleanText(value);
  return text && text !== "null" ? text : null;
}

function flowAction(value: unknown): DailyActionReviewLocalFlowAction {
  const raw = cleanText(value);
  return [
      "answer_review",
      "clarify_which_action",
      "clarify_outcome",
      "clarify_completion_level",
      "clarify_reason",
      "clarify_still_relevant",
      "correction",
      "recap_daily_state",
      "repeat_current_question",
      "user_stopped",
      "exit_to_global_dispatcher",
      "safety_preempt",
    ].includes(raw)
    ? raw as DailyActionReviewLocalFlowAction
    : "clarify_outcome";
}

function visibleTaskKind(value: unknown): DailyActionReviewVisibleTaskKind {
  const raw = cleanText(value);
  return [
      "clarify_which_action",
      "clarify_outcome",
      "clarify_completion_level",
      "clarify_reason",
      "clarify_still_relevant",
      "recap_daily_state",
      "repeat_question",
      "stop_close",
      "commit_success",
      "commit_failed",
      "exit_or_cancel",
      "safety",
    ].includes(raw)
    ? raw as DailyActionReviewVisibleTaskKind
    : "clarify_outcome";
}

function reasonCategory(
  value: unknown,
): DailyActionReviewLocalDispatcherOutput["item_updates"][string][
  "reason_category"
] {
  const raw = cleanText(value);
  return [
      "fatigue",
      "forgot",
      "external",
      "too_hard",
      "not_relevant",
      "emotional",
      "no_need",
      "other",
      "unclear",
      "none",
    ].includes(raw)
    ? raw as NonNullable<
      DailyActionReviewLocalDispatcherOutput["item_updates"][string][
        "reason_category"
      ]
    >
    : null;
}

function outcome(
  value: unknown,
): DailyActionReviewLocalDispatcherOutput["item_updates"][string]["outcome"] {
  const raw = cleanText(value);
  return raw === "completed" || raw === "partial" || raw === "missed" ||
      raw === "unclear"
    ? raw
    : null;
}

function missingSlots(value: unknown): DailyReviewMissingSlot[] {
  const allowed = new Set([
    "outcome",
    "reason",
    "still_relevant",
    "which_action",
    "completion_level",
  ]);
  return stringArray(value).filter((slot) => allowed.has(slot)) as DailyReviewMissingSlot[];
}

function statusFromHint(
  value: unknown,
  action: DailyActionReviewLocalFlowAction,
): DailyReviewStatus {
  if (action === "user_stopped") return "stopped";
  if (action === "safety_preempt") return "stopped";
  const raw = cleanText(value);
  if (raw === "complete" || raw === "collecting" || raw === "stopped") {
    return raw;
  }
  return "needs_clarification";
}

function intentFromAction(
  action: DailyActionReviewLocalFlowAction,
): DailyReviewIntent {
  if (action === "answer_review") return "answer_review";
  if (action === "clarify_reason") return "clarify_reason";
  if (action === "clarify_still_relevant") return "clarify_still_relevant";
  if (
    action === "clarify_outcome" || action === "clarify_which_action" ||
    action === "clarify_completion_level" ||
    action === "repeat_current_question"
  ) return "clarify_outcome";
  if (action === "correction") return "correction";
  if (action === "recap_daily_state") return "recap";
  if (action === "user_stopped") return "user_stopped";
  if (action === "safety_preempt") return "safety";
  if (action === "exit_to_global_dispatcher") return "off_topic";
  return "unclear";
}

function normalizeExitMemo(
  raw: unknown,
  action: DailyActionReviewLocalFlowAction,
): DailyActionReviewExitMemo {
  const root = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const local = root.local_flow_context &&
      typeof root.local_flow_context === "object"
    ? root.local_flow_context as Record<string, unknown>
    : {};
  const handoff = root.handoff_hint_for_global_dispatcher &&
      typeof root.handoff_hint_for_global_dispatcher === "object"
    ? root.handoff_hint_for_global_dispatcher as Record<string, unknown>
    : {};
  const needs = action === "exit_to_global_dispatcher" ||
    action === "safety_preempt";
  return {
    needed: needs,
    reason: [
        "topic_change",
        "explicit_tool_request",
        "product_help",
        "status_question",
        "preference_update",
        "normal_coaching",
        "safety",
        "unknown",
        "none",
      ].includes(cleanText(root.reason))
      ? cleanText(root.reason) as DailyActionReviewExitMemo["reason"]
      : needs
      ? action === "safety_preempt" ? "safety" : "unknown"
      : "none",
    user_intent_summary: nullableString(root.user_intent_summary),
    local_flow_context: {
      skill_id: "daily_action_review_v1",
      targets: Array.isArray(local.targets) ? local.targets.slice(0, 8) : [],
      current_daily_state: nullableString(local.current_daily_state),
      collected_updates_summary: nullableString(
        local.collected_updates_summary,
      ),
      missing_slots: stringArray(local.missing_slots).slice(0, 12),
      committed_effects: Array.isArray(local.committed_effects)
        ? local.committed_effects.slice(0, 8)
        : [],
    },
    handoff_hint_for_global_dispatcher: {
      likely_intent: [
          "prepare_attack_card",
          "prepare_defense_card",
          "select_state_potion",
          "update_coach_preferences",
          "status_recap",
          "product_help",
          "normal_coaching",
          "unknown",
        ].includes(cleanText(handoff.likely_intent))
        ? cleanText(handoff.likely_intent) as DailyActionReviewExitMemo[
          "handoff_hint_for_global_dispatcher"
        ]["likely_intent"]
        : "unknown",
      why: nullableString(handoff.why),
      constraints: stringArray(handoff.constraints).slice(0, 8),
    },
  };
}

export function sanitizeDailyActionReviewLocalDispatcherOutput(params: {
  raw: unknown;
  targets: DailyActionReviewTarget[];
}): DailyActionReviewLocalDispatcherOutput {
  const root = parseJsonObject(params.raw);
  const action = flowAction(root.flow_action);
  const targetIds = new Set(params.targets.map((target) => target.occurrence_id));
  const targetResolution =
    root.target_resolution && typeof root.target_resolution === "object"
      ? root.target_resolution as Record<string, unknown>
      : {};
  const rawUpdates = root.item_updates && typeof root.item_updates === "object"
    ? root.item_updates as Record<string, unknown>
    : {};
  const itemUpdates: DailyActionReviewLocalDispatcherOutput["item_updates"] =
    {};
  for (const [occurrenceId, value] of Object.entries(rawUpdates)) {
    if (!targetIds.has(occurrenceId)) continue;
    const update = value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
    const mode = cleanText(update.update_mode);
    itemUpdates[occurrenceId] = {
      update_mode: mode === "revise" || mode === "clear" || mode === "none"
        ? mode
        : "set",
      outcome: outcome(update.outcome),
      reason_category: reasonCategory(update.reason_category),
      reason_text: nullableString(update.reason_text),
      still_relevant: update.still_relevant === true ||
          update.still_relevant === false
        ? update.still_relevant
        : "unknown",
      evidence_text: nullableString(update.evidence_text),
      matched_user_text: nullableString(update.matched_user_text),
      confidence: confidence(update.confidence),
      missing_slots: missingSlots(update.missing_slots),
    };
  }
  const visible = root.visible_task && typeof root.visible_task === "object"
    ? root.visible_task as Record<string, unknown>
    : {};
  const stateUpdates =
    root.state_updates && typeof root.state_updates === "object"
      ? root.state_updates as Record<string, unknown>
      : {};
  const dailyIntent = root.daily_intent && typeof root.daily_intent === "object"
    ? root.daily_intent as Record<string, unknown>
    : {};

  return {
    flow_action: action,
    confidence: confidence(root.confidence),
    risk_score: boundedRiskScore(root.risk_score),
    target_resolution: {
      resolved_occurrence_ids: stringArray(
        targetResolution.resolved_occurrence_ids,
      ).filter((id) => targetIds.has(id)),
      ambiguous: targetResolution.ambiguous === true,
      why: cleanText(targetResolution.why),
    },
    item_updates: itemUpdates,
    daily_intent: {
      kind: [
          "daily_answer",
          "daily_clarification",
          "daily_correction",
          "daily_recap",
          "stop",
          "off_topic",
          "explicit_tool_request",
          "safety",
          "unclear",
        ].includes(cleanText(dailyIntent.kind))
        ? cleanText(dailyIntent.kind) as DailyActionReviewLocalDispatcherOutput[
          "daily_intent"
        ]["kind"]
        : "unclear",
      summary: cleanText(dailyIntent.summary),
    },
    state_updates: {
      status_hint: [
          "collecting",
          "needs_clarification",
          "complete",
          "stopped",
          "blocked",
        ].includes(cleanText(stateUpdates.status_hint))
        ? cleanText(stateUpdates.status_hint) as DailyActionReviewLocalDispatcherOutput[
          "state_updates"
        ]["status_hint"]
        : "collecting",
      turn_count_increment: Number.isFinite(
          Number(stateUpdates.turn_count_increment),
        )
        ? Math.max(0, Math.min(3, Number(stateUpdates.turn_count_increment)))
        : 1,
      close_after_visible: stateUpdates.close_after_visible === true,
    },
    visible_task: {
      kind: visibleTaskKind(visible.kind),
      instruction: cleanText(visible.instruction),
    },
    exit_memo: normalizeExitMemo(root.exit_memo, action),
    evidence: stringArray(root.evidence).slice(0, 8),
  };
}

function updateFromDispatcherItem(
  update:
    DailyActionReviewLocalDispatcherOutput["item_updates"][string],
): DailyReviewItemUpdate {
  if (update.update_mode === "clear") {
    return {
      outcome: null,
      reason_category: null,
      reason_text: null,
      still_relevant: "unknown",
      evidence_text: null,
      matched_user_text: null,
      confidence: "low",
      missing_slots: ["outcome"],
    };
  }
  const appliedOutcome = update.outcome;
  return {
    outcome: appliedOutcome,
    reason_category: update.reason_category ??
      (appliedOutcome === "completed" ? "none" : null),
    reason_text: update.reason_text,
    still_relevant: appliedOutcome === "missed"
      ? update.still_relevant
      : "unknown",
    evidence_text: update.evidence_text,
    matched_user_text: update.matched_user_text,
    confidence: update.confidence,
    missing_slots: update.missing_slots,
  };
}

export function dailyReviewDecisionFromLocalDispatcher(params: {
  output: DailyActionReviewLocalDispatcherOutput;
  state: DailyActionReviewState;
  targets: DailyActionReviewTarget[];
}): DailyReviewDecision {
  const targetIds = new Set(params.targets.map((target) => target.occurrence_id));
  const item_updates: Record<string, DailyReviewItemUpdate> = {};
  for (const [occurrenceId, update] of Object.entries(
    params.output.item_updates,
  )) {
    if (!targetIds.has(occurrenceId) || update.update_mode === "none") continue;
    item_updates[occurrenceId] = updateFromDispatcherItem(update);
  }
  const target_occurrence_ids =
    params.output.target_resolution.resolved_occurrence_ids.length > 0
      ? params.output.target_resolution.resolved_occurrence_ids
      : params.state.current_focus_occurrence_ids;
  const status = statusFromHint(
    params.output.state_updates.status_hint,
    params.output.flow_action,
  );
  return {
    skill_id: "daily_action_review_v1",
    intent: intentFromAction(params.output.flow_action),
    status,
    target_occurrence_ids,
    item_updates,
    constraints: DAILY_REVIEW_DEFAULT_CONSTRAINTS,
    next_question: null,
    next_question_targets: target_occurrence_ids,
    generated_user_message: null,
    should_apply_effects: false,
    stop_reason: params.output.flow_action === "safety_preempt"
      ? "safety"
      : params.output.flow_action === "user_stopped"
      ? "user_stopped"
      : null,
    effect_plan: { allowed: false, effects: [] },
  };
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

function dispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local du flow daily_action_review_v1.",
    "Sophia a envoye une question daily sur une ou deux actions ciblees. Le user vient de repondre.",
    "Le daily collecte une preuve du jour: action faite, faite en partie, ou manquee.",
    "Tu n'es pas le dispatcher global. Tu ne reponds jamais directement au user.",
    "Tu retournes uniquement un JSON conforme au contrat.",
    "",
    "Actions possibles: answer_review, clarify_which_action, clarify_outcome, clarify_completion_level, clarify_reason, clarify_still_relevant, correction, recap_daily_state, repeat_current_question, user_stopped, exit_to_global_dispatcher, safety_preempt.",
    "",
    "Regles:",
    "- Ne fais aucune regex metier et ne decide pas par mot-cle isole.",
    "- Analyse la reponse par rapport aux targets daily.",
    "- Le selector a deja choisi les actions. Tu ne changes pas la liste de targets.",
    "- Si deux targets sont presentes et que le user dit seulement qu'il l'a fait, ne devine pas: clarify_which_action.",
    "- Si le user dit qu'il a fait les deux, mets a jour les deux targets.",
    "- Pour completed, reason_category peut etre none.",
    "- Pour partial, il faut une evidence de ce qui a ete fait et une raison si necessaire pour comprendre le partiel.",
    "- Pour missed, il faut une raison et savoir si l'action reste pertinente.",
    "- Ne propose pas de solution, carte, potion ou ajustement pendant la collecte.",
    "- Si le user demande explicitement un outil, sors vers le dispatcher global avec exit_memo.needed=true.",
    "- Ne dis jamais que quelque chose est note ou enregistre.",
    "- Le commit sera decide uniquement par le reducer/executor.",
    "",
    'Retourne exactement ce JSON: {"flow_action":"answer_review|clarify_which_action|clarify_outcome|clarify_completion_level|clarify_reason|clarify_still_relevant|correction|recap_daily_state|repeat_current_question|user_stopped|exit_to_global_dispatcher|safety_preempt","confidence":"low|medium|high","risk_score":0,"target_resolution":{"resolved_occurrence_ids":[],"ambiguous":false,"why":"string"},"item_updates":{"occurrence_id":{"update_mode":"set|revise|clear|none","outcome":"completed|partial|missed|unclear|null","reason_category":"fatigue|forgot|external|too_hard|not_relevant|emotional|no_need|other|unclear|none|null","reason_text":"string|null","still_relevant":true,"evidence_text":"string|null","matched_user_text":"string|null","confidence":"high|medium|low","missing_slots":["outcome|reason|still_relevant|which_action|completion_level"]}},"daily_intent":{"kind":"daily_answer|daily_clarification|daily_correction|daily_recap|stop|off_topic|explicit_tool_request|safety|unclear","summary":"string"},"state_updates":{"status_hint":"collecting|needs_clarification|complete|stopped|blocked","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"clarify_which_action|clarify_outcome|clarify_completion_level|clarify_reason|clarify_still_relevant|recap_daily_state|repeat_question|stop_close|commit_success|commit_failed|exit_or_cancel|safety","instruction":"string"},"exit_memo":{"needed":true,"reason":"topic_change|explicit_tool_request|product_help|status_question|preference_update|normal_coaching|safety|unknown|none","user_intent_summary":"string|null","local_flow_context":{"skill_id":"daily_action_review_v1","targets":[],"current_daily_state":"string|null","collected_updates_summary":"string|null","missing_slots":[],"committed_effects":[]},"handoff_hint_for_global_dispatcher":{"likely_intent":"prepare_attack_card|prepare_defense_card|select_state_potion|update_coach_preferences|status_recap|product_help|normal_coaching|unknown","why":"string|null","constraints":["Do not mark daily as completed unless daily_action_review later commits an entry.","Daily has not mutated anything unless committed_effects is non-empty."]}},"evidence":["string"]}',
  ].join("\n");
}

function dispatcherUserPrompt(params: {
  userMessage: string;
  targets: DailyActionReviewTarget[];
  state: DailyActionReviewState;
  recentMessages?: Array<{ role: string; content: string }>;
}) {
  const focusTargets = dailyActionReviewFocusTargets(params.targets, params.state);
  return JSON.stringify({
    daily_targets_json: focusTargets,
    review_state_json: params.state,
    action_intelligence_by_occurrence_id_json:
      params.state.action_intelligence_by_occurrence_id,
    user_message: params.userMessage,
    conversation_excerpt: (params.recentMessages ?? []).slice(-8),
  });
}

export async function runDailyActionReviewLocalDispatcher(params: {
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
}): Promise<DailyActionReviewLocalDispatcherOutput> {
  const state = stateFromUnknown(
    params.previousState ?? {
      action_intelligence_by_occurrence_id:
        params.actionIntelligenceByOccurrenceId,
    },
    params.targets,
  );
  const systemPrompt = dispatcherSystemPrompt();
  const userPrompt = dispatcherUserPrompt({
    userMessage: params.text,
    targets: params.targets,
    state,
    recentMessages: params.recentMessages,
  });
  const raw = params.llmRunner
    ? await params.llmRunner({ systemPrompt, userPrompt })
    : await generateWithGemini(systemPrompt, userPrompt, 0.1, true, [], "auto", {
      requestId: params.requestId,
      source: "daily_action_review.local_dispatcher",
      model: "gemini-3-flash-preview",
      forceRealAi: true,
      userId: params.userId,
    });
  return sanitizeDailyActionReviewLocalDispatcherOutput({
    raw,
    targets: params.targets,
  });
}

function visibleSystemPrompt(kind: DailyActionReviewVisibleTaskKind): string {
  const common = [
    "Tu ecris le prochain message visible de Sophia pour daily_action_review_v1.",
    "Retourne uniquement le message visible.",
    "Une question principale max quand tu poses une question.",
    "Ne propose pas de solution, carte, potion, rappel ou ajustement.",
    "Ne culpabilise pas.",
    "Ne parle pas de dispatcher, reducer, commit, JSON ou flow.",
  ];
  const byKind: Record<DailyActionReviewVisibleTaskKind, string[]> = {
    clarify_which_action: [
      "La reponse est ambigue avec plusieurs actions. Demande de quelle action le user parle. Cite les targets courtement. Ne marque rien comme fait.",
    ],
    clarify_outcome: [
      "On ne sait pas si l'action est faite, faite en partie, ou manquee. Clarifie seulement l'outcome.",
    ],
    clarify_completion_level: [
      "Le user indique du partiel mais pas assez ce qui a ete fait. Demande ce qui a ete fait, factuellement.",
    ],
    clarify_reason: [
      "L'action est faite en partie ou manquee, mais la raison manque ou reste trop floue. Demande la raison utile, sans jugement.",
    ],
    clarify_still_relevant: [
      "Une action est manquee et il faut savoir si elle reste pertinente. Demande si l'action reste pertinente. Ne propose pas de report.",
    ],
    recap_daily_state: [
      "Le user demande le recap de ce qui est compris dans ce daily. Ne dis pas enregistre si rien n'est commit.",
    ],
    repeat_question: [
      "Le user demande de redire la question daily courante. Redonne la question simplement, sans coaching.",
    ],
    stop_close: [
      "Le user demande d'arreter le daily ou refuse la collecte. Ferme sans commit. Reponse courte.",
    ],
    commit_success: [
      "Le writer DB a produit des committed_effects. Tu peux dire que c'est note seulement pour ces effets. Reste court.",
    ],
    commit_failed: [
      "Le writer DB n'a pas tout commit. Ne dis pas que tout est note. Reste clair et court.",
    ],
    exit_or_cancel: [
      "Le runtime ferme localement sans seconde passe globale. Ferme proprement sans commit et sans proposer autre chose.",
    ],
    safety: [
      "Signal safety. Ne continue pas le daily. Reste minimal, sans conseil clinique.",
    ],
  };
  return [...common, ...byKind[kind]].join("\n");
}

export async function runDailyActionReviewVisibleAgent(params: {
  kind: DailyActionReviewVisibleTaskKind;
  targets: DailyActionReviewTarget[];
  state: DailyActionReviewState;
  dispatcherOutput?: DailyActionReviewLocalDispatcherOutput | null;
  committedEffects?: DailyReviewEffectsResult["committed_effects"];
  failedEffects?: DailyReviewEffectsResult["failed_effects"];
  currentDailyQuestion?: string | null;
  requestId?: string;
  userId?: string;
  llmRunner?: (input: {
    systemPrompt: string;
    userPrompt: string;
  }) => Promise<unknown>;
}): Promise<string | null> {
  const systemPrompt = visibleSystemPrompt(params.kind);
  const currentTargetIds =
    params.dispatcherOutput?.target_resolution.resolved_occurrence_ids.length
      ? params.dispatcherOutput.target_resolution.resolved_occurrence_ids
      : params.state.next_question_targets.length
      ? params.state.next_question_targets
      : params.state.current_focus_occurrence_ids;
  const currentTargets = params.targets.filter((target) =>
    currentTargetIds.includes(target.occurrence_id)
  );
  const userPrompt = JSON.stringify({
    visible_task: params.dispatcherOutput?.visible_task ?? {
      kind: params.kind,
      instruction: "",
    },
    daily_targets_json: params.targets,
    current_targets_json: currentTargets,
    review_state_summary_json: params.state,
    current_daily_question: params.currentDailyQuestion ?? params.state
      .next_question,
    committed_effects_json: params.committedEffects ?? [],
    failed_effects_json: params.failedEffects ?? [],
  });
  const raw = params.llmRunner
    ? await params.llmRunner({ systemPrompt, userPrompt })
    : await generateWithGemini(systemPrompt, userPrompt, 0.2, true, [], "auto", {
      requestId: params.requestId,
      source: `daily_action_review.visible.${params.kind}`,
      model: "gemini-3-flash-preview",
      forceRealAi: true,
      userId: params.userId,
    });
  return nullableString(raw);
}

export async function runDailyActionReviewLocalFlow(params: {
  text: string;
  targets: DailyActionReviewTarget[];
  previousState?: unknown;
  recentMessages?: Array<{ role: string; content: string }>;
  requestId?: string;
  userId?: string;
  dispatcherRunner?: (input: {
    systemPrompt: string;
    userPrompt: string;
  }) => Promise<unknown>;
  visibleRunner?: (input: {
    systemPrompt: string;
    userPrompt: string;
  }) => Promise<unknown>;
}): Promise<DailyActionReviewLocalFlowResult> {
  const previousState = stateFromUnknown(params.previousState, params.targets);
  const dispatcherOutput = await runDailyActionReviewLocalDispatcher({
    text: params.text,
    targets: params.targets,
    previousState,
    recentMessages: params.recentMessages,
    requestId: params.requestId,
    userId: params.userId,
    llmRunner: params.dispatcherRunner,
  });
  const decision = dailyReviewDecisionFromLocalDispatcher({
    output: dispatcherOutput,
    state: previousState,
    targets: params.targets,
  });
  const nextState = reduceDailyReviewState(
    previousState,
    decision,
    params.targets,
  );
  nextState.intent = decision.intent;
  nextState.last_user_text = params.text;
  const shouldRenderBeforeCommit = !nextState.should_apply_effects ||
    dispatcherOutput.flow_action === "recap_daily_state" ||
    dispatcherOutput.flow_action === "repeat_current_question" ||
    dispatcherOutput.flow_action === "user_stopped" ||
    dispatcherOutput.flow_action === "safety_preempt";
  if (shouldRenderBeforeCommit) {
    const visible = await runDailyActionReviewVisibleAgent({
      kind: dispatcherOutput.visible_task.kind,
      targets: params.targets,
      state: nextState,
      dispatcherOutput,
      currentDailyQuestion: previousState.next_question,
      requestId: params.requestId,
      userId: params.userId,
      llmRunner: params.visibleRunner,
    });
    nextState.generated_user_message = visible;
    nextState.next_question = nextState.status === "needs_clarification"
      ? visible
      : null;
  }
  return {
    ...resultFromState(nextState),
    dispatcherOutput,
    exitToGlobalDispatcher:
      dispatcherOutput.flow_action === "exit_to_global_dispatcher" ||
      dispatcherOutput.flow_action === "safety_preempt",
  };
}

export function buildDailyActionReviewLastExitMemo(params: {
  output: DailyActionReviewLocalDispatcherOutput;
  at?: string;
}): Record<string, unknown> {
  return {
    ...params.output.exit_memo,
    at: params.at ?? new Date().toISOString(),
    flow_summary: params.output.daily_intent.summary || null,
    handoff_hint_for_global_dispatcher:
      params.output.exit_memo.handoff_hint_for_global_dispatcher,
  };
}
