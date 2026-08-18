/**
 * LES RÉPONSES DÉTERMINISTES — traitées avant que le moindre LLM ne soit appelé.
 *
 * ── LA RÈGLE, ET ELLE N'A PAS CHANGÉ DE CANAL ────────────────────────────────
 * Un `button_payload` est une valeur que NOUS avons émise, qui n'a qu'un sens
 * possible, et qui revient telle quelle. La faire descendre jusqu'au dispatcher
 * revient à payer un appel LLM pour interpréter une chaîne exacte — et à
 * accepter qu'il se trompe sur elle. C'était déjà le raisonnement du bloc
 * « PIVOT N2 — LE TAP DU SOIR » dans `whatsapp-webhook` ; il survit intact,
 * seul le nom du champ change (`interactive_id` → `button_payload`).
 *
 * ── CE QUI N'EST PAS ICI, ET POURQUOI ────────────────────────────────────────
 * Le TEXTE libre n'entre jamais ici. `readPulseReply` ne lit que l'identifiant
 * de bouton : un « moyen » tapé à la main dans une conversation en cours n'est
 * pas une réponse au tap, et le dispatcher le traite mieux que nous. La règle
 * est reprise mot pour mot du webhook, parce qu'elle a été payée une fois.
 *
 * ── LE FORMULAIRE HEBDO ──────────────────────────────────────────────────────
 * Un `form_response` est un objet de formulaire, pas une phrase. Le laisser
 * descendre ferait analyser du JSON comme un message d'élève. Et l'attribution
 * ne vient PAS du jeton : le jeton dit la SEMAINE, l'élève est le porteur du
 * JWT. Un jeton qui ferait l'aller-retour avec un identifiant dedans serait un
 * identifiant modifiable désignant la ligne à écrire.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  PULSE_BUTTON_PREFIX,
  readPulseReply,
  renderPulseAck,
  renderPulseAxisQuestion,
} from "../keel/daily_pulse.ts";
import { writePulseAxis, writePulseLevel } from "../keel/daily_pulse_io.ts";
import {
  recommendationAck,
  recommendationAction,
  RECOMMENDATION_APPLY_FAILED_ACK,
  RECOMMENDATION_BUTTON_PREFIX,
  RECOMMENDATION_STALE_ACK,
  RECOMMENDATION_UNKNOWN_ACK,
  readRecommendationReply,
} from "../keel/daily_recommendation.ts";
import {
  applyRecommendation,
  claimResponse,
  currentFingerprint,
  expireProposal,
  markApplied,
  releaseClaim,
} from "../keel/daily_recommendation_io.ts";
import {
  readStripReply,
  renderStripAck,
  STRIP_BUTTON_PREFIX,
  renderStripDishStep,
  type StripLanguage,
  type StripReply,
} from "../keel/evening_strip.ts";
import {
  ACCIDENT_BUTTON_PREFIX,
  readAccidentReply,
} from "../keel/accident.ts";
import {
  accidentFormAfterUntick,
  handleAccidentTap,
  shiftProposalAfterShoppingLater,
} from "./accident_tap.ts";
import {
  DIVERGENCE_BUTTON_PREFIX,
  readDivergenceReply,
} from "../keel/weight_divergence_buttons.ts";
import {
  closeDivergenceEpisodeAfterRecommendation,
  handleWeightDivergenceTap,
} from "./weight_divergence_tap.ts";
import {
  applyStripTicks,
  loadStripDishes,
  writeGroceryWaveState,
} from "../keel/evening_strip_io.ts";
import { MEAL_UNTICK_REASON } from "../keel/meal_tick.ts";
import { loadPublishedDoctrine } from "../keel/doctrine_loader.ts";
import { isFrenchLocale } from "../keel/locale.ts";
import { localDateFor } from "../keel/reengagement_io.ts";
import {
  parseMeasuresToken,
  parseWeeklyFlowToken,
  renderWeeklyFlowAck,
} from "../keel/weekly_flow.ts";
import { writeWeeklyFlowReply } from "../keel/weekly_flow_io.ts";
import {
  composeWeekReviewBody,
  readWeekReview,
} from "../keel/week_review_io.ts";
import { resolveArtifactLocale } from "../keel/locale.ts";
import { deliverChatMessage } from "./delivery.ts";
import { handled, type InboundStepOutcome, PASS } from "./inbound_pipeline.ts";
import type { InboundMessage } from "./inbound_message.ts";

/**
 * LES CINQ VOCABULAIRES DÉTERMINISTES, en un seul endroit.
 *
 * Ils sont DISJOINTS et chaque lecteur rend « rien » sur ce qui ne le concerne
 * pas — c'est ce qui rend l'ordre de lecture ci-dessous sans conséquence. Cette
 * liste sert à autre chose: reconnaître qu'une charge VOULAIT être un tap, même
 * quand aucun lecteur n'a su la lire. Voir la garde en fin de fonction.
 *
 * Une famille ajoutée sans être listée ici retombe au dispatcher sur charge
 * cassée — c'est-à-dire qu'elle redevient interprétable par un modèle.
 */
export const DETERMINISTIC_BUTTON_PREFIXES: readonly string[] = Object.freeze([
  RECOMMENDATION_BUTTON_PREFIX,
  STRIP_BUTTON_PREFIX,
  ACCIDENT_BUTTON_PREFIX,
  DIVERGENCE_BUTTON_PREFIX,
  PULSE_BUTTON_PREFIX,
]);

async function timezoneFor(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("timezone")
    .eq("id", userId)
    .maybeSingle();
  return String((data as { timezone?: string | null } | null)?.timezone ?? "")
    .trim() || null;
}

/**
 * Le prénom et la locale, pour le bilan. Ne jette jamais.
 *
 * Un prénom absent n'est PAS remplacé par un placeholder: le prompt du bilan
 * dit explicitement « tu ne connais pas son prénom, n'en invente pas ». Une
 * chaîne vide est donc une information, pas un trou à combler.
 */
