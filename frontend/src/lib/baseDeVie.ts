import type {
  BaseDeVieLineEntry,
  BaseDeVieDeclics,
  PlanContentV2,
  PlanContentV3,
  PlanItemStatus,
  TransformationClosureFeedback,
  TransformationClosureHelpfulnessArea,
  TransformationClosureImprovementReason,
  UserTransformationBaseDeViePayload,
  UserTransformationRow,
} from "../types/v2";

const TERMINAL_PLAN_ITEM_STATUSES = new Set<PlanItemStatus>([
  "completed",
  "in_maintenance",
  "deactivated",
  "cancelled",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown, maxLength = 1600): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.slice(0, maxLength);
}

function normalizeLineRedEntries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map((entry) => normalizeText(entry, 220))
      .filter(Boolean)
      .slice(0, 8),
  )];
}

function normalizeDeclics(value: unknown): BaseDeVieDeclics | null {
  if (!isRecord(value)) return null;

  const why = normalizeText(value.why);
  const insight = normalizeText(value.insight);
  const identityShift = normalizeText(value.identity_shift);

  if (!why || !insight || !identityShift) return null;

  return {
    why,
    insight,
    identity_shift: identityShift,
  };
}

function normalizeLineEntry(value: unknown): BaseDeVieLineEntry | null {
  if (!isRecord(value)) return null;

  const action = normalizeText(value.action, 220);
  const why = normalizeText(value.why, 1000);

  if (!action || !why) return null;

  return {
    action,
    why,
  };
}

const IMPROVEMENT_REASONS = new Set<TransformationClosureImprovementReason>([
  "plan_unclear",
  "pace_too_intense",
  "actions_too_hard",
  "actions_not_real_life",
  "sophia_not_helpful_moment",
  "progress_not_visible",
  "need_more_support",
  "other",
]);

const HELPFULNESS_AREAS = new Set<TransformationClosureHelpfulnessArea>([
  "habits",
  "one_off_actions",
  "sophia_messages",
  "plan_structure",
  "progress_tracking",
  "other",
]);

function normalizeClosureFeedback(value: unknown): TransformationClosureFeedback | null {
  if (!isRecord(value)) return null;

  const helpfulnessRating = Number(value.helpfulness_rating);
  const rating = Number.isInteger(helpfulnessRating) &&
      helpfulnessRating >= 1 &&
      helpfulnessRating <= 10
    ? helpfulnessRating
    : null;

  const mostHelpfulArea = HELPFULNESS_AREAS.has(value.most_helpful_area as TransformationClosureHelpfulnessArea)
    ? value.most_helpful_area as TransformationClosureHelpfulnessArea
    : null;

  if (rating == null || !mostHelpfulArea) return null;

  const improvementReasons = Array.isArray(value.improvement_reasons)
    ? value.improvement_reasons
      .map((item) => String(item ?? "").trim())
      .filter((item): item is TransformationClosureImprovementReason =>
        IMPROVEMENT_REASONS.has(item as TransformationClosureImprovementReason)
      )
      .slice(0, 8)
    : [];

  return {
    helpfulness_rating: rating,
    improvement_reasons: [...new Set(improvementReasons)],
    improvement_detail: normalizeText(value.improvement_detail, 1600) || null,
    most_helpful_area: mostHelpfulArea,
  };
}

export function getBaseDeViePayload(
  value: unknown,
): UserTransformationBaseDeViePayload | null {
  if (!isRecord(value)) return null;

  return {
    line_red_entries: normalizeLineRedEntries(value.line_red_entries),
    line_green_entry: normalizeLineEntry(value.line_green_entry),
    line_red_entry: normalizeLineEntry(value.line_red_entry),
    declics_draft: normalizeDeclics(value.declics_draft),
    declics_user: normalizeDeclics(value.declics_user),
    closure_feedback: normalizeClosureFeedback(value.closure_feedback),
    validated_at: normalizeText(value.validated_at, 80) || null,
    last_edited_at: normalizeText(value.last_edited_at, 80) || null,
  };
}

function buildDraftFromStrings(args: {
  title: string;
  summary: string;
  successDefinition: string;
  identityShift: string;
  completedItemTitles: string[];
}): BaseDeVieDeclics {
  const why = args.successDefinition || args.summary || `J'allais au bout de ${args.title}.`;
  const insight = args.completedItemTitles.length > 0
    ? `Ce qui a vraiment pris pour moi: ${args.completedItemTitles.slice(0, 2).join(" et ")}.`
    : args.summary || `J'ai clarifié ce que ${args.title.toLowerCase()} demandait vraiment.`;
  const identityShift = args.identityShift || `Je ne traite plus "${args.title}" comme un sujet abstrait.`;

  return {
    why: normalizeText(why),
    insight: normalizeText(insight),
    identity_shift: normalizeText(identityShift),
  };
}

export function buildBaseDeVieDraft(args: {
  transformation: UserTransformationRow;
  activePlanContent: PlanContentV2 | PlanContentV3 | null;
  completedItemTitles: string[];
}): BaseDeVieDeclics {
  const transformationTitle = normalizeText(
    args.transformation.title ?? `Transformation ${args.transformation.priority_order}`,
    180,
  );
  const summary = normalizeText(
    args.transformation.user_summary ||
      args.transformation.completion_summary ||
      args.transformation.internal_summary,
  );
  const successDefinition = normalizeText(
    args.activePlanContent?.strategy.success_definition ??
      args.transformation.success_definition ??
      "",
  );
  const identityShift = normalizeText(
    args.activePlanContent?.strategy.identity_shift ??
      args.transformation.title ??
      "",
  );

  return buildDraftFromStrings({
    title: transformationTitle || "cette transformation",
    summary,
    successDefinition,
    identityShift,
    completedItemTitles: args.completedItemTitles
      .map((title) => normalizeText(title, 120))
      .filter(Boolean)
      .slice(0, 3),
  });
}

export function isPlanReadyForClosure(statuses: PlanItemStatus[]): boolean {
  return statuses.length > 0 && statuses.every((status) => TERMINAL_PLAN_ITEM_STATUSES.has(status));
}

export function formatBaseDeVieDate(value: string | null | undefined): string {
  if (!value) return "Date inconnue";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
