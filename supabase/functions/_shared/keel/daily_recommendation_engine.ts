/**
 * FF-028 — LE PAS DU MOTEUR, POUR UN ÉLÈVE.
 *
 * ── POURQUOI CE FICHIER EXISTE, ET PAS SEULEMENT `index.ts` ────────────────
 * Le corps d'un cron qui vit dans son `index.ts` n'est joignable que par HTTP,
 * donc éprouvable seulement là où la fonction est SERVIE. Ce dépôt a déjà payé
 * la classe de défaut correspondante — « des sondes vertes sur un chemin que la
 * production ne prend pas » — et sa symétrique, tout aussi coûteuse: une
 * logique qu'on ne peut pas jouer en conditions réelles finit vérifiée par des
 * doubles.
 *
 * Le job est donc coupé en deux, et la coupure est là où elle porte:
 *   * `keel-daily-recommendation-v1/index.ts` — la garde interne, la
 *     pagination sur `profiles`, le budget de temps, le compte-rendu. Copié
 *     verbatim de `keel-daily-pulse-v1`, sans une décision produit dedans.
 *   * CE FICHIER — tout ce qui décide et tout ce qui écrit, pour UN élève, à
 *     UN instant. Un appelant qui a un client admin et un identifiant peut le
 *     jouer, en vrai, sur la vraie base.
 *
 * ⚠️ IL NE LIT NI L'HORLOGE NI LE FUSEAU: l'appelant passe `now` et la timezone.
 * Un job qui résout la journée locale à deux endroits finit par décider sur une
 * heure et écrire sur une autre — c'est la famille de bugs nocturnes que ce
 * dépôt a déjà payée, et le motif exact du champ `now` de `deliverChatMessage`.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { CHAT_SCOPE, deliverChatMessage } from "../chat/delivery.ts";
import {
  countDailyAsks,
  DAILY_ASK_BUDGET,
  recordDailyAsk,
} from "./daily_ask_budget.ts";
import {
  buildActionSpace,
  decideDailyRecommendation,
  filterActionsByDoctrine,
  planFingerprint,
  type RecommendationActionId,
  renderRecommendation,
  SATIETY_ADAPTATION_LOOKBACK_DAYS,
  type RecommendationSilentReason,
} from "./daily_recommendation.ts";
import {
  attachProposalMessage,
  expireLapsedProposals,
  expireProposal,
  insertProposal,
  loadRecommendationHistory,
  loadRhythm,
} from "./daily_recommendation_io.ts";
import { RECOMMENDATION_OPEN_FOR_DAYS } from "./daily_recommendation.ts";
import { countHungerDays } from "./hunger_signal.ts";
import { countSatietyAdaptations, loadHungerDays } from "./hunger_signal_io.ts";
import { loadPublishedDoctrine } from "./doctrine_loader.ts";
import { readLastTurnSafetyBand } from "./safety_band_io.ts";
import { resolveStudentFollowing } from "./following_io.ts";
import { localDateFor, localHourFor } from "./reengagement_io.ts";
import { weekStartOf } from "./weekly_flow_io.ts";

/** La fenêtre du soir, en heure LOCALE. Strictement AVANT celle du tap. */
export const RECOMMENDATION_HOUR_LOCAL = 19;
export const RECOMMENDATION_WINDOW_END_LOCAL = 20;

export type RecommendationStepOutcome =
  | { outcome: "outside_window" }
  | { outcome: "silent"; reason: RecommendationSilentReason }
  /** Une place du budget n'a pas pu être prise, ou la livraison a été refusée. */
  | { outcome: "not_delivered"; reason: string }
  | {
    outcome: "proposed";
    proposalId: string;
    action: RecommendationActionId;
    fingerprint: string;
  }
  /** `dry_run`: la décision est prise, rien n'est écrit. */
  | { outcome: "would_propose"; action: RecommendationActionId };

export interface RecommendationStepInput {
  userId: string;
  timezone: string | null;
  /** `profiles.proactive_muted_at` — le réglage produit, pas un opt-in Meta. */
  optedOut: boolean;
  now: Date;
  dryRun: boolean;
  requestId?: string;
  /** Ce que la doctrine a retiré de l'espace, pour le compte-rendu du job. */
  onDoctrineRemoved?: (id: RecommendationActionId, reason: string) => void;
}