async function studentVoiceContext(
  admin: SupabaseClient,
  userId: string,
): Promise<{ firstName: string; contentLocale: string }> {
  try {
    const { data } = await admin
      .from("profiles")
      .select("full_name, locale")
      .eq("id", userId)
      .maybeSingle();
    const row = (data ?? null) as Record<string, unknown> | null;
    return {
      firstName: String(row?.full_name ?? "").trim().split(/\s+/)[0] ?? "",
      contentLocale: resolveArtifactLocale({
        studentProfile: String(row?.locale ?? "").trim() || null,
        tenantDefault: null,
      }),
    };
  } catch (error) {
    console.warn("[keel/week_review] voice context unreadable", error);
    return { firstName: "", contentLocale: resolveArtifactLocale({
      studentProfile: null,
      tenantDefault: null,
    }) };
  }
}

/**
 * L'accusé d'une réponse déterministe est une RÉPONSE, pas une notification :
 * `isReply: true`. Sans ça, un élève qui tape trois boutons dans la même
 * journée verrait ses accusés mangés par le plafond quotidien — c'est-à-dire
 * qu'il taperait dans le vide.
 */
async function ack(
  admin: SupabaseClient,
  args: {
    userId: string;
    requestId: string;
    body: string;
    buttons?: { payload: string; label: string }[];
    purpose: string;
  },
): Promise<void> {
  await deliverChatMessage(admin, {
    userId: args.userId,
    content: args.body,
    isReply: true,
    purpose: args.purpose,
    buttons: args.buttons ?? [],
    requestId: args.requestId,
  });
}

/**
 * LA CARTE DES MESURES DE `/app/plan` — poids et tour de taille, hors dimanche.
 *
 * ── POURQUOI L'ACCUSÉ NE RENVOIE PAS LE CHIFFRE ───────────────────────────
 * « Noté: 78,4 kg » semble serviable et ne l'est pas. Cet écran est le même
 * que celui qui se RETIRE quand la garde restrictive est armée, et un produit
 * qui refuse de montrer un poids à un élève à risque ne doit pas le lui
 * renvoyer par la bulle d'à côté. On accuse le geste, pas la valeur.
 *
 * ── LA SEMAINE VIENT DU JETON, PAS DE L'HORLOGE SERVEUR ───────────────────
 * L'élève est dans son fuseau; le serveur est en UTC. Un lundi 00h30 à Paris
 * est encore dimanche pour le serveur, et la mesure atterrirait sur la semaine
 * précédente — donc sur la ligne que le point du dimanche vient de remplir.
 */
async function writeMeasures(
  admin: SupabaseClient,
  args: { message: InboundMessage; requestId: string; week: string },
): Promise<InboundStepOutcome> {
  const { message } = args;
  try {
    const written = await writeWeeklyFlowReply(admin, {
      userId: message.user_id,
      weekStart: args.week,
      responseJson: message.form_response,
      origin: "measures_card",
      // FF-031 — l'instant du geste. La date LOCALE de la mesure en dérive
      // (`resolveMeasureLocalDate`), et le jeton ne porte que la semaine.
      now: new Date(),
    });
    // Rien de lisible dans ce que l'élève a envoyé: on le DIT, au lieu
    // d'accuser réception d'une écriture qui n'a rien écrit.
    const nothing = written.reply.weightKg === null && written.reply.waistCm === null;
    await ack(admin, {
      userId: message.user_id,
      requestId: args.requestId,
      purpose: "keel_measures_ack",
      body: nothing
        ? "I couldn't read a measurement in that — nothing was saved."
        : "Got it, noted.",
    });
  } catch (error) {
    const err = error as { message?: string; code?: string; details?: string };
    console.error(JSON.stringify({
      tag: "keel.measures.write_failed",
      user_id: message.user_id,
      week: args.week,
      error: error instanceof Error
        ? error.message
        : [err?.code, err?.message, err?.details].filter(Boolean).join(" — ") ||
          String(error),
    }));
    await ack(admin, {
      userId: message.user_id,
      requestId: args.requestId,
      purpose: "keel_measures_ack",
      body: "Something went wrong on my side and I couldn't save that. Sorry — could you try again?",
    });
  }
  return handled("keel_measures");
}

/**
 * Le corps de la réponse au formulaire hebdomadaire.
 *
 * ── POURQUOI CE N'EST PAS UNE QUESTION ARMÉE ────────────────────────────────
 * `armed_question.ts` sert à interpréter une réponse libre CONTRE une question à
 * boutons. Ici la question est ouverte — « qu'est-ce qui a rendu ça difficile
 * cette semaine ? » — et n'a aucun bouton: la contraindre à trois réponses
 * fabriquerait la raison au lieu de l'entendre, et c'est précisément la raison
 * qu'on veut voir arriver dans la mémoire.
 *
 * La continuité est donc portée par le CONTEXTE, pas par une machine à états: le
 * bloc du bilan vit dans chaque tour de la semaine suivante
 * (`loadKeelTurnContext`), il porte la question posée et le « pourquoi » du
 * coach sur la ligne concernée. Un état de flow en plus serait un piège à
 * fermer — et ce dépôt en a déjà payé un (`safety-crisis-flow-no-exit-on-denial`).
 *
 * NE JETTE JAMAIS: tout échec rend l'accusé plat. L'élève a rempli le
 * formulaire, la mesure est déjà écrite, et un 500 ici lui ferait croire que
 * ses deux minutes sont perdues.
 */
