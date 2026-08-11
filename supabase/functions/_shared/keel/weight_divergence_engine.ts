/**
 * FF-056 — LE DÉCLENCHEUR. Un pas du batch du soir, pour UN élève.
 *
 * ── IL SE GREFFE, IL NE CRÉE PAS UN SECOND CRON ────────────────────────────
 * `keel-daily-recommendation-v1` balaie déjà `profiles` toutes les heures et
 * n'agit que dans la fenêtre 19h-20h LOCALE. Ce module est appelé depuis ce
 * balayage, APRÈS le pas de FF-028. Un second cron aurait doublé le coût du
 * balayage pour rien, et surtout il aurait rendu l'arbitrage du budget T4
 * dépendant de l'ordre d'exécution de deux jobs indépendants — c'est-à-dire
 * non déterministe.
 *
 * ── POURQUOI FF-028 PASSE DEVANT, ET C'EST UN ARBITRAGE ASSUMÉ ────────────
 * Les deux veulent la place du jour. La recommandation est armée par un
 * déclencheur bien plus lent (deux compositions rassasiantes qui n'ont pas
 * suffi) et porte un cooldown de trente jours PAR ACTION: la perdre ce soir
 * coûte un mois. La question de divergence, elle, se réarme d'elle-même dès le
 * prochain soir calme — la fiche dit explicitement « elle attend » (§7). Perdre
 * ce soir lui coûte un soir.
 *
 * ── LA FENÊTRE DU SOIR EST DÉJÀ LA FENÊTRE CALME ──────────────────────────
 * 19h-20h en heure locale: hors des heures calmes 21h-8h par construction. On
 * ne réimplémente donc pas la borne — on hérite de celle du job.
 *
 * ⚠️ IL NE LIT NI L'HORLOGE NI LE FUSEAU: l'appelant passe `now` et la
 * timezone, comme FF-028. Un job qui résout la journée locale à deux endroits
 * finit par décider sur une heure et écrire sur une autre.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { CHAT_SCOPE, deliverChatMessage } from "../chat/delivery.ts";
import {
  countDailyAsks,
  DAILY_ASK_BUDGET,
  recordDailyAsk,
} from "./daily_ask_budget.ts";
import { planFingerprint } from "./daily_recommendation.ts";
import { loadRhythm } from "./daily_recommendation_io.ts";
import { loadPublishedDoctrine } from "./doctrine_loader.ts";
import { readLastTurnSafetyBand } from "./safety_band_io.ts";
import { resolveStudentFollowing } from "./following_io.ts";
import { localDateFor, localHourFor } from "./reengagement_io.ts";
import { weekStartOf } from "./weekly_flow_io.ts";
import { loadBodyMeasures } from "./body_measure_io.ts";
import { evaluateRestrictionForStudent } from "./restriction_runtime.ts";
import { assessBirthDate, weekPlanAgeGate } from "./student_age.ts";
import { isFrenchLocale } from "./locale.ts";
import {
  detectWeightDivergence,
  DIVERGENCE_LOOKBACK_DAYS,
  type WeightDivergenceResult,
} from "./weight_divergence.ts";
import {
  daysBetween,
  expireLapsedEpisodes,
  loadEpisodeHistory,
  loadLiveEpisode,
  openEpisode,
  attachOpeningMessage,
  shiftDate,
} from "./weight_divergence_io.ts";
import { WEIGHT_DIVERGENCE_OPEN_FOR_DAYS } from "../../sophia-brain/skills/weight_divergence/contract.ts";

// ---------------------------------------------------------------------------
// LES CONSTANTES DU DÉCLENCHEUR
// ---------------------------------------------------------------------------

/** La fenêtre du soir, en heure LOCALE. Celle de FF-028, exactement. */
export const DIVERGENCE_HOUR_LOCAL = 19;
export const DIVERGENCE_WINDOW_END_LOCAL = 20;

