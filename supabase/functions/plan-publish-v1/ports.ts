/**
 * KEEL W6.2 — the I/O boundary of the publication.
 *
 * Same discipline as provision-day-v1/ports.ts: every database touch lives
 * behind an interface so `publishPlan()` — whose whole content is an ORDERING
 * between six writes and a compensating rollback — can be pinned by unit tests
 * without a database. The bugs this lot is about (a unique-index conflict on
 * `one published per student`, a superseded version left with nothing published
 * behind it, a re-seed that never ran) are ordering bugs. Ordering bugs are
 * only testable against a call log.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import type { ReseedOnPublishResult } from "../provision-day-v1/reseed_on_publish.ts";

export type DbRow = Record<string, unknown>;

export interface PublishPorts {
  /** The coach's template, scoped to the coach: a template of another coach is not readable. */
  loadTemplate(args: {
    templateId: string;
    coachId: string;
  }): Promise<DbRow | null>;

  /** The student's currently published version, or null. At most one (partial unique index). */
  loadCurrentPublished(studentId: string): Promise<DbRow | null>;

  /** Highest `version` ever issued to this student, 0 when none. */
  loadMaxVersion(studentId: string): Promise<number>;

  /** Insert the new version as a DRAFT and return the RE-READ row. */
  insertDraftVersion(row: DbRow): Promise<DbRow>;

  /** Insert the commitments of a draft version and return the RE-READ rows. */
  insertCommitments(rows: readonly DbRow[]): Promise<DbRow[]>;

  /**
   * `published` -> `superseded` for one version. Returns the number of rows
   * actually moved: 0 means somebody else got there first, and the caller must
   * not pretend the transition happened.
   */
  markSuperseded(planVersionId: string): Promise<number>;

  /** `draft` -> `published`. Returns the RE-READ row. Throws on unique conflict. */
  markPublished(args: {
    planVersionId: string;
    publishedBy: string;
    publishedAtIso: string;
  }): Promise<DbRow>;

  /** COMPENSATION: put a superseded version back to `published`. */
  restorePublished(planVersionId: string): Promise<number>;

  /** COMPENSATION: drop a draft version (its commitments cascade). */
  deleteDraftVersion(planVersionId: string): Promise<void>;

  /** Server-written audit trail. Returns the number of rows written. */
  insertAccessEvents(rows: readonly DbRow[]): Promise<number>;

  /** W4.2's `reseedOnPublish`, injected so the publish path is testable. */
  reseed(args: {
    planVersionId: string;
    now: Date;
  }): Promise<ReseedOnPublishResult>;
}

// ---------------------------------------------------------------------------
// Supabase implementation (service role)
// ---------------------------------------------------------------------------

/** Columns re-read after a write. Execution truth: we announce what we re-read. */
export const PLAN_VERSION_READBACK =
  "id, coach_id, student_id, template_id, source_document_id, version, status, " +
  "title, content_locale, timezone, anchor_week_start, duration_weeks, " +
  "week_starts_on, phase_plan, adherence_target_pct, flex_allowance_per_week, " +
  "published_at, published_by, supersedes_version_id, notes_for_student";

export const COMMITMENT_READBACK =
  "id, plan_version_id, user_id, coach_id, template_commitment_key, title, " +
  "student_instruction, content_locale, polarity, activity_class, anchor_kind, " +
  "slot_key, measure, unit, target_op, target_min, target_max, substance_ref, " +
  "food_group_ref, evidence_kind, evaluation_grain, slot_kind, scheduled_days, " +
  "required_days_per_week, priority, autonomy, provenance, status";

export function supabasePublishPorts(
  admin: SupabaseClient,
  reseed: PublishPorts["reseed"],
): PublishPorts {
  return {
    async loadTemplate({ templateId, coachId }) {
      const { data, error } = await admin
        .from("plan_templates")
        .select(
          "id, coach_id, title, content_locale, default_swap_policy, " +
            "default_autonomy, default_flex_allowance, " +
            "default_adherence_target_pct, commitments, status",
        )
        .eq("id", templateId)
        .eq("coach_id", coachId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as DbRow | null;
    },

    async loadCurrentPublished(studentId) {
      const { data, error } = await admin
        .from("plan_versions")
        .select("id, version, status, title")
        .eq("student_id", studentId)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as DbRow | null;
    },

    async loadMaxVersion(studentId) {
      const { data, error } = await admin
        .from("plan_versions")
        .select("version")
        .eq("student_id", studentId)
        .order("version", { ascending: false })
        .limit(1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as DbRow[];
      if (rows.length === 0) return 0;
      const n = Number(rows[0].version ?? 0);
      return Number.isFinite(n) ? n : 0;
    },

    async insertDraftVersion(row) {
      const { data, error } = await admin
        .from("plan_versions")
        .insert(row)
        .select(PLAN_VERSION_READBACK)
        .single();
      if (error) throw error;
      return data as unknown as DbRow;
    },

    async insertCommitments(rows) {
      if (rows.length === 0) return [];
      const { data, error } = await admin
        .from("plan_commitments")
        .insert(rows as DbRow[])
        .select(COMMITMENT_READBACK);
      if (error) throw error;
      return (data ?? []) as unknown as DbRow[];
    },

    async markSuperseded(planVersionId) {
      const { data, error } = await admin
        .from("plan_versions")
        .update({ status: "superseded", updated_at: new Date().toISOString() })
        .eq("id", planVersionId)
        // The predicate is the concurrency guard: two publishes racing on the
        // same student both try this, and exactly one moves the row.
        .eq("status", "published")
        .select("id");
      if (error) throw error;
      return ((data ?? []) as unknown[]).length;
    },

    async markPublished({ planVersionId, publishedBy, publishedAtIso }) {
      const { data, error } = await admin
        .from("plan_versions")
        .update({
          status: "published",
          published_at: publishedAtIso,
          published_by: publishedBy,
          updated_at: publishedAtIso,
        })
        .eq("id", planVersionId)
        .eq("status", "draft")
        .select(PLAN_VERSION_READBACK)
        .single();
      if (error) throw error;
      return data as unknown as DbRow;
    },

    async restorePublished(planVersionId) {
      const { data, error } = await admin
        .from("plan_versions")
        .update({ status: "published", updated_at: new Date().toISOString() })
        .eq("id", planVersionId)
        .eq("status", "superseded")
        .select("id");
      if (error) throw error;
      return ((data ?? []) as unknown[]).length;
    },

    async deleteDraftVersion(planVersionId) {
      const { error } = await admin
        .from("plan_versions")
        .delete()
        .eq("id", planVersionId)
        .eq("status", "draft");
      if (error) throw error;
    },

    async insertAccessEvents(rows) {
      if (rows.length === 0) return 0;
      const { data, error } = await admin
        .from("coach_access_events")
        .insert(rows as DbRow[])
        .select("id");
      if (error) throw error;
      return ((data ?? []) as unknown[]).length;
    },

    reseed,
  };
}
