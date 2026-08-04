/**
 * KEEL W4.2 — the I/O boundary of the provisioning pass.
 *
 * Everything that touches the database lives behind `ProvisioningPorts`. Two
 * consumers share it: the hourly HTTP entry point (`index.ts`) and
 * `reseedOnPublish()` (called by W6 when a plan version is published). Tests
 * inject a fake implementation and exercise the orchestration without a
 * database — which is the only way the republication path, whose whole point is
 * an ordering between four writes, can be pinned by a unit test.
 *
 * Every write goes through an RPC of
 * supabase/migrations/20260727175000_keel_provisioning.sql. None of them is a
 * bare PostgREST write: the idempotence key is a functional index, the sweep
 * joins `plan_commitments` on the write path, and the seeding RPC re-validates
 * the caller's rows against the live prescription (execution truth).
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  PROVISION_COMMITMENT_COLUMNS,
  PROVISION_PLAN_VERSION_COLUMNS,
  type SeedRow,
} from "./provisioning.ts";

export interface SeedResult {
  requested: number;
  validated: number;
  inserted: number;
  conflicted: number;
  /** > 0 means the caller held a stale plan. Reported, never swallowed. */
  rejected: number;
}

export interface SweepResult {
  missed: number;
  met: number;
  not_applicable: number;
  flex_used: number;
  /** R6: device-fed lines deliberately left `unknown`, counted for the log. */
  held_device_unknown: number;
}

export type DbRow = Record<string, unknown>;

export interface ProvisioningPorts {
  /** Published plan versions, keyset-ordered by student_id. */
  loadPublishedPlanVersionsPage(args: {
    afterStudentId: string;
    limit: number;
    /** targeted replay: restrict the scan to one student */
    studentId?: string;
  }): Promise<DbRow[]>;

  /** One plan version by id, whatever its status (the publish path checks it). */
  loadPlanVersionById(planVersionId: string): Promise<DbRow | null>;

  /**
   * Of the given ids, those that are KEEL students on a live account.
   * A set, not a list: the caller asks "is this one in?".
   */
  loadActiveStudentIds(studentIds: readonly string[]): Promise<Set<string>>;

  /** Active commitments of a plan version (all slot_kinds — the tally needs them). */
  loadActiveCommitments(planVersionId: string): Promise<DbRow[]>;

  seedEvaluations(rows: readonly SeedRow[]): Promise<SeedResult>;

  sweepDay(args: {
    userId: string;
    planVersionId: string;
    localDate: string;
  }): Promise<SweepResult>;

  invalidateInflightEvaluations(args: {
    studentId: string;
    keepPlanVersionId: string;
    fromLocalDate: string;
  }): Promise<number>;

  cancelInflightCheckins(args: {
    userId: string;
    fromIso: string;
  }): Promise<number>;
}

// ---------------------------------------------------------------------------
// Supabase implementation
// ---------------------------------------------------------------------------

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function supabaseProvisioningPorts(
  admin: SupabaseClient,
): ProvisioningPorts {
  return {
    async loadPublishedPlanVersionsPage({ afterStudentId, limit, studentId }) {
      // The partial unique index `plan_versions_one_published_per_student_idx`
      // guarantees at most one published version per student, so ordering by
      // student_id is a stable, gap-free keyset over the whole active fleet.
      let query = admin
        .from("plan_versions")
        .select(PROVISION_PLAN_VERSION_COLUMNS)
        .eq("status", "published")
        .order("student_id", { ascending: true })
        .limit(limit);
      if (afterStudentId) query = query.gt("student_id", afterStudentId);
      if (studentId) query = query.eq("student_id", studentId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as DbRow[];
    },

    async loadPlanVersionById(planVersionId) {
      const { data, error } = await admin
        .from("plan_versions")
        .select(`${PROVISION_PLAN_VERSION_COLUMNS},status`)
        .eq("id", planVersionId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as DbRow | null;
    },

    async loadActiveStudentIds(studentIds) {
      if (studentIds.length === 0) return new Set<string>();
      const { data, error } = await admin
        .from("profiles")
        .select("id")
        .in("id", studentIds as string[])
        .eq("keel_role", "student")
        .eq("account_status", "active");
      if (error) throw error;
      return new Set(
        ((data ?? []) as unknown as DbRow[]).map((row) => String(row.id ?? "")).filter(
          Boolean,
        ),
      );
    },

    async loadActiveCommitments(planVersionId) {
      const { data, error } = await admin
        .from("plan_commitments")
        .select(PROVISION_COMMITMENT_COLUMNS)
        .eq("plan_version_id", planVersionId)
        .eq("status", "active");
      if (error) throw error;
      return (data ?? []) as unknown as DbRow[];
    },

    async seedEvaluations(rows) {
      if (rows.length === 0) {
        return {
          requested: 0,
          validated: 0,
          inserted: 0,
          conflicted: 0,
          rejected: 0,
        };
      }
      const { data, error } = await admin.rpc("keel_seed_evaluations", {
        p_rows: rows,
      });
      if (error) throw error;
      const out = asRecord(data);
      return {
        requested: asNumber(out.requested),
        validated: asNumber(out.validated),
        inserted: asNumber(out.inserted),
        conflicted: asNumber(out.conflicted),
        rejected: asNumber(out.rejected),
      };
    },

    async sweepDay({ userId, planVersionId, localDate }) {
      const { data, error } = await admin.rpc("keel_sweep_day_evaluations", {
        p_user_id: userId,
        p_plan_version_id: planVersionId,
        p_local_date: localDate,
      });
      if (error) throw error;
      const out = asRecord(data);
      return {
        missed: asNumber(out.missed),
        met: asNumber(out.met),
        not_applicable: asNumber(out.not_applicable),
        flex_used: asNumber(out.flex_used),
        held_device_unknown: asNumber(out.held_device_unknown),
      };
    },

    async invalidateInflightEvaluations(
      { studentId, keepPlanVersionId, fromLocalDate },
    ) {
      const { data, error } = await admin.rpc(
        "keel_invalidate_inflight_evaluations",
        {
          p_student_id: studentId,
          p_keep_plan_version_id: keepPlanVersionId,
          p_from_local_date: fromLocalDate,
        },
      );
      if (error) throw error;
      return asNumber(data);
    },

    async cancelInflightCheckins({ userId, fromIso }) {
      const { data, error } = await admin.rpc("keel_cancel_inflight_checkins", {
        p_user_id: userId,
        p_from: fromIso,
      });
      if (error) throw error;
      return asNumber(data);
    },
  };
}