/**
 * LE DÉLAI APRÈS UNE FIN DE PLAN, EN JOURS. 2, le chiffre de la fiche (« ~J+2 »).
 *
 * ⚠️ SA VRAIE FONCTION EST DE NE PAS CONCURRENCER FF-054. Le retour de fin de
 * plan possède le jour où la fenêtre s'écoule; les fusionner « noierait la
 * question dans un formulaire » (§9). Deux jours, c'est la distance minimale
 * qui garantit que les deux ne se croisent jamais, y compris quand FF-054
 * arrive avec un jour de retard.
 */
export const DIVERGENCE_DAYS_AFTER_PLAN_END = 2;

/**
 * LE COOLDOWN, EN CYCLES DE PLAN — et son PLANCHER EN JOURS.
 *
 * La fiche dit « au moins un cycle de plan complet, deux après un refus »
 * (R9). Un cycle vaut sept jours en pratique: appliqué seul, ce mécanisme
 * pourrait donc revenir toutes les deux semaines — alors que la même fiche
 * écrit, deux paragraphes plus haut, que « mensuel, il devient une
 * convocation » (§3).
 *
 * Les deux moitiés de R9 ne peuvent pas être vraies ensemble. On applique donc
 * LE PLUS LONG DES DEUX: un cycle de plan ET six semaines au minimum, doublés
 * après un refus. Six et pas quatre, parce que quatre EST le mensuel que la
 * fiche nomme comme le mode de défaillance.
 *
 * → Amendement de fiche PROPOSÉ, non appliqué (voir le rapport).
 */
export const DIVERGENCE_COOLDOWN_CYCLES = 1;
export const DIVERGENCE_COOLDOWN_CYCLES_AFTER_DECLINE = 2;
export const DIVERGENCE_COOLDOWN_MIN_DAYS = 42;
export const DIVERGENCE_COOLDOWN_MIN_DAYS_AFTER_DECLINE = 84;

/** La durée d'un cycle quand le plan n'en déclare pas. */
export const DIVERGENCE_DEFAULT_PLAN_CYCLE_DAYS = 7;

// ---------------------------------------------------------------------------
// LA QUESTION D'OUVERTURE — LITTÉRAUX GELÉS
// ---------------------------------------------------------------------------

/**
 * LES QUATRE TEXTES POSSIBLES. Il n'y en aura jamais un cinquième.
 *
 * ⚠️ CE N'EST PAS UNE TÂCHE DE MODÈLE, ET C'EST LA DÉCISION LA PLUS
 * IMPORTANTE DU MODULE. R2 et R3 portent sur deux propriétés de la PHRASE:
 *
 *   R2 — le sujet est LE PLAN, pas la personne. « Si tu manges ce qui est
 *        prévu, normalement ça devrait descendre » énonce ce que le plan
 *        attend. « Tu ne perds pas de poids » énonce ce que la personne est.
 *        La différence tient à quatre mots, et aucun tirage ne la garantit.
 *   R3 — la question est VRAIMENT ouverte. « Qu'est-ce qui se passe ? » ne
 *        présuppose rien. « Tu grignotes le soir ? » referme le champ sur la
 *        nourriture et rate le traitement, le sport arrêté, le sommeil.
 *
 * Un gabarit gelé rend les deux vérifiables par lecture. Un prompt les rend
 * probables.
 *
 * ⚠️ AUCUN NE MENTIONNE LA BALANCE. « Puisque tu t'es pesé… » est la phrase qui
 * apprend à ne plus se peser — le RED majeur de §10.
 */
export const DIVERGENCE_OPENING_QUESTIONS = Object.freeze({
  "down": Object.freeze({
    fr:
      "Si tu manges ce qui est prévu, normalement ça devrait descendre. " +
      "Qu'est-ce qui se passe ?",
    en:
      "If you're eating what's planned, it should normally be going down. " +
      "What's going on?",
  }),
  "up": Object.freeze({
    fr:
      "Si tu manges ce qui est prévu, normalement ça devrait monter. " +
      "Qu'est-ce qui se passe ?",
    en:
      "If you're eating what's planned, it should normally be going up. " +
      "What's going on?",
  }),
});

