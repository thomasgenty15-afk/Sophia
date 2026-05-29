import type { WeeklyProgressReviewV2 } from "../weekly_progress_review.ts";
import type {
  WeeklyHumanSignals,
  WeeklyReviewAction,
  WeeklyReviewDecision,
  WeeklyReviewIntent,
  WeeklyReviewStatus,
  WeeklyStrategyDecision,
} from "./contract.ts";
import {
  buildWeeklyEvidenceSummary,
  buildWeeklyHabitVerdict,
  flattenWeeklyReviewActions,
  weeklyActionEvidenceDone,
  weeklyDailyEvidenceSnapshotForAction,
  weeklyFamilyForAction,
  weeklyStatusForDeviation,
} from "./evidence.ts";
import {
  buildWeeklyPlanPatch,
  weeklyStrategyRequiresQuestion,
} from "./plan_patch.ts";

const DEFAULT_HUMAN_SIGNALS: WeeklyHumanSignals = {
  objective_delta: "unknown",
  felt_state: "unknown",
};

function preferredStrategy(args: {
  habitVerdict: WeeklyReviewDecision["habit_verdict"];
  evidence: WeeklyReviewDecision["evidence"];
  humanSignals: WeeklyHumanSignals;
}): WeeklyReviewDecision["week_strategy"] {
  const blockers = new Set(args.evidence.dominant_blockers);
  const tiredHumanSignal = args.humanSignals.felt_state === "tired_but_ok" ||
    args.humanSignals.felt_state === "frustrated" ||
    args.humanSignals.felt_state === "overloaded";
  const lowEvidence = args.evidence.daily_coverage === "low" ||
    args.evidence.daily_coverage === "none";

  if (args.habitVerdict.status === "validated") {
    return {
      decision: tiredHumanSignal ? "advance_with_caution" : "advance",
      reason: tiredHumanSignal
        ? "Les habitudes sont validees, mais le ressenti demande une progression prudente."
        : "Les habitudes pilotent la progression et sont validees.",
      preserve_level_objective: true,
      preserve_level_architecture: true,
    };
  }

  if (args.habitVerdict.status === "partial_validatable") {
    if (
      tiredHumanSignal ||
      blockers.has("fatigue") ||
      blockers.has("too_hard") ||
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
      decision: lowEvidence ? "hold" : "advance_with_caution",
      reason: lowEvidence
        ? "La traction est partielle, mais les preuves daily sont insuffisantes."
        : "La traction est partielle; Sophia doit verifier le ressenti avant d'avancer.",
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
      tiredHumanSignal ||
      blockers.has("fatigue") ||
      blockers.has("too_hard") ||
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
      decision: lowEvidence ? "hold" : "repeat_week",
      reason: lowEvidence
        ? "Le signal est insuffisant; Sophia doit clarifier avant d'ajuster."
        : "Les habitudes ne sont pas validees; sans incoherence structurelle, on consolide la meme semaine.",
      preserve_level_objective: true,
      preserve_level_architecture: true,
    };
  }

  return {
    decision: "hold",
    reason: "Le signal est insuffisant; Sophia doit clarifier avant d'avancer.",
    preserve_level_objective: true,
    preserve_level_architecture: true,
  };
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
      return "une semaine chargee";
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

function buildQuestion(args: {
  habitVerdict: WeeklyReviewDecision["habit_verdict"];
  evidence: WeeklyReviewDecision["evidence"];
  strategy: WeeklyReviewDecision["week_strategy"];
}): WeeklyReviewDecision["question"] {
  if (
    args.evidence.daily_coverage === "low" ||
    args.evidence.daily_coverage === "none" ||
    args.strategy.decision === "hold"
  ) {
    return {
      id: "weekly_low_evidence_cause",
      text:
        "Je n'ai pas assez de retours fiables pour decider la suite. C'etait surtout une semaine empechee, un oubli de check, ou le plan etait trop dur ?",
      blocks_decision: true,
      targets: ["daily_coverage", "dominant_blocker", "felt_state"],
    };
  }

  if (args.strategy.decision === "level_review") return null;

  if (args.habitVerdict.status === "validated") {
    return {
      id: "weekly_global_progress_and_state",
      text:
        "Les habitudes semblent assez tenues cette semaine. Tu sens une difference vers ton objectif, et tu ressors comment de la semaine ?",
      blocks_decision: false,
      targets: ["objective_delta", "felt_state"],
    };
  }

  if (
    args.evidence.confidence === "high" &&
    args.evidence.dominant_blockers.length > 0
  ) {
    return {
      id: "weekly_confirm_dominant_blocker",
      text: `J'ai surtout vu ce blocage cette semaine: ${
        userFacingBlockerLabel(args.evidence.dominant_blockers[0])
      }. Tu confirmes que c'est bien ca qui doit guider l'ajustement de la semaine prochaine ?`,
      blocks_decision: true,
      targets: ["dominant_blocker"],
    };
  }

  if (args.habitVerdict.status === "no_signal") {
    return {
      id: "weekly_no_signal_cause",
      text:
        "Je n'ai pas assez de retours fiables sur les habitudes. C'etait surtout une semaine empechee, un oubli de check, ou le plan etait trop dur ?",
      blocks_decision: true,
      targets: ["dominant_blocker", "tracking_gap"],
    };
  }

  return {
    id: "weekly_habit_failure_cause",
    text:
      "Les habitudes n'ont pas assez tenu cette semaine. C'etait plutot le contexte, la fatigue, la difficulte du plan, ou le fait que les actions ne collaient plus ?",
    blocks_decision: true,
    targets: ["dominant_blocker", "still_relevant"],
  };
}

function itemDecisionFor(
  action: WeeklyReviewAction,
  strategy: WeeklyStrategyDecision,
): WeeklyReviewDecision["item_decisions"][number] {
  const family = weeklyFamilyForAction(action);
  const status = weeklyStatusForDeviation(action.deviation);
  const evidence = action.daily_evidence ?? null;
  const evidenceDone = weeklyActionEvidenceDone(action);
  let decision: WeeklyReviewDecision["item_decisions"][number]["decision"] =
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

  const dailyEvidence = weeklyDailyEvidenceSnapshotForAction(action);
  return {
    plan_item_id: action.plan_item_id,
    occurrence_id: action.occurrence_id,
    title: action.title,
    family,
    current_week_status: status,
    evidence_done: evidenceDone,
    daily_evidence_confidence: dailyEvidence.confidence,
    daily_evidence: dailyEvidence,
    decision,
    reason,
  };
}

export function reduceWeeklyReview(
  projection: WeeklyProgressReviewV2,
  humanSignals: Partial<WeeklyHumanSignals> = {},
  intent: WeeklyReviewIntent = "open_weekly_review",
): WeeklyReviewDecision {
  const signals = { ...DEFAULT_HUMAN_SIGNALS, ...humanSignals };
  const actions = flattenWeeklyReviewActions(projection);
  const habitVerdict = buildWeeklyHabitVerdict(actions);
  const evidence = buildWeeklyEvidenceSummary(actions);
  const strategy = preferredStrategy({
    habitVerdict,
    evidence,
    humanSignals: signals,
  });
  const question = buildQuestion({ habitVerdict, evidence, strategy });
  const items = actions.map((action) =>
    itemDecisionFor(action, strategy.decision)
  );
  const planPatch = buildWeeklyPlanPatch({ strategy, items });
  const questionBlocks = Boolean(question?.blocks_decision) ||
    weeklyStrategyRequiresQuestion({
      strategy: strategy.decision,
      dailyCoverage: evidence.daily_coverage,
      confidence: evidence.confidence,
    });
  const status: WeeklyReviewStatus = intent === "safety"
    ? "blocked"
    : intent === "user_stopped"
    ? "stopped"
    : strategy.decision === "level_review" && !questionBlocks
    ? "escalate_level_review"
    : questionBlocks
    ? "ask_question"
    : planPatch.operations.length === 0
    ? "no_change"
    : "ready_for_confirmation";

  const effects = planPatch.operations.length === 0 ? [] : [{
    type: strategy.decision === "level_review"
      ? "open_level_review" as const
      : "apply_weekly_plan_patch" as const,
    requires_confirmation: true as const,
    payload: {
      week_start_date: projection.week_start_date,
      week_end_date: projection.week_end_date,
      plan_patch: planPatch,
    },
  }];

  return {
    skill_id: "weekly_review_v1",
    intent,
    status,
    week_start_date: projection.week_start_date,
    week_end_date: projection.week_end_date,
    evidence,
    habit_verdict: habitVerdict,
    human_signals: signals,
    week_strategy: strategy,
    question,
    item_decisions: items,
    plan_patch: planPatch,
    effect_plan: {
      allowed: status === "ready_for_confirmation" ||
        status === "escalate_level_review",
      effects,
    },
    constraints: [
      "requires_confirmation",
      "do_not_modify_level_objective",
      "do_not_reschedule_completed_non_habit",
      "do_not_apply_without_user_confirmation",
      "do_not_include_support_items",
      "do_not_overfit_low_confidence_daily",
      "one_question_max",
      "no_tool_suggestion_during_opening",
      "no_done_language_without_commit",
    ],
    reply: null,
    state_patch: {
      weekly_review: {
        skill_id: "weekly_review_v1",
        status,
        pending_patch: status === "ready_for_confirmation" ? planPatch : null,
      },
    },
  };
}
