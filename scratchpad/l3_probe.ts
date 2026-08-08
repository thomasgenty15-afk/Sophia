/**
 * L3 — MESURE DE CE QUE `weekly_reviews.risk_band` FAIT ENCORE.
 *
 * ⚠️ CETTE SONDE NE PROUVE RIEN PAR ELLE-MÊME. Elle mesure, sur un élève RÉEL
 * de la base locale, ce que chaque consommateur du plancher durable décide
 * dans DEUX états:
 *   S0 — `risk_band` absent  (= l'état de 100 % des élèves réels, cf. preuves)
 *   S1 — `risk_band='restriction_flag'` semé à la main (= le contre-test)
 *
 * Les décisions ne sont PAS simulées: on appelle les vraies fonctions de
 * production (`isRestrictionFlagged`, `loadRestrictionFlags`,
 * `loadReengageCandidates`, `decideForCandidates`, `decideWeeklyFlow`,
 * `decideDailyRecommendation`, `practicesFor`, `decidePracticeMode`,
 * `buildStudentLine`) avec un client service-role sur la base locale, plus un
 * appel HTTP réel de `keel-reengage-v1`.
 *
 * ⚠️ T-15: la ligne semée parle la forme de la PRODUCTION du bilan hebdo
 * (`plan_version_id is null`, `content_locale` non nul), pas une forme inventée.
 */
import {
  admin,
  callCron,
  type Coach,
  makeCoach,
  makeStudent,
  mondayOf,
  publishPlanFor,
  type Student,
} from "../docs/nutrition-pivot/qa-web/harness.ts";
import {
  decideForCandidates,
  // isRestrictionFlagged est RETIRÉE (L3): la sonde APRÈS lit donc le champ que
  // `loadReengageCandidates` porte, pas une fonction disparue.
  loadReengageCandidates,
} from "../supabase/functions/_shared/keel/reengagement_io.ts";
import {
  lastCompleteWeek,
  loadRestrictionFlags,
  loadStudentWeek,
} from "../supabase/functions/_shared/keel/coach_synthesis_io.ts";
import { decideWeeklyFlow } from "../supabase/functions/_shared/keel/weekly_flow.ts";
import {
  decideDailyRecommendation,
  RECOMMENDATION_ACTIONS,
} from "../supabase/functions/_shared/keel/daily_recommendation.ts";
import {
  type DailyPractice,
  decidePracticeMode,
  parseDailyPractices,
  practicesFor,
} from "../supabase/functions/_shared/keel/daily_practices.ts";
import { buildStudentLine } from "../supabase/functions/_shared/keel/coach_synthesis.ts";
import { escalateRestrictionSignal } from "../supabase/functions/_shared/keel/restriction_runtime.ts";
import { evaluateRestrictionGuard } from "../supabase/functions/_shared/keel/restriction_guard.ts";

const PREFIX = "l3";

/**
 * Deux pratiques du coach: une chiffrée, une non chiffrée.
 *
 * ⚠️ T-15 — elles passent par le VRAI parseur (`parseDailyPractices`), donc par
 * la même forme que la doctrine en base. Un objet construit à la main aurait
 * pu porter un `goalScope: null` que la production ne produit jamais.
 */
const PARSED = parseDailyPractices([
  {
    label: "Two glasses of water before lunch",
    kind: "hydration",
    cadence: "constant",
    quantified: true,
    target: 2,
    unit: "glasses",
    brief: "Rappelle l'eau avant le déjeuner.",
    askable: true,
    minor_safe: true,
    goal_scope: [],
    status: "active",
  },
  {
    label: "Sit down to eat",
    kind: "meal_timing",
    cadence: "constant",
    quantified: false,
    brief: "Rappelle de s'asseoir pour manger.",
    askable: true,
    minor_safe: true,
    goal_scope: [],
    status: "active",
  },
]);
const PRACTICES: readonly DailyPractice[] = PARSED.practices;
// ⚠️ T-15 — LA SONDE REFUSE DE MESURER SUR UNE FIXTURE QUI N'ATTEINT PAS LA
// GARDE. Au premier jet, `status` manquait: le parseur dégradait les deux
// pratiques en `needs_review`, `practicesFor` les écartait AVANT le plancher,
// et la mesure rendait `[]` dans LES DEUX états — un faux vert qui aurait fait
// conclure « cette garde ne fait rien ».
if (PARSED.issues.length > 0 || PRACTICES.length !== 2) {
  throw new Error(
    `fixture pratiques non conforme (T-15): issues=${
      JSON.stringify(PARSED.issues)
    } statuts=${JSON.stringify(PRACTICES.map((p) => p.status))}`,
  );
}

