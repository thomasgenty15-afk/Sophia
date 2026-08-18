/**
 * FF-021 — outillage de revalidation du plancher de restriction.
 *
 * Rien ici n'invente de verdict: chaque sonde relit la base ou appelle le VRAI
 * chargeur (`evaluateRestrictionForStudent`) avec un client service-role.
 *
 * ⚠️ CE FICHIER EST UNE SONDE, DONC IL DOIT PARLER LA FORME DE LA PRODUCTION
 * (cicatrice T-15). Les colonnes écrites ici sont celles que
 * `loadWeeklyOutcomeSamples` lit: `week_start_date`, `biofeedback.weight_kg`,
 * `self_rated_adherence`, `logging_coverage` (FRACTION 0..1), `created_at`.
 */
import {
  admin,
  type Coach,
  makeCoach,
  makeStudent,
  publishPlanFor,
  sql,
  type Student,
} from "../docs/nutrition-pivot/qa-web/harness.ts";
import { evaluateRestrictionForStudent } from "../supabase/functions/_shared/keel/restriction_runtime.ts";
import { loadRestrictionSnapshot } from "../supabase/functions/_shared/keel/restriction_runtime.ts";

export { admin, makeCoach, makeStudent, publishPlanFor, sql };
export type { Coach, Student };

export const PREFIX = "ff021";

export function iso(daysAgo: number, from = new Date()): string {
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()) -
      daysAgo * 86_400_000,
  );
  return d.toISOString().slice(0, 10);
}

