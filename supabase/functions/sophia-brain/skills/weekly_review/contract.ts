export type {
  WeeklyDailyEvidenceSnapshot,
  WeeklyEvidenceSummary,
  WeeklyHabitVerdictStatus,
  WeeklyHumanSignals,
  WeeklyReviewAction,
  WeeklyReviewConstraint,
  WeeklyReviewDecision,
  WeeklyReviewIntent,
  WeeklyReviewStatus,
  WeeklyStrategyDecision,
} from "../../../_shared/weekly_review/contract.ts";

export type WeeklyOperationRuntimeResult = {
  content?: string;
  additionalContents?: string[];
  nextTempMemory?: unknown;
  toolExecution:
    | "none"
    | "blocked"
    | "success"
    | "failed"
    | "uncertain"
    | "platform_handoff";
  executedTools: string[];
  toolSkillRun?: Record<string, unknown>;
};

export const WEEKLY_REVIEW_MIGRATION_STATUS = {
  standard_target:
    "contract -> structured_intake -> reducer -> response/effects -> renderer",
  current_shape: "contract/projection -> reducer -> effects -> renderer",
  documented_exception:
    "weekly_review exits to global for out-of-scope tool requests and never routes directly to retired child flows.",
  durable_effect_policy:
    "weekly conversation does not apply durable plan changes directly; plan adjustments are completed in the platform",
} as const;
