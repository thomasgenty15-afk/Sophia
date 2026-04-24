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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseYmdParts(ymd: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function dateFromYmdUtc(ymd: string): Date | null {
  const parts = parseYmdParts(ymd);
  if (!parts) return null;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatYmdUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysYmd(ymd: string, days: number): string | null {
  const date = dateFromYmdUtc(ymd);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmdUtc(date);
}

function getPlanLevelEndDate(
  anchor: Record<string, unknown>,
  durationWeeks: number,
): string | null {
  const anchorWeekEnd = typeof anchor.anchor_week_end === "string"
    ? anchor.anchor_week_end.trim()
    : "";
  if (!anchorWeekEnd) return null;
  return addDaysYmd(anchorWeekEnd, (Math.max(1, durationWeeks) - 1) * 7);
}

export function isLevelReviewWindowOpen(args: {
  plan: Pick<PlanContentV3, "metadata">;
  currentLevel: Pick<CurrentLevelRuntime, "duration_weeks">;
  userLocalDate: string;
  unlockDaysBeforeEnd?: number;
}): boolean {
  const metadata = isRecord(args.plan.metadata) ? args.plan.metadata : null;
  const anchor = isRecord(metadata?.schedule_anchor) ? metadata.schedule_anchor : null;
  if (!anchor) return false;

  const endDate = getPlanLevelEndDate(anchor, args.currentLevel.duration_weeks);
  const unlockDate = endDate
    ? addDaysYmd(endDate, -(args.unlockDaysBeforeEnd ?? 2))
    : null;

  return Boolean(unlockDate && args.userLocalDate >= unlockDate);
}

export function buildLevelReviewSchema(args: {
  currentLevel: Pick<CurrentLevelRuntime, "duration_weeks" | "review_focus" | "title">;
  items: Pick<UserPlanItemRow, "dimension">[];
  weeks: PlanLevelWeek[];
  primaryMetricLabel?: string | null;
}): LevelReviewQuestion[] {
  const questions: LevelReviewQuestion[] = [
    {
      id: "global_metric_state",
      label: `Où est-ce que ça en est sur ${
        cleanText(args.primaryMetricLabel) ?? "la métrique globale"
      } ?`,
      helper_text: "Même une estimation suffit: l'objectif est de situer le cap réel avant la suite.",
      input_type: "single_select",
      options: [
        { value: "strong_progress", label: "Net progrès" },
        { value: "slight_progress", label: "Léger progrès" },
        { value: "stable", label: "Plutôt stable" },
        { value: "regressed", label: "Ça a reculé" },
        { value: "unclear", label: "Difficile à dire" },
      ],
      required: true,
    },
    {
      id: "next_plan_coherence",
      label: "Est-ce que la suite du plan te paraît cohérente ?",
      helper_text: "Sophia décidera si le prochain niveau et les niveaux suivants doivent rester tels quels ou changer.",
      input_type: "single_select",
      options: [
        { value: "yes", label: "Oui, ça reste cohérent" },
        { value: "mostly", label: "Globalement oui" },
        { value: "no", label: "Non, ça ne colle pas" },
        { value: "not_sure", label: "Je ne sais pas encore" },
      ],
      required: true,
    },
    {
      id: "coherence_reason",
      label: "Si ce n'est pas cohérent, qu'est-ce qui ne l'est pas ?",
      helper_text: null,
      input_type: "free_text",
      options: [],
      placeholder: "Exemple: le prochain niveau va trop vite, ou il ne répond plus au vrai blocage.",
      required: false,
    },
    {
      id: "difficulty_signal",
      label: "Est-ce qu'il y a eu des difficultés importantes sur ce niveau ?",
      helper_text: "On distingue un frottement normal d'un vrai signal d'ajustement.",
      input_type: "single_select",
      options: [
        { value: "no", label: "Non, rien de majeur" },
        { value: "minor", label: "Oui, mais gérable" },
        { value: "blocking", label: "Oui, ça a vraiment bloqué" },
      ],
      required: true,
    },
    {
      id: "difficulty_details",
      label: "Si oui, qu'est-ce qui a été difficile ?",
      helper_text: null,
      input_type: "free_text",
      options: [],
      placeholder: `Exemple: dans "${args.currentLevel.title}", j'ai décroché quand...`,
      required: false,
    },
    {
      id: "pride",
      label: "De quoi tu es fier avec ce niveau ?",
      helper_text: "Ce point sert aussi à garder ce qui marche dans le prochain niveau.",
      input_type: "free_text",
      options: [],
      placeholder: "Exemple: j'ai tenu le cap même quand c'était imparfait.",
      required: true,
    },
  ];

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
  const globalMetricState = args.answers.global_metric_state as
    | LevelReviewSummary["global_metric_state"]
    | undefined;
  const nextPlanCoherence = args.answers.next_plan_coherence as
    | LevelReviewSummary["next_plan_coherence"]
    | undefined;
  const difficultySignal = args.answers.difficulty_signal as
    | LevelReviewSummary["difficulty_signal"]
    | undefined;

  return {
    level_kind: inferLevelKind(args.items),
    global_metric_state: globalMetricState ?? "unclear",
    next_plan_coherence: nextPlanCoherence ?? "not_sure",
    coherence_reason: cleanText(args.answers.coherence_reason),
    difficulty_signal: difficultySignal ?? "minor",
    difficulty_details: cleanText(args.answers.difficulty_details),
    pride: cleanText(args.answers.pride) ?? "",
    pace_signal: "balanced",
    readiness_signal:
      nextPlanCoherence === "yes" || nextPlanCoherence === "mostly" ? "ready" : "need_more_time",
    weekly_fit_signal: null,
    mission_signal: null,
    habit_signal: difficultySignal === "blocking" ? "unstable" : null,
    support_signal: difficultySignal === "blocking" ? "need_more" : "enough",
    free_text: cleanText([
      args.answers.coherence_reason,
      args.answers.difficulty_details,
      args.answers.pride,
    ].filter(Boolean).join(" | ")),
  };
}

function deriveTransitionDecision(
  summary: LevelReviewSummary,
  nextPhase: PlanPhase | null,
): LevelTransitionDecision {
  if (
    summary.difficulty_signal === "blocking" ||
    summary.next_plan_coherence === "no" ||
    summary.global_metric_state === "regressed"
  ) {
    return nextPhase?.duration_weeks && nextPhase.duration_weeks > 1 ? "extend" : "lighten";
  }

  if (
    summary.global_metric_state === "strong_progress" &&
    summary.next_plan_coherence === "yes" &&
    summary.difficulty_signal === "no"
  ) {
    return nextPhase?.duration_weeks && nextPhase.duration_weeks > 1 ? "shorten" : "keep";
  }

  if (
    summary.difficulty_signal === "minor" ||
    summary.next_plan_coherence === "not_sure" ||
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
