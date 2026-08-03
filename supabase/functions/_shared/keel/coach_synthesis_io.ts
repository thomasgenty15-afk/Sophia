/**
 * PIVOT NUTRITION §1.4 — la coquille d'I/O de la synthèse coach.
 *
 * `coach_synthesis.ts` DÉCIDE (pur, testé). Ce module LIT et ÉCRIT. La
 * séparation est la même que partout ailleurs dans `_shared/keel/`, et elle a
 * une conséquence directe ici: aucun chiffre n'est calculé dans ce fichier.
 * Tout ce qu'il fait, c'est apporter des faits au moteur et persister sa
 * sortie.
 *
 * ── EXECUTION TRUTH ───────────────────────────────────────────────────────
 * `delivered_at` n'est JAMAIS posé par `writeSynthesis`. Une synthèse écrite
 * est une synthèse GÉNÉRÉE; elle devient livrée quand la livraison a réussi,
 * et pas une ligne avant. C'est la doctrine « nothing is announced that is not
 * a re-read DB row » appliquée à l'artefact que le coach paie.
 *
 * ── IDEMPOTENCE ───────────────────────────────────────────────────────────
 * `coach_syntheses` porte `unique (coach_id, kind, period_start, period_end)`.
 * L'écriture est un UPSERT sur cette clé: un cron qui repasse ne crée pas une
 * seconde synthèse de la même semaine (classe « doublon = race check-then-send »,
 * déjà payée sur `subscription_notifications`).
 */

import {
  buildCoachSynthesis,
  type CoachSynthesis,
  flaggedStudentsPayload,
  metricsPayload,
  renderSynthesisText,
  type StudentWeekInput,
} from "./coach_synthesis.ts";
import type { AdherenceEvaluation } from "./adherence.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export interface SynthesisWindow {
  /** Les 7 dates locales de la semaine, dans l'ordre. */
  weekDates: string[];
  periodStart: string;
  periodEnd: string;
}

/**
 * La fenêtre hebdo qui vient de se terminer, ancrée sur lundi.
 *
 * Calculée à partir d'une date fournie, jamais de `new Date()` ici: un job qui
 * lit l'horloge en interne ne peut pas être rejoué sur une semaine passée, et
 * la QA de ce dépôt fonctionne précisément en avançant une horloge simulée.
 */
export function lastCompleteWeek(asOfLocalDate: string): SynthesisWindow {
  const [y, m, d] = asOfLocalDate.split("-").map(Number);
  const asOf = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  // getUTCDay: 0=dimanche. On veut le lundi de la semaine PRÉCÉDENTE.
  const dow = asOf.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  const thisMonday = new Date(asOf);
  thisMonday.setUTCDate(asOf.getUTCDate() - daysSinceMonday);
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);

  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(lastMonday);
    day.setUTCDate(lastMonday.getUTCDate() + i);
    weekDates.push(day.toISOString().slice(0, 10));
  }
  return {
    weekDates,
    periodStart: weekDates[0],
    periodEnd: weekDates[6],
  };
}

/**
 * Les prénoms des élèves, pour que la synthèse nomme des gens.
 *
 * Lu sur `profiles` en service_role et PAS via `coach_student_directory`: la
 * vue Tier B filtre sur `coached_student_ids()`, qui dépend de `auth.uid()` —
 * nul dans un job serveur. La vue reste le chemin du coach quand C'EST le
 * coach qui lit; ici c'est le serveur qui écrit pour lui.
 *
 * Un nom manquant n'est jamais inventé: la ligne dira "A student".
 */
export async function loadStudentNames(
  db: Db,
  studentUserIds: readonly string[],
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  if (studentUserIds.length === 0) return names;
  const { data, error } = await db
    .from("profiles")
    .select("id, full_name")
    .in("id", [...studentUserIds]);
  if (error) throw error;
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const id = String(row.id ?? "").trim();
    const name = String(row.full_name ?? "").trim();
    if (id) names.set(id, name || null);
  }
  return names;
}

/** Les élèves vivants d'un coach. */
export async function loadCohortStudentIds(
  db: Db,
  coachId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from("coach_clients")
    .select("student_user_id")
    .eq("coach_id", coachId)
    .eq("status", "active");
  if (error) throw error;
  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const id = String(row.student_user_id ?? "").trim();
    if (id) ids.add(id);
  }
  return [...ids].sort();
}