async function weeklyReplyBody(
  admin: SupabaseClient,
  args: { userId: string; week: string; requestId: string; flatAck: string },
): Promise<string> {
  try {
    const stored = await readWeekReview(admin, {
      userId: args.userId,
      weekStart: args.week,
    });
    if (!stored) return args.flatAck;

    const voice = await studentVoiceContext(admin, args.userId);
    const composed = await composeWeekReviewBody(admin, {
      userId: args.userId,
      firstName: voice.firstName,
      reading: stored.reading,
      contentLocale: voice.contentLocale,
      requestId: args.requestId,
    });
    // Le motif du repli est JOURNALISÉ, jamais avalé: sans lui, « le composeur
    // ne sert jamais » et « le composeur marche » produisent le même message.
    console.info(JSON.stringify({
      tag: "keel.week_review.replied",
      user_id: args.userId,
      week: args.week,
      branch: stored.reading.branch,
      asked: stored.reading.question?.group ?? null,
      body_source: composed.source,
      fallback_reason: composed.reason || null,
    }));
    return composed.body;
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.week_review.reply_failed",
      user_id: args.userId,
      week: args.week,
      error: error instanceof Error ? error.message : String(error),
    }));
    return args.flatAck;
  }
}

/**
 * FF-028 — LE « OUI » ET LE « NON », ET LA VÉRITÉ D'EXÉCUTION ENTRE LES DEUX.
 *
 * ── L'ORDRE EST LA GARANTIE, ET IL N'EST PAS NÉGOCIABLE ────────────────────
 *   1. recalculer l'empreinte ACTUELLE (rythme + version de doctrine);
 *   2. RÉCLAMER la proposition — transition atomique `proposed → accepted`,
 *      conditionnée à l'empreinte ET à l'élève. Le second tap reçoit zéro
 *      ligne, donc n'applique rien;
 *   3. ÉCRIRE la directive, puis la RELIRE depuis la base;
 *   4. ACCUSER — et seulement là.
 *
 * ⚠️ POURQUOI L'ACCUSÉ EST ICI ET PAS DANS LA LANE DE RÉPONSE. T-1 (FF-008) l'a
 * mesuré: la lane de réponse ne sait ni ce que le déterministe a écrit ni ce
 * qu'il a refusé, et elle produit des accusés fantômes. Ce chemin ne descend
 * donc jamais au dispatcher: il écrit, relit, et pose LUI-MÊME la phrase qui
 * correspond au fait relu. Il n'existe ici aucun chemin qui dise « c'est fait »
 * sans avoir relu la ligne — c'est l'angle adversarial que la fiche nomme en
 * propre.
 *
 * ── CE QU'IL NE FAIT PAS ───────────────────────────────────────────────────
 * Il ne touche pas au plan de la semaine EN COURS. V1 écrit une directive
 * durable que la PROCHAINE composition consomme (§3, V2/V3 hors périmètre): la
 * cascade plan-courses-cuissons en milieu de semaine est l'endroit exact où
 * l'état devient incohérent sans erreur visible.
 */