type Snapshot = {
  state: string;
  dbRow: unknown;
  isRestrictionFlagged: boolean;
  synthesisFlagged: boolean;
  reengage: unknown;
  reengageHttp: unknown;
  weeklyFlow: unknown;
  recommendation: unknown;
  practicesKept: string[];
  practiceMode: string;
  coachLine: { riskBand: string; flagReason: string | null; severity: number };
  coachStudentPageRead: unknown;
};

async function measure(state: string, student: Student): Promise<Snapshot> {
  const db = admin();
  const now = new Date();

  // La ligne telle qu'elle est, relue en base — la vérité, jamais la réponse.
  const rowRes = await db
    .from("weekly_reviews")
    .select("id, week_start_date, risk_band, plan_version_id, content_locale")
    .eq("user_id", student.userId)
    .order("week_start_date", { ascending: false });
  if (rowRes.error) throw rowRes.error;

  // 1+3. LA RELANCE — module réel, de bout en bout. C'est AUSSI le point de
  //       mesure du plancher durable: `candidate.restrictionFlag` est le champ
  //       que remplissait `isRestrictionFlagged`. Le mesurer ICI plutôt que
  //       d'appeler la fonction rend la sonde valable AVANT et APRÈS — même
  //       point d'observation, même chemin de production.
  const candidates = await loadReengageCandidates(db, {
    now,
    limit: 500,
    afterUserId: null,
  });
  const mine = candidates.find((c) => c.userId === student.userId) ?? null;
  if (!mine) throw new Error("élève absent des candidats: la sonde ne mesure rien");
  const flagged = mine.restrictionFlag;
  const decisions = decideForCandidates([mine], now);

  // 2. La synthèse coach.
  const todayIso = now.toISOString().slice(0, 10);
  const window = lastCompleteWeek(todayIso);
  const synth = await loadRestrictionFlags(db, [student.userId]);

  // 3-bis. LA RELANCE PAR HTTP — la vraie fonction edge, cadrée sur cet élève.
  const predRes = await db
    .from("profiles")
    .select("id")
    .lt("id", student.userId)
    .order("id", { ascending: false })
    .limit(1);
  if (predRes.error) throw predRes.error;
  const pred = ((predRes.data ?? []) as Array<{ id: string }>)[0]?.id ?? null;
  const http = await callCron("keel-reengage-v1", {
    dry_run: true,
    limit: 1,
    after_user_id: pred,
    now: now.toISOString(),
  });

  // 4. LE POINT HEBDO — dimanche 19h locales, toutes les autres portes ouvertes.
  const weekly = decideWeeklyFlow({
    localDow: 0,
    localHour: 19,
    answeredThisWeek: false,
    askedThisWeek: false,
    safetyBand: null,
    restrictionFlagged: flagged,
    optedOut: false,
    hasActivePlan: true,
  });

  // 5. LA RECOMMANDATION DU SOIR — toutes les autres portes ouvertes.
  const reco = decideDailyRecommendation({
    restrictionFlag: flagged,
    safetyBand: null,
    optedOut: false,
    hasActivePlan: true,
    doctrineReadable: true,
    // Le catalogue GELÉ de la production, pas une action inventée (T-15).
    actionSpace: RECOMMENDATION_ACTIONS,
    declineStreak: 0,
    cooldownBlocked: [],
    hasOpenProposal: false,
    dailyAskCount: 0,
    dailyAskBudget: 2,
    alreadyProposedToday: false,
    hunger: { kind: "none" } as never,
    satietyAdaptations: 0,
  });

  // 6. LES PRATIQUES DU SOIR (FF-029) — le même booléen, deux effets.
  const kept = practicesFor(PRACTICES, null, false, flagged);
  const mode = decidePracticeMode({
    pulseAsks: false,
    restrictionFlag: flagged,
    askBudgetSpent: false,
    practiceIgnored: false,
    practice: PRACTICES[1],
  });

  // 7. LA SYNTHÈSE COACH — le VRAI chargeur, puis la vraie ligne.
  const weekInput = await loadStudentWeek(db, {
    studentUserId: student.userId,
    displayName: "QA L3",
    window,
    restrictionFlag: synth.has(student.userId),
  });
  const line = buildStudentLine(weekInput, now);

  // 8. L'ÉCRAN COACH (`CoachStudentPage.tsx:432`) — la même requête, mot pour mot.
  const pageRes = await db
    .from("weekly_reviews")
    .select("week_start_date, biofeedback, risk_band")
    .eq("user_id", student.userId)
    .order("week_start_date", { ascending: false })
    .limit(8);
  if (pageRes.error) throw pageRes.error;
  const pageRows = (pageRes.data ?? []) as Array<{ risk_band?: string }>;

  return {
    state,
    dbRow: rowRes.data,
    isRestrictionFlagged: flagged,
    synthesisFlagged: synth.has(student.userId),
    reengage: decisions[0]?.decision ?? "(pas candidat)",
    reengageHttp: {
      status: http.status,
      candidates: http.json?.candidates ?? null,
      skipped_by_reason: http.json?.skipped_by_reason ?? null,
      sent: http.json?.sent ?? null,
      armed: http.json?.armed ?? null,
    },
    weeklyFlow: weekly,
    recommendation: reco,
    practicesKept: kept.map((p) => p.label),
    practiceMode: mode,
    coachLine: {
      riskBand: line.riskBand,
      flagReason: line.flagReason,
      severity: line.severity,
    },
    coachStudentPageRead: {
      rows: pageRows.length,
      bannerShown: pageRows[0]?.risk_band === "restriction_flag",
    },
  };
}

