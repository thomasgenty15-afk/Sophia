/**
 * FF-056 — LE TRAITEMENT DES TAPS DE LA DIVERGENCE.
 *
 * Un module à part plutôt qu'un bloc de plus dans `deterministic_buttons.ts`:
 * ce fichier-là est le ROUTEUR des taps (il en porte cinq familles), et le
 * patron est celui de `accident_tap.ts` — le routeur garde trois lignes (lire,
 * router, rendre) et la fiche vit ici.
 *
 * ── CE QUE CE CHEMIN FAIT ──────────────────────────────────────────────────
 * Il lit l'épisode VIVANT du porteur du JWT, il fait tourner le reducer PUR de
 * la skill (`reduceWeightDivergence`), il ÉCRIT l'avancement, il RELIT le
 * nombre de lignes revues, et il dit ce qu'il a relu. Aucun modèle n'est appelé
 * — c'est tout l'objet du lot.
 *
 * ── LES TROIS CICATRICES QUI GOUVERNENT CE FICHIER ─────────────────────────
 *
 *  1. L'ÉCRITURE PASSE PAR UN CLIENT `service_role` NOMMÉ. C'est la faute
 *     FF-056 elle-même (corrigée par `00e2cf6d`): l'avancement d'épisode
 *     s'écrivait avec le client porté par le JWT DE L'ÉLÈVE — rôle
 *     `authenticated`, qui n'a que `SELECT` sur cette table — donc chaque tour
 *     rendait `permission denied` et repartait de zéro. Le `as never` du site
 *     d'appel avait rendu la faute invisible au typecheck. Ici le paramètre est
 *     typé `SupabaseClient` et il vient de `chat-inbound-v1`, qui construit son
 *     `admin` avec `SUPABASE_SERVICE_ROLE_KEY`. AUCUN `as` sur ce client.
 *
 *  2. `.eq('user_id', …)` PARTOUT, ET L'ÉPISODE N'EST JAMAIS CHERCHÉ PAR SON
 *     IDENTIFIANT. Sous `service_role`, RLS ne protège rien: une charge forgée
 *     citant l'épisode d'un autre élève lirait sa ligne. On charge donc
 *     l'épisode vivant DU PORTEUR DU JWT (`loadLiveEpisode`, filtré sur
 *     `user_id`) et on EXIGE que la charge le désigne. Une charge qui désigne
 *     autre chose ne lit rien du tout: il n'existe ici aucun chemin où un
 *     identifiant entrant choisit la ligne. Cicatrice
 *     `rls-is-not-a-substitute-for-eq-user-id`, payée cette semaine par le plat
 *     d'un autre élève cité dans une réponse.
 *
 *  3. LA CHARGE EST VALIDÉE STRICTEMENT, ET LA FRAÎCHEUR AUSSI.
 *     `readDivergenceReply` refuse tout ce qui n'a pas exactement trois
 *     segments, un UUID et un jeton d'une liste fermée. Et un tap sur un
 *     épisode plus vieux que `WEIGHT_DIVERGENCE_OPEN_FOR_DAYS` est refusé ICI,
 *     sans attendre le balayage du soir: sinon « le surlendemain » et « trois
 *     semaines plus tard » produiraient le même comportement.
 *
 * ── CE QU'IL S'INTERDIT ────────────────────────────────────────────────────
 *   · aucun chiffre, aucune estimation d'énergie (R11) — les textes passent par
 *     `acceptDivergenceText`, armée, dans les deux langues;
 *   · aucune détection de mensonge, aucun « tu es sûr ? » (§3) — même ceinture;
 *   · aucune prescription d'exercice, aucune interprétation médicale — les
 *     textes sont des littéraux gelés, il n'y a rien à générer;
 *   · MUET SOUS `restriction_flag` (R8), évalué à CHAQUE tap et pas seulement à
 *     l'ouverture;
 *   · aucune remontée au foyer (R12) — le seul `user_id` que ce chemin
 *     connaisse est celui du porteur du JWT.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  buildDivergenceCauseStep,
  buildDivergenceWhereStep,
  categoryOfReply,
  divergenceActionProposal,
  type DivergenceLanguage,
  type DivergenceReply,
  renderDivergenceNoted,
  renderDivergenceStaleAck,
} from "../keel/weight_divergence_buttons.ts";
import {
  advanceEpisode,
  daysBetween,
  loadLiveEpisode,
  type WeightDivergenceEpisodeRow,
} from "../keel/weight_divergence_io.ts";
import {
  WEIGHT_DIVERGENCE_OBSERVATION_DAYS,
  WEIGHT_DIVERGENCE_OPEN_FOR_DAYS,
} from "../../sophia-brain/skills/weight_divergence/contract.ts";
import { reduceWeightDivergence } from "../../sophia-brain/skills/weight_divergence/reducer.ts";
import { weightDivergenceDeterministicMessage } from "../../sophia-brain/skills/weight_divergence/visible_agent.ts";
import {
  buildActionSpace,
  filterActionsByDoctrine,
  planFingerprint,
  type RecommendationActionId,
} from "../keel/daily_recommendation.ts";
import { insertProposal, loadRhythm } from "../keel/daily_recommendation_io.ts";
import { loadPublishedDoctrine } from "../keel/doctrine_loader.ts";
import { evaluateRestrictionForStudent } from "../keel/restriction_runtime.ts";
import { shiftDate } from "../keel/weight_divergence_io.ts";

export interface DivergenceTapResult {
  /** Le corps à envoyer. Jamais vide. */
  body: string;
  buttons: { payload: string; label: string }[];
  /** Le nom du traitement, pour `handled(...)`. */
  handledAs: string;
}

