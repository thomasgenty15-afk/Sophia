import type {
  CurrentLevelRuntime,
  HeartbeatMetric,
  LevelReviewAnswerMap,
  LevelReviewQuestion,
  LevelReviewSummary,
  PlanBlueprint,
  PlanBlueprintLevel,
  PlanContentItem,
  PlanContentV3,
  PlanLevelWeek,
  PlanPhase,
  UserPlanItemRow,
} from "./v2-types.ts";

export type NextLevelGenerationDecision =
  | "keep"
  | "adjust_next_level"
  | "lighten_next_level"
  | "redirect_next_level"
  | "adjust_future_sequence";

export type NextLevelGenerationPatch = {
  decision: NextLevelGenerationDecision;
  decision_reason: string;
  next_level: {
    phase_id: string;
    level_order: number;
    title: string;
    phase_objective: string;
    rationale: string;
    what_this_phase_targets: string | null;
    why_this_now: string | null;
    how_this_phase_works: string | null;
    duration_weeks: number;
    phase_metric_target: string | null;
    maintained_foundation: string[];
    heartbeat: HeartbeatMetric;
    items: PlanContentItem[];
    weeks: PlanLevelWeek[];
    review_focus: string[];
  };
  future_blueprint_levels: PlanBlueprintLevel[];
  continuity_notes: {
    kept_from_previous_level: string[];
    changed_because_of_review: string[];
    protected_global_logic: string[];
  };
};

export type NextLevelGenerationValidationContext = {
  currentLevelOrder: number;
  completedPhaseId: string;
  expectedNextBlueprint: PlanBlueprintLevel;
  existingCompletedTempIds: string[];
  globalObjective: string;
};

export type NextLevelGenerationValidationResult = {
  valid: boolean;
  issues: string[];
};

export type NextLevelGenerationPromptContext = {
  plan: PlanContentV3;
  currentLevelRuntime: CurrentLevelRuntime;
  completedPhase: PlanPhase;
  completedLevelItems: UserPlanItemRow[];
  nextBlueprintLevel: PlanBlueprintLevel;
  futureBlueprintLevels: PlanBlueprintLevel[];
  reviewSchema: LevelReviewQuestion[];
  answers: LevelReviewAnswerMap;
  summary: LevelReviewSummary;
  weeklySignals: Array<Record<string, unknown>>;
  initialDecision: string;
  initialDecisionReason: string;
  reviewMode: "user_review" | "auto_timeout";
  transformationContext: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown, min = 0): value is string[] {
  return Array.isArray(value) &&
    value.length >= min &&
    value.every((entry) => isNonEmptyString(entry));
}

const VALID_PLAN_ITEM_KINDS = new Set([
  "framework",
  "exercise",
  "task",
  "milestone",
  "habit",
]);

const VALID_TRACKING_TYPES = new Set([
  "boolean",
  "count",
  "scale",
  "text",
  "milestone",
]);

const VALID_SUPPORT_MODES = new Set([
  "always_available",
  "recommended_now",
  "unlockable",
]);

const VALID_SUPPORT_FUNCTIONS = new Set([
  "practice",
  "rescue",
  "understanding",
]);

function validateHeartbeat(value: unknown, label: string): string[] {
  const issues: string[] = [];
  if (!isRecord(value)) return [`${label} must be an object`];
  if (!isNonEmptyString(value.title)) issues.push(`${label}.title is required`);
  if (!isNonEmptyString(value.unit)) issues.push(`${label}.unit is required`);
  if (
    typeof value.target !== "number" ||
    !Number.isFinite(value.target) ||
    value.target < 0
  ) {
    issues.push(`${label}.target must be a finite number >= 0`);
  }
  if (value.current !== null && value.current !== undefined) {
    if (typeof value.current !== "number" || !Number.isFinite(value.current)) {
      issues.push(`${label}.current must be a finite number or null`);
    }
  }
  if (value.tracking_mode !== "manual" && value.tracking_mode !== "inferred") {
    issues.push(`${label}.tracking_mode must be manual or inferred`);
  }
  return issues;
}

