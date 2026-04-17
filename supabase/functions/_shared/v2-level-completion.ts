import type {
  CurrentLevelRuntime,
  LevelReviewAnswerMap,
  LevelReviewQuestion,
  LevelReviewSummary,
  LevelTransitionDecision,
  LevelTransitionPreview,
  PlanBlueprint,
  PlanContentV3,
  PlanLevelWeek,
  PlanPhase,
  UserPlanItemRow,
} from "./v2-types.ts";

const TERMINAL_ITEM_STATUSES = new Set([
  "completed",
  "in_maintenance",
  "deactivated",
  "cancelled",
]);

function cleanText(value: string | null | undefined): string | null {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function inferLevelKind(items: Pick<UserPlanItemRow, "dimension">[]): LevelReviewSummary["level_kind"] {
  const hasMissions = items.some((item) => item.dimension === "missions");
  const hasHabits = items.some((item) => item.dimension === "habits");
  const hasClarifications = items.some((item) => item.dimension === "clarifications");

  if (hasMissions && hasHabits) return "hybrid";
  if (hasHabits) return "habit";
  if (hasMissions) return "mission";
  if (hasClarifications) return "clarity";
  return "hybrid";
}

export function isLevelTransitionReady(
  currentPhaseId: string,
  items: Pick<UserPlanItemRow, "phase_id" | "status">[],
): boolean {
  const scoped = items.filter((item) => item.phase_id === currentPhaseId);
  return scoped.length > 0 &&
    scoped.every((item) => TERMINAL_ITEM_STATUSES.has(item.status));
}

export function buildLevelReviewSchema(args: {
  currentLevel: Pick<CurrentLevelRuntime, "duration_weeks" | "review_focus" | "title">;
  items: Pick<UserPlanItemRow, "dimension">[];
  weeks: PlanLevelWeek[];
}): LevelReviewQuestion[] {
  const questions: LevelReviewQuestion[] = [
    {
      id: "pace_feel",
      label: "À la fin de ce niveau, comment tu as vécu le rythme ?",
      helper_text: "Ça nous aide à régler le dosage du niveau suivant.",
      input_type: "single_select",
      options: [
        { value: "too_light", label: "Trop léger" },
        { value: "balanced", label: "Bien dosé" },
        { value: "too_heavy", label: "Trop lourd" },
      ],
      required: true,
    },
    {
      id: "readiness",
      label: "Pour la suite, tu te sens comment ?",
      helper_text: null,
      input_type: "single_select",
      options: [
        { value: "need_more_time", label: "J'ai encore besoin d'un sas doux" },
        { value: "ready", label: "Je suis prêt pour la suite" },
        { value: "very_ready", label: "Je peux accélérer un peu" },
      ],
      required: true,
    },
  ];

  if (args.currentLevel.duration_weeks > 1 || args.weeks.length > 1) {
    questions.push({
      id: "weekly_fit",
      label: "Le découpage semaine par semaine t'a aidé comment ?",
      helper_text: null,
      input_type: "single_select",
      options: [
        { value: "clear", label: "C'était clair et progressif" },
        { value: "uneven", label: "Certaines semaines étaient mal placées" },
        { value: "too_dense", label: "Le niveau restait trop dense" },
      ],
      required: true,
    });
  }

  if (args.items.some((item) => item.dimension === "missions")) {
    questions.push({
      id: "mission_fit",
      label: "Les missions de ce niveau étaient comment ?",
      helper_text: null,
      input_type: "single_select",
      options: [
        { value: "good", label: "Bien placées" },
        { value: "move_some", label: "Certaines étaient mal placées" },
        { value: "lighten_some", label: "Certaines étaient trop lourdes" },
      ],
      required: true,
    });
  }

  if (args.items.some((item) => item.dimension === "habits")) {
    questions.push({
      id: "habit_fit",
      label: "Et pour les habitudes de ce niveau ?",
      helper_text: null,
      input_type: "single_select",
      options: [
        { value: "keep", label: "Le dosage est bon" },
        { value: "lighten", label: "Il faudra les alléger un peu" },
        { value: "unstable", label: "Je n'ai pas réussi à les tenir" },
      ],
      required: true,
    });
  }

  questions.push({
    id: "support_need",
    label: "Pour le prochain niveau, tu as besoin de quoi ?",
    helper_text: args.currentLevel.review_focus.length > 0
      ? `Focus actuel: ${args.currentLevel.review_focus.slice(0, 3).join(" • ")}`
      : null,
    input_type: "single_select",
    options: [
      { value: "enough", label: "On peut garder le même cadre" },
      { value: "need_more", label: "J'ai besoin de plus de soutien" },
      { value: "need_less", label: "J'ai besoin de quelque chose de plus simple" },
    ],
    required: true,
  });

  questions.push({
    id: "free_text",
    label: "S'il y a un point à ne pas rater pour la suite, note-le ici.",
    helper_text: null,
    input_type: "free_text",
    options: [],
    placeholder: `Exemple: dans "${args.currentLevel.title}", le rythme du mardi me coupait l'élan.`,
    required: false,
  });

  return questions;
}

export function normalizeLevelReviewAnswers(
  schema: LevelReviewQuestion[],
  rawAnswers: Record<string, unknown>,
): LevelReviewAnswerMap {
  const answers: LevelReviewAnswerMap = {};

  for (const question of schema) {
    const raw = rawAnswers[question.id];
    const value = cleanText(typeof raw === "string" ? raw : null);

    if (question.required && !value) {
      throw new Error(`Missing required answer for ${question.id}`);
    }

    if (!value) continue;

    if (question.input_type === "single_select") {
      const allowed = new Set(question.options.map((option) => option.value));
      if (!allowed.has(value)) {
        throw new Error(`Invalid answer for ${question.id}`);
      }
    }

    answers[question.id] = value;
  }

  return answers;
}

export function buildLevelReviewSummary(args: {
  items: Pick<UserPlanItemRow, "dimension">[];
  answers: LevelReviewAnswerMap;
}): LevelReviewSummary {
  return {
    level_kind: inferLevelKind(args.items),
    pace_signal: (args.answers.pace_feel as LevelReviewSummary["pace_signal"] | undefined) ??
      "balanced",
    readiness_signal:
      (args.answers.readiness as LevelReviewSummary["readiness_signal"] | undefined) ??
      "ready",
    weekly_fit_signal:
      (args.answers.weekly_fit as LevelReviewSummary["weekly_fit_signal"] | undefined) ?? null,
    mission_signal:
      (args.answers.mission_fit as LevelReviewSummary["mission_signal"] | undefined) ?? null,
    habit_signal:
      (args.answers.habit_fit as LevelReviewSummary["habit_signal"] | undefined) ?? null,
    support_signal:
      (args.answers.support_need as LevelReviewSummary["support_signal"] | undefined) ?? null,
    free_text: cleanText(args.answers.free_text),
  };
}

function deriveTransitionDecision(
  summary: LevelReviewSummary,
  nextPhase: PlanPhase | null,
): LevelTransitionDecision {
  if (
    summary.pace_signal === "too_heavy" ||
    summary.readiness_signal === "need_more_time"
  ) {
    return nextPhase?.duration_weeks && nextPhase.duration_weeks > 1 ? "extend" : "lighten";
  }

  if (
    summary.pace_signal === "too_light" &&
    summary.readiness_signal === "very_ready"
  ) {
    return nextPhase?.duration_weeks && nextPhase.duration_weeks > 1 ? "shorten" : "keep";
  }

  if (
    summary.support_signal === "need_less" ||
    summary.mission_signal === "lighten_some" ||
    summary.habit_signal === "lighten" ||
    summary.habit_signal === "unstable" ||
    summary.weekly_fit_signal === "too_dense"
  ) {
    return "lighten";
  }

  return "keep";
}

function deriveDecisionReason(
  summary: LevelReviewSummary,
  decision: LevelTransitionDecision,
): string {
  if (decision === "extend") {
    return "Le niveau suivant est allongé d'une semaine pour garder un rythme plus respirable.";
  }
  if (decision === "shorten") {
    return "Le niveau suivant est raccourci pour capitaliser sur l'élan déjà présent.";
  }
  if (decision === "lighten") {
    return "Le niveau suivant garde la direction, mais avec un dosage plus simple à tenir.";
  }

  if (summary.readiness_signal === "very_ready") {
    return "La suite peut rester telle quelle: l'élan est là et le cadre actuel tient.";
  }

  return "La suite reste stable: le niveau courant a donné assez de repères pour continuer sans recharger.";
}

function buildReviewFocus(
  phase: PlanPhase,
  summary: LevelReviewSummary,
): string[] {
  const focus = [...(phase.items
    .filter((item) => item.dimension === "missions" || item.dimension === "habits")
    .slice(0, 2)
    .map((item) => item.title))];

  if (summary.pace_signal === "too_heavy") {
    focus.push("Garder un dosage plus facile à tenir");
  }
  if (summary.mission_signal === "move_some") {
    focus.push("Mieux placer les missions dans la semaine");
  }
  if (summary.support_signal === "need_more") {
    focus.push("Renforcer le soutien autour des moments fragiles");
  }
  if (summary.free_text) {
    focus.push(summary.free_text);
  }

  return [...new Set(focus.map((entry) => cleanText(entry)).filter((entry): entry is string => Boolean(entry)))].slice(0, 4);
}

function cloneWeeksForDuration(args: {
  phase: PlanPhase;
  desiredDurationWeeks: number;
}): PlanLevelWeek[] {
  const baseWeeks: PlanLevelWeek[] = (args.phase.weeks ?? []).map((week) => ({
    ...week,
  }));

  if (baseWeeks.length === 0) {
    return Array.from({ length: args.desiredDurationWeeks }, (_, index) => ({
      week_order: index + 1,
      title: `Semaine ${index + 1}`,
      focus: index === 0
        ? args.phase.phase_objective
        : `Consolider ${args.phase.title.toLowerCase()}.`,
      weekly_target_value: null,
      weekly_target_label: null,
      progression_note: null,
      action_focus: [],
      item_assignments: [],
      reps_summary: null,
      mission_days: [],
      success_signal: null,
      status: index === 0 ? "current" : "upcoming",
    }));
  }

  const weeks = baseWeeks.slice(0, args.desiredDurationWeeks);
  while (weeks.length < args.desiredDurationWeeks) {
    const previous = weeks[weeks.length - 1] ?? baseWeeks[baseWeeks.length - 1];
    weeks.push({
      ...previous,
      week_order: weeks.length + 1,
      title: `Semaine ${weeks.length + 1}`,
      status: "upcoming",
    });
  }

  return weeks.map((week, index) => ({
    ...week,
    week_order: index + 1,
    status: index === 0 ? "current" : "upcoming",
  }));
}

function buildRuntimeFromPhase(args: {
  phase: PlanPhase;
  durationWeeks: number;
  reviewFocus: string[];
}): CurrentLevelRuntime {
  return {
    phase_id: args.phase.phase_id,
    level_order: args.phase.phase_order,
    title: args.phase.title,
    phase_objective: args.phase.phase_objective,
    rationale: args.phase.rationale,
    what_this_phase_targets: args.phase.what_this_phase_targets ?? null,
    why_this_now: args.phase.why_this_now ?? null,
    how_this_phase_works: args.phase.how_this_phase_works ?? null,
    duration_weeks: args.durationWeeks,
    phase_metric_target: args.phase.phase_metric_target ?? null,
    maintained_foundation: [...args.phase.maintained_foundation],
    heartbeat: { ...args.phase.heartbeat },
    weeks: cloneWeeksForDuration({
      phase: args.phase,
      desiredDurationWeeks: args.durationWeeks,
    }),
    review_focus: args.reviewFocus,
  };
}

export function ensurePlanBlueprint(plan: PlanContentV3): PlanBlueprint {
  if (plan.plan_blueprint?.levels?.length) {
    return {
      ...plan.plan_blueprint,
      levels: plan.plan_blueprint.levels.map((level) => ({ ...level })),
    };
  }

  const currentOrder = plan.current_level_runtime?.level_order ?? 1;
  const futureLevels = [...plan.phases]
    .sort((left, right) => left.phase_order - right.phase_order)
    .filter((phase) => phase.phase_order > currentOrder)
    .map((phase) => ({
      phase_id: phase.phase_id,
      level_order: phase.phase_order,
      title: phase.title,
      intention: phase.rationale,
      estimated_duration_weeks: phase.duration_weeks ?? 1,
      preview_summary: phase.phase_objective,
      status: "upcoming" as const,
    }));

  return {
    global_objective: plan.global_objective,
    estimated_levels_count: futureLevels.length,
    levels: futureLevels,
  };
}

export function buildNextLevelTransition(args: {
  plan: PlanContentV3;
  summary: LevelReviewSummary;
  currentPhase: PlanPhase;
}): {
  preview: LevelTransitionPreview;
  nextRuntime: CurrentLevelRuntime | null;
  nextBlueprint: PlanBlueprint;
} {
  const phases = [...args.plan.phases].sort((left, right) => left.phase_order - right.phase_order);
  const nextPhase = phases.find((phase) => phase.phase_order > args.currentPhase.phase_order) ?? null;
  const decision = deriveTransitionDecision(args.summary, nextPhase);
  const decisionReason = deriveDecisionReason(args.summary, decision);

  if (!nextPhase) {
    return {
      preview: {
        decision,
        reason: "Le dernier niveau est terminé. Il n'y a pas de niveau suivant à générer.",
        next_duration_weeks: null,
        next_review_focus: [],
      },
      nextRuntime: null,
      nextBlueprint: {
        global_objective: args.plan.global_objective,
        estimated_levels_count: 0,
        levels: [],
      },
    };
  }

  const baseDuration = nextPhase.duration_weeks ?? nextPhase.weeks?.length ?? 1;
  const nextDuration = decision === "extend"
    ? Math.min(12, baseDuration + 1)
    : decision === "shorten"
    ? Math.max(1, baseDuration - 1)
    : baseDuration;
  const nextReviewFocus = buildReviewFocus(nextPhase, args.summary);
  const nextRuntime = buildRuntimeFromPhase({
    phase: nextPhase,
    durationWeeks: nextDuration,
    reviewFocus: nextReviewFocus,
  });
  const blueprint = ensurePlanBlueprint(args.plan);

  return {
    preview: {
      decision,
      reason: decisionReason,
      next_duration_weeks: nextDuration,
      next_review_focus: nextReviewFocus,
    },
    nextRuntime,
    nextBlueprint: {
      ...blueprint,
      estimated_levels_count: blueprint.levels.filter((level) => level.level_order > nextPhase.phase_order)
        .length,
      levels: blueprint.levels
        .filter((level) => level.level_order > nextPhase.phase_order)
        .map((level) => ({
        ...level,
        status: "upcoming",
      })),
    },
  };
}
