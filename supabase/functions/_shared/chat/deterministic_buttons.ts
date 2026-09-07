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

import { PULSE_BUTTON_PREFIX } from "../keel/daily_pulse.ts";
import {
  MEMORY_CLARIFICATION_BUTTON_PREFIX,
  NAVIGATION_BUTTON_PREFIX,
} from "../keel/memory_clarification.ts";
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
import { STRIP_BUTTON_PREFIX } from "../keel/evening_strip.ts";
import { ACCIDENT_BUTTON_PREFIX } from "../keel/accident.ts";
import { SHARE_BUTTON_PREFIX } from "../keel/share_step.ts";
// FF-062 C2 — le rappel de pesée: son jeton, son accusé, son écriture.
import {
  parseWeighInToken,
  renderWeighInAck,
} from "../keel/weigh_in.ts";
import {
  WEIGH_IN_ACK_PURPOSE,
  writeWeighIn,
} from "../keel/weigh_in_io.ts";
// FF-062 R11 — la correction du chiffre d'énergie d'une photo.
import { ENERGY_FIX_TOKEN_PREFIX } from "../keel/energy_correction.ts";
import { localDateInZone } from "../keel/local_date.ts";
// FF-062 C1 — le repas d'un créneau déclaré que le plan ne compose pas.
import {
  parseSlotMealButton,
  renderSlotMealAck,
  SLOT_MEAL_BUTTON_PREFIX,
} from "../keel/slot_meal_ask.ts";
import {
  SLOT_MEAL_ACK_PURPOSE,
  writeSlotMealFact,
} from "../keel/slot_meal_io.ts";
import {
  DIVERGENCE_BUTTON_PREFIX,
  readDivergenceReply,
} from "../keel/weight_divergence_buttons.ts";
import {
  FEEDBACK_BUTTON_PREFIX,
  readFeedbackReply,
} from "../keel/plan_feedback_chat.ts";
import { handlePlanFeedbackTap } from "./plan_feedback_tap.ts";
import { judgeTap } from "./disarmed_tap_io.ts";
// Le plancher TCA change la LISTE des questions du retour (`questionsFor`):
// il se résout donc AVANT de router le tap, comme pour la procédure accident.
import { evaluateRestrictionForStudent } from "../keel/restriction_runtime.ts";
import {
  closeDivergenceEpisodeAfterRecommendation,
  handleWeightDivergenceTap,
} from "./weight_divergence_tap.ts";
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
import {
  handled, type InboundStepOutcome, PASS,
} from "./inbound_pipeline.ts";
import type { InboundMessage } from "./inbound_message.ts";

/**
 * LES VOCABULAIRES DÉTERMINISTES, en un seul endroit.
 *
 * ⚠️ SANS COMPTE DANS LE TITRE, ET C'EST DÉLIBÉRÉ. Il disait « les cinq »
 * alors que la liste en portait sept: un nombre écrit dans un commentaire ne
 * se met pas à jour, et il finit par affirmer le contraire du code qu'il
 * décrit. La liste, elle, est juste en dessous.
 *
 * Ils sont DISJOINTS et chaque lecteur rend « rien » sur ce qui ne le concerne
 * pas — c'est ce qui rend l'ordre de lecture ci-dessous sans conséquence. Cette
 * liste sert à autre chose: reconnaître qu'une charge VOULAIT être un tap, même
 * quand aucun lecteur n'a su la lire. Voir la garde en fin de fonction.
 *
 * ── LES DEUX SENS DE LA RÈGLE, ET LE PIÈGE QUI EST ENTRE LES DEUX ──────────
 *
 * **Lue sans être listée** ⇒ la charge cassée retombe au dispatcher, et un
 * modèle répond à une chaîne de protocole. C'est un défaut, toujours.
 *
 * **Listée sans lecteur** ⇒ la charge tombe dans la garde terminale et rend
 * « Celui-là n'est plus d'actualité ». C'est un défaut quand la famille est
 * VIVANTE (on refuse un tap qui devrait marcher), et c'est exactement ce qu'on
 * VEUT dans deux cas, tous deux annotés ligne par ligne ci-dessous:
 *
 *   · `FRONT:` — le bouton n'est jamais envoyé au serveur, il est intercepté
 *     par l'écran. Seule une charge FORGÉE arrive ici.
 *   · `DÉSARMÉ <date>` — plus personne ne fabrique ce bouton, mais des bulles en
 *     portent encore dans l'historique des gens. La ligne est ce qui fait que
 *     leur tap rend une phrase honnête au lieu d'une réponse de modèle.
 *
 * ⚠️ Une famille VIVANTE se retire donc AVEC son lecteur, dans le même commit,
 * et sa ligne reste ici, réannotée `DÉSARMÉ <date>`. `disarmed_families_wiring_test`
 * refuse une ligne sans lecteur et sans annotation.
 */