function validatePlanItem(
  value: unknown,
  index: number,
  expectedTempPrefix: string,
): string[] {
  const label = `next_level.items[${index}]`;
  const issues: string[] = [];
  if (!isRecord(value)) return [`${label} must be an object`];
  const tempId = typeof value.temp_id === "string" ? value.temp_id.trim() : "";
  if (!tempId.startsWith(expectedTempPrefix)) {
    issues.push(`${label}.temp_id must start with ${expectedTempPrefix}`);
  }
  if (
    !["missions", "habits", "clarifications", "support"].includes(
      String(value.dimension ?? ""),
    )
  ) {
    issues.push(`${label}.dimension is invalid`);
  }
  const kind = String(value.kind ?? "");
  if (!isNonEmptyString(value.kind)) {
    issues.push(`${label}.kind is required`);
  } else if (!VALID_PLAN_ITEM_KINDS.has(kind)) {
    issues.push(
      `${label}.kind must be one of ${[...VALID_PLAN_ITEM_KINDS].join(", ")}`,
    );
  }
  if (!isNonEmptyString(value.title)) issues.push(`${label}.title is required`);
  if (!isNonEmptyString(value.description)) {
    issues.push(`${label}.description is required`);
  }
  const trackingType = String(value.tracking_type ?? "");
  if (!isNonEmptyString(value.tracking_type)) {
    issues.push(`${label}.tracking_type is required`);
  } else if (!VALID_TRACKING_TYPES.has(trackingType)) {
    issues.push(
      `${label}.tracking_type must be one of ${
        [...VALID_TRACKING_TYPES].join(", ")
      }`,
    );
  }
  const timeOfDay = value.time_of_day;
  if (timeOfDay !== null && timeOfDay !== undefined) {
    const normalizedTimeOfDay = typeof timeOfDay === "string"
      ? timeOfDay.trim()
      : "";
    if (
      !["anytime", "morning", "afternoon", "evening"].includes(
        normalizedTimeOfDay,
      )
    ) {
      issues.push(
        `${label}.time_of_day must be null, anytime, morning, afternoon, or evening`,
      );
    }
  }
  const supportMode = value.support_mode;
  const supportFunction = value.support_function;
  if (supportMode !== null && supportMode !== undefined) {
    const normalizedSupportMode = typeof supportMode === "string"
      ? supportMode.trim()
      : "";
    if (!VALID_SUPPORT_MODES.has(normalizedSupportMode)) {
      issues.push(
        `${label}.support_mode must be null or one of ${
          [...VALID_SUPPORT_MODES].join(", ")
        }`,
      );
    }
  }
  if (supportFunction !== null && supportFunction !== undefined) {
    const normalizedSupportFunction = typeof supportFunction === "string"
      ? supportFunction.trim()
      : "";
    if (!VALID_SUPPORT_FUNCTIONS.has(normalizedSupportFunction)) {
      issues.push(
        `${label}.support_function must be null or one of ${
          [...VALID_SUPPORT_FUNCTIONS].join(", ")
        }`,
      );
    }
  }
  if (
    value.dimension !== "support" &&
    (
      supportMode !== null && supportMode !== undefined ||
      supportFunction !== null && supportFunction !== undefined
    )
  ) {
    issues.push(
      `${label}.support_mode and support_function must be null for non-support items`,
    );
  }
  if (value.activation_order !== null && value.activation_order !== undefined) {
    if (
      typeof value.activation_order !== "number" ||
      !Number.isInteger(value.activation_order) ||
      value.activation_order < 1
    ) {
      issues.push(`${label}.activation_order must be an integer >= 1 or null`);
    }
  }
  if (!isRecord(value.payload)) {
    issues.push(`${label}.payload must be an object`);
  }
  return issues;
}

function validateWeek(
  value: unknown,
  index: number,
  itemByTempId: Map<string, Record<string, unknown>>,
  nonHabitUsage: Map<string, number>,
): string[] {
  const label = `next_level.weeks[${index}]`;
  const issues: string[] = [];
  if (!isRecord(value)) return [`${label} must be an object`];
  if (value.week_order !== index + 1) {
    issues.push(`${label}.week_order must be ${index + 1}`);
  }
  if (!isNonEmptyString(value.title)) issues.push(`${label}.title is required`);
  if (!Array.isArray(value.mission_days)) {
    issues.push(`${label}.mission_days must be an array`);
  }
  if (value.reps_summary !== null && !isNonEmptyString(value.reps_summary)) {
    issues.push(`${label}.reps_summary must be a non-empty string or null`);
  }
  if (
    value.success_signal !== null && !isNonEmptyString(value.success_signal)
  ) {
    issues.push(`${label}.success_signal must be a non-empty string or null`);
  }

  const assignments = Array.isArray(value.item_assignments)
    ? value.item_assignments
    : [];
  if (assignments.length === 0) {
    issues.push(`${label}.item_assignments must contain at least one item`);
    return issues;
  }

  let hasHabit = false;
  let hasNonHabit = false;
  for (const assignment of assignments) {
    if (!isRecord(assignment) || !isNonEmptyString(assignment.temp_id)) {
      issues.push(`${label}.item_assignments entries must include temp_id`);
      continue;
    }
    const item = itemByTempId.get(assignment.temp_id);
    if (!item) {
      issues.push(`${label} references unknown temp_id ${assignment.temp_id}`);
      continue;
    }
    if (item.dimension === "habits") {
      hasHabit = true;
    } else {
      hasNonHabit = true;
      nonHabitUsage.set(
        assignment.temp_id,
        (nonHabitUsage.get(assignment.temp_id) ?? 0) + 1,
      );
    }
  }

  if (!hasHabit) issues.push(`${label} must contain at least one habit`);
  if (!hasNonHabit) {
    issues.push(`${label} must contain at least one mission or clarification`);
  }
  return issues;
}

