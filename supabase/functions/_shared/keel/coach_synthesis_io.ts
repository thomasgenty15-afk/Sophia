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

/**
 * QUI PORTE UN SIGNAL RESTRICTIF OUVERT.
 *
 * TROUVÉ EN QA (2026-08-03, cohorte réelle de 7 élèves): `StudentWeekInput`
 * porte `restrictionFlag` depuis le premier jour, `classifyRisk` le fait
 * PASSER AVANT TOUT, `flagFor` en tire `restriction_signal` (sévérité 0, exempt
 * du plafond, « this one is yours to handle ») — et RIEN ne le renseignait.
 * Le paramètre était optionnel, donc l'oubli était silencieux: un élève marqué
 * restrictif dans la base sortait de la synthèse en `no_evaluable_plan`, puis
 * se faisait tronquer par le plafond des 3. La garde la plus importante de
 * l'artefact était déclarée et désarmée (classe « paramètre de garde optionnel
 * = garde désarmée », déjà payée sur `safetyBand` dans les crons).
 *
 * UNE SEULE SOURCE, ET C'EST LA VIVANTE:
 *   `contract_change_requests(reason_code='restriction_signal', status='open')`
 *   — l'escalade écrite par `escalateRestrictionSignal` (provision du jour,
 *   routeur conversationnel), ouverte tant qu'aucun coach ne l'a fermée.
 *
 * ── LA SECONDE SOURCE EST PARTIE, ET CE N'EST PAS UN RELÂCHEMENT (L3) ───────
 * Elle lisait `weekly_reviews.risk_band = 'restriction_flag'`. Cette colonne
 * appartient à l'ANCIENNE weekly review 1:1 (celle qui portait aussi
 * `student_narrative`, `coach_draft_reply`, `lapse_context`), retirée avec la
 * surface coach 1:1. La table a survécu — le bilan alimentaire hebdo la
 * réutilise — mais son écrivain n'écrit QUE `week_facts`,
 * `week_facts_computed_at` et `content_locale` (`week_review_io.ts`).
 *
 * Les trois épreuves d'absence ont été refaites le 2026-08-08: aucun écrivain
 * dans le code (payloads inspectés un par un), aucune fonction Postgres
 * (`prosrc`), aucune vue. En base locale, 3 lignes non-NULL sur 4 — les trois
 * sont des fixtures de QA (`@keeltest.dev`, `@test.dev`).
 *
 * Le commentaire qui justifiait la redondance disait « lire les deux évite de
 * parier sur un seul écrivain ». La mesure a rendu le verdict inverse: le
 * second n'avait AUCUN écrivain, et cette lecture-là ne pouvait donc rien
 * ajouter. Mesuré 3/3 sur un élève réel portant une escalade VIVANTE et aucun
 * `risk_band`: la ligne sort quand même en `restriction_flag` / sévérité 0.
 * C'est la source ci-dessous qui la porte, et elle seule.
 *
 * ⚠️ LA FENÊTRE A DISPARU DE LA SIGNATURE, ET C'EST DÉLIBÉRÉ. Elle ne servait
 * qu'à borner la lecture du bilan (`week_start_date` entre `periodStart` et
 * `periodEnd`). L'escalade, elle, n'est pas datée par semaine: elle est OUVERTE
 * ou fermée. Garder un paramètre qu'on ignore aurait laissé croire à un
 * bornage qui n'existe plus — et un appelant aurait fini par s'appuyer dessus.
 */