export const DETERMINISTIC_BUTTON_PREFIXES: readonly string[] = Object.freeze([
  // DÉSARMÉ le 2026-09-07 — la question de clarification d'une note ambiguë.
  // Le classifieur NOMME encore ce qu'il n'a pas compris (`clarify_not_asked`
  // le compte), il ne le renvoie plus sous forme de question. La bulle
  // « j'ai noté … · Voir » (`notifyMemoryWrite`), elle, RESTE: c'est un
  // énoncé, pas une demande, et c'est le pilier « on l'écrit, on le dit ».
  MEMORY_CLARIFICATION_BUTTON_PREFIX,
  // FRONT: « Voir » n'est jamais envoyé au serveur — l'écran l'intercepte et
  // ouvre une page. Seule une charge `KEEL_VIEW_*` FORGÉE arrive ici, et sans
  // cette ligne elle retomberait au dispatcher.
  NAVIGATION_BUTTON_PREFIX,
  RECOMMENDATION_BUTTON_PREFIX,
  // DÉSARMÉ le 2026-09-07 — la bande du soir. `keel-daily-pulse-v1` en était le
  // SEUL émetteur, et il ne fabrique plus un bouton. Les bulles déjà envoyées
  // en portent encore: sans cette ligne, leur tap repartirait au dispatcher.
  STRIP_BUTTON_PREFIX,
  // DÉSARMÉ le 2026-09-07 — la procédure accident. Elle réparait un plan
  // composé; le chat ne modifie plus un plan. Ses deux émetteurs sont partis:
  // le tap de la bande, et le bouton « Je n'ai pas fait cette cuisson ».
  ACCIDENT_BUTTON_PREFIX,
  DIVERGENCE_BUTTON_PREFIX,
  // DÉSARMÉ le 2026-09-07 — le pouls du soir. Le message part encore, mais il
  // énonce des faits et ne demande plus rien.
  PULSE_BUTTON_PREFIX,
  FEEDBACK_BUTTON_PREFIX,
  // FF-062 C1. Ajouté AVEC son lecteur.
  SLOT_MEAL_BUTTON_PREFIX,
  // DÉSARMÉ le 2026-09-07 — le sort d'une part non mangée (A8.3). Son unique
  // émetteur était le tap de la bande. `meal_share_outcomes` garde ses lignes
  // et ses lecteurs d'écran: c'est l'ÉCRITURE qui s'arrête, pas la table.
  SHARE_BUTTON_PREFIX,
  // DÉSARMÉ le 2026-09-07 — la correction du chiffre d'énergie d'une photo.
  //
  // ⚠️ IL N'ÉTAIT PAS DANS CETTE LISTE, ET IL Y ENTRE EN MÊME TEMPS QU'IL EN
  // SORT. Le serveur ne le voyait jamais en `kind: "button"`: `ChatPage`
  // l'interceptait et renvoyait un `kind: "form"`. En retirant l'interception
  // sans le lister, un vieux bouton tapé dans l'historique serait parti en
  // `kind: "button"`, sans lecteur, `known === false` — donc `PASS`, donc le
  // dispatcher, donc un modèle répondant à une chaîne de protocole. Un
  // désarmement qui rouvre le trou qu'il vient de fermer.
  ENERGY_FIX_TOKEN_PREFIX,
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
    /** ⟳ 2026-09-05 — ce que la bulle sait d'elle-même (les lignes écrites, pour « Voir »). */
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await deliverChatMessage(admin, {
    userId: args.userId,
    content: args.body,
    isReply: true,
    purpose: args.purpose,
    buttons: args.buttons ?? [],
    ...(args.metadata ? { metadata: args.metadata } : {}),
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
 * FF-062 C2 — LA PESÉE QUE LE RAPPEL RAMÈNE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LA DATE DE LA MESURE EST CELLE DE LA RÉPONSE, PAS CELLE DE LA QUESTION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le jeton porte le jour où la question est PARTIE. La mesure, elle, est datée
 * du jour où la personne est montée sur la balance — c'est-à-dire aujourd'hui.
 * Les confondre daterait d'hier une pesée faite ce matin, et la cadence
 * repartirait d'un jour trop tôt.
 *
 * ⛔ ET CE FORMULAIRE N'EST PAS DÉSARMÉ PAR R13, DÉLIBÉRÉMENT. Le désarmement
 * ferme ce qui sert à RÉPARER (les courses, la cuisson: sur du passé la
 * réparation n'existe plus). Une pesée SERT À MESURER, et la fiche range
 * explicitement le mesurable du côté rattrapable — un poids rapporté deux jours
 * plus tard reste exact. Le jour asked reste dans la trace pour qu'un audit
 * puisse lire l'écart entre la question et la réponse.
 *
 * NE JETTE JAMAIS: l'élève a saisi un nombre, et un 500 lui ferait croire que
 * son geste est perdu.
 */
async function writeWeighInReply(
  admin: SupabaseClient,
  args: { message: InboundMessage; requestId: string; askedOn: string },
): Promise<InboundStepOutcome> {
  const { message } = args;
  // ⚠️ LA LANGUE VIENT DU PROFIL, PAS DU MESSAGE. `InboundMessage` ne porte
  // pas de locale, et la deviner sur le texte d'un formulaire — qui ne contient
  // qu'un nombre — n'a aucun sens. `studentVoiceContext` ne jette jamais et
  // résout par le même chemin que tous les autres accusés de ce fichier.
  const { contentLocale: locale } = await studentVoiceContext(
    admin,
    message.user_id,
  );
  const now = new Date();
  try {
    const zone = await timezoneFor(admin, message.user_id);
    // Sans fuseau, l'UTC du serveur est la moins mauvaise approximation — et
    // c'est la seule branche de ce fichier où jeter coûterait la mesure.
    const localDate = zone
      ? (() => {
        try {
          return localDateInZone(zone, now);
        } catch {
          return now.toISOString().slice(0, 10);
        }
      })()
      : now.toISOString().slice(0, 10);

    const raw = (message.form_response ?? {}) as Record<string, unknown>;
    const outcome = await writeWeighIn(admin, {
      userId: message.user_id,
      raw: raw.weight_kg,
      localDate,
      now,
      contentLocale: locale,
    });
    if (!outcome.ok && outcome.reason === "out_of_range") {
      console.warn(JSON.stringify({
        tag: "keel.weigh_in.out_of_range",
        user_id: message.user_id,
        asked_on: args.askedOn,
      }));
    }
    await ack(admin, {
      userId: message.user_id,
      requestId: args.requestId,
      purpose: WEIGH_IN_ACK_PURPOSE,
      body: renderWeighInAck({ locale, outcome }),
    });
  } catch (error) {
    const err = error as { message?: string; code?: string; details?: string };
    console.error(JSON.stringify({
      tag: "keel.weigh_in.write_failed",
      user_id: message.user_id,
      asked_on: args.askedOn,
      // Une erreur PostgREST n'est pas une `Error`: sans ces champs le journal
      // ne dirait que « [object Object] ».
      error: error instanceof Error
        ? error.message
        : [err?.code, err?.message, err?.details].filter(Boolean).join(" — ") ||
          String(error),
    }));
    await ack(admin, {
      userId: message.user_id,
      requestId: args.requestId,
      purpose: WEIGH_IN_ACK_PURPOSE,
      body: renderWeighInAck({ locale, outcome: { ok: false, reason: "failed" } }),
    });
  }
  return handled("keel_weigh_in");
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
 * LES PRÉNOMS DU FOYER, pour que l'accusé d'un tap NOMME la bouche.
 *
 * ⛔ UN IDENTIFIANT DANS UN MESSAGE N'EST PAS UNE INFORMATION, c'est une fuite
 * de plomberie: « J'ai noté pour member:6ca16d63-… » est pire que rien. Sur une
 * lecture en panne on rend une carte VIDE, et l'accusé dit alors la ligne sans
 * prénom — dégradé, jamais faux.
 *
 * ⚠️ LA RPC, PAS UN `select` SUR `household_members`. L'état d'âge y est
 * DÉRIVÉ, et une lecture directe de la table a déjà coûté deux colonnes
 * inexistantes à ce dépôt.
 */
async function rosterNames(
  admin: SupabaseClient,
  userId: string,
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  try {
    const res = await admin.rpc("keel_household_roster_for", { p_user: userId });
    for (const row of (res?.data ?? []) as Record<string, unknown>[]) {
      const id = String(row.member_id ?? "").trim().toLowerCase();
      const name = String(row.first_name ?? "").trim();
      if (id && name) names.set(id, name);
    }
  } catch {
    // Silence: l'accusé sort sans prénom plutôt que de ne pas sortir.
  }
  return names;
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
    const weighInDay = parseWeighInToken(message.form_token);
    if (weighInDay) {
      return await writeWeighInReply(admin, {
        message,
        requestId: args.requestId,
        askedOn: weighInDay,
      });
    }

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

  // ── FF-062 R13/R14 · LE TAP EST-IL ENCORE D'ACTUALITÉ ? ───────────────────
  //
  // ⛔ AVANT LE PREMIER LECTEUR, ET C'EST TOUT L'INTÉRÊT. Six vocabulaires
  // passent par ici, chacun avec sa propre garde de péremption — mais AUCUNE ne
  // répond à « un message plus récent a-t-il remplacé celui-ci ». Poser la
  // question dans les six handlers ferait six règles, dont celle qu'on regarde
  // le moins finirait par diverger; et le pouls, lui, n'en a AUCUNE: taper le
  // bouton de mardi un jeudi y écrit le pouls DE JEUDI (`writePulseLevel`
  // upsert sur la date du tap). C'est le seul chemin où un tap périmé produit
  // une écriture FAUSSE plutôt qu'un accusé fantôme, et cette garde le ferme.
  //
  // ⚠️ APRÈS la garde `kind !== "button"`: un formulaire porte son propre jeton
  // de période, et son écriture est idempotente par semaine. Le désarmer
  // demanderait une seconde règle pour un cas que la première ne couvre pas.
  //
  // R14 — LE REFUS REND UNE PHRASE, JAMAIS UN SILENCE. On réutilise celle qui
  // existe (`keel_unusable_button_ack`): elle dit déjà exactement ce qu'il faut
  // dire, dans les deux langues, et deux formulations pour un même refus
  // finiraient par diverger.
  const freshness = await judgeTap(admin, {
    userId: message.user_id,
    replyTo: message.reply_to,
  });
  if (freshness.disarmed) {
    console.info(JSON.stringify({
      tag: "keel.deterministic_button.disarmed_tap",
      user_id: message.user_id,
      reply_to: message.reply_to,
      superseded_by: freshness.latestId,
      // Le préfixe, pas la charge: on veut savoir QUELLE famille se fait
      // périmer le plus souvent — c'est ce qui dirait qu'une fenêtre est trop
      // courte — sans journaliser un identifiant de ligne.
      family: DETERMINISTIC_BUTTON_PREFIXES.find((prefix) =>
        String(message.button_payload ?? "").startsWith(prefix)
      ) ?? "unknown",
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
    return handled("keel_disarmed_button_tap");
  }

  // ── FF-062 C1 · LE TAP DU REPAS D'UN CRÉNEAU DÉCLARÉ ──────────────────────
  //
  // Huitième vocabulaire, disjoint des sept autres (`KEEL_SLOTMEAL_`), et sa
  // charge est la plus contrainte de toutes: une action d'une liste fermée, une
  // date ISO ET un créneau du vocabulaire fermé. L'ordre reste sans
  // conséquence — chaque lecteur rend `null` sur ce qui ne le concerne pas —
  // et il est ici par spécificité décroissante.
  const slotMeal = parseSlotMealButton(message.button_payload);
  if (slotMeal) {
    const now = new Date(message.received_at);
    const voice = await studentVoiceContext(admin, message.user_id);
    let written = false;
    // ⛔ « PASSER » N'ÉCRIT RIEN, ET C'EST LE CIRCUIT DE LA FICHE. Seule
    // « Décrire » mène à `protocol_events`. « Photo » non plus: c'est le
    // chemin de la photo qui écrira le fait, avec son créneau forcé — écrire
    // ici en plus ferait DEUX lignes pour un seul repas, dont une sans image.
    if (slotMeal.action === "describe") {
      try {
        const res = await writeSlotMealFact(admin, {
          userId: message.user_id,
          localDate: slotMeal.localDate,
          slot: slotMeal.slot,
          contentLocale: voice.contentLocale,
          now,
        });
        written = res.outcome === "written" || res.outcome === "already";
      } catch (error) {
        console.warn(JSON.stringify({
          tag: "keel.slot_meal.tap_write_failed",
          user_id: message.user_id,
          slot: slotMeal.slot,
          error: error instanceof Error ? error.message : String(error),
          effect: "l'accuse invite sans pretendre qu'une ligne existe",
        }));
      }
    }
    await ack(admin, {
      userId: message.user_id,
      requestId: args.requestId,
      purpose: SLOT_MEAL_ACK_PURPOSE,
      body: renderSlotMealAck({
        locale: voice.contentLocale,
        action: slotMeal.action,
        written,
      }),
    });
    return handled(`keel_slot_meal_${slotMeal.action}`);
  }

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

  // ── FF-054 §3.2 · LE TAP DU RETOUR DE FIN DE PLAN ─────────────────────────
  //
  // Sixième vocabulaire, disjoint des cinq autres (`KEEL_FEEDBACK_`). L'ordre
  // reste sans conséquence, et il est ici parce que sa charge est la plus
  // contrainte après celle de la recommandation: elle exige un uuid de plan
  // PUIS un jeton du vocabulaire de questions.
  const feedback = readFeedbackReply(message.button_payload);
  if (feedback.kind !== "none") {
    const now = new Date(message.received_at);
    const localDate = localDateFor(
      now,
      await timezoneFor(admin, message.user_id),
    );
    const voice = await studentVoiceContext(admin, message.user_id);
    // FAIL-CLOSED, comme partout ailleurs sur ce plancher: une évaluation en
    // panne rend le plancher LEVÉ, donc la liste courte des questions. On perd
    // une question, jamais la garde.
    let restrictionFlag = true;
    try {
      const floor = await evaluateRestrictionForStudent(admin as never, {
        userId: message.user_id,
        asOfLocalDate: localDate,
      });
      restrictionFlag = floor.restriction_flag === true;
    } catch (error) {
      console.warn(JSON.stringify({
        tag: "keel.plan_feedback.restriction_floor_unreadable",
        user_id: message.user_id,
        error: error instanceof Error ? error.message : String(error),
        effect: "fail-closed: liste de questions reduite pour ce tap",
      }));
    }
    const outcome = await handlePlanFeedbackTap(admin, {
      userId: message.user_id,
      reply: feedback,
      localDate,
      nowIso: now.toISOString(),
      restrictionFlag,
      fallbackLanguage: isFrenchLocale(voice.contentLocale) ? "fr" : "en",
    });
    await ack(admin, {
      userId: message.user_id,
      requestId: args.requestId,
      purpose: "keel_plan_feedback_ack",
      body: outcome.body,
      buttons: outcome.buttons,
    });
    return handled(outcome.handledAs);
  }





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


  // ══════════════════════════════════════════════════════════════════════════
  // ── UNE CHARGE DÉTERMINISTE ILLISIBLE NE DESCEND PAS AU DISPATCHER ────────
  // ══════════════════════════════════════════════════════════════════════════
  //
  // MESURÉ le 2026-08-12 (revue adversariale FF-056, H3/H4). Une charge
  // `KEEL_WDIV_CAT|<uuid>|` tronquée, et une autre portant un jeton hors liste,
  // tombaient toutes deux ici en `PASS`. `parseInboundMessage` pose alors
  // `text = button_payload` (le libellé sert de trace lisible), et le dispatcher
  // analysait donc LA CHAÎNE DU BOUTON comme une phrase d'élève. Les deux
  // réponses obtenues en run réel:
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
  // ⚠️ ELLE EST TERMINALE, ET C'EST LA SEULE POSITION QUI MARCHE.
  //
  // Elle a vécu de sa pose jusqu'au 2026-09-07 IMBRIQUÉE dans le lecteur du pouls
  // (`if (pulse.kind === "none") { … }`), c'est-à-dire attachée par hasard à la
  // famille qui se lisait en dernier. Retirer ce lecteur — ce que le
  // désarmement fait — l'aurait emportée avec lui, en silence, et TOUTES les
  // charges désarmées seraient reparties en `PASS` vers le dispatcher: très
  // exactement le défaut que ces lignes existent pour fermer.
  //
  // Elle est donc désormais le dernier bloc de la fonction, après le dernier
  // lecteur — jamais avant. Une charge VALIDE n'atteint jamais ce point, et
  // c'est ce qui empêche cette garde de bloquer tout en ressemblant à une garde
  // qui marche. `disarmed_families_wiring_test.ts` tient les deux bouts.
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
  const unusableVoice = await studentVoiceContext(admin, message.user_id);
  await ack(admin, {
    userId: message.user_id,
    requestId: args.requestId,
    purpose: "keel_unusable_button_ack",
    body: isFrenchLocale(unusableVoice.contentLocale)
      ? "Celui-là n'est plus d'actualité — rien n'a été enregistré."
      : "That one's no longer open — nothing has been saved.",
  });
  return handled("keel_unusable_button_payload");
}