/**
 * Rassemble les FAITS d'un élève sur la fenêtre. Aucune décision ici.
 *
 * Trois lectures, et chacune répond à une question différente que le contrat
 * interdit de fusionner:
 *   - `commitment_evaluations` -> a-t-il SUIVI ? (adhérence)
 *   - `protocol_events`        -> a-t-il REPORTÉ ? (couverture) + les bandes
 *                                 de portion (le contrepoids de la décision kcal)
 *   - `chat_messages`          -> a-t-il PARLÉ ? (contact)
 */
export async function loadStudentWeek(
  db: Db,
  args: {
    studentUserId: string;
    displayName?: string | null;
    window: SynthesisWindow;
    restrictionFlag?: boolean;
  },
): Promise<StudentWeekInput> {
  const { periodStart, periodEnd, weekDates } = args.window;

  const evalsRes = await db
    .from("commitment_evaluations")
    .select("commitment_id, local_date, grain, status")
    .eq("user_id", args.studentUserId)
    .gte("local_date", periodStart)
    .lte("local_date", periodEnd);
  if (evalsRes.error) throw evalsRes.error;
  const evalRows = (evalsRes.data ?? []) as Array<Record<string, unknown>>;

  // Le poids et le drapeau d'adhérence vivent sur la PRESCRIPTION, pas sur
  // l'évaluation: on les résout depuis `plan_commitments`. Sans ça, tout
  // pèserait `core` et une ligne `counts_toward_adherence=false` (un capteur
  // muet) entrerait dans le score — exactement ce que R6 interdit.
  const commitmentIds = [
    ...new Set(evalRows.map((r) => String(r.commitment_id ?? "")).filter(Boolean)),
  ];
  const weights = new Map<string, { priority: string; counts: boolean; expected: number }>();
  if (commitmentIds.length > 0) {
    const cRes = await db
      .from("plan_commitments")
      .select("id, priority, counts_toward_adherence, expected_occasions_per_day")
      .in("id", commitmentIds);
    if (cRes.error) throw cRes.error;
    for (const row of (cRes.data ?? []) as Array<Record<string, unknown>>) {
      weights.set(String(row.id), {
        priority: String(row.priority ?? "core"),
        counts: row.counts_toward_adherence !== false,
        expected: Number(row.expected_occasions_per_day ?? 1) || 1,
      });
    }
  }

  const evaluations: AdherenceEvaluation[] = evalRows.map((row) => {
    const id = String(row.commitment_id ?? "");
    const w = weights.get(id);
    return {
      commitmentId: id,
      localDate: String(row.local_date ?? ""),
      grain: String(row.grain ?? "day") as AdherenceEvaluation["grain"],
      status: String(row.status ?? "unknown") as AdherenceEvaluation["status"],
      priority: (w?.priority ?? "core") as AdherenceEvaluation["priority"],
      countsTowardAdherence: w?.counts ?? true,
      expectedEvaluationsPerDay: w?.expected ?? 1,
    };
  });

  const eventsRes = await db
    .from("protocol_events")
    .select("local_date, portion_band")
    .eq("user_id", args.studentUserId)
    .gte("local_date", periodStart)
    .lte("local_date", periodEnd);
  if (eventsRes.error) throw eventsRes.error;
  const eventRows = (eventsRes.data ?? []) as Array<Record<string, unknown>>;

  const eventCountsByDate: Record<string, number> = {};
  for (const date of weekDates) eventCountsByDate[date] = 0;
  const portionBands: Array<string | null> = [];
  for (const row of eventRows) {
    const date = String(row.local_date ?? "");
    if (date in eventCountsByDate) eventCountsByDate[date] += 1;
    const band = row.portion_band === null || row.portion_band === undefined
      ? null
      : String(row.portion_band);
    if (band) portionBands.push(band);
  }

  // Le CONTACT est le dernier message ENTRANT. `chat_messages` porte les deux
  // sens; filtrer sur le rôle est ce qui empêche trois relances sans réponse
  // de compter comme "en contact".
  let lastInboundAt: string | null = null;
  const msgRes = await db
    .from("chat_messages")
    .select("created_at")
    .eq("user_id", args.studentUserId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1);
  if (msgRes.error) throw msgRes.error;
  const msgRow = ((msgRes.data ?? []) as Array<Record<string, unknown>>)[0];
  if (msgRow) lastInboundAt = String(msgRow.created_at ?? "") || null;

  return {
    studentUserId: args.studentUserId,
    displayName: args.displayName ?? null,
    lastInboundAt,
    adherence: { weekDates, evaluations, eventCountsByDate },
    portionBands,
    restrictionFlag: args.restrictionFlag === true,
  };
}