/** Le lundi de la semaine qui contient `isoDate`. */
export function mondayOfIso(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/**
 * Une ligne `weekly_reviews` du modèle PIVOT: aucun `plan_version_id` (c'est ce
 * que le point du dimanche écrit), le poids dans `biofeedback.weight_kg`.
 */
export async function writeWeeklyRow(args: {
  userId: string;
  weekStart: string;
  weightKg?: number | null;
  selfRated?: number | null;
  loggingCoverageFraction?: number | null;
  outcomesWeight7dAvg?: number | null;
  riskBand?: string | null;
}): Promise<void> {
  const db = admin();
  const biofeedback: Record<string, unknown> = { source: "qa_ff021" };
  if (args.weightKg !== undefined && args.weightKg !== null) {
    biofeedback.weight_kg = args.weightKg;
  }
  const row: Record<string, unknown> = {
    user_id: args.userId,
    plan_version_id: null,
    week_start_date: args.weekStart,
    content_locale: "en-US",
    biofeedback,
  };
  if (args.selfRated !== undefined) row.self_rated_adherence = args.selfRated;
  if (args.loggingCoverageFraction !== undefined) {
    row.logging_coverage = args.loggingCoverageFraction;
  }
  if (args.outcomesWeight7dAvg !== undefined) {
    row.outcomes = { weight_7d_avg: args.outcomesWeight7dAvg };
  }
  if (args.riskBand !== undefined) row.risk_band = args.riskBand;
  const { error } = await db.from("weekly_reviews").upsert(row as never, {
    onConflict: "user_id,week_start_date",
    ignoreDuplicates: false,
  });
  if (error) {
    // `upsert` sur l'index partiel n'est pas toujours accepté; repli en insert.
    const ins = await db.from("weekly_reviews").insert(row as never);
    if (ins.error) {
      throw new Error(
        `weekly_reviews(${args.weekStart}): ${error.message} / ${ins.error.message}`,
      );
    }
  }
}

/** Une note d'élève (`protocol_events.student_note`) — l'entrée n°3 du plancher. */
export async function writeStudentNote(args: {
  userId: string;
  localDate: string;
  note: string;
  contentLocale: string;
}): Promise<void> {
  const db = admin();
  const { error } = await db.from("protocol_events").insert({
    user_id: args.userId,
    local_date: args.localDate,
    occurred_at: `${args.localDate}T12:00:00Z`,
    source: "chat",
    student_note: args.note,
    content_locale: args.contentLocale,
    recognized: true,
  } as never);
  if (error) throw new Error(`protocol_events: ${error.message}`);
}

/**
 * Un engagement `measure='energy'` + ses évaluations quotidiennes.
 *
 * ⚠️ AUCUN CODE DE PRODUCTION N'ÉCRIT `measure='energy'` (audit du 2026-08-08:
 * les seuls littéraux du dépôt sont `presence` et `portion`). Cette fixture
 * fabrique donc une donnée que le produit ne produit pas — c'est exprès, pour
 * établir que le déclencheur 2 FONCTIONNE, et la remarque sur son
 * inatteignabilité est consignée séparément.
 */
export async function writeEnergyDays(args: {
  userId: string;
  planVersionId: string;
  coachId: string;
  days: Array<{ localDate: string; target: number; observed: number | null }>;
}): Promise<string> {
  const db = admin();
  const { data, error } = await db.from("plan_commitments").insert({
    plan_version_id: args.planVersionId,
    user_id: args.userId,
    coach_id: args.coachId,
    polarity: "do",
    activity_class: "nutrition",
    anchor_kind: "free",
    measure: "energy",
    unit: "kcal",
    target_op: ">=",
    target_min: 2000,
    evidence_kind: "numeric_entry",
    evaluation_grain: "day",
    content_locale: "en-US",
    title: "FF021 energy target",
  } as never).select("id").maybeSingle();
  if (error) throw new Error(`plan_commitments(energy): ${error.message}`);
  const commitmentId = String((data as { id: string }).id);
  for (const day of args.days) {
    const { error: evErr } = await db.from("commitment_evaluations").insert({
      user_id: args.userId,
      commitment_id: commitmentId,
      plan_version_id: args.planVersionId,
      local_date: day.localDate,
      grain: "day",
      evidence: "self_report",
      expected: { target_min: day.target },
      observed_value: day.observed,
      status: day.observed === null ? "unknown" : "met",
    } as never);
    if (evErr) {
      throw new Error(
        `commitment_evaluations(${day.localDate}): ${evErr.message}`,
      );
    }
  }
  return commitmentId;
}

/** Le VRAI chargeur + le VRAI plancher, contre la base locale. */
export async function evalFloor(args: {
  userId: string;
  asOfLocalDate: string;
  turnMessage?: string | null;
  turnLocale?: string | null;
}) {
  return await evaluateRestrictionForStudent(admin() as never, {
    userId: args.userId,
    asOfLocalDate: args.asOfLocalDate,
    turnMessage: args.turnMessage ?? null,
    turnLocale: args.turnLocale ?? null,
  });
}

export async function snapshotFor(args: {
  userId: string;
  asOfLocalDate: string;
  turnMessage?: string | null;
  turnLocale?: string | null;
}) {
  return await loadRestrictionSnapshot(admin() as never, {
    userId: args.userId,
    asOfLocalDate: args.asOfLocalDate,
    turnMessage: args.turnMessage ?? null,
    turnLocale: args.turnLocale ?? null,
  });
}

/** Purge complète d'un élève de fixture. */
export async function purge(userId: string): Promise<void> {
  await sql(
    `delete from commitment_evaluations where user_id = '${userId}';
     delete from weekly_reviews where user_id = '${userId}';
     delete from protocol_events where user_id = '${userId}';
     delete from contract_change_requests where user_id = '${userId}';
     delete from student_hunger_reports where user_id = '${userId}';
     delete from chat_messages where user_id = '${userId}';
     delete from inbound_dedup where user_id = '${userId}';
     delete from meal_precision_questions where user_id = '${userId}';
     delete from student_daily_checkins where user_id = '${userId}';
     delete from user_chat_states where user_id = '${userId}';
     delete from plan_commitments where user_id = '${userId}';
     delete from student_week_plans where user_id = '${userId}';
     delete from coach_clients where student_user_id = '${userId}';
     delete from plan_versions where student_id = '${userId}';
     delete from auth.users where id = '${userId}';`,
  );
}

export function line(label: string, verdict: "GREEN" | "RED" | "INFO", detail: string) {
  console.log(`[${verdict}] ${label} :: ${detail}`);
}
