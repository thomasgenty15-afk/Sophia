/**
 * KEEL — restriction guard RUNTIME (BUILD_PLAN W4.6, defect carried from W3.2).
 *
 * `restriction_guard.ts` was written, tested (41 tests) and then called NOWHERE.
 * A deterministic floor that no code path executes is not a floor, it is a
 * document. This module is the wiring: it assembles the snapshot from the
 * database, runs the pure guard on it, and writes the one escalation a raised
 * flag owes the coach.
 *
 * THE SPLIT IS THE POINT
 * ----------------------
 * Everything that can be wrong lives here (SQL, jsonb, unit conversions,
 * duplicate rows); everything that decides lives in `restriction_guard.ts` and
 * stays pure. This module never returns a boolean of its own invention: it
 * returns the guard's `RestrictionGuardResult`, and every consumer asks
 * `allowedStudentSurfaces` / `assertStudentSurfaceAllowed` rather than reading a
 * flag it could misread.
 *
 * TWO CONVERSIONS ARE DONE HERE, ON PURPOSE, LOUDLY
 * -------------------------------------------------
 *  - `weekly_reviews.logging_coverage` is a 0..1 FRACTION (SCHEMA: coverage_C =
 *    min(1, ...); display gate "< 4/7"). The guard demands a whole day count
 *    0..7 precisely so this ambiguity is resolved ONCE, in one place, instead of
 *    "0.42 or 3?" being re-guessed at each call site. Out-of-range input throws.
 *  - `outcomes.weight_7d_avg` is SI kg (R4). It is read as a number and passed
 *    through; the guard rejects implausible values as unit bugs.
 *
 * NOTHING HERE IS BEST-EFFORT. A loader that swallows an error and returns an
 * empty snapshot reports "safe" for a student it failed to look at — the exact
 * shape of failure the guard's own header forbids. Errors propagate.
 */

import {
  evaluateRestrictionGuard,
  type EnergyDaySample,
  type RestrictionGuardResult,
  type RestrictionSnapshot,
  restrictionEffect,
  type StudentTextSample,
  type WeeklyOutcomeSample,
} from "./restriction_guard.ts";

/**
 * The narrow slice of a supabase-js client this module uses. Structural, so a
 * test can pass a stub without dragging the SDK (and its network stack) into a
 * unit test.
 */
export interface KeelDbClient {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

/** Weeks of `weekly_reviews` history the rolling 2-week window needs (+ margin). */
const WEEKLY_HISTORY_WEEKS = 6;
/** Days of energy evaluations to scan for a 3-day streak (+ margin). */
const ENERGY_HISTORY_DAYS = 21;
/** Days of student prose to scan for compensatory vocabulary. */
const TEXT_HISTORY_DAYS = 14;
/** Hard ceiling on notes read in one pass — a chatty week must not become a scan. */
const MAX_TEXT_SAMPLES = 60;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message: string): never {
  throw new Error(`[keel/restriction_runtime] ${message}`);
}

function assertIsoDate(value: unknown, field: string): string {
  const raw = String(value ?? "").trim();
  if (!ISO_DATE.test(raw)) {
    fail(`${field} is not YYYY-MM-DD: ${JSON.stringify(value)}`);
  }
  return raw;
}