export interface WriteSynthesisResult {
  written: boolean;
  id: string | null;
  reason_code: string;
}

/**
 * Écrit la synthèse, WRITE-THROUGH (upsert + relecture de l'id).
 *
 * `delivered_at` est volontairement absent du payload: voir l'en-tête.
 */
export async function writeSynthesis(
  db: Db,
  args: {
    coachId: string;
    cohortId?: string | null;
    kind: "weekly" | "cohort_completion";
    window: SynthesisWindow;
    synthesis: CoachSynthesis;
    narrative: string;
    contentLocale: string;
  },
): Promise<WriteSynthesisResult> {
  const row = {
    coach_id: args.coachId,
    cohort_id: args.cohortId ?? null,
    kind: args.kind,
    period_start: args.window.periodStart,
    period_end: args.window.periodEnd,
    metrics: metricsPayload(args.synthesis),
    flagged_students: flaggedStudentsPayload(args.synthesis),
    narrative: args.narrative,
    content_locale: args.contentLocale,
  };
  try {
    const { data, error } = await db
      .from("coach_syntheses")
      .upsert(row, { onConflict: "coach_id,kind,period_start,period_end" })
      .select("id")
      .single();
    if (error) throw error;
    const id = String((data as Record<string, unknown> | null)?.id ?? "").trim();
    return id
      ? { written: true, id, reason_code: "written" }
      : { written: false, id: null, reason_code: "missing_readback_row" };
  } catch (error) {
    console.error("[keel/synthesis] write failed", error);
    return { written: false, id: null, reason_code: "write_failed" };
  }
}

/**
 * Marque la synthèse comme LIVRÉE. Appelé après la livraison, jamais avant.
 * Séparé de `writeSynthesis` pour que l'ordre soit impossible à inverser par
 * accident.
 */
export async function markSynthesisDelivered(
  db: Db,
  args: { id: string; channel: "whatsapp" | "email" | "in_app"; at: string },
): Promise<boolean> {
  try {
    const { error } = await db
      .from("coach_syntheses")
      .update({ delivered_at: args.at, delivery_channel: args.channel })
      .eq("id", args.id);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("[keel/synthesis] delivery mark failed", error);
    return false;
  }
}

/** Bout en bout pour UN coach: lire, décider, rendre, écrire. */
export async function buildAndWriteCoachSynthesis(
  db: Db,
  args: {
    coachId: string;
    coachName?: string | null;
    asOfLocalDate: string;
    now: Date;
    contentLocale?: string;
  },
): Promise<{
  window: SynthesisWindow;
  synthesis: CoachSynthesis;
  narrative: string;
  write: WriteSynthesisResult;
  studentCount: number;
}> {
  const window = lastCompleteWeek(args.asOfLocalDate);
  const studentIds = await loadCohortStudentIds(db, args.coachId);

  const names = await loadStudentNames(db, studentIds);
  const students: StudentWeekInput[] = [];
  for (const studentUserId of studentIds) {
    students.push(await loadStudentWeek(db, {
      studentUserId,
      displayName: names.get(studentUserId) ?? null,
      window,
    }));
  }

  const synthesis = buildCoachSynthesis(students, args.now);
  const narrative = renderSynthesisText(synthesis, {
    coachName: args.coachName ?? null,
    locale: "en",
  });
  const write = await writeSynthesis(db, {
    coachId: args.coachId,
    kind: "weekly",
    window,
    synthesis,
    narrative,
    contentLocale: args.contentLocale ?? "en",
  });
  return { window, synthesis, narrative, write, studentCount: studentIds.length };
}
