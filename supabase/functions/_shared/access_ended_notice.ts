// LE MOT DE LA FIN D'ACCÈS — et le miroir exact du défaut de langue du dépôt.
//
// ── CE QUE CE MODULE AVAIT DE PARTICULIER ─────────────────────────────────
// Partout ailleurs le défaut est « anglais codé en dur ». Ici il était
// FRANÇAIS codé en dur: `greetingPrefix()` rendait « Coucou {prenom}, » et les
// trois messages étaient français, sans jumelle. Un élève anglophone dont
// l'essai se terminait recevait donc « ton essai s'est termine 🥲 ».
//
// ── LES DEUX MOITIÉS NE SE RÉPARENT PAS DE LA MÊME FAÇON ──────────────────
// C'est tout le sujet de ce fichier, et la raison pour laquelle il porte ce
// pavé:
//
//   · les MESSAGES sont de l'AFFICHAGE. Ils se choisissent par locale, deux
//     packs entiers, `locale` REQUIS — le motif de `welcome_email.ts`.
//
//   · `classifyAccessEndedIntent` est une GARDE SUR ENTRÉE UTILISATEUR. Elle
//     ne prend PAS de locale, et ne doit jamais en prendre. Le même
//     raisonnement que `nutrition_lexicon.ts`: paramétrer un lecteur d'entrée
//     par la langue qu'on CROIT que l'utilisateur parle, c'est cesser de
//     comprendre celui qui répond « no » dans un fil français, ou « plus
//     tard » dans un fil anglais. Les gens changent de langue en une phrase;
//     l'union EN+FR est la seule forme correcte.
//
// Le défaut mesuré, avant: le lexique de décision était FRANÇAIS avec un seul
// jeton anglais (`yes`). `no`, `not now`, `later`, `no thanks` tombaient donc
// tous en `unknown` — c'est-à-dire que l'anglophone qui refusait n'était pas
// entendu, et que rien ne se fermait.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { isFrenchLocale } from "./keel/locale.ts";

export const ACCESS_ENDED_NOTIFICATION_KIND = "access_ended_notification";
export const ACCESS_REACTIVATION_OFFER_KIND = "access_reactivation_offer";

export type AccessEndedReason = "trial_ended" | "subscription_ended";

function normalizeSpace(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeAccessEndedReason(value: unknown): AccessEndedReason | null {
  const reason = normalizeSpace(value).toLowerCase();
  if (reason === "trial_ended" || reason === "subscription_ended") return reason;
  return null;
}

export function accessEndedPurpose(reason: AccessEndedReason): string {
  return reason === "trial_ended" ? "end_trial" : "end_subscription";
}

// ---------------------------------------------------------------------------
// LES MESSAGES — deux packs entiers, `locale` REQUIS
// ---------------------------------------------------------------------------

function firstNameOf(firstNameRaw: string | null | undefined): string {
  return normalizeSpace(firstNameRaw).split(/\s+/)[0] ?? "";
}

/**
 * Le pack FRANÇAIS est GELÉ, mot pour mot, tel qu'il était en dur — accents
 * manquants compris. Il a été écrit pour être lu par un humain, il est parti à
 * de vrais comptes, et le réécrire « au passage » remplacerait une voix
 * éprouvée par une paraphrase. Le seul changement autorisé ici était de lui
 * donner une jumelle.
 */
const NOTICE_PACKS = {
  fr: {
    greeting: (firstName: string) =>
      firstName ? `Coucou ${firstName},` : "Coucou,",
    initial: (hello: string, reason: AccessEndedReason) =>
      reason === "trial_ended"
        ? `${hello} ton essai s'est termine. 🥲\nSi tu as trouve l'aide que tu cherchais, je peux t'envoyer le lien pour continuer ensemble. Tu veux ? ☺️`
        : `${hello} ton abonnement Sophia s'est termine. 🥲\nSi tu veux, je peux t'envoyer le lien pour reactiver ton acces et continuer ensemble. Tu veux ? ☺️`,
    positive: (reason: AccessEndedReason, upgradeUrl: string) =>
      reason === "trial_ended"
        ? `Avec plaisir ☺️ Voici le lien pour continuer ensemble : ${upgradeUrl}\n\nJe serai ravie de te retrouver ici quand tu veux.`
        : `Avec plaisir ☺️ Voici le lien pour reactiver ton acces : ${upgradeUrl}\n\nJe serai ravie de te retrouver ici quand tu veux.`,
    negative:
      "Pas de souci 🙂 La porte reste grande ouverte. Si tu sens que le moment est revenu, je serai la pour reprendre avec toi.",
  },
  /**
   * Le pack ANGLAIS — celui qui manquait, et qui manquait dans le sens le plus
   * absurde: le produit s'est vendu en anglais pendant tout le pilote.
   *
   * Redérivé du français plutôt que traduit mot à mot: « Coucou » n'a pas
   * d'équivalent anglais qui ne sonne pas faux, et « Je serai ravie de te
   * retrouver » rendu littéralement donnerait une phrase que personne n'écrit.
   */
  en: {
    greeting: (firstName: string) => (firstName ? `Hi ${firstName},` : "Hi,"),
    initial: (hello: string, reason: AccessEndedReason) =>
      reason === "trial_ended"
        ? `${hello} your trial has ended. 🥲\nIf you found what you were looking for, I can send you the link to keep going together. Want it? ☺️`
        : `${hello} your Sophia subscription has ended. 🥲\nIf you'd like, I can send you the link to reactivate your access and keep going together. Want it? ☺️`,
    positive: (reason: AccessEndedReason, upgradeUrl: string) =>
      reason === "trial_ended"
        ? `With pleasure ☺️ Here is the link to keep going together: ${upgradeUrl}\n\nI'll be glad to see you back here whenever you want.`
        : `With pleasure ☺️ Here is the link to reactivate your access: ${upgradeUrl}\n\nI'll be glad to see you back here whenever you want.`,
    negative:
      "No worries 🙂 The door stays wide open. If it ever feels like the right moment again, I'll be here to pick things up with you.",
  },
} as const;

/**
 * `isFrenchLocale` est LE prédicat unique du gel (`keel/locale.ts`). Une langue
 * non livrée est déjà ramenée à l'anglais par `clampToDeliveredLocale` en amont
 * de la chaîne, donc « pas français » veut bien dire « anglais » ici.
 */
function noticePackFor(locale: string) {
  return isFrenchLocale(locale) ? NOTICE_PACKS.fr : NOTICE_PACKS.en;
}

/**
 * `locale` est REQUIS, jamais optionnel. Optionnel, il aurait un défaut — et un
 * défaut de langue est exactement l'épingle que ce chantier retire partout.
 * Le compilateur devient le relecteur: chaque appelant doit DIRE d'où vient la
 * langue de ce message.
 */
export function buildAccessEndedInitialMessage(params: {
  reason: AccessEndedReason;
  firstName?: string | null;
  locale: string;
}): string {
  const pack = noticePackFor(params.locale);
  return pack.initial(pack.greeting(firstNameOf(params.firstName)), params.reason);
}

export function buildAccessEndedPositiveReply(params: {
  reason: AccessEndedReason;
  upgradeUrl: string;
  locale: string;
}): string {
  return noticePackFor(params.locale).positive(
    params.reason,
    normalizeSpace(params.upgradeUrl),
  );
}

export function buildAccessEndedNegativeReply(locale: string): string {
  return noticePackFor(locale).negative;
}

// ---------------------------------------------------------------------------
// LA GARDE — union EN+FR, et AUCUNE locale (c'est le point)
// ---------------------------------------------------------------------------

/**
 * Casse et accents retirés pour la seule comparaison.
 *
 * Sans ce pliage, « Non merci » et « non merci » se comportent pareil mais
 * « Plus tard » et « plus tard » aussi — et « déjà »/« deja » non. Le lexique
 * est écrit SANS accent, une fois, et l'entrée est pliée pour le rencontrer:
 * l'alternative est d'écrire chaque terme deux fois et d'en oublier un.
 */
function foldForMatching(text: unknown): string {
  return normalizeSpace(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036F]/g, "")
    // Les deux apostrophes, réduites à une seule forme: un utilisateur qui tape
    // « c'est parti » sur un clavier iOS envoie U+2019, pas U+0027.
    .replace(/[\u2018\u2019\u02BC]/g, "'");
}