async function handleRecommendationTap(
  admin: SupabaseClient,
  args: {
    message: InboundMessage;
    requestId: string;
    reply: { kind: "accept" | "decline"; proposalId: string };
  },
): Promise<InboundStepOutcome> {
  const { message, reply } = args;
  const say = (body: string) =>
    ack(admin, {
      userId: message.user_id,
      requestId: args.requestId,
      purpose: "keel_daily_recommendation_ack",
      body,
    });

  // ⚠️ LA LANGUE DE L'ÉLÈVE, ET ELLE MANQUAIT ICI.
  //
  // Mesuré en run réel le 2026-08-12 (`ff056-t6-run3`): une élève `fr-FR` a nommé
  // son créneau en français, lu une proposition en français, tapé « Oui, on
  // l'ajoute » — et reçu « Done — breakfast is part of your rhythm now ». Ce
  // handler avait `isFrenchLocale` importé et s'en servait déjà deux fonctions
  // plus bas; il ne s'en servait pas ICI.
  //
  // `studentVoiceContext` ne jette jamais et retombe sur le défaut de
  // `resolveArtifactLocale` si `profiles` est illisible: sur panne de lecture on
  // servira donc la langue par défaut, pas une erreur. C'est le bon arbitrage
  // pour un accusé — mais c'est un repli, pas une garantie.
  const voice = await studentVoiceContext(admin, message.user_id);
  const ackLanguage: "fr" | "en" = isFrenchLocale(voice.contentLocale)
    ? "fr"
    : "en";

  try {
    // La version de doctrine entre dans l'empreinte: un coach qui republie sa
    // méthode entre la proposition et le tap a pu, entre-temps, interdire
    // exactement ce qu'on proposait. La relire ici plutôt que de la supposer
    // est ce qui rend R5 vraie AU MOMENT DE L'APPLICATION, et pas seulement au
    // moment de la proposition.
    const loaded = await loadPublishedDoctrine(admin, message.user_id);
    if (loaded.reason === "load_failed") {
      // On ne peut pas savoir si l'empreinte tient. On ne devine pas, et
      // surtout on n'applique pas: le fail-closed est du côté du silence.
      console.warn(JSON.stringify({
        tag: "keel.daily_recommendation.doctrine_unreadable_on_tap",
        user_id: message.user_id,
        proposal_id: reply.proposalId,
      }));
      await say(RECOMMENDATION_APPLY_FAILED_ACK);
      return handled("keel_daily_recommendation_doctrine_unreadable");
    }

    const { fingerprint } = await currentFingerprint(admin, {
      userId: message.user_id,
      doctrineVersion: loaded.doctrine?.version ?? null,
    });

    const claim = await claimResponse(admin, {
      id: reply.proposalId,
      userId: message.user_id,
      kind: reply.kind,
      currentFingerprint: fingerprint,
    });

    if (claim.outcome === "unknown") {
      // Ligne absente, ou payload qui désigne la proposition d'un autre élève.
      // La phrase ne distingue pas les deux — un accusé qui le ferait serait un
      // oracle d'énumération sur des identifiants d'autrui.
      console.warn(JSON.stringify({
        tag: "keel.daily_recommendation.unknown_proposal",
        user_id: message.user_id,
        proposal_id: reply.proposalId,
      }));
      await say(RECOMMENDATION_UNKNOWN_ACK);
      return handled("keel_daily_recommendation_unknown");
    }

    if (claim.outcome === "stale") {
      // §7 — « l'action ne s'applique pas ; la personne en est informée d'une
      // phrase ». La proposition est fermée pour de bon: la laisser ouverte
      // ferait retenter la même action sur le même état périmé.
      await expireProposal(admin, {
        id: claim.row.id,
        reason: "plan_changed",
      });
      console.info(JSON.stringify({
        tag: "keel.daily_recommendation.stale",
        user_id: message.user_id,
        proposal_id: claim.row.id,
        proposed_fingerprint: claim.row.planFingerprint,
        current_fingerprint: fingerprint,
      }));
      await say(RECOMMENDATION_STALE_ACK);
      return handled("keel_daily_recommendation_stale");
    }

    if (claim.outcome === "already") {
      // DOUBLE TAP, ou tap sur une vieille bulle remontée dans l'historique.
      // Aucune seconde écriture. La phrase dit l'état RÉEL de la ligne, pas
      // celui du bouton qui vient d'être touché: quelqu'un qui a dit non hier
      // puis retape « Oui » aujourd'hui doit lire que rien n'a bougé.
      const row = claim.row;
      const action = recommendationAction(row.actionId);
      if (row.state === "accepted") {
        await say(
          row.appliedAt
            ? recommendationAck(action, ackLanguage, "applied")
            : RECOMMENDATION_APPLY_FAILED_ACK,
        );
      } else if (row.state === "declined") {
        await say(recommendationAck(action, ackLanguage, "declined"));
      } else {
        await say(RECOMMENDATION_UNKNOWN_ACK);
      }
      return handled("keel_daily_recommendation_replay");
    }

    const row = claim.row;
    const action = recommendationAction(row.actionId);

    if (reply.kind === "decline") {
      // R8 — le non est respecté. Le cooldown se DÉRIVE de cette ligne: il n'y
      // a rien d'autre à écrire, et surtout aucun compteur.
      console.info(JSON.stringify({
        tag: "keel.daily_recommendation.declined",
        user_id: message.user_id,
        proposal_id: row.id,
        action: row.actionId,
      }));
      // FF-056 — si cette proposition est née d'un épisode de divergence, elle
      // le clôt. Ne jette jamais et ne rend rien: FF-028 n'a pas à connaître
      // FF-056, et un échec ici laisse l'épisode expirer tout seul.
      await closeDivergenceEpisodeAfterRecommendation(admin, {
        userId: message.user_id,
        applied: false,
      });
      await say(recommendationAck(action, ackLanguage, "declined"));
      return handled("keel_daily_recommendation_declined");
    }

    // ── L'APPLICATION: ÉCRIRE, RELIRE, PUIS SEULEMENT ACCUSER ──────────────
    const applied = await applyRecommendation(admin, {
      userId: message.user_id,
      slot: action.slot,
    });
    if (applied.outcome !== "applied") {
      // La ligne n'existe pas après l'écriture. On REND la proposition à son
      // état ouvert plutôt que de la garder acceptée-sans-effet: l'écriture est
      // idempotente, donc une seconde tentative est sûre, et une proposition
      // acceptée dont rien n'a bougé est un mensonge qui dort en base.
      await releaseClaim(admin, { id: row.id, userId: message.user_id });
      console.error(JSON.stringify({
        tag: "keel.daily_recommendation.apply_unverified",
        user_id: message.user_id,
        proposal_id: row.id,
        action: row.actionId,
        detail: applied.detail,
      }));
      await say(RECOMMENDATION_APPLY_FAILED_ACK);
      return handled("keel_daily_recommendation_apply_failed");
    }

    await markApplied(admin, { id: row.id, userId: message.user_id });
    console.info(JSON.stringify({
      tag: "keel.daily_recommendation.applied",
      user_id: message.user_id,
      proposal_id: row.id,
      action: row.actionId,
      rhythm: applied.rhythm.map((r) => r.slot).join(","),
    }));
    // FF-056 — la directive durable existe et elle a été RELUE (`applied`).
    // C'est le seul endroit d'où l'épisode peut légitimement passer à `acted`.
    await closeDivergenceEpisodeAfterRecommendation(admin, {
      userId: message.user_id,
      applied: true,
    });
    await say(recommendationAck(action, ackLanguage, "applied"));
    return handled("keel_daily_recommendation_accepted");
  } catch (error) {
    // NE JETTE JAMAIS: l'élève a tapé un bouton, et un 500 le laisserait sans
    // savoir si son geste a compté. On dit qu'on n'a pas pu — jamais qu'on a
    // fait.
    console.error(JSON.stringify({
      tag: "keel.daily_recommendation.tap_failed",
      user_id: message.user_id,
      proposal_id: reply.proposalId,
      error: error instanceof Error ? error.message : String(error),
    }));
    await say(RECOMMENDATION_APPLY_FAILED_ACK);
    return handled("keel_daily_recommendation_failed");
  }
}

/**
 * FF-058 — LE TAP DE LA BANDE DU SOIR.
 *
 * ── CE QU'IL FAIT, ET CE QU'IL S'INTERDIT ─────────────────────────────────
 * Il ÉCRIT (par le chemin de l'écran, `evening_strip_io.ts`), il RELIT le
 * résultat de l'écriture, et il accuse ce qu'il a relu. Rien de plus:
 *
 *   · ce que devient un `✗`         → FF-057, pas ici (R9);
 *   · ce que devient un `Pas encore` → FF-057, pas ici (R17);
 *   · aucun verdict, aucun score, aucune série (R4) — `renderStripAck` applique
 *     la ceinture du soir sur le texte exact, dans les deux langues;
 *   · aucune coche par procuration (R11) — le seul `user_id` que ce chemin
 *     connaisse est `message.user_id`, c'est-à-dire le porteur du JWT. Il n'y a
 *     ici aucun paramètre, aucune agrégation de foyer et aucun identifiant
 *     entrant par lequel un compte pourrait écrire chez un autre.
 *
 * ⚠️ L'ACCUSÉ NE DESCEND JAMAIS AU DISPATCHER. Cicatrice mesurée sur T-1
 * (FF-008): la lane de réponse ne sait ni ce que le déterministe a écrit ni ce
 * qu'il a refusé, et elle produit des accusés fantômes. Ce chemin écrit, relit,
 * et pose lui-même la phrase qui correspond au fait relu.
 */