const STALE = (language: DivergenceLanguage): DivergenceTapResult => ({
  body: renderDivergenceStaleAck(language),
  buttons: [],
  handledAs: "keel_weight_divergence_stale",
});

/**
 * LE POINT D'ENTRÉE.
 *
 * Ne jette JAMAIS: la personne a tapé un bouton, et un 500 la laisserait sans
 * savoir si son geste a compté.
 *
 * @param admin REQUIS et `service_role`. Voir la cicatrice n°1 en tête.
 */
export async function handleWeightDivergenceTap(
  admin: SupabaseClient,
  args: {
    userId: string;
    reply: Exclude<DivergenceReply, { kind: "none" }>;
    language: DivergenceLanguage;
    /** La locale complète — les littéraux de la skill la relisent. */
    responseLocale: string;
    /** Le jour LOCAL de la personne au moment du tap. REQUIS. */
    localDate: string;
  },
): Promise<DivergenceTapResult> {
  const { reply, language } = args;

  // ── ① L'ÉPISODE VIVANT DU PORTEUR DU JWT, ET RIEN D'AUTRE ───────────────
  let episode: WeightDivergenceEpisodeRow | null = null;
  try {
    episode = await loadLiveEpisode(admin, args.userId);
  } catch (error) {
    // On distingue « erreur » de « vide »: une lecture ratée n'est pas un
    // épisode absent. Les deux se taisent, mais seule la première est bruyante.
    console.error(JSON.stringify({
      tag: "keel.weight_divergence.tap_episode_unreadable",
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return STALE(language);
  }
  if (!episode) return STALE(language);

  // ── ② LA CHARGE DOIT DÉSIGNER CET ÉPISODE-LÀ ────────────────────────────
  // Un autre élève, un épisode clos, un épisode d'un autre jour: LA MÊME
  // réponse. Distinguer les trois serait un oracle d'énumération.
  if (episode.id.toLowerCase() !== reply.episodeId) {
    console.warn(JSON.stringify({
      tag: "keel.weight_divergence.tap_foreign_episode",
      user_id: args.userId,
    }));
    return STALE(language);
  }

  // ── ③ LA FRAÎCHEUR, ICI ET PAS SEULEMENT AU BALAYAGE DU SOIR ────────────
  // `expireLapsedEpisodes` ne tourne qu'entre 19 h et 20 h locales. Sans ce
  // test, un tap sur une vieille bulle remontée dans l'historique ferait
  // avancer un épisode que le produit considère mort.
  let age: number;
  try {
    age = daysBetween(episode.opened_local_date, args.localDate);
  } catch {
    return STALE(language);
  }
  if (age < 0 || age > WEIGHT_DIVERGENCE_OPEN_FOR_DAYS) {
    console.info(JSON.stringify({
      tag: "keel.weight_divergence.tap_expired",
      user_id: args.userId,
      episode_id: episode.id,
      age_days: age,
    }));
    await closeEpisode(admin, {
      userId: args.userId,
      episode,
      state: "expired",
      category: episode.category,
      turnCount: episode.turn_count,
    });
    return STALE(language);
  }

  // ── ④ LE PLANCHER TCA, À CHAQUE TOUR (R8) ───────────────────────────────
  // Le moteur du soir l'évalue à l'ouverture; la fiche exige « à chaque tour du
  // flow ». Ce chemin est un tour. Une lecture qui ÉCHOUE remonte comme un
  // plancher armé: un plancher qu'on n'a pas pu lire n'est pas un plancher
  // baissé — c'est déjà l'arbitrage de `weight_divergence_engine.ts`.
  let restrictionFlagged = true;
  try {
    const restriction = await evaluateRestrictionForStudent(admin, {
      userId: args.userId,
      asOfLocalDate: args.localDate,
    });
    restrictionFlagged = restriction.restriction_flag === true;
  } catch (error) {
    console.error(JSON.stringify({
      tag: "keel.weight_divergence.tap_restriction_unreadable",
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
  if (restrictionFlagged) {
    // LA TRAPPE. Le flow disparaît: l'épisode meurt, rien de durable n'est
    // écrit, et la phrase ne parle NI de poids NI de nourriture.
    //
    // ⚠️ ON NE REND PAS LA MAIN AU DISPATCHER, contrairement au chemin texte.
    // Ce tour est un TAP: le laisser descendre enverrait une charge de bouton
    // au modèle comme si c'était une phrase. On clôt donc proprement, en une
    // ligne, et le prochain message de la personne retrouvera le plancher par
    // le chemin normal — qui est le sien.
    console.warn(JSON.stringify({
      tag: "keel.weight_divergence.tap_restriction_floor",
      user_id: args.userId,
      episode_id: episode.id,
    }));
    await closeEpisode(admin, {
      userId: args.userId,
      episode,
      state: "expired",
      category: episode.category,
      turnCount: episode.turn_count + 1,
    });
    return {
      body: weightDivergenceDeterministicMessage(
        "close_out",
        args.responseLocale,
        null,
      ),
      buttons: [],
      handledAs: "keel_weight_divergence_restriction_floor",
    };
  }

  // ── ⑤ LE DÉPLIAGE — IL N'ÉCRIT RIEN ─────────────────────────────────────
  // Le geste ne dit rien encore: il demande à voir. Écrire une catégorie ici
  // serait une réponse que personne n'a donnée. Même arbitrage que le
  // `Pas tout` de FF-058.
  if (reply.kind === "step") {
    const step = reply.branch === "where"
      ? buildDivergenceWhereStep({
        episodeId: episode.id,
        language,
        restrictionFlag: false,
      })
      : buildDivergenceCauseStep({
        episodeId: episode.id,
        language,
        restrictionFlag: false,
      });
    if (!step || !step.body) return STALE(language);
    return {
      body: step.body,
      buttons: step.buttons.map((b) => ({ payload: b.id, label: b.title })),
      handledAs: `keel_weight_divergence_step_${reply.branch}`,
    };
  }

  // ── ⑥ LE REDUCER PUR DE LA SKILL — RÉUTILISÉ, JAMAIS RÉÉCRIT ────────────
  // C'est lui qui sait quelle catégorie ferme quel état et quelle tâche
  // visible. Deux tables de branchement (une pour le texte, une pour le tap)
  // divergeraient au premier ajout, et la divergence se paierait sur la
  // branche qu'on ne teste pas.
  const category = categoryOfReply(reply);
  const namedSlot = reply.kind === "spot" ? reply.slot : "unspecified";

  const space = await actionSpace(admin, args.userId, episode);
  const reduction = reduceWeightDivergence({
    previousState: {
      episode_id: episode.id,
      turn_count: episode.turn_count,
      last_category: episode.category ?? undefined,
      reformulated: episode.category === "other",
    },
    category,
    namedSlot,
    // ⚠️ LES MOTS DE LA PERSONNE SONT VIDES, ET C'EST EXACT. Elle n'a pas
    // écrit: elle a tapé. Y mettre le libellé du bouton ferait entrer NOTRE
    // phrase dans un champ qui dit « ce qu'elle a dit ».
    userMessage: "",
    restrictionFlagged: false,
    // La bande de crise ne se calcule pas sur un tap (aucun tour de modèle):
    // le côté SÛR est passé EXPLICITEMENT plutôt qu'omis — un paramètre de
    // garde optionnel est une garde désarmée, et celui-ci est requis.
    crisis: false,
    availableActionIds: space.actionIds,
    planChanged: space.planChanged,
  });

  if (reduction.kind === "hand_over") {
    // Inatteignable: les deux trappes sont passées `false` ci-dessus, et le
    // plancher a déjà été traité. On le traite quand même — une branche
    // « impossible » sans code est une branche qui rend `undefined` le jour où
    // elle devient possible.
    await closeEpisode(admin, {
      userId: args.userId,
      episode,
      state: "expired",
      category: episode.category,
      turnCount: episode.turn_count + 1,
    });
    return STALE(language);
  }

  // ── ⑦ LA PROPOSITION DURABLE — LE SEUL CHEMIN VERS `acted` ──────────────
  if (reduction.proposedActionId) {
    const proposal = await openDurableProposal(admin, {
      userId: args.userId,
      actionId: reduction.proposedActionId as RecommendationActionId,
      localDate: args.localDate,
      fingerprint: space.fingerprint,
      language,
    });
    if (proposal) {
      // `in_flow`: la proposition est ouverte, l'épisode ne se clôt qu'au tap
      // de FF-028 (`closeDivergenceEpisodeAfterRecommendation`). Le poser à
      // `acted` maintenant ferait de la classification l'effet — « le tap est
      // l'effet, jamais la classification » (§4).
      const written = await writeAdvance(admin, {
        userId: args.userId,
        episode,
        state: "in_flow",
        category,
        turnCount: episode.turn_count + 1,
      });
      if (!written) return STALE(language);
      console.info(JSON.stringify({
        tag: "keel.weight_divergence.tap",
        user_id: args.userId,
        episode_id: episode.id,
        category,
        named_slot: namedSlot,
        classification_source: "button",
        proposed_action: reduction.proposedActionId,
        episode_state: "in_flow",
      }));
      return {
        body: proposal.body,
        buttons: proposal.buttons,
        handledAs: "keel_weight_divergence_action_proposed",
      };
    }
    // La proposition n'a pas pu s'ouvrir (FF-028 a déjà proposé aujourd'hui,
    // la doctrine du coach l'interdit, l'écriture n'a pas été relue). On DIT
    // qu'on a noté et on ne propose rien — jamais une proposition dont le
    // « Oui » ne désignerait aucune ligne.
    return await closeWithNoted(admin, {
      userId: args.userId,
      episode,
      category,
      language,
      handledAs: "keel_weight_divergence_named_spot_no_proposal",
    });
  }

  // ── ⑧ LES FINS ──────────────────────────────────────────────────────────
  const episodeState = reduction.episodeState ?? "expired";
  const opensWindow = reduction.opensObservationWindow;
  const written = await writeAdvance(admin, {
    userId: args.userId,
    episode,
    state: episodeState,
    category,
    turnCount: episode.turn_count + 1,
    observationOpenedOn: opensWindow ? args.localDate : null,
    observationEndsOn: opensWindow
      ? shiftDate(args.localDate, WEIGHT_DIVERGENCE_OBSERVATION_DAYS)
      : null,
  });
  // ON NE DIT JAMAIS « C'EST NOTÉ » SUR UNE ÉCRITURE QU'ON N'A PAS FAITE.
  if (!written) return STALE(language);

  console.info(JSON.stringify({
    tag: "keel.weight_divergence.tap",
    user_id: args.userId,
    episode_id: episode.id,
    category,
    named_slot: namedSlot,
    classification_source: "button",
    visible_task: reduction.visibleTask.kind,
    episode_state: episodeState,
    opens_observation_window: opensWindow,
  }));

  return {
    body: weightDivergenceDeterministicMessage(
      reduction.visibleTask.kind,
      args.responseLocale,
      null,
    ),
    buttons: [],
    handledAs: `keel_weight_divergence_${category}`,
  };
}

// ---------------------------------------------------------------------------
// L'ESPACE D'ACTION ET L'EMPREINTE — la même définition que le soir
// ---------------------------------------------------------------------------

/**
 * FAIL-CLOSED SUR L'ACTION, comme la lane de conversation.
 *
 * Une lecture ratée rend l'espace VIDE et le plan « changé »: le flow dit alors
 * qu'il a noté et ne propose rien. L'inverse proposerait une modification
 * durable sur un plan qu'on n'a pas pu lire.
 *
 * ⚠️ LA DOCTRINE FILTRE, ET LA LANE DE CONVERSATION NE LE FAISAIT PAS.
 * `run.ts:6879` appelle `buildActionSpace(rhythm.effective)` tout court: un
 * coach qui prescrit le jeûne du matin voyait donc son élève recevoir une
 * proposition de petit-déjeuner par ce flow-ci, alors que FF-028 la lui refuse
 * par la porte du soir (`filterActionsByDoctrine`, R5). Consigné au rapport.
 */
async function actionSpace(
  db: SupabaseClient,
  userId: string,
  episode: WeightDivergenceEpisodeRow,
): Promise<{
  actionIds: string[];
  planChanged: boolean;
  fingerprint: string;
}> {
  try {
    const rhythm = await loadRhythm(db, userId);
    const loaded = await loadPublishedDoctrine(db, userId);
    if (loaded.reason === "load_failed") {
      // On ne peut pas savoir si la méthode du coach interdit l'action. On ne
      // devine pas, et surtout on ne propose pas.
      return { actionIds: [], planChanged: true, fingerprint: "" };
    }
    const fingerprint = planFingerprint({
      rhythm: rhythm.effective,
      doctrineVersion: loaded.doctrine?.version ?? null,
    });
    const kept = filterActionsByDoctrine(
      buildActionSpace(rhythm.effective),
      loaded.doctrine ?? null,
    ).kept;
    return {
      actionIds: kept.map((a) => a.id),
      planChanged: fingerprint !== episode.plan_fingerprint,
      fingerprint,
    };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.weight_divergence.tap_action_space_unreadable",
      user_id: userId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return { actionIds: [], planChanged: true, fingerprint: "" };
  }
}

/**
 * OUVRIR LA LIGNE FF-028, PUIS SEULEMENT LA DIRE.
 *
 * L'ordre est le contrat: la ligne existe avant que le message ne parte, parce
 * que c'est elle qui porte l'identifiant que les boutons transportent. Une
 * proposition livrée sans ligne serait une proposition dont le « Oui » ne
 * désigne rien.
 *
 * ⚠️ CE CHEMIN NE CONSOMME PAS LE BUDGET T4, et c'est vérifié: la réponse à un
 * geste que la personne vient de faire n'est pas une DEMANDE du produit. Le
 * précédent exact est `shiftProposalAfterShoppingLater` (FF-057), et la place
 * du jour a déjà été payée par la question d'ouverture de l'épisode.
 */
async function openDurableProposal(
  db: SupabaseClient,
  args: {
    userId: string;
    actionId: RecommendationActionId;
    localDate: string;
    fingerprint: string;
    language: DivergenceLanguage;
  },
): Promise<{ body: string; buttons: { payload: string; label: string }[] } | null> {
  if (!args.fingerprint) return null;
  try {
    // Le texte est écrit AVANT l'insertion parce que c'est lui qu'on stocke:
    // `proposed_text` doit être ce que la personne a réellement lu.
    const draft = divergenceActionProposal({
      actionId: args.actionId,
      // Identifiant provisoire, remplacé juste après: `divergenceActionProposal`
      // exige un UUID pour construire ses charges, et on ne connaît celui de la
      // ligne qu'après l'insertion. Seul le CORPS est réutilisé d'ici.
      proposalId: "00000000-0000-0000-0000-000000000000",
      language: args.language,
    });
    if (!draft) return null;

    const inserted = await insertProposal(db, {
      userId: args.userId,
      localDate: args.localDate,
      actionId: args.actionId,
      planFingerprint: args.fingerprint,
      proposedText: draft.body,
    });
    if (inserted.outcome !== "inserted") {
      // `already_today`: FF-028 (ou un tap précédent) a déjà pris la place du
      // jour. L'unicité `(user_id, local_date)` est l'ARBITRE — on ne force
      // pas, et on ne propose pas deux changements de rythme le même jour.
      console.info(JSON.stringify({
        tag: "keel.weight_divergence.proposal_not_opened",
        user_id: args.userId,
        outcome: inserted.outcome,
      }));
      return null;
    }
    const final = divergenceActionProposal({
      actionId: args.actionId,
      proposalId: inserted.row.id,
      language: args.language,
    });
    if (!final) return null;
    console.info(JSON.stringify({
      tag: "keel.weight_divergence.proposal_opened",
      user_id: args.userId,
      proposal_id: inserted.row.id,
      action: args.actionId,
    }));
    return {
      body: final.body,
      buttons: final.buttons.map((b) => ({ payload: b.id, label: b.title })),
    };
  } catch (error) {
    console.error(JSON.stringify({
      tag: "keel.weight_divergence.proposal_failed",
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}

// ---------------------------------------------------------------------------
// LES ÉCRITURES — toutes relues, toutes filtrées sur `user_id`
// ---------------------------------------------------------------------------

async function writeAdvance(
  db: SupabaseClient,
  args: {
    userId: string;
    episode: WeightDivergenceEpisodeRow;
    state: "in_flow" | "acted" | "nothing_to_change" | "declined" | "expired";
    category: string | null;
    turnCount: number;
    observationOpenedOn?: string | null;
    observationEndsOn?: string | null;
  },
): Promise<boolean> {
  try {
    const written = await advanceEpisode(db, {
      id: args.episode.id,
      userId: args.userId,
      state: args.state,
      category: args.category,
      turnCount: args.turnCount,
      observationOpenedOn: args.observationOpenedOn,
      observationEndsOn: args.observationEndsOn,
    });
    if (written.updated === 0) {
      // 204 sans erreur. L'épisode qu'on croit clos resterait vivant et
      // bloquerait tous les suivants par l'index unique, en silence.
      console.error(JSON.stringify({
        tag: "keel.weight_divergence.tap_advance_matched_no_row",
        user_id: args.userId,
        episode_id: args.episode.id,
      }));
      return false;
    }
    return true;
  } catch (error) {
    console.error(JSON.stringify({
      tag: "keel.weight_divergence.tap_advance_failed",
      user_id: args.userId,
      episode_id: args.episode.id,
      error: error instanceof Error ? error.message : String(error),
    }));
    return false;
  }
}

async function closeEpisode(
  db: SupabaseClient,
  args: {
    userId: string;
    episode: WeightDivergenceEpisodeRow;
    state: "expired";
    category: string | null;
    turnCount: number;
  },
): Promise<void> {
  await writeAdvance(db, { ...args });
}

async function closeWithNoted(
  db: SupabaseClient,
  args: {
    userId: string;
    episode: WeightDivergenceEpisodeRow;
    category: string;
    language: DivergenceLanguage;
    handledAs: string;
  },
): Promise<DivergenceTapResult> {
  const written = await writeAdvance(db, {
    userId: args.userId,
    episode: args.episode,
    state: "nothing_to_change",
    category: args.category,
    turnCount: args.episode.turn_count + 1,
  });
  if (!written) return STALE(args.language);
  return {
    body: renderDivergenceNoted(args.language),
    buttons: [],
    handledAs: args.handledAs,
  };
}

/**
 * LE TAP FF-028 CLÔT L'ÉPISODE DE DIVERGENCE QUI L'A OUVERT.
 *
 * ── POURQUOI ÇA VIT ICI ET PAS DANS `handleRecommendationTap` ─────────────
 * Le chemin FF-028 n'a aucune raison de connaître FF-056. Il appelle cette
 * fonction et n'en lit rien: elle NE JETTE JAMAIS, elle n'écrit que sur un
 * épisode `in_flow` de catégorie `named_spot`, et son échec dégrade sans
 * casser — l'épisode expire alors tout seul à J+2, exactement comme si
 * personne n'avait répondu.
 *
 * ⚠️ SANS ELLE, `acted` SERAIT INATTEIGNABLE. §10 mesure « la part des
 * épisodes finissant en action durable »; un état qu'aucun chemin n'écrit rend
 * cette mesure fausse pour toujours, et la fausseté est du côté qui rassure.
 */
export async function closeDivergenceEpisodeAfterRecommendation(
  db: SupabaseClient,
  args: { userId: string; applied: boolean },
): Promise<void> {
  try {
    const episode = await loadLiveEpisode(db, args.userId);
    if (!episode) return;
    if (episode.state !== "in_flow") return;
    if (episode.category !== "named_spot") return;
    const state = args.applied ? "acted" : "nothing_to_change";
    const written = await advanceEpisode(db, {
      id: episode.id,
      userId: args.userId,
      state,
      category: episode.category,
      turnCount: episode.turn_count + 1,
    });
    console.info(JSON.stringify({
      tag: "keel.weight_divergence.closed_by_recommendation",
      user_id: args.userId,
      episode_id: episode.id,
      state,
      updated: written.updated,
    }));
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.weight_divergence.close_by_recommendation_failed",
      user_id: args.userId,
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}
