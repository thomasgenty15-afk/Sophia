/**
 * KEEL W6.2 — `publishPlan()`: the coach's prescription becomes the student's
 * live contract.
 *
 * Authority: docs/keel/BUILD_PLAN.md W6.2, docs/keel/SCHEMA.md (`plan_versions`),
 * docs/keel/CONTRACT.md ("Execution truth", R7).
 *
 * ---------------------------------------------------------------------------
 * THE ORDER IS THE CONTENT OF THIS FILE
 * ---------------------------------------------------------------------------
 * `plan_versions` carries a PARTIAL UNIQUE INDEX: one `published` row per
 * student (`plan_versions_one_published_per_student_idx`). That index is the
 * product rule "a student follows exactly one plan", and it is not something to
 * bump into — it is something to sequence around:
 *
 *   1. insert the new version as `draft`      — no conflict is possible
 *   2. insert its commitments                 — children of a draft nobody reads
 *   3. old `published` -> `superseded`        — the seat opens
 *   4. new `draft` -> `published`             — the seat is taken
 *   5. reseedOnPublish()                      — kill what the old plan left in flight
 *   6. coach_access_events                    — the regulatory trace
 *
 * Between 3 and 4 the student has NO published plan. That window is a few
 * milliseconds wide, and it is the only ordering that never violates the index.
 * The reverse order (publish then supersede) violates it deterministically;
 * "insert straight as published" violates it deterministically too. So the
 * window is accepted, made as small as possible, and — crucially — COMPENSATED:
 * if step 4 fails, step 3 is undone (the old version goes back to `published`)
 * and the draft is dropped. A failed publish must not leave a student with a
 * plan that no longer exists.
 *
 * WHY STEP 5 IS NOT OPTIONAL
 * `reseedOnPublish` (W4.2) had ZERO callers before this file. Without it,
 * republishing leaves the previous version's evaluations and reminders in
 * flight: on Thursday the student is reminded of a line the coach withdrew on
 * Wednesday, and then marked `missed` for it. That is the phantom-commit class
 * this repo has already paid for. Step 5 runs INSIDE the publish, and its
 * failure is reported — never swallowed.
 *
 * WHY STEP 6 IS LAST
 * `coach_access_events` is a regulatory trace: the coach is the prescriber and
 * the approval clicks are the evidence. A trace written before the publish
 * would attest an approval of a version that may not exist. Written after, it
 * only ever describes something that happened.
 */

import {
  applyDiff,
  buildCommitmentRows,
  type CommitmentContext,
  type Json,
  type PlanDiff,
} from "./commitments.ts";
import type { DbRow, PublishPorts } from "./ports.ts";

/** R1: an audit token is ASCII snake_case English. */
const SECTION_TOKEN_RE = /^[a-z][a-z0-9_]{0,48}$/;

/** Surface prefix written to coach_access_events for a per-section approval. */
export const APPROVAL_SURFACE_PREFIX = "plan_publish_approval_";
/** Surface written once for the publication itself. */
export const PUBLISH_SURFACE = "plan_publish";

/**
 * An approval click cannot be older than this. The trace answers "when did the
 * coach approve this section", so a timestamp from last month attached to
 * today's publish is not a trace, it is a claim. Refused, loudly.
 */
export const APPROVAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Clock skew tolerated on a client-supplied timestamp. */
export const APPROVAL_MAX_SKEW_MS = 5 * 60 * 1000;

export interface SectionApproval {
  section: string;
  approved_at: string;
}

export interface PlanHeaderInput {
  title: string;
  content_locale: string;
  timezone: string;
  anchor_week_start?: string | null;
  duration_weeks?: number | null;
  week_starts_on?: string | null;
  phase_plan?: unknown;
  adherence_target_pct?: number | null;
  flex_allowance_per_week?: number | null;
  notes_for_student?: string | null;
}

export interface PublishRequest {
  coachId: string;
  studentId: string;
  plan: PlanHeaderInput;
  templateId?: string | null;
  sourceDocumentId?: string | null;
  /** Explicit line list (review screen). Mutually exclusive with templateId. */
  commitments?: readonly unknown[];
  /** Per-student diff over the template skeleton. Requires templateId. */
  diff?: PlanDiff | null;
  approvals: readonly SectionApproval[];
}

