import type {
  WeeklyProgressActionDeviation,
  WeeklyProgressReviewV2,
} from "./weekly_progress_review.ts";

type WeeklyAction = WeeklyProgressReviewV2["transformations"][number]["actions"][
  number
];

export type WeeklyHabitVerdictStatus =
  | "validated"
  | "partial_validatable"
  | "failed"
  | "no_signal";

export type WeeklyAdaptiveDecision =
  | "advance"
  | "advance_with_caution"
  | "advance_with_watch"
  | "repeat_week"
  | "bridge_week"
  | "level_review";

export type WeeklyAdaptiveReview = {
  version: 1;
  status:
    | "ask_question"
    | "ready_for_confirmation"
    | "no_change"
    | "escalate_level_review";
  habit_verdict: {
    status: WeeklyHabitVerdictStatus;
    completion_rate: number;
    planned_count: number;
    done_points: number;
    reason: string;
  };
  human_signals: {
    objective_delta:
      | "clear_progress"
      | "slight_progress"
      | "stable"
      | "regression"
      | "unclear"
      | "unknown";
    felt_state:
      | "energized"
      | "stable"
      | "tired_but_ok"
      | "frustrated"
      | "overloaded"
      | "lost"
      | "unknown";
  };
  daily_evidence_summary: {
    source: "daily_action_review_v1";
    coverage: "complete" | "partial" | "low" | "none";
    covered_count: number;
    action_count: number;
    dominant_blockers: string[];
    rescheduled_open_count: number;
    not_answered_count: number;
    confidence: "high" | "medium" | "low";
  };
  week_strategy: {
    decision: WeeklyAdaptiveDecision;
    reason: string;
    preserve_level_objective: true;
    preserve_level_architecture: true;
  };
  question: {
    id: string;
    text: string;
    reason: string;
    blocks_decision: boolean;
  } | null;
  item_decisions: Array<{
    plan_item_id: string;
    occurrence_id: string;
    title: string;
    family: "habit" | "mission" | "clarification" | "other";
    current_week_status:
      | "done"
      | "partial"
      | "missed"
      | "rescheduled"
      | "not_answered"
      | "unknown";
    evidence_done: boolean;
    daily_evidence: {
      source: "daily_action_review_v1" | "conversation" | "dashboard" | "none";
      reason_category: string | null;
      reason_text: string | null;
      still_relevant: boolean | null;
      reschedule_decision: string | null;
      confidence: "high" | "medium" | "low" | "none";
    };
    decision:
      | "keep"
      | "mark_completed"
      | "carry_over"
      | "drop"
      | "repeat_with_week"
      | "bridge_with_week"
      | "split_or_replace"
      | "escalate_level_review";
    reason: string;
  }>;
  plan_patch: {
    requires_confirmation: true;
    operations: Array<{
      op:
        | "advance_week"
        | "repeat_week"
        | "insert_bridge_week"
        | "mark_item_completed"
        | "carry_over_item"
        | "drop_item"
        | "open_level_review";
      plan_item_id?: string;
      occurrence_id?: string;
      details: Record<string, unknown>;
    }>;
  };
  safety: {
    forbidden_operations: string[];
    warnings: string[];
  };
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function flattenActions(review: WeeklyProgressReviewV2): WeeklyAction[] {
  return review.transformations.flatMap((transformation) =>
    transformation.actions
  );
}

function familyForAction(action: WeeklyAction): "habit" | "mission" | "clarification" | "other" {
  if (action.dimension === "habits") return "habit";
  if (action.dimension === "missions") return "mission";
  if (action.dimension === "clarifications") return "clarification";
  return "other";
}

function statusForDeviation(
  deviation: WeeklyProgressActionDeviation,
): "done" | "partial" | "missed" | "rescheduled" | "not_answered" | "unknown" {
  if (deviation === "on_plan") return "done";
  if (deviation === "partial") return "partial";
  if (deviation === "missed") return "missed";
  if (deviation === "rescheduled") return "rescheduled";
  if (deviation === "not_answered") return "not_answered";
  return "unknown";
}

function actionPoints(action: WeeklyAction): number {
  if (action.deviation === "on_plan") return 1;
  if (action.deviation === "partial") return 0.5;
  return 0;
}

function buildHabitVerdict(actions: WeeklyAction[]): WeeklyAdaptiveReview["habit_verdict"] {
  const habits = actions.filter((action) => familyForAction(action) === "habit");
  if (habits.length === 0) {
    return {
      status: "no_signal",
      completion_rate: 0,
      planned_count: 0,
      done_points: 0,
      reason: "Aucune habitude confirmee dans la semaine.",
    };
  }
  const donePoints = habits.reduce((sum, action) => sum + actionPoints(action), 0);
  const completionRate = round2(donePoints / habits.length);
  const answeredCount = habits.filter((action) =>
    action.deviation !== "not_answered"
  ).length;
  if (answeredCount === 0) {
    return {
      status: "no_signal",
      completion_rate: completionRate,
      planned_count: habits.length,
      done_points: donePoints,
      reason: "Les habitudes existent, mais aucune reponse fiable n'est disponible.",
    };
  }
  if (completionRate >= 0.8) {
    return {
      status: "validated",
      completion_rate: completionRate,
      planned_count: habits.length,
      done_points: donePoints,
      reason: "La cible d'habitudes est atteinte ou suffisamment tenue.",
    };
  }
  if (completionRate >= 0.4) {
    return {
      status: "partial_validatable",
      completion_rate: completionRate,
      planned_count: habits.length,
      done_points: donePoints,
      reason: "Les habitudes ont cree une traction partielle.",
    };
  }
  return {
    status: "failed",
    completion_rate: completionRate,
    planned_count: habits.length,
    done_points: donePoints,
    reason: "La cible d'habitudes n'est pas atteinte.",
  };
}

function buildDailyEvidenceSummary(
  actions: WeeklyAction[],
): WeeklyAdaptiveReview["daily_evidence_summary"] {
  const covered = actions.filter((action) => action.daily_evidence);
  const blockerCounts = new Map<string, number>();
  let confidenceScore = 0;
  for (const action of covered) {
    const evidence = action.daily_evidence;
    if (!evidence) continue;
    if (evidence.confidence === "high") confidenceScore += 2;
    else if (evidence.confidence === "medium") confidenceScore += 1;
    const reason = String(evidence.reason_category ?? "").trim();
    if (reason && reason !== "none") {
      blockerCounts.set(reason, (blockerCounts.get(reason) ?? 0) + 1);
    }
  }
  const coverageRate = actions.length > 0 ? covered.length / actions.length : 0;
  const coverage = actions.length === 0
    ? "none"
    : coverageRate >= 0.9
    ? "complete"
    : coverageRate >= 0.4
    ? "partial"
    : coverageRate > 0
    ? "low"
    : "none";
  const dominantBlockers = [...blockerCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([reason]) => reason);
  const avgConfidence = covered.length > 0 ? confidenceScore / covered.length : 0;
  return {
    source: "daily_action_review_v1",
    coverage,
    covered_count: covered.length,
    action_count: actions.length,
    dominant_blockers: dominantBlockers,
    rescheduled_open_count: actions.filter((action) =>
      action.deviation === "rescheduled"
    ).length,
    not_answered_count: actions.filter((action) =>
      action.deviation === "not_answered"
    ).length,
    confidence: avgConfidence >= 1.4 ? "high" : avgConfidence >= 0.6 ? "medium" : "low",
  };
}

function preferredStrategy(args: {
  habitVerdict: WeeklyAdaptiveReview["habit_verdict"];
  dailySummary: WeeklyAdaptiveReview["daily_evidence_summary"];
}): WeeklyAdaptiveReview["week_strategy"] {
  const blockers = new Set(args.dailySummary.dominant_blockers);
  if (args.habitVerdict.status === "validated") {
    return {
      decision: "advance",
      reason: "Les habitudes pilotent la progression et sont validees.",
      preserve_level_objective: true,
      preserve_level_architecture: true,
    };
  }
  if (args.habitVerdict.status === "partial_validatable") {
    if (blockers.has("fatigue") || blockers.has("too_hard") || blockers.has("emotional")) {
      return {
        decision: "bridge_week",
        reason: "La traction existe, mais les blocages indiquent une charge a alleger.",
        preserve_level_objective: true,
        preserve_level_architecture: true,
      };
    }
    return {
      decision: "advance_with_caution",
      reason: "La traction est partielle; Sophia doit verifier le ressenti avant d'avancer.",
      preserve_level_objective: true,
      preserve_level_architecture: true,
    };
  }
  if (args.habitVerdict.status === "failed") {
    if (blockers.has("not_relevant")) {
      return {
        decision: "level_review",
        reason: "Le daily indique que certaines actions ne font plus sens.",
        preserve_level_objective: true,
        preserve_level_architecture: true,
      };
    }
    if (blockers.has("fatigue") || blockers.has("too_hard") || blockers.has("emotional")) {
      return {
        decision: "bridge_week",
        reason: "Les habitudes ne sont pas validees et la cause dominante demande une semaine plus simple.",
        preserve_level_objective: true,
        preserve_level_architecture: true,
      };
    }
    return {
      decision: "repeat_week",
      reason: "Les habitudes ne sont pas validees; sans incoherence structurelle, on consolide la meme semaine.",
      preserve_level_objective: true,
      preserve_level_architecture: true,
    };
  }
  return {
    decision: "repeat_week",
    reason: "Le signal est insuffisant; Sophia doit clarifier avant d'avancer.",
    preserve_level_objective: true,
    preserve_level_architecture: true,
  };
}

function buildQuestion(args: {
  habitVerdict: WeeklyAdaptiveReview["habit_verdict"];
  dailySummary: WeeklyAdaptiveReview["daily_evidence_summary"];
  strategy: WeeklyAdaptiveReview["week_strategy"];
}): WeeklyAdaptiveReview["question"] {
  if (args.habitVerdict.status === "validated") {
    return {
      id: "weekly_global_progress_and_state",
      text:
        "Les habitudes semblent assez tenues cette semaine. Tu sens une difference vers ton objectif, et tu ressors comment de la semaine ?",
      reason: "Verifier les deux signaux humains avant de confirmer le passage a la suite.",
      blocks_decision: false,
    };
  }
  if (args.dailySummary.confidence === "high" && args.dailySummary.dominant_blockers.length > 0) {
    return {
      id: "weekly_confirm_dominant_blocker",
      text:
        `J'ai surtout vu ce blocage cette semaine: ${args.dailySummary.dominant_blockers[0]}. Tu confirmes que c'est bien ca qui doit guider l'ajustement de la semaine prochaine ?`,
      reason: "Le daily donne deja la cause dominante; Sophia demande seulement confirmation.",
      blocks_decision: true,
    };
  }
  if (args.habitVerdict.status === "no_signal") {
    return {
      id: "weekly_no_signal_cause",
      text:
        "Je n'ai pas assez de retours fiables sur les habitudes. C'etait surtout une semaine empechee, un oubli de check, ou le plan etait trop dur ?",
      reason: "Distinguer donnee manquante, contexte externe et probleme de difficulte.",
      blocks_decision: true,
    };
  }
  return {
    id: "weekly_habit_failure_cause",
    text:
      "Les habitudes n'ont pas assez tenu cette semaine. C'etait plutot le contexte, la fatigue, la difficulte du plan, ou le fait que les actions ne collaient plus ?",
    reason: "Choisir entre repeat_week, bridge_week et level_review.",
    blocks_decision: true,
  };
}

function itemDecisionFor(
  action: WeeklyAction,
  strategy: WeeklyAdaptiveDecision,
): WeeklyAdaptiveReview["item_decisions"][number] {
  const family = familyForAction(action);
  const status = statusForDeviation(action.deviation);
  const evidence = action.daily_evidence ?? null;
  const evidenceDone = action.deviation === "on_plan" ||
    action.entry_outcome === "completed";
  let decision: WeeklyAdaptiveReview["item_decisions"][number]["decision"] = "keep";
  let reason = "Aucun ajustement necessaire.";

  if (evidenceDone && family !== "habit") {
    decision = "mark_completed";
    reason = "L'action est deja faite; elle ne doit jamais etre reportee.";
  } else if (evidenceDone) {
    decision = "keep";
    reason = "L'occurrence d'habitude est deja comptabilisee.";
  } else if (family === "habit") {
    if (strategy === "bridge_week") {
      decision = "bridge_with_week";
      reason = "Les habitudes suivent la strategie bridge de la semaine.";
    } else if (strategy === "repeat_week") {
      decision = "repeat_with_week";
      reason = "Les habitudes suivent la repetition de semaine.";
    } else if (strategy === "level_review") {
      decision = "escalate_level_review";
      reason = "Le probleme semble structurel et doit sortir du weekly.";
    }
  } else if (evidence?.still_relevant === false) {
    decision = "drop";
    reason = "Le daily indique que l'item n'est plus utile.";
  } else if (evidence?.reason_category === "too_hard") {
    decision = "split_or_replace";
    reason = "L'item reste important mais etait trop difficile tel quel.";
  } else if (strategy === "bridge_week") {
    decision = "bridge_with_week";
    reason = "Les non-habitudes suivent la semaine bridge sauf exception.";
  } else if (strategy === "repeat_week") {
    decision = "repeat_with_week";
    reason = "Les non-habitudes restent avec la semaine repetee.";
  } else if (status === "missed" || status === "partial" || status === "not_answered" || status === "rescheduled") {
    decision = "carry_over";
    reason = "Les habitudes permettent d'avancer; cet item peut etre reporte s'il reste utile.";
  }

  return {
    plan_item_id: action.plan_item_id,
    occurrence_id: action.occurrence_id,
    title: action.title,
    family,
    current_week_status: status,
    evidence_done: evidenceDone,
    daily_evidence: evidence
      ? {
        source: "daily_action_review_v1",
        reason_category: evidence.reason_category,
        reason_text: evidence.reason_text,
        still_relevant: evidence.still_relevant,
        reschedule_decision: evidence.reschedule_decision,
        confidence: evidence.confidence,
      }
      : {
        source: action.had_entry ? "dashboard" : "none",
        reason_category: null,
        reason_text: null,
        still_relevant: null,
        reschedule_decision: null,
        confidence: "none",
      },
    decision,
    reason,
  };
}

function planPatchFor(
  strategy: WeeklyAdaptiveReview["week_strategy"],
  items: WeeklyAdaptiveReview["item_decisions"],
): WeeklyAdaptiveReview["plan_patch"] {
  const operations: WeeklyAdaptiveReview["plan_patch"]["operations"] = [];
  if (strategy.decision === "advance" || strategy.decision === "advance_with_caution" || strategy.decision === "advance_with_watch") {
    operations.push({ op: "advance_week", details: { decision: strategy.decision } });
  } else if (strategy.decision === "repeat_week") {
    operations.push({ op: "repeat_week", details: { reason: strategy.reason } });
  } else if (strategy.decision === "bridge_week") {
    operations.push({ op: "insert_bridge_week", details: { reason: strategy.reason } });
  } else if (strategy.decision === "level_review") {
    operations.push({ op: "open_level_review", details: { reason: strategy.reason } });
  }

  for (const item of items) {
    if (item.decision === "mark_completed") {
      operations.push({
        op: "mark_item_completed",
        plan_item_id: item.plan_item_id,
        occurrence_id: item.occurrence_id,
        details: { reason: item.reason },
      });
    } else if (item.decision === "carry_over") {
      operations.push({
        op: "carry_over_item",
        plan_item_id: item.plan_item_id,
        occurrence_id: item.occurrence_id,
        details: { reason: item.reason },
      });
    } else if (item.decision === "drop") {
      operations.push({
        op: "drop_item",
        plan_item_id: item.plan_item_id,
        occurrence_id: item.occurrence_id,
        details: { reason: item.reason },
      });
    }
  }
  return { requires_confirmation: true, operations };
}

export function buildWeeklyAdaptiveReview(
  review: WeeklyProgressReviewV2,
): WeeklyAdaptiveReview {
  const actions = flattenActions(review);
  const habitVerdict = buildHabitVerdict(actions);
  const dailySummary = buildDailyEvidenceSummary(actions);
  const strategy = preferredStrategy({ habitVerdict, dailySummary });
  const question = buildQuestion({ habitVerdict, dailySummary, strategy });
  const items = actions.map((action) =>
    itemDecisionFor(action, strategy.decision)
  );
  const status = strategy.decision === "level_review"
    ? "escalate_level_review"
    : question
    ? "ask_question"
    : "ready_for_confirmation";
  return {
    version: 1,
    status,
    habit_verdict: habitVerdict,
    human_signals: {
      objective_delta: "unknown",
      felt_state: "unknown",
    },
    daily_evidence_summary: dailySummary,
    week_strategy: strategy,
    question,
    item_decisions: items,
    plan_patch: planPatchFor(strategy, items),
    safety: {
      forbidden_operations: [
        "modify_level_objective_from_weekly",
        "reschedule_completed_non_habit",
        "apply_without_user_confirmation",
        "include_support_items",
      ],
      warnings: dailySummary.not_answered_count > 0
        ? ["Certaines actions restent sans reponse fiable."]
        : [],
    },
  };
}

export function buildWeeklyAdaptiveReviewMessage(
  adaptiveReview: WeeklyAdaptiveReview,
): string {
  if (adaptiveReview.question) return adaptiveReview.question.text;
  const decision = adaptiveReview.week_strategy.decision;
  if (decision === "advance") {
    return "Les habitudes sont validees cette semaine. Je propose de passer a la semaine suivante, avec seulement les missions/clarifications utiles en report leger. Tu confirmes ?";
  }
  if (decision === "bridge_week") {
    return "La semaine semble avoir ete trop lourde. Je propose une semaine plus simple avant de reprendre la suite. Tu confirmes ?";
  }
  if (decision === "repeat_week") {
    return "Je propose de refaire la meme semaine plutot que d'avancer trop vite. Tu confirmes ?";
  }
  if (decision === "level_review") {
    return "Ce que je vois ressemble plus a un probleme de niveau qu'a un simple ajustement hebdo. On ouvre une revue du niveau ?";
  }
  return "J'ai une proposition d'ajustement pour la semaine prochaine. Tu veux qu'on la valide ensemble ?";
}

export function buildWeeklyAdaptiveReviewInstruction(
  adaptiveReview: WeeklyAdaptiveReview,
): string {
  return [
    "Weekly adaptive review.",
    "Objectif: faire le point de fin de semaine en partant des habitudes et des donnees daily_action_review_v1.",
    "Ne refais pas un bilan action par action si le daily donne deja les raisons.",
    "Pose uniquement la question fournie si elle existe.",
    "Ne dis jamais que tu as applique un changement de plan: le JSON est une proposition qui demande confirmation.",
    `Habit verdict: ${adaptiveReview.habit_verdict.status} (${adaptiveReview.habit_verdict.completion_rate}).`,
    `Decision proposee: ${adaptiveReview.week_strategy.decision}.`,
    adaptiveReview.question
      ? `Question a poser: ${adaptiveReview.question.text}`
      : "Demande une confirmation courte de la proposition.",
  ].join("\n");
}

export function buildWeeklyAdaptiveReviewGrounding(
  adaptiveReview: WeeklyAdaptiveReview,
): string {
  return JSON.stringify(adaptiveReview);
}
