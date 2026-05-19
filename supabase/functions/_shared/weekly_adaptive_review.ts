import type {
  WeeklyProgressActionDeviation,
  WeeklyProgressReviewV2,
} from "./weekly_progress_review.ts";

type WeeklyAction =
  WeeklyProgressReviewV2["transformations"][number]["actions"][
    number
  ];

type WeeklyTotals = {
  planned: number;
  done: number;
  partial: number;
  missed: number;
  unanswered: number;
};

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

function familyForAction(
  action: WeeklyAction,
): "habit" | "mission" | "clarification" | "other" {
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

function buildHabitVerdict(
  actions: WeeklyAction[],
): WeeklyAdaptiveReview["habit_verdict"] {
  const habits = actions.filter((action) =>
    familyForAction(action) === "habit"
  );
  if (habits.length === 0) {
    return {
      status: "no_signal",
      completion_rate: 0,
      planned_count: 0,
      done_points: 0,
      reason: "Aucune habitude confirmee dans la semaine.",
    };
  }
  const donePoints = habits.reduce(
    (sum, action) => sum + actionPoints(action),
    0,
  );
  const completionRate = round2(donePoints / habits.length);
  const answeredCount =
    habits.filter((action) => action.deviation !== "not_answered").length;
  if (answeredCount === 0) {
    return {
      status: "no_signal",
      completion_rate: completionRate,
      planned_count: habits.length,
      done_points: donePoints,
      reason:
        "Les habitudes existent, mais aucune reponse fiable n'est disponible.",
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
  const avgConfidence = covered.length > 0
    ? confidenceScore / covered.length
    : 0;
  return {
    source: "daily_action_review_v1",
    coverage,
    covered_count: covered.length,
    action_count: actions.length,
    dominant_blockers: dominantBlockers,
    rescheduled_open_count:
      actions.filter((action) => action.deviation === "rescheduled").length,
    not_answered_count:
      actions.filter((action) => action.deviation === "not_answered").length,
    confidence: avgConfidence >= 1.4
      ? "high"
      : avgConfidence >= 0.6
      ? "medium"
      : "low",
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
    if (
      blockers.has("fatigue") || blockers.has("too_hard") ||
      blockers.has("emotional")
    ) {
      return {
        decision: "bridge_week",
        reason:
          "La traction existe, mais les blocages indiquent une charge a alleger.",
        preserve_level_objective: true,
        preserve_level_architecture: true,
      };
    }
    return {
      decision: "advance_with_caution",
      reason:
        "La traction est partielle; Sophia doit verifier le ressenti avant d'avancer.",
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
    if (
      blockers.has("fatigue") || blockers.has("too_hard") ||
      blockers.has("emotional")
    ) {
      return {
        decision: "bridge_week",
        reason:
          "Les habitudes ne sont pas validees et la cause dominante demande une semaine plus simple.",
        preserve_level_objective: true,
        preserve_level_architecture: true,
      };
    }
    return {
      decision: "repeat_week",
      reason:
        "Les habitudes ne sont pas validees; sans incoherence structurelle, on consolide la meme semaine.",
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
      reason:
        "Verifier les deux signaux humains avant de confirmer le passage a la suite.",
      blocks_decision: false,
    };
  }
  if (
    args.dailySummary.confidence === "high" &&
    args.dailySummary.dominant_blockers.length > 0
  ) {
    return {
      id: "weekly_confirm_dominant_blocker",
      text: `J'ai surtout vu ce blocage cette semaine: ${
        userFacingBlockerLabel(args.dailySummary.dominant_blockers[0])
      }. Tu confirmes que c'est bien ca qui doit guider l'ajustement de la semaine prochaine ?`,
      reason:
        "Le daily donne deja la cause dominante; Sophia demande seulement confirmation.",
      blocks_decision: true,
    };
  }
  if (args.habitVerdict.status === "no_signal") {
    return {
      id: "weekly_no_signal_cause",
      text:
        "Je n'ai pas assez de retours fiables sur les habitudes. C'etait surtout une semaine empechee, un oubli de check, ou le plan etait trop dur ?",
      reason:
        "Distinguer donnee manquante, contexte externe et probleme de difficulte.",
      blocks_decision: true,
    };
  }
  return {
    id: "weekly_habit_failure_cause",
    text:
      "Les habitudes n'ont pas assez tenu cette semaine. C'etait plutot le contexte, la fatigue, la difficulte du plan, ou le fait que les actions ne collaient plus ?",
    reason:
      "Choisir entre refaire la meme semaine, alleger la prochaine semaine, ou revoir la forme du niveau.",
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
  let decision: WeeklyAdaptiveReview["item_decisions"][number]["decision"] =
    "keep";
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
      reason = "Les habitudes passent dans une semaine plus legere.";
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
    reason = "Les non-habitudes passent dans une semaine plus legere.";
  } else if (strategy === "repeat_week") {
    decision = "repeat_with_week";
    reason = "Les non-habitudes restent avec la semaine repetee.";
  } else if (
    status === "missed" || status === "partial" || status === "not_answered" ||
    status === "rescheduled"
  ) {
    decision = "carry_over";
    reason =
      "Les habitudes permettent d'avancer; cet item peut etre reporte s'il reste utile.";
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
  if (
    strategy.decision === "advance" ||
    strategy.decision === "advance_with_caution" ||
    strategy.decision === "advance_with_watch"
  ) {
    operations.push({
      op: "advance_week",
      details: { decision: strategy.decision },
    });
  } else if (strategy.decision === "repeat_week") {
    operations.push({
      op: "repeat_week",
      details: { reason: strategy.reason },
    });
  } else if (strategy.decision === "bridge_week") {
    operations.push({
      op: "insert_bridge_week",
      details: { reason: strategy.reason },
    });
  } else if (strategy.decision === "level_review") {
    operations.push({
      op: "open_level_review",
      details: { reason: strategy.reason },
    });
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

function weeklyTotalsFromReview(review: WeeklyProgressReviewV2): WeeklyTotals {
  return review.transformations.reduce(
    (acc, transformation) => {
      acc.planned += transformation.summary.planned_count;
      acc.done += transformation.summary.done_count;
      acc.partial += transformation.summary.partial_count;
      acc.missed += transformation.summary.missed_count;
      acc.unanswered += transformation.summary.unanswered_count;
      return acc;
    },
    { planned: 0, done: 0, partial: 0, missed: 0, unanswered: 0 },
  );
}

function weeklyActionCheckLine(args: WeeklyTotals): string {
  if (args.planned === 0) {
    return "Je n'ai pas assez d'actions confirmees pour lire la semaine correctement.";
  }
  if (args.done === args.planned && args.partial === 0 && args.missed === 0) {
    return "Cote actions, la semaine semble bien tenue.";
  }
  if (args.done > 0 && args.missed === 0 && args.unanswered === 0) {
    return "Cote actions, ca a avance, avec quelques points restes partiels.";
  }
  if (args.unanswered >= args.planned) {
    return "Cote actions, il manque surtout des retours fiables pour lire la semaine.";
  }
  if (args.done > 0 || args.partial > 0) {
    return "Cote actions, une partie a avance et une partie reste a clarifier.";
  }
  return "Cote actions, la semaine semble avoir ete difficile a tenir.";
}

function humanWeeklySynthesis(
  totals: WeeklyTotals,
  adaptiveReview: WeeklyAdaptiveReview,
): string {
  if (totals.planned === 0) {
    return "Je n'ai pas encore assez de matiere fiable pour lire la semaine.";
  }
  if (adaptiveReview.habit_verdict.status === "validated") {
    return "La semaine semble avoir ete solide dans l'ensemble.";
  }
  if (adaptiveReview.habit_verdict.status === "partial_validatable") {
    return "La semaine a avance, mais certains points meritent d'etre ajustes avant la suite.";
  }
  if (adaptiveReview.habit_verdict.status === "no_signal") {
    return "Il manque surtout des retours fiables pour comprendre ce qui s'est vraiment passe.";
  }
  if (totals.done > 0 || totals.partial > 0) {
    return "Il y a eu du mouvement, mais la semaine semble avoir demande plus que prevu.";
  }
  return "La semaine semble avoir ete difficile a tenir.";
}

function strategyOrganizationLine(
  adaptiveReview: WeeklyAdaptiveReview,
): string {
  const decision = adaptiveReview.week_strategy.decision;
  if (decision === "advance") {
    const carryOvers = adaptiveReview.item_decisions
      .filter((item) => item.decision === "carry_over")
      .map((item) => item.title)
      .slice(0, 2);
    const suffix = carryOvers.length > 0
      ? ` avec a clarifier ou reporter: ${carryOvers.join(", ")}`
      : ", sans report utile repere";
    return `Pour l'organisation de la semaine prochaine, l'option naturelle serait de passer a la suite${suffix}.`;
  }
  if (
    decision === "advance_with_caution" || decision === "advance_with_watch"
  ) {
    return "Pour l'organisation de la semaine prochaine, l'option serait d'avancer prudemment, seulement si ton etat confirme que c'est tenable.";
  }
  if (decision === "bridge_week") {
    return "Pour l'organisation de la semaine prochaine, l'option naturelle serait une semaine allegee: on garde le cap, mais avec moins de charge.";
  }
  if (decision === "repeat_week") {
    return "Pour l'organisation de la semaine prochaine, l'option prudente serait de consolider la meme semaine avant d'avancer.";
  }
  if (decision === "level_review") {
    return "Pour l'organisation de la suite, ca ressemble plutot a un plan a revoir en profondeur qu'a un petit ajustement de semaine.";
  }
  return "Pour l'organisation de la semaine prochaine, je veux verifier le bon ajustement avant de te faire valider.";
}

function userFacingBlockerLabel(blocker: string | null | undefined): string {
  switch (blocker) {
    case "fatigue":
      return "la fatigue";
    case "too_hard":
      return "des actions trop difficiles";
    case "emotional":
      return "une charge mentale ou emotionnelle trop forte";
    case "not_relevant":
      return "des actions qui ne collaient plus vraiment a ta situation";
    case "context":
      return "le contexte de la semaine";
    case "forgotten":
      return "des oublis ou un manque de suivi";
    case "none":
    case "":
    case null:
    case undefined:
      return "un point encore a clarifier";
    default:
      return blocker.replaceAll("_", " ");
  }
}

function userFacingStrategyLabel(decision: WeeklyAdaptiveDecision): string {
  if (decision === "advance") return "passer a la suite";
  if (
    decision === "advance_with_caution" || decision === "advance_with_watch"
  ) {
    return "passer a la suite prudemment";
  }
  if (decision === "bridge_week") {
    return "faire une semaine allegee";
  }
  if (decision === "repeat_week") return "refaire la meme semaine";
  if (decision === "level_review") return "revoir la forme du niveau";
  return "ajuster la semaine prochaine";
}

export function buildWeeklyAdaptiveReviewIntroMessage(
  review: WeeklyProgressReviewV2,
  adaptiveReview: WeeklyAdaptiveReview,
): string {
  const totals = weeklyTotalsFromReview(review);
  const blocker = adaptiveReview.daily_evidence_summary.dominant_blockers[0];
  const blockerLine = blocker && blocker !== "none"
    ? `Ce qui ressort surtout: ${userFacingBlockerLabel(blocker)}.`
    : null;
  const lines = [
    `C'est le moment du bilan de la semaine. ${
      humanWeeklySynthesis(totals, adaptiveReview)
    }`,
    weeklyActionCheckLine(totals),
    blockerLine,
    strategyOrganizationLine(adaptiveReview),
    "Avant de confirmer l'organisation de la semaine prochaine, comment tu as vecu cette semaine dans l'ensemble ?",
  ].filter(Boolean);
  return lines.join("\n\n");
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
    return "La semaine semble avoir ete trop lourde. Je propose une semaine allegee: on garde le cap, mais avec moins de charge. Tu confirmes ?";
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
    "Objectif: ouvrir un vrai point weekly: observation courte de l'etat de la semaine, check clair des actions, puis discussion sur l'organisation de la semaine prochaine.",
    "L'ouverture doit etre un message proactif envoye par Sophia, comme le daily: ce n'est pas le user qui doit ouvrir le point.",
    "L'ouverture doit toujours dire clairement que c'est le moment du bilan de la semaine ou du point de fin de semaine, pas commencer par une question nue.",
    "Dans l'ouverture, n'affiche jamais de chiffres de tableau de bord: pas de ratio, pas de pourcentage, pas de '5/6', pas de '83%'.",
    "Un petit compteur simple est autorise s'il clarifie l'etat sans noter le user, par exemple '6 actions prevues' ou '6 en attente'. Sinon, traduis en langage humain: la plupart, une partie, presque tout, peu de retours fiables, plusieurs points restes ouverts.",
    "Ne refais pas un bilan action par action si le daily donne deja les raisons; mentionne seulement le signal utile.",
    "Dans le message d'ouverture, pose une seule question large maximum: comment le user a vecu la semaine dans l'ensemble.",
    "Ne pose pas deux questions frontales du type progression ressentie + etat/energie dans l'ouverture. Ces informations doivent etre recuperees naturellement dans la discussion et remplies dans le JSON du skill.",
    "Points a remplir progressivement dans le JSON du skill: progression ressentie vers l'objectif, etat/energie de fin de semaine, cause dominante si elle bloque, pertinence des actions non faites, et accord explicite avant validation.",
    "Correction d'actions oubliees pendant le weekly: si le user dit qu'une action de la semaine a ete faite mais pas cochee/confirmée, ne lance pas un nouveau flow. Remplis les trous: action concernee, nombre de repetitions a ajouter, repere de semaine/date si donne. Quand ces infos sont completes, le runtime peut mettre a jour la DB en direct; sinon clarifie naturellement dans la discussion.",
    "Quand tu parles d'une proposition, parle de l'organisation concrete de la semaine prochaine. Ne transforme pas ca en 'regles' abstraites sur la fatigue.",
    "Si le user demande explicitement une organisation concrete ou refuse les regles/listes de regles, n'utilise pas le mot regle et ne donne pas de principe abstrait. Donne plutot les actions a garder, reporter, alleger, l'ordre ou la charge de la semaine.",
    "Si le user signale une fatigue forte, ne parle pas d'objectif 100%, de perfection ou de tout finir a tout prix. Propose plutot une charge tenable et la prochaine etape utile.",
    "Tant que le flow d'ajustement n'a pas ete lance et confirme, ne dis pas que tu verrouilles, appliques ou enregistres un plan precis. Dis que c'est une proposition concrete et demande s'il veut l'appliquer maintenant ou la garder comme discussion non confirmee.",
    "Pendant le weekly, evite le mot brouillon. Dis plutot proposition d'organisation, version proposee, ou rien n'est confirme.",
    "Vocabulaire simple obligatoire: ne dis jamais bridge, bridge_week, semaine pont, carry_over, mode advance, repeat_week, level_review, not_relevant, item_decision, plan_patch ou operation. Traduis toujours en mots utilisateur.",
    "Si le user emploie un de ces mots interdits, ne le repete pas, meme pour dire que tu ne vas pas l'utiliser; reformule directement en vocabulaire simple.",
    "Traductions: bridge_week = semaine allegee; advance = passer a la suite; repeat_week = refaire la meme semaine; level_review = revoir la forme du niveau; carry_over = reporter cette mission/action utile.",
    "Ne dis jamais que tu as applique un changement de plan: le JSON est une proposition qui demande confirmation.",
    "Les supports / fiches support sont hors scope du weekly: ne les propose pas dans l'organisation de la semaine prochaine et ne les reporte jamais.",
    "Si le user confirme une proposition applicable maintenant, applique seulement via le flow de modification autorise. S'il veut attendre demain/plus tard ou ne rien changer maintenant, dis qu'on reprendra plus tard et que rien n'est confirme; ne promets pas de garder une version en attente.",
    "Quand la discussion weekly est terminee, dis explicitement que la validation de la semaine prochaine est disponible. Cette validation signifie: confirmer l'organisation de la semaine suivante apres le point de fin de semaine, pas valider des occurrences passees.",
    "A la conclusion du weekly, ajoute une mini-synthese utile pour le prochain weekly: ce qu'on retient de la semaine, l'ajustement choisi pour la suite, et le point a surveiller. Reste court.",
    "Si la discussion weekly revele une vraie demande de modification de l'organisation, Sophia peut passer ponctuellement par adjust_plan_item, puis revenir au weekly pour conclure et debloquer la validation.",
    `Habit verdict interne: ${adaptiveReview.habit_verdict.status}.`,
    `Decision a expliquer au user: ${
      userFacingStrategyLabel(adaptiveReview.week_strategy.decision)
    }.`,
    adaptiveReview.question
      ? `Question supplementaire si elle bloque la decision: ${adaptiveReview.question.text}`
      : "Demande une confirmation courte de la proposition.",
  ].join("\n");
}

export function buildWeeklyAdaptiveReviewGrounding(
  adaptiveReview: WeeklyAdaptiveReview,
): string {
  return JSON.stringify(adaptiveReview);
}