export function openingQuestionFor(
  direction: "down" | "up",
  responseLocale: string | null,
): string {
  const pack = DIVERGENCE_OPENING_QUESTIONS[direction];
  return isFrenchLocale(responseLocale) ? pack.fr : pack.en;
}

// ---------------------------------------------------------------------------
// LA PARTIE PURE — le cooldown
// ---------------------------------------------------------------------------

export interface CooldownInput {
  todayLocalDate: string;
  /** `opened_local_date` du dernier épisode, quel que soit son état. */
  lastEpisodeOn: string | null;
  /** `opened_local_date` du dernier épisode CLOS PAR UN REFUS. */
  lastDeclinedOn: string | null;
  planCycleDays: number;
}

export interface CooldownVerdict {
  expired: boolean;
  /** Combien de jours étaient exigés. Journalisé: un refus muet ne se règle pas. */
  requiredDays: number;
  elapsedDays: number | null;
  doubledByDecline: boolean;
}

/**
 * LE COOLDOWN EST PUR ET IL SE TESTE SEUL.
 *
 * Le doublement après un refus se calcule sur le dernier REFUS et pas sur le
 * dernier épisode: sinon un épisode expiré posé trop tôt effacerait le
 * doublement, et un « non » cesserait d'être respecté au deuxième tour de
 * manège. R10 dit « immédiatement ET durablement » — le second mot vit ici.
 */
export function evaluateCooldown(input: CooldownInput): CooldownVerdict {
  const cycle = Math.max(1, Math.round(input.planCycleDays));

  const declineActive = input.lastDeclinedOn !== null &&
    daysBetween(input.lastDeclinedOn, input.todayLocalDate) <
      Math.max(
        cycle * DIVERGENCE_COOLDOWN_CYCLES_AFTER_DECLINE,
        DIVERGENCE_COOLDOWN_MIN_DAYS_AFTER_DECLINE,
      );

  const requiredDays = declineActive
    ? Math.max(
      cycle * DIVERGENCE_COOLDOWN_CYCLES_AFTER_DECLINE,
      DIVERGENCE_COOLDOWN_MIN_DAYS_AFTER_DECLINE,
    )
    : Math.max(
      cycle * DIVERGENCE_COOLDOWN_CYCLES,
      DIVERGENCE_COOLDOWN_MIN_DAYS,
    );

  if (input.lastEpisodeOn === null && input.lastDeclinedOn === null) {
    return { expired: true, requiredDays, elapsedDays: null, doubledByDecline: false };
  }
  const anchor = declineActive ? input.lastDeclinedOn! : (input.lastEpisodeOn ?? input.lastDeclinedOn!);
  const elapsedDays = daysBetween(anchor, input.todayLocalDate);
  return {
    expired: elapsedDays >= requiredDays,
    requiredDays,
    elapsedDays,
    doubledByDecline: declineActive,
  };
}

// ---------------------------------------------------------------------------
// LE PAS
// ---------------------------------------------------------------------------

export const DIVERGENCE_SKIP_REASONS = [
  "outside_window",
  "opted_out",
  "minor_student",
  "no_active_plan",
  "no_completed_plan",
  "too_soon_after_plan_end",
  "restriction_flag",
  "safety_band",
  "episode_live",
  "cooldown",
  "ask_budget_taken",
  "already_asked_today",
] as const;
export type DivergenceSkipReason = (typeof DIVERGENCE_SKIP_REASONS)[number];

export type DivergenceStepOutcome =
  | { outcome: "outside_window" }
  /** Un refus NOMMÉ. Le motif est la seule chose qui distingue « ce moteur se
   * tait correctement » de « ce moteur ne peut pas parler ». */
  | { outcome: "skipped"; reason: DivergenceSkipReason }
  /** Le détecteur n'a rien trouvé. Le verdict EST le motif. */
  | { outcome: "no_divergence"; verdict: WeightDivergenceResult["verdict"] }
  | { outcome: "not_delivered"; reason: string }
  | { outcome: "would_ask"; verdict: WeightDivergenceResult }
  | {
    outcome: "asked";
    episodeId: string;
    shape: string;
    fingerprint: string;
  };