async function main() {
  const rejeu = Number(Deno.args[0] ?? "1");
  const db = admin();
  const coach: Coach = await makeCoach({ displayName: `L3 Coach ${rejeu}` });
  const student = await makeStudent({
    coach,
    timezone: "Europe/Paris",
    country: "FR",
    locale: "fr-FR",
    fullName: `L3 Student ${rejeu}`,
  });
  await publishPlanFor(coach, student.userId, { timezone: "Europe/Paris" });

  const out: Record<string, unknown> = { rejeu, studentId: student.userId };

  // ── S0: aucun `risk_band`. C'est l'état de 100 % des élèves réels.
  out.S0 = await measure("S0_risk_band_absent", student);

  // ── S1: le contre-test. La ligne parle la forme de la production:
  //      `plan_version_id is null`, `content_locale` non nul — exactement ce
  //      que `week_review_io.ts:477` insère, plus `risk_band`.
  // ⚠️ T-15 — LE PIÈGE ÉVITÉ ICI. `loadRestrictionFlags` borne sa lecture à la
  // DERNIÈRE SEMAINE COMPLÈTE (`lastCompleteWeek`), pas à la semaine en cours.
  // Semer sur le lundi courant aurait rendu `synthesisFlagged=false` en S1 —
  // et fait conclure « la garde de la synthèse ne mord pas » alors que la
  // fixture ne l'atteignait simplement pas. `isRestrictionFlagged`, lui, lit la
  // ligne la plus récente quel que soit son âge: une seule ligne sert les deux.
  const weekStart = lastCompleteWeek(new Date().toISOString().slice(0, 10)).periodStart;
  const ins = await db.from("weekly_reviews").insert({
    user_id: student.userId,
    week_start_date: weekStart,
    plan_version_id: null,
    content_locale: "fr-FR",
    risk_band: "restriction_flag",
    biofeedback: { source: "qa_l3" },
  } as never);
  if (ins.error) throw new Error(`seed weekly_reviews: ${ins.error.message}`);

  out.S1 = await measure("S1_restriction_flag", student);

  // ── S2: LA SOURCE VIVANTE, SEULE. `risk_band` retiré, et une escalade
  //      `contract_change_requests(reason_code='restriction_signal')` écrite par
  //      la VRAIE fonction de production (`escalateRestrictionSignal`, appelée
  //      par `provision_day.ts:176` et `run.ts:6313`).
  //      C'est la mesure de ce que la synthèse coach perd — ou ne perd pas —
  //      quand on lui retire sa seconde source.
  const del = await db.from("weekly_reviews").delete().eq("user_id", student.userId);
  if (del.error) throw new Error(`nettoyage S2: ${del.error.message}`);
  // ⚠️ T-15 — le résultat passe par le VRAI plancher (`evaluateRestrictionGuard`,
  // déclencheur « langage compensatoire », l'un des 4 vivants validés par
  // FF-021). Un objet construit à la main est REFUSÉ par le module lui-même
  // (`guard_version … is not restriction_guard.v1`) — première tentative, RED.
  const guardResult = evaluateRestrictionGuard({
    as_of_local_date: new Date().toISOString().slice(0, 10),
    weekly_outcomes: [],
    energy_days: [],
    texts: [{
      source: "turn_message",
      text: "I skipped dinner to make up for lunch.",
      content_locale: "en-US",
    }],
  });
  if (guardResult.restriction_flag !== true) {
    throw new Error(
      `fixture escalade non conforme (T-15): le plancher n'a pas levé — ` +
        JSON.stringify(guardResult),
    );
  }
  const esc = await escalateRestrictionSignal(db as never, {
    userId: student.userId,
    result: guardResult,
    studentWords: "I skipped dinner to make up for lunch.",
  });
  out.escalation = esc;
  out.S2 = await measure("S2_escalade_vivante_sans_risk_band", student);

  console.log(JSON.stringify(out, null, 2));
}

if (import.meta.main) await main();