/**
 * UN ÉLÈVE, UN SOIR.
 *
 * ⚠️ ELLE REMONTE SUR PANNE DE LECTURE, et c'est l'asymétrie qui compte: rater
 * une proposition coûte une proposition; rater le plancher de restriction
 * pointe un moteur de recommandation ALIMENTAIRE sur quelqu'un qui restreint,
 * ce qui est le risque catégorie 1 de la fiche en une phrase. L'appelant compte
 * le tour en `failures`.
 */
export async function runRecommendationStep(
  admin: SupabaseClient,
  input: RecommendationStepInput,
): Promise<RecommendationStepOutcome> {
  const { userId, now } = input;
  const localHour = localHourFor(now, input.timezone);
  const localDate = localDateFor(now, input.timezone);

  if (
    localHour === null ||
    localHour < RECOMMENDATION_HOUR_LOCAL ||
    localHour >= RECOMMENDATION_WINDOW_END_LOCAL
  ) {
    return { outcome: "outside_window" };
  }

  // ── LES LECTURES, DANS L'ORDRE DES GATES ────────────────────────────────
  //
  // ⚠️ ON LIT TOUT AVANT DE DÉCIDER, et c'est délibéré. Court-circuiter sur le
  // seuil de « significatif » — qui est le cas nominal — aurait économisé la
  // lecture de doctrine sur l'écrasante majorité des élèves, au prix du MOTIF:
  // un élève sous plancher de restriction se serait compté en
  // `nothing_significant`. Or le motif est la seule chose qui distingue « ce
  // moteur se tait correctement » de « ce moteur ne peut pas parler ». Le coût
  // est d'une poignée de lectures indexées, une fois par élève et par jour, sur
  // une seule heure locale.
  // ⚠️ FAUX, ET DIT COMME TEL (L3, 2026-08-08). C'était
  // `await isRestrictionFlagged(admin, userId)`, qui lisait
  // `weekly_reviews.risk_band` — colonne de l'ancienne weekly review 1:1, sans
  // aucun écrivain (épreuves d'absence: code, `prosrc`, vues, base). Elle
  // rendait déjà `false` pour 100 % des élèves réels.
  //
  // Ce que ce `false` coûte quand la bande était renseignée, mesuré 3/3: le
  // motif de silence passe de `restriction_flag` à `nothing_significant` — et
  // sur un élève qui AURAIT de la matière, la recommandation part au lieu de se
  // taire. Réarmement: voir le pavé de `_shared/keel/reengagement_io.ts`.
  const restrictionFlag = false;
  const safetyBand = await readLastTurnSafetyBand(admin, {
    userId,
    scope: CHAT_SCOPE,
  });
  const following = await resolveStudentFollowing(
    admin,
    userId,
    weekStartOf(localDate),
  );

  // R5 — LA DOCTRINE. `load_failed` et « pas de doctrine » sont deux choses: la
  // première fait taire (on ne propose pas à l'aveugle dans le cadre d'un coach
  // qu'on n'a pas pu lire), la seconde ne filtre rien (il n'y a alors aucune
  // méthode à contredire).
  const loaded = await loadPublishedDoctrine(admin, userId);
  const doctrineReadable = loaded.reason !== "load_failed";

  const rhythm = await loadRhythm(admin, userId);
  const filtered = filterActionsByDoctrine(
    buildActionSpace(rhythm.effective),
    loaded.doctrine,
  );
  for (const removed of filtered.removed) {
    input.onDoctrineRemoved?.(removed.id, removed.reason);
  }

  // LES PROPOSITIONS TROP VIEILLES MEURENT AVANT QU'ON LISE L'HISTORIQUE.
  // L'ordre compte: `hasOpenProposal` doit refléter ce qui est ENCORE vivant,
  // pas ce qui traîne. Faire l'inverse ferait attendre le moteur derrière une
  // question posée il y a six mois.
  await expireLapsedProposals(admin, {
    userId,
    todayLocalDate: localDate,
    openForDays: RECOMMENDATION_OPEN_FOR_DAYS,
  });

  const history = await loadRecommendationHistory(admin, {
    userId,
    todayLocalDate: localDate,
  });
  const asks = await countDailyAsks(admin, { userId, localDate });
  const hunger = countHungerDays(
    await loadHungerDays(admin, { userId, todayLocalDate: localDate }),
    localDate,
  );
  const adaptations = await countSatietyAdaptations(admin, {
    userId,
    sinceLocalDate: shiftDate(localDate, -SATIETY_ADAPTATION_LOOKBACK_DAYS),
  });

  const decision = decideDailyRecommendation({
    restrictionFlag,
    safetyBand,
    optedOut: input.optedOut,
    hasActivePlan: following.following,
    doctrineReadable,
    actionSpace: filtered.kept,
    declineStreak: history.declineStreak,
    cooldownBlocked: history.cooldownBlocked,
    dailyAskCount: asks.count,
    dailyAskBudget: DAILY_ASK_BUDGET,
    hasOpenProposal: history.hasOpenProposal,
    alreadyProposedToday: history.alreadyProposedToday,
    hunger,
    satietyAdaptations: adaptations,
  });

  if (decision.decision === "silent") {
    return { outcome: "silent", reason: decision.reason };
  }

  const action = decision.action;
  if (input.dryRun) return { outcome: "would_propose", action: action.id };

  const fingerprint = planFingerprint({
    rhythm: rhythm.effective,
    doctrineVersion: loaded.doctrine?.version ?? null,
  });

  // ── L'ORDRE DES ÉCRITURES EST LE CONTRAT ────────────────────────────────
  //   1. la LIGNE, parce que c'est son identifiant que les boutons
  //      transportent — une proposition livrée sans ligne est une proposition
  //      dont le « Oui » ne désigne rien;
  //   2. la PLACE dans le budget partagé, avant que la demande ne parte
  //      (mécanique de `recordDailyAsk`);
  //   3. la LIVRAISON.
  const inserted = await insertProposal(admin, {
    userId,
    localDate,
    actionId: action.id,
    planFingerprint: fingerprint,
    proposedText: action.proposal,
  });
  if (inserted.outcome === "already_today") {
    // Une autre instance du job a gagné la course. Ce n'est pas une panne.
    return { outcome: "silent", reason: "already_proposed_today" };
  }
  const proposal = inserted.row;

  const recorded = await recordDailyAsk(admin, {
    userId,
    localDate,
    kind: "daily_recommendation",
    source: "chat",
    // ⚠️ `axis: null` OBLIGATOIRE. Le CHECK conditionnel en base refuse un axe
    // sur tout autre genre que la question de précision, et lui en inventer un
    // ferait entrer une valeur fausse dans une colonne que
    // `meal_precision_flow` relit.
    axis: null,
    text: action.proposal,
    protocolEventId: null,
    // Il n'y a pas de message ENTRANT ici: la clé d'idempotence est donc la
    // proposition elle-même, unique par élève et par journée locale. Un rejeu
    // du job ne peut pas consommer deux places pour une proposition partie une
    // fois.
    askedForMessageId: `reco:${proposal.id}`,
  });
  if (!recorded.ok) {
    // La place n'a pas été prise ⇒ la demande ne part pas. Une demande hors
    // compteur rend le plafond décoratif.
    await expireProposal(admin, { id: proposal.id, reason: "undelivered" });
    return { outcome: "not_delivered", reason: "ask_record_failed" };
  }

  const message = renderRecommendation(action, proposal.id);
  const delivered = await deliverChatMessage(admin, {
    userId,
    content: message.body,
    purpose: "keel_daily_recommendation",
    buttons: message.buttons,
    requestId: input.requestId,
    metadata: {
      keel_recommendation_id: proposal.id,
      keel_recommendation_action: action.id,
    },
    // L'horloge du job est aussi celle de ses effets: sans ce passage, `now`
    // gouvernerait la décision et l'horloge réelle l'écriture, et le plafond
    // quotidien se compterait sur une AUTRE date locale que celle qui a
    // autorisé l'envoi.
    now,
  });
  if (!delivered.delivered) {
    // Un refus de livraison n'est pas une panne (mute, plafond, compte en
    // suppression). La proposition MEURT ici: la laisser `proposed` ferait
    // vivre une question que personne n'a lue, dont les boutons n'existent
    // nulle part.
    await expireProposal(admin, { id: proposal.id, reason: "undelivered" });
    return { outcome: "not_delivered", reason: `delivery:${delivered.reason}` };
  }
  await attachProposalMessage(admin, {
    id: proposal.id,
    chatMessageId: delivered.chatMessageId,
  });

  console.info(JSON.stringify({
    tag: "keel.daily_recommendation.proposed",
    user_id: userId,
    local_date: localDate,
    action: action.id,
    fingerprint,
    hunger_days: hunger.days,
    satiety_adaptations: adaptations,
    proposal_id: proposal.id,
  }));

  return {
    outcome: "proposed",
    proposalId: proposal.id,
    action: action.id,
    fingerprint,
  };
}

/** `YYYY-MM-DD` + n jours, sans dépendre d'un fuseau. */
function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