async function handleStripTap(
  admin: SupabaseClient,
  args: {
    message: InboundMessage;
    requestId: string;
    reply: Exclude<StripReply, { kind: "none" }>;
  },
): Promise<InboundStepOutcome> {
  const { message, reply } = args;
  const now = new Date(message.received_at);
  // LE JOUR LOCAL DE LA PERSONNE, résolu UNE fois: il plafonne ce qui peut être
  // coché (on rattrape le passé, jamais le futur) et il date la réponse de
  // courses. Deux résolutions du même jour finiraient par diverger — c'est le
  // défaut que `localDateFor` a été extrait pour empêcher.
  const localDate = localDateFor(now, await timezoneFor(admin, message.user_id));
  const voice = await studentVoiceContext(admin, message.user_id);
  const language: StripLanguage = isFrenchLocale(voice.contentLocale)
    ? "fr"
    : "en";
  const say = (body: string, buttons?: { payload: string; label: string }[]) =>
    ack(admin, {
      userId: message.user_id,
      requestId: args.requestId,
      purpose: "keel_evening_strip_ack",
      body,
      buttons,
    });

  try {
    // ── `Pas tout` — ON N'ÉCRIT RIEN, ON DÉPLIE ───────────────────────────
    // Le geste ne dit rien encore: il demande à voir. Écrire quoi que ce soit
    // ici serait une coche que personne n'a posée.
    if (reply.kind === "some") {
      const dishes = await loadStripDishes(admin, {
        userId: message.user_id,
        mealId: reply.mealId,
        dishIndexes: reply.dishIndexes,
      });
      const step = renderStripDishStep({
        mealId: reply.mealId,
        dishes,
        language,
      });
      if (!step) {
        await say(renderStripAck("stale", language));
        return handled("keel_evening_strip_some_stale");
      }
      await say(
        step.body,
        step.buttons.map((b) => ({ payload: b.id, label: b.title })),
      );
      return handled("keel_evening_strip_some");
    }

    if (reply.kind === "shopping") {
      const wrote = await writeGroceryWaveState(admin, {
        userId: message.user_id,
        mealId: reply.mealId,
        buyOn: reply.buyOn,
        done: reply.done,
        answeredLocalDate: localDate,
        now,
      });
      if (wrote.outcome !== "written") {
        // On ne dit JAMAIS « c'est noté » sur une écriture qu'on n'a pas faite:
        // c'est l'accusé fantôme, le défaut le plus cher de ce dépôt.
        await say(renderStripAck("stale", language));
        return handled("keel_evening_strip_shopping_failed");
      }
      console.info(JSON.stringify({
        tag: "keel.evening_strip.wave_state",
        user_id: message.user_id,
        meal_id: reply.mealId,
        buy_on: reply.buyOn,
        done: reply.done,
      }));

      // ── FF-057 · UN `Pas encore` OUVRE LA PROPOSITION DE DÉCALAGE ───────
      //
      // FF-058 R17 disait « on CONSTATE, et la suite appartient à FF-057 ».
      // C'est ici que FF-057 se branche, et la frontière ne bouge pas: la bande
      // ÉCRIT l'état de la vague (au-dessus), la procédure accident PROPOSE ce
      // qui en découle. Rien n'est demandé — la date de la nouvelle cuisson est
      // CALCULÉE (`planSessionShift`), et « tu peux y aller quand ? » n'est
      // posée nulle part (FF-057 R11, ceinture armée sur le texte exact).
      //
      // ⚠️ SEULEMENT SUR UN `Pas encore`, et seulement si la vague sert une
      // cuisson. Une vague d'épicerie seule ne menace rien, et une vague FAITE
      // n'a rien à réparer: `shiftProposalAfterShoppingLater` rend `null` dans
      // les deux cas, et on retombe sur l'accusé plat de FF-058.
      if (!reply.done) {
        const proposal = await shiftProposalAfterShoppingLater(admin, {
          userId: message.user_id,
          mealId: reply.mealId,
          buyOn: reply.buyOn,
          language,
        });
        if (proposal) {
          await say(proposal.body, proposal.buttons);
          return handled("keel_accident_shift_proposed");
        }
      }

      await say(
        renderStripAck(
          reply.done ? "shopping_done" : "shopping_later",
          language,
        ),
      );
      return handled(
        reply.done
          ? "keel_evening_strip_shopping_done"
          : "keel_evening_strip_shopping_later",
      );
    }

    // ── LES COCHES ────────────────────────────────────────────────────────
    // `all` porte la liste des index que la bande a NOMMÉS; `tick`/`untick` en
    // portent un seul. Le même écrivain dans les trois cas — la seule différence
    // est `disqualified_reason`, exactement comme l'en-tête de `meal_tick.ts`
    // le décrit.
    const indexes = reply.kind === "all"
      ? reply.dishIndexes
      : [reply.dishIndex];
    const result = await applyStripTicks(admin, {
      userId: message.user_id,
      mealId: reply.mealId,
      dishIndexes: indexes,
      disqualified: reply.kind === "untick" ? MEAL_UNTICK_REASON : null,
      today: localDate,
      now,
    });
    console.info(JSON.stringify({
      tag: "keel.evening_strip.ticks",
      user_id: message.user_id,
      meal_id: reply.mealId,
      kind: reply.kind,
      asked: indexes.length,
      written: result.written,
      rearmed: result.rearmed,
      stale: result.stale,
      // ⚠️ COMPTÉ À PART. Un index qui désigne un jour pas encore arrivé n'est
      // pas une donnée périmée: c'est une charge qui essaie d'écrire une preuve
      // fabriquée. Le fondre dans `stale` rendrait l'attaque invisible.
      future: result.future,
      failed: result.failed,
    }));

    // RIEN N'A PU S'ÉCRIRE ⇒ ON LE DIT. Le plan a été régénéré plus court, ou la
    // ligne a disparu. « C'est noté » sur zéro écriture serait le mensonge que
    // ce chemin existe pour empêcher.
    if (result.written + result.rearmed === 0) {
      await say(renderStripAck("stale", language));
      return handled("keel_evening_strip_stale");
    }

    // ── FF-057 · UN `✗` OUVRE LE FORMULAIRE ACCIDENT ─────────────────────
    //
    // C'est l'entrée n°1 de FF-057. La DÉCOCHE EST DÉJÀ ÉCRITE (juste au-dessus)
    // et elle PRÉCÈDE le formulaire: ignorer celui-ci reste entièrement gratuit,
    // rien n'est en attente, rien n'est marqué, rien ne revient. C'est la
    // contre-mesure de FF-057 §10 rendue structurelle — si signaler déclenchait
    // une procédure obligatoire, les gens cesseraient de signaler, et c'est le
    // pire résultat possible.
    //
    // Le formulaire REMPLACE l'accusé plat plutôt que de s'y ajouter: son entête
    // constate le fait (« X n'a pas eu lieu comme prévu »), donc une bulle
    // « C'est noté » de plus ne dirait rien et coûterait un message.
    if (reply.kind === "untick") {
      const form = await accidentFormAfterUntick(admin, {
        userId: message.user_id,
        mealId: reply.mealId,
        dishIndex: reply.dishIndex,
        language,
      });
      if (form) {
        await say(form.body, form.buttons);
        return handled("keel_accident_form_opened");
      }
    }

    await say(
      renderStripAck(
        reply.kind === "untick" ? "untick" : reply.kind === "all" ? "all" : "tick",
        language,
      ),
    );
    return handled(`keel_evening_strip_${reply.kind}`);
  } catch (error) {
    // NE JETTE JAMAIS: l'élève a tapé un bouton, et un 500 le laisserait sans
    // savoir si son geste a compté. On dit qu'on n'a pas pu — jamais qu'on a
    // fait.
    console.error(JSON.stringify({
      tag: "keel.evening_strip.tap_failed",
      user_id: message.user_id,
      kind: reply.kind,
      error: error instanceof Error ? error.message : String(error),
    }));
    await say(renderStripAck("stale", language));
    return handled("keel_evening_strip_failed");
  }
}