export interface DivergenceStepInput {
  userId: string;
  timezone: string | null;
  /** `profiles.proactive_muted_at` — le réglage produit. */
  optedOut: boolean;
  /** `profiles.birth_date`, brut. L'âge se dérive, il ne se stocke pas. */
  birthDate: unknown;
  /** `profiles.locale`. La langue suit le profil (lot L1). */
  locale: string | null;
  now: Date;
  dryRun: boolean;
  requestId?: string;
}

export async function runWeightDivergenceStep(
  admin: SupabaseClient,
  input: DivergenceStepInput,
): Promise<DivergenceStepOutcome> {
  const { userId, now } = input;
  const localHour = localHourFor(now, input.timezone);
  const localDate = localDateFor(now, input.timezone);

  if (
    localHour === null || localDate === null ||
    localHour < DIVERGENCE_HOUR_LOCAL ||
    localHour >= DIVERGENCE_WINDOW_END_LOCAL
  ) {
    return { outcome: "outside_window" };
  }

  if (input.optedOut) return { outcome: "skipped", reason: "opted_out" };

  // ── MAJEUR ──────────────────────────────────────────────────────────────
  // ⚠️ ON UTILISE LA GARDE D'ÂGE DU DÉPÔT, PAS UNE SECONDE. `weekPlanAgeGate`
  // ne mord que sur un mineur AVÉRÉ; une date de naissance absente passe. Ce
  // n'est PAS ce que la fiche demande au pied de la lettre (« jamais un
  // mineur ») et c'est écrit tel quel dans le rapport: durcir ici créerait une
  // seconde politique d'âge dans le produit, ce que ce dépôt paie déjà ailleurs.
  // La décision de la durcir est humaine, et elle tient en une ligne.
  const ageGate = weekPlanAgeGate(assessBirthDate(input.birthDate, localDate));
  if (!ageGate.allowed) return { outcome: "skipped", reason: "minor_student" };

  // ── LES QUESTIONS SANS RÉPONSE MEURENT AVANT QU'ON LISE L'HISTORIQUE ────
  // L'ordre compte, exactement comme FF-028: `loadLiveEpisode` doit refléter ce
  // qui est ENCORE vivant. L'inverse ferait attendre le moteur derrière une
  // question posée il y a six mois — et « aucune relance » deviendrait
  // « plus jamais rien ».
  await expireLapsedEpisodes(admin, {
    userId,
    todayLocalDate: localDate,
    openForDays: WEIGHT_DIVERGENCE_OPEN_FOR_DAYS,
  });

  const live = await loadLiveEpisode(admin, userId);
  if (live) return { outcome: "skipped", reason: "episode_live" };

  const following = await resolveStudentFollowing(
    admin,
    userId,
    weekStartOf(localDate),
  );
  if (!following.following) {
    return { outcome: "skipped", reason: "no_active_plan" };
  }

  // ── LE PLANCHER TCA, POUR DE VRAI ───────────────────────────────────────
  // ⚠️ FF-028 épingle `restrictionFlag = false` avec un pavé qui explique
  // pourquoi (`weekly_reviews.risk_band` n'a aucun écrivain). Ce module ne
  // pouvait pas se le permettre: il PARLE DE POIDS QUI NE DESCEND PAS, ce qui
  // est le pire terrain du produit. On évalue donc le plancher réel, sur les
  // mesures datées, à chaque déclenchement — et une lecture qui échoue REMONTE
  // plutôt que de rendre `false`. Un plancher qu'on n'a pas pu lire n'est pas
  // un plancher baissé.
  const restriction = await evaluateRestrictionForStudent(admin, {
    userId,
    asOfLocalDate: localDate,
  });
  if (restriction.restriction_flag === true) {
    return { outcome: "skipped", reason: "restriction_flag" };
  }

  const safetyBand = await readLastTurnSafetyBand(admin, {
    userId,
    scope: CHAT_SCOPE,
  });
  if (safetyBand !== null && safetyBand !== "none") {
    return { outcome: "skipped", reason: "safety_band" };
  }

  // ── LA FENÊTRE CALME: ~J+2 APRÈS UNE FIN DE PLAN, JAMAIS LE JOUR DE FF-054 ─
  const lastEnd = await lastElapsedPlanEnd(admin, userId, localDate);
  if (lastEnd === null) {
    // Personne n'a jamais fini un plan: il n'existe aucun résultat à constater.
    return { outcome: "skipped", reason: "no_completed_plan" };
  }
  if (daysBetween(lastEnd.endsOn, localDate) < DIVERGENCE_DAYS_AFTER_PLAN_END) {
    return { outcome: "skipped", reason: "too_soon_after_plan_end" };
  }

  // ── LE COOLDOWN ─────────────────────────────────────────────────────────
  const history = await loadEpisodeHistory(admin, userId);
  const cooldown = evaluateCooldown({
    todayLocalDate: localDate,
    lastEpisodeOn: history.last?.opened_local_date ?? null,
    lastDeclinedOn: history.lastDeclined?.opened_local_date ?? null,
    planCycleDays: lastEnd.durationDays,
  });
  if (!cooldown.expired) return { outcome: "skipped", reason: "cooldown" };

  // ── LE CONSTAT ──────────────────────────────────────────────────────────
  const measures = await loadBodyMeasures(admin, {
    userId,
    sinceLocalDate: shiftDate(localDate, -DIVERGENCE_LOOKBACK_DAYS),
    untilLocalDate: localDate,
    kinds: ["weight"],
  });
  const goal = await loadGoal(admin, userId);
  const verdict = detectWeightDivergence({
    measures,
    goal,
    todayLocalDate: localDate,
  });
  if (verdict.verdict !== "divergence_established") {
    return { outcome: "no_divergence", verdict: verdict.verdict };
  }

  // ── LA PLACE DANS LE BUDGET T4 ──────────────────────────────────────────
  const asks = await countDailyAsks(admin, { userId, localDate });
  if (asks.count >= DAILY_ASK_BUDGET) {
    return { outcome: "skipped", reason: "ask_budget_taken" };
  }

  if (input.dryRun) return { outcome: "would_ask", verdict };

  // ── L'ORDRE DES ÉCRITURES EST LE CONTRAT ────────────────────────────────
  //   1. l'ÉPISODE, parce que c'est lui qui prend la place (index unique) et
  //      que son identifiant est ce que le flow de conversation relit;
  //   2. la PLACE dans le budget partagé, avant que la demande ne parte;
  //   3. la LIVRAISON.
  const rhythm = await loadRhythm(admin, userId);
  const doctrine = await loadPublishedDoctrine(admin, userId);
  const fingerprint = planFingerprint({
    rhythm: rhythm.effective,
    doctrineVersion: doctrine.doctrine?.version ?? null,
  });

  const opened = await openEpisode(admin, {
    userId,
    localDate,
    detectorVersion: verdict.detectorVersion,
    shape: verdict.shape!,
    goalDirection: verdict.direction!,
    planFingerprint: fingerprint,
    contentLocale: input.locale,
  });
  if (opened.outcome === "already_live") {
    // Une autre instance a gagné la course. L'index unique arbitre, pas un
    // verrou applicatif.
    return { outcome: "skipped", reason: "episode_live" };
  }
  const episode = opened.row;

  const question = openingQuestionFor(verdict.direction!, input.locale);
  const recorded = await recordDailyAsk(admin, {
    userId,
    localDate,
    kind: "weight_divergence_question",
    source: "chat",
    // Le CHECK conditionnel en base refuse un axe sur tout autre genre que la
    // question de précision.
    axis: null,
    text: question,
    protocolEventId: null,
    // Pas de message ENTRANT: la clé d'idempotence est l'épisode lui-même.
    askedForMessageId: `divergence:${episode.id}`,
  });
  if (!recorded.ok) {
    // La place n'a pas été prise ⇒ la demande ne part pas. Une demande hors
    // compteur rend le plafond décoratif — et l'épisode meurt avec elle, sinon
    // il bloquerait tous les suivants par l'index unique.
    await closeUndelivered(admin, episode.id, userId);
    return { outcome: "not_delivered", reason: "ask_record_failed" };
  }

  const delivered = await deliverChatMessage(admin, {
    userId,
    content: question,
    purpose: "keel_weight_divergence",
    requestId: input.requestId,
    metadata: { keel_weight_divergence_episode_id: episode.id },
    now,
  });
  if (!delivered.delivered) {
    await closeUndelivered(admin, episode.id, userId);
    return { outcome: "not_delivered", reason: `delivery:${delivered.reason}` };
  }
  await attachOpeningMessage(admin, {
    id: episode.id,
    chatMessageId: delivered.chatMessageId,
  });

  console.info(JSON.stringify({
    tag: "keel.weight_divergence.asked",
    user_id: userId,
    local_date: localDate,
    shape: verdict.shape,
    direction: verdict.direction,
    detector_version: verdict.detectorVersion,
    progress_pct: verdict.progressPct,
    weeks: verdict.window.length,
    episode_id: episode.id,
    cooldown_required_days: cooldown.requiredDays,
  }));

  return {
    outcome: "asked",
    episodeId: episode.id,
    shape: verdict.shape!,
    fingerprint,
  };
}

