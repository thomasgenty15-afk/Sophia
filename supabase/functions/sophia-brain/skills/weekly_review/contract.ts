export type {
  WeeklyDailyEvidenceSnapshot,
  WeeklyEvidenceSummary,
  WeeklyHabitVerdictStatus,
  WeeklyHumanSignals,
  WeeklyReviewAction,
  WeeklyReviewConstraint,
  WeeklyReviewDecision,
  WeeklyReviewIntent,
  WeeklyReviewPlanPatch,
  WeeklyReviewStatus,
  WeeklyStrategyDecision,
} from "../../../_shared/weekly_review/contract.ts";

export type WeeklyOperationRuntimeResult = {
  content?: string;
  additionalContents?: string[];
  nextTempMemory?: unknown;
  toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain";
  executedTools: string[];
  toolSkillRun?: Record<string, unknown>;
};

export const WEEKLY_REVIEW_MIGRATION_STATUS = {
  standard_target:
    "contract -> structured_intake -> reducer -> response/effects -> renderer",
  current_shape:
    "contract/projection -> reducer -> bridge/effects -> renderer, with legacy runtime guards",
  documented_exception:
    "weekly_review keeps existing runtime names and remains hybrid while adjust_plan_item owns durable confirmation and execution.",
  durable_effect_policy:
    "plan patches and bridges require confirmation; weekly conversation does not apply durable changes directly",
} as const;