export interface PublishResult {
  planVersion: DbRow;
  commitments: DbRow[];
  supersededVersionId: string | null;
  approvalsRecorded: number;
  reseed: {
    evaluationsInvalidated: number;
    checkinsCancelled: number;
    rowsSeeded: number;
    sameDaySeedSkippedReason: string | null;
  };
}

/** A refusal the caller renders as 400 with the exact issues. */
export class PublishValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`[plan-publish-v1] refused: ${issues.length} issue(s)`);
    this.name = "PublishValidationError";
    this.issues = issues;
  }
}

/**
 * The publish committed but a POST-publish step failed. The distinction
 * matters to the caller: the plan IS live, so retrying the whole publish would
 * create a second version. What must be retried is the failed step.
 */
export class PostPublishError extends Error {
  readonly planVersionId: string;
  readonly stage: "reseed" | "audit";
  constructor(planVersionId: string, stage: "reseed" | "audit", cause: unknown) {
    super(
      `[plan-publish-v1] plan_version ${planVersionId} IS published, but the ` +
        `"${stage}" step failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "PostPublishError";
    this.planVersionId = planVersionId;
    this.stage = stage;
  }
}

const WEEK_START_TOKENS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function validateApprovals(
  approvals: readonly SectionApproval[],
  now: Date,
): string[] {
  const issues: string[] = [];
  if (approvals.length === 0) {
    // The coach stays the prescriber: a plan publishes because a human clicked
    // "approve", and the click is what the trace records. No click, no publish.
    issues.push(
      "approvals: at least one section approval is required — the coach is the " +
        "prescriber and the approval click is the regulatory trace",
    );
    return issues;
  }
  const seen = new Set<string>();
  approvals.forEach((a, i) => {
    const section = String(a?.section ?? "");
    if (!SECTION_TOKEN_RE.test(section)) {
      issues.push(
        `approvals[${i}].section: ${JSON.stringify(section)} is not an ASCII ` +
          "snake_case token (R1)",
      );
    } else if (seen.has(section)) {
      issues.push(`approvals[${i}].section: duplicate section "${section}"`);
    } else {
      seen.add(section);
    }
    const raw = String(a?.approved_at ?? "");
    const at = new Date(raw);
    if (!raw || Number.isNaN(at.getTime())) {
      issues.push(`approvals[${i}].approved_at: ${JSON.stringify(raw)} is not a valid timestamp`);
      return;
    }
    const delta = at.getTime() - now.getTime();
    if (delta > APPROVAL_MAX_SKEW_MS) {
      issues.push(`approvals[${i}].approved_at: timestamp is in the future`);
    } else if (-delta > APPROVAL_MAX_AGE_MS) {
      issues.push(
        `approvals[${i}].approved_at: older than 24h — re-approve before publishing`,
      );
    }
  });
  return issues;
}

function validateHeader(plan: PlanHeaderInput): string[] {
  const issues: string[] = [];
  if (!String(plan?.title ?? "").trim()) issues.push("plan.title is required");
  if (!String(plan?.content_locale ?? "").trim()) {
    issues.push("plan.content_locale is required (R2)");
  }
  if (!String(plan?.timezone ?? "").trim()) {
    issues.push("plan.timezone is required (the day boundary is a plan property)");
  }
  const ws = plan?.week_starts_on;
  if (ws !== undefined && ws !== null && !WEEK_START_TOKENS.includes(String(ws))) {
    issues.push(
      `plan.week_starts_on: unknown token ${JSON.stringify(ws)}. ` +
        `Expected one of: ${WEEK_START_TOKENS.join(", ")}`,
    );
  }
  const aws = plan?.anchor_week_start;
  if (aws !== undefined && aws !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(aws))) {
    issues.push("plan.anchor_week_start: expected YYYY-MM-DD");
  }
  return issues;
}

export async function publishPlan(args: {
  ports: PublishPorts;
  request: PublishRequest;
  now?: Date;
}): Promise<PublishResult> {
  const { ports, request } = args;
  const now = args.now ?? new Date();

  // -----------------------------------------------------------------------
  // 0. VALIDATION — everything that can be refused is refused BEFORE any write
  // -----------------------------------------------------------------------
  const issues: string[] = [
    ...validateHeader(request.plan),
    ...validateApprovals(request.approvals, now),
  ];

  const hasTemplate = Boolean(request.templateId);
  const hasExplicit = Array.isArray(request.commitments);
  if (hasTemplate === hasExplicit) {
    issues.push(
      "provide exactly one of `template_id` (clone + diff) or `commitments` " +
        "(explicit line list)",
    );
  }
  if (!hasTemplate && request.diff) {
    issues.push("`diff` requires `template_id`: there is no skeleton to diff against");
  }
  if (issues.length > 0) throw new PublishValidationError(issues);

  // -----------------------------------------------------------------------
  // 1. CLONE + DIFF
  // -----------------------------------------------------------------------
  let template: DbRow | null = null;
  let effective: readonly unknown[];
  if (hasTemplate) {
    template = await ports.loadTemplate({
      templateId: String(request.templateId),
      coachId: request.coachId,
    });
    if (!template) {
      // Scoped read: a template that belongs to another coach is simply not
      // found. Same answer for "does not exist" and "not yours" — a publish
      // endpoint must not be a template-existence oracle.
      throw new PublishValidationError([
        `template_id ${request.templateId} not found for this coach`,
      ]);
    }
    const skeleton = Array.isArray(template.commitments)
      ? template.commitments as unknown[]
      : [];
    try {
      effective = applyDiff(skeleton, request.diff ?? null);
    } catch (err) {
      throw new PublishValidationError([
        err instanceof Error ? err.message : String(err),
      ]);
    }
  } else {
    effective = request.commitments ?? [];
  }

  if (effective.length === 0) {
    throw new PublishValidationError([
      "a published plan needs at least one commitment",
    ]);
  }

  // -----------------------------------------------------------------------
  // 2. THE VERSION HEADER
  // -----------------------------------------------------------------------
  const [current, maxVersion] = await Promise.all([
    ports.loadCurrentPublished(request.studentId),
    ports.loadMaxVersion(request.studentId),
  ]);
  const supersedesId = current ? String(current.id) : null;

  const templateDefaults = {
    adherence: template ? Number(template.default_adherence_target_pct ?? 80) : 80,
    flex: template ? Number(template.default_flex_allowance ?? 4) : 4,
    autonomy: template ? String(template.default_autonomy ?? "strict") : null,
    swapPolicy: template && template.default_swap_policy &&
        typeof template.default_swap_policy === "object"
      ? template.default_swap_policy as Json
      : null,
  };

  const draftRow: Json = {
    coach_id: request.coachId,
    student_id: request.studentId,
    template_id: request.templateId ?? null,
    source_document_id: request.sourceDocumentId ?? null,
    version: maxVersion + 1,
    status: "draft",
    title: request.plan.title,
    content_locale: request.plan.content_locale,
    timezone: request.plan.timezone,
    anchor_week_start: request.plan.anchor_week_start ?? null,
    duration_weeks: request.plan.duration_weeks ?? null,
    week_starts_on: request.plan.week_starts_on ?? "mon",
    phase_plan: request.plan.phase_plan ?? [],
    adherence_target_pct: request.plan.adherence_target_pct ??
      templateDefaults.adherence,
    flex_allowance_per_week: request.plan.flex_allowance_per_week ??
      templateDefaults.flex,
    supersedes_version_id: supersedesId,
    notes_for_student: request.plan.notes_for_student ?? null,
  };

  const draft = await ports.insertDraftVersion(draftRow);
  const draftId = String(draft.id);

  // -----------------------------------------------------------------------
  // 3. THE COMMITMENTS (still under a draft: nothing is live yet)
  // -----------------------------------------------------------------------
  const ctx: CommitmentContext = {
    planVersionId: draftId,
    studentId: request.studentId,
    coachId: request.coachId,
    planContentLocale: request.plan.content_locale,
    defaultAutonomy: templateDefaults.autonomy,
    defaultSwapPolicy: templateDefaults.swapPolicy,
  };
  const built = buildCommitmentRows(effective, ctx);
  if (built.issues.length > 0) {
    // The draft exists but nothing is live. Remove it so a refused publish
    // leaves no orphan version behind, then refuse.
    await ports.deleteDraftVersion(draftId).catch(() => {});
    throw new PublishValidationError(built.issues);
  }

  let commitments: DbRow[];
  try {
    commitments = await ports.insertCommitments(built.rows);
  } catch (err) {
    await ports.deleteDraftVersion(draftId).catch(() => {});
    throw err;
  }

  // -----------------------------------------------------------------------
  // 4. THE SWAP — supersede, then publish, with compensation
  // -----------------------------------------------------------------------
  let supersededOk = false;
  if (supersedesId) {
    const moved = await ports.markSuperseded(supersedesId);
    if (moved === 0) {
      // Another publish won the race and already moved that row. Our own
      // `loadCurrentPublished` is stale, so re-reading and pushing on would be
      // guessing. Drop the draft and let the caller retry against fresh state.
      await ports.deleteDraftVersion(draftId).catch(() => {});
      throw new PublishValidationError([
        `concurrent publish detected: plan_version ${supersedesId} is no longer ` +
          "the published one. Reload and publish again.",
      ]);
    }
    supersededOk = true;
  }

  let published: DbRow;
  try {
    published = await ports.markPublished({
      planVersionId: draftId,
      publishedBy: request.coachId,
      publishedAtIso: now.toISOString(),
    });
  } catch (err) {
    // COMPENSATION. The student must never be left with zero published plan
    // because our second write failed.
    const restoreErrors: string[] = [];
    if (supersededOk && supersedesId) {
      try {
        const restored = await ports.restorePublished(supersedesId);
        if (restored === 0) {
          restoreErrors.push(
            `plan_version ${supersedesId} could NOT be restored to published`,
          );
        }
      } catch (restoreErr) {
        restoreErrors.push(
          `restore of ${supersedesId} threw: ${
            restoreErr instanceof Error ? restoreErr.message : String(restoreErr)
          }`,
        );
      }
    }
    await ports.deleteDraftVersion(draftId).catch(() => {});
    if (restoreErrors.length > 0) {
      throw new Error(
        `[plan-publish-v1] publish failed AND compensation failed — student ` +
          `${request.studentId} may have no published plan. ` +
          `${restoreErrors.join("; ")}. Original error: ${
            err instanceof Error ? err.message : String(err)
          }`,
      );
    }
    throw err;
  }

  // -----------------------------------------------------------------------
  // 5. RE-SEED — kill what the superseded plan left in flight (W4.2)
  // -----------------------------------------------------------------------
  let reseedResult;
  try {
    reseedResult = await ports.reseed({ planVersionId: draftId, now });
  } catch (err) {
    // One retry: every step of reseedOnPublish is idempotent, and the failure
    // mode it guards against (a withdrawn line still being reminded and graded)
    // is exactly the class we refuse to leave to chance.
    try {
      reseedResult = await ports.reseed({ planVersionId: draftId, now });
    } catch (retryErr) {
      throw new PostPublishError(draftId, "reseed", retryErr);
    }
    void err;
  }

  // -----------------------------------------------------------------------
  // 6. THE REGULATORY TRACE
  // -----------------------------------------------------------------------
  const auditRows: Json[] = request.approvals.map((a) => ({
    coach_id: request.coachId,
    student_user_id: request.studentId,
    surface: `${APPROVAL_SURFACE_PREFIX}${a.section}`,
    occurred_at: new Date(a.approved_at).toISOString(),
  }));
  auditRows.push({
    coach_id: request.coachId,
    student_user_id: request.studentId,
    surface: PUBLISH_SURFACE,
    occurred_at: now.toISOString(),
  });

  let approvalsRecorded = 0;
  try {
    approvalsRecorded = await ports.insertAccessEvents(auditRows);
  } catch (err) {
    throw new PostPublishError(draftId, "audit", err);
  }

  return {
    planVersion: published,
    commitments,
    supersededVersionId: supersedesId,
    approvalsRecorded,
    reseed: {
      evaluationsInvalidated: reseedResult.evaluationsInvalidated,
      checkinsCancelled: reseedResult.checkinsCancelled,
      rowsSeeded: reseedResult.seed.inserted,
      sameDaySeedSkippedReason: reseedResult.sameDaySeedSkippedReason,
    },
  };
}