/**
 * Les formes COURTES et AMBIGUËS ne comptent qu'en TÊTE de message.
 *
 * « ok » au milieu d'une phrase ne veut rien dire de décidable (« ok donc en
 * fait je passe »), alors qu'en tête c'est une réponse. Le lexique français
 * d'origine avait déjà cette distinction; elle est conservée et étendue à
 * l'anglais plutôt que réinventée.
 */
const ACCEPT_ANCHORED =
  /^(oui|ouais|ouep|si|d'accord|daccord|ok|okay|yes|yeah|yep|yup|sure|go)\b/;

const ACCEPT_PHRASES =
  /\b(c'est parti|vas[- ]?y|allons[- ]?y|avec plaisir|je veux bien|volontiers|je suis partant|envoie(?:[- ]moi)? le lien|let'?s go|i'?m in|i am in|sounds good|go ahead|send (?:it|me|the link)|yes please|please do)\b/;

const DECLINE_ANCHORED = /^(non|nope|nah|no)\b/;

const DECLINE_PHRASES =
  /\b(pas pour le moment|pas maintenant|pas tout de suite|pas pour l'instant|plus tard|une autre fois|non merci|sans facon|ca ira|not now|not right now|not yet|not today|maybe later|later|another time|some other time|no thanks|no thank you|not interested|not for me|i'?ll pass|i will pass)\b/;

/**
 * Accepter, refuser, ou ne pas trancher. UNION EN+FR, sans locale.
 *
 * ── L'ARBITRAGE QUI N'EXISTAIT PAS: LES DEUX LEXIQUES SE MESURENT ─────────
 * L'ancienne version testait « accepte » d'abord et rendait tout de suite. « ok
 * mais plus tard » y matchait `^ok\b` et repartait en `accept` — c'est-à-dire
 * qu'on envoyait un lien de paiement à quelqu'un qui venait de refuser.
 *
 * Ici les deux lexiques sont évalués, et une phrase qui déclenche LES DEUX est
 * `unknown`. Ce n'est pas de la prudence décorative: sur cette surface les deux
 * erreurs ne coûtent pas la même chose. `unknown` ne fait rien; un faux
 * `accept` facture l'intention de quelqu'un.
 *
 * ⚠️ NE JAMAIS AJOUTER DE PARAMÈTRE `locale` ICI. Un utilisateur répond dans la
 * langue qu'il veut, y compris une autre que celle de son profil, et « no »
 * dans un fil français est un refus parfaitement clair. Une garde paramétrée
 * par la langue supposée est une garde qui cesse d'entendre.
 */
export function classifyAccessEndedIntent(
  text: unknown,
): "accept" | "decline" | "unknown" {
  const t = foldForMatching(text);
  if (!t) return "unknown";

  const accepts = ACCEPT_ANCHORED.test(t) || ACCEPT_PHRASES.test(t);
  const declines = DECLINE_ANCHORED.test(t) || DECLINE_PHRASES.test(t);

  if (accepts && declines) return "unknown";
  if (accepts) return "accept";
  if (declines) return "decline";
  return "unknown";
}