export async function loadRestrictionFlags(
  db: Db,
  studentUserIds: readonly string[],
): Promise<Set<string>> {
  const flagged = new Set<string>();
  if (studentUserIds.length === 0) return flagged;
  const ids = [...studentUserIds];

  const escalations = await db
    .from("contract_change_requests")
    .select("user_id")
    .in("user_id", ids)
    .eq("reason_code", "restriction_signal")
    .eq("status", "open");
  if (escalations.error) throw escalations.error;
  for (const row of (escalations.data ?? []) as Array<Record<string, unknown>>) {
    const id = String(row.user_id ?? "").trim();
    if (id) flagged.add(id);
  }

  return flagged;
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

  // `.is("disqualified_reason", null)` — ce que le coach lit le lundi ne doit
  // compter QUE des repas. Sans ce filtre, une photo de menu, un selfie ou une
  // capture d'écran d'app de livraison gonflaient le nombre de jours actifs et
  // la distribution des portions de cet élève.
  const eventsRes = await db
    .from("protocol_events")
    .select("local_date, portion_band")
    .eq("user_id", args.studentUserId)
    .is("disqualified_reason", null)
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

  // PIVOT N4 — LES TAPS DE LA SEMAINE (la vivabilité).
  // C'est ce qui remplace l'adhérence: le coach recommande, l'élève décide,
  // donc « a-t-il suivi » n'a plus d'objet — mais « est-ce tenable » en a un.
  const pulseRes = await db
    .from("student_daily_checkins")
    .select("overall, axis")
    .eq("user_id", args.studentUserId)
    .gte("local_date", periodStart)
    .lte("local_date", periodEnd);
  if (pulseRes.error) throw pulseRes.error;
  const dailyPulses = ((pulseRes.data ?? []) as Array<Record<string, unknown>>).map(
    (r) => ({ overall: String(r.overall ?? ""), axis: r.axis ? String(r.axis) : null }),
  );

  // CE QUE L'ÉLÈVE S'EST COMPOSÉ CETTE SEMAINE. Compté, jamais noté.
  //
  // ── POURQUOI DEUX SOURCES ET PLUS UNE ────────────────────────────────────
  // Ce bloc ne lisait que `student_week_plans` en `'adopted'`. Le commit
  // 99697610 a remplacé la semaine de méthode par le constructeur de repas:
  // plus personne n'adopte, donc « ce qu'ils se sont fixé » affichait 0 pour
  // TOUTE cohorte — sur l'artefact que le coach paie pour lire.
  //
  // Les repas comptent, et ce n'est pas un pis-aller: `generate-meal-v1`
  // compose à partir de la doctrine publiée du coach. Un élève qui s'est
  // composé des plats s'est bel et bien écrit une semaine à partir de la
  // méthode. La phrase rendue reste vraie, elle change juste de surface.
  //
  // MÊME BORNE QUE `following_io.ts`, et elle a changé de nature le 2026-08-07.
  // La table PORTE maintenant sa fenêtre (`starts_on`, `duration_days`,
  // `ends_on`), donc on n'a plus à se rabattre sur `created_at` — qui datait
  // l'écriture et pas la couverture, et faisait manquer un plan composé le
  // dimanche pour la semaine d'après.
  //
  // Deux définitions de « cette semaine » divergeraient: celle-ci est la même
  // que celle de `following_io.ts`, au prédicat près.
  const mealRes = await db
    .from("student_generated_meals")
    .select("id")
    .eq("user_id", args.studentUserId)
    .is("retired_at", null)
    .gte("ends_on", periodStart)
    .limit(1);
  if (mealRes.error) throw mealRes.error;
  const composedMeals = ((mealRes.data ?? []) as unknown[]).length;

  const planRes = await db
    .from("student_week_plans")
    .select("items, status")
    .eq("user_id", args.studentUserId)
    .eq("week_start", periodStart)
    .maybeSingle();
  if (planRes.error) throw planRes.error;
  const planRow = (planRes.data ?? null) as Record<string, unknown> | null;
  const planItems = Array.isArray(planRow?.items) ? planRow!.items as Array<Record<string, unknown>> : [];
  const weekPlan = planRow
    ? {
      nutritionLines: planItems.filter((i) => i.kind === "nutrition").length,
      actionLines: planItems.filter((i) => i.kind === "action").length,
      adopted: String(planRow.status ?? "") === "adopted",
    }
    : null;

  return {
    studentUserId: args.studentUserId,
    displayName: args.displayName ?? null,
    lastInboundAt,
    adherence: { weekDates, evaluations, eventCountsByDate },
    portionBands,
    dailyPulses,
    weekPlan,
    composedMeals,
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
    /**
     * La langue du COACH — celle de `profiles.locale` du compte auquel
     * `coaches.user_id` renvoie. REQUISE.
     *
     * ⚠️ ELLE ÉTAIT OPTIONNELLE, ET C'EST CE QUI CACHAIT LE DÉFAUT. Le seul
     * appelant de production (`coach-synthesis-v1`) ne la passait pas, donc la
     * ligne `coach_syntheses.content_locale` était semée `'en'` par le `??` de
     * cette fonction — pendant que le narratif, lui, était rendu avec
     * `locale: "en"` écrit EN DUR trois lignes plus bas. Deux défauts qui se
     * confirmaient l'un l'autre: la ligne disait vrai sur un texte anglais que
     * rien ne pouvait rendre autrement.
     *
     * Requise, elle force chaque appelant à dire d'où vient la langue, et le
     * MÊME tag part au rendu et dans la colonne — une synthèse dont le texte
     * et la colonne divergent est un piège pour le lecteur d'après.
     */
    contentLocale: string;
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

  // UN COACH SANS ÉLÈVE N'A PAS DE SEMAINE À RACONTER, et l'en-tête de
  // `coach-synthesis-v1` le dit depuis le premier jour — sauf que l'écriture
  // avait lieu AVANT le test, donc la ligne partait quand même. Trouvé en QA
  // (2026-08-03): 19 lignes en base pour 16 annoncées par le job, et un coach
  // à zéro élève lisant « 0 in touch, 0 slipping, 0 silent / nobody checked in
  // / nobody logged at least 4 of 7 days » — un constat d'échec sur des gens
  // qui n'existent pas. On sort AVANT le write; le compteur du job (déjà
  // présent) fait le reste.
  if (studentIds.length === 0) {
    return {
      window,
      synthesis: buildCoachSynthesis([], args.now),
      narrative: "",
      write: { written: false, id: null, reason_code: "no_students" },
      studentCount: 0,
    };
  }

  const names = await loadStudentNames(db, studentIds);
  const restricted = await loadRestrictionFlags(db, studentIds);
  const students: StudentWeekInput[] = [];
  for (const studentUserId of studentIds) {
    students.push(await loadStudentWeek(db, {
      studentUserId,
      displayName: names.get(studentUserId) ?? null,
      window,
      restrictionFlag: restricted.has(studentUserId),
    }));
  }

  const synthesis = buildCoachSynthesis(students, args.now);
  const narrative = renderSynthesisText(synthesis, {
    coachName: args.coachName ?? null,
    // UN SEUL TAG, DEUX CONSOMMATEURS. Il était `"en"` en dur ici et
    // `args.contentLocale ?? "en"` dans la ligne: la seule façon d'obtenir un
    // texte et une colonne qui se contredisent.
    locale: args.contentLocale,
  });
  const write = await writeSynthesis(db, {
    coachId: args.coachId,
    kind: "weekly",
    window,
    synthesis,
    narrative,
    contentLocale: args.contentLocale,
  });
  return { window, synthesis, narrative, write, studentCount: studentIds.length };
}