/** Shifts a YYYY-MM-DD by whole days. UTC arithmetic: a date has no timezone. */
function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const [y, m, d] = assertIsoDate(isoDate, "isoDate").split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + deltaDays * 86_400_000);
  return `${String(shifted.getUTCFullYear()).padStart(4, "0")}-${
    String(shifted.getUTCMonth() + 1).padStart(2, "0")
  }-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function numberOrNull(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) fail(`${field} is not a finite number: ${JSON.stringify(value)}`);
  return n;
}

/**
 * `logging_coverage` (fraction 0..1) -> whole logged days 0..7.
 * A value above 1 is NOT silently clamped: it means the column has been written
 * with a different scale somewhere, and that is precisely the two-normalizations
 * bug R7 exists to surface.
 */
export function loggingCoverageDaysFromFraction(
  value: unknown,
  field = "weekly_reviews.logging_coverage",
): number | null {
  const n = numberOrNull(value, field);
  if (n === null) return null;
  if (n < 0 || n > 1) {
    fail(
      `${field} = ${n} is outside [0, 1] — it is a coverage FRACTION, and a ` +
        `value outside that range means two scales disagree (SCHEMA: coverage_C = min(1, ...))`,
    );
  }
  return Math.round(n * 7);
}

// ---------------------------------------------------------------------------
// Snapshot assembly
// ---------------------------------------------------------------------------

/**
 * De-duplicates `weekly_reviews` by `week_start_date`.
 *
 * The table is unique on (user_id, plan_version_id, week_start_date), so a
 * republication mid-week legitimately yields TWO rows for one week — and the
 * guard throws on a duplicated week (its series invariant). The newest row wins:
 * it is the one written against the plan version in force.
 */
function dedupeWeeklyRows(
  rows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const byWeek = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const week = assertIsoDate(row.week_start_date, "weekly_reviews.week_start_date");
    const existing = byWeek.get(week);
    if (
      existing === undefined ||
      String(row.created_at ?? "") > String(existing.created_at ?? "")
    ) {
      byWeek.set(week, row);
    }
  }
  return [...byWeek.values()].sort((a, b) =>
    String(a.week_start_date).localeCompare(String(b.week_start_date))
  );
}

/**
 * LE POIDS DE LA SEMAINE, DEPUIS LES DEUX MODÈLES QUI COEXISTENT.
 *
 * ⚠️ CE LECTEUR N'EN LISAIT QU'UN, ET C'ÉTAIT LE MORT.
 *
 * `weekly_reviews` porte le poids à deux endroits, et le dépôt le documente
 * déjà à trois: `student_body_io.readMeasure`,
 * `frontend/.../studentProgressWeight.ts` et l'en-tête de
 * `weekly_flow.weeklyBiofeedbackPayload`.
 *
 *   `biofeedback.weight_kg`   — le point du dimanche, la carte des mesures de
 *                               `/app/plan`, et depuis FF-008 la conversation.
 *                               C'est le SEUL que le modèle pivot alimente.
 *   `outcomes.weight_7d_avg`  — le chemin 1:1, gardé exprès. Vérifié le
 *                               2026-08-03 puis à nouveau ici: AUCUN écrivain
 *                               dans le modèle pivot.
 *
 * Ce chargeur ne lisait que le second. Conséquence, et elle n'est pas
 * théorique: `rapid_weight_loss` — l'entrée n°1 de la ceinture, celle qui
 * détecte une perte de plus de 1,2 %/semaine sur 14 jours — ne voyait JAMAIS un
 * poids saisi par un élève du pivot. Une ceinture armée sur un coffre vide,
 * exactement la famille de défaut que ce dépôt a déjà nommée.
 *
 * L'ordre de préférence est celui de `student_body_io`: le saisi d'abord, le
 * dérivé 1:1 en repli. Une seule règle, quatre lecteurs, aucune divergence
 * possible.
 *
 * Un mot sur la moyenne: le champ du garde s'appelle `weight_7d_avg_kg` et
 * reçoit ici une mesure PONCTUELLE. Ce n'est pas un abus — le modèle pivot n'a
 * qu'un poids par semaine, la « moyenne sur 7 jours » d'une semaine à une
 * mesure EST cette mesure, et le garde compare de semaine à semaine. Lisser ce
 * qu'on n'a pas mesuré fabriquerait une donnée.
 */
function weekWeightKg(row: Record<string, unknown>): number | null {
  const biofeedback = (row.biofeedback ?? {}) as Record<string, unknown>;
  const declared = numberOrNull(
    biofeedback.weight_kg,
    "weekly_reviews.biofeedback.weight_kg",
  );
  if (declared !== null) return declared;
  const outcomes = (row.outcomes ?? {}) as Record<string, unknown>;
  return numberOrNull(
    outcomes.weight_7d_avg,
    "weekly_reviews.outcomes.weight_7d_avg",
  );
}

export async function loadWeeklyOutcomeSamples(
  db: KeelDbClient,
  params: { userId: string; asOfLocalDate: string },
): Promise<WeeklyOutcomeSample[]> {
  const since = shiftIsoDate(params.asOfLocalDate, -7 * WEEKLY_HISTORY_WEEKS);
  const { data, error } = await db
    .from("weekly_reviews")
    .select(
      "week_start_date, self_rated_adherence, logging_coverage, outcomes, biofeedback, created_at",
    )
    .eq("user_id", params.userId)
    .gte("week_start_date", since)
    .lte("week_start_date", params.asOfLocalDate)
    .order("week_start_date", { ascending: true });
  if (error) throw error;
  return dedupeWeeklyRows((data ?? []) as Array<Record<string, unknown>>).map(
    (row) => {
      return {
        week_start_date: String(row.week_start_date),
        weight_7d_avg_kg: weekWeightKg(row),
        self_rated_adherence: numberOrNull(
          row.self_rated_adherence,
          "weekly_reviews.self_rated_adherence",
        ),
        logging_coverage_days: loggingCoverageDaysFromFraction(
          row.logging_coverage,
        ),
      };
    },
  );
}

/**
 * Energy days, aggregated per local date.
 *
 * A plan may carry more than one `measure='energy'` line (a daily target plus a
 * training-day target, say). The guard refuses a duplicated `local_date`, so the
 * day is summed: targets add up, and observed values add up unless NOTHING was
 * observed that day — in which case the day stays `null` (unknown), never 0.
 * Reading "no evaluation" as "ate nothing" would manufacture the restriction
 * signal out of silence.
 *
 * A day whose `expected` snapshot carries no positive target is DROPPED: with no
 * prescribed target there is no deficit to compute, and the guard's own doctrine
 * is that an absent premise disarms rather than fires.
 */
export async function loadEnergyDaySamples(
  db: KeelDbClient,
  params: { userId: string; asOfLocalDate: string },
): Promise<EnergyDaySample[]> {
  const since = shiftIsoDate(params.asOfLocalDate, -ENERGY_HISTORY_DAYS);
  const { data: commitments, error: commitmentsErr } = await db
    .from("plan_commitments")
    .select("id")
    .eq("user_id", params.userId)
    .eq("measure", "energy");
  if (commitmentsErr) throw commitmentsErr;
  const ids = ((commitments ?? []) as Array<Record<string, unknown>>)
    .map((row) => String(row.id ?? ""))
    .filter(Boolean);
  if (ids.length === 0) return [];

  const { data, error } = await db
    .from("commitment_evaluations")
    .select("local_date, expected, observed_value")
    .eq("user_id", params.userId)
    .in("commitment_id", ids)
    .gte("local_date", since)
    .lte("local_date", params.asOfLocalDate)
    .order("local_date", { ascending: true });
  if (error) throw error;

  const byDate = new Map<string, { target: number; observed: number | null }>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const localDate = assertIsoDate(
      row.local_date,
      "commitment_evaluations.local_date",
    );
    const expected = (row.expected ?? {}) as Record<string, unknown>;
    const target = numberOrNull(
      expected.target_min ?? expected.target,
      "commitment_evaluations.expected.target_min",
    );
    if (target === null || target <= 0) continue;
    const observed = numberOrNull(
      row.observed_value,
      "commitment_evaluations.observed_value",
    );
    const current = byDate.get(localDate) ?? { target: 0, observed: null };
    byDate.set(localDate, {
      target: current.target + target,
      observed: observed === null
        ? current.observed
        : (current.observed ?? 0) + observed,
    });
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([local_date, agg]) => ({
      local_date,
      target_kcal: agg.target,
      observed_kcal: agg.observed,
    }));
}

/**
 * Student prose. R2: every row carries the language it was written in, and the
 * guard refuses a sample without it — a note whose locale must be guessed a
 * posteriori is the column the contract forbids, and here it would decide
 * whether a French compensatory phrase is even looked at.
 */
export async function loadStudentTextSamples(
  db: KeelDbClient,
  params: { userId: string; asOfLocalDate: string; turnMessage?: string | null; turnLocale?: string | null },
): Promise<StudentTextSample[]> {
  const since = shiftIsoDate(params.asOfLocalDate, -TEXT_HISTORY_DAYS);
  // PAS de filtre sur `disqualified_reason`, et c'est délibéré.
  //
  // Les lecteurs qui COMPTENT des repas l'excluent (synthèse coach, évaluateur).
  // Celui-ci ne compte rien: il lit les MOTS de l'élève pour la garde
  // restrictive. Un élève qui photographie un frigo vide en écrivant « je n'ai
  // rien mangé aujourd'hui non plus » produit une ligne disqualifiée dont la
  // note est précisément le signal à ne pas manquer. La safety lit tout ce que
  // l'élève a écrit, quel que soit le sort du fait alimentaire.
  const { data, error } = await db
    .from("protocol_events")
    .select("student_note, content_locale, local_date")
    .eq("user_id", params.userId)
    .gte("local_date", since)
    .lte("local_date", params.asOfLocalDate)
    .not("student_note", "is", null)
    .order("local_date", { ascending: false })
    .limit(MAX_TEXT_SAMPLES);
  if (error) throw error;

  const samples: StudentTextSample[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const text = String(row.student_note ?? "").trim();
    if (text === "") continue;
    const locale = String(row.content_locale ?? "").trim();
    if (locale === "") {
      fail(
        "protocol_events.student_note without content_locale (R2) — refusing " +
          "to scan prose whose language would have to be guessed",
      );
    }
    samples.push({
      source: "protocol_event_student_note",
      text,
      content_locale: locale,
    });
  }

  const turn = String(params.turnMessage ?? "").trim();
  if (turn !== "") {
    const turnLocale = String(params.turnLocale ?? "").trim();
    if (turnLocale === "") fail("turnMessage requires turnLocale (R2)");
    samples.push({
      source: "turn_message",
      text: turn,
      content_locale: turnLocale,
    });
  }
  return samples;
}

export async function loadRestrictionSnapshot(
  db: KeelDbClient,
  params: {
    userId: string;
    asOfLocalDate: string;
    turnMessage?: string | null;
    turnLocale?: string | null;
  },
): Promise<RestrictionSnapshot> {
  const asOfLocalDate = assertIsoDate(params.asOfLocalDate, "asOfLocalDate");
  const [weekly_outcomes, energy_days, texts] = await Promise.all([
    loadWeeklyOutcomeSamples(db, { userId: params.userId, asOfLocalDate }),
    loadEnergyDaySamples(db, { userId: params.userId, asOfLocalDate }),
    loadStudentTextSamples(db, {
      userId: params.userId,
      asOfLocalDate,
      turnMessage: params.turnMessage,
      turnLocale: params.turnLocale,
    }),
  ]);
  return { as_of_local_date: asOfLocalDate, weekly_outcomes, energy_days, texts };
}

/** Loads the snapshot and runs the pure floor on it. */
export async function evaluateRestrictionForStudent(
  db: KeelDbClient,
  params: {
    userId: string;
    asOfLocalDate: string;
    turnMessage?: string | null;
    turnLocale?: string | null;
  },
): Promise<RestrictionGuardResult> {
  return evaluateRestrictionGuard(await loadRestrictionSnapshot(db, params));
}

// ---------------------------------------------------------------------------
// Escalation — the coach hears about this today, not on Sunday
// ---------------------------------------------------------------------------

export interface RestrictionEscalation {
  escalated: boolean;
  /** `already_open` when a previous pass raised it and no coach has closed it yet. */
  reason: "raised" | "already_open" | "flag_down";
  contractChangeRequestId: string | null;
}

/**
 * Writes the `contract_change_requests` row a raised flag owes the coach:
 * `reason_code='restriction_signal'`, `urgency='immediate'` — one of the only two
 * codes allowed to bypass the weekly digest (SCHEMA DIALOGUE).
 *
 * Idempotent by OPEN ROW, not by day: the daily pass re-fires while the trigger
 * persists, and one open escalation per student is one alert, not thirty. Note
 * that `restrictionEffect` returns a `bypasses_digest` marker which is NOT a
 * column — `urgency='immediate'` IS the bypass. It is stripped here rather than
 * sent to PostgREST, where it would 400 the write and lose the alert entirely.
 */
export async function escalateRestrictionSignal(
  db: KeelDbClient,
  params: {
    userId: string;
    planVersionId?: string | null;
    result: RestrictionGuardResult;
    studentWords?: string | null;
  },
): Promise<RestrictionEscalation> {
  if (params.result?.restriction_flag !== true) {
    return { escalated: false, reason: "flag_down", contractChangeRequestId: null };
  }
  const { data: existing, error: existingErr } = await db
    .from("contract_change_requests")
    .select("id")
    .eq("user_id", params.userId)
    .eq("reason_code", "restriction_signal")
    .eq("status", "open")
    .limit(1);
  if (existingErr) throw existingErr;
  const openRow = ((existing ?? []) as Array<Record<string, unknown>>)[0];
  if (openRow) {
    return {
      escalated: false,
      reason: "already_open",
      contractChangeRequestId: String(openRow.id ?? "") || null,
    };
  }

  const effect = restrictionEffect(params.result, {
    user_id: params.userId,
    plan_version_id: params.planVersionId ?? null,
    student_words: params.studentWords ?? null,
  });
  const { bypasses_digest: _bypassesDigest, ...row } =
    effect.contract_change_request;

  // Execution truth: the row is RE-READ (`select()`), so the caller never logs
  // "escalated" on an insert it did not observe land.
  const { data, error } = await db
    .from("contract_change_requests")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return {
    escalated: true,
    reason: "raised",
    contractChangeRequestId: String((data as Record<string, unknown>)?.id ?? "") ||
      null,
  };
}