export async function handleDeterministicButton(
  admin: SupabaseClient,
  args: { message: InboundMessage; requestId: string },
): Promise<InboundStepOutcome> {
  const { message } = args;

  // ── LE POINT HEBDOMADAIRE, ET LA CARTE DES MESURES ────────────────────────
  //
  // Deux formulaires écrivent `weekly_reviews.biofeedback`, et ils partagent
  // TOUT sauf ce qu'ils demandent: même parseur, mêmes bornes, même fusion
  // dans la même ligne (élève, semaine). Ce qui les distingue est le jeton,
  // donc l'origine est LISIBLE sur la requête au lieu d'être devinée.
  //
  // Deux écrivains pour une même colonne, c'est le défaut n°1 de ce dépôt —
  // sauf qu'ici il n'y en a qu'UN: la carte de `/app/plan` ne touche pas la
  // base, elle passe par ce chemin. `weekly_reviews` reste d'ailleurs en
  // lecture seule côté élève (aucune policy d'écriture), donc ce n'est pas une
  // discipline mais une impossibilité.
  if (message.kind === "form") {
    const measuresWeek = parseMeasuresToken(message.form_token);
    if (measuresWeek) {
      return await writeMeasures(admin, {
        message,
        requestId: args.requestId,
        week: measuresWeek,
      });
    }

    const week = parseWeeklyFlowToken(message.form_token);
    if (!week) {
      // Un jeton illisible ne fait PAS retomber le tour sur le dispatcher :
      // il analyserait le JSON du formulaire comme une phrase. On journalise
      // le jeton reçu, tronqué, sans jamais le laisser désigner quoi que ce
      // soit — puis on répond honnêtement.
      console.warn(JSON.stringify({
        tag: "keel.weekly_flow.unusable_token",
        user_id: message.user_id,
        form_token: String(message.form_token ?? "").slice(0, 64),
      }));
      await ack(admin, {
        userId: message.user_id,
        requestId: args.requestId,
        purpose: "keel_weekly_flow_ack",
        body:
          "Something went wrong on my side and I couldn't save that. Sorry — could you send it again?",
      });
      return handled("weekly_flow_unusable_token");
    }
    try {
      const written = await writeWeeklyFlowReply(admin, {
        userId: message.user_id,
        weekStart: week,
        responseJson: message.form_response,
        origin: "weekly_form",
        // FF-031 — voir `writeMeasures` juste au-dessus: le jeton porte la
        // semaine, l'instant donne le jour.
        now: new Date(),
      });
      await ack(admin, {
        userId: message.user_id,
        requestId: args.requestId,
        purpose: "keel_weekly_flow_ack",
        // ── CE QUI REVIENT APRÈS LE FORMULAIRE REMPLI ─────────────────────
        //
        // « Huit champs » était le chiffre B2B: depuis R4, les six axes ne se
        // collectent que là où un coach humain les lit, et un dimanche B2C ne
        // porte que deux mesures. La réponse ne change pas pour autant — elle
        // vient de la lecture des FAITS de la semaine, pas des axes.
        //
        // C'était `renderWeeklyFlowAck` — « Got it, thanks for taking the two
        // minutes ». Deux minutes du temps de l'élève contre une phrase, sur
        // le seul moment de la semaine où il s'arrête et regarde ce qu'il a
        // fait. Le bilan lit ce que la semaine a montré, contre la méthode de
        // son coach, et pose au plus UNE question.
        //
        // L'ÉCRITURE D'ABORD, LE TEXTE ENSUITE, et l'ordre est la garde: la
        // mesure est enregistrée avant qu'un modèle n'entre dans le tour. Un
        // composeur en panne coûte alors une phrase, jamais la donnée.
        //
        // `renderWeeklyFlowAck` reste le SOL: pas de lecture gelée (l'élève a
        // rouvert un formulaire d'une semaine jamais calculée, ou le cron n'a
        // pas tourné), et on retombe exactement sur le message d'avant.
        body: await weeklyReplyBody(admin, {
          userId: message.user_id,
          week,
          requestId: args.requestId,
          flatAck: renderWeeklyFlowAck(written.reply),
        }),
      });
    } catch (error) {
      const err = error as { message?: string; code?: string; details?: string };
      console.error(JSON.stringify({
        tag: "keel.weekly_flow.write_failed",
        user_id: message.user_id,
        week,
        // Une erreur PostgREST n'est pas une `Error` : sans ces champs le
        // journal ne disait que « [object Object] », et c'est ainsi qu'un
        // 42P10 permanent sur l'upsert est resté invisible.
        error: error instanceof Error
          ? error.message
          : [err?.code, err?.message, err?.details].filter(Boolean).join(" — ") ||
            String(error),
      }));
      // L'élève a rempli son formulaire : le silence complet lui ferait croire que
      // c'est enregistré. On le dit, sans lui renvoyer un chiffre.
      await ack(admin, {
        userId: message.user_id,
        requestId: args.requestId,
        purpose: "keel_weekly_flow_ack",
        body:
          "Something went wrong on my side and I couldn't save that. Sorry — could you send it again?",
      });
    }
    return handled("weekly_flow");
  }

  if (message.kind !== "button") return PASS;

  // ── FF-028 · LE TAP SUR UNE RECOMMANDATION ────────────────────────────────
  //
  // AVANT le tap du soir, et c'est sans conséquence: les deux préfixes sont
  // disjoints (`KEEL_RECO_` / `KEEL_PULSE_`) et chaque lecteur rend `none` sur
  // ce qui ne le concerne pas. L'ordre est celui de la spécificité — le lecteur
  // le plus contraint (il exige un UUID) passe en premier.
  const reco = readRecommendationReply(message.button_payload);
  if (reco.kind !== "none") {
    return await handleRecommendationTap(admin, {
      message,
      requestId: args.requestId,
      reply: reco,
    });
  }

  // ── FF-058 · LE TAP DE LA BANDE DU SOIR ───────────────────────────────────
  //
  // Les trois vocabulaires sont DISJOINTS (`KEEL_RECO_` / `KEEL_STRIP_` /
  // `KEEL_PULSE_`) et chaque lecteur rend « rien » sur ce qui ne le concerne
  // pas: l'ordre n'a donc aucune conséquence, et un test le pinne
  // (`evening_strip_test.ts`, « the three deterministic vocabularies do not
  // collide »). Il est placé avant le pouls parce que sa charge est plus
  // contrainte — elle doit se relire par `parseMealTickKey` ou par une date.
  const strip = readStripReply(message.button_payload);
  if (strip.kind !== "none") {
    return await handleStripTap(admin, {
      message,
      requestId: args.requestId,
      reply: strip,
    });
  }

  // ── FF-057 · LES TAPS DE LA PROCÉDURE ACCIDENT ────────────────────────────
  //
  // QUATRE vocabulaires déterministes, tous DISJOINTS (`KEEL_RECO_` /
  // `KEEL_STRIP_` / `KEEL_FIX_` / `KEEL_PULSE_`), et chaque lecteur rend « rien »
  // sur ce qui ne le concerne pas: l'ordre n'a donc aucune conséquence, et un
  // test le pinne (`accident_test.ts`, « les quatre vocabulaires ne se croisent
  // pas »).
  //
  // La décision et les écritures vivent dans `accident_tap.ts`; ce routeur ne
  // fait que lire, router, et rendre — c'est ce qui l'empêche de gonfler à
  // chaque fiche.
  const accident = readAccidentReply(message.button_payload);
  if (accident.kind !== "none") {
    const now = new Date(message.received_at);
    const localDate = localDateFor(now, await timezoneFor(admin, message.user_id));
    const voice = await studentVoiceContext(admin, message.user_id);
    const result = await handleAccidentTap(admin, {
      userId: message.user_id,
      reply: accident,
      language: isFrenchLocale(voice.contentLocale) ? "fr" : "en",
      contentLocale: voice.contentLocale,
      localDate,
      now,
      // La clé d'idempotence du budget T4, et c'est `client_message_id` —
      // stable à travers les retries réseau, par contrat d'`InboundMessage`.
      // Kong rend des 502 sans corps sur les tours longs et le client retente:
      // un tour rejoué ne doit pas consommer deux places pour une invitation
      // partie une fois. `requestId`, lui, change à chaque appel HTTP et aurait
      // rendu l'unicité `(user_id, asked_for_message_id)` décorative.
      sourceMessageId: message.client_message_id,
    });
    await ack(admin, {
      userId: message.user_id,
      requestId: args.requestId,
      purpose: "keel_accident_ack",
      body: result.body,
      buttons: result.buttons,
    });
    return handled(result.handledAs);
  }

  // ── FF-056 · LES TAPS DE LA DIVERGENCE CONSTATÉE ──────────────────────────
  //
  // CINQ vocabulaires déterministes, tous DISJOINTS (`KEEL_RECO_` /
  // `KEEL_STRIP_` / `KEEL_FIX_` / `KEEL_WDIV_` / `KEEL_PULSE_`), et chaque
  // lecteur rend « rien » sur ce qui ne le concerne pas: l'ordre n'a donc
  // aucune conséquence, et un test le pinne (`weight_divergence_buttons_test.ts`,
  // « les cinq vocabulaires ne se croisent pas »).
  //
  // ⚠️ C'EST ICI QUE MEURT LE NON-DÉTERMINISME DE FF-056. Le chemin texte
  // descend au dispatcher, qui demande à un modèle de projeter une phrase sur
  // neuf catégories fermées — mesuré `[0,3,3,0]` sur une phrase IDENTIQUE. Un
  // `button_payload` est une valeur que NOUS avons émise: la faire descendre
  // reviendrait à payer un appel LLM pour interpréter une chaîne exacte, et à
  // accepter qu'il se trompe sur elle.
  //
  // `admin` est le client SERVICE-ROLE de `chat-inbound-v1`. C'est structurel:
  // `authenticated` n'a que `SELECT` sur `student_weight_divergence_episodes`,
  // et passer le client de l'élève est EXACTEMENT la faute que ce flow a
  // payée (`permission denied`, chaque tour repartant de zéro).
  const divergence = readDivergenceReply(message.button_payload);
  if (divergence.kind !== "none") {
    const now = new Date(message.received_at);
    const localDate = localDateFor(now, await timezoneFor(admin, message.user_id));
    const voice = await studentVoiceContext(admin, message.user_id);
    const result = await handleWeightDivergenceTap(admin, {
      userId: message.user_id,
      reply: divergence,
      language: isFrenchLocale(voice.contentLocale) ? "fr" : "en",
      responseLocale: voice.contentLocale,
      localDate,
    });
    await ack(admin, {
      userId: message.user_id,
      requestId: args.requestId,
      purpose: "keel_weight_divergence_ack",
      body: result.body,
      buttons: result.buttons,
    });
    return handled(result.handledAs);
  }

  // ── LE TAP DU SOIR ────────────────────────────────────────────────────────
  const pulse = readPulseReply(message.button_payload);
  if (pulse.kind === "none") {
    // ── UNE CHARGE DÉTERMINISTE ILLISIBLE NE DESCEND PAS AU DISPATCHER ─────
    //
    // MESURÉ le 2026-08-12 (revue adversariale FF-056, H3/H4). Une charge
    // `KEEL_WDIV_CAT|<uuid>|` tronquée, et une autre portant un jeton hors
    // liste, tombaient toutes deux ici en `PASS`. `parseInboundMessage` pose
    // alors `text = button_payload` (le libellé sert de trace lisible), et le
    // dispatcher analysait donc la CHAÎNE DU BOUTON comme une phrase d'élève.
    // Les deux réponses obtenues en run réel:
    //
    //   « If it's not going down, the usual reasons are: the portion is too
    //     large, the food is too dry/dense, you're eating too fast… »
    //   « Your question is with them now. »
    //
    // La première SPÉCULE sur des causes (ce que FF-056 existe pour ne jamais
    // faire), la seconde promet un canal 1:1 coach→élève QUI N'EXISTE PAS
    // (`docs/keel/MODEL.md`). Une charge qu'on n'a pas su lire n'est pas une
    // phrase: c'est un identifiant cassé, et lui répondre par un modèle est la
    // façon la plus chère possible de se tromper.
    //
    // Le précédent est DANS CE FICHIER: `weekly_flow_unusable_token`, quinze
    // lignes plus haut, prend exactement cette décision pour un jeton de
    // formulaire illisible. On l'étend aux boutons.
    //
    // ⚠️ APRÈS LES CINQ LECTEURS, JAMAIS AVANT. Une charge VALIDE n'atteint
    // jamais ce point — c'est ce qui empêche cette garde de bloquer tout en
    // ressemblant à une garde qui marche.
    const payload = String(message.button_payload ?? "").trim();
    const known = DETERMINISTIC_BUTTON_PREFIXES.some((p) =>
      payload.startsWith(p)
    );
    if (!known) return PASS;
    console.warn(JSON.stringify({
      tag: "keel.deterministic_button.unusable_payload",
      user_id: message.user_id,
      // Tronqué, et il ne désigne jamais rien: on le journalise pour pouvoir
      // reconnaître une campagne de charges forgées, pas pour l'interpréter.
      button_payload: payload.slice(0, 64),
    }));
    const voice = await studentVoiceContext(admin, message.user_id);
    await ack(admin, {
      userId: message.user_id,
      requestId: args.requestId,
      purpose: "keel_unusable_button_ack",
      body: isFrenchLocale(voice.contentLocale)
        ? "Celui-là n'est plus d'actualité — rien n'a été enregistré."
        : "That one's no longer open — nothing has been saved.",
    });
    return handled("keel_unusable_button_payload");
  }

  const localDate = localDateFor(
    new Date(message.received_at),
    await timezoneFor(admin, message.user_id),
  );

  // L'accusé et la question d'axe partent dans la langue de l'élève. Elles
  // étaient anglaises en dur pendant que la charge du bouton, elle, venait
  // d'un message du soir déjà français: taper « Dur » renvoyait « Got it,
  // thanks. » puis « What was hard? » avec trois boutons anglais.
  const pulseVoice = await studentVoiceContext(admin, message.user_id);

  if (pulse.kind === "level") {
    const wrote = await writePulseLevel(admin, {
      userId: message.user_id,
      localDate,
      level: pulse.level,
      source: "chat",
    });
    await ack(admin, {
      userId: message.user_id,
      requestId: args.requestId,
      purpose: "keel_daily_pulse_ack",
      body: renderPulseAck(pulse.level, null, pulseVoice.contentLocale),
    });
    // La question d'axe n'est posée QUE si quelque chose a coincé — et c'est un
    // second message, armé de ses boutons. Deux messages plutôt qu'un accusé
    // qui pose une question : la bulle affiche les boutons sous LA question,
    // pas sous un « Got it ».
    if (wrote.needsAxis) {
      const axisQuestion = renderPulseAxisQuestion(pulseVoice.contentLocale);
      await ack(admin, {
        userId: message.user_id,
        requestId: args.requestId,
        purpose: "keel_daily_pulse_axis",
        body: axisQuestion.body,
        buttons: axisQuestion.buttons.map((b) => ({
          payload: b.id,
          label: b.title,
        })),
      });
    }
    return handled("daily_pulse_level");
  }

  await writePulseAxis(admin, {
    userId: message.user_id,
    localDate,
    axis: pulse.axis,
  });
  await ack(admin, {
    userId: message.user_id,
    requestId: args.requestId,
    purpose: "keel_daily_pulse_ack",
    body: renderPulseAck("hard", pulse.axis, pulseVoice.contentLocale),
  });
  return handled("daily_pulse_axis");
}