// ---------------------------------------------------------------------------
// LES LECTURES ANNEXES
// ---------------------------------------------------------------------------

/**
 * La dernière fenêtre de plan ÉCOULÉE, et sa durée.
 *
 * `ends_on` est une colonne GÉNÉRÉE en base (`starts_on + duration_days - 1`,
 * migration 20260807090000): on la lit plutôt que de la recalculer, parce que
 * deux définitions de « la fin du plan » divergeraient au premier ajustement —
 * et la divergence se paierait sur le seul jour qu'on cherche à éviter, celui
 * de FF-054.
 */
async function lastElapsedPlanEnd(
  db: SupabaseClient,
  userId: string,
  todayLocalDate: string,
): Promise<{ endsOn: string; durationDays: number } | null> {
  const { data, error } = await db
    .from("student_generated_meals")
    .select("ends_on, duration_days")
    .eq("user_id", userId)
    .is("retired_at", null)
    .lt("ends_on", todayLocalDate)
    .order("ends_on", { ascending: false })
    .limit(1);
  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) return null;
  const endsOn = String(rows[0].ends_on ?? "").trim();
  if (!endsOn) return null;
  const duration = Number(rows[0].duration_days ?? 0);
  return {
    endsOn,
    durationDays: Number.isFinite(duration) && duration > 0
      ? duration
      : DIVERGENCE_DEFAULT_PLAN_CYCLE_DAYS,
  };
}

async function loadGoal(
  db: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("student_goals")
    .select("goal")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const goal = (data as { goal?: unknown } | null)?.goal;
  return typeof goal === "string" ? goal : null;
}

/**
 * Un épisode dont la question n'est jamais partie NE DOIT PAS SURVIVRE.
 *
 * Il occuperait la place (index unique) pour une question que personne n'a
 * lue — c'est-à-dire qu'il ferait taire ce mécanisme définitivement, en
 * silence, pour cette personne. Même arbitrage que `expireProposal` de FF-028.
 */
async function closeUndelivered(
  db: SupabaseClient,
  id: string,
  userId: string,
): Promise<void> {
  const { error } = await db
    .from("student_weight_divergence_episodes")
    .update({
      state: "expired",
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    console.warn(JSON.stringify({
      tag: "weight_divergence_close_undelivered_failed",
      episode_id: id,
      error: error.message,
    }));
  }
}