export function validateNextLevelGenerationPatch(
  raw: unknown,
  context: NextLevelGenerationValidationContext,
): NextLevelGenerationValidationResult {
  const issues: string[] = [];
  if (!isRecord(raw)) {
    return { valid: false, issues: ["output must be an object"] };
  }
  const patch = raw as Record<string, unknown>;

  if (
    ![
      "keep",
      "adjust_next_level",
      "lighten_next_level",
      "redirect_next_level",
      "adjust_future_sequence",
    ]
      .includes(String(patch.decision ?? ""))
  ) {
    issues.push("decision is invalid");
  }
  if (!isNonEmptyString(patch.decision_reason)) {
    issues.push("decision_reason is required");
  }

  const nextLevel = isRecord(patch.next_level) ? patch.next_level : null;
  if (!nextLevel) {
    issues.push("next_level must be an object");
  } else {
    const expectedOrder = context.currentLevelOrder + 1;
    const expectedPhaseId = context.expectedNextBlueprint.phase_id;
    const expectedTempPrefix = `gen-p${expectedOrder}-`;
    if (nextLevel.level_order !== expectedOrder) {
      issues.push(`next_level.level_order must be ${expectedOrder}`);
    }
    if (nextLevel.phase_id !== expectedPhaseId) {
      issues.push(`next_level.phase_id must be ${expectedPhaseId}`);
    }
    for (const field of ["title", "phase_objective", "rationale"]) {
      if (!isNonEmptyString(nextLevel[field])) {
        issues.push(`next_level.${field} is required`);
      }
    }
    if (
      typeof nextLevel.duration_weeks !== "number" ||
      !Number.isInteger(nextLevel.duration_weeks) ||
      nextLevel.duration_weeks < 1 ||
      nextLevel.duration_weeks > 12
    ) {
      issues.push(
        "next_level.duration_weeks must be an integer between 1 and 12",
      );
    }
    if (!isStringArray(nextLevel.maintained_foundation)) {
      issues.push("next_level.maintained_foundation must be a string[]");
    }
    if (!isStringArray(nextLevel.review_focus, 1)) {
      issues.push("next_level.review_focus must contain at least one string");
    }
    issues.push(
      ...validateHeartbeat(nextLevel.heartbeat, "next_level.heartbeat"),
    );

    const rawItems = Array.isArray(nextLevel.items) ? nextLevel.items : [];
    if (rawItems.length < 1) {
      issues.push("next_level.items must contain at least one item");
    }
    const itemByTempId = new Map<string, Record<string, unknown>>();
    let hasHabit = false;
    let hasMission = false;
    for (let index = 0; index < rawItems.length; index += 1) {
      issues.push(
        ...validatePlanItem(rawItems[index], index, expectedTempPrefix),
      );
      if (!isRecord(rawItems[index])) continue;
      const tempId = typeof rawItems[index].temp_id === "string"
        ? rawItems[index].temp_id.trim()
        : "";
      if (!tempId) continue;
      if (context.existingCompletedTempIds.includes(tempId)) {
        issues.push(
          `next_level item ${tempId} reuses a completed-level temp_id`,
        );
      }
      if (itemByTempId.has(tempId)) {
        issues.push(`duplicate next_level item temp_id ${tempId}`);
      }
      itemByTempId.set(tempId, rawItems[index]);
      if (rawItems[index].dimension === "habits") hasHabit = true;
      if (rawItems[index].dimension === "missions") hasMission = true;
    }
    if (!hasHabit) {
      issues.push("next_level.items must include at least one habit");
    }
    if (!hasMission) {
      issues.push("next_level.items must include at least one mission");
    }

    const rawWeeks = Array.isArray(nextLevel.weeks) ? nextLevel.weeks : [];
    if (rawWeeks.length !== nextLevel.duration_weeks) {
      issues.push(
        "next_level.weeks length must equal next_level.duration_weeks",
      );
    }
    const nonHabitUsage = new Map<string, number>();
    for (let index = 0; index < rawWeeks.length; index += 1) {
      issues.push(
        ...validateWeek(rawWeeks[index], index, itemByTempId, nonHabitUsage),
      );
    }
    for (const [tempId, count] of nonHabitUsage.entries()) {
      const item = itemByTempId.get(tempId);
      if (item?.dimension !== "habits" && count > 1) {
        issues.push(
          `next_level item ${tempId} is duplicated across multiple weeks`,
        );
      }
    }
  }

  const futureLevels = Array.isArray(patch.future_blueprint_levels)
    ? patch.future_blueprint_levels
    : null;
  if (!futureLevels) {
    issues.push("future_blueprint_levels must be an array");
  } else {
    let expectedOrder = context.currentLevelOrder + 2;
    for (const level of futureLevels) {
      if (!isRecord(level)) {
        issues.push("future_blueprint_levels entries must be objects");
        continue;
      }
      if (level.level_order !== expectedOrder) {
        issues.push(
          `future_blueprint_levels must be contiguous; expected ${expectedOrder}`,
        );
      }
      if (!isNonEmptyString(level.phase_id)) {
        issues.push("future blueprint phase_id is required");
      }
      if (!isNonEmptyString(level.title)) {
        issues.push("future blueprint title is required");
      }
      if (!isNonEmptyString(level.intention)) {
        issues.push("future blueprint intention is required");
      }
      if (
        typeof level.estimated_duration_weeks !== "number" ||
        !Number.isInteger(level.estimated_duration_weeks) ||
        level.estimated_duration_weeks < 1
      ) {
        issues.push(
          "future blueprint estimated_duration_weeks must be an integer >= 1",
        );
      }
      expectedOrder += 1;
    }
  }

  if (!isRecord(patch.continuity_notes)) {
    issues.push("continuity_notes must be an object");
  } else {
    for (
      const field of [
        "kept_from_previous_level",
        "changed_because_of_review",
        "protected_global_logic",
      ]
    ) {
      if (!isStringArray(patch.continuity_notes[field], 1)) {
        issues.push(
          `continuity_notes.${field} must contain at least one string`,
        );
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

export function castNextLevelGenerationPatch(
  raw: unknown,
): NextLevelGenerationPatch {
  return raw as NextLevelGenerationPatch;
}

export function buildPhaseFromNextLevelPatch(
  patch: NextLevelGenerationPatch,
): PlanPhase {
  const level = patch.next_level;
  return {
    phase_id: level.phase_id,
    phase_order: level.level_order,
    title: level.title,
    rationale: level.rationale,
    phase_objective: level.phase_objective,
    duration_guidance: `${level.duration_weeks} semaine${
      level.duration_weeks > 1 ? "s" : ""
    }`,
    duration_weeks: level.duration_weeks,
    what_this_phase_targets: level.what_this_phase_targets,
    why_this_now: level.why_this_now,
    how_this_phase_works: level.how_this_phase_works,
    phase_metric_target: level.phase_metric_target,
    maintained_foundation: level.maintained_foundation,
    heartbeat: level.heartbeat,
    weeks: level.weeks,
    items: level.items,
  };
}

export function buildRuntimeFromNextLevelPatch(
  patch: NextLevelGenerationPatch,
): CurrentLevelRuntime {
  const level = patch.next_level;
  return {
    phase_id: level.phase_id,
    level_order: level.level_order,
    title: level.title,
    phase_objective: level.phase_objective,
    rationale: level.rationale,
    what_this_phase_targets: level.what_this_phase_targets,
    why_this_now: level.why_this_now,
    how_this_phase_works: level.how_this_phase_works,
    duration_weeks: level.duration_weeks,
    phase_metric_target: level.phase_metric_target,
    maintained_foundation: level.maintained_foundation,
    heartbeat: level.heartbeat,
    weeks: level.weeks.map((week, index) => ({
      ...week,
      week_order: index + 1,
      status: index === 0 ? "current" : "upcoming",
    })),
    review_focus: level.review_focus,
  };
}

export function buildBlueprintFromNextLevelPatch(
  plan: PlanContentV3,
  patch: NextLevelGenerationPatch,
): PlanBlueprint {
  const levels = patch.future_blueprint_levels.map((level) => ({
    ...level,
    status: "upcoming" as const,
  }));
  return {
    global_objective: plan.global_objective,
    estimated_levels_count: levels.length,
    levels,
  };
}
